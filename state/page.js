const PM_STATE_KEY = "PM_STATE_V2";
const PM_API_BASE = window.PM_API_BASE || "";

const defaultState = {
  profileName: "Operator Baseline",
  testingSlice: "Homepage JS",
  runMode: "locked",
  lastRunStatus: "Pass",
  runtimeModels: [
    {
      id: "router-a",
      family: "router",
      alias: "pipe_router_gemma4b",
      placement: "GPU",
      state: "active",
      pin: "Pinned GPU"
    },
    {
      id: "router-b",
      family: "router",
      alias: "pipe_router_gemma4b",
      placement: "CPU",
      state: "active",
      pin: "Pin CPU"
    },
    {
      id: "router-c",
      family: "router",
      alias: "pipe_router_gemma4b",
      placement: "CPU",
      state: "cold",
      pin: "Standby"
    },
    {
      id: "planner-a",
      family: "planner",
      alias: "pipe_planner_qwen3_8b",
      placement: "GPU",
      state: "benchmark",
      pin: "Benchmark"
    },
    {
      id: "python-a",
      family: "python",
      alias: "pipe_python_coder_primary",
      placement: "CPU",
      state: "cold",
      pin: "Cold Standby"
    },
    {
      id: "cpp-a",
      family: "cpp",
      alias: "pipe_cpp_coder_primary",
      placement: "CPU",
      state: "cold",
      pin: "Cold Standby"
    }
  ],
  roleAssignments: {
    router: { quorum: "2-of-3 route agreement" },
    planner: { quorum: "2-of-3 plan agreement" },
    python: { quorum: "3-way diff + verifier" },
    cpp: { quorum: "compile + 2 verifier votes" },
    js: { quorum: "theme contract + 2-of-3" },
    verifier: { quorum: "2-of-3 approval required" },
    auditor: { quorum: "2-of-3 audit agreement" }
  }
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(PM_STATE_KEY);
    if (!raw) return deepClone(defaultState);
    return { ...deepClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return deepClone(defaultState);
  }
}

function saveState(state) {
  localStorage.setItem(PM_STATE_KEY, JSON.stringify(state));
}

let state = loadState();

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

function familyLabelClass(family) {
  if (["router", "planner", "python", "cpp", "js", "verify"].includes(family)) {
    return family === "verifier" ? "verify" : family;
  }
  return "";
}

function deriveCounts() {
  const active = state.runtimeModels.filter(m => m.state === "active").length;
  const cold = state.runtimeModels.filter(m => m.state === "cold").length;
  const benchmark = state.runtimeModels.filter(m => m.state === "benchmark").length;
  const gpu = state.runtimeModels.filter(m => m.placement === "GPU" && m.state === "active").length;
  const cpu = state.runtimeModels.filter(m => m.placement === "CPU" && m.state === "active").length;
  return { active, cold, benchmark, gpu, cpu };
}

function renderHeroCards() {
  const cards = qsa(".hero-grid .panel");
  if (cards.length < 4) return;
  const counts = deriveCounts();

  const statValues = qsa(".stat-value", cards[0]);
  if (statValues[0]) statValues[0].textContent = String(counts.active);

  const firstCardChips = qs(".chip-row", cards[0]);
  if (firstCardChips) {
    firstCardChips.innerHTML = `
      <div class="chip good">GPU ${counts.gpu} active</div>
      <div class="chip">CPU ${counts.cpu} active</div>
      <div class="chip warn">${counts.cold + counts.benchmark} non-hot</div>
    `;
  }

  const secondCardStat = qs(".stat-value", cards[1]);
  if (secondCardStat) secondCardStat.textContent = "3-of-3";

  const thirdCardStat = qs(".stat-value", cards[2]);
  if (thirdCardStat) thirdCardStat.textContent = state.testingSlice;

  const fourthCardStat = qs(".stat-value", cards[3]);
  if (fourthCardStat) fourthCardStat.textContent = state.lastRunStatus;
}

function renderCensus() {
  const censusCard = qsa(".main-layout .stack .panel")[0];
  if (!censusCard) return;

  const chipRow = qs(".chip-row", censusCard);
  if (!chipRow) return;

  chipRow.innerHTML = state.runtimeModels.map(model => {
    let tone = "";
    if (model.state === "active") tone = "good";
    if (model.state === "benchmark") tone = "warn";
    if (model.state === "disabled") tone = "bad";
    return `<div class="chip ${tone}">${model.id} ${model.state}</div>`;
  }).join("");
}

