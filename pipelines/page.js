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

// ── Preset pipeline templates ─────────────────────────────────────────────────

function _makeEdge(fromId, toId) {
  return { id: `e_${fromId}_${toId}`, from: fromId, to: toId };
}

function _node(id, title, type, desc, x, y, group = "") {
  return { id, title, type, desc, group, model: "", x, y, notes: "", quorumRule: "single pass", timeout: "60s" };
}

const PRESET_TEMPLATES = [
  {
    id: "research",
    label: "Research",
    icon: "🔬",
    desc: "Deep research with parallel scouts, cross-validation, and synthesis",
    type: "research",
    build() {
      const scout    = _node("n1", "Scout",               "input",      "Initial broad search. Identifies domains and sources.",          60,  60,  "Research");
      const web1     = _node("n2", "Web Crawler A",       "input",      "Deep web fetch — primary source lane.",                         60,  240, "Research");
      const web2     = _node("n3", "Web Crawler B",       "input",      "Deep web fetch — secondary source lane.",                       310, 240, "Research");
      const val      = _node("n4", "Source Validator",    "verifier",   "Checks source credibility and provenance.",                     185, 420, "Research");
      const contra   = _node("n5", "Contradiction Finder","auditor",    "Hunts contradictions and inconsistencies.",                     185, 600, "Research");
      const synth    = _node("n6", "Synthesizer",         "planner",    "Combines verified findings into coherent structure.",           185, 780, "Synthesis");
      const report   = _node("n7", "Report Builder",      "projection", "Builds final research report with provenance and confidence.", 185, 960, "Synthesis");
      const nodes = [scout, web1, web2, val, contra, synth, report];
      const edges = [
        _makeEdge("n1","n2"), _makeEdge("n1","n3"),
        _makeEdge("n2","n4"), _makeEdge("n3","n4"),
        _makeEdge("n4","n5"), _makeEdge("n5","n6"), _makeEdge("n6","n7"),
      ];
      return { nodes, edges };
    }
  },
  {
    id: "creativewriting",
    label: "Creative Writing",
    icon: "✍️",
    desc: "Parallel creative lanes with canon audit and final synthesis",
    type: "creativewriting",
    build() {
      const planner  = _node("n1", "Planner",         "planner",    "Breaks down the creative brief into scenes and structure.",   60,  60,  "Orchestration");
      const lore1    = _node("n2", "Lore Writer A",   "coder",      "Primary creative lane — voice and narrative.",               60,  240, "Creative");
      const lore2    = _node("n3", "Lore Writer B",   "coder",      "Secondary lane — alternative approach or chapter.",          310, 240, "Creative");
      const auditor  = _node("n4", "Canon Auditor",   "auditor",    "Checks both lanes against canon, tone, and consistency.",   185, 420, "Verification");
      const synth    = _node("n5", "Synthesizer",     "planner",    "Merges best elements from both lanes.",                     185, 600, "Synthesis");
      const format   = _node("n6", "Formatter",       "projection", "Final polish, structure, and style conformance.",           185, 780, "Output");
      const nodes = [planner, lore1, lore2, auditor, synth, format];
      const edges = [
        _makeEdge("n1","n2"), _makeEdge("n1","n3"),
        _makeEdge("n2","n4"), _makeEdge("n3","n4"),
        _makeEdge("n4","n5"), _makeEdge("n5","n6"),
      ];
      return { nodes, edges };
    }
  },
  {
    id: "webportal",
    label: "Web Portal",
    icon: "🌐",
    desc: "Parallel frontend build lanes with code review and integration",
    type: "appcreation",
    build() {
      const planner  = _node("n1", "Planner",          "planner",    "Defines structure, stack, routes, and component breakdown.",    60,  60,  "Orchestration");
      const backend  = _node("n2", "Backend API Coder","coder",      "FastAPI/Express backend, routes, models, DB layer.",            60,  240, "Code");
      const jscoder  = _node("n3", "JS Coder",         "coder",      "Frontend JS, component logic, API wiring.",                    310, 240, "Code");
      const htmlcss  = _node("n4", "HTML Coder",       "coder",      "HTML structure and CSS styling.",                              560, 240, "Code");
      const reviewer = _node("n5", "Code Reviewer",    "auditor",    "Reviews all three lanes for correctness and integration.",     310, 420, "Verification");
      const resolver = _node("n6", "Resolver",         "planner",    "Resolves conflicts, merges outputs into coherent codebase.",   310, 600, "Code");
      const format   = _node("n7", "Formatter",        "projection", "Final output packaging and documentation.",                    310, 780, "Output");
      const nodes = [planner, backend, jscoder, htmlcss, reviewer, resolver, format];
      const edges = [
        _makeEdge("n1","n2"), _makeEdge("n1","n3"), _makeEdge("n1","n4"),
        _makeEdge("n2","n5"), _makeEdge("n3","n5"), _makeEdge("n4","n5"),
        _makeEdge("n5","n6"), _makeEdge("n6","n7"),
      ];
      return { nodes, edges };
    }
  },
  {
    id: "localai",
    label: "Local AI Integration",
    icon: "🤖",
    desc: "Parallel implementation lanes with testing and conflict resolution",
    type: "appcreation",
    build() {
      const analyst  = _node("n1", "Analyst",       "planner",    "Analyses requirements and defines integration spec.",          185, 60,  "Analysis");
      const pyA      = _node("n2", "Python Coder A", "coder",     "Primary implementation lane.",                                60,  240, "Code");
      const pyB      = _node("n3", "Python Coder B", "coder",     "Alternative implementation — different approach or section.", 310, 240, "Code");
      const tests    = _node("n4", "Test Writer",    "verifier",  "Writes unit and integration tests for both lanes.",           185, 420, "Verification");
      const review   = _node("n5", "Code Reviewer",  "auditor",   "Full code audit — correctness, security, edge cases.",       185, 600, "Verification");
      const resolver = _node("n6", "Resolver",       "planner",   "Picks or merges the best implementation.",                   185, 780, "Code");
      const nodes = [analyst, pyA, pyB, tests, review, resolver];
      const edges = [
        _makeEdge("n1","n2"), _makeEdge("n1","n3"),
        _makeEdge("n2","n4"), _makeEdge("n3","n4"),
        _makeEdge("n4","n5"), _makeEdge("n5","n6"),
      ];
      return { nodes, edges };
    }
  },
  {
    id: "trainingdata",
    label: "Model Training Data",
    icon: "🧠",
    desc: "Data gathering, pattern analysis, and structured training/eval pack generation",
    type: "research",
    build() {
      const scout    = _node("n1", "Scout",                "input",      "Broad sweep — identifies relevant data domains.",               60,  60,  "Research");
      const miner    = _node("n2", "Database Miner",       "input",      "Targets structured sources, archives, datasets.",               60,  240, "Research");
      const pattern  = _node("n3", "Pattern Detector",     "planner",    "Identifies recurring patterns and quality signals.",            185, 420, "Analysis");
      const weigher  = _node("n4", "Evidence Weigher",     "verifier",   "Assigns quality scores and confidence levels per sample.",      185, 600, "Analysis");
      const dossier  = _node("n5", "Dossier Writer",       "projection", "Structured data dossier with provenance.",                     185, 780, "Synthesis");
      const eval_    = _node("n6", "Eval Pack Builder",    "projection", "Builds evaluation dataset from high-confidence samples.",       60,  960, "Output");
      const train    = _node("n7", "Training Pack Builder","projection", "Structures approved samples as model training data.",           310, 960, "Output");
      const nodes = [scout, miner, pattern, weigher, dossier, eval_, train];
      const edges = [
        _makeEdge("n1","n2"), _makeEdge("n2","n3"),
        _makeEdge("n3","n4"), _makeEdge("n4","n5"),
        _makeEdge("n5","n6"), _makeEdge("n5","n7"),
      ];
      return { nodes, edges };
    }
  },
];

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
    panX: 0, panY: 0, zoom: 1,
    runJobId: null,
    runObjective: "",
    runSelectedModels: [],
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
      runJobId: null, runObjective: p.runObjective || "", runSelectedModels: p.runSelectedModels || [],
    };
  } catch { return freshState(); }
}

