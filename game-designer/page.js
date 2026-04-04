const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const GD_KEY = "GD_STATE_V1";

const GENERATION_TYPES = [
  { id: "gdd",          label: "Game Design Doc",    icon: "📋", desc: "Full GDD from your design notes" },
  { id: "tower_spec",   label: "Tower Specs",        icon: "🗼", desc: "Stats, upgrade paths, ScriptableObjects" },
  { id: "enemy_spec",   label: "Enemy Specs",        icon: "👾", desc: "Enemy stats, behaviors, wave data" },
  { id: "level_design", label: "Level Design",       icon: "🗺️", desc: "Level layout, wave composition, JSON" },
  { id: "code",         label: "C# Code",            icon: "💻", desc: "Unity MonoBehaviours and systems" },
  { id: "asset_prompts",label: "Asset Prompts",      icon: "🎨", desc: "Stable Diffusion prompts for sprites" },
  { id: "lore",         label: "Lore & World",       icon: "📖", desc: "World building, narrative, lore bible" },
  { id: "dialogue",     label: "Dialogue",           icon: "💬", desc: "NPC dialogue and branching trees" },
  { id: "quest",        label: "Quest Design",       icon: "⚔️", desc: "Quest structures with objectives" },
];

const DOC_TYPES = [
  "gdd", "tower_spec", "enemy_spec", "level_design", "lore", "dialogue", "quest", "notes", "general"
];

const state = {
  projects: [],
  activeProjectId: localStorage.getItem("gd_active_project") || null,
  activeProject: null,
  documents: [],
  artifacts: [],
  generations: [],
  activeSection: "overview",
  selectedModel: "",
  availableModels: [],
  generating: false,
  activeArtifactId: null,
  activeDocId: null,
};

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const uid = () => Math.random().toString(36).slice(2,10);

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
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ── Model pool ────────────────────────────────────────────────────────────────

async function loadModels() {
  const r = await api("/api/model-pool/models?sync=false");
  if (!r.ok) return;
  const items = Array.isArray(r.body?.items) ? r.body.items : [];
  state.availableModels = items
    .filter(m => m.enabled && m.runtime_driver === "openai_api")
    .map(m => ({ value: m.alias, label: m.name || m.alias }));
  if (!state.selectedModel && state.availableModels[0]) {
    state.selectedModel = state.availableModels[0].value;
  }
  renderModelSelect();
}

function renderModelSelect() {
  const sel = qs("#modelSelect"); if (!sel) return;
  sel.innerHTML = state.availableModels.map(m =>
    `<option value="${esc(m.value)}" ${m.value === state.selectedModel ? "selected" : ""}>${esc(m.label)}</option>`
  ).join("");
}

// ── Projects ──────────────────────────────────────────────────────────────────

async function loadProjects() {
  const r = await api("/api/gd/projects");
  if (!r.ok) return;
  state.projects = Array.isArray(r.body?.items) ? r.body.items : [];
  renderProjectList();
  if (state.activeProjectId) {
    await selectProject(state.activeProjectId);
  } else if (state.projects[0]) {
    await selectProject(state.projects[0].public_id);
  } else {
    renderEmptyState();
  }
}

async function selectProject(pid) {
  state.activeProjectId = pid;
  localStorage.setItem("gd_active_project", pid);
  const r = await api(`/api/gd/projects/${pid}`);
  if (!r.ok) return;
  state.activeProject = r.body;
  await Promise.all([loadDocuments(), loadArtifacts()]);
  renderAll();
}

async function createProject(title, engine, genre, summary) {
  const r = await api("/api/gd/projects", {
    method: "POST",
    body: { title, engine, genre, summary }
  });
  if (!r.ok) { showToast("Failed to create project", "warn"); return; }
  await loadProjects();
  await selectProject(r.body.public_id);
  showToast(`${title} created`, "good");
}

