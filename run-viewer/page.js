// /run-viewer/page.js — live pipeline run viewer
//
// Polls the backend at /api/pipelines/runs/{id} every 2s.
// Renders the pipeline graph using x/y from stages and deps for edges.
// Color-codes nodes by status. Click any node → sidebar inspector with output.
//
// URL: /run-viewer/?id=PRUN-XXXX
//
// Endpoints used:
//   GET  /api/pipelines/runs/active
//   GET  /api/pipelines/runs/{id}
//   GET  /api/pipelines/{pipeline_id}    (for stages topology)
//   POST /api/pipelines/runs/{id}/pause
//   POST /api/pipelines/runs/{id}/resume
//   POST /api/pipelines/runs/{id}/clear-gate

const API_BASE = (window.PM_API_BASE || "http://127.0.0.1:8384").replace(/\/+$/, "");
const POLL_INTERVAL_MS = 2000;

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  runId: null,
  runData: null,        // last /runs/{id} response
  pipelineDef: null,    // stages + deps (cached per pipeline)
  selectedNodeId: null,
  pollHandle: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  startTime: null,
  runtimeHandle: null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const dom = {
  runStatusChip: $("runStatusChip"),
  runProgressChip: $("runProgressChip"),
  runtimeChip: $("runtimeChip"),
  runTitle: $("runTitle"),
  runIdLabel: $("runIdLabel"),
  runMeta: $("runMeta"),
  activeRunsList: $("activeRunsList"),
  runIdInput: $("runIdInput"),
  openRunBtn: $("openRunBtn"),
  refreshRunsBtn: $("refreshRunsBtn"),
  pauseBtn: $("pauseBtn"),
  resumeBtn: $("resumeBtn"),
  clearGateBtn: $("clearGateBtn"),
  runCanvas: $("runCanvas"),
  canvasWorld: $("canvasWorld"),
  edgeSvg: $("edgeSvg"),
  canvasHint: $("canvasHint"),
  zoomLabel: $("zoomLabel"),
  zoomInBtn: $("zoomInBtn"),
  zoomOutBtn: $("zoomOutBtn"),
  zoomFitBtn: $("zoomFitBtn"),
  inspectorTitle: $("inspectorTitle"),
  inspectorStatusChip: $("inspectorStatusChip"),
  kvRole: $("kvRole"),
  kvModel: $("kvModel"),
  kvStatus: $("kvStatus"),
  kvLatency: $("kvLatency"),
  kvSize: $("kvSize"),
  kvLibwrite: $("kvLibwrite"),
  nodeOutputBox: $("nodeOutputBox"),
  nodeErrorBox: $("nodeErrorBox"),
  toast: $("toast"),
};

// ── Utils ─────────────────────────────────────────────────────────────────────
function showToast(msg, kind = "") {
  dom.toast.textContent = msg;
  dom.toast.className = "toast is-visible" + (kind ? " " + kind : "");
  setTimeout(() => { dom.toast.className = "toast"; }, 3500);
}

