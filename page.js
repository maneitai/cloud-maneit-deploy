const PM_HOME_KEY = "PM_HOME_V6";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const MODE_HELP = {
  single: "<strong>Single:</strong> one selected model answers directly.",
  multi: "<strong>Multi:</strong> the same prompt is sent to all selected models and each responds separately.",
  discussion: "<strong>Discussion:</strong> lead answers first, then specialists build on each other — each sees what the others said."
};
const MODE_STATUS = { single: "Single mode ready", multi: "Multi mode ready", discussion: "Discussion mode ready" };
const PROJECT_TYPE_MAP = { App:"app", Web:"portal", Game:"game", Writing:"writing", Research:"research", System:"system" };
const TOOL_ICONS = {
  web_search:"🔍", web_fetch:"🌐", web_crawl:"🕷️", run_python:"🐍", read_file:"📂",
  read_server_file:"🗄️", list_server_files:"📁", grep_files:"🔎", query_database:"🗃️",
  http_request:"📡", write_file:"✏️", shell_command:"💻", diff_text:"📊",
  summarise_large_file:"📄", image_analyse:"🖼️", call_model:"🤖"
};

const defaultState = {
  selectedChatId:"", mode:"single", singleModel:"", multiModels:[], discussionModels:[],
  selectedProjectType:"App", chats:{pinned:[],projectFolder:[],history:[]}, todos:[],
  calendar:[
    {day:"Mon",date:"24",items:[{title:"Portal layout review",tone:"default"},{title:"Writing block",tone:"good"}]},
    {day:"Tue",date:"25",items:[{title:"Admin / email",tone:"warn"},{title:"Game planning",tone:"default"}]},
    {day:"Wed",date:"26",today:true,items:[{title:"Home page lock-in",tone:"good"},{title:"Projects next",tone:"default"}]},
    {day:"Thu",date:"27",items:[{title:"Pipeline cleanup",tone:"default"}]},
    {day:"Fri",date:"28",items:[{title:"Creative writing",tone:"default"}]},
    {day:"Sat",date:"29",items:[{title:"Reset / planning",tone:"warn"}]},
    {day:"Sun",date:"30",items:[{title:"Open creative block",tone:"good"}]}
  ],
  activeModels:[], availableModels:[], bootstrapped:false
};

let state = loadState();
let activeRequestCount = 0;
let threadCache = {};
let activeStream = null;

const qs = (s,r=document) => r.querySelector(s);
const qsa = (s,r=document) => Array.from(r.querySelectorAll(s));
const clone = v => JSON.parse(JSON.stringify(v));
const safeId = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

function escapeHtml(v) {
  return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function renderMarkdown(text) {
  if (!text) return "";
  let t = escapeHtml(text);
  t = t.replace(/```[\s\S]*?```/g, m => `<pre><code>${m.slice(3,-3).replace(/^[a-z]*\n/,"")}</code></pre>`);
  t = t.replace(/`([^`]+)`/g,"<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g,"<em>$1</em>");
  t = t.replace(/((?:^[ \t]*[\*\-] .+\n?)+)/gm, block => {
    return `<ul>${block.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[\*\-] /,"")}</li>`).join("")}</ul>`;
  });
  t = t.replace(/((?:^[ \t]*\d+\. .+\n?)+)/gm, block => {
    return `<ol>${block.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`;
  });
  t = t.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  return `<p>${t}</p>`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(PM_HOME_KEY);
    if (!raw) return clone(defaultState);
    const p = JSON.parse(raw), b = clone(defaultState);
    return {
      ...b, ...p,
      chats: {
        pinned: Array.isArray(p?.chats?.pinned) ? p.chats.pinned : b.chats.pinned,
        projectFolder: Array.isArray(p?.chats?.projectFolder) ? p.chats.projectFolder : b.chats.projectFolder,
        history: Array.isArray(p?.chats?.history) ? p.chats.history : b.chats.history
      },
      todos: Array.isArray(p?.todos) ? p.todos : b.todos,
      calendar: Array.isArray(p?.calendar) ? p.calendar : b.calendar,
      activeModels: Array.isArray(p?.activeModels) ? p.activeModels : b.activeModels,
      availableModels: Array.isArray(p?.availableModels) ? p.availableModels : b.availableModels,
      multiModels: Array.isArray(p?.multiModels) ? p.multiModels : b.multiModels,
      discussionModels: Array.isArray(p?.discussionModels) ? p.discussionModels : b.discussionModels
    };
  } catch { return clone(defaultState); }
}

