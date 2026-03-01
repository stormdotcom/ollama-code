import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname, resolve, isAbsolute, relative } from 'path';
import { parseWriteFileContent } from './xmlParser.js';
import {
  checkFilePermission, checkCommandPermission,
  scanForSecrets, printScanResults, isUnleashedMode,
} from '../security.js';
import { c } from '../splash.js';
import { spinnerStart, spinnerStop, spinnerUpdate } from '../spinner.js';
import { COMMAND_TIMEOUT_MS } from '../constants.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.next', 'dist', 'build',
  '.ollama-code', '.vscode', '.idea', 'coverage', 'vendor', '.cache',
]);
const CODE_EXTS = /\.(js|ts|jsx|tsx|mjs|cjs|py|rb|go|rs|java|c|cpp|h|hpp|cs|json|yaml|yml|md|txt|html|css|scss|sh|ps1|bat|cmd|env|cfg|ini|toml|sql|xml|graphql|proto|vue|svelte|php|lua|dart|kt|scala|swift)$/i;
const MAX_FILE_SIZE = 512 * 1024; // skip files > 512KB for search

/** Tools that can safely run in parallel (read-only). */
export const PARALLEL_SAFE_TOOLS = new Set(['read_file', 'search_code', 'list_files', 'scan_secrets']);

