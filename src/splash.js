/** ANSI codes for terminal colors (no external deps — works without npm install). */
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

/**
 * Print OLLAMA-CODE-CLI splash in Ollama-style colors (white, gray, purple).
 */
export function printSplash() {
  const line = c.gray + '─'.repeat(40) + c.reset;
  console.log(line);
  console.log(c.white + c.bold + '  OLLAMA-CODE-CLI' + c.reset);
  console.log(c.gray + '  Local-first coding with Ollama' + c.reset);
  console.log(line);
  console.log(c.gray + '  Default model: qwen2.5-coder:7b  •  --model to override' + c.reset);
  console.log(c.gray + '  Use <read_file>, <write_file>, <edit_file>, <execute_command>, <search_code>' + c.reset);
  console.log('');
}

export function printVersion(version) {
  console.log(`ollama-code-cli ${version} (${c.magenta}Local-First Custom Fork${c.reset})`);
}

export function styleAssistant(text) {
  return c.magenta + text + c.reset;
}

export function styleUser(text) {
  return c.gray + text + c.reset;
}

export function styleError(text) {
  return c.red + text + c.reset;
}
