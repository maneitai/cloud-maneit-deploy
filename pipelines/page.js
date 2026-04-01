const PM_PIPELINES_KEY = "PM_PIPELINES_V5";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_TYPES = [
  { id: "research",        label: "Research",         portal: "research-core",  color: "#6ee7ff" },
  { id: "appcreation",     label: "App Creation",     portal: "appcreator",     color: "#b3ffd8" },
  { id: "portalcreation",  label: "Portal Creation",  portal: "portalcreator",  color: "#d4b8ff" },
  { id: "creativewriting", label: "Creative Writing",  portal: "lorecore",       color: "#ffd0dc" },
  { id: "gamedesign",      label: "Game Design",      portal: "game-designer",  color: "#ffe49f" },
];

const TYPE_COLORS = {
  input:      { badge: "#9fe8ff", bg: "rgba(110,231,255,0.12)" },
  planner:    { badge: "#d4b8ff", bg: "rgba(139,92,246,0.14)"  },
  coder:      { badge: "#b3ffd8", bg: "rgba(52,211,153,0.14)"  },
  verifier:   { badge: "#ffe49f", bg: "rgba(251,191,36,0.16)"  },
  auditor:    { badge: "#ffd0dc", bg: "rgba(251,113,133,0.14)" },
  branch:     { badge: "#cdd6e5", bg: "rgba(255,255,255,0.08)" },
  projection: { badge: "#bfe0ff", bg: "rgba(96,165,250,0.16)"  },
};

const SUBTYPE_MAP = {
  Coder:      ["C++ Coder","Python Coder","JS Coder","HTML Coder","Backend API Coder"],
  Planner:    ["Structured Planner","Chapter Planner","Research Planner","Game Planner"],
  Verifier:   ["Strict Verifier","Compile Verifier","Contract Verifier","Canon Verifier"],
  Auditor:    ["Audit Writer","Policy Auditor","Release Auditor"],
  Router:     ["Task Router","Provider Router","Stage Router"],
  Branch:     ["Fallback Branch","Quorum Split","Failure Branch"],
  Handoff:    ["Portal Handoff","Worker Handoff"],
  Export:     ["Bundle Export","Artifact Export"],
  Projection: ["Projects Projection","PortalCreator Projection","AppCreator Projection"],
};

const ROLE_TYPE_MAP = {
  Coder:"coder", Planner:"planner", Verifier:"verifier", Auditor:"auditor",
  Router:"planner", Branch:"branch", Handoff:"branch", Export:"projection", Projection:"projection",
};

const NODE_W = 210;
const NODE_H = 120;

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_NODES = [
  { id:"node-input",    title:"Brief Intake",       type:"input",      model:"", x:40,   y:60,  notes:"", quorumRule:"single pass", timeout:"60s" },
  { id:"node-planner",  title:"Structured Planner", type:"planner",    model:"", x:300,  y:60,  notes:"", quorumRule:"2-of-3",      timeout:"90s" },
  { id:"node-coder",    title:"C++ Coder",           type:"coder",      model:"", x:560,  y:60,  notes:"", quorumRule:"2-of-3",      timeout:"120s"},
  { id:"node-verifier", title:"Strict Verifier",     type:"verifier",   model:"", x:820,  y:60,  notes:"", quorumRule:"3-of-3",      timeout:"60s" },
  { id:"node-auditor",  title:"Audit Node",          type:"auditor",    model:"", x:1080, y:60,  notes:"", quorumRule:"2-of-3",      timeout:"60s" },
  { id:"node-branch",   title:"Fallback Path",       type:"branch",     model:"", x:300,  y:260, notes:"", quorumRule:"single pass", timeout:"45s" },
];
const DEFAULT_EDGES = [
  { id:"e1", from:"node-input",    to:"node-planner"  },
  { id:"e2", from:"node-planner",  to:"node-coder"    },
  { id:"e3", from:"node-coder",    to:"node-verifier" },
  { id:"e4", from:"node-verifier", to:"node-auditor"  },
  { id:"e5", from:"node-planner",  to:"node-branch"   },
];

