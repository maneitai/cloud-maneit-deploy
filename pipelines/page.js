const PM_PIPELINES_KEY = "PM_PIPELINES_V6";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ── Role taxonomy ─────────────────────────────────────────────────────────────

const ROLE_GROUPS = [
  {
    group: "Orchestration",
    roles: [
      { title: "Project Manager",   type: "planner",    desc: "Owns the overall job. Distributes work, tracks progress, resolves conflicts." },
      { title: "Planner",           type: "planner",    desc: "Breaks down the brief into structured tasks with clear handoffs." },
      { title: "Task Distributor",  type: "planner",    desc: "Assigns tasks to downstream workers. Routes by capability." },
      { title: "Router",            type: "planner",    desc: "Routes output to the correct next stage based on content or condition." },
      { title: "Dispatcher",        type: "planner",    desc: "Schedules and fires off parallel worker lanes." },
      { title: "Branch",            type: "branch",     desc: "Explicit branch — alternate path triggered by condition." },
      { title: "Merge",             type: "planner",    desc: "Merges outputs from parallel lanes into a single coherent result." },
    ]
  },
  {
    group: "Research",
    roles: [
      { title: "Scout",             type: "input",      desc: "Initial broad search. Identifies relevant domains and sources." },
      { title: "Web Crawler",       type: "input",      desc: "Deep web search and page fetching. Returns structured source material." },
      { title: "Database Miner",    type: "input",      desc: "Targets specific databases, archives, or structured data sources." },
      { title: "Source Validator",  type: "verifier",   desc: "Checks source credibility, provenance, and reliability." },
      { title: "Citation Tracker",  type: "verifier",   desc: "Tracks citation chains and cross-references between sources." },
      { title: "Comparator",        type: "auditor",    desc: "Compares findings across multiple scouts. Surfaces agreements and conflicts." },
      { title: "Contradiction Finder", type: "auditor", desc: "Specifically hunts for contradictions and inconsistencies in source material." },
    ]
  },
  {
    group: "Analysis",
    roles: [
      { title: "Analyst",           type: "planner",    desc: "Deep analysis of gathered material. Builds structured insights." },
      { title: "Pattern Detector",  type: "planner",    desc: "Identifies recurring patterns, themes, and structures across sources." },
      { title: "Evidence Weigher",  type: "verifier",   desc: "Assigns confidence levels to claims. Separates strong evidence from speculation." },
      { title: "Cross Referencer",  type: "verifier",   desc: "Cross-references findings against known facts and other sources." },
    ]
  },
  {
    group: "Code",
    roles: [
      { title: "Python Coder",      type: "coder",      desc: "Python implementation. General purpose, data, scripting, backend." },
      { title: "JS Coder",          type: "coder",      desc: "JavaScript/TypeScript. Frontend, Node.js, tooling." },
      { title: "C++ Coder",         type: "coder",      desc: "C++ implementation. Performance-critical, systems, game engine." },
      { title: "HTML Coder",        type: "coder",      desc: "HTML/CSS markup and structure." },
      { title: "Backend API Coder", type: "coder",      desc: "API design and implementation. REST, FastAPI, Express." },
      { title: "Test Writer",       type: "verifier",   desc: "Writes tests for code output. Unit, integration, regression." },
      { title: "Code Reviewer",     type: "auditor",    desc: "Reviews code for correctness, security, style, and edge cases." },
      { title: "Resolver",          type: "planner",    desc: "Resolves conflicts between coder outputs. Picks or merges best result." },
    ]
  },
  {
    group: "Verification",
    roles: [
      { title: "Verifier",          type: "verifier",   desc: "General purpose verification. Checks output against spec and contract." },
      { title: "Fact Checker",      type: "verifier",   desc: "Checks factual claims against sources. Flags unsupported assertions." },
      { title: "Canon Auditor",     type: "auditor",    desc: "Checks output against established canon, rules, or constraints." },
      { title: "Quality Gate",      type: "verifier",   desc: "Hard pass/fail gate. Output must meet criteria to proceed." },
      { title: "Strict Auditor",    type: "auditor",    desc: "Final audit before promotion. Applies maximum scrutiny." },
    ]
  },
  {
    group: "Synthesis",
    roles: [
      { title: "Synthesizer",       type: "planner",    desc: "Combines multiple verified outputs into a coherent whole." },
      { title: "Report Builder",    type: "projection", desc: "Builds a structured report from synthesis output." },
      { title: "Dossier Writer",    type: "projection", desc: "Produces a research dossier with provenance and confidence levels." },
      { title: "Summary Writer",    type: "projection", desc: "Writes concise summaries of complex findings." },
    ]
  },
  {
    group: "Creative",
    roles: [
      { title: "Lore Writer",       type: "coder",      desc: "Generates lore-consistent creative content." },
      { title: "World Builder",     type: "planner",    desc: "Builds consistent world details, geography, factions, rules." },
      { title: "Scene Writer",      type: "coder",      desc: "Writes scenes with correct POV, tone, and beat structure." },
      { title: "Game Designer",     type: "planner",    desc: "Game mechanics, balance, progression, and system design." },
      { title: "Dialogue Writer",   type: "coder",      desc: "Character dialogue with voice consistency." },
    ]
  },
  {
    group: "Output",
    roles: [
      { title: "Formatter",         type: "projection", desc: "Formats output to required spec, schema, or style." },
      { title: "Exporter",          type: "projection", desc: "Packages output for delivery to downstream surface." },
      { title: "Training Pack Builder", type: "projection", desc: "Structures output as training data for model improvement." },
      { title: "Eval Pack Builder", type: "projection", desc: "Structures output as evaluation dataset." },
    ]
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap(g => g.roles.map(r => ({ ...r, group: g.group })));

const PIPELINE_TYPES = [
  { id: "research",        label: "Research",        color: "#6ee7ff", portal: "research-core"  },
  { id: "appcreation",     label: "App Creation",    color: "#b3ffd8", portal: "appcreator"     },
  { id: "portalcreation",  label: "Portal Creation", color: "#d4b8ff", portal: "portalcreator"  },
  { id: "creativewriting", label: "Creative Writing", color: "#ffd0dc", portal: "lorecore"      },
  { id: "gamedesign",      label: "Game Design",     color: "#ffe49f", portal: "game-designer"  },
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

const NODE_W = 200;
const NODE_H = 120;

// ── State ─────────────────────────────────────────────────────────────────────

function freshState() {
  return {
    pipelineType: "research",
    pipelineTitle: "",
    savedPipelineId: null,
    selectedNodeId: null,
    tool: "select",
    linkSource: null,
    linkSide: null,
    pipelines: [],
    availableModels: [],
    nodes: [],
    edges: [],
    // Canvas pan/zoom
    panX: 0, panY: 0, zoom: 1,
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(PM_PIPELINES_KEY);
    if (!raw) return freshState();
    const p = JSON.parse(raw);
    return {
      ...freshState(), ...p,
      tool: "select", linkSource: null, linkSide: null,
      nodes: Array.isArray(p.nodes) ? p.nodes : [],
      edges: Array.isArray(p.edges) ? p.edges : [],
      pipelines: Array.isArray(p.pipelines) ? p.pipelines : [],
      availableModels: Array.isArray(p.availableModels) ? p.availableModels : [],
      panX: p.panX || 0, panY: p.panY || 0, zoom: p.zoom || 1,
    };
  } catch { return freshState(); }
}

function saveState() {
  const s = { ...state, tool: "select", linkSource: null, linkSide: null };
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
    .filter(m => m.enabled !== false && m.runtime_driver === "openai_api"
      && parseSurfaces(m.surface_allowlist).includes("home"))
    .map(m => ({ value: m.alias || m.name, label: m.name || m.alias }));
  saveState();
  renderAll();
}

function modelOptions(selected = "") {
  return [`<option value="">— no model —</option>`,
    ...state.availableModels.map(m =>
      `<option value="${esc(m.value)}" ${m.value === selected ? "selected" : ""}>${esc(m.label)}</option>`)
  ].join("");
}

// ── Canvas transform ──────────────────────────────────────────────────────────

function applyTransform() {
  const world = qs("#canvasWorld"); if (!world) return;
  world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  world.style.transformOrigin = "0 0";
}

function screenToWorld(sx, sy) {
  const canvas = qs("#pipelineCanvas");
  const rect = canvas.getBoundingClientRect();
  return {
    x: (sx - rect.left - state.panX) / state.zoom,
    y: (sy - rect.top  - state.panY) / state.zoom,
  };
}

function bindPanZoom() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  let isPanning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
  let spaceDown = false;

  document.addEventListener("keydown", e => { if (e.code === "Space") { spaceDown = true; canvas.style.cursor = "grab"; e.preventDefault(); } });
  document.addEventListener("keyup",   e => { if (e.code === "Space") { spaceDown = false; canvas.style.cursor = ""; } });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.2, Math.min(3, state.zoom * factor));
    // Zoom toward mouse position
    state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
    state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;
    applyTransform();
    saveState();
    updateZoomLabel();
  }, { passive: false });

  canvas.addEventListener("pointerdown", e => {
    if (e.button === 1 || spaceDown) {
      isPanning = true;
      panStartX = e.clientX; panStartY = e.clientY;
      panOriginX = state.panX; panOriginY = state.panY;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", e => {
    if (!isPanning) return;
    state.panX = panOriginX + (e.clientX - panStartX);
    state.panY = panOriginY + (e.clientY - panStartY);
    applyTransform();
  });

  canvas.addEventListener("pointerup", e => {
    if (!isPanning) return;
    isPanning = false;
    canvas.style.cursor = spaceDown ? "grab" : "";
    saveState();
  });

  canvas.addEventListener("pointercancel", () => { isPanning = false; });

  // Zoom buttons
  qs("#zoomInBtn")?.addEventListener("click",  () => zoomBy(1.2));
  qs("#zoomOutBtn")?.addEventListener("click", () => zoomBy(0.8));
  qs("#zoomResetBtn")?.addEventListener("click", () => {
    state.panX = 0; state.panY = 0; state.zoom = 1;
    applyTransform(); saveState(); updateZoomLabel();
  });
  qs("#fitBtn")?.addEventListener("click", fitToScreen);
}

