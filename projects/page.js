/* Projects — page.js */

const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 3000);
}

async function api(path, opts = {}) {
  const cfg = { method: "GET", headers: {}, ...opts };
  if (cfg.body && typeof cfg.body !== "string") {
    cfg.headers["Content-Type"] = "application/json";
    cfg.body = JSON.stringify(cfg.body);
  }
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, cfg);
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) { return { ok: false, status: 0, error: String(e) }; }
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  projects: [],
  activeProjectId: localStorage.getItem("projects_active") || null,
  activeType: "all",
  search: "",
  jobs: [],
};

// ── Normalize project from backend ────────────────────────────────────────────
function normalizeProject(raw) {
  const notes = (() => {
    if (!raw.notes) return {};
    if (typeof raw.notes === "object") return raw.notes;
    try { return JSON.parse(raw.notes); } catch { return { Summary: raw.notes }; }
  })();

  const typeRaw = (raw.target_portal || raw.portal || raw.type || "").toLowerCase();
  let type = "other";
  if (typeRaw.includes("portal") || typeRaw.includes("web")) type = "portal";
  else if (typeRaw.includes("app")) type = "app";
  else if (typeRaw.includes("game")) type = "game";
  else if (typeRaw.includes("research")) type = "research";
  else if (typeRaw.includes("lore")) type = "lore";

  const creatorMap = {
    portal: "portalcreator",
    app: "appcreator",
    game: "game-designer",
    research: "research-core",
    lore: "lorecore",
  };

  return {
    id: raw.public_id || raw.id || "",
    title: raw.title || "Untitled",
    type,
    status: raw.status || "Draft",
    target: raw.target_portal || raw.portal || creatorMap[type] || "portalcreator",
    summary: raw.summary || notes.Summary || notes.summary || "",
    goal: notes.Goal || notes.goal || raw.goal || "",
    modules: notes.Modules || notes.modules || notes.Features || notes.features || "",
    techStack: notes["Tech stack"] || notes.tech_stack || notes.TechStack || "",
    constraints: notes.Constraints || notes.constraints || "",
    risks: notes.Risks || notes.risks || "",
    nextAction: raw.next_action || notes["Next action"] || notes.next_action || "",
    tags: Array.isArray(raw.tags) ? raw.tags.join(", ") : (raw.tags || ""),
    notes: typeof raw.notes === "string" ? raw.notes : "",
    createdAt: raw.created_at || "",
    updatedAt: raw.updated_at || "",
    raw,
  };
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadProjects() {
  const r = await api("/api/projects");
  if (!r.ok) { showToast("Could not load projects", "warn"); return; }
  const items = Array.isArray(r.body?.items) ? r.body.items : [];
  state.projects = items.map(normalizeProject);
  qs("#projectCountChip").textContent = `${state.projects.length}`;
  renderProjectList();

  // Auto-select
  const saved = state.projects.find(p => p.id === state.activeProjectId);
  if (saved) selectProject(saved.id);
  else if (state.projects[0]) selectProject(state.projects[0].id);
}

async function loadJobs(projectId) {
  const r = await api(`/api/production/jobs?subject_public_id=${encodeURIComponent(projectId)}`);
  if (!r.ok) return [];
  return Array.isArray(r.body?.items) ? r.body.items : [];
}

// ── Render project list ───────────────────────────────────────────────────────
function filteredProjects() {
  return state.projects.filter(p => {
    const matchType = state.activeType === "all" || p.type === state.activeType;
    const search = state.search.toLowerCase();
    const matchSearch = !search || [p.title, p.goal, p.summary, p.tags].join(" ").toLowerCase().includes(search);
    return matchType && matchSearch;
  });
}

const TYPE_ICONS = { portal: "🌐", app: "⚙️", game: "🎮", research: "🔬", lore: "📖", other: "📁" };
const TYPE_LABELS = { portal: "Portal", app: "App", game: "Game", research: "Research", lore: "Lore", other: "Other" };

function renderProjectList() {
  const el = qs("#projectList"); if (!el) return;
  const items = filteredProjects();
  if (!items.length) {
    el.innerHTML = `<div class="list-placeholder">No projects found.</div>`;
    return;
  }
  el.innerHTML = items.map(p => `
    <button class="proj-item ${p.id === state.activeProjectId ? "proj-item--active" : ""}"
      data-pid="${esc(p.id)}">
      <span class="proj-icon">${TYPE_ICONS[p.type] || "📁"}</span>
      <span class="proj-body">
        <span class="proj-title">${esc(p.title)}</span>
        <span class="proj-meta">${TYPE_LABELS[p.type] || "Other"} · ${esc(p.status)}</span>
      </span>
      ${p.status === "Active" ? `<span class="proj-dot"></span>` : ""}
    </button>
  `).join("");
  qsa(".proj-item[data-pid]", el).forEach(btn => {
    btn.addEventListener("click", () => selectProject(btn.dataset.pid));
  });
}

// ── Select project ────────────────────────────────────────────────────────────
async function selectProject(id) {
  state.activeProjectId = id;
  localStorage.setItem("projects_active", id);
  renderProjectList();
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  renderWorkspace(p);

  // Load jobs for this project
  state.jobs = await loadJobs(id);
  renderRunHistory(p);
  renderRecentRuns();
  renderQuickActions(p);
}

// ── Render workspace ──────────────────────────────────────────────────────────
function renderWorkspace(p) {
  qs("#centerEmpty").style.display = "none";
  qs("#projectWorkspace").style.display = "block";

  // Header
  qs("#wsType").textContent = TYPE_LABELS[p.type] || "Project";
  qs("#wsTitle").textContent = p.title;

  // Status bar
  const statusEl = qs("#wsStatus");
  if (statusEl) statusEl.value = p.status;

  const targetEl = qs("#wsTarget");
  if (targetEl) {
    // Set closest match
    const opts = Array.from(targetEl.options);
    const match = opts.find(o => p.target.includes(o.value) || o.value.includes(p.type));
    if (match) targetEl.value = match.value;
  }

  qs("#wsLastRun").textContent = state.jobs[0] ? timeAgo(state.jobs[0].updated_at) : "—";
  qs("#wsRunCount").textContent = state.jobs.length;

  // Plan fields
  const set = (id, v) => { const el = qs(`#${id}`); if (el) el.value = v || ""; };
  set("wsGoal", p.goal);
  set("wsNextAction", p.nextAction);
  set("wsModules", p.modules);
  set("wsTechStack", p.techStack);
  set("wsConstraints", p.constraints);
  set("wsRisks", p.risks);
  set("wsSummary", p.summary);
  set("wsNotes", p.notes);

  // Plan source chip
  const chip = qs("#planSourceChip");
  if (chip) {
    const hasExtracted = p.goal || p.modules || p.constraints;
    chip.textContent = hasExtracted ? "Extracted from Home" : "Manual";
    chip.className = hasExtracted ? "chip good" : "chip";
  }
}

// ── Run history ───────────────────────────────────────────────────────────────
function renderRunHistory(p) {
  const el = qs("#wsRunHistory"); if (!el) return;
  if (!state.jobs.length) {
    el.innerHTML = `<div class="list-placeholder">No pipeline runs yet.</div>`;
    return;
  }
  el.innerHTML = state.jobs.slice(0, 6).map(j => {
    const statusClass = j.status === "completed" ? "good" : j.status === "failed" ? "bad" : j.status === "running" ? "running" : "";
    return `
      <div class="ws-run-item">
        <div class="ws-run-dot ${statusClass}"></div>
        <div class="ws-run-body">
          <div class="ws-run-title">${esc(j.title || "Run")}</div>
          <div class="ws-run-meta">${esc(j.status)} · ${timeAgo(j.updated_at)}</div>
        </div>
        <a href="../${creatorPath(p)}/?job=${esc(j.public_id)}" class="ws-run-link">View →</a>
      </div>
    `;
  }).join("");
}

function renderRecentRuns() {
  const el = qs("#recentRuns"); if (!el) return;
  const allJobs = state.jobs.slice(0, 5);
  if (!allJobs.length) { el.innerHTML = `<div class="section-meta">No recent runs.</div>`; return; }
  el.innerHTML = allJobs.map(j => `
    <div class="recent-run-item">
      <div class="ws-run-dot ${j.status === "completed" ? "good" : j.status === "failed" ? "bad" : ""}"></div>
      <div>
        <div class="recent-run-title">${esc(j.title || "Run")}</div>
        <div class="recent-run-meta">${esc(j.status)} · ${timeAgo(j.updated_at)}</div>
      </div>
    </div>
  `).join("");
}

// ── Quick actions ─────────────────────────────────────────────────────────────
function creatorPath(p) {
  const map = { portalcreator: "portalcreator", appcreator: "appcreator", "game-designer": "game-designer", "research-core": "research-core", lorecore: "lorecore" };
  const target = qs("#wsTarget")?.value || p.target;
  return map[target] || "portalcreator";
}

function renderQuickActions(p) {
  const el = qs("#quickActions"); if (!el) return;
  const path = creatorPath(p);
  const creatorLabel = {
    portalcreator: "PortalCreator", appcreator: "AppCreator",
    "game-designer": "Game Designer", "research-core": "Research Core", lorecore: "LoreCore",
  }[path] || "Creator";

  el.innerHTML = `
    <a href="../${path}/?project=${esc(p.id)}" class="quick-action-btn quick-action-btn--primary">
      Open in ${esc(creatorLabel)} →
    </a>
    <button class="quick-action-btn" id="qaSaveBtn">Save changes</button>
    <button class="quick-action-btn" id="qaArchiveBtn">Archive</button>
    <button class="quick-action-btn" id="qaDuplicateBtn">Duplicate</button>
  `;

  qs("#qaSaveBtn")?.addEventListener("click", saveProject);
  qs("#qaArchiveBtn")?.addEventListener("click", archiveProject);
  qs("#qaDuplicateBtn")?.addEventListener("click", duplicateProject);
}

// ── Save ──────────────────────────────────────────────────────────────────────
function collectWorkspaceValues() {
  const get = id => qs(`#${id}`)?.value.trim() || "";
  const p = state.projects.find(x => x.id === state.activeProjectId); if (!p) return null;

  const target = qs("#wsTarget")?.value || p.target;
  const typeFromTarget = { portalcreator: "portal", appcreator: "app", "game-designer": "game", "research-core": "research", lorecore: "lore" }[target] || p.type;

  return {
    title: qs("#wsTitle")?.textContent || p.title,
    status: get("wsStatus") || p.status,
    target_portal: target,
    type: typeFromTarget,
    summary: get("wsSummary"),
    next_action: get("wsNextAction"),
    notes: JSON.stringify({
      Goal: get("wsGoal"),
      Modules: get("wsModules"),
      "Tech stack": get("wsTechStack"),
      Constraints: get("wsConstraints"),
      Risks: get("wsRisks"),
      Summary: get("wsSummary"),
    }),
  };
}

async function saveProject() {
  const id = state.activeProjectId; if (!id) return;
  const payload = collectWorkspaceValues(); if (!payload) return;
  const r = await api(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
  if (!r.ok) { showToast(`Save failed: ${r.status}`, "warn"); return; }
  showToast("Saved", "good");
  // Update local state
  const p = state.projects.find(x => x.id === id);
  if (p) Object.assign(p, normalizeProject({ ...p.raw, ...payload }));
  renderProjectList();
}

async function archiveProject() {
  const id = state.activeProjectId; if (!id) return;
  if (!confirm("Archive this project?")) return;
  const r = await api(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", body: { status: "Archived" } });
  if (!r.ok) { showToast("Archive failed", "warn"); return; }
  showToast("Archived", "warn");
  await loadProjects();
}

async function duplicateProject() {
  const p = state.projects.find(x => x.id === state.activeProjectId); if (!p) return;
  const payload = { ...collectWorkspaceValues(), title: `${p.title} (copy)`, status: "Draft" };
  const r = await api("/api/projects", { method: "POST", body: payload });
  if (!r.ok) { showToast("Duplicate failed", "warn"); return; }
  showToast("Duplicated", "good");
  await loadProjects();
  if (r.body?.public_id) selectProject(r.body.public_id);
}

async function createProject() {
  const title = qs("#npTitle")?.value.trim(); if (!title) { showToast("Title required", "warn"); return; }
  const type = qs("#npType")?.value || "portal";
  const goal = qs("#npGoal")?.value.trim() || "";
  const targetMap = { portal: "portalcreator", app: "appcreator", game: "game-designer", research: "research-core", lore: "lorecore" };

  const r = await api("/api/projects", {
    method: "POST",
    body: {
      title, type, status: "Draft",
      target_portal: targetMap[type] || "portalcreator",
      summary: goal,
      notes: JSON.stringify({ Goal: goal }),
    }
  });
  if (!r.ok) { showToast("Create failed", "warn"); return; }
  showToast("Project created", "good");
  qs("#newProjectForm").style.display = "none";
  qs("#showNewProjectBtn").style.display = "block";
  qs("#npTitle").value = ""; qs("#npGoal").value = "";
  await loadProjects();
  if (r.body?.public_id) selectProject(r.body.public_id);
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  qs("#projectSearch")?.addEventListener("input", e => {
    state.search = e.target.value;
    renderProjectList();
  });

  qsa(".type-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeType = btn.dataset.type;
      qsa(".type-tab").forEach(b => b.classList.toggle("type-tab--active", b === btn));
      renderProjectList();
    });
  });

  qs("#saveProjectBtn")?.addEventListener("click", saveProject);
  qs("#openCreatorBtn")?.addEventListener("click", () => {
    const p = state.projects.find(x => x.id === state.activeProjectId); if (!p) return;
    window.location.href = `../${creatorPath(p)}/?project=${encodeURIComponent(p.id)}`;
  });

  qs("#refreshBtn")?.addEventListener("click", loadProjects);

  qs("#showNewProjectBtn")?.addEventListener("click", () => {
    qs("#newProjectForm").style.display = "block";
    qs("#showNewProjectBtn").style.display = "none";
  });
  qs("#cancelNewProjectBtn")?.addEventListener("click", () => {
    qs("#newProjectForm").style.display = "none";
    qs("#showNewProjectBtn").style.display = "block";
  });
  qs("#createProjectBtn")?.addEventListener("click", createProject);
  qs("#newProjectBtn")?.addEventListener("click", () => {
    qs("#newProjectForm").style.display = "block";
    qs("#showNewProjectBtn").style.display = "none";
    qs("#newProjectForm")?.scrollIntoView({ behavior: "smooth" });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  bindEvents();
  await loadProjects();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
