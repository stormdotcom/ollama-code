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
import { tryConnect as tryMongoConnect, isConnected as isMongoConnected, generateSessionId, autoSave, saveSession, loadSession, listSessions, deleteSession, disconnect as mongoDisconnect } from './sessionStore.js';
import { tryConnectChroma, isChromaConnected, indexProject, searchRelevant } from './ragIndex.js';
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
  const args = { model: DEFAULT_MODEL, version: false, unleashed: false, compact: false, resume: null, noSessions: false, noRag: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version' || argv[i] === '-v') args.version = true;
    if (argv[i] === '--model' && argv[i + 1]) args.model = argv[++i];
    if (argv[i] === '--unleashed' || argv[i] === '--uncensored') args.unleashed = true;
    if (argv[i] === '--compact') args.compact = true;
    if (argv[i] === '--resume' && argv[i + 1]) args.resume = argv[++i];
    if (argv[i] === '--no-sessions') args.noSessions = true;
    if (argv[i] === '--no-rag') args.noRag = true;
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

  const workDir = cwd();

  // ── Parallel init: settings + scan (sync) + git + mongo + chroma (async) ──
  spinnerStart('Initializing...', c.cyan);
  const settings = loadSettings(workDir);
  const fileTree = scanProjectTree(workDir);
  const fileCount = fileTree.split('\n').filter((l) => l.trim()).length;

  const initTasks = [getGitContext()];
  if (!args.noSessions) initTasks.push(tryMongoConnect());
  if (!args.noRag) initTasks.push(tryConnectChroma());
  const results = await Promise.all(initTasks);
  const gitContext = results[0];
  const mongoOk = args.noSessions ? false : !!results[1];
  const chromaOk = args.noRag ? false : !!(args.noSessions ? results[1] : results[2]);

  const allowRules = settings.permissions?.allow || [];
  const denyRules = settings.permissions?.deny || [];
  const ruleCount = allowRules.length + denyRules.length;
  const gitInfo = formatGitContextForPrompt(gitContext);

  spinnerStop(
    `${c.green}✓${c.reset} Ready: ${c.bold}${fileCount}${c.reset} files` +
    (ruleCount > 0 ? `, ${ruleCount} rule(s)` : '') +
    (gitInfo ? ', git' : '') +
    (mongoOk ? ', sessions' : '') +
    (chromaOk ? ', RAG' : '')
  );

  let ragEnabled = chromaOk;

  const systemPrompt = buildSystemPrompt({ cwd: workDir, fileTree, gitInfo, unleashed: isUnleashedMode() });

  let sessionId = generateSessionId();
  let messages = [];
  function resetMessages() {
    messages = [{ role: 'system', content: systemPrompt }];
  }

  // ── Resume session or start fresh ──────────────────────────────────
  if (args.resume && mongoOk) {
    spinnerStart('Resuming session...', c.cyan);
    const session = await loadSession(args.resume);
    if (session) {
      messages = session.messages.map((m) => ({ role: m.role, content: m.content }));
      sessionId = session.sessionId;
      currentModel = session.model || currentModel;
      spinnerStop(`${c.green}✓${c.reset} Resumed session ${c.bold}${session.name || sessionId.slice(0, 8)}${c.reset} (${session.messages.length} messages)`);
    } else {
      spinnerStop(`${c.yellow}!${c.reset} Session not found, starting fresh`);
      resetMessages();
    }
  } else {
    resetMessages();
  }

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
  if (mongoOk) {
    console.log(`  ${c.cyan}Session${c.reset}  ${c.gray}${sessionId}${c.reset} ${c.gray}(use /session to copy, view from LAN via --serve)${c.reset}`);
    console.log('');
  }

  // ── Shortcuts info ──────────────────────────────────────────────────
  console.log(`  ${c.gray}Shortcuts: Ctrl+C interrupt, Ctrl+D exit, Ctrl+L clear screen${c.reset}`);
  console.log(`  ${c.gray}Type /shortcuts for all keyboard shortcuts${c.reset}`);
  console.log('');

  // ── REPL ──────────────────────────────────────────────────────────────
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  rl.on('close', async () => {
    console.log(style.info('\nGoodbye.'));
    await autoSave(sessionId, messages, currentModel, { cwd: workDir, unleashed: isUnleashedMode(), fileCount });
    await mongoDisconnect();
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

  let compactMode = args.compact;
  let jobRunning = false;
  const inputQueue = [];

  const seenCommandsThisTurn = new Set();

  async function runAgenticTurn(userInput) {
    seenCommandsThisTurn.clear();
    // RAG context injection
    if (ragEnabled && isChromaConnected()) {
      try {
        const ragResults = await searchRelevant(workDir, userInput, 5);
        if (ragResults.length > 0) {
          const ragContext = ragResults.map((r) =>
            `--- ${r.filePath} (lines ${r.startLine}-${r.endLine}) ---\n${r.text}`
          ).join('\n\n');
          messages.push({
            role: 'user',
            content: `[Relevant code from your project — use as context]\n${ragContext}`,
          });
          if (!compactMode) {
            console.log(`  ${c.cyan}RAG${c.reset} ${c.gray}injected ${ragResults.length} relevant code chunk(s)${c.reset}`);
          }
        }
      } catch { /* RAG is best-effort */ }
    }

    messages.push({ role: 'user', content: userInput });
    let iteration = 0;
    let stepNum = 0;
    const turnStart = Date.now();

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      stepNum++;

      let turnContent = '';
      let interrupted = false;
      let firstToken = true;
      const abortController = new AbortController();
      const writeOut = (s) => process.stdout.write(s);
      const formatter = compactMode ? null : createStreamFormatter(writeOut);

      spinnerStart(compactMode ? `Step ${stepNum}  Thinking...` : 'Thinking...', c.magenta);

      const interruptHandler = () => {
        interrupted = true;
        abortController.abort();
        spinnerStop();
        process.stdout.write(`\n${c.yellow}  ⏹ Generation interrupted (Ctrl+C)${c.reset}\n`);
      };
      process.once('SIGINT', interruptHandler);

      const onToken = (token) => {
        if (compactMode) return;
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
          return;
        }
        console.log('\n' + style.error('Error: ' + (err.message || err)));
        messages.pop();
        process.removeListener('SIGINT', interruptHandler);
        return;
      }
      process.removeListener('SIGINT', interruptHandler);

      if (interrupted) {
        if (turnContent) {
          messages.push({ role: 'assistant', content: turnContent + '\n[interrupted by user]' });
        }
        return;
      }

      if (compactMode) {
        spinnerStop(`${c.cyan}Step ${stepNum}${c.reset}  ${c.gray}Thinking${c.reset}`);
      } else {
        formatter.flush();
        process.stdout.write(c.reset + '\n');
      }
      messages.push({ role: 'assistant', content: turnContent });

      const toolCalls = parseToolCalls(turnContent);
      if (toolCalls.length === 0) break;

      if (!compactMode) {
        console.log(`${c.gray}  ── executing ${toolCalls.length} tool(s) ──${c.reset}`);
      }

      const results = [];
      const seenToolCalls = new Map();
      for (const call of toolCalls) {
        stepNum++;
        const detail = (call.innerText.split('\n')[0] || '').trim().slice(0, 60);
        const callKey = `${call.tag}:${call.innerText.trim()}`;
        let result;
        if (call.tag === 'execute_command' && seenCommandsThisTurn.has(callKey)) {
          result = `[execute_command] (skipped — already ran this turn)\n${call.innerText.trim()}`;
          if (!compactMode) console.log(`  ${c.gray}  (skipped — already ran this turn)${c.reset}`);
        } else if (seenToolCalls.has(callKey)) {
          result = seenToolCalls.get(callKey);
          if (!compactMode) console.log(`  ${c.gray}  (reused — duplicate in same batch)${c.reset}`);
        } else {
          spinnerForTool(call.tag, compactMode ? `Step ${stepNum}  ${detail}` : detail);
          result = await executeToolCall(workDir, call);
          seenToolCalls.set(callKey, result);
          if (call.tag === 'execute_command') seenCommandsThisTurn.add(callKey);
        }
        const toolLabel = call.tag.replace(/_/g, ' ');
        spinnerStop(compactMode
          ? `${c.cyan}Step ${stepNum}${c.reset}  ${c.gray}${toolLabel}: ${detail.slice(0, 50)}${c.reset}`
          : `${c.cyan}${c.bold}[${call.tag}]${c.reset} ${c.gray}${detail}${c.reset}`);
        if (!compactMode) {
          console.log(style.toolResult('  ' + result.split('\n')[0]));
          if (result.split('\n').length > 1) {
            const extra = result.split('\n').slice(1).join('\n');
            if (extra.length < 500) console.log(c.gray + extra + c.reset);
            else console.log(c.gray + extra.slice(0, 500) + '...' + c.reset);
          }
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

    if (compactMode) {
      const elapsed = ((Date.now() - turnStart) / 1000).toFixed(1);
      console.log(`  ${c.green}Done${c.reset}    ${c.gray}${stepNum} step(s) completed${c.reset} ${c.gray}${elapsed}s${c.reset}\n`);
    }

    void autoSave(sessionId, messages, currentModel, {
      cwd: workDir,
      unleashed: isUnleashedMode(),
      fileCount,
    }).catch(() => {});
  }

  function processQueue() {
    jobRunning = false;
    if (inputQueue.length === 0) return;
    const next = inputQueue.shift();
    console.log(`  ${c.cyan}Running queued: ${next.slice(0, 60)}${next.length > 60 ? '...' : ''}${c.reset}\n`);
    jobRunning = true;
    runAgenticTurn(next).then(processQueue).catch((err) => {
      console.error(style.error('Queued task failed: ' + (err && err.message)));
      processQueue();
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

        case '/compact':
          compactMode = !compactMode;
          console.log(compactMode
            ? `  ${c.cyan}Compact mode ON${c.reset} ${c.gray}— model output hidden, showing progress steps only${c.reset}`
            : `  ${c.cyan}Compact mode OFF${c.reset} ${c.gray}— full model output visible${c.reset}`);
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

        case '/session':
          if (!isMongoConnected()) {
            console.log(style.warn('  MongoDB not connected. Sessions disabled.'));
          } else {
            console.log(`  ${c.cyan}Session ID${c.reset}  ${c.bold}${sessionId}${c.reset}`);
            console.log(`  ${c.gray}Use this ID to resume from another device. Run with --serve to view chat from LAN.${c.reset}`);
          }
          continue;

        case '/save': {
          if (!isMongoConnected()) {
            console.log(style.warn('  MongoDB not connected. Sessions disabled.'));
            continue;
          }
          const name = cmdArg || null;
          spinnerStart('Saving session...', c.cyan);
          await saveSession(sessionId, { name, model: currentModel, messages, metadata: { cwd: workDir, unleashed: isUnleashedMode(), fileCount } });
          spinnerStop(`${c.green}✓${c.reset} Session saved ${name ? `as "${name}"` : `(${sessionId.slice(0, 8)})`}`);
          continue;
        }

        case '/sessions': {
          if (!isMongoConnected()) {
            console.log(style.warn('  MongoDB not connected. Sessions disabled.'));
            continue;
          }
          spinnerStart('Loading sessions...', c.cyan);
          const sessions = await listSessions(20);
          spinnerStop();
          if (sessions.length === 0) {
            console.log(style.info('  No saved sessions.'));
          } else {
            console.log('');
            console.log(`  ${c.magenta}${c.bold}Saved Sessions${c.reset}`);
            sessions.forEach((s, i) => {
              const num = `${i + 1}.`;
              const label = s.name || s.sessionId.slice(0, 8);
              const date = s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '?';
              const active = s.sessionId === sessionId ? ` ${c.green}← current${c.reset}` : '';
              console.log(`  ${c.cyan}${num.padEnd(3)}${c.reset} ${c.white}${label}${c.reset} ${c.gray}(${s.model}, ${date})${c.reset}${active}`);
            });
            console.log('');
            console.log(`  ${c.gray}Use /resume <number> to load a session${c.reset}`);
            console.log('');
          }
          continue;
        }

        case '/resume': {
          if (!isMongoConnected()) {
            console.log(style.warn('  MongoDB not connected. Sessions disabled.'));
            continue;
          }
          if (!cmdArg) {
            console.log(`  ${c.gray}Usage: /resume <number|name|id>${c.reset}`);
            continue;
          }
          spinnerStart('Loading session...', c.cyan);
          const idx = parseInt(cmdArg, 10);
          let session = null;
          if (Number.isInteger(idx) && idx >= 1) {
            const all = await listSessions(20);
            if (idx <= all.length) {
              session = await loadSession(all[idx - 1].sessionId);
            }
          }
          if (!session) {
            session = await loadSession(cmdArg);
          }
          if (session) {
            messages = session.messages.map((m) => ({ role: m.role, content: m.content }));
            sessionId = session.sessionId;
            currentModel = session.model || currentModel;
            spinnerStop(`${c.green}✓${c.reset} Resumed ${c.bold}${session.name || sessionId.slice(0, 8)}${c.reset} (${session.messages.length} messages, model: ${currentModel})`);
          } else {
            spinnerStop(`${c.yellow}!${c.reset} Session not found`);
          }
          continue;
        }

        case '/delete-session': {
          if (!isMongoConnected()) {
            console.log(style.warn('  MongoDB not connected. Sessions disabled.'));
            continue;
          }
          if (!cmdArg) {
            console.log(`  ${c.gray}Usage: /delete-session <number|id>${c.reset}`);
            continue;
          }
          const delIdx = parseInt(cmdArg, 10);
          let delId = cmdArg;
          if (Number.isInteger(delIdx) && delIdx >= 1) {
            const all = await listSessions(20);
            if (delIdx <= all.length) delId = all[delIdx - 1].sessionId;
          }
          const deleted = await deleteSession(delId);
          console.log(deleted
            ? style.success(`  Session deleted.`)
            : style.warn(`  Session not found.`));
          continue;
        }

        case '/index': {
          if (!isChromaConnected()) {
            console.log(style.warn('  ChromaDB not connected. Run: chroma run'));
            continue;
          }
          spinnerStart('Indexing project into ChromaDB...', c.cyan);
          try {
            const result = await indexProject(workDir, (done, total, file) => {
              if (file !== 'done') spinnerUpdate(`Indexing ${done + 1}/${total}: ${file}`);
            });
            spinnerStop(`${c.green}✓${c.reset} Indexed ${c.bold}${result.files}${c.reset} file(s), ${c.bold}${result.chunks}${c.reset} chunk(s) into ChromaDB`);
          } catch (err) {
            spinnerStop(`${c.red}✗${c.reset} Indexing failed`);
            console.log(style.error('  ' + (err.message || err)));
          }
          continue;
        }

        case '/search': {
          if (!isChromaConnected()) {
            console.log(style.warn('  ChromaDB not connected. Run: chroma run'));
            continue;
          }
          if (!cmdArg) {
            console.log(`  ${c.gray}Usage: /search <query>  — semantic search your codebase${c.reset}`);
            continue;
          }
          spinnerStart('Searching codebase...', c.cyan);
          try {
            const results = await searchRelevant(workDir, cmdArg, 5);
            spinnerStop();
            if (results.length === 0) {
              console.log(style.info('  No results found.'));
            } else {
              console.log('');
              console.log(`  ${c.magenta}${c.bold}Search Results${c.reset} ${c.gray}for "${cmdArg}"${c.reset}`);
              results.forEach((r, i) => {
                console.log(`  ${c.cyan}${i + 1}.${c.reset} ${c.white}${r.filePath}${c.reset} ${c.gray}(lines ${r.startLine}-${r.endLine}, dist: ${r.distance.toFixed(3)})${c.reset}`);
                const preview = r.text.split('\n').slice(0, 3).join('\n    ');
                console.log(`    ${c.gray}${preview}${c.reset}`);
              });
              console.log('');
            }
          } catch (err) {
            spinnerStop(`${c.red}✗${c.reset} Search failed`);
            console.log(style.error('  ' + (err.message || err)));
          }
          continue;
        }

        case '/rag':
          if (!isChromaConnected()) {
            console.log(style.warn('  ChromaDB not connected. Run: chroma run'));
            continue;
          }
          ragEnabled = !ragEnabled;
          console.log(ragEnabled
            ? `  ${c.cyan}RAG ON${c.reset} ${c.gray}— relevant code chunks injected before each prompt${c.reset}`
            : `  ${c.cyan}RAG OFF${c.reset} ${c.gray}— no automatic context injection${c.reset}`);
          continue;

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

    // ── Queue or run agentic turn ─────────────────────────────────────
    if (jobRunning) {
      inputQueue.push(trimmed);
      console.log(`  ${c.gray}Queued (${inputQueue.length}). Current task still running. Type another or wait.${c.reset}\n`);
      continue;
    }

    jobRunning = true;
    runAgenticTurn(trimmed).then(processQueue).catch((err) => {
      console.error(style.error('Task failed: ' + (err && err.message)));
      processQueue();
    });
  }
}
