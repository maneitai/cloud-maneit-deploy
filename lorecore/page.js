// ═══════════════════════════════════════════════════════════════════
//  LoreCore — Deploy 2 (full rewrite)
//  ═══════════════════════════════════════════════════════════════════
//  AUTHOR mode  : chat-based ideation with extract-save (preserved)
//  LIBRARY mode : canon-first reader/editor with edit-protection
//                 - per-entity edit toggle (orange "EDITING" chip)
//                 - save requires confirmation modal
//                 - navigation while dirty is blocked by modal
//                 - on save: status='final', user_modified_at=now
// ═══════════════════════════════════════════════════════════════════

const API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ─── State ──────────────────────────────────────────────────────────
const state = {
  mode: "author",
  libraries: [],
  currentLibraryId: null,
  currentBookId: null,
  currentSessionId: null,
  isFreeChat: true,
  books: [],
  worlds: [],
  characters: [],
  scenes: [],
  chaptersByBook: {},
  scenesByChapter: {},
  sessions: [],
  models: [],
  selectedModels: [],
  chatMode: "single",
  busy: false,

  selectedEntity: null,
  editingEntity: null,
  dirty: false,
  expanded: {
    worlds: true,
    characters: true,
    books: true,
    book: {},
    chapter: {},
  },
};

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

const LS = {
  MODE:          "lorecore.mode",
  LIBRARY_ID:    "lorecore.libraryId",
  SESSION_ID:    "lorecore.sessionId",
  BOOK_ID:       "lorecore.bookId",
  CHAT_MODE:     "lorecore.chatMode",
  MODELS:        "lorecore.models",
  EXPANDED:      "lorecore.expanded",
};
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

async function api(path, opts = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const init = {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...(opts.body !== undefined ? { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) } : {}),
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

let toastTimer = null;
function toast(msg, kind = "") {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.className = "toast toast--show" + (kind ? ` toast--${kind}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = "toast"; }, 3000);
}

function confirmModal({ title = "Confirm", body = "", okLabel = "Confirm", cancelLabel = "Cancel", okKind = "primary" } = {}) {
  return new Promise((resolve) => {
    els.confirmModalTitle.textContent = title;
    els.confirmModalBody.innerHTML = body;
    els.confirmModalOk.textContent = okLabel;
    els.confirmModalCancel.textContent = cancelLabel;
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

function threeWayModal({ title, body, applyLabel = "Apply", discardLabel = "Discard", cancelLabel = "Cancel" }) {
  return new Promise((resolve) => {
    els.confirmModalTitle.textContent = title;
    els.confirmModalBody.innerHTML = body + `
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="button" id="threeWayCancel" type="button">${escapeHTML(cancelLabel)}</button>
        <button class="button button--danger" id="threeWayDiscard" type="button">${escapeHTML(discardLabel)}</button>
        <button class="button button--primary" id="threeWayApply" type="button">${escapeHTML(applyLabel)}</button>
      </div>`;
    els.confirmModalOk.style.display = "none";
    els.confirmModalCancel.style.display = "none";
    els.confirmModal.style.display = "flex";
    const cleanup = (val) => {
      els.confirmModal.style.display = "none";
      els.confirmModalOk.style.display = "";
      els.confirmModalCancel.style.display = "";
      resolve(val);
    };
    document.getElementById("threeWayApply").onclick   = () => cleanup("apply");
    document.getElementById("threeWayDiscard").onclick = () => cleanup("discard");
    document.getElementById("threeWayCancel").onclick  = () => cleanup("cancel");
  });
}

// ═══════════════════════════════════════════════════════════════════
//  MODE SWITCHING
// ═══════════════════════════════════════════════════════════════════
async function applyMode(mode) {
  if (state.mode === mode) return;
  if (state.dirty && state.editingEntity) {
    const choice = await threeWayModal({
      title: "Unsaved changes",
      body: `You have unsaved edits to <code>${escapeHTML(state.editingEntity.type)}: ${escapeHTML(state.editingEntity.public_id)}</code>. Apply now, discard, or cancel?`,
    });
    if (choice === "cancel") return;
    if (choice === "apply") { const ok = await saveEditingEntity(); if (!ok) return; }
    if (choice === "discard") { discardEditingEntity(); }
  }
  state.mode = mode;
  lsSet(LS.MODE, mode);
  els.modeSwitcher.querySelectorAll(".mode-switch-btn").forEach((b) => {
    b.classList.toggle("mode-switch-btn--active", b.dataset.mode === mode);
  });
  els.authorLayout.style.display  = mode === "author"  ? "" : "none";
  els.libraryLayout.style.display = mode === "library" ? "" : "none";
  if (mode === "library") await renderLibraryMode();
}

function bindModeSwitcher() {
  els.modeSwitcher.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-switch-btn");
    if (!btn) return;
    applyMode(btn.dataset.mode);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  OVERVIEW + LIBRARY DATA
// ═══════════════════════════════════════════════════════════════════
async function loadOverview() {
  const libParam = state.currentLibraryId ? `?library_public_id=${encodeURIComponent(state.currentLibraryId)}` : "";
  const data = await api(`/api/lorecore/overview${libParam}`);

  state.libraries  = Array.isArray(data.libraries) ? data.libraries : [];
  state.books      = Array.isArray(data.books) ? data.books : [];
  state.worlds     = Array.isArray(data.worlds) ? data.worlds : [];
  state.characters = Array.isArray(data.characters) ? data.characters : [];
  state.scenes     = Array.isArray(data.scenes) ? data.scenes : [];

  const sel = data.selected_library;
  if (!state.currentLibraryId && sel) state.currentLibraryId = sel.public_id;
  if (!state.libraries.length) {
    els.libraryStatusChip.textContent = "No libraries";
    els.libraryStatusChip.className = "status-chip status-chip--bad";
    return;
  }

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

  // Index scenes by chapter
  state.scenesByChapter = {};
  for (const s of state.scenes) {
    const cid = s.chapter_public_id;
    if (!cid) continue;
    if (!state.scenesByChapter[cid]) state.scenesByChapter[cid] = [];
    state.scenesByChapter[cid].push(s);
  }
  Object.values(state.scenesByChapter).forEach((arr) =>
    arr.sort((a, b) => (parseInt(a.order_index) || 0) - (parseInt(b.order_index) || 0))
  );

  renderBookList();
}

async function loadChaptersForBook(bookId) {
  if (state.chaptersByBook[bookId]) return state.chaptersByBook[bookId];
  try {
    const data = await api(`/api/lorecore/chapters?book_public_id=${encodeURIComponent(bookId)}`);
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
    items.sort((a, b) => (parseInt(a.order_index) || 0) - (parseInt(b.order_index) || 0));
    state.chaptersByBook[bookId] = items;
    return items;
  } catch {
    state.chaptersByBook[bookId] = [];
    return [];
  }
}

function bindLibraryPicker() {
  els.libraryPicker.addEventListener("change", async (e) => {
    if (!(await checkDirty())) {
      els.libraryPicker.value = state.currentLibraryId;
      return;
    }
    state.currentLibraryId = e.target.value;
    lsSet(LS.LIBRARY_ID, state.currentLibraryId);
    state.currentBookId = null;
    state.currentSessionId = null;
    state.isFreeChat = true;
    state.chaptersByBook = {};
    state.selectedEntity = null;
    state.editingEntity = null;
    state.dirty = false;
    lsSet(LS.BOOK_ID, null);
    lsSet(LS.SESSION_ID, null);
    clearChatFeed();
    await loadOverview();
    await loadSessions();
    if (state.mode === "library") await renderLibraryMode();
    updateContextChips();
  });
}

// ═══════════════════════════════════════════════════════════════════
//  AUTHOR MODE
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
    }).join("");

  els.bookList.querySelectorAll(".book-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.book;
      if (state.currentBookId === id) {
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
  if (v === "final" || v === "active") return "final";
  if (v === "drafted" || v === "draft") return "drafted";
  if (v === "written") return "written";
  if (v === "planned" || v === "planning" || v === "pre_planning") return "planned";
  if (v === "archived" || v === "archive") return "archived";
  return "info";
}

async function loadSessions() {
  try {
    const data = await api("/api/chat-sessions?surface=lorecore&limit=30");
    state.sessions = Array.isArray(data.items) ? data.items
                   : Array.isArray(data) ? data
                   : Array.isArray(data.sessions) ? data.sessions : [];
  } catch { state.sessions = []; }
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
    }).join("");
  els.sessionList.querySelectorAll(".session-item").forEach((btn) => {
    btn.addEventListener("click", () => switchSession(btn.dataset.session));
  });
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
    messages.forEach((m) => appendChatMessage({
      role: m.role || "assistant",
      content: m.content || m.text || "",
      model: m.model || m.model_id,
      timestamp: m.created_at,
    }));
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
  } catch { state.models = []; }
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
    if (state.chatMode === "discussion") toast("Discussion mode is not yet wired", "warn");
  });
}

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

function scrollFeed() { els.chatFeed.scrollTop = els.chatFeed.scrollHeight; }

function renderMarkdown(text) {
  if (!text) return "";
  let html = escapeHTML(text);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>(?:\n|$))+/g, (m) => `<ul>${m}</ul>`);
  const blocks = html.split(/\n{2,}/).map((b) => {
    if (/^\s*<(h\d|ul|ol|pre|li|blockquote)/i.test(b)) return b;
    return `<p>${b.replace(/\n/g, "<br>")}</p>`;
  });
  return blocks.join("\n");
}

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
    if (state.chatMode === "parallel") await sendParallel(text);
    else await sendSingle(text);
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
  if (state.isFreeChat || !state.currentSessionId) {
    const reply = await callModelDirect(modelId, text);
    appendChatMessage({ role: "assistant", content: reply, model: modelId });
    return;
  }
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
  await api(`/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: { role: "user", content: text, model_public_id: modelId },
  });
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
      } catch {}
    };
    es.onerror = () => { es.close(); if (!buf) reject(new Error("Stream failed")); else resolve(); };
  });
}

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