function saveState() { try { localStorage.setItem(PM_HOME_KEY, JSON.stringify(state)); } catch {} }

function setBusy(isBusy, label="") {
  activeRequestCount = isBusy ? activeRequestCount+1 : Math.max(0, activeRequestCount-1);
  const busy = activeRequestCount > 0;
  const s = qs("#composerStatus");
  if (s) s.textContent = busy ? (label||"Working...") : (MODE_STATUS[state.mode]||"Ready");
  ["#sendBtn","#exportBtn","#newChatBtn","#branchChatBtn","#addTodoBtn"].forEach(id => {
    const el = qs(id); if (el) el.disabled = busy;
  });
}

function forceUnbusy() {
  activeRequestCount = 0;
  const s = qs("#composerStatus");
  if (s) s.textContent = MODE_STATUS[state.mode]||"Ready";
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

async function callApi(path, method="GET", payload=null) {
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, {
      method, headers:{"Content-Type":"application/json"},
      body: payload ? JSON.stringify(payload) : undefined
    });
    const ct = res.headers.get("content-type")||"";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return {ok:res.ok, status:res.status, body};
  } catch(e) { return {ok:false, error:String(e)}; }
}

// ─── File upload ──────────────────────────────────────────────────────────────

async function uploadFile(file) {
  const fd = new FormData(); fd.append("file", file);
  try {
    const res = await fetch(`${PM_API_BASE}/api/home/upload`, {method:"POST", body:fd});
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return await res.json();
  } catch(e) { throw new Error(String(e)); }
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

function setDropZoneActive(active) {
  qs("#composerArea")?.classList.toggle("drop-active", active);
}

async function handleFileUpload(file) {
  if (!file) return;
  if (!state.selectedChatId) {
    try { await createChatSession({title:file.name}); }
    catch { showToast("No active chat — create one first","warn"); return; }
  }
  renderUploadPill(file.name,"uploading");
  setBusy(true,`Uploading ${file.name}…`);
  let result;
  try { result = await uploadFile(file); }
  catch { setBusy(false); renderUploadPill(file.name,"error"); showToast("Upload failed","warn"); return; }
  setBusy(false); renderUploadPill(file.name,"done"); showToast(`Uploaded: ${file.name}`,"good");
  const input = qs("#composerInput");
  if (input) input.value = result.analysis_prompt || `File '${file.name}' uploaded. Please analyse it.`;
  await sendAndStream(); clearUploadPill();
}

function bindDropZone() {
  const composer = qs("#composerArea"), fileInput = qs("#fileUploadInput"), uploadBtn = qs("#uploadBtn");
  if (!composer) return;
  composer.addEventListener("dragenter", e => { e.preventDefault(); setDropZoneActive(true); });
  composer.addEventListener("dragover",  e => { e.preventDefault(); setDropZoneActive(true); });
  composer.addEventListener("dragleave", e => { if (!composer.contains(e.relatedTarget)) setDropZoneActive(false); });
  composer.addEventListener("drop", e => {
    e.preventDefault(); setDropZoneActive(false);
    const f = e.dataTransfer?.files?.[0]; if (f) handleFileUpload(f);
  });
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0]; if (f) handleFileUpload(f); fileInput.value="";
    });
  }
}

// ─── Model pool ───────────────────────────────────────────────────────────────

function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val||"[]"); } catch { return []; }
}

function extractModels(r) {
  return (Array.isArray(r?.items)?r.items:[])
    .filter(m => m?.enabled!==false)
    .filter(m => m?.runtime_driver==="openai_api")
    .filter(m => parseSurfaces(m?.surface_allowlist).includes("home"))
    .map(m => ({
      value: String(m?.alias||m?.name||"").trim(),
      label: String(m?.name||m?.alias||"").trim(),
      active: ["available","loaded"].includes(String(m?.runtime_state||"").toLowerCase())
    }))
    .filter(m => m.value);
}

