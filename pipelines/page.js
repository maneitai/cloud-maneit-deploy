const PM_PIPELINES_KEY = "PM_PIPELINES_V4";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ── State ─────────────────────────────────────────────────────────────────────

const defaultState = {
  selectedPipelineId: "",
  selectedNodeId: null,
  portalPreviewVisible: true,
  tool: "select", // select | link
  linkSource: null,
  pipelines: [],
  availableModels: [],
  nodes: [
    { id: "node-input",      title: "Brief Intake",       type: "input",      model: "", x: 46,   y: 60,  notes: "", quorumRule: "single pass", timeout: "60s"  },
    { id: "node-planner",    title: "Structured Planner", type: "planner",    model: "", x: 310,  y: 60,  notes: "", quorumRule: "2-of-3",     timeout: "90s"  },
    { id: "node-coder",      title: "C++ Coder",          type: "coder",      model: "", x: 574,  y: 60,  notes: "", quorumRule: "2-of-3",     timeout: "120s" },
    { id: "node-verifier",   title: "Strict Verifier",    type: "verifier",   model: "", x: 838,  y: 60,  notes: "", quorumRule: "3-of-3",     timeout: "60s"  },
    { id: "node-auditor",    title: "Audit Node",         type: "auditor",    model: "", x: 1102, y: 60,  notes: "", quorumRule: "2-of-3",     timeout: "60s"  },
    { id: "node-branch",     title: "Fallback Path",      type: "branch",     model: "", x: 310,  y: 260, notes: "", quorumRule: "single pass", timeout: "45s"  },
    { id: "node-projection", title: "Portal Projection",  type: "projection", model: "", x: 1102, y: 260, notes: "", quorumRule: "single pass", timeout: "30s"  },
  ],
  edges: [
    { id: "e1", from: "node-input",    to: "node-planner"    },
    { id: "e2", from: "node-planner",  to: "node-coder"      },
    { id: "e3", from: "node-coder",    to: "node-verifier"   },
    { id: "e4", from: "node-verifier", to: "node-auditor"    },
    { id: "e5", from: "node-planner",  to: "node-branch"     },
  ],
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(PM_PIPELINES_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultState));
    const parsed = JSON.parse(raw);
    return {
      ...JSON.parse(JSON.stringify(defaultState)),
      ...parsed,
      pipelines: Array.isArray(parsed.pipelines) ? parsed.pipelines : [],
      availableModels: Array.isArray(parsed.availableModels) ? parsed.availableModels : [],
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : JSON.parse(JSON.stringify(defaultState.nodes)),
      edges: Array.isArray(parsed.edges) ? parsed.edges : JSON.parse(JSON.stringify(defaultState.edges)),
      tool: "select",
      linkSource: null,
    };
  } catch { return JSON.parse(JSON.stringify(defaultState)); }
}

function saveState() {
  const s = { ...state, tool: "select", linkSource: null };
  localStorage.setItem(PM_PIPELINES_KEY, JSON.stringify(s));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

function uid() { return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`; }

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2600);
}

async function callApi(path, method = "GET", payload = null) {
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, {
      method, headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

// ── Model pool ────────────────────────────────────────────────────────────────

async function loadModels() {
  const r = await callApi("/api/model-pool/models?sync=false");
  if (!r.ok) return;
  const items = Array.isArray(r.body?.items) ? r.body.items : [];
  state.availableModels = items
    .filter(m => m.enabled !== false && m.runtime_driver === "openai_api")
    .map(m => ({ value: m.alias || m.name, label: m.name || m.alias }));
  saveState();
  renderAll();
}

function modelDropdownHtml(selectedValue = "", extraClass = "") {
  const opts = [
    `<option value="">— no model —</option>`,
    ...state.availableModels.map(m =>
      `<option value="${esc(m.value)}" ${m.value === selectedValue ? "selected" : ""}>${esc(m.label)}</option>`
    )
  ].join("");
  return `<select class="select node-model-select ${extraClass}" style="font-size:11px;padding:4px 6px;">${opts}</select>`;
}

// ── Canvas geometry ───────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 130;

function nodeCenter(node) {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
}

function portPos(node, side) {
  if (side === "right") return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
  return { x: node.x, y: node.y + NODE_H / 2 };
}

// ── SVG edge rendering ────────────────────────────────────────────────────────

function renderEdges() {
  const svg = qs("#edgeSvg"); if (!svg) return;
  svg.innerHTML = "";

  state.edges.forEach(edge => {
    const from = state.nodes.find(n => n.id === edge.from);
    const to   = state.nodes.find(n => n.id === edge.to);
    if (!from || !to) return;

    const p1 = portPos(from, "right");
    const p2 = portPos(to, "left");
    const cx = (p1.x + p2.x) / 2;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${p1.x},${p1.y} C${cx},${p1.y} ${cx},${p2.y} ${p2.x},${p2.y}`);
    path.setAttribute("stroke", "url(#edgeGrad)");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.dataset.edgeId = edge.id;
    path.style.cursor = "pointer";
    path.addEventListener("click", () => deleteEdge(edge.id));
    path.setAttribute("title", "Click to remove connection");
    svg.appendChild(path);

    // Arrow head
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const ax = p2.x - 10 * Math.cos(angle);
    const ay = p2.y - 10 * Math.sin(angle);
    const arr = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    const pts = [
      [p2.x, p2.y],
      [ax - 5 * Math.sin(angle), ay + 5 * Math.cos(angle)],
      [ax + 5 * Math.sin(angle), ay - 5 * Math.cos(angle)],
    ].map(p => p.join(",")).join(" ");
    arr.setAttribute("points", pts);
    arr.setAttribute("fill", "rgba(110,231,255,0.7)");
    arr.style.pointerEvents = "none";
    svg.appendChild(arr);
  });
}

