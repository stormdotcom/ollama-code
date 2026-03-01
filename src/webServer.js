/**
 * Web server for LAN session control.
 * Can run standalone (--serve) or embedded alongside the CLI (default).
 * Serves a mobile-responsive chat UI and streams agent progress via HTTP.
 * Access from any device on your LAN: http://<host-ip>:3141?token=<auth-token>
 */
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cwd } from 'process';
import { randomBytes } from 'crypto';
import { SERVE_HOST, SERVE_PORT } from './constants.js';
import { checkOllamaRunning, isModelAvailable, listModels } from './preflight.js';
import { buildSystemPrompt, DEFAULT_MODEL } from './constants.js';
import { streamChat } from './ollamaClient.js';
import { parseToolCalls } from './tools/xmlParser.js';
import { executeToolCall } from './tools/executors.js';
import { loadSession, listSessions, saveSession, autoSave, tryConnect as trySessionConnect, isConnected as isSessionConnected, generateSessionId } from './sessionStore.js';
import { loadSettings } from './settings.js';
import { tryConnectChroma, isChromaConnected, searchRelevant } from './ragIndex.js';
import { scanProjectTree } from './projectScanner.js';
import { getGitContext, formatGitContextForPrompt } from './gitContext.js';
import { isUncensoredModel, setUnleashedMode, isUnleashedMode, setServeMode } from './security.js';
import { autoPrune, estimateMessagesTokens } from './contextManager.js';
import { c } from './splash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_TOOL_ITERATIONS = 10;

function emit(res, type, data) {
  res.write(JSON.stringify({ type, ...data }) + '\n');
}

// ── Shared HTTP server factory ──────────────────────────────────────────────