function bindResizeHandle() {
  let dragging = false, startY = 0, startHeight = 0;
  els.chatResizeHandle.addEventListener("mousedown", (e) => {
    dragging = true; startY = e.clientY; startHeight = els.chatFeed.offsetHeight; e.preventDefault();
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
//  ═══ LIBRARY MODE ═══
// ═══════════════════════════════════════════════════════════════════

async function renderLibraryMode() {
  const expanded = lsGet(LS.EXPANDED);
  if (expanded) {
    try { state.expanded = { ...state.expanded, ...JSON.parse(expanded) }; } catch {}
  }

  els.libraryLayout.innerHTML = `
    <aside class="panel panel-left" id="canonNavPanel"></aside>
    <main class="panel panel-center" id="canonEditorPanel">
      <div class="canon-editor-empty" id="canonEditorEmpty">
        <div class="chat-placeholder-icon">📚</div>
        <div class="chat-placeholder-title">Library — pick a canon entity</div>
        <div class="muted" style="font-size:13px;">Select a world, character, book, chapter, or scene from the left rail.</div>
      </div>
      <div id="canonEditorBody" style="display:none;"></div>
    </main>
    <aside class="panel panel-right" id="canonRailPanel">
      <div class="right-block-head">
        <div class="eyebrow">Right rail</div>
        <div class="left-block-title">Provenance &amp; Actions</div>
      </div>
      <div id="canonRailBody" class="stack--md">
        <article class="card card--compact">
          <p class="muted" style="font-size:12px;margin:0;">No entity selected.</p>
        </article>
      </div>
    </aside>
  `;
  els.libraryLayout.classList.remove("lorecore-layout--placeholder");

  await renderCanonNav();

  if (state.selectedEntity) {
    const fresh = findEntity(state.selectedEntity.type, state.selectedEntity.public_id);
    if (fresh) state.selectedEntity.data = fresh;
    await renderEntityEditor(state.selectedEntity);
  }
}

async function renderCanonNav() {
  const nav = $("#canonNavPanel");
  if (!nav) return;

  for (const book of state.books) {
    if (state.expanded.book[book.public_id]) {
      await loadChaptersForBook(book.public_id);
    }
  }

  const lib = state.libraries.find((l) => l.public_id === state.currentLibraryId);

  nav.innerHTML = `
    <div class="canon-nav-header">
      <div class="eyebrow">Canon library</div>
      <strong style="font-size:13px;">${escapeHTML(lib?.name || "—")}</strong>
      <span class="muted" style="font-size:11px;">universe: <code>${escapeHTML(lib?.universe_id || "default")}</code></span>
    </div>
    <div class="canon-nav-tree" id="canonNavTree">
      ${renderCanonSection("worlds", "Worlds", state.worlds, (e) => navItemHTML(e, "world"))}
      ${renderCanonSection("characters", "Characters", state.characters, (e) => navItemHTML(e, "character"))}
      ${renderCanonSection("books", "Books", state.books, (e) => bookSubtreeHTML(e))}
    </div>
    <div class="canon-nav-actions">
      <button class="button button--small" data-create="world" type="button">+ New world</button>
      <button class="button button--small" data-create="character" type="button">+ New character</button>
    </div>
  `;

  nav.querySelectorAll("[data-tree-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.treeToggle;
      state.expanded[key] = !state.expanded[key];
      saveExpanded();
      renderCanonNav();
    });
  });
  nav.querySelectorAll("[data-book-toggle]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = el.dataset.bookToggle;
      state.expanded.book[id] = !state.expanded.book[id];
      saveExpanded();
      if (state.expanded.book[id]) await loadChaptersForBook(id);
      renderCanonNav();
    });
  });
  nav.querySelectorAll("[data-chapter-toggle]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.chapterToggle;
      state.expanded.chapter[id] = !state.expanded.chapter[id];
      saveExpanded();
      renderCanonNav();
    });
  });
  nav.querySelectorAll("[data-entity]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.type;
      const id = btn.dataset.entity;
      await selectEntity(type, id);
    });
  });
  nav.querySelectorAll("[data-create]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await createNewEntity(btn.dataset.create);
    });
  });
}

