// ============================================================================
//  pipelines/page.js — Pipeline workbench + integrated live run viewer
//
//  Two modes, same canvas:
//    - EDIT mode: builder UI (drag nodes, link ports, save/load, etc.)
//    - RUN mode:  canvas becomes a live run viewer, right rail shows run state
//
//  Mode switches automatically when a run starts. Returns to edit when run ends.
//
//  Key architectural decisions:
//    - When a saved pipeline is loaded, canvas node IDs MIRROR stage IDs from
//      the backend (e.g. "dispatcher", "synth_creative"). This makes
//      backend-polled node_states match local node references directly —
//      no translation layer.
//    - Canvas is READ-ONLY during a run (no drag, no edge edits, no delete).
//    - Right rail card stack switches: editor cards visible in EDIT,
//      run-mode cards in RUN.
// ============================================================================

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
      { title: "Scout",                type: "input",    desc: "Initial broad search. Identifies relevant domains and sources." },
      { title: "Web Crawler",          type: "input",    desc: "Deep web search and page fetching. Returns structured source material." },
      { title: "Database Miner",       type: "input",    desc: "Targets specific databases, archives, or structured data sources." },
      { title: "Source Validator",     type: "verifier", desc: "Checks source credibility, provenance, and reliability." },
      { title: "Citation Tracker",     type: "verifier", desc: "Tracks citation chains and cross-references between sources." },
      { title: "Comparator",           type: "auditor",  desc: "Compares findings across multiple scouts. Surfaces agreements and conflicts." },
      { title: "Contradiction Finder", type: "auditor",  desc: "Specifically hunts for contradictions and inconsistencies in source material." },
    ]
  },
  {
    group: "Analysis",
    roles: [
      { title: "Analyst",          type: "planner",  desc: "Deep analysis of gathered material. Builds structured insights." },
      { title: "Pattern Detector", type: "planner",  desc: "Identifies recurring patterns, themes, and structures across sources." },
      { title: "Evidence Weigher", type: "verifier", desc: "Assigns confidence levels to claims. Separates strong evidence from speculation." },
      { title: "Cross Referencer", type: "verifier", desc: "Cross-references findings against known facts and other sources." },
    ]
  },
  {
    group: "Code",
    roles: [
      { title: "Python Coder",      type: "coder",    desc: "Python implementation. General purpose, data, scripting, backend." },
      { title: "JS Coder",          type: "coder",    desc: "JavaScript/TypeScript. Frontend, Node.js, tooling." },
      { title: "C++ Coder",         type: "coder",    desc: "C++ implementation. Performance-critical, systems, game engine." },
      { title: "C# Coder",          type: "coder",    desc: "C# implementation. Unity scripts, game systems, .NET." },
      { title: "HTML Coder",        type: "coder",    desc: "HTML/CSS markup and structure." },
      { title: "Backend API Coder", type: "coder",    desc: "API design and implementation. REST, FastAPI, Express." },
      { title: "Test Writer",       type: "verifier", desc: "Writes tests for code output. Unit, integration, regression." },
      { title: "Code Reviewer",     type: "auditor",  desc: "Reviews code for correctness, security, style, and edge cases." },
      { title: "Resolver",          type: "planner",  desc: "Resolves conflicts between coder outputs. Picks or merges best result." },
    ]
  },
  {
    group: "Verification",
    roles: [
      { title: "Verifier",      type: "verifier", desc: "General purpose verification. Checks output against spec and contract." },
      { title: "Fact Checker",  type: "verifier", desc: "Checks factual claims against sources. Flags unsupported assertions." },
      { title: "Canon Auditor", type: "auditor",  desc: "Checks output against established canon, rules, or constraints." },
      { title: "Quality Gate",  type: "verifier", desc: "Hard pass/fail gate. Output must meet criteria to proceed." },
      { title: "Strict Auditor",type: "auditor",  desc: "Final audit before promotion. Applies maximum scrutiny." },
    ]
  },
  {
    group: "Synthesis",
    roles: [
      { title: "Synthesizer",    type: "planner",    desc: "Combines multiple verified outputs into a coherent whole." },
      { title: "Report Builder", type: "projection", desc: "Builds a structured report from synthesis output." },
      { title: "Dossier Writer", type: "projection", desc: "Produces a research dossier with provenance and confidence levels." },
      { title: "Summary Writer", type: "projection", desc: "Writes concise summaries of complex findings." },
    ]
  },
  {
    group: "Creative",
    roles: [
      { title: "Lore Writer",     type: "coder",    desc: "Generates lore-consistent creative content." },
      { title: "World Builder",   type: "planner",  desc: "Builds consistent world details, geography, factions, rules." },
      { title: "Scene Writer",    type: "coder",    desc: "Writes scenes with correct POV, tone, and beat structure." },
      { title: "Game Designer",   type: "planner",  desc: "Game mechanics, balance, progression, and system design." },
      { title: "Dialogue Writer", type: "coder",    desc: "Character dialogue with voice consistency." },
    ]
  },
  {
    group: "Output",
    roles: [
      { title: "Formatter",             type: "projection", desc: "Formats output to required spec, schema, or style." },
      { title: "Exporter",              type: "projection", desc: "Packages output for delivery to downstream surface." },
      { title: "Training Pack Builder", type: "projection", desc: "Structures output as training data for model improvement." },
      { title: "Eval Pack Builder",     type: "projection", desc: "Structures output as evaluation dataset." },
    ]
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap(g => g.roles.map(r => ({ ...r, group: g.group })));

const PIPELINE_TYPES = [
  { id: "research",        label: "Research",        color: "#6ee7ff", portal: "research-core"  },
  { id: "aitraining",      label: "AI Training",     color: "#a5f3fc", portal: "research-core"  },
  { id: "appcreation",     label: "App Creation",    color: "#b3ffd8", portal: "appcreator"     },
  { id: "portalcreation",  label: "Portal Creation", color: "#d4b8ff", portal: "portalcreator"  },
  { id: "creativewriting", label: "Creative Writing",color: "#ffd0dc", portal: "lorecore"       },
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

// Run-state colors painted on top of edit-mode node styling
const RUN_STATUS_STYLES = {
  pending:  { border: "rgba(255,255,255,0.10)", glow: "none",                                                opacity: "0.55" },
  queued:   { border: "rgba(255,255,255,0.18)", glow: "none",                                                opacity: "0.75" },
  running:  { border: "rgba(251,191,36,0.7)",   glow: "0 0 0 2px rgba(251,191,36,0.18), 0 4px 20px rgba(251,191,36,0.18)", opacity: "1" },
  done:     { border: "rgba(52,211,153,0.6)",   glow: "0 0 0 2px rgba(52,211,153,0.15), 0 4px 18px rgba(0,0,0,0.4)",       opacity: "1" },
  failed:   { border: "rgba(251,113,133,0.7)",  glow: "0 0 0 2px rgba(251,113,133,0.18), 0 4px 18px rgba(251,113,133,0.18)", opacity: "1" },
  skipped:  { border: "rgba(255,255,255,0.10)", glow: "none",                                                opacity: "0.4" },
};

const NODE_W = 210;
const NODE_H = 130;

// ── Preset pipeline templates ─────────────────────────────────────────────────

function _makeEdge(fromId, toId) {
  return { id: `e_${fromId}_${toId}`, from: fromId, to: toId };
}

function _node(id, title, type, desc, x, y, group = "", role = "", stage = "") {
  return { id, title, type, desc, group, role, stage, model: "", x, y, notes: "", quorumRule: "single pass", timeout: "60s" };
}

const PRESET_TEMPLATES = [
  {
    id: "gamedesign",
    label: "Game Design",
    icon: "🎮",
    desc: "Full game design pipeline — brief to complete GDD, systems, code, and asset specs",
    type: "gamedesign",
    build() {
      const planner  = _node("n1", "Game Planner",       "planner",    "Analyses brief, defines scope, systems list, and engine constraints.",        60,  60,  "Orchestration", "Planner",        "plan");
      const designer = _node("n2", "Game Designer",      "planner",    "Writes full GDD — mechanics, progression, balance framework, win conditions.", 60,  240, "Creative",      "Game Designer",  "design");
      const arch     = _node("n3", "Systems Architect",  "planner",    "Defines game system architecture, class hierarchy, data flow.",                310, 240, "Orchestration", "Planner",        "arch");
      const csharp   = _node("n4", "C# Coder",           "coder",      "Implements all game scripts — mechanics, AI, UI, save/load, audio hooks.",    185, 420, "Code",          "C# Coder",       "codegen");
      const data     = _node("n5", "Data Balancer",      "planner",    "Unit stats, progression curves, level configs, ScriptableObjects.",            60,  600, "Analysis",      "Analyst",        "data");
      const assets   = _node("n6", "Asset Spec Writer",  "projection", "Image gen prompts, 3D model briefs, audio cues, VFX specs.",                   310, 600, "Output",        "Formatter",      "assets");
      const verifier = _node("n7", "Game Verifier",      "verifier",   "Multi-model review — logic, balance, engine conventions, completeness.",       185, 780, "Verification",  "Verifier",       "verify");
      const packager = _node("n8", "Project Packager",   "projection", "Assembles importable engine project — all files, folder structure, README.",   185, 960, "Output",        "Exporter",       "package");
      const nodes = [planner, designer, arch, csharp, data, assets, verifier, packager];
      const edges = [
        _makeEdge("n1","n2"), _makeEdge("n1","n3"),
        _makeEdge("n2","n4"), _makeEdge("n3","n4"),
        _makeEdge("n4","n5"), _makeEdge("n4","n6"),
        _makeEdge("n5","n7"), _makeEdge("n6","n7"),
        _makeEdge("n7","n8"),
      ];
      return { nodes, edges };
    }
  },
  {
    id: "appcreation",
    label: "App Creation",
    icon: "💻",
    desc: "Parallel implementation lanes with testing, code review, and final packaging",
    type: "appcreation",
    build() {
      const planner  = _node("n1", "Planner",          "planner",    "Analyses requirements, defines architecture and component breakdown.",         185, 60,  "Orchestration", "Planner",        "plan");
      const pyA      = _node("n2", "Python Coder A",   "coder",      "Primary implementation lane.",                                                60,  240, "Code",          "Python Coder",   "codegen");
      const pyB      = _node("n3", "Python Coder B",   "coder",      "Alternative implementation — different approach or module.",                  310, 240, "Code",          "Python Coder",   "codegen");
      const tests    = _node("n4", "Test Writer",      "verifier",   "Writes unit and integration tests for both lanes.",                           185, 420, "Verification",  "Test Writer",    "verify");
      const review   = _node("n5", "Code Reviewer",    "auditor",    "Full code audit — correctness, security, edge cases.",                        185, 600, "Verification",  "Code Reviewer",  "verify");
      const resolver = _node("n6", "Resolver",         "planner",    "Picks or merges the best implementation into coherent codebase.",             185, 780, "Code",          "Resolver",       "package");
      const exporter = _node("n7", "Exporter",         "projection", "Final output packaging, documentation, and handoff.",                         185, 960, "Output",        "Exporter",       "package");
      const nodes = [planner, pyA, pyB, tests, review, resolver, exporter];
      const edges = [
        _makeEdge("n1","n2"), _makeEdge("n1","n3"),
        _makeEdge("n2","n4"), _makeEdge("n3","n4"),
        _makeEdge("n4","n5"), _makeEdge("n5","n6"), _makeEdge("n6","n7"),
      ];
      return { nodes, edges };
    }
  },
  {
    id: "webportal",
    label: "Web / Portal",
    icon: "🌐",
    desc: "Parallel frontend + backend build lanes with code review and integration",
    type: "portalcreation",
    build() {
      const planner  = _node("n1", "Planner",           "planner",    "Defines structure, stack, routes, and component breakdown.",                   185, 60,  "Orchestration", "Planner",        "plan");
      const backend  = _node("n2", "Backend API Coder", "coder",      "FastAPI/Express backend, routes, models, DB layer.",                           60,  240, "Code",          "Backend API Coder","codegen");
      const jscoder  = _node("n3", "JS Coder",          "coder",      "Frontend JS, component logic, API wiring.",                                    310, 240, "Code",          "JS Coder",       "codegen");
      const htmlcss  = _node("n4", "HTML Coder",        "coder",      "HTML structure and CSS styling.",                                              560, 240, "Code",          "HTML Coder",     "codegen");
      const reviewer = _node("n5", "Code Reviewer",     "auditor",    "Reviews all three lanes for correctness and integration.",                     310, 420, "Verification",  "Code Reviewer",  "verify");
      const resolver = _node("n6", "Resolver",          "planner",    "Resolves conflicts, merges outputs into coherent codebase.",                   310, 600, "Code",          "Resolver",       "package");
      const format   = _node("n7", "Formatter",         "projection", "Final output packaging and documentation.",                                    310, 780, "Output",        "Formatter",      "package");
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
    id: "research",
    label: "Research",
    icon: "🔬",
    desc: "Deep research with parallel scouts, cross-validation, synthesis, and final report",
    type: "research",
    build() {
      const scout    = _node("n1", "Scout",                "input",      "Initial broad search. Identifies relevant domains and sources.",              60,  60,  "Research",     "Scout",               "frame");
      const web1     = _node("n2", "Web Crawler A",        "input",      "Deep web fetch — primary source lane.",                                       60,  240, "Research",     "Web Crawler",         "traverse");
      const web2     = _node("n3", "Web Crawler B",        "input",      "Deep web fetch — secondary source lane.",                                     310, 240, "Research",     "Web Crawler",         "traverse");
      const val      = _node("n4", "Source Validator",     "verifier",   "Checks source credibility and provenance.",                                   185, 420, "Verification", "Source Validator",    "verify");
      const contra   = _node("n5", "Contradiction Finder", "auditor",    "Hunts contradictions and inconsistencies across sources.",                    185, 600, "Research",     "Contradiction Finder","verify");
      const synth    = _node("n6", "Synthesizer",          "planner",    "Combines verified findings into coherent structure.",                         185, 780, "Synthesis",    "Synthesizer",         "synthesise");
      const report   = _node("n7", "Report Builder",       "projection", "Builds final research report with provenance and confidence.",                185, 960, "Synthesis",    "Report Builder",      "compress");
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
    id: "aitraining",
    label: "AI Training Data",
    icon: "🧠",
    desc: "Data gathering, quality scoring, and structured training + eval pack generation",
    type: "aitraining",
    build() {
      const scout    = _node("n1", "Scout",                  "input",      "Broad sweep — identifies relevant data domains and sources.",                60,  60,  "Research",   "Scout",                 "frame");
      const miner    = _node("n2", "Database Miner",         "input",      "Targets structured sources, archives, and existing datasets.",               310, 60,  "Research",   "Database Miner",        "frame");
      const pattern  = _node("n3", "Pattern Detector",       "planner",    "Identifies recurring patterns and quality signal markers.",                  185, 240, "Analysis",   "Pattern Detector",      "traverse");
      const weigher  = _node("n4", "Evidence Weigher",       "verifier",   "Assigns quality scores and confidence levels per sample.",                   60,  420, "Analysis",   "Evidence Weigher",      "verify");
      const contra   = _node("n5", "Contradiction Finder",   "auditor",    "Flags contradictory, ambiguous, or low-quality samples.",                    310, 420, "Verification","Contradiction Finder",  "verify");
      const dossier  = _node("n6", "Dossier Writer",         "projection", "Structured data dossier with provenance and quality metadata.",              185, 600, "Synthesis",  "Dossier Writer",        "synthesise");
      const evalpack = _node("n7", "Eval Pack Builder",      "projection", "Builds evaluation dataset from high-confidence samples.",                    60,  780, "Output",     "Eval Pack Builder",     "package");
      const trainpack= _node("n8", "Training Pack Builder",  "projection", "Structures approved samples as model training data with metadata.",          310, 780, "Output",     "Training Pack Builder", "package");
      const nodes = [scout, miner, pattern, weigher, contra, dossier, evalpack, trainpack];
      const edges = [
        _makeEdge("n1","n3"), _makeEdge("n2","n3"),
        _makeEdge("n3","n4"), _makeEdge("n3","n5"),
        _makeEdge("n4","n6"), _makeEdge("n5","n6"),
        _makeEdge("n6","n7"), _makeEdge("n6","n8"),
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
    runMode: false,         // true while a run is active
    runData: null,          // last /runs/{id} response
    runStartedAt: null,     // ms timestamp when run started (for elapsed display)
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
      runJobId: null, runMode: false, runData: null, runStartedAt: null,
      runObjective: p.runObjective || "", runSelectedModels: p.runSelectedModels || [],
    };
  } catch { return freshState(); }
}

function saveState() {
  // Don't persist run state across reloads — it's transient
  const s = { ...state, tool: "select", linkSource: null, linkSide: null, runJobId: null, runMode: false, runData: null, runStartedAt: null };
  localStorage.setItem(PM_PIPELINES_KEY, JSON.stringify(s));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const uid = () => `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;

function fmtBytes(n) { if (!n) return "0"; if (n < 1024) return n + " chars"; return (n/1024).toFixed(1) + "k"; }
function fmtDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}
function parseTs(ts) {
  if (!ts) return null;
  // Handle "2026-05-01 17:39:23.248517" and ISO formats; treat as UTC if no zone given
  let s = String(ts).trim();
  if (!s.match(/[zZ]|[+-]\d\d:?\d\d$/)) s = s.replace(" ", "T") + "Z";
  const t = new Date(s).getTime();
  return isNaN(t) ? null : t;
}

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

// ── Stage / role options (derived from active pipeline type) ──────────────────

const STAGE_OPTIONS_BY_TYPE = {
  gamedesign:      ["plan","design","arch","codegen","data","assets","verify","package"],
  appcreation:     ["plan","codegen","verify","package"],
  portalcreation:  ["plan","codegen","verify","package"],
  research:        ["frame","traverse","synthesise","verify","compress","package"],
  aitraining:      ["frame","traverse","verify","synthesise","package"],
  creativewriting: ["premise","outline","draft","critique","revise","handoff"],
};

function stageOptions(selected = "") {
  const stages = STAGE_OPTIONS_BY_TYPE[state.pipelineType] || ["plan","execute","verify","package"];
  return [`<option value="">— no stage —</option>`,
    ...stages.map(s => `<option value="${esc(s)}" ${s === selected ? "selected" : ""}>${esc(s)}</option>`)
  ].join("");
}

function roleOptions(selected = "") {
  return [`<option value="">— no role —</option>`,
    ...ALL_ROLES.map(r =>
      `<option value="${esc(r.title)}" ${r.title === selected ? "selected" : ""}>[${esc(r.group)}] ${esc(r.title)}</option>`)
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

  qs("#zoomInBtn")?.addEventListener("click",    () => zoomBy(1.2));
  qs("#zoomOutBtn")?.addEventListener("click",   () => zoomBy(0.8));
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

  const ns = state.runData?.node_states || {};

  state.edges.forEach(edge => {
    const from = state.nodes.find(n => n.id === edge.from);
    const to   = state.nodes.find(n => n.id === edge.to);
    if (!from || !to) return;

    const p1 = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
    const p2 = { x: to.x,            y: to.y   + NODE_H / 2 };
    const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);

    // Edge color reflects upstream/downstream state during runs
    let stroke = "url(#edgeGrad)";
    let strokeWidth = "2";
    if (state.runMode) {
      const fromStatus = ns[edge.from]?.status;
      const toStatus = ns[edge.to]?.status;
      if (fromStatus === "done" && toStatus === "running") {
        stroke = "rgba(110,231,255,0.7)"; strokeWidth = "2.5";
      } else if (fromStatus === "done" && toStatus === "done") {
        stroke = "rgba(52,211,153,0.5)";
      } else if (fromStatus === "failed" || toStatus === "failed") {
        stroke = "rgba(251,113,133,0.4)";
      } else {
        stroke = "rgba(255,255,255,0.12)";
      }
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${p1.x},${p1.y} C${p1.x+dx},${p1.y} ${p2.x-dx},${p2.y} ${p2.x},${p2.y}`);
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", strokeWidth);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.dataset.edgeId = edge.id;
    if (!state.runMode) {
      path.style.cursor = "pointer";
      path.addEventListener("click", () => {
        state.edges = state.edges.filter(e => e.id !== edge.id);
        saveState(); renderEdges();
        showToast("Connection removed", "warn");
      });
    }
    svg.appendChild(path);

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const ax = p2.x - 10 * Math.cos(angle), ay = p2.y - 10 * Math.sin(angle);
    const arr = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arr.setAttribute("points", [
      [p2.x, p2.y],
      [ax - 5*Math.sin(angle), ay + 5*Math.cos(angle)],
      [ax + 5*Math.sin(angle), ay - 5*Math.cos(angle)],
    ].map(p => p.join(",")).join(" "));
    arr.setAttribute("fill", state.runMode ? stroke : "rgba(110,231,255,0.7)");
    arr.style.pointerEvents = "none";
    svg.appendChild(arr);
  });

  if (!state.runMode && state.tool === "link" && state.linkSource && state._mousePos) {
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

  const ns = state.runData?.node_states || {};

  state.nodes.forEach(node => {
    const col = TYPE_COLORS[node.type] || TYPE_COLORS.input;
    const isSelected = node.id === state.selectedNodeId;
    const isLinkSrc  = node.id === state.linkSource;
    const modelLabel = state.availableModels.find(m => m.value === node.model)?.label || node.model || "— no model —";
    const roleLabel  = node.role  || "— no role —";
    const stageLabel = node.stage || "— no stage —";

    const nodeState = ns[node.id];
    const status = state.runMode ? (nodeState?.status || "pending") : null;

    const el = document.createElement("article");
    el.className = "pipeline-node"
      + (isSelected ? " is-selected" : "")
      + (isLinkSrc  ? " is-link-source" : "");
    el.dataset.nodeId = node.id;

    let cssText = `left:${node.x}px;top:${node.y}px;width:${NODE_W}px;`;
    if (status) {
      const rs = RUN_STATUS_STYLES[status] || RUN_STATUS_STYLES.pending;
      cssText += `border-color:${rs.border};opacity:${rs.opacity};`;
      if (rs.glow !== "none") cssText += `box-shadow:${rs.glow};`;
      if (status === "running") cssText += "animation: nodePulse 1.4s ease-in-out infinite;";
    }
    el.style.cssText = cssText;

    // Node body — same layout as edit mode, but optionally with a status badge
    const statusBadge = status
      ? `<span class="node-badge" style="background:rgba(0,0,0,0.3);color:${(RUN_STATUS_STYLES[status]||RUN_STATUS_STYLES.pending).border};">${esc(status)}</span>`
      : `<span class="node-badge" style="color:${col.badge};background:${col.bg};">${esc(node.group || node.type)}</span>`;

    const delBtn = state.runMode ? "" : `<button class="node-del" data-del="${esc(node.id)}" title="Remove">✕</button>`;

    el.innerHTML = `
      <div class="node-head">
        ${statusBadge}
        ${delBtn}
      </div>
      <div class="node-title">${esc(node.title)}</div>
      <div class="node-meta-row">
        <span class="node-tag node-tag--role">${esc(roleLabel)}</span>
        <span class="node-tag node-tag--stage">${esc(stageLabel)}</span>
      </div>
      <div class="node-model">${esc(modelLabel)}</div>
      <div class="node-ports" style="${state.runMode ? "visibility:hidden;" : ""}">
        <div class="port port-in"  data-node="${esc(node.id)}" data-side="in"></div>
        <div class="port port-out" data-node="${esc(node.id)}" data-side="out"></div>
      </div>
    `;
    world.appendChild(el);
  });

  if (!state.runMode) {
    bindDrag();
    bindPortClicks();
    bindDelBtns();
  }
  bindNodeSelect();
}

function renderAll() {
  renderNodes();
  renderEdges();
  updateInspector();
  renderSavedPipelineSelector();
  renderPipelineTypePicker();
  renderPresetLibrary();
  updateToolbar();
  applyTransform();
  updateZoomLabel();
  applyRightRailMode();
}

// ── Drag (edit mode only) ─────────────────────────────────────────────────────

function bindDrag() {
  qsa(".pipeline-node").forEach(el => {
    let active = false, ox = 0, oy = 0, didMove = false;
    el.addEventListener("pointerdown", e => {
      if (e.target.closest(".port") || e.target.closest(".node-del") || e.target.closest("select")) return;
      const node = state.nodes.find(n => n.id === el.dataset.nodeId); if (!node) return;
      active = true; didMove = false;
      const wp = screenToWorld(e.clientX, e.clientY);
      ox = wp.x - node.x; oy = wp.y - node.y;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      e.stopPropagation();
    });
    el.addEventListener("pointermove", e => {
      if (!active) return;
      const node = state.nodes.find(n => n.id === el.dataset.nodeId); if (!node) return;
      const wp = screenToWorld(e.clientX, e.clientY);
      node.x = Math.max(0, wp.x - ox);
      node.y = Math.max(0, wp.y - oy);
      el.style.left = node.x + "px";
      el.style.top  = node.y + "px";
      didMove = true;
      renderEdges();
    });
    el.addEventListener("pointerup", () => {
      if (!active) return;
      el.style.cursor = "";
      if (didMove) saveState();
      active = false;
    });
    el.addEventListener("pointercancel", () => { active = false; });
  });
}

// ── Port linking (edit mode only) ─────────────────────────────────────────────

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
    if (state.runMode) return;
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
      if (!state.runMode && state.tool === "link") return;
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
  if (!state.runMode) saveState();
  renderNodes(); renderEdges(); updateInspector();
}

// Edit-mode inspector (the original behavior)
function renderEditModeInspector() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId);
  qs("#selectedNodeTitle").textContent = node?.title || "No node selected";
  qs("#selectedNodeDesc").textContent  = node?.desc  || (node ? `Type: ${node.type}` : "Select a node to inspect.");

  const qr = qs("#inspectorQuorumRule");
  const to = qs("#inspectorTimeout");
  const no = qs("#inspectorNotes");
  if (qr) qr.value = node?.quorumRule || "single pass";
  if (to) to.value = node?.timeout    || "60s";
  if (no) no.value = node?.notes      || "";

  const wrap = qs("#inspectorModelWrap");
  if (!wrap) return;

  if (node) {
    wrap.innerHTML = `
      <div class="inspector-field-group">
        <label class="inline-field">
          <span class="soft">Role</span>
          <select class="select" id="inspectorRole" style="font-size:12px;">${roleOptions(node.role)}</select>
        </label>
        <label class="inline-field">
          <span class="soft">Stage</span>
          <select class="select" id="inspectorStage" style="font-size:12px;">${stageOptions(node.stage)}</select>
        </label>
        <label class="inline-field">
          <span class="soft">Model</span>
          <select class="select" id="inspectorModel" style="font-size:12px;">${modelOptions(node.model)}</select>
        </label>
      </div>
      <div class="node-info-box">
        <span class="soft" style="font-size:11px;">${esc(node.desc || "")}</span>
      </div>`;

    qs("#inspectorRole")?.addEventListener("change", e => {
      const n = state.nodes.find(n => n.id === state.selectedNodeId);
      if (!n) return;
      n.role = e.target.value;
      const roleData = ALL_ROLES.find(r => r.title === e.target.value);
      if (roleData) { n.type = roleData.type; n.group = roleData.group; }
      saveState(); renderNodes();
    });
    qs("#inspectorStage")?.addEventListener("change", e => {
      const n = state.nodes.find(n => n.id === state.selectedNodeId);
      if (n) { n.stage = e.target.value; saveState(); renderNodes(); }
    });
    qs("#inspectorModel")?.addEventListener("change", e => {
      const n = state.nodes.find(n => n.id === state.selectedNodeId);
      if (n) { n.model = e.target.value; saveState(); renderNodes(); }
    });
  } else {
    wrap.innerHTML = `<span class="soft" style="font-size:12px;">Select a node to assign role, stage, and model.</span>`;
  }
}