async function refreshModelPool() {
  const res = await callApi("/api/model-pool/models?sync=false","GET");
  if (!res.ok) { state.activeModels=[]; state.availableModels=[]; saveState(); renderModeHelp(); hydrateModelSelectors(); return; }
  const models = extractModels(res.body);
  state.availableModels = models; state.activeModels = models.filter(m=>m.active);
  const all = state.availableModels;
  if (!state.singleModel && all[0]) state.singleModel = all[0].value;
  if (!state.multiModels.length && all.length) state.multiModels = all.slice(0,3).map(m=>m.value);
  if (!state.discussionModels.length && all.length) state.discussionModels = all.slice(0,4).map(m=>m.value);
  saveState(); hydrateModelSelectors(); renderModeHelp();
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function buildMultiSelectDropdown(dropdownEl, models, selectedValues, onChange) {
  dropdownEl.innerHTML = "";
  if (!models.length) {
    const e = document.createElement("div"); e.className="multi-select-empty"; e.textContent="No models available"; dropdownEl.appendChild(e); return;
  }
  models.forEach(model => {
    const row = document.createElement("div"); row.className="multi-select-option";
    const cb = document.createElement("input"); cb.type="checkbox";
    cb.id=`ms_${dropdownEl.id}_${model.value}`; cb.value=model.value; cb.checked=selectedValues.includes(model.value);
    const lbl = document.createElement("label"); lbl.htmlFor=cb.id; lbl.textContent=model.label;
    cb.addEventListener("change", () => {
      onChange(qsa('input[type="checkbox"]',dropdownEl).filter(el=>el.checked).map(el=>el.value));
    });
    row.appendChild(cb); row.appendChild(lbl); dropdownEl.appendChild(row);
  });
}

function updateTriggerLabel(el, vals, placeholder="Select models...") {
  el.textContent = vals.length ? vals.join(", ") : placeholder;
  el.title = vals.length ? vals.join("\n") : placeholder;
}

function bindDropdownToggle(triggerId, dropdownId) {
  const trigger=qs(`#${triggerId}`), dropdown=qs(`#${dropdownId}`);
  if (!trigger||!dropdown) return;
  trigger.addEventListener("click", e => { e.stopPropagation(); dropdown.classList.toggle("is-open"); });
  document.addEventListener("click", e => { if (!dropdown.contains(e.target)&&e.target!==trigger) dropdown.classList.remove("is-open"); });
}

function hydrateModelSelectors() {
  const all = Array.isArray(state.availableModels) ? state.availableModels : [];
  const singleEl = qs("#singleModel");
  if (singleEl) {
    singleEl.innerHTML = all.length ? all.map(m=>`<option value="${escapeHtml(m.value)}">${escapeHtml(m.label)}</option>`).join("") : `<option value="">No models available</option>`;
    if (state.singleModel && all.some(m=>m.value===state.singleModel)) singleEl.value=state.singleModel;
    else if (all[0]) { state.singleModel=all[0].value; singleEl.value=all[0].value; }
  }
  const md=qs("#multiModelDropdown"), mt=qs("#multiModelTrigger");
  if (md&&mt) { buildMultiSelectDropdown(md,all,state.multiModels,c=>{state.multiModels=c;saveState();updateTriggerLabel(mt,c);}); updateTriggerLabel(mt,state.multiModels); }
  const dd=qs("#discussionDropdown"), dt=qs("#discussionTrigger");
  if (dd&&dt) { buildMultiSelectDropdown(dd,all,state.discussionModels,c=>{state.discussionModels=c;saveState();updateTriggerLabel(dt,c,"Select specialists...");}); updateTriggerLabel(dt,state.discussionModels,"Select specialists..."); }
}

function normalizeSelectedModels() {
  if (state.mode==="single") return [state.singleModel].filter(Boolean);
  if (state.mode==="multi") return Array.isArray(state.multiModels)?state.multiModels.filter(Boolean):[];
  return Array.isArray(state.discussionModels)?state.discussionModels.filter(Boolean):[];
}

// ─── Chat session helpers ─────────────────────────────────────────────────────

function normalizeChatItem(item) {
  return {
    id: item.public_id||item.session_public_id||item.id||safeId("chat"),
    title: item.title||item.summary||"Untitled chat",
    summary: item.summary||"", mode: item.mode||"single",
    pinned: Boolean(item.pinned), folder: item.folder||item.bucket||"",
    updatedAt: item.updated_at||item.updatedAt||"",
    createdAt: item.created_at||item.createdAt||""
  };
}

function getChatById(id) {
  return [...state.chats.pinned,...state.chats.projectFolder,...state.chats.history].find(c=>c.id===id)||null;
}

// FIX: push preserves backend sort order (newest-first from API)
function mergeChatIntoCollections(chat) {
  const rm = list => list.filter(c=>c.id!==chat.id);
  state.chats.pinned=rm(state.chats.pinned); state.chats.projectFolder=rm(state.chats.projectFolder); state.chats.history=rm(state.chats.history);
  if (chat.pinned) state.chats.pinned.push(chat);
  else if (chat.folder==="project"||chat.folder==="projects") state.chats.projectFolder.push(chat);
  else state.chats.history.push(chat);
}

function ensureSelectedChatExists() {
  const all = [...state.chats.pinned,...state.chats.projectFolder,...state.chats.history];
  if (!all.length) return;
  if (!all.some(c=>c.id===state.selectedChatId)) state.selectedChatId=all[0].id;
}

// ─── Thread ───────────────────────────────────────────────────────────────────

async function loadThreadHistory(id) {
  if (!id) return;
  try {
    const res = await callApi(`/api/home/sessions/${encodeURIComponent(id)}/live-chat/history`,"GET");
    if (!res.ok) return;
    const msgs = Array.isArray(res.body?.messages) ? res.body.messages : [];
    // FIX: fully replace — never merge with streaming data, never reverse
    threadCache[id] = msgs.map(m => ({
      id: m.message_public_id||safeId("msg"),
      role: m.role||"assistant",
      head: m.role==="user" ? "User" : (m.selected_worker_name||m.selected_model||"Assistant"),
      text: m.content||"", mode: m.mode||"single",
      model: m.selected_model||m.selected_worker_name||""
    }));
    renderThread();
  } catch(e) { console.warn("loadThreadHistory failed:", e); }
}

function getCurrentThread() { return threadCache[state.selectedChatId]||[]; }

// ─── Streaming ────────────────────────────────────────────────────────────────

function createStreamingBubble(modelName) {
  const root = qs("#chatThread"); if (!root) return null;
  const bubble = document.createElement("div");
  bubble.className="chat-bubble chat-bubble--assistant chat-bubble--streaming";
  bubble.id="streamingBubble";
  bubble.innerHTML=`
    <div class="chat-bubble-head stream-head" id="streamHead">
      <span class="stream-head-name">${escapeHtml(modelName||"Assistant")}</span>
      <span class="stream-thinking-dot"></span>
    </div>
    <div class="stream-tools" id="streamTools"></div>
    <div class="stream-body" id="streamBody"></div>
  `;
  root.appendChild(bubble); root.scrollTop=root.scrollHeight; return bubble;
}

function setStreamStatus(text) {
  const head=qs("#streamHead"); if (!head) return;
  let s=head.querySelector(".stream-status");
  if (!s) { s=document.createElement("span"); s.className="stream-status"; head.appendChild(s); }
  s.textContent = text ? ` · ${text}` : "";
}

function appendToolCall(name, args) {
  const tools=qs("#streamTools"); if (!tools) return;
  const icon=TOOL_ICONS[name]||"🔧";
  const argsStr=args&&typeof args==="object"?Object.entries(args).map(([k,v])=>`${k}: ${String(v).slice(0,60)}`).join(", "):"";
  const line=document.createElement("div"); line.className="stream-tool-call"; line.dataset.toolName=name;
  line.innerHTML=`<span class="stream-tool-icon">${icon}</span><span class="stream-tool-name">${escapeHtml(name)}</span>${argsStr?`<span class="stream-tool-args">${escapeHtml(argsStr)}</span>`:""}<span class="stream-tool-state">…</span>`;
  tools.appendChild(line);
  const thread=qs("#chatThread"); if (thread) thread.scrollTop=thread.scrollHeight;
}

function markToolDone(name, summary) {
  const tools=qs("#streamTools"); if (!tools) return;
  const last=[...qsa(".stream-tool-call",tools)].reverse().find(l=>l.dataset.toolName===name);
  if (last) {
    last.classList.add("stream-tool-call--done");
    const s=last.querySelector(".stream-tool-state"); if (s) s.textContent=summary?` ✓ ${summary}`:" ✓";
  }
}

function appendStreamChunk(text) {
  const body=qs("#streamBody"); if (!body) return;
  if (!body._raw) body._raw="";
  body._raw+=text; body.textContent=body._raw;
  const thread=qs("#chatThread"); if (thread) thread.scrollTop=thread.scrollHeight;
}

function finalizeStreamingBubble(fullContent, modelName) {
  const bubble=qs("#streamingBubble"); if (!bubble) return;
  bubble.classList.remove("chat-bubble--streaming"); bubble.id="";
  const head=qs(".stream-head",bubble);
  if (head) { head.className="chat-bubble-head"; head.innerHTML=escapeHtml(modelName||"Assistant"); }
  const body=qs("#streamBody",bubble);
  if (body) { body.id=""; body._raw=undefined; body.innerHTML=renderMarkdown(fullContent||""); }
  const thread=qs("#chatThread"); if (thread) thread.scrollTop=thread.scrollHeight;
}

async function sendAndStream() {
  const input=qs("#composerInput");
  const text=(input?.value||"").trim();
  if (!text) { showToast("Write something first","warn"); return; }
  if (!state.selectedChatId) { showToast("No active chat session","warn"); return; }
  const selectedModels=normalizeSelectedModels();
  if (!selectedModels.length) { showToast("No models selected","warn"); return; }

  if (activeStream) { activeStream.close(); activeStream=null; }
  if (!threadCache[state.selectedChatId]) threadCache[state.selectedChatId]=[];
  threadCache[state.selectedChatId].push({id:safeId("msg"),role:"user",head:"User",text});
  renderThread();
  if (input) input.value="";

  setBusy(true,"Thinking…");

  // currentModelName tracks active model — changes on model_start in discussion mode
  let currentModelName = selectedModels[0]||"Assistant";
  createStreamingBubble(currentModelName);

  const params = new URLSearchParams({prompt:text, mode:state.mode, models:selectedModels.join(",")});
  const url = `${PM_API_BASE}/api/home/sessions/${encodeURIComponent(state.selectedChatId)}/stream?${params}`;
  let fullContent = "";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
    const reader=response.body.getReader(), decoder=new TextDecoder();
    let buffer="";

    while (true) {
      const {value, done:streamDone} = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value,{stream:true});
      const lines=buffer.split("\n"); buffer=lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event=JSON.parse(line.slice(6));
          if (event.type==="model_start") {
            // Discussion: finalize current bubble, start new one for this model
            if (fullContent) {
              finalizeStreamingBubble(fullContent, currentModelName);
              threadCache[state.selectedChatId].push({id:safeId("msg"),role:"assistant",head:currentModelName,text:fullContent,model:currentModelName});
              fullContent="";
            }
            const roleLabel = event.role==="lead" ? " · lead" : event.role ? ` · ${event.role}` : "";
            currentModelName = (event.model||"Assistant") + roleLabel;
            createStreamingBubble(currentModelName);
          } else if (event.type==="tool_call") {
            appendToolCall(event.name,event.args);
            setStreamStatus(`${TOOL_ICONS[event.name]||"🔧"} ${event.name}`);
            setBusy(true,`${TOOL_ICONS[event.name]||"🔧"} ${event.name}…`);
          } else if (event.type==="tool_result") {
            markToolDone(event.name,event.summary);
            setStreamStatus("Generating…"); setBusy(true,"Generating…");
          } else if (event.type==="chunk") {
            if (!fullContent) setStreamStatus("");
            appendStreamChunk(event.text); fullContent+=event.text;
          } else if (event.type==="done") {
            fullContent=event.content||fullContent;
          } else if (event.type==="error") {
            appendStreamChunk(`\n\n⚠️ ${event.message}`); fullContent+=`\n\n⚠️ ${event.message}`;
          }
        } catch {}
      }
    }
  } catch(err) {
    finalizeStreamingBubble(`Error: ${err.message}`, currentModelName);
    forceUnbusy(); showToast("Stream failed","warn"); return;
  }

  finalizeStreamingBubble(fullContent, currentModelName);
  forceUnbusy();

  if (fullContent) {
    threadCache[state.selectedChatId].push({id:safeId("msg"),role:"assistant",head:currentModelName,text:fullContent,model:currentModelName});
  }

  // FIX: title persistence — PATCH saves to backend, survives refresh
  const current=getChatById(state.selectedChatId);
  if (current && (!current.title || ["New chat","Untitled chat","Home chat"].includes(current.title))) {
    const newTitle=text.slice(0,60);
    current.title=newTitle; current.updatedAt=new Date().toISOString();
    saveState(); renderHistory();
    callApi(`/api/chat-sessions/${encodeURIComponent(state.selectedChatId)}`,"PATCH",{title:newTitle});
  }

  await refreshModelPool();
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderHistorySection(targetId, items, isFolder=false) {
  const root=qs(targetId); if (!root) return;
  const search=(qs("#chatSearch")?.value||"").trim().toLowerCase();
  const filtered=items.filter(item=>!search||item.title.toLowerCase().includes(search));
  root.innerHTML=filtered.map(item => {
    const ac=item.id===state.selectedChatId?" history-link--active":"";
    const fc=isFolder?" history-link--folder":"";
    return `<a class="history-link${ac}${fc}" href="#" data-chat-id="${escapeHtml(item.id)}"><span class="history-link__dot"></span><span class="history-link__title">${escapeHtml(item.title)}</span></a>`;
  }).join("");
  qsa(".history-link",root).forEach(link => {
    link.addEventListener("click", async e => {
      e.preventDefault();
      const chatId=link.getAttribute("data-chat-id");
      if (!chatId||chatId===state.selectedChatId) return;
      state.selectedChatId=chatId; saveState(); renderHistory(); renderThread();
      await loadThreadHistory(chatId);
    });
  });
}

