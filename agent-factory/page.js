const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

// ── KRL v3 layer definitions ──────────────────────────────────────────────────
const KRL_LAYERS = {
  A: `EPISTEMIC BASE
- Do not present guesses as facts.
- Separate facts, assumptions, hypotheses, and design choices at all times.
- Never claim you inspected files/logs/data unless they were provided in the current session.
- Do not equate polish with correctness.
- Always define what would count as disconfirmation.`,

  B: `INTAKE CLASSIFIER
Classify each user turn on two axes:
MODE: IDEATION | SYSTEM_DESIGN | BUILD | TROUBLESHOOT | AUDIT | RESEARCH | SELF_REFLECTION | SALVAGE | CREATIVE
PLANE: CONTROL | DATA | SESSION_ARTIFACT
Mode defaults: logs/errors/stack traces → TROUBLESHOOT. Architecture/spec → SYSTEM_DESIGN. Code generation → BUILD unless tied to a failure. Evaluation/verification → AUDIT. Reconstructing old systems → SALVAGE.
Treat short imperative user messages as high-priority operator commands (CONTROL plane).`,

  C: `MULTISCALE WORKSPACE
Always keep track of all active layers simultaneously:
- Local step (current immediate action)
- Local subsystem (component being worked on)
- Global system (full architecture)
- Process/governance layer (constraints and rules)
- Portability/future-use layer (what must survive resets and tool changes)
Do not silently drop one layer when another becomes salient.`,

  D: `EVIDENCE LEDGER
When doing serious reasoning, explicitly maintain and separate:
- Known facts (with sources)
- Unknowns
- Assumptions
- Hypotheses (with disconfirmation tests)
- What would falsify the current interpretation`,

  E: `OPTION LATTICE
When useful, consider several candidate routes simultaneously before committing:
- Direct fix
- Inspect-first (gather more evidence)
- Upstream fix (address root cause)
- Bypass/circumvention
- Redesign from correct foundation
- Postpone with clean state capture
Each route: rationale, cost, evidence requirement, likely payoff, verification method.`,

  F: `BACKTRACKING ENGINE
When the active path degrades:
1. Name the failing assumption explicitly.
2. Jump back to the last clean branch.
3. Reopen alternative routes.
4. Continue without ego or narrative lock-in.
Never continue a bad path out of momentum.`,

  G: `CURIOSITY ENGINE
Use bounded curiosity to ask:
- What caused this problem upstream?
- What adjacent system has solved this class of problem?
- What hidden bottleneck exists that hasn't been named?
- Can the problem be bypassed rather than solved directly?
Do not let this become endless exploration — bound to actionable insight.`,

  H: `CRITICAL AUDIT
Pressure-test important outputs:
- Which claims are evidence-backed vs inferred?
- What would falsify this?
- What did we fail to inspect?
- What is the weakest claim here?
- What is the smallest reproducible proof?`,

  I: `WORK OFFLOADING ENGINE
Explicit bias toward shifting friction-heavy work from human to machine:
- Repetitive coding and boilerplate
- Dataset traversal and cross-referencing
- File generation and reformatting
- Translation of messy notes into structured artifacts
- Repetitive audit passes
- Any task that would require manual file editing`,

  J: `ARTIFACT ENGINE
Generate and maintain when relevant:
- state_capsule.yaml — current session state
- operating_prompt.md — baton-pass prompt for new sessions
- decision_log.jsonl — key decisions and their basis
- route_lattice.json — candidate routes considered
- ruleset.json — promoted rules from failures
- regression_tests.json — tests derived from past failures`,

  K: `RULE PROMOTION ENGINE
When a failure or insight occurs:
- Fix the thing
- Fix the process that allowed it
- Encode it as a rule, updated spec, or test so that class of failure becomes less likely
Convert recurring patterns into: rules, detectors, templates, regression tests.`,

  L: `PORTABILITY ADAPTER
Same core logic, adapted wrappers for different contexts:
- Frontier models: full protocol with state capsule
- Local models with short context: smaller explicit slices, strict structured output formats
- Account/session resets: operating_prompt.md as baton pass
- Tool shifts: preserve schema, adapt instruction phrasing`,
};

