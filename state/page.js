const PM_STATE_KEY = "PM_STATE_V3";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const defaultState = {
  profileName: "Operator Baseline",
  testingSlice: "Homepage JS",
  runMode: "locked",
  lastRunStatus: "Unknown",
  runtimeModels: [],
  runtimeEvents: [],
  overview: null
};

let state = loadState();
let activeRequestCount = 0;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(PM_STATE_KEY);
    if (!raw) return deepClone(defaultState);
    return {
      ...deepClone(defaultState),
      ...JSON.parse(raw)
    };
  } catch {
    return deepClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(PM_STATE_KEY, JSON.stringify(state));
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function showToast(message, tone = "good") {
  let toast = qs("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.className = `toast ${tone} is-visible`;
  toast.textContent = message;

  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

function setBusy(isBusy) {
  activeRequestCount += isBusy ? 1 : -1;
  if (activeRequestCount < 0) activeRequestCount = 0;

  const busy = activeRequestCount > 0;
  qsa("button").forEach((button) => {
    button.disabled = busy;
  });
}

function renderLiveTrace(message, prepend = true) {
  const livePanel = qsa(".main-layout .stack .panel")[3];
  if (!livePanel) return;

  const log = qs(".live-log", livePanel);
  if (!log) return;

  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = message;

  if (prepend) {
    log.prepend(line);
  } else {
    log.appendChild(line);
  }

  const items = qsa(".log-line", log);
  if (items.length > 20) {
    items.slice(20).forEach((item) => item.remove());
  }
}

async function callApi(path, method = "GET", payload = null) {
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: payload ? JSON.stringify(payload) : undefined
    });

    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json() : await res.text();

    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function familyLabelClass(family) {
  const normalized = String(family || "").toLowerCase();
  if (["router", "planner", "python", "cpp", "js", "verify"].includes(normalized)) {
    return normalized === "verifier" ? "verify" : normalized;
  }
  return "";
}

function deriveFamily(model) {
  const text = `${model.alias || ""} ${model.name || ""} ${model.title || ""}`.toLowerCase();
  if (text.includes("router")) return "router";
  if (text.includes("planner")) return "planner";
  if (text.includes("python")) return "python";
  if (text.includes("cpp") || text.includes("c++")) return "cpp";
  if (text.includes("js") || text.includes("javascript")) return "js";
  if (text.includes("verify")) return "verifier";
  return "general";
}

function normalizePlacement(model) {
  const text = `${model.placement || ""} ${model.class_type || ""} ${model.runtime_target || ""}`.toUpperCase();
  if (text.includes("GPU")) return "GPU";
  return "CPU";
}

function normalizeRuntimeState(model) {
  const val = String(model.runtime_state || model.state || "").toLowerCase();
  if (val === "loaded" || val === "warm" || val === "active") return "active";
  if (val === "disabled") return "disabled";
  if (val === "warming") return "benchmark";
  return "cold";
}

function normalizePin(model) {
  if (model.keep_loaded === true) return "Pinned";
  return normalizeRuntimeState(model) === "active" ? "Running" : "Standby";
}

function normalizeRuntimeModel(model) {
  return {
    id: model.model_public_id || model.public_id || model.id || model.alias || model.name || "unknown-model",
    family: deriveFamily(model),
    alias: model.alias || model.name || model.title || model.model_public_id || "unknown",
    placement: normalizePlacement(model),
    state: normalizeRuntimeState(model),
    pin: normalizePin(model),
    raw: model
  };
}

function deriveCounts() {
  const active = state.runtimeModels.filter((m) => m.state === "active").length;
  const cold = state.runtimeModels.filter((m) => m.state === "cold").length;
  const benchmark = state.runtimeModels.filter((m) => m.state === "benchmark").length;
  const disabled = state.runtimeModels.filter((m) => m.state === "disabled").length;
  const gpu = state.runtimeModels.filter((m) => m.placement === "GPU" && m.state === "active").length;
  const cpu = state.runtimeModels.filter((m) => m.placement === "CPU" && m.state === "active").length;
  return { active, cold, benchmark, disabled, gpu, cpu };
}

function renderHeroCards() {
  const cards = qsa(".hero-grid .panel");
  if (cards.length < 4) return;

  const counts = deriveCounts();

  const firstValue = qs(".stat-value", cards[0]);
  if (firstValue) firstValue.textContent = String(counts.active);

  const firstChips = qs(".chip-row", cards[0]);
  if (firstChips) {
    firstChips.innerHTML = `
      <div class="chip good">GPU ${counts.gpu} active</div>
      <div class="chip">CPU ${counts.cpu} active</div>
      <div class="chip warn">${counts.cold + counts.benchmark} non-hot</div>
      ${counts.disabled ? `<div class="chip bad">${counts.disabled} disabled</div>` : ""}
    `;
  }

  const secondValue = qs(".stat-value", cards[1]);
  if (secondValue) secondValue.textContent = "2-of-3";

  const thirdValue = qs(".stat-value", cards[2]);
  if (thirdValue) thirdValue.textContent = state.testingSlice || "State";

  const fourthValue = qs(".stat-value", cards[3]);
  if (fourthValue) fourthValue.textContent = state.lastRunStatus || "Unknown";
}

function renderCensus() {
  const censusCard = qsa(".main-layout .stack .panel")[0];
  if (!censusCard) return;

  const chipRow = qs(".chip-row", censusCard);
  if (!chipRow) return;

  chipRow.innerHTML = state.runtimeModels.length
    ? state.runtimeModels.map((model) => {
        let tone = "";
        if (model.state === "active") tone = "good";
        if (model.state === "benchmark") tone = "warn";
        if (model.state === "disabled") tone = "bad";
        return `<div class="chip ${tone}">${model.id} ${model.state}</div>`;
      }).join("")
    : `<div class="chip warn">No runtime models reported</div>`;
}

function renderRuntimeGrid() {
  const runtimePanel = qsa(".main-layout .stack .panel")[1];
  if (!runtimePanel) return;

  const runtimeGrid = qs(".runtime-grid", runtimePanel);
  if (!runtimeGrid) return;

  runtimeGrid.innerHTML = state.runtimeModels.length
    ? state.runtimeModels.map((model) => {
        const familyClass = familyLabelClass(model.family);
        return `
          <div class="runtime-model" data-model-id="${model.id}">
            <div class="runtime-top">
              <div>
                <div class="runtime-name">${model.id}</div>
                <div class="runtime-sub">${model.alias} · ${model.placement} · ${model.state}</div>
              </div>
            </div>
            <div class="model-tags">
              <div class="tag ${familyClass}">${model.family} family</div>
              <div class="tag">${model.pin}</div>
            </div>
            <div class="control-row">
              ${model.state === "active"
                ? `<button class="button button--small button--danger" data-action="unload">Unload</button>`
                : `<button class="button button--small button--primary" data-action="load">Load</button>`}
              <button class="button button--small" data-action="enable">Enable</button>
              <button class="button button--small button--danger" data-action="disable">Disable</button>
              <button class="button button--small" data-action="pin">Keep Loaded</button>
              <button class="button button--small" data-action="unpin">Allow Unload</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="runtime-model"><div class="runtime-name">No models reported</div><div class="runtime-sub">Model pool data is empty or unavailable.</div></div>`;
}

function renderRuntimeEvents() {
  const livePanel = qsa(".main-layout .stack .panel")[3];
  if (!livePanel) return;

  const log = qs(".live-log", livePanel);
  if (!log) return;

  if (!Array.isArray(state.runtimeEvents) || !state.runtimeEvents.length) {
    log.innerHTML = `<div class="log-line">[STATE] No runtime events reported yet</div>`;
    return;
  }

  log.innerHTML = state.runtimeEvents.slice(0, 12).map((event) => {
    const line =
      event.message ||
      event.title ||
      event.event ||
      JSON.stringify(event);
    return `<div class="log-line">${line}</div>`;
  }).join("");
}

async function refreshOverview() {
  const result = await callApi("/api/state/overview", "GET");
  if (!result.ok) {
    showToast("Could not load state overview", "warn");
    return;
  }
  state.overview = result.body;
  saveState();
}

async function refreshModels() {
  const result = await callApi("/api/model-pool/models?sync=true", "GET");
  if (!result.ok) {
    showToast("Could not load model pool", "warn");
    return;
  }

  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  state.runtimeModels = items.map(normalizeRuntimeModel);
  saveState();
}

async function refreshRuntimeEvents() {
  const result = await callApi("/api/model-pool/runtime-events?limit=20", "GET");
  if (!result.ok) {
    state.runtimeEvents = [];
    saveState();
    return;
  }
  state.runtimeEvents = Array.isArray(result.body?.items) ? result.body.items : [];
  saveState();
}

async function handleModelAction(modelId, action) {
  const model = state.runtimeModels.find((item) => item.id === modelId);
  if (!model) return;

  const backendId = model.raw?.model_public_id || model.id;
  let result = null;

  setBusy(true);

  switch (action) {
    case "load":
      result = await callApi(`/api/model-pool/models/${encodeURIComponent(backendId)}/load`, "POST", {
        leased_to: "state-surface"
      });
      break;
    case "unload":
      result = await callApi(`/api/model-pool/models/${encodeURIComponent(backendId)}/unload`, "POST");
      break;
    case "enable":
      result = await callApi(`/api/model-pool/models/${encodeURIComponent(backendId)}`, "PATCH", {
        enabled: true
      });
      break;
    case "disable":
      result = await callApi(`/api/model-pool/models/${encodeURIComponent(backendId)}`, "PATCH", {
        enabled: false
      });
      break;
    case "pin":
      result = await callApi(`/api/model-pool/models/${encodeURIComponent(backendId)}`, "PATCH", {
        keep_loaded: true
      });
      break;
    case "unpin":
      result = await callApi(`/api/model-pool/models/${encodeURIComponent(backendId)}`, "PATCH", {
        keep_loaded: false
      });
      break;
    default:
      setBusy(false);
      return;
  }

  setBusy(false);

  if (!result?.ok) {
    showToast(`${modelId} action failed`, "warn");
    renderLiveTrace(`[MODEL] ${modelId} ${action} failed`);
    return;
  }

  renderLiveTrace(`[MODEL] ${modelId} ${action} requested`);
  showToast(`${modelId} ${action} requested`, "good");

  await refreshModels();
  await refreshRuntimeEvents();
  renderAll();
}

function bindRuntimeActions() {
  qsa(".runtime-model").forEach((card) => {
    const modelId = card.dataset.modelId;
    qsa("[data-action]", card).forEach((button) => {
      button.addEventListener("click", () => {
        handleModelAction(modelId, button.dataset.action);
      });
    });
  });
}

function bindTopButtons() {
  qsa(".button-row .button").forEach((button) => {
    const label = button.textContent.trim().toLowerCase();

    button.addEventListener("click", async () => {
      if (label.includes("save state profile")) {
        saveState();
        renderLiveTrace("[STATE] profile saved");
        showToast("State profile saved", "good");
        return;
      }

      if (label.includes("testing slice")) {
        const target = qsa(".main-layout .stack .panel")[2];
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        renderLiveTrace("[STATE] opened testing slice");
        showToast("Scrolled to Testing Slice", "good");
        return;
      }

      if (label.includes("run locked pipeline test")) {
        setBusy(true);
        const refreshResult = await callApi("/api/state/refresh", "POST");
        setBusy(false);

        if (refreshResult.ok) {
          state.lastRunStatus = "Refresh OK";
          saveState();
          await refreshOverview();
          await refreshModels();
          await refreshRuntimeEvents();
          renderAll();
          renderLiveTrace("[STATE] refresh requested");
          showToast("State refresh requested", "good");
        } else {
          showToast("State refresh failed", "warn");
        }
      }
    });
  });
}

function bindSelectPersistence() {
  qsa(".role-row .select").forEach((select) => {
    select.addEventListener("change", () => {
      saveState();
      renderLiveTrace(`[ROLE] updated ${select.value}`);
    });
  });
}

function renderAll() {
  renderHeroCards();
  renderCensus();
  renderRuntimeGrid();
  renderRuntimeEvents();
  bindRuntimeActions();
}

async function init() {
  renderAll();
  bindTopButtons();
  bindSelectPersistence();

  renderLiveTrace(`[API] bound to ${PM_API_BASE}`, false);

  await refreshOverview();
  await refreshModels();
  await refreshRuntimeEvents();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
