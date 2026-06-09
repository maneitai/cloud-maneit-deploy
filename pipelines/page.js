// ============================================================================
//  runs/page.js — Run Viewer (read-only observation)
//
//  Three levels:
//    L1  Overview — domain activity (/api/control/pipelines)
//                 + active run cards (/api/pipelines/runs/active)
//    L2  Run graph — pick a run → auto-laid-out graph, left→right by stage.
//                 Light poll (/runs/{id}/progress) drives live status colors.
//    L3  Node inspect — click a node → output/error/latency
//                 (from heavy /runs/{id}, fetched on open + when progress moves).
//
//  Layout is DERIVED, not stored. A run gives flat node IDs only
//  (e.g. "ch01_brief_t0"). We parse {stage, item, variant} from the ID and
//  lay stages out as left→right columns. Stages are collapsible: a 96-node
//  stage shows as one group box until expanded.
// ============================================================================

const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// Known Maneit stage order (column X). Unknown stages fall back to first-seen time.
const STAGE_ORDER = [
  "intent","scope","research","preplan","worldbuild","entity",
  "timeline","acts","arc","arcs","skeleton","outline",
  "brief","scene","draft","write","merge","verify",
  "audit","voice","structure","aibleed","rewrite",
  "synth","synthesise","compress","persist","render","output","package","handoff",
];

const STATUS_COLOR = {
  pending:  "rgba(255,255,255,0.10)", queued: "rgba(110,231,255,0.45)",
  running:  "rgba(251,191,36,0.7)",   done:   "rgba(52,211,153,0.6)",
  completed:"rgba(52,211,153,0.6)",   failed: "rgba(251,113,133,0.7)",
  partial:  "rgba(251,113,133,0.6)",  paused: "rgba(205,214,229,0.5)",
  skipped:  "rgba(255,255,255,0.08)", cancelled:"rgba(255,255,255,0.1)",
  aborted:  "rgba(255,255,255,0.1)",
};
const STATUS_FILL = {
  pending:  "rgba(255,255,255,0.10)", queued: "rgba(110,231,255,0.55)",
  running:  "rgba(251,191,36,0.85)",  done:   "rgba(52,211,153,0.8)",
  completed:"rgba(52,211,153,0.8)",   failed: "rgba(251,113,133,0.85)",
  partial:  "rgba(251,113,133,0.7)",  paused: "rgba(205,214,229,0.6)",
  skipped:  "rgba(255,255,255,0.12)", cancelled:"rgba(180,190,205,0.4)",
  aborted:  "rgba(180,190,205,0.4)",
};

const NODE_W = 200, NODE_H = 86;
const COL_GAP = 120, ROW_GAP = 22;      // expanded node spacing
const STAGE_GAP_X = 280;                // gap between collapsed stage columns
const STAGE_W = 220;                    // collapsed stage box width

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  view: "overview",            // "overview" | "run"
  filter: "active",            // "active" | "all"
  domains: [],
  runs: [],                    // L1 run list
  // run view
  jobId: null,
  runMeta: null,               // { label, domain, pipeline_id }
  runData: null,               // heavy /runs/{id}
  progress: null,              // light /runs/{id}/progress
  parsed: [],                  // [{id, stage, item, variant, idx}]
  stages: [],                  // ordered stage keys
  expanded: new Set(),         // expanded stage keys
  selectedNodeId: null,
  panX: 40, panY: 40, zoom: 1,
};

let _pollTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

function statusClass(s) { return "st-" + String(s || "").toLowerCase().replace(/[^a-z]/g,""); }

function fmtBytes(n) { if (!n) return "0"; if (n < 1024) return n + " chars"; return (n/1024).toFixed(1) + "k chars"; }
function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return "—";
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return s + "s";
  const m = Math.floor(s/60), r = s%60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m/60); return `${h}h ${m%60}m`;
}
function parseTs(ts) {
  if (!ts) return null;
  let s = String(ts).trim();
  if (!s.match(/[zZ]|[+-]\d\d:?\d\d$/)) s = s.replace(" ", "T") + "Z";
  const t = new Date(s).getTime();
  return isNaN(t) ? null : t;
}

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2600);
}