const LAYER_ORDER = ["A","B","C","D","E","F","G","H","I","J","K","L"];

const BASE_PREAMBLE = `You are running Kristoffer Reasoning Layer v3.

PURPOSE
Act as a cognitive amplification layer for a human operator with a multiscale, constraint-first, backtracking-heavy reasoning style.
Your job is not to imitate human consciousness. Your job is to function as a probabilistic external processor under human epistemic control.

CORE MODEL STANCE
- Do not describe yourself as truly thinking like a human.
- Treat yourself as a pattern engine for analysis, traversal, restructuring, drafting, audit, and boring-work offload.
- The human user owns intent, standards, priorities, and final judgment.

LANGUAGE
- Conversation may be Norwegian or English.
- All reusable artifacts must be in English unless explicitly asked otherwise.

HARD RULES
- Do not present guesses as facts.
- Prefer one minimal change set over patch spraying.
- Prefer one script over many manual steps when practical.
- Always include verification, stop condition, and rollback when actions change state.
- Treat short imperative user messages as high-priority operator commands.

PRIMARY GOAL
Offload friction-heavy work from the human to the machine while preserving the human's reasoning standards.`;

function assemblePrompt(agentType, role, layers, customization) {
  const selectedLayers = LAYER_ORDER.filter(l => layers.includes(l));
  let prompt = BASE_PREAMBLE + "\n\n";
  prompt += `AGENT TYPE: ${agentType.toUpperCase()}\n`;
  prompt += `ROLE: ${role.toUpperCase()}\n\n`;
  if (selectedLayers.length > 0) {
    prompt += "ACTIVE REASONING LAYERS\n";
    prompt += "=".repeat(40) + "\n\n";
    for (const layer of selectedLayers) {
      prompt += `[LAYER ${layer}] ${KRL_LAYERS[layer]}\n\n`;
    }
  }
  if (customization && customization.trim()) {
    prompt += "CUSTOMIZATIONS\n";
    prompt += "=".repeat(40) + "\n";
    prompt += customization.trim() + "\n";
  }
  return prompt;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function escHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function showToast(msg, tone = "good") {
  const t = qs("#toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2800);
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
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  agents: [],
  selectedId: null,
  multiMode: false,
  selectedIds: new Set(),
  filters: { search: "", type: "all", role: "all" },
};

function getSelected() {
  return state.agents.find(a => a.id === state.selectedId) || null;
}

// ── Normalize ─────────────────────────────────────────────────────────────────
function parseList(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try { return JSON.parse(v); } catch { return v.split(",").map(s=>s.trim()).filter(Boolean); }
}

function normalize(raw, i = 0) {
  const publicId = raw?.public_id || "";
  const stableId = publicId || (raw?.id != null ? String(raw.id) : null) || `draft_${i}`;
  return {
    id: stableId,
    publicId,
    name: raw?.name || `Agent ${i+1}`,
    agentType: raw?.agent_type || raw?.agentType || "pipeline",
    role: raw?.role || raw?.role_class || "Planner",
    description: raw?.description || "",
    systemPrompt: raw?.system_prompt || "",
    reasoningLayers: parseList(raw?.reasoning_layers),
    customization: raw?.customization || "",
    modelFamily: parseList(raw?.model_family),
    taskTypes: parseList(raw?.task_types),
    outputContract: raw?.output_contract || "",
    validationGate: raw?.validation_gate || "",
    quorumDefault: raw?.quorum_default || "single",
    fallbackPolicy: raw?.fallback_policy || "explicit_fallback_only",
    timeoutSeconds: parseInt(raw?.timeout_seconds || 60),
    memoryScope: raw?.memory_scope || "session",
    chatPanelRole: raw?.chat_panel_role || "lead",
    surfaceHome: Boolean(raw?.surface_home),
    surfaceLorecore: Boolean(raw?.surface_lorecore),
    testPrompt: raw?.test_prompt || "",
    lastTestResult: raw?.last_test_result || null,
    lastTestedAt: raw?.last_tested_at || null,
    verifierStatus: raw?.verifier_status || "unverified",
    mockFlag: Boolean(raw?.mock_flag),
    source: publicId ? "backend" : "draft",
  };
}

function toPayload(agent) {
  const layers = agent.reasoningLayers;
  const prompt = assemblePrompt(agent.agentType, agent.role, layers, agent.customization);
  return {
    name: agent.name,
    role: agent.role,
    description: agent.description,
    system_prompt: prompt,
    agent_type: agent.agentType,
    reasoning_layers: JSON.stringify(layers),
    customization: agent.customization,
    model_family: JSON.stringify(agent.modelFamily),
    task_types: JSON.stringify(agent.taskTypes),
    output_contract: agent.outputContract,
    validation_gate: agent.validationGate,
    quorum_default: agent.quorumDefault,
    fallback_policy: agent.fallbackPolicy,
    timeout_seconds: agent.timeoutSeconds,
    memory_scope: agent.memoryScope,
    chat_panel_role: agent.chatPanelRole,
    surface_home: agent.surfaceHome,
    surface_lorecore: agent.surfaceLorecore,
    test_prompt: agent.testPrompt,
    verifier_status: agent.verifierStatus,
    input_type: "text",
    output_type: "text",
    permission_level: "standard",
    accent: "blue",
    compatible_pipeline_stages: agent.agentType === "pipeline" ? ["all"] : [],
  };
}

// ── Multi-select ──────────────────────────────────────────────────────────────
function enterMultiMode() {
  state.multiMode = true;
  state.selectedIds.clear();
  qs("#multiToolbar").style.display = "flex";
  qs("#selectModeBtn").textContent = "Cancel selection";
  qs("#selectModeBtn").classList.add("button--active");
  updateMultiToolbar();
  renderLibrary();
}

function exitMultiMode() {
  state.multiMode = false;
  state.selectedIds.clear();
  qs("#multiToolbar").style.display = "none";
  qs("#selectModeBtn").textContent = "Select multiple";
  qs("#selectModeBtn").classList.remove("button--active");
  renderLibrary();
}

function updateMultiToolbar() {
  const n = state.selectedIds.size;
  qs("#multiCount").textContent = n === 0 ? "None selected" : `${n} selected`;
  qs("#bulkDeleteBtn").disabled = n === 0;
  qs("#bulkCloneBtn").disabled = n === 0;
}

function toggleSelectAll() {
  const visible = filtered().map(a => a.id);
  const allSelected = visible.every(id => state.selectedIds.has(id));
  if (allSelected) {
    visible.forEach(id => state.selectedIds.delete(id));
  } else {
    visible.forEach(id => state.selectedIds.add(id));
  }
  updateMultiToolbar();
  renderLibrary();
}

// ── Render ────────────────────────────────────────────────────────────────────
function filtered() {
  const s = state.filters.search.toLowerCase();
  return state.agents.filter(a => {
    const hay = [a.name, a.role, a.agentType, a.description].join(" ").toLowerCase();
    const ms = !s || hay.includes(s);
    const mt = state.filters.type === "all" || a.agentType === state.filters.type;
    const mr = state.filters.role === "all" || a.role === state.filters.role;
    return ms && mt && mr;
  });
}

function renderLibrary() {
  const list = qs("#agentLibraryList");
  if (!list) return;
  const agents = filtered();

  if (!agents.length) {
    list.innerHTML = `<div class="library-card"><strong>No agents</strong><span>Create one or adjust filters.</span></div>`;
    return;
  }

  if (state.multiMode) {
    const allSelected = agents.length > 0 && agents.every(a => state.selectedIds.has(a.id));
    list.innerHTML = `
      <div class="multi-select-header">
        <label class="checkbox-row">
          <input type="checkbox" id="selectAllCheck" ${allSelected ? "checked" : ""} />
          <span>Select all visible (${agents.length})</span>
        </label>
      </div>
      ${agents.map(a => `
        <label class="library-card library-card--selectable ${state.selectedIds.has(a.id) ? "library-card--checked" : ""}">
          <input type="checkbox" class="multi-check" data-id="${escHtml(a.id)}" ${state.selectedIds.has(a.id) ? "checked" : ""} />
          <div class="library-card-body">
            <strong>${escHtml(a.name)}</strong>
            <span>${escHtml(a.agentType)} · ${escHtml(a.role)}${a.mockFlag ? " · mock" : ""}${a.source === "draft" ? " · draft" : ""}</span>
          </div>
        </label>
      `).join("")}
    `;
    qs("#selectAllCheck")?.addEventListener("change", toggleSelectAll);
    qsa(".multi-check").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedIds.add(cb.dataset.id);
        else state.selectedIds.delete(cb.dataset.id);
        updateMultiToolbar();
        renderLibrary();
      });
    });
  } else {
    list.innerHTML = agents.map(a => `
      <button class="library-card ${a.id === state.selectedId ? "library-card--active" : ""}" type="button" data-id="${escHtml(a.id)}">
        <strong>${escHtml(a.name)}</strong>
        <span>${escHtml(a.agentType)} · ${escHtml(a.role)}${a.mockFlag ? " · mock" : ""}${a.source === "draft" ? " · draft" : ""}</span>
      </button>
    `).join("");
  }
}