function zoomBy(factor) {
  const canvas = qs("#pipelineCanvas");
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const newZoom = Math.max(0.2, Math.min(3, state.zoom * factor));
  state.panX = cx - (cx - state.panX) * (newZoom / state.zoom);
  state.panY = cy - (cy - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;
  applyTransform(); saveState(); updateZoomLabel();
}

function fitToScreen() {
  if (!state.nodes.length) return;
  const canvas = qs("#pipelineCanvas");
  const rect = canvas.getBoundingClientRect();
  const minX = Math.min(...state.nodes.map(n => n.x));
  const minY = Math.min(...state.nodes.map(n => n.y));
  const maxX = Math.max(...state.nodes.map(n => n.x + NODE_W));
  const maxY = Math.max(...state.nodes.map(n => n.y + NODE_H));
  const w = maxX - minX + 80, h = maxY - minY + 80;
  const zoom = Math.min(0.95, Math.min(rect.width / w, rect.height / h));
  state.zoom = zoom;
  state.panX = (rect.width  - w * zoom) / 2 - minX * zoom + 40 * zoom;
  state.panY = (rect.height - h * zoom) / 2 - minY * zoom + 40 * zoom;
  applyTransform(); saveState(); updateZoomLabel();
}

function updateZoomLabel() {
  const el = qs("#zoomLabel");
  if (el) el.textContent = Math.round(state.zoom * 100) + "%";
}

// ── SVG edges ─────────────────────────────────────────────────────────────────

function renderEdges() {
  const svg = qs("#edgeSvg"); if (!svg) return;
  qsa("path, polygon", svg).forEach(el => el.remove());

  state.edges.forEach(edge => {
    const from = state.nodes.find(n => n.id === edge.from);
    const to   = state.nodes.find(n => n.id === edge.to);
    if (!from || !to) return;

    const p1 = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
    const p2 = { x: to.x,            y: to.y   + NODE_H / 2 };
    const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);

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

    // Arrow
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const ax = p2.x - 10 * Math.cos(angle), ay = p2.y - 10 * Math.sin(angle);
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

  // Link preview
  if (state.tool === "link" && state.linkSource && state._mousePos) {
    const from = state.nodes.find(n => n.id === state.linkSource);
    if (from) {
      const p1 = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
      const p2 = state._mousePos;
      const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
      preview.setAttribute("d", `M${p1.x},${p1.y} L${p2.x},${p2.y}`);
      preview.setAttribute("stroke", "rgba(52,211,153,0.5)");
      preview.setAttribute("stroke-width", "1.5");
      preview.setAttribute("stroke-dasharray", "6 4");
      preview.setAttribute("fill", "none");
      preview.style.pointerEvents = "none";
      svg.appendChild(preview);
    }
  }
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

function renderNodes() {
  const world = qs("#canvasWorld"); if (!world) return;
  qsa(".pipeline-node", world).forEach(el => el.remove());

  state.nodes.forEach(node => {
    const col = TYPE_COLORS[node.type] || TYPE_COLORS.input;
    const isSelected = node.id === state.selectedNodeId;
    const isLinkSrc  = node.id === state.linkSource;
    const modelLabel = state.availableModels.find(m => m.value === node.model)?.label || node.model || "— no model —";

    const el = document.createElement("article");
    el.className = "pipeline-node"
      + (isSelected ? " is-selected" : "")
      + (isLinkSrc  ? " is-link-source" : "");
    el.dataset.nodeId = node.id;
    el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${NODE_W}px;`;

    el.innerHTML = `
      <div class="node-head">
        <span class="node-badge" style="color:${col.badge};background:${col.bg};">${esc(node.group || node.type)}</span>
        <button class="node-del" data-del="${esc(node.id)}" title="Remove">✕</button>
      </div>
      <div class="node-title">${esc(node.title)}</div>
      <div class="node-model">${esc(modelLabel)}</div>
      <div class="node-ports">
        <div class="port port-in"  data-node="${esc(node.id)}" data-side="in"></div>
        <div class="port port-out" data-node="${esc(node.id)}" data-side="out"></div>
      </div>
    `;
    world.appendChild(el);
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
  renderPipelineTypePicker();
  updateToolbar();
  applyTransform();
  updateZoomLabel();
}

// ── Drag ──────────────────────────────────────────────────────────────────────

function bindDrag() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  let active = null, ox = 0, oy = 0, didMove = false;

  qsa(".pipeline-node").forEach(el => {
    el.addEventListener("pointerdown", e => {
      if (e.target.closest(".port") || e.target.closest(".node-del") || e.target.closest("select")) return;
      const node = state.nodes.find(n => n.id === el.dataset.nodeId); if (!node) return;
      active = { node, el }; didMove = false;
      // Convert screen position to world position
      const wp = screenToWorld(e.clientX, e.clientY);
      ox = wp.x - node.x; oy = wp.y - node.y;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      e.stopPropagation();
    });

    el.addEventListener("pointermove", e => {
      if (!active || active.el !== el) return;
      const wp = screenToWorld(e.clientX, e.clientY);
      active.node.x = Math.max(0, wp.x - ox);
      active.node.y = Math.max(0, wp.y - oy);
      el.style.left = active.node.x + "px";
      el.style.top  = active.node.y + "px";
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

// ── Port linking ──────────────────────────────────────────────────────────────

function bindPortClicks() {
  qsa(".port").forEach(port => {
    port.addEventListener("pointerdown", e => e.stopPropagation());
    port.addEventListener("click", e => {
      e.stopPropagation();
      const nodeId = port.dataset.node;
      const side   = port.dataset.side;

      if (!state.linkSource) {
        state.tool = "link";
        state.linkSource = nodeId;
        state.linkSide = side;
        updateToolbar();
        renderNodes();
        showToast("Click another node's port to connect", "good");
      } else {
        if (state.linkSource === nodeId) { cancelLink(); return; }
        let from = state.linkSide === "out" ? state.linkSource : nodeId;
        let to   = state.linkSide === "out" ? nodeId : state.linkSource;
        if (side === "out") { from = nodeId; to = state.linkSource; }
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
  state.linkSource = null; state.linkSide = null; state._mousePos = null;
  state.tool = "select";
  updateToolbar(); renderNodes(); renderEdges();
}

function bindCanvasEvents() {
  const canvas = qs("#pipelineCanvas"); if (!canvas) return;
  canvas.addEventListener("mousemove", e => {
    if (state.tool !== "link" || !state.linkSource) return;
    const wp = screenToWorld(e.clientX, e.clientY);
    state._mousePos = wp;
    renderEdges();
  });
  canvas.addEventListener("click", e => {
    if (e.target === canvas || e.target.id === "canvasWorld") {
      if (state.tool === "link") { cancelLink(); return; }
      state.selectedNodeId = null;
      renderNodes(); updateInspector();
    }
  });
}

function bindNodeSelect() {
  qsa(".pipeline-node").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".port") || e.target.closest(".node-del") || e.target.closest("select")) return;
      if (state.tool === "link") return;
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
  saveState(); renderNodes(); renderEdges(); updateInspector();
  qs("#inspectorPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateInspector() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId);
  qs("#selectedNodeTitle").textContent = node?.title || "No node selected";
  qs("#selectedNodeDesc").textContent  = node?.desc || (node ? `Type: ${node.type}` : "Select a node to inspect.");
  qs("#inspectorQuorumRule").value     = node?.quorumRule || "single pass";
  qs("#inspectorTimeout").value        = node?.timeout    || "60s";
  qs("#inspectorNotes").value          = node?.notes      || "";

  const wrap = qs("#inspectorModelWrap");
  if (!wrap) return;
  if (node) {
    wrap.innerHTML = `
      <label class="inline-field">
        <span class="soft">Assigned model</span>
        <select class="select" id="inspectorModel" style="font-size:12px;">${modelOptions(node.model)}</select>
      </label>
      <div class="node-info-box">
        <span class="soft" style="font-size:11px;">${esc(node.desc || "")}</span>
      </div>`;
    qs("#inspectorModel")?.addEventListener("change", e => {
      const n = state.nodes.find(n => n.id === state.selectedNodeId);
      if (n) { n.model = e.target.value; saveState(); renderNodes(); }
    });
  } else {
    wrap.innerHTML = `<span class="soft" style="font-size:12px;">Select a node to assign a model.</span>`;
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
    </button>`).join("");
  qsa(".type-pill", wrap).forEach(btn => {
    btn.addEventListener("click", () => {
      state.pipelineType = btn.dataset.type;
      saveState(); renderPipelineTypePicker(); updateSaveBtn();
    });
  });
}

function updateSaveBtn() {
  const btn = qs("#savePipelineBtn"); if (!btn) return;
  const title = qs("#pipelineTitleInput")?.value.trim() || "";
  btn.disabled = !title;
}

// ── Role library ──────────────────────────────────────────────────────────────

function renderRoleLibrary() {
  const container = qs("#roleLibraryContainer"); if (!container) return;
  container.innerHTML = ROLE_GROUPS.map(g => `
    <div class="role-group">
      <div class="role-group-label">${esc(g.group)}</div>
      <div class="role-chip-list">
        ${g.roles.map(r => `
          <button class="role-chip" data-title="${esc(r.title)}" data-type="${esc(r.type)}" data-desc="${esc(r.desc)}" data-group="${esc(g.group)}" type="button" title="${esc(r.desc)}">
            ${esc(r.title)}
          </button>`).join("")}
      </div>
    </div>`).join("");

  qsa(".role-chip", container).forEach(chip => {
    chip.addEventListener("click", () => {
      spawnRoleNode(chip.dataset.title, chip.dataset.type, chip.dataset.desc, chip.dataset.group);
    });
  });
}

function spawnRoleNode(title, type, desc, group) {
  const count = state.nodes.length;
  const cols = 4;
  const node = {
    id: uid(), title, type, desc, group,
    model: state.availableModels[0]?.value || "",
    x: 40 + (count % cols) * (NODE_W + 40),
    y: 40 + Math.floor(count / cols) * (NODE_H + 60),
    notes: "", quorumRule: "single pass", timeout: "60s",
  };
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  saveState(); renderAll();
  showToast(`${title} spawned`, "good");
}

// ── Pipeline selector ─────────────────────────────────────────────────────────

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
    stages: p.stages || "",
  }));
  saveState(); renderPipelineSelector();
}

