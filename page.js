// ─── Constants ────────────────────────────────────────────────────────────────
const PM_HOME_KEY = "PM_HOME_V7";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const MODE_HELP = {
  single: "<strong>Single:</strong> one model answers directly.",
  multi: "<strong>Multi:</strong> all selected models respond independently.",
  discussion: "<strong>Discussion:</strong> lead answers, specialists build on each other."
};
const MODE_STATUS = { single: "Single ready", multi: "Multi ready", discussion: "Discussion ready" };
const PROJECT_TYPE_MAP = { App:"app", Web:"portal", Game:"game", Writing:"writing", Research:"research", System:"system" };
const TOOL_ICONS = {
  web_search:"🔍", web_fetch:"🌐", web_crawl:"🕷️", run_python:"🐍", read_file:"📂",
  read_server_file:"🗄️", list_server_files:"📁", grep_files:"🔎", query_database:"🗃️",
  http_request:"📡", write_file:"✏️", shell_command:"💻", diff_text:"📊",
  summarise_large_file:"📄", image_analyse:"🖼️", call_model:"🤖"
};
const INTENT_CYCLE = ["auto","research","coding","audit"];
const INTENT_LABELS = { auto:"Auto", research:"🔬 Research", coding:"💻 Coding", audit:"🔍 Audit" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const qs = (s, r=document) => r.querySelector(s);
const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
const clone = v => JSON.parse(JSON.stringify(v));

function safeId(prefix="id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function renderMarkdown(text) {
  if (!text) return "";
  let t = escapeHtml(text);
  t = t.replace(/```[\s\S]*?```/g, m => `<pre><code>${m.slice(3,-3).replace(/^[a-z]*\n/,"")}</code></pre>`);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  t = t.replace(/((?:^[ \t]*[\*\-] .+\n?)+)/gm, block =>
    `<ul>${block.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[\*\-] /,"")}</li>`).join("")}</ul>`);
  t = t.replace(/((?:^[ \t]*\d+\. .+\n?)+)/gm, block =>
    `<ol>${block.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`);
  t = t.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  return `<p>${t}</p>`;
}

// ─── State ────────────────────────────────────────────────────────────────────
const defaultState = {
  selectedChatId: "",
  mode: "single",
  singleModel: "",
  multiModels: [],
  discussionModels: [],
  selectedProjectType: "App",
  chats: { pinned:[], projectFolder:[], history:[] },
  todos: [],
  availableModels: [],
  intentMode: "auto",
  rightPanel: "todos"
};

function loadState() {
  try {
    const raw = localStorage.getItem(PM_HOME_KEY);
    if (!raw) return clone(defaultState);
    const p = JSON.parse(raw), b = clone(defaultState);
    return {
      ...b, ...p,
      chats: {
        pinned: Array.isArray(p?.chats?.pinned) ? p.chats.pinned : [],
        projectFolder: Array.isArray(p?.chats?.projectFolder) ? p.chats.projectFolder : [],
        history: Array.isArray(p?.chats?.history) ? p.chats.history : []
      },
      todos: Array.isArray(p?.todos) ? p.todos : [],
      availableModels: Array.isArray(p?.availableModels) ? p.availableModels : [],
      multiModels: Array.isArray(p?.multiModels) ? p.multiModels : [],
      discussionModels: Array.isArray(p?.discussionModels) ? p.discussionModels : []
    };
  } catch { return clone(defaultState); }
}

function saveState() {
  try { localStorage.setItem(PM_HOME_KEY, JSON.stringify(state)); } catch {}
}

let state = loadState();
let activeRequestCount = 0;
let threadCache = {};
let activeStream = null;
let activeReader = null;

// ─── Busy state ───────────────────────────────────────────────────────────────
function setBusy(isBusy, label="") {
  activeRequestCount = isBusy ? activeRequestCount+1 : Math.max(0, activeRequestCount-1);
  const busy = activeRequestCount > 0;
  const s = qs("#composerStatus");
  if (s) s.textContent = busy ? (label||"Working...") : (MODE_STATUS[state.mode]||"Ready");
  const stopBtn = qs("#stopBtn");
  if (stopBtn) stopBtn.style.display = busy ? "" : "none";
  ["#sendBtn","#exportBtn","#newChatBtn","#branchChatBtn","#addTodoBtn"].forEach(id => {
    const el = qs(id); if (el) el.disabled = busy;
  });
}

function forceUnbusy() {
  activeRequestCount = 0;
  const s = qs("#composerStatus");
  if (s) s.textContent = MODE_STATUS[state.mode]||"Ready";
  const stopBtn = qs("#stopBtn");
  if (stopBtn) stopBtn.style.display = "none";
  ["#sendBtn","#exportBtn","#newChatBtn","#branchChatBtn","#addTodoBtn"].forEach(id => {
    const el = qs(id); if (el) el.disabled = false;
  });
}

function showToast(msg, tone="good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2600);
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function callApi(path, method="GET", payload=null) {
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, {
      method, headers: {"Content-Type":"application/json"},
      body: payload ? JSON.stringify(payload) : undefined
    });
    const ct = res.headers.get("content-type")||"";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok:res.ok, status:res.status, body };
  } catch(e) { return { ok:false, error:String(e) }; }
}

// ─── File upload ──────────────────────────────────────────────────────────────
async function uploadFile(file) {
  const fd = new FormData(); fd.append("file", file);
  const res = await fetch(`${PM_API_BASE}/api/home/upload`, {method:"POST", body:fd});
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return await res.json();
}

function renderUploadPill(filename, pillState="uploading") {
  const pill = qs("#uploadPill"); if (!pill) return;
  const icons = {uploading:"⏳", done:"📎", error:"❌"};
  pill.innerHTML = `<span>${icons[pillState]||"📎"} ${escapeHtml(filename)}</span>${pillState!=="uploading"?'<button id="uploadPillClose" type="button">✕</button>':""}`;
  pill.style.display = "flex";
  qs("#uploadPillClose")?.addEventListener("click", clearUploadPill);
}

function clearUploadPill() {
  const pill = qs("#uploadPill"); if (pill) { pill.style.display="none"; pill.innerHTML=""; }
}

async function handleFileUpload(file) {
  if (!file) return;
  if (!state.selectedChatId) {
    try { await createChatSession({title:file.name}); }
    catch { showToast("No active chat","warn"); return; }
  }
  renderUploadPill(file.name,"uploading");
  setBusy(true,`Uploading ${file.name}…`);
  let result;
  try { result = await uploadFile(file); }
  catch { setBusy(false); renderUploadPill(file.name,"error"); showToast("Upload failed","warn"); return; }
  setBusy(false); renderUploadPill(file.name,"done"); showToast(`Uploaded: ${file.name}`,"good");
  const input = qs("#composerInput");
  if (input) input.value = result.analysis_prompt || `File '${file.name}' uploaded. Analyse it.`;
  await sendAndStream(); clearUploadPill();
}

// ─── Model pool ───────────────────────────────────────────────────────────────
function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val||"[]"); } catch { return []; }
}

function extractModels(r) {
  return (Array.isArray(r?.items) ? r.items : [])
    .filter(m => m?.enabled !== false && m?.enabled !== "0")
    .filter(m => m?.runtime_driver === "openai_api")
    .filter(m => parseSurfaces(m?.surface_allowlist).includes("home"))
    .map(m => ({
      value: String(m?.alias||m?.name||"").trim(),
      label: String(m?.notes||m?.name||m?.alias||"").trim(),
      active: ["available","loaded"].includes(String(m?.runtime_state||"").toLowerCase())
    }))
    .filter(m => m.value);
}

async function refreshModelPool() {
  const res = await callApi("/api/model-pool/models?sync=false","GET");
  if (!res.ok) { state.availableModels=[]; saveState(); hydrateModelSelectors(); return; }
  const models = extractModels(res.body);
  state.availableModels = models;
  if (!state.singleModel && models[0]) state.singleModel = models[0].value;
  if (!state.multiModels.length && models.length) state.multiModels = models.slice(0,3).map(m=>m.value);
  if (!state.discussionModels.length && models.length) state.discussionModels = models.slice(0,4).map(m=>m.value);
  saveState(); hydrateModelSelectors();
}

// ─── Model selectors ──────────────────────────────────────────────────────────
function hydrateModelSelectors() {
  const all = state.availableModels || [];
  const mode = state.mode;

  const singleArea = qs("#modelSelectArea");
  if (!singleArea) return;

  if (mode === "single") {
    singleArea.innerHTML = `<select class="select select--compact" id="singleModel"></select>`;
    const sel = qs("#singleModel");
    sel.innerHTML = all.length
      ? all.map(m=>`<option value="${escapeHtml(m.value)}">${escapeHtml(m.label||m.value)}</option>`).join("")
      : `<option value="">No models</option>`;
    if (state.singleModel && all.some(m=>m.value===state.singleModel)) sel.value = state.singleModel;
    else if (all[0]) { state.singleModel=all[0].value; sel.value=all[0].value; }
    sel.addEventListener("change", e => { state.singleModel=e.target.value; saveState(); });
  } else {
    const selectedVals = mode==="multi" ? state.multiModels : state.discussionModels;
    const placeholder = mode==="multi" ? "Select models..." : "Select specialists...";
    singleArea.innerHTML = `
      <div class="multi-select-wrapper">
        <button class="multi-select-trigger" id="modelTrigger" type="button">${escapeHtml(selectedVals.length ? selectedVals.join(", ") : placeholder)}</button>
        <div class="multi-select-dropdown" id="modelDropdown"></div>
      </div>`;
    const dropdown = qs("#modelDropdown"), trigger = qs("#modelTrigger");
    buildMultiSelectDropdown(dropdown, all, selectedVals, chosen => {
      if (mode==="multi") { state.multiModels=chosen; }
      else { state.discussionModels=chosen; }
      saveState();
      trigger.textContent = chosen.length ? chosen.join(", ") : placeholder;
    });
    trigger.addEventListener("click", e => { e.stopPropagation(); dropdown.classList.toggle("is-open"); });
    document.addEventListener("click", e => { if (!dropdown.contains(e.target)&&e.target!==trigger) dropdown.classList.remove("is-open"); });
  }
}

function buildMultiSelectDropdown(el, models, selected, onChange) {
  el.innerHTML = "";
  if (!models.length) {
    const d = document.createElement("div"); d.className="multi-select-empty"; d.textContent="No models"; el.appendChild(d); return;
  }
  models.forEach(model => {
    const row = document.createElement("div"); row.className="multi-select-option";
    const cb = document.createElement("input"); cb.type="checkbox";
    cb.id=`ms_${el.id}_${model.value}`; cb.value=model.value; cb.checked=selected.includes(model.value);
    const lbl = document.createElement("label"); lbl.htmlFor=cb.id; lbl.textContent=model.label||model.value;
    cb.addEventListener("change", () => {
      onChange(qsa('input[type="checkbox"]',el).filter(e=>e.checked).map(e=>e.value));
    });
    row.appendChild(cb); row.appendChild(lbl); el.appendChild(row);
  });
}

function normalizeSelectedModels() {
  if (state.mode==="single") return [state.singleModel].filter(Boolean);
  if (state.mode==="multi") return (state.multiModels||[]).filter(Boolean);
  return (state.discussionModels||[]).filter(Boolean);
}

// ─── Chat session helpers ─────────────────────────────────────────────────────
function normalizeChatItem(item) {
  return {
    id: item.public_id||item.session_public_id||item.id||safeId("chat"),
    title: item.title||item.summary||"Untitled",
    summary: item.summary||"",
    mode: item.mode||"single",
    pinned: Boolean(item.pinned),
    folder: item.folder||item.bucket||"",
    updatedAt: item.updated_at||item.updatedAt||"",
    createdAt: item.created_at||item.createdAt||""
  };
}

function getChatById(id) {
  return [...state.chats.pinned,...state.chats.projectFolder,...state.chats.history].find(c=>c.id===id)||null;
}

function mergeChatIntoCollections(chat) {
  const rm = list => list.filter(c=>c.id!==chat.id);
  state.chats.pinned=rm(state.chats.pinned);
  state.chats.projectFolder=rm(state.chats.projectFolder);
  state.chats.history=rm(state.chats.history);
  if (chat.pinned) state.chats.pinned.push(chat);
  else if (chat.folder==="project"||chat.folder==="projects") state.chats.projectFolder.push(chat);
  else state.chats.history.push(chat);
}

function ensureSelectedChatExists() {
  const all = [...state.chats.pinned,...state.chats.projectFolder,...state.chats.history];
  if (!all.length) return;
  if (!all.some(c=>c.id===state.selectedChatId)) state.selectedChatId=all[0].id;
}

// ─── Session creation ─────────────────────────────────────────────────────────
async function createChatSession({title, cloneFromPublicId=null}) {
  // Always generate a fresh unique ID — never reuse default/stale IDs
  const res = await callApi("/api/chat-sessions","POST",{
    surface:"home", title, summary:"", mode:state.mode,
    selected_models:normalizeSelectedModels(),
    clone_from_public_id:cloneFromPublicId
  });
  if (!res.ok) throw new Error("Could not create chat session");
  const body = res.body||{};
  const publicId = body.public_id||body.session_public_id||body.id;
  if (!publicId) throw new Error("Missing session_public_id from backend");
  const chat = normalizeChatItem({...body, public_id:publicId, title:body.title||title});
  state.chats.history = [chat, ...state.chats.history.filter(c=>c.id!==chat.id)];
  state.selectedChatId = publicId;
  threadCache[publicId] = [];
  saveState(); renderAll();
  return publicId;
}

async function refreshChatSessions() {
  const res = await callApi("/api/chat-sessions?surface=home","GET");
  if (!res.ok) { showToast("Could not load sessions","warn"); return false; }
  const items = Array.isArray(res.body?.items) ? res.body.items.map(normalizeChatItem) : [];
  state.chats = {pinned:[],projectFolder:[],history:[]};
  items.forEach(mergeChatIntoCollections);
  if (!state.selectedChatId && items[0]) state.selectedChatId=items[0].id;
  if (!items.length) {
    try { state.selectedChatId = await createChatSession({title:"Home chat"}); }
    catch { showToast("Could not create initial chat","warn"); saveState(); renderAll(); return false; }
  }
  saveState(); renderAll(); return true;
}

// ─── Thread ───────────────────────────────────────────────────────────────────
async function loadThreadHistory(id) {
  if (!id) return;
  try {
    const res = await callApi(`/api/home/sessions/${encodeURIComponent(id)}/live-chat/history`,"GET");
    if (!res.ok) return;
    const msgs = Array.isArray(res.body?.messages) ? res.body.messages : [];
    const SKIP = "New operator thread ready. Pick participants, ask a question, or export an idea into production.";
    threadCache[id] = msgs
      .filter(m => (m.content||"") !== SKIP)
      .map(m => ({
        id: m.message_public_id||safeId("msg"),
        role: m.role||"assistant",
        head: m.role==="user" ? "User" : (m.selected_worker_name||m.selected_model||"Assistant"),
        text: m.content||"",
        model: m.selected_model||m.selected_worker_name||""
      }));
    renderThread();
  } catch(e) { console.warn("loadThreadHistory:", e); }
}

function getCurrentThread() { return threadCache[state.selectedChatId]||[]; }

// ─── Streaming ────────────────────────────────────────────────────────────────
function createStreamingBubble(modelName) {
  const root = qs("#chatThread"); if (!root) return null;
  const bubble = document.createElement("div");
  bubble.className = "bubble bubble--assistant bubble--streaming";
  bubble.id = "streamingBubble";
  bubble.innerHTML = `
    <div class="bubble-head stream-head" id="streamHead">
      <span class="stream-head-name">${escapeHtml(modelName||"Assistant")}</span>
      <span class="stream-thinking-dot"></span>
    </div>
    <div class="stream-tools" id="streamTools"></div>
    <div class="stream-body" id="streamBody"></div>`;
  root.appendChild(bubble);
  root.scrollTop = root.scrollHeight;
  return bubble;
}

function setStreamStatus(text) {
  const head = qs("#streamHead"); if (!head) return;
  let s = head.querySelector(".stream-status");
  if (!s) { s=document.createElement("span"); s.className="stream-status"; head.appendChild(s); }
  s.textContent = text ? ` · ${text}` : "";
}

function appendToolCall(name, args) {
  const tools = qs("#streamTools"); if (!tools) return;
  const icon = TOOL_ICONS[name]||"🔧";
  const argsStr = args&&typeof args==="object" ? Object.entries(args).map(([k,v])=>`${k}: ${String(v).slice(0,60)}`).join(", ") : "";
  const line = document.createElement("div"); line.className="stream-tool-call"; line.dataset.toolName=name;
  line.innerHTML=`<span class="stream-tool-icon">${icon}</span><span class="stream-tool-name">${escapeHtml(name)}</span>${argsStr?`<span class="stream-tool-args">${escapeHtml(argsStr)}</span>`:""}<span class="stream-tool-state">…</span>`;
  tools.appendChild(line);
  const thread = qs("#chatThread"); if (thread) thread.scrollTop=thread.scrollHeight;
}

function markToolDone(name, summary) {
  const tools = qs("#streamTools"); if (!tools) return;
  const last = [...qsa(".stream-tool-call",tools)].reverse().find(l=>l.dataset.toolName===name);
  if (last) {
    last.classList.add("stream-tool-call--done");
    const s = last.querySelector(".stream-tool-state"); if (s) s.textContent=summary?` ✓ ${summary}`:" ✓";
  }
}

function appendStreamChunk(text) {
  const body = qs("#streamBody"); if (!body) return;
  if (!body._raw) body._raw="";
  body._raw += text; body.textContent = body._raw;
  const thread = qs("#chatThread"); if (thread) thread.scrollTop=thread.scrollHeight;
}

function finalizeStreamingBubble(fullContent, modelName) {
  const bubble = qs("#streamingBubble"); if (!bubble) return;
  bubble.classList.remove("bubble--streaming"); bubble.id="";
  const head = qs(".stream-head",bubble);
  if (head) { head.className="bubble-head"; head.innerHTML=escapeHtml(modelName||"Assistant"); }
  const body = qs("#streamBody",bubble);
  if (body) { body.id=""; body._raw=undefined; body.innerHTML=renderMarkdown(fullContent||""); }
  const thread = qs("#chatThread"); if (thread) thread.scrollTop=thread.scrollHeight;
}

// ─── Send ─────────────────────────────────────────────────────────────────────
async function sendAndStream() {
  const input = qs("#composerInput");
  const text = (input?.value||"").trim();
  if (!text) { showToast("Write something first","warn"); return; }

  // Session isolation: ensure we have a real unique session
  if (!state.selectedChatId) {
    try { await createChatSession({title: text.slice(0,48)||"New chat"}); }
    catch { showToast("Could not create chat session","warn"); return; }
  }

  const selectedModels = normalizeSelectedModels();
  // Auto-select if empty — backend will pick best model
  const modelsParam = selectedModels;

  if (activeReader) {
    try { await activeReader.cancel(); } catch {}
    activeReader = null;
  }
  if (!threadCache[state.selectedChatId]) threadCache[state.selectedChatId]=[];
  threadCache[state.selectedChatId].push({id:safeId("msg"),role:"user",head:"User",text});
  renderThread();
  if (input) input.value="";

  setBusy(true,"Thinking…");

  let currentModelName = modelsParam[0]||"Maneit";
  createStreamingBubble(currentModelName);

  const params = new URLSearchParams({
    prompt:text, mode:state.mode,
    models:modelsParam.join(","),
    intent:state.intentMode||"auto"
  });
  const url = `${PM_API_BASE}/api/home/sessions/${encodeURIComponent(state.selectedChatId)}/stream?${params}`;
  let fullContent = "";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
    const reader = response.body.getReader();
    activeReader = reader;
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const {value, done:streamDone} = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, {stream:true});
      const lines = buffer.split("\n"); buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type==="model_start") {
            if (fullContent) {
              finalizeStreamingBubble(fullContent, currentModelName);
              threadCache[state.selectedChatId].push({id:safeId("msg"),role:"assistant",head:currentModelName,text:fullContent,model:currentModelName});
              fullContent="";
            }
            const roleLabel = event.role==="lead"?" · lead":event.role?` · ${event.role}`:"";
            currentModelName = (event.model||"Maneit") + roleLabel;
            createStreamingBubble(currentModelName);
          } else if (event.type==="tool_call") {
            appendToolCall(event.name, event.args);
            setStreamStatus(`${TOOL_ICONS[event.name]||"🔧"} ${event.name}`);
            setBusy(true,`${TOOL_ICONS[event.name]||"🔧"} ${event.name}…`);
          } else if (event.type==="tool_result") {
            markToolDone(event.name, event.summary);
            setStreamStatus("Generating…"); setBusy(true,"Generating…");
          } else if (event.type==="chunk") {
            if (!fullContent) setStreamStatus("");
            appendStreamChunk(event.text); fullContent+=event.text;
          } else if (event.type==="done") {
            fullContent = event.content||fullContent;
          } else if (event.type==="cancelled") {
            fullContent = event.content||fullContent;
            break;
          } else if (event.type==="intent_route") {
            const label = event.model||event.intent||"";
            if (label) {
              const head = qs("#streamHead");
              if (head) { const nm=head.querySelector(".stream-head-name"); if (nm) nm.textContent=label; }
              currentModelName = label;
            }
          } else if (event.type==="error") {
            appendStreamChunk(`\n\n⚠️ ${event.message}`); fullContent+=`\n\n⚠️ ${event.message}`;
          }
        } catch {}
      }
    }
  } catch(err) {
    if (err.name!=="AbortError") {
      finalizeStreamingBubble(`Error: ${err.message}`, currentModelName);
      forceUnbusy(); showToast("Stream failed","warn"); return;
    }
  } finally {
    activeReader = null;
  }

  finalizeStreamingBubble(fullContent, currentModelName);
  forceUnbusy();

  if (fullContent) {
    threadCache[state.selectedChatId].push({id:safeId("msg"),role:"assistant",head:currentModelName,text:fullContent,model:currentModelName});
  }

  // Auto-title new sessions
  const current = getChatById(state.selectedChatId);
  if (current && (!current.title || ["New chat","Untitled","Home chat"].includes(current.title))) {
    const newTitle = text.slice(0,60);
    current.title=newTitle; current.updatedAt=new Date().toISOString();
    saveState(); renderHistory();
    callApi(`/api/chat-sessions/${encodeURIComponent(state.selectedChatId)}`,"PATCH",{title:newTitle});
  }

  await refreshModelPool();
}

// ─── Stop ─────────────────────────────────────────────────────────────────────
async function stopStream() {
  if (activeReader) {
    try { await activeReader.cancel(); } catch {}
    activeReader = null;
  }
  // Also signal backend
  if (state.selectedChatId) {
    callApi(`/api/home/sessions/${encodeURIComponent(state.selectedChatId)}/stop`,"POST");
  }
  forceUnbusy();
  showToast("Stopped","warn");
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const search = (qs("#chatSearch")?.value||"").trim().toLowerCase();

  function renderSection(targetId, items, isFolder=false) {
    const root = qs(targetId); if (!root) return;
    const filtered = items.filter(item => !search || item.title.toLowerCase().includes(search));
    root.innerHTML = filtered.map(item => {
      const ac = item.id===state.selectedChatId ? " history-item--active" : "";
      const fc = isFolder ? " history-item--folder" : "";
      return `<a class="history-item${ac}${fc}" href="#" data-chat-id="${escapeHtml(item.id)}"><span class="history-dot"></span><span class="history-title">${escapeHtml(item.title)}</span></a>`;
    }).join("");
    qsa(".history-item",root).forEach(link => {
      link.addEventListener("click", async e => {
        e.preventDefault();
        const chatId = link.getAttribute("data-chat-id");
        if (!chatId||chatId===state.selectedChatId) return;
        state.selectedChatId=chatId; saveState(); renderHistory(); renderThread();
        await loadThreadHistory(chatId);
      });
    });
  }

  renderSection("#pinnedChatsList", state.chats.pinned, false);
  renderSection("#projectFolderList", state.chats.projectFolder, true);
  renderSection("#chatHistoryList", state.chats.history, false);
}

function renderThread() {
  const root = qs("#chatThread"); if (!root) return;
  const thread = getCurrentThread();
  if (!thread.length) {
    root.innerHTML=`<div class="bubble bubble--assistant"><div class="bubble-head">Maneit</div><p>Select a chat or start a new one.</p></div>`;
    return;
  }
  root.innerHTML = thread.map(msg => {
    const rc = msg.role==="user" ? "bubble bubble--user" : "bubble bubble--assistant";
    const head = msg.role==="user" ? "User" : (msg.head||msg.model||"Maneit");
    const body = msg.role==="user" ? `<p>${escapeHtml(msg.text)}</p>` : renderMarkdown(msg.text);
    return `<div class="${rc}"><div class="bubble-head">${escapeHtml(head)}</div>${body}</div>`;
  }).join("");
  root.scrollTop = root.scrollHeight;
}

function renderModeTabs() {
  qsa(".mode-tab").forEach(tab => tab.classList.toggle("mode-tab--active", tab.getAttribute("data-mode")===state.mode));
}

function renderTodos() {
  const root = qs("#todoList"); if (!root) return;
  root.innerHTML = state.todos.map(todo => `
    <div class="todo-item">
      <input type="checkbox" data-todo-id="${escapeHtml(todo.id)}" ${todo.done?"checked":""} />
      <div class="todo-item__body">
        <strong style="${todo.done?'text-decoration:line-through;opacity:0.5':''}">${escapeHtml(todo.title)}</strong>
        ${todo.detail?`<span>${escapeHtml(todo.detail)}</span>`:""}
      </div>
      <button class="todo-remove" data-remove-todo="${escapeHtml(todo.id)}" type="button">✕</button>
    </div>`).join("");
  qsa('input[type="checkbox"][data-todo-id]',root).forEach(cb => {
    cb.addEventListener("change", () => { const t=state.todos.find(t=>t.id===cb.getAttribute("data-todo-id")); if(t){t.done=cb.checked;saveState();renderTodos();} });
  });
  qsa("[data-remove-todo]",root).forEach(btn => {
    btn.addEventListener("click", () => { state.todos=state.todos.filter(t=>t.id!==btn.getAttribute("data-remove-todo")); saveState(); renderTodos(); });
  });
}

function renderAll() {
  ensureSelectedChatExists();
  renderHistory(); renderModeTabs(); renderThread(); renderTodos();
  hydrateModelSelectors();
  // Hydrate project tags
  qsa("#projectTypeTags .tag").forEach(btn => btn.classList.toggle("tag--active", btn.getAttribute("data-tag")===state.selectedProjectType));
  // Hydrate export title
  const exportTitle = qs("#exportTitle");
  if (exportTitle && !exportTitle.value.trim()) {
    const c = getChatById(state.selectedChatId);
    if (c?.title && !["New chat","Home chat","Untitled"].includes(c.title)) exportTitle.value=c.title;
  }
  // Update global status chip
  const chip = qs("#globalStatusChip");
  if (chip) { chip.textContent="Online"; chip.className="status-chip status-chip--good"; }
}

// ─── Drag resize ──────────────────────────────────────────────────────────────
function initDragResize() {
  const handle=qs("#chatResizeHandle"), thread=qs("#chatThread"); if (!handle||!thread) return;
  const KEY="home_chat_h_v7";
  const saved=parseInt(localStorage.getItem(KEY));
  if (saved>80&&saved<1200) { thread.style.minHeight=saved+"px"; thread.style.maxHeight=saved+"px"; }
  let dragging=false, startY=0, startH=0;
  handle.addEventListener("mousedown", e => { dragging=true; startY=e.clientY; startH=thread.getBoundingClientRect().height; document.body.style.cursor="ns-resize"; document.body.style.userSelect="none"; e.preventDefault(); });
  document.addEventListener("mousemove", e => { if (!dragging) return; const h=Math.max(120,Math.min(1200,startH+(e.clientY-startY))); thread.style.minHeight=h+"px"; thread.style.maxHeight=h+"px"; });
  document.addEventListener("mouseup", () => { if (!dragging) return; dragging=false; document.body.style.cursor=""; document.body.style.userSelect=""; localStorage.setItem(KEY,Math.round(thread.getBoundingClientRect().height)); });
}

// ─── Drop zone ────────────────────────────────────────────────────────────────
function bindDropZone() {
  const composer=qs("#composerArea"), fileInput=qs("#fileUploadInput"), uploadBtn=qs("#uploadBtn");
  if (!composer) return;
  composer.addEventListener("dragenter", e => { e.preventDefault(); composer.classList.add("drop-active"); });
  composer.addEventListener("dragover", e => { e.preventDefault(); composer.classList.add("drop-active"); });
  composer.addEventListener("dragleave", e => { if (!composer.contains(e.relatedTarget)) composer.classList.remove("drop-active"); });
  composer.addEventListener("drop", e => { e.preventDefault(); composer.classList.remove("drop-active"); const f=e.dataTransfer?.files?.[0]; if(f) handleFileUpload(f); });
  if (uploadBtn&&fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => { const f=fileInput.files?.[0]; if(f) handleFileUpload(f); fileInput.value=""; });
  }
}

// ─── Right panel tabs ─────────────────────────────────────────────────────────
function bindRightTabs() {
  qsa(".right-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const panel = tab.getAttribute("data-panel");
      state.rightPanel = panel; saveState();
      qsa(".right-tab").forEach(t => t.classList.toggle("right-tab--active", t.getAttribute("data-panel")===panel));
      const todos = qs("#rightPanelTodos"), arts = qs("#rightPanelArtifacts");
      if (todos) todos.style.display = panel==="todos" ? "" : "none";
      if (arts) arts.style.display = panel==="artifacts" ? "" : "none";
    });
  });
  // Restore panel state
  if (state.rightPanel==="artifacts") {
    qsa(".right-tab").forEach(t => t.classList.toggle("right-tab--active", t.getAttribute("data-panel")==="artifacts"));
    const todos=qs("#rightPanelTodos"), arts=qs("#rightPanelArtifacts");
    if (todos) todos.style.display="none"; if (arts) arts.style.display="";
  }
}

// ─── Bindings ─────────────────────────────────────────────────────────────────
function bindAll() {
  // Mode tabs
  qsa(".mode-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      state.mode = tab.getAttribute("data-mode")||"single";
      saveState(); renderModeTabs(); hydrateModelSelectors();
      const s=qs("#composerStatus"); if(s) s.textContent=MODE_STATUS[state.mode]||"Ready";
    });
  });

  // Chat buttons
  qs("#newChatBtn")?.addEventListener("click", async () => {
    try { setBusy(true,"Creating..."); await createChatSession({title:"New chat"}); showToast("New chat","good"); }
    catch { showToast("Failed","warn"); } finally { setBusy(false); }
  });

  qs("#branchChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) { showToast("No active chat","warn"); return; }
    const c=getChatById(state.selectedChatId);
    try { setBusy(true,"Branching..."); await createChatSession({title:c?.title?`${c.title} (branch)`:"Branch",cloneFromPublicId:state.selectedChatId}); showToast("Branched","good"); }
    catch { showToast("Branch failed","warn"); } finally { setBusy(false); }
  });

  qs("#pinChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) { showToast("No active chat","warn"); return; }
    const c=getChatById(state.selectedChatId); if (!c) return;
    const newPinned=!c.pinned;
    const res=await callApi(`/api/chat-sessions/${encodeURIComponent(state.selectedChatId)}`,"PATCH",{pinned:newPinned});
    if (!res.ok) { showToast("Pin failed","warn"); return; }
    c.pinned=newPinned;
    const rm=list=>list.filter(x=>x.id!==c.id);
    state.chats.pinned=rm(state.chats.pinned); state.chats.history=rm(state.chats.history);
    if (newPinned) state.chats.pinned.unshift(c); else state.chats.history.unshift(c);
    saveState(); renderHistory(); showToast(newPinned?"Pinned":"Unpinned","good");
  });

  // Send + keyboard
  qs("#sendBtn")?.addEventListener("click", sendAndStream);
  qs("#composerInput")?.addEventListener("keydown", e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAndStream();} });

  // Stop
  qs("#stopBtn")?.addEventListener("click", stopStream);

  // Search
  qs("#chatSearch")?.addEventListener("input", renderHistory);

  // Intent
  const intentBtn=qs("#intentBtn");
  if (intentBtn) {
    intentBtn.addEventListener("click", () => {
      const idx=INTENT_CYCLE.indexOf(state.intentMode||"auto");
      state.intentMode=INTENT_CYCLE[(idx+1)%INTENT_CYCLE.length];
      saveState();
      intentBtn.textContent=INTENT_LABELS[state.intentMode]||"Auto";
      intentBtn.className="btn-sm"+(state.intentMode!=="auto"?" intent-btn--active":"");
    });
    intentBtn.textContent=INTENT_LABELS[state.intentMode||"auto"]||"Auto";
    if (state.intentMode&&state.intentMode!=="auto") intentBtn.classList.add("intent-btn--active");
  }

  // Export
  qs("#exportBtn")?.addEventListener("click", async () => {
    const title=(qs("#exportTitle")?.value||"").trim();
    const note=(qs("#exportNote")?.value||"").trim();
    if (!title) { showToast("Add a project title","warn"); return; }
    if (!state.selectedChatId) { showToast("No active chat","warn"); return; }
    setBusy(true,"Exporting...");
    try {
      const res=await callApi("/api/home/exports","POST",{
        title, production_type:PROJECT_TYPE_MAP[state.selectedProjectType]||"app",
        target_portal:"projects", quick_capture:note,
        session_public_id:state.selectedChatId, mode:state.mode
      });
      if (!res.ok) { showToast(`Export failed: ${res.body?.detail||res.status}`,"warn"); return; }
      showToast("Exported to Projects","good");
      if (qs("#exportTitle")) qs("#exportTitle").value="";
      if (qs("#exportNote")) qs("#exportNote").value="";
    } finally { setBusy(false); }
  });

  // Project tags
  qs("#projectTypeTags")?.addEventListener("click", e => {
    const btn=e.target.closest("[data-tag]"); if (!btn) return;
    state.selectedProjectType=btn.getAttribute("data-tag"); saveState();
    qsa("#projectTypeTags .tag").forEach(b => b.classList.toggle("tag--active", b.getAttribute("data-tag")===state.selectedProjectType));
  });

  // Todos
  qs("#addTodoBtn")?.addEventListener("click", () => {
    const input=qs("#todoInput"), value=(input?.value||"").trim();
    if (!value) { showToast("Write a todo","warn"); return; }
    state.todos.unshift({id:safeId("todo"),title:value,detail:"",done:false});
    if (input) input.value=""; saveState(); renderTodos();
  });
  qs("#todoInput")?.addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();qs("#addTodoBtn")?.click();} });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrapHome() {
  setBusy(true,"Loading...");
  try {
    await refreshModelPool();
    const ok = await refreshChatSessions();
    if (ok && state.selectedChatId) await loadThreadHistory(state.selectedChatId);
  } catch(e) {
    console.error("Bootstrap:", e); showToast("Load error","warn");
  } finally {
    forceUnbusy(); renderAll();
  }
}

function init() {
  renderAll(); bindAll(); bindDropZone(); bindRightTabs(); initDragResize();
  bootstrapHome();
}

document.addEventListener("DOMContentLoaded", init);
