const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const state = {
  overview: null,
  books: [],
  sessions: [],
  drafts: [],
  notes: [],
  worlds: [],
  characters: [],
  scenes: [],
  selectedBookId: null,
  selectedSessionId: null,
  selectedDraftId: null,
  selectedNoteId: null
};

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

function setOverviewStatus(text, toneClass = "status-chip--good") {
  const chip = qs("#overviewStatusChip");
  if (!chip) return;
  chip.textContent = text;
  chip.className = `status-chip ${toneClass}`;
}

function setWorkspaceStatus(text, toneClass = "status-chip--warn") {
  const chip = qs("#workspaceStatusChip");
  if (!chip) return;
  chip.textContent = text;
  chip.className = `status-chip ${toneClass}`;
}

async function api(path, options = {}) {
  const config = {
    method: "GET",
    headers: {},
    ...options
  };

  if (config.body && typeof config.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(`${PM_API_BASE}${path}`, config);
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: String(error)
    };
  }
}

function normalizeList(body, keys) {
  for (const key of keys) {
    if (Array.isArray(body?.[key])) {
      return body[key];
    }
  }
  return Array.isArray(body) ? body : [];
}

function normalizeBook(raw, index = 0) {
  return {
    id: raw?.book_public_id || raw?.public_id || raw?.id || `book_${index + 1}`,
    title: raw?.title || raw?.name || raw?.book_title || `Book ${index + 1}`,
    description: raw?.description || raw?.summary || raw?.notes || "",
    status: raw?.status || raw?.phase || raw?.stage || "",
    raw
  };
}

function normalizeSession(raw, index = 0) {
  const messages = Array.isArray(raw?.messages)
    ? raw.messages
    : Array.isArray(raw?.history)
      ? raw.history
      : Array.isArray(raw?.items)
        ? raw.items
        : [];

  return {
    id: raw?.session_public_id || raw?.public_id || raw?.id || `session_${index + 1}`,
    title: raw?.title || raw?.name || raw?.label || `Session ${index + 1}`,
    messages,
    raw
  };
}

function normalizeSimpleItem(raw, index = 0, prefix = "item") {
  return {
    id: raw?.public_id || raw?.id || raw?.draft_public_id || raw?.note_public_id || `${prefix}_${index + 1}`,
    title: raw?.title || raw?.name || raw?.label || `${prefix} ${index + 1}`,
    description: raw?.description || raw?.summary || raw?.content || raw?.text || "",
    raw
  };
}

function getSelectedBook() {
  return state.books.find((book) => book.id === state.selectedBookId) || state.books[0] || null;
}

function getSelectedSession() {
  return state.sessions.find((session) => session.id === state.selectedSessionId) || state.sessions[0] || null;
}

function getSelectedDraft() {
  return state.drafts.find((draft) => draft.id === state.selectedDraftId) || state.drafts[0] || null;
}

function getSelectedNote() {
  return state.notes.find((note) => note.id === state.selectedNoteId) || state.notes[0] || null;
}

function renderSessionSelect() {
  const select = qs("#sessionSelect");
  const meta = qs("#sessionMeta");
  if (!select || !meta) return;

  if (!state.sessions.length) {
    select.innerHTML = `<option value="">No session available</option>`;
    select.value = "";
    meta.textContent = "No LoreCore session was found in /api/lorecore/overview. No session-create route is confirmed in main.py.";
    return;
  }

  select.innerHTML = state.sessions
    .map(
      (session) =>
        `<option value="${escapeHtml(session.id)}">${escapeHtml(session.title)}</option>`
    )
    .join("");

  select.value = state.selectedSessionId || state.sessions[0].id;
  const active = getSelectedSession();
  meta.textContent = active
    ? `Active discussion session: ${active.title}`
    : "Select a session to send discussion messages.";
}