// Run-mode inspector — shows live data for the selected node
function renderRunModeInspector() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId);
  const ns   = state.runData?.node_states || {};
  const nodeState = node ? ns[node.id] : null;

  qs("#selectedNodeTitle").textContent = node?.title || "No node selected";

  const status = nodeState?.status || (node ? "pending" : "—");
  const desc = node
    ? `${esc(status.toUpperCase())} · ${esc(node.role || node.type || "")}`
    : "Select a node to inspect its run state.";
  qs("#selectedNodeDesc").innerHTML = desc;

  const wrap = qs("#inspectorModelWrap");
  if (!wrap) return;

  if (!node) {
    wrap.innerHTML = `<span class="soft" style="font-size:12px;">Click a node to inspect its run state.</span>`;
    return;
  }

  // Latency
  let latency = "—";
  if (nodeState?.started_at && nodeState?.finished_at) {
    const ms = parseTs(nodeState.finished_at) - parseTs(nodeState.started_at);
    if (!isNaN(ms)) latency = fmtDuration(ms / 1000);
  } else if (nodeState?.started_at && status === "running") {
    const ms = Date.now() - parseTs(nodeState.started_at);
    if (!isNaN(ms)) latency = fmtDuration(ms / 1000) + " (live)";
  }

  const output = nodeState?.output || "";
  const error  = nodeState?.error || "";
  const retries = nodeState?.retry_count || 0;

  const modelLabel = state.availableModels.find(m => m.value === node.model)?.label || node.model || "—";

  wrap.innerHTML = `
    <div class="inspector-field-group">
      <div class="run-inspector-kv">
        <span class="soft">Status</span><strong style="color:${(RUN_STATUS_STYLES[status]||RUN_STATUS_STYLES.pending).border}">${esc(status)}</strong>
        <span class="soft">Model</span><span>${esc(modelLabel)}</span>
        <span class="soft">Latency</span><span>${esc(latency)}</span>
        <span class="soft">Output</span><span>${esc(fmtBytes(output.length))}</span>
        ${retries ? `<span class="soft">Retries</span><span>${retries}</span>` : ""}
      </div>
      <div class="run-output-box ${output ? "" : "is-empty"}">${output ? esc(output.slice(0, 4000)) + (output.length > 4000 ? "\n\n…(truncated, " + fmtBytes(output.length - 4000) + " more)" : "") : (status === "running" ? "Generating…" : "No output yet")}</div>
      ${error ? `<div class="run-error-box">${esc(error)}</div>` : ""}
    </div>`;
}

