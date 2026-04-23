// ─── Constants ────────────────────────────────────────────────────────────────
const PM_HOME_KEY = "PM_HOME_V8";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const DEFAULT_MODEL = "gemma-3-4b-it-q8-0";

const MODE_STATUS = { chat: "Ready", multi: "Multi ready", discussion: "Discussion ready", deep_research: "Research ready", deep_reasoning: "Reasoning ready", system_analysis: "Analysis ready" };
const TOOL_ICONS = {
  web_search:"🔍", web_fetch:"🌐", web_crawl:"🕷️", run_python:"🐍", read_file:"📂",
  read_server_file:"🗄️", list_server_files:"📁", grep_files:"🔎", query_database:"🗃️",
  http_request:"📡", write_file:"✏️", shell_command:"💻", diff_text:"📊",
  summarise_large_file:"📄", image_analyse:"🖼️", call_model:"🤖"
};
const PROJECT_TYPE_MAP = { App:"app", Web:"portal", Game:"game", Writing:"writing", Research:"research", System:"system" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const qs = (s, r=document) => r.querySelector(s);
const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
const clone = v => JSON.parse(JSON.stringify(v));

function safeId(prefix="id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}

function escapeHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
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
  surface: "chat",
  singleModel: DEFAULT_MODEL,
  discussionModels: [],
  selectedProjectType: "App",
  chats: { pinned:[], projectFolder:[], history:[] },
  availableModels: [],
  backgroundJobs: [],
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
      availableModels: Array.isArray(p?.availableModels) ? p.availableModels : [],
      backgroundJobs: Array.isArray(p?.backgroundJobs) ? p.backgroundJobs : [],
      discussionModels: Array.isArray(p?.discussionModels) ? p.discussionModels : [],
      surface: p?.surface || "chat",
    };
  } catch { return clone(defaultState); }
}

function saveState() {
  try { localStorage.setItem(PM_HOME_KEY, JSON.stringify(state)); } catch {}
}

let state = loadState();
let activeRequestCount = 0;
let threadCache = {};
let activeReader = null;
let jobPollInterval = null;

// ─── Busy ─────────────────────────────────────────────────────────────────────
function setBusy(isBusy, label="") {
  activeRequestCount = isBusy ? activeRequestCount+1 : Math.max(0, activeRequestCount-1);
  const busy = activeRequestCount > 0;
  const s = qs("#composerStatus");
  if (s) s.textContent = busy ? (label||"Working...") : (MODE_STATUS[state.mode]||"Ready");
  const stopBtn = qs("#stopBtn");
  if (stopBtn) stopBtn.style.display = busy ? "" : "none";
  ["#sendBtn","#exportBtn","#newChatBtn","#branchChatBtn"].forEach(id => {
    const el = qs(id); if (el) el.disabled = busy;
  });
}

