/**
 * Cross-platform network / firewall setup for LAN session sharing.
 *
 * Supported platforms:
 *   - Windows  → netsh advfirewall (direct or via UAC-elevated PowerShell)
 *   - Linux    → ufw (if installed) or iptables fallback
 *   - macOS    → pfctl (informational; macOS prompts on first listen)
 *
 * First-run state is stored in ~/.ollama-code/network.json so the setup
 * only runs once per port (unless the user explicitly resets it).
 */

import { execSync, spawnSync } from 'child_process';
import { platform, homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const GLOBAL_CONFIG_DIR = join(homedir(), '.ollama-code');
const NETWORK_STATE_FILE = join(GLOBAL_CONFIG_DIR, 'network.json');

// ANSI helpers (no external dep)
const y = '\x1b[33m';   // yellow
const g = '\x1b[32m';   // green
const r = '\x1b[31m';   // red
const d = '\x1b[90m';   // dim
const b = '\x1b[1m';    // bold
const R = '\x1b[0m';    // reset

// ── State helpers ─────────────────────────────────────────────────────────────

function loadNetworkState() {
  try {
    if (existsSync(NETWORK_STATE_FILE)) {
      return JSON.parse(readFileSync(NETWORK_STATE_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveNetworkState(state) {
  try {
    if (!existsSync(GLOBAL_CONFIG_DIR)) mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    writeFileSync(NETWORK_STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch { /* ignore */ }
}

function isPortConfigured(port) {
  const state = loadNetworkState();
  return state[`port_${port}`]?.configured === true;
}

function markPortConfigured(port, method) {
  const state = loadNetworkState();
  state[`port_${port}`] = { configured: true, method, configuredAt: new Date().toISOString() };
  saveNetworkState(state);
}

// ── Platform detection ────────────────────────────────────────────────────────

function getOS() {
  const p = platform();
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux'; // linux, freebsd, etc.
}

// ── Windows setup ─────────────────────────────────────────────────────────────

function windowsSetupPort(port) {
  const ruleName = `OllamaCode-Port-${port}`;
  const addCmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`;

  // Check if rule already exists
  try {
    execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, { stdio: 'ignore' });
    return { ok: true, method: 'windows-existing' }; // already exists
  } catch { /* not found, continue */ }

  // Try direct add (works when already running as admin)
  try {
    execSync(addCmd, { stdio: 'ignore' });
    return { ok: true, method: 'windows-direct' };
  } catch { /* not admin */ }

  // Try via elevated PowerShell (shows UAC prompt to user)
  try {
    const posh = `Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=\\"${ruleName}\\" dir=in action=allow protocol=TCP localport=${port}' -Verb RunAs -Wait`;
    const result = spawnSync('powershell', ['-Command', posh], { timeout: 20000 });
    if (result.status === 0) {
      // Verify it was actually added
      try {
        execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, { stdio: 'ignore' });
        return { ok: true, method: 'windows-uac' };
      } catch { /* UAC accepted but rule still not added */ }
    }
  } catch { /* timeout or powershell not available */ }

  // Failed — print helpful manual instruction
  console.warn(
    `\n  ${y}${b}⚠  Windows Firewall setup required${R}\n` +
    `  ${d}Port ${port} is not yet allowed for inbound connections from your LAN.${R}\n` +
    `  Run this command ${b}once${R} in an ${b}Admin PowerShell${R} to fix it:\n\n` +
    `  ${d}${addCmd}${R}\n` +
    `  ${d}Or: open Windows Defender Firewall → Inbound Rules → New Rule → Port → TCP ${port}${R}\n`
  );
  return { ok: false, method: 'windows-failed' };
}

// ── Linux setup ───────────────────────────────────────────────────────────────

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function linuxSetupPort(port) {
  // Try ufw (Ubuntu/Debian default)
  if (commandExists('ufw')) {
    // Check if ufw is even active
    try {
      const status = execSync('ufw status', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      if (status.includes('inactive')) {
        // ufw is disabled — no action needed, iptables will allow by default
        return { ok: true, method: 'linux-ufw-inactive' };
      }
      // Check if rule already exists
      if (status.includes(String(port))) {
        return { ok: true, method: 'linux-ufw-existing' };
      }
    } catch { /* ufw not usable */ }

    // Try to add ufw rule (requires sudo)
    const ufwResult = spawnSync('sudo', ['-n', 'ufw', 'allow', `${port}/tcp`], {
      stdio: 'ignore',
      timeout: 5000,
    });
    if (ufwResult.status === 0) {
      return { ok: true, method: 'linux-ufw' };
    }

    // sudo -n failed (requires password), print instructions
    console.warn(
      `\n  ${y}${b}⚠  Linux Firewall (ufw) setup required${R}\n` +
      `  ${d}Port ${port} may be blocked. Run once to allow it:${R}\n\n` +
      `  ${d}sudo ufw allow ${port}/tcp${R}\n`
    );
    return { ok: false, method: 'linux-ufw-failed' };
  }

  // Try iptables fallback
  if (commandExists('iptables')) {
    // Check if rule exists
    try {
      const check = execSync(`iptables -C INPUT -p tcp --dport ${port} -j ACCEPT 2>/dev/null`, { stdio: 'ignore' });
      return { ok: true, method: 'linux-iptables-existing' };
    } catch { /* rule not found */ }

    const ipResult = spawnSync('sudo', ['-n', 'iptables', '-I', 'INPUT', '-p', 'tcp', '--dport', String(port), '-j', 'ACCEPT'], {
      stdio: 'ignore',
      timeout: 5000,
    });
    if (ipResult.status === 0) {
      return { ok: true, method: 'linux-iptables' };
    }

    console.warn(
      `\n  ${y}${b}⚠  Linux Firewall (iptables) rule may be needed${R}\n` +
      `  ${d}Run once to allow port ${port}:${R}\n\n` +
      `  ${d}sudo iptables -I INPUT -p tcp --dport ${port} -j ACCEPT${R}\n`
    );
    return { ok: false, method: 'linux-iptables-failed' };
  }

  // No firewall tool found — likely fine (most Linux boxes are open by default)
  return { ok: true, method: 'linux-no-firewall' };
}

// ── macOS setup ───────────────────────────────────────────────────────────────

function macosSetupPort(port) {
  // macOS Application Firewall prompts the user on first listen — no manual action usually needed.
  // If the user has enabled the third-party firewall block, we just advise.
  try {
    const status = execSync('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    });
    if (status.includes('disabled')) {
      return { ok: true, method: 'macos-fw-off' };
    }
  } catch { /* socketfilterfw not available */ }

  // macOS will auto-prompt user — just make sure we notice if pfctl is blocking
  return { ok: true, method: 'macos-auto' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ensure the given port is allowed through the system firewall.
 * Runs once per port (state stored in ~/.ollama-code/network.json).
 * Safe to call every startup — skips quickly if already configured.
 *
 * @param {number} port
 * @returns {{ ok: boolean, method: string, skipped?: boolean }}
 */
export function ensurePortOpen(port) {
  if (isPortConfigured(port)) {
    return { ok: true, method: 'cached', skipped: true };
  }

  const os = getOS();
  let result;

  if (os === 'windows') {
    result = windowsSetupPort(port);
  } else if (os === 'linux') {
    result = linuxSetupPort(port);
  } else if (os === 'macos') {
    result = macosSetupPort(port);
  } else {
    result = { ok: true, method: 'unknown-os' };
  }

  // Only persist as "configured" if it actually worked (or is not needed)
  if (result.ok) {
    markPortConfigured(port, result.method);
  }
  // If it failed, we'll try again next startup

  return result;
}

/**
 * Print a human-readable OS + network setup summary at startup.
 * Call once after ensurePortOpen().
 */
export function printNetworkInfo({ port, lanIp, token }) {
  const os = getOS();
  const osLabel = { windows: 'Windows', linux: 'Linux', macos: 'macOS' }[os] || os;
  const tokenParam = token ? `?token=${token}` : '';
  const lanUrl = `http://${lanIp}:${port}${tokenParam}`;

  console.log(`  ${d}OS: ${osLabel} · LAN: ${lanIp}:${port} · Session sharing ready${R}`);
  return lanUrl;
}

/**
 * Reset first-run state for a port (forces firewall setup to re-run next start).
 */
export function resetNetworkSetup(port) {
  const state = loadNetworkState();
  delete state[`port_${port}`];
  saveNetworkState(state);
}
