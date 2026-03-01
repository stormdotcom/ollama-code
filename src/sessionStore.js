import { MONGODB_URL, MONGODB_DB } from './constants.js';
import { randomUUID } from 'crypto';

let client = null;
let db = null;
let collection = null;
let connected = false;

export async function tryConnect() {
  if (connected) return true;
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
    connected = true;
    return true;
  } catch {
    client = null;
    db = null;
    collection = null;
    connected = false;
    return false;
  }
}

export function isConnected() {
  return connected;
}

export function generateSessionId() {
  return randomUUID();
}

export async function saveSession(sessionId, { name, model, messages, metadata }) {
  if (!connected) return null;
  const now = new Date();
  const doc = {
    sessionId,
    name: name || null,
    model,
    updatedAt: now,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || now.toISOString(),
    })),
    metadata: metadata || {},
  };
  const result = await collection.updateOne(
    { sessionId },
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  return result;
}

export async function loadSession(sessionId) {
  if (!connected) return null;
  return collection.findOne({ sessionId });
}

export async function listSessions(limit = 20) {
  if (!connected) return [];
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

export async function getSessionMessageCount(sessionId) {
  if (!connected) return 0;
  const doc = await collection.findOne({ sessionId }, { projection: { messages: 1 } });
  return doc?.messages?.length || 0;
}

export async function deleteSession(sessionId) {
  if (!connected) return false;
  const result = await collection.deleteOne({ sessionId });
  return result.deletedCount > 0;
}

export async function autoSave(sessionId, messages, model, metadata) {
  if (!connected) return;
  try {
    await saveSession(sessionId, { model, messages, metadata });
  } catch {
    // silent — auto-save is best-effort
  }
}

export async function disconnect() {
  if (client) {
    try { await client.close(); } catch { /* ignore */ }
    client = null;
    db = null;
    collection = null;
    connected = false;
  }
}