async function saveProject() {
  if (!state.activeProject) return;
  const title = qs("#projTitle")?.value.trim() || state.activeProject.title;
  const summary = qs("#projSummary")?.value.trim() || "";
  const design_doc = qs("#projDesignDoc")?.value || "";
  const r = await api(`/api/gd/projects/${state.activeProjectId}`, {
    method: "PATCH",
    body: { title, summary, design_doc }
  });
  if (!r.ok) { showToast("Save failed", "warn"); return; }
  state.activeProject = { ...state.activeProject, title, summary, design_doc };
  renderProjectList();
  showToast("Project saved", "good");
}

// ── Documents ─────────────────────────────────────────────────────────────────

async function loadDocuments() {
  if (!state.activeProjectId) return;
  const r = await api(`/api/gd/projects/${state.activeProjectId}/documents`);
  if (!r.ok) return;
  state.documents = Array.isArray(r.body?.items) ? r.body.items : [];
}

async function createDocument(doc_type, title, content = "") {
  const r = await api(`/api/gd/projects/${state.activeProjectId}/documents`, {
    method: "POST",
    body: { doc_type, title, content }
  });
  if (!r.ok) { showToast("Failed to create document", "warn"); return; }
  await loadDocuments();
  state.activeDocId = r.body.public_id;
  renderDocuments();
  showToast("Document created", "good");
}

async function saveDocument(docId, content) {
  const r = await api(`/api/gd/documents/${docId}`, {
    method: "PATCH",
    body: { content }
  });
  if (!r.ok) { showToast("Save failed", "warn"); return; }
  const doc = state.documents.find(d => d.public_id === docId);
  if (doc) doc.content = content;
  showToast("Saved", "good");
}

async function deleteDocument(docId) {
  if (!confirm("Delete this document?")) return;
  await api(`/api/gd/documents/${docId}`, { method: "DELETE" });
  state.documents = state.documents.filter(d => d.public_id !== docId);
  if (state.activeDocId === docId) state.activeDocId = null;
  renderDocuments();
  showToast("Document deleted", "warn");
}

// ── Artifacts ─────────────────────────────────────────────────────────────────

async function loadArtifacts() {
  if (!state.activeProjectId) return;
  const r = await api(`/api/gd/projects/${state.activeProjectId}/artifacts`);
  if (!r.ok) return;
  state.artifacts = Array.isArray(r.body?.items) ? r.body.items : [];
}

async function deleteArtifact(artifactId) {
  if (!confirm("Delete this artifact?")) return;
  await api(`/api/gd/artifacts/${artifactId}`, { method: "DELETE" });
  state.artifacts = state.artifacts.filter(a => a.public_id !== artifactId);
  if (state.activeArtifactId === artifactId) state.activeArtifactId = null;
  renderArtifacts();
  showToast("Artifact deleted", "warn");
}

async function saveArtifactAsDocument(artifact) {
  await createDocument(artifact.artifact_type, artifact.title, artifact.content);
  showToast("Saved to documents", "good");
}

// ── Generate ──────────────────────────────────────────────────────────────────

