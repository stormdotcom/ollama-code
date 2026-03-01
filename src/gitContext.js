import { spawn } from 'child_process';
import { promisify } from 'util';

/**
 * Get git repo root and current branch for context. Returns null if not in a git repo.
 * @returns {Promise<{ root: string, branch: string } | null>}
 */
export async function getGitContext() {
  try {
    const root = await execGit(['rev-parse', '--show-toplevel']);
    const branch = await execGit(['branch', '--show-current']).catch(() => '');
    if (root) return { root: root.trim(), branch: (branch || '').trim() };
  } catch (_) {
    // not a git repo or git not installed
  }
  return null;
}

function execGit(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || 'git failed'))));
  });
}

/**
 * Build a short context string to inject into the system or first user message.
 */
export function formatGitContextForPrompt(gitContext) {
  if (!gitContext) return '';
  const parts = [`Repo root: ${gitContext.root}`];
  if (gitContext.branch) parts.push(`Branch: ${gitContext.branch}`);
  return parts.join('\n');
}
