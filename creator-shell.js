// creator-shell.js v2 — pipeline selector + model-per-role assignment

const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

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
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const uid = () => Math.random().toString(36).slice(2,10);

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg;
  t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 3000);
}

function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// ── Role → pool role_tags mapping ────────────────────────────────────────────
const ROLE_POOL_MAP = {
  "Planner":               ["planner", "lead", "creative_lead"],
  "Builder":               ["coder", "builder"],
  "Verifier":              ["verifier", "critic"],
  "Architect":             ["planner", "creative_lead"],
  "Designer":              ["creative_lead", "planner"],
  "Researcher":            ["planner", "reasoning"],
  "Synthesiser":           ["creative_lead", "planner"],
  "Critic":                ["verifier", "critic"],
  "Writer":                ["creative_lead"],
  "Story Architect":       ["creative_lead", "planner"],
  "Worldbuilder":          ["creative_lead"],
  "Character Smith":       ["creative_lead"],
  "Drafting Partner":      ["creative_lead", "planner"],
  "Continuity Verifier":   ["verifier"],
  "Observer":              ["planner"],
  "Triage":                ["verifier"],
};

function _roleMatches(modelRoles, pipelineRole) {
  const targets = ROLE_POOL_MAP[pipelineRole] || [pipelineRole.toLowerCase()];
  return modelRoles.some(r => targets.includes(r.toLowerCase()));
}

// ── Stage kind → node type mapping ───────────────────────────────────────────
const KIND_TYPE_MAP = {
  input: "input",
  transform: "planner",
  build: "coder",
  verify: "verifier",
  branch: "branch",
  handoff: "projection",
};

// ── Stage kind → preferred pipeline role ─────────────────────────────────────
const KIND_ROLE_MAP = {
  input:     "Researcher",
  transform: "Planner",
  build:     "Builder",
  verify:    "Verifier",
  branch:    "Planner",
  handoff:   "Builder",
};

