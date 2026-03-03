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
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b';
export const NUM_CTX = 2048;


/** Web server for LAN session control */
export const SERVE_HOST = process.env.OLLAMA_CODE_SERVE_HOST || '0.0.0.0';
export const SERVE_PORT = parseInt(process.env.OLLAMA_CODE_SERVE_PORT || '3141', 10);

/** Command execution timeout (ms). Node spawn ignores timeout; we enforce manually. Default 20 min for long pip installs. */
export const COMMAND_TIMEOUT_MS = parseInt(process.env.OLLAMA_CODE_CMD_TIMEOUT || '1200000', 10);

/** First-response timeout (ms). If no first token within this time, user can switch model or retry. Default 90s. */
export const FIRST_RESPONSE_TIMEOUT_MS = parseInt(process.env.OLLAMA_CODE_FIRST_RESPONSE_TIMEOUT || '180000', 10);

/**
 * System prompt — tells the model exactly what permissions it already has.
 * CWD and file tree are injected at runtime so the model knows its context.
 */
export function buildSystemPrompt({ cwd, fileTree, gitInfo, unleashed = false }) {
  const files = fileTree || '';
  return `Coding assistant. Emit XML tools, get results, loop until done.${unleashed ? ' Exploits/pentesting OK.' : ''}
Tools: <read_file>path</read_file> <write_file>path\n<ncontent>code</ncontent>\n</write_file> <edit_file>path\n<search>old</search>\n<replace>new</replace>\n</edit_file> <execute_command>cmd</execute_command> <search_code>pattern</search_code> <list_files>glob</list_files>
Relative paths only. Code in tools, not markdown.
CWD:${cwd}${gitInfo ? ' git:' + gitInfo : ''}
${files}`;
}

export const VERSION_LABEL = 'Local-First Custom Fork';