function updateInspector() {
  if (state.runMode) renderRunModeInspector();
  else renderEditModeInspector();
}

function persistInspector() {
  if (state.runMode) return;  // editor controls disabled during run
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
    // Disable destructive/edit tools during a run
    btn.disabled = state.runMode && ["link","clear","reset"].includes(btn.dataset.tool);
    btn.style.opacity = btn.disabled ? "0.4" : "";
  });
  const lb = qs("[data-tool='link']");
  if (lb) lb.textContent = (!state.runMode && state.tool === "link") ? "🔗 linking… (cancel)" : "link nodes";
}

// ── Pipeline type picker ──────────────────────────────────────────────────────

function renderPipelineTypePicker() {
  const wrap = qs("#pipelineTypePicker"); if (!wrap) return;
  wrap.innerHTML = PIPELINE_TYPES.map(t => `
    <button class="type-pill ${state.pipelineType === t.id ? "type-pill--active" : ""}"
      data-type="${esc(t.id)}" style="--pill-color:${t.color};" type="button" ${state.runMode ? "disabled" : ""}>
      ${esc(t.label)}
    </button>`).join("");
  qsa(".type-pill", wrap).forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.runMode) return;
      state.pipelineType = btn.dataset.type;
      saveState(); renderPipelineTypePicker(); updateSaveBtn(); updateInspector();
    });
  });
}