function renderRuntimeGrid() {
  const runtimePanel = qsa(".main-layout .stack .panel")[1];
  if (!runtimePanel) return;

  let runtimeGrid = qs(".runtime-grid", runtimePanel);
  if (!runtimeGrid) return;

  runtimeGrid.innerHTML = state.runtimeModels.map(model => {
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
          ${model.state === "active" ? `<button class="button button--small button--danger" data-action="stop">Stop</button>` : `<button class="button button--small button--primary" data-action="start">Start</button>`}
          <button class="button button--small" data-action="warm">Warm</button>
          <button class="button button--small" data-action="unload">Unload</button>
          <button class="button button--small" data-action="pin-cpu">Pin CPU</button>
          <button class="button button--small" data-action="pin-gpu">Pin GPU</button>
          <button class="button button--small button--danger" data-action="disable">Disable</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderLiveTrace(message) {
  const livePanel = qsa(".main-layout .stack .panel")[3];
  if (!livePanel) return;

  const log = qs(".live-log", livePanel);
  if (!log) return;

  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = message;
  log.prepend(line);

  const items = qsa(".log-line", log);
  if (items.length > 10) {
    items.slice(10).forEach(item => item.remove());
  }
}

async function callApi(path, method = "GET", payload = null) {
  if (!PM_API_BASE) {
    return { ok: false, mock: true };
  }

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

function updateModel(modelId, updater) {
  state.runtimeModels = state.runtimeModels.map(model =>
    model.id === modelId ? updater({ ...model }) : model
  );
  saveState(state);
  renderAll();
}

function handleModelAction(modelId, action) {
  const model = state.runtimeModels.find(item => item.id === modelId);
  if (!model) return;

  switch (action) {
    case "start":
      updateModel(modelId, m => ({ ...m, state: "active" }));
      renderLiveTrace(`[MODEL] ${modelId} started`);
      showToast(`${modelId} started`, "good");
      void callApi("/api/state/models/start", "POST", { model_id: modelId, alias: model.alias });
      break;
    case "stop":
      updateModel(modelId, m => ({ ...m, state: "cold" }));
      renderLiveTrace(`[MODEL] ${modelId} stopped`);
      showToast(`${modelId} stopped`, "warn");
      void callApi("/api/state/models/stop", "POST", { model_id: modelId, alias: model.alias });
      break;
    case "warm":
      updateModel(modelId, m => ({ ...m, state: "active" }));
      renderLiveTrace(`[MODEL] ${modelId} warmed`);
      showToast(`${modelId} warmed`, "good");
      void callApi("/api/state/models/warm", "POST", { model_id: modelId, alias: model.alias });
      break;
    case "unload":
      updateModel(modelId, m => ({ ...m, state: "cold" }));
      renderLiveTrace(`[MODEL] ${modelId} unloaded`);
      showToast(`${modelId} unloaded`, "warn");
      void callApi("/api/state/models/unload", "POST", { model_id: modelId, alias: model.alias });
      break;
    case "pin-cpu":
      updateModel(modelId, m => ({ ...m, placement: "CPU", pin: "Pinned CPU" }));
      renderLiveTrace(`[MODEL] ${modelId} pinned to CPU`);
      showToast(`${modelId} pinned to CPU`, "good");
      void callApi("/api/state/models/pin", "POST", { model_id: modelId, alias: model.alias, target: "CPU" });
      break;
    case "pin-gpu":
      updateModel(modelId, m => ({ ...m, placement: "GPU", pin: "Pinned GPU" }));
      renderLiveTrace(`[MODEL] ${modelId} pinned to GPU`);
      showToast(`${modelId} pinned to GPU`, "good");
      void callApi("/api/state/models/pin", "POST", { model_id: modelId, alias: model.alias, target: "GPU" });
      break;
    case "disable":
      updateModel(modelId, m => ({ ...m, state: "disabled" }));
      renderLiveTrace(`[MODEL] ${modelId} disabled`);
      showToast(`${modelId} disabled`, "bad");
      void callApi("/api/state/models/disable", "POST", { model_id: modelId, alias: model.alias });
      break;
    default:
      break;
  }
}

function bindRuntimeActions() {
  qsa(".runtime-model").forEach(card => {
    const modelId = card.dataset.modelId;
    qsa("[data-action]", card).forEach(button => {
      button.addEventListener("click", () => handleModelAction(modelId, button.dataset.action));
    });
  });
}

function bindTopButtons() {
  qsa(".button-row .button").forEach(button => {
    const label = button.textContent.trim().toLowerCase();

    button.addEventListener("click", async () => {
      if (label.includes("save state profile")) {
        saveState(state);
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
        renderLiveTrace("[PIPELINE] locked pipeline test requested");
        showToast("Locked pipeline test requested", "warn");
        const result = await callApi("/api/state/run-locked-pipeline-test", "POST", {
          slice: state.testingSlice,
          mode: state.runMode
        });

        if (result.ok) {
          state.lastRunStatus = "Running";
          saveState(state);
          renderAll();
          showToast("Backend accepted pipeline run", "good");
        } else {
          showToast("No live API yet. UI hook is ready.", "warn");
        }
      }
    });
  });
}

function bindSelectPersistence() {
  qsa(".role-row .select").forEach(select => {
    select.addEventListener("change", () => {
      saveState(state);
      renderLiveTrace(`[ROLE] updated ${select.value}`);
    });
  });
}

function renderAll() {
  renderHeroCards();
  renderCensus();
  renderRuntimeGrid();
  bindRuntimeActions();
}

function init() {
  renderAll();
  bindTopButtons();
  bindSelectPersistence();

  if (PM_API_BASE) {
    renderLiveTrace(`[API] bound to ${PM_API_BASE}`);
  } else {
    renderLiveTrace("[API] no PM_API_BASE set, using local UI state");
  }
}

document.addEventListener("DOMContentLoaded", init);
