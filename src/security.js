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

/**
 * Extract a smart rule from a command string.
 * - "git status" → "Bash(git:*)"  (save the base tool)
 * - "npm install express" → "Bash(npm install:*)"  (save two-word commands)
 * - "node --check src/index.js" → "Bash(node --check:*)"
 * - "python script.py" → "Bash(python:*)"
 * - "ls -la" → "Bash(ls:*)"
 *
 * Heuristic: keep the first word as the base. If the second word looks like
 * a subcommand (not a flag, not a path), include it.
 */
function extractCommandRule(command) {
  const parts = command.trim().split(/\s+/);
  if (parts.length === 0) return null;
  const base = parts[0];

  // Well-known multi-word commands where the 2nd token is a subcommand
  const MULTI_WORD_CMDS = new Set([
    'git', 'npm', 'npx', 'yarn', 'pnpm', 'pip', 'pip3',
    'docker', 'kubectl', 'cargo', 'go', 'dotnet',
    'systemctl', 'brew', 'apt', 'apt-get', 'dnf', 'yum',
    'conda', 'poetry', 'bun',
  ]);

  if (parts.length >= 2 && MULTI_WORD_CMDS.has(base)) {
    const sub = parts[1];
    // Only include if it looks like a subcommand (not a flag or path)
    if (!sub.startsWith('-') && !sub.startsWith('/') && !sub.startsWith('.') && !sub.includes('\\')) {
      return `Bash(${base} ${sub}:*)`;
    }
  }

  // If the second word starts with -- or -, include it (e.g. "node --check")
  if (parts.length >= 2 && parts[1].startsWith('-')) {
    return `Bash(${base} ${parts[1]}:*)`;
  }

  return `Bash(${base}:*)`;
}

async function confirmCommand(command, cwd) {
  console.log('');
  console.log(`${c.yellow}${c.bold}  ⚠  Command approval required${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);
  console.log(`  ${c.white}${command}${c.reset}`);
  console.log(`${c.gray}  ──────────────────────────────────${c.reset}`);

  const suggestedRule = extractCommandRule(command);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(
      `  ${c.yellow}Allow?${c.reset} ` +
      `${c.green}[y]${c.reset} yes once  ` +
      `${c.cyan}[a]${c.reset} always ${c.gray}(save ${suggestedRule})${c.reset}  ` +
      `${c.magenta}[!]${c.reset} all cmds  ` +
      `${c.red}[n]${c.reset} no: `,
      resolve
    )
  );
  rl.close();
  const trimmed = (answer || '').trim().toLowerCase();

  // [a] or "always" — save rule to settings.json for this and future sessions
  if (trimmed === 'a' || trimmed === 'always') {
    if (suggestedRule) {
      addAllowRule(cwd, suggestedRule);
      console.log(`  ${c.green}✓ Saved rule:${c.reset} ${c.bold}${suggestedRule}${c.reset} ${c.gray}→ .ollama-code/settings.json${c.reset}`);
    }
    return { approved: true, source: 'saved-rule' };
  }

  // [!] — approve ALL commands for this session (not saved to disk)
  if (trimmed === '!' || trimmed === 'all') {
    autoApproveCommands = true;
    console.log(`  ${c.yellow}All commands auto-approved for this session${c.reset}`);
    return { approved: true, always: true, source: 'session-always' };
  }

  // [y] or Enter — approve once, no rule saved
  const approved = trimmed === '' || trimmed === 'y' || trimmed === 'yes' || trimmed === '1';
  const denied = trimmed === 'n' || trimmed === 'no' || trimmed === '2';

  if (approved && !denied) {
    return { approved: true, source: 'user-yes' };
  }
  return { approved: false, source: 'user-no' };
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