async function callApi(path) {
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, { headers: { "Content-Type": "application/json" } });
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ── ID parsing — the only source of structure a run gives us ──────────────────
//
// Patterns seen: "ch01_brief_t0", "ch12_scene_t2", "research_cell03", "synth".
// We split into stage (the named phase), item (the fan-out unit, e.g. ch01),
// and variant (the voter/tine, e.g. t0). Any of item/variant may be absent.

function parseNodeId(id) {
  let stage = id, item = "", variant = "";

  // trailing voter/variant: _t0 _t12  OR  _v1  OR  _r2
  let m = id.match(/_([tvr]\d+)$/i);
  if (m) { variant = m[1]; id = id.slice(0, m.index); }

  // leading or embedded item token: ch01, chapter3, scene12, act2, cell03, ent5
  m = id.match(/(ch|chapter|scene|sc|act|cell|ent|entity|topic|loc|route)(\d+)/i);
  if (m) {
    item = m[1].toLowerCase() + m[2];
    // stage = the id with the item token removed, cleaned of separators
    stage = id.replace(m[0], "").replace(/^_+|_+$/g, "").replace(/__+/g, "_");
  } else {
    stage = id;
  }
  // trailing bare number on the stage (e.g. "cell03" handled above; "pass2")
  m = stage.match(/^(.*?)_?(\d+)$/);
  if (m && m[1]) { if (!item) item = "n" + m[2]; stage = m[1]; }

  stage = stage.replace(/^_+|_+$/g, "");
  if (!stage) stage = "stage";
  return { stage, item, variant };
}

function stageRank(stage) {
  const key = stage.toLowerCase();
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    if (key === STAGE_ORDER[i] || key.includes(STAGE_ORDER[i])) return i;
  }
  return 999; // unknown → sorted later, then by first-seen time
}

// ── Level 1: overview ─────────────────────────────────────────────────────────

async function loadOverview() {
  const [ctrl, active] = await Promise.all([
    callApi("/api/control/pipelines"),
    callApi("/api/pipelines/runs/active"),
  ]);

  if (ctrl.ok) state.domains = ctrl.body?.domains || [];
  renderDomains();

  // Build run list. Active endpoint = currently in-flight across domains.
  // control in_flight has the human label; active has pipeline_id + started_at.
  // Merge on public_id, prefer label from control.
  const labelByPid = {};
  for (const dom of state.domains) {
    for (const inf of (dom.in_flight || [])) {
      labelByPid[inf.public_id] = { label: inf.label, domain: dom.domain, status: inf.status, started_at: inf.started_at };
    }
  }

  let runs = [];
  if (active.ok) {
    runs = (active.body?.items || []).map(it => ({
      public_id: it.public_id,
      pipeline_id: it.pipeline_id,
      status: it.status,
      started_at: it.started_at,
      label: labelByPid[it.public_id]?.label || it.pipeline_id || it.public_id,
      domain: labelByPid[it.public_id]?.domain || domainGuess(it.pipeline_id),
    }));
  }

  // "All recent" filter also surfaces control in_flight that may not be in /active
  if (state.filter === "all") {
    const have = new Set(runs.map(r => r.public_id));
    for (const dom of state.domains) {
      for (const inf of (dom.in_flight || [])) {
        if (!have.has(inf.public_id)) {
          runs.push({ public_id: inf.public_id, pipeline_id: "", status: inf.status,
                      started_at: inf.started_at, label: inf.label, domain: dom.domain });
          have.add(inf.public_id);
        }
      }
    }
  }

  state.runs = runs;
  renderRunCards();
}

function domainGuess(pid) {
  const p = String(pid || "").toLowerCase();
  if (p.includes("gamecore") || p.includes("game")) return "gamecore";
  if (p.includes("web")) return "webcore";
  if (p.includes("app")) return "appcore";
  return "lore";
}

