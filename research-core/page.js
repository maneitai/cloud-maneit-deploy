/* Research Core — page.js */

const RESEARCH_STAGES = {
  research_dossier: [
    { id: "plan",     label: "Planning",              desc: "AI reads project brief, maps research angles, identifies knowledge gaps" },
    { id: "gather",   label: "Source gathering",      desc: "Multi-model web search across independent sources, no single-source trust" },
    { id: "verify",   label: "Verification",          desc: "Cross-verify all claims — contradictions flagged, weak sources marked" },
    { id: "synthesise", label: "Synthesis",           desc: "Structured synthesis — findings, confidence levels, open questions" },
    { id: "audit",    label: "Audit",                 desc: "Independent audit model reviews full output for gaps and errors" },
    { id: "package",  label: "Package dossier",       desc: "Final structured dossier with sources, evidence, uncertainty map" },
  ],
  evidence_chain: [
    { id: "plan",     label: "Planning",              desc: "Map claims to verify, identify primary sources needed" },
    { id: "gather",   label: "Source gathering",      desc: "Find and retrieve primary sources for each claim" },
    { id: "verify",   label: "Claim verification",    desc: "Test each claim against sources — pass/fail/contested per claim" },
    { id: "chain",    label: "Chain assembly",        desc: "Build evidence chain — claim → source → confidence → contradiction notes" },
    { id: "audit",    label: "Audit",                 desc: "Independent review of chain integrity and provenance quality" },
    { id: "package",  label: "Package chain",         desc: "Export evidence chain with full provenance and contradiction map" },
  ],
  synthesis: [
    { id: "plan",     label: "Planning",              desc: "Identify sources to synthesise, define synthesis frame" },
    { id: "gather",   label: "Source gathering",      desc: "Retrieve and read all source material" },
    { id: "verify",   label: "Cross-verification",   desc: "Identify agreements and contradictions across sources" },
    { id: "synthesise", label: "Synthesis",           desc: "Produce operator-readable synthesis with uncertainty levels" },
    { id: "audit",    label: "Audit",                 desc: "Audit synthesis for missed sources and framing errors" },
    { id: "package",  label: "Package notebook",      desc: "Final synthesis notebook with source map and open questions" },
  ],
  eval_pack: [
    { id: "plan",     label: "Planning",              desc: "Define evaluation scope, target capability, failure modes" },
    { id: "gather",   label: "Data gathering",        desc: "Collect real examples of the target behaviour — good and bad" },
    { id: "design",   label: "Task design",           desc: "Design evaluation tasks, inputs, expected outputs, edge cases" },
    { id: "verify",   label: "Verification",          desc: "Verify tasks are unambiguous and expectations are correct" },
    { id: "package",  label: "Package eval pack",     desc: "Final eval dataset with tasks, expectations, failure checks" },
  ],
  training_pack: [
    { id: "plan",     label: "Planning",              desc: "Define learning objective, failure pattern being corrected" },
    { id: "gather",   label: "Material gathering",    desc: "Gather examples, patterns, prior failures" },
    { id: "structure","label": "Structure",           desc: "Organise into training format — examples, contrast pairs, rules" },
    { id: "verify",   label: "Verification",          desc: "Verify training signal is clean and not introducing new errors" },
    { id: "audit",    label: "Audit",                 desc: "Independent review of training pack quality" },
    { id: "package",  label: "Package training pack", desc: "Final pack ready for model training or fine-tuning" },
  ],
  lore_pack: [
    { id: "plan",     label: "Planning",              desc: "Map lore research scope — world, period, themes, gaps" },
    { id: "gather",   label: "Research",              desc: "Research real-world analogues, historical references, cultural context" },
    { id: "verify",   label: "Consistency check",     desc: "Verify internal consistency, flag contradictions with existing lore" },
    { id: "synthesise", label: "Synthesis",           desc: "Synthesise into structured lore entries" },
    { id: "package",  label: "Package lore pack",     desc: "Final lore pack — world entries, timeline, cultural notes" },
  ],
};

const OUTPUT_LABELS = {
  research_dossier: "Research dossier",
  evidence_chain:   "Evidence chain",
  synthesis:        "Synthesis notebook",
  eval_pack:        "Eval pack",
  training_pack:    "Training pack",
  lore_pack:        "Lore pack",
};

class ResearchCorePage extends CreatorShell {
  constructor() {
    super("research");
    this.state.activeTarget = localStorage.getItem("rc_output") || "research_dossier";
  }

  projectIcon() { return "🔬"; }
  launchLabel() { return "Launch Research"; }

  get activeStages() {
    return RESEARCH_STAGES[this.state.activeTarget] || RESEARCH_STAGES.research_dossier;
  }

  // Research Core filters projects tagged "research"
  async loadProjects() {
    const r = await api("/api/projects");
    if (!r.ok) return;
    const all = Array.isArray(r.body?.items) ? r.body.items : [];
    this.state.projects = all.filter(p => {
      const portal = (p.target_portal || p.portal || p.type || "").toLowerCase();
      return portal.includes("research") || portal.includes("lore") || !portal;
    });
    this.renderProjectList();
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

  renderPipeline() {
    const el = qs("#stageList"); if (!el) return;
    if (!this.state.activeProject) {
      el.innerHTML = `<div class="section-meta">Select a project to see the research pipeline.</div>`;
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

  renderOutputSelector() {
    qsa(".output-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.output === this.state.activeTarget);
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

    const outputLabel = OUTPUT_LABELS[this.state.activeTarget] || this.state.activeTarget;
    if (titleEl) titleEl.textContent = `${proj.title} → ${outputLabel}`;
    if (metaEl) metaEl.textContent = `${this.activeStages.length} stages · multi-source verification · fully automated`;
    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = "Launch Research"; }

    const chip = qs("#activeProjectChip");
    if (chip) { chip.textContent = proj.title; chip.className = "chip accent"; }
  }

  async launchJob() {
    const config = {};
    qsa(".config-toggle").forEach(el => {
      config[el.dataset.key] = el.classList.contains("on");
    });
    await super.launchJob({
      target: this.state.activeTarget,
      output_type: this.state.activeTarget,
      run_config: config,
    });
  }

  bindPageEvents() {
    qsa(".output-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.state.activeTarget = btn.dataset.output;
        localStorage.setItem("rc_output", btn.dataset.output);
        this.renderOutputSelector();
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
    this.renderOutputSelector();
  }

  async selectProject(pid) {
    await super.selectProject(pid);
    this.updateLaunchBar();
  }
}

const page = new ResearchCorePage();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => page.init());
} else {
  page.init();
}
