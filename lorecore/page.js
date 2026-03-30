const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const FREE_SESSION_ID = "chat-lore-01";

const state = {
  books: [], sessions: [],
  characters: [], worlds: [], scenes: [], chapters: [], drafts: [], notes: [],
  selectedBookId: null,
  selectedSessionId: FREE_SESSION_ID,
  activeChapterId: null,
  activeEntityTab: "characters",
  activeEntity: null,
  chatMode: "single", selectedModels: [], availableModels: [],
  messages: [],
  freeMode: true,
};

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const escHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
function wordCount(t) { return (t||"").trim().split(/\s+/).filter(Boolean).length; }

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2800);
}
function setChip(id, text, cls) { const el = qs(id); if (!el) return; el.textContent = text; el.className = `status-chip ${cls}`; }

async function api(path, opts = {}) {
  const cfg = { method: "GET", headers: {}, ...opts };
  if (cfg.body && typeof cfg.body !== "string") { cfg.headers["Content-Type"] = "application/json"; cfg.body = JSON.stringify(cfg.body); }
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, cfg);
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) { return { ok: false, status: 0, error: String(e) }; }
}

function normalizeList(body, keys) {
  for (const k of keys) if (Array.isArray(body?.[k])) return body[k];
  return Array.isArray(body) ? body : [];
}
function normalizeBook(raw, i = 0) {
  return {
    id: raw?.book_public_id || raw?.public_id || raw?.id || `book_${i}`,
    title: raw?.title || raw?.name || `Book ${i+1}`,
    status: raw?.status || raw?.phase || raw?.active_stage || "",
    libraryId: raw?.library_public_id || "LIB-3001",
    raw,
  };
}
function normalizeMsg(raw) {
  return {
    role: raw?.role || raw?.type || "message",
    content: raw?.content || raw?.text || "",
    model: raw?.model || "",
  };
}
function normalizeSession(raw, i = 0) {
  const msgs = Array.isArray(raw?.messages) ? raw.messages.map(normalizeMsg) : [];
  return {
    id: raw?.session_public_id || raw?.public_id || raw?.id || `session_${i}`,
    title: raw?.title || raw?.name || `Session ${i+1}`,
    excerpt: raw?.excerpt || "",
    bookId: raw?.book_public_id || null,
    messages: msgs,
    raw,
  };
}
function normalizeEntity(raw, i = 0, type = "item") {
  const content = raw?.content || raw?.text || "";
  return {
    id: raw?.public_id || raw?.id || `${type}_${i}`,
    title: raw?.title || raw?.name || `${type} ${i+1}`,
    description: raw?.description || raw?.summary || content || "",
    order: raw?.order_index ?? raw?.order ?? i,
    wordCount: raw?.word_count || wordCount(content),
    content, raw,
  };
}
function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

// ── Models ────────────────────────────────────────────────────────────────────
async function loadModels() {
  const r = await api("/api/model-pool/models");
  const items = r.ok ? (Array.isArray(r.body?.items) ? r.body.items : Array.isArray(r.body) ? r.body : []) : [];
  state.availableModels = items
    .filter(m => m.runtime_driver === "openai_api" && m.enabled !== false && parseSurfaces(m.surface_allowlist).includes("lorecore"))
    .map(m => ({ alias: m.alias || m.name, label: m.name || m.alias }));
  renderModelSelector();
}

function renderModelSelector() {
  const container = qs("#modelSelectorWrap"); if (!container) return;
  if (!state.availableModels.length) {
    container.innerHTML = `<div class="muted" style="font-size:12px;">No models — enable lorecore surface in Settings.</div>`;
    return;
  }
  if (state.chatMode === "single") {
    const current = state.selectedModels[0] || "";
    container.innerHTML = `
      <select class="select" id="modelDropdown" style="font-size:12px;">
        <option value="">Select model…</option>
        ${state.availableModels.map(m => `<option value="${escHtml(m.alias)}" ${current === m.alias ? "selected" : ""}>${escHtml(m.label)}</option>`).join("")}
      </select>`;
    qs("#modelDropdown")?.addEventListener("change", e => {
      state.selectedModels = e.target.value ? [e.target.value] : [];
      updateContextStrip();
    });
  } else {
    container.innerHTML = `
      <div class="model-check-list">
        ${state.availableModels.map(m => `
          <label class="model-check-item ${state.selectedModels.includes(m.alias) ? "model-check-item--active" : ""}">
            <input type="checkbox" class="model-mcb" value="${escHtml(m.alias)}" ${state.selectedModels.includes(m.alias) ? "checked" : ""} />
            ${escHtml(m.label)}
          </label>`).join("")}
      </div>`;
    qsa(".model-mcb").forEach(cb => cb.addEventListener("change", () => {
      if (cb.checked && !state.selectedModels.includes(cb.value)) state.selectedModels.push(cb.value);
      if (!cb.checked) state.selectedModels = state.selectedModels.filter(a => a !== cb.value);
      cb.closest("label")?.classList.toggle("model-check-item--active", cb.checked);
      updateContextStrip();
    }));
  }
}