async function api(path, opts = {}) {
  try {
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${err.slice(0, 200)}`);
    }
    return await res.json();
  } catch (e) {
    console.error("api err", path, e);
    throw e;
  }
}

function fmtBytes(n) {
  if (!n) return "0";
  if (n < 1024) return n + " chars";
  return (n / 1024).toFixed(1) + "k";
}
function fmtTime(s) {
  if (!s || isNaN(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ── Run ID resolution from URL ────────────────────────────────────────────────
function getRunIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}
function setRunIdInUrl(id) {
  const u = new URL(window.location);
  if (id) u.searchParams.set("id", id);
  else u.searchParams.delete("id");
  window.history.replaceState({}, "", u);
}

// ── Active runs list ──────────────────────────────────────────────────────────
async function loadActiveRuns() {
  try {
    const data = await api("/api/pipelines/runs/active");
    const items = data.items || [];
    if (items.length === 0) {
      dom.activeRunsList.innerHTML = '<span class="soft" style="font-size:12px;">No active runs</span>';
      return;
    }
    dom.activeRunsList.innerHTML = items.map(r => `
      <div class="run-row ${state.runId === r.public_id ? "is-active" : ""}" data-id="${escapeHtml(r.public_id)}">
        <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">
          <span class="run-row-id">${escapeHtml(r.public_id)}</span>
          <span class="run-row-status run-row-status--${escapeHtml(r.status || "running")}">${escapeHtml(r.status || "?")}</span>
        </div>
        <div class="run-row-pipeline">${escapeHtml(r.pipeline_id || "?")}</div>
        <div class="run-row-meta">
          <span>${escapeHtml(r.started_at ? r.started_at.split(".")[0] : "")}</span>
        </div>
      </div>
    `).join("");
    dom.activeRunsList.querySelectorAll(".run-row").forEach(el => {
      el.addEventListener("click", () => loadRun(el.dataset.id));
    });
  } catch (e) {
    dom.activeRunsList.innerHTML = `<span class="soft" style="color: var(--bad); font-size: 12px;">Error: ${escapeHtml(e.message)}</span>`;
  }
}

// ── Load and render a run ─────────────────────────────────────────────────────
async function loadRun(runId) {
  if (!runId) return;
  if (state.pollHandle) { clearInterval(state.pollHandle); state.pollHandle = null; }
  if (state.runtimeHandle) { clearInterval(state.runtimeHandle); state.runtimeHandle = null; }

  state.runId = runId;
  state.selectedNodeId = null;
  setRunIdInUrl(runId);
  dom.runIdLabel.textContent = runId;
  dom.canvasHint.style.display = "none";

  try {
    await refreshRunData();           // populates state.runData
    await loadPipelineDef();          // populates state.pipelineDef
    renderGraph();
    state.pollHandle = setInterval(refreshRunData, POLL_INTERVAL_MS);
    state.runtimeHandle = setInterval(updateRuntime, 1000);
    loadActiveRuns();                  // refresh active list highlight
  } catch (e) {
    showToast(`Failed to load run: ${e.message}`, "bad");
  }
}

async function refreshRunData() {
  try {
    const data = await api(`/api/pipelines/runs/${state.runId}`);
    state.runData = data;
    if (data.started_at && !state.startTime) {
      // started_at is a string like "2026-05-01 17:39:23.248517"
      state.startTime = new Date(data.started_at.replace(" ", "T") + "Z").getTime();
    }
    updateHeader();
    updateNodeStates();
    if (state.selectedNodeId) renderInspector(state.selectedNodeId);
    if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
      if (state.pollHandle) { clearInterval(state.pollHandle); state.pollHandle = null; }
      if (state.runtimeHandle) { clearInterval(state.runtimeHandle); state.runtimeHandle = null; }
    }
  } catch (e) {
    console.error("refreshRunData failed", e);
  }
}

async function loadPipelineDef() {
  if (!state.runData || !state.runData.pipeline_id) return;
  if (state.pipelineDef && state.pipelineDef.public_id === state.runData.pipeline_id) return;
  try {
    const data = await api(`/api/pipelines/${state.runData.pipeline_id}`);
    state.pipelineDef = data;
    // stages may be string-encoded
    let stages = data.stages;
    if (typeof stages === "string") {
      try { stages = JSON.parse(stages); } catch { stages = []; }
    }
    state.pipelineDef.stages_parsed = Array.isArray(stages) ? stages : [];
  } catch (e) {
    console.error("loadPipelineDef failed", e);
    state.pipelineDef = { stages_parsed: [] };
  }
}

// ── Header ────────────────────────────────────────────────────────────────────
function updateHeader() {
  const d = state.runData;
  if (!d) return;
  const ns = d.node_states || {};
  const total = Object.keys(ns).length;
  const done = Object.values(ns).filter(n => n.status === "done").length;
  const running = Object.values(ns).filter(n => n.status === "running").length;
  const failed = Object.values(ns).filter(n => n.status === "failed").length;

  dom.runProgressChip.textContent = `${done}/${total || "?"}`;

  const status = d.status || "?";
  let statusClass = "";
  if (status === "running") statusClass = "status-chip--warn";
  else if (status === "completed" || status === "done") statusClass = "status-chip--good";
  else if (status === "failed") statusClass = "status-chip--bad";
  else if (status === "paused") statusClass = "status-chip--gate";
  dom.runStatusChip.className = "chip " + statusClass;
  dom.runStatusChip.textContent = status + (running ? ` · ${running} running` : "") + (failed ? ` · ${failed} failed` : "");

  dom.runTitle.textContent = d.pipeline_id || "—";
  dom.runMeta.textContent = `started ${d.started_at || ""} · ${total} nodes`;

  // Buttons
  const isPaused = !!d.pause_requested;
  const hasGate = Object.values(ns).some(n => n.status === "running" && state.pipelineDef?.stages_parsed?.find(s => s.id === n.node_id && s.kind === "gate"));
  dom.pauseBtn.disabled = !state.runId || isPaused || status !== "running";
  dom.resumeBtn.disabled = !state.runId || !isPaused;
  dom.clearGateBtn.disabled = !state.runId || !hasGate;
}

function updateRuntime() {
  if (!state.startTime) return;
  const elapsed = (Date.now() - state.startTime) / 1000;
  dom.runtimeChip.textContent = fmtTime(elapsed);
}

// ── Graph rendering ───────────────────────────────────────────────────────────
function renderGraph() {
  if (!state.pipelineDef || !state.pipelineDef.stages_parsed) return;
  const stages = state.pipelineDef.stages_parsed;

  // Clear existing nodes (keep svg)
  Array.from(dom.canvasWorld.querySelectorAll(".run-node")).forEach(el => el.remove());

  // Compute layout bounds for fit
  const positions = stages.map(s => ({ id: s.id, x: parseInt(s.x) || 100, y: parseInt(s.y) || 100 }));
  const maxX = Math.max(...positions.map(p => p.x)) + 200;
  const maxY = Math.max(...positions.map(p => p.y)) + 200;
  dom.canvasWorld.style.width = Math.max(maxX, 800) + "px";
  dom.canvasWorld.style.height = Math.max(maxY, 600) + "px";
  dom.edgeSvg.setAttribute("width", dom.canvasWorld.style.width);
  dom.edgeSvg.setAttribute("height", dom.canvasWorld.style.height);

  // Render nodes
  stages.forEach(stage => {
    const el = document.createElement("div");
    el.className = "run-node";
    el.dataset.nodeId = stage.id;
    el.dataset.kind = stage.kind || "transform";
    el.dataset.status = "pending";
    el.style.left = (parseInt(stage.x) || 100) + "px";
    el.style.top = (parseInt(stage.y) || 100) + "px";
    const modelName = (stage.models && stage.models[0]) || "—";
    const libWrite = stage.library_write?.table || "";
    el.innerHTML = `
      <div class="run-node-role">${escapeHtml(stage.role || stage.kind || "node")}</div>
      <div class="run-node-title">${escapeHtml(stage.title || stage.id)}</div>
      <div class="run-node-model">${escapeHtml(modelName)}</div>
      <div class="run-node-meta">
        <span class="run-node-status" data-statuslabel>pending</span>
        ${libWrite ? `<span class="run-node-libwrite">→ ${escapeHtml(libWrite)}</span>` : ""}
      </div>
    `;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      selectNode(stage.id);
    });
    dom.canvasWorld.appendChild(el);
  });

  // Render edges
  renderEdges();

  // Apply current run states
  updateNodeStates();

  // Auto-fit on first render
  fitToCanvas();
}

function renderEdges() {
  const stages = state.pipelineDef.stages_parsed;
  // Clear existing paths
  Array.from(dom.edgeSvg.querySelectorAll("path")).forEach(p => p.remove());

  const nodeMap = {};
  stages.forEach(s => { nodeMap[s.id] = s; });

  stages.forEach(stage => {
    const deps = Array.isArray(stage.deps) ? stage.deps : [];
    deps.forEach(depId => {
      const dep = nodeMap[depId];
      if (!dep) return;
      const x1 = (parseInt(dep.x) || 0) + 80;     // bottom-center of upstream node (160 wide)
      const y1 = (parseInt(dep.y) || 0) + 70;
      const x2 = (parseInt(stage.x) || 0) + 80;   // top-center of downstream
      const y2 = (parseInt(stage.y) || 0);
      const dx = (y2 - y1) * 0.4;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${y1 + dx}, ${x2} ${y2 - dx}, ${x2} ${y2}`);
      path.dataset.from = depId;
      path.dataset.to = stage.id;
      dom.edgeSvg.appendChild(path);
    });
  });
}