function renderHistory() {
  renderHistorySection("#pinnedChatsList",state.chats.pinned,false);
  renderHistorySection("#projectFolderList",state.chats.projectFolder,true);
  renderHistorySection("#chatHistoryList",state.chats.history,false);
}

function renderModeCards() {
  qsa(".metric-card--mode").forEach(card => card.classList.toggle("is-active", card.getAttribute("data-mode")===state.mode));
}

function renderActiveModels() {
  const controlsCard=qs(".home-controls-card"); if (!controlsCard) return;
  let box=qs("#activeModelsBox");
  if (!box) { box=document.createElement("div"); box.id="activeModelsBox"; box.className="mode-help"; box.style.marginTop="12px"; controlsCard.appendChild(box); }
  const active=Array.isArray(state.activeModels)?state.activeModels:[];
  if (!active.length) { box.innerHTML="<strong>Active models:</strong> none reported by PM backend."; return; }
  box.innerHTML=`<strong>Active models (${active.length}):</strong><div class="chip-row chip-row--inside" style="margin-top:8px;">${active.map(m=>`<span class="chip">${escapeHtml(typeof m==="string"?m:m.label||m.value||"")}</span>`).join("")}</div>`;
}

function renderModeHelp() {
  const help=qs("#modeHelpText"), cs=qs("#composerStatus");
  if (help) help.innerHTML=MODE_HELP[state.mode]||MODE_HELP.single;
  if (cs&&activeRequestCount===0) cs.textContent=MODE_STATUS[state.mode]||MODE_STATUS.single;
  renderActiveModels();
}

