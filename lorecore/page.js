const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const modeSwitch = document.getElementById("modeSwitch");
const modeCards = document.querySelectorAll("[data-mode-card]");
const segmentedButtons = document.querySelectorAll(".segmented-btn");
const composerInput = document.getElementById("composerInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");
const clearComposerBtn = document.getElementById("clearComposerBtn");
const chatThread = document.getElementById("chatThread");
const activityBox = document.getElementById("activityBox");
const studioTabs = document.getElementById("studioTabs");
const studioTabButtons = document.querySelectorAll(".studio-tab");
const studioPanes = document.querySelectorAll(".studio-pane");

let currentMode = "discussion";

async function callApi(path, method = "GET", payload = null) {
  if (!PM_API_BASE) {
    return { ok: false, mock: true, error: "Missing PM_API_BASE" };
  }

  try {
    const response = await fetch(`${PM_API_BASE}${path}`, {
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

function addActivity(text) {
  if (!activityBox) return;

  const line = document.createElement("div");
  line.className = "activity-line";
  line.textContent = text;
  activityBox.prepend(line);

  const allLines = activityBox.querySelectorAll(".activity-line");
  if (allLines.length > 8) {
    allLines[allLines.length - 1].remove();
  }
}

function setMode(mode) {
  currentMode = mode;

  segmentedButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });

  modeCards.forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.modeCard === mode);
  });

  addActivity(`Mode changed to ${mode}.`);
}

function createBubble(roleClass, roleName, bodyText) {
  const article = document.createElement("article");
  article.className = `chat-bubble ${roleClass}`;

  const meta = document.createElement("div");
  meta.className = "bubble-meta";

  const role = document.createElement("span");
  role.className = "bubble-role";
  role.textContent = roleName;

  const time = document.createElement("span");
  time.className = "bubble-time";
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  meta.appendChild(role);
  meta.appendChild(time);

  const body = document.createElement("div");
  body.className = "bubble-body";
  body.textContent = bodyText;

  article.appendChild(meta);
  article.appendChild(body);

  return article;
}

function appendUserBubble(text) {
  if (!chatThread) return;
  const userBubble = createBubble("user", "You", text);
  chatThread.appendChild(userBubble);
  chatThread.scrollTop = chatThread.scrollHeight;
}

function appendAssistantBubble(text) {
  if (!chatThread) return;
  const assistantBubble = createBubble("assistant", "LoreCore", text);
  chatThread.appendChild(assistantBubble);
  chatThread.scrollTop = chatThread.scrollHeight;
}

function getFallbackReply() {
  if (currentMode === "direct") {
    return "Direct lane: I will answer with one focused creative move and keep the output narrow, clean, and immediately usable.";
  }

  if (currentMode === "parallel") {
    return "Parallel lane: I would compare at least two strong alternatives here — one grounded in historical pressure and one driven more by dramatic character tension.";
  }

  return "Discussion lane: I would expand this through collaborative critique, world logic, scene pressure, and prose alternatives before saving anything.";
}

async function sendMessage() {
  const value = composerInput?.value.trim() || "";
  if (!value) return;

  appendUserBubble(value);
  if (composerInput) composerInput.value = "";
  composerInput?.focus();

  addActivity("Message sent to active creative thread.");

  const result = await callApi("/api/lorecore/send", "POST", {
    mode: currentMode,
    prompt: value
  });

  let replyText = "";

  if (result.ok) {
    if (typeof result.body === "string") {
      replyText = result.body;
    } else if (result.body?.reply) {
      replyText = result.body.reply;
    } else if (result.body?.message) {
      replyText = result.body.message;
    } else if (result.body?.text) {
      replyText = result.body.text;
    } else {
      replyText = "LoreCore responded, but the response format was not recognized by this page yet.";
    }

    addActivity("Reply received from backend.");
  } else {
    replyText = getFallbackReply();
    addActivity("Backend unavailable. Fallback reply shown.");
  }

  appendAssistantBubble(replyText);
}

modeSwitch?.addEventListener("click", (event) => {
  const button = event.target.closest(".segmented-btn");
  if (!button) return;
  setMode(button.dataset.mode);
});

modeCards.forEach((card) => {
  card.addEventListener("click", () => {
    setMode(card.dataset.modeCard);
  });
});

sendMessageBtn?.addEventListener("click", sendMessage);

clearComposerBtn?.addEventListener("click", () => {
  if (composerInput) composerInput.value = "";
  composerInput?.focus();
  addActivity("Composer cleared.");
});

composerInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

studioTabs?.addEventListener("click", (event) => {
  const button = event.target.closest(".studio-tab");
  if (!button) return;

  const targetTab = button.dataset.tab;

  studioTabButtons.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === targetTab);
  });

  studioPanes.forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.pane === targetTab);
  });

  addActivity(`Studio tab changed to ${targetTab}.`);
});

setMode("discussion");