function saveExpanded() {
  lsSet(LS.EXPANDED, JSON.stringify(state.expanded));
}

function renderCanonSection(key, label, items, renderItem) {
  const open = state.expanded[key];
  const arrow = open ? "▾" : "▸";
  const body = open
    ? `<div class="canon-tree-children">${items.length ? items.map(renderItem).join("") : `<div class="lib-placeholder">None yet.</div>`}</div>`
    : "";
  return `
    <div class="canon-tree-section">
      <button class="canon-tree-row canon-tree-row--section" data-tree-toggle="${key}" type="button">
        <span class="canon-tree-arrow">${arrow}</span>
        <span class="canon-tree-label">${label}</span>
        <span class="canon-tree-count">${items.length}</span>
      </button>
      ${body}
    </div>`;
}

function navItemHTML(e, type) {
  const id = e.public_id;
  const active = state.selectedEntity?.public_id === id ? "canon-tree-row--active" : "";
  const status = e.status || "—";
  const human = e.user_modified_at ? `<span class="human-edited-badge" title="Edited by hand" style="font-size:9px;padding:1px 4px;">✎</span>` : "";
  const title = e.name || e.title || id;
  return `
    <button class="canon-tree-row ${active}" data-entity="${id}" data-type="${type}" type="button">
      <span class="canon-tree-arrow"></span>
      <span class="canon-tree-label">${escapeHTML(title)}</span>
      ${human}
      <span class="status-chip status-chip--${statusKind(status)}">${escapeHTML(status)}</span>
    </button>`;
}

function bookSubtreeHTML(book) {
  const id = book.public_id;
  const open = state.expanded.book[id];
  const arrow = open ? "▾" : "▸";
  const active = state.selectedEntity?.public_id === id ? "canon-tree-row--active" : "";
  const status = book.status || "—";
  const chapters = state.chaptersByBook[id] || [];
  const childList = open
    ? `<div class="canon-tree-children canon-tree-children--nested">
         ${chapters.length
           ? chapters.map(ch => chapterSubtreeHTML(ch)).join("")
           : `<div class="lib-placeholder">No chapters loaded.</div>`}
       </div>`
    : "";
  return `
    <div class="canon-tree-book">
      <div class="canon-tree-row-wrap">
        <button class="canon-tree-arrow-btn" data-book-toggle="${id}" type="button">${arrow}</button>
        <button class="canon-tree-row ${active}" data-entity="${id}" data-type="book" type="button">
          <span class="canon-tree-label">${escapeHTML(book.title || id)}</span>
          <span class="status-chip status-chip--${statusKind(status)}">${escapeHTML(status)}</span>
        </button>
      </div>
      ${childList}
    </div>`;
}

function chapterSubtreeHTML(ch) {
  const id = ch.public_id;
  const open = state.expanded.chapter[id];
  const arrow = open ? "▾" : "▸";
  const active = state.selectedEntity?.public_id === id ? "canon-tree-row--active" : "";
  const status = ch.status || "—";
  const scenes = state.scenesByChapter[id] || [];
  const human = ch.user_modified_at ? `<span class="human-edited-badge" title="Edited by hand" style="font-size:9px;padding:1px 4px;">✎</span>` : "";
  const childList = open
    ? `<div class="canon-tree-children canon-tree-children--nested">
         ${scenes.length
           ? scenes.map(s => sceneRowHTML(s)).join("")
           : `<div class="lib-placeholder">No scenes.</div>`}
       </div>`
    : "";
  return `
    <div class="canon-tree-chapter">
      <div class="canon-tree-row-wrap">
        <button class="canon-tree-arrow-btn" data-chapter-toggle="${id}" type="button">${arrow}</button>
        <button class="canon-tree-row ${active}" data-entity="${id}" data-type="chapter" type="button">
          <span class="canon-tree-label">${escapeHTML(ch.title || id)}</span>
          ${human}
          <span class="status-chip status-chip--${statusKind(status)}">${escapeHTML(status)}</span>
        </button>
      </div>
      ${childList}
    </div>`;
}

