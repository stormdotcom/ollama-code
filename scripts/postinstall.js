#!/usr/bin/env node
/**
 * postinstall.js — runs automatically after `npm install` / `npm i -g`
 * Shows an animated setup sequence:
 *   • Node & npm version check
 *   • OS detection
 *   • One-time firewall/port setup (Windows/Linux/macOS)
 *   • Prints quick-start instructions
 */

import { execSync, spawnSync } from 'child_process';
import { platform, release, homedir, networkInterfaces } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── ANSI helpers ────────────────────────────────────────────────────────────
const R  = '\x1b[0m';
const B  = '\x1b[1m';
const D  = '\x1b[2m';
const G  = '\x1b[32m';
const Y  = '\x1b[33m';
const C  = '\x1b[36m';
const M  = '\x1b[35m';
const bC = '\x1b[96m';
const bM = '\x1b[95m';
const bW = '\x1b[97m';
const gr = '\x1b[90m';
const re = '\x1b[31m';
const W  = 52;

const bar  = M + '━'.repeat(W) + R;
const thin = gr + '─'.repeat(W) + R;
const ok   = `${G}✓${R}`;
const warn = `${Y}⚠${R}`;
const fail = `${re}✗${R}`;

// ── Spinner (no deps) ───────────────────────────────────────────────────────
const FRAMES  = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let _spinTimer = null;
let _spinFrame = 0;

function spinStart(label) {
  _spinFrame = 0;
  process.stdout.write(`  ${C}${FRAMES[0]}${R}  ${label} `);
  _spinTimer = setInterval(() => {
    _spinFrame = (_spinFrame + 1) % FRAMES.length;
    process.stdout.write(`\r  ${C}${FRAMES[_spinFrame]}${R}  ${label} `);
  }, 80);
}

function spinStop(icon, label) {
  if (_spinTimer) { clearInterval(_spinTimer); _spinTimer = null; }
  process.stdout.write(`\r  ${icon}  ${label}\n`);
}

// ── Version helpers ─────────────────────────────────────────────────────────
function getVersion(cmd, args) {
  // On Windows, npm is installed as npm.cmd — try both
  const candidates = (platform() === 'win32' && cmd === 'npm')
    ? ['npm.cmd', 'npm']
    : [cmd];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, args, { encoding: 'utf8', timeout: 4000, shell: false });
      const v = (r.stdout || '').trim().replace(/^v/, '');
      if (v) return v;
    } catch { /* try next */ }
  }
  return null;
}

function parseVersion(v) {
  const parts = (v || '0.0.0').split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function colorVersion(v, minMajor) {
  const { major } = parseVersion(v);
  return major >= minMajor ? `${G}${v}${R}` : `${Y}${v}${R}`;
}

function getPkgVersion() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '?';
  } catch { return '?'; }
}

