/* GameDesigner — page.js */

const GAME_STAGES = {
  full: [
    { id: "plan",       label: "Planning & Research",    desc: "AI analyses design doc, researches genre patterns, fills knowledge gaps" },
    { id: "gdd",        label: "Game Design Document",   desc: "Complete GDD — mechanics, systems, progression, balance framework" },
    { id: "arch",       label: "Systems architecture",   desc: "Game system design, class hierarchy, data flow, engine integration plan" },
    { id: "codegen",    label: "Code generation",        desc: "All game scripts — mechanics, AI, UI systems, save/load, audio hooks" },
    { id: "data",       label: "Data & balance",         desc: "Unit stats, progression curves, level configs, ScriptableObjects/data assets" },
    { id: "assets",     label: "Asset specifications",   desc: "Image gen prompts, 3D model briefs, audio cues, VFX specs" },
    { id: "levels",     label: "Level design",           desc: "Level layouts, wave/encounter configs, spawn data, narrative beats" },
    { id: "verify",     label: "Verification",           desc: "Multi-model review — logic, balance, engine conventions, completeness" },
    { id: "package",    label: "Package project",        desc: "Assemble importable engine project — all files, folder structure, README" },
  ],
  code: [
    { id: "plan",       label: "Planning",               desc: "Analyse design doc, map out systems and dependencies" },
    { id: "arch",       label: "Systems architecture",   desc: "Class hierarchy, interfaces, system boundaries" },
    { id: "codegen",    label: "Code generation",        desc: "All game scripts — mechanics, AI, UI, save, audio" },
    { id: "data",       label: "Data assets",            desc: "Stats, config files, ScriptableObjects" },
    { id: "verify",     label: "Code review",            desc: "Multi-model review — correctness, engine conventions" },
    { id: "package",    label: "Package",                desc: "Final code package ready to import" },
  ],
  design: [
    { id: "plan",       label: "Research",               desc: "Genre analysis, mechanic research, reference gathering" },
    { id: "gdd",        label: "Game Design Document",   desc: "Complete GDD — all systems, rules, progression" },
    { id: "data",       label: "Balance sheets",         desc: "Unit stats, progression curves, economy tables" },
    { id: "levels",     label: "Level design docs",      desc: "Level briefs, encounter design, pacing notes" },
    { id: "verify",     label: "Design review",          desc: "Balance audit, consistency check, completeness review" },
  ],
  assets: [
    { id: "plan",       label: "Art direction",          desc: "Style guide, colour palette, visual references" },
    { id: "assets",     label: "Image gen prompts",      desc: "Stable Diffusion prompts — characters, environments, UI, VFX" },
    { id: "audio",      label: "Audio briefs",           desc: "Music style, SFX list, ambient specs" },
    { id: "models",     label: "3D asset specs",         desc: "Model briefs, poly budgets, UV/rig requirements" },
    { id: "verify",     label: "Review",                 desc: "Consistency and completeness check" },
  ],
};

const ENGINE_LABELS = {
  unity: "Unity",
  unreal: "Unreal Engine",
  godot: "Godot",
  custom: "Custom engine",
};

const SCOPE_LABELS = {
  full: "Full production",
  code: "Code only",
  design: "Design docs",
  assets: "Asset prompts",
};

class GameDesignerPage extends CreatorShell {
  constructor() {
    super("game");
    this.state.activeTarget = localStorage.getItem("game_engine") || "unity";
    this.state.activeScope = localStorage.getItem("game_scope") || "full";
  }

  projectIcon() { return "🎮"; }
  launchLabel() { return "Launch Production"; }

  get activeStages() {
    return GAME_STAGES[this.state.activeScope] || GAME_STAGES.full;
  }

  renderPipeline() {
    const el = qs("#stageList"); if (!el) return;
    if (!this.state.activeProject) {
      el.innerHTML = `<div class="section-meta">Select a project to see the production plan.</div>`;
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
    qsa(".target-btn", qs("#targetSelector") || document).forEach(btn => {
      btn.classList.toggle("active", btn.dataset.target === this.state.activeTarget);
    });
    qsa(".target-btn", qs("#scopeSelector") || document).forEach(btn => {
      btn.classList.toggle("active", btn.dataset.scope === this.state.activeScope);
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

    const engine = ENGINE_LABELS[this.state.activeTarget] || this.state.activeTarget;
    const scope = SCOPE_LABELS[this.state.activeScope] || this.state.activeScope;

    if (titleEl) titleEl.textContent = `${proj.title} → ${engine} · ${scope}`;
    if (metaEl) metaEl.textContent = `${this.activeStages.length} stages · output is importable ${engine} project · human imports into engine`;
    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = "Launch Production"; }

    const chip = qs("#activeProjectChip");
    if (chip) { chip.textContent = `${proj.title} · ${engine}`; chip.className = "chip accent"; }
  }

  async launchJob() {
    await super.launchJob({
      target: this.state.activeTarget,
      scope: this.state.activeScope,
      engine: this.state.activeTarget,
    });
  }

  bindPageEvents() {
    // Engine selector
    qsa(".target-btn", qs("#targetSelector") || document).forEach(btn => {
      btn.addEventListener("click", () => {
        this.state.activeTarget = btn.dataset.target;
        localStorage.setItem("game_engine", btn.dataset.target);
        this.renderTargetSelector();
      });
    });

    // Scope selector
    qsa(".target-btn", qs("#scopeSelector") || document).forEach(btn => {
      btn.addEventListener("click", () => {
        this.state.activeScope = btn.dataset.scope;
        localStorage.setItem("game_scope", btn.dataset.scope);
        this.renderTargetSelector();
      });
    });

    // Config toggle
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

const page = new GameDesignerPage();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => page.init());
} else {
  page.init();
}
