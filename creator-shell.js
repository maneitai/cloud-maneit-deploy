/* ═══════════════════════════════════════════════════════════════
   CREATOR SHELL — Shared JS
   Base class extended by each creator page
   ═══════════════════════════════════════════════════════════════ */

const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ── API ───────────────────────────────────────────────────────────────────────
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

// ── Utils ─────────────────────────────────────────────────────────────────────
const qs = (s, r = document) => r.querySelector(s);
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

// ── CreatorShell base ─────────────────────────────────────────────────────────
class CreatorShell {
  constructor(pageId) {
    this.pageId = pageId;
    this.state = {
      projects: [],
      activeProjectId: localStorage.getItem(`creator_${pageId}_project`) || null,
      activeProject: null,
      activeTarget: null,         // engine / platform / stack
      jobs: [],
      activeJobId: null,
      artifacts: [],
      activeArtifactId: null,
      pollInterval: null,
      stages: [],                 // current pipeline stages with status
      logLines: [],
    };
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  async loadProjects() {
    const r = await api("/api/projects");
    if (!r.ok) return;
    // Filter to projects for this creator type
    const all = Array.isArray(r.body?.items) ? r.body.items : [];
    this.state.projects = all.filter(p => {
      const portal = (p.target_portal || "").toLowerCase();
      if (this.pageId === "portal") return portal.includes("portal");
      if (this.pageId === "app") return portal.includes("app");
      if (this.pageId === "game") return portal.includes("game");
      return true;
    });
    this.renderProjectList();

    // Auto-select
    const saved = this.state.activeProjectId;
    const found = this.state.projects.find(p => p.public_id === saved);
    if (found) {
      await this.selectProject(found.public_id);
    } else if (this.state.projects[0]) {
      await this.selectProject(this.state.projects[0].public_id);
    } else {
      this.renderEmptyState();
    }
  }

  async selectProject(pid) {
    this.state.activeProjectId = pid;
    localStorage.setItem(`creator_${this.pageId}_project`, pid);
    const proj = this.state.projects.find(p => p.public_id === pid);
    this.state.activeProject = proj || null;
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
      <button class="project-item ${p.public_id === this.state.activeProjectId ? "active" : ""}"
        data-pid="${esc(p.public_id)}">
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

    const notes = p.notes || {};
    const goal = typeof notes === "object" ? (notes.Goal || notes.goal || "") : "";
    const modules = typeof notes === "object" ? (notes.Modules || notes.modules || "") : "";
    const constraints = typeof notes === "object" ? (notes.Constraints || notes.constraints || "") : "";
    const nextAction = p.next_action || "";

    el.innerHTML = `
      <div class="plan-card">
        <div class="plan-field">
          <span class="plan-field-label">Goal</span>
          <span class="plan-field-value accent">${esc(goal || p.title)}</span>
        </div>
        ${modules ? `<div class="plan-field">
          <span class="plan-field-label">Modules</span>
          <span class="plan-field-value">${esc(modules).replace(/\n/g, "<br>")}</span>
        </div>` : ""}
        ${constraints ? `<div class="plan-field">
          <span class="plan-field-label">Constraints</span>
          <span class="plan-field-value">${esc(constraints).replace(/\n/g, "<br>")}</span>
        </div>` : ""}
        ${nextAction ? `<div class="plan-field">
          <span class="plan-field-label">Next action</span>
          <span class="plan-field-value">${esc(nextAction)}</span>
        </div>` : ""}
      </div>
    `;
  }

  // ── Jobs ───────────────────────────────────────────────────────────────────
  async loadJobs() {
    if (!this.state.activeProjectId) return;
    const r = await api(`/api/production/jobs?subject_public_id=${this.state.activeProjectId}`);
    if (!r.ok) return;
    this.state.jobs = Array.isArray(r.body?.items) ? r.body.items : [];
    this.renderJobMonitor();
    this.renderRunHistory();
    this.updateJobStatusBar();

    // If there's a running job, start polling
    const running = this.state.jobs.find(j => j.status === "running" || j.status === "pending");
    if (running && !this.state.pollInterval) {
      this.startPolling(running.public_id);
    }
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
      const job = detail.job || detail;
      const events = detail.events || [];
      const artifacts = detail.artifacts || [];

      // Update job in list
      const idx = this.state.jobs.findIndex(j => j.public_id === jobId);
      if (idx >= 0) this.state.jobs[idx] = job;

      // Update artifacts
      this.state.artifacts = artifacts;

      // Update stage statuses from events
      this.updateStagesFromEvents(events);

      // Log new events
      this.appendEvents(events);

      this.renderJobMonitor();
      this.updateJobStatusBar();
      this.renderArtifacts();

      // Stop polling when done
      if (job.status === "completed" || job.status === "failed" || job.status === "interrupted") {
        clearInterval(this.state.pollInterval);
        this.state.pollInterval = null;
        this.renderPipeline();
        showToast(job.status === "completed" ? "Job complete" : `Job ${job.status}`,
          job.status === "completed" ? "good" : "warn");
      }
    }, 2500);
  }

  updateStagesFromEvents(events) {
    // Map events to stage statuses
    events.forEach(ev => {
      const stageId = ev.stage_id;
      if (!stageId) return;
      const stage = this.state.stages.find(s => s.id === stageId);
      if (!stage) return;
      if (ev.event_type === "stage_start") stage.status = "running";
      if (ev.event_type === "stage_complete") stage.status = "done";
      if (ev.event_type === "stage_fail") stage.status = "failed";
    });
    this.renderPipeline();
  }

  appendEvents(events) {
    const existing = new Set(this.state.logLines.map(l => l.id));
    events.forEach(ev => {
      if (!existing.has(ev.public_id)) {
        this.state.logLines.push({
          id: ev.public_id,
          text: `[${ev.stage_id || "system"}] ${ev.message}`,
          tone: ev.status === "error" ? "bad" : ev.status === "complete" ? "good" : "muted",
          time: ev.created_at,
        });
      }
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
    const latest = this.state.jobs[0];

    if (running) {
      bar.className = "job-status-bar has-job";
      bar.innerHTML = `
        <div class="job-status-dot running"></div>
        <div class="job-status-text">${esc(running.title || "Running")}</div>
        <div class="job-status-meta">Stage ${running.current_stage || "—"} · ${running.progress || 0}%</div>
        <div class="progress-bar" style="width:120px"><div class="progress-fill" style="width:${running.progress||0}%"></div></div>
      `;
    } else if (latest) {
      const tone = latest.status === "completed" ? "good" : latest.status === "failed" ? "bad" : "";
      bar.className = "job-status-bar";
      bar.innerHTML = `
        <div class="job-status-dot ${tone}"></div>
        <div class="job-status-text">${esc(latest.title || "No active job")}</div>
        <div class="job-status-meta">${esc(latest.status)} · ${timeAgo(latest.updated_at)}</div>
        <span class="chip ${tone}">${esc(latest.status)}</span>
      `;
    } else {
      bar.className = "job-status-bar";
      bar.innerHTML = `
        <div class="job-status-dot"></div>
        <div class="job-status-text">No jobs</div>
        <div class="job-status-meta">Select a project and launch a pipeline run</div>
        <span class="chip">idle</span>
      `;
    }
  }

  renderJobMonitor() {
    const el = qs("#modelActivityList"); if (!el) return;
    const running = this.state.jobs.find(j => j.status === "running");
    if (!running) {
      el.innerHTML = `<div class="section-meta" style="padding:4px;">No active job.</div>`;
      return;
    }
    // Show panel plan participants if available
    const panel = running.panel_plan;
    let participants = [];
    try { participants = JSON.parse(panel || "[]"); } catch { participants = []; }
    if (!participants.length) {
      el.innerHTML = `<div class="log-line muted">Job running — model assignments loading…</div>`;
      return;
    }
    el.innerHTML = participants.map((p, i) => `
      <div class="model-activity-item ${i === 0 ? "active" : ""}">
        <div class="model-dot ${i === 0 ? "active" : "done"}"></div>
        <span class="model-name">${esc(p.model || p.alias || "Model")}</span>
        <span class="model-task">${esc(p.role || "worker")}</span>
      </div>
    `).join("");
  }

  renderArtifacts() {
    const listEl = qs("#artifactList"); if (!listEl) return;
    if (!this.state.artifacts.length) {
      listEl.innerHTML = `<div class="section-meta" style="padding:4px;">No artifacts yet.</div>`;
      return;
    }
    listEl.innerHTML = this.state.artifacts.map(a => `
      <button class="artifact-item ${a.public_id === this.state.activeArtifactId ? "active" : ""}"
        data-artifact-id="${esc(a.public_id)}">
        <span class="artifact-title">${esc(a.title)}</span>
        <span class="artifact-meta">${esc(a.artifact_type)} · ${timeAgo(a.created_at)}</span>
      </button>
    `).join("");
    qsa(".artifact-item[data-artifact-id]", listEl).forEach(btn => {
      btn.addEventListener("click", () => this.openArtifact(btn.dataset.artifactId));
    });
  }

  openArtifact(id) {
    this.state.activeArtifactId = id;
    this.renderArtifacts();
    const artifact = this.state.artifacts.find(a => a.public_id === id);
    const viewerEl = qs("#artifactViewer"); if (!viewerEl) return;
    if (!artifact) { viewerEl.innerHTML = ""; return; }
    viewerEl.innerHTML = `
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
      </div>
    `;
    qs("#copyArtifactBtn")?.addEventListener("click", () => {
      navigator.clipboard.writeText(artifact.content || "");
      showToast("Copied", "good");
    });
    qs("#downloadArtifactBtn")?.addEventListener("click", () => {
      const blob = new Blob([artifact.content || ""], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${artifact.title || "artifact"}.txt`;
      a.click(); URL.revokeObjectURL(url);
    });
  }

  renderRunHistory() {
    const el = qs("#runHistory"); if (!el) return;
    if (!this.state.jobs.length) {
      el.innerHTML = `<div class="section-meta" style="padding:4px;">No runs yet.</div>`;
      return;
    }
    el.innerHTML = this.state.jobs.slice(0, 8).map(j => `
      <button class="run-item" data-job-id="${esc(j.public_id)}">
        <span class="run-title">${esc(j.title || "Run")}</span>
        <span class="run-meta">${esc(j.status)} · ${timeAgo(j.updated_at)}</span>
      </button>
    `).join("");
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

  // ── Launch job ─────────────────────────────────────────────────────────────
  async launchJob(overrides = {}) {
    if (!this.state.activeProjectId) { showToast("Select a project first", "warn"); return; }
    if (!this.state.activeTarget) { showToast("Select a target first", "warn"); return; }

    const proj = this.state.activeProject;
    const payload = {
      surface: this.pageId,
      subject_type: "project",
      subject_public_id: this.state.activeProjectId,
      project_public_id: this.state.activeProjectId,
      title: `${proj?.title || "Run"} — ${this.state.activeTarget}`,
      objective: proj?.notes?.Goal || proj?.title || "",
      selected_models: [],
      target: this.state.activeTarget,
      ...overrides,
    };

    const launchBtn = qs("#launchBtn");
    if (launchBtn) { launchBtn.disabled = true; launchBtn.textContent = "Launching…"; }

    const r = await api("/api/production/jobs", { method: "POST", body: payload });

    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = this.launchLabel(); }

    if (!r.ok) {
      showToast(`Launch failed: ${r.body?.detail || r.status}`, "warn");
      return;
    }

    const job = r.body;
    this.state.jobs.unshift(job);
    this.renderRunHistory();
    this.updateJobStatusBar();
    this.startPolling(job.public_id);
    this.addLog(`Job launched: ${job.public_id}`, "accent");
    showToast("Job launched", "good");
  }

  addLog(text, tone = "muted") {
    this.state.logLines.push({ id: uid(), text, tone, time: new Date().toISOString() });
    this.renderExecLog();
  }

  // ── Override in subclasses ─────────────────────────────────────────────────
  projectIcon() { return "📁"; }
  launchLabel() { return "Launch Pipeline"; }
  renderEmptyState() {
    const el = qs("#centerCol"); if (!el) return;
    el.innerHTML = `
      <div class="panel empty-state">
        <div class="empty-icon">${this.projectIcon()}</div>
        <h2>No projects</h2>
        <p>Go to Projects to create one, then come back to launch a pipeline run.</p>
        <a href="../projects/" class="btn btn--primary">Open Projects</a>
      </div>
    `;
  }
  renderPipeline() {}
  renderTargetSelector() {}

  // ── Init ───────────────────────────────────────────────────────────────────
  async init() {
    this.bindCommonEvents();
    await this.loadProjects();
  }

  bindCommonEvents() {
    qs("#launchBtn")?.addEventListener("click", () => this.launchJob());
    qs("#refreshBtn")?.addEventListener("click", () => this.loadJobs());
  }
}
