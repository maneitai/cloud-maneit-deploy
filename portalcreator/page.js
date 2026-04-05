/* PortalCreator — page.js */

const PORTAL_STAGES = [
  { id: "plan",       label: "Planning & Research",     desc: "AI analyses project, fills knowledge gaps, produces execution plan", targets: ["frontend","frontend+backend","full-infra","hardware-setup"] },
  { id: "arch",       label: "Architecture",             desc: "Route map, component structure, backend contracts, DB schema",       targets: ["frontend","frontend+backend","full-infra"] },
  { id: "frontend",   label: "Frontend generation",      desc: "HTML/CSS/JS — complete, deployable static files",                    targets: ["frontend","frontend+backend","full-infra"] },
  { id: "backend",    label: "Backend generation",       desc: "API routes, services, auth, DB migrations",                         targets: ["frontend+backend","full-infra"] },
  { id: "infra",      label: "Infrastructure scripts",   desc: "systemd units, nginx config, TLS setup, deploy scripts",            targets: ["full-infra","hardware-setup"] },
  { id: "hardware",   label: "Hardware onboarding",      desc: "Machine config, service install, model stack setup",                 targets: ["hardware-setup"] },
  { id: "verify",     label: "Verification",             desc: "Multi-model audit, contract validation, smoke tests",               targets: ["frontend","frontend+backend","full-infra","hardware-setup"] },
  { id: "package",    label: "Package & deploy",         desc: "Bundle artifacts, generate deployment instructions",                 targets: ["frontend","frontend+backend","full-infra"] },
];

class PortalCreatorPage extends CreatorShell {
  constructor() {
    super("portal");
    this.state.activeTarget = localStorage.getItem("portal_target") || "frontend";
    this.runConfig = {
      multi_source_verify: true,
      reasoning_layer: true,
      audit_pass: true,
      dry_run: false,
      save_artifacts: true,
      verbose_log: false,
    };
  }

  projectIcon() { return "🌐"; }
  launchLabel() { return "Launch Pipeline"; }

  get activeStages() {
    return PORTAL_STAGES.filter(s => s.targets.includes(this.state.activeTarget));
  }

  renderPipeline() {
    const el = qs("#stageList"); if (!el) return;
    if (!this.state.activeProject) {
      el.innerHTML = `<div class="section-meta">Select a project to see the pipeline.</div>`;
      return;
    }
    const stages = this.activeStages;
    this.state.stages = stages.map(s => ({
      ...s,
      status: this.state.stages.find(x => x.id === s.id)?.status || "pending",
    }));
    el.innerHTML = stages.map((s, i) => {
      const stateObj = this.state.stages[i];
      const status = stateObj?.status || "pending";
      return `
        <div class="stage-item ${status}" data-stage-id="${esc(s.id)}">
          <div class="stage-num">${i + 1}</div>
          <div class="stage-body">
            <div class="stage-title">${esc(s.label)}</div>
            <div class="stage-desc">${esc(s.desc)}</div>
          </div>
          <div class="stage-status ${status}">${status}</div>
        </div>
      `;
    }).join("");
  }

  renderTargetSelector() {
    qsa(".target-btn", qs("#targetSelector") || document).forEach(btn => {
      btn.classList.toggle("active", btn.dataset.target === this.state.activeTarget);
    });
    this.renderPipeline();
    this.updateLaunchBar();
  }

  updateLaunchBar() {
    const titleEl = qs("#launchTitle");
    const metaEl = qs("#launchMeta");
    const launchBtn = qs("#launchBtn");
    const proj = this.state.activeProject;

    if (!proj) {
      if (titleEl) titleEl.textContent = "Select a project to launch";
      if (launchBtn) launchBtn.disabled = true;
      return;
    }

    const targetLabels = {
      "frontend": "Frontend only",
      "frontend+backend": "Frontend + Backend",
      "full-infra": "Full infrastructure",
      "hardware-setup": "Hardware setup",
    };

    if (titleEl) titleEl.textContent = `${proj.title} → ${targetLabels[this.state.activeTarget] || this.state.activeTarget}`;
    if (metaEl) metaEl.textContent = `${this.activeStages.length} stages · fully automated · artifacts saved on completion`;
    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = "Launch Pipeline"; }

    const chip = qs("#activeProjectChip");
    if (chip) { chip.textContent = proj.title; chip.className = "chip accent"; }
  }

  async launchJob() {
    const config = {};
    qsa(".config-toggle", qs("#runConfigPanel") || document).forEach(el => {
      config[el.dataset.key] = el.classList.contains("on");
    });
    await super.launchJob({ run_config: config, target: this.state.activeTarget });
    if (qs("#runConfigPanel")) qs("#runConfigPanel").style.display = "none";
  }

  bindPageEvents() {
    // Target selector
    qsa(".target-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.state.activeTarget = btn.dataset.target;
        localStorage.setItem("portal_target", btn.dataset.target);
        this.renderTargetSelector();
      });
    });

    // Config toggle
    qs("#configToggleBtn")?.addEventListener("click", () => {
      const panel = qs("#runConfigPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
    qsa(".config-toggle").forEach(el => {
      el.addEventListener("click", () => {
        el.classList.toggle("on");
        this.runConfig[el.dataset.key] = el.classList.contains("on");
      });
    });
  }

  async init() {
    this.bindPageEvents();
    await super.init();
    this.renderTargetSelector();
  }

  async selectProject(pid) {
    await super.selectProject(pid);
    this.updateLaunchBar();
  }
}

const page = new PortalCreatorPage();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => page.init());
} else {
  page.init();
}