async function generate(genType, customPrompt = "") {
  if (!state.activeProjectId) { showToast("No active project", "warn"); return; }
  if (state.generating) { showToast("Generation in progress", "warn"); return; }

  state.generating = true;
  const btn = qs(`[data-gen-type="${genType}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }
  setGenerateStatus("Generating — this may take 20-60 seconds…", "warn");

  const r = await api(`/api/gd/projects/${state.activeProjectId}/generate`, {
    method: "POST",
    body: {
      generation_type: genType,
      model: state.selectedModel,
      prompt: customPrompt,
    }
  });

  state.generating = false;
  if (btn) {
    const genDef = GENERATION_TYPES.find(g => g.id === genType);
    btn.disabled = false;
    btn.textContent = genDef ? `${genDef.icon} ${genDef.label}` : genType;
  }

  if (!r.ok) {
    setGenerateStatus("Generation failed", "warn");
    showToast("Generation failed", "warn");
    return;
  }

  setGenerateStatus("Done", "good");
  showToast("Generation complete", "good");

  await loadArtifacts();

  // Auto-open the new artifact
  if (r.body.artifact_id) {
    state.activeArtifactId = r.body.artifact_id;
    switchSection("artifacts");
  }
}

function setGenerateStatus(msg, tone = "good") {
  const el = qs("#generateStatus"); if (!el) return;
  el.textContent = msg;
  el.className = `generate-status generate-status--${tone}`;
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderAll() {
  renderProjectList();
  renderProjectHeader();
  renderOverview();
  renderDocuments();
  renderArtifacts();
  renderGeneratePanel();
}

function renderEmptyState() {
  const main = qs("#mainContent"); if (!main) return;
  main.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🎮</div>
      <h2>No projects yet</h2>
      <p>Create your first game project to get started.</p>
      <button class="button button--primary" id="emptyCreateBtn">+ New project</button>
    </div>
  `;
  qs("#emptyCreateBtn")?.addEventListener("click", () => showNewProjectForm());
}

function renderProjectList() {
  const el = qs("#projectList"); if (!el) return;
  el.innerHTML = state.projects.map(p => `
    <button class="project-item ${p.public_id === state.activeProjectId ? "active" : ""}"
      data-pid="${esc(p.public_id)}">
      <span class="project-item-icon">🎮</span>
      <span class="project-item-title">${esc(p.title)}</span>
      <span class="project-item-engine">${esc(p.engine)}</span>
    </button>
  `).join("") + `
    <button class="project-item project-item--add" id="newProjectBtn">
      <span>+</span> New project
    </button>
  `;
  qsa(".project-item[data-pid]", el).forEach(btn => {
    btn.addEventListener("click", () => selectProject(btn.dataset.pid));
  });
  qs("#newProjectBtn")?.addEventListener("click", showNewProjectForm);
}

function renderProjectHeader() {
  if (!state.activeProject) return;
  const el = qs("#projectTitle");
  if (el) el.textContent = state.activeProject.title;
  const eng = qs("#projectEngine");
  if (eng) eng.textContent = state.activeProject.engine;
}

function renderOverview() {
  const el = qs("#overviewContent"); if (!el) return;
  if (!state.activeProject) return;
  el.innerHTML = `
    <div class="field-grid">
      <label class="inline-field">
        <span class="soft">Project title</span>
        <input class="input" id="projTitle" value="${esc(state.activeProject.title)}" />
      </label>
      <label class="inline-field">
        <span class="soft">Summary</span>
        <input class="input" id="projSummary" value="${esc(state.activeProject.summary || '')}" placeholder="One-line summary..." />
      </label>
      <label class="inline-field">
        <span class="soft">Design document — paste your full design here, models use this as context for all generation</span>
        <textarea class="textarea textarea--tall" id="projDesignDoc" placeholder="Paste your full game design document here...">${esc(state.activeProject.design_doc || '')}</textarea>
      </label>
      <div class="button-row">
        <button class="button button--primary" id="saveProjectBtn">Save project</button>
      </div>
    </div>

    <div class="overview-stats">
      <div class="stat-pill">${state.documents.length} documents</div>
      <div class="stat-pill">${state.artifacts.length} artifacts</div>
      <div class="stat-pill">${esc(state.activeProject.engine)}</div>
      <div class="stat-pill">${esc(state.activeProject.genre.replace("_"," "))}</div>
    </div>
  `;
  qs("#saveProjectBtn")?.addEventListener("click", saveProject);
}

function renderDocuments() {
  const el = qs("#documentsContent"); if (!el) return;
  const activeDoc = state.documents.find(d => d.public_id === state.activeDocId);

  el.innerHTML = `
    <div class="doc-layout">
      <div class="doc-list">
        <div class="doc-list-head">
          <span class="eyebrow">Documents</span>
          <button class="button button--small button--primary" id="newDocBtn">+ New</button>
        </div>
        ${state.documents.length ? state.documents.map(d => `
          <button class="doc-item ${d.public_id === state.activeDocId ? "active" : ""}" data-doc-id="${esc(d.public_id)}">
            <span class="doc-item-type">${esc(d.doc_type)}</span>
            <span class="doc-item-title">${esc(d.title)}</span>
          </button>
        `).join("") : `<div class="soft" style="padding:12px;font-size:12px;">No documents yet</div>`}
      </div>
      <div class="doc-editor">
        ${activeDoc ? `
          <div class="doc-editor-head">
            <div>
              <div class="eyebrow">${esc(activeDoc.doc_type)}</div>
              <strong>${esc(activeDoc.title)}</strong>
            </div>
            <div class="button-row">
              <button class="button button--small" id="saveDocBtn" data-doc-id="${esc(activeDoc.public_id)}">Save</button>
              <button class="button button--small button--danger" id="deleteDocBtn" data-doc-id="${esc(activeDoc.public_id)}">Delete</button>
            </div>
          </div>
          <textarea class="textarea textarea--editor" id="docEditor">${esc(activeDoc.content || '')}</textarea>
        ` : `<div class="doc-empty">Select a document to edit</div>`}
      </div>
    </div>
  `;

  qs("#newDocBtn")?.addEventListener("click", () => {
    const title = prompt("Document title:");
    if (!title) return;
    const type = prompt("Type (gdd/tower_spec/enemy_spec/level_design/lore/notes):", "notes");
    createDocument(type || "notes", title);
  });

  qsa(".doc-item[data-doc-id]", el).forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeDocId = btn.dataset.docId;
      renderDocuments();
    });
  });

  qs("#saveDocBtn")?.addEventListener("click", () => {
    const content = qs("#docEditor")?.value || "";
    saveDocument(activeDoc.public_id, content);
  });

  qs("#deleteDocBtn")?.addEventListener("click", () => {
    deleteDocument(activeDoc.public_id);
  });
}

