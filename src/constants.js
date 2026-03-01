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
export const OLLAMA_API_BASE = `${OLLAMA_BASE_URL}/v1`;

/** Config directory for this CLI only; we never read or write .claude/ */
export const CONFIG_DIR = '.ollama-code';
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:7b';
export const NUM_CTX = 32768;

export const SYSTEM_PROMPT = `You are a local autonomous developer. You are running on the user's local machine via Ollama. You have permission to read files, write code, and execute terminal commands. Your goal is to solve the user's task with minimal latency and high precision. Do not apologize for being a local model; focus on the code.

When you need to interact with the system, use ONLY these XML tags. Do not use JSON or other formats for tool calls.

- To read a file: <read_file>path</read_file>
- To write a file: <write_file>path\n<ncontent>content here</ncontent></write_file> (use <ncontent> for file content)
- To edit a file: <edit_file>path</edit_file> with instructions in the tag body or use <search>old text</search><replace>new text</replace> inside.
- To run a command: <execute_command>command and args</execute_command>
- To search code: <search_code>query or pattern</search_code>

Use one tag per action. Keep paths and content clear and minimal.`;

export const VERSION_LABEL = 'Local-First Custom Fork';
