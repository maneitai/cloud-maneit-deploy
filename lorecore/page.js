// ═══════════════════════════════════════════════════════════════════
//  LoreCore — Deploy 1
//  ═══════════════════════════════════════════════════════════════════
//  AUTHOR mode: chat-based ideation with extract-save to library
//  LIBRARY mode: placeholder (Deploy 2 ships canon-first reader/editor)
//  Mode toggle, library picker, universe label = real infrastructure
// ═══════════════════════════════════════════════════════════════════

const API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ─── State ──────────────────────────────────────────────────────────
const state = {
  mode: "author",                    // "author" | "library"
  libraries: [],
  currentLibraryId: null,
  currentBookId: null,
  currentSessionId: null,
  isFreeChat: true,
  books: [],
  sessions: [],
  models: [],
  selectedModels: [],
  chatMode: "single",                // "single" | "parallel" | "discussion"
  busy: false,
  abortController: null,
};

// ─── DOM refs ───────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const els = {};
function bindEls() {
  els.modeSwitcher       = $("#modeSwitcher");
  els.refreshBtn         = $("#refreshBtn");
  els.libraryPicker      = $("#libraryPicker");
  els.universeLabel      = $("#universeLabel");
  els.bookCountLabel     = $("#bookCountLabel");
  els.libraryStatusChip  = $("#libraryStatusChip");

  els.authorLayout       = $("#authorLayout");
  els.libraryLayout      = $("#libraryLayout");

  els.sessionList        = $("#sessionList");
  els.sessionChip        = $("#sessionChip");
  els.freeChatBtn        = $("#freeChatBtn");
  els.newSessionBtn      = $("#newSessionBtn");

  els.bookList           = $("#bookList");
  els.libScopeChip       = $("#libScopeChip");
  els.ctxSession         = $("#ctxSession");
  els.ctxBook            = $("#ctxBook");
  els.ctxMode            = $("#ctxMode");
  els.ctxModels          = $("#ctxModels");

  els.chatModeCards      = $("#chatModeCards");
  els.modelSelectorWrap  = $("#modelSelectorWrap");
  els.chatFeed           = $("#chatFeed");
  els.chatResizeHandle   = $("#chatResizeHandle");
  els.messageInput       = $("#messageInput");
  els.sendBtn            = $("#sendBtn");
  els.chatStatusText     = $("#chatStatusText");

  els.extractScope       = $("#extractScopeSelect");
  els.extractSaveBtn     = $("#extractSaveBtn");
  els.extractSaveStatus  = $("#extractSaveStatus");

  els.confirmModal       = $("#confirmModal");
  els.confirmModalTitle  = $("#confirmModalTitle");
  els.confirmModalBody   = $("#confirmModalBody");
  els.confirmModalCancel = $("#confirmModalCancel");
  els.confirmModalOk     = $("#confirmModalOk");

  els.toast              = $("#toast");
}

// ─── Storage keys ───────────────────────────────────────────────────
const LS = {
  MODE:          "lorecore.mode",
  LIBRARY_ID:    "lorecore.libraryId",
  SESSION_ID:    "lorecore.sessionId",
  BOOK_ID:       "lorecore.bookId",
  CHAT_MODE:     "lorecore.chatMode",
  MODELS:        "lorecore.models",
};
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

// ─── HTTP helper ────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const init = {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...(opts.body !== undefined ? { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  };
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch { try { detail = await res.text(); } catch {} }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// ─── Toast ──────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, kind = "") {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.className = "toast toast--show" + (kind ? ` toast--${kind}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = "toast"; }, 3000);
}

