const PM_HOME_KEY = "PM_HOME_V1";
const PM_API_BASE = window.PM_API_BASE || "";

const defaultState = {
  activeChatId: "chat-1",
  mode: "Discussion",
  activeModels: "discussion panel",
  participants: "3 models",
  projectClass: "System",
  promotionNote: "Intent, scope, constraints, and next action.",
  chats: [
    {
      id: "chat-1",
      title: "PM frontend shell final",
      meta: "Pinned · Today",
      section: "pinned",
      pinned: true,
      projectFolder: false,
      messages: [
        {
          role: "system",
          text: "Discussion only. Use chat to think, compare, challenge, and refine. Nothing here is treated as a task unless you deliberately promote it."
        },
        {
          role: "user",
          text: "We need Home to feel like a daily driver, not a backend admin page."
        },
        {
          role: "assistant",
          text: "Then Home must optimize for continuity, compact history, low-friction input, and simple export to Projects rather than deep runtime control."
        }
      ]
    },
    {
      id: "chat-2",
      title: "Pipeline benchmark notes",
      meta: "Pinned · Yesterday",
      section: "pinned",
      pinned: true,
      projectFolder: false,
      messages: [
        { role: "user", text: "We need stage-by-stage role benchmarks." },
        { role: "assistant", text: "Then benchmark planner, coder, verifier and JS-specific roles separately, not as one generic pass." }
      ]
    },
    {
      id: "proj-1",
      title: "State page polish",
      meta: "Ongoing · not exported",
      section: "projectFolder",
      pinned: false,
      projectFolder: true,
      messages: [
        { role: "user", text: "Need quorum and runtime control clearly separated." },
        { role: "assistant", text: "Keep runtime grid below and census up right." }
      ]
    },
    {
      id: "proj-2",
      title: "Agent Factory final pass",
      meta: "Ongoing · not exported",
      section: "projectFolder",
      pinned: false,
      projectFolder: true,
      messages: [
        { role: "user", text: "Agent Factory should be library + workspace only." },
        { role: "assistant", text: "Yes. Define reusable profiles here, compose them in Pipelines later." }
      ]
    },
    {
      id: "proj-3",
      title: "Guldardal notes",
      meta: "Ongoing · private",
      section: "projectFolder",
      pinned: false,
      projectFolder: true,
      messages: [
        { role: "user", text: "Soul wandering is more interesting than classic magic." },
        { role: "assistant", text: "That gives you cost, danger, identity-risk and mythic tone." }
      ]
    },
    {
      id: "chat-3",
      title: "Home daily driver structure",
      meta: "Today · 09:14",
      section: "recent",
      pinned: false,
      projectFolder: false,
      messages: [
        { role: "user", text: "History needs to be compact like ChatGPT." },
        { role: "assistant", text: "Use pinned, project folder and recent history in a dense left rail." }
      ]
    },
    {
      id: "chat-4",
      title: "Settings cloud provider split",
      meta: "Today · 08:22",
      section: "recent",
      pinned: false,
      projectFolder: false,
      messages: [
        { role: "user", text: "Settings should own providers and cloud policy." },
        { role: "assistant", text: "Yes. State stays runtime-only." }
      ]
    },
    {
      id: "chat-5",
      title: "State quorum layout",
      meta: "Yesterday",
      section: "recent",
      pinned: false,
      projectFolder: false,
      messages: [
        { role: "user", text: "Single-model approval is not acceptable." },
        { role: "assistant", text: "Then use 3-model groups with quorum gates." }
      ]
    },
    {
      id: "chat-6",
      title: "Pipeline pass run notes",
      meta: "Yesterday",
      section: "recent",
      pinned: false,
      projectFolder: false,
      messages: [
        { role: "user", text: "The run passed once the right model owned the hot path." },
        { role: "assistant", text: "That strongly supports role-specialized model assignment." }
      ]
    },
    {
      id: "chat-7",
      title: "Creative writing model ideas",
      meta: "Yesterday",
      section: "recent",
      pinned: false,
      projectFolder: false,
      messages: [
        { role: "user", text: "Need stronger models for writing in established worlds." },
        { role: "assistant", text: "Use cloud-heavy writing roles and keep lore verification separate." }
      ]
    }
  ],
  currentTodo: [
    { id: "todo-1", text: "Lock Home structure before coding", done: false },
    { id: "todo-2", text: "Finish pipelines final version", done: false },
    { id: "todo-3", text: "Export only when thread is truly ready", done: false }
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
      chats: Array.isArray(parsed.chats) ? parsed.chats : deepClone(defaultState).chats,
      currentTodo: Array.isArray(parsed.currentTodo) ? parsed.currentTodo : deepClone(defaultState).currentTodo
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

function getActiveChat() {
  return state.chats.find(chat => chat.id === state.activeChatId) || state.chats[0];
}

function filterChats(chats, search) {
  const q = search.trim().toLowerCase();
  if (!q) return chats;
  return chats.filter(chat =>
    chat.title.toLowerCase().includes(q) ||
    chat.meta.toLowerCase().includes(q) ||
    chat.messages.some(m => m.text.toLowerCase().includes(q))
  );
}

function chatButtonMarkup(chat, activeId) {
  return `
    <button class="history-item ${chat.id === activeId ? "history-item--active" : ""}" type="button" data-chat-id="${chat.id}">
      <span class="history-title">${chat.title}</span>
      <span class="history-meta">${chat.meta}</span>
    </button>
  `;
}

function renderHistory() {
  const search = qs("#historySearch")?.value || "";
  const filtered = filterChats(state.chats, search);

  const pinned = filtered.filter(chat => chat.section === "pinned");
  const projectFolder = filtered.filter(chat => chat.section === "projectFolder");
  const recent = filtered.filter(chat => chat.section === "recent");

  const pinnedList = qs("#pinnedHistoryList");
  const projectList = qs("#projectFolderList");
  const recentList = qs("#recentHistoryList");

  if (pinnedList) pinnedList.innerHTML = pinned.map(chat => chatButtonMarkup(chat, state.activeChatId)).join("");
  if (projectList) projectList.innerHTML = projectFolder.map(chat => chatButtonMarkup(chat, state.activeChatId)).join("");
  if (recentList) recentList.innerHTML = recent.map(chat => chatButtonMarkup(chat, state.activeChatId)).join("");

  const pinnedCount = qs("#pinnedCount");
  const projectCount = qs("#projectFolderCount");
  const recentCount = qs("#recentCount");

  if (pinnedCount) pinnedCount.textContent = String(pinned.length);
  if (projectCount) projectCount.textContent = String(projectFolder.length);
  if (recentCount) recentCount.textContent = String(recent.length);

  qsa(".history-item").forEach(button => {
    button.addEventListener("click", () => {
      state.activeChatId = button.dataset.chatId;
      saveState();
      renderAll();
    });
  });
}

function renderChatThread() {
  const thread = qs("#chatThread");
  const chat = getActiveChat();
  if (!thread || !chat) return;

  thread.innerHTML = chat.messages.map(message => `
    <article class="message message--${message.role}">
      <div class="message-role">${message.role === "assistant" ? "PM" : message.role === "user" ? "You" : "System"}</div>
      <div class="message-body">${escapeHtml(message.text)}</div>
    </article>
  `).join("");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderControls() {
  const mode = qs("#chatMode");
  const activeModels = qs("#activeModels");
  const participants = qs("#participants");
  const projectClass = qs("#projectClassSelect");
  const promotionNote = qs("#promotionNote");
  const selectedModelChip = qs("#selectedModelChip");

  if (mode) mode.value = state.mode;
  if (activeModels) activeModels.value = state.activeModels;
  if (participants) participants.value = state.participants;
  if (projectClass) projectClass.value = state.projectClass;
  if (promotionNote) promotionNote.value = state.promotionNote;
  if (selectedModelChip) selectedModelChip.textContent = `${state.participants} selected`;
}

function renderTodo() {
  const list = qs("#currentTodoList");
  if (!list) return;

  list.innerHTML = state.currentTodo.map(item => `
    <label class="todo-item" data-todo-id="${item.id}">
      <input type="checkbox" ${item.done ? "checked" : ""} />
      <span>${item.text}</span>
    </label>
  `).join("");

  qsa(".todo-item input", list).forEach(input => {
    input.addEventListener("change", event => {
      const row = event.target.closest(".todo-item");
      if (!row) return;
      const todoId = row.dataset.todoId;
      state.currentTodo = state.currentTodo.map(todo =>
        todo.id === todoId ? { ...todo, done: event.target.checked } : todo
      );
      saveState();
    });
  });
}

function createChat(title, section = "recent", meta = "Today · new") {
  return {
    id: `chat-${crypto.randomUUID().slice(0, 8)}`,
    title,
    meta,
    section,
    pinned: section === "pinned",
    projectFolder: section === "projectFolder",
    messages: [
      {
        role: "system",
        text: "Discussion only. Use this thread to think, compare, challenge and refine before exporting to Projects."
      }
    ]
  };
}

function bindButtons() {
  qs("#newChatBtn")?.addEventListener("click", () => {
    const chat = createChat("New discussion", "recent", "Today · new");
    state.chats.unshift(chat);
    state.activeChatId = chat.id;
    saveState();
    renderAll();
    showToast("New chat created", "good");
  });

  qs("#branchChatBtn")?.addEventListener("click", () => {
    const active = getActiveChat();
    if (!active) return;
    const branched = {
      ...deepClone(active),
      id: `chat-${crypto.randomUUID().slice(0, 8)}`,
      title: `${active.title} (Branch)`,
      meta: "Today · branched",
      section: "projectFolder",
      pinned: false,
      projectFolder: true
    };
    state.chats.unshift(branched);
    state.activeChatId = branched.id;
    saveState();
    renderAll();
    showToast("Chat branched into project folder", "good");
  });

  qs("#addTodoBtn")?.addEventListener("click", () => {
    state.currentTodo.unshift({
      id: `todo-${crypto.randomUUID().slice(0, 8)}`,
      text: "New current-session todo",
      done: false
    });
    saveState();
    renderTodo();
    showToast("Todo added", "good");
  });

  qs("#clearDoneBtn")?.addEventListener("click", () => {
    state.currentTodo = state.currentTodo.filter(item => !item.done);
    saveState();
    renderTodo();
    showToast("Completed todos cleared", "good");
  });

  qs("#sendToProjectsBtn")?.addEventListener("click", async () => {
    const active = getActiveChat();
    const payload = {
      chat_id: active?.id,
      title: active?.title,
      project_class: state.projectClass,
      promotion_note: state.promotionNote
    };

    const result = await callApi("/api/home/promote-to-projects", "POST", payload);
    showToast(result.ok ? "Sent to Projects" : "Saved locally. API hook ready.", result.ok ? "good" : "warn");
  });

  qs("#sendBtn")?.addEventListener("click", handleSend);
  qs("#starterBtn")?.addEventListener("click", () => {
    const composer = qs("#composerInput");
    if (composer) {
      composer.value = "Help me clarify what I actually mean before we turn this into project work.";
      composer.focus();
    }
  });

  qs("#refreshBtn")?.addEventListener("click", () => {
    renderAll();
    showToast("Home refreshed", "good");
  });
}

function bindInputs() {
  qs("#historySearch")?.addEventListener("input", renderHistory);

  qs("#chatMode")?.addEventListener("change", event => {
    state.mode = event.target.value;
    saveState();
    renderControls();
  });

  qs("#activeModels")?.addEventListener("change", event => {
    state.activeModels = event.target.value;
    saveState();
    renderControls();
  });

  qs("#participants")?.addEventListener("change", event => {
    state.participants = event.target.value;
    saveState();
    renderControls();
  });

  qs("#projectClassSelect")?.addEventListener("change", event => {
    state.projectClass = event.target.value;
    saveState();
  });

  qs("#promotionNote")?.addEventListener("input", event => {
    state.promotionNote = event.target.value;
    saveState();
  });

  qs("#composerInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
}

function handleSend() {
  const input = qs("#composerInput");
  const active = getActiveChat();
  if (!input || !active) return;

  const text = input.value.trim();
  if (!text) return;

  active.messages.push({ role: "user", text });
  active.messages.push({
    role: "assistant",
    text: "Captured in discussion mode. Refine further, challenge it, or promote it to Projects when it is ready."
  });

  active.meta = "Today · active";
  input.value = "";

  saveState();
  renderChatThread();
  renderHistory();
}

function renderAll() {
  renderHistory();
  renderChatThread();
  renderControls();
  renderTodo();
}

function init() {
  renderAll();
  bindButtons();
  bindInputs();
}

document.addEventListener("DOMContentLoaded", init);