function renderDomains() {
  const wrap = qs("#domainStack"); if (!wrap) return;
  if (!state.domains.length) { wrap.innerHTML = `<div class="empty-note">No domains reported.</div>`; return; }

  wrap.innerHTML = state.domains.map(dom => {
    const total = dom.total || 0;
    const bs = dom.by_status || {};
    const inflight = (dom.in_flight || []).length;
    const segs = Object.entries(bs).filter(([,v]) => v > 0);
    const bar = total ? segs.map(([k,v]) => {
      const c = STATUS_FILL[k.toLowerCase()] || "rgba(255,255,255,0.15)";
      return `<div class="domain-bar-seg" style="flex:${v};background:${c};" title="${esc(k)}: ${v}"></div>`;
    }).join("") : `<div class="domain-bar-seg" style="flex:1;background:rgba(255,255,255,0.05);"></div>`;
    const legend = segs.slice(0, 6).map(([k,v]) => {
      const c = STATUS_FILL[k.toLowerCase()] || "rgba(255,255,255,0.15)";
      return `<span class="domain-legend-item"><span class="domain-legend-dot" style="background:${c};"></span>${esc(k)} ${v}</span>`;
    }).join("");
    return `
      <div class="domain-card">
        <div class="domain-card-head">
          <span class="domain-name">${esc(dom.domain)}</span>
          <span class="domain-total">${total} runs</span>
        </div>
        <div class="domain-bar">${bar}</div>
        <div class="domain-legend">${legend}</div>
        ${inflight ? `<div class="domain-inflight">▶ ${inflight} in flight</div>` : ""}
      </div>`;
  }).join("");
}

function renderRunCards() {
  const grid = qs("#runCardGrid"); if (!grid) return;
  if (!state.runs.length) {
    grid.innerHTML = `<div class="empty-note">No ${state.filter === "active" ? "active" : "recent"} runs right now.</div>`;
    return;
  }
  grid.innerHTML = state.runs.map(r => {
    const started = parseTs(r.started_at);
    const ago = started ? fmtDuration((Date.now() - started) / 1000) + " ago" : "";
    return `
      <button class="run-card" data-pid="${esc(r.public_id)}" data-domain="${esc(r.domain)}" data-label="${esc(r.label)}" data-pipeline="${esc(r.pipeline_id)}" type="button">
        <div class="run-card-head">
          <span class="run-card-label">${esc(r.label)}</span>
          <span class="run-status-pill ${statusClass(r.status)}">${esc(r.status)}</span>
        </div>
        <div class="run-card-meta">
          <span class="run-card-domain">${esc(r.domain)}</span>
          ${ago ? `<span>started ${esc(ago)}</span>` : ""}
        </div>
        <div class="run-card-pid">${esc(r.public_id)}</div>
      </button>`;
  }).join("");
  qsa(".run-card", grid).forEach(btn => {
    btn.addEventListener("click", () => openRun(btn.dataset.pid, {
      label: btn.dataset.label, domain: btn.dataset.domain, pipeline_id: btn.dataset.pipeline,
    }));
  });
}

// ── Level 2/3: open a run ──────────────────────────────────────────────────────

async function openRun(jobId, meta) {
  state.view = "run";
  state.jobId = jobId;
  state.runMeta = meta || {};
  state.runData = null;
  state.progress = null;
  state.parsed = [];
  state.stages = [];
  state.expanded = new Set();
  state.selectedNodeId = null;
  state.panX = 40; state.panY = 40; state.zoom = 1;

  qs("#overviewView").hidden = true;
  qs("#runView").hidden = false;
  qs("#runViewTitle").textContent = meta?.label || jobId;
  qs("#runViewSub").textContent = `${meta?.domain || ""} · ${meta?.pipeline_id || jobId}`;
  qs("#canvasHint").textContent = "Loading graph…";
  qs("#canvasHint").style.opacity = "1";
  clearInspector();
  applyTransform(); updateZoomLabel();

  await fetchRunHeavy();      // builds graph
  startPolling();
  setTimeout(fitToScreen, 80);
}