// ── Save / load ───────────────────────────────────────────────────────────────

async function savePipeline() {
  const title = qs("#pipelineTitleInput")?.value.trim();
  if (!title) { showToast("Add a pipeline title first", "warn"); return; }
  const graphJson = JSON.stringify({ nodes: state.nodes, edges: state.edges });
  const btn = qs("#savePipelineBtn");
  if (btn) btn.disabled = true;
  const r = await callApi("/api/pipelines", "POST", {
    title, type: state.pipelineType,
    description: `${PIPELINE_TYPES.find(t=>t.id===state.pipelineType)?.label||""} pipeline`,
    stages: graphJson,
  });
  if (btn) { btn.disabled = false; updateSaveBtn(); }
  if (!r.ok) { showToast("Save failed", "warn"); return; }
  state.savedPipelineId = r.body?.public_id || r.body?.id;
  saveState();
  await refreshPipelines();
  const portal = PIPELINE_TYPES.find(t=>t.id===state.pipelineType)?.label || "";
  showToast(`"${title}" saved — available in ${portal}`, "good");
}

async function loadPipeline(id) {
  const found = state.pipelines.find(p => p.id === id);
  if (!found) return;
  try {
    const graph = JSON.parse(found.stages || "{}");
    if (Array.isArray(graph.nodes)) state.nodes = graph.nodes;
    if (Array.isArray(graph.edges)) state.edges = graph.edges;
    state.savedPipelineId = id;
    state.pipelineType = found.type || state.pipelineType;
    if (qs("#pipelineTitleInput")) qs("#pipelineTitleInput").value = found.title || "";
    state.panX = 0; state.panY = 0; state.zoom = 1;
    saveState(); renderAll();
    setTimeout(fitToScreen, 100);
    showToast("Pipeline loaded", "good");
  } catch { showToast("Could not parse pipeline graph", "warn"); }
}