function deleteEdge(edgeId) {
  state.edges = state.edges.filter(e => e.id !== edgeId);
  saveState();
  renderEdges();
  showToast("Connection removed", "warn");
}

// ── Node rendering ────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  input:      { badge: "#9fe8ff", bg: "rgba(110,231,255,0.12)" },
  planner:    { badge: "#d4b8ff", bg: "rgba(139,92,246,0.14)"  },
  coder:      { badge: "#b3ffd8", bg: "rgba(52,211,153,0.14)"  },
  verifier:   { badge: "#ffe49f", bg: "rgba(251,191,36,0.16)"  },
  auditor:    { badge: "#ffd0dc", bg: "rgba(251,113,133,0.14)" },
  branch:     { badge: "#cdd6e5", bg: "rgba(255,255,255,0.08)" },
  projection: { badge: "#bfe0ff", bg: "rgba(96,165,250,0.16)"  },
};

function esc(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function renderNodes() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  qsa(".pipeline-node", canvas).forEach(el => el.remove());

  state.nodes.forEach(node => {
    const col = TYPE_COLORS[node.type] || TYPE_COLORS.input;
    const isSelected = node.id === state.selectedNodeId;
    const isLinkSrc  = node.id === state.linkSource;
    const modelLabel = state.availableModels.find(m => m.value === node.model)?.label || node.model || "—";

    const el = document.createElement("article");
    el.className = "pipeline-node" + (isSelected ? " is-selected" : "") + (isLinkSrc ? " is-link-source" : "");
    el.dataset.nodeId = node.id;
    el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${NODE_W}px;min-height:${NODE_H}px;`;

    el.innerHTML = `
      <div class="node-head">
        <span class="node-type-badge" style="color:${col.badge};background:${col.bg};">${node.type}</span>
        <button class="node-delete-btn" data-node-id="${esc(node.id)}" title="Remove node">✕</button>
      </div>
      <div class="node-title">${esc(node.title)}</div>
      <div class="node-model-label" title="${esc(node.model)}">${esc(modelLabel)}</div>
      <div class="node-ports">
        <div class="port port-left"  data-node-id="${esc(node.id)}" data-port="left"  title="Input port"></div>
        <div class="port port-right" data-node-id="${esc(node.id)}" data-port="right" title="Output port — click to link"></div>
      </div>
    `;

    canvas.appendChild(el);
  });

  makeDraggable();
  bindPortClicks();
  bindNodeClicks();
  bindDeleteBtns();
}

function renderAll() {
  renderNodes();
  renderEdges();
  updateInspector();
  renderPipelineSelector();
  updateToolbar();
}

// ── Drag ──────────────────────────────────────────────────────────────────────

function makeDraggable() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  let active = null, ox = 0, oy = 0, moved = false;

  qsa(".pipeline-node", canvas).forEach(el => {
    el.addEventListener("pointerdown", e => {
      if (e.target.closest(".port") || e.target.closest(".node-delete-btn") || e.target.closest("select")) return;
      const node = state.nodes.find(n => n.id === el.dataset.nodeId); if (!node) return;
      active = { node, el };
      moved = false;
      const rect = canvas.getBoundingClientRect();
      ox = e.clientX - rect.left - node.x;
      oy = e.clientY - rect.top  - node.y;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      e.stopPropagation();
    });

    el.addEventListener("pointermove", e => {
      if (!active || active.el !== el) return;
      const rect = canvas.getBoundingClientRect();
      let x = e.clientX - rect.left - ox;
      let y = e.clientY - rect.top  - oy;
      x = Math.max(0, Math.min(x, canvas.offsetWidth  - NODE_W));
      y = Math.max(0, Math.min(y, canvas.offsetHeight - NODE_H));
      active.node.x = x;
      active.node.y = y;
      el.style.left = x + "px";
      el.style.top  = y + "px";
      moved = true;
      renderEdges();
    });

    el.addEventListener("pointerup", e => {
      if (!active || active.el !== el) return;
      el.style.cursor = "";
      if (moved) saveState();
      active = null;
    });

    el.addEventListener("pointercancel", () => { active = null; });
  });
}

// ── Port click → link ─────────────────────────────────────────────────────────

function bindPortClicks() {
  qsa(".port").forEach(port => {
    port.addEventListener("click", e => {
      e.stopPropagation();
      const nodeId = port.dataset.nodeId;
      const side   = port.dataset.port;

      if (state.tool !== "link") {
        // Auto-enter link mode on port click
        state.tool = "link";
        updateToolbar();
      }

      if (!state.linkSource) {
        // First click — set source (prefer right port as output)
        state.linkSource = nodeId;
        renderNodes();
        showToast("Click another node's port to connect", "good");
      } else {
        // Second click — create edge
        if (state.linkSource === nodeId) {
          state.linkSource = null;
          state.tool = "select";
          renderNodes();
          updateToolbar();
          return;
        }
        const from = side === "left" ? nodeId : state.linkSource;
        const to   = side === "left" ? state.linkSource : nodeId;
        // Avoid duplicate
        const exists = state.edges.some(e => e.from === from && e.to === to);
        if (!exists) {
          state.edges.push({ id: uid(), from, to });
          saveState();
          showToast("Nodes connected", "good");
        } else {
          showToast("Already connected", "warn");
        }
        state.linkSource = null;
        state.tool = "select";
        renderAll();
        updateToolbar();
      }
    });
  });
}

function bindNodeClicks() {
  qsa(".pipeline-node").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".port") || e.target.closest(".node-delete-btn") || e.target.closest("select")) return;
      selectNode(el.dataset.nodeId);
    });
  });
}

function bindDeleteBtns() {
  qsa(".node-delete-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.dataset.nodeId;
      state.nodes = state.nodes.filter(n => n.id !== id);
      state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
      if (state.selectedNodeId === id) state.selectedNodeId = null;
      saveState();
      renderAll();
      showToast("Node removed", "warn");
    });
  });
}

// ── Inspector ─────────────────────────────────────────────────────────────────

function selectNode(id) {
  state.selectedNodeId = id;
  saveState();
  renderNodes();
  renderEdges();
  updateInspector();
}

function updateInspector() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId);

  qs("#selectedNodeTitle").textContent       = node?.title       || "No node selected";
  qs("#selectedNodeDescription").textContent = node?.type        ? `Type: ${node.type}` : "Select a node to inspect.";
  qs("#inspectorQuorumRule").value           = node?.quorumRule  || "single pass";
  qs("#inspectorTimeout").value              = node?.timeout     || "60s";
  qs("#inspectorNotes").value                = node?.notes       || "";

  const modelWrap = qs("#inspectorModelWrap");
  if (modelWrap) {
    if (node) {
      modelWrap.innerHTML = `<label class="inline-field"><span class="soft">Assigned model</span>${modelDropdownHtml(node.model, "inspector-model-select")}</label>`;
      qs(".inspector-model-select")?.addEventListener("change", e => {
        const n = state.nodes.find(n => n.id === state.selectedNodeId);
        if (n) { n.model = e.target.value; saveState(); renderNodes(); }
      });
    } else {
      modelWrap.innerHTML = `<span class="soft">Select a node to assign a model.</span>`;
    }
  }
}

function persistInspector() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId);
  if (!node) return;
  node.quorumRule = qs("#inspectorQuorumRule")?.value || node.quorumRule;
  node.timeout    = qs("#inspectorTimeout")?.value    || node.timeout;
  node.notes      = qs("#inspectorNotes")?.value      || "";
  saveState();
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function updateToolbar() {
  qsa(".chip-button[data-tool]").forEach(btn => {
    btn.classList.toggle("chip-button--active", btn.dataset.tool === state.tool);
  });
  const linkBtn = qs("[data-tool='link']");
  if (linkBtn) linkBtn.textContent = state.tool === "link" ? "🔗 linking (cancel)" : "link nodes";
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

const SUBTYPE_MAP = {
  Coder:     ["C++ Coder","Python Coder","JS Coder","HTML Coder","Backend API Coder"],
  Planner:   ["Structured Planner","Chapter Planner","Research Planner"],
  Verifier:  ["Strict Verifier","Compile Verifier","Contract Verifier"],
  Auditor:   ["Audit Writer","Policy Auditor","Release Auditor"],
  Router:    ["Task Router","Provider Router","Stage Router"],
  Branch:    ["Fallback Branch","Quorum Split","Failure Branch"],
  Handoff:   ["Portal Handoff","Worker Handoff"],
  Export:    ["Bundle Export","Artifact Export"],
  Projection:["Projects Projection","PortalCreator Projection"],
};

const TYPE_MAP = {
  Coder:"coder", Planner:"planner", Verifier:"verifier", Auditor:"auditor",
  Router:"planner", Branch:"branch", Handoff:"branch", Export:"projection", Projection:"projection",
};

function spawnNode() {
  const roleClass = qs("#spawnRoleClass")?.value || "Coder";
  const subtype   = qs("#spawnSubtype")?.value   || "";
  const model     = qs("#spawnModelSelect")?.value || "";
  const type      = TYPE_MAP[roleClass] || "coder";

  // Place below existing nodes, staggered
  const count = state.nodes.length;
  const x = 46 + (count % 4) * 264;
  const y = 380 + Math.floor(count / 4) * 180;

  const node = {
    id: uid(), title: subtype || roleClass, type, model, x, y,
    notes: "", quorumRule: "single pass", timeout: "60s",
  };
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  saveState();
  renderAll();
  showToast(`${node.title} spawned`, "good");
}

function refillSubtypes() {
  const rc = qs("#spawnRoleClass")?.value || "Coder";
  const opts = (SUBTYPE_MAP[rc] || ["Generic"]).map((v,i) => `<option ${i===0?"selected":""}>${v}</option>`).join("");
  const el = qs("#spawnSubtype"); if (el) el.innerHTML = opts;
}

function clearPipeline() {
  if (!confirm("Clear all nodes and connections?")) return;
  state.nodes = [];
  state.edges = [];
  state.selectedNodeId = null;
  state.linkSource = null;
  state.tool = "select";
  saveState();
  renderAll();
  showToast("Pipeline cleared", "warn");
}

function resetToDefault() {
  if (!confirm("Reset to default pipeline?")) return;
  const def = JSON.parse(JSON.stringify(defaultState));
  state.nodes = def.nodes;
  state.edges = def.edges;
  state.selectedNodeId = null;
  state.linkSource = null;
  state.tool = "select";
  saveState();
  renderAll();
  showToast("Pipeline reset", "good");
}

// ── Pipeline selector ─────────────────────────────────────────────────────────

function renderPipelineSelector() {
  const sel = qs("#pipelineSelector"); if (!sel) return;
  sel.innerHTML = state.pipelines.length
    ? state.pipelines.map(p => `<option value="${esc(p.id)}" ${p.id===state.selectedPipelineId?"selected":""}>${esc(p.title)}</option>`).join("")
    : `<option value="">No backend pipelines</option>`;
}

async function refreshPipelines() {
  const r = await callApi("/api/pipelines");
  if (!r.ok) return;
  state.pipelines = (r.body?.items || []).map(p => ({
    id: p.public_id || p.pipeline_public_id || p.id || "",
    title: p.title || p.name || "Untitled",
  }));
  if (!state.selectedPipelineId && state.pipelines[0]) state.selectedPipelineId = state.pipelines[0].id;
  saveState();
  renderPipelineSelector();
}

// ── Spawn model selector ──────────────────────────────────────────────────────

function renderSpawnModelSelect() {
  const wrap = qs("#spawnModelWrap"); if (!wrap) return;
  wrap.innerHTML = `<label class="inline-field"><span class="soft">Assign model</span>${modelDropdownHtml("", "")}</label>`;
  const sel = wrap.querySelector("select");
  if (sel) sel.id = "spawnModelSelect";
}

// ── Bind all events ───────────────────────────────────────────────────────────

function bindEvents() {
  // Toolbar tools
  qs("[data-tool='select']")?.addEventListener("click", () => {
    state.tool = "select"; state.linkSource = null;
    updateToolbar(); renderNodes();
    showToast("Select mode", "good");
  });
  qs("[data-tool='link']")?.addEventListener("click", () => {
    if (state.tool === "link") { state.tool = "select"; state.linkSource = null; renderNodes(); }
    else { state.tool = "link"; showToast("Click a port to start linking", "good"); }
    updateToolbar();
  });
  qs("[data-tool='inspect']")?.addEventListener("click", () => {
    if (state.selectedNodeId) {
      qs("#inspectorPanel")?.scrollIntoView({ behavior: "smooth" });
    } else { showToast("Select a node first", "warn"); }
  });
  qs("[data-tool='clear']")?.addEventListener("click", clearPipeline);
  qs("[data-tool='reset']")?.addEventListener("click", resetToDefault);

  // Spawn
  qs("#spawnRoleClass")?.addEventListener("change", () => { refillSubtypes(); renderSpawnModelSelect(); });
  qs("#spawnNodeBtn")?.addEventListener("click", spawnNode);
  qs("#spawnBranchBtn")?.addEventListener("click", () => {
    state.nodes.push({ id: uid(), title: "Branch", type: "branch", model: "", x: 200, y: 480, notes: "", quorumRule: "single pass", timeout: "45s" });
    saveState(); renderAll(); showToast("Branch spawned", "good");
  });

  // Portal preview
  qs("#togglePortalPreviewBtn")?.addEventListener("click", () => {
    state.portalPreviewVisible = !state.portalPreviewVisible;
    saveState();
    const prev = qs(".portal-preview");
    if (prev) prev.style.display = state.portalPreviewVisible ? "flex" : "none";
    showToast(`Portal preview ${state.portalPreviewVisible ? "shown" : "hidden"}`, "good");
  });

  // Clone pipeline
  qs("#clonePipelineBtn")?.addEventListener("click", async () => {
    if (!state.selectedPipelineId) { showToast("No backend pipeline selected", "warn"); return; }
    const r = await callApi(`/api/pipelines/${encodeURIComponent(state.selectedPipelineId)}/clone`, "POST");
    if (!r.ok) { showToast("Clone failed", "warn"); return; }
    await refreshPipelines();
    showToast("Pipeline cloned", "good");
  });

  // Run
  qs("#runSelectedPipelineBtn")?.addEventListener("click", () => {
    showToast("Pipeline execution not wired yet", "warn");
  });

  // Pipeline selector
  qs("#pipelineSelector")?.addEventListener("change", e => {
    state.selectedPipelineId = e.target.value;
    saveState();
  });

  // Inspector persistence
  qs("#inspectorQuorumRule")?.addEventListener("change", persistInspector);
  qs("#inspectorTimeout")?.addEventListener("change", persistInspector);
  qs("#inspectorNotes")?.addEventListener("input", persistInspector);

  // Canvas background click — deselect
  qs("#pipelineCanvas")?.addEventListener("click", e => {
    if (e.target.id === "pipelineCanvas" || e.target.classList.contains("canvas-grid")) {
      if (state.tool === "link" && state.linkSource) {
        state.linkSource = null;
        renderNodes();
      } else {
        state.selectedNodeId = null;
        renderNodes();
        updateInspector();
      }
    }
  });

  // Library chips → spawn shortcut
  qsa(".library-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const role = chip.textContent.trim();
      const rc = qs("#spawnRoleClass");
      if (rc) {
        // Map chip text to role class
        const map = { Input:"Coder", Planner:"Planner", Verifier:"Verifier", Auditor:"Auditor",
          "Python Generator":"Coder", "C++ Generator":"Coder", "JS Generator":"Coder",
          Branch:"Branch", Handoff:"Handoff", Export:"Export", "Portal Projection":"Projection",
          Router:"Router" };
        rc.value = map[role] || "Coder";
        refillSubtypes();
        renderSpawnModelSelect();
      }
      showToast(`Set role to ${role}`, "good");
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  refillSubtypes();
  renderSpawnModelSelect();
  bindEvents();
  renderAll();
  await Promise.all([loadModels(), refreshPipelines()]);
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