function renderThread() {
  const root=qs("#chatThread"); if (!root) return;
  const thread=getCurrentThread();
  if (!thread.length) {
    root.innerHTML=`<div class="chat-bubble chat-bubble--assistant"><div class="chat-bubble-head">Home daily driver</div><p>Select an existing chat or create a new one to begin.</p><p style="color:var(--muted,#7da8d0);font-size:13px;margin-top:8px;">💡 Drag a file onto the composer below to upload and analyse it.</p></div>`;
    return;
  }
  root.innerHTML=thread.map(msg => {
    const rc=msg.role==="user"?"chat-bubble chat-bubble--user":"chat-bubble chat-bubble--assistant";
    const head=msg.role==="user"?"User":(msg.head||msg.model||"Assistant");
    const body=msg.role==="user"?`<p>${escapeHtml(msg.text)}</p>`:renderMarkdown(msg.text);
    return `<div class="${rc}"><div class="chat-bubble-head">${escapeHtml(head)}</div>${body}</div>`;
  }).join("");
  root.scrollTop=root.scrollHeight;
}

function renderTodos() {
  const root=qs("#todoList"); if (!root) return;
  root.innerHTML=state.todos.map(todo=>`
    <div class="todo-item">
      <label style="display:flex;align-items:flex-start;gap:8px;flex:1;cursor:pointer;">
        <input type="checkbox" data-todo-id="${escapeHtml(todo.id)}" ${todo.done?"checked":""} style="margin-top:3px;" />
        <div class="todo-item__body"><strong>${escapeHtml(todo.title)}</strong>${todo.detail?`<span>${escapeHtml(todo.detail)}</span>`:""}</div>
      </label>
      <button class="button" data-remove-todo="${escapeHtml(todo.id)}" type="button" style="padding:2px 8px;font-size:0.75rem;flex-shrink:0;">✕</button>
    </div>
  `).join("");
  qsa('input[type="checkbox"][data-todo-id]',root).forEach(cb => {
    cb.addEventListener("change", () => { const t=state.todos.find(t=>t.id===cb.getAttribute("data-todo-id")); if (t) { t.done=cb.checked; saveState(); } });
  });
  qsa("[data-remove-todo]",root).forEach(btn => {
    btn.addEventListener("click", () => { state.todos=state.todos.filter(t=>t.id!==btn.getAttribute("data-remove-todo")); saveState(); renderTodos(); });
  });
}