function resolvePath(cwd, filePath) {
  const p = filePath.replace(/\\/g, '/');
  if (isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return resolve(p);
  return resolve(cwd, p);
}

/**
 * Execute a single tool call with permission checks.
 */
export async function executeToolCall(cwd, { tag, innerText }) {
  try {
    switch (tag) {
      case 'read_file': {
        const filePath = innerText.trim().split(/\s+/)[0] || innerText.trim();
        if (!filePath) return '[read_file] error: no path provided';
        const fullPath = resolvePath(cwd, filePath);
        const perm = await checkFilePermission(fullPath, cwd, 'read');
        if (!perm.allowed) return `[read_file] DENIED: ${perm.reason}`;
        if (!existsSync(fullPath)) return `[read_file] error: file not found: ${filePath}`;
        const content = readFileSync(fullPath, 'utf8');
        return `[read_file] ${filePath} (${content.split('\n').length} lines):\n${content}`;
      }

      case 'write_file': {
        const { path: filePath, content } = parseWriteFileContent(innerText);
        if (!filePath) return '[write_file] error: no path provided';
        const fullPath = resolvePath(cwd, filePath);
        const perm = await checkFilePermission(fullPath, cwd, 'write');
        if (!perm.allowed) return `[write_file] DENIED: ${perm.reason}`;
        const dir = dirname(fullPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content || '', 'utf8');
        const secrets = scanForSecrets(content || '', filePath);
        let result = `[write_file] wrote ${filePath}`;
        if (secrets.length > 0) {
          if (isUnleashedMode()) {
            result += `\n[SECRET SCAN INFO] ${secrets.length} pattern(s) detected (unleashed mode — informational only)`;
          } else {
            result += `\n[SECRET SCAN WARNING] ${secrets.length} potential secret(s) found in ${filePath}`;
          }
          printScanResults(filePath, secrets);
        }
        return result;
      }

      case 'edit_file': {
        const lines = innerText.split('\n');
        const filePath = (lines[0] || '').trim();
        if (!filePath) return '[edit_file] error: no path provided';
        const fullPath = resolvePath(cwd, filePath);
        const perm = await checkFilePermission(fullPath, cwd, 'write');
        if (!perm.allowed) return `[edit_file] DENIED: ${perm.reason}`;
        if (!existsSync(fullPath)) return `[edit_file] error: file not found: ${filePath}`;
        let content = readFileSync(fullPath, 'utf8');
        const rest = lines.slice(1).join('\n');

        // Support multiple search/replace blocks in one edit
        const multiPattern = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/gi;
        let match;
        let editCount = 0;
        const allMatches = [];
        while ((match = multiPattern.exec(rest)) !== null) {
          allMatches.push({ search: match[1], replace: match[2] });
        }

        if (allMatches.length > 0) {
          for (const { search, replace } of allMatches) {
            if (!content.includes(search)) {
              return `[edit_file] error: search text not found in ${filePath} (edit #${editCount + 1})`;
            }
            content = content.replace(search, replace);
            editCount++;
          }
        } else if (rest.trim()) {
          content = content + '\n' + rest.trim();
          editCount = 1;
        }

        writeFileSync(fullPath, content, 'utf8');
        const secrets = scanForSecrets(content, filePath);
        let result = `[edit_file] updated ${filePath} (${editCount} edit(s))`;
        if (secrets.length > 0) {
          if (isUnleashedMode()) {
            result += `\n[SECRET SCAN INFO] ${secrets.length} pattern(s) detected (unleashed mode — informational only)`;
          } else {
            result += `\n[SECRET SCAN WARNING] ${secrets.length} potential secret(s) found in ${filePath}`;
          }
          printScanResults(filePath, secrets);
        }
        return result;
      }

      case 'execute_command': {
        const cmd = innerText.trim();
        if (!cmd) return '[execute_command] error: no command provided';
        const perm = await checkCommandPermission(cmd, cwd);
        if (!perm.approved) return `[execute_command] denied: ${perm.source || 'user'}`;
        const result = await runCommand(cwd, cmd);
        const out = [];
        if (result.stdout) out.push(result.stdout);
        if (result.stderr) out.push(`stderr: ${result.stderr}`);
        if (result.code !== 0) out.push(`exit code: ${result.code}`);
        return `[execute_command] ${cmd}\n${out.join('\n')}`.trim();
      }

      case 'search_code': {
        const query = innerText.trim();
        if (!query) return '[search_code] error: no query provided';
        const matches = searchInDir(cwd, query, 30);
        if (matches.length === 0) return `[search_code] "${query}" — no matches`;
        return `[search_code] "${query}" — ${matches.length} file(s):\n${matches.join('\n')}`;
      }

      case 'list_files': {
        const args = innerText.trim();
        const pattern = args || '*';
        const results = listFilesInDir(cwd, pattern, 50);
        if (results.length === 0) return `[list_files] no files matching "${pattern}"`;
        return `[list_files] ${results.length} file(s) matching "${pattern}":\n${results.join('\n')}`;
      }

      case 'scan_secrets': {
        const filePath = innerText.trim();
        if (!filePath) return '[scan_secrets] error: no path provided';
        const fullPath = resolvePath(cwd, filePath);
        if (!existsSync(fullPath)) return `[scan_secrets] error: file not found: ${filePath}`;
        const content = readFileSync(fullPath, 'utf8');
        const findings = scanForSecrets(content, filePath);
        printScanResults(filePath, findings);
        if (findings.length === 0) return `[scan_secrets] ${filePath}: clean`;
        return `[scan_secrets] ${filePath}: ${findings.length} finding(s)\n${findings.map(f => `  Line ${f.line} [${f.pattern}] ${f.match}`).join('\n')}`;
      }

      default:
        return `[${tag}] unknown tool`;
    }
  } catch (err) {
    return `[${tag}] error: ${err.message}`;
  }
}

/**
 * List files matching a glob-like pattern.
 * Supports: *.js, src/**, *.{ts,tsx}, or plain directory name.
 */
function listFilesInDir(cwd, pattern, maxResults) {
  const results = [];

  // Extract optional directory prefix and extension filter
  let searchDir = cwd;
  let extFilter = null;

  if (pattern.includes('/') || pattern.includes('\\')) {
    const parts = pattern.replace(/\\/g, '/').split('/');
    const dirParts = [];
    let lastPart = '';
    for (const p of parts) {
      if (p.includes('*') || p.includes('{')) {
        lastPart = p;
        break;
      }
      dirParts.push(p);
    }
    if (dirParts.length > 0) {
      const subDir = resolve(cwd, dirParts.join('/'));
      if (existsSync(subDir)) searchDir = subDir;
    }
    if (lastPart) {
      extFilter = patternToRegex(lastPart);
    }
  } else if (pattern !== '*' && pattern !== '**') {
    extFilter = patternToRegex(pattern);
  }

  function walk(dir, depth) {
    if (depth > 6 || results.length >= maxResults) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (extFilter && !extFilter.test(entry.name)) continue;
        const rel = relative(cwd, full);
        try {
          const stat = statSync(full);
          results.push(`  ${rel} (${(stat.size / 1024).toFixed(1)} KB)`);
        } catch {
          results.push(`  ${rel}`);
        }
      }
    }
  }

  walk(searchDir, 0);
  return results;
}

