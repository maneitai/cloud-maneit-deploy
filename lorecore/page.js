const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  // Library
  books: [],
  selectedBookId: null,
  // Per-book entities (loaded when book selected)
  characters: [],
  worlds: [],
  scenes: [],
  chapters: [],
  drafts: [],
  notes: [],
  // Sessions
  sessions: [],
  selectedSessionId: null,
  // Active entity tab
  activeEntityTab: "characters",
  // Active chapter being edited
  activeChapterId: null,
  // Active entity in edit panel
  activeEntity: null,
  // Chat
  chatMode: "single",
  selectedModels: [],
  availableModels: [],
  messages: [],
};

// ── Utils ─────────────────────────────────────────────────────────────────────
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const escHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");

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

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
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
  for (const k of keys) if (Array.isArray(body?.[k])) return body[k];
  return Array.isArray(body) ? body : [];
}

function normalizeBook(raw, i = 0) {
  return {
    id: raw?.book_public_id || raw?.public_id || raw?.id || `book_${i}`,
    title: raw?.title || raw?.name || `Book ${i+1}`,
    description: raw?.description || raw?.summary || "",
    status: raw?.status || raw?.phase || "",
    libraryId: raw?.library_public_id || raw?.library_id || null,
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
    order: raw?.order ?? raw?.chapter_number ?? raw?.position ?? i,
    wordCount: raw?.word_count || wordCount(raw?.content || raw?.text || ""),
    content: raw?.content || raw?.text || raw?.description || "",
    raw,
  };
}

// ── Model pool ────────────────────────────────────────────────────────────────
async function loadModels() {
  const r = await api("/api/models");
  const items = r.ok
    ? (Array.isArray(r.body?.items) ? r.body.items : Array.isArray(r.body) ? r.body : [])
    : [];
  state.availableModels = items.filter(m => {
    const alias = String(m?.alias || m?.name || m?.model_id || "").toLowerCase();
    if (!alias) return false;
    if (alias.startsWith("ggml-vocab-")) return false;
    if ("enabled" in m && m.enabled === false) return false;
    return true;
  }).map(m => ({
    alias: m.alias || m.name || m.model_id,
    label: m.display_name || m.alias || m.name || m.model_id,
  }));
  renderModelList();
}

function renderModelList() {
  const container = qs("#modelList");
  if (!container) return;
  if (!state.availableModels.length) {
    container.innerHTML = `<div class="muted" style="font-size:12px;">No models available</div>`;
    return;
  }
  container.innerHTML = state.availableModels.map(m => `
    <label class="model-chip ${state.selectedModels.includes(m.alias) ? "model-chip--active" : ""}">
      <input type="checkbox" class="model-cb" value="${escHtml(m.alias)}" ${state.selectedModels.includes(m.alias) ? "checked" : ""} />
      ${escHtml(m.label)}
    </label>
  `).join("");
  qsa(".model-cb").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (state.chatMode === "single") state.selectedModels = [cb.value];
        else if (!state.selectedModels.includes(cb.value)) state.selectedModels.push(cb.value);
      } else {
        state.selectedModels = state.selectedModels.filter(a => a !== cb.value);
      }
      renderModelList();
      updateContextStrip();
    });
  });
}

// ── Book library ──────────────────────────────────────────────────────────────
function renderBookLibrary() {
  const list = qs("#bookLibraryList");
  if (!list) return;
  if (!state.books.length) {
    list.innerHTML = `<div class="lib-placeholder muted">No books yet. Create one below.</div>`;
    return;
  }
  list.innerHTML = state.books.map(b => `
    <button class="book-card ${b.id === state.selectedBookId ? "book-card--active" : ""}" type="button" data-book-id="${escHtml(b.id)}">
      <div class="book-card-title">${escHtml(b.title)}</div>
      <div class="book-card-meta">${escHtml(b.status || "No phase")}</div>
    </button>
  `).join("");
}

function selectBook(id) {
  state.selectedBookId = id;
  state.activeChapterId = null;
  // Reset per-book entities
  state.characters = []; state.worlds = []; state.scenes = [];
  state.chapters = []; state.drafts = []; state.notes = [];
  renderBookLibrary();
  qs("#bookEntitySection").style.display = id ? "block" : "none";
  qs("#noBookHint").style.display = id ? "none" : "block";
  updateContextStrip();
  if (id) loadBookEntities(id);
}

