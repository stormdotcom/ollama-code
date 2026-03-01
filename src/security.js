import { c } from './splash.js';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { checkSettingsPermission, addAllowRule } from './settings.js';

// ── Session state ───────────────────────────────────────────────────────────
const approvedPaths = new Set();
let autoApproveCommands = false;
let unleashedMode = false;
let serveMode = false;

export function setServeMode(val) { serveMode = val; }
export function isServeMode() { return serveMode; }

// Models whose name triggers unleashed mode automatically
const UNCENSORED_MODEL_PATTERNS = [
  /dolphin/i, /uncensored/i, /abliterat/i, /wizard.*uncensored/i,
  /nous.*hermes/i, /openhermes/i,
];

export function isUnleashedMode() { return unleashedMode; }
export function setUnleashedMode(val) { unleashedMode = val; }
export function isUncensoredModel(modelName) {
  return UNCENSORED_MODEL_PATTERNS.some(p => p.test(modelName));
}

// ── File permissions ────────────────────────────────────────────────────────

/**
 * Check file access permission.
 * 1. Settings allow/deny rules checked first
 * 2. Inside workspace = auto-allowed
 * 3. Outside workspace = prompt user
 */
export async function checkFilePermission(filePath, cwd, action = 'read') {
  const normalizedPath = resolve(filePath.replace(/\\/g, '/'));
  const normalizedCwd = resolve(cwd.replace(/\\/g, '/'));

  // Settings deny rules first
  const tool = action === 'read' ? 'Read' : 'Write';
  const settingsResult = checkSettingsPermission(tool, filePath);
  if (settingsResult === 'deny') {
    return { allowed: false, reason: `Denied by settings rule for ${tool}` };
  }
  if (settingsResult === 'allow') {
    return { allowed: true };
  }

  // Inside workspace = auto-allowed
  if (normalizedPath.toLowerCase().startsWith(normalizedCwd.toLowerCase())) {
    return { allowed: true };
  }

  // Already approved this session
  if (approvedPaths.has(normalizedPath.toLowerCase())) {
    return { allowed: true };
  }

  // Path traversal = always deny
  if (filePath.includes('..')) {
    return { allowed: false, reason: 'Path traversal (..) is blocked for security.' };
  }

  // Serve mode (web/LAN): auto-allow
  if (serveMode) return { allowed: true };

  // Outside workspace: prompt user
  const { approved } = await confirmPath(filePath, action, cwd);
  if (approved) {
    approvedPaths.add(normalizedPath.toLowerCase());
    return { allowed: true };
  }
  return { allowed: false, reason: `User denied ${action} access to: ${filePath}` };
}

async function confirmPath(filePath, action, cwd) {
  console.log('');
  console.log(`${c.yellow}${c.bold}  ⚠  ${action.toUpperCase()} outside workspace${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);
  console.log(`  ${c.white}${filePath}${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`  ${c.yellow}Allow ${action}? ${c.green}[1] yes${c.reset} / ${c.red}[2] no${c.reset} (or y/n): `, resolve)
  );
  rl.close();
  const trimmed = (answer || '').trim().toLowerCase();
  const approved = trimmed === 'y' || trimmed === 'yes' || trimmed === '1';
  return { approved };
}

// ── Command permissions ─────────────────────────────────────────────────────

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
 * Check if command is auto-allowed by settings, auto-approve, or needs prompt.
 * Returns { approved: boolean, always?: boolean, source?: string }
 */
export async function checkCommandPermission(command, cwd) {
  if (serveMode) return { approved: true, source: 'serve-mode' };

  const blocked = isCommandBlocked(command);
  if (blocked) {
    if (unleashedMode) {
      console.log(`  ${c.magenta}${c.bold}UNLEASHED${c.reset} ${c.yellow}Normally blocked command — prompting instead${c.reset}`);
      return await confirmCommand(command, cwd);
    }
    console.log(`  ${c.red}${c.bold}BLOCKED${c.reset} ${c.gray}${command}${c.reset}`);
    return { approved: false, source: 'blocked' };
  }

  // Settings deny rules
  const settingsResult = checkSettingsPermission('Bash', command);
  if (settingsResult === 'deny') {
    console.log(`  ${c.red}${c.bold}DENIED by settings${c.reset} ${c.gray}${command}${c.reset}`);
    return { approved: false, source: 'settings-deny' };
  }

  // Settings allow rules
  if (settingsResult === 'allow') {
    console.log(`  ${c.green}auto-allowed (settings):${c.reset} ${c.white}${command}${c.reset}`);
    return { approved: true, source: 'settings-allow' };
  }

  // Session-level auto-approve
  if (autoApproveCommands) {
    console.log(`  ${c.yellow}auto-approved (session):${c.reset} ${c.white}${command}${c.reset}`);
    return { approved: true, source: 'session-always' };
  }

  // Prompt user
  return await confirmCommand(command, cwd);
}

async function confirmCommand(command, cwd) {
  console.log('');
  console.log(`${c.yellow}${c.bold}  ⚠  Command approval required${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);
  console.log(`  ${c.white}${command}${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`  ${c.yellow}Allow? ${c.green}[1] yes${c.reset} / ${c.red}[2] no${c.reset} / ${c.cyan}[3] always${c.reset} / ${c.magenta}[4] save rule${c.reset} (or y/n/a/s): `, resolve)
  );
  rl.close();
  const trimmed = (answer || '').trim().toLowerCase();

  if (trimmed === 's' || trimmed === 'save' || trimmed === '4') {
    // Auto-detect the prefix and save as Bash(prefix:*)
    const prefix = command.split(/\s+/)[0];
    const rule = `Bash(${prefix}:*)`;
    addAllowRule(cwd, rule);
    console.log(style_success(`  Saved rule: ${rule}`));
    return { approved: true, source: 'saved-rule' };
  }

  if (trimmed === 'a' || trimmed === 'always' || trimmed === '3') {
    autoApproveCommands = true;
    return { approved: true, always: true, source: 'session-always' };
  }

  const approved = trimmed === 'y' || trimmed === 'yes' || trimmed === '1';
  const denied = trimmed === 'n' || trimmed === 'no' || trimmed === '2';
  return { approved: approved && !denied, source: approved ? 'user-yes' : 'user-no' };
}

function style_success(text) { return `${c.green}${text}${c.reset}`; }

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