function forceUnbusy() {
  activeRequestCount = 0;
  const s = qs("#composerStatus");
  if (s) s.textContent = MODE_STATUS[state.mode]||"Ready";
  const stopBtn = qs("#stopBtn");
  if (stopBtn) stopBtn.style.display = "none";
  ["#sendBtn","#exportBtn","#newChatBtn","#branchChatBtn"].forEach(id => {
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
    try { await createChatSession({title:file.name}); } catch { showToast("No active chat","warn"); return; }
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
    .map(m => {
      const notes = String(m?.notes||"").trim();
      let label = notes.includes("|") ? notes.split("|").pop().trim() : (notes && !notes.includes("=") ? notes : String(m?.name||m?.alias||"").trim());
      return { value: String(m?.alias||m?.name||"").trim(), label, active: ["available","loaded"].includes(String(m?.runtime_state||"").toLowerCase()) };
    })
    .filter(m => m.value);
}

async function refreshModelPool() {
  const res = await callApi("/api/model-pool/models?sync=false","GET");
  if (!res.ok) { state.availableModels=[]; saveState(); hydrateModelSelector(); return; }
  const models = extractModels(res.body);
  state.availableModels = models;
  if (!state.singleModel || !models.some(m=>m.value===state.singleModel)) {
    const gemma = models.find(m=>m.value.includes("gemma"));
    state.singleModel = gemma ? gemma.value : (models[0]?.value || DEFAULT_MODEL);
  }
  saveState(); hydrateModelSelector();
}

function hydrateModelSelector() {
  const area = qs("#modelSelectArea"); if (!area) return;
  const all = state.availableModels;
  area.innerHTML = `<select class="select" id="singleModel">${
    all.length ? all.map(m=>`<option value="${escapeHtml(m.value)}">${escapeHtml(m.label||m.value)}</option>`).join("") : `<option value="${DEFAULT_MODEL}">${DEFAULT_MODEL}</option>`
  }</select>`;
  const sel = qs("#singleModel");
  if (state.singleModel && sel) sel.value = state.singleModel;
  sel?.addEventListener("change", e => { state.singleModel=e.target.value; saveState(); });
}

// ─── Chat session helpers ─────────────────────────────────────────────────────
function normalizeChatItem(item) {
  return {
    id: item.public_id||item.session_public_id||item.id||safeId("chat"),
    title: item.title||item.summary||"Untitled",
    pinned: Boolean(item.pinned),
    folder: item.folder||item.bucket||"",
    updatedAt: item.updated_at||item.updatedAt||"",
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

async function createChatSession({title, cloneFromPublicId=null}) {
  const res = await callApi("/api/chat-sessions","POST",{
    surface:"home", title, summary:"", mode:"single",
    selected_models:[state.singleModel].filter(Boolean),
    clone_from_public_id:cloneFromPublicId
  });
  if (!res.ok) throw new Error("Could not create chat session");
  const body = res.body||{};
  const publicId = body.public_id||body.session_public_id||body.id;
  if (!publicId) throw new Error("Missing session_public_id");
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
    catch { saveState(); renderAll(); return false; }
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
    threadCache[id] = msgs.filter(m=>(m.content||"")!==SKIP).map(m=>({
      id: m.message_public_id||safeId("msg"),
      role: m.role||"assistant",
      head: m.role==="user" ? "User" : (m.selected_worker_name||m.selected_model||"Assistant"),
      text: m.content||"",
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
  qs("#chatThread")?.scrollTo(0, qs("#chatThread").scrollHeight);
}

function markToolDone(name, summary) {
  const tools = qs("#streamTools"); if (!tools) return;
  const last = [...qsa(".stream-tool-call",tools)].reverse().find(l=>l.dataset.toolName===name);
  if (last) { last.classList.add("stream-tool-call--done"); const s=last.querySelector(".stream-tool-state"); if(s) s.textContent=summary?` ✓ ${summary}`:" ✓"; }
}

function appendStreamChunk(text) {
  const body = qs("#streamBody"); if (!body) return;
  if (!body._raw) body._raw="";
  body._raw += text; body.textContent = body._raw;
  qs("#chatThread")?.scrollTo(0, qs("#chatThread").scrollHeight);
}

function finalizeStreamingBubble(fullContent, modelName) {
  const bubble = qs("#streamingBubble"); if (!bubble) return;
  bubble.classList.remove("bubble--streaming"); bubble.id="";
  const head = qs(".stream-head",bubble);
  if (head) { head.className="bubble-head"; head.innerHTML=escapeHtml(modelName||"Assistant"); }
  const body = qs("#streamBody",bubble);
  if (body) { body.id=""; body._raw=undefined; body.innerHTML=renderMarkdown(fullContent||""); }
  qs("#chatThread")?.scrollTo(0, qs("#chatThread").scrollHeight);
}

// ─── Send ─────────────────────────────────────────────────────────────────────
async function sendAndStream() {
  const input = qs("#composerInput");
  const text = (input?.value||"").trim();
  if (!text) { showToast("Write something first","warn"); return; }

  if (!state.selectedChatId) {
    try { await createChatSession({title:text.slice(0,48)||"New chat"}); }
    catch { showToast("Could not create chat session","warn"); return; }
  }

  if (activeReader) { try { await activeReader.cancel(); } catch {} activeReader=null; }
  if (!threadCache[state.selectedChatId]) threadCache[state.selectedChatId]=[];
  threadCache[state.selectedChatId].push({id:safeId("msg"),role:"user",head:"User",text});
  renderThread();
  if (input) input.value="";

  setBusy(true,"Thinking…");
  const modelAlias = state.singleModel || DEFAULT_MODEL;
  createStreamingBubble(modelAlias);

  const sendMode = state.surface==="discussion" ? "discussion" : "single";
  const sendModels = state.surface==="discussion"
    ? (state.discussionModels.length ? state.discussionModels : [modelAlias]).join(",")
    : modelAlias;
  const params = new URLSearchParams({
    prompt:text, mode:sendMode, models:sendModels, intent:"auto"
  });
  const url = `${PM_API_BASE}/api/home/sessions/${encodeURIComponent(state.selectedChatId)}/stream?${params}`;
  let fullContent = "";
  let currentModelName = modelAlias;

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
          if (event.type==="tool_call") { appendToolCall(event.name, event.args); setStreamStatus(`${TOOL_ICONS[event.name]||"🔧"} ${event.name}`); setBusy(true,`${TOOL_ICONS[event.name]||"🔧"} ${event.name}…`); }
          else if (event.type==="tool_result") { markToolDone(event.name, event.summary); setStreamStatus("Generating…"); setBusy(true,"Generating…"); }
          else if (event.type==="chunk") { if (!fullContent) setStreamStatus(""); appendStreamChunk(event.text); fullContent+=event.text; }
          else if (event.type==="done") { fullContent=event.content||fullContent; }
          else if (event.type==="error") { appendStreamChunk(`\n\n⚠️ ${event.message}`); fullContent+=`\n\n⚠️ ${event.message}`; }
        } catch {}
      }
    }
  } catch(err) {
    if (err.name!=="AbortError") { finalizeStreamingBubble(`Error: ${err.message}`,currentModelName); forceUnbusy(); showToast("Stream failed","warn"); return; }
  } finally { activeReader=null; }

  finalizeStreamingBubble(fullContent, currentModelName);
  forceUnbusy();
  if (fullContent) threadCache[state.selectedChatId].push({id:safeId("msg"),role:"assistant",head:currentModelName,text:fullContent});

  const current = getChatById(state.selectedChatId);
  if (current && (!current.title || ["New chat","Untitled","Home chat"].includes(current.title))) {
    const newTitle = text.slice(0,60);
    current.title=newTitle; current.updatedAt=new Date().toISOString();
    saveState(); renderHistory();
    callApi(`/api/chat-sessions/${encodeURIComponent(state.selectedChatId)}`,"PATCH",{title:newTitle});
  }
}

// ─── Stop ─────────────────────────────────────────────────────────────────────
async function stopStream() {
  if (activeReader) { try { await activeReader.cancel(); } catch {} activeReader=null; }
  if (state.selectedChatId) callApi(`/api/home/sessions/${encodeURIComponent(state.selectedChatId)}/stop`,"POST");
  forceUnbusy(); showToast("Stopped","warn");
}

// ─── Background jobs ──────────────────────────────────────────────────────────
async function launchBackgroundJob(query, jobType) {
  setBusy(true, `Launching ${jobType}…`);
  try {
    const res = await callApi("/api/research/jobs","POST",{ query, mode: jobType, session_id: state.selectedChatId||"" });
    if (!res.ok) { showToast(`Launch failed: ${res.body?.detail||res.status}`,"warn"); return; }
    const job = { id: res.body.job_id, query: query.slice(0,60), type: jobType, status:"queued", created: new Date().toISOString(), result:null };
    state.backgroundJobs = [job, ...state.backgroundJobs.slice(0,19)];
    saveState(); renderJobs();
    showToast(`${jobType} launched`,"good");
    startJobPolling();
  } finally { setBusy(false); }
}

function startJobPolling() {
  if (jobPollInterval) return;
  jobPollInterval = setInterval(pollActiveJobs, 8000);
}

async function pollActiveJobs() {
  const active = state.backgroundJobs.filter(j=>j.status==="queued"||j.status==="running");
  if (!active.length) { clearInterval(jobPollInterval); jobPollInterval=null; return; }
  for (const job of active) {
    try {
      const res = await callApi(`/api/research/jobs/${job.id}`,"GET");
      if (!res.ok) continue;
      const updated = res.body;
      job.status = updated.status||job.status;
      if (updated.status==="completed") {
        job.result = updated.result_parsed?.summary || updated.result_parsed?.answer || updated.result || "Done";
        showToast(`${job.type} complete`,"good");
      } else if (updated.status==="failed") {
        job.result = updated.error||"Failed";
        showToast(`${job.type} failed`,"warn");
      }
    } catch {}
  }
  saveState(); renderJobs();
}

function renderJobs() {
  const root = qs("#jobsList"); if (!root) return;
  if (!state.backgroundJobs.length) {
    root.innerHTML = `<div class="job-empty">No background jobs yet.</div>`;
    return;
  }
  root.innerHTML = state.backgroundJobs.map(job => {
    const statusClass = job.status==="completed"?"job-status--done":job.status==="failed"?"job-status--fail":"job-status--active";
    const statusIcon = job.status==="completed"?"✓":job.status==="failed"?"✗":job.status==="running"?"⟳":"⏳";
    const age = job.created ? new Date(job.created).toLocaleTimeString() : "";
    return `<div class="job-card" data-job-id="${escapeHtml(job.id)}">
      <div class="job-card-head">
        <span class="job-status ${statusClass}">${statusIcon} ${escapeHtml(job.status)}</span>
        <span class="job-type">${escapeHtml(job.type)}</span>
        <span class="job-age">${age}</span>
      </div>
      <div class="job-query">${escapeHtml(job.query)}</div>
      ${job.result ? `<div class="job-result">${renderMarkdown(typeof job.result==="string"?job.result:JSON.stringify(job.result))}</div>` : ""}
    </div>`;
  }).join("");
  qsa(".job-card[data-job-id]",root).forEach(card => {
    card.style.cursor="pointer";
    card.addEventListener("click", () => {
      const job = state.backgroundJobs.find(j=>j.id===card.dataset.jobId);
      if (job?.result) {
        if (!threadCache[state.selectedChatId]) threadCache[state.selectedChatId]=[];
        threadCache[state.selectedChatId].push({id:safeId("msg"),role:"assistant",head:`${job.type} result`,text:typeof job.result==="string"?job.result:JSON.stringify(job.result,null,2)});
        renderThread(); showToast("Result added to chat","good");
      }
    });
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const search = (qs("#chatSearch")?.value||"").trim().toLowerCase();
  function renderSection(targetId, items, isFolder=false) {
    const root = qs(targetId); if (!root) return;
    const filtered = items.filter(item=>!search||item.title.toLowerCase().includes(search));
    root.innerHTML = filtered.map(item => {
      const ac = item.id===state.selectedChatId?" history-item--active":"";
      const fc = isFolder?" history-item--folder":"";
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
    root.innerHTML=`<div class="bubble bubble--assistant"><div class="bubble-head">Home</div><p>Select a chat or start a new one.</p></div>`;
    return;
  }
  root.innerHTML = thread.map(msg => {
    const rc = msg.role==="user"?"bubble bubble--user":"bubble bubble--assistant";
    const head = msg.role==="user"?"User":(msg.head||"Assistant");
    const body = msg.role==="user"?`<p>${escapeHtml(msg.text)}</p>`:renderMarkdown(msg.text);
    return `<div class="${rc}"><div class="bubble-head">${escapeHtml(head)}</div>${body}</div>`;
  }).join("");
  root.scrollTop = root.scrollHeight;
}

function renderAll() {
  ensureSelectedChatExists();
  renderHistory(); renderThread(); renderJobs(); hydrateModelSelector();
  const chip = qs("#globalStatusChip");
  if (chip) { chip.textContent="Online"; chip.className="status-chip status-chip--good"; }
  const exportTitle = qs("#exportTitle");
  if (exportTitle && !exportTitle.value.trim()) {
    const c = getChatById(state.selectedChatId);
    if (c?.title && !["New chat","Home chat","Untitled"].includes(c.title)) exportTitle.value=c.title;
  }
  renderDiscussionPicker();
  setSurface(state.surface||"chat");
}

function renderDiscussionPicker() {
  const root = qs("#discussionModelPicker"); if (!root) return;
  const all = state.availableModels;
  if (!all.length) { root.innerHTML=`<span class="soft" style="font-size:12px;">No models available</span>`; return; }
  root.innerHTML = all.map(m => {
    const active = state.discussionModels.includes(m.value);
    return `<button class="button disc-model-btn${active?" disc-model-btn--active":""}" data-alias="${escapeHtml(m.value)}" type="button">${escapeHtml(m.label||m.value)}</button>`;
  }).join("");
  qsa(".disc-model-btn", root).forEach(btn => {
    btn.addEventListener("click", ()=>{
      const alias = btn.getAttribute("data-alias");
      if (state.discussionModels.includes(alias)) {
        state.discussionModels = state.discussionModels.filter(a=>a!==alias);
      } else {
        state.discussionModels = [...state.discussionModels, alias];
      }
      saveState(); renderDiscussionPicker();
    });
  });
}

// ─── Drag resize ──────────────────────────────────────────────────────────────
function initDragResize() {
  const handle=qs("#chatResizeHandle"), thread=qs("#chatThread"); if (!handle||!thread) return;
  const KEY="home_chat_h_v8";
  const saved=parseInt(localStorage.getItem(KEY));
  if (saved>80&&saved<1200) { thread.style.minHeight=saved+"px"; thread.style.maxHeight=saved+"px"; }
  let dragging=false, startY=0, startH=0;
  handle.addEventListener("mousedown", e=>{ dragging=true; startY=e.clientY; startH=thread.getBoundingClientRect().height; document.body.style.cursor="ns-resize"; document.body.style.userSelect="none"; e.preventDefault(); });
  document.addEventListener("mousemove", e=>{ if(!dragging) return; const h=Math.max(180,Math.min(1200,startH+(e.clientY-startY))); thread.style.minHeight=h+"px"; thread.style.maxHeight=h+"px"; syncHistoryHeight(h); });
  document.addEventListener("mouseup", ()=>{ if(!dragging) return; dragging=false; document.body.style.cursor=""; document.body.style.userSelect=""; localStorage.setItem(KEY,Math.round(thread.getBoundingClientRect().height)); });
}

function syncHistoryHeight(h) { /* height managed by CSS flex */ }

// ─── Drop zone ────────────────────────────────────────────────────────────────
function bindDropZone() {
  const composer=qs("#composerArea"), fileInput=qs("#fileUploadInput"), uploadBtn=qs("#uploadBtn");
  if (!composer) return;
  composer.addEventListener("dragenter", e=>{ e.preventDefault(); composer.classList.add("drop-active"); });
  composer.addEventListener("dragover", e=>{ e.preventDefault(); composer.classList.add("drop-active"); });
  composer.addEventListener("dragleave", e=>{ if(!composer.contains(e.relatedTarget)) composer.classList.remove("drop-active"); });
  composer.addEventListener("drop", e=>{ e.preventDefault(); composer.classList.remove("drop-active"); const f=e.dataTransfer?.files?.[0]; if(f) handleFileUpload(f); });
  if (uploadBtn&&fileInput) {
    uploadBtn.addEventListener("click", ()=>fileInput.click());
    fileInput.addEventListener("change", ()=>{ const f=fileInput.files?.[0]; if(f) handleFileUpload(f); fileInput.value=""; });
  }
}

// ─── Bindings ─────────────────────────────────────────────────────────────────
function bindAll() {
  qs("#newChatBtn")?.addEventListener("click", async()=>{
    try { setBusy(true,"Creating..."); await createChatSession({title:"New chat"}); showToast("New chat","good"); }
    catch { showToast("Failed","warn"); } finally { setBusy(false); }
  });

  qs("#branchChatBtn")?.addEventListener("click", async()=>{
    if (!state.selectedChatId) { showToast("No active chat","warn"); return; }
    const c=getChatById(state.selectedChatId);
    try { setBusy(true,"Branching..."); await createChatSession({title:c?.title?`${c.title} (branch)`:"Branch",cloneFromPublicId:state.selectedChatId}); showToast("Branched","good"); }
    catch { showToast("Branch failed","warn"); } finally { setBusy(false); }
  });

  qs("#pinChatBtn")?.addEventListener("click", async()=>{
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

  qs("#sendBtn")?.addEventListener("click", sendAndStream);
  qs("#composerInput")?.addEventListener("keydown", e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAndStream();} });
  qs("#stopBtn")?.addEventListener("click", stopStream);
  qs("#chatSearch")?.addEventListener("input", renderHistory);

  // Surface tabs: Chat vs Discussion
  function setSurface(surface) {
    state.surface = surface; saveState();
    qs("#tabChat")?.classList.toggle("surface-tab--active", surface==="chat");
    qs("#tabDiscussion")?.classList.toggle("surface-tab--active", surface==="discussion");
    const dp = qs("#discussionPanel");
    if (dp) dp.style.display = surface==="discussion" ? "" : "none";
    const s=qs("#composerStatus"); if(s) s.textContent=surface==="discussion"?"Discussion ready":"Ready";
    const ci=qs("#composerInput");
    if (ci) ci.placeholder = surface==="discussion" ? "All selected specialists will see this and respond…" : "Write here. Gemma4 answers directly.";
  }
  qs("#tabChat")?.addEventListener("click", ()=>setSurface("chat"));
  qs("#tabDiscussion")?.addEventListener("click", ()=>setSurface("discussion"));

  // Launch background job
  qs("#launchJobBtn")?.addEventListener("click", async()=>{
    const input=qs("#composerInput"); const text=(input?.value||"").trim();
    if (!text) { showToast("Describe the task first","warn"); return; }
    const jobType = qs("#bgJobType")?.value || "deep_research";
    await launchBackgroundJob(text, jobType);
    if (input) input.value="";
  });

  // Export
  qs("#exportBtn")?.addEventListener("click", async()=>{
    const title=(qs("#exportTitle")?.value||"").trim();
    const note=(qs("#exportNote")?.value||"").trim();
    if (!title) { showToast("Add a project title","warn"); return; }
    if (!state.selectedChatId) { showToast("No active chat","warn"); return; }
    setBusy(true,"Exporting...");
    try {
      const res=await callApi("/api/home/exports","POST",{
        title, production_type:PROJECT_TYPE_MAP[state.selectedProjectType]||"app",
        target_portal:"projects", quick_capture:note,
        session_public_id:state.selectedChatId, mode:"single"
      });
      if (!res.ok) { showToast(`Export failed: ${res.body?.detail||res.status}`,"warn"); return; }
      showToast("Exported to Projects","good");
      if (qs("#exportTitle")) qs("#exportTitle").value="";
      if (qs("#exportNote")) qs("#exportNote").value="";
    } finally { setBusy(false); }
  });

  qs("#projectTypeTags")?.addEventListener("click", e=>{
    const btn=e.target.closest("[data-tag]"); if (!btn) return;
    state.selectedProjectType=btn.getAttribute("data-tag"); saveState();
    qsa("#projectTypeTags .tag").forEach(b=>b.classList.toggle("tag--active",b.getAttribute("data-tag")===state.selectedProjectType));
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrapHome() {
  setBusy(true,"Loading...");
  try {
    await refreshModelPool();
    const ok = await refreshChatSessions();
    if (ok && state.selectedChatId) await loadThreadHistory(state.selectedChatId);
    // Poll any queued jobs from previous session
    const hasActive = state.backgroundJobs.some(j=>j.status==="queued"||j.status==="running");
    if (hasActive) startJobPolling();
    renderJobs();
  } catch(e) { console.error("Bootstrap:", e); showToast("Load error","warn"); }
  finally { forceUnbusy(); renderAll(); }
}

function init() {
  renderAll(); bindAll(); bindDropZone(); initDragResize();
  bootstrapHome();
}

document.addEventListener("DOMContentLoaded", init);
