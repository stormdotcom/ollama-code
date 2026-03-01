import { MONGODB_URL, MONGODB_DB, CONFIG_DIR } from './constants.js';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

// ── Backend selection ────────────────────────────────────────────────────────
let backend = 'none'; // 'mongo' | 'file' | 'none'
let client = null;
let db = null;
let collection = null;

// File-based session directory (set when file backend is used)
let fileSessionDir = null;

export function isConnected() {
  return backend !== 'none';
}

export function getBackendType() {
  return backend;
}

export function generateSessionId() {
  return randomUUID();
}

// ── Connect: try MongoDB first, fall back to file-based ──────────────────────
export async function tryConnect(cwd) {
  // Try MongoDB first
  try {
    const { MongoClient } = await import('mongodb');
    client = new MongoClient(MONGODB_URL, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    await client.connect();
    db = client.db(MONGODB_DB);
    collection = db.collection('sessions');
    await collection.createIndex({ sessionId: 1 }, { unique: true });
    await collection.createIndex({ updatedAt: -1 });
    backend = 'mongo';
    return 'mongo';
  } catch {
    client = null;
    db = null;
    collection = null;
  }

  // Fall back to file-based sessions
  try {
    const dir = cwd ? join(cwd, CONFIG_DIR, 'sessions') : null;
    if (dir) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      fileSessionDir = dir;
      backend = 'file';
      return 'file';
    }
  } catch { /* ignore */ }

  backend = 'none';
  return 'none';
}

// ── Save ─────────────────────────────────────────────────────────────────────
export async function saveSession(sessionId, { name, model, messages, metadata }) {
  if (backend === 'none') return null;
  const now = new Date();
  const doc = {
    sessionId,
    name: name || null,
    model,
    updatedAt: now.toISOString(),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || now.toISOString(),
    })),
    metadata: metadata || {},
  };

  if (backend === 'mongo') {
    return collection.updateOne(
      { sessionId },
      { $set: doc, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
  }

  // File backend
  if (!fileSessionDir) return null;
  const filePath = join(fileSessionDir, `${sessionId}.json`);
  const existing = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : {};
  doc.createdAt = existing.createdAt || now.toISOString();
  writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf8');
  return doc;
}

// ── Load ─────────────────────────────────────────────────────────────────────
export async function loadSession(sessionId) {
  if (backend === 'none') return null;

  if (backend === 'mongo') {
    return collection.findOne({ sessionId });
  }

  // File backend — search by ID or by name
  if (!fileSessionDir) return null;
  const directPath = join(fileSessionDir, `${sessionId}.json`);
  if (existsSync(directPath)) {
    return JSON.parse(readFileSync(directPath, 'utf8'));
  }
  // Search by name
  try {
    const files = readdirSync(fileSessionDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const doc = JSON.parse(readFileSync(join(fileSessionDir, f), 'utf8'));
      if (doc.name === sessionId || doc.sessionId === sessionId) return doc;
    }
  } catch { /* ignore */ }
  return null;
}

// ── List ─────────────────────────────────────────────────────────────────────
export async function listSessions(limit = 20) {
  if (backend === 'none') return [];

  if (backend === 'mongo') {
    const docs = await collection
      .find({}, { projection: { sessionId: 1, name: 1, model: 1, createdAt: 1, updatedAt: 1, metadata: 1 } })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => ({
      sessionId: d.sessionId,
      name: d.name,
      model: d.model,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      metadata: d.metadata,
    }));
  }

  // File backend
  if (!fileSessionDir) return [];
  try {
    const files = readdirSync(fileSessionDir).filter(f => f.endsWith('.json'));
    const sessions = files.map(f => {
      try {
        const doc = JSON.parse(readFileSync(join(fileSessionDir, f), 'utf8'));
        return {
          sessionId: doc.sessionId,
          name: doc.name,
          model: doc.model,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          metadata: doc.metadata,
        };
      } catch { return null; }
    }).filter(Boolean);
    sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return sessions.slice(0, limit);
  } catch { return []; }
}

// ── Count ────────────────────────────────────────────────────────────────────
export async function getSessionMessageCount(sessionId) {
  const session = await loadSession(sessionId);
  return session?.messages?.length || 0;
}

// ── Delete ───────────────────────────────────────────────────────────────────
export async function deleteSession(sessionId) {
  if (backend === 'none') return false;

  if (backend === 'mongo') {
    const result = await collection.deleteOne({ sessionId });
    return result.deletedCount > 0;
  }

  // File backend
  if (!fileSessionDir) return false;
  const filePath = join(fileSessionDir, `${sessionId}.json`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    return true;
  }
  return false;
}

// ── Auto-save ────────────────────────────────────────────────────────────────
export async function autoSave(sessionId, messages, model, metadata) {
  if (backend === 'none') return;
  try {
    await saveSession(sessionId, { model, messages, metadata });
  } catch {
    // silent — auto-save is best-effort
  }
}

// ── Disconnect ───────────────────────────────────────────────────────────────
export async function disconnect() {
  if (client) {
    try { await client.close(); } catch { /* ignore */ }
    client = null;
    db = null;
    collection = null;
  }
  backend = 'none';
  fileSessionDir = null;
}