function renderCalendar() {
  const root=qs("#calendarGrid"); if (!root) return;
  root.innerHTML=state.calendar.map(day => {
    const dc=day.today?"calendar-day calendar-day--today":"calendar-day";
    const items=(day.items||[]).map(item => {
      const tc=item.tone==="good"?" calendar-entry--good":item.tone==="warn"?" calendar-entry--warn":"";
      const sub=item.tone==="good"?"Focus block":item.tone==="warn"?"Attention":"Planned";
      return `<div class="calendar-entry${tc}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(sub)}</span></div>`;
    }).join("");
    return `<article class="${dc}"><div class="calendar-day__head"><strong>${escapeHtml(day.day)}</strong><span class="soft">${escapeHtml(day.date)}</span></div>${items}</article>`;
  }).join("");
}

function hydrateFields() {
  hydrateModelSelectors();
  qsa("#projectTypeTags .tag-button").forEach(btn => btn.classList.toggle("tag-button--active", btn.getAttribute("data-tag")===state.selectedProjectType));
}

function renderSelectedChatTitleIntoExport() {
  const el=qs("#exportTitle"); if (!el||el.value.trim()) return;
  const c=getChatById(state.selectedChatId);
  if (c?.title && !["New chat","Home chat"].includes(c.title)) el.value=c.title;
}