// ── OS detection ────────────────────────────────────────────────────────────
function getOsLabel() {
  const p = platform();
  if (p === 'win32')  return `Windows ${release()}`;
  if (p === 'darwin') return `macOS ${release()}`;
  try {
    const r = execSync('lsb_release -ds 2>/dev/null || cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2', { encoding: 'utf8' });
    return r.trim().replace(/"/g, '') || `Linux ${release()}`;
  } catch { return `Linux ${release()}`; }
}

function getPlatform() {
  const p = platform();
  if (p === 'win32')  return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux';
}

// ── LAN IP ──────────────────────────────────────────────────────────────────
function getBestLanIp() {
  const SKIP = /vethernet|docker|vmnet|vmware|virtualbox|utun|tun|tap|vpn|wsl|loopback|pseudo|teredo/i;
  try {
    const nets = networkInterfaces();
    for (const [name, addrs] of Object.entries(nets)) {
      if (SKIP.test(name)) continue;
      for (const net of addrs || []) {
        if (net.family !== 'IPv4' || net.internal) continue;
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) return net.address;
      }
    }
    for (const addrs of Object.values(nets)) {
      for (const net of addrs || []) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch { /* ignore */ }
  return '127.0.0.1';
}

// ── Firewall setup ──────────────────────────────────────────────────────────
const GLOBAL_DIR   = join(homedir(), '.ollama-code');
const STATE_FILE   = join(GLOBAL_DIR, 'network.json');
const PORT         = parseInt(process.env.OLLAMA_CODE_SERVE_PORT || '3141', 10);

function loadState() {
  try { return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}; }
  catch { return {}; }
}
function saveState(s) {
  try {
    if (!existsSync(GLOBAL_DIR)) mkdirSync(GLOBAL_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n', 'utf8');
  } catch { /* ignore */ }
}

function setupWindowsPort(port) {
  const rule = `OllamaCode-Port-${port}`;
  const add  = `netsh advfirewall firewall add rule name="${rule}" dir=in action=allow protocol=TCP localport=${port}`;
  try { execSync(`netsh advfirewall firewall show rule name="${rule}"`, { stdio: 'ignore' }); return 'existing'; }
  catch { /* not found */ }
  try { execSync(add, { stdio: 'ignore' }); return 'direct'; }
  catch { /* not admin */ }
  try {
    const posh = `Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=\\"${rule}\\" dir=in action=allow protocol=TCP localport=${port}' -Verb RunAs -Wait`;
    const r = spawnSync('powershell', ['-Command', posh], { timeout: 20000 });
    if (r.status === 0) return 'uac';
  } catch { /* timeout */ }
  return null; // failed
}

function setupLinuxPort(port) {
  if (spawnSync('which', ['ufw'], { stdio: 'ignore' }).status === 0) {
    try {
      const s = execSync('ufw status 2>/dev/null', { encoding: 'utf8' });
      if (s.includes('inactive')) return 'ufw-inactive';
      if (s.includes(String(port))) return 'ufw-existing';
    } catch { /* ignore */ }
    const r = spawnSync('sudo', ['-n', 'ufw', 'allow', `${port}/tcp`], { stdio: 'ignore', timeout: 5000 });
    if (r.status === 0) return 'ufw';
    return null;
  }
  if (spawnSync('which', ['iptables'], { stdio: 'ignore' }).status === 0) {
    const r = spawnSync('sudo', ['-n', 'iptables', '-I', 'INPUT', '-p', 'tcp', '--dport', String(port), '-j', 'ACCEPT'], { stdio: 'ignore', timeout: 5000 });
    if (r.status === 0) return 'iptables';
    return null;
  }
  return 'no-firewall'; // likely open
}

function setupPort(port, os) {
  const state = loadState();
  const key   = `port_${port}`;
  if (state[key]?.configured) return { cached: true, method: state[key].method };

  let method = null;
  if (os === 'windows') method = setupWindowsPort(port);
  else if (os === 'linux') method = setupLinuxPort(port);
  else method = 'macos-auto'; // macOS handles it automatically

  if (method) {
    state[key] = { configured: true, method, configuredAt: new Date().toISOString() };
    saveState(state);
  }
  return { cached: false, method };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Skip on CI / quiet installs
  if (process.env.CI || process.env.npm_config_loglevel === 'silent') return;

  const os = getPlatform();
  const pkgVer = getPkgVersion();

  console.log('');
  console.log(bar);
  console.log(bW + B + `
   ██████╗ ██╗     ██╗      █████╗ ███╗   ███╗ █████╗
  ██╔═══██╗██║     ██║     ██╔══██╗████╗ ████║██╔══██╗
  ██║   ██║██║     ██║     ███████║██╔████╔██║███████║
  ██║   ██║██║     ██║     ██╔══██║██║╚██╔╝██║██╔══██║
  ╚██████╔╝███████╗███████╗██║  ██║██║ ╚═╝ ██║██║  ██║
   ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
` + R);
  console.log(M + B + '          C O D E   C L I' + R + `  ${bC}${B}v${pkgVer}${R}`);
  console.log(gr + '     Local-First Agentic Coding with Ollama' + R);
  console.log(bar);
  console.log('');

  // ── Step 1: Node version ─────────────────────────────────────────────────
  spinStart('Checking Node.js version...');
  await sleep(300);
  const nodeVer  = process.version.replace(/^v/, '');
  const nodeMaj  = parseInt(nodeVer.split('.')[0], 10);
  const nodeOk   = nodeMaj >= 18;
  spinStop(nodeOk ? ok : warn,
    `Node.js  ${colorVersion(nodeVer, 18)}${nodeOk ? '' : `  ${Y}(requires ≥ 18)${R}`}`);

  // ── Step 2: npm version ──────────────────────────────────────────────────
  spinStart('Checking npm version...');
  await sleep(250);
  const npmVer = getVersion('npm', ['--version']);
  const npmMaj = parseInt((npmVer || '0').split('.')[0], 10);
  const npmOk  = npmMaj >= 7;
  spinStop(npmOk ? ok : warn,
    `npm      ${npmVer ? colorVersion(npmVer, 7) : `${Y}not found${R}`}${npmOk ? '' : `  ${Y}(requires ≥ 7)${R}`}`);

  // ── Step 3: OS detection ────────────────────────────────────────────────
  spinStart('Detecting operating system...');
  await sleep(300);
  const osLabel = getOsLabel();
  const osIcon  = os === 'windows' ? '🪟' : os === 'macos' ? '🍎' : '🐧';
  spinStop(ok, `OS       ${C}${osLabel}${R}  ${gr}${osIcon}${R}`);

  // ── Step 4: LAN IP ──────────────────────────────────────────────────────
  spinStart('Detecting LAN IP address...');
  await sleep(200);
  const lanIp = getBestLanIp();
  spinStop(ok, `LAN IP   ${C}${lanIp}${R}`);

  // ── Step 5: Port / firewall setup ───────────────────────────────────────
  spinStart(`Setting up port ${PORT} for LAN access...`);
  await sleep(500);

  const { cached, method } = setupPort(PORT, os);

  if (cached) {
    spinStop(ok, `Port     ${PORT}  ${G}already configured${R}  ${gr}(${method})${R}`);
  } else if (method) {
    spinStop(ok, `Port     ${PORT}  ${G}opened${R}  ${gr}(${method})${R}`);
  } else {
    spinStop(warn, `Port     ${PORT}  ${Y}manual setup needed${R}`);
    const manualCmd = os === 'windows'
      ? `netsh advfirewall firewall add rule name="OllamaCode-Port-${PORT}" dir=in action=allow protocol=TCP localport=${PORT}`
      : os === 'linux' ? `sudo ufw allow ${PORT}/tcp`
      : '(macOS handles this automatically)';
    console.log('');
    console.log(`  ${Y}${B}Run once in an admin/root terminal:${R}`);
    console.log(`  ${gr}${manualCmd}${R}`);
    console.log('');
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log(thin);
  console.log('');
  console.log(`  ${G}${B}Installation complete!${R}  ${gr}v${pkgVer}${R}`);
  console.log('');
  console.log(`  ${C}Quick start:${R}`);
  console.log(`    ${Y}ollama-code${R}              ${gr}# start in current directory${R}`);
  console.log(`    ${Y}ollama-code --model${R} ${D}name${R}  ${gr}# use a specific Ollama model${R}`);
  console.log(`    ${Y}ollama-code --serve${R}      ${gr}# web UI only (no CLI)${R}`);
  console.log('');
  console.log(`  ${C}Session sharing (same WiFi):${R}`);
  console.log(`    ${gr}Scan QR code in terminal or open:${R}`);
  console.log(`    ${bC}http://${lanIp}:${PORT}?token=<shown-at-startup>${R}`);
  console.log('');
  console.log(`  ${C}Docs:${R} ${gr}ollama-code --help   /help   /shortcuts${R}`);
  console.log('');
  console.log(bar);
  console.log('');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(() => {/* silent — never block install */});