function updateNodeStates() {
  if (!state.runData) return;
  const ns = state.runData.node_states || {};
  Array.from(dom.canvasWorld.querySelectorAll(".run-node")).forEach(el => {
    const nodeId = el.dataset.nodeId;
    const nodeState = ns[nodeId];
    const status = nodeState?.status || "pending";
    el.dataset.status = status;
    if (state.selectedNodeId === nodeId) el.classList.add("is-selected");
    else el.classList.remove("is-selected");
    const statusLabel = el.querySelector("[data-statuslabel]");
    if (statusLabel) statusLabel.textContent = status;
  });

  // Update edges
  Array.from(dom.edgeSvg.querySelectorAll("path")).forEach(path => {
    const from = path.dataset.from;
    const to = path.dataset.to;
    const fromStatus = ns[from]?.status;
    const toStatus = ns[to]?.status;
    if (fromStatus === "done" && toStatus === "running") {
      path.dataset.active = "true";
      delete path.dataset.completed;
    } else if (fromStatus === "done" && toStatus === "done") {
      path.dataset.completed = "true";
      delete path.dataset.active;
    } else {
      delete path.dataset.active;
      delete path.dataset.completed;
    }
  });
}

// ── Inspector ─────────────────────────────────────────────────────────────────
function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  Array.from(dom.canvasWorld.querySelectorAll(".run-node")).forEach(el => {
    if (el.dataset.nodeId === nodeId) el.classList.add("is-selected");
    else el.classList.remove("is-selected");
  });
  renderInspector(nodeId);
}

