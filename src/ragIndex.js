import { CHROMADB_URL, EMBED_MODEL, OLLAMA_BASE_URL } from './constants.js';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

let chromaConnected = false;
let collectionName = null;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.next', 'dist', 'build',
  '.ollama-code', '.vscode', '.idea', 'coverage', 'vendor',
]);
const CODE_EXTS = /\.(js|ts|jsx|tsx|mjs|cjs|py|rb|go|rs|java|c|cpp|h|hpp|cs|json|yaml|yml|md|txt|html|css|scss|sh|ps1|bat|sql|xml|graphql|proto|vue|svelte|php|lua|dart|kt|scala|swift)$/i;
const MAX_FILE_SIZE = 100 * 1024; // 100 KB
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

async function chromaFetch(path, options = {}) {
  const url = `${CHROMADB_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  return res;
}

export async function tryConnectChroma() {
  try {
    const res = await chromaFetch('/api/v1/heartbeat', { method: 'GET' });
    if (res.ok) {
      chromaConnected = true;
      return true;
    }
    return false;
  } catch {
    chromaConnected = false;
    return false;
  }
}

export function isChromaConnected() {
  return chromaConnected;
}

function projectHash(cwd) {
  return createHash('md5').update(cwd).digest('hex').slice(0, 12);
}

function getCollectionName(cwd) {
  if (collectionName) return collectionName;
  const hash = projectHash(cwd);
  collectionName = `ollama-code-${hash}`;
  return collectionName;
}

async function getOrCreateCollection(cwd) {
  const name = getCollectionName(cwd);
  const res = await chromaFetch('/api/v1/collections', {
    method: 'POST',
    body: JSON.stringify({ name, get_or_create: true }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ChromaDB collection error: ${err}`);
  }
  return res.json();
}

export async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama embedding error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.embedding;
}

function chunkText(text, filePath) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentLen = 0;
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentChunk.push(line);
    currentLen += line.length + 1;

    if (currentLen >= CHUNK_SIZE) {
      chunks.push({
        text: currentChunk.join('\n'),
        filePath,
        startLine,
        endLine: i + 1,
      });
      const overlapLines = Math.min(currentChunk.length, Math.ceil(CHUNK_OVERLAP / 10));
      startLine = i + 2 - overlapLines;
      currentChunk = currentChunk.slice(-overlapLines);
      currentLen = currentChunk.join('\n').length;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n'),
      filePath,
      startLine,
      endLine: lines.length,
    });
  }

  return chunks;
}

function collectFiles(dir, cwd, maxDepth = 6) {
  const files = [];

  function walk(d, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.env.example') continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full, depth + 1);
      } else if (e.isFile() && CODE_EXTS.test(e.name)) {
        try {
          const stat = statSync(full);
          if (stat.size <= MAX_FILE_SIZE) {
            files.push({ path: full, rel: relative(cwd, full), size: stat.size });
          }
        } catch { /* skip */ }
      }
    }
  }

  walk(dir, 0);
  return files;
}

export async function indexProject(cwd, onProgress) {
  if (!chromaConnected) throw new Error('ChromaDB not connected');

  const col = await getOrCreateCollection(cwd);
  const colId = col.id;
  const files = collectFiles(cwd, cwd);
  let indexed = 0;
  let chunkCount = 0;

  for (const file of files) {
    if (onProgress) onProgress(indexed, files.length, file.rel);
    let content;
    try { content = readFileSync(file.path, 'utf8'); } catch { continue; }
    const chunks = chunkText(content, file.rel);

    if (chunks.length === 0) continue;

    const ids = chunks.map((ch, i) => `${file.rel}:${ch.startLine}-${ch.endLine}:${i}`);
    const docs = chunks.map((ch) => ch.text);
    const metadatas = chunks.map((ch) => ({
      filePath: ch.filePath,
      startLine: ch.startLine,
      endLine: ch.endLine,
    }));

    // Batch embeddings in parallel (up to 4 concurrent)
    const BATCH_SIZE = 4;
    const embeddings = new Array(docs.length).fill(null);
    for (let b = 0; b < docs.length; b += BATCH_SIZE) {
      const batch = docs.slice(b, b + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((doc) => getEmbedding(doc))
      );
      for (let j = 0; j < batchResults.length; j++) {
        if (batchResults[j].status === 'fulfilled') {
          embeddings[b + j] = batchResults[j].value;
        }
      }
    }

    const validIdx = embeddings.map((e, i) => (e ? i : -1)).filter((i) => i >= 0);
    if (validIdx.length === 0) { indexed++; continue; }

    const body = {
      ids: validIdx.map((i) => ids[i]),
      documents: validIdx.map((i) => docs[i]),
      embeddings: validIdx.map((i) => embeddings[i]),
      metadatas: validIdx.map((i) => metadatas[i]),
    };

    const res = await chromaFetch(`/api/v1/collections/${colId}/upsert`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ChromaDB upsert error: ${err}`);
    }

    chunkCount += validIdx.length;
    indexed++;
  }

  if (onProgress) onProgress(files.length, files.length, 'done');
  return { files: indexed, chunks: chunkCount };
}

export async function searchRelevant(cwd, query, topK = 5) {
  if (!chromaConnected) return [];

  const col = await getOrCreateCollection(cwd);
  const colId = col.id;

  let queryEmbedding;
  try {
    queryEmbedding = await getEmbedding(query);
  } catch {
    return [];
  }

  const res = await chromaFetch(`/api/v1/collections/${colId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      query_embeddings: [queryEmbedding],
      n_results: topK,
      include: ['documents', 'metadatas', 'distances'],
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const docs = data.documents?.[0] || [];
  const metas = data.metadatas?.[0] || [];
  const distances = data.distances?.[0] || [];

  return docs.map((doc, i) => ({
    text: doc,
    filePath: metas[i]?.filePath || 'unknown',
    startLine: metas[i]?.startLine || 0,
    endLine: metas[i]?.endLine || 0,
    distance: distances[i] || 0,
  }));
}