function createHttpServer({ workDir, systemPrompt, currentModel, fileCount, ragEnabled, authToken }) {
  const htmlPath = join(__dirname, '..', 'public', 'index.html');
  let html = existsSync(htmlPath)
    ? readFileSync(htmlPath, 'utf8')
    : '<!DOCTYPE html><html><body><h1>Ollama Code</h1><p>public/index.html not found</p></body></html>';

  if (authToken) {
    html = html.replace(
      "const API = '';",
      `const API = '';\n    const AUTH_TOKEN = '${authToken}';`
    );
    html = html.replace(
      /fetch\(API \+/g,
      "fetch(API +"
    );
  }

  function checkAuth(req, url) {
    if (!authToken) return true;
    const queryToken = url.searchParams.get('token');
    const headerToken = req.headers['x-auth-token'];
    return queryToken === authToken || headerToken === authToken;
  }

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === '/' || path === '/index.html') {
      if (authToken && !checkAuth(req, url)) {
        res.writeHead(401, { 'Content-Type': 'text/html' });
        res.end('<h2>Access denied</h2><p>Append <code>?token=YOUR_TOKEN</code> to the URL. Check the terminal for the token.</p>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    if (path.startsWith('/api/') && !checkAuth(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized. Include token as X-Auth-Token header or ?token= query param.' }));
      return;
    }

    if (path === '/api/sessions' && req.method === 'GET') {
      if (!isSessionConnected()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sessions: [] }));
        return;
      }
      const sessions = await listSessions(20);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)\/?$/);
    if (sessionMatch && req.method === 'GET') {
      const sessionId = sessionMatch[1];
      if (!isSessionConnected()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Sessions not available' }));
        return;
      }
      const session = await loadSession(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(session));
      return;
    }

    const messageMatch = path.match(/^\/api\/sessions\/([^/]+)\/message$/);
    if (messageMatch && req.method === 'POST') {
      const sessionId = messageMatch[1];
      let body = '';
      for await (const chunk of req) body += chunk;
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const userInput = (parsed.message || '').trim();
      if (!userInput) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message required' }));
        return;
      }

      let session = await loadSession(sessionId);
      let messages = session?.messages?.map((m) => ({ role: m.role, content: m.content })) || [
        { role: 'system', content: systemPrompt },
      ];
      let model = parsed.model || session?.model || currentModel;

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const send = (type, data) => emit(res, type, data);

      if (ragEnabled) {
        try {
          const ragResults = await searchRelevant(workDir, userInput, 5);
          if (ragResults.length > 0) {
            const ragContext = ragResults
              .map((r) => `--- ${r.filePath} (lines ${r.startLine}-${r.endLine}) ---\n${r.text}`)
              .join('\n\n');
            messages.push({
              role: 'user',
              content: `[Relevant code from your project]\n${ragContext}`,
            });
          }
        } catch { /* ignore */ }
      }

      messages.push({ role: 'user', content: userInput });

      const pruneResult = autoPrune(messages);
      if (pruneResult.pruned) {
        messages = pruneResult.messages;
        send('progress', { step: 0, label: `Context pruned (${pruneResult.prunedCount} messages removed)` });
      }

      let iteration = 0;
      let stepNum = 0;
      const turnStart = Date.now();

      while (iteration < MAX_TOOL_ITERATIONS) {
        iteration++;
        stepNum++;
        send('progress', { step: stepNum, label: 'Thinking...', elapsed: 0 });

        let turnContent = '';
        const abortController = new AbortController();

        const onToken = (token) => send('token', { text: token });

        try {
          turnContent = await streamChat(model, messages, onToken, { signal: abortController.signal });
        } catch (err) {
          send('error', { message: err.message || String(err) });
          res.end();
          return;
        }

        send('progress', { step: stepNum, label: 'Thinking', elapsed: (Date.now() - turnStart) / 1000 });
        messages.push({ role: 'assistant', content: turnContent });

        const toolCalls = parseToolCalls(turnContent);
        if (toolCalls.length === 0) break;

        const results = [];
        for (const call of toolCalls) {
          stepNum++;
          const detail = (call.innerText.split('\n')[0] || '').trim().slice(0, 80);
          send('progress', { step: stepNum, label: call.tag, detail });
          const result = await executeToolCall(workDir, call);
          results.push(result);
          send('tool', { step: stepNum, tool: call.tag, detail, result: result.split('\n')[0] });
        }
        messages.push({
          role: 'user',
          content: `[Tool results]\n${results.join('\n---\n')}`,
        });
      }

      const elapsed = (Date.now() - turnStart) / 1000;
      send('done', { steps: stepNum, elapsed, contextTokens: estimateMessagesTokens(messages) });
      send('messages', { messages });

      await autoSave(sessionId, messages, model, {
        cwd: workDir,
        unleashed: isUnleashedMode(),
        fileCount,
      });

      res.end();
      return;
    }

    if (path === '/api/models' && req.method === 'GET') {
      const models = await listModels();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models, current: currentModel }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

// ── Embedded server (runs alongside CLI) ────────────────────────────────────

let embeddedServer = null;
let embeddedToken = null;

/**
 * Start the web server in the background alongside the CLI.
 * Returns { token, port, url } or null if it fails.
 */
export function startEmbeddedServer({ workDir, systemPrompt, currentModel, fileCount, ragEnabled, noAuth = false }) {
  if (embeddedServer) return getEmbeddedInfo(); // already running

  const authToken = noAuth ? null : randomBytes(16).toString('hex');
  embeddedToken = authToken;

  const server = createHttpServer({ workDir, systemPrompt, currentModel, fileCount, ragEnabled, authToken });

  return new Promise((resolve) => {
    server.on('error', (err) => {
      // Port in use or other error — silently fail, CLI continues fine
      embeddedServer = null;
      resolve(null);
    });

    server.listen(SERVE_PORT, SERVE_HOST, () => {
      embeddedServer = server;
      // Prevent the server from keeping Node alive when CLI exits
      server.unref();
      resolve(getEmbeddedInfo());
    });
  });
}

/**
 * Stop the embedded web server.
 */
export function stopEmbeddedServer() {
  if (!embeddedServer) return false;
  embeddedServer.close();
  embeddedServer = null;
  embeddedToken = null;
  return true;
}

