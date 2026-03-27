const PM_PROJECTS_KEY = "PM_PROJECTS_V2";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const defaultState = {
  selectedProjectId: "",
  filters: {
    search: "",
    status: "All",
    readiness: "All"
  },
  projects: [],
  loaded: false
};

let state = loadState();
let activeRequestCount = 0;

function loadState() {
  try {
    const raw = localStorage.getItem(PM_PROJECTS_KEY);
    if (!raw) return clone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...clone(defaultState),
      ...parsed,
      filters: { ...clone(defaultState).filters, ...(parsed.filters || {}) },
      projects: Array.isArray(parsed.projects) ? parsed.projects : []
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
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function setBusy(isBusy) {
  activeRequestCount += isBusy ? 1 : -1;
  if (activeRequestCount < 0) activeRequestCount = 0;
  const busy = activeRequestCount > 0;

  [
    "#duplicateProjectBtn",
    "#archiveProjectBtn",
    "#saveProjectBtn",
    "#openTargetBtn",
    "#routeToAppBtn",
    "#routeToPortalBtn",
    "#routeToGameBtn",
    "#routeToResearchBtn"
  ].forEach((selector) => {
    const el = qs(selector);
    if (el) el.disabled = busy;
  });
}

async function callApi(path, method = "GET", payload = null) {
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

function normalizeProject(item) {
  return {
    id: item.public_id || item.project_public_id || item.id || "",
    title: item.title || "Untitled project",
    class: item.type || item.class || "App",
    subtype: item.subtype || "",
    status: item.status || "Draft",
    readiness: item.readiness || "Prep",
    target: item.portal || item.target || "PortalCreator",
    preset: item.preset || "none",
    nextAction: item.next_action || item.nextAction || "",
    summary: item.summary || "",
    tags: Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags || ""),
    origin: item.origin || "",
    assets: Array.isArray(item.assets) ? item.assets.join("\n") : (item.assets || ""),
    notes: item.notes || "",
    pinned: Boolean(item.pinned),
    checks: Array.isArray(item.checks) ? item.checks.slice(0, 4) : [false, false, false, false]
  };
}

function toBackendType(projectClass) {
  const map = {
    App: "app",
    Web: "web",
    Portal: "portal",
    Game: "game",
    Research: "research",
    System: "system"
  };
  return map[projectClass] || String(projectClass || "app").toLowerCase();
}

function toBackendPortal(target) {
  const map = {
    AppCreator: "appcreator",
    PortalCreator: "portalcreator",
    "Game Designer": "game-designer",
    "Research Core": "research-core",
    LoreCore: "lorecore"
  };
  return map[target] || String(target || "").toLowerCase();
}

function getSelectedProject() {
  return state.projects.find(project => project.id === state.selectedProjectId) || state.projects[0] || null;
}

function ensureSelectedProjectExists() {
  if (!state.projects.length) {
    state.selectedProjectId = "";
    return;
  }
  if (!state.projects.some(project => project.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0].id;
  }
}

function filterProjectsLocal(projects) {
  const search = state.filters.search.trim().toLowerCase();

  return projects.filter(project => {
    const matchesSearch = !search || [
      project.title,
      project.summary,
      project.tags,
      project.origin,
      project.notes,
      project.class,
      project.target
    ].join(" ").toLowerCase().includes(search);

    const matchesStatus = state.filters.status === "All" || project.status === state.filters.status;
    const matchesReadiness = state.filters.readiness === "All" || project.readiness === state.filters.readiness;

    return matchesSearch && matchesStatus && matchesReadiness;
  });
}

function projectButtonMarkup(project) {
  return `
    <button class="library-item ${project.id === state.selectedProjectId ? "library-item--active" : ""}" type="button" data-project-id="${escapeHtml(project.id)}">
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
  const filtered = filterProjectsLocal(state.projects);

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
      el.value = value ?? "";
    } else {
      el.textContent = value ?? "";
    }
  });

  const handoffPreview = qs("#handoffPreview");
  if (handoffPreview) {
    handoffPreview.innerHTML = `
      <strong>${escapeHtml(project.target)}</strong>
      <span>${escapeHtml(project.preset || "none")} · ${escapeHtml((project.readiness || "").toLowerCase())}</span>
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

  const checks = Array.isArray(project.checks) ? project.checks : [false, false, false, false];

  container.innerHTML = labels.map((label, index) => `
    <label class="check-item" data-check-index="${index}">
      <input type="checkbox" ${checks[index] ? "checked" : ""} />
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
      if (!Array.isArray(selected.checks)) selected.checks = [false, false, false, false];
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

function buildProjectPayload(project) {
  return {
    title: project.title,
    type: toBackendType(project.class),
    subtype: project.subtype,
    status: project.status,
    readiness: project.readiness,
    portal: toBackendPortal(project.target),
    preset: project.preset,
    next_action: project.nextAction,
    summary: project.summary,
    tags: project.tags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    origin: project.origin,
    assets: project.assets
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    notes: project.notes,
    pinned: Boolean(project.pinned),
    checks: Array.isArray(project.checks) ? project.checks : [false, false, false, false]
  };
}

async function duplicateSelectedProject() {
  const selected = getSelectedProject();
  if (!selected) return;

  const payload = buildProjectPayload({
    ...clone(selected),
    title: `${selected.title} Copy`,
    pinned: false
  });

  setBusy(true);
  const result = await callApi("/api/projects", "POST", payload);
  setBusy(false);

  if (!result.ok) {
    showToast("Duplicate failed", "warn");
    return;
  }

  await refreshProjects();
  const newId = result.body?.public_id || result.body?.project_public_id || result.body?.id;
  if (newId) state.selectedProjectId = newId;
  saveState();
  renderAll();
  showToast("Project duplicated", "good");
}

async function archiveSelectedProject() {
  const selected = getSelectedProject();
  if (!selected?.id) return;

  selected.status = "Archived";
  selected.readiness = "Prep";

  setBusy(true);
  const result = await callApi(`/api/projects/${encodeURIComponent(selected.id)}`, "PUT", {
    status: selected.status,
    readiness: selected.readiness
  });
  setBusy(false);

  if (!result.ok) {
    showToast("Archive failed", "warn");
    return;
  }

  await refreshProjects();
  state.selectedProjectId = selected.id;
  saveState();
  renderAll();
  showToast("Project archived", "warn");
}

async function saveSelectedProject() {
  updateSelectedProjectFromWorkspace();
  const selected = getSelectedProject();
  if (!selected?.id) {
    showToast("No selected project", "warn");
    return;
  }

  setBusy(true);
  const result = await callApi(`/api/projects/${encodeURIComponent(selected.id)}`, "PUT", buildProjectPayload(selected));
  setBusy(false);

  if (!result.ok) {
    showToast("Project save failed", "warn");
    return;
  }

  await refreshProjects();
  state.selectedProjectId = selected.id;
  saveState();
  renderAll();
  showToast("Project saved", "good");
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

async function refreshProjects() {
  const params = new URLSearchParams();

  if (state.filters.search.trim()) params.set("search", state.filters.search.trim());
  if (state.filters.status !== "All") params.set("status", state.filters.status);

  const selectedClass = getSelectedProject()?.class;
  if (selectedClass && selectedClass !== "All") {
    params.set("type_", toBackendType(selectedClass));
  }

  const query = params.toString() ? `?${params.toString()}` : "";

  setBusy(true);
  const result = await callApi(`/api/projects${query}`, "GET");
  setBusy(false);

  if (!result.ok) {
    showToast("Could not load projects", "warn");
    return;
  }

  state.projects = Array.isArray(result.body?.items)
    ? result.body.items.map(normalizeProject)
    : [];

  ensureSelectedProjectExists();
  state.loaded = true;
  saveState();
  renderAll();
}

function renderAll() {
  initFiltersUI();
  ensureSelectedProjectExists();
  renderLibrary();
  renderWorkspace();
}

async function init() {
  renderAll();
  bindFilters();
  bindWorkspace();
  bindButtons();
  await refreshProjects();
}

document.addEventListener("DOMContentLoaded", init);