function renderAll() {
  ensureSelectedChatExists(); hydrateFields(); renderHistory(); renderModeCards();
  renderModeHelp(); renderTodos(); renderCalendar(); renderThread(); renderSelectedChatTitleIntoExport();
}

// ─── Drag resize ─────────────────────────────────────────────────────────────

function initDragResize() {
  const handle=qs("#chatResizeHandle"), thread=qs("#chatThread");
  if (!handle||!thread) return;
  const KEY="home_chat_height";
  const saved=parseInt(localStorage.getItem(KEY));
  if (saved>80&&saved<1200) { thread.style.minHeight=saved+"px"; thread.style.maxHeight=saved+"px"; }
  let dragging=false, startY=0, startH=0;
  handle.addEventListener("mousedown", e => { dragging=true; startY=e.clientY; startH=thread.getBoundingClientRect().height; document.body.style.cursor="ns-resize"; document.body.style.userSelect="none"; e.preventDefault(); });
  document.addEventListener("mousemove", e => { if (!dragging) return; const h=Math.max(120,Math.min(1200,startH+(e.clientY-startY))); thread.style.minHeight=h+"px"; thread.style.maxHeight=h+"px"; });
  document.addEventListener("mouseup", () => { if (!dragging) return; dragging=false; document.body.style.cursor=""; document.body.style.userSelect=""; localStorage.setItem(KEY,Math.round(thread.getBoundingClientRect().height)); });
  handle.addEventListener("touchstart", e => { dragging=true; startY=e.touches[0].clientY; startH=thread.getBoundingClientRect().height; e.preventDefault(); }, {passive:false});
  document.addEventListener("touchmove", e => { if (!dragging) return; const h=Math.max(120,Math.min(1200,startH+(e.touches[0].clientY-startY))); thread.style.minHeight=h+"px"; thread.style.maxHeight=h+"px"; }, {passive:true});
  document.addEventListener("touchend", () => { if (!dragging) return; dragging=false; localStorage.setItem(KEY,Math.round(thread.getBoundingClientRect().height)); });
}

// ─── Bindings ─────────────────────────────────────────────────────────────────

function bindModeCards() {
  qsa(".metric-card--mode").forEach(card => {
    card.addEventListener("click", () => { const m=card.getAttribute("data-mode"); if (!m) return; state.mode=m; saveState(); renderModeCards(); renderModeHelp(); });
  });
}

function bindSelectors() {
  qs("#singleModel")?.addEventListener("change", e => { state.singleModel=e.target.value; saveState(); });
  qs("#chatSearch")?.addEventListener("input", renderHistory);
  bindDropdownToggle("multiModelTrigger","multiModelDropdown");
  bindDropdownToggle("discussionTrigger","discussionDropdown");
}

function bindProjectTags() {
  qs("#projectTypeTags")?.addEventListener("click", e => {
    const btn=e.target.closest("[data-tag]"); if (!btn) return;
    state.selectedProjectType=btn.getAttribute("data-tag"); saveState(); hydrateFields();
  });
}

function bindTodoControls() {
  qs("#addTodoBtn")?.addEventListener("click", () => {
    const input=qs("#todoInput"), value=(input?.value||"").trim();
    if (!value) { showToast("Write a todo first","warn"); return; }
    state.todos.unshift({id:safeId("todo"),title:value,detail:"",done:false});
    if (input) input.value=""; saveState(); renderTodos();
  });
  qs("#todoInput")?.addEventListener("keydown", e => { if (e.key==="Enter") { e.preventDefault(); qs("#addTodoBtn")?.click(); } });
}