async function loadBookEntities(bookId) {
  // Load all entity types for this book
  // Overview contains some; others have dedicated endpoints
  const r = await api("/api/lorecore/overview");
  if (r.ok) {
    const ov = r.body || {};
    const bookData = (normalizeList(ov, ["books","book_library","items"])).find(b =>
      (b.book_public_id || b.public_id || b.id) === bookId
    );
    state.characters = normalizeList(bookData || ov, ["characters"]).map((x,i) => normalizeEntity(x,i,"character"));
    state.worlds     = normalizeList(bookData || ov, ["worlds"]).map((x,i) => normalizeEntity(x,i,"world"));
    state.scenes     = normalizeList(bookData || ov, ["scenes"]).map((x,i) => normalizeEntity(x,i,"scene"));
    state.chapters   = normalizeList(bookData || ov, ["chapters"]).map((x,i) => normalizeEntity(x,i,"chapter"))
      .sort((a,b) => a.order - b.order);
  }
  // Drafts + notes from dedicated endpoints
  const [draftsR, notesR] = await Promise.all([
    api(`/api/lorecore/drafts?book_public_id=${encodeURIComponent(bookId)}`),
    api(`/api/lorecore/notes?book_public_id=${encodeURIComponent(bookId)}`),
  ]);
  state.drafts = draftsR.ok ? normalizeList(draftsR.body, ["drafts","items","data"]).map((x,i) => normalizeEntity(x,i,"draft")) : [];
  state.notes  = notesR.ok  ? normalizeList(notesR.body,  ["notes","items","data"]).map((x,i) => normalizeEntity(x,i,"note"))  : [];

  renderEntitySection();
  renderChapterSidebar();
  renderEntityCounts();
}

// ── Entity tabs ───────────────────────────────────────────────────────────────
const ENTITY_FIELDS_DEF = {
  characters: [
    { id: "qc_name", label: "Name", type: "input", placeholder: "Character name" },
    { id: "qc_role", label: "Role", type: "input", placeholder: "Protagonist / antagonist…" },
    { id: "qc_desc", label: "Description", type: "textarea", placeholder: "Motivation, arc, personality" },
  ],
  worlds: [
    { id: "qc_name", label: "Name", type: "input", placeholder: "World / setting name" },
    { id: "qc_desc", label: "Description", type: "textarea", placeholder: "Geography, rules, culture" },
    { id: "qc_tone", label: "Tone", type: "input", placeholder: "Dark fantasy, hard sci-fi…" },
  ],
  scenes: [
    { id: "qc_name", label: "Title", type: "input", placeholder: "Scene title" },
    { id: "qc_desc", label: "Description", type: "textarea", placeholder: "Purpose, conflict, beats" },
    { id: "qc_pov", label: "POV", type: "input", placeholder: "POV character" },
  ],
  chapters: [
    { id: "qc_name", label: "Title", type: "input", placeholder: "Chapter title" },
    { id: "qc_order", label: "Chapter #", type: "input", placeholder: "1" },
    { id: "qc_desc", label: "Opening line / summary", type: "textarea", placeholder: "Optional" },
  ],
  drafts: [
    { id: "qc_name", label: "Title", type: "input", placeholder: "Draft title" },
    { id: "qc_desc", label: "Content", type: "textarea", placeholder: "Draft content" },
  ],
  notes: [
    { id: "qc_name", label: "Title", type: "input", placeholder: "Note title" },
    { id: "qc_desc", label: "Content", type: "textarea", placeholder: "Note content" },
  ],
};

function renderEntitySection() {
  renderEntityTab(state.activeEntityTab);
}

