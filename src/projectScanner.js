import { readdirSync } from 'fs';
import { join, relative } from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', 'build', '.ollama-code', '.vscode', '.idea', 'coverage', 'vendor']);
const CODE_EXTS = /\.(js|ts|jsx|tsx|mjs|cjs|py|rb|go|rs|java|c|cpp|h|hpp|cs|json|yaml|yml|md|txt|html|css|scss|sh|ps1|bat|cmd|env|cfg|ini|toml|sql|xml|graphql|proto|vue|svelte|astro|php|lua|ex|exs|erl|hrl|hs|ml|fs|fsx|r|jl|dart|kt|scala|swift|m|mm)$/i;
const MAX_FILES = 20;
const MAX_DEPTH = 2;

/**
 * Scan cwd and return a compact file tree string for the system prompt.
 * Only lists file names and structure — does NOT read file contents.
 */
export function scanProjectTree(cwd) {
  const lines = [];
  let count = 0;

  function walk(dir, depth, prefix) {
    if (depth > MAX_DEPTH || count >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    const dirs = [];
    const files = [];
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.env' && e.name !== '.env.example') continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) dirs.push(e);
      } else if (e.isFile() && CODE_EXTS.test(e.name)) {
        files.push(e);
      }
    }

    for (const f of files) {
      if (count >= MAX_FILES) { lines.push(`${prefix}... (truncated)`); return; }
      const fullPath = join(dir, f.name);
      const rel = relative(cwd, fullPath);
      lines.push(`${prefix}${rel}`);
      count++;
    }

    for (const d of dirs) {
      if (count >= MAX_FILES) break;
      lines.push(`${prefix}${d.name}/`);
      walk(join(dir, d.name), depth + 1, prefix + '  ');
    }
  }

  walk(cwd, 0, '');
  if (lines.length === 0) return '(empty project or no code files found)';
  return lines.join('\n');
}
