const PM_HOME_KEY = "PM_HOME_V1";
const PM_API_BASE = window.PM_API_BASE || "";

const defaultState = {
  selectedChatId: "frontend_backend_handoff",
  mode: "single",
  singleModel: "Jeff main / GPT-style assistant",
  multiModelSet: "Gameplay + Engine + Coder",
  discussionPreset: "Game design discussion",
  selectedProjectType: "App",
  chats: {
    pinned: [
      { id: "frontend_backend_handoff", title: "Frontend Backend Handoff" },
      { id: "ai_assistent_portal_design", title: "AI-assistent portal design" }
    ],
    projectFolder: [
      { id: "game_designer_workflow", title: "Game designer workflow" },
      { id: "web_portal_redesign", title: "Web portal redesign" },
      { id: "ai_message_filtering", title: "AI message filtering system" }
    ],
    history: [
      { id: "chatgpt_handoff_request", title: "ChatGPT Handoff Request" },
      { id: "pipeline_test_setup", title: "Pipeline test setup" },
      { id: "webpage_redesign_workflow", title: "Webpage Redesign Workflow" },
      { id: "pipeline_fleet_provisioning", title: "Pipeline Fleet Provisioning" },
      { id: "vurdere_sponsing", title: "Vurdere sponsing av prosjekt" },
      { id: "operativ_overlevering", title: "Operativ overlevering PM" },
      { id: "home_page_redesign", title: "Home Page Redesign" },
      { id: "programmer_for_windows", title: "Programmer for Windows" },
      { id: "pm_backend_session", title: "PM Backend Session" }
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(PM_HOME_KEY);
    if (!raw) return deepClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...deepClone(defaultState),
      ...parsed,
      chats: {
        pinned: Array.isArray(parsed?.chats?.pinned) ? parsed.chats.pinned : deepClone(defaultState).chats.pinned,
        projectFolder: Array.isArray(parsed?.chats?.projectFolder) ? parsed.chats.projectFolder : deepClone(defaultState).chats.projectFolder,
        history: Array.isArray(parsed?.chats?.history) ? parsed.chats.history : deepClone(defaultState).chats.history
      },
      todos: Array.isArray(parsed.todos) ? parsed.todos : deepClone(defaultState).todos,
      calendar: Array.isArray(parsed.calendar) ? parsed.calendar : deepClone(defaultState).calendar
    };
  } catch {
    return deepClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(PM_HOME_KEY, JSON.stringify(state));
}

let state = loadState();

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

async function callApi(path, method = "GET", payload = null) {
  if (!PM_API_BASE) return { ok: false, mock: true };
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function renderHistorySection(targetId, items, options = {}) {
  const root = qs(targetId);
  if (!root) return;

  const search = (qs("#chatSearch")?.value || "").trim().toLowerCase();
  const filtered = items.filter(item => !search || item.title.toLowerCase().includes(search));

  root.innerHTML = filtered.map(item => `
    <a class="history-link ${item.id === state.selectedChatId ? "history-link--active" : ""} ${options.folder ? "history-link--folder" : ""}" href="#" data-chat-id="${item.id}">
      <span class="history-link__dot"></span>
      <span class="history-link__title">${item.title}</span>
    </a>
  `).join("");
}

function renderHistory() {
  renderHistorySection("#pinnedChatsList", state.chats.pinned);
  renderHistorySection("#projectFolderList", state.chats.projectFolder, { folder: true });
  renderHistorySection("#chatHistoryList", state.chats.history);

  qsa(".history-link").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      state.selectedChatId = link.dataset.chatId;
      saveState();
      renderHistory();
      showToast("Chat selected", "good");
    });
  });
}

function renderModeCards() {
  qsa(".metric-card--mode").forEach(card => {
    const isActive = card.dataset.mode === state.mode;
    card.classList.toggle("is-active", isActive);
  });
}

function renderModeHelp() {
  const map = {
    single: "<strong>Single:</strong> one selected model answers directly.",
    multi: "<strong>Multi:</strong> the same prompt is sent to all selected models and each responds separately.",
    discussion: "<strong>Discussion:</strong> selected specialists participate more like a group conversation when their expertise becomes relevant."
  };
  const help = qs("#modeHelpText");
  if (help) help.innerHTML = map[state.mode] || map.single;
  const status = qs("#composerStatus");
  if (status) {
    status.textContent =
      state.mode === "single" ? "Single mode ready" :
      state.mode === "multi" ? "Multi mode ready" :
      "Discussion mode ready";
  }
}