// ─── Confirm modal (used by Deploy 2; harmless here) ────────────────
function confirmModal({ title = "Confirm", body = "", okLabel = "Confirm", okKind = "primary" } = {}) {
  return new Promise((resolve) => {
    els.confirmModalTitle.textContent = title;
    els.confirmModalBody.innerHTML = body;
    els.confirmModalOk.textContent = okLabel;
    els.confirmModalOk.className = "button" + (okKind === "primary" ? " button--primary" : okKind === "danger" ? " button--danger" : "");
    els.confirmModal.style.display = "flex";
    const cleanup = (val) => {
      els.confirmModal.style.display = "none";
      els.confirmModalOk.removeEventListener("click", okFn);
      els.confirmModalCancel.removeEventListener("click", cancelFn);
      resolve(val);
    };
    const okFn = () => cleanup(true);
    const cancelFn = () => cleanup(false);
    els.confirmModalOk.addEventListener("click", okFn);
    els.confirmModalCancel.addEventListener("click", cancelFn);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  MODE SWITCHING
// ═══════════════════════════════════════════════════════════════════
function applyMode(mode) {
  state.mode = mode;
  lsSet(LS.MODE, mode);
  els.modeSwitcher.querySelectorAll(".mode-switch-btn").forEach((b) => {
    b.classList.toggle("mode-switch-btn--active", b.dataset.mode === mode);
  });
  els.authorLayout.style.display  = mode === "author"  ? "" : "none";
  els.libraryLayout.style.display = mode === "library" ? "" : "none";
}

function bindModeSwitcher() {
  els.modeSwitcher.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-switch-btn");
    if (!btn) return;
    applyMode(btn.dataset.mode);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  LIBRARY PICKER + SCOPE
// ═══════════════════════════════════════════════════════════════════
async function loadOverview() {
  const libParam = state.currentLibraryId ? `?library_public_id=${encodeURIComponent(state.currentLibraryId)}` : "";
  const data = await api(`/api/lorecore/overview${libParam}`);

  state.libraries = Array.isArray(data.libraries) ? data.libraries : [];
  state.books = Array.isArray(data.books) ? data.books : [];

  const sel = data.selected_library;
  if (!state.currentLibraryId && sel) state.currentLibraryId = sel.public_id;
  if (!state.libraries.length) {
    els.libraryStatusChip.textContent = "No libraries";
    els.libraryStatusChip.className = "status-chip status-chip--bad";
    return;
  }

  // Library picker dropdown
  els.libraryPicker.innerHTML = state.libraries
    .map((l) => `<option value="${l.public_id}">${escapeHTML(l.name)}</option>`)
    .join("");
  els.libraryPicker.value = state.currentLibraryId || state.libraries[0].public_id;
  state.currentLibraryId = els.libraryPicker.value;
  lsSet(LS.LIBRARY_ID, state.currentLibraryId);

  const currentLib = state.libraries.find((l) => l.public_id === state.currentLibraryId);
  els.universeLabel.textContent = currentLib?.universe_id || "default";
  els.bookCountLabel.textContent = String(state.books.length);
  els.libraryStatusChip.textContent = currentLib?.status || "active";
  els.libraryStatusChip.className = "status-chip status-chip--good";

  renderBookList();
}

function bindLibraryPicker() {
  els.libraryPicker.addEventListener("change", async (e) => {
    state.currentLibraryId = e.target.value;
    lsSet(LS.LIBRARY_ID, state.currentLibraryId);
    state.currentBookId = null;
    state.currentSessionId = null;
    state.isFreeChat = true;
    lsSet(LS.BOOK_ID, null);
    lsSet(LS.SESSION_ID, null);
    clearChatFeed();
    await loadOverview();
    await loadSessions();
    updateContextChips();
  });
}

// ═══════════════════════════════════════════════════════════════════
//  BOOK LIST
// ═══════════════════════════════════════════════════════════════════
function renderBookList() {
  if (!state.books.length) {
    els.bookList.innerHTML = `<div class="lib-placeholder">No books in this library yet.</div>`;
    return;
  }
  els.bookList.innerHTML = state.books
    .map((b) => {
      const active = state.currentBookId === b.public_id ? "book-item--active" : "";
      const status = b.status || "—";
      const stage  = b.active_stage || "";
      return `
        <button class="book-item ${active}" data-book="${b.public_id}" type="button">
          <div class="book-item-title">${escapeHTML(b.title || b.public_id)}</div>
          <div class="book-item-sub">${escapeHTML(b.genre || "—")}</div>
          <div class="book-item-meta">
            <span class="status-chip status-chip--${statusKind(status)}">${escapeHTML(status)}</span>
            ${stage ? `<span class="status-chip">${escapeHTML(stage)}</span>` : ""}
          </div>
        </button>`;
    })
    .join("");

  els.bookList.querySelectorAll(".book-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.book;
      if (state.currentBookId === id) {
        // toggle off → free chat
        state.currentBookId = null;
        state.isFreeChat = true;
      } else {
        state.currentBookId = id;
        state.isFreeChat = false;
      }
      lsSet(LS.BOOK_ID, state.currentBookId);
      renderBookList();
      updateContextChips();
    });
  });
}

function statusKind(s) {
  const v = String(s || "").toLowerCase();
  if (v === "final" || v === "active" || v === "good") return "final";
  if (v === "drafted" || v === "draft") return "drafted";
  if (v === "written") return "written";
  if (v === "planned" || v === "planning" || v === "pre_planning") return "planned";
  if (v === "archived" || v === "archive") return "archived";
  return "info";
}

// ═══════════════════════════════════════════════════════════════════
//  SESSIONS
// ═══════════════════════════════════════════════════════════════════
async function loadSessions() {
  try {
    const data = await api("/api/chat-sessions?surface=lorecore&limit=30");
    state.sessions = Array.isArray(data.items) ? data.items
                   : Array.isArray(data) ? data
                   : Array.isArray(data.sessions) ? data.sessions : [];
  } catch (e) {
    state.sessions = [];
  }
  renderSessionList();
  updateSessionChip();
}

function renderSessionList() {
  if (!state.sessions.length) {
    els.sessionList.innerHTML = `<div class="lib-placeholder">No sessions yet. Click + New session.</div>`;
    return;
  }
  els.sessionList.innerHTML = state.sessions
    .map((s) => {
      const id = s.public_id || s.id;
      const active = state.currentSessionId === id && !state.isFreeChat ? "session-item--active" : "";
      const title = s.title || s.name || `Session ${id.slice(-6)}`;
      const sub = s.book_public_id || s.book_id || (s.updated_at ? formatDate(s.updated_at) : "—");
      return `
        <button class="session-item ${active}" data-session="${id}" type="button">
          <div class="session-item-title">${escapeHTML(title)}</div>
          <div class="session-item-sub">${escapeHTML(sub)}</div>
        </button>`;
    })
    .join("");

  els.sessionList.querySelectorAll(".session-item").forEach((btn) => {
    btn.addEventListener("click", () => switchSession(btn.dataset.session));
  });

  // Free-chat highlight
  els.freeChatBtn.classList.toggle("session-item--active", state.isFreeChat);
}

function updateSessionChip() {
  const n = state.sessions.length;
  els.sessionChip.textContent = `${n} session${n === 1 ? "" : "s"}`;
  els.sessionChip.className = "status-chip" + (n ? " status-chip--info" : " status-chip--warn");
}

async function switchSession(sessionId) {
  if (state.currentSessionId === sessionId && !state.isFreeChat) return;
  state.currentSessionId = sessionId;
  state.isFreeChat = false;
  lsSet(LS.SESSION_ID, sessionId);
  renderSessionList();
  updateContextChips();
  await loadSessionMessages(sessionId);
}

async function loadSessionMessages(sessionId) {
  clearChatFeed();
  try {
    const data = await api(`/api/chat-sessions/${encodeURIComponent(sessionId)}`);
    const messages = Array.isArray(data.messages) ? data.messages
                   : Array.isArray(data.items) ? data.items : [];
    if (!messages.length) {
      appendSystemMessage("Empty session. Send a message to start.");
      return;
    }
    messages.forEach((m) => {
      appendChatMessage({
        role: m.role || "assistant",
        content: m.content || m.text || "",
        model: m.model || m.model_id,
        timestamp: m.created_at,
      });
    });
  } catch (e) {
    appendSystemMessage(`Could not load session: ${e.message}`);
  }
}

async function createNewSession() {
  try {
    const payload = {
      surface: "lorecore",
      title: "New session",
      book_public_id: state.currentBookId || null,
      library_public_id: state.currentLibraryId || null,
    };
    const data = await api("/api/chat-sessions", { method: "POST", body: payload });
    const id = data.public_id || data.id;
    if (!id) throw new Error("No session ID in response");
    await loadSessions();
    await switchSession(id);
    toast("New session created", "good");
  } catch (e) {
    toast(`Could not create session: ${e.message}`, "bad");
  }
}

function startFreeChat() {
  state.isFreeChat = true;
  state.currentSessionId = null;
  lsSet(LS.SESSION_ID, null);
  clearChatFeed();
  appendSystemMessage("Free chat — no session, no persistence. Pick a session or create one to save history.");
  renderSessionList();
  updateContextChips();
}

// ═══════════════════════════════════════════════════════════════════
//  MODELS
// ═══════════════════════════════════════════════════════════════════
async function loadModels() {
  try {
    const data = await api("/api/model-pool/models");
    const items = Array.isArray(data) ? data
                : Array.isArray(data.items) ? data.items
                : Array.isArray(data.models) ? data.models : [];
    state.models = items.filter((m) => {
      const driver = (m.runtime_driver || "").toLowerCase();
      const allow = m.surface_allowlist || m.surfaces || [];
      const allowed = Array.isArray(allow) && (allow.includes("lorecore") || allow.length === 0);
      return driver.includes("openai") && allowed;
    });

    // Restore selected models from localStorage
    const stored = lsGet(LS.MODELS);
    if (stored) {
      try {
        const ids = JSON.parse(stored);
        state.selectedModels = ids.filter((id) => state.models.some((m) => (m.public_id || m.id) === id));
      } catch {}
    }
    if (!state.selectedModels.length && state.models.length) {
      state.selectedModels = [state.models[0].public_id || state.models[0].id];
      lsSet(LS.MODELS, JSON.stringify(state.selectedModels));
    }
  } catch (e) {
    state.models = [];
  }
  renderModelSelector();
  updateContextChips();
}

function renderModelSelector() {
  if (!state.models.length) {
    els.modelSelectorWrap.innerHTML = `<span class="muted" style="font-size:12px;">No LoreCore models available</span>`;
    return;
  }
  const pills = state.selectedModels.map((id) => {
    const m = state.models.find((x) => (x.public_id || x.id) === id);
    const name = m ? (m.display_name || m.name || id) : id;
    return `<span class="model-pill" data-model="${id}" title="Click to remove">${escapeHTML(name)} ✕</span>`;
  }).join("");

  els.modelSelectorWrap.innerHTML = pills + `<span class="model-pill model-pill--add" id="addModelPill">+ add</span>`;

  els.modelSelectorWrap.querySelectorAll(".model-pill[data-model]").forEach((p) => {
    p.addEventListener("click", () => {
      const id = p.dataset.model;
      state.selectedModels = state.selectedModels.filter((x) => x !== id);
      lsSet(LS.MODELS, JSON.stringify(state.selectedModels));
      renderModelSelector();
      updateContextChips();
    });
  });

  const addBtn = $("#addModelPill");
  if (addBtn) addBtn.addEventListener("click", showModelPicker);
}

function showModelPicker() {
  const available = state.models.filter((m) => !state.selectedModels.includes(m.public_id || m.id));
  if (!available.length) { toast("All available models are already selected", "warn"); return; }
  const items = available.map((m) => {
    const id = m.public_id || m.id;
    const name = m.display_name || m.name || id;
    const fam = m.provider || m.runtime_driver || "";
    return `<button class="session-item" data-pick="${id}" type="button" style="margin:3px 0;">
      <div class="session-item-title">${escapeHTML(name)}</div>
      <div class="session-item-sub">${escapeHTML(fam)} · <code>${escapeHTML(id)}</code></div>
    </button>`;
  }).join("");

  confirmModal({
    title: "Pick a model",
    body: `<div style="max-height:340px;overflow-y:auto;">${items}</div>`,
    okLabel: "Done",
  });

  // wire after modal renders
  setTimeout(() => {
    document.querySelectorAll("#confirmModalBody [data-pick]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.dataset.pick;
        if (!state.selectedModels.includes(id)) state.selectedModels.push(id);
        lsSet(LS.MODELS, JSON.stringify(state.selectedModels));
        renderModelSelector();
        updateContextChips();
        $("#confirmModalOk")?.click();
      });
    });
  }, 0);
}

