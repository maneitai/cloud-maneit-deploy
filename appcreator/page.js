/* AppCreator — page.js */

const APP_STAGES = [
  { id: "plan",      label: "Planning & Research",    desc: "AI analyses project, fills knowledge gaps, produces execution plan",          targets: ["script","desktop","android","service"] },
  { id: "arch",      label: "Architecture",            desc: "Module structure, class design, data flow, dependency map",                    targets: ["script","desktop","android","service"] },
  { id: "codegen",   label: "Code generation",         desc: "Full source code — all files, modules, entry points",                         targets: ["script","desktop","android","service"] },
  { id: "tests",     label: "Test generation",         desc: "Unit tests, integration tests, test runner config",                            targets: ["script","desktop","android","service"] },
  { id: "ui",        label: "UI / interface",          desc: "GUI layout, screens, components, navigation",                                  targets: ["desktop","android"] },
  { id: "build",     label: "Build config",            desc: "Build scripts, package.json / build.gradle / Makefile, CI config",            targets: ["desktop","android","service"] },
  { id: "verify",    label: "Verification",            desc: "Multi-model code review, logic audit, security check",                        targets: ["script","desktop","android","service"] },
  { id: "package",   label: "Package & handoff",       desc: "Bundle all files, README, install instructions, deployment notes",            targets: ["script","desktop","android","service"] },
];

class AppCreatorPage extends CreatorShell {
  constructor() {
    super("app");
    this.state.activeTarget = localStorage.getItem("app_target") || "script";
  }

  projectIcon() { return "⚙️"; }
  launchLabel() { return "Launch Pipeline"; }

  get activeStages() {
    return APP_STAGES.filter(s => s.targets.includes(this.state.activeTarget));
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
      const status = this.state.stages[i]?.status || "pending";
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
    qsa(".target-btn").forEach(btn => {
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
      "script":  "Script / CLI tool",
      "desktop": "Desktop app",
      "android": "Android app",
      "service": "Background service",
    };

    if (titleEl) titleEl.textContent = `${proj.title} → ${targetLabels[this.state.activeTarget] || this.state.activeTarget}`;
    if (metaEl) metaEl.textContent = `${this.activeStages.length} stages · fully automated · complete code package on completion`;
    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = "Launch Pipeline"; }

    const chip = qs("#activeProjectChip");
    if (chip) { chip.textContent = proj.title; chip.className = "chip accent"; }
  }

  bindPageEvents() {
    qsa(".target-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.state.activeTarget = btn.dataset.target;
        localStorage.setItem("app_target", btn.dataset.target);
        this.renderTargetSelector();
      });
    });

    qs("#configToggleBtn")?.addEventListener("click", () => {
      const panel = qs("#runConfigPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    });

    qsa(".config-toggle").forEach(el => {
      el.addEventListener("click", () => el.classList.toggle("on"));
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

const page = new AppCreatorPage();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => page.init());
} else {
  page.init();
}
