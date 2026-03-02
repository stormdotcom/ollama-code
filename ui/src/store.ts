import { writable, get } from 'svelte/store';

// Globals injected by backend
declare const API: string;
declare const AUTH_TOKEN: string | undefined;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Session {
  sessionId: string;
  name: string;
  model: string;
  updatedAt: string;
}

export interface UIState {
  connected: boolean;
  messages: ChatMessage[];
  sessions: Session[];
  currentSessionId: string | null;
  qrCodeUrl: string | null;
}

export const uiState = writable<UIState>({
  connected: false,
  messages: [],
  sessions: [],
  currentSessionId: null,
  qrCodeUrl: null
});

let socket: EventSource | null = null;

function getAuthHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof AUTH_TOKEN !== 'undefined' && AUTH_TOKEN) {
    headers['X-Auth-Token'] = AUTH_TOKEN;
  }
  return headers;
}

export async function fetchSessions() {
  try {
    const url = new URL('/api/sessions', window.location.origin);
    if (typeof AUTH_TOKEN !== 'undefined') url.searchParams.set('token', AUTH_TOKEN);
    const res = await fetch(url.toString(), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      uiState.update(s => ({ ...s, sessions: data.sessions || [] }));
    }
  } catch (err) {
    console.error("Failed to fetch sessions", err);
  }
}

export async function loadSession(sessionId: string) {
  try {
    const url = new URL(`/api/sessions/${sessionId}`, window.location.origin);
    if (typeof AUTH_TOKEN !== 'undefined') url.searchParams.set('token', AUTH_TOKEN);
    const res = await fetch(url.toString(), { headers: getAuthHeaders() });
    if (res.ok) {
      const session = await res.json();
      uiState.update(s => ({ 
        ...s, 
        currentSessionId: sessionId,
        messages: session.messages || [] 
      }));
      connectSSE(sessionId);
    }
  } catch (err) {
    console.error("Failed to load session", err);
  }
}

export async function deleteSession(sessionId: string) {
  try {
    const url = new URL(`/api/sessions/${sessionId}`, window.location.origin);
    if (typeof AUTH_TOKEN !== 'undefined') url.searchParams.set('token', AUTH_TOKEN);
    const res = await fetch(url.toString(), { 
      method: 'DELETE',
      headers: getAuthHeaders() 
    });
    if (res.ok) {
      uiState.update(s => {
        const remaining = s.sessions.filter(sesh => sesh.sessionId !== sessionId);
        return { 
          ...s, 
          sessions: remaining,
          currentSessionId: s.currentSessionId === sessionId ? null : s.currentSessionId,
          messages: s.currentSessionId === sessionId ? [] : s.messages
        };
      });
      if (get(uiState).currentSessionId === null && socket) {
        socket.close();
        socket = null;
        uiState.update(s => ({ ...s, connected: false }));
      }
    }
  } catch (err) {
    console.error("Failed to delete session", err);
  }
}

export function connectSSE(sessionId: string) {
  if (socket) {
    socket.close();
  }
  
  const url = new URL(`/api/sessions/${sessionId}/events`, window.location.origin);
  if (typeof AUTH_TOKEN !== 'undefined') url.searchParams.set('token', AUTH_TOKEN);
  
  socket = new EventSource(url.toString());
  
  socket.onopen = () => {
    uiState.update(s => ({ ...s, connected: true }));
  };
  
  socket.addEventListener('update', (event) => {
    try {
      const session = JSON.parse(event.data);
      uiState.update(s => ({ 
        ...s, 
        messages: session.messages || []
      }));
    } catch (e) {
      console.error(e);
    }
  });

  socket.onerror = (err) => {
    console.error("SSE error:", err);
    uiState.update(s => ({ ...s, connected: false }));
  };
}

export function sendMessage(text: string) {
  const state = get(uiState);
  if (!state.currentSessionId) return;

  const url = new URL(`/api/sessions/${state.currentSessionId}/message`, window.location.origin);
  if (typeof AUTH_TOKEN !== 'undefined') url.searchParams.set('token', AUTH_TOKEN);

  // Add empty assistant message to show thinking state locally
  uiState.update(s => ({
    ...s,
    messages: [...s.messages, { role: 'user', content: text }, { role: 'assistant', content: '...' }]
  }));

  fetch(url.toString(), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message: text })
  }).then(async res => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'token') {
               assistantText += data.text;
               uiState.update(s => {
                  const newMsgs = [...s.messages];
                  newMsgs[newMsgs.length - 1] = { role: 'assistant', content: assistantText };
                  return { ...s, messages: newMsgs };
               });
            } else if (data.type === 'messages') {
               uiState.update(s => ({ ...s, messages: data.messages }));
            }
          } catch (e) {}
        }
      }
  }).catch(err => console.error(err));
}