function renderArtifacts() {
  const el = qs("#artifactsContent"); if (!el) return;
  const activeArtifact = state.artifacts.find(a => a.public_id === state.activeArtifactId);

  // Group by type
  const groups = {};
  state.artifacts.forEach(a => {
    if (!groups[a.artifact_type]) groups[a.artifact_type] = [];
    groups[a.artifact_type].push(a);
  });

  el.innerHTML = `
    <div class="doc-layout">
      <div class="doc-list">
        <div class="doc-list-head">
          <span class="eyebrow">Artifacts</span>
        </div>
        ${Object.entries(groups).map(([type, arts]) => `
          <div class="artifact-group-label">${esc(type.replace("_"," "))}</div>
          ${arts.map(a => `
            <button class="doc-item ${a.public_id === state.activeArtifactId ? "active" : ""}" data-artifact-id="${esc(a.public_id)}">
              <span class="doc-item-type">${esc(a.language || a.artifact_type)}</span>
              <span class="doc-item-title">${esc(a.title)}</span>
            </button>
          `).join("")}
        `).join("") || `<div class="soft" style="padding:12px;font-size:12px;">No artifacts yet — generate something</div>`}
      </div>
      <div class="doc-editor">
        ${activeArtifact ? `
          <div class="doc-editor-head">
            <div>
              <div class="eyebrow">${esc(activeArtifact.artifact_type)} · ${esc(activeArtifact.language)}</div>
              <strong>${esc(activeArtifact.title)}</strong>
            </div>
            <div class="button-row">
              <button class="button button--small button--primary" id="saveArtifactAsDocBtn">Save to docs</button>
              <button class="button button--small" id="copyArtifactBtn">Copy</button>
              <button class="button button--small button--danger" id="deleteArtifactBtn">Delete</button>
            </div>
          </div>
          <pre class="artifact-viewer"><code>${esc(activeArtifact.content || '')}</code></pre>
        ` : `<div class="doc-empty">Select an artifact to view</div>`}
      </div>
    </div>
  `;

  qsa(".doc-item[data-artifact-id]", el).forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeArtifactId = btn.dataset.artifactId;
      renderArtifacts();
    });
  });

  qs("#saveArtifactAsDocBtn")?.addEventListener("click", () => saveArtifactAsDocument(activeArtifact));
  qs("#deleteArtifactBtn")?.addEventListener("click", () => deleteArtifact(activeArtifact.public_id));
  qs("#copyArtifactBtn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(activeArtifact.content || "");
    showToast("Copied to clipboard", "good");
  });
}