// ── Session list ──────────────────────────────────────────────────────────────
function renderSessionList() {
  const el = qs("#sessionList"); if (!el) return;
  // Update free chat button active state
  const freeBtn = qs("#freeChatBtn");
  if (freeBtn) {
    freeBtn.classList.toggle("session-item--active", state.freeMode);
  }
  if (!state.sessions.length) {
    el.innerHTML = `<div class="lib-placeholder">No sessions yet.</div>`;
    setChip("#sessionChip", "—", "status-chip--warn"); return;
  }
  el.innerHTML = state.sessions.map(s => {
    const bookName = s.bookId ? (state.books.find(b => b.id === s.bookId)?.title || s.bookId) : null;
    const isActive = !state.freeMode && s.id === state.selectedSessionId;
    return `
      <button class="session-item ${isActive ? "session-item--active" : ""}"
        type="button" data-session-id="${escHtml(s.id)}">
        <div class="session-item-title">${escHtml(s.title)}</div>
        <div class="session-item-sub">${bookName ? "📚 " + escHtml(bookName) : escHtml(s.excerpt || "General")}</div>
      </button>`;
  }).join("");
  setChip("#sessionChip", `${state.sessions.length}`, "status-chip--good");
}

function selectSession(sessionId, freeMode = false) {
  state.freeMode = freeMode;
  state.selectedSessionId = sessionId;

  if (freeMode) {
    state.selectedBookId = null;
    state.messages = [];
    clearEntityData();
    renderActiveTab();
    renderChapterList();
  } else {
    const session = state.sessions.find(s => s.id === sessionId);
    if (session?.messages?.length) state.messages = session.messages;
    if (session?.bookId && session.bookId !== state.selectedBookId) {
      state.selectedBookId = session.bookId;
      renderBookList();
      loadBookEntities(session.bookId);
    }
  }

  updateScopeChip();
  renderSessionList();
  renderBookList();
  renderChatFeed();
  updateContextStrip();
}

function updateScopeChip() {
  const chip = qs("#libScopeChip"); if (!chip) return;
  if (state.freeMode || !state.selectedBookId) {
    chip.textContent = "Free chat";
    chip.className = "status-chip";
  } else {
    const b = state.books.find(x => x.id === state.selectedBookId);
    chip.textContent = b ? b.title : "No book";
    chip.className = b ? "status-chip status-chip--good" : "status-chip status-chip--warn";
  }
}

// ── Book list ─────────────────────────────────────────────────────────────────
function renderBookList() {
  const el = qs("#bookList"); if (!el) return;
  if (!state.books.length) { el.innerHTML = `<div class="lib-placeholder muted">No books yet.</div>`; return; }
  el.innerHTML = state.books.map(b => `
    <button class="book-card ${b.id === state.selectedBookId && !state.freeMode ? "book-card--active" : ""}"
      type="button" data-book-id="${escHtml(b.id)}">
      <div class="book-card-title">${escHtml(b.title)}</div>
      <div class="book-card-meta">${escHtml(b.status || "—")}</div>
    </button>
  `).join("");
}

function selectBook(id) {
  // Toggle: clicking active book goes back to free mode
  if (id === state.selectedBookId && !state.freeMode) {
    selectSession(FREE_SESSION_ID, true);
    return;
  }

  state.selectedBookId = id;
  state.freeMode = false;
  state.activeChapterId = null;
  state.activeEntity = null;
  clearEntityData();
  closeEntityEditor();
  closeChapterEditor();
  renderBookList();
  updateScopeChip();
  updateContextStrip();

  // Use existing session for this book or default
  const existing = state.sessions.find(s => s.bookId === id);
  if (existing) {
    state.selectedSessionId = existing.id;
    if (existing.messages?.length) state.messages = existing.messages;
  } else {
    state.selectedSessionId = FREE_SESSION_ID;
    state.messages = [];
  }

  renderSessionList();
  renderChatFeed();
  loadBookEntities(id);
}

function clearEntityData() {
  state.characters = []; state.worlds = []; state.scenes = [];
  state.chapters = []; state.drafts = []; state.notes = [];
}