function updateSaveBtn() {
  const btn = qs("#savePipelineBtn"); if (!btn) return;
  btn.disabled = state.runMode || !(qs("#pipelineTitleInput")?.value.trim() || "");
}

// ── Preset library ────────────────────────────────────────────────────────────

function renderPresetLibrary() {
  const container = qs("#presetLibraryContainer"); if (!container) return;
  container.innerHTML = PRESET_TEMPLATES.map(t => `
    <button class="preset-card" data-preset="${esc(t.id)}" type="button" title="${esc(t.desc)}" ${state.runMode ? "disabled" : ""}>
      <span class="preset-icon">${t.icon}</span>
      <span class="preset-label">${esc(t.label)}</span>
    </button>`).join("");
  qsa(".preset-card", container).forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.runMode) return;
      loadPreset(btn.dataset.preset);
    });
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
  state.savedPipelineId = null;
  state.panX = 0; state.panY = 0; state.zoom = 1;
  const titleEl = qs("#pipelineTitleInput");
  if (titleEl) titleEl.value = preset.label;
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
          <button class="role-chip" data-title="${esc(r.title)}" data-type="${esc(r.type)}" data-desc="${esc(r.desc)}" data-group="${esc(g.group)}" type="button" title="${esc(r.desc)}" ${state.runMode ? "disabled" : ""}>
            ${esc(r.title)}
          </button>`).join("")}
      </div>
    </div>`).join("");
  qsa(".role-chip", container).forEach(chip => {
    chip.addEventListener("click", () => {
      if (state.runMode) return;
      spawnRoleNode(chip.dataset.title, chip.dataset.type, chip.dataset.desc, chip.dataset.group);
    });
  });
}