function sceneRowHTML(s) {
  const id = s.public_id;
  const active = state.selectedEntity?.public_id === id ? "canon-tree-row--active" : "";
  const status = s.status || "—";
  const human = s.user_modified_at ? `<span class="human-edited-badge" title="Edited by hand" style="font-size:9px;padding:1px 4px;">✎</span>` : "";
  return `
    <button class="canon-tree-row ${active} canon-tree-row--scene" data-entity="${id}" data-type="scene" type="button">
      <span class="canon-tree-arrow">·</span>
      <span class="canon-tree-label">${escapeHTML(s.title || id)}</span>
      ${human}
      <span class="status-chip status-chip--${statusKind(status)}">${escapeHTML(status)}</span>
    </button>`;
}

async function selectEntity(type, public_id) {
  if (state.editingEntity && state.editingEntity.public_id === public_id) return;
  if (!(await checkDirty())) return;

  const data = findEntity(type, public_id);
  if (!data) {
    toast(`Could not find ${type}: ${public_id}`, "bad");
    return;
  }
  state.selectedEntity = { type, public_id, data };
  await renderEntityEditor(state.selectedEntity);
  await renderCanonNav();
}

async function checkDirty() {
  if (!state.dirty || !state.editingEntity) return true;
  const choice = await threeWayModal({
    title: "Unsaved changes",
    body: `You have unsaved edits to <code>${escapeHTML(state.editingEntity.type)}: ${escapeHTML(state.editingEntity.public_id)}</code>. Apply them now, discard them, or cancel?`,
  });
  if (choice === "cancel")  return false;
  if (choice === "apply")   return await saveEditingEntity();
  if (choice === "discard") { discardEditingEntity(); return true; }
  return false;
}

function discardEditingEntity() {
  state.editingEntity = null;
  state.dirty = false;
}

async function renderEntityEditor(sel) {
  const empty = $("#canonEditorEmpty");
  const body  = $("#canonEditorBody");
  if (!empty || !body) return;
  empty.style.display = "none";
  body.style.display = "block";

  const isEditing = state.editingEntity?.public_id === sel.public_id;
  const data = isEditing ? { ...sel.data, ...state.editingEntity.draft } : sel.data;

  let editorHTML = "";
  switch (sel.type) {
    case "world":     editorHTML = worldEditorHTML(data, isEditing); break;
    case "character": editorHTML = characterEditorHTML(data, isEditing); break;
    case "book":      editorHTML = bookEditorHTML(data, isEditing); break;
    case "chapter":   editorHTML = chapterEditorHTML(data, isEditing); break;
    case "scene":     editorHTML = sceneEditorHTML(data, isEditing); break;
  }

  body.innerHTML = `
    <div class="entity-card ${isEditing ? "entity-card--editing" : ""}" id="entityCard">
      <div class="entity-card-head">
        <div>
          <div class="eyebrow">${sel.type}</div>
          <h2 class="entity-title">${escapeHTML(data.name || data.title || sel.public_id)}</h2>
          <code class="muted" style="font-size:11px;">${escapeHTML(sel.public_id)}</code>
        </div>
        <div class="entity-card-actions">
          ${isEditing
            ? `<span class="editing-chip">EDITING</span>`
            : `<span class="status-chip status-chip--${statusKind(data.status)}">${escapeHTML(data.status || "—")}</span>`
          }
          ${data.user_modified_at ? `<span class="human-edited-badge" title="${escapeHTML(formatDate(data.user_modified_at))}">Edited by hand</span>` : ""}
          ${isEditing
            ? `<button class="button button--small" id="cancelEditBtn" type="button">Cancel</button>
               <button class="button button--small button--primary" id="saveEditBtn" type="button">Save…</button>`
            : `<button class="edit-toggle" id="enterEditBtn" type="button">✎ Edit</button>`
          }
        </div>
      </div>

      <div class="provenance-row">
        ${data.pipeline_run_id ? `<span>Run: <a href="../pipelines/?run=${encodeURIComponent(data.pipeline_run_id)}" target="_blank">${escapeHTML(data.pipeline_run_id)}</a></span>` : `<span class="muted">No pipeline run</span>`}
        ${data.pipeline_origin ? `<span>Origin: <code>${escapeHTML(data.pipeline_origin)}</code></span>` : ""}
        ${data.updated_at ? `<span>Updated: ${escapeHTML(formatDate(data.updated_at))}</span>` : ""}
        ${data.created_at ? `<span>Created: ${escapeHTML(formatDate(data.created_at))}</span>` : ""}
      </div>

      <div class="entity-body">${editorHTML}</div>
    </div>
  `;

  const enter = $("#enterEditBtn");
  if (enter) enter.addEventListener("click", () => enterEditMode(sel));

  const cancel = $("#cancelEditBtn");
  if (cancel) cancel.addEventListener("click", async () => {
    if (state.dirty) {
      const ok = await confirmModal({
        title: "Discard changes?",
        body: "Your edits will be lost.",
        okLabel: "Discard",
        okKind: "danger",
      });
      if (!ok) return;
    }
    discardEditingEntity();
    await renderEntityEditor(state.selectedEntity);
    await renderCanonNav();
  });

  const save = $("#saveEditBtn");
  if (save) save.addEventListener("click", async () => {
    const ok = await saveEditingEntity();
    if (ok) {
      await renderEntityEditor(state.selectedEntity);
      await renderCanonNav();
    }
  });

  if (isEditing) {
    body.querySelectorAll("[data-field]").forEach((el) => {
      el.addEventListener("input", () => {
        state.editingEntity.draft[el.dataset.field] = el.value;
        state.dirty = true;
      });
    });
  }

  renderEntityRail(sel, data, isEditing);
}

