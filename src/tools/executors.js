import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { parseWriteFileContent } from './xmlParser.js';

/**
 * Execute a single tool call. Returns result string for the model.
 */
export async function executeToolCall(cwd, { tag, innerText }) {
  try {
    switch (tag) {
      case 'read_file': {
        const path = innerText.trim().split(/\s+/)[0] || innerText.trim();
        if (!path) return '[read_file] error: no path provided';
        const fullPath = path.startsWith('/') ? path : `${cwd}/${path}`.replace(/\/+/g, '/');
        if (!existsSync(fullPath)) return `[read_file] error: file not found: ${path}`;
        const content = readFileSync(fullPath, 'utf8');
        return `[read_file] ${path}:\n${content}`;
      }
      case 'write_file': {
        const { path, content } = parseWriteFileContent(innerText);
        if (!path) return '[write_file] error: no path provided';
        const fullPath = path.startsWith('/') ? path : `${cwd}/${path}`.replace(/\/+/g, '/');
        writeFileSync(fullPath, content || '', 'utf8');
        return `[write_file] wrote ${path}`;
      }
      case 'edit_file': {
        // Simple edit: path on first line, then instructions or search/replace in body
        const lines = innerText.split('\n').map((l) => l.trim()).filter(Boolean);
        const path = lines[0] || '';
        if (!path) return '[edit_file] error: no path provided';
        const fullPath = path.startsWith('/') ? path : `${cwd}/${path}`.replace(/\/+/g, '/');
        if (!existsSync(fullPath)) return `[edit_file] error: file not found: ${path}`;
        let content = readFileSync(fullPath, 'utf8');
        const rest = lines.slice(1).join('\n');
        const searchMatch = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/i.exec(rest);
        if (searchMatch) {
          content = content.replace(searchMatch[1], searchMatch[2]);
        } else if (rest) {
          content = content + '\n' + rest;
        }
        writeFileSync(fullPath, content, 'utf8');
        return `[edit_file] updated ${path}`;
      }
      case 'execute_command': {
        const cmd = innerText.trim();
        if (!cmd) return '[execute_command] error: no command provided';
        const result = await runCommand(cwd, cmd);
        return `[execute_command]\n${result.stdout}${result.stderr ? '\nstderr: ' + result.stderr : ''}`.trim();
      }
      case 'search_code': {
        const query = innerText.trim();
        if (!query) return '[search_code] error: no query provided';
        const matches = searchInDir(cwd, query, 20);
        return `[search_code] ${matches.length ? matches.join('\n') : 'no matches'}`;
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
  const skipDirs = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', 'build']);
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (results.length >= maxFiles) break;
      const full = join(dir, e.name);
      if (e.isDirectory() && !skipDirs.has(e.name)) {
        results.push(...searchInDir(full, pattern, maxFiles - results.length));
      } else if (e.isFile() && /\.(js|ts|mjs|cjs|py|json|md|txt|html|css)$/i.test(e.name)) {
        try {
          const content = readFileSync(full, 'utf8');
          if (content.includes(pattern)) results.push(`${full}: match`);
        } catch (_) {}
      }
    }
  } catch (_) {}
  return results;
}

function runCommand(cwd, command) {
  return new Promise((resolve) => {
    const proc = spawn(command, [], { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}
