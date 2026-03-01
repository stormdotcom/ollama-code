import { createInterface } from 'readline';
import { cwd } from 'process';
import { checkOllamaRunning, isModelAvailable } from './preflight.js';
import { printSplash, printVersion, styleError } from './splash.js';
import { getGitContext, formatGitContextForPrompt } from './gitContext.js';
import { streamChat, chat } from './ollamaClient.js';
import { SYSTEM_PROMPT, DEFAULT_MODEL } from './constants.js';
import { parseToolCalls } from './tools/xmlParser.js';
import { executeToolCall } from './tools/executors.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion() {
  try {
    const p = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(p, 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function parseArgs(argv) {
  const args = { model: DEFAULT_MODEL, version: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version' || argv[i] === '-v') args.version = true;
    if (argv[i] === '--model' && argv[i + 1]) args.model = argv[++i];
  }
  return args;
}

export async function runCli(argv) {
  const args = parseArgs(argv);
  const version = getVersion();

  if (args.version) {
    printVersion(version);
    return;
  }

  const preflight = await checkOllamaRunning();
  if (!preflight.ok) {
    console.error(styleError(preflight.error));
    process.exit(1);
  }
  if (preflight.models?.length && !isModelAvailable(args.model, preflight.models)) {
    console.warn(`Warning: model "${args.model}" may not be pulled. Run: ollama pull ${args.model}`);
  }

  printSplash();

  const gitContext = await getGitContext();
  const gitPrompt = formatGitContextForPrompt(gitContext);
  const systemContent = gitPrompt
    ? `${SYSTEM_PROMPT}\n\nCurrent workspace:\n${gitPrompt}`
    : SYSTEM_PROMPT;

  const messages = [
    { role: 'system', content: systemContent },
  ];

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  console.log('Model:', args.model);
  console.log('');

  while (true) {
    const userInput = await ask('You: ');
    const trimmed = (userInput || '').trim();
    if (!trimmed) continue;
    if (/^\/?(exit|quit|q)$/i.test(trimmed)) break;

    messages.push({ role: 'user', content: trimmed });

    let turnContent = '';
    const onToken = (token) => {
      process.stdout.write(token);
      turnContent += token;
    };

    try {
      turnContent = await streamChat(args.model, messages, onToken);
    } catch (err) {
      console.log('\n' + styleError('Error: ' + (err.message || err)));
      messages.pop();
      continue;
    }
    console.log('');
    messages.push({ role: 'assistant', content: turnContent });

    const toolCalls = parseToolCalls(turnContent);
    const cwdPath = cwd();
    if (toolCalls.length > 0) {
      const results = [];
      for (const call of toolCalls) {
        const result = await executeToolCall(cwdPath, call);
        console.log(styleError('[Tool]'), result);
        results.push(result);
      }
      messages.push({
        role: 'user',
        content: `[Tool results]\n${results.join('\n---\n')}`,
      });
      const followUp = await chat(args.model, messages);
      console.log(followUp);
      messages.push({ role: 'assistant', content: followUp });
    }
  }

  rl.close();
  console.log('Bye.');
}