// ─── Field helpers ──────────────────────────────────────────────────
function readonlyMarkdown(text) {
  if (!text || !String(text).trim()) return `<div class="muted" style="font-style:italic;">Empty</div>`;
  return `<div class="entity-readonly entity-readonly--md">${renderMarkdown(text)}</div>`;
}

function fieldRow(label, value, fieldKey, isEditing, opts = {}) {
  const { rows = 2, multiline = true } = opts;
  if (!isEditing) {
    return `
      <div class="entity-field">
        <div class="eyebrow">${escapeHTML(label)}</div>
        ${value && String(value).trim()
          ? `<div class="entity-readonly">${escapeHTML(value)}</div>`
          : `<div class="muted" style="font-style:italic;">Empty</div>`}
      </div>`;
  }
  return `
    <div class="entity-field">
      <div class="eyebrow">${escapeHTML(label)}</div>
      ${multiline
        ? `<textarea class="entity-editable" data-field="${escapeHTML(fieldKey)}" rows="${rows}">${escapeHTML(value || "")}</textarea>`
        : `<input class="entity-editable" data-field="${escapeHTML(fieldKey)}" value="${escapeHTML(value || "")}" />`}
    </div>`;
}

function markdownFieldRow(label, value, fieldKey, isEditing, rows = 8) {
  if (!isEditing) {
    return `
      <div class="entity-field">
        <div class="eyebrow">${escapeHTML(label)}</div>
        ${readonlyMarkdown(value)}
      </div>`;
  }
  return `
    <div class="entity-field">
      <div class="eyebrow">${escapeHTML(label)}</div>
      <textarea class="entity-editable entity-editable--md" data-field="${escapeHTML(fieldKey)}" rows="${rows}">${escapeHTML(value || "")}</textarea>
    </div>`;
}

// ─── Per-entity editors ─────────────────────────────────────────────
function worldEditorHTML(d, isEditing) {
  return `
    ${fieldRow("Name", d.name, "name", isEditing, { multiline: false })}
    ${fieldRow("Canon state", d.canon_state, "canon_state", isEditing, { multiline: false })}
    ${markdownFieldRow("Summary", d.summary, "summary", isEditing, 6)}
    ${markdownFieldRow("Locations", d.locations, "locations", isEditing, 6)}
    ${markdownFieldRow("Factions", d.factions, "factions", isEditing, 6)}
    ${markdownFieldRow("Notes", d.notes, "notes", isEditing, 5)}
  `;
}

function characterEditorHTML(d, isEditing) {
  return `
    ${fieldRow("Name", d.name, "name", isEditing, { multiline: false })}
    ${fieldRow("Role", d.role, "role", isEditing, { multiline: false })}
    ${markdownFieldRow("Summary", d.summary, "summary", isEditing, 6)}
    ${markdownFieldRow("Goals", d.goals, "goals", isEditing, 4)}
    ${markdownFieldRow("Traits", d.traits, "traits", isEditing, 4)}
    ${markdownFieldRow("Notes", d.notes, "notes", isEditing, 5)}
  `;
}

function bookEditorHTML(d, isEditing) {
  return `
    ${fieldRow("Title", d.title, "title", isEditing, { multiline: false })}
    ${fieldRow("Genre", d.genre, "genre", isEditing, { multiline: false })}
    ${markdownFieldRow("Premise", d.premise, "premise", isEditing, 4)}
    <div class="entity-field">
      <div class="eyebrow" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Outline (canonical plan)</span>
        ${!isEditing && d.outline ? `<span class="muted" style="font-size:11px;">${formatBytes(d.outline.length)} · ${countLines(d.outline)} lines</span>` : ""}
      </div>
      ${isEditing
        ? `<textarea class="entity-editable entity-editable--md" data-field="outline" rows="32" style="font-family:ui-monospace,monospace;font-size:12px;">${escapeHTML(d.outline || "")}</textarea>`
        : readonlyMarkdown(d.outline)}
    </div>
    ${markdownFieldRow("Manuscript", d.manuscript, "manuscript", isEditing, 12)}
    ${markdownFieldRow("Notes", d.notes, "notes", isEditing, 5)}
  `;
}

function chapterEditorHTML(d, isEditing) {
  let briefHTML = "";
  if (d.brief && String(d.brief).trim()) {
    if (isEditing) {
      briefHTML = `<textarea class="entity-editable" data-field="brief" rows="16" style="font-family:ui-monospace,monospace;font-size:11px;">${escapeHTML(d.brief)}</textarea>`;
    } else {
      try {
        const parsed = JSON.parse(d.brief);
        const scenes = parsed.scenes || [];
        briefHTML = scenes.length
          ? `<div class="scene-cards">${scenes.map(sceneCardHTML).join("")}</div>`
          : `<pre class="entity-readonly" style="font-size:11px;">${escapeHTML(d.brief)}</pre>`;
      } catch {
        briefHTML = `<pre class="entity-readonly" style="font-size:11px;">${escapeHTML(d.brief)}</pre>`;
      }
    }
  } else {
    briefHTML = `<div class="muted" style="font-style:italic;">No brief.</div>`;
  }

  const verdict = d.verdict ? `
    <div class="entity-field verdict-block">
      <div class="eyebrow">Verdict ${d.verdict_score ? `· score ${d.verdict_score}` : ""}</div>
      <div class="entity-readonly">${renderMarkdown(d.verdict)}</div>
    </div>` : "";

  return `
    ${fieldRow("Title", d.title, "title", isEditing, { multiline: false })}
    <div class="chapter-split">
      <div class="chapter-split-left">
        <div class="eyebrow">Brief — scene plan</div>
        ${briefHTML}
        ${verdict}
      </div>
      <div class="chapter-split-right">
        <div class="eyebrow">Content (prose)</div>
        ${isEditing
          ? `<textarea class="entity-editable entity-editable--prose" data-field="content" rows="40">${escapeHTML(d.content || "")}</textarea>`
          : readonlyMarkdown(d.content)}
      </div>
    </div>
    ${markdownFieldRow("Notes", d.notes, "notes", isEditing, 4)}
  `;
}