function freshState() {
  return {
    pipelineType: "research",
    pipelineTitle: "",
    savedPipelineId: null,
    selectedNodeId: null,
    tool: "select",
    linkSource: null,
    pipelines: [],
    availableModels: [],
    nodes: JSON.parse(JSON.stringify(DEFAULT_NODES)),
    edges: JSON.parse(JSON.stringify(DEFAULT_EDGES)),
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(PM_PIPELINES_KEY);
    if (!raw) return freshState();
    const p = JSON.parse(raw);
    return { ...freshState(), ...p, tool: "select", linkSource: null,
      nodes: Array.isArray(p.nodes) ? p.nodes : JSON.parse(JSON.stringify(DEFAULT_NODES)),
      edges: Array.isArray(p.edges) ? p.edges : JSON.parse(JSON.stringify(DEFAULT_EDGES)),
      pipelines: Array.isArray(p.pipelines) ? p.pipelines : [],
      availableModels: Array.isArray(p.availableModels) ? p.availableModels : [],
    };
  } catch { return freshState(); }
}

function saveState() {
  const s = { ...state, tool: "select", linkSource: null };
  localStorage.setItem(PM_PIPELINES_KEY, JSON.stringify(s));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const uid = () => `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2800);
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

// ── Model pool ────────────────────────────────────────────────────────────────

function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

async function loadModels() {
  const r = await callApi("/api/model-pool/models?sync=false");
  if (!r.ok) return;
  const items = Array.isArray(r.body?.items) ? r.body.items : [];
  // Use home surface allowlist as temporary pool for pipeline
  state.availableModels = items
    .filter(m => m.enabled !== false && m.runtime_driver === "openai_api" && parseSurfaces(m.surface_allowlist).includes("home"))
    .map(m => ({ value: m.alias || m.name, label: m.name || m.alias }));
  saveState();
}

function modelOptions(selected = "") {
  const opts = [`<option value="">— no model —</option>`];
  state.availableModels.forEach(m => {
    opts.push(`<option value="${esc(m.value)}" ${m.value === selected ? "selected" : ""}>${esc(m.label)}</option>`);
  });
  return opts.join("");
}

// ── Canvas / geometry ─────────────────────────────────────────────────────────

function portCenter(node, side) {
  // Absolute position of port center within canvas
  if (side === "out") return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
  return { x: node.x, y: node.y + NODE_H / 2 };
}

// ── SVG edges ─────────────────────────────────────────────────────────────────

function renderEdges() {
  const svg = qs("#edgeSvg"); if (!svg) return;
  // Keep defs, remove old paths/polygons
  qsa("path, polygon", svg).forEach(el => el.remove());

  state.edges.forEach(edge => {
    const from = state.nodes.find(n => n.id === edge.from);
    const to   = state.nodes.find(n => n.id === edge.to);
    if (!from || !to) return;

    const p1 = portCenter(from, "out");
    const p2 = portCenter(to, "in");
    const dx = Math.abs(p2.x - p1.x) * 0.5;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${p1.x},${p1.y} C${p1.x+dx},${p1.y} ${p2.x-dx},${p2.y} ${p2.x},${p2.y}`);
    path.setAttribute("stroke", "url(#edgeGrad)");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.dataset.edgeId = edge.id;
    path.style.cursor = "pointer";
    path.addEventListener("click", () => {
      state.edges = state.edges.filter(e => e.id !== edge.id);
      saveState(); renderEdges();
      showToast("Connection removed", "warn");
    });
    svg.appendChild(path);

    // Arrowhead
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const ax = p2.x - 10 * Math.cos(angle);
    const ay = p2.y - 10 * Math.sin(angle);
    const arr = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arr.setAttribute("points", [
      [p2.x, p2.y],
      [ax - 5*Math.sin(angle), ay + 5*Math.cos(angle)],
      [ax + 5*Math.sin(angle), ay - 5*Math.cos(angle)],
    ].map(p => p.join(",")).join(" "));
    arr.setAttribute("fill", "rgba(110,231,255,0.7)");
    arr.style.pointerEvents = "none";
    svg.appendChild(arr);
  });

  // Preview edge during linking
  if (state.tool === "link" && state.linkSource && state._linkMousePos) {
    const from = state.nodes.find(n => n.id === state.linkSource);
    if (from) {
      const p1 = portCenter(from, "out");
      const p2 = state._linkMousePos;
      const dx = Math.abs(p2.x - p1.x) * 0.4;
      const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
      preview.setAttribute("d", `M${p1.x},${p1.y} C${p1.x+dx},${p1.y} ${p2.x-dx},${p2.y} ${p2.x},${p2.y}`);
      preview.setAttribute("stroke", "rgba(52,211,153,0.6)");
      preview.setAttribute("stroke-width", "2");
      preview.setAttribute("stroke-dasharray", "6 4");
      preview.setAttribute("fill", "none");
      preview.style.pointerEvents = "none";
      svg.appendChild(preview);
    }
  }
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