function backToOverview() {
  stopPolling();
  state.view = "overview";
  state.jobId = null;
  qs("#runView").hidden = true;
  qs("#overviewView").hidden = false;
  loadOverview();
}

// Heavy fetch — full node_states. Rebuilds parsed graph.
async function fetchRunHeavy() {
  const r = await callApi(`/api/pipelines/runs/${encodeURIComponent(state.jobId)}`);
  if (!r.ok) { showToast("Could not load run detail", "bad"); return; }
  state.runData = r.body;
  buildGraph();
  renderGraph();
}

// Light poll — aggregate counts + live[] node ids.
async function pollProgress() {
  if (!state.jobId) return;
  const r = await callApi(`/api/pipelines/runs/${encodeURIComponent(state.jobId)}/progress`);
  if (!r.ok) return;
  const prev = state.progress;
  state.progress = r.body;
  updateRunHeader();

  // If the done count moved, node statuses changed → refresh heavy detail
  // (only refresh full payload when something actually progressed).
  const moved = !prev || prev.done !== r.body.done || prev.running !== r.body.running || prev.failed !== r.body.failed;
  if (moved) {
    await fetchRunHeavy();
    if (state.selectedNodeId) renderInspector();
  }

  const st = (state.runData?.status || "").toLowerCase();
  if (["completed","failed","partial","cancelled","aborted"].includes(st)) {
    stopPolling();
  }
}

function startPolling() {
  stopPolling();
  _pollTimer = setInterval(pollProgress, 2500);
  pollProgress();
}
function stopPolling() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

// ── Build derived graph from node_states ──────────────────────────────────────

function buildGraph() {
  const ns = state.runData?.node_states || {};
  const ids = Object.keys(ns);

  // parse every id, capture first-seen time for unknown-stage ordering
  const parsed = ids.map(id => {
    const p = parseNodeId(id);
    const t = parseTs(ns[id]?.started_at) || Infinity;
    return { id, ...p, started: t };
  });

  // stage ordering: known rank first, then earliest started_at, then alpha
  const stageFirstSeen = {};
  for (const p of parsed) {
    if (stageFirstSeen[p.stage] === undefined || p.started < stageFirstSeen[p.stage])
      stageFirstSeen[p.stage] = p.started;
  }
  const stages = [...new Set(parsed.map(p => p.stage))].sort((a, b) => {
    const ra = stageRank(a), rb = stageRank(b);
    if (ra !== rb) return ra - rb;
    const ta = stageFirstSeen[a], tb = stageFirstSeen[b];
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });

  state.parsed = parsed;
  state.stages = stages;
}

function nodesInStage(stage) {
  return state.parsed.filter(p => p.stage === stage);
}