function sceneCardHTML(s) {
  const beats = Array.isArray(s.key_beats) ? s.key_beats : [];
  return `
    <div class="scene-card">
      <div class="scene-card-head">
        <strong>${escapeHTML(s.letter || "")}. ${escapeHTML(s.title || "")}</strong>
        ${s.target_words ? `<span class="muted" style="font-size:11px;">${escapeHTML(String(s.target_words))} words</span>` : ""}
      </div>
      ${s.pov ? `<div class="scene-card-meta"><span class="soft">POV:</span> ${escapeHTML(s.pov)}</div>` : ""}
      ${s.location ? `<div class="scene-card-meta"><span class="soft">Location:</span> ${escapeHTML(s.location)}</div>` : ""}
      ${s.opening_state ? `<div class="scene-card-section"><span class="soft">Opens:</span> ${escapeHTML(s.opening_state)}</div>` : ""}
      ${beats.length ? `<div class="scene-card-section"><span class="soft">Key beats:</span><ul>${beats.map(b => `<li>${escapeHTML(b)}</li>`).join("")}</ul></div>` : ""}
      ${s.ending_state ? `<div class="scene-card-section"><span class="soft">Ends:</span> ${escapeHTML(s.ending_state)}</div>` : ""}
      ${s.voice_notes ? `<div class="scene-card-section scene-card-voice"><span class="soft">Voice:</span> ${escapeHTML(s.voice_notes)}</div>` : ""}
    </div>`;
}

function sceneEditorHTML(d, isEditing) {
  const verdict = d.verdict ? `
    <div class="entity-field verdict-block">
      <div class="eyebrow">Verdict ${d.verdict_score ? `· score ${d.verdict_score}` : ""}</div>
      <div class="entity-readonly">${renderMarkdown(d.verdict)}</div>
    </div>` : "";
  return `
    ${fieldRow("Title", d.title, "title", isEditing, { multiline: false })}
    ${markdownFieldRow("Summary", d.summary, "summary", isEditing, 4)}
    ${markdownFieldRow("Brief", d.brief, "brief", isEditing, 6)}
    ${markdownFieldRow("Beat notes", d.beat_notes, "beat_notes", isEditing, 4)}
    <div class="entity-field">
      <div class="eyebrow">Content (prose)</div>
      ${isEditing
        ? `<textarea class="entity-editable entity-editable--prose" data-field="content" rows="32">${escapeHTML(d.content || "")}</textarea>`
        : readonlyMarkdown(d.content)}
    </div>
    ${verdict}
  `;
}

// ─── Right rail content ─────────────────────────────────────────────
function renderEntityRail(sel, data, isEditing) {
  const rail = $("#canonRailBody");
  if (!rail) return;

  const status = data.status || "—";
  const cards = [];

  cards.push(`
    <article class="card card--compact">
      <div class="eyebrow">Identifiers</div>
      <div class="context-rows">
        <div class="context-row"><span class="soft">Type</span><strong>${escapeHTML(sel.type)}</strong></div>
        <div class="context-row"><span class="soft">Public ID</span><strong>${escapeHTML(sel.public_id)}</strong></div>
        ${data.library_public_id ? `<div class="context-row"><span class="soft">Library</span><strong>${escapeHTML(data.library_public_id)}</strong></div>` : ""}
        ${data.book_public_id ? `<div class="context-row"><span class="soft">Book</span><strong>${escapeHTML(data.book_public_id)}</strong></div>` : ""}
        ${data.chapter_public_id ? `<div class="context-row"><span class="soft">Chapter</span><strong>${escapeHTML(data.chapter_public_id)}</strong></div>` : ""}
      </div>
    </article>`);

  cards.push(`
    <article class="card card--compact">
      <div class="eyebrow">Status</div>
      <div style="margin-top:6px;">
        <span class="status-chip status-chip--${statusKind(status)}">${escapeHTML(status)}</span>
      </div>
      ${data.user_modified_at
        ? `<div class="muted" style="font-size:11px;margin-top:8px;">Last human edit: ${escapeHTML(formatDate(data.user_modified_at))}</div>`
        : `<div class="muted" style="font-size:11px;margin-top:8px;font-style:italic;">Never edited by hand</div>`}
      ${data.retry_count != null && Number(data.retry_count) > 0
        ? `<div class="muted" style="font-size:11px;margin-top:4px;">Retry count: ${escapeHTML(String(data.retry_count))}</div>`
        : ""}
    </article>`);

  cards.push(`
    <article class="card card--compact">
      <div class="eyebrow">Provenance</div>
      ${data.pipeline_run_id
        ? `<div style="margin-top:6px;font-size:12px;">Run: <a href="../pipelines/?run=${encodeURIComponent(data.pipeline_run_id)}" target="_blank" style="color:var(--accent-2);">${escapeHTML(data.pipeline_run_id)}</a></div>`
        : `<div class="muted" style="margin-top:6px;font-size:12px;font-style:italic;">No pipeline run</div>`}
      ${data.pipeline_origin
        ? `<div style="margin-top:4px;font-size:12px;">Origin: <code>${escapeHTML(data.pipeline_origin)}</code></div>`
        : ""}
    </article>`);

  if (isEditing) {
    cards.push(`
      <article class="card card--compact" style="border-color: var(--accent);">
        <div class="eyebrow" style="color:var(--accent-2);">Editing</div>
        <p style="font-size:12px;margin:6px 0 8px;">Per-entity edit mode is active. Save will:</p>
        <ul style="font-size:12px;margin:0;padding-left:18px;color:var(--text-soft);">
          <li>Set status to <code>final</code></li>
          <li>Mark this entity as human-edited</li>
          <li>Require confirmation</li>
        </ul>
      </article>`);
  }

  rail.innerHTML = cards.join("");
}

