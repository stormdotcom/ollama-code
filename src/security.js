import { c } from './splash.js';
import { createInterface } from 'readline';
import { resolve } from 'path';

// ── Permission levels ───────────────────────────────────────────────────────
// READ inside cwd   = auto-allowed
// READ outside cwd  = prompt user
// WRITE inside cwd  = auto-allowed
// WRITE outside cwd = prompt user
// EXECUTE           = prompt user (or auto if user chose "always")
// SEARCH            = auto-allowed (inside cwd)

const approvedPaths = new Set();
let autoApproveCommands = false;

/**
 * Check file access. Returns { allowed: true } or { allowed: false, reason }.
 * For paths outside cwd, prompts the user.
 * @param {'read'|'write'} action
 */
export async function checkFilePermission(filePath, cwd, action = 'read') {
  const normalizedPath = resolve(filePath.replace(/\\/g, '/'));
  const normalizedCwd = resolve(cwd.replace(/\\/g, '/'));

  // Inside workspace = auto-allowed
  if (normalizedPath.toLowerCase().startsWith(normalizedCwd.toLowerCase())) {
    return { allowed: true };
  }

  // Already approved this session
  if (approvedPaths.has(normalizedPath.toLowerCase())) {
    return { allowed: true };
  }

  // Paths with .. = always deny (traversal attack)
  if (filePath.includes('..')) {
    return { allowed: false, reason: 'Path traversal (..) is blocked for security.' };
  }

  // Outside workspace: prompt user
  const { approved } = await confirmPath(filePath, action);
  if (approved) {
    approvedPaths.add(normalizedPath.toLowerCase());
    return { allowed: true };
  }
  return { allowed: false, reason: `User denied ${action} access to: ${filePath}` };
}

/**
 * Prompt user to approve a file path outside the workspace.
 */
async function confirmPath(filePath, action) {
  console.log('');
  console.log(`${c.yellow}${c.bold}  ⚠  ${action.toUpperCase()} outside workspace${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);
  console.log(`  ${c.white}${filePath}${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`  ${c.yellow}Allow ${action}? ${c.green}[y]es${c.reset} / ${c.red}[n]o${c.reset}: `, resolve)
  );
  rl.close();
  const trimmed = (answer || '').trim().toLowerCase();
  return { approved: trimmed === 'y' || trimmed === 'yes' };
}

// ── Blocked commands ────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /\brm\s+(-\w+\s+)*\//i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/s\s+\/q/i,
  /\brmdir\s+\/s\s+\/q/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\breg\s+(delete|add)\s+hk/i,
  /\bschtasks\s+\/create/i,
  /\bnet\s+user\s+\w+\s+\/add/i,
  /\buseradd\b/i,
  /\bpasswd\b/i,
  /\bcurl\b.*\|\s*(ba)?sh/i,
  /\bwget\b.*\|\s*(ba)?sh/i,
  /\bnc\s+-\w*l/i,
  /\bpowershell\b.*-enc/i,
  /\bInvoke-WebRequest\b/i,
  /\bInvoke-Expression\b/i,
  /\bIEX\b/i,
  /\bStart-BitsTransfer\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bStop-Computer\b/i,
  /\bRestart-Computer\b/i,
  /\bcipher\s+\/e/i,
  /\bsc\s+(create|delete|config)/i,
  /\bNew-Service\b/i,
  /\b\$env:.*api.?key/i,
  /\bprintenv\b/i,
  /\bcmdkey\b/i,
  /\bmimikatz\b/i,
];

export function isCommandBlocked(command) {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(command)) return pat.toString();
  }
  return null;
}

/**
 * Prompt user to approve a shell command. Returns { approved, always }.
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
  return {
    approved: trimmed === 'y' || trimmed === 'yes' || trimmed === 'a' || trimmed === 'always',
    always: trimmed === 'a' || trimmed === 'always',
  };
}

export function getAutoApproveCommands() { return autoApproveCommands; }
export function setAutoApproveCommands(val) { autoApproveCommands = val; }

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

export function scanForSecrets(content, filePath) {
  const findings = [];
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
