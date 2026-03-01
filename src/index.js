import { createInterface } from 'readline';
import { cwd } from 'process';
import { checkOllamaRunning, isModelAvailable, listModels } from './preflight.js';
import { printSplash, printVersion, printHelp, printTools, printShortcuts, style, c } from './splash.js';
import { getGitContext, formatGitContextForPrompt } from './gitContext.js';
import { streamChat, chat } from './ollamaClient.js';
import { buildSystemPrompt, DEFAULT_MODEL } from './constants.js';
import { parseToolCalls } from './tools/xmlParser.js';
import { executeToolCall } from './tools/executors.js';
import { scanForSecrets, printScanResults, isUncensoredModel, setUnleashedMode, isUnleashedMode } from './security.js';
import { loadSettings, printSettings, addAllowRule, removeAllowRule, getSettings } from './settings.js';
import { scanProjectTree } from './projectScanner.js';
import { spinnerStart, spinnerStop, spinnerUpdate, withSpinner, spinnerForTool } from './spinner.js';
import { createStreamFormatter } from './outputFormatter.js';
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
  const args = { model: DEFAULT_MODEL, version: false, unleashed: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version' || argv[i] === '-v') args.version = true;
    if (argv[i] === '--model' && argv[i + 1]) args.model = argv[++i];
    if (argv[i] === '--unleashed' || argv[i] === '--uncensored') args.unleashed = true;
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
  spinnerStart('Connecting to Ollama...', c.cyan);
  const preflight = await checkOllamaRunning();
  if (!preflight.ok) {
    spinnerStop(`${c.red}✗${c.reset} Connection failed`);
    console.error(style.error(preflight.error));
    process.exit(1);
  }
  spinnerStop(`${c.green}✓${c.reset} Connected to Ollama`);

  let currentModel = args.model;
  if (preflight.models?.length && !isModelAvailable(currentModel, preflight.models)) {
    const fallback = preflight.models[0];
    console.warn(style.warn(`Model "${currentModel}" not found. Falling back to "${fallback}".`));
    console.log(style.info(`  Available: ${preflight.models.join(', ')}`));
    console.log(style.info(`  Use --model <name> or /model <name> to switch.\n`));
    currentModel = fallback;
  }

  // ── Unleashed mode ──────────────────────────────────────────────────
  if (args.unleashed || isUncensoredModel(currentModel)) {
    setUnleashedMode(true);
  }

  // ── Splash ────────────────────────────────────────────────────────────
  printSplash(currentModel, version);

  // ── Unleashed banner ────────────────────────────────────────────────
  if (isUnleashedMode()) {
    console.log(`  ${c.magenta}${c.bold}⚡ UNLEASHED MODE${c.reset} ${c.gray}— security research enabled${c.reset}`);
    console.log(`  ${c.gray}Blocked commands → promptable | Secret scan → informational${c.reset}`);
    console.log(`  ${c.gray}Exploit, reverse engineering & offensive code allowed${c.reset}`);
    console.log('');
  }

  // ── Load settings ───────────────────────────────────────────────────
  const workDir = cwd();
  spinnerStart('Loading settings...', c.cyan);
  const settings = loadSettings(workDir);
  const allowRules = settings.permissions?.allow || [];
  const denyRules = settings.permissions?.deny || [];
  const ruleCount = allowRules.length + denyRules.length;
  spinnerStop(ruleCount > 0
    ? `${c.green}✓${c.reset} Loaded ${c.bold}${ruleCount}${c.reset} permission rule(s) from .ollama-code/settings.json`
    : `${c.gray}─${c.reset} No settings file (defaults apply)`);

  // ── Project scan ──────────────────────────────────────────────────────
  spinnerStart('Scanning project files...', c.cyan);
  const fileTree = scanProjectTree(workDir);
  const fileCount = fileTree.split('\n').filter(l => l.trim()).length;
  spinnerStop(`${c.green}✓${c.reset} Scanned ${c.bold}${fileCount}${c.reset} file(s) — model has full project context`);

  // ── Git context ───────────────────────────────────────────────────────
  spinnerStart('Loading git context...', c.cyan);
  const gitContext = await getGitContext();
  const gitInfo = formatGitContextForPrompt(gitContext);
  spinnerStop(gitInfo
    ? `${c.green}✓${c.reset} Git context loaded`
    : `${c.gray}─${c.reset} No git repository detected`);

  // ── Build system prompt ───────────────────────────────────────────────
  spinnerStart('Preparing system prompt...', c.magenta);
  const systemPrompt = buildSystemPrompt({ cwd: workDir, fileTree, gitInfo, unleashed: isUnleashedMode() });
  spinnerStop(`${c.green}✓${c.reset} System prompt ready`);

  let messages = [];
  function resetMessages() {
    messages = [{ role: 'system', content: systemPrompt }];
  }
  resetMessages();

  // ── Permission summary ────────────────────────────────────────────────
  console.log(`  ${c.cyan}Permissions:${c.reset}`);
  console.log(`    ${c.green}✓${c.reset} Read files in workspace     ${c.green}auto-allowed${c.reset}`);
  console.log(`    ${c.green}✓${c.reset} Write files in workspace    ${c.green}auto-allowed${c.reset}`);
  console.log(`    ${c.green}✓${c.reset} Search code in workspace    ${c.green}auto-allowed${c.reset}`);
  console.log(`    ${c.yellow}?${c.reset} Read/write outside workspace ${c.yellow}prompts you${c.reset}`);
  console.log(`    ${c.yellow}?${c.reset} Execute shell commands       ${c.yellow}prompts you (or auto via settings)${c.reset}`);
  console.log(`    ${c.red}✗${c.reset} Dangerous commands           ${c.red}always blocked${c.reset}`);
  if (allowRules.length > 0) {
    console.log(`  ${c.cyan}Allow rules:${c.reset}`);
    for (const rule of allowRules) {
      console.log(`    ${c.green}✓${c.reset} ${rule}`);
    }
  }
  console.log('');

  // ── Shortcuts info ──────────────────────────────────────────────────
  console.log(`  ${c.gray}Shortcuts: Ctrl+C interrupt, Ctrl+D exit, Ctrl+L clear screen${c.reset}`);
  console.log(`  ${c.gray}Type /shortcuts for all keyboard shortcuts${c.reset}`);
  console.log('');

  // ── REPL ──────────────────────────────────────────────────────────────
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  // Ctrl+D to exit cleanly
  rl.on('close', () => {
    console.log(style.info('\nGoodbye.'));
    process.exit(0);
  });

  // Ctrl+C at idle prompt — show hint instead of killing the process
  rl.on('SIGINT', () => {
    console.log(`\n${c.gray}  (Press Ctrl+D or type /exit to quit)${c.reset}`);
    rl.prompt();
  });

  // Ctrl+L to clear screen
  if (process.stdin.isTTY) {
    process.stdin.on('keypress', (_ch, key) => {
      if (key && key.ctrl && key.name === 'l') {
        process.stdout.write('\x1b[2J\x1b[H');
        rl.prompt();
      }
    });
  }

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

        case '/shortcuts': case '/keys': case '/keybindings':
          printShortcuts();
          continue;

        case '/unleash': case '/unleashed': {
          const wasUnleashed = isUnleashedMode();
          setUnleashedMode(!wasUnleashed);
          if (isUnleashedMode()) {
            console.log(`\n  ${c.magenta}${c.bold}⚡ UNLEASHED MODE ON${c.reset}`);
            console.log(`  ${c.gray}Blocked commands → promptable | Secret scan → informational${c.reset}`);
            console.log(`  ${c.gray}Exploit, reverse engineering & offensive code allowed${c.reset}`);
          } else {
            console.log(`\n  ${c.green}${c.bold}🔒 UNLEASHED MODE OFF${c.reset}`);
            console.log(`  ${c.gray}Standard security restrictions restored${c.reset}`);
          }
          resetMessages();
          const newSystemPrompt = buildSystemPrompt({ cwd: workDir, fileTree, gitInfo, unleashed: isUnleashedMode() });
          messages = [{ role: 'system', content: newSystemPrompt }];
          console.log(style.info('  Conversation cleared with new system prompt.'));
          console.log('');
          continue;
        }

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
            const autoUnleash = isUncensoredModel(currentModel);
            if (autoUnleash && !isUnleashedMode()) {
              setUnleashedMode(true);
              console.log(`  ${c.magenta}${c.bold}⚡ Unleashed mode auto-enabled${c.reset} ${c.gray}(uncensored model detected)${c.reset}`);
            } else if (!autoUnleash && isUnleashedMode()) {
              setUnleashedMode(false);
              console.log(`  ${c.green}${c.bold}🔒 Unleashed mode auto-disabled${c.reset} ${c.gray}(standard model)${c.reset}`);
            }
            const newSP = buildSystemPrompt({ cwd: workDir, fileTree, gitInfo, unleashed: isUnleashedMode() });
            messages = [{ role: 'system', content: newSP }];
            console.log(style.success(`  Switched to ${currentModel}. Conversation cleared.`));
          }
          continue;

        case '/models': {
          spinnerStart('Fetching models...', c.cyan);
          const models = await listModels();
          spinnerStop();
          if (models.length === 0) {
            console.log(style.warn('  No models found. Pull one with: ollama pull <model>'));
          } else {
            console.log('');
            console.log(`  ${c.magenta}${c.bold}Available Models${c.reset}`);
            models.forEach((m, i) => {
              const num = `${i + 1}.`;
              const marker = m.name === currentModel ? ` ${c.green}← active${c.reset}` : '';
              const size = m.size ? ` ${c.gray}(${(m.size / 1e9).toFixed(1)} GB)${c.reset}` : '';
              console.log(`  ${c.cyan}${num.padEnd(3)}${c.reset} ${c.white}${m.name}${c.reset}${size}${marker}`);
            });
            console.log('');
            const choice = (await ask(`  ${c.yellow}Enter number to switch model${c.reset} (or ${c.gray}Enter${c.reset} to skip): `)).trim();
            const idx = parseInt(choice, 10);
            if (choice !== '' && Number.isInteger(idx) && idx >= 1 && idx <= models.length) {
              const chosen = models[idx - 1].name;
              currentModel = chosen;
              const autoUnleash = isUncensoredModel(currentModel);
              if (autoUnleash && !isUnleashedMode()) {
                setUnleashedMode(true);
                console.log(`  ${c.magenta}${c.bold}⚡ Unleashed mode auto-enabled${c.reset} ${c.gray}(uncensored model)${c.reset}`);
              } else if (!autoUnleash && isUnleashedMode()) {
                setUnleashedMode(false);
                console.log(`  ${c.green}${c.bold}🔒 Unleashed mode auto-disabled${c.reset}`);
              }
              const newSP = buildSystemPrompt({ cwd: workDir, fileTree, gitInfo, unleashed: isUnleashedMode() });
              messages = [{ role: 'system', content: newSP }];
              console.log(style.success(`  Switched to ${currentModel}. Conversation cleared.`));
            } else if (choice !== '') {
              console.log(style.warn(`  Invalid choice. Use 1–${models.length} or Enter to skip.`));
            }
            console.log('');
          }
          continue;
        }

        case '/scan': {
          const scanPath = cmdArg || '.';
          const fullPath = resolve(workDir, scanPath);
          if (!existsSync(fullPath)) {
            console.log(style.error(`  File not found: ${scanPath}`));
          } else {
            spinnerStart(`Scanning ${scanPath} for secrets...`, c.red);
            const content = readFileSync(fullPath, 'utf8');
            const findings = scanForSecrets(content, scanPath);
            spinnerStop(findings.length > 0
              ? `${c.red}✗${c.reset} Found ${findings.length} potential secret(s)`
              : `${c.green}✓${c.reset} No secrets found`);
            printScanResults(scanPath, findings);
          }
          continue;
        }

        case '/permissions': case '/perms':
          console.log('');
          console.log(`  ${c.magenta}${c.bold}Current Permissions${c.reset}`);
          console.log(`    ${c.green}✓${c.reset} Read workspace files      ${c.green}auto${c.reset}`);
          console.log(`    ${c.green}✓${c.reset} Write workspace files     ${c.green}auto${c.reset}`);
          console.log(`    ${c.green}✓${c.reset} Search workspace          ${c.green}auto${c.reset}`);
          console.log(`    ${c.yellow}?${c.reset} Outside workspace         ${c.yellow}prompt${c.reset}`);
          console.log(`    ${c.yellow}?${c.reset} Shell commands             ${c.yellow}prompt (or auto via settings)${c.reset}`);
          console.log(`    ${c.red}✗${c.reset} Dangerous commands         ${c.red}blocked${c.reset}`);
          console.log(`  ${c.gray}Workspace: ${workDir}${c.reset}`);
          printSettings(workDir);
          continue;

        case '/settings':
          printSettings(workDir);
          continue;

        case '/allow':
          if (!cmdArg) {
            console.log(`  ${c.gray}Usage: /allow Bash(git:*)${c.reset}`);
            console.log(`  ${c.gray}       /allow Bash(npm install:*)${c.reset}`);
            console.log(`  ${c.gray}       /allow Bash(python:*)${c.reset}`);
            console.log(`  ${c.gray}       /allow Read(*)${c.reset}`);
            console.log(`  ${c.gray}       /allow Write(src/**)${c.reset}`);
          } else {
            addAllowRule(workDir, cmdArg);
            console.log(style.success(`  Added allow rule: ${cmdArg}`));
            console.log(style.info(`  Saved to .ollama-code/settings.json`));
          }
          continue;

        case '/deny':
          if (!cmdArg) {
            console.log(`  ${c.gray}Usage: /deny Bash(rm:*)${c.reset}`);
          } else {
            const { addDenyRule: addDeny } = await import('./settings.js');
            addDeny(workDir, cmdArg);
            console.log(style.success(`  Added deny rule: ${cmdArg}`));
            console.log(style.info(`  Saved to .ollama-code/settings.json`));
          }
          continue;

        case '/revoke':
          if (!cmdArg) {
            console.log(`  ${c.gray}Usage: /revoke Bash(git:*)${c.reset}`);
          } else {
            removeAllowRule(workDir, cmdArg);
            console.log(style.success(`  Removed rule: ${cmdArg}`));
            console.log(style.info(`  Saved to .ollama-code/settings.json`));
          }
          continue;

        default:
          console.log(style.warn(`  Unknown command: ${cmd}. Type /help for commands.`));
          continue;
      }
    }

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

      let turnContent = '';
      let interrupted = false;
      let firstToken = true;
      const abortController = new AbortController();
      const writeOut = (s) => process.stdout.write(s);
      const formatter = createStreamFormatter(writeOut);

      spinnerStart('Thinking...', c.magenta);

      const interruptHandler = () => {
        interrupted = true;
        abortController.abort();
        spinnerStop();
        process.stdout.write(`\n${c.yellow}  ⏹ Generation interrupted (Ctrl+C)${c.reset}\n`);
      };
      process.once('SIGINT', interruptHandler);

      const onToken = (token) => {
        if (firstToken) {
          spinnerStop();
          process.stdout.write(`\n\n${style.modelLabel(currentModel)}\n`);
          firstToken = false;
        }
        formatter.push(token);
      };

      try {
        turnContent = await streamChat(currentModel, messages, onToken, { signal: abortController.signal });
      } catch (err) {
        spinnerStop();
        if (interrupted) {
          process.removeListener('SIGINT', interruptHandler);
          if (turnContent) {
            messages.push({ role: 'assistant', content: turnContent + '\n[interrupted by user]' });
          }
          break;
        }
        console.log('\n' + style.error('Error: ' + (err.message || err)));
        messages.pop();
        process.removeListener('SIGINT', interruptHandler);
        break;
      }
      process.removeListener('SIGINT', interruptHandler);

      if (interrupted) {
        if (turnContent) {
          messages.push({ role: 'assistant', content: turnContent + '\n[interrupted by user]' });
        }
        break;
      }

      formatter.flush();
      process.stdout.write(c.reset + '\n');
      messages.push({ role: 'assistant', content: turnContent });

      const toolCalls = parseToolCalls(turnContent);
      if (toolCalls.length === 0) break;

      console.log(`${c.gray}  ── executing ${toolCalls.length} tool(s) ──${c.reset}`);

      const results = [];
      for (const call of toolCalls) {
        const detail = (call.innerText.split('\n')[0] || '').trim().slice(0, 60);
        spinnerForTool(call.tag, detail);
        const result = await executeToolCall(workDir, call);
        spinnerStop(`${c.cyan}${c.bold}[${call.tag}]${c.reset} ${c.gray}${detail}${c.reset}`);
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
    }

    if (iteration >= MAX_TOOL_ITERATIONS) {
      console.log(style.warn(`  (Stopped after ${MAX_TOOL_ITERATIONS} tool iterations)`));
    }
  }
}
