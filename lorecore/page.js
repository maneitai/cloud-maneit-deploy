const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  books: [],
  sessions: [],
  drafts: [],
  notes: [],
  worlds: [],
  characters: [],
  scenes: [],
  selectedBookId: null,
  selectedSessionId: null,
  activeTab: "books",
  // Active entity being edited in the entity panel
  activeEntity: null,   // { type, data, isNew }
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function escHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function showToast(msg, tone = "good") {
  const t = qs("#toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2800);
}

function setChip(id, text, cls) {
  const el = qs(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status-chip ${cls}`;
}

async function api(path, opts = {}) {
  const cfg = { method: "GET", headers: {}, ...opts };
  if (cfg.body && typeof cfg.body !== "string") {
    cfg.headers["Content-Type"] = "application/json";
    cfg.body = JSON.stringify(cfg.body);
  }
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, cfg);
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

// ── Normalize ─────────────────────────────────────────────────────────────────
function normalizeList(body, keys) {
  for (const key of keys) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return Array.isArray(body) ? body : [];
}

function normalizeBook(raw, i = 0) {
  return {
    id: raw?.book_public_id || raw?.public_id || raw?.id || `book_${i}`,
    title: raw?.title || raw?.name || `Book ${i+1}`,
    description: raw?.description || raw?.summary || "",
    status: raw?.status || raw?.phase || "",
    raw,
  };
}

function normalizeSession(raw, i = 0) {
  return {
    id: raw?.session_public_id || raw?.public_id || raw?.id || `session_${i}`,
    title: raw?.title || raw?.name || raw?.label || `Session ${i+1}`,
    messages: Array.isArray(raw?.messages) ? raw.messages
            : Array.isArray(raw?.history) ? raw.history
            : Array.isArray(raw?.items) ? raw.items : [],
    raw,
  };
}

function normalizeEntity(raw, i = 0, type = "item") {
  return {
    id: raw?.public_id || raw?.id || raw?.[`${type}_public_id`] || `${type}_${i}`,
    title: raw?.title || raw?.name || `${type} ${i+1}`,
    description: raw?.description || raw?.summary || raw?.content || raw?.text || "",
    raw,
  };
}

// ── Getters ───────────────────────────────────────────────────────────────────
function getSelectedBook() {
  return state.books.find(b => b.id === state.selectedBookId) || null;
}

function getSelectedSession() {
  return state.sessions.find(s => s.id === state.selectedSessionId) || state.sessions[0] || null;
}

function getListForTab(tab) {
  const map = { books: state.books, characters: state.characters, worlds: state.worlds, scenes: state.scenes, drafts: state.drafts, notes: state.notes };
  return map[tab] || [];
}

// ── Quick create field definitions ───────────────────────────────────────────
const ENTITY_FIELDS = {
  books: [
    { id: "qc_title", label: "Title", type: "input", placeholder: "Book title" },
    { id: "qc_status", label: "Phase", type: "input", placeholder: "outline / draft / revision..." },
    { id: "qc_description", label: "Description", type: "textarea", placeholder: "Scope, tone, intent" },
  ],
  characters: [
    { id: "qc_title", label: "Name", type: "input", placeholder: "Character name" },
    { id: "qc_role", label: "Role", type: "input", placeholder: "Protagonist / antagonist / support..." },
    { id: "qc_description", label: "Description", type: "textarea", placeholder: "Motivation, arc, personality, contradictions" },
    { id: "qc_traits", label: "Key traits", type: "input", placeholder: "Traits (comma separated)" },
  ],
  worlds: [
    { id: "qc_title", label: "Name", type: "input", placeholder: "World / setting name" },
    { id: "qc_description", label: "Description", type: "textarea", placeholder: "Geography, timeline, culture, rules" },
    { id: "qc_tone", label: "Tone / genre", type: "input", placeholder: "Dark fantasy, hard sci-fi..." },
  ],
  scenes: [
    { id: "qc_title", label: "Title", type: "input", placeholder: "Scene title" },
    { id: "qc_description", label: "Description", type: "textarea", placeholder: "Purpose, conflict, beats, location" },
    { id: "qc_pov", label: "POV character", type: "input", placeholder: "POV character name" },
  ],
  drafts: [
    { id: "qc_title", label: "Title", type: "input", placeholder: "Draft title" },
    { id: "qc_description", label: "Content", type: "textarea", placeholder: "Draft content..." },
  ],
  notes: [
    { id: "qc_title", label: "Title", type: "input", placeholder: "Note title" },
    { id: "qc_description", label: "Content", type: "textarea", placeholder: "Note content..." },
  ],
};

// Fields shown in entity panel when editing an existing entity
const ENTITY_PANEL_FIELDS = {
  character: [
    { id: "ep_title", label: "Name", type: "input" },
    { id: "ep_role", label: "Role", type: "input" },
    { id: "ep_description", label: "Description", type: "textarea" },
    { id: "ep_traits", label: "Key traits", type: "input" },
    { id: "ep_arc", label: "Arc", type: "textarea" },
    { id: "ep_voice", label: "Voice / speech style", type: "input" },
  ],
  world: [
    { id: "ep_title", label: "Name", type: "input" },
    { id: "ep_description", label: "Description", type: "textarea" },
    { id: "ep_tone", label: "Tone / genre", type: "input" },
    { id: "ep_rules", label: "World rules / systems", type: "textarea" },
    { id: "ep_factions", label: "Factions / cultures", type: "textarea" },
  ],
  scene: [
    { id: "ep_title", label: "Title", type: "input" },
    { id: "ep_description", label: "Description", type: "textarea" },
    { id: "ep_pov", label: "POV character", type: "input" },
    { id: "ep_beats", label: "Scene beats", type: "textarea" },
    { id: "ep_outcome", label: "Scene outcome", type: "input" },
  ],
  book: [
    { id: "ep_title", label: "Title", type: "input" },
    { id: "ep_status", label: "Phase", type: "input" },
    { id: "ep_description", label: "Description", type: "textarea" },
  ],
  draft: [
    { id: "ep_title", label: "Title", type: "input" },
    { id: "ep_description", label: "Content", type: "textarea" },
  ],
  note: [
    { id: "ep_title", label: "Title", type: "input" },
    { id: "ep_description", label: "Content", type: "textarea" },
  ],
};

// ── Render ────────────────────────────────────────────────────────────────────
function renderLibraryTab(tab) {
  // Hide all
  qsa(".lib-list").forEach(el => el.style.display = "none");
  qs(`#lib-${tab}`).style.display = "block";

  // Update tab buttons
  qsa(".lib-tab").forEach(btn => btn.classList.toggle("lib-tab--active", btn.dataset.tab === tab));

  renderLibraryList(tab);
  renderQuickCreate(tab);
}

function renderLibraryList(tab) {
  const el = qs(`#lib-${tab}`);
  if (!el) return;
  const items = getListForTab(tab);

  if (!items.length) {
    el.innerHTML = `<div class="library-card"><strong>No ${tab}</strong><span>Create one below.</span></div>`;
    return;
  }

  el.innerHTML = items.map(item => `
    <button class="library-card" type="button" data-entity-type="${escHtml(tab.replace(/s$/, ""))}" data-entity-id="${escHtml(item.id)}">
      <strong>${escHtml(item.title)}</strong>
      <span>${escHtml((item.status || item.description || "").slice(0, 70))}</span>
    </button>
  `).join("");
}

function renderQuickCreate(tab) {
  const fields = ENTITY_FIELDS[tab] || [];
  const container = qs("#quickCreateFields");
  if (!container) return;
  container.innerHTML = fields.map(f => `
    <label class="inline-field" style="margin-bottom:6px;">
      <span class="soft">${escHtml(f.label)}</span>
      ${f.type === "textarea"
        ? `<textarea class="textarea" id="${f.id}" placeholder="${escHtml(f.placeholder || "")}" rows="2"></textarea>`
        : `<input class="input" id="${f.id}" placeholder="${escHtml(f.placeholder || "")}" />`
      }
    </label>
  `).join("");
}

function renderSessionSelect() {
  const sel = qs("#sessionSelect");
  if (!sel) return;
  if (!state.sessions.length) {
    sel.innerHTML = `<option value="">No session available</option>`;
    setChip("#sessionStatusChip", "No session", "status-chip--warn");
    return;
  }
  sel.innerHTML = state.sessions.map(s =>
    `<option value="${escHtml(s.id)}">${escHtml(s.title)}</option>`
  ).join("");
  sel.value = state.selectedSessionId || state.sessions[0].id;
  setChip("#sessionStatusChip", "Session active", "status-chip--good");
}

function renderBookContextSelect() {
  const sel = qs("#bookContextSelect");
  const stageTarget = qs("#stageTargetSelect");
  if (!sel) return;
  const opts = [`<option value="">No book context (free thinking room)</option>`,
    ...state.books.map(b => `<option value="${escHtml(b.id)}">${escHtml(b.title)}</option>`)
  ].join("");
  sel.innerHTML = opts;
  sel.value = state.selectedBookId || "";
  if (stageTarget) stageTarget.innerHTML = opts;

  const note = qs("#bookContextNote");
  if (note) {
    note.textContent = state.selectedBookId
      ? `Anchored to: ${state.books.find(b => b.id === state.selectedBookId)?.title || "—"}`
      : "Chat runs without book scope. Select a book to anchor the session.";
  }
}

function renderEntityCounts() {
  const box = qs("#entityCountBox");
  if (!box) return;
  box.innerHTML = `
    <strong>${state.books.length} books · ${state.characters.length} characters · ${state.worlds.length} worlds</strong>
    <span>${state.scenes.length} scenes · ${state.drafts.length} drafts · ${state.notes.length} notes · ${state.sessions.length} sessions</span>
  `;
}

function renderChatFeed() {
  const feed = qs("#chatFeed");
  if (!feed) return;
  const session = getSelectedSession();
  const messages = session?.messages || [];

  if (!session) {
    feed.innerHTML = `<div class="chat-placeholder"><div style="font-size:2rem;margin-bottom:12px;">📖</div><div style="font-weight:600;margin-bottom:6px;">LoreCore thinking room</div><div class="muted" style="font-size:13px;">No session. Select one above or send a message.</div></div>`;
    return;
  }

  if (!messages.length) {
    feed.innerHTML = `<div class="chat-placeholder"><div style="font-size:2rem;margin-bottom:12px;">📖</div><div style="font-weight:600;margin-bottom:6px;">${escHtml(session.title)}</div><div class="muted" style="font-size:13px;">No messages yet. Start the conversation.</div></div>`;
    return;
  }

  feed.innerHTML = messages.map(msg => {
    const role = msg?.role || msg?.author || msg?.speaker || "message";
    const content = msg?.content || msg?.text || msg?.body || JSON.stringify(msg);
    const isUser = role === "user";
    return `
      <div class="chat-msg ${isUser ? "chat-msg--user" : "chat-msg--assistant"}">
        <div class="chat-msg-role">${escHtml(role)}</div>
        <div class="chat-msg-content">${escHtml(content)}</div>
      </div>
    `;
  }).join("");

  // Scroll to bottom
  feed.scrollTop = feed.scrollHeight;
}

function renderAll() {
  renderSessionSelect();
  renderBookContextSelect();
  renderEntityCounts();
  renderChatFeed();
  renderLibraryTab(state.activeTab);
}

// ── Entity panel ──────────────────────────────────────────────────────────────
function openEntityPanel(type, data, isNew = false) {
  const singular = type.replace(/s$/, "");
  state.activeEntity = { type: singular, data, isNew };

  const panel = qs("#entityPanel");
  const eyebrow = qs("#entityPanelEyebrow");
  const title = qs("#entityPanelTitle");
  const fields = qs("#entityFields");
  if (!panel || !fields) return;

  eyebrow.textContent = singular.charAt(0).toUpperCase() + singular.slice(1);
  title.textContent = data?.title || (isNew ? `New ${singular}` : "—");

  const fieldDefs = ENTITY_PANEL_FIELDS[singular] || ENTITY_PANEL_FIELDS.note;
  fields.innerHTML = fieldDefs.map(f => `
    <label class="inline-field" style="margin-bottom:8px;">
      <span class="soft">${escHtml(f.label)}</span>
      ${f.type === "textarea"
        ? `<textarea class="textarea" id="${f.id}" rows="3"></textarea>`
        : `<input class="input" id="${f.id}" />`
      }
    </label>
  `).join("");

  // Populate with existing data
  if (data) {
    const set = (id, val) => { const el = qs(`#${id}`); if (el) el.value = val || ""; };
    set("ep_title", data.title || data.name || "");
    set("ep_description", data.description || "");
    set("ep_status", data.status || "");
    set("ep_role", data.raw?.role || "");
    set("ep_traits", data.raw?.traits || "");
    set("ep_arc", data.raw?.arc || "");
    set("ep_voice", data.raw?.voice || "");
    set("ep_tone", data.raw?.tone || "");
    set("ep_rules", data.raw?.rules || "");
    set("ep_factions", data.raw?.factions || "");
    set("ep_pov", data.raw?.pov || "");
    set("ep_beats", data.raw?.beats || "");
    set("ep_outcome", data.raw?.outcome || "");
  }

  qs("#extractStatus").style.display = "none";
  panel.style.display = "block";
}

function closeEntityPanel() {
  state.activeEntity = null;
  qs("#entityPanel").style.display = "none";
}

function readEntityFields() {
  const get = id => qs(`#${id}`)?.value.trim() || "";
  return {
    title: get("ep_title"),
    name: get("ep_title"),
    description: get("ep_description"),
    status: get("ep_status"),
    role: get("ep_role"),
    traits: get("ep_traits"),
    arc: get("ep_arc"),
    voice: get("ep_voice"),
    tone: get("ep_tone"),
    rules: get("ep_rules"),
    factions: get("ep_factions"),
    pov: get("ep_pov"),
    beats: get("ep_beats"),
    outcome: get("ep_outcome"),
  };
}

async function saveEntity() {
  if (!state.activeEntity) return;
  const { type, data, isNew } = state.activeEntity;
  const payload = readEntityFields();
  const book = getSelectedBook();
  if (book?.id) payload.book_public_id = book.id;

  const ROUTES = {
    book: { create: "/api/lorecore/books", update: `/api/lorecore/books/${data?.id}` },
    character: { create: "/api/lorecore/characters", update: `/api/lorecore/characters/${data?.id}` },
    world: { create: "/api/lorecore/worlds", update: `/api/lorecore/worlds/${data?.id}` },
    scene: { create: "/api/lorecore/scenes", update: `/api/lorecore/scenes/${data?.id}` },
    draft: { create: null, update: null },
    note: { create: null, update: null },
  };

  const route = ROUTES[type];
  if (!route) { showToast(`No save route for ${type}`, "warn"); return; }

  if (isNew) {
    if (!route.create) { showToast(`Create route for ${type} not yet available on backend`, "warn"); return; }
    const r = await api(route.create, { method: "POST", body: payload });
    if (!r.ok) { showToast(`Create ${type} failed: ${r.status}`, "warn"); return; }
    showToast(`${type} created`, "good");
  } else {
    if (!route.update) { showToast(`Update route for ${type} not yet available on backend`, "warn"); return; }
    const r = await api(route.update, { method: "PUT", body: payload });
    if (!r.ok) { showToast(`Save ${type} failed: ${r.status}`, "warn"); return; }
    showToast(`${type} saved`, "good");
  }

  closeEntityPanel();
  await loadOverview();
}

// ── Extract from chat ─────────────────────────────────────────────────────────
async function extractFromChat() {
  if (!state.activeEntity) return;
  const { type } = state.activeEntity;
  const session = getSelectedSession();
  const messages = session?.messages || [];

  const statusEl = qs("#extractStatus");
  statusEl.style.display = "block";
  statusEl.textContent = "Extracting from conversation…";

  if (!messages.length) {
    statusEl.textContent = "No messages in conversation to extract from.";
    return;
  }

  // Build extraction prompt
  const conversationText = messages.map(m => {
    const role = m?.role || m?.author || "message";
    const content = m?.content || m?.text || m?.body || "";
    return `${role}: ${content}`;
  }).join("\n");

  const extractionPrompts = {
    character: `Extract a character profile from this conversation. Return only a JSON object with keys: name, role, description, traits, arc, voice. No markdown, no extra text.\n\n${conversationText}`,
    world: `Extract a world/setting profile from this conversation. Return only a JSON object with keys: name, description, tone, rules, factions. No markdown, no extra text.\n\n${conversationText}`,
    scene: `Extract a scene profile from this conversation. Return only a JSON object with keys: title, description, pov, beats, outcome. No markdown, no extra text.\n\n${conversationText}`,
    note: `Summarize the key points from this conversation as a note. Return only a JSON object with keys: title, description. No markdown, no extra text.\n\n${conversationText}`,
    draft: `Extract draft content from this conversation. Return only a JSON object with keys: title, description. No markdown, no extra text.\n\n${conversationText}`,
  };

  const prompt = extractionPrompts[type] || extractionPrompts.note;

  // Try backend extract endpoint first
  const r = await api("/api/lorecore/extract", {
    method: "POST",
    body: { entity_type: type, conversation: conversationText, prompt },
  });

  let extracted = null;

  if (r.ok) {
    extracted = r.body?.extracted || r.body;
  } else {
    // Backend not available — fall back to home chat endpoint
    const chatR = await api("/api/home/sessions", { method: "GET" });
    if (!chatR.ok) {
      statusEl.textContent = "Extract endpoint not yet available on backend. Add /api/lorecore/extract to enable this.";
      return;
    }
    statusEl.textContent = "Extract endpoint not yet available on backend (/api/lorecore/extract). Add it to enable auto-fill.";
    return;
  }

  if (!extracted) {
    statusEl.textContent = "Extraction returned no data.";
    return;
  }

  // Parse if string
  let data = extracted;
  if (typeof data === "string") {
    try { data = JSON.parse(data.replace(/```json|```/g, "").trim()); } catch { statusEl.textContent = "Could not parse extraction result."; return; }
  }

  // Fill fields
  const set = (id, val) => { const el = qs(`#${id}`); if (el && val) el.value = val; };
  set("ep_title", data.name || data.title || "");
  set("ep_description", data.description || "");
  set("ep_role", data.role || "");
  set("ep_traits", Array.isArray(data.traits) ? data.traits.join(", ") : (data.traits || ""));
  set("ep_arc", data.arc || "");
  set("ep_voice", data.voice || "");
  set("ep_tone", data.tone || "");
  set("ep_rules", data.rules || "");
  set("ep_factions", Array.isArray(data.factions) ? data.factions.join(", ") : (data.factions || ""));
  set("ep_pov", data.pov || "");
  set("ep_beats", Array.isArray(data.beats) ? data.beats.join("\n") : (data.beats || ""));
  set("ep_outcome", data.outcome || "");

  const titleEl = qs("#entityPanelTitle");
  if (titleEl && (data.name || data.title)) titleEl.textContent = data.name || data.title;

  statusEl.textContent = "✓ Fields filled from conversation. Review and save.";
  showToast("Extracted from chat", "good");
}

// ── Quick create ──────────────────────────────────────────────────────────────
async function quickCreate() {
  const tab = state.activeTab;
  const get = id => qs(`#${id}`)?.value.trim() || "";
  const title = get("qc_title");
  if (!title) { showToast("Title is required", "warn"); return; }

  const book = getSelectedBook();
  const payload = {
    title, name: title,
    description: get("qc_description"),
    status: get("qc_status"),
    role: get("qc_role"),
    traits: get("qc_traits"),
    tone: get("qc_tone"),
    pov: get("qc_pov"),
  };
  if (book?.id) payload.book_public_id = book.id;

  const ROUTES = {
    books: "/api/lorecore/books",
    characters: "/api/lorecore/characters",
    worlds: "/api/lorecore/worlds",
    scenes: "/api/lorecore/scenes",
    drafts: null,
    notes: null,
  };

  const route = ROUTES[tab];
  if (!route) { showToast(`Create route for ${tab} not yet available on backend`, "warn"); return; }

  const r = await api(route, { method: "POST", body: payload });
  if (!r.ok) { showToast(`Create failed: ${r.status}`, "warn"); return; }

  showToast(`${tab.replace(/s$/, "")} created`, "good");
  renderQuickCreate(tab); // clear fields
  await loadOverview();
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  setChip("#libraryStatusChip", "Loading", "status-chip--warn");

  const [overviewR, draftsR, notesR] = await Promise.all([
    api("/api/lorecore/overview"),
    api("/api/lorecore/drafts"),
    api("/api/lorecore/notes"),
  ]);

  if (!overviewR.ok) {
    setChip("#libraryStatusChip", "Overview failed", "status-chip--warn");
    showToast("GET /api/lorecore/overview failed", "warn");
    renderAll();
    return;
  }

  const ov = overviewR.body || {};
  state.books      = normalizeList(ov, ["books","book_library","items"]).map(normalizeBook);
  state.sessions   = normalizeList(ov, ["sessions","discussion_sessions","chat_sessions"]).map(normalizeSession);
  state.worlds     = normalizeList(ov, ["worlds"]).map((r,i) => normalizeEntity(r,i,"world"));
  state.characters = normalizeList(ov, ["characters"]).map((r,i) => normalizeEntity(r,i,"character"));
  state.scenes     = normalizeList(ov, ["scenes"]).map((r,i) => normalizeEntity(r,i,"scene"));

  state.drafts = draftsR.ok
    ? normalizeList(draftsR.body, ["drafts","items","data"]).map((r,i) => normalizeEntity(r,i,"draft"))
    : [];
  state.notes = notesR.ok
    ? normalizeList(notesR.body, ["notes","items","data"]).map((r,i) => normalizeEntity(r,i,"note"))
    : [];

  // Stable selection
  if (!state.selectedBookId && state.books.length) state.selectedBookId = state.books[0].id;
  if (state.selectedBookId && !state.books.find(b => b.id === state.selectedBookId)) state.selectedBookId = state.books[0]?.id || null;
  if (!state.selectedSessionId && state.sessions.length) state.selectedSessionId = state.sessions[0].id;
  if (state.selectedSessionId && !state.sessions.find(s => s.id === state.selectedSessionId)) state.selectedSessionId = state.sessions[0]?.id || null;

  const total = state.books.length + state.characters.length + state.worlds.length + state.scenes.length + state.drafts.length + state.notes.length;
  setChip("#libraryStatusChip", `${total} objects`, "status-chip--good");
  renderAll();
}

// ── Send message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const session = getSelectedSession();
  if (!session) { showToast("No session available", "warn"); return; }

  const content = qs("#messageInput")?.value.trim() || "";
  if (!content) { showToast("Message is empty", "warn"); return; }

  const payload = { content };
  const book = getSelectedBook();
  if (book?.id) payload.book_public_id = book.id;

  const r = await api(`/api/lorecore/sessions/${encodeURIComponent(session.id)}/messages`, {
    method: "POST", body: payload,
  });

  if (!r.ok) { showToast("Send failed", "warn"); return; }

  qs("#messageInput").value = "";
  showToast("Sent", "good");
  await loadOverview();
}

// ── Run stage ─────────────────────────────────────────────────────────────────
async function runStage() {
  const stage = qs("#stageSelect")?.value || "draft";
  const targetId = qs("#stageTargetSelect")?.value || state.selectedBookId;

  if (!targetId) { showToast("No book selected for stage run", "warn"); return; }

  setChip("#pipelineStatusChip", "Running…", "status-chip--warn");

  const r = await api(`/api/lorecore/books/${encodeURIComponent(targetId)}/run-stage`, {
    method: "POST", body: { stage },
  });

  if (!r.ok) {
    setChip("#pipelineStatusChip", "Failed", "status-chip--warn");
    showToast(`Run stage failed: ${r.status}`, "warn");
    return;
  }

  setChip("#pipelineStatusChip", `${stage} done`, "status-chip--good");
  const resultBox = qs("#stageResultBox");
  const resultText = qs("#stageResultText");
  if (resultBox && resultText) {
    resultText.textContent = JSON.stringify(r.body || {}).slice(0, 300);
    resultBox.style.display = "block";
  }
  showToast(`Stage ${stage} complete`, "good");
}

// ── Export ────────────────────────────────────────────────────────────────────
async function exportLore() {
  const payload = {};
  const book = getSelectedBook();
  const session = getSelectedSession();
  if (book?.id) payload.book_public_id = book.id;
  if (session?.id) payload.session_public_id = session.id;

  const r = await api("/api/lorecore/exports", { method: "POST", body: payload });
  if (!r.ok) { showToast("Export failed", "warn"); return; }
  showToast("Export requested", "good");
}

// ── Open extract panel from right rail ───────────────────────────────────────
function openExtractPanel() {
  const type = qs("#extractTypeSelect")?.value || "character";
  openEntityPanel(type + "s", null, true);
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Library tabs
  qs("#libTabs")?.addEventListener("click", e => {
    const btn = e.target.closest(".lib-tab");
    if (!btn) return;
    state.activeTab = btn.dataset.tab;
    renderLibraryTab(state.activeTab);
  });

  // Library list — open entity panel on click
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-entity-type][data-entity-id]");
    if (!btn) return;
    const type = btn.dataset.entityType;
    const id = btn.dataset.entityId;
    const list = getListForTab(type + "s");
    const item = list.find(x => x.id === id);
    if (item) openEntityPanel(type + "s", item, false);
  });

  // Quick create
  qs("#quickCreateBtn")?.addEventListener("click", quickCreate);

  // Entity panel
  qs("#saveEntityBtn")?.addEventListener("click", saveEntity);
  qs("#closeEntityBtn")?.addEventListener("click", closeEntityPanel);
  qs("#extractFromChatBtn")?.addEventListener("click", extractFromChat);

  // Chat
  qs("#sendBtn")?.addEventListener("click", sendMessage);
  qs("#messageInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendMessage();
  });

  // Session select
  qs("#sessionSelect")?.addEventListener("change", e => {
    state.selectedSessionId = e.target.value || null;
    renderChatFeed();
  });

  // Book context
  qs("#bookContextSelect")?.addEventListener("change", e => {
    state.selectedBookId = e.target.value || null;
    renderBookContextSelect();
  });

  // Pipeline
  qs("#runStageBtn")?.addEventListener("click", runStage);
  qs("#exportBtn")?.addEventListener("click", exportLore);
  qs("#refreshBtn")?.addEventListener("click", loadOverview);
  qs("#openExtractBtn")?.addEventListener("click", openExtractPanel);
}

function init() {
  bindEvents();
  renderAll();
  loadOverview();
}

document.addEventListener("DOMContentLoaded", init);