function saveState() {
  const s = { ...state, tool: "select", linkSource: null, linkSide: null, runJobId: null };
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
    .filter(m => m.enabled !== false)
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
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.2, Math.min(3, state.zoom * factor));
    state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
    state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;
    applyTransform(); saveState(); updateZoomLabel();
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
  canvas.addEventListener("pointerup", () => { if (!isPanning) return; isPanning = false; canvas.style.cursor = spaceDown ? "grab" : ""; saveState(); });
  canvas.addEventListener("pointercancel", () => { isPanning = false; });

  qs("#zoomInBtn")?.addEventListener("click",  () => zoomBy(1.2));
  qs("#zoomOutBtn")?.addEventListener("click", () => zoomBy(0.8));
  qs("#zoomResetBtn")?.addEventListener("click", () => { state.panX = 0; state.panY = 0; state.zoom = 1; applyTransform(); saveState(); updateZoomLabel(); });
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
  renderPresetLibrary();
  updateToolbar();
  applyTransform();
  updateZoomLabel();
  renderRunPanel();
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
        updateToolbar(); renderNodes();
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

// ── Preset library ────────────────────────────────────────────────────────────

function renderPresetLibrary() {
  const container = qs("#presetLibraryContainer"); if (!container) return;
  container.innerHTML = PRESET_TEMPLATES.map(t => `
    <button class="preset-card" data-preset="${esc(t.id)}" type="button" title="${esc(t.desc)}">
      <span class="preset-icon">${t.icon}</span>
      <span class="preset-label">${esc(t.label)}</span>
    </button>`).join("");
  qsa(".preset-card", container).forEach(btn => {
    btn.addEventListener("click", () => loadPreset(btn.dataset.preset));
  });
}