// ─── Edit lifecycle ─────────────────────────────────────────────────
async function enterEditMode(sel) {
  if (state.editingEntity && state.editingEntity.public_id !== sel.public_id) {
    if (!(await checkDirty())) return;
  }
  state.editingEntity = { type: sel.type, public_id: sel.public_id, draft: {} };
  state.dirty = false;
  await renderEntityEditor(sel);
  await renderCanonNav();
}

async function saveEditingEntity() {
  if (!state.editingEntity) return false;
  const { type, public_id, draft } = state.editingEntity;
  const fieldsChanged = Object.keys(draft);

  if (!fieldsChanged.length) {
    discardEditingEntity();
    return true;
  }

  const fieldList = fieldsChanged.map((f) => `<code>${escapeHTML(f)}</code>`).join(", ");
  const ok = await confirmModal({
    title: "Apply changes to canonical library?",
    body: `
      <p>You're about to update <code>${escapeHTML(type)}: ${escapeHTML(public_id)}</code>.</p>
      <p>Fields changing: ${fieldList}</p>
      <p>This will:</p>
      <ul style="margin:4px 0 0 18px;color:var(--text-soft);">
        <li>Set <code>status</code> to <strong>final</strong> (human-canonical)</li>
        <li>Mark <code>user_modified_at</code> as now</li>
        <li>Become the new source of truth for this entity</li>
      </ul>`,
    okLabel: "Apply changes",
  });
  if (!ok) return false;

  const payload = {
    ...draft,
    status: "final",
    user_modified_at: new Date().toISOString(),
  };

  const endpoint = endpointForType(type, public_id);
  if (!endpoint) {
    toast(`No endpoint for type: ${type}`, "bad");
    return false;
  }

  try {
    const updated = await api(endpoint, { method: "PUT", body: payload });
    updateLocalEntity(type, public_id, updated || { ...state.selectedEntity.data, ...payload });
    state.editingEntity = null;
    state.dirty = false;
    if (state.selectedEntity?.public_id === public_id) {
      state.selectedEntity.data = findEntity(type, public_id) || state.selectedEntity.data;
    }
    toast("Saved to canonical library", "good");
    return true;
  } catch (e) {
    toast(`Save failed: ${e.message}`, "bad");
    return false;
  }
}

function endpointForType(type, public_id) {
  const enc = encodeURIComponent(public_id);
  switch (type) {
    case "world":     return `/api/lorecore/worlds/${enc}`;
    case "character": return `/api/lorecore/characters/${enc}`;
    case "book":      return `/api/lorecore/books/${enc}`;
    case "chapter":   return `/api/lorecore/chapters/${enc}`;
    case "scene":     return `/api/lorecore/scenes/${enc}`;
    default: return null;
  }
}

function updateLocalEntity(type, public_id, updated) {
  const merge = (obj) => Object.assign(obj, updated);
  if (type === "world") {
    const i = state.worlds.findIndex((w) => w.public_id === public_id);
    if (i >= 0) merge(state.worlds[i]);
  } else if (type === "character") {
    const i = state.characters.findIndex((c) => c.public_id === public_id);
    if (i >= 0) merge(state.characters[i]);
  } else if (type === "book") {
    const i = state.books.findIndex((b) => b.public_id === public_id);
    if (i >= 0) merge(state.books[i]);
  } else if (type === "chapter") {
    for (const arr of Object.values(state.chaptersByBook)) {
      const i = arr.findIndex((c) => c.public_id === public_id);
      if (i >= 0) { merge(arr[i]); break; }
    }
  } else if (type === "scene") {
    const i = state.scenes.findIndex((s) => s.public_id === public_id);
    if (i >= 0) merge(state.scenes[i]);
    for (const arr of Object.values(state.scenesByChapter)) {
      const j = arr.findIndex((s) => s.public_id === public_id);
      if (j >= 0) merge(arr[j]);
    }
  }
}

function findEntity(type, public_id) {
  if (type === "world")     return state.worlds.find((w) => w.public_id === public_id);
  if (type === "character") return state.characters.find((c) => c.public_id === public_id);
  if (type === "book")      return state.books.find((b) => b.public_id === public_id);
  if (type === "chapter") {
    for (const arr of Object.values(state.chaptersByBook)) {
      const f = arr.find((c) => c.public_id === public_id);
      if (f) return f;
    }
  }
  if (type === "scene") return state.scenes.find((s) => s.public_id === public_id);
  return null;
}

