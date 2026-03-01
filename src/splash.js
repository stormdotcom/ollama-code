import chalk from 'chalk';

/**
 * Print OLLAMA-CODE-CLI splash in Ollama-style colors (white, gray, purple).
 */
export function printSplash() {
  const line = chalk.gray('─'.repeat(40));
  console.log(line);
  console.log(chalk.white.bold('  OLLAMA-CODE-CLI'));
  console.log(chalk.gray('  Local-first coding with Ollama'));
  console.log(line);
  console.log(chalk.gray('  Default model: qwen2.5-coder:7b  •  --model to override'));
  console.log(chalk.gray('  Use <read_file>, <write_file>, <edit_file>, <execute_command>, <search_code>'));
  console.log('');
}

export function printVersion(version) {
  console.log(`ollama-code-cli ${version} (${chalk.magenta('Local-First Custom Fork')})`);
}

export function styleAssistant(text) {
  return chalk.magenta(text);
}

export function styleUser(text) {
  return chalk.gray(text);
}

export function styleError(text) {
  return chalk.red(text);
}