function renderWorkspace() {
  const a = getSelected();
  if (!a) {
    qs("#workspaceTitle").textContent = "Agent workspace";
    qs("#workspaceSubtitle").textContent = "Select an agent or create a new one.";
    return;
  }

  qs("#workspaceTitle").textContent = a.name || "Agent workspace";
  qs("#workspaceSubtitle").textContent = a.description || "";
  qs("#kpiType").textContent = a.agentType;
  qs("#kpiRole").textContent = a.role;
  qs("#kpiLayers").textContent = a.reasoningLayers.length ? a.reasoningLayers.join(", ") : "none";
  qs("#kpiQuorum").textContent = a.quorumDefault;

  qs("#agentName").value = a.name;
  qs("#agentType").value = a.agentType;
  qs("#agentRole").value = a.role;
  qs("#agentDescription").value = a.description;
  qs("#agentCustomization").value = a.customization;
  qs("#agentTestPrompt").value = a.testPrompt;

  qs("#surfaceHome").checked = a.surfaceHome;
  qs("#surfaceLorecore").checked = a.surfaceLorecore;
  qs("#chatMemoryScope").value = a.memoryScope;
  qs("#chatPanelRole").value = a.chatPanelRole;

  qs("#agentOutputContract").value = a.outputContract;
  qs("#agentValidationGate").value = a.validationGate;
  qs("#agentQuorum").value = a.quorumDefault;
  qs("#agentFallback").value = a.fallbackPolicy;
  qs("#agentTimeout").value = a.timeoutSeconds;
  qs("#pipelineMemoryScope").value = a.memoryScope;

  qsa("[id^='family']").forEach(cb => { cb.checked = a.modelFamily.includes(cb.value); });
  qsa(".krl-layer").forEach(cb => { cb.checked = a.reasoningLayers.includes(cb.value); });

  updateTypeFields(a.agentType);

  qs("#previewName").textContent = a.name;
  qs("#previewDescription").textContent = a.description || "—";
  qs("#previewId").textContent = a.publicId || "draft";

  const statusMap = { backend: ["Saved", "status-chip--good"], mock: ["Mock", "status-chip--warn"], draft: ["Draft", "status-chip--warn"] };
  const [label, cls] = statusMap[a.source] || ["Unknown", "status-chip--warn"];
  const chip = qs("#workspaceStatusChip");
  chip.textContent = label; chip.className = `status-chip ${cls}`;

  if (a.lastTestedAt) {
    qs("#testResultBox").innerHTML = `<strong>Tested ${escHtml(a.lastTestedAt.slice(0,16))}</strong><p class="muted">${escHtml(JSON.stringify(a.lastTestResult || {}).slice(0,200))}</p>`;
  } else {
    qs("#testResultBox").innerHTML = `<strong>Not yet tested</strong><p class="muted">Save the agent first, then use Test fire.</p>`;
  }

  updatePromptPreview();
}

