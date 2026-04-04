const PM_HOME_KEY = "PM_HOME_V6";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const MODE_HELP = {
  single: "<strong>Single:</strong> one selected model answers directly.",
  multi: "<strong>Multi:</strong> the same prompt is sent to all selected models and each responds separately.",
  discussion: "<strong>Discussion:</strong> selected specialists participate more like a group conversation when their expertise becomes relevant."
};

const MODE_STATUS = {
  single: "Single mode ready",
  multi: "Multi mode ready",
  discussion: "Discussion mode ready"
};

const PROJECT_TYPE_MAP = {
  App: "app",
  Web: "portal",
  Game: "game",
  Writing: "writing",
  Research: "research",
  System: "system"
};

const TOOL_ICONS = {
  web_search: "🔍",
  web_fetch: "🌐",
  web_crawl: "🕷️",
  run_python: "🐍",
  read_file: "📂",
  read_server_file: "🗄️",
  list_server_files: "📁",
  grep_files: "🔎",
  query_database: "🗃️",
  http_request: "📡",
  write_file: "✏️",
  shell_command: "💻",
  diff_text: "📊",
  summarise_large_file: "📄",
  image_analyse: "🖼️",
  call_model: "🤖",
};

const defaultState = {
  selectedChatId: "",
  mode: "single",
  singleModel: "",
  multiModels: [],
  discussionModels: [],
  selectedProjectType: "App",
  chats: { pinned: [], projectFolder: [], history: [] },
  todos: [],
  calendar: [
    { day: "Mon", date: "24", items: [{ title: "Portal layout review", tone: "default" }, { title: "Writing block", tone: "good" }] },
    { day: "Tue", date: "25", items: [{ title: "Admin / email", tone: "warn" }, { title: "Game planning", tone: "default" }] },
    { day: "Wed", date: "26", today: true, items: [{ title: "Home page lock-in", tone: "good" }, { title: "Projects next", tone: "default" }] },
    { day: "Thu", date: "27", items: [{ title: "Pipeline cleanup", tone: "default" }] },
    { day: "Fri", date: "28", items: [{ title: "Creative writing", tone: "default" }] },
    { day: "Sat", date: "29", items: [{ title: "Reset / planning", tone: "warn" }] },
    { day: "Sun", date: "30", items: [{ title: "Open creative block", tone: "good" }] }
  ],
  activeModels: [],
  availableModels: [],
  bootstrapped: false
};

let state = loadState();
let activeRequestCount = 0;
let threadCache = {};
let activeStream = null;