function spawnRoleNode(title, type, desc, group) {
  const count = state.nodes.length;
  const cols = 3;
  const node = {
    id: uid(), title, type, desc, group,
    role: title,
    stage: "",
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

// ── Saved pipeline selector ───────────────────────────────────────────────────

function renderSavedPipelineSelector() {
  const sel = qs("#pipelineSelector"); if (!sel) return;
  sel.disabled = state.runMode;
  sel.innerHTML = state.pipelines.length
    ? state.pipelines.map(p => `<option value="${esc(p.id)}" ${p.id===state.savedPipelineId?"selected":""}>${esc(p.title)}</option>`).join("")
    : `<option value="">No saved pipelines</option>`;
  const lb = qs("#loadPipelineBtn"); if (lb) lb.disabled = state.runMode;
  const cb = qs("#clonePipelineBtn"); if (cb) cb.disabled = state.runMode;
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
  saveState(); renderSavedPipelineSelector();
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

// Convert backend stage list (from saved pipelines like pl-moody-pre-and-ch1)
// into canvas nodes/edges, preserving stage IDs.
function stageListToGraph(stages) {
  if (!Array.isArray(stages) || !stages.length) return { nodes: [], edges: [] };

  const typeMap = {
    input: "input", transform: "planner", build: "coder",
    verify: "verifier", branch: "branch", handoff: "projection",
    gate: "branch",
  };

  // Keep stage.id as canvas node.id — this is what makes node_states polling work directly
  const cols = 4;
  const nodes = stages.map((stage, i) => {
    const stageId = stage.id || `stage_${i}`;
    const xRaw = stage.x !== undefined ? parseInt(stage.x) : null;
    const yRaw = stage.y !== undefined ? parseInt(stage.y) : null;
    const x = (xRaw !== null && !isNaN(xRaw)) ? xRaw : (40 + (i % cols) * (NODE_W + 60));
    const y = (yRaw !== null && !isNaN(yRaw)) ? yRaw : (40 + Math.floor(i / cols) * (NODE_H + 80));
    return {
      id: stageId,
      title: stage.title || stage.id || `Stage ${i + 1}`,
      type: typeMap[stage.kind] || "planner",
      desc: stage.summary || stage.description || "",
      group: stage.kind || "",
      role: stage.role || "",
      stage: stage.stage || stage.kind || "",
      model: (Array.isArray(stage.models) ? stage.models[0] : stage.model) || "",
      x, y,
      notes: "", quorumRule: "single pass", timeout: "60s",
    };
  });

  // Build edges from each stage's `deps` (preferred). Fall back to linear chain only if no deps anywhere.
  const edges = [];
  let hasAnyDeps = false;
  for (const stage of stages) {
    const deps = Array.isArray(stage.deps) ? stage.deps : [];
    if (deps.length) hasAnyDeps = true;
    for (const dep of deps) {
      const fromId = dep;
      const toId = stage.id || `stage_${stages.indexOf(stage)}`;
      if (nodes.find(n => n.id === fromId) && nodes.find(n => n.id === toId)) {
        edges.push({ id: `e_${fromId}_${toId}`, from: fromId, to: toId });
      }
    }
  }
  if (!hasAnyDeps && nodes.length > 1) {
    // Linear fallback — only when stages have no dependency information at all
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ id: `e_${nodes[i].id}_${nodes[i+1].id}`, from: nodes[i].id, to: nodes[i+1].id });
    }
  }
  return { nodes, edges };
}