function renderBookList() {
  const list = qs("#bookList");
  const select = qs("#bookSelect");
  if (!list || !select) return;

  if (!state.books.length) {
    list.innerHTML = `
      <div class="library-card">
        <strong>No books</strong>
        <span>Create one with the real <code>POST /api/lorecore/books</code> route.</span>
      </div>
    `;
    select.innerHTML = `<option value="">No books</option>`;
    return;
  }

  list.innerHTML = state.books
    .map(
      (book) => `
        <button class="library-card ${book.id === state.selectedBookId ? "library-card--active" : ""}" type="button" data-book-id="${escapeHtml(book.id)}">
          <strong>${escapeHtml(book.title)}</strong>
          <span>${escapeHtml(book.status || "No status")}</span>
        </button>
      `
    )
    .join("");

  select.innerHTML = state.books
    .map(
      (book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)}</option>`
    )
    .join("");

  select.value = state.selectedBookId || state.books[0].id;
}

function renderDraftList() {
  const list = qs("#draftList");
  if (!list) return;

  if (!state.drafts.length) {
    list.innerHTML = `
      <div class="library-card">
        <strong>No drafts</strong>
        <span><code>GET /api/lorecore/drafts</code> returned no usable drafts.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = state.drafts
    .map(
      (draft) => `
        <button class="library-card ${draft.id === state.selectedDraftId ? "library-card--active" : ""}" type="button" data-draft-id="${escapeHtml(draft.id)}">
          <strong>${escapeHtml(draft.title)}</strong>
          <span>${escapeHtml((draft.description || "").slice(0, 80) || "No preview")}</span>
        </button>
      `
    )
    .join("");
}

function renderNoteList() {
  const list = qs("#noteList");
  if (!list) return;

  if (!state.notes.length) {
    list.innerHTML = `
      <div class="library-card">
        <strong>No notes</strong>
        <span><code>GET /api/lorecore/notes</code> returned no usable notes.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = state.notes
    .map(
      (note) => `
        <button class="library-card ${note.id === state.selectedNoteId ? "library-card--active" : ""}" type="button" data-note-id="${escapeHtml(note.id)}">
          <strong>${escapeHtml(note.title)}</strong>
          <span>${escapeHtml((note.description || "").slice(0, 80) || "No preview")}</span>
        </button>
      `
    )
    .join("");
}

function renderBookWorkspace() {
  const book = getSelectedBook();

  qs("#activeBookMetric").textContent = book?.title || "—";
  qs("#draftCountMetric").textContent = String(state.drafts.length);
  qs("#noteCountMetric").textContent = String(state.notes.length);
  qs("#activeSessionMetric").textContent = getSelectedSession()?.title || "—";

  qs("#bookTitle").value = book?.title || "";
  qs("#bookStatus").value = book?.status || "";
  qs("#bookDescription").value = book?.description || "";

  qs("#previewBookTitle").textContent = book?.title || "—";
  qs("#previewBookDescription").textContent = book?.description || "Select a book to inspect its story context.";

  const countBox = qs("#overviewCountBox");
  if (countBox) {
    countBox.innerHTML = `
      <strong>${state.books.length} books · ${state.drafts.length} drafts · ${state.notes.length} notes</strong>
      <span>${state.sessions.length} sessions · ${state.worlds.length} worlds · ${state.characters.length} characters · ${state.scenes.length} scenes</span>
    `;
  }

  if (book) {
    setWorkspaceStatus("Book context loaded", "status-chip--good");
  } else {
    setWorkspaceStatus("No active book", "status-chip--warn");
  }
}

function renderDraftPreview() {
  const draft = getSelectedDraft();
  const box = qs("#draftPreviewBox");
  if (!box) return;

  if (!draft) {
    box.innerHTML = `
      <strong>No draft selected</strong>
      <span>Select a draft from the left rail.</span>
    `;
    return;
  }

  box.innerHTML = `
    <strong>${escapeHtml(draft.title)}</strong>
    <span>${escapeHtml(draft.description || "No draft description")}</span>
  `;
}

function renderNotePreview() {
  const note = getSelectedNote();
  const box = qs("#notePreviewBox");
  if (!box) return;

  if (!note) {
    box.innerHTML = `
      <strong>No note selected</strong>
      <span>Select a note from the left rail.</span>
    `;
    return;
  }

  box.innerHTML = `
    <strong>${escapeHtml(note.title)}</strong>
    <span>${escapeHtml(note.description || "No note description")}</span>
  `;
}

function renderMessageFeed() {
  const feed = qs("#messageFeed");
  if (!feed) return;

  const session = getSelectedSession();
  const messages = Array.isArray(session?.messages) ? session.messages : [];

  if (!session) {
    feed.innerHTML = `
      <strong>No session available</strong>
      <span>No session from overview means discussion send is blocked, because no LoreCore session-create route is confirmed.</span>
    `;
    return;
  }

  if (!messages.length) {
    feed.innerHTML = `
      <strong>${escapeHtml(session.title)}</strong>
      <span>No message history was exposed in the overview payload for this session.</span>
    `;
    return;
  }

  feed.innerHTML = messages
    .map((message, index) => {
      const role = message?.role || message?.author || message?.speaker || `message ${index + 1}`;
      const content = message?.content || message?.text || message?.body || JSON.stringify(message);
      return `
        <div style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.08);">
          <strong>${escapeHtml(role)}</strong>
          <div style="margin-top:6px;">${escapeHtml(content)}</div>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  renderSessionSelect();
  renderBookList();
  renderDraftList();
  renderNoteList();
  renderBookWorkspace();
  renderDraftPreview();
  renderNotePreview();
  renderMessageFeed();
}