// ── Load entities ─────────────────────────────────────────────────────────────
async function loadBookEntities(bookId) {
  const book = state.books.find(b => b.id === bookId);
  const libraryId = book?.libraryId || "LIB-3001";
  const [ovR, chapR, draftsR, notesR] = await Promise.all([
    api(`/api/lorecore/overview?library_public_id=${encodeURIComponent(libraryId)}&book_public_id=${encodeURIComponent(bookId)}`),
    api(`/api/lorecore/chapters?book_public_id=${encodeURIComponent(bookId)}`),
    api(`/api/lorecore/drafts?book_public_id=${encodeURIComponent(bookId)}`),
    api(`/api/lorecore/notes?book_public_id=${encodeURIComponent(bookId)}`),
  ]);
  if (ovR.ok) {
    const ov = ovR.body || {};
    state.characters = normalizeList(ov, ["characters"]).map((x,i) => normalizeEntity(x,i,"character"));
    state.worlds     = normalizeList(ov, ["worlds"]).map((x,i) => normalizeEntity(x,i,"world"));
    state.scenes     = normalizeList(ov, ["scenes"]).map((x,i) => normalizeEntity(x,i,"scene"));
  }
  state.chapters = chapR.ok ? normalizeList(chapR.body, ["items","chapters","data"]).map((x,i) => normalizeEntity(x,i,"chapter")).sort((a,b) => a.order - b.order) : [];
  state.drafts = draftsR.ok ? normalizeList(draftsR.body, ["items","drafts","data"]).map((x,i) => normalizeEntity(x,i,"draft")) : [];
  state.notes  = notesR.ok  ? normalizeList(notesR.body,  ["items","notes","data"]).map((x,i) => normalizeEntity(x,i,"note"))  : [];
  renderActiveTab(); renderChapterList(); renderEntityCounts();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  state.activeEntityTab = tab;
  qsa(".lib-tab").forEach(b => b.classList.toggle("lib-tab--active", b.dataset.tab === tab));
  qs("#tabEntity").style.display   = tab !== "chapters" ? "block" : "none";
  qs("#tabChapters").style.display = tab === "chapters" ? "block" : "none";
  if (tab === "chapters") renderChapterList(); else renderEntityList(tab);
  updateQcLabel(tab);
}
function renderActiveTab() {
  const tab = state.activeEntityTab;
  if (tab === "chapters") renderChapterList(); else renderEntityList(tab);
}
function getList(tab) {
  return { characters: state.characters, worlds: state.worlds, scenes: state.scenes, drafts: state.drafts, notes: state.notes }[tab] || [];
}

function renderEntityList(tab) {
  const el = qs("#entityList"); if (!el) return;
  // No book selected — show prompt regardless of data
  if (state.freeMode || !state.selectedBookId) {
    el.innerHTML = `<div class="lib-placeholder muted">Select a book to load ${tab}.</div>`;
    return;
  }
  const items = getList(tab);
  if (!items.length) {
    el.innerHTML = `<div class="lib-placeholder muted">No ${tab} yet. Press + New.</div>`;
    return;
  }
  el.innerHTML = items.map(item => `
    <button class="entity-card ${state.activeEntity?.data?.id === item.id ? "entity-card--active" : ""}"
      type="button" data-entity-tab="${escHtml(tab)}" data-entity-id="${escHtml(item.id)}">
      <div class="entity-card-title">${escHtml(item.title)}</div>
      <div class="entity-card-meta">${escHtml((item.description||"").slice(0,64))}</div>
    </button>
  `).join("");
}

// ── Entity editor ─────────────────────────────────────────────────────────────
const ENTITY_PANEL_FIELDS = {
  character: [{id:"ep_name",label:"Name",type:"input"},{id:"ep_role",label:"Role",type:"input"},{id:"ep_desc",label:"Description",type:"textarea"},{id:"ep_traits",label:"Key traits",type:"input"},{id:"ep_arc",label:"Arc",type:"textarea"},{id:"ep_voice",label:"Voice",type:"input"}],
  world:     [{id:"ep_name",label:"Name",type:"input"},{id:"ep_desc",label:"Description",type:"textarea"},{id:"ep_tone",label:"Tone / genre",type:"input"},{id:"ep_rules",label:"World rules",type:"textarea"},{id:"ep_factions",label:"Factions",type:"textarea"}],
  scene:     [{id:"ep_name",label:"Title",type:"input"},{id:"ep_desc",label:"Description",type:"textarea"},{id:"ep_pov",label:"POV",type:"input"},{id:"ep_beats",label:"Beats",type:"textarea"},{id:"ep_outcome",label:"Outcome",type:"input"}],
  draft:     [{id:"ep_name",label:"Title",type:"input"},{id:"ep_desc",label:"Content",type:"textarea"}],
  note:      [{id:"ep_name",label:"Title",type:"input"},{id:"ep_desc",label:"Content",type:"textarea"}],
};
function tabToSingular(tab) { return tab.replace(/s$/,""); }

