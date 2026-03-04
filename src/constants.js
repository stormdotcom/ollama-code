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

/** Model inference parameters — match your Ollama Modelfile settings */
export const NUM_CTX       = parseInt(process.env.OLLAMA_NUM_CTX   || '32768', 10);
export const TEMPERATURE   = parseFloat(process.env.OLLAMA_TEMP    || '0.6');
export const TOP_P         = parseFloat(process.env.OLLAMA_TOP_P   || '0.95');
export const TOP_K         = parseInt(process.env.OLLAMA_TOP_K     || '20', 10);
export const NUM_PREDICT   = parseInt(process.env.OLLAMA_NUM_PREDICT || '4096', 10);

/** Web server for LAN session control */
export const SERVE_HOST = process.env.OLLAMA_CODE_SERVE_HOST || '0.0.0.0';
export const SERVE_PORT = parseInt(process.env.OLLAMA_CODE_SERVE_PORT || '3141', 10);

/** Command execution timeout (ms). Node spawn ignores timeout; we enforce manually. Default 20 min for long pip installs. */
export const COMMAND_TIMEOUT_MS = parseInt(process.env.OLLAMA_CODE_CMD_TIMEOUT || '1200000', 10);

/** First-response timeout (ms). If no first token within this time, user can switch model or retry. Default 90s. */
export const FIRST_RESPONSE_TIMEOUT_MS = parseInt(process.env.OLLAMA_CODE_FIRST_RESPONSE_TIMEOUT || '180000', 10);

/**
 * System prompt — rich, expert-level instructions.
 * Covers agentic tool use, visual/UI coding, and best practices.
 */
export function buildSystemPrompt({ cwd, fileTree, gitInfo, unleashed = false }) {
  const files = fileTree || '';
  const secNote = unleashed ? ' Security research, exploits and offensive code are permitted.' : '';

  return `You are an expert software developer and agentic AI assistant. Your capabilities:

## Expertise
- Full-stack development (frontend, backend, mobile, CLI, DevOps)
- Visual coding: analyze UI mockups / screenshots → produce precise, production-ready code
- CSS/JS/HTML design systems, animations, responsive layouts
- Code review, refactoring, debugging, performance optimization
- Architecture decisions, best practices, design patterns

## Agentic Tool Use
You have tools. Use them proactively — read files before editing, verify before assuming, loop until done.
Emit XML tool calls, receive results, then continue:

<read_file>path</read_file>
<write_file>path\n<ncontent>code</ncontent>\n</write_file>
<edit_file>path\n<search>old</search>\n<replace>new</replace>\n</edit_file>
<execute_command>cmd</execute_command>
<search_code>pattern</search_code>
<list_files>glob</list_files>

Rules: relative paths only · code inside tools, not markdown · batch parallel reads · max ${3} tool iterations per step

## Code Quality Standards
- Write complete, runnable code — no placeholders or "TODO" stubs unless asked
- Follow language idioms and framework conventions
- Prefer readability; add comments for non-obvious logic
- For UI/frontend: use modern CSS (flexbox/grid), semantic HTML, accessible markup
- For backend/CLI: handle errors gracefully, validate inputs
${secNote}
## Context
CWD: ${cwd}${gitInfo ? '\nGit: ' + gitInfo : ''}
${files ? 'Project files:\n' + files : ''}`;
}

export const VERSION_LABEL = 'Local-First Custom Fork';
