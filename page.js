
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
    {
      id: "todo_1",
      title: "Lock tower categories",
      detail: "Basic, cannon, frost, fire, poison, anti-air.",
      done: false
    },
    {
      id: "todo_2",
      title: "Clarify mode behavior",
      detail: "Single, Multi, and Discussion now have different purposes.",
      done: true
    },
    {
      id: "todo_3",
      title: "Decide export timing",
      detail: "Only export once the core concept is stable enough for Projects.",
      done: false
    }
  ],
  calendar: [
    {
      day: "Mon",
      date: "24",
      items: [
        { title: "Portal layout review", tone: "default" },
        { title: "Writing block", tone: "good" }
      ]
    },
    {
      day: "Tue",
      date: "25",
      items: [
        { title: "Admin / email", tone: "warn" },
        { title: "Game planning", tone: "default" }
      ]
    },
    {
      day: "Wed",
      date: "26",
      today: true,
      items: [
        { title: "Home page lock-in", tone: "good" },
        { title: "Projects next", tone: "default" }
      ]
    },
    {
      day: "Thu",
      date: "27",
      items: [{ title: "Pipeline cleanup", tone: "default" }]
    },
    {
      day: "Fri",
      date: "28",
      items: [{ title: "Creative writing", tone: "default" }]
    },
    {
      day: "Sat",
      date: "29",
      items: [{ title: "Reset / planning", tone: "warn" }]
    },
    {
      day: "Sun",
      date: "30",
      items: [{ title: "Open creative block", tone: "good" }]
    }
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
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
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
      calendar: Array.isArray(parsed?.calendar) ? parsed.calendar : base.calendar
    };
  } catch (error) {
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
  toast.className = "toast " + tone + " is-visible";

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

async function callApi(path, method = "GET", payload = null) {
  if (!PM_API_BASE) {
    return { ok: false, mock: true };
  }

  try {
    const response = await fetch(PM_API_BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
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

function renderHistorySection(targetId, items, isFolder = false) {
  const root = qs(targetId);
  if (!root) return;

  const searchValue = (qs("#chatSearch")?.value || "").trim().toLowerCase();

  const filtered = items.filter((item) => {
    if (!searchValue) return true;
    return item.title.toLowerCase().includes(searchValue);
  });

  root.innerHTML = filtered
    .map((item) => {
      const activeClass = item.id === state.selectedChatId ? " history-link--active" : "";
      const folderClass = isFolder ? " history-link--folder" : "";
      return `
        <a class="history-link${activeClass}${folderClass}" href="#" data-chat-id="${escapeHtml(item.id)}">
          <span class="history-link__dot"></span>
          <span class="history-link__title">${escapeHtml(item.title)}</span>
        </a>
      `;
    })
    .join("");

  qsa(".history-link", root).forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const chatId = link.getAttribute("data-chat-id");
      if (!chatId) return;
      state.selectedChatId = chatId;
      saveState();
      renderHistory();
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

  const helpText = {
    single: "<strong>Single:</strong> one selected model answers directly.",
    multi: "<strong>Multi:</strong> the same prompt is sent to all selected models and each responds separately.",
    discussion: "<strong>Discussion:</strong> selected specialists participate more like a group conversation when their expertise becomes relevant."
  };

  const statusText = {
    single: "Single mode ready",
    multi: "Multi mode ready",
    discussion: "Discussion mode ready"
  };

  if (help) help.innerHTML = helpText[state.mode] || helpText.single;
  if (composerStatus) composerStatus.textContent = statusText[state.mode] || statusText.single;
}

function renderTodos() {
  const root = qs("#todoList");
  if (!root) return;

  root.innerHTML = state.todos
    .map((todo) => {
      return `
        <label class="todo-item">
          <input type="checkbox" data-todo-id="${escapeHtml(todo.id)}" ${todo.done ? "checked" : ""} />
          <div class="todo-item__body">
            <strong>${escapeHtml(todo.title)}</strong>
            <span>${escapeHtml(todo.detail || "")}</span>
          </div>
        </label>
      `;
    })
    .join("");

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

  root.innerHTML = state.calendar
    .map((day) => {
      const dayClass = day.today ? "calendar-day calendar-day--today" : "calendar-day";

      const itemsHtml = day.items
        .map((item) => {
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
        })
        .join("");

      return `
        <article class="${dayClass}">
          <div class="calendar-day__head">
            <strong>${escapeHtml(day.day)}</strong>
            <span class="soft">${escapeHtml(day.date)}</span>
          </div>
          ${itemsHtml}
        </article>
      `;
    })
    .join("");
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
    showToast("New chat action ready", "good");
  });

  qs("#branchChatBtn")?.addEventListener("click", () => {
    showToast("Branch action ready", "good");
  });

  qs("#pinChatBtn")?.addEventListener("click", () => {
    showToast("Pin / unpin action ready", "good");
  });
}

function bindSendButton() {
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

    if (result.ok) {
      showToast("Message sent", "good");
    } else {
      showToast("Saved locally. API hook ready.", "warn");
    }

    if (input) input.value = "";
  });
}

function bindExportButton() {
  qs("#exportBtn")?.addEventListener("click", async () => {
    const payload = {
      title: qs("#exportTitle")?.value || "",
      tag: state.selectedProjectType,
      note: qs("#exportNote")?.value || "",
      chatId: state.selectedChatId
    };

    const result = await callApi("/api/home/export-to-projects", "POST", payload);

    if (result.ok) {
      showToast("Export requested", "good");
    } else {
      showToast("Export hook ready. No live API yet.", "warn");
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function init() {
  hydrateFields();
  renderHistory();
  renderModeCards();
  renderModeHelp();
  renderTodos();
  renderCalendar();

  bindModeCards();
  bindSelectors();
  bindProjectTags();
  bindTodoControls();
  bindChatButtons();
  bindSendButton();
  bindExportButton();
}

document.addEventListener("DOMContentLoaded", init);