function qs(selector, root = document) { return root.querySelector(selector); }
function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function safeId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMarkdown(text) {
  if (!text) return "";
  let t = escapeHtml(text);
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

function loadState() {
  try {
    const raw = localStorage.getItem(PM_HOME_KEY);
    if (!raw) return clone(defaultState);
    const parsed = JSON.parse(raw);
    const base = clone(defaultState);
    return {
      ...base,
      ...parsed,
      chats: {
        pinned: Array.isArray(parsed?.chats?.pinned) ? parsed.chats.pinned : base.chats.pinned,
        projectFolder: Array.isArray(parsed?.chats?.projectFolder) ? parsed.chats.projectFolder : base.chats.projectFolder,
        history: Array.isArray(parsed?.chats?.history) ? parsed.chats.history : base.chats.history
      },
      todos: Array.isArray(parsed?.todos) ? parsed.todos : base.todos,
      calendar: Array.isArray(parsed?.calendar) ? parsed.calendar : base.calendar,
      activeModels: Array.isArray(parsed?.activeModels) ? parsed.activeModels : base.activeModels,
      availableModels: Array.isArray(parsed?.availableModels) ? parsed.availableModels : base.availableModels,
      multiModels: Array.isArray(parsed?.multiModels) ? parsed.multiModels : base.multiModels,
      discussionModels: Array.isArray(parsed?.discussionModels) ? parsed.discussionModels : base.discussionModels
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(PM_HOME_KEY, JSON.stringify(state));
}

function setBusy(isBusy, label = "") {
  activeRequestCount += isBusy ? 1 : -1;
  if (activeRequestCount < 0) activeRequestCount = 0;
  const busyNow = activeRequestCount > 0;
  const status = qs("#composerStatus");
  if (status) status.textContent = busyNow ? (label || "Working...") : (MODE_STATUS[state.mode] || "Ready");
  [qs("#sendBtn"), qs("#exportBtn"), qs("#newChatBtn"), qs("#branchChatBtn"), qs("#addTodoBtn")].forEach(b => {
    if (b) b.disabled = busyNow;
  });
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function callApi(path, method = "GET", payload = null) {
  try {
    const response = await fetch(`${PM_API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ─── File upload ──────────────────────────────────────────────────────────────

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await fetch(`${PM_API_BASE}/api/home/upload`, {
      method: "POST",
      body: formData
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(String(error));
  }
}

function renderUploadPill(filename, pillState = "uploading") {
  const pill = qs("#uploadPill");
  if (!pill) return;
  const icons = { uploading: "⏳", done: "📎", error: "❌" };
  pill.innerHTML = `<span>${icons[pillState] || "📎"} ${escapeHtml(filename)}</span>${pillState !== "uploading" ? '<button id="uploadPillClose" type="button">✕</button>' : ""}`;
  pill.style.display = "flex";
  qs("#uploadPillClose")?.addEventListener("click", clearUploadPill);
}

function clearUploadPill() {
  const pill = qs("#uploadPill");
  if (pill) { pill.style.display = "none"; pill.innerHTML = ""; }
}

function setDropZoneActive(active) {
  const composer = qs("#composerArea");
  if (composer) composer.classList.toggle("drop-active", active);
}

async function handleFileUpload(file) {
  if (!file) return;
  if (!state.selectedChatId) {
    try { await createChatSession({ title: file.name }); }
    catch { showToast("No active chat — create one first", "warn"); return; }
  }
  renderUploadPill(file.name, "uploading");
  setBusy(true, `Uploading ${file.name}…`);
  let result;
  try {
    result = await uploadFile(file);
  } catch {
    setBusy(false);
    renderUploadPill(file.name, "error");
    showToast("Upload failed", "warn");
    return;
  }
  setBusy(false);
  renderUploadPill(file.name, "done");
  showToast(`Uploaded: ${file.name}`, "good");
  const prompt = result.analysis_prompt || `File '${file.name}' uploaded. Please analyse it.`;
  const input = qs("#composerInput");
  if (input) input.value = prompt;
  await sendAndStream();
  clearUploadPill();
}

function bindDropZone() {
  const composer = qs("#composerArea");
  const fileInput = qs("#fileUploadInput");
  const uploadBtn = qs("#uploadBtn");
  if (!composer) return;
  composer.addEventListener("dragenter", e => { e.preventDefault(); setDropZoneActive(true); });
  composer.addEventListener("dragover",  e => { e.preventDefault(); setDropZoneActive(true); });
  composer.addEventListener("dragleave", e => {
    if (!composer.contains(e.relatedTarget)) setDropZoneActive(false);
  });
  composer.addEventListener("drop", e => {
    e.preventDefault();
    setDropZoneActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  });
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleFileUpload(file);
      fileInput.value = "";
    });
  }
}

// ─── Model pool ───────────────────────────────────────────────────────────────

function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

function extractModels(modelResponse) {
  const items = Array.isArray(modelResponse?.items) ? modelResponse.items : [];
  return items
    .filter(item => item?.enabled !== false)
    .filter(item => item?.runtime_driver === "openai_api")
    .filter(item => parseSurfaces(item?.surface_allowlist).includes("home"))
    .map(item => ({
      value: String(item?.alias || item?.name || "").trim(),
      label: String(item?.name || item?.alias || "").trim(),
      active: String(item?.runtime_state || "").toLowerCase() === "available"
        || String(item?.runtime_state || "").toLowerCase() === "loaded",
    }))
    .filter(m => m.value);
}

async function refreshModelPool() {
  const result = await callApi("/api/model-pool/models?sync=false", "GET");
  if (!result.ok) {
    state.activeModels = [];
    state.availableModels = [];
    saveState();
    renderModeHelp();
    hydrateModelSelectors();
    return;
  }
  const models = extractModels(result.body);
  state.availableModels = models;
  state.activeModels = models.filter(m => m.active);

  const all = state.availableModels;
  if (!state.singleModel && all[0]) state.singleModel = all[0].value;
  if (!state.multiModels.length && all.length) state.multiModels = all.slice(0, 3).map(m => m.value);
  if (!state.discussionModels.length && all.length) state.discussionModels = all.slice(0, 4).map(m => m.value);

  saveState();
  hydrateModelSelectors();
  renderModeHelp();
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function buildMultiSelectDropdown(dropdownEl, models, selectedValues, onChange) {
  dropdownEl.innerHTML = "";
  if (!models.length) {
    const empty = document.createElement("div");
    empty.className = "multi-select-empty";
    empty.textContent = "No models available";
    dropdownEl.appendChild(empty);
    return;
  }
  models.forEach(model => {
    const row = document.createElement("div");
    row.className = "multi-select-option";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `ms_${dropdownEl.id}_${model.value}`;
    cb.value = model.value;
    cb.checked = selectedValues.includes(model.value);
    const lbl = document.createElement("label");
    lbl.htmlFor = cb.id;
    lbl.textContent = model.label;
    cb.addEventListener("change", () => {
      const checked = qsa('input[type="checkbox"]', dropdownEl).filter(el => el.checked).map(el => el.value);
      onChange(checked);
    });
    row.appendChild(cb);
    row.appendChild(lbl);
    dropdownEl.appendChild(row);
  });
}

function updateTriggerLabel(triggerEl, selectedValues, placeholder = "Select models...") {
  triggerEl.textContent = selectedValues.length ? selectedValues.join(", ") : placeholder;
  triggerEl.title = selectedValues.length ? selectedValues.join("\n") : placeholder;
}

function bindDropdownToggle(triggerId, dropdownId) {
  const trigger = qs(`#${triggerId}`);
  const dropdown = qs(`#${dropdownId}`);
  if (!trigger || !dropdown) return;
  trigger.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("is-open");
  });
  document.addEventListener("click", e => {
    if (!dropdown.contains(e.target) && e.target !== trigger) {
      dropdown.classList.remove("is-open");
    }
  });
}

function hydrateModelSelectors() {
  const allModels = Array.isArray(state.availableModels) ? state.availableModels : [];

  const singleEl = qs("#singleModel");
  if (singleEl) {
    singleEl.innerHTML = allModels.length
      ? allModels.map(m => `<option value="${escapeHtml(m.value)}">${escapeHtml(m.label)}</option>`).join("")
      : `<option value="">No models available</option>`;
    if (state.singleModel && allModels.some(m => m.value === state.singleModel)) {
      singleEl.value = state.singleModel;
    } else if (allModels[0]) {
      state.singleModel = allModels[0].value;
      singleEl.value = allModels[0].value;
    }
  }

  const multiDropdown = qs("#multiModelDropdown");
  const multiTrigger = qs("#multiModelTrigger");
  if (multiDropdown && multiTrigger) {
    buildMultiSelectDropdown(multiDropdown, allModels, state.multiModels, checked => {
      state.multiModels = checked;
      saveState();
      updateTriggerLabel(multiTrigger, checked, "Select models...");
    });
    updateTriggerLabel(multiTrigger, state.multiModels, "Select models...");
  }

  const discussionDropdown = qs("#discussionDropdown");
  const discussionTrigger = qs("#discussionTrigger");
  if (discussionDropdown && discussionTrigger) {
    buildMultiSelectDropdown(discussionDropdown, allModels, state.discussionModels, checked => {
      state.discussionModels = checked;
      saveState();
      updateTriggerLabel(discussionTrigger, checked, "Select specialists...");
    });
    updateTriggerLabel(discussionTrigger, state.discussionModels, "Select specialists...");
  }
}

function normalizeSelectedModels() {
  if (state.mode === "single") return [state.singleModel].filter(Boolean);
  if (state.mode === "multi") return Array.isArray(state.multiModels) ? state.multiModels.filter(Boolean) : [];
  return Array.isArray(state.discussionModels) ? state.discussionModels.filter(Boolean) : [];
}

// ─── Chat session helpers ─────────────────────────────────────────────────────

function normalizeChatItem(item) {
  return {
    id: item.public_id || item.session_public_id || item.id || safeId("chat"),
    title: item.title || item.summary || "Untitled chat",
    summary: item.summary || "",
    mode: item.mode || "single",
    pinned: Boolean(item.pinned),
    folder: item.folder || item.bucket || ""
  };
}

function getChatById(chatId) {
  return [...state.chats.pinned, ...state.chats.projectFolder, ...state.chats.history]
    .find(item => item.id === chatId) || null;
}

function mergeChatIntoCollections(chat) {
  const removeById = list => list.filter(item => item.id !== chat.id);
  state.chats.pinned = removeById(state.chats.pinned);
  state.chats.projectFolder = removeById(state.chats.projectFolder);
  state.chats.history = removeById(state.chats.history);
  if (chat.pinned) {
    state.chats.pinned.unshift(chat);
  } else if (chat.folder === "project" || chat.folder === "projects") {
    state.chats.projectFolder.unshift(chat);
  } else {
    state.chats.history.unshift(chat);
  }
}

function ensureSelectedChatExists() {
  const all = [...state.chats.pinned, ...state.chats.projectFolder, ...state.chats.history];
  if (!all.length) return;
  if (!all.some(item => item.id === state.selectedChatId)) {
    state.selectedChatId = all[0].id;
  }
}

// ─── Thread ───────────────────────────────────────────────────────────────────

async function loadThreadHistory(sessionPublicId) {
  if (!sessionPublicId) return;
  const result = await callApi(`/api/home/sessions/${encodeURIComponent(sessionPublicId)}/live-chat/history`, "GET");
  if (!result.ok) return;
  const messages = Array.isArray(result.body?.messages) ? result.body.messages : [];
  threadCache[sessionPublicId] = messages.map(msg => ({
    id: msg.message_public_id || safeId("msg"),
    role: msg.role || "assistant",
    head: msg.role === "user" ? "User" : (msg.selected_worker_name || msg.selected_model || "Assistant"),
    text: msg.content || "",
    mode: msg.mode || "single",
    model: msg.selected_model || msg.selected_worker_name || ""
  }));
  renderThread();
}

function getCurrentThread() {
  return threadCache[state.selectedChatId] || [];
}

// ─── Streaming ────────────────────────────────────────────────────────────────

function createStreamingBubble(modelName) {
  const root = qs("#chatThread");
  if (!root) return null;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-bubble--assistant chat-bubble--streaming";
  bubble.id = "streamingBubble";
  bubble.innerHTML = `
    <div class="chat-bubble-head stream-head" id="streamHead">
      <span class="stream-head-name">${escapeHtml(modelName || "Assistant")}</span>
      <span class="stream-thinking-dot"></span>
    </div>
    <div class="stream-tools" id="streamTools"></div>
    <div class="stream-body" id="streamBody"></div>
  `;
  root.appendChild(bubble);
  root.scrollTop = root.scrollHeight;
  return bubble;
}

function setStreamStatus(text) {
  const head = qs("#streamHead");
  if (!head) return;
  let status = head.querySelector(".stream-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "stream-status";
    head.appendChild(status);
  }
  status.textContent = text ? ` · ${text}` : "";
}

function appendToolCall(name, args) {
  const tools = qs("#streamTools");
  if (!tools) return;
  const icon = TOOL_ICONS[name] || "🔧";
  const argsStr = args && typeof args === "object"
    ? Object.entries(args).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(", ")
    : "";
  const line = document.createElement("div");
  line.className = "stream-tool-call";
  line.dataset.toolName = name;
  line.innerHTML = `<span class="stream-tool-icon">${icon}</span><span class="stream-tool-name">${escapeHtml(name)}</span>${argsStr ? `<span class="stream-tool-args">${escapeHtml(argsStr)}</span>` : ""}<span class="stream-tool-state">…</span>`;
  tools.appendChild(line);
  qs("#chatThread").scrollTop = qs("#chatThread").scrollHeight;
}

function markToolDone(name, summary) {
  const tools = qs("#streamTools");
  if (!tools) return;
  const lines = qsa(".stream-tool-call", tools);
  const last = [...lines].reverse().find(l => l.dataset.toolName === name);
  if (last) {
    last.classList.add("stream-tool-call--done");
    const stateEl = last.querySelector(".stream-tool-state");
    if (stateEl) stateEl.textContent = summary ? ` ✓ ${summary}` : " ✓";
  }
}

function appendStreamChunk(text) {
  const streamBody = qs("#streamBody");
  if (!streamBody) return;
  if (!streamBody._raw) streamBody._raw = "";
  streamBody._raw += text;
  streamBody.textContent = streamBody._raw;
  qs("#chatThread").scrollTop = qs("#chatThread").scrollHeight;
}

function finalizeStreamingBubble(fullContent, modelName) {
  const bubble = qs("#streamingBubble");
  if (!bubble) return;
  bubble.classList.remove("chat-bubble--streaming");
  bubble.id = "";

  // Replace head — clean up thinking dot and status
  const head = qs(".stream-head", bubble);
  if (head) {
    head.className = "chat-bubble-head";
    head.innerHTML = escapeHtml(modelName || "Assistant");
  }

  // Replace stream-body with fully rendered markdown
  const streamBody = qs("#streamBody", bubble);
  if (streamBody) {
    streamBody.id = "";
    streamBody._raw = undefined;
    streamBody.innerHTML = renderMarkdown(fullContent || "");
  }

  qs("#chatThread").scrollTop = qs("#chatThread").scrollHeight;
}

async function sendAndStream() {
  const input = qs("#composerInput");
  const text = (input?.value || "").trim();
  if (!text) { showToast("Write something first", "warn"); return; }
  if (!state.selectedChatId) { showToast("No active chat session", "warn"); return; }
  const selectedModels = normalizeSelectedModels();
  if (!selectedModels.length) { showToast("No models selected", "warn"); return; }

  if (activeStream) { activeStream.close(); activeStream = null; }

  if (!threadCache[state.selectedChatId]) threadCache[state.selectedChatId] = [];
  threadCache[state.selectedChatId].push({ id: safeId("msg"), role: "user", head: "User", text });
  renderThread();
  if (input) input.value = "";

  setBusy(true, "Thinking…");

  const modelName = selectedModels[0] || "Assistant";
  createStreamingBubble(modelName);

  const params = new URLSearchParams({
    prompt: text,
    mode: state.mode,
    models: selectedModels.join(","),
  });
  const url = `${PM_API_BASE}/api/home/sessions/${encodeURIComponent(state.selectedChatId)}/stream?${params}`;

  let fullContent = "";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
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
            setBusy(true, `${TOOL_ICONS[event.name] || "🔧"} ${event.name}…`);
          } else if (event.type === "tool_result") {
            markToolDone(event.name, event.summary);
            setStreamStatus("Generating…");
            setBusy(true, "Generating…");
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
    finalizeStreamingBubble(`Error: ${err.message}`, modelName);
    setBusy(false);
    showToast("Stream failed", "warn");
    return;
  }

  finalizeStreamingBubble(fullContent, modelName);
  setBusy(false);

  threadCache[state.selectedChatId].push({
    id: safeId("msg"), role: "assistant",
    head: modelName, text: fullContent, model: modelName
  });

  const current = getChatById(state.selectedChatId);
  if (current && (!current.title || current.title === "New chat")) {
    current.title = text.slice(0, 48);
    saveState();
    renderHistory();
  }

  await refreshModelPool();
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderHistorySection(targetId, items, isFolder = false) {
  const root = qs(targetId);
  if (!root) return;
  const searchValue = (qs("#chatSearch")?.value || "").trim().toLowerCase();
  const filtered = items.filter(item => !searchValue || item.title.toLowerCase().includes(searchValue));
  root.innerHTML = filtered.map(item => {
    const activeClass = item.id === state.selectedChatId ? " history-link--active" : "";
    const folderClass = isFolder ? " history-link--folder" : "";
    return `
      <a class="history-link${activeClass}${folderClass}" href="#" data-chat-id="${escapeHtml(item.id)}">
        <span class="history-link__dot"></span>
        <span class="history-link__title">${escapeHtml(item.title)}</span>
      </a>
    `;
  }).join("");
  qsa(".history-link", root).forEach(link => {
    link.addEventListener("click", async e => {
      e.preventDefault();
      const chatId = link.getAttribute("data-chat-id");
      if (!chatId || chatId === state.selectedChatId) return;
      state.selectedChatId = chatId;
      saveState();
      renderHistory();
      renderThread();
      await loadThreadHistory(chatId);
    });
  });
}

function renderHistory() {
  renderHistorySection("#pinnedChatsList", state.chats.pinned, false);
  renderHistorySection("#projectFolderList", state.chats.projectFolder, true);
  renderHistorySection("#chatHistoryList", state.chats.history, false);
}

function renderModeCards() {
  qsa(".metric-card--mode").forEach(card => {
    card.classList.toggle("is-active", card.getAttribute("data-mode") === state.mode);
  });
}

function renderActiveModels() {
  const controlsCard = qs(".home-controls-card");
  if (!controlsCard) return;
  let box = qs("#activeModelsBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "activeModelsBox";
    box.className = "mode-help";
    box.style.marginTop = "12px";
    controlsCard.appendChild(box);
  }
  const active = Array.isArray(state.activeModels) ? state.activeModels : [];
  if (!active.length) {
    box.innerHTML = "<strong>Active models:</strong> none reported by PM backend.";
    return;
  }
  box.innerHTML = `
    <strong>Active models (${active.length}):</strong>
    <div class="chip-row chip-row--inside" style="margin-top:8px;">
      ${active.map(m => `<span class="chip">${escapeHtml(typeof m === "string" ? m : m.label || m.value || "")}</span>`).join("")}
    </div>
  `;
}

function renderModeHelp() {
  const help = qs("#modeHelpText");
  const composerStatus = qs("#composerStatus");
  if (help) help.innerHTML = MODE_HELP[state.mode] || MODE_HELP.single;
  if (composerStatus && activeRequestCount === 0) {
    composerStatus.textContent = MODE_STATUS[state.mode] || MODE_STATUS.single;
  }
  renderActiveModels();
}

function renderThread() {
  const root = qs("#chatThread");
  if (!root) return;
  const thread = getCurrentThread();
  if (!thread.length) {
    root.innerHTML = `
      <div class="chat-bubble chat-bubble--assistant">
        <div class="chat-bubble-head">Home daily driver</div>
        <p>Select an existing chat or create a new one to begin.</p>
        <p style="color:var(--muted,#7da8d0);font-size:13px;margin-top:8px;">💡 Drag a file onto the composer below to upload and analyse it.</p>
      </div>
    `;
    return;
  }
  root.innerHTML = thread.map(message => {
    const roleClass = message.role === "user" ? "chat-bubble chat-bubble--user" : "chat-bubble chat-bubble--assistant";
    const headLabel = message.role === "user" ? "User" : (message.head || message.model || "Assistant");
    const bodyHtml = message.role === "user" ? `<p>${escapeHtml(message.text)}</p>` : renderMarkdown(message.text);
    return `<div class="${roleClass}"><div class="chat-bubble-head">${escapeHtml(headLabel)}</div>${bodyHtml}</div>`;
  }).join("");
  root.scrollTop = root.scrollHeight;
}

function renderTodos() {
  const root = qs("#todoList");
  if (!root) return;
  root.innerHTML = state.todos.map(todo => `
    <div class="todo-item">
      <label style="display:flex;align-items:flex-start;gap:8px;flex:1;cursor:pointer;">
        <input type="checkbox" data-todo-id="${escapeHtml(todo.id)}" ${todo.done ? "checked" : ""} style="margin-top:3px;" />
        <div class="todo-item__body">
          <strong>${escapeHtml(todo.title)}</strong>
          ${todo.detail ? `<span>${escapeHtml(todo.detail)}</span>` : ""}
        </div>
      </label>
      <button class="button" data-remove-todo="${escapeHtml(todo.id)}" type="button" style="padding:2px 8px;font-size:0.75rem;flex-shrink:0;">✕</button>
    </div>
  `).join("");
  qsa('input[type="checkbox"][data-todo-id]', root).forEach(input => {
    input.addEventListener("change", () => {
      const todo = state.todos.find(t => t.id === input.getAttribute("data-todo-id"));
      if (!todo) return;
      todo.done = input.checked;
      saveState();
    });
  });
  qsa("[data-remove-todo]", root).forEach(btn => {
    btn.addEventListener("click", () => {
      state.todos = state.todos.filter(t => t.id !== btn.getAttribute("data-remove-todo"));
      saveState();
      renderTodos();
    });
  });
}

function renderCalendar() {
  const root = qs("#calendarGrid");
  if (!root) return;
  root.innerHTML = state.calendar.map(day => {
    const dayClass = day.today ? "calendar-day calendar-day--today" : "calendar-day";
    const itemsHtml = (day.items || []).map(item => {
      let toneClass = "";
      if (item.tone === "good") toneClass = " calendar-entry--good";
      if (item.tone === "warn") toneClass = " calendar-entry--warn";
      const subLabel = item.tone === "good" ? "Focus block" : item.tone === "warn" ? "Attention" : "Planned";
      return `<div class="calendar-entry${toneClass}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(subLabel)}</span></div>`;
    }).join("");
    return `
      <article class="${dayClass}">
        <div class="calendar-day__head">
          <strong>${escapeHtml(day.day)}</strong>
          <span class="soft">${escapeHtml(day.date)}</span>
        </div>
        ${itemsHtml}
      </article>
    `;
  }).join("");
}

function hydrateFields() {
  hydrateModelSelectors();
  qsa("#projectTypeTags .tag-button").forEach(button => {
    button.classList.toggle("tag-button--active", button.getAttribute("data-tag") === state.selectedProjectType);
  });
}

function renderSelectedChatTitleIntoExport() {
  const exportTitle = qs("#exportTitle");
  if (!exportTitle || exportTitle.value.trim()) return;
  const current = getChatById(state.selectedChatId);
  if (current?.title) exportTitle.value = current.title;
}

function renderAll() {
  ensureSelectedChatExists();
  hydrateFields();
  renderHistory();
  renderModeCards();
  renderModeHelp();
  renderTodos();
  renderCalendar();
  renderThread();
  renderSelectedChatTitleIntoExport();
}

// ─── Drag resize ─────────────────────────────────────────────────────────────

function initDragResize() {
  const handle = qs("#chatResizeHandle");
  const thread = qs("#chatThread");
  if (!handle || !thread) return;
  const KEY = "home_chat_height";
  const saved = parseInt(localStorage.getItem(KEY));
  if (saved > 80 && saved < 1200) {
    thread.style.minHeight = saved + "px";
    thread.style.maxHeight = saved + "px";
  }
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener("mousedown", e => {
    dragging = true;
    startY = e.clientY;
    startH = thread.getBoundingClientRect().height;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const h = Math.max(120, Math.min(1200, startH + (e.clientY - startY)));
    thread.style.minHeight = h + "px";
    thread.style.maxHeight = h + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem(KEY, Math.round(thread.getBoundingClientRect().height));
  });
  handle.addEventListener("touchstart", e => {
    dragging = true;
    startY = e.touches[0].clientY;
    startH = thread.getBoundingClientRect().height;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener("touchmove", e => {
    if (!dragging) return;
    const h = Math.max(120, Math.min(1200, startH + (e.touches[0].clientY - startY)));
    thread.style.minHeight = h + "px";
    thread.style.maxHeight = h + "px";
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    localStorage.setItem(KEY, Math.round(thread.getBoundingClientRect().height));
  });
}

// ─── Bindings ─────────────────────────────────────────────────────────────────

function bindModeCards() {
  qsa(".metric-card--mode").forEach(card => {
    card.addEventListener("click", () => {
      const mode = card.getAttribute("data-mode");
      if (!mode) return;
      state.mode = mode;
      saveState();
      renderModeCards();
      renderModeHelp();
    });
  });
}

function bindSelectors() {
  qs("#singleModel")?.addEventListener("change", e => { state.singleModel = e.target.value; saveState(); });
  qs("#chatSearch")?.addEventListener("input", renderHistory);
  bindDropdownToggle("multiModelTrigger", "multiModelDropdown");
  bindDropdownToggle("discussionTrigger", "discussionDropdown");
}

function bindProjectTags() {
  qs("#projectTypeTags")?.addEventListener("click", e => {
    const button = e.target.closest("[data-tag]");
    if (!button) return;
    state.selectedProjectType = button.getAttribute("data-tag");
    saveState();
    hydrateFields();
  });
}

function bindTodoControls() {
  qs("#addTodoBtn")?.addEventListener("click", () => {
    const input = qs("#todoInput");
    const value = (input?.value || "").trim();
    if (!value) { showToast("Write a todo first", "warn"); return; }
    state.todos.unshift({ id: safeId("todo"), title: value, detail: "", done: false });
    if (input) input.value = "";
    saveState();
    renderTodos();
  });
  qs("#todoInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); qs("#addTodoBtn")?.click(); }
  });
}

function bindChatButtons() {
  qs("#newChatBtn")?.addEventListener("click", async () => {
    try {
      setBusy(true, "Creating chat...");
      const publicId = await createChatSession({ title: "New chat" });
      setBusy(false);
      showToast("New chat created", "good");
      await loadThreadHistory(publicId);
    } catch { setBusy(false); showToast("New chat failed", "warn"); }
  });

  qs("#branchChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) { showToast("No active chat to branch", "warn"); return; }
    const current = getChatById(state.selectedChatId);
    const title = current?.title ? `${current.title} (branch)` : "Branched chat";
    try {
      setBusy(true, "Branching chat...");
      const publicId = await createChatSession({ title, cloneFromPublicId: state.selectedChatId });
      setBusy(false);
      showToast("Branch created", "good");
      await loadThreadHistory(publicId);
    } catch { setBusy(false); showToast("Branch failed", "warn"); }
  });

  qs("#pinChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) { showToast("No active chat", "warn"); return; }
    const current = getChatById(state.selectedChatId);
    if (!current) { showToast("Chat not found", "warn"); return; }
    const newPinned = !current.pinned;
    const result = await callApi(`/api/chat-sessions/${encodeURIComponent(state.selectedChatId)}`, "PATCH", { pinned: newPinned });
    if (!result.ok) { showToast("Pin failed", "warn"); return; }
    current.pinned = newPinned;
    mergeChatIntoCollections(current);
    saveState();
    renderHistory();
    showToast(newPinned ? "Chat pinned" : "Chat unpinned", "good");
  });
}

function bindSendButton() {
  qs("#sendBtn")?.addEventListener("click", sendAndStream);
  qs("#composerInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAndStream(); }
  });
}

function bindExportButton() {
  qs("#exportBtn")?.addEventListener("click", async () => {
    const title = (qs("#exportTitle")?.value || "").trim();
    const note = (qs("#exportNote")?.value || "").trim();
    if (!title) { showToast("Add a project title first", "warn"); return; }
    if (!state.selectedChatId) { showToast("No active chat session", "warn"); return; }
    setBusy(true, "Exporting...");
    const result = await callApi("/api/home/exports", "POST", {
      title,
      production_type: PROJECT_TYPE_MAP[state.selectedProjectType] || "app",
      target_portal: "projects",
      quick_capture: note,
      session_public_id: state.selectedChatId,
      mode: state.mode
    });
    setBusy(false);
    if (!result.ok) { showToast("Export failed", "warn"); return; }
    showToast("Export created", "good");
  });
}

// ─── Session management ───────────────────────────────────────────────────────

async function createChatSession({ title, cloneFromPublicId = null }) {
  const result = await callApi("/api/chat-sessions", "POST", {
    surface: "home",
    title,
    summary: "",
    mode: state.mode,
    selected_models: normalizeSelectedModels(),
    clone_from_public_id: cloneFromPublicId
  });
  if (!result.ok) throw new Error("Could not create chat session");
  const body = result.body || {};
  const publicId = body.public_id || body.session_public_id || body.id;
  if (!publicId) throw new Error("Missing session_public_id from backend");
  const chat = normalizeChatItem({ ...body, public_id: publicId, title: body.title || title });
  mergeChatIntoCollections(chat);
  state.selectedChatId = publicId;
  threadCache[publicId] = [];
  saveState();
  renderAll();
  return publicId;
}

async function refreshChatSessions() {
  const result = await callApi("/api/chat-sessions?surface=home", "GET");
  if (!result.ok) { showToast("Could not load chat sessions", "warn"); return false; }
  const items = Array.isArray(result.body?.items) ? result.body.items.map(normalizeChatItem) : [];
  state.chats = { pinned: [], projectFolder: [], history: [] };
  items.forEach(mergeChatIntoCollections);
  if (!state.selectedChatId && items[0]) state.selectedChatId = items[0].id;
  if (!items.length) {
    try {
      state.selectedChatId = await createChatSession({ title: "Home chat" });
    } catch {
      showToast("Could not create initial Home chat", "warn");
      saveState();
      renderAll();
      return false;
    }
  }
  saveState();
  renderAll();
  return true;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrapHome() {
  setBusy(true, "Loading...");
  refreshModelPool();
  const sessionsOk = await refreshChatSessions();
  if (sessionsOk && state.selectedChatId) {
    await loadThreadHistory(state.selectedChatId);
  }
  state.bootstrapped = true;
  saveState();
  setBusy(false);
  renderAll();
}

function init() {
  renderAll();
  bindModeCards();
  bindSelectors();
  bindProjectTags();
  bindTodoControls();
  bindChatButtons();
  bindSendButton();
  bindExportButton();
  bindDropZone();
  initDragResize();
  bootstrapHome();
}

document.addEventListener("DOMContentLoaded", init);