function renderGeneratePanel() {
  const el = qs("#generateContent"); if (!el) return;
  el.innerHTML = `
    <div class="generate-layout">
      <div class="generate-controls">
        <div class="inline-field" style="margin-bottom:16px;">
          <span class="soft">Model</span>
          <select class="select" id="modelSelect">
            ${state.availableModels.map(m =>
              `<option value="${esc(m.value)}" ${m.value === state.selectedModel ? "selected" : ""}>${esc(m.label)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="inline-field" style="margin-bottom:16px;">
          <span class="soft">Custom prompt (optional — leave blank to auto-generate)</span>
          <textarea class="textarea" id="customPrompt" rows="3" placeholder="Add specific instructions or context for this generation..."></textarea>
        </div>
        <div id="generateStatus" class="generate-status"></div>
      </div>
      <div class="generate-grid">
        ${GENERATION_TYPES.map(g => `
          <button class="gen-card" data-gen-type="${esc(g.id)}">
            <span class="gen-card-icon">${g.icon}</span>
            <span class="gen-card-label">${esc(g.label)}</span>
            <span class="gen-card-desc">${esc(g.desc)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  qs("#modelSelect")?.addEventListener("change", e => { state.selectedModel = e.target.value; });

  qsa(".gen-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const genType = btn.dataset.genType;
      const customPrompt = qs("#customPrompt")?.value.trim() || "";
      generate(genType, customPrompt);
    });
  });
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function switchSection(section) {
  state.activeSection = section;
  qsa(".snav-item").forEach(b => b.classList.toggle("snav-item--active", b.dataset.section === section));
  qsa(".gd-section").forEach(s => s.classList.toggle("active", s.id === `section-${section}`));
}

function showNewProjectForm() {
  const existing = qs("#newProjectForm");
  if (existing) { existing.remove(); return; }

  const form = document.createElement("div");
  form.id = "newProjectForm";
  form.className = "new-project-form";
  form.innerHTML = `
    <div class="eyebrow" style="margin-bottom:10px;">New project</div>
    <div class="form-grid">
      <label class="inline-field">
        <span class="soft">Title</span>
        <input class="input" id="np_title" placeholder="My Tower Defence" />
      </label>
      <label class="inline-field">
        <span class="soft">Engine</span>
        <select class="select" id="np_engine">
          <option value="unity">Unity</option>
          <option value="unreal">Unreal Engine</option>
          <option value="godot">Godot</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label class="inline-field">
        <span class="soft">Genre</span>
        <select class="select" id="np_genre">
          <option value="tower_defence">Tower Defence</option>
          <option value="hero_defence">Hero Defence</option>
          <option value="rpg">RPG</option>
          <option value="fps">FPS</option>
          <option value="platformer">Platformer</option>
          <option value="strategy">Strategy</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label class="inline-field">
        <span class="soft">Summary</span>
        <input class="input" id="np_summary" placeholder="Brief description..." />
      </label>
    </div>
    <div class="button-row" style="margin-top:12px;">
      <button class="button" id="cancelNewProject">Cancel</button>
      <button class="button button--primary" id="confirmNewProject">Create</button>
    </div>
  `;

  qs("#projectList")?.after(form);

  qs("#cancelNewProject")?.addEventListener("click", () => form.remove());
  qs("#confirmNewProject")?.addEventListener("click", () => {
    const title = qs("#np_title")?.value.trim();
    if (!title) { showToast("Title required", "warn"); return; }
    const engine = qs("#np_engine")?.value || "unity";
    const genre = qs("#np_genre")?.value || "tower_defence";
    const summary = qs("#np_summary")?.value.trim() || "";
    form.remove();
    createProject(title, engine, genre, summary);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function bindNav() {
  qsa(".snav-item").forEach(btn => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });
}

async function init() {
  bindNav();
  await Promise.all([loadModels(), loadProjects()]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