async function loadPipeline(id) {
  const found = state.pipelines.find(p => p.id === id);
  if (!found) return;
  try {
    const raw = found.stages;
    const graph = (typeof raw === "string") ? JSON.parse(raw || "{}") : (raw || {});
    if (Array.isArray(graph?.nodes)) {
      // Already in canvas format
      state.nodes = graph.nodes;
      state.edges = graph.edges || [];
    } else if (Array.isArray(graph)) {
      // Backend stage list — convert preserving stage IDs
      const converted = stageListToGraph(graph);
      state.nodes = converted.nodes;
      state.edges = converted.edges;
    } else {
      state.nodes = [];
      state.edges = [];
    }
    state.savedPipelineId = id;
    state.pipelineType = found.type || state.pipelineType;
    const titleEl = qs("#pipelineTitleInput");
    if (titleEl) titleEl.value = found.title || "";
    state.panX = 0; state.panY = 0; state.zoom = 1;
    saveState(); renderAll();
    setTimeout(fitToScreen, 100);
    showToast("Pipeline loaded", "good");
  } catch (err) {
    showToast("Could not parse pipeline graph", "warn");
    console.error("loadPipeline error:", err);
  }
}

// ── Right-rail mode switching ─────────────────────────────────────────────────
//
// Editor cards (the four below) are wrapped in DOM with class `card`. We tag
// each one with a data attribute so we can hide/show as a group.

function applyRightRailMode() {
  const inspectorPanel = qs("#inspectorPanel"); if (!inspectorPanel) return;
  const editorCards = qsa("#inspectorPanel article.card");

  // The first 4 cards are editor cards (Selected node, Model, Execution, Notes).
  // The 5th slot is #runPanelWrap. We hide editor cards in run mode.
  editorCards.forEach((card, i) => {
    if (i < 4) {
      card.style.display = state.runMode ? "none" : "";
    }
  });

  // Update section title chip
  const chipWrap = qs("#inspectorPanel .section-title");
  if (chipWrap) {
    const chip = qs(".status-chip", chipWrap);
    const heading = qs(".eyebrow", chipWrap);
    if (state.runMode) {
      if (heading) heading.textContent = "Run viewer";
      if (chip) { chip.textContent = "Live"; chip.className = "status-chip status-chip--good"; }
    } else {
      if (heading) heading.textContent = "Right rail";
      if (chip) { chip.textContent = "Node"; chip.className = "status-chip status-chip--warn"; }
    }
  }

  renderRunPanel();
  updateInspector();
}

// ── Run panel ─────────────────────────────────────────────────────────────────
//
// Two states:
//   1. Idle (no run): show trigger UI (objective + run button)
//   2. Running: show live status, controls, summary

let _pollTimer = null;
let _runtimeTimer = null;

