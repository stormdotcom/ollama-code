import { createInterface } from 'readline';
import { cwd } from 'process';
import { checkOllamaRunning, isModelAvailable, listModels } from './preflight.js';
import { printSplash, printVersion, printHelp, printTools, style, c } from './splash.js';
import { getGitContext, formatGitContextForPrompt } from './gitContext.js';
import { streamChat, chat } from './ollamaClient.js';
import { SYSTEM_PROMPT, DEFAULT_MODEL } from './constants.js';
import { parseToolCalls } from './tools/xmlParser.js';
import { executeToolCall } from './tools/executors.js';
import { scanForSecrets, printScanResults } from './security.js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_TOOL_ITERATIONS = 10;

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

  // ── Preflight ─────────────────────────────────────────────────────────
  const preflight = await checkOllamaRunning();
  if (!preflight.ok) {
    console.error(style.error(preflight.error));
    process.exit(1);
  }

  let currentModel = args.model;
  if (preflight.models?.length && !isModelAvailable(currentModel, preflight.models)) {
    console.warn(style.warn(`Warning: model "${currentModel}" not found. Available: ${preflight.models.join(', ')}`));
  }

  // ── Splash ────────────────────────────────────────────────────────────
  printSplash(currentModel, version);

  // ── Git context ───────────────────────────────────────────────────────
  const gitContext = await getGitContext();
  const gitPrompt = formatGitContextForPrompt(gitContext);

  // ── Conversation ──────────────────────────────────────────────────────
  let messages = [];
  function resetMessages() {
    const systemContent = gitPrompt
      ? `${SYSTEM_PROMPT}\n\nCurrent workspace:\n${gitPrompt}`
      : SYSTEM_PROMPT;
    messages = [{ role: 'system', content: systemContent }];
  }
  resetMessages();

  // ── REPL ──────────────────────────────────────────────────────────────
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  while (true) {
    const userInput = await ask(style.prompt());
    const trimmed = (userInput || '').trim();
    if (!trimmed) continue;

    // ── Slash commands ────────────────────────────────────────────────
    if (trimmed.startsWith('/')) {
      const [cmd, ...rest] = trimmed.split(/\s+/);
      const cmdArg = rest.join(' ');
      switch (cmd.toLowerCase()) {
        case '/exit': case '/quit': case '/q':
          rl.close();
          console.log(style.info('Goodbye.'));
          return;

        case '/help':
          printHelp();
          continue;

        case '/tools':
          printTools();
          continue;

        case '/clear':
          resetMessages();
          console.log(style.success('  Conversation cleared.'));
          continue;

        case '/model':
          if (!cmdArg) {
            console.log(`  ${c.cyan}Current model:${c.reset} ${c.bold}${currentModel}${c.reset}`);
            console.log(`  ${c.gray}Usage: /model <name>  (e.g. /model deepseek-r1:7b)${c.reset}`);
          } else {
            currentModel = cmdArg;
            resetMessages();
            console.log(style.success(`  Switched to ${currentModel}. Conversation cleared.`));
          }
          continue;

        case '/models': {
          const models = await listModels();
          if (models.length === 0) {
            console.log(style.warn('  No models found. Pull one with: ollama pull <model>'));
          } else {
            console.log('');
            console.log(`  ${c.magenta}${c.bold}Available Models${c.reset}`);
            for (const m of models) {
              const marker = m.name === currentModel ? ` ${c.green}← active${c.reset}` : '';
              const size = m.size ? ` ${c.gray}(${(m.size / 1e9).toFixed(1)} GB)${c.reset}` : '';
              console.log(`  ${c.cyan}•${c.reset} ${c.white}${m.name}${c.reset}${size}${marker}`);
            }
            console.log('');
          }
          continue;
        }

        case '/scan': {
          const scanPath = cmdArg || '.';
          const fullPath = resolve(cwd(), scanPath);
          if (!existsSync(fullPath)) {
            console.log(style.error(`  File not found: ${scanPath}`));
          } else {
            const content = readFileSync(fullPath, 'utf8');
            const findings = scanForSecrets(content, scanPath);
            printScanResults(scanPath, findings);
          }
          continue;
        }

        default:
          console.log(style.warn(`  Unknown command: ${cmd}. Type /help for commands.`));
          continue;
      }
    }

    // Exit keywords
    if (/^(exit|quit|q)$/i.test(trimmed)) {
      rl.close();
      console.log(style.info('Goodbye.'));
      return;
    }

    // ── Send to model ───────────────────────────────────────────────
    messages.push({ role: 'user', content: trimmed });

    let iteration = 0;
    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      // Show thinking indicator
      process.stdout.write(`\n${style.modelLabel(currentModel)} `);

      let turnContent = '';
      const onToken = (token) => {
        process.stdout.write(c.magenta + token + c.reset);
      };

      try {
        turnContent = await streamChat(currentModel, messages, onToken);
      } catch (err) {
        console.log('\n' + style.error('Error: ' + (err.message || err)));
        messages.pop();
        break;
      }
      console.log(c.reset);
      messages.push({ role: 'assistant', content: turnContent });

      // ── Parse and execute tools ─────────────────────────────────
      const toolCalls = parseToolCalls(turnContent);
      if (toolCalls.length === 0) break;

      console.log(`${c.gray}  ── executing ${toolCalls.length} tool(s) ──${c.reset}`);

      const results = [];
      for (const call of toolCalls) {
        console.log(style.tool(call.tag, c.gray + (call.innerText.split('\n')[0] || '').slice(0, 80) + c.reset));
        const result = await executeToolCall(cwd(), call);
        console.log(style.toolResult('  ' + result.split('\n')[0]));
        if (result.split('\n').length > 1) {
          const extra = result.split('\n').slice(1).join('\n');
          if (extra.length < 500) console.log(c.gray + extra + c.reset);
          else console.log(c.gray + extra.slice(0, 500) + '...' + c.reset);
        }
        results.push(result);
      }

      messages.push({
        role: 'user',
        content: `[Tool results]\n${results.join('\n---\n')}`,
      });

      // Loop: model gets tool results and may call more tools
    }

    if (iteration >= MAX_TOOL_ITERATIONS) {
      console.log(style.warn(`  (Stopped after ${MAX_TOOL_ITERATIONS} tool iterations)`));
    }
  }
}