function stageStatusBreakdown(stage) {
  const ns = state.runData?.node_states || {};
  const counts = {};
  for (const p of nodesInStage(stage)) {
    const s = (ns[p.id]?.status || "pending").toLowerCase();
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

// item count + variant count → "32 ch × 3 voters"
function stageShape(stage) {
  const members = nodesInStage(stage);
  const items = new Set(members.map(m => m.item).filter(Boolean));
  const variants = new Set(members.map(m => m.variant).filter(Boolean));
  const parts = [];
  if (items.size) parts.push(`${items.size} item${items.size > 1 ? "s" : ""}`);
  if (variants.size) parts.push(`${variants.size} voter${variants.size > 1 ? "s" : ""}`);
  return parts.join(" × ") || `${members.length} node${members.length > 1 ? "s" : ""}`;
}

// ── Layout — left→right columns, collapsed stages by default ──────────────────

function computeLayout() {
  // Returns { stageBoxes:[{stage,x,y,w,h}], nodes:[{id,x,y,stage}], frames:[{stage,x,y,w,h}] }
  const stageBoxes = [], nodeBoxes = [], frames = [];
  let cursorX = 40;

  for (const stage of state.stages) {
    const members = nodesInStage(stage);
    const expanded = state.expanded.has(stage);

    if (!expanded) {
      // one collapsed group box
      const h = 118;
      stageBoxes.push({ stage, x: cursorX, y: 40, w: STAGE_W, h, count: members.length });
      cursorX += STAGE_W + STAGE_GAP_X;
    } else {
      // grid of member nodes: group by item (row), variant across (mini-cols)
      // sort members: by item order, then variant
      const itemsOrder = [...new Set(members.map(m => m.item))];
      const variantsOrder = [...new Set(members.map(m => m.variant))].filter(Boolean);
      const vCols = Math.max(1, variantsOrder.length);
      const colW = NODE_W + 16;
      const frameW = vCols * colW + 24;

      let rowY = 64;
      itemsOrder.forEach((item) => {
        const row = members.filter(m => m.item === item);
        row.forEach((m) => {
          const vi = variantsOrder.length ? Math.max(0, variantsOrder.indexOf(m.variant)) : 0;
          const x = cursorX + 12 + vi * colW;
          const y = rowY;
          nodeBoxes.push({ id: m.id, x, y, stage, item: m.item, variant: m.variant });
        });
        rowY += NODE_H + ROW_GAP;
      });
      const frameH = rowY - 64 + 20;
      frames.push({ stage, x: cursorX - 6, y: 44, w: frameW, h: frameH + 24 });
      cursorX += frameW + STAGE_GAP_X;
    }
  }
  return { stageBoxes, nodeBoxes, frames };
}

// ── Render graph ──────────────────────────────────────────────────────────────

function renderGraph() {
  const world = qs("#canvasWorld"); if (!world) return;
  qsa(".run-node, .stage-group, .stage-frame", world).forEach(el => el.remove());

  const ns = state.runData?.node_states || {};
  const layout = computeLayout();
  state._layout = layout;

  // expanded stage frames (behind nodes)
  for (const f of layout.frames) {
    const fr = document.createElement("div");
    fr.className = "stage-frame";
    fr.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;`;
    fr.innerHTML = `
      <span class="stage-frame-label">${esc(f.stage)}</span>
      <button class="stage-frame-collapse" data-collapse="${esc(f.stage)}" type="button">collapse</button>`;
    world.appendChild(fr);
  }

  // collapsed stage group boxes
  for (const b of layout.stageBoxes) {
    const counts = stageStatusBreakdown(b.stage);
    const total = b.count || 1;
    const segs = Object.entries(counts).map(([k,v]) => {
      const c = STATUS_FILL[k] || "rgba(255,255,255,0.15)";
      return `<div class="stage-mini-seg" style="flex:${v};background:${c};" title="${esc(k)}: ${v}"></div>`;
    }).join("");
    const done = (counts.done||0)+(counts.completed||0);
    const running = counts.running||0, failed = (counts.failed||0)+(counts.partial||0);
    const el = document.createElement("div");
    el.className = "stage-group";
    el.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;min-height:${b.h}px;`;
    el.dataset.expand = b.stage;
    el.innerHTML = `
      <div class="stage-group-head">
        <span class="stage-group-name">${esc(b.stage)}</span>
        <span class="stage-group-count">${total} node${total>1?"s":""}</span>
      </div>
      <div class="stage-group-shape">${esc(stageShape(b.stage))}</div>
      <div class="stage-mini-bar">${segs || `<div class="stage-mini-seg" style="flex:1;background:rgba(255,255,255,0.06);"></div>`}</div>
      <div class="stage-group-head" style="margin-top:2px;">
        <span class="stage-group-count">${done} done${running?` · ${running} running`:""}${failed?` · ${failed} failed`:""}</span>
        <span class="stage-group-toggle">expand ▸</span>
      </div>`;
    world.appendChild(el);
  }

  // expanded member nodes
  for (const n of layout.nodeBoxes) {
    const nodeState = ns[n.id] || {};
    const status = (nodeState.status || "pending").toLowerCase();
    const col = STATUS_COLOR[status] || STATUS_COLOR.pending;
    const fill = STATUS_FILL[status] || STATUS_FILL.pending;
    const el = document.createElement("article");
    el.className = "run-node" + (n.id === state.selectedNodeId ? " is-selected" : "");
    el.dataset.nodeId = n.id;
    let css = `left:${n.x}px;top:${n.y}px;width:${NODE_W}px;border-color:${col};`;
    if (status === "running") css += "animation:nodePulse 1.4s ease-in-out infinite;";
    el.style.cssText = css;
    el.innerHTML = `
      <div class="node-head">
        <span class="node-badge" style="color:${fill};background:rgba(0,0,0,0.3);">${esc(status)}</span>
      </div>
      <div class="node-title">${esc(n.id)}</div>
      <div class="node-meta-row">
        <span class="node-tag node-tag--stage">${esc(n.stage)}</span>
        ${n.variant ? `<span class="node-tag node-tag--variant">${esc(n.variant)}</span>` : ""}
      </div>`;
    world.appendChild(el);
  }

  bindGraphEvents();
  renderEdges();

  const hint = qs("#canvasHint");
  if (hint) hint.style.opacity = layout.stageBoxes.length || layout.nodeBoxes.length ? "0" : "1";
}

function renderEdges() {
  const svg = qs("#edgeSvg"); if (!svg) return;
  qsa("path, polygon", svg).forEach(el => el.remove());
  const layout = state._layout; if (!layout) return;

  // Edges between consecutive stages (left→right). We connect stage→stage at the
  // box/frame level — clean horizontal flow, no per-node spaghetti.
  const anchors = {}; // stage → {right:{x,y}, left:{x,y}}
  for (const b of layout.stageBoxes) {
    anchors[b.stage] = {
      left:  { x: b.x, y: b.y + 59 },
      right: { x: b.x + b.w, y: b.y + 59 },
    };
  }
  for (const f of layout.frames) {
    anchors[f.stage] = {
      left:  { x: f.x, y: f.y + f.h / 2 },
      right: { x: f.x + f.w, y: f.y + f.h / 2 },
    };
  }

  for (let i = 0; i < state.stages.length - 1; i++) {
    const a = anchors[state.stages[i]], b = anchors[state.stages[i+1]];
    if (!a || !b) continue;
    const p1 = a.right, p2 = b.left;
    const dx = Math.max(50, Math.abs(p2.x - p1.x) * 0.4);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${p1.x},${p1.y} C${p1.x+dx},${p1.y} ${p2.x-dx},${p2.y} ${p2.x},${p2.y}`);
    path.setAttribute("stroke", "url(#edgeGrad)");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const ax = p2.x - 10*Math.cos(ang), ay = p2.y - 10*Math.sin(ang);
    const arr = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arr.setAttribute("points", [[p2.x,p2.y],[ax-5*Math.sin(ang),ay+5*Math.cos(ang)],[ax+5*Math.sin(ang),ay-5*Math.cos(ang)]].map(p=>p.join(",")).join(" "));
    arr.setAttribute("fill", "rgba(139,92,246,0.6)");
    svg.appendChild(arr);
  }
}

function bindGraphEvents() {
  qsa(".stage-group").forEach(el => {
    el.addEventListener("click", () => { state.expanded.add(el.dataset.expand); renderGraph(); setTimeout(fitToScreen, 60); });
  });
  qsa(".stage-frame-collapse").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); state.expanded.delete(btn.dataset.collapse); renderGraph(); setTimeout(fitToScreen, 60); });
  });
  qsa(".run-node").forEach(el => {
    el.addEventListener("click", () => selectNode(el.dataset.nodeId));
  });
}

// ── Inspector (level 3) ───────────────────────────────────────────────────────

function selectNode(id) {
  state.selectedNodeId = id;
  qsa(".run-node").forEach(el => el.classList.toggle("is-selected", el.dataset.nodeId === id));
  renderInspector();
}

function clearInspector() {
  state.selectedNodeId = null;
  qs("#inspNodeTitle").textContent = "No node selected";
  qs("#inspNodeDesc").textContent = "Click a node in the graph to inspect its output, error, and timing.";
  qs("#inspBody").innerHTML = "";
}

function renderInspector() {
  const ns = state.runData?.node_states || {};
  const id = state.selectedNodeId;
  const nodeState = id ? ns[id] : null;
  if (!id || !nodeState) { clearInspector(); return; }

  const status = (nodeState.status || "pending").toLowerCase();
  const fill = STATUS_FILL[status] || STATUS_FILL.pending;
  const parsed = state.parsed.find(p => p.id === id) || {};

  qs("#inspNodeTitle").textContent = id;
  qs("#inspNodeDesc").innerHTML = `<span class="run-status-pill ${statusClass(status)}">${esc(status)}</span> · ${esc(parsed.stage || "")}${parsed.variant ? " · " + esc(parsed.variant) : ""}`;

  // latency
  let latency = "—";
  const sAt = parseTs(nodeState.started_at), fAt = parseTs(nodeState.finished_at);
  if (sAt && fAt) latency = fmtDuration((fAt - sAt) / 1000);
  else if (sAt && status === "running") latency = fmtDuration((Date.now() - sAt) / 1000) + " (live)";

  const output = nodeState.output || "";
  const error = nodeState.error || "";

  qs("#inspBody").innerHTML = `
    <article class="card">
      <div class="run-inspector-kv">
        <span class="soft">Status</span><strong style="color:${fill}">${esc(status)}</strong>
        <span class="soft">Stage</span><span>${esc(parsed.stage || "—")}</span>
        ${parsed.item ? `<span class="soft">Item</span><span>${esc(parsed.item)}</span>` : ""}
        ${parsed.variant ? `<span class="soft">Voter</span><span>${esc(parsed.variant)}</span>` : ""}
        <span class="soft">Latency</span><span>${esc(latency)}</span>
        <span class="soft">Output</span><span>${esc(fmtBytes(output.length))}</span>
      </div>
    </article>
    <article class="card">
      <div class="eyebrow" style="margin-bottom:8px;">Output</div>
      <div class="run-output-box ${output ? "" : "is-empty"}">${
        output ? esc(output.slice(0, 6000)) + (output.length > 6000 ? `\n\n…(truncated, ${fmtBytes(output.length - 6000)} more)` : "")
               : (status === "running" ? "Generating…" : "No output yet")
      }</div>
      ${error ? `<div class="run-error-box">${esc(error)}</div>` : ""}
    </article>`;
}

// ── Run header / progress ─────────────────────────────────────────────────────

function updateRunHeader() {
  const data = state.runData || {};
  const prog = state.progress || {};
  const status = (data.status || prog.status || "—").toLowerCase();
  const chip = qs("#runViewStatus");
  if (chip) { chip.textContent = status; chip.className = "status-chip run-status-pill " + statusClass(status); }

  const total = prog.total ?? data.node_count ?? 0;
  const done = prog.done ?? 0, running = prog.running ?? 0, failed = prog.failed ?? 0, pending = prog.pending ?? 0;
  qs("#runViewCounts").textContent = total
    ? `${done}/${total} done${running?` · ${running} running`:""}${failed?` · ${failed} failed`:""}${pending?` · ${pending} pending`:""}`
    : "—";
  const fill = qs("#runProgressFill");
  if (fill) fill.style.width = total ? Math.round((done/total)*100) + "%" : "0%";
}

// ── Pan / zoom ────────────────────────────────────────────────────────────────

function applyTransform() {
  const world = qs("#canvasWorld"); if (!world) return;
  world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}
function updateZoomLabel() { const el = qs("#zoomLabel"); if (el) el.textContent = Math.round(state.zoom*100) + "%"; }

function bindPanZoom() {
  const canvas = qs("#runCanvas"); if (!canvas) return;
  let panning = false, sx=0, sy=0, ox=0, oy=0, space=false;
  document.addEventListener("keydown", e => { if (e.code === "Space" && state.view==="run") { space=true; canvas.style.cursor="grab"; e.preventDefault(); }});
  document.addEventListener("keyup",   e => { if (e.code === "Space") { space=false; canvas.style.cursor=""; }});

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const f = e.deltaY < 0 ? 1.1 : 0.9;
    const nz = Math.max(0.1, Math.min(2.5, state.zoom * f));
    state.panX = mx - (mx - state.panX) * (nz/state.zoom);
    state.panY = my - (my - state.panY) * (nz/state.zoom);
    state.zoom = nz; applyTransform(); updateZoomLabel();
  }, { passive: false });

  canvas.addEventListener("pointerdown", e => {
    if (e.button === 1 || space || e.target === canvas || e.target.id === "canvasWorld" || e.target.id === "edgeSvg") {
      panning = true; sx=e.clientX; sy=e.clientY; ox=state.panX; oy=state.panY;
      canvas.style.cursor="grabbing"; canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", e => {
    if (!panning) return;
    state.panX = ox + (e.clientX - sx); state.panY = oy + (e.clientY - sy); applyTransform();
  });
  canvas.addEventListener("pointerup", () => { panning=false; canvas.style.cursor = space ? "grab" : ""; });
  canvas.addEventListener("pointercancel", () => { panning=false; });

  qs("#zoomInBtn")?.addEventListener("click",  () => zoomBy(1.2));
  qs("#zoomOutBtn")?.addEventListener("click", () => zoomBy(0.8));
  qs("#fitBtn")?.addEventListener("click", fitToScreen);
}

function zoomBy(f) {
  const canvas = qs("#runCanvas"); const rect = canvas.getBoundingClientRect();
  const cx = rect.width/2, cy = rect.height/2;
  const nz = Math.max(0.1, Math.min(2.5, state.zoom * f));
  state.panX = cx - (cx - state.panX) * (nz/state.zoom);
  state.panY = cy - (cy - state.panY) * (nz/state.zoom);
  state.zoom = nz; applyTransform(); updateZoomLabel();
}

function fitToScreen() {
  const layout = state._layout; if (!layout) return;
  const all = [...layout.stageBoxes, ...layout.frames, ...layout.nodeBoxes.map(n => ({x:n.x,y:n.y,w:NODE_W,h:NODE_H}))];
  if (!all.length) return;
  const minX = Math.min(...all.map(b => b.x));
  const minY = Math.min(...all.map(b => b.y));
  const maxX = Math.max(...all.map(b => b.x + (b.w || NODE_W)));
  const maxY = Math.max(...all.map(b => b.y + (b.h || NODE_H)));
  const canvas = qs("#runCanvas"); const rect = canvas.getBoundingClientRect();
  const w = maxX - minX + 80, h = maxY - minY + 80;
  const zoom = Math.max(0.1, Math.min(1.1, Math.min(rect.width / w, rect.height / h)));
  state.zoom = zoom;
  state.panX = (rect.width - w*zoom)/2 - minX*zoom + 40*zoom;
  state.panY = (rect.height - h*zoom)/2 - minY*zoom + 40*zoom;
  applyTransform(); updateZoomLabel();
}

// ── Bind top-level events ──────────────────────────────────────────────────────

function bindEvents() {
  qs("#backBtn")?.addEventListener("click", backToOverview);
  qs("#refreshBtn")?.addEventListener("click", () => {
    if (state.view === "overview") loadOverview();
    else pollProgress();
    showToast("Refreshed", "good");
  });
  qsa("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa("[data-filter]").forEach(b => b.classList.toggle("chip-button--active", b === btn));
      state.filter = btn.dataset.filter;
      qs("#runsHeading").textContent = state.filter === "active" ? "Active runs" : "All recent runs";
      loadOverview();
    });
  });
  qs("#expandAllBtn")?.addEventListener("click", () => { state.stages.forEach(s => state.expanded.add(s)); renderGraph(); setTimeout(fitToScreen, 60); });
  qs("#collapseAllBtn")?.addEventListener("click", () => { state.expanded.clear(); renderGraph(); setTimeout(fitToScreen, 60); });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  bindEvents();
  bindPanZoom();
  await loadOverview();
  // overview auto-refresh while on overview
  setInterval(() => { if (state.view === "overview") loadOverview(); }, 6000);
}

document.addEventListener("DOMContentLoaded", init);
