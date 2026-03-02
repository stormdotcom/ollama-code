import { CONFIG_DIR } from './constants.js';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

// ── File-based session storage ───────────────────────────────────────────────
let backend = 'none'; // 'file' | 'none'
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

// ── Connect: initialize file-based session directory ─────────────────────────
export async function tryConnect(cwd) {
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
  if (backend === 'none' || !fileSessionDir) return null;
  const now = new Date();
  const filePath = join(fileSessionDir, `${sessionId}.json`);
  const existing = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : {};
  const doc = {
    sessionId,
    name: name || null,
    model,
    createdAt: existing.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || now.toISOString(),
    })),
    metadata: metadata || {},
  };
  writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf8');
  return doc;
}

// ── Load ─────────────────────────────────────────────────────────────────────
export async function loadSession(sessionId) {
  if (backend === 'none' || !fileSessionDir) return null;
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
  if (backend === 'none' || !fileSessionDir) return [];
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

// ── Delete ───────────────────────────────────────────────────────────────────
export async function deleteSession(sessionId) {
  if (backend === 'none' || !fileSessionDir) return false;
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
  backend = 'none';
  fileSessionDir = null;
}
