const PM_PROJECTS_KEY = "PM_PROJECTS_V1";
const PM_API_BASE = (window.PM_API_BASE || "https://jeff-api.maneit.net").replace(/\/+$/, "");

const defaultState = {
  selectedProjectId: "proj-web-001",
  filters: {
    search: "",
    status: "All",
    readiness: "All"
  },
  projects: [
    {
      id: "proj-web-001",
      title: "PM frontend shell final",
      class: "Web",
      subtype: "Frontend shell",
      status: "Ready",
      readiness: "Ready for pickup",
      target: "PortalCreator",
      preset: "portal_frontend_shell_v1",
      nextAction: "Open in PortalCreator and continue page-by-page finalization.",
      summary: "Unified frontend shell for Maneit pages with clear role separation, stable navigation, and reusable patterns across Home, Projects, Pipelines, Agent Factory, State and Settings.",
      tags: "frontend, shell, registry, navigation, UX",
      origin: "home/chat-1",
      assets: "home/index.html\nstate/index.html\nsettings/index.html\npipelines/index.html\nagent-factory/index.html",
      notes: "Keep layout language consistent across all pages. Do not let creator pages become pipeline editors. Home stays daily-driver discussion surface. Projects remains the central handoff library.",
      pinned: true,
      checks: [true, true, true, false]
    },
    {
      id: "proj-sys-002",
      title: "Maneit runtime benchmark pack",
      class: "System",
      subtype: "Benchmark tooling",
      status: "Active",
      readiness: "In creator",
      target: "Research Core",
      preset: "research_registry_v1",
      nextAction: "Compare role-specialized model quality and latency.",
      summary: "Backend benchmark pack for planner, coder, verifier and JS-specific model role testing.",
      tags: "backend, runtime, benchmark, models",
      origin: "home/chat-2",
      assets: "runtime logs\nbenchmark notes\npipeline reports",
      notes: "Used to validate role-specialized model routing and quality.",
      pinned: true,
      checks: [true, true, true, true]
    },
    {
      id: "proj-app-001",
      title: "Notebook capture app",
      class: "App",
      subtype: "Capture tool",
      status: "Draft",
      readiness: "Prep",
      target: "AppCreator",
      preset: "none",
      nextAction: "Clarify scope and data model before creator pickup.",
      summary: "Small capture app concept for fast note and artifact collection.",
      tags: "capture, notes, quick entry",
      origin: "home/chat-3",
      assets: "rough notes only",
      notes: "Not ready for creator handoff yet.",
      pinned: false,
      checks: [false, false, false, false]
    },
    {
      id: "proj-app-002",
      title: "Model routing dashboard",
      class: "App",
      subtype: "Ops tool",
      status: "Ready",
      readiness: "Ready for pickup",
      target: "AppCreator",
      preset: "creator_ui_compose_v1",
      nextAction: "Open in AppCreator and scaffold project shell.",
      summary: "Internal app for visualizing and editing role-to-model routing.",
      tags: "routing, dashboard, ops",
      origin: "projects/manual",
      assets: "requirements draft\nstate notes",
      notes: "Needs compact, low-noise UI and explicit fallback visualization.",
      pinned: false,
      checks: [true, true, true, false]
    },
    {
      id: "proj-web-002",
      title: "State page redesign",
      class: "Web",
      subtype: "Portal page",
      status: "Active",
      readiness: "In creator",
      target: "PortalCreator",
      preset: "portal_frontend_shell_v1",
      nextAction: "Refine runtime control grid and active census.",
      summary: "Redesign of State page with quorum-aware runtime control and clear active model census.",
      tags: "state, portal, quorum, runtime",
      origin: "home/chat-4",
      assets: "state/index.html\nstate/page.css\nstate/page.js",
      notes: "Runtime stays here, not in Settings or Pipelines.",
      pinned: false,
      checks: [true, true, true, true]
    },
    {
      id: "proj-web-003",
      title: "Projects registry UX",
      class: "Web",
      subtype: "Registry surface",
      status: "Draft",
      readiness: "Prep",
      target: "PortalCreator",
      preset: "portal_frontend_shell_v1",
      nextAction: "Decide final library/workspace/handoff balance.",
      summary: "Registry-style UX for Projects as the source-of-truth library.",
      tags: "projects, registry, UX",
      origin: "home/chat-5",
      assets: "projects drafts",
      notes: "Library must stay compact and category-first.",
      pinned: false,
      checks: [true, false, false, false]
    },
    {
      id: "proj-game-001",
      title: "Guldardal systems draft",
      class: "Game",
      subtype: "Systems design",
      status: "Draft",
      readiness: "Prep",
      target: "Game Designer",
      preset: "none",
      nextAction: "Lock laws for soul wandering and taboo bonding.",
      summary: "Core systems concept notes for Guldardal Chronicles.",
      tags: "guldardal, game, systems, myth",
      origin: "home/proj-3",
      assets: "story notes\nworld rules",
      notes: "Keep power bounded, costly and mythic.",
      pinned: false,
      checks: [false, false, false, false]
    },
    {
      id: "proj-game-002",
      title: "Encounter pacing sheet",
      class: "Game",
      subtype: "Combat pacing",
      status: "Ready",
      readiness: "Ready for pickup",
      target: "Game Designer",
      preset: "none",
      nextAction: "Open in Game Designer for deeper balancing.",
      summary: "Reusable pacing sheet for encounter flow and escalation.",
      tags: "encounters, pacing, balance",
      origin: "projects/manual",
      assets: "spreadsheet draft",
      notes: "Good candidate for game-side tooling.",
      pinned: false,
      checks: [true, true, true, false]
    },
    {
      id: "proj-research-001",
      title: "Model-role specialization study",
      class: "Research",
      subtype: "Capability study",
      status: "Active",
      readiness: "In creator",
      target: "Research Core",
      preset: "research_registry_v1",
      nextAction: "Continue benchmarking planner, coder and verifier classes.",
      summary: "Structured study of specialized models per role and task family.",
      tags: "research, models, specialization",
      origin: "home/chat-6",
      assets: "benchmark outputs\naudit notes",
      notes: "Supports the architectural claim that specialized models are the viable path.",
      pinned: false,
      checks: [true, true, true, true]
    },
    {
      id: "proj-research-002",
      title: "Cloud provider comparison",
      class: "Research",
      subtype: "Provider evaluation",
      status: "Draft",
      readiness: "Prep",
      target: "Research Core",
      preset: "research_registry_v1",
      nextAction: "Define provider benchmarks and cost-quality matrix.",
      summary: "Study comparing Ollama cloud, enterprise providers and local models by role fit.",
      tags: "providers, ollama, cloud, enterprise",
      origin: "home/chat-7",
      assets: "provider notes",
      notes: "Needs tighter benchmark design before active work.",
      pinned: false,
      checks: [true, false, false, false]
    }
  ]
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(PM_PROJECTS_KEY);
    if (!raw) return clone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...clone(defaultState),
      ...parsed,
      filters: { ...clone(defaultState).filters, ...(parsed.filters || {}) },
      projects: Array.isArray(parsed.projects) ? parsed.projects : clone(defaultState).projects
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(PM_PROJECTS_KEY, JSON.stringify(state));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

async function callApi(path, method = "GET", payload = null) {
  if (!PM_API_BASE) {
    return { ok: false, mock: true, error: "Missing PM_API_BASE" };
  }

  try {
    const res = await fetch(`${PM_API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function getSelectedProject() {
  return state.projects.find(project => project.id === state.selectedProjectId) || state.projects[0] || null;
}

function filterProjects(projects) {
  const search = state.filters.search.trim().toLowerCase();
  return projects.filter(project => {
    const matchesSearch = !search || [
      project.title,
      project.summary,
      project.tags,
      project.origin,
      project.notes
    ].join(" ").toLowerCase().includes(search);

    const matchesStatus = state.filters.status === "All" || project.status === state.filters.status;
    const matchesReadiness = state.filters.readiness === "All" || project.readiness === state.filters.readiness;

    return matchesSearch && matchesStatus && matchesReadiness;
  });
}

function projectButtonMarkup(project) {
  return `
    <button class="library-item ${project.id === state.selectedProjectId ? "library-item--active" : ""}" type="button" data-project-id="${project.id}">
      <span class="library-title">${escapeHtml(project.title)}</span>
      <span class="library-meta">${escapeHtml(project.class)} · ${escapeHtml(project.status)}</span>
    </button>
  `;
}

function renderLibrarySection(containerId, items) {
  const container = qs(containerId);
  if (!container) return;
  container.innerHTML = items.length
    ? items.map(projectButtonMarkup).join("")
    : `<div class="library-meta">No matching records</div>`;

  qsa(".library-item", container).forEach(button => {
    button.addEventListener("click", () => {
      state.selectedProjectId = button.dataset.projectId;
      saveState();
      renderAll();
    });
  });
}

function renderLibrary() {
  const filtered = filterProjects(state.projects);

  renderLibrarySection("#pinnedProjectList", filtered.filter(project => project.pinned));
  renderLibrarySection("#appProjectList", filtered.filter(project => project.class === "App"));
  renderLibrarySection("#webProjectList", filtered.filter(project => project.class === "Web" || project.class === "Portal"));
  renderLibrarySection("#gameProjectList", filtered.filter(project => project.class === "Game"));
  renderLibrarySection("#researchProjectList", filtered.filter(project => project.class === "Research"));
}

function renderWorkspace() {
  const project = getSelectedProject();
  if (!project) return;

  const map = {
    "#workspaceClass": project.class,
    "#workspaceStatus": project.status,
    "#workspaceTarget": project.target,
    "#workspaceReadiness": project.readiness,
    "#projectName": project.title,
    "#projectClass": project.class,
    "#projectSubtype": project.subtype,
    "#projectStatus": project.status,
    "#projectSummary": project.summary,
    "#projectTarget": project.target,
    "#projectPreset": project.preset,
    "#projectReadiness": project.readiness,
    "#projectNextAction": project.nextAction,
    "#projectTags": project.tags,
    "#projectOrigin": project.origin,
    "#projectAssets": project.assets,
    "#projectNotes": project.notes
  };

  Object.entries(map).forEach(([selector, value]) => {
    const el = qs(selector);
    if (!el) return;
    if ("value" in el) {
      el.value = value;
    } else {
      el.textContent = value;
    }
  });

  const handoffPreview = qs("#handoffPreview");
  if (handoffPreview) {
    handoffPreview.innerHTML = `
      <strong>${escapeHtml(project.target)}</strong>
      <span>${escapeHtml(project.preset)} · ${escapeHtml(project.readiness.toLowerCase())}</span>
    `;
  }

  renderChecks(project);
}

function renderChecks(project) {
  const container = qs(".check-list");
  if (!container || !project) return;

  const labels = [
    "Structured enough to be reused",
    "Correct creator target selected",
    "Preset or next action is clear",
    "Ready to move from library to active creator work"
  ];

  container.innerHTML = labels.map((label, index) => `
    <label class="check-item" data-check-index="${index}">
      <input type="checkbox" ${project.checks[index] ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `).join("");

  qsa(".check-item input", container).forEach(input => {
    input.addEventListener("change", event => {
      const row = event.target.closest(".check-item");
      if (!row) return;
      const idx = Number(row.dataset.checkIndex);
      const selected = getSelectedProject();
      if (!selected) return;
      selected.checks[idx] = event.target.checked;
      saveState();
    });
  });
}

function updateSelectedProjectFromWorkspace() {
  const project = getSelectedProject();
  if (!project) return;

  project.title = qs("#projectName")?.value || project.title;
  project.class = qs("#projectClass")?.value || project.class;
  project.subtype = qs("#projectSubtype")?.value || project.subtype;
  project.status = qs("#projectStatus")?.value || project.status;
  project.summary = qs("#projectSummary")?.value || project.summary;
  project.target = qs("#projectTarget")?.value || project.target;
  project.preset = qs("#projectPreset")?.value || project.preset;
  project.readiness = qs("#projectReadiness")?.value || project.readiness;
  project.nextAction = qs("#projectNextAction")?.value || project.nextAction;
  project.tags = qs("#projectTags")?.value || project.tags;
  project.origin = qs("#projectOrigin")?.value || project.origin;
  project.assets = qs("#projectAssets")?.value || project.assets;
  project.notes = qs("#projectNotes")?.value || project.notes;

  saveState();
  renderLibrary();
  renderWorkspace();
}

function duplicateSelectedProject() {
  const selected = getSelectedProject();
  if (!selected) return;

  const cloneProject = clone(selected);
  cloneProject.id = `proj-${crypto.randomUUID().slice(0, 8)}`;
  cloneProject.title = `${selected.title} Copy`;
  cloneProject.pinned = false;

  const index = state.projects.findIndex(project => project.id === selected.id);
  state.projects.splice(index + 1, 0, cloneProject);
  state.selectedProjectId = cloneProject.id;
  saveState();
  renderAll();
  showToast("Project duplicated", "good");
}

function archiveSelectedProject() {
  const selected = getSelectedProject();
  if (!selected) return;
  selected.status = "Archived";
  selected.readiness = "Prep";
  saveState();
  renderAll();
  showToast("Project archived", "warn");
}

async function saveSelectedProject() {
  updateSelectedProjectFromWorkspace();
  const selected = getSelectedProject();
  const result = await callApi("/api/projects/save", "POST", selected);
  showToast(result.ok ? "Project saved" : "Saved locally. API hook ready.", result.ok ? "good" : "warn");
}

function setTarget(target) {
  const selected = getSelectedProject();
  if (!selected) return;
  selected.target = target;
  saveState();
  renderWorkspace();
  showToast(`Target set to ${target}`, "good");
}

function targetPath(target) {
  switch (target) {
    case "AppCreator": return "../appcreator/";
    case "PortalCreator": return "../portalcreator/";
    case "Game Designer": return "../game-designer/";
    case "Research Core": return "../research-core/";
    case "LoreCore": return "../lorecore/";
    default: return "../projects/";
  }
}

function openTargetSurface() {
  const selected = getSelectedProject();
  if (!selected) return;
  const path = targetPath(selected.target);
  const url = `${path}?project=${encodeURIComponent(selected.id)}`;
  window.location.href = url;
}

function bindFilters() {
  qs("#projectSearch")?.addEventListener("input", event => {
    state.filters.search = event.target.value;
    saveState();
    renderLibrary();
  });

  qs("#projectStatusFilter")?.addEventListener("change", event => {
    state.filters.status = event.target.value;
    saveState();
    renderLibrary();
  });

  qs("#projectReadinessFilter")?.addEventListener("change", event => {
    state.filters.readiness = event.target.value;
    saveState();
    renderLibrary();
  });
}

function bindWorkspace() {
  [
    "#projectName",
    "#projectClass",
    "#projectSubtype",
    "#projectStatus",
    "#projectSummary",
    "#projectTarget",
    "#projectPreset",
    "#projectReadiness",
    "#projectNextAction",
    "#projectTags",
    "#projectOrigin",
    "#projectAssets",
    "#projectNotes"
  ].forEach(selector => {
    qs(selector)?.addEventListener("change", updateSelectedProjectFromWorkspace);
    qs(selector)?.addEventListener("input", updateSelectedProjectFromWorkspace);
  });
}

function bindButtons() {
  qs("#duplicateProjectBtn")?.addEventListener("click", duplicateSelectedProject);
  qs("#archiveProjectBtn")?.addEventListener("click", archiveSelectedProject);
  qs("#saveProjectBtn")?.addEventListener("click", saveSelectedProject);

  qs("#openTargetBtn")?.addEventListener("click", openTargetSurface);
  qs("#routeToAppBtn")?.addEventListener("click", () => setTarget("AppCreator"));
  qs("#routeToPortalBtn")?.addEventListener("click", () => setTarget("PortalCreator"));
  qs("#routeToGameBtn")?.addEventListener("click", () => setTarget("Game Designer"));
  qs("#routeToResearchBtn")?.addEventListener("click", () => setTarget("Research Core"));
}

function initFiltersUI() {
  const search = qs("#projectSearch");
  const status = qs("#projectStatusFilter");
  const readiness = qs("#projectReadinessFilter");

  if (search) search.value = state.filters.search;
  if (status) status.value = state.filters.status;
  if (readiness) readiness.value = state.filters.readiness;
}

function renderAll() {
  initFiltersUI();
  renderLibrary();
  renderWorkspace();
}

function init() {
  renderAll();
  bindFilters();
  bindWorkspace();
  bindButtons();
}

document.addEventListener("DOMContentLoaded", init);