// ── Bind events ───────────────────────────────────────────────────────────────

function bindEvents() {
  // Toolbar
  qs("[data-tool='select']")?.addEventListener("click", () => {
    cancelLink(); state.tool = "select"; updateToolbar(); renderNodes();
  });
  qs("[data-tool='link']")?.addEventListener("click", () => {
    if (state.tool === "link") cancelLink();
    else { state.tool = "link"; state.linkSource = null; updateToolbar(); showToast("Click a port to start linking", "good"); }
  });
  qs("[data-tool='inspect']")?.addEventListener("click", () => {
    if (state.selectedNodeId) qs("#inspectorPanel")?.scrollIntoView({ behavior: "smooth" });
    else showToast("Select a node first", "warn");
  });
  qs("[data-tool='clear']")?.addEventListener("click", () => {
    if (!confirm("Clear all nodes and connections?")) return;
    state.nodes = []; state.edges = []; state.selectedNodeId = null;
    cancelLink(); saveState(); renderAll();
    showToast("Pipeline cleared", "warn");
  });
  qs("[data-tool='reset']")?.addEventListener("click", () => {
    if (!confirm("Reset canvas?")) return;
    state.nodes = []; state.edges = []; state.selectedNodeId = null;
    state.panX = 0; state.panY = 0; state.zoom = 1;
    cancelLink(); saveState(); renderAll();
    showToast("Canvas reset", "good");
  });

  // Save / load
  qs("#savePipelineBtn")?.addEventListener("click", savePipeline);
  qs("#pipelineTitleInput")?.addEventListener("input", updateSaveBtn);
  qs("#loadPipelineBtn")?.addEventListener("click", () => {
    const id = qs("#pipelineSelector")?.value;
    if (!id) { showToast("No pipeline selected", "warn"); return; }
    loadPipeline(id);
  });
  qs("#clonePipelineBtn")?.addEventListener("click", async () => {
    const id = qs("#pipelineSelector")?.value;
    if (!id) { showToast("No saved pipeline selected", "warn"); return; }
    const r = await callApi(`/api/pipelines/${encodeURIComponent(id)}/clone`, "POST");
    if (!r.ok) { showToast("Clone failed", "warn"); return; }
    await refreshPipelines(); showToast("Pipeline cloned", "good");
  });

  // Inspector
  qs("#inspectorQuorumRule")?.addEventListener("change", persistInspector);
  qs("#inspectorTimeout")?.addEventListener("change", persistInspector);
  qs("#inspectorNotes")?.addEventListener("input", persistInspector);

  // Toggle portal preview
  qs("#togglePortalPreviewBtn")?.addEventListener("click", () => {
    const p = qs(".portal-preview");
    if (p) p.style.display = p.style.display === "none" ? "flex" : "none";
  });

  bindCanvasEvents();
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  bindPanZoom();
  bindEvents();
  renderAll();
  renderRoleLibrary();
  updateSaveBtn();
  await Promise.all([loadModels(), refreshPipelines()]);
  renderAll();
  if (state.nodes.length) setTimeout(fitToScreen, 200);
}

document.addEventListener("DOMContentLoaded", init);