function renderEntityTab(tab) {
  state.activeEntityTab = tab;
  qsa(".entity-tab").forEach(btn => btn.classList.toggle("entity-tab--active", btn.dataset.tab === tab));

  const list = qs("#entityList");
  if (!list) return;
  const items = getEntityList(tab);

  if (!items.length) {
    list.innerHTML = `<div class="lib-placeholder muted">No ${tab} yet.</div>`;
  } else {
    list.innerHTML = items.map(item => `
      <button class="entity-card" type="button" data-entity-type="${escHtml(tab)}" data-entity-id="${escHtml(item.id)}">
        <div class="entity-card-title">${escHtml(item.title)}</div>
        ${item.wordCount ? `<div class="entity-card-meta">${item.wordCount} words</div>` : ""}
        ${item.description && !item.wordCount ? `<div class="entity-card-meta">${escHtml(item.description.slice(0,60))}</div>` : ""}
      </button>
    `).join("");
  }

  // Quick create fields
  const qcLabel = qs("#quickCreateLabel");
  const qcFields = qs("#quickCreateFields");
  if (qcLabel) qcLabel.textContent = `New ${tab.replace(/s$/,"")}`;
  if (qcFields) {
    const defs = ENTITY_FIELDS_DEF[tab] || [];
    qcFields.innerHTML = defs.map(f => `
      <label class="inline-field" style="margin-bottom:6px;">
        <span class="soft">${escHtml(f.label)}</span>
        ${f.type === "textarea"
          ? `<textarea class="textarea" id="${f.id}" placeholder="${escHtml(f.placeholder||"")}" rows="2"></textarea>`
          : `<input class="input" id="${f.id}" placeholder="${escHtml(f.placeholder||"")}" />`}
      </label>
    `).join("");
  }
}

function getEntityList(tab) {
  return { characters: state.characters, worlds: state.worlds, scenes: state.scenes,
           chapters: state.chapters, drafts: state.drafts, notes: state.notes }[tab] || [];
}

// ── Quick create ──────────────────────────────────────────────────────────────
const ENTITY_CREATE_ROUTES = {
  characters: "/api/lorecore/characters",
  worlds:     "/api/lorecore/worlds",
  scenes:     "/api/lorecore/scenes",
  chapters:   "/api/lorecore/chapters",
  drafts:     null,
  notes:      null,
};

async function quickCreate() {
  const tab = state.activeEntityTab;
  const get = id => qs(`#${id}`)?.value.trim() || "";
  const title = get("qc_name");
  if (!title) { showToast("Title is required", "warn"); return; }

  const route = ENTITY_CREATE_ROUTES[tab];
  if (!route) { showToast(`Create route for ${tab} not yet available on backend`, "warn"); return; }

  const payload = {
    title, name: title,
    description: get("qc_desc"),
    role: get("qc_role"),
    tone: get("qc_tone"),
    pov: get("qc_pov"),
    order: parseInt(get("qc_order")) || state.chapters.length + 1,
    book_public_id: state.selectedBookId,
  };

  const r = await api(route, { method: "POST", body: payload });
  if (!r.ok) { showToast(`Create failed: ${r.status}`, "warn"); return; }

  showToast(`${tab.replace(/s$/,"")} created`, "good");
  if (state.selectedBookId) await loadBookEntities(state.selectedBookId);
}

// ── Chapter sidebar + editor ──────────────────────────────────────────────────
function renderChapterSidebar() {
  const list = qs("#chapterSidebarList");
  if (!list) return;
  if (!state.selectedBookId) {
    list.innerHTML = `<div class="lib-placeholder muted">Select a book.</div>`;
    return;
  }
  if (!state.chapters.length) {
    list.innerHTML = `<div class="lib-placeholder muted">No chapters yet.</div>`;
    return;
  }
  list.innerHTML = state.chapters.map((ch, i) => `
    <button class="chapter-item ${ch.id === state.activeChapterId ? "chapter-item--active" : ""}"
      type="button" data-chapter-id="${escHtml(ch.id)}">
      <div class="chapter-item-num">${i+1}</div>
      <div class="chapter-item-body">
        <div class="chapter-item-title">${escHtml(ch.title)}</div>
        <div class="chapter-item-meta">${ch.wordCount || 0} words</div>
      </div>
    </button>
  `).join("");
}

function openChapter(id) {
  const ch = state.chapters.find(c => c.id === id);
  if (!ch) return;
  state.activeChapterId = id;
  renderChapterSidebar();
  setChip("#chapterStatusChip", escHtml(ch.title), "status-chip--good");

  qs("#chapterEditorEmpty").style.display = "none";
  qs("#chapterEditorActive").style.display = "block";
  qs("#chapterTitleInput").value = ch.title;
  qs("#chapterContentInput").value = ch.content || ch.description || "";
  updateWordCount();

  const idx = state.chapters.findIndex(c => c.id === id);
  qs("#prevChapterBtn").disabled = idx <= 0;
  qs("#nextChapterBtn").disabled = idx >= state.chapters.length - 1;
}