function openEntityEditor(tab, item, isNew = false) {
  if (state.freeMode || !state.selectedBookId) { showToast("Select a book first", "warn"); return; }
  const singular = tabToSingular(tab);
  state.activeEntity = { type: singular, data: item, isNew };
  qs("#entityEditorEyebrow").textContent = singular.charAt(0).toUpperCase() + singular.slice(1);
  qs("#entityEditorTitle").textContent = item?.title || (isNew ? `New ${singular}` : "—");
  const defs = ENTITY_PANEL_FIELDS[singular] || ENTITY_PANEL_FIELDS.note;
  qs("#entityFields").innerHTML = defs.map(f => `
    <label class="inline-field" style="margin-bottom:8px;"><span class="soft">${escHtml(f.label)}</span>
      ${f.type==="textarea" ? `<textarea class="textarea" id="${f.id}" rows="3"></textarea>` : `<input class="input" id="${f.id}" />`}
    </label>`).join("");
  if (item) {
    const set = (id, v) => { const el = qs(`#${id}`); if (el && v != null) el.value = Array.isArray(v) ? v.join(", ") : v; };
    set("ep_name", item.title||item.raw?.name||""); set("ep_desc", item.description||item.raw?.summary||"");
    set("ep_role", item.raw?.role||""); set("ep_traits", item.raw?.traits||""); set("ep_arc", item.raw?.arc||"");
    set("ep_voice", item.raw?.voice||""); set("ep_tone", item.raw?.tone||""); set("ep_rules", item.raw?.rules||"");
    set("ep_factions", item.raw?.factions||""); set("ep_pov", item.raw?.pov||"");
    set("ep_beats", item.raw?.beats||item.raw?.beat_notes||""); set("ep_outcome", item.raw?.outcome||"");
  }
  qs("#extractStatus").style.display = "none";
  qs("#entityEditorEmpty").style.display = "none";
  qs("#entityEditorActive").style.display = "block";
  renderEntityList(tab);
}
function closeEntityEditor() {
  state.activeEntity = null;
  if (qs("#entityEditorEmpty")) qs("#entityEditorEmpty").style.display = "flex";
  if (qs("#entityEditorActive")) qs("#entityEditorActive").style.display = "none";
}

const SAVE_ROUTES = {
  character: { create: "/api/lorecore/characters", update: id => `/api/lorecore/characters/${id}` },
  world:     { create: "/api/lorecore/worlds",     update: id => `/api/lorecore/worlds/${id}` },
  scene:     { create: "/api/lorecore/scenes",     update: id => `/api/lorecore/scenes/${id}` },
  draft: { create: null, update: null }, note: { create: null, update: null },
};

async function saveEntity() {
  if (!state.activeEntity) return;
  const { type, data, isNew } = state.activeEntity;
  const get = id => qs(`#${id}`)?.value.trim() || "";
  const book = state.books.find(b => b.id === state.selectedBookId);
  const payload = {
    title: get("ep_name"), name: get("ep_name"), summary: get("ep_desc"), description: get("ep_desc"),
    role: get("ep_role"), traits: get("ep_traits"), arc: get("ep_arc"), voice: get("ep_voice"),
    tone: get("ep_tone"), rules: get("ep_rules"), factions: get("ep_factions"),
    pov: get("ep_pov"), beat_notes: get("ep_beats"), outcome: get("ep_outcome"),
    book_public_id: state.selectedBookId, library_public_id: book?.libraryId || "LIB-3001",
  };
  const routes = SAVE_ROUTES[type];
  if (!routes) { showToast(`No route for ${type}`, "warn"); return; }
  let r;
  if (isNew || !data?.id) {
    if (!routes.create) { showToast(`Create ${type}: not available`, "warn"); return; }
    r = await api(routes.create, { method: "POST", body: payload });
  } else {
    if (!routes.update) { showToast(`Update ${type}: not available`, "warn"); return; }
    r = await api(routes.update(data.id), { method: "PUT", body: payload });
  }
  if (!r.ok) { showToast(`Save ${type} failed: ${r.status}`, "warn"); return; }
  showToast(`${type} saved`, "good");
  closeEntityEditor();
  if (state.selectedBookId) await loadBookEntities(state.selectedBookId);
}

// ── Chapters ──────────────────────────────────────────────────────────────────
function renderChapterList() {
  const el = qs("#chapterList"); if (!el) return;
  if (state.freeMode || !state.selectedBookId) {
    el.innerHTML = `<div class="lib-placeholder muted">Select a book.</div>`; return;
  }
  if (!state.chapters.length) { el.innerHTML = `<div class="lib-placeholder muted">No chapters yet.</div>`; return; }
  el.innerHTML = state.chapters.map((ch, i) => `
    <button class="chapter-item ${ch.id === state.activeChapterId ? "chapter-item--active" : ""}" type="button" data-chapter-id="${escHtml(ch.id)}">
      <div class="chapter-num">${i+1}</div>
      <div class="chapter-item-body">
        <div class="chapter-item-title">${escHtml(ch.title)}</div>
        <div class="chapter-item-meta">${(ch.wordCount||0).toLocaleString()} words</div>
      </div>
    </button>`).join("");
}