async function loadOverview() {
  setOverviewStatus("Loading overview", "status-chip--warn");

  const [overviewResult, draftsResult, notesResult] = await Promise.all([
    api("/api/lorecore/overview"),
    api("/api/lorecore/drafts"),
    api("/api/lorecore/notes")
  ]);

  if (!overviewResult.ok) {
    state.overview = null;
    state.books = [];
    state.sessions = [];
    state.worlds = [];
    state.characters = [];
    state.scenes = [];
    setOverviewStatus("Overview failed", "status-chip--warn");
    renderAll();
    showToast("GET /api/lorecore/overview failed", "warn");
    return;
  }

  state.overview = overviewResult.body;

  const overview = overviewResult.body || {};

  state.books = normalizeList(overview, ["books", "book_library", "items"]).map(normalizeBook);
  state.sessions = normalizeList(overview, ["sessions", "discussion_sessions", "chat_sessions"]).map(normalizeSession);
  state.worlds = normalizeList(overview, ["worlds"]);
  state.characters = normalizeList(overview, ["characters"]);
  state.scenes = normalizeList(overview, ["scenes"]);

  state.drafts = draftsResult.ok
    ? normalizeList(draftsResult.body, ["drafts", "items", "data"]).map((item, index) => normalizeSimpleItem(item, index, "draft"))
    : [];
  state.notes = notesResult.ok
    ? normalizeList(notesResult.body, ["notes", "items", "data"]).map((item, index) => normalizeSimpleItem(item, index, "note"))
    : [];

  if (!state.selectedBookId && state.books.length) {
    state.selectedBookId = state.books[0].id;
  } else if (state.selectedBookId && !state.books.find((book) => book.id === state.selectedBookId)) {
    state.selectedBookId = state.books[0]?.id || null;
  }

  if (!state.selectedSessionId && state.sessions.length) {
    state.selectedSessionId = state.sessions[0].id;
  } else if (state.selectedSessionId && !state.sessions.find((session) => session.id === state.selectedSessionId)) {
    state.selectedSessionId = state.sessions[0]?.id || null;
  }

  if (!state.selectedDraftId && state.drafts.length) {
    state.selectedDraftId = state.drafts[0].id;
  }
  if (!state.selectedNoteId && state.notes.length) {
    state.selectedNoteId = state.notes[0].id;
  }

  setOverviewStatus("Overview loaded", "status-chip--good");
  renderAll();
}

function buildBookPayloadFromForm() {
  return {
    title: qs("#bookTitle")?.value.trim() || "",
    status: qs("#bookStatus")?.value.trim() || "",
    description: qs("#bookDescription")?.value.trim() || ""
  };
}

async function createBook() {
  const payload = buildBookPayloadFromForm();

  if (!payload.title) {
    showToast("Book title is required", "warn");
    return;
  }

  const result = await api("/api/lorecore/books", {
    method: "POST",
    body: payload
  });

  if (!result.ok) {
    showToast("Create book failed", "warn");
    return;
  }

  showToast("Book created", "good");
  await loadOverview();
}

async function saveBook() {
  const book = getSelectedBook();
  if (!book) {
    showToast("No active book selected", "warn");
    return;
  }

  const payload = buildBookPayloadFromForm();
  const result = await api(`/api/lorecore/books/${encodeURIComponent(book.id)}`, {
    method: "PUT",
    body: payload
  });

  if (!result.ok) {
    showToast("Save book failed", "warn");
    return;
  }

  showToast("Book saved", "good");
  await loadOverview();
}

async function runBookStage() {
  const book = getSelectedBook();
  if (!book) {
    showToast("No active book selected", "warn");
    return;
  }

  const stage = qs("#bookRunStage")?.value.trim() || "draft";
  const result = await api(`/api/lorecore/books/${encodeURIComponent(book.id)}/run-stage`, {
    method: "POST",
    body: { stage }
  });

  if (!result.ok) {
    showToast("Run stage failed", "warn");
    return;
  }

  showToast(`Book stage requested: ${stage}`, "good");
}

