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

const defaultState = {
  selectedChatId: "",
  mode: "single",
  singleModel: "",
  multiModelSet: "",
  discussionPreset: "",
  selectedProjectType: "App",
  chats: {
    pinned: [],
    projectFolder: [],
    history: []
  },
  threads: {},
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

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
      threads: typeof parsed?.threads === "object" && parsed.threads ? parsed.threads : base.threads,
      todos: Array.isArray(parsed?.todos) ? parsed.todos : base.todos,
      calendar: Array.isArray(parsed?.calendar) ? parsed.calendar : base.calendar,
      activeModels: Array.isArray(parsed?.activeModels) ? parsed.activeModels : base.activeModels,
      availableModels: Array.isArray(parsed?.availableModels) ? parsed.availableModels : base.availableModels
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

  const status = qs("#composerStatus");
  const sendBtn = qs("#sendBtn");
  const exportBtn = qs("#exportBtn");
  const newChatBtn = qs("#newChatBtn");
  const branchChatBtn = qs("#branchChatBtn");
  const addTodoBtn = qs("#addTodoBtn");

  const busyNow = activeRequestCount > 0;

  if (status) {
    status.textContent = busyNow ? (label || "Working...") : (MODE_STATUS[state.mode] || "Ready");
  }

  [sendBtn, exportBtn, newChatBtn, branchChatBtn, addTodoBtn].forEach((button) => {
    if (button) button.disabled = busyNow;
  });
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

async function callApi(path, method = "GET", payload = null) {
  try {
    const response = await fetch(`${PM_API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });

    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error)
    };
  }
}

function normalizeModelLabel(item) {
  return item.alias || item.name || item.title || item.model_public_id || item.id || "";
}

function extractActiveModels(modelResponse) {
  const items = Array.isArray(modelResponse?.items) ? modelResponse.items : [];
  return items
    .filter((item) => {
      const stateVal = String(item.runtime_state || item.state || "").toLowerCase();
      return stateVal === "loaded" || stateVal === "warm" || stateVal === "active";
    })
    .map(normalizeModelLabel)
    .filter(Boolean);
}

function extractAvailableModels(modelResponse) {
  const items = Array.isArray(modelResponse?.items) ? modelResponse.items : [];
  return items.map(normalizeModelLabel).filter(Boolean);
}

function normalizeSelectedModels() {
  if (state.mode === "single") {
    return [state.singleModel].filter(Boolean);
  }
  if (state.mode === "multi") {
    return String(state.multiModelSet || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return String(state.discussionPreset || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function getCurrentThread() {
  if (!state.selectedChatId) return [];
  if (!Array.isArray(state.threads[state.selectedChatId])) {
    state.threads[state.selectedChatId] = [];
  }
  return state.threads[state.selectedChatId];
}

function getChatById(chatId) {
  const all = [
    ...state.chats.pinned,
    ...state.chats.projectFolder,
    ...state.chats.history
  ];
  return all.find((item) => item.id === chatId) || null;
}

function mergeChatIntoCollections(chat) {
  const removeById = (list) => list.filter((item) => item.id !== chat.id);

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
  const all = [
    ...state.chats.pinned,
    ...state.chats.projectFolder,
    ...state.chats.history
  ];

  if (!all.length) return;

  if (!all.some((item) => item.id === state.selectedChatId)) {
    state.selectedChatId = all[0].id;
  }
}

function renderHistorySection(targetId, items, isFolder = false) {
  const root = qs(targetId);
  if (!root) return;

  const searchValue = (qs("#chatSearch")?.value || "").trim().toLowerCase();
  const filtered = items.filter((item) => !searchValue || item.title.toLowerCase().includes(searchValue));

  root.innerHTML = filtered.map((item) => {
    const activeClass = item.id === state.selectedChatId ? " history-link--active" : "";
    const folderClass = isFolder ? " history-link--folder" : "";

    return `
      <a class="history-link${activeClass}${folderClass}" href="#" data-chat-id="${escapeHtml(item.id)}">
        <span class="history-link__dot"></span>
        <span class="history-link__title">${escapeHtml(item.title)}</span>
      </a>
    `;
  }).join("");

  qsa(".history-link", root).forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      const chatId = link.getAttribute("data-chat-id");
      if (!chatId || chatId === state.selectedChatId) return;

      state.selectedChatId = chatId;
      saveState();
      renderAll();
      await refreshHomeSummary(chatId);
    });
  });
}

function renderHistory() {
  renderHistorySection("#pinnedChatsList", state.chats.pinned, false);
  renderHistorySection("#projectFolderList", state.chats.projectFolder, true);
  renderHistorySection("#chatHistoryList", state.chats.history, false);
}

function renderModeCards() {
  qsa(".metric-card--mode").forEach((card) => {
    const mode = card.getAttribute("data-mode");
    card.classList.toggle("is-active", mode === state.mode);
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

  if (!Array.isArray(state.activeModels) || !state.activeModels.length) {
    box.innerHTML = "<strong>Active models:</strong> none reported by PM backend.";
    return;
  }

  box.innerHTML = `
    <strong>Active models:</strong>
    <div class="chip-row chip-row--inside" style="margin-top:8px;">
      ${state.activeModels.map((model) => `<span class="chip">${escapeHtml(model)}</span>`).join("")}
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

function renderTodos() {
  const root = qs("#todoList");
  if (!root) return;

  root.innerHTML = state.todos.map((todo) => `
    <label class="todo-item">
      <input type="checkbox" data-todo-id="${escapeHtml(todo.id)}" ${todo.done ? "checked" : ""} />
      <div class="todo-item__body">
        <strong>${escapeHtml(todo.title)}</strong>
        <span>${escapeHtml(todo.detail || "")}</span>
      </div>
    </label>
  `).join("");

  qsa('input[type="checkbox"][data-todo-id]', root).forEach((input) => {
    input.addEventListener("change", () => {
      const todoId = input.getAttribute("data-todo-id");
      const todo = state.todos.find((item) => item.id === todoId);
      if (!todo) return;
      todo.done = input.checked;
      saveState();
    });
  });
}

function renderCalendar() {
  const root = qs("#calendarGrid");
  if (!root) return;

  root.innerHTML = state.calendar.map((day) => {
    const dayClass = day.today ? "calendar-day calendar-day--today" : "calendar-day";

    const itemsHtml = (day.items || []).map((item) => {
      let toneClass = "";
      if (item.tone === "good") toneClass = " calendar-entry--good";
      if (item.tone === "warn") toneClass = " calendar-entry--warn";

      let subLabel = "Planned";
      if (item.tone === "good") subLabel = "Focus block";
      if (item.tone === "warn") subLabel = "Attention";

      return `
        <div class="calendar-entry${toneClass}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(subLabel)}</span>
        </div>
      `;
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

function renderThread() {
  const root = qs("#chatThread");
  if (!root) return;

  const thread = getCurrentThread();

  if (!thread.length) {
    root.innerHTML = `
      <div class="chat-bubble chat-bubble--assistant">
        <div class="chat-bubble-head">Home daily driver</div>
        <p>Select an existing chat or create a new one to begin.</p>
      </div>
    `;
    return;
  }

  root.innerHTML = thread.map((message) => {
    const roleClass = message.role === "user"
      ? "chat-bubble chat-bubble--user"
      : "chat-bubble chat-bubble--assistant";

    const chipsHtml = Array.isArray(message.chips) && message.chips.length
      ? `
        <div class="chip-row chip-row--inside">
          ${message.chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      `
      : "";

    return `
      <div class="${roleClass}">
        <div class="chat-bubble-head">${escapeHtml(message.head || (message.role === "user" ? "User" : "Assistant"))}</div>
        ${chipsHtml}
        <p>${escapeHtml(message.text || "")}</p>
      </div>
    `;
  }).join("");

  root.scrollTop = root.scrollHeight;
}

function hydrateModelSelectors() {
  const singleModel = qs("#singleModel");
  const multiModelSet = qs("#multiModelSet");
  const discussionPreset = qs("#discussionPreset");
  const models = Array.isArray(state.availableModels) ? state.availableModels : [];

  if (singleModel) {
    singleModel.innerHTML = models.length
      ? models.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
      : `<option value="">No models available</option>`;

    if (state.singleModel && models.includes(state.singleModel)) {
      singleModel.value = state.singleModel;
    } else if (models[0]) {
      state.singleModel = models[0];
      singleModel.value = models[0];
    }
  }

  const presetOptions = [];
  if (models.length) {
    presetOptions.push(models.slice(0, 3).join(" | "));
    if (models.length >= 4) presetOptions.push(models.slice(1, 4).join(" | "));
    if (models.length >= 2) presetOptions.push(models.slice(0, 2).join(" | "));
  }
  const uniquePresets = [...new Set(presetOptions.filter(Boolean))];

  if (multiModelSet) {
    multiModelSet.innerHTML = uniquePresets.length
      ? uniquePresets.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
      : `<option value="">No model groups available</option>`;

    if (state.multiModelSet && uniquePresets.includes(state.multiModelSet)) {
      multiModelSet.value = state.multiModelSet;
    } else if (uniquePresets[0]) {
      state.multiModelSet = uniquePresets[0];
      multiModelSet.value = uniquePresets[0];
    }
  }

  const discussionOptions = [];
  if (models.length) {
    discussionOptions.push(models.slice(0, 4).join(" | "));
    discussionOptions.push(models.slice(0, 3).join(" | "));
    if (models.length >= 2) discussionOptions.push(models.slice(0, 2).join(" | "));
  }
  const uniqueDiscussion = [...new Set(discussionOptions.filter(Boolean))];

  if (discussionPreset) {
    discussionPreset.innerHTML = uniqueDiscussion.length
      ? uniqueDiscussion.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
      : `<option value="">No discussion groups available</option>`;

    if (state.discussionPreset && uniqueDiscussion.includes(state.discussionPreset)) {
      discussionPreset.value = state.discussionPreset;
    } else if (uniqueDiscussion[0]) {
      state.discussionPreset = uniqueDiscussion[0];
      discussionPreset.value = uniqueDiscussion[0];
    }
  }
}

function hydrateFields() {
  hydrateModelSelectors();

  qsa("#projectTypeTags .tag-button").forEach((button) => {
    const tag = button.getAttribute("data-tag");
    button.classList.toggle("tag-button--active", tag === state.selectedProjectType);
  });
}

function renderSelectedChatTitleIntoExport() {
  const exportTitle = qs("#exportTitle");
  if (!exportTitle) return;

  if (!exportTitle.value.trim()) {
    const current = getChatById(state.selectedChatId);
    if (current?.title) exportTitle.value = current.title;
  }
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

function bindModeCards() {
  qsa(".metric-card--mode").forEach((card) => {
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
  qs("#singleModel")?.addEventListener("change", (event) => {
    state.singleModel = event.target.value;
    saveState();
  });

  qs("#multiModelSet")?.addEventListener("change", (event) => {
    state.multiModelSet = event.target.value;
    saveState();
  });

  qs("#discussionPreset")?.addEventListener("change", (event) => {
    state.discussionPreset = event.target.value;
    saveState();
  });

  qs("#chatSearch")?.addEventListener("input", () => {
    renderHistory();
  });
}

function bindProjectTags() {
  const root = qs("#projectTypeTags");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tag]");
    if (!button) return;

    const tag = button.getAttribute("data-tag");
    if (!tag) return;

    state.selectedProjectType = tag;
    saveState();
    hydrateFields();
  });
}

function buildThreadFromSummary(summary) {
  const possibleMessages =
    summary?.messages ||
    summary?.thread ||
    summary?.chat?.messages ||
    summary?.session?.messages ||
    [];

  if (!Array.isArray(possibleMessages)) return null;

  return possibleMessages.map((message) => ({
    id: message.public_id || message.id || safeId("msg"),
    role: message.role || "assistant",
    head: message.head || message.sender || (message.role === "user" ? "User" : "Assistant"),
    text: message.text || message.content || message.message || "",
    chips: Array.isArray(message.chips) ? message.chips : []
  }));
}

function extractTodosFromSummary(summary) {
  const items =
    summary?.tasks ||
    summary?.todos ||
    summary?.home?.tasks ||
    [];

  if (!Array.isArray(items)) return null;

  return items.map((item) => ({
    id: item.public_id || item.id || safeId("todo"),
    title: item.title || "Untitled task",
    detail: item.note || item.detail || "",
    done: item.status === "done" || item.done === true
  }));
}

function applyHomeSummary(summary, sessionPublicId) {
  const thread = buildThreadFromSummary(summary);
  if (thread) state.threads[sessionPublicId] = thread;

  const todos = extractTodosFromSummary(summary);
  if (todos) state.todos = todos;

  if (summary?.session?.mode && ["single", "multi", "discussion"].includes(summary.session.mode)) {
    state.mode = summary.session.mode;
  }

  saveState();
}

async function refreshHomeSummary(sessionPublicId = state.selectedChatId) {
  if (!sessionPublicId) return;

  setBusy(true, "Loading chat...");
  const result = await callApi(`/api/home/summary?session_public_id=${encodeURIComponent(sessionPublicId)}`, "GET");
  setBusy(false);

  if (!result.ok) {
    showToast("Could not load Home summary", "warn");
    return;
  }

  applyHomeSummary(result.body, sessionPublicId);
  renderAll();
}

async function refreshModelPool() {
  const result = await callApi("/api/model-pool/models", "GET");

  if (!result.ok) {
    state.activeModels = [];
    state.availableModels = [];
    saveState();
    renderModeHelp();
    hydrateModelSelectors();
    return;
  }

  state.activeModels = extractActiveModels(result.body);
  state.availableModels = extractAvailableModels(result.body);

  if (!state.singleModel && state.availableModels[0]) {
    state.singleModel = state.availableModels[0];
  }
  if (!state.multiModelSet && state.availableModels[0]) {
    state.multiModelSet = state.availableModels.slice(0, 3).join(" | ") || state.availableModels[0];
  }
  if (!state.discussionPreset && state.availableModels[0]) {
    state.discussionPreset = state.availableModels.slice(0, 4).join(" | ") || state.availableModels[0];
  }

  saveState();
  hydrateModelSelectors();
  renderModeHelp();
}

async function createChatSession({ title, cloneFromPublicId = null }) {
  const payload = {
    surface: "home",
    title,
    summary: "",
    mode: state.mode,
    selected_models: normalizeSelectedModels(),
    clone_from_public_id: cloneFromPublicId
  };

  const result = await callApi("/api/chat-sessions", "POST", payload);
  if (!result.ok) {
    throw new Error("Could not create chat session");
  }

  const body = result.body || {};
  const publicId = body.public_id || body.session_public_id || body.id;
  if (!publicId) {
    throw new Error("Missing session_public_id from backend");
  }

  const chat = normalizeChatItem({
    ...body,
    public_id: publicId,
    title: body.title || title
  });

  mergeChatIntoCollections(chat);
  state.selectedChatId = publicId;
  if (!Array.isArray(state.threads[publicId])) {
    state.threads[publicId] = [];
  }

  saveState();
  renderAll();
  return publicId;
}

async function refreshChatSessions() {
  const result = await callApi("/api/chat-sessions?surface=home", "GET");
  if (!result.ok) {
    showToast("Could not load chat sessions", "warn");
    return false;
  }

  const items = Array.isArray(result.body?.items) ? result.body.items.map(normalizeChatItem) : [];

  state.chats = { pinned: [], projectFolder: [], history: [] };
  items.forEach(mergeChatIntoCollections);

  if (!state.selectedChatId && items[0]) {
    state.selectedChatId = items[0].id;
  }

  if (!items.length) {
    try {
      const publicId = await createChatSession({ title: "Home chat" });
      state.selectedChatId = publicId;
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

function bindTodoControls() {
  qs("#addTodoBtn")?.addEventListener("click", async () => {
    const input = qs("#todoInput");
    const value = (input?.value || "").trim();

    if (!value) {
      showToast("Write a todo first", "warn");
      return;
    }

    setBusy(true, "Creating task...");
    const result = await callApi("/api/home/tasks", "POST", {
      title: value,
      status: "open",
      note: "Added from Home thread"
    });
    setBusy(false);

    if (!result.ok) {
      showToast("Task create failed", "warn");
      return;
    }

    state.todos.unshift({
      id: result.body?.public_id || safeId("todo"),
      title: value,
      detail: "Added from Home thread",
      done: false
    });

    if (input) input.value = "";
    saveState();
    renderTodos();
    showToast("Task created", "good");
  });
}

function bindChatButtons() {
  qs("#newChatBtn")?.addEventListener("click", async () => {
    try {
      setBusy(true, "Creating chat...");
      const publicId = await createChatSession({ title: "New chat" });
      setBusy(false);
      showToast("New chat created", "good");
      await refreshHomeSummary(publicId);
      await refreshModelPool();
    } catch {
      setBusy(false);
      showToast("New chat failed", "warn");
    }
  });

  qs("#branchChatBtn")?.addEventListener("click", async () => {
    if (!state.selectedChatId) {
      showToast("No active chat to branch", "warn");
      return;
    }

    const current = getChatById(state.selectedChatId);
    const title = current?.title ? `${current.title} (branch)` : "Branched chat";

    try {
      setBusy(true, "Branching chat...");
      const publicId = await createChatSession({
        title,
        cloneFromPublicId: state.selectedChatId
      });
      setBusy(false);
      showToast("Branch created", "good");
      await refreshHomeSummary(publicId);
      await refreshModelPool();
    } catch {
      setBusy(false);
      showToast("Branch failed", "warn");
    }
  });

  qs("#pinChatBtn")?.addEventListener("click", () => {
    showToast("No pin/unpin backend route exists in main.py for Home sessions.", "warn");
  });
}

function appendLocalUserMessage(text) {
  const thread = getCurrentThread();
  thread.push({
    id: safeId("msg"),
    role: "user",
    head: "User",
    text
  });
}

function appendLocalAssistantMessage(text, chips = []) {
  const thread = getCurrentThread();
  thread.push({
    id: safeId("msg"),
    role: "assistant",
    head: "PM Home",
    text,
    chips
  });
}

async function sendCurrentMessage() {
  const input = qs("#composerInput");
  const text = (input?.value || "").trim();

  if (!text) {
    showToast("Write something first", "warn");
    return;
  }

  if (!state.selectedChatId) {
    showToast("No active chat session", "warn");
    return;
  }

  appendLocalUserMessage(text);
  saveState();
  renderThread();

  if (input) input.value = "";

  setBusy(true, "Sending message...");
  const result = await callApi(
    `/api/home/sessions/${encodeURIComponent(state.selectedChatId)}/messages`,
    "POST",
    {
      prompt: text,
      mode: state.mode,
      selected_models: normalizeSelectedModels()
    }
  );
  setBusy(false);

  if (!result.ok) {
    appendLocalAssistantMessage("Message failed to send to backend.", ["Backend error"]);
    saveState();
    renderThread();
    showToast("Send failed", "warn");
    return;
  }

  const body = result.body || {};
  applyHomeSummary(body, state.selectedChatId);

  const current = getChatById(state.selectedChatId);
  if (current && (!current.title || current.title === "New chat")) {
    current.title = text.slice(0, 48);
  }

  if (!buildThreadFromSummary(body)) {
    appendLocalAssistantMessage(
      body.reply || body.message || body.detail || "Backend responded, but no thread payload was returned.",
      normalizeSelectedModels()
    );
  }

  saveState();
  renderAll();
  await refreshModelPool();
  showToast("Message sent", "good");
}

function bindSendButton() {
  qs("#sendBtn")?.addEventListener("click", sendCurrentMessage);

  qs("#composerInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendCurrentMessage();
    }
  });
}

function bindExportButton() {
  qs("#exportBtn")?.addEventListener("click", async () => {
    const title = (qs("#exportTitle")?.value || "").trim();
    const note = (qs("#exportNote")?.value || "").trim();

    if (!title) {
      showToast("Add a project title first", "warn");
      return;
    }

    if (!state.selectedChatId) {
      showToast("No active chat session", "warn");
      return;
    }

    const payload = {
      title,
      production_type: PROJECT_TYPE_MAP[state.selectedProjectType] || "app",
      target_portal: "projects",
      quick_capture: note,
      session_public_id: state.selectedChatId,
      mode: state.mode
    };

    setBusy(true, "Exporting...");
    const result = await callApi("/api/home/exports", "POST", payload);
    setBusy(false);

    if (!result.ok) {
      showToast("Export failed", "warn");
      return;
    }

    showToast("Export created", "good");
  });
}

async function bootstrapHome() {
  setBusy(true, "Loading Home...");
  refreshModelPool(); // non-blocking — models populate in background
  const sessionsOk = await refreshChatSessions();

  if (sessionsOk && state.selectedChatId) {
    await refreshHomeSummary(state.selectedChatId);
  }

  state.bootstrapped = true;
  saveState();
  setBusy(false);
  renderAll();

  const calendarTitle = document.querySelector(".calendar-panel .section-title p");
  if (calendarTitle) {
    calendarTitle.textContent = "Calendar is local-only right now. No Home calendar backend route exists in main.py yet.";
  }
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
  bootstrapHome();
}

document.addEventListener("DOMContentLoaded", init);