// ── CreatorShell ──────────────────────────────────────────────────────────────
class CreatorShell {
  constructor(pageId) {
    this.pageId = pageId;
    this.state = {
      // Projects
      projects: [],
      activeProjectId: localStorage.getItem(`creator_${pageId}_project`) || null,
      activeProject: null,
      // Pipelines
      pipelines: [],
      activePipelineId: localStorage.getItem(`creator_${pageId}_pipeline`) || null,
      activePipeline: null,
      pipelineModels: [],     // [{role, alias}]
      availableModels: [],    // pool models tagged pipeline/pipelines
      // Jobs / artifacts
      jobs: [],
      activeJobId: null,
      artifacts: [],
        activeArtifactId: null,
      pollInterval: null,
      // Stage status overlay
      stages: [],
      logLines: [],
      // Subclass extras
      activeTarget: null,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // PIPELINE SELECTOR
  // ════════════════════════════════════════════════════════════════

  async loadPipelines() {
    const TYPE_MAP = {
      game:     ["game","Game"],
      app:      ["app","App"],
      portal:   ["portal","Portal"],
      lorecore: ["lore","Lore","creative","Creative"],
      research: ["research","Research"],
    };
    const myTypes = TYPE_MAP[this.pageId] || [];

    const [pr, mr] = await Promise.all([
      api("/api/pipelines"),
      api("/api/model-pool/models"),
    ]);

    if (pr.ok) {
      const all = Array.isArray(pr.body?.items) ? pr.body.items : [];
      this.state.pipelines = all.filter(p => {
        const portals = (p.compatible_portals || []).map(x => x.toLowerCase());
        const ptype = (p.type || "").toLowerCase();
        return myTypes.some(t =>
          portals.some(x => x.includes(t.toLowerCase())) ||
          ptype.includes(t.toLowerCase())
        );
      });
    }

    if (mr.ok) {
      const items = Array.isArray(mr.body?.items) ? mr.body.items : [];
      this.state.availableModels = items.filter(m => {
        if (!m.enabled) return false;
        let surfaces = m.surface_allowlist || [];
        if (typeof surfaces === "string") {
          try { surfaces = JSON.parse(surfaces); } catch { surfaces = []; }
        }
        return surfaces.includes("pipeline") || surfaces.includes("pipelines");
      });
    }

    // Restore or auto-select pipeline
    const saved = this.state.pipelines.find(p => p.public_id === this.state.activePipelineId);
    const first = this.state.pipelines[0];
    const active = saved || first || null;
    if (active) {
      this.state.activePipeline = active;
      this.state.activePipelineId = active.public_id;
      this._initPipelineModels(active);
    }

    this.renderPipelineSelector();
  }

  _initPipelineModels(pipeline) {
    const roles = pipeline.required_agent_roles || [];
    const savedKey = `creator_${this.pageId}_models_${pipeline.public_id}`;
    const saved = JSON.parse(localStorage.getItem(savedKey) || "null");
    if (saved && Array.isArray(saved)) {
      this.state.pipelineModels = saved;
      return;
    }
    // Auto-assign: first model whose role_tags match the pipeline role
    this.state.pipelineModels = roles.map(role => {
      const match = this.state.availableModels.find(m => {
        const mRoles = m.role_tags || m.capability_tags || [];
        return _roleMatches(mRoles, role);
      });
      return { role, alias: match?.alias || "" };
    });
  }

  _savePipelineModels() {
    if (!this.state.activePipelineId) return;
    localStorage.setItem(
      `creator_${this.pageId}_models_${this.state.activePipelineId}`,
      JSON.stringify(this.state.pipelineModels)
    );
  }

  renderPipelineSelector() {
    const el = qs("#pipelineSelector"); if (!el) return;

    const pipeline = this.state.activePipeline;
    const roles = pipeline?.required_agent_roles || [];
    const stages = pipeline?.stages || [];

    el.innerHTML = `
      <div class="ps-header">
        <div class="ps-title-row">
          <span class="eyebrow accent">Pipeline</span>
          <select class="select select--sm" id="pipelineDropdown">
            ${!this.state.pipelines.length
              ? `<option value="">No compatible pipelines</option>`
              : this.state.pipelines.map(p => `
                  <option value="${esc(p.public_id)}" ${p.public_id === this.state.activePipelineId ? "selected" : ""}>
                    ${esc(p.name)}
                  </option>`).join("")}
          </select>
        </div>
        ${pipeline?.description ? `<div class="ps-desc">${esc(pipeline.description)}</div>` : ""}
      </div>

      ${stages.length ? `
        <div class="ps-stages">
          ${stages.map(s => `<span class="ps-stage-chip">${esc(s.title || s.id)}</span>`).join("")}
        </div>` : ""}

      ${roles.length ? `
        <div class="ps-roles">
          <div class="ps-roles-label">Model per role</div>
          <div class="ps-roles-list">
            ${roles.map(role => {
              const assignment = this.state.pipelineModels.find(m => m.role === role) || {};
              return `
                <div class="ps-role-row">
                  <span class="ps-role-name">${esc(role)}</span>
                  <select class="select select--sm ps-model-select" data-role="${esc(role)}">
                    <option value="">— auto —</option>
                    ${this.state.availableModels.map(m => `
                      <option value="${esc(m.alias)}" ${m.alias === assignment.alias ? "selected" : ""}>
                        ${esc(m.name || m.alias)}
                      </option>`).join("")}
                  </select>
                </div>`;
            }).join("")}
          </div>
        </div>` : ""}
    `;

    qs("#pipelineDropdown")?.addEventListener("change", e => {
      const found = this.state.pipelines.find(p => p.public_id === e.target.value);
      if (!found) return;
      this.state.activePipeline = found;
      this.state.activePipelineId = found.public_id;
      localStorage.setItem(`creator_${this.pageId}_pipeline`, found.public_id);
      this._initPipelineModels(found);
      this.renderPipelineSelector();
      this.updateLaunchBar();
    });

    qsa(".ps-model-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const role = sel.dataset.role;
        const existing = this.state.pipelineModels.find(m => m.role === role);
        if (existing) existing.alias = sel.value;
        else this.state.pipelineModels.push({ role, alias: sel.value });
        this._savePipelineModels();
      });
    });
  }

  // Build node-level model map for pipeline executor
  _buildModelAssignments() {
    const pipeline = this.state.activePipeline;
    if (!pipeline) return {};
    const roles = pipeline.required_agent_roles || [];
    return (pipeline.stages || []).reduce((map, s, i) => {
      const preferredRole = KIND_ROLE_MAP[s.kind] || roles[i % Math.max(roles.length, 1)] || roles[0];
      const assignment = this.state.pipelineModels.find(m => m.role === preferredRole);
      const fallback   = this.state.pipelineModels.find(m => m.alias);
      map[s.id] = assignment?.alias || fallback?.alias || "";
      return map;
    }, {});
  }

  // ════════════════════════════════════════════════════════════════
  // PROJECTS
  // ════════════════════════════════════════════════════════════════

  async loadProjects() {
    const r = await api("/api/projects");
    if (!r.ok) return;
    const all = Array.isArray(r.body?.items) ? r.body.items : [];
    this.state.projects = all.filter(p => {
      const portal = (p.target_portal || "").toLowerCase();
      if (this.pageId === "portal")   return portal.includes("portal");
      if (this.pageId === "app")      return portal.includes("app");
      if (this.pageId === "game")     return portal.includes("game");
      if (this.pageId === "lorecore") return portal.includes("lore") || portal.includes("creative");
      if (this.pageId === "research") return portal.includes("research");
      return true;
    });
    this.renderProjectList();

    const saved = this.state.projects.find(p => p.public_id === this.state.activeProjectId);
    if (saved) {
      await this.selectProject(saved.public_id);
    } else if (this.state.projects[0]) {
      await this.selectProject(this.state.projects[0].public_id);
    } else {
      this.renderEmptyState();
    }
  }

  async selectProject(pid) {
    this.state.activeProjectId = pid;
    localStorage.setItem(`creator_${this.pageId}_project`, pid);
    this.state.activeProject = this.state.projects.find(p => p.public_id === pid) || null;
    this.renderProjectList();
    this.renderProjectPlan();
    this.renderPipeline();
    this.loadJobs();
  }

  renderProjectList() {
    const el = qs("#projectList"); if (!el) return;
    if (!this.state.projects.length) {
      el.innerHTML = `<div class="section-meta" style="padding:8px 4px;">No projects yet — create one in Projects.</div>`;
      return;
    }
    el.innerHTML = this.state.projects.map(p => `
      <button class="project-item ${p.public_id === this.state.activeProjectId ? "active" : ""}" data-pid="${esc(p.public_id)}">
        <span class="project-item-icon">${this.projectIcon()}</span>
        <span class="project-item-body">
          <span class="project-item-title">${esc(p.title)}</span>
          <span class="project-item-meta">${esc(p.status || "Draft")} · ${esc(p.type || "")}</span>
        </span>
      </button>
    `).join("");
    qsa(".project-item[data-pid]", el).forEach(btn => {
      btn.addEventListener("click", () => this.selectProject(btn.dataset.pid));
    });
  }

  renderProjectPlan() {
    const el = qs("#projectPlan"); if (!el) return;
    const p = this.state.activeProject;
    if (!p) { el.innerHTML = `<div class="section-meta">Select a project.</div>`; return; }
    const notes = typeof p.notes === "object" ? p.notes : {};
    const goal        = notes.Goal || notes.goal || "";
    const modules     = notes.Modules || notes.modules || "";
    const constraints = notes.Constraints || notes.constraints || "";
    const nextAction  = p.next_action || "";
    el.innerHTML = `
      <div class="plan-card">
        <div class="plan-field">
          <span class="plan-field-label">Goal</span>
          <span class="plan-field-value accent">${esc(goal || p.title)}</span>
        </div>
        ${modules     ? `<div class="plan-field"><span class="plan-field-label">Modules</span><span class="plan-field-value">${esc(modules).replace(/\n/g,"<br>")}</span></div>` : ""}
        ${constraints ? `<div class="plan-field"><span class="plan-field-label">Constraints</span><span class="plan-field-value">${esc(constraints).replace(/\n/g,"<br>")}</span></div>` : ""}
        ${nextAction  ? `<div class="plan-field"><span class="plan-field-label">Next action</span><span class="plan-field-value">${esc(nextAction)}</span></div>` : ""}
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════════
  // JOBS
  // ════════════════════════════════════════════════════════════════

  async loadJobs() {
    if (!this.state.activeProjectId) return;
    const r = await api(`/api/production/jobs?subject_public_id=${this.state.activeProjectId}`);
    if (!r.ok) return;
    this.state.jobs = Array.isArray(r.body?.items) ? r.body.items : [];
    this.renderJobMonitor();
    this.renderRunHistory();
    this.updateJobStatusBar();
    const running = this.state.jobs.find(j => j.status === "running" || j.status === "queued");
    if (running && !this.state.pollInterval) this.startPolling(running.public_id);
  }

  async loadJobDetail(jobId) {
    const r = await api(`/api/production/jobs/${jobId}`);
    if (!r.ok) return null;
    return r.body;
  }

  startPolling(jobId) {
    this.state.activeJobId = jobId;
    this.state.pollInterval = setInterval(async () => {
      const detail = await this.loadJobDetail(jobId);
      if (!detail) return;
      const job       = detail.job || detail;
      const events    = detail.events || [];
      const artifacts = detail.artifacts || [];

      const idx = this.state.jobs.findIndex(j => j.public_id === jobId);
      if (idx >= 0) this.state.jobs[idx] = job;
      this.state.artifacts = artifacts;

      this.updateStagesFromEvents(events);
      this.appendEvents(events);
      this.renderJobMonitor();
      this.updateJobStatusBar();
      this.renderArtifacts();

      if (["completed","failed","interrupted"].includes(job.status)) {
        clearInterval(this.state.pollInterval);
        this.state.pollInterval = null;
        this.renderPipeline();
        showToast(job.status === "completed" ? "Job complete" : `Job ${job.status}`,
          job.status === "completed" ? "good" : "warn");
      }
    }, 2500);
  }

  _pollPipelineRun(jobId) {
    this.state.activeJobId = jobId;
    this.state.pollInterval = setInterval(async () => {
      const r = await api(`/api/pipelines/runs/${jobId}`);
      if (!r.ok) return;
      const run = r.body;

      Object.entries(run.node_states || {}).forEach(([nid, ns]) => {
        const key = `node_${nid}_${ns.status}`;
        if (!this.state.logLines.find(l => l.id === key)) {
          this.state.logLines.push({
            id: key,
            text: `[${nid}] ${ns.status}${ns.error ? ` — ${ns.error}` : ""}`,
            tone: ns.status === "done" ? "good" : ns.status === "failed" ? "bad" : "muted",
            time: ns.finished_at || ns.started_at || new Date().toISOString(),
          });
        }
      });
      this.renderExecLog();

      if (["completed","failed","partial"].includes(run.status)) {
        clearInterval(this.state.pollInterval);
        this.state.pollInterval = null;
        showToast(run.status === "completed" ? "Pipeline complete" : `Pipeline ${run.status}`,
          run.status === "completed" ? "good" : "warn");
        if (run.final_output) {
          this.state.artifacts.unshift({
            public_id: uid(),
            title: `Pipeline output — ${run.pipeline_id}`,
            artifact_type: "pipeline_output",
            content: run.final_output,
            created_at: new Date().toISOString(),
          });
          this.renderArtifacts();
        }
      }
    }, 2500);
  }

  updateStagesFromEvents(events) {
    events.forEach(ev => {
      const stage = this.state.stages.find(s => s.id === ev.stage_id);
      if (!stage) return;
      if (ev.event_type === "stage_start")    stage.status = "running";
      if (ev.event_type === "stage_complete") stage.status = "done";
      if (ev.event_type === "stage_fail")     stage.status = "failed";
    });
    this.renderPipeline();
  }

  appendEvents(events) {
    const existing = new Set(this.state.logLines.map(l => l.id));
    events.forEach(ev => {
      if (existing.has(ev.public_id)) return;
      this.state.logLines.push({
        id: ev.public_id,
        text: `[${ev.stage_id || "system"}] ${ev.message}`,
        tone: ev.status === "error" ? "bad" : ev.status === "complete" ? "good" : "muted",
        time: ev.created_at,
      });
    });
    this.renderExecLog();
  }

  renderExecLog() {
    const el = qs("#execLog"); if (!el) return;
    const lines = this.state.logLines.slice(-50).reverse();
    el.innerHTML = lines.length
      ? lines.map(l => `<div class="log-line ${l.tone}">${esc(l.text)}</div>`).join("")
      : `<div class="log-line muted">No activity yet.</div>`;
  }

  updateJobStatusBar() {
    const bar = qs("#jobStatusBar"); if (!bar) return;
    const running = this.state.jobs.find(j => j.status === "running");
    const latest  = this.state.jobs[0];
    if (running) {
      bar.className = "job-status-bar has-job";
      bar.innerHTML = `
        <div class="job-status-dot running"></div>
        <div class="job-status-text">${esc(running.title || "Running")}</div>
        <div class="job-status-meta">Stage ${running.current_stage || "—"} · ${running.progress || 0}%</div>
        <div class="progress-bar" style="width:120px"><div class="progress-fill" style="width:${running.progress||0}%"></div></div>`;
    } else if (latest) {
      const tone = latest.status === "completed" ? "good" : latest.status === "failed" ? "bad" : "";
      bar.className = "job-status-bar";
      bar.innerHTML = `
        <div class="job-status-dot ${tone}"></div>
        <div class="job-status-text">${esc(latest.title || "No active job")}</div>
        <div class="job-status-meta">${esc(latest.status)} · ${timeAgo(latest.updated_at)}</div>
        <span class="chip ${tone}">${esc(latest.status)}</span>`;
    } else {
      bar.className = "job-status-bar";
      bar.innerHTML = `
        <div class="job-status-dot"></div>
        <div class="job-status-text">No jobs</div>
        <div class="job-status-meta">Select a project and pipeline, then launch</div>
        <span class="chip">idle</span>`;
    }
  }

  renderJobMonitor() {
    const el = qs("#modelActivityList"); if (!el) return;
    const running = this.state.jobs.find(j => j.status === "running");
    if (!running) { el.innerHTML = `<div class="section-meta" style="padding:4px;">No active job.</div>`; return; }
    let participants = [];
    try { participants = JSON.parse(running.panel_plan || "[]"); } catch {}
    if (!participants.length) { el.innerHTML = `<div class="log-line muted">Job running — model assignments loading…</div>`; return; }
    el.innerHTML = participants.map((p, i) => `
      <div class="model-activity-item ${i === 0 ? "active" : ""}">
        <div class="model-dot ${i === 0 ? "active" : "done"}"></div>
        <span class="model-name">${esc(p.model || p.alias || "Model")}</span>
        <span class="model-task">${esc(p.role || "worker")}</span>
      </div>`).join("");
  }

  renderArtifacts() {
    const el = qs("#artifactList"); if (!el) return;
    if (!this.state.artifacts.length) { el.innerHTML = `<div class="section-meta" style="padding:4px;">No artifacts yet.</div>`; return; }
    el.innerHTML = this.state.artifacts.map(a => `
      <button class="artifact-item ${a.public_id === this.state.activeArtifactId ? "active" : ""}" data-artifact-id="${esc(a.public_id)}">
        <span class="artifact-title">${esc(a.title)}</span>
        <span class="artifact-meta">${esc(a.artifact_type)} · ${timeAgo(a.created_at)}</span>
      </button>`).join("");
    qsa(".artifact-item[data-artifact-id]", el).forEach(btn => {
      btn.addEventListener("click", () => this.openArtifact(btn.dataset.artifactId));
    });
  }

  openArtifact(id) {
    this.state.activeArtifactId = id;
    this.renderArtifacts();
    const artifact = this.state.artifacts.find(a => a.public_id === id);
    const el = qs("#artifactViewer"); if (!el) return;
    if (!artifact) { el.innerHTML = ""; return; }
    el.innerHTML = `
      <div class="artifact-viewer-panel">
        <div class="artifact-viewer-head">
          <div>
            <div class="eyebrow">${esc(artifact.artifact_type)}</div>
            <div class="section-title">${esc(artifact.title)}</div>
          </div>
          <div class="btn-row">
            <button class="btn btn--sm" id="copyArtifactBtn">Copy</button>
            <button class="btn btn--sm btn--primary" id="downloadArtifactBtn">Download</button>
          </div>
        </div>
        <pre class="artifact-viewer-body">${esc(artifact.content || "")}</pre>
      </div>`;
    qs("#copyArtifactBtn")?.addEventListener("click", () => {
      navigator.clipboard.writeText(artifact.content || "");
      showToast("Copied", "good");
    });
    qs("#downloadArtifactBtn")?.addEventListener("click", () => {
      const blob = new Blob([artifact.content || ""], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${artifact.title || "artifact"}.txt`; a.click();
      URL.revokeObjectURL(url);
    });
  }

  renderRunHistory() {
    const el = qs("#runHistory"); if (!el) return;
    if (!this.state.jobs.length) { el.innerHTML = `<div class="section-meta" style="padding:4px;">No runs yet.</div>`; return; }
    el.innerHTML = this.state.jobs.slice(0, 8).map(j => `
      <button class="run-item" data-job-id="${esc(j.public_id)}">
        <span class="run-title">${esc(j.title || "Run")}</span>
        <span class="run-meta">${esc(j.status)} · ${timeAgo(j.updated_at)}</span>
      </button>`).join("");
    qsa(".run-item[data-job-id]", el).forEach(btn => {
      btn.addEventListener("click", async () => {
        const detail = await this.loadJobDetail(btn.dataset.jobId);
        if (detail) {
          this.state.artifacts = detail.artifacts || [];
          this.appendEvents(detail.events || []);
          this.renderArtifacts();
          showToast("Run loaded", "good");
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════════
  // LAUNCH
  // ════════════════════════════════════════════════════════════════

  async launchJob(overrides = {}) {
    if (!this.state.activeProjectId) { showToast("Select a project first", "warn"); return; }
    if (!this.state.activePipeline)  { showToast("Select a pipeline first", "warn"); return; }

    const proj     = this.state.activeProject;
    const pipeline = this.state.activePipeline;

    // Build graph with per-node model assignments
    const modelMap   = this._buildModelAssignments();
    const rawStages  = pipeline.stages || [];
    const nodes = rawStages.map((s, i) => ({
      id:          s.id || `n_${i}`,
      title:       s.title || s.id,
      type:        KIND_TYPE_MAP[s.kind] || "planner",
      desc:        s.summary || "",
      group:       s.kind || "",
      model:       modelMap[s.id] || "",
      x: 0, y: 0,
      notes:       "",
      quorumRule:  "single pass",
      timeout:     "120s",
    }));
    const edges = nodes.slice(1).map((n, i) => ({
      id:   `e_${nodes[i].id}_${n.id}`,
      from: nodes[i].id,
      to:   n.id,
    }));

    const selectedModels = [...new Set(
      this.state.pipelineModels.map(m => m.alias).filter(Boolean)
    )];

    const launchBtn = qs("#launchBtn");
    if (launchBtn) { launchBtn.disabled = true; launchBtn.textContent = "Launching…"; }

    const r = await api(`/api/pipelines/${pipeline.public_id}/run`, {
      method: "POST",
      body: {
        objective:       proj?.notes?.Goal || proj?.title || pipeline.name,
        selected_models: selectedModels,
        surface:         this.pageId,
        ...overrides,
      },
    });

    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = this.launchLabel(); }

    if (!r.ok) {
      showToast(`Launch failed: ${r.body?.detail || r.status}`, "warn");
      return;
    }

    const { job_id } = r.body;
    this.addLog(`Pipeline launched: ${job_id} via ${pipeline.name}`, "accent");
    showToast("Pipeline launched", "good");
    this._pollPipelineRun(job_id);
  }

  addLog(text, tone = "muted") {
    this.state.logLines.push({ id: uid(), text, tone, time: new Date().toISOString() });
    this.renderExecLog();
  }

  // ════════════════════════════════════════════════════════════════
  // OVERRIDES IN SUBCLASSES
  // ════════════════════════════════════════════════════════════════

  projectIcon()  { return "📁"; }
  launchLabel()  { return "Launch Pipeline"; }
  renderPipeline()       {}
  renderTargetSelector() {}
  updateLaunchBar()      {}

  renderEmptyState() {
    const el = qs("#centerCol"); if (!el) return;
    el.innerHTML = `
      <div class="panel empty-state">
        <div class="empty-icon">${this.projectIcon()}</div>
        <h2>No projects</h2>
        <p>Go to Projects to create one, then come back to launch a pipeline run.</p>
        <a href="../projects/" class="btn btn--primary">Open Projects</a>
      </div>`;
  }

  // ════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════

  async init() {
    this.bindCommonEvents();
    await Promise.all([this.loadProjects(), this.loadPipelines()]);
  }

  bindCommonEvents() {
    qs("#launchBtn")?.addEventListener("click",   () => this.launchJob());
    qs("#refreshBtn")?.addEventListener("click",  () => this.loadJobs());
  }
}
