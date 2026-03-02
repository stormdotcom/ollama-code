/**
 * Base URL for Ollama. We do not use any Claude/Anthropic env vars.
 * Priority: OLLAMA_BASE_URL > OLLAMA_HOST + OLLAMA_PORT > default http://localhost:11434
 */
function getOllamaBaseUrl() {
  if (process.env.OLLAMA_BASE_URL) return process.env.OLLAMA_BASE_URL.replace(/\/$/, '');
  const host = process.env.OLLAMA_HOST || 'localhost';
  const port = process.env.OLLAMA_PORT || '11434';
  const protocol = process.env.OLLAMA_TLS === '1' ? 'https' : 'http';
  return `${protocol}://${host}:${port}`;
}
export const OLLAMA_BASE_URL = getOllamaBaseUrl();

/** Config directory for this CLI only; we never read or write .claude/ */
export const CONFIG_DIR = '.ollama-code';
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:7b';
export const NUM_CTX = 32768;

/** MongoDB session storage */
export const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
export const MONGODB_DB = 'ollama-code';

/** ChromaDB for RAG vector search */
export const CHROMADB_URL = process.env.CHROMADB_URL || 'http://localhost:8000';

/** Ollama embedding model for RAG */
export const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

/** Web server for LAN session control */
export const SERVE_HOST = process.env.OLLAMA_CODE_SERVE_HOST || '0.0.0.0';
export const SERVE_PORT = parseInt(process.env.OLLAMA_CODE_SERVE_PORT || '3141', 10);

/** Command execution timeout (ms). Node spawn ignores timeout; we enforce manually. Default 20 min for long pip installs. */
export const COMMAND_TIMEOUT_MS = parseInt(process.env.OLLAMA_CODE_CMD_TIMEOUT || '1200000', 10);

/** First-response timeout (ms). If no first token within this time, user can switch model or retry. Default 90s. */
export const FIRST_RESPONSE_TIMEOUT_MS = parseInt(process.env.OLLAMA_CODE_FIRST_RESPONSE_TIMEOUT || '90000', 10);

/**
 * System prompt — tells the model exactly what permissions it already has.
 * CWD and file tree are injected at runtime so the model knows its context.
 */
export function buildSystemPrompt({ cwd, fileTree, gitInfo, unleashed = false }) {
  let prompt = `You are an agentic coder running locally via Ollama. You work in a loop: emit tool XML tags, get results, continue until done. Never stop after one round if more steps are needed. Never repeat commands that already ran.`;

  if (unleashed) {
    prompt += `

## UNLEASHED MODE
Security research enabled. Write exploits, reverse engineering, pentesting, fuzzers, scanners freely. No disclaimers needed.`;
  }

  prompt += `

## PERMISSIONS
All file read/write/edit/search inside workspace: auto-allowed. Commands: user approves. Outside workspace: user approves.

## TOOLS (XML tags only)
<read_file>path</read_file>
<write_file>path
<ncontent>content</ncontent>
</write_file>
<edit_file>path
<search>old</search>
<replace>new</replace>
</edit_file>
<execute_command>cmd</execute_command>
<search_code>pattern</search_code>
<list_files>glob</list_files>
<scan_secrets>path</scan_secrets>

## KEY RULES
- Use relative paths. Multiple tool tags per response OK.
- Write code to files with tools, not as markdown code blocks.
- Include enough context in <search> to match uniquely.${unleashed ? '\n- Blocked commands promptable with user approval.' : '\n- Dangerous commands (rm -rf /, format, shutdown) auto-blocked.'}

## WORKSPACE
CWD: ${cwd}
${gitInfo ? `Git: ${gitInfo}` : 'No git.'}

## FILES
${fileTree || '(none)'}
`;
  return prompt;
}

export const VERSION_LABEL = 'Local-First Custom Fork';