function renderTodos() {
  const root = qs("#todoList");
  if (!root) return;
  root.innerHTML = state.todos.map(todo => `
    <label class="todo-item">
      <input type="checkbox" data-todo-id="${todo.id}" ${todo.done ? "checked" : ""} />
      <div class="todo-item__body">
        <strong>${todo.title}</strong>
        <span>${todo.detail || ""}</span>
      </div>
    </label>
  `).join("");

  qsa('#todoList input[type="checkbox"]').forEach(input => {
    input.addEventListener("change", () => {
      const todo = state.todos.find(item => item.id === input.dataset.todoId);
      if (!todo) return;
      todo.done = input.checked;
      saveState();
    });
  });
}

function renderCalendar() {
  const root = qs("#calendarGrid");
  if (!root) return;
  root.innerHTML = state.calendar.map(day => `
    <article class="calendar-day ${day.today ? "calendar-day--today" : ""}">
      <div class="calendar-day__head">
        <strong>${day.day}</strong>
        <span class="soft">${day.date}</span>
      </div>
      ${day.items.map(item => `
        <div class="calendar-entry ${item.tone === "good" ? "calendar-entry--good" : ""} ${item.tone === "warn" ? "calendar-entry--warn" : ""}">
          <strong>${item.title}</strong>
          <span>${item.tone === "good" ? "Focus block" : item.tone === "warn" ? "Attention" : "Planned"}</span>
        </div>
      `).join("")}
    </article>
  `).join("");
}

function bindControls() {
  qsa(".metric-card--mode").forEach(card => {
    card.addEventListener("click", () => {
      state.mode = card.dataset.mode;
      saveState();
      renderModeCards();
      renderModeHelp();
    });
  });

  qs("#singleModel")?.addEventListener("change", event => {
    state.singleModel = event.target.value;
    saveState();
  });

  qs("#multiModelSet")?.addEventListener("change", event => {
    state.multiModelSet = event.target.value;
    saveState();
  });

  qs("#discussionPreset")?.addEventListener("change", event => {
    state.discussionPreset = event.target.value;
    saveState();
  });

  qs("#chatSearch")?.addEventListener("input", renderHistory);

  qs("#projectTypeTags")?.addEventListener("click", event => {
    const button = event.target.closest("[data-tag]");
    if (!button) return;
    state.selectedProjectType = button.dataset.tag;
    saveState();
    qsa("#projectTypeTags .tag-button").forEach(tag => {
      tag.classList.toggle("tag-button--active", tag.dataset.tag === state.selectedProjectType);
    });
  });

  qs("#addTodoBtn")?.addEventListener("click", () => {
    const input = qs("#todoInput");
    const value = (input?.value || "").trim();
    if (!value) {
      showToast("Write a todo first", "warn");
      return;
    }
    state.todos.unshift({
      id: `todo_${crypto.randomUUID().slice(0, 8)}`,
      title: value,
      detail: "Added from the Home thread.",
      done: false
    });
    if (input) input.value = "";
    saveState();
    renderTodos();
    showToast("Todo added", "good");
  });

  qs("#sendBtn")?.addEventListener("click", async () => {
    const input = qs("#composerInput");
    const text = (input?.value || "").trim();
    if (!text) {
      showToast("Write something first", "warn");
      return;
    }
    const result = await callApi("/api/home/send", "POST", {
      mode: state.mode,
      singleModel: state.singleModel,
      multiModelSet: state.multiModelSet,
      discussionPreset: state.discussionPreset,
      prompt: text
    });
    showToast(result.ok ? "Message sent" : "Saved locally. API hook ready.", result.ok ? "good" : "warn");
    if (input) input.value = "";
  });

  qs("#exportBtn")?.addEventListener("click", async () => {
    const payload = {
      title: qs("#exportTitle")?.value || "",
      tag: state.selectedProjectType,
      note: qs("#exportNote")?.value || "",
      chatId: state.selectedChatId
    };
    const result = await callApi("/api/home/export-to-projects", "POST", payload);
    showToast(result.ok ? "Export requested" : "Export hook ready. No live API yet.", result.ok ? "good" : "warn");
  });

  qs("#newChatBtn")?.addEventListener("click", () => showToast("New chat action ready", "good"));
  qs("#branchChatBtn")?.addEventListener("click", () => showToast("Branch action ready", "good"));
  qs("#pinChatBtn")?.addEventListener("click", () => showToast("Pin / unpin action ready", "good"));
}

function hydrateFields() {
  const single = qs("#singleModel");
  const multi = qs("#multiModelSet");
  const discussion = qs("#discussionPreset");
  if (single) single.value = state.singleModel;
  if (multi) multi.value = state.multiModelSet;
  if (discussion) discussion.value = state.discussionPreset;

  qsa("#projectTypeTags .tag-button").forEach(tag => {
    tag.classList.toggle("tag-button--active", tag.dataset.tag === state.selectedProjectType);
  });
}

function init() {
  hydrateFields();
  renderHistory();
  renderModeCards();
  renderModeHelp();
  renderTodos();
  renderCalendar();
  bindControls();
}

document.addEventListener("DOMContentLoaded", init);