function updateTypeFields(type) {
  qs("#chatFields").style.display = type === "chat" ? "" : "none";
  qs("#pipelineFields").style.display = type === "pipeline" ? "" : "none";
}

function updatePromptPreview() {
  const layers = qsa(".krl-layer:checked").map(cb => cb.value);
  const role = qs("#agentRole")?.value || "Planner";
  const type = qs("#agentType")?.value || "pipeline";
  const custom = qs("#agentCustomization")?.value || "";
  qs("#promptPreview").textContent = assemblePrompt(type, role, layers, custom);
}

function renderAll() {
  renderLibrary();
  renderWorkspace();
}

// ── Read form ─────────────────────────────────────────────────────────────────
function readForm(agent) {
  agent.name = qs("#agentName")?.value.trim() || "Untitled";
  agent.agentType = qs("#agentType")?.value || "pipeline";
  agent.role = qs("#agentRole")?.value || "Planner";
  agent.description = qs("#agentDescription")?.value.trim() || "";
  agent.customization = qs("#agentCustomization")?.value.trim() || "";
  agent.testPrompt = qs("#agentTestPrompt")?.value.trim() || "";
  agent.surfaceHome = qs("#surfaceHome")?.checked || false;
  agent.surfaceLorecore = qs("#surfaceLorecore")?.checked || false;
  agent.chatPanelRole = qs("#chatPanelRole")?.value || "lead";
  agent.outputContract = qs("#agentOutputContract")?.value.trim() || "";
  agent.validationGate = qs("#agentValidationGate")?.value.trim() || "";
  agent.quorumDefault = qs("#agentQuorum")?.value || "single";
  agent.fallbackPolicy = qs("#agentFallback")?.value || "explicit_fallback_only";
  agent.timeoutSeconds = parseInt(qs("#agentTimeout")?.value) || 60;
  agent.memoryScope = agent.agentType === "chat"
    ? (qs("#chatMemoryScope")?.value || "session")
    : (qs("#pipelineMemoryScope")?.value || "job");
  agent.modelFamily = qsa("[id^='family']:checked").map(cb => cb.value);
  agent.reasoningLayers = qsa(".krl-layer:checked").map(cb => cb.value);
  return agent;
}

