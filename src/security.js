import { c } from './splash.js';
import { createInterface } from 'readline';

/**
 * Commands that are always blocked — no confirmation prompt, just denied.
 * Covers destructive host-level actions that uncensored models might attempt.
 */
const BLOCKED_PATTERNS = [
  // Destructive filesystem
  /\brm\s+(-\w+\s+)*\//i,              // rm -rf /
  /\bformat\s+[a-z]:/i,                // format C:
  /\bdel\s+\/s\s+\/q/i,                // del /s /q
  /\brmdir\s+\/s\s+\/q/i,             // rmdir /s /q
  /\bmkfs\b/i,                          // mkfs
  /\bdd\s+if=/i,                        // dd if=
  // Registry / system config
  /\breg\s+(delete|add)\s+hk/i,        // reg delete HKLM
  /\bschtasks\s+\/create/i,            // schtasks
  // Privilege escalation
  /\bnet\s+user\s+\w+\s+\/add/i,       // net user add
  /\buseradd\b/i,
  /\bpasswd\b/i,
  // Network exfil
  /\bcurl\b.*\|\s*(ba)?sh/i,           // curl | sh
  /\bwget\b.*\|\s*(ba)?sh/i,           // wget | sh
  /\bnc\s+-\w*l/i,                      // nc -l (netcat listen)
  /\bpowershell\b.*-enc/i,             // powershell encoded command
  /\bInvoke-WebRequest\b/i,            // download from internet
  /\bInvoke-Expression\b/i,            // iex
  /\bIEX\b/i,
  /\bStart-BitsTransfer\b/i,
  // Shutdown / reboot
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bStop-Computer\b/i,
  /\bRestart-Computer\b/i,
  // Crypto / ransom
  /\bcipher\s+\/e/i,
  // Windows service manipulation
  /\bsc\s+(create|delete|config)/i,
  /\bNew-Service\b/i,
  // env / credential theft
  /\b\$env:.*api.?key/i,
  /\bprintenv\b/i,
  /\bcmdkey\b/i,
  /\bmimikatz\b/i,
];

/**
 * Paths the model must never write outside of (relative to cwd).
 * Any absolute path or path with .. that escapes cwd is blocked.
 */
export function isPathSafe(filePath, cwd) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('..')) return false;
  // Absolute paths outside cwd
  if (/^[a-zA-Z]:[/\\]/.test(filePath) || filePath.startsWith('/')) {
    const normalizedCwd = cwd.replace(/\\/g, '/').toLowerCase();
    return normalized.toLowerCase().startsWith(normalizedCwd.toLowerCase());
  }
  return true;
}

/**
 * Check if a command is blocked outright. Returns the matched pattern or null.
 */
export function isCommandBlocked(command) {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(command)) return pat.toString();
  }
  return null;
}

/**
 * Prompt the user to approve a command before execution. Returns true if approved.
 */
export async function confirmCommand(command) {
  console.log('');
  console.log(`${c.yellow}${c.bold}  ⚠  Command approval required${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);
  console.log(`  ${c.white}${command}${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`  ${c.yellow}Allow? ${c.green}[y]es${c.reset} / ${c.red}[n]o${c.reset} / ${c.cyan}[a]lways${c.reset}: `, resolve)
  );
  rl.close();
  const trimmed = (answer || '').trim().toLowerCase();
  return { approved: trimmed === 'y' || trimmed === 'yes' || trimmed === 'a' || trimmed === 'always', always: trimmed === 'a' || trimmed === 'always' };
}

// ── Secret scanner ──────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  { name: 'AWS Access Key',       re: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Key',       re: /(?:aws_secret_access_key|secret_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi },
  { name: 'GitHub Token',         re: /gh[ps]_[A-Za-z0-9_]{36,}/g },
  { name: 'GitHub PAT (classic)', re: /github_pat_[A-Za-z0-9_]{22,}/g },
  { name: 'Generic API Key',      re: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']/gi },
  { name: 'Generic Secret',       re: /(?:secret|password|passwd|token)\s*[:=]\s*["']([^"']{8,})["']/gi },
  { name: 'Private Key Block',    re: /-----BEGIN\s+(RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Bearer Token',         re: /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g },
  { name: 'Connection String',    re: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s"']+/gi },
  { name: 'Slack Token',          re: /xox[bpras]-[A-Za-z0-9-]{10,}/g },
  { name: 'OpenAI Key',           re: /sk-[A-Za-z0-9]{32,}/g },
  { name: 'Anthropic Key',        re: /sk-ant-[A-Za-z0-9_\-]{32,}/g },
  { name: 'Stripe Key',           re: /(?:sk|pk)_(?:test|live)_[A-Za-z0-9]{20,}/g },
  { name: 'Hex-encoded Secret',   re: /(?:secret|key|token)\s*[:=]\s*["']?[0-9a-f]{32,}["']?/gi },
];

/**
 * Scan a string (file content) for hardcoded secrets.
 * @param {string} content
 * @param {string} filePath
 * @returns {{ pattern: string, match: string, line: number }[]}
 */
export function scanForSecrets(content, filePath) {
  const findings = [];
  const lines = content.split('\n');
  for (const { name, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const before = content.slice(0, m.index);
      const lineNum = before.split('\n').length;
      const matched = m[0].length > 60 ? m[0].slice(0, 60) + '...' : m[0];
      findings.push({ pattern: name, match: matched, line: lineNum });
    }
  }
  return findings;
}

/**
 * Print scan results in a pretty format.
 */
export function printScanResults(filePath, findings) {
  if (findings.length === 0) {
    console.log(`  ${c.green}✓${c.reset} ${filePath}: ${c.green}no secrets found${c.reset}`);
    return;
  }
  console.log(`  ${c.red}✗${c.reset} ${filePath}: ${c.red}${findings.length} potential secret(s)${c.reset}`);
  for (const f of findings) {
    console.log(`    ${c.yellow}Line ${f.line}${c.reset} ${c.cyan}[${f.pattern}]${c.reset} ${c.gray}${f.match}${c.reset}`);
  }
}
