const PM_HOME_KEY = "PM_HOME_V2";
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

const defaultState = {
  selectedChatId: "chat_seed_001",
  mode: "single",
  singleModel: "Jeff main / GPT-style assistant",
  multiModelSet: "Gameplay + Engine + Coder",
  discussionPreset: "Game design discussion",
  selectedProjectType: "App",
  chats: {
    pinned: [
      { id: "chat_seed_001", title: "Frontend Backend Handoff" },
      { id: "chat_seed_002", title: "AI-assistent portal design" }
    ],
    projectFolder: [
      { id: "chat_seed_003", title: "Game designer workflow" },
      { id: "chat_seed_004", title: "Web portal redesign" },
      { id: "chat_seed_005", title: "AI message filtering system" }
    ],
    history: [
      { id: "chat_seed_006", title: "ChatGPT Handoff Request" },
      { id: "chat_seed_007", title: "Pipeline test setup" },
      { id: "chat_seed_008", title: "Webpage Redesign Workflow" },
      { id: "chat_seed_009", title: "Pipeline Fleet Provisioning" },
      { id: "chat_seed_010", title: "Vurdere sponsing av prosjekt" },
      { id: "chat_seed_011", title: "Operativ overlevering PM" },
      { id: "chat_seed_012", title: "Home Page Redesign" },
      { id: "chat_seed_013", title: "Programmer for Windows" },
      { id: "chat_seed_014", title: "PM Backend Session" }
    ]
  },
  threads: {
    chat_seed_001: [
      {
        id: "m_seed_a1",
        role: "assistant",
        head: "Home daily driver",
        text: "This is the main chat area. Use it for daily work, ideation, planning, and long-running unfinished threads before export."
      },
      {
        id: "m_seed_u1",
        role: "user",
        head: "User",
        text: "I want to design a tower defense game with strong lane identity, meaningful upgrades, and clean long-term progression."
      },
      {
        id: "m_seed_a2",
        role: "assistant",
        head: "Discussion participants",
        chips: [
          "Gameplay specialist",
          "Code implementation specialist",
          "Game engine specialist",
          "System balance specialist"
        ],
        text: "Gameplay can propose lane structure, code can call out implementation complexity, engine can warn about rendering or performance constraints, and balance can question upgrade scaling."
      }
    ]
  },
  todos: [
    { id: "todo_1", title: "Lock tower categories", detail: "Basic, cannon, frost, fire, poison, anti-air.", done: false },
    { id: "todo_2", title: "Clarify mode behavior", detail: "Single, Multi, and Discussion now have different purposes.", done: true },
    { id: "todo_3", title: "Decide export timing", detail: "Only export once the core concept is stable enough for Projects.", done: false }
  ],
  calendar: [
    { day: "Mon", date: "24", items: [{ title: "Portal layout review", tone: "default" }, { title: "Writing block", tone: "good" }] },
    { day: "Tue", date: "25", items: [{ title: "Admin / email", tone: "warn" }, { title: "Game planning", tone: "default" }] },
    { day: "Wed", date: "26", today: true, items: [{ title: "Home page lock-in", tone: "good" }, { title: "Projects next", tone: "default" }] },
    { day: "Thu", date: "27", items: [{ title: "Pipeline cleanup", tone: "default" }] },
    { day: "Fri", date: "28", items: [{ title: "Creative writing", tone: "default" }] },
    { day: "Sat", date: "29", items: [{ title: "Reset / planning", tone: "warn" }] },
    { day: "Sun", date: "30", items: [{ title: "Open creative block", tone: "good" }] }
  ]
};

let state = loadState();

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
  return String(value)
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
      calendar: Array.isArray(parsed?.calendar) ? parsed.calendar : base.calendar
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(PM_HOME_KEY, JSON.stringify(state));
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
  if (!PM_API_BASE) {
    return { ok: false, error: "Missing PM_API_BASE" };
  }

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