// ═══════════════════════════════════════════════════════════════════
//  CHAT MODE CARDS
// ═══════════════════════════════════════════════════════════════════
function bindChatModeCards() {
  els.chatModeCards.addEventListener("click", (e) => {
    const card = e.target.closest(".mode-card");
    if (!card) return;
    state.chatMode = card.dataset.mode;
    lsSet(LS.CHAT_MODE, state.chatMode);
    els.chatModeCards.querySelectorAll(".mode-card").forEach((c) => {
      c.classList.toggle("mode-card--active", c.dataset.mode === state.chatMode);
    });
    updateContextChips();

    if (state.chatMode === "discussion") {
      toast("Discussion mode (multi-model debate) is not yet wired in Deploy 1", "warn");
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  CONTEXT CHIPS
// ═══════════════════════════════════════════════════════════════════
function updateContextChips() {
  const book = state.books.find((b) => b.public_id === state.currentBookId);
  const bookLabel = book ? book.title : "Free chat";
  els.libScopeChip.textContent = bookLabel;
  els.libScopeChip.className = "status-chip" + (book ? " status-chip--accent" : "");

  els.ctxSession.textContent = state.isFreeChat ? "Free chat" : (state.currentSessionId || "—");
  els.ctxBook.textContent = book ? book.public_id : "—";
  els.ctxMode.textContent = state.chatMode;

  const modelNames = state.selectedModels.map((id) => {
    const m = state.models.find((x) => (x.public_id || x.id) === id);
    return m ? (m.display_name || m.name || id) : id;
  });
  els.ctxModels.textContent = modelNames.length ? modelNames.join(", ") : "—";
}

// ═══════════════════════════════════════════════════════════════════
//  CHAT FEED
// ═══════════════════════════════════════════════════════════════════
function clearChatFeed() {
  els.chatFeed.innerHTML = `
    <div class="chat-placeholder">
      <div class="chat-placeholder-icon">📖</div>
      <div class="chat-placeholder-title">Author mode — thinking room</div>
      <div class="muted" style="font-size:13px;">Pick a model. Optionally pick a book for context. Chat freely.</div>
    </div>`;
}

function ensureFeedReady() {
  const placeholder = els.chatFeed.querySelector(".chat-placeholder");
  if (placeholder) placeholder.remove();
}

function appendSystemMessage(text) {
  ensureFeedReady();
  const div = document.createElement("div");
  div.className = "chat-msg chat-msg--system";
  div.textContent = text;
  els.chatFeed.appendChild(div);
  scrollFeed();
}

function appendChatMessage({ role, content, model, timestamp }) {
  ensureFeedReady();
  const div = document.createElement("div");
  div.className = `chat-msg chat-msg--${role}`;
  if (role === "assistant" || role === "user") {
    const meta = document.createElement("div");
    meta.className = "chat-msg-meta";
    const parts = [role.toUpperCase()];
    if (model) parts.push(`<span class="chat-msg-model">${escapeHTML(model)}</span>`);
    if (timestamp) parts.push(escapeHTML(formatDate(timestamp)));
    meta.innerHTML = parts.join(" · ");
    div.appendChild(meta);
  }
  const body = document.createElement("div");
  body.className = "chat-msg-body";
  body.innerHTML = renderMarkdown(content || "");
  div.appendChild(body);
  els.chatFeed.appendChild(div);
  scrollFeed();
  return div;
}

function scrollFeed() {
  els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
}

// Tiny markdown renderer — headings, code blocks, inline code, bold, italic, lists
function renderMarkdown(text) {
  if (!text) return "";
  let html = escapeHTML(text);

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Headings
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold + italic
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");

  // Lists
  html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>(?:\n|$))+/g, (m) => `<ul>${m}</ul>`);

  // Paragraphs (split on blank lines, leave block tags alone)
  const blocks = html.split(/\n{2,}/).map((b) => {
    if (/^\s*<(h\d|ul|ol|pre|li|blockquote)/i.test(b)) return b;
    return `<p>${b.replace(/\n/g, "<br>")}</p>`;
  });
  return blocks.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
//  SEND MESSAGE
// ═══════════════════════════════════════════════════════════════════
async function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text) return;
  if (state.busy) { toast("Wait for the current response to finish", "warn"); return; }
  if (!state.selectedModels.length) { toast("Pick at least one model", "warn"); return; }

  els.messageInput.value = "";
  appendChatMessage({ role: "user", content: text });

  state.busy = true;
  els.sendBtn.disabled = true;
  els.chatStatusText.textContent = "Sending…";

  try {
    if (state.chatMode === "parallel") {
      await sendParallel(text);
    } else {
      await sendSingle(text);
    }
  } catch (e) {
    appendSystemMessage(`Error: ${e.message}`);
  } finally {
    state.busy = false;
    els.sendBtn.disabled = false;
    els.chatStatusText.textContent = "";
  }
}

async function sendSingle(text) {
  const modelId = state.selectedModels[0];

  // Free chat: no session — just call models directly
  if (state.isFreeChat || !state.currentSessionId) {
    const reply = await callModelDirect(modelId, text);
    appendChatMessage({ role: "assistant", content: reply, model: modelId });
    return;
  }

  // Session-bound: stream via SSE
  await streamSessionResponse(state.currentSessionId, text, modelId);
}

async function sendParallel(text) {
  const calls = state.selectedModels.map(async (modelId) => {
    try {
      const reply = await callModelDirect(modelId, text);
      appendChatMessage({ role: "assistant", content: reply, model: modelId });
    } catch (e) {
      appendChatMessage({ role: "assistant", content: `_Error from ${modelId}: ${e.message}_`, model: modelId });
    }
  });
  await Promise.all(calls);
}

async function callModelDirect(modelId, text) {
  // Build context-aware prompt if a book is selected
  let prompt = text;
  if (state.currentBookId) {
    const book = state.books.find((b) => b.public_id === state.currentBookId);
    if (book) {
      const ctx = [
        `Book context: ${book.title}`,
        book.premise ? `Premise: ${book.premise}` : "",
        book.genre ? `Genre: ${book.genre}` : "",
      ].filter(Boolean).join("\n");
      prompt = `${ctx}\n\n---\n\n${text}`;
    }
  }
  const data = await api("/api/model-pool/chat", {
    method: "POST",
    body: { model_public_id: modelId, messages: [{ role: "user", content: prompt }] },
  });
  return data.content || data.message || data.text || "(no response)";
}

async function streamSessionResponse(sessionId, text, modelId) {
  // POST user message first
  await api(`/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: { role: "user", content: text, model_public_id: modelId },
  });

  // Open SSE stream for assistant response
  const url = `${API_BASE}/api/lorecore/sessions/${encodeURIComponent(sessionId)}/stream?model_public_id=${encodeURIComponent(modelId)}`;
  const msgEl = appendChatMessage({ role: "assistant", content: "", model: modelId });
  const bodyEl = msgEl.querySelector(".chat-msg-body");
  let buf = "";

  await new Promise((resolve, reject) => {
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.event === "done" || d.done) { es.close(); resolve(); return; }
        if (d.delta) { buf += d.delta; bodyEl.innerHTML = renderMarkdown(buf); scrollFeed(); }
        else if (d.content) { buf = d.content; bodyEl.innerHTML = renderMarkdown(buf); scrollFeed(); }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      if (!buf) reject(new Error("Stream failed"));
      else resolve();
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
//  EXTRACT & SAVE TO LIBRARY
// ═══════════════════════════════════════════════════════════════════
async function extractAndSave() {
  if (state.isFreeChat || !state.currentSessionId) {
    toast("Switch to a session first — free chat has nothing to extract from", "warn");
    return;
  }
  if (!state.currentBookId && state.extractScope.value !== "world") {
    const ok = await confirmModal({
      title: "No book selected",
      body: "Extracted entities will be saved at library scope (no book attribution). Continue?",
      okLabel: "Continue",
    });
    if (!ok) return;
  }

  els.extractSaveBtn.disabled = true;
  els.extractSaveStatus.style.display = "block";
  els.extractSaveStatus.textContent = "Reading session, extracting entities…";

  try {
    const scope = els.extractScope.value;
    const types = scope === "all" ? ["characters", "world", "scenes"] : [scope];
    const results = [];

    for (const t of types) {
      try {
        const data = await api("/api/lorecore/extract", {
          method: "POST",
          body: {
            entity_type: t,
            session_public_id: state.currentSessionId,
            book_public_id: state.currentBookId || null,
            library_public_id: state.currentLibraryId,
          },
        });
        const count = data.created || data.count || (Array.isArray(data.items) ? data.items.length : 0);
        results.push(`${t}: ${count}`);
      } catch (e) {
        results.push(`${t}: error (${e.message})`);
      }
    }

    els.extractSaveStatus.innerHTML = `<strong>Done:</strong> ${results.join(" · ")}`;
    toast("Extraction complete", "good");
    await loadOverview();
  } catch (e) {
    els.extractSaveStatus.textContent = `Error: ${e.message}`;
    toast("Extraction failed", "bad");
  } finally {
    els.extractSaveBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CHAT RESIZE HANDLE
// ═══════════════════════════════════════════════════════════════════
function bindResizeHandle() {
  let dragging = false;
  let startY = 0;
  let startHeight = 0;
  els.chatResizeHandle.addEventListener("mousedown", (e) => {
    dragging = true;
    startY = e.clientY;
    startHeight = els.chatFeed.offsetHeight;
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const newH = Math.max(150, startHeight + (e.clientY - startY));
    els.chatFeed.style.flex = "0 0 auto";
    els.chatFeed.style.height = `${newH}px`;
  });
  window.addEventListener("mouseup", () => { dragging = false; });
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function formatDate(d) {
  if (!d) return "";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  bindEls();

  // Restore from localStorage
  state.mode             = lsGet(LS.MODE) || "author";
  state.currentLibraryId = lsGet(LS.LIBRARY_ID) || null;
  state.currentBookId    = lsGet(LS.BOOK_ID) || null;
  state.currentSessionId = lsGet(LS.SESSION_ID) || null;
  state.chatMode         = lsGet(LS.CHAT_MODE) || "single";
  state.isFreeChat       = !state.currentSessionId;

  // Apply mode
  applyMode(state.mode);
  bindModeSwitcher();

  // Apply chat mode visual
  els.chatModeCards.querySelectorAll(".mode-card").forEach((c) => {
    c.classList.toggle("mode-card--active", c.dataset.mode === state.chatMode);
  });

  bindLibraryPicker();
  bindChatModeCards();
  bindResizeHandle();

  // Send button + Enter
  els.sendBtn.addEventListener("click", sendMessage);
  els.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.freeChatBtn.addEventListener("click", startFreeChat);
  els.newSessionBtn.addEventListener("click", createNewSession);
  els.refreshBtn.addEventListener("click", async () => {
    await loadOverview();
    await loadSessions();
    await loadModels();
    toast("Refreshed", "good");
  });
  els.extractSaveBtn.addEventListener("click", extractAndSave);

  // Initial loads
  try {
    await loadOverview();
    await loadModels();
    await loadSessions();

    if (state.currentSessionId && !state.isFreeChat) {
      await loadSessionMessages(state.currentSessionId);
    } else {
      startFreeChat();
    }
    updateContextChips();
  } catch (e) {
    toast(`Init error: ${e.message}`, "bad");
    console.error(e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