function renderNodes() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  qsa(".pipeline-node", canvas).forEach(el => el.remove());

  state.nodes.forEach(node => {
    const col = TYPE_COLORS[node.type] || TYPE_COLORS.input;
    const isSelected = node.id === state.selectedNodeId;
    const isLinkSrc  = node.id === state.linkSource;
    const modelLabel = state.availableModels.find(m => m.value === node.model)?.label || node.model || "—";

    const el = document.createElement("article");
    el.className = "pipeline-node"
      + (isSelected  ? " is-selected"    : "")
      + (isLinkSrc   ? " is-link-source" : "");
    el.dataset.nodeId = node.id;
    el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${NODE_W}px;`;

    el.innerHTML = `
      <div class="node-head">
        <span class="node-badge" style="color:${col.badge};background:${col.bg};">${node.type}</span>
        <button class="node-del" data-del="${esc(node.id)}" title="Remove">✕</button>
      </div>
      <div class="node-title">${esc(node.title)}</div>
      <div class="node-model">${esc(modelLabel)}</div>
      <div class="node-ports">
        <div class="port port-in"  data-node="${esc(node.id)}" data-side="in"  title="Input"></div>
        <div class="port port-out" data-node="${esc(node.id)}" data-side="out" title="Click to link"></div>
      </div>
    `;
    canvas.appendChild(el);
  });

  bindDrag();
  bindPortClicks();
  bindNodeSelect();
  bindDelBtns();
}

function renderAll() {
  renderNodes();
  renderEdges();
  updateInspector();
  renderPipelineSelector();
  updateToolbar();
  renderPipelineTypePicker();
}

// ── Drag (fixed — port clicks excluded from capture) ─────────────────────────

function bindDrag() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  let active = null, ox = 0, oy = 0, didMove = false;

  qsa(".pipeline-node", canvas).forEach(el => {
    el.addEventListener("pointerdown", e => {
      // Never capture if clicking a port, delete btn, or select
      if (e.target.closest(".port") || e.target.closest(".node-del") || e.target.closest("select")) return;
      const node = state.nodes.find(n => n.id === el.dataset.nodeId); if (!node) return;
      active = { node, el };
      didMove = false;
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
      let x = Math.max(0, Math.min(e.clientX - rect.left - ox, canvas.offsetWidth  - NODE_W));
      let y = Math.max(0, Math.min(e.clientY - rect.top  - oy, canvas.offsetHeight - NODE_H));
      active.node.x = x; active.node.y = y;
      el.style.left = x + "px"; el.style.top = y + "px";
      didMove = true;
      renderEdges();
    });

    el.addEventListener("pointerup", () => {
      if (!active || active.el !== el) return;
      el.style.cursor = "";
      if (didMove) saveState();
      active = null;
    });

    el.addEventListener("pointercancel", () => { active = null; });
  });
}

// ── Port clicks (independent of drag — never captured) ────────────────────────

function bindPortClicks() {
  qsa(".port").forEach(port => {
    port.addEventListener("pointerdown", e => {
      e.stopPropagation(); // prevent drag from starting
    });

    port.addEventListener("click", e => {
      e.stopPropagation();
      const nodeId = port.dataset.node;
      const side   = port.dataset.side;

      if (!state.linkSource) {
        // Start link from any port (prefer out as source)
        state.tool = "link";
        state.linkSource = nodeId;
        state._linkSide = side;
        updateToolbar();
        renderNodes(); // highlight source
        showToast("Click another node's port to connect", "good");
      } else {
        // Complete the link
        if (state.linkSource === nodeId) {
          // Clicked same node — cancel
          cancelLink();
          return;
        }

        // Determine from/to based on which sides were clicked
        let from, to;
        if (state._linkSide === "out" && side === "in") {
          from = state.linkSource; to = nodeId;
        } else if (state._linkSide === "in" && side === "out") {
          from = nodeId; to = state.linkSource;
        } else if (state._linkSide === "out") {
          from = state.linkSource; to = nodeId;
        } else {
          from = nodeId; to = state.linkSource;
        }

        const exists = state.edges.some(e => e.from === from && e.to === to);
        if (!exists) {
          state.edges.push({ id: uid(), from, to });
          saveState();
          showToast("Connected", "good");
        } else {
          showToast("Already connected", "warn");
        }
        cancelLink();
        renderAll();
      }
    });
  });
}

function cancelLink() {
  state.linkSource = null;
  state._linkSide = null;
  state._linkMousePos = null;
  state.tool = "select";
  updateToolbar();
  renderNodes();
  renderEdges();
}

// Track mouse for preview edge
function bindCanvasMouseMove() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  canvas.addEventListener("mousemove", e => {
    if (state.tool !== "link" || !state.linkSource) return;
    const rect = canvas.getBoundingClientRect();
    state._linkMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    renderEdges();
  });
  canvas.addEventListener("click", e => {
    if (e.target === canvas || e.target.classList.contains("canvas-grid")) {
      if (state.tool === "link") { cancelLink(); return; }
      state.selectedNodeId = null;
      renderNodes();
      updateInspector();
    }
  });
}

function bindNodeSelect() {
  qsa(".pipeline-node").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".port") || e.target.closest(".node-del") || e.target.closest("select")) return;
      if (state.tool === "link") return; // don't select while linking
      selectNode(el.dataset.nodeId);
    });
  });
}

function bindDelBtns() {
  qsa(".node-del").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.dataset.del;
      state.nodes = state.nodes.filter(n => n.id !== id);
      state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
      if (state.selectedNodeId === id) state.selectedNodeId = null;
      saveState(); renderAll();
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
  qs("#selectedNodeTitle").textContent       = node?.title || "No node selected";
  qs("#selectedNodeDesc").textContent        = node ? `Type: ${node.type}` : "Select a node to inspect.";
  qs("#inspectorQuorumRule").value           = node?.quorumRule || "single pass";
  qs("#inspectorTimeout").value              = node?.timeout    || "60s";
  qs("#inspectorNotes").value                = node?.notes      || "";

  const wrap = qs("#inspectorModelWrap");
  if (wrap) {
    if (node) {
      wrap.innerHTML = `<label class="inline-field"><span class="soft">Assigned model</span><select class="select" id="inspectorModel" style="font-size:12px;">${modelOptions(node.model)}</select></label>`;
      qs("#inspectorModel")?.addEventListener("change", e => {
        const n = state.nodes.find(n => n.id === state.selectedNodeId);
        if (n) { n.model = e.target.value; saveState(); renderNodes(); }
      });
    } else {
      wrap.innerHTML = `<span class="soft" style="font-size:12px;">Select a node to assign a model.</span>`;
    }
  }
}

function persistInspector() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId); if (!node) return;
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
  const lb = qs("[data-tool='link']");
  if (lb) lb.textContent = state.tool === "link" ? "🔗 linking… (cancel)" : "link nodes";
}

// ── Pipeline type picker ──────────────────────────────────────────────────────

function renderPipelineTypePicker() {
  const wrap = qs("#pipelineTypePicker"); if (!wrap) return;
  wrap.innerHTML = PIPELINE_TYPES.map(t => `
    <button class="type-pill ${state.pipelineType === t.id ? "type-pill--active" : ""}"
      data-type="${esc(t.id)}" style="--pill-color:${t.color};" type="button">
      ${esc(t.label)}
    </button>
  `).join("");
  qsa(".type-pill", wrap).forEach(btn => {
    btn.addEventListener("click", () => {
      state.pipelineType = btn.dataset.type;
      saveState();
      renderPipelineTypePicker();
      updateSaveBtnState();
    });
  });
}

function updateSaveBtnState() {
  const btn = qs("#savePipelineBtn");
  if (!btn) return;
  const title = qs("#pipelineTitleInput")?.value.trim() || "";
  btn.disabled = !title;
  btn.textContent = state.savedPipelineId ? "Update pipeline" : "Save pipeline";
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

function refillSubtypes() {
  const rc = qs("#spawnRoleClass")?.value || "Coder";
  const el = qs("#spawnSubtype"); if (!el) return;
  el.innerHTML = (SUBTYPE_MAP[rc] || ["Generic"]).map((v,i) => `<option ${i===0?"selected":""}>${v}</option>`).join("");
}

function renderSpawnModel() {
  const wrap = qs("#spawnModelWrap"); if (!wrap) return;
  wrap.innerHTML = `<label class="inline-field"><span class="soft">Assign model</span><select class="select" id="spawnModel" style="font-size:12px;">${modelOptions()}</select></label>`;
}

function spawnNode() {
  const roleClass = qs("#spawnRoleClass")?.value || "Coder";
  const subtype   = qs("#spawnSubtype")?.value   || roleClass;
  const model     = qs("#spawnModel")?.value      || "";
  const type      = ROLE_TYPE_MAP[roleClass]      || "coder";
  const count     = state.nodes.length;
  const node = {
    id: uid(), title: subtype, type, model,
    x: 40 + (count % 5) * 270,
    y: 360 + Math.floor(count / 5) * 200,
    notes: "", quorumRule: "single pass", timeout: "60s",
  };
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  saveState(); renderAll();
  showToast(`${node.title} spawned`, "good");
}

// ── Pipeline selector (backend saved pipelines) ───────────────────────────────

function renderPipelineSelector() {
  const sel = qs("#pipelineSelector"); if (!sel) return;
  sel.innerHTML = state.pipelines.length
    ? state.pipelines.map(p => `<option value="${esc(p.id)}" ${p.id===state.savedPipelineId?"selected":""}>${esc(p.title)}</option>`).join("")
    : `<option value="">No saved pipelines</option>`;
}

async function refreshPipelines() {
  const r = await callApi("/api/pipelines");
  if (!r.ok) return;
  state.pipelines = (r.body?.items || []).map(p => ({
    id: p.public_id || p.id,
    title: p.title || p.name || "Untitled",
    type: p.type || "",
  }));
  saveState(); renderPipelineSelector();
}

// ── Save pipeline to backend ──────────────────────────────────────────────────

async function savePipeline() {
  const title = qs("#pipelineTitleInput")?.value.trim();
  if (!title) { showToast("Add a pipeline title first", "warn"); return; }

  const graphJson = JSON.stringify({ nodes: state.nodes, edges: state.edges });
  const payload = {
    title,
    type: state.pipelineType,
    description: `${PIPELINE_TYPES.find(t=>t.id===state.pipelineType)?.label || ""} pipeline`,
    stages: graphJson,
  };

  const btn = qs("#savePipelineBtn");
  if (btn) btn.disabled = true;

  let r;
  if (state.savedPipelineId) {
    // No update route yet — clone approach or just create new
    r = await callApi("/api/pipelines", "POST", payload);
  } else {
    r = await callApi("/api/pipelines", "POST", payload);
  }

  if (btn) btn.disabled = false;

  if (!r.ok) { showToast("Save failed", "warn"); return; }

  state.savedPipelineId = r.body?.public_id || r.body?.id;
  saveState();
  await refreshPipelines();
  showToast(`Pipeline saved — available in ${PIPELINE_TYPES.find(t=>t.id===state.pipelineType)?.label || ""}`, "good");
  renderPipelineSelector();
}

// ── Load a saved pipeline into the canvas ────────────────────────────────────

async function loadSavedPipeline(pipelineId) {
  const r = await callApi(`/api/pipelines`);
  if (!r.ok) return;
  const found = (r.body?.items || []).find(p => (p.public_id||p.id) === pipelineId);
  if (!found) return;
  try {
    const graph = JSON.parse(found.stages || "{}");
    if (Array.isArray(graph.nodes)) state.nodes = graph.nodes;
    if (Array.isArray(graph.edges)) state.edges = graph.edges;
    state.pipelineType = found.type || state.pipelineType;
    state.savedPipelineId = pipelineId;
    if (qs("#pipelineTitleInput")) qs("#pipelineTitleInput").value = found.name || found.title || "";
    saveState(); renderAll();
    showToast("Pipeline loaded", "good");
  } catch { showToast("Could not parse pipeline graph", "warn"); }
}

// ── Bind events ───────────────────────────────────────────────────────────────

function bindEvents() {
  // Toolbar
  qs("[data-tool='select']")?.addEventListener("click", () => {
    cancelLink(); state.tool = "select"; updateToolbar(); renderNodes();
    showToast("Select mode", "good");
  });
  qs("[data-tool='link']")?.addEventListener("click", () => {
    if (state.tool === "link") { cancelLink(); }
    else { state.tool = "link"; state.linkSource = null; updateToolbar(); showToast("Click a port to start linking", "good"); }
  });
  qs("[data-tool='inspect']")?.addEventListener("click", () => {
    if (state.selectedNodeId) qs("#inspectorPanel")?.scrollIntoView({ behavior: "smooth" });
    else showToast("Select a node first", "warn");
  });
  qs("[data-tool='clear']")?.addEventListener("click", () => {
    if (!confirm("Clear all nodes and connections?")) return;
    state.nodes = []; state.edges = []; state.selectedNodeId = null; state.savedPipelineId = null;
    cancelLink(); saveState(); renderAll();
    showToast("Pipeline cleared", "warn");
  });
  qs("[data-tool='reset']")?.addEventListener("click", () => {
    if (!confirm("Reset to default pipeline?")) return;
    state.nodes = JSON.parse(JSON.stringify(DEFAULT_NODES));
    state.edges = JSON.parse(JSON.stringify(DEFAULT_EDGES));
    state.selectedNodeId = null; cancelLink(); saveState(); renderAll();
    showToast("Reset to default", "good");
  });

  // Spawn
  qs("#spawnRoleClass")?.addEventListener("change", () => { refillSubtypes(); renderSpawnModel(); });
  qs("#spawnNodeBtn")?.addEventListener("click", spawnNode);
  qs("#spawnBranchBtn")?.addEventListener("click", () => {
    state.nodes.push({ id: uid(), title: "Branch", type: "branch", model: "", x: 200, y: 480, notes: "", quorumRule: "single pass", timeout: "45s" });
    saveState(); renderAll(); showToast("Branch spawned", "good");
  });

  // Save
  qs("#savePipelineBtn")?.addEventListener("click", savePipeline);
  qs("#pipelineTitleInput")?.addEventListener("input", updateSaveBtnState);

  // Load saved pipeline
  qs("#loadPipelineBtn")?.addEventListener("click", () => {
    const id = qs("#pipelineSelector")?.value;
    if (!id) { showToast("No pipeline selected", "warn"); return; }
    loadSavedPipeline(id);
  });

  // Clone
  qs("#clonePipelineBtn")?.addEventListener("click", async () => {
    const id = qs("#pipelineSelector")?.value;
    if (!id) { showToast("No saved pipeline selected", "warn"); return; }
    const r = await callApi(`/api/pipelines/${encodeURIComponent(id)}/clone`, "POST");
    if (!r.ok) { showToast("Clone failed", "warn"); return; }
    await refreshPipelines(); showToast("Pipeline cloned", "good");
  });

  // Inspector persistence
  qs("#inspectorQuorumRule")?.addEventListener("change", persistInspector);
  qs("#inspectorTimeout")?.addEventListener("change", persistInspector);
  qs("#inspectorNotes")?.addEventListener("input", persistInspector);

  // Library chips
  qsa(".library-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const map = { Input:"Coder", Planner:"Planner", Verifier:"Verifier", Auditor:"Auditor",
        "Python Generator":"Coder", "C++ Generator":"Coder", "JS Generator":"Coder",
        Branch:"Branch", Handoff:"Handoff", Export:"Export", "Portal Projection":"Projection", Router:"Router" };
      const rc = qs("#spawnRoleClass");
      if (rc) { rc.value = map[chip.textContent.trim()] || "Coder"; refillSubtypes(); renderSpawnModel(); }
    });
  });

  bindCanvasMouseMove();
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  refillSubtypes();
  renderSpawnModel();
  bindEvents();
  renderAll();
  updateSaveBtnState();
  await Promise.all([loadModels(), refreshPipelines()]);
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
