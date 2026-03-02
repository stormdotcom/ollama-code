<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import {
    uiState,
    fetchSessions,
    loadSession,
    deleteSession,
    sendMessage,
  } from "./store";
  import QRCode from "qrcode";
  import { marked } from "marked";
  import DOMPurify from "dompurify";

  let inputMessage = "";
  let chatBox: HTMLElement;
  let showQr = false;
  let lanUrl = "";
  let sidebarOpen = false;

  onMount(async () => {
    await fetchSessions();
    if ($uiState.sessions.length > 0) {
      loadSession($uiState.sessions[0].sessionId);
    }

    // Fetch LAN URL from server so QR always points to the LAN address
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      const headers: Record<string, string> = {};
      if (token) headers["X-Auth-Token"] = token;
      const infoRes = await fetch("/api/info", { headers });
      if (infoRes.ok) {
        const info = await infoRes.json();
        lanUrl = info.lanUrl || window.location.href;
      } else {
        lanUrl = window.location.href;
      }
    } catch {
      lanUrl = window.location.href;
    }

    // Generate QR code using the LAN URL
    try {
      const url = await QRCode.toDataURL(lanUrl, {
        color: { dark: "#10b981", light: "#ffffff" },
        width: 250,
      });
      uiState.update((s) => ({ ...s, qrCodeUrl: url }));
    } catch (err) {
      console.error(err);
    }
  });

  afterUpdate(() => {
    if (chatBox) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  });

  function handleSend() {
    if (inputMessage.trim() && $uiState.currentSessionId) {
      sendMessage(inputMessage);
      inputMessage = "";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }
</script>

<main class="dashboard">
  <!-- Mobile sidebar overlay -->
  {#if sidebarOpen}
    <div class="sidebar-overlay" on:click={() => (sidebarOpen = false)} on:keydown={() => {}}></div>
  {/if}

  <!-- Left Sidebar (Sessions) -->
  <aside class="sidebar" class:open={sidebarOpen}
    <div class="brand">
      <div class="logo-icon">
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          stroke="currentColor"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M12 2L2 7l10 5 10-5-10-5zm0 22l-10-5V9l10 5 10-5v10l-10 5z"
          ></path></svg
        >
      </div>
      <h2>AI MATE</h2>
    </div>
    <p class="subtitle">Just Imagine...</p>

    <div class="sessions-list">
      {#each $uiState.sessions as session}
        <div
          class="session-item {$uiState.currentSessionId === session.sessionId
            ? 'active'
            : ''}"
        >
          <button
            class="session-btn"
            on:click={() => loadSession(session.sessionId)}
          >
            {session.name || "Untitled Session"}
            <span class="session-date"
              >{new Date(session.updatedAt).toLocaleDateString()}</span
            >
          </button>
          <button
            class="delete-btn"
            on:click={() => deleteSession(session.sessionId)}
            title="Delete Session"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="3 6 5 6 21 6"></polyline><path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              ></path></svg
            >
          </button>
        </div>
      {/each}
      {#if $uiState.sessions.length === 0}
        <div class="empty-sessions">No previous sessions</div>
      {/if}
    </div>

    <!-- QR Code toggle -->
    <div class="qr-section">
      <button class="qr-toggle" on:click={() => (showQr = !showQr)}>
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          stroke="currentColor"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><rect x="3" y="3" width="7" height="7"></rect><rect
            x="14"
            y="3"
            width="7"
            height="7"
          ></rect><rect x="14" y="14" width="7" height="7"></rect><rect
            x="3"
            y="14"
            width="7"
            height="7"
          ></rect></svg
        >
        Share Session
      </button>

      {#if showQr && $uiState.qrCodeUrl}
        <div class="qr-popup">
          <img src={$uiState.qrCodeUrl} alt="Session QR Code" />
          <p>Scan to connect phone</p>
        </div>
      {/if}
    </div>
  </aside>

  <!-- Main Chat Area -->
  <section class="chat-area">
    <header>
      <div class="header-info">
        <button class="hamburger" on:click={() => (sidebarOpen = !sidebarOpen)}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <h3>
          {$uiState.currentSessionId ? "Live Session" : "No Session Selected"}
        </h3>
        <span
          class="status-badge {$uiState.connected
            ? 'connected'
            : 'disconnected'}"
        >
          <span class="dot"></span>
          {$uiState.connected ? "Connected" : "Offline"}
        </span>
      </div>
      <div class="user-profile">
        <div class="avatar">
          <!-- Placeholder Avatar from standard UI specs -->
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle
              cx="12"
              cy="7"
              r="4"
            ></circle></svg
          >
        </div>
      </div>
    </header>

    <div class="chat-box" bind:this={chatBox}>
      {#if !$uiState.currentSessionId}
        <div class="empty-state">
          <div class="empty-icon">
            <svg
              viewBox="0 0 24 24"
              width="48"
              height="48"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="opacity:0.3"
              ><path
                d="M12 2L2 7l10 5 10-5-10-5zm0 22l-10-5V9l10 5 10-5v10l-10 5z"
              ></path></svg
            >
          </div>
          <h2>Just Imagine...</h2>
          <p>Select a session or start a new one from the CLI.</p>

          {#if $uiState.qrCodeUrl}
            <div class="welcome-qr">
              <div class="welcome-qr-card">
                <img src={$uiState.qrCodeUrl} alt="LAN QR Code" />
                <p class="welcome-qr-label">Scan to open on another device</p>
                <a class="welcome-qr-url" href={lanUrl} target="_blank" rel="noopener noreferrer">{lanUrl}</a>
              </div>
            </div>
          {/if}
        </div>
      {:else}
        {#each $uiState.messages as msg}
          {#if msg.role !== "system"}
            <div class="message-wrapper {msg.role}">
              {#if msg.role === "assistant"}
                <div class="benefits-card">
                  <div class="benefits-header">
                    <div class="checkbox-icon">
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        stroke="currentColor"
                        stroke-width="3"
                        fill="none"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><polyline points="20 6 9 17 4 12"></polyline></svg
                      >
                    </div>
                    <span>AI Assistant</span>
                  </div>
                  <div class="message-content markdown-body">
                    {@html DOMPurify.sanitize(marked.parse(msg.content))}
                  </div>
                </div>
              {:else}
                <div class="message {msg.role}">
                  {msg.content}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <div class="input-section">
      <div class="input-container">
        <input
          type="text"
          bind:value={inputMessage}
          on:keydown={handleKeydown}
          placeholder="Ask Anything..."
          disabled={!$uiState.currentSessionId}
        />
        <button
          class="send-btn"
          on:click={handleSend}
          disabled={!$uiState.currentSessionId || !inputMessage.trim()}
        >
          <!-- Send Icon -->
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><line x1="22" y1="2" x2="11" y2="13"></line><polygon
              points="22 2 15 22 11 13 2 9 22 2"
            ></polygon></svg
          >
        </button>
      </div>
    </div>
  </section>
</main>

<style>
  :global(:root) {
    --bg-dark: #121212;
    --bg-panel: #1e1e1e;
    --text-primary: #ffffff;
    --text-secondary: #a0a0a0;
    --accent-green: #10b981;
    --border-color: rgba(255, 255, 255, 0.08);
  }

  :global(body) {
    background-color: var(--bg-dark);
    color: var(--text-primary);
    font-family: "Inter", system-ui, sans-serif;
    margin: 0;
    height: 100vh;
    display: flex;
  }

  /* Dashboard Layout */
  .dashboard {
    display: flex;
    width: 100%;
    height: 100vh;
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    background-color: var(--bg-dark);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    position: relative;
    /* Subtle green glow on the sidebar background */
    background: radial-gradient(
      circle at top left,
      rgba(16, 185, 129, 0.05),
      var(--bg-dark) 40%
    );
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    width: 32px;
    height: 32px;
    background: #ffffff;
    color: #000000;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .logo-icon svg {
    width: 20px;
    height: 20px;
  }

  .brand h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .subtitle {
    margin: 0.25rem 0 2rem 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
    padding-left: 2.75rem;
  }

  .sessions-list {
    flex-grow: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    transition: all 0.2s;
    border: 1px solid transparent;
  }

  .session-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .session-item.active {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .session-btn {
    background: none;
    border: none;
    color: var(--text-primary);
    text-align: left;
    flex-grow: 1;
    padding: 0;
    cursor: pointer;
    font-size: 0.95rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .session-date {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .delete-btn {
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.5rem;
    opacity: 0.5;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .session-item:hover .delete-btn {
    opacity: 1;
  }
  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .empty-sessions {
    color: var(--text-secondary);
    font-size: 0.9rem;
    text-align: center;
    padding: 2rem 0;
  }

  /* QR Section */
  .qr-section {
    position: relative;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .qr-toggle {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-weight: 500;
    transition: background 0.2s;
  }

  .qr-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .qr-popup {
    position: absolute;
    bottom: 110%;
    left: 0;
    right: 0;
    background: white;
    padding: 1rem;
    border-radius: 1rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    text-align: center;
    color: black;
  }

  .qr-popup img {
    width: 100%;
    height: auto;
    border-radius: 0.5rem;
  }

  .qr-popup p {
    margin: 0.5rem 0 0 0;
    font-size: 0.85rem;
    font-weight: 500;
  }

  /* Chat Area */
  .chat-area {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-dark);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 2rem;
    border-bottom: 1px solid var(--border-color);
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header-info h3 {
    margin: 0;
    font-weight: 500;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.05);
  }

  .status-badge.connected {
    color: var(--accent-green);
  }
  .status-badge.disconnected {
    color: var(--text-secondary);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .connected .dot {
    background: var(--accent-green);
    box-shadow: 0 0 8px var(--accent-green);
  }
  .disconnected .dot {
    background: var(--text-secondary);
  }

  .user-profile .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg-panel);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-color);
  }

  .chat-box {
    flex-grow: 1;
    padding: 2rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .empty-state {
    margin: auto;
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-state h2 {
    color: white;
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
  }

  .welcome-qr {
    margin-top: 2rem;
  }

  .welcome-qr-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    padding: 1.5rem;
    display: inline-block;
  }

  .welcome-qr-card img {
    width: 200px;
    height: 200px;
    border-radius: 0.5rem;
  }

  .welcome-qr-label {
    margin: 0.75rem 0 0.25rem 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .welcome-qr-url {
    display: block;
    margin: 0;
    font-size: 0.75rem;
    color: var(--accent-green);
    word-break: break-all;
    font-family: "Consolas", "Monaco", monospace;
    text-decoration: none;
  }

  .welcome-qr-url:hover {
    text-decoration: underline;
  }

  .message-wrapper {
    display: flex;
    width: 100%;
  }

  .message-wrapper.user {
    justify-content: flex-end;
  }
  .message-wrapper.assistant {
    justify-content: flex-start;
  }

  .message {
    padding: 0.85rem 1.25rem;
    border-radius: 1rem;
    max-width: 80%;
    line-height: 1.5;
  }

  .message.user {
    background: rgba(255, 255, 255, 0.1);
    border-bottom-right-radius: 0.25rem;
  }

  /* Custom styling for AI responses based on user screenshot */
  .benefits-card {
    background: transparent;
    max-width: 85%;
  }

  .benefits-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    color: white;
    font-weight: 500;
  }

  .checkbox-icon {
    width: 20px;
    height: 20px;
    background: var(--accent-green);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--bg-dark);
  }

  .message-content {
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: 0.95rem;
    margin-left: 1.75rem;
  }

  /* Input Section */
  .input-section {
    padding: 1.5rem 2rem;
  }

  .input-container {
    display: flex;
    align-items: center;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    padding: 0.5rem 1rem;
    transition: border-color 0.2s;
  }

  .input-container:focus-within {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .input-container input {
    flex-grow: 1;
    background: transparent;
    border: none;
    color: white;
    padding: 0.75rem 0;
    font-size: 0.95rem;
    outline: none;
  }

  .input-container input::placeholder {
    color: var(--text-secondary);
  }

  .send-btn {
    background: transparent;
    border: none;
    color: white;
    padding: 0.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  .send-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Markdown Styles */
  :global(.markdown-body) {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  :global(.markdown-body p) {
    margin: 0 0 1rem 0;
  }
  :global(.markdown-body p:last-child) {
    margin-bottom: 0;
  }
  :global(.markdown-body a) {
    color: var(--accent-green);
    text-decoration: none;
  }
  :global(.markdown-body a:hover) {
    text-decoration: underline;
  }
  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    margin: 0 0 1rem 0;
    padding-left: 1.5rem;
  }
  :global(.markdown-body li) {
    margin-bottom: 0.25rem;
  }
  :global(.markdown-body strong) {
    color: white;
  }
  :global(.markdown-body pre) {
    background: rgba(0, 0, 0, 0.4);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    border: 1px solid var(--border-color);
    margin: 1rem 0;
  }
  :global(.markdown-body code) {
    font-family: "Consolas", "Monaco", monospace;
    font-size: 0.85rem;
    background: rgba(0, 0, 0, 0.3);
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
  }
  :global(.markdown-body pre code) {
    background: transparent;
    padding: 0;
  }
  :global(.markdown-body blockquote) {
    border-left: 3px solid var(--accent-green);
    margin: 1rem 0;
    padding-left: 1rem;
    color: #cbd5e1;
    font-style: italic;
  }
  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3),
  :global(.markdown-body h4) {
    color: white;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
  }
  :global(.markdown-body h1) {
    font-size: 1.5rem;
  }
  :global(.markdown-body h2) {
    font-size: 1.3rem;
  }
  :global(.markdown-body h3) {
    font-size: 1.1rem;
  }
</style>