function renderRunPanel() {
  const wrap = qs("#runPanelWrap"); if (!wrap) return;
  const hasSaved = !!state.savedPipelineId;
  const hasNodes = state.nodes.length > 0;
  const models   = state.availableModels;

  // Idle (edit) mode trigger card
  if (!state.runMode) {
    wrap.innerHTML = `
      <article class="card">
        <div class="eyebrow" style="margin-bottom:10px;">Run pipeline</div>
        ${!hasNodes
          ? `<p class="soft" style="font-size:12px;margin:0;">Build or load a pipeline first.</p>`
          : `<div class="field-grid">
              <label class="inline-field">
                <span class="soft" style="font-size:11px;">Objective</span>
                <textarea class="textarea" id="runObjective" placeholder="What should this pipeline produce or investigate…" style="min-height:70px;">${esc(state.runObjective)}</textarea>
              </label>
              <label class="inline-field">
                <span class="soft" style="font-size:11px;">Override models (optional)</span>
                <select class="select" id="runModel" style="font-size:12px;">
                  <option value="">Use per-node model assignments</option>
                  ${models.map(m => `<option value="${esc(m.value)}" ${state.runSelectedModels[0]===m.value?"selected":""}>${esc(m.label)}</option>`).join("")}
                </select>
              </label>
              ${!hasSaved ? `<p class="soft" style="font-size:11px;margin:0;">Save the pipeline first to run it.</p>` : ""}
              <button class="button button--primary" id="runPipelineBtn" type="button" ${!hasSaved ? "disabled" : ""}>
                ▶ Run (${state.nodes.length} nodes)
              </button>
            </div>`}
      </article>
    `;
    qs("#runObjective")?.addEventListener("input",  e => { state.runObjective = e.target.value; saveState(); });
    qs("#runModel")?.addEventListener("change",     e => { state.runSelectedModels = e.target.value ? [e.target.value] : []; saveState(); });
    qs("#runPipelineBtn")?.addEventListener("click", startRun);
    return;
  }

  // Run mode — live status panel
  const job = state.runData || {};
  const ns = job.node_states || {};
  const total = state.nodes.length;
  const done = state.nodes.filter(n => ns[n.id]?.status === "done").length;
  const running = state.nodes.filter(n => ns[n.id]?.status === "running").length;
  const failed = state.nodes.filter(n => ns[n.id]?.status === "failed").length;
  const status = job.status || "starting";

  const statusColor = { queued:"#fbbf24", running:"#fbbf24", completed:"#34d399", partial:"#fbbf24", failed:"#fb7185", cancelled:"#fb7185" }[status] || "#8ea0b5";
  const isTerminal = ["completed","failed","partial","cancelled"].includes(status);
  const isPaused = !!job.pause_requested;

  const elapsed = state.runStartedAt ? (Date.now() - state.runStartedAt) / 1000 : 0;

  wrap.innerHTML = `
    <article class="card">
      <div class="eyebrow" style="margin-bottom:6px;">Run status</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <strong style="color:${statusColor};font-size:13px;">${esc(status.toUpperCase())}</strong>
        <span class="soft" style="font-size:11px;font-family:ui-monospace,monospace;">${esc(state.runJobId || "")}</span>
      </div>
      <div class="run-progress-bar"><div class="run-progress-fill" style="width:${total ? Math.round((done/total)*100) : 0}%;"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:6px;">
        <span>${done}/${total} done${running ? ` · ${running} running` : ""}${failed ? ` · ${failed} failed` : ""}</span>
        <span id="runtimeDisplay">${fmtDuration(elapsed)}</span>
      </div>
    </article>

    <article class="card">
      <div class="eyebrow" style="margin-bottom:8px;">Controls</div>
      <div class="button-row">
        <button class="button" id="pauseBtn" type="button" ${isTerminal || isPaused ? "disabled" : ""}>Pause</button>
        <button class="button" id="resumeBtn" type="button" ${isTerminal || !isPaused ? "disabled" : ""}>Resume</button>
        <button class="button" id="clearGateBtn" type="button" ${isTerminal ? "disabled" : ""}>Clear gate</button>
      </div>
      <div class="button-row" style="margin-top:8px;">
        <button class="button" id="exitRunBtn" type="button">${isTerminal ? "← Back to editor" : "Detach view"}</button>
      </div>
    </article>

    ${job.error ? `<article class="card"><div class="eyebrow" style="margin-bottom:6px;color:var(--bad);">Error</div><p style="font-size:12px;margin:0;color:#ffd7dd;">${esc(job.error)}</p></article>` : ""}

    <article class="card">
      <div class="eyebrow" style="margin-bottom:8px;">Tips</div>
      <p class="soft" style="font-size:11px;margin:0;line-height:1.5;">
        Click any node on the canvas to inspect its run state. Edit controls are disabled while a run is active.
      </p>
    </article>
  `;

  qs("#pauseBtn")?.addEventListener("click", pauseRun);
  qs("#resumeBtn")?.addEventListener("click", resumeRun);
  qs("#clearGateBtn")?.addEventListener("click", clearGate);
  qs("#exitRunBtn")?.addEventListener("click", () => exitRunMode(isTerminal));
}

async function startRun() {
  const objective = qs("#runObjective")?.value.trim();
  if (!objective) { showToast("Enter an objective", "warn"); return; }
  if (!state.savedPipelineId) { showToast("Save the pipeline first", "warn"); return; }

  const btn = qs("#runPipelineBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Starting…"; }

  // Backend builds the graph from stored stages — never send a graph field
  const r = await callApi(`/api/pipelines/${encodeURIComponent(state.savedPipelineId)}/run`, "POST", {
    objective,
    selected_models: state.runSelectedModels,  // array — empty means use per-node assignments
    surface: "pipelines",
  });

  if (!r.ok || !r.body?.job_id) {
    showToast("Failed to start run: " + (r.body?.detail || r.error || `HTTP ${r.status}`), "warn");
    if (btn) { btn.disabled = false; btn.textContent = `▶ Run (${state.nodes.length} nodes)`; }
    return;
  }

  state.runJobId = r.body.job_id;
  state.runMode = true;
  state.runData = null;
  state.runStartedAt = Date.now();
  showToast(`Pipeline started — ${state.runJobId}`, "good");
  applyRightRailMode();
  startPolling();
}

function attachToRun(jobId) {
  if (!jobId) return;
  state.runJobId = jobId;
  state.runMode = true;
  state.runData = null;
  state.runStartedAt = Date.now();
  applyRightRailMode();
  startPolling();
}

function startPolling() {
  clearInterval(_pollTimer);
  clearInterval(_runtimeTimer);
  _pollTimer = setInterval(pollRunStatus, 2500);
  _runtimeTimer = setInterval(() => {
    const el = qs("#runtimeDisplay");
    if (el && state.runStartedAt) el.textContent = fmtDuration((Date.now() - state.runStartedAt) / 1000);
  }, 1000);
  pollRunStatus();
}

async function pollRunStatus() {
  if (!state.runJobId) { clearInterval(_pollTimer); clearInterval(_runtimeTimer); return; }
  const r = await callApi(`/api/pipelines/runs/${encodeURIComponent(state.runJobId)}`);
  if (!r.ok) return;

  state.runData = r.body;

  // Use server start time if we don't have one yet
  if (!state.runStartedAt && r.body?.started_at) {
    const t = parseTs(r.body.started_at);
    if (t) state.runStartedAt = t;
  }

  // Re-render canvas (nodes + edges) with live state
  renderNodes();
  renderEdges();
  renderRunPanel();
  if (state.selectedNodeId) renderRunModeInspector();

  const status = r.body?.status;
  if (["completed","failed","partial","cancelled"].includes(status)) {
    clearInterval(_pollTimer);
    clearInterval(_runtimeTimer);
    showToast(`Pipeline ${status}`, status === "completed" ? "good" : "warn");
  }
}