async function sendMessage() {
  const session = getSelectedSession();
  if (!session) {
    showToast("No LoreCore session available. No session-create route is confirmed.", "warn");
    return;
  }

  const message = qs("#messageInput")?.value.trim() || "";
  if (!message) {
    showToast("Message is empty", "warn");
    return;
  }

  const book = getSelectedBook();
  const payload = {
    content: message
  };

  if (book?.id) {
    payload.book_public_id = book.id;
  }

  const result = await api(`/api/lorecore/sessions/${encodeURIComponent(session.id)}/messages`, {
    method: "POST",
    body: payload
  });

  if (!result.ok) {
    showToast("Send message failed", "warn");
    return;
  }

  qs("#messageInput").value = "";
  showToast("Message sent", "good");
  await loadOverview();
}

async function exportLore() {
  const payload = {};
  const book = getSelectedBook();
  const session = getSelectedSession();

  if (book?.id) payload.book_public_id = book.id;
  if (session?.id) payload.session_public_id = session.id;

  const result = await api("/api/lorecore/exports", {
    method: "POST",
    body: payload
  });

  if (!result.ok) {
    showToast("Export failed", "warn");
    return;
  }

  showToast("LoreCore export requested", "good");
}

async function createWorld() {
  const name = qs("#worldName")?.value.trim() || "";
  const description = qs("#worldDescription")?.value.trim() || "";

  if (!name) {
    showToast("World name is required", "warn");
    return;
  }

  const payload = { name, description };
  const book = getSelectedBook();
  if (book?.id) payload.book_public_id = book.id;

  const result = await api("/api/lorecore/worlds", {
    method: "POST",
    body: payload
  });

  if (!result.ok) {
    showToast("Create world failed", "warn");
    return;
  }

  showToast("World created", "good");
  qs("#worldName").value = "";
  qs("#worldDescription").value = "";
  await loadOverview();
}

async function createCharacter() {
  const name = qs("#characterName")?.value.trim() || "";
  const description = qs("#characterDescription")?.value.trim() || "";

  if (!name) {
    showToast("Character name is required", "warn");
    return;
  }

  const payload = { name, description };
  const book = getSelectedBook();
  if (book?.id) payload.book_public_id = book.id;

  const result = await api("/api/lorecore/characters", {
    method: "POST",
    body: payload
  });

  if (!result.ok) {
    showToast("Create character failed", "warn");
    return;
  }

  showToast("Character created", "good");
  qs("#characterName").value = "";
  qs("#characterDescription").value = "";
  await loadOverview();
}

async function createScene() {
  const title = qs("#sceneTitle")?.value.trim() || "";
  const description = qs("#sceneDescription")?.value.trim() || "";

  if (!title) {
    showToast("Scene title is required", "warn");
    return;
  }

  const payload = { title, description };
  const book = getSelectedBook();
  if (book?.id) payload.book_public_id = book.id;

  const result = await api("/api/lorecore/scenes", {
    method: "POST",
    body: payload
  });

  if (!result.ok) {
    showToast("Create scene failed", "warn");
    return;
  }

  showToast("Scene created", "good");
  qs("#sceneTitle").value = "";
  qs("#sceneDescription").value = "";
  await loadOverview();
}

function bindEvents() {
  qs("#refreshOverviewBtn")?.addEventListener("click", loadOverview);
  qs("#newBookBtn")?.addEventListener("click", createBook);
  qs("#saveBookBtn")?.addEventListener("click", saveBook);
  qs("#runStageBtn")?.addEventListener("click", runBookStage);
  qs("#sendMessageBtn")?.addEventListener("click", sendMessage);
  qs("#exportLoreBtn")?.addEventListener("click", exportLore);
  qs("#createWorldBtn")?.addEventListener("click", createWorld);
  qs("#createCharacterBtn")?.addEventListener("click", createCharacter);
  qs("#createSceneBtn")?.addEventListener("click", createScene);

  qs("#sessionSelect")?.addEventListener("change", (event) => {
    state.selectedSessionId = event.target.value || null;
    renderAll();
  });

  qs("#bookSelect")?.addEventListener("change", (event) => {
    state.selectedBookId = event.target.value || null;
    renderAll();
  });

  qs("#bookList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-book-id]");
    if (!button) return;
    state.selectedBookId = button.dataset.bookId;
    renderAll();
  });

  qs("#draftList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-draft-id]");
    if (!button) return;
    state.selectedDraftId = button.dataset.draftId;
    renderAll();
  });

  qs("#noteList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-note-id]");
    if (!button) return;
    state.selectedNoteId = button.dataset.noteId;
    renderAll();
  });
}

function init() {
  bindEvents();
  renderAll();
  loadOverview();
}

document.addEventListener("DOMContentLoaded", init);