async function createNewEntity(type) {
  if (!state.currentLibraryId) { toast("Pick a library first", "warn"); return; }
  if (!(await checkDirty())) return;

  const name = prompt(`New ${type} — name:`);
  if (!name || !name.trim()) return;

  const payload = {
    name: name.trim(),
    library_public_id: state.currentLibraryId,
    status: "drafted",
  };

  try {
    const endpoint = type === "world" ? "/api/lorecore/worlds" : "/api/lorecore/characters";
    const created = await api(endpoint, { method: "POST", body: payload });
    if (!created || !created.public_id) {
      throw new Error("Server did not return a public_id");
    }
    if (type === "world") state.worlds.push(created);
    else state.characters.push(created);
    state.selectedEntity = { type, public_id: created.public_id, data: created };
    state.editingEntity = { type, public_id: created.public_id, draft: {} };
    state.dirty = false;
    await renderCanonNav();
    await renderEntityEditor(state.selectedEntity);
    toast(`Created ${type} — now in edit mode`, "good");
  } catch (e) {
    toast(`Create failed: ${e.message}`, "bad");
  }
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
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function countLines(s) { return s ? s.split("\n").length : 0; }

// ═══════════════════════════════════════════════════════════════════
//  INJECT LIBRARY-MODE CSS
// ═══════════════════════════════════════════════════════════════════
function injectLibraryCSS() {
  if (document.getElementById("lorecore-library-css")) return;
  const css = `
    .lorecore-layout--placeholder { display: grid !important; }

    .canon-nav-header {
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .canon-nav-tree {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-right: 2px;
    }
    .canon-nav-actions {
      display: flex;
      gap: 6px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      margin-top: 10px;
    }
    .canon-nav-actions .button { flex: 1; }

    .canon-tree-section {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 4px;
    }
    .canon-tree-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: 12px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      font-family: inherit;
      transition: all 0.12s;
    }
    .canon-tree-row:hover {
      background: var(--bg-elev);
      border-color: var(--border);
    }
    .canon-tree-row--active {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent-2);
    }
    .canon-tree-row--section {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 10px;
      color: var(--text-soft);
      padding: 4px 6px;
    }
    .canon-tree-row--scene {
      font-size: 11px;
      padding: 3px 8px;
      color: var(--text-soft);
    }
    .canon-tree-arrow {
      width: 12px;
      flex-shrink: 0;
      color: var(--text-mute);
      font-size: 10px;
    }
    .canon-tree-arrow-btn {
      width: 18px;
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: var(--text-mute);
      cursor: pointer;
      font-size: 10px;
      padding: 0;
    }
    .canon-tree-arrow-btn:hover { color: var(--accent-2); }
    .canon-tree-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .canon-tree-count {
      background: var(--bg-elev-2);
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 9px;
      color: var(--text-mute);
    }
    .canon-tree-children {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-left: 14px;
    }
    .canon-tree-children--nested {
      padding-left: 22px;
      border-left: 1px solid var(--border-soft);
      margin-left: 8px;
    }
    .canon-tree-row-wrap {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .canon-tree-row-wrap .canon-tree-row { flex: 1; }

    .canon-editor-empty {
      margin: auto;
      text-align: center;
      color: var(--text-mute);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 60px 20px;
    }
    .panel-center {
      padding: 16px !important;
      overflow-y: auto;
    }
    .entity-card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .entity-title {
      font-size: 18px;
      margin: 4px 0 2px;
      line-height: 1.2;
    }
    .entity-card-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .entity-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .entity-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .entity-readonly {
      background: var(--bg-elev);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text);
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 480px;
      overflow-y: auto;
    }
    .entity-readonly--md p { margin: 6px 0; }
    .entity-readonly--md h1, .entity-readonly--md h2, .entity-readonly--md h3, .entity-readonly--md h4 {
      margin: 10px 0 4px;
      color: var(--accent-2);
    }
    .entity-readonly--md ul, .entity-readonly--md ol {
      margin: 6px 0;
      padding-left: 22px;
    }
    .entity-readonly--md pre {
      background: rgba(0,0,0,0.3);
      padding: 8px;
      border-radius: var(--radius-sm);
      overflow-x: auto;
      font-size: 12px;
    }
    .entity-readonly--md code {
      background: rgba(0,0,0,0.25);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 12px;
    }
    .entity-editable--md, .entity-editable--prose {
      font-family: inherit;
      line-height: 1.55;
    }
    .entity-editable--prose {
      min-height: 300px;
    }

    .chapter-split {
      display: grid;
      grid-template-columns: minmax(0, 380px) 1fr;
      gap: 14px;
      align-items: start;
    }
    @media (max-width: 1100px) {
      .chapter-split { grid-template-columns: 1fr; }
    }
    .chapter-split-left, .chapter-split-right {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .chapter-split-left {
      max-height: 720px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .scene-cards {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .scene-card {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.5;
    }
    .scene-card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      gap: 8px;
    }
    .scene-card-head strong {
      color: var(--accent-2);
      font-size: 13px;
    }
    .scene-card-meta {
      font-size: 11px;
      color: var(--text-soft);
      margin: 2px 0;
    }
    .scene-card-section {
      margin: 6px 0;
    }
    .scene-card-section ul {
      margin: 4px 0;
      padding-left: 18px;
    }
    .scene-card-section li {
      margin: 2px 0;
      color: var(--text);
    }
    .scene-card-voice {
      font-style: italic;
      color: var(--text-soft);
      font-size: 11px;
      border-top: 1px dashed var(--border-soft);
      padding-top: 6px;
      margin-top: 8px;
    }

    .verdict-block {
      background: var(--bg-elev);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
    }
  `;
  const style = document.createElement("style");
  style.id = "lorecore-library-css";
  style.textContent = css;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  bindEls();
  injectLibraryCSS();

  state.mode             = lsGet(LS.MODE) || "author";
  state.currentLibraryId = lsGet(LS.LIBRARY_ID) || null;
  state.currentBookId    = lsGet(LS.BOOK_ID) || null;
  state.currentSessionId = lsGet(LS.SESSION_ID) || null;
  state.chatMode         = lsGet(LS.CHAT_MODE) || "single";
  state.isFreeChat       = !state.currentSessionId;

  els.modeSwitcher.querySelectorAll(".mode-switch-btn").forEach((b) => {
    b.classList.toggle("mode-switch-btn--active", b.dataset.mode === state.mode);
  });
  els.authorLayout.style.display  = state.mode === "author"  ? "" : "none";
  els.libraryLayout.style.display = state.mode === "library" ? "" : "none";
  bindModeSwitcher();

  els.chatModeCards.querySelectorAll(".mode-card").forEach((c) => {
    c.classList.toggle("mode-card--active", c.dataset.mode === state.chatMode);
  });

  bindLibraryPicker();
  bindChatModeCards();
  bindResizeHandle();

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
    if (!(await checkDirty())) return;
    state.chaptersByBook = {};
    await loadOverview();
    await loadSessions();
    await loadModels();
    if (state.mode === "library") await renderLibraryMode();
    toast("Refreshed", "good");
  });
  els.extractSaveBtn.addEventListener("click", extractAndSave);

  window.addEventListener("beforeunload", (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    }
  });

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

    if (state.mode === "library") {
      await renderLibraryMode();
    }
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