function renderInspector(nodeId) {
  const stages = state.pipelineDef?.stages_parsed || [];
  const stage = stages.find(s => s.id === nodeId);
  const nodeState = (state.runData?.node_states || {})[nodeId];
  if (!stage) {
    dom.inspectorTitle.textContent = nodeId;
    return;
  }
  dom.inspectorTitle.textContent = stage.title || nodeId;
  const status = nodeState?.status || "pending";
  dom.inspectorStatusChip.textContent = status;
  dom.inspectorStatusChip.className = "status-chip " + ({
    pending: "",
    running: "status-chip--warn",
    done: "status-chip--good",
    failed: "status-chip--bad",
  }[status] || "");

  dom.kvRole.textContent = stage.role || stage.kind || "—";
  dom.kvModel.textContent = (stage.models && stage.models[0]) || "—";
  dom.kvStatus.textContent = status;

  let latency = "—";
  if (nodeState?.started_at && nodeState?.finished_at) {
    const ms = new Date(nodeState.finished_at.replace(" ", "T") + "Z").getTime() - new Date(nodeState.started_at.replace(" ", "T") + "Z").getTime();
    if (!isNaN(ms)) latency = fmtTime(ms / 1000);
  } else if (nodeState?.started_at && status === "running") {
    const ms = Date.now() - new Date(nodeState.started_at.replace(" ", "T") + "Z").getTime();
    if (!isNaN(ms)) latency = fmtTime(ms / 1000) + " (running)";
  }
  dom.kvLatency.textContent = latency;

  const output = nodeState?.output || "";
  dom.kvSize.textContent = fmtBytes(output.length);

  if (stage.library_write) {
    const lw = stage.library_write;
    dom.kvLibwrite.textContent = `${lw.table || "?"}.${lw.content_field || lw.operation || "?"}`;
  } else {
    dom.kvLibwrite.textContent = "—";
  }

  if (output && output.length > 0) {
    dom.nodeOutputBox.classList.remove("is-empty");
    dom.nodeOutputBox.textContent = output.slice(0, 4000) + (output.length > 4000 ? "\n\n…(truncated)" : "");
  } else {
    dom.nodeOutputBox.classList.add("is-empty");
    dom.nodeOutputBox.textContent = status === "running" ? "Generating…" : "No output yet";
  }

  const err = nodeState?.error || "";
  if (err) {
    dom.nodeErrorBox.textContent = err;
    dom.nodeErrorBox.classList.remove("is-empty");
  } else {
    dom.nodeErrorBox.classList.add("is-empty");
    dom.nodeErrorBox.textContent = nodeState?.retry_count ? `${nodeState.retry_count} retries` : "—";
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────
async function pauseRun() {
  if (!state.runId) return;
  try {
    await api(`/api/pipelines/runs/${state.runId}/pause`, { method: "POST" });
    showToast("Pause requested", "good");
    refreshRunData();
  } catch (e) { showToast(`Pause failed: ${e.message}`, "bad"); }
}
async function resumeRun() {
  if (!state.runId) return;
  try {
    await api(`/api/pipelines/runs/${state.runId}/resume`, { method: "POST" });
    showToast("Resume requested", "good");
    refreshRunData();
  } catch (e) { showToast(`Resume failed: ${e.message}`, "bad"); }
}
async function clearGate() {
  if (!state.runId) return;
  try {
    await api(`/api/pipelines/runs/${state.runId}/clear-gate`, { method: "POST" });
    showToast("Gate cleared", "good");
    refreshRunData();
  } catch (e) { showToast(`Clear gate failed: ${e.message}`, "bad"); }
}

// ── Zoom and pan ──────────────────────────────────────────────────────────────
function applyTransform() {
  dom.canvasWorld.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  dom.zoomLabel.textContent = Math.round(state.zoom * 100) + "%";
}
function zoomBy(factor) {
  state.zoom = Math.max(0.2, Math.min(2.5, state.zoom * factor));
  applyTransform();
}
function fitToCanvas() {
  const cw = dom.runCanvas.clientWidth;
  const ch = dom.runCanvas.clientHeight;
  const ww = parseFloat(dom.canvasWorld.style.width) || 1600;
  const wh = parseFloat(dom.canvasWorld.style.height) || 1600;
  const sx = (cw - 40) / ww;
  const sy = (ch - 40) / wh;
  state.zoom = Math.min(sx, sy, 1);
  state.panX = (cw - ww * state.zoom) / 2;
  state.panY = 20;
  applyTransform();
}

dom.runCanvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomBy(e.deltaY > 0 ? 0.92 : 1.08);
}, { passive: false });