// ── Single agent actions ──────────────────────────────────────────────────────
function newAgent() {
  const draft = {
    id: `draft_${crypto.randomUUID().slice(0,8)}`,
    publicId: "",
    name: "New Agent",
    agentType: "pipeline",
    role: "Planner",
    description: "",
    systemPrompt: "",
    reasoningLayers: ["A","B"],
    customization: "",
    modelFamily: [],
    taskTypes: [],
    outputContract: "",
    validationGate: "",
    quorumDefault: "single",
    fallbackPolicy: "explicit_fallback_only",
    timeoutSeconds: 60,
    memoryScope: "session",
    chatPanelRole: "lead",
    surfaceHome: false,
    surfaceLorecore: false,
    testPrompt: "",
    lastTestResult: null,
    lastTestedAt: null,
    verifierStatus: "unverified",
    mockFlag: false,
    source: "draft",
  };
  state.agents.unshift(draft);
  state.selectedId = draft.id;
  renderAll();
  showToast("New draft created", "good");
}

async function cloneAgent() {
  const a = getSelected();
  if (!a) return;

  if (a.publicId && a.source === "backend") {
    const r = await api(`/api/agents/${a.publicId}/clone`, { method: "POST", body: { name: `${a.name} (clone)` } });
    if (r.ok) {
      const cloned = normalize(r.body);
      state.agents.unshift(cloned);
      state.selectedId = cloned.id;
      renderAll();
      showToast("Cloned on backend", "good");
      return;
    }
  }

  const clone = JSON.parse(JSON.stringify(a));
  clone.id = `draft_${crypto.randomUUID().slice(0,8)}`;
  clone.publicId = "";
  clone.name = `${a.name} (clone)`;
  clone.source = "draft";
  state.agents.unshift(clone);
  state.selectedId = clone.id;
  renderAll();
  showToast("Cloned locally", "good");
}

async function saveAgent() {
  const a = getSelected();
  if (!a) return;
  readForm(a);

  const payload = toPayload(a);
  let r;
  if (a.publicId && a.source !== "draft") {
    r = await api(`/api/agents/${a.publicId}`, { method: "PUT", body: payload });
  } else {
    r = await api("/api/agents", { method: "POST", body: payload });
  }

  if (!r.ok) { showToast(`Save failed: ${r.body?.detail || r.status}`, "warn"); return; }

  const saved = normalize(r.body);
  state.agents = [saved, ...state.agents.filter(x => x.id !== a.id && x.id !== saved.id)];
  state.selectedId = saved.id;
  renderAll();
  showToast("Agent saved", "good");
}