function getCurrentThread() {
  if (!state.threads[state.selectedChatId]) {
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

function upsertChatIntoHistory(chat) {
  const removeById = (list) => list.filter((item) => item.id !== chat.id);

  state.chats.pinned = removeById(state.chats.pinned);
  state.chats.projectFolder = removeById(state.chats.projectFolder);
  state.chats.history = removeById(state.chats.history);

  state.chats.history.unshift(chat);
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
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const chatId = link.getAttribute("data-chat-id");
      if (!chatId) return;

      state.selectedChatId = chatId;
      saveState();
      renderAll();
      showToast("Chat selected", "good");
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

function renderModeHelp() {
  const help = qs("#modeHelpText");
  const composerStatus = qs("#composerStatus");

  if (help) help.innerHTML = MODE_HELP[state.mode] || MODE_HELP.single;
  if (composerStatus) composerStatus.textContent = MODE_STATUS[state.mode] || MODE_STATUS.single;
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

    const itemsHtml = day.items.map((item) => {
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
}

function hydrateFields() {
  const singleModel = qs("#singleModel");
  const multiModelSet = qs("#multiModelSet");
  const discussionPreset = qs("#discussionPreset");

  if (singleModel) singleModel.value = state.singleModel;
  if (multiModelSet) multiModelSet.value = state.multiModelSet;
  if (discussionPreset) discussionPreset.value = state.discussionPreset;

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
    if (current) exportTitle.value = current.title;
  }
}

function renderAll() {
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

function bindTodoControls() {
  qs("#addTodoBtn")?.addEventListener("click", () => {
    const input = qs("#todoInput");
    const value = (input?.value || "").trim();

    if (!value) {
      showToast("Write a todo first", "warn");
      return;
    }

    state.todos.unshift({
      id: safeId("todo"),
      title: value,
      detail: "Added from the Home thread.",
      done: false
    });

    if (input) input.value = "";
    saveState();
    renderTodos();
    showToast("Todo added", "good");
  });
}

function bindChatButtons() {
  qs("#newChatBtn")?.addEventListener("click", () => {
    const id = safeId("chat");
    const title = "New chat";

    state.selectedChatId = id;
    state.threads[id] = [];
    upsertChatIntoHistory({ id, title });

    saveState();
    renderAll();
    showToast("New chat created", "good");
  });

  qs("#branchChatBtn")?.addEventListener("click", () => {
    const current = getChatById(state.selectedChatId);
    const sourceThread = clone(getCurrentThread());
    const id = safeId("chat");
    const title = current ? `${current.title} (branch)` : "Branched chat";

    state.selectedChatId = id;
    state.threads[id] = sourceThread;
    upsertChatIntoHistory({ id, title });

    saveState();
    renderAll();
    showToast("Branch created", "good");
  });

  qs("#pinChatBtn")?.addEventListener("click", () => {
    const current = getChatById(state.selectedChatId);
    if (!current) {
      showToast("No active chat to pin", "warn");
      return;
    }

    const existingPinnedIndex = state.chats.pinned.findIndex((item) => item.id === current.id);

    if (existingPinnedIndex >= 0) {
      state.chats.pinned.splice(existingPinnedIndex, 1);
      upsertChatIntoHistory(current);
      saveState();
      renderAll();
      showToast("Chat unpinned", "good");
      return;
    }

    state.chats.history = state.chats.history.filter((item) => item.id !== current.id);
    state.chats.projectFolder = state.chats.projectFolder.filter((item) => item.id !== current.id);
    state.chats.pinned.unshift(current);

    saveState();
    renderAll();
    showToast("Chat pinned", "good");
  });
}

function appendUserMessage(text) {
  const thread = getCurrentThread();
  thread.push({
    id: safeId("msg"),
    role: "user",
    head: "User",
    text
  });
}

function appendSystemAssistantMessage(text, chips = []) {
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

  appendUserMessage(text);

  const current = getChatById(state.selectedChatId);
  if (current && (!current.title || current.title === "New chat")) {
    current.title = text.slice(0, 48);
  }

  saveState();
  renderThread();

  if (input) input.value = "";

  /*
    IMPORTANT:
    Home-specific routes were previously invented:
    - /api/home/send
    - /api/home/export-to-projects

    They are intentionally removed here until real PM backend routes are mapped from main.py.
    Do not invent replacement routes in this file.
  */

  appendSystemAssistantMessage(
    "Message saved locally. Home send is intentionally not route-wired until the real PM backend chat endpoint is mapped from main.py.",
    state.mode === "discussion"
      ? ["Discussion mode"]
      : state.mode === "multi"
        ? ["Multi mode"]
        : ["Single mode"]
  );

  saveState();
  renderAll();
  showToast("Saved locally. Awaiting real PM route mapping.", "warn");
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

    /*
      IMPORTANT:
      The old export route was invented and removed:
      - /api/home/export-to-projects

      Export must only be wired once the real PM backend route and payload are confirmed from main.py.
    */

    showToast("Export blocked until real PM export route is mapped from main.py.", "warn");

    const thread = getCurrentThread();
    thread.push({
      id: safeId("msg"),
      role: "assistant",
      head: "PM Home",
      text: `Export prepared locally for "${title}" as ${state.selectedProjectType}. Route wiring is intentionally blocked until the real PM backend export endpoint is confirmed.`,
      chips: ["Projects", state.selectedProjectType, note ? "Has note" : "No note"]
    });

    saveState();
    renderThread();
  });
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
}

document.addEventListener("DOMContentLoaded", init);