function updateWordCount() {
  const content = qs("#chapterContentInput")?.value || "";
  const wc = wordCount(content);
  if (qs("#wordCount")) qs("#wordCount").textContent = `${wc.toLocaleString()} words`;
  if (qs("#wordCountDetail")) qs("#wordCountDetail").textContent = `${wc.toLocaleString()} words · ${content.length.toLocaleString()} chars`;
}

async function saveChapter() {
  const id = state.activeChapterId;
  const ch = state.chapters.find(c => c.id === id);
  if (!ch) return;

  const title = qs("#chapterTitleInput")?.value.trim() || ch.title;
  const content = qs("#chapterContentInput")?.value || "";
  const payload = { title, name: title, content, description: content, book_public_id: state.selectedBookId };

  const statusEl = qs("#chapterSaveStatus");
  if (statusEl) statusEl.textContent = "Saving…";

  // Try PUT first, fall back to POST
  let r = await api(`/api/lorecore/chapters/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
  if (!r.ok) {
    r = await api("/api/lorecore/chapters", { method: "POST", body: payload });
  }

  if (!r.ok) {
    if (statusEl) statusEl.textContent = "Save failed — chapter backend pending";
    showToast("Chapter save: backend route pending", "warn");
    return;
  }

  ch.title = title;
  ch.content = content;
  ch.wordCount = wordCount(content);
  if (statusEl) statusEl.textContent = `Saved · ${new Date().toLocaleTimeString()}`;
  renderChapterSidebar();
  showToast("Chapter saved", "good");
}

function navigateChapter(dir) {
  const idx = state.chapters.findIndex(c => c.id === state.activeChapterId);
  const next = state.chapters[idx + dir];
  if (next) openChapter(next.id);
}

// ── Entity edit panel ─────────────────────────────────────────────────────────
const ENTITY_PANEL_FIELDS = {
  character: [
    { id:"ep_name", label:"Name", type:"input" },
    { id:"ep_role", label:"Role", type:"input" },
    { id:"ep_desc", label:"Description", type:"textarea" },
    { id:"ep_traits", label:"Key traits", type:"input" },
    { id:"ep_arc", label:"Arc", type:"textarea" },
    { id:"ep_voice", label:"Voice / speech style", type:"input" },
  ],
  world: [
    { id:"ep_name", label:"Name", type:"input" },
    { id:"ep_desc", label:"Description", type:"textarea" },
    { id:"ep_tone", label:"Tone / genre", type:"input" },
    { id:"ep_rules", label:"World rules", type:"textarea" },
    { id:"ep_factions", label:"Factions / cultures", type:"textarea" },
  ],
  scene: [
    { id:"ep_name", label:"Title", type:"input" },
    { id:"ep_desc", label:"Description", type:"textarea" },
    { id:"ep_pov", label:"POV character", type:"input" },
    { id:"ep_beats", label:"Scene beats", type:"textarea" },
    { id:"ep_outcome", label:"Outcome", type:"input" },
  ],
  draft: [
    { id:"ep_name", label:"Title", type:"input" },
    { id:"ep_desc", label:"Content", type:"textarea" },
  ],
  note: [
    { id:"ep_name", label:"Title", type:"input" },
    { id:"ep_desc", label:"Content", type:"textarea" },
  ],
};

function openEntityPanel(type, data, isNew = false) {
  const singular = type.replace(/s$/,"");
  state.activeEntity = { type: singular, data, isNew };

  qs("#entityPanelEyebrow").textContent = singular.charAt(0).toUpperCase() + singular.slice(1);
  qs("#entityPanelTitle").textContent = data?.title || (isNew ? `New ${singular}` : "—");

  const defs = ENTITY_PANEL_FIELDS[singular] || ENTITY_PANEL_FIELDS.note;
  qs("#entityFields").innerHTML = defs.map(f => `
    <label class="inline-field" style="margin-bottom:8px;">
      <span class="soft">${escHtml(f.label)}</span>
      ${f.type === "textarea"
        ? `<textarea class="textarea" id="${f.id}" rows="3"></textarea>`
        : `<input class="input" id="${f.id}" />`}
    </label>
  `).join("");

  if (data) {
    const set = (id, v) => { const el = qs(`#${id}`); if (el && v) el.value = v; };
    set("ep_name", data.title || data.raw?.name || "");
    set("ep_desc", data.description || "");
    set("ep_role", data.raw?.role || "");
    set("ep_traits", Array.isArray(data.raw?.traits) ? data.raw.traits.join(", ") : (data.raw?.traits || ""));
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
  qs("#entityPanel").style.display = "block";
}

function closeEntityPanel() {
  state.activeEntity = null;
  qs("#entityPanel").style.display = "none";
}

const ENTITY_SAVE_ROUTES = {
  character: { create: "/api/lorecore/characters", update: id => `/api/lorecore/characters/${id}` },
  world:     { create: "/api/lorecore/worlds",     update: id => `/api/lorecore/worlds/${id}` },
  scene:     { create: "/api/lorecore/scenes",     update: id => `/api/lorecore/scenes/${id}` },
  draft:     { create: null, update: null },
  note:      { create: null, update: null },
};

async function saveEntity() {
  if (!state.activeEntity) return;
  const { type, data, isNew } = state.activeEntity;
  const get = id => qs(`#${id}`)?.value.trim() || "";
  const payload = {
    title: get("ep_name"), name: get("ep_name"),
    description: get("ep_desc"),
    role: get("ep_role"), traits: get("ep_traits"),
    arc: get("ep_arc"), voice: get("ep_voice"),
    tone: get("ep_tone"), rules: get("ep_rules"),
    factions: get("ep_factions"), pov: get("ep_pov"),
    beats: get("ep_beats"), outcome: get("ep_outcome"),
    book_public_id: state.selectedBookId,
  };

  const routes = ENTITY_SAVE_ROUTES[type];
  if (!routes) { showToast(`No save route for ${type}`, "warn"); return; }

  let r;
  if (isNew || !data?.id) {
    if (!routes.create) { showToast(`Create ${type} backend pending`, "warn"); return; }
    r = await api(routes.create, { method: "POST", body: payload });
  } else {
    if (!routes.update) { showToast(`Update ${type} backend pending`, "warn"); return; }
    r = await api(routes.update(data.id), { method: "PUT", body: payload });
  }

  if (!r.ok) { showToast(`Save ${type} failed: ${r.status}`, "warn"); return; }
  showToast(`${type} saved`, "good");
  closeEntityPanel();
  if (state.selectedBookId) await loadBookEntities(state.selectedBookId);
}

// ── Extract from chat ─────────────────────────────────────────────────────────
async function extractFromChat(targetType) {
  const type = targetType || state.activeEntity?.type || qs("#extractTypeSelect")?.value || "character";
  const msgs = state.messages;

  const statusEl = qs("#extractStatus");
  if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "Extracting from conversation…"; }

  if (!msgs.length) {
    if (statusEl) statusEl.textContent = "No messages in conversation to extract from.";
    return;
  }

  const conversation = msgs.map(m => `${m.role || "message"}: ${m.content || m.text || ""}`).join("\n");

  const prompts = {
    character: `Extract a character profile. Return only JSON with keys: name, role, description, traits (array), arc, voice. No markdown.\n\n${conversation}`,
    world:     `Extract a world/setting. Return only JSON with keys: name, description, tone, rules, factions. No markdown.\n\n${conversation}`,
    scene:     `Extract a scene. Return only JSON with keys: title, description, pov, beats (array), outcome. No markdown.\n\n${conversation}`,
    chapter:   `Extract chapter content. Return only JSON with keys: title, content. No markdown.\n\n${conversation}`,
    note:      `Summarize key points as a note. Return only JSON with keys: title, description. No markdown.\n\n${conversation}`,
  };

  const r = await api("/api/lorecore/extract", {
    method: "POST",
    body: { entity_type: type, conversation, prompt: prompts[type] || prompts.note },
  });

  if (!r.ok) {
    if (statusEl) statusEl.textContent = "Extract backend not yet available (/api/lorecore/extract). Add it to enable auto-fill.";
    return;
  }

  let data = r.body?.extracted || r.body;
  if (typeof data === "string") {
    try { data = JSON.parse(data.replace(/```json|```/g, "").trim()); }
    catch { if (statusEl) statusEl.textContent = "Could not parse extraction result."; return; }
  }

  // Fill entity panel fields if open, else fill chapter editor
  if (type === "chapter") {
    if (qs("#chapterTitleInput")) qs("#chapterTitleInput").value = data.title || "";
    if (qs("#chapterContentInput")) { qs("#chapterContentInput").value = data.content || ""; updateWordCount(); }
    if (statusEl) statusEl.textContent = "✓ Chapter filled from conversation. Review and save.";
  } else {
    const set = (id, v) => { const el = qs(`#${id}`); if (el && v) el.value = Array.isArray(v) ? v.join(", ") : v; };
    set("ep_name", data.name || data.title || "");
    set("ep_desc", data.description || data.content || "");
    set("ep_role", data.role || "");
    set("ep_traits", data.traits || "");
    set("ep_arc", data.arc || "");
    set("ep_voice", data.voice || "");
    set("ep_tone", data.tone || "");
    set("ep_rules", data.rules || "");
    set("ep_factions", data.factions || "");
    set("ep_pov", data.pov || "");
    set("ep_beats", data.beats || "");
    set("ep_outcome", data.outcome || "");
    if (qs("#entityPanelTitle") && (data.name || data.title)) qs("#entityPanelTitle").textContent = data.name || data.title;
    if (statusEl) statusEl.textContent = "✓ Fields filled from conversation. Review and save.";
  }

  showToast("Extracted from chat", "good");
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function renderChatFeed() {
  const feed = qs("#chatFeed");
  if (!feed) return;
  if (!state.messages.length) {
    feed.innerHTML = `
      <div class="chat-placeholder">
        <div class="chat-placeholder-icon">📖</div>
        <div class="chat-placeholder-title">LoreCore thinking room</div>
        <div class="muted" style="font-size:13px;">Select models and a session to start. Book context is optional.</div>
      </div>`;
    return;
  }
  feed.innerHTML = state.messages.map(msg => {
    const role = msg?.role || msg?.author || "message";
    const content = msg?.content || msg?.text || msg?.body || "";
    const isUser = role === "user";
    return `
      <div class="chat-msg ${isUser ? "chat-msg--user" : "chat-msg--assistant"}">
        <div class="chat-msg-role">${escHtml(role)}</div>
        <div class="chat-msg-content">${escHtml(content)}</div>
      </div>`;
  }).join("");
  feed.scrollTop = feed.scrollHeight;
}

async function sendMessage() {
  const session = state.sessions.find(s => s.id === state.selectedSessionId) || state.sessions[0];
  if (!session) { showToast("No session available", "warn"); return; }
  if (!state.selectedModels.length) { showToast("Select at least one model", "warn"); return; }

  const content = qs("#messageInput")?.value.trim() || "";
  if (!content) return;

  const payload = {
    prompt: content,
    content,
    mode: state.chatMode,
    selected_models: state.selectedModels,
  };
  if (state.selectedBookId) payload.book_public_id = state.selectedBookId;

  // Add user message immediately
  state.messages.push({ role: "user", content });
  qs("#messageInput").value = "";
  renderChatFeed();

  const statusText = qs("#chatStatusText");
  if (statusText) statusText.textContent = "Sending…";

  const r = await api(`/api/lorecore/sessions/${encodeURIComponent(session.id)}/messages`, {
    method: "POST", body: payload,
  });

  if (!r.ok) {
    if (statusText) statusText.textContent = "Send failed";
    showToast("Send failed", "warn");
    return;
  }

  // Parse response — may be single or multi depending on mode
  const body = r.body;
  if (state.chatMode === "parallel" && Array.isArray(body?.responses)) {
    body.responses.forEach(resp => {
      state.messages.push({ role: resp.model || "assistant", content: resp.content || resp.text || "" });
    });
  } else if (state.chatMode === "discussion" && Array.isArray(body?.turns)) {
    body.turns.forEach(turn => {
      state.messages.push({ role: turn.model || turn.role || "assistant", content: turn.content || turn.text || "" });
    });
  } else {
    const reply = body?.content || body?.response || body?.text || body?.message || "";
    if (reply) state.messages.push({ role: body?.model || "assistant", content: reply });
  }

  if (statusText) statusText.textContent = "";
  renderChatFeed();
}

// ── Load overview ─────────────────────────────────────────────────────────────
async function loadOverview() {
  setChip("#libraryStatusChip", "Loading", "status-chip--warn");
  const r = await api("/api/lorecore/overview");
  if (!r.ok) {
    setChip("#libraryStatusChip", "Failed", "status-chip--warn");
    showToast("Overview failed", "warn");
    return;
  }
  const ov = r.body || {};
  state.books    = normalizeList(ov, ["books","book_library","items"]).map(normalizeBook);
  state.sessions = normalizeList(ov, ["sessions","discussion_sessions","chat_sessions"]).map(normalizeSession);

  if (!state.selectedBookId && state.books.length) state.selectedBookId = state.books[0].id;
  if (!state.selectedSessionId && state.sessions.length) state.selectedSessionId = state.sessions[0].id;

  setChip("#libraryStatusChip", `${state.books.length} books`, "status-chip--good");
  renderBookLibrary();
  renderSessionSelect();
  updateContextStrip();
  if (state.selectedBookId) await loadBookEntities(state.selectedBookId);
}

// ── New book ──────────────────────────────────────────────────────────────────
async function createBook() {
  const title = qs("#newBookTitle")?.value.trim() || "";
  if (!title) { showToast("Title required", "warn"); return; }
  const payload = {
    title,
    status: qs("#newBookStatus")?.value.trim() || "",
    description: qs("#newBookDesc")?.value.trim() || "",
  };
  const r = await api("/api/lorecore/books", { method: "POST", body: payload });
  if (!r.ok) { showToast(`Create book failed: ${r.status}`, "warn"); return; }
  showToast("Book created", "good");
  qs("#newBookForm").style.display = "none";
  qs("#newBookToggleBtn").style.display = "block";
  await loadOverview();
}

// ── Session select ────────────────────────────────────────────────────────────
function renderSessionSelect() {
  const sel = qs("#sessionSelect");
  if (!sel) return;
  if (!state.sessions.length) {
    sel.innerHTML = `<option value="">No session</option>`;
    setChip("#sessionChip", "No session", "status-chip--warn");
    return;
  }
  sel.innerHTML = state.sessions.map(s =>
    `<option value="${escHtml(s.id)}">${escHtml(s.title)}</option>`
  ).join("");
  sel.value = state.selectedSessionId || state.sessions[0].id;

  // Load messages from selected session
  const session = state.sessions.find(s => s.id === sel.value);
  state.messages = session?.messages || [];
  renderChatFeed();
  setChip("#sessionChip", "Active", "status-chip--good");
}

// ── Context strip ─────────────────────────────────────────────────────────────
function updateContextStrip() {
  const book = state.books.find(b => b.id === state.selectedBookId);
  const el = id => qs(id);
  if (el("#ctxBook")) el("#ctxBook").textContent = book?.title || "None (free room)";
  if (el("#ctxSession")) el("#ctxSession").textContent = state.selectedSessionId || "—";
  if (el("#ctxMode")) el("#ctxMode").textContent = state.chatMode;
  if (el("#ctxModels")) el("#ctxModels").textContent = state.selectedModels.join(", ") || "—";
}

function renderEntityCounts() {
  const box = qs("#entityCountBox");
  if (!box) return;
  box.innerHTML = `
    <strong>${state.books.length} books</strong>
    <span>${state.characters.length} characters · ${state.worlds.length} worlds · ${state.scenes.length} scenes · ${state.chapters.length} chapters · ${state.drafts.length} drafts · ${state.notes.length} notes</span>
  `;
}

// ── Run stage ─────────────────────────────────────────────────────────────────
async function runStage() {
  if (!state.selectedBookId) { showToast("Select a book first", "warn"); return; }
  const stage = qs("#stageSelect")?.value || "draft";
  setChip("#pipelineStatusChip", "Running…", "status-chip--warn");
  const r = await api(`/api/lorecore/books/${encodeURIComponent(state.selectedBookId)}/run-stage`, {
    method: "POST", body: { stage },
  });
  if (!r.ok) { setChip("#pipelineStatusChip", "Failed", "status-chip--warn"); showToast(`Stage failed: ${r.status}`, "warn"); return; }
  setChip("#pipelineStatusChip", `${stage} done`, "status-chip--good");
  const rb = qs("#stageResultBox"), rt = qs("#stageResultText");
  if (rb && rt) { rt.textContent = JSON.stringify(r.body||{}).slice(0,300); rb.style.display = "block"; }
  showToast(`Stage ${stage} complete`, "good");
}

// ── Export ────────────────────────────────────────────────────────────────────
async function exportLore() {
  const payload = {};
  if (state.selectedBookId) payload.book_public_id = state.selectedBookId;
  if (state.selectedSessionId) payload.session_public_id = state.selectedSessionId;
  const r = await api("/api/lorecore/exports", { method: "POST", body: payload });
  if (!r.ok) { showToast("Export failed", "warn"); return; }
  showToast("Export requested", "good");
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Book library
  qs("#bookLibraryList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-book-id]");
    if (btn) selectBook(btn.dataset.bookId);
  });

  // New book form toggle
  qs("#newBookToggleBtn")?.addEventListener("click", () => {
    qs("#newBookForm").style.display = "block";
    qs("#newBookToggleBtn").style.display = "none";
  });
  qs("#cancelNewBookBtn")?.addEventListener("click", () => {
    qs("#newBookForm").style.display = "none";
    qs("#newBookToggleBtn").style.display = "block";
  });
  qs("#saveNewBookBtn")?.addEventListener("click", createBook);

  // Entity tabs
  qs("#entityTabs")?.addEventListener("click", e => {
    const btn = e.target.closest(".entity-tab");
    if (btn) renderEntityTab(btn.dataset.tab);
  });

  // Entity list clicks
  qs("#entityList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-entity-type][data-entity-id]");
    if (!btn) return;
    const type = btn.dataset.entityType;
    const id = btn.dataset.entityId;
    if (type === "chapters") {
      openChapter(id);
    } else {
      const list = getEntityList(type);
      const item = list.find(x => x.id === id);
      if (item) openEntityPanel(type, item, false);
    }
  });

  // Quick create
  qs("#quickCreateBtn")?.addEventListener("click", quickCreate);

  // Chapter sidebar
  qs("#chapterSidebarList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-chapter-id]");
    if (btn) openChapter(btn.dataset.chapterId);
  });
  qs("#saveChapterBtn")?.addEventListener("click", saveChapter);
  qs("#prevChapterBtn")?.addEventListener("click", () => navigateChapter(-1));
  qs("#nextChapterBtn")?.addEventListener("click", () => navigateChapter(1));
  qs("#chapterContentInput")?.addEventListener("input", updateWordCount);
  qs("#addChapterBtn")?.addEventListener("click", () => {
    renderEntityTab("chapters");
    qs("#bookEntitySection").style.display = "block";
  });
  qs("#extractChapterBtn")?.addEventListener("click", () => extractFromChat("chapter"));

  // Entity panel
  qs("#saveEntityBtn")?.addEventListener("click", saveEntity);
  qs("#closeEntityBtn")?.addEventListener("click", closeEntityPanel);
  qs("#extractEntityBtn")?.addEventListener("click", () => extractFromChat(state.activeEntity?.type));

  // Extract from right rail
  qs("#openExtractBtn")?.addEventListener("click", () => {
    const type = qs("#extractTypeSelect")?.value || "character";
    if (type === "chapter") {
      // Open chapter editor if not already
      if (!state.activeChapterId && state.chapters.length) openChapter(state.chapters[0].id);
      extractFromChat("chapter");
    } else {
      openEntityPanel(type + "s", null, true);
    }
  });

  // Mode cards
  qs("#modeCards")?.addEventListener("click", e => {
    const card = e.target.closest(".mode-card");
    if (!card) return;
    state.chatMode = card.dataset.mode;
    qsa(".mode-card").forEach(c => c.classList.toggle("mode-card--active", c.dataset.mode === state.chatMode));
    if (state.chatMode === "single" && state.selectedModels.length > 1) {
      state.selectedModels = [state.selectedModels[0]];
    }
    renderModelList();
    updateContextStrip();
  });

  // Session select
  qs("#sessionSelect")?.addEventListener("change", e => {
    state.selectedSessionId = e.target.value || null;
    const session = state.sessions.find(s => s.id === state.selectedSessionId);
    state.messages = session?.messages || [];
    renderChatFeed();
    updateContextStrip();
  });

  // Chat send
  qs("#sendBtn")?.addEventListener("click", sendMessage);
  qs("#messageInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendMessage();
  });

  // Pipeline
  qs("#runStageBtn")?.addEventListener("click", runStage);
  qs("#exportBtn")?.addEventListener("click", exportLore);
  qs("#refreshBtn")?.addEventListener("click", loadOverview);
}

function init() {
  bindEvents();
  loadModels();
  loadOverview();
}

document.addEventListener("DOMContentLoaded", init);