function openChapter(id) {
  const ch = state.chapters.find(c => c.id === id); if (!ch) return;
  state.activeChapterId = id; renderChapterList();
  qs("#chapterEditorEmpty").style.display = "none";
  qs("#chapterEditorActive").style.display = "flex";
  qs("#chapterTitleInput").value = ch.title;
  qs("#chapterContent").value = ch.content || ch.description || "";
  updateWordCount();
  const idx = state.chapters.findIndex(c => c.id === id);
  qs("#prevChapterBtn").disabled = idx <= 0;
  qs("#nextChapterBtn").disabled = idx >= state.chapters.length - 1;
}
function closeChapterEditor() {
  state.activeChapterId = null;
  if (qs("#chapterEditorEmpty")) qs("#chapterEditorEmpty").style.display = "flex";
  if (qs("#chapterEditorActive")) qs("#chapterEditorActive").style.display = "none";
}
function updateWordCount() {
  const content = qs("#chapterContent")?.value || "";
  const wc = wordCount(content);
  if (qs("#wordCount")) qs("#wordCount").textContent = `${wc.toLocaleString()} words`;
  if (qs("#wordCountDetail")) qs("#wordCountDetail").textContent = `${wc.toLocaleString()} words · ${content.length.toLocaleString()} chars`;
}
async function saveChapter() {
  const id = state.activeChapterId;
  const ch = state.chapters.find(c => c.id === id); if (!ch) return;
  const title = qs("#chapterTitleInput")?.value.trim() || ch.title;
  const content = qs("#chapterContent")?.value || "";
  const payload = { title, name: title, content, summary: content, book_public_id: state.selectedBookId };
  const statusEl = qs("#chapterSaveStatus");
  if (statusEl) statusEl.textContent = "Saving…";
  let r;
  if (id && !id.startsWith("chapter_")) r = await api(`/api/lorecore/chapters/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
  else r = await api("/api/lorecore/chapters", { method: "POST", body: payload });
  if (!r.ok) { if (statusEl) statusEl.textContent = "Save failed"; showToast(`Save failed: ${r.status}`, "warn"); return; }
  ch.title = title; ch.content = content; ch.wordCount = wordCount(content);
  if (r.body?.public_id && r.body.public_id !== id) { ch.id = r.body.public_id; state.activeChapterId = ch.id; }
  if (statusEl) statusEl.textContent = `Saved · ${new Date().toLocaleTimeString()}`;
  renderChapterList(); showToast("Chapter saved", "good");
}
function navigateChapter(dir) {
  const idx = state.chapters.findIndex(c => c.id === state.activeChapterId);
  const next = state.chapters[idx + dir]; if (next) openChapter(next.id);
}

// ── Quick create ──────────────────────────────────────────────────────────────
const QC_FIELDS = {
  characters: [{id:"qc_name",label:"Name",type:"input",p:"Character name"},{id:"qc_role",label:"Role",type:"input",p:"Protagonist…"},{id:"qc_desc",label:"Description",type:"textarea",p:"Motivation, arc"}],
  worlds:     [{id:"qc_name",label:"Name",type:"input",p:"World name"},{id:"qc_desc",label:"Description",type:"textarea",p:"Geography, rules"},{id:"qc_tone",label:"Tone",type:"input",p:"Dark fantasy…"}],
  scenes:     [{id:"qc_name",label:"Title",type:"input",p:"Scene title"},{id:"qc_desc",label:"Description",type:"textarea",p:"Purpose, conflict"},{id:"qc_pov",label:"POV",type:"input",p:"POV character"}],
  chapters:   [{id:"qc_name",label:"Title",type:"input",p:"Chapter title"},{id:"qc_order",label:"Chapter #",type:"input",p:"1"},{id:"qc_desc",label:"Summary",type:"textarea",p:"Optional summary"}],
  drafts:     [{id:"qc_name",label:"Title",type:"input",p:"Draft title"},{id:"qc_desc",label:"Content",type:"textarea",p:"Content"}],
  notes:      [{id:"qc_name",label:"Title",type:"input",p:"Note title"},{id:"qc_desc",label:"Content",type:"textarea",p:"Content"}],
};
const QC_ROUTES = { characters:"/api/lorecore/characters", worlds:"/api/lorecore/worlds", scenes:"/api/lorecore/scenes", chapters:"/api/lorecore/chapters", drafts:null, notes:null };
function updateQcLabel(tab) { const el = qs("#qcLabel"); if (el) el.textContent = `New ${tabToSingular(tab)}`; }

function openQuickCreate() {
  if (state.freeMode || !state.selectedBookId) { showToast("Select a book first", "warn"); return; }
  const tab = state.activeEntityTab; updateQcLabel(tab);
  qs("#qcFields").innerHTML = (QC_FIELDS[tab]||[]).map(f => `
    <label class="inline-field" style="margin-bottom:6px;"><span class="soft">${escHtml(f.label)}</span>
      ${f.type==="textarea" ? `<textarea class="textarea" id="${f.id}" placeholder="${escHtml(f.p||"")}" rows="2"></textarea>` : `<input class="input" id="${f.id}" placeholder="${escHtml(f.p||"")}" />`}
    </label>`).join("");
  qs("#quickCreatePanel").style.display = "block";
}

async function quickCreate() {
  const tab = state.activeEntityTab;
  const get = id => qs(`#${id}`)?.value.trim() || "";
  const title = get("qc_name"); if (!title) { showToast("Title required","warn"); return; }
  const route = QC_ROUTES[tab]; if (!route) { showToast(`Create ${tab}: not available`,"warn"); return; }
  const book = state.books.find(b => b.id === state.selectedBookId);
  const payload = { title, name: title, summary: get("qc_desc"), description: get("qc_desc"), role: get("qc_role"), tone: get("qc_tone"), pov: get("qc_pov"), order: parseInt(get("qc_order")) || state.chapters.length + 1, book_public_id: state.selectedBookId, library_public_id: book?.libraryId || "LIB-3001" };
  const r = await api(route, { method: "POST", body: payload });
  if (!r.ok) { showToast(`Create failed: ${r.status}`,"warn"); return; }
  showToast(`${tabToSingular(tab)} created`,"good");
  qs("#quickCreatePanel").style.display = "none";
  if (state.selectedBookId) await loadBookEntities(state.selectedBookId);
}

// ── Extract ───────────────────────────────────────────────────────────────────
async function extractFromChat(type) {
  const msgs = state.messages;
  const statusEl = qs("#extractStatus");
  if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "Extracting…"; }
  if (!msgs.length) { if (statusEl) statusEl.textContent = "No messages to extract from."; return; }
  const conv = msgs.map(m => `${m.role}: ${m.content}`).join("\n");
  const prompts = {
    character: `Extract a character profile. Return only JSON: name, role, description, traits (array), arc, voice.\n\n${conv}`,
    world:     `Extract a world/setting. Return only JSON: name, description, tone, rules, factions.\n\n${conv}`,
    scene:     `Extract a scene. Return only JSON: title, description, pov, beats (array), outcome.\n\n${conv}`,
    chapter:   `Extract chapter content. Return only JSON: title, content.\n\n${conv}`,
    note:      `Summarize key points. Return only JSON: title, description.\n\n${conv}`,
  };
  const r = await api("/api/lorecore/extract", { method:"POST", body:{ entity_type:type, conversation:conv, prompt:prompts[type]||prompts.note, book_public_id:state.selectedBookId } });
  if (!r.ok) { if (statusEl) statusEl.textContent = `Extract returned ${r.status}.`; return; }
  let data = r.body?.extracted || r.body;
  if (typeof data === "string") { try { data = JSON.parse(data.replace(/```json|```/g,"").trim()); } catch { if (statusEl) statusEl.textContent = "Could not parse result."; return; } }
  const set = (id, v) => { const el = qs(`#${id}`); if (el && v != null) el.value = Array.isArray(v) ? v.join(", ") : v; };
  if (type === "chapter") { set("chapterTitleInput", data.title||""); set("chapterContent", data.content||""); updateWordCount(); }
  else {
    set("ep_name", data.name||data.title||""); set("ep_desc", data.description||data.summary||"");
    set("ep_role", data.role||""); set("ep_traits", data.traits||""); set("ep_arc", data.arc||"");
    set("ep_voice", data.voice||""); set("ep_tone", data.tone||""); set("ep_rules", data.rules||"");
    set("ep_factions", data.factions||""); set("ep_pov", data.pov||""); set("ep_beats", data.beats||""); set("ep_outcome", data.outcome||"");
    if (qs("#entityEditorTitle") && (data.name||data.title)) qs("#entityEditorTitle").textContent = data.name||data.title;
  }
  if (statusEl) statusEl.textContent = "✓ Filled from conversation. Review and save.";
  showToast("Extracted", "good");
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function renderChatFeed() {
  const feed = qs("#chatFeed"); if (!feed) return;
  if (!state.messages.length) {
    const bookName = !state.freeMode && state.selectedBookId ? state.books.find(b=>b.id===state.selectedBookId)?.title : null;
    feed.innerHTML = `<div class="chat-placeholder"><div class="chat-placeholder-icon">📖</div><div class="chat-placeholder-title">LoreCore thinking room</div><div class="muted" style="font-size:13px;">${bookName ? `Book: ${escHtml(bookName)}` : "Free chat — no book context"}</div></div>`;
    return;
  }
  feed.innerHTML = state.messages.map(msg => {
    const role = msg?.role || msg?.type || "message";
    const content = msg?.content || msg?.text || "";
    const isUser = role === "user";
    return `<div class="chat-msg ${isUser?"chat-msg--user":"chat-msg--assistant"}">
      <div class="chat-msg-role">${escHtml(msg.model && !isUser ? msg.model : role)}</div>
      <div class="chat-msg-content">${escHtml(content)}</div>
    </div>`;
  }).join("");
  feed.scrollTop = feed.scrollHeight;
}

async function sendMessage() {
  if (!state.selectedModels.length) { showToast("Select a model first", "warn"); return; }
  const content = qs("#messageInput")?.value.trim() || "";
  if (!content) return;

  const book = state.books.find(b => b.id === state.selectedBookId);
  const payload = { prompt: content, mode: state.chatMode, selected_models: state.selectedModels };
  if (!state.freeMode && state.selectedBookId) payload.book_public_id = state.selectedBookId;
  if (!state.freeMode && book?.libraryId) payload.library_public_id = book.libraryId;

  state.messages.push({ role: "user", content, model: "" });
  qs("#messageInput").value = "";
  renderChatFeed();
  const st = qs("#chatStatusText"); if (st) st.textContent = "Sending…";

  const r = await api(`/api/lorecore/sessions/${encodeURIComponent(state.selectedSessionId)}/messages`, { method:"POST", body:payload });
  if (!r.ok) { if (st) st.textContent = "Send failed"; showToast("Send failed","warn"); return; }

  const body = r.body;
  const allMsgs = Array.isArray(body?.messages) ? body.messages : [];
  if (allMsgs.length) {
    const reversedIdx = [...allMsgs].reverse().findIndex(m => (m.role||m.type) === "user");
    const newMsgs = reversedIdx >= 0 ? allMsgs.slice(allMsgs.length - reversedIdx) : allMsgs.slice(-1);
    const assistantMsgs = newMsgs.filter(m => (m.role||m.type) === "assistant");
    if (assistantMsgs.length) {
      assistantMsgs.forEach(m => state.messages.push({ role:"assistant", model:m.model||"assistant", content:m.content||m.text||"" }));
    } else {
      const last = allMsgs[allMsgs.length-1];
      const lc = last?.content||last?.text||"";
      if (lc) state.messages.push({ role:"assistant", model:last?.model||"assistant", content:lc });
    }
  } else {
    const reply = body?.content||body?.text||body?.response||"";
    if (reply) state.messages.push({ role:"assistant", model:body?.model||"assistant", content:reply });
  }
  if (st) st.textContent = "";
  renderChatFeed();
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadOverview() {
  setChip("#libraryStatusChip", "Loading", "status-chip--warn");
  const r = await api("/api/lorecore/overview");
  if (!r.ok) { setChip("#libraryStatusChip","Failed","status-chip--warn"); showToast("Overview failed","warn"); return; }
  const ov = r.body || {};
  state.books = normalizeList(ov, ["books","book_library","items"]).map(normalizeBook);
  state.sessions = normalizeList(ov, ["chat_threads","sessions","discussion_sessions"]).map(normalizeSession);
  if (ov.chat_session?.messages?.length && !state.messages.length && state.freeMode) {
    state.messages = ov.chat_session.messages.map(normalizeMsg);
  }
  setChip("#libraryStatusChip", `${state.books.length} books`, "status-chip--good");
  renderBookList();
  renderSessionList();
  updateScopeChip();
  updateContextStrip();
  renderChatFeed();
  renderActiveTab();
  renderChapterList();
  renderEntityCounts();
}

async function createBook() {
  const title = qs("#newBookTitle")?.value.trim() || ""; if (!title) { showToast("Title required","warn"); return; }
  const r = await api("/api/lorecore/books", { method:"POST", body:{ title, status:qs("#newBookStatus")?.value.trim()||"", premise:qs("#newBookDesc")?.value.trim()||"" } });
  if (!r.ok) { showToast(`Create book failed: ${r.status}`,"warn"); return; }
  showToast("Book created","good");
  qs("#newBookForm").style.display = "none";
  qs("#newBookToggleBtn").style.display = "block";
  await loadOverview();
}

async function runStage() {
  if (!state.selectedBookId) { showToast("Select a book first","warn"); return; }
  const stage = qs("#stageSelect")?.value||"draft";
  setChip("#pipelineStatusChip","Running…","status-chip--warn");
  const r = await api(`/api/lorecore/books/${encodeURIComponent(state.selectedBookId)}/run-stage`, { method:"POST", body:{ stage, stage_id:stage } });
  if (!r.ok) { setChip("#pipelineStatusChip","Failed","status-chip--warn"); showToast(`Stage failed: ${r.status}`,"warn"); return; }
  setChip("#pipelineStatusChip",`${stage} done`,"status-chip--good");
  const rb = qs("#stageResultBox"), rt = qs("#stageResultText");
  if (rb && rt) { rt.textContent = JSON.stringify(r.body||{}).slice(0,300); rb.style.display="block"; }
  showToast(`Stage ${stage} complete`,"good");
}

async function exportLore() {
  const payload = {};
  if (state.selectedBookId) payload.book_public_id = state.selectedBookId;
  if (state.selectedSessionId) payload.session_public_id = state.selectedSessionId;
  const r = await api("/api/lorecore/exports", { method:"POST", body:payload });
  if (!r.ok) { showToast("Export failed","warn"); return; }
  showToast("Export requested","good");
}

function updateContextStrip() {
  const book = state.books.find(b => b.id === state.selectedBookId);
  const set = (id, v) => { const el = qs(id); if (el) el.textContent = v; };
  set("#ctxBook", state.freeMode ? "Free chat" : (book?.title || "None"));
  set("#ctxSession", state.selectedSessionId || "—");
  set("#ctxMode", state.chatMode);
  set("#ctxModels", state.selectedModels.join(", ") || "—");
}

function renderEntityCounts() {
  const box = qs("#entityCountBox"); if (!box) return;
  if (state.freeMode || !state.selectedBookId) {
    box.innerHTML = `<strong>${state.books.length} books</strong><span>Select a book to see counts.</span>`;
    return;
  }
  box.innerHTML = `<strong>${state.books.find(b=>b.id===state.selectedBookId)?.title||"Book"}</strong><span>${state.characters.length} characters · ${state.worlds.length} worlds · ${state.scenes.length} scenes · ${state.chapters.length} chapters · ${state.drafts.length} drafts · ${state.notes.length} notes</span>`;
}

// ── Drag resize ───────────────────────────────────────────────────────────────
function initDragResize() {
  const handle = qs("#chatResizeHandle");
  const feed = qs("#chatFeed");
  if (!handle || !feed) return;
  const KEY = "lorecore_chat_height";
  const saved = parseInt(localStorage.getItem(KEY));
  if (saved > 80 && saved < 900) { feed.style.minHeight = saved + "px"; feed.style.maxHeight = saved + "px"; }
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener("mousedown", e => {
    dragging = true; startY = e.clientY; startH = feed.getBoundingClientRect().height;
    document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none"; e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const h = Math.max(120, Math.min(900, startH + (e.clientY - startY)));
    feed.style.minHeight = h + "px"; feed.style.maxHeight = h + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return; dragging = false;
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height));
  });
  handle.addEventListener("touchstart", e => {
    dragging = true; startY = e.touches[0].clientY; startH = feed.getBoundingClientRect().height; e.preventDefault();
  }, { passive: false });
  document.addEventListener("touchmove", e => {
    if (!dragging) return;
    const h = Math.max(120, Math.min(900, startH + (e.touches[0].clientY - startY)));
    feed.style.minHeight = h + "px"; feed.style.maxHeight = h + "px";
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!dragging) return; dragging = false;
    localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height));
  });
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  qs("#freeChatBtn")?.addEventListener("click", () => selectSession(FREE_SESSION_ID, true));
  qs("#sessionList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-session-id]"); if (btn) selectSession(btn.dataset.sessionId, false);
  });
  qs("#newSessionBtn")?.addEventListener("click", async () => {
    const r = await api("/api/lorecore/overview");
    if (r.ok) { state.sessions = normalizeList(r.body, ["chat_threads"]).map(normalizeSession); renderSessionList(); showToast("Sessions refreshed","good"); }
  });

  qs("#bookList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-book-id]"); if (btn) selectBook(btn.dataset.bookId);
  });
  qs("#newBookToggleBtn")?.addEventListener("click", () => { qs("#newBookForm").style.display="block"; qs("#newBookToggleBtn").style.display="none"; });
  qs("#cancelNewBookBtn")?.addEventListener("click", () => { qs("#newBookForm").style.display="none"; qs("#newBookToggleBtn").style.display="block"; });
  qs("#saveNewBookBtn")?.addEventListener("click", createBook);

  qs("#libTabs")?.addEventListener("click", e => { const btn = e.target.closest(".lib-tab"); if (btn) switchTab(btn.dataset.tab); });

  qs("#entityList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-entity-tab][data-entity-id]"); if (!btn) return;
    const item = getList(btn.dataset.entityTab).find(x => x.id === btn.dataset.entityId);
    if (item) openEntityEditor(btn.dataset.entityTab, item, false);
  });
  qs("#saveEntityBtn")?.addEventListener("click", saveEntity);
  qs("#closeEntityBtn")?.addEventListener("click", closeEntityEditor);
  qs("#extractEntityBtn")?.addEventListener("click", () => extractFromChat(state.activeEntity?.type||"character"));

  qs("#chapterList")?.addEventListener("click", e => { const btn = e.target.closest("[data-chapter-id]"); if (btn) openChapter(btn.dataset.chapterId); });
  qs("#saveChapterBtn")?.addEventListener("click", saveChapter);
  qs("#prevChapterBtn")?.addEventListener("click", () => navigateChapter(-1));
  qs("#nextChapterBtn")?.addEventListener("click", () => navigateChapter(1));
  qs("#chapterContent")?.addEventListener("input", updateWordCount);
  qs("#extractChapterBtn")?.addEventListener("click", () => extractFromChat("chapter"));

  qs("#libNewBtn")?.addEventListener("click", openQuickCreate);
  qs("#closeQcBtn")?.addEventListener("click", () => qs("#quickCreatePanel").style.display="none");
  qs("#qcCreateBtn")?.addEventListener("click", quickCreate);

  qs("#openExtractBtn")?.addEventListener("click", () => {
    const type = qs("#extractTypeSelect")?.value||"character";
    if (type==="chapter") { switchTab("chapters"); extractFromChat("chapter"); }
    else { switchTab(type+"s"); openEntityEditor(type+"s", null, true); }
  });

  qs("#modeCards")?.addEventListener("click", e => {
    const card = e.target.closest(".mode-card"); if (!card) return;
    state.chatMode = card.dataset.mode;
    qsa(".mode-card").forEach(c => c.classList.toggle("mode-card--active", c.dataset.mode === state.chatMode));
    if (state.chatMode === "single" && state.selectedModels.length > 1) state.selectedModels = [state.selectedModels[0]];
    renderModelSelector(); updateContextStrip();
  });

  qs("#sendBtn")?.addEventListener("click", sendMessage);
  qs("#messageInput")?.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

  qs("#runStageBtn")?.addEventListener("click", runStage);
  qs("#exportBtn")?.addEventListener("click", exportLore);
  qs("#refreshBtn")?.addEventListener("click", loadOverview);
}

function init() {
  bindEvents();
  renderChatFeed();
  initDragResize();
  loadModels();
  loadOverview();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