function patternToRegex(pattern) {
  // Handle {ts,tsx} brace expansion
  const braceMatch = pattern.match(/\*\.?\{([^}]+)\}/);
  if (braceMatch) {
    const exts = braceMatch[1].split(',').map(e => e.trim());
    return new RegExp(`\\.(${exts.join('|')})$`, 'i');
  }
  // Handle *.ext
  const extMatch = pattern.match(/\*\.(\w+)/);
  if (extMatch) {
    return new RegExp(`\\.${extMatch[1]}$`, 'i');
  }
  // Handle ** (any file)
  if (pattern === '**' || pattern === '*') return null;
  // Plain string — match filename containing it
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function searchInDir(dir, pattern, maxFiles) {
  const results = [];
  try {
    _searchWalk(dir, pattern, maxFiles, results, 0);
  } catch (_) {}
  return results;
}

function _searchWalk(dir, pattern, maxFiles, results, depth) {
  if (depth > 6 || results.length >= maxFiles) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (results.length >= maxFiles) break;
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        _searchWalk(full, pattern, maxFiles, results, depth + 1);
      }
    } else if (entry.isFile() && CODE_EXTS.test(entry.name)) {
      try {
        const stat = statSync(full);
        if (stat.size > MAX_FILE_SIZE) continue; // skip large files
        const content = readFileSync(full, 'utf8');
        if (content.includes(pattern)) {
          const lineNums = [];
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(pattern)) lineNums.push(i + 1);
          }
          results.push(`  ${full} (lines: ${lineNums.slice(0, 5).join(', ')}${lineNums.length > 5 ? '...' : ''})`);
        }
      } catch (_) {}
    }
  }
}

const SPINNER_UPDATE_THROTTLE_MS = 500;

function runCommand(cwd, command) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    spinnerStart(`Executing: ${command.slice(0, 50)}...`, c.magenta);
    const proc = spawn(command, [], { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    let stdout = '';
    let stderr = '';
    let lastSpinnerUpdate = 0;

    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 2000);
      spinnerStop(`${c.red}✗${c.reset} Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`);
      finish({
        code: 124,
        stdout: stdout.trim(),
        stderr: (stderr.trim() + `\n[Timed out after ${COMMAND_TIMEOUT_MS / 1000}s]`).trim(),
      });
    }, COMMAND_TIMEOUT_MS);

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      const now = Date.now();
      if (now - lastSpinnerUpdate >= SPINNER_UPDATE_THROTTLE_MS) {
        lastSpinnerUpdate = now;
        const lines = (stdout.match(/\n/g) || []).length + 1;
        spinnerUpdate(`Running: ${command.slice(0, 40)}... (${lines} lines)`);
      }
    });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code, signal) => {
      clearTimeout(timeoutId);
      if (settled) return;
      spinnerStop(code === 0
        ? `${c.green}✓${c.reset} Command completed`
        : `${c.yellow}⚠${c.reset} Command exited with code ${code}`);
      finish({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      if (settled) return;
      spinnerStop(`${c.red}✗${c.reset} Command failed`);
      finish({ code: 1, stdout: '', stderr: err.message });
    });
  });
}
