import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname, resolve, isAbsolute } from 'path';
import { parseWriteFileContent } from './xmlParser.js';
import { isPathSafe, isCommandBlocked, confirmCommand, scanForSecrets, printScanResults } from '../security.js';
import { c } from '../splash.js';

let autoApproveCommands = false;

function resolvePath(cwd, filePath) {
  const p = filePath.replace(/\\/g, '/');
  if (isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return resolve(p);
  return resolve(cwd, p);
}

/**
 * Execute a single tool call with security checks. Returns result string for the model.
 */
export async function executeToolCall(cwd, { tag, innerText }) {
  try {
    switch (tag) {
      case 'read_file': {
        const filePath = innerText.trim().split(/\s+/)[0] || innerText.trim();
        if (!filePath) return '[read_file] error: no path provided';
        const fullPath = resolvePath(cwd, filePath);
        if (!isPathSafe(filePath, cwd)) return `[read_file] BLOCKED: path escapes workspace (${filePath})`;
        if (!existsSync(fullPath)) return `[read_file] error: file not found: ${filePath}`;
        const content = readFileSync(fullPath, 'utf8');
        return `[read_file] ${filePath} (${content.split('\n').length} lines):\n${content}`;
      }

      case 'write_file': {
        const { path: filePath, content } = parseWriteFileContent(innerText);
        if (!filePath) return '[write_file] error: no path provided';
        if (!isPathSafe(filePath, cwd)) return `[write_file] BLOCKED: path escapes workspace (${filePath})`;
        const fullPath = resolvePath(cwd, filePath);
        const dir = dirname(fullPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content || '', 'utf8');
        // Auto-scan new files for secrets
        const secrets = scanForSecrets(content || '', filePath);
        let result = `[write_file] wrote ${filePath}`;
        if (secrets.length > 0) {
          result += `\n[SECRET SCAN WARNING] ${secrets.length} potential secret(s) found in ${filePath}`;
          printScanResults(filePath, secrets);
        }
        return result;
      }

      case 'edit_file': {
        const lines = innerText.split('\n');
        const filePath = (lines[0] || '').trim();
        if (!filePath) return '[edit_file] error: no path provided';
        if (!isPathSafe(filePath, cwd)) return `[edit_file] BLOCKED: path escapes workspace (${filePath})`;
        const fullPath = resolvePath(cwd, filePath);
        if (!existsSync(fullPath)) return `[edit_file] error: file not found: ${filePath}`;
        let content = readFileSync(fullPath, 'utf8');
        const rest = lines.slice(1).join('\n');
        const searchMatch = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/i.exec(rest);
        if (searchMatch) {
          if (!content.includes(searchMatch[1])) return `[edit_file] error: search text not found in ${filePath}`;
          content = content.replace(searchMatch[1], searchMatch[2]);
        } else if (rest.trim()) {
          content = content + '\n' + rest.trim();
        }
        writeFileSync(fullPath, content, 'utf8');
        const secrets = scanForSecrets(content, filePath);
        let result = `[edit_file] updated ${filePath}`;
        if (secrets.length > 0) {
          result += `\n[SECRET SCAN WARNING] ${secrets.length} potential secret(s) found in ${filePath}`;
          printScanResults(filePath, secrets);
        }
        return result;
      }

      case 'execute_command': {
        const cmd = innerText.trim();
        if (!cmd) return '[execute_command] error: no command provided';

        // Security: check blocked patterns
        const blocked = isCommandBlocked(cmd);
        if (blocked) {
          console.log(`  ${c.red}${c.bold}BLOCKED${c.reset} ${c.gray}${cmd}${c.reset}`);
          console.log(`  ${c.red}Matched blocked pattern: ${blocked}${c.reset}`);
          return `[execute_command] BLOCKED: command matches a dangerous pattern and was denied.`;
        }

        // Security: require user confirmation
        if (!autoApproveCommands) {
          const { approved, always } = await confirmCommand(cmd);
          if (!approved) return '[execute_command] denied by user';
          if (always) autoApproveCommands = true;
        } else {
          console.log(`  ${c.yellow}auto-approved:${c.reset} ${c.white}${cmd}${c.reset}`);
        }

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

function searchInDir(dir, pattern, maxFiles) {
  const results = [];
  const skipDirs = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', 'build', '.ollama-code']);
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !skipDirs.has(entry.name)) {
        results.push(...searchInDir(full, pattern, maxFiles - results.length));
      } else if (entry.isFile() && /\.(js|ts|jsx|tsx|mjs|cjs|py|rb|go|rs|java|c|cpp|h|json|yaml|yml|md|txt|html|css|scss|sh|ps1|bat|cmd|env|cfg|ini|toml)$/i.test(entry.name)) {
        try {
          const content = readFileSync(full, 'utf8');
          if (content.includes(pattern)) {
            const lineNums = [];
            content.split('\n').forEach((line, i) => { if (line.includes(pattern)) lineNums.push(i + 1); });
            results.push(`  ${full} (lines: ${lineNums.slice(0, 5).join(', ')}${lineNums.length > 5 ? '...' : ''})`);
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return results;
}

function runCommand(cwd, command) {
  return new Promise((resolve) => {
    const proc = spawn(command, [], { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true, timeout: 30000 });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    proc.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }));
  });
}