async function pauseRun() {
  if (!state.runJobId) return;
  const r = await callApi(`/api/pipelines/runs/${encodeURIComponent(state.runJobId)}/pause`, "POST");
  if (r.ok) { showToast("Pause requested", "good"); pollRunStatus(); }
  else showToast("Pause failed", "warn");
}
async function resumeRun() {
  if (!state.runJobId) return;
  const r = await callApi(`/api/pipelines/runs/${encodeURIComponent(state.runJobId)}/resume`, "POST");
  if (r.ok) { showToast("Resumed", "good"); pollRunStatus(); }
  else showToast("Resume failed", "warn");
}
async function clearGate() {
  if (!state.runJobId) return;
  const r = await callApi(`/api/pipelines/runs/${encodeURIComponent(state.runJobId)}/clear-gate`, "POST");
  if (r.ok) { showToast("Gate cleared", "good"); pollRunStatus(); }
  else showToast("Clear gate failed", "warn");
}

function exitRunMode(forceCleanup = false) {
  clearInterval(_pollTimer);
  clearInterval(_runtimeTimer);
  state.runMode = false;
  if (forceCleanup) {
    state.runJobId = null;
    state.runData = null;
    state.runStartedAt = null;
  }
  applyRightRailMode();
  renderNodes();
  renderEdges();
}

// On init, check if there's an active run — if so, auto-attach
async function checkActiveRun() {
  // Only attach if we just loaded the pipeline matching the active run
  if (!state.savedPipelineId) return;
  const r = await callApi("/api/pipelines/runs/active");
  if (!r.ok) return;
  const items = r.body?.items || [];
  const match = items.find(it => it.pipeline_id === state.savedPipelineId);
  if (match) attachToRun(match.public_id);
}

// ── Bind events ───────────────────────────────────────────────────────────────

function bindEvents() {
  qs("[data-tool='select']")?.addEventListener("click", () => {
    if (state.runMode) return;
    cancelLink(); state.tool = "select"; updateToolbar(); renderNodes();
  });
  qs("[data-tool='link']")?.addEventListener("click", () => {
    if (state.runMode) return;
    if (state.tool === "link") cancelLink();
    else { state.tool = "link"; state.linkSource = null; updateToolbar(); showToast("Click a port to start linking", "good"); }
  });
  qs("[data-tool='inspect']")?.addEventListener("click", () => {
    if (state.selectedNodeId) qs("#inspectorPanel")?.scrollIntoView({ behavior: "smooth" });
    else showToast("Select a node first", "warn");
  });
  qs("[data-tool='clear']")?.addEventListener("click", () => {
    if (state.runMode) return;
    if (!confirm("Clear all nodes and connections?")) return;
    state.nodes = []; state.edges = []; state.selectedNodeId = null;
    cancelLink(); saveState(); renderAll();
    showToast("Pipeline cleared", "warn");
  });
  qs("[data-tool='reset']")?.addEventListener("click", () => {
    if (state.runMode) return;
    if (!confirm("Reset canvas?")) return;
    state.nodes = []; state.edges = []; state.selectedNodeId = null;
    state.panX = 0; state.panY = 0; state.zoom = 1;
    cancelLink(); saveState(); renderAll();
    showToast("Canvas reset", "good");
  });

  qs("#savePipelineBtn")?.addEventListener("click",   savePipeline);
  qs("#pipelineTitleInput")?.addEventListener("input", updateSaveBtn);
  qs("#loadPipelineBtn")?.addEventListener("click", () => {
    if (state.runMode) return;
    const id = qs("#pipelineSelector")?.value;
    if (!id) { showToast("No pipeline selected", "warn"); return; }
    loadPipeline(id);
  });
  qs("#clonePipelineBtn")?.addEventListener("click", async () => {
    if (state.runMode) return;
    const id = qs("#pipelineSelector")?.value;
    if (!id) { showToast("No saved pipeline selected", "warn"); return; }
    const r = await callApi(`/api/pipelines/${encodeURIComponent(id)}/clone`, "POST");
    if (!r.ok) { showToast("Clone failed", "warn"); return; }
    await refreshPipelines(); showToast("Pipeline cloned", "good");
  });

  qs("#inspectorQuorumRule")?.addEventListener("change", persistInspector);
  qs("#inspectorTimeout")?.addEventListener("change",   persistInspector);
  qs("#inspectorNotes")?.addEventListener("input",      persistInspector);

  qs("#togglePortalPreviewBtn")?.addEventListener("click", () => {
    const p = qs(".portal-preview");
    if (p) p.style.display = p.style.display === "none" ? "flex" : "none";
  });

  bindCanvasEvents();
}

// ── Inject run-mode styles (extension to existing page.css) ───────────────────

function injectRunStyles() {
  if (document.getElementById("pmRunStyles")) return;
  const style = document.createElement("style");
  style.id = "pmRunStyles";
  style.textContent = `
@keyframes nodePulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(251,191,36,0.18), 0 4px 18px rgba(251,191,36,0.18); }
  50%      { box-shadow: 0 0 0 6px rgba(251,191,36,0.05), 0 4px 18px rgba(251,191,36,0.18); }
}
.run-progress-bar {
  height: 6px; border-radius: 999px;
  background: rgba(255,255,255,0.06); overflow: hidden; margin-top: 4px;
}
.run-progress-fill {
  height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2));
  transition: width 0.4s ease;
}
.run-inspector-kv {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 6px 12px;
  font-size: 12px;
  margin-bottom: 12px;
}
.run-inspector-kv .soft { font-weight: 600; }
.run-output-box {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 11px;
  line-height: 1.55;
  color: #c8d8ec;
  max-height: 280px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.run-output-box.is-empty {
  font-family: inherit; font-size: 12px; color: var(--muted);
}
.run-error-box {
  margin-top: 8px;
  background: rgba(251,113,133,0.07);
  border: 1px solid rgba(251,113,133,0.18);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 11px;
  color: #ffd7dd;
  white-space: pre-wrap;
  max-height: 160px;
  overflow-y: auto;
}
`;
  document.head.appendChild(style);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  injectRunStyles();
  bindPanZoom();
  bindEvents();
  renderAll();
  renderRoleLibrary();
  updateSaveBtn();
  await Promise.all([loadModels(), refreshPipelines()]);
  renderAll();
  if (state.nodes.length) setTimeout(fitToScreen, 200);
  // If a run is currently active for the loaded pipeline, attach automatically
  setTimeout(checkActiveRun, 300);
}

document.addEventListener("DOMContentLoaded", init);