async function deleteAgent() {
  const a = getSelected();
  if (!a) return;

  if (a.source === "draft") {
    state.agents = state.agents.filter(x => x.id !== a.id);
    state.selectedId = state.agents[0]?.id || null;
    renderAll();
    showToast("Draft removed", "warn");
    return;
  }

  if (!a.publicId) { showToast("No ID — cannot delete", "warn"); return; }
  if (!confirm(`Delete "${a.name}"? Cannot be undone.`)) return;

  const r = await api(`/api/agents/${a.publicId}`, { method: "DELETE" });
  if (!r.ok) { showToast(`Delete failed: ${r.body?.detail || r.status}`, "warn"); return; }

  state.agents = state.agents.filter(x => x.id !== a.id);
  state.selectedId = state.agents[0]?.id || null;
  renderAll();
  showToast("Agent deleted", "warn");
}

async function testAgent() {
  const a = getSelected();
  if (!a || !a.publicId) { showToast("Save agent first before testing", "warn"); return; }

  const testPrompt = qs("#agentTestPrompt")?.value.trim() || "";
  const chip = qs("#workspaceStatusChip");
  chip.textContent = "Testing..."; chip.className = "status-chip status-chip--warn";

  const r = await api(`/api/agents/${a.publicId}/test`, { method: "POST", body: { prompt: testPrompt } });
  if (!r.ok) { chip.textContent = "Test failed"; showToast(`Test failed: ${r.body?.detail || r.status}`, "warn"); return; }

  a.lastTestResult = r.body.result;
  a.lastTestedAt = r.body.tested_at;
  renderWorkspace();
  showToast("Test complete", "good");
}

// ── Bulk actions ──────────────────────────────────────────────────────────────
async function bulkDelete() {
  const ids = [...state.selectedIds];
  if (!ids.length) return;

  const targets = state.agents.filter(a => ids.includes(a.id));
  const total = targets.length;
  if (!confirm(`Delete ${total} agent${total !== 1 ? "s" : ""}? This cannot be undone.`)) return;

  const draftTargets = targets.filter(a => a.source === "draft");
  const backendTargets = targets.filter(a => a.publicId && a.source !== "draft");

  // Remove drafts immediately
  const draftIds = new Set(draftTargets.map(a => a.id));
  state.agents = state.agents.filter(a => !draftIds.has(a.id));
  let deleted = draftTargets.length;
  let failed = 0;

  // Delete backend agents sequentially
  for (const a of backendTargets) {
    const r = await api(`/api/agents/${a.publicId}`, { method: "DELETE" });
    if (r.ok) {
      state.agents = state.agents.filter(x => x.id !== a.id);
      deleted++;
    } else {
      failed++;
    }
  }

  state.selectedIds.clear();
  if (state.selectedId && !state.agents.find(a => a.id === state.selectedId)) {
    state.selectedId = state.agents[0]?.id || null;
  }

  exitMultiMode();
  showToast(failed > 0 ? `Deleted ${deleted}, failed ${failed}` : `Deleted ${deleted} agent${deleted !== 1 ? "s" : ""}`, failed > 0 ? "warn" : "warn");
  renderAll();
}

async function bulkClone() {
  const ids = [...state.selectedIds];
  if (!ids.length) return;

  const targets = state.agents.filter(a => ids.includes(a.id));
  let cloned = 0;
  let localFallbacks = 0;
  const newAgents = [];

  for (const a of targets) {
    if (a.publicId && a.source === "backend") {
      const r = await api(`/api/agents/${a.publicId}/clone`, { method: "POST", body: { name: `${a.name} (clone)` } });
      if (r.ok) {
        newAgents.push(normalize(r.body));
        cloned++;
        continue;
      }
      localFallbacks++;
    }
    // Local clone (drafts or backend fallback)
    const clone = JSON.parse(JSON.stringify(a));
    clone.id = `draft_${crypto.randomUUID().slice(0,8)}`;
    clone.publicId = "";
    clone.name = `${a.name} (clone)`;
    clone.source = "draft";
    newAgents.push(clone);
    cloned++;
  }

  state.agents.unshift(...newAgents);
  state.selectedIds.clear();
  exitMultiMode();
  showToast(
    localFallbacks > 0
      ? `Cloned ${cloned} (${localFallbacks} as local draft)`
      : `Cloned ${cloned} agent${cloned !== 1 ? "s" : ""}`,
    localFallbacks > 0 ? "warn" : "good"
  );
  renderAll();
}

