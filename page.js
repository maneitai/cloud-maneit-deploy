const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const FREE_SESSION_ID = "chat-lore-01";

const TOOL_ICONS = {
  web_search: "🔍", web_fetch: "🌐", web_crawl: "🕷️", run_python: "🐍",
  read_file: "📂", read_server_file: "🗄️", list_server_files: "📁",
  grep_files: "🔎", query_database: "🗃️", http_request: "📡",
  write_file: "✏️", shell_command: "💻", diff_text: "📊",
  summarise_large_file: "📄", image_analyse: "🖼️", call_model: "🤖",
};

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
  streaming: false,
};

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const escHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
function wordCount(t) { return (t||"").trim().split(/\s+/).filter(Boolean).length; }

function renderMarkdown(text) {
  if (!text) return "";
  let t = escHtml(text);
  t = t.replace(/```[\s\S]*?```/g, m => {
    const inner = m.slice(3, -3).replace(/^[a-z]*\n/, "");
    return `<pre><code>${inner}</code></pre>`;
  });
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  t = t.replace(/((?:^[ \t]*[\*\-] .+\n?)+)/gm, block => {
    const items = block.trim().split("\n").map(line => `<li>${line.replace(/^[ \t]*[\*\-] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  t = t.replace(/((?:^[ \t]*\d+\. .+\n?)+)/gm, block => {
    const items = block.trim().split("\n").map(line => `<li>${line.replace(/^[ \t]*\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  t = t.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${t}</p>`;
}

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
    model: raw?.selected_model || raw?.selected_worker_name || raw?.model || "",
  };
}
function normalizeSession(raw, i = 0) {
  return {
    id: raw?.session_public_id || raw?.public_id || raw?.id || `session_${i}`,
    title: raw?.title || raw?.name || `Session ${i+1}`,
    excerpt: raw?.excerpt || "",
    bookId: raw?.book_public_id || null,
    messages: [],
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

// ── Session history ───────────────────────────────────────────────────────────
async function loadSessionHistory(sessionId) {
  if (!sessionId || sessionId === FREE_SESSION_ID) return;
  const r = await api(`/api/home/sessions/${encodeURIComponent(sessionId)}/live-chat/history`);
  if (!r.ok) return;
  const messages = Array.isArray(r.body?.messages) ? r.body.messages : [];
  state.messages = messages.map(normalizeMsg);
  renderChatFeed();
}

// ── Session list ──────────────────────────────────────────────────────────────
function renderSessionList() {
  const el = qs("#sessionList"); if (!el) return;
  const freeBtn = qs("#freeChatBtn");
  if (freeBtn) freeBtn.classList.toggle("session-item--active", state.freeMode);
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

async function selectSession(sessionId, freeMode = false) {
  state.freeMode = freeMode;
  state.selectedSessionId = sessionId;
  if (freeMode) {
    state.selectedBookId = null;
    state.messages = [];
    clearEntityData();
    renderActiveTab();
    renderChapterList();
    updateScopeChip();
    renderSessionList();
    renderBookList();
    renderChatFeed();
    updateContextStrip();
  } else {
    const session = state.sessions.find(s => s.id === sessionId);
    if (session?.bookId && session.bookId !== state.selectedBookId) {
      state.selectedBookId = session.bookId;
      renderBookList();
      loadBookEntities(session.bookId);
    }
    updateScopeChip();
    renderSessionList();
    renderBookList();
    state.messages = [];
    renderChatFeed();
    updateContextStrip();
    await loadSessionHistory(sessionId);
  }
}

function updateScopeChip() {
  const chip = qs("#libScopeChip"); if (!chip) return;
  if (state.freeMode || !state.selectedBookId) {
    chip.textContent = "Free chat"; chip.className = "status-chip";
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
  if (id === state.selectedBookId && !state.freeMode) { selectSession(FREE_SESSION_ID, true); return; }
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
  const existing = state.sessions.find(s => s.bookId === id);
  if (existing) {
    state.selectedSessionId = existing.id;
    state.messages = [];
    renderChatFeed();
    loadSessionHistory(existing.id);
  } else {
    state.selectedSessionId = FREE_SESSION_ID;
    state.messages = [];
    renderChatFeed();
  }
  renderSessionList();
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
  if (state.freeMode || !state.selectedBookId) {
    el.innerHTML = `<div class="lib-placeholder muted">Select a book to load ${tab}.</div>`;
    return;
  }
  const items = getList(tab);
  if (!items.length) { el.innerHTML = `<div class="lib-placeholder muted">No ${tab} yet. Press + New or Extract.</div>`; return; }
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
  if (state.freeMode || !state.selectedBookId) { el.innerHTML = `<div class="lib-placeholder muted">Select a book.</div>`; return; }
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

// ── Extract from chat (fills entity editor form — single entity) ───────────────
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

// ── Extract & Save — reads session, saves all entities directly to library ────
function renderBookPickerForExtract(scope, containerId) {
  const container = qs(`#${containerId}`); if (!container) return;
  if (!state.books.length) {
    container.innerHTML = `<div class="muted" style="font-size:12px;padding:8px 0;">No books yet — create one first.</div>`;
    return;
  }
  container.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Select book to save into:</div>
    <div class="extract-book-list">
      ${state.books.map(b => `
        <button class="extract-book-btn button button--small ${b.id === state.selectedBookId ? 'button--primary' : ''}"
          data-book-id="${escHtml(b.id)}" data-library-id="${escHtml(b.libraryId)}" data-scope="${escHtml(scope)}">
          ${escHtml(b.title)}
        </button>
      `).join("")}
    </div>`;
  container.querySelectorAll(".extract-book-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      runExtractAndSave(btn.dataset.scope, btn.dataset.bookId, btn.dataset.libraryId);
    });
  });
}

async function runExtractAndSave(scope, bookId, libraryId) {
  const statusEl = qs("#extractSaveStatus");
  const btn = qs("#extractSaveBtn");

  if (!bookId) { showToast("Select a book first", "warn"); return; }

  const sessionId = state.selectedSessionId;
  if (!sessionId || sessionId === FREE_SESSION_ID) {
    if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "⚠ No active session. Open a session first."; }
    return;
  }

  if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = `Extracting ${scope} from session…`; }
  if (btn) btn.disabled = true;

  // Hide book picker if shown
  const picker = qs("#extractBookPicker");
  if (picker) picker.innerHTML = "";

  const r = await api("/api/lorecore/extract-and-save", {
    method: "POST",
    body: {
      session_public_id: sessionId,
      book_public_id: bookId,
      library_public_id: libraryId || "LIB-3001",
      scope: scope,
    }
  });

  if (btn) btn.disabled = false;

  if (!r.ok) {
    const detail = r.body?.detail || `Error ${r.status}`;
    if (statusEl) statusEl.textContent = `✗ ${detail}`;
    showToast(`Extraction failed`, "warn");
    return;
  }

  const result = r.body;
  const created = result.created || {};
  const parts = [];
  if ((created.characters || []).length) parts.push(`${created.characters.length} character${created.characters.length !== 1 ? "s" : ""}`);
  if ((created.world || []).length) parts.push(`${created.world.length} world record`);
  if ((created.scenes || []).length) parts.push(`${created.scenes.length} scene${created.scenes.length !== 1 ? "s" : ""}`);
  if ((created.notes || []).length) parts.push(`${created.notes.length} note${created.notes.length !== 1 ? "s" : ""}`);

  const summary = parts.length ? `✓ Saved: ${parts.join(", ")}` : "✓ Complete — no new entities found";
  if (statusEl) statusEl.textContent = summary;
  showToast(summary, "good");

  // Switch to that book and reload entities
  if (state.selectedBookId !== bookId) {
    state.selectedBookId = bookId;
    state.freeMode = false;
    renderBookList();
    updateScopeChip();
  }
  await loadBookEntities(bookId);

  // Switch to the tab that got the most data
  const counts = {
    characters: (created.characters||[]).length,
    worlds: (created.world||[]).length,
    scenes: (created.scenes||[]).length,
    notes: (created.notes||[]).length,
  };
  const topTab = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
  if (topTab && topTab[1] > 0) switchTab(topTab[0]);
}

async function extractAndSave() {
  const scopeEl = qs("#extractScopeSelect");
  const scope = scopeEl ? scopeEl.value : "all";
  const statusEl = qs("#extractSaveStatus");

  // If free mode or no book — show book picker inline
  if (state.freeMode || !state.selectedBookId) {
    const pickerEl = qs("#extractBookPicker");
    if (pickerEl) {
      pickerEl.style.display = pickerEl.style.display === "none" ? "block" : "none";
      if (pickerEl.style.display === "block") {
        renderBookPickerForExtract(scope, "extractBookPicker");
      }
    }
    return;
  }

  const book = state.books.find(b => b.id === state.selectedBookId);
  await runExtractAndSave(scope, state.selectedBookId, book?.libraryId || "LIB-3001");
}

// Keep exportLore wired to extractAndSave for the export button
async function exportLore() {
  await extractAndSave();
}

// ── Chat feed ─────────────────────────────────────────────────────────────────
function renderChatFeed() {
  const feed = qs("#chatFeed"); if (!feed) return;
  if (state.streaming) return;
  if (!state.messages.length) {
    const bookName = !state.freeMode && state.selectedBookId ? state.books.find(b=>b.id===state.selectedBookId)?.title : null;
    feed.innerHTML = `<div class="chat-placeholder"><div class="chat-placeholder-icon">📖</div><div class="chat-placeholder-title">LoreCore thinking room</div><div class="muted" style="font-size:13px;">${bookName ? `Book: ${escHtml(bookName)}` : "Free chat — no book context"}</div></div>`;
    return;
  }
  feed.innerHTML = state.messages.map(msg => {
    const role = msg?.role || msg?.type || "message";
    const content = msg?.content || msg?.text || "";
    const isUser = role === "user";
    const headLabel = isUser ? "User" : (msg.model || "Assistant");
    const bodyHtml = isUser ? `<p>${escHtml(content)}</p>` : renderMarkdown(content);
    return `<div class="chat-msg ${isUser ? "chat-msg--user" : "chat-msg--assistant"}">
      <div class="chat-msg-role stream-head">${escHtml(headLabel)}</div>
      <div class="chat-msg-content">${bodyHtml}</div>
    </div>`;
  }).join("");
  feed.scrollTop = feed.scrollHeight;
}

// ── Streaming helpers ─────────────────────────────────────────────────────────
function createStreamingMsg(modelName) {
  const feed = qs("#chatFeed"); if (!feed) return null;
  const placeholder = feed.querySelector(".chat-placeholder");
  if (placeholder) placeholder.remove();
  const msg = document.createElement("div");
  msg.className = "chat-msg chat-msg--assistant";
  msg.id = "streamingMsg";
  msg.innerHTML = `
    <div class="chat-msg-role stream-head" id="streamHead">
      <span class="stream-head-name">${escHtml(modelName || "Assistant")}</span>
      <span class="stream-thinking-dot"></span>
    </div>
    <div class="chat-msg-content">
      <div class="stream-tools" id="streamTools"></div>
      <div class="stream-body" id="streamBody"></div>
    </div>`;
  feed.appendChild(msg);
  feed.scrollTop = feed.scrollHeight;
  return msg;
}

function setStreamStatus(text) {
  const head = qs("#streamHead"); if (!head) return;
  let status = head.querySelector(".stream-status");
  if (!status) { status = document.createElement("span"); status.className = "stream-status"; head.appendChild(status); }
  status.textContent = text ? ` · ${text}` : "";
}

function appendToolCall(name, args) {
  const tools = qs("#streamTools"); if (!tools) return;
  const icon = TOOL_ICONS[name] || "🔧";
  const argsStr = args && typeof args === "object"
    ? Object.entries(args).map(([k,v]) => `${k}: ${String(v).slice(0,60)}`).join(", ") : "";
  const line = document.createElement("div");
  line.className = "stream-tool-call";
  line.dataset.toolName = name;
  line.innerHTML = `<span class="stream-tool-icon">${icon}</span><span class="stream-tool-name">${escHtml(name)}</span>${argsStr ? `<span class="stream-tool-args">${escHtml(argsStr)}</span>` : ""}<span class="stream-tool-state">…</span>`;
  tools.appendChild(line);
  qs("#chatFeed").scrollTop = qs("#chatFeed").scrollHeight;
}

function markToolDone(name, summary) {
  const tools = qs("#streamTools"); if (!tools) return;
  const lines = qsa(".stream-tool-call", tools);
  const last = [...lines].reverse().find(l => l.dataset.toolName === name);
  if (last) {
    last.classList.add("stream-tool-call--done");
    const stateEl = last.querySelector(".stream-tool-state");
    if (stateEl) stateEl.textContent = summary ? ` ✓ ${summary}` : " ✓";
  }
}

function appendStreamChunk(text) {
  const streamBody = qs("#streamBody"); if (!streamBody) return;
  if (!streamBody._raw) streamBody._raw = "";
  streamBody._raw += text;
  streamBody.textContent = streamBody._raw;
  qs("#chatFeed").scrollTop = qs("#chatFeed").scrollHeight;
}

function finalizeStreamingMsg(fullContent, modelName) {
  const msg = qs("#streamingMsg"); if (!msg) return;
  msg.id = "";
  const head = qs(".stream-head", msg);
  if (head) { head.className = "chat-msg-role"; head.innerHTML = escHtml(modelName || "Assistant"); }
  const streamBody = qs("#streamBody", msg);
  if (streamBody) {
    streamBody.id = "";
    streamBody._raw = undefined;
    streamBody.innerHTML = renderMarkdown(fullContent || "");
  }
  qs("#chatFeed").scrollTop = qs("#chatFeed").scrollHeight;
}

// ── Send with streaming ───────────────────────────────────────────────────────
async function sendMessage() {
  if (!state.selectedModels.length) { showToast("Select a model first", "warn"); return; }
  const content = qs("#messageInput")?.value.trim() || "";
  if (!content) return;
  if (state.streaming) { showToast("Already streaming", "warn"); return; }

  const book = state.books.find(b => b.id === state.selectedBookId);
  state.messages.push({ role: "user", content, model: "" });
  qs("#messageInput").value = "";
  renderChatFeed();

  const st = qs("#chatStatusText"); if (st) st.textContent = "Thinking…";
  const sendBtn = qs("#sendBtn"); if (sendBtn) sendBtn.disabled = true;

  state.streaming = true;
  const modelName = state.selectedModels[0] || "Assistant";
  createStreamingMsg(modelName);

  const params = new URLSearchParams({ prompt: content, mode: state.chatMode, models: state.selectedModels.join(",") });
  if (!state.freeMode && state.selectedBookId) params.set("book_public_id", state.selectedBookId);
  if (!state.freeMode && book?.libraryId) params.set("library_public_id", book.libraryId);

  const url = `${PM_API_BASE}/api/lorecore/sessions/${encodeURIComponent(state.selectedSessionId)}/stream?${params}`;
  let fullContent = "";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "tool_call") {
            appendToolCall(event.name, event.args);
            setStreamStatus(`${TOOL_ICONS[event.name] || "🔧"} ${event.name}`);
            if (st) st.textContent = `${TOOL_ICONS[event.name] || "🔧"} ${event.name}…`;
          } else if (event.type === "tool_result") {
            markToolDone(event.name, event.summary);
            setStreamStatus("Generating…");
            if (st) st.textContent = "Generating…";
          } else if (event.type === "chunk") {
            if (!fullContent) setStreamStatus("");
            appendStreamChunk(event.text);
            fullContent += event.text;
          } else if (event.type === "done") {
            fullContent = event.content || fullContent;
          } else if (event.type === "error") {
            appendStreamChunk(`\n\n⚠️ ${event.message}`);
            fullContent += `\n\n⚠️ ${event.message}`;
          }
        } catch {}
      }
    }
  } catch (err) {
    finalizeStreamingMsg(`Error: ${err.message}`, modelName);
    state.streaming = false;
    if (sendBtn) sendBtn.disabled = false;
    if (st) st.textContent = "";
    showToast("Stream failed", "warn");
    return;
  }

  finalizeStreamingMsg(fullContent, modelName);
  state.streaming = false;
  if (sendBtn) sendBtn.disabled = false;
  if (st) st.textContent = "";
  state.messages.push({ role: "assistant", model: modelName, content: fullContent });
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadOverview() {
  setChip("#libraryStatusChip", "Loading", "status-chip--warn");
  const r = await api("/api/lorecore/overview");
  if (!r.ok) { setChip("#libraryStatusChip","Failed","status-chip--warn"); showToast("Overview failed","warn"); return; }
  const ov = r.body || {};
  state.books = normalizeList(ov, ["books","book_library","items"]).map(normalizeBook);
  state.sessions = normalizeList(ov, ["chat_threads","sessions","discussion_sessions"]).map(normalizeSession);
  setChip("#libraryStatusChip", `${state.books.length} books`, "status-chip--good");
  renderBookList(); renderSessionList(); updateScopeChip(); updateContextStrip();
  renderChatFeed(); renderActiveTab(); renderChapterList(); renderEntityCounts();
}

async function createNewSession() {
  const btn = qs("#newSessionBtn"); if (btn) btn.disabled = true;
  const r = await api("/api/chat-sessions", { method: "POST", body: { surface: "lorecore", title: "New session", summary: "LoreCore writing thread", mode: state.chatMode || "single", selected_models: state.selectedModels } });
  if (btn) btn.disabled = false;
  if (!r.ok) { showToast("Create session failed", "warn"); return; }
  const newId = r.body?.public_id;
  await loadOverview();
  if (newId) { state.freeMode = false; state.selectedSessionId = newId; state.messages = []; renderSessionList(); renderChatFeed(); updateContextStrip(); }
  showToast("New session created", "good");
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
  if (state.freeMode || !state.selectedBookId) { box.innerHTML = `<strong>${state.books.length} books</strong><span>Select a book to see counts.</span>`; return; }
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
  handle.addEventListener("mousedown", e => { dragging = true; startY = e.clientY; startH = feed.getBoundingClientRect().height; document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none"; e.preventDefault(); });
  document.addEventListener("mousemove", e => { if (!dragging) return; const h = Math.max(120, Math.min(900, startH + (e.clientY - startY))); feed.style.minHeight = h + "px"; feed.style.maxHeight = h + "px"; });
  document.addEventListener("mouseup", () => { if (!dragging) return; dragging = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height)); });
  handle.addEventListener("touchstart", e => { dragging = true; startY = e.touches[0].clientY; startH = feed.getBoundingClientRect().height; e.preventDefault(); }, { passive: false });
  document.addEventListener("touchmove", e => { if (!dragging) return; const h = Math.max(120, Math.min(900, startH + (e.touches[0].clientY - startY))); feed.style.minHeight = h + "px"; feed.style.maxHeight = h + "px"; }, { passive: true });
  document.addEventListener("touchend", () => { if (!dragging) return; dragging = false; localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height)); });
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  qs("#freeChatBtn")?.addEventListener("click", () => selectSession(FREE_SESSION_ID, true));
  qs("#sessionList")?.addEventListener("click", e => { const btn = e.target.closest("[data-session-id]"); if (btn) selectSession(btn.dataset.sessionId, false); });
  qs("#newSessionBtn")?.addEventListener("click", createNewSession);
  qs("#bookList")?.addEventListener("click", e => { const btn = e.target.closest("[data-book-id]"); if (btn) selectBook(btn.dataset.bookId); });
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

  // New extract & save button
  qs("#extractSaveBtn")?.addEventListener("click", extractAndSave);

  // Scope selector change — update book picker if visible
  qs("#extractScopeSelect")?.addEventListener("change", () => {
    const picker = qs("#extractBookPicker");
    if (picker && picker.style.display !== "none") {
      const scope = qs("#extractScopeSelect")?.value || "all";
      renderBookPickerForExtract(scope, "extractBookPicker");
    }
  });

  // Legacy open extract panel button
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