dom.runCanvas.addEventListener("mousedown", (e) => {
  if (e.target.closest(".run-node")) return;
  state.isDragging = true;
  state.dragStartX = e.clientX - state.panX;
  state.dragStartY = e.clientY - state.panY;
  dom.runCanvas.style.cursor = "grabbing";
});
window.addEventListener("mousemove", (e) => {
  if (!state.isDragging) return;
  state.panX = e.clientX - state.dragStartX;
  state.panY = e.clientY - state.dragStartY;
  applyTransform();
});
window.addEventListener("mouseup", () => {
  state.isDragging = false;
  dom.runCanvas.style.cursor = "default";
});

// ── Wire up controls ──────────────────────────────────────────────────────────
dom.zoomInBtn.addEventListener("click", () => zoomBy(1.15));
dom.zoomOutBtn.addEventListener("click", () => zoomBy(0.87));
dom.zoomFitBtn.addEventListener("click", fitToCanvas);
dom.openRunBtn.addEventListener("click", () => {
  const id = (dom.runIdInput.value || "").trim();
  if (id) loadRun(id);
});
dom.runIdInput.addEventListener("keydown", (e) => { if (e.key === "Enter") dom.openRunBtn.click(); });
dom.refreshRunsBtn.addEventListener("click", loadActiveRuns);
dom.pauseBtn.addEventListener("click", pauseRun);
dom.resumeBtn.addEventListener("click", resumeRun);
dom.clearGateBtn.addEventListener("click", clearGate);

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  loadActiveRuns();
  setInterval(loadActiveRuns, 10000);  // refresh active list every 10s
  const fromUrl = getRunIdFromUrl();
  if (fromUrl) {
    loadRun(fromUrl);
  }
}
init();