function bindChatButtons() {
  qs("#newChatBtn")?.addEventListener("click", async () => {
    try { setBusy(true,"Creating chat..."); const id=await createChatSession({title:"New chat"}); showToast("New chat created","good"); await loadThreadHistory(id); }
    catch { showToast("New chat failed","warn"); } finally { setBusy(false); }
  });
  qs("#branchChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) { showToast("No active chat to branch","warn"); return; }
    const c=getChatById(state.selectedChatId);
    const title=c?.title?`${c.title} (branch)`:"Branched chat";
    try { setBusy(true,"Branching..."); const id=await createChatSession({title,cloneFromPublicId:state.selectedChatId}); showToast("Branch created","good"); await loadThreadHistory(id); }
    catch { showToast("Branch failed","warn"); } finally { setBusy(false); }
  });
  qs("#pinChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) { showToast("No active chat","warn"); return; }
    const c=getChatById(state.selectedChatId); if (!c) { showToast("Chat not found","warn"); return; }
    const newPinned=!c.pinned;
    const res=await callApi(`/api/chat-sessions/${encodeURIComponent(state.selectedChatId)}`,"PATCH",{pinned:newPinned});
    if (!res.ok) { showToast("Pin failed","warn"); return; }
    c.pinned=newPinned;
    const rm=list=>list.filter(x=>x.id!==c.id);
    state.chats.pinned=rm(state.chats.pinned); state.chats.history=rm(state.chats.history);
    if (newPinned) state.chats.pinned.unshift(c); else state.chats.history.unshift(c);
    saveState(); renderHistory();
    showToast(newPinned?"Chat pinned":"Chat unpinned","good");
  });
}

function bindSendButton() {
  qs("#sendBtn")?.addEventListener("click", sendAndStream);
  qs("#composerInput")?.addEventListener("keydown", e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendAndStream(); } });
}

function bindExportButton() {
  qs("#exportBtn")?.addEventListener("click", async () => {
    const title=(qs("#exportTitle")?.value||"").trim();
    const note=(qs("#exportNote")?.value||"").trim();
    if (!title) { showToast("Add a project title first","warn"); return; }
    if (!state.selectedChatId) { showToast("No active chat session","warn"); return; }
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
}

// ─── Session management ───────────────────────────────────────────────────────

async function createChatSession({title, cloneFromPublicId=null}) {
  const res=await callApi("/api/chat-sessions","POST",{
    surface:"home", title, summary:"", mode:state.mode,
    selected_models:normalizeSelectedModels(), clone_from_public_id:cloneFromPublicId
  });
  if (!res.ok) throw new Error("Could not create chat session");
  const body=res.body||{};
  const publicId=body.public_id||body.session_public_id||body.id;
  if (!publicId) throw new Error("Missing session_public_id from backend");
  const chat=normalizeChatItem({...body, public_id:publicId, title:body.title||title});
  // New sessions always go to top
  state.chats.history=[chat,...state.chats.history.filter(c=>c.id!==chat.id)];
  state.selectedChatId=publicId; threadCache[publicId]=[]; saveState(); renderAll();
  return publicId;
}

async function refreshChatSessions() {
  const res=await callApi("/api/chat-sessions?surface=home","GET");
  if (!res.ok) { showToast("Could not load chat sessions","warn"); return false; }
  // Backend returns newest-first — push() preserves that order
  const items=Array.isArray(res.body?.items)?res.body.items.map(normalizeChatItem):[];
  state.chats={pinned:[],projectFolder:[],history:[]};
  items.forEach(mergeChatIntoCollections);
  if (!state.selectedChatId&&items[0]) state.selectedChatId=items[0].id;
  if (!items.length) {
    try { state.selectedChatId=await createChatSession({title:"Home chat"}); }
    catch { showToast("Could not create initial Home chat","warn"); saveState(); renderAll(); return false; }
  }
  saveState(); renderAll(); return true;
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrapHome() {
  setBusy(true,"Loading...");
  try {
    await refreshModelPool();
    const ok=await refreshChatSessions();
    if (ok&&state.selectedChatId) await loadThreadHistory(state.selectedChatId);
    state.bootstrapped=true; saveState();
  } catch(e) {
    console.error("Bootstrap error:",e); showToast("Load error — some features may be unavailable","warn");
  } finally {
    forceUnbusy(); renderAll();
  }
}

function init() {
  renderAll(); bindModeCards(); bindSelectors(); bindProjectTags(); bindTodoControls();
  bindChatButtons(); bindSendButton(); bindExportButton(); bindDropZone(); initDragResize();
  bootstrapHome();
}

document.addEventListener("DOMContentLoaded", init);