/**
 * Check if the embedded server is running.
 */
export function isEmbeddedServerRunning() {
  return !!embeddedServer;
}

/**
 * Get info about the running embedded server.
 */
export function getEmbeddedInfo() {
  if (!embeddedServer) return null;
  const addr = embeddedServer.address();
  if (!addr) return null;
  const port = addr.port;
  let lanIp = '127.0.0.1';
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          lanIp = net.address;
          break;
        }
      }
      if (lanIp !== '127.0.0.1') break;
    }
  } catch { /* ignore */ }
  const tokenParam = embeddedToken ? `?token=${embeddedToken}` : '';
  return {
    token: embeddedToken,
    port,
    lanIp,
    url: `http://${lanIp}:${port}${tokenParam}`,
    localUrl: `http://localhost:${port}${tokenParam}`,
  };
}

// ── Standalone serve mode (--serve flag) ────────────────────────────────────

function parseStandaloneArgs(argv) {
  const args = { model: DEFAULT_MODEL, port: SERVE_PORT, host: SERVE_HOST, noAuth: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) args.port = parseInt(argv[++i], 10);
    if (argv[i] === '--host' && argv[i + 1]) args.host = argv[++i];
    if (argv[i] === '--model' && argv[i + 1]) args.model = argv[++i];
    if (argv[i] === '--no-auth') args.noAuth = true;
  }
  return args;
}

export async function runServe(argv) {
  const args = parseStandaloneArgs(argv);
  setServeMode(true);

  const authToken = args.noAuth ? null : randomBytes(16).toString('hex');

  const workDir = cwd();
  const preflight = await checkOllamaRunning();
  if (!preflight.ok) {
    console.error('Ollama is not running. Start it first.');
    process.exit(1);
  }

  let currentModel = args.model;
  if (preflight.models?.length && !isModelAvailable(currentModel, preflight.models)) {
    currentModel = preflight.models[0];
  }

  if (isUncensoredModel(currentModel)) setUnleashedMode(true);

  const settings = loadSettings(workDir);
  const fileTree = scanProjectTree(workDir);
  const fileCount = fileTree.split('\n').filter((l) => l.trim()).length;
  const gitContext = await getGitContext();
  const gitInfo = formatGitContextForPrompt(gitContext);
  const systemPrompt = buildSystemPrompt({ cwd: workDir, fileTree, gitInfo, unleashed: isUnleashedMode() });

  await trySessionConnect(workDir);
  tryConnectChroma();
  const ragEnabled = isChromaConnected();

  const server = createHttpServer({ workDir, systemPrompt, currentModel, fileCount, ragEnabled, authToken });

  server.listen(args.port, args.host, () => {
    const addr = server.address();
    const port = addr.port;
    const lanIps = [];
    try {
      const nets = networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            lanIps.push(net.address);
          }
        }
      }
    } catch { /* ignore */ }
    const uniqueIps = [...new Set(lanIps)];
    const tokenParam = authToken ? `?token=${authToken}` : '';

    console.log('');
    console.log(`  Ollama Code — LAN Web UI`);
    console.log(`  ─────────────────────────`);
    console.log(`  Local:   http://localhost:${port}${tokenParam}`);
    if (uniqueIps.length > 0) {
      uniqueIps.forEach((ip) => console.log(`  LAN:     http://${ip}:${port}${tokenParam}`));
    } else {
      console.log(`  LAN:     http://<your-ip>:${port}${tokenParam}`);
    }
    console.log(`  Model:   ${currentModel}`);
    console.log(`  CWD:     ${workDir}`);
    if (authToken) {
      console.log(`  Auth:    Token-based (use URL above or pass X-Auth-Token header)`);
      console.log(`  Token:   ${authToken}`);
    } else {
      console.log(`  Auth:    DISABLED (--no-auth). Anyone on LAN can access.`);
    }
    console.log('');
    console.log(`  Open from phone/tablet on same Wi-Fi using LAN URL above`);
    console.log('');
  });
}