function loadPreset(presetId) {
  const preset = PRESET_TEMPLATES.find(p => p.id === presetId);
  if (!preset) return;
  if (state.nodes.length && !confirm("Replace current canvas with preset?")) return;
  const { nodes, edges } = preset.build();
  state.nodes = nodes;
  state.edges = edges;
  state.pipelineType = preset.type;
  state.selectedNodeId = null;
  state.panX = 0; state.panY = 0; state.zoom = 1;
  if (qs("#pipelineTitleInput")) qs("#pipelineTitleInput").value = preset.label;
  saveState(); renderAll();
  setTimeout(fitToScreen, 100);
  showToast(`${preset.icon} ${preset.label} preset loaded`, "good");
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
    chip.addEventListener("click", () => spawnRoleNode(chip.dataset.title, chip.dataset.type, chip.dataset.desc, chip.dataset.group));
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
    stages: p.stages,
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

// ── Stage-list to canvas conversion ──────────────────────────────────────────

function stageListToGraph(stages) {
  const typeMap = {
    input: "input", transform: "planner", build: "coder",
    verify: "verifier", branch: "branch", handoff: "projection",
  };
  const cols = 2;
  const nodes = stages.map((stage, i) => ({
    id: stage.id || `n_${i}`,
    title: stage.title || stage.id || `Stage ${i + 1}`,
    type: typeMap[stage.kind] || "planner",
    desc: stage.summary || "",
    group: stage.kind || "",
    model: (Array.isArray(stage.models) ? stage.models[0] : stage.model) || "",
    x: 40 + (i % cols) * (NODE_W + 60),
    y: 40 + Math.floor(i / cols) * (NODE_H + 80),
    notes: "", quorumRule: "single pass", timeout: "60s",
  }));
  const edges = nodes.slice(0, -1).map((n, i) => ({
    id: `e_${n.id}_${nodes[i + 1].id}`,
    from: n.id,
    to: nodes[i + 1].id,
  }));
  return { nodes, edges };
}

async function loadPipeline(id) {
  const found = state.pipelines.find(p => p.id === id);
  if (!found) return;
  try {
    // stages may be already parsed (array/object) or a JSON string
    const raw = found.stages;
    const graph = (typeof raw === "string") ? JSON.parse(raw || "{}") : (raw || {});

    if (Array.isArray(graph.nodes)) {
      // Standard canvas format saved by this tool
      state.nodes = graph.nodes;
      state.edges = graph.edges || [];
    } else if (Array.isArray(graph)) {
      // Stage-list format from DB presets — convert to canvas
      const converted = stageListToGraph(graph);
      state.nodes = converted.nodes;
      state.edges = converted.edges;
    } else {
      // Unknown / empty
      state.nodes = [];
      state.edges = [];
    }

    state.savedPipelineId = id;
    state.pipelineType = found.type || state.pipelineType;
    if (qs("#pipelineTitleInput")) qs("#pipelineTitleInput").value = found.title || "";
    state.panX = 0; state.panY = 0; state.zoom = 1;
    saveState(); renderAll();
    setTimeout(fitToScreen, 100);
    showToast("Pipeline loaded", "good");
  } catch (err) {
    showToast("Could not parse pipeline graph", "warn");
    console.error("loadPipeline error:", err);
  }
}

// ── Run panel ─────────────────────────────────────────────────────────────────

let _pollTimer = null;

function renderRunPanel() {
  const wrap = qs("#runPanelWrap"); if (!wrap) return;

  const hasSaved = !!state.savedPipelineId;
  const hasNodes = state.nodes.length > 0;
  const models = state.availableModels;

  wrap.innerHTML = `
    <article class="card">
      <div class="eyebrow" style="margin-bottom:10px;">Run pipeline</div>
      ${!hasNodes ? `<p class="soft" style="font-size:12px;margin:0;">Build or load a pipeline first.</p>` : `
        <div class="field-grid">
          <label class="inline-field">
            <span class="soft" style="font-size:11px;">Objective</span>
            <textarea class="textarea" id="runObjective" placeholder="What should this pipeline produce or investigate…" style="min-height:70px;">${esc(state.runObjective)}</textarea>
          </label>
          <label class="inline-field">
            <span class="soft" style="font-size:11px;">Override models (optional — leave blank to use per-node)</span>
            <select class="select" id="runModel" style="font-size:12px;">
              <option value="">Use per-node model assignments</option>
              ${models.map(m => `<option value="${esc(m.value)}" ${state.runSelectedModels[0]===m.value?"selected":""}>${esc(m.label)}</option>`).join("")}
            </select>
          </label>
          ${!hasSaved ? `<p class="soft" style="font-size:11px;margin:0;">Save the pipeline first to run it.</p>` : ""}
          <button class="button button--primary" id="runPipelineBtn" type="button" ${!hasSaved ? "disabled" : ""}>
            ▶ Run pipeline (${state.nodes.length} nodes)
          </button>
        </div>
      `}
    </article>
    <article class="card" id="runStatusCard" style="${state.runJobId ? "" : "display:none"}">
      <div class="eyebrow" style="margin-bottom:8px;">Run status</div>
      <div id="runStatusBody"><span class="soft" style="font-size:12px;">Starting…</span></div>
    </article>
  `;

  qs("#runObjective")?.addEventListener("input", e => { state.runObjective = e.target.value; saveState(); });
  qs("#runModel")?.addEventListener("change", e => { state.runSelectedModels = e.target.value ? [e.target.value] : []; saveState(); });
  qs("#runPipelineBtn")?.addEventListener("click", startRun);
}

async function startRun() {
  const objective = qs("#runObjective")?.value.trim();
  if (!objective) { showToast("Enter an objective", "warn"); return; }
  if (!state.savedPipelineId) { showToast("Save the pipeline first", "warn"); return; }

  const btn = qs("#runPipelineBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Starting…"; }

  const r = await callApi(`/api/pipelines/${encodeURIComponent(state.savedPipelineId)}/run`, "POST", {
    objective,
    selected_models: state.runSelectedModels,
    surface: "pipelines",
  });

  if (!r.ok || !r.body?.job_id) {
    showToast("Failed to start run", "warn");
    if (btn) { btn.disabled = false; btn.textContent = `▶ Run pipeline (${state.nodes.length} nodes)`; }
    return;
  }

  state.runJobId = r.body.job_id;
  showToast(`Pipeline started — job ${state.runJobId}`, "good");
  qs("#runStatusCard")?.style.removeProperty("display");
  startPolling();
}

function startPolling() {
  clearInterval(_pollTimer);
  _pollTimer = setInterval(pollRunStatus, 2500);
  pollRunStatus();
}

async function pollRunStatus() {
  if (!state.runJobId) { clearInterval(_pollTimer); return; }
  const r = await callApi(`/api/pipelines/runs/${encodeURIComponent(state.runJobId)}`);
  if (!r.ok) return;

  const job = r.body;
  const body = qs("#runStatusBody"); if (!body) return;

  const statusColor = { queued: "#fbbf24", running: "#6ee7ff", completed: "#34d399", partial: "#fbbf24", failed: "#fb7185" }[job.status] || "#8ea0b5";
  const nodeStates = job.node_states || {};

  const nodeRows = state.nodes.map(node => {
    const ns = nodeStates[node.id] || {};
    const nsStatus = ns.status || "queued";
    const dot = { queued: "⬜", running: "🔵", done: "✅", failed: "❌" }[nsStatus] || "⬜";
    return `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <span style="font-size:14px;">${dot}</span>
      <span style="font-size:11px;color:#c8d8ec;flex:1;">${esc(node.title)}</span>
      <span style="font-size:10px;color:#8ea0b5;">${nsStatus}</span>
    </div>`;
  }).join("");

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <span style="font-size:12px;font-weight:700;color:${statusColor};">${job.status?.toUpperCase()}</span>
      <span style="font-size:11px;color:#8ea0b5;">${job.job_id}</span>
    </div>
    <div style="margin-bottom:10px;">${nodeRows}</div>
    ${job.status === "completed" || job.status === "partial" ? `
      <button class="button button--primary" id="viewArtifactsBtn" type="button" style="width:100%;margin-top:6px;">View artifacts</button>
    ` : ""}
    ${job.error ? `<p style="color:#fb7185;font-size:11px;margin:6px 0 0;">${esc(job.error)}</p>` : ""}
  `;

  qs("#viewArtifactsBtn")?.addEventListener("click", () => {
    showArtifacts(state.savedPipelineId, state.runJobId);
  });

  if (job.status === "completed" || job.status === "failed" || job.status === "partial") {
    clearInterval(_pollTimer);
    const btn = qs("#runPipelineBtn");
    if (btn) { btn.disabled = false; btn.textContent = `▶ Run pipeline (${state.nodes.length} nodes)`; }
    showToast(`Pipeline ${job.status}`, job.status === "completed" ? "good" : "warn");
  }
}

async function showArtifacts(pipelineId, jobId) {
  const r = await callApi(`/api/artifacts?scope_type=pipeline&scope_public_id=${encodeURIComponent(pipelineId)}&job_public_id=${encodeURIComponent(jobId)}`);
  if (!r.ok) { showToast("Could not load artifacts", "warn"); return; }

  const items = r.body?.items || [];
  if (!items.length) { showToast("No artifacts yet", "warn"); return; }

  const modal = document.createElement("div");
  modal.className = "artifact-modal";
  modal.innerHTML = `
    <div class="artifact-modal-inner">
      <div class="artifact-modal-header">
        <span class="eyebrow">Pipeline artifacts</span>
        <button class="button" id="closeArtifactModal" type="button">✕ Close</button>
      </div>
      <div class="artifact-tabs">
        ${items.filter(a => a.artifact_type === "pipeline_output").map((a, i) => `
          <button class="artifact-tab ${i===0?"artifact-tab--active":""}" data-idx="${i}" type="button">Final output</button>
        `).join("")}
        ${items.filter(a => a.artifact_type === "node_output").map((a, i) => `
          <button class="artifact-tab" data-idx="${items.filter(a=>a.artifact_type==="pipeline_output").length + i}" type="button">${esc(a.title || `Node ${i+1}`)}</button>
        `).join("")}
      </div>
      <div class="artifact-body" id="artifactBody">
        <pre style="white-space:pre-wrap;font-size:12px;color:#c8d8ec;line-height:1.7;">${esc(items[0]?.content || "")}</pre>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  qs("#closeArtifactModal", modal)?.addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  qsa(".artifact-tab", modal).forEach(tab => {
    tab.addEventListener("click", () => {
      qsa(".artifact-tab", modal).forEach(t => t.classList.remove("artifact-tab--active"));
      tab.classList.add("artifact-tab--active");
      const idx = parseInt(tab.dataset.idx);
      const item = items[idx];
      qs("#artifactBody", modal).innerHTML = `<pre style="white-space:pre-wrap;font-size:12px;color:#c8d8ec;line-height:1.7;">${esc(item?.content || "")}</pre>`;
    });
  });
}

// ── Bind events ───────────────────────────────────────────────────────────────

function bindEvents() {
  qs("[data-tool='select']")?.addEventListener("click", () => { cancelLink(); state.tool = "select"; updateToolbar(); renderNodes(); });
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

  qs("#inspectorQuorumRule")?.addEventListener("change", persistInspector);
  qs("#inspectorTimeout")?.addEventListener("change", persistInspector);
  qs("#inspectorNotes")?.addEventListener("input", persistInspector);

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