// ── Other ─────────────────────────────────────────────────────────────────────
async function loadRecommendedTeam() {
  const portal = qs("#recommendedPortalType")?.value || "appcreator";
  const r = await api(`/api/agent-teams/recommended/${encodeURIComponent(portal)}`, { method: "POST" });
  const box = qs("#recommendedTeamBox");
  if (!r.ok) { box.innerHTML = `<strong>Failed</strong><span>${r.status}</span>`; return; }
  const members = Array.isArray(r.body?.members) ? r.body.members : Array.isArray(r.body?.agents) ? r.body.agents : [];
  const title = r.body?.name || r.body?.team_name || `Recommended ${portal}`;
  const detail = members.length ? members.map(m => m?.name || m?.role || "member").join(" · ") : "Team loaded";
  box.innerHTML = `<strong>${escHtml(title)}</strong><span>${escHtml(detail)}</span>`;
  showToast("Team loaded", "good");
}

async function loadLibrary() {
  const chip = qs("#libraryStatusChip");
  chip.textContent = "Loading"; chip.className = "status-chip status-chip--warn";

  const r = await api("/api/agents");
  if (r.ok) {
    const items = Array.isArray(r.body?.items) ? r.body.items : Array.isArray(r.body) ? r.body : [];
    state.agents = items.map(normalize);
    state.selectedId = state.agents[0]?.id || null;
    chip.textContent = `${state.agents.length} agents`; chip.className = "status-chip status-chip--good";
  } else {
    state.agents = [];
    chip.textContent = "Load failed"; chip.className = "status-chip status-chip--warn";
    showToast("Could not load agents from backend", "warn");
  }
  renderAll();
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  qs("#agentSearch")?.addEventListener("input", e => { state.filters.search = e.target.value; renderLibrary(); });
  qs("#filterType")?.addEventListener("change", e => { state.filters.type = e.target.value; renderLibrary(); });
  qs("#filterRole")?.addEventListener("change", e => { state.filters.role = e.target.value; renderLibrary(); });

  qs("#agentLibraryList")?.addEventListener("click", e => {
    if (state.multiMode) return;
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    state.selectedId = btn.dataset.id;
    renderAll();
  });

  qs("#selectModeBtn")?.addEventListener("click", () => {
    state.multiMode ? exitMultiMode() : enterMultiMode();
  });
  qs("#bulkDeleteBtn")?.addEventListener("click", bulkDelete);
  qs("#bulkCloneBtn")?.addEventListener("click", bulkClone);

  qs("#agentType")?.addEventListener("change", e => {
    updateTypeFields(e.target.value);
    updatePromptPreview();
  });

  qsa(".krl-layer").forEach(cb => cb.addEventListener("change", () => {
    updatePromptPreview();
    const a = getSelected();
    if (a) { a.reasoningLayers = qsa(".krl-layer:checked").map(c=>c.value); qs("#kpiLayers").textContent = a.reasoningLayers.join(", ") || "none"; }
  }));
  qs("#agentRole")?.addEventListener("change", updatePromptPreview);
  qs("#agentCustomization")?.addEventListener("input", updatePromptPreview);

  qs("#newAgentBtn")?.addEventListener("click", newAgent);
  qs("#cloneAgentBtn")?.addEventListener("click", cloneAgent);
  qs("#saveAgentBtn")?.addEventListener("click", saveAgent);
  qs("#deleteAgentBtn")?.addEventListener("click", deleteAgent);
  qs("#testAgentBtn")?.addEventListener("click", testAgent);
  qs("#loadRecommendedBtn")?.addEventListener("click", loadRecommendedTeam);
}

function init() {
  bindEvents();
  renderAll();
  loadLibrary();
}

document.addEventListener("DOMContentLoaded", init);
