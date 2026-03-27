const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const PM_AGENT_FACTORY_DRAFT_KEY = "PM_AGENT_FACTORY_DRAFT_V3";

const roleOptions = ["Planner", "Coder", "Verifier", "Auditor", "Router", "Research", "Creative", "Systems"];

const fallbackLibrary = [
  {
    id: "cpp_generator_v1",
    name: "C++ Generator v1",
    roleClass: "Coder",
    subtype: "C++ Coder",
    description: "Reusable C++ generation profile for native code, modules and compile-first workflows.",
    reasoningLayer: "cpp_architecture_strict_v1",
    promptPack: "coder_operating_prompt",
    modelFamily: "DeepSeek",
    outputContract: "raw_cpp_module",
    validationGate: "cpp_compile_gate",
    quorumDefault: "2-of-3",
    fallbackPolicy: "explicit fallback only",
    timeoutDefault: "120s",
    compatibility: {
      pipelines: true,
      home: false,
      loreDiscussion: false,
      creatorPresets: true
    },
    source: "fallback"
  },
  {
    id: "python_generator_v1",
    name: "Python Generator v1",
    roleClass: "Coder",
    subtype: "Python Coder",
    description: "Reusable Python generation profile for scripts, services and tooling.",
    reasoningLayer: "systems_coder_v1",
    promptPack: "coder_operating_prompt",
    modelFamily: "DeepSeek",
    outputContract: "raw_python_file",
    validationGate: "python_static_check",
    quorumDefault: "2-of-3",
    fallbackPolicy: "explicit fallback only",
    timeoutDefault: "90s",
    compatibility: {
      pipelines: true,
      home: false,
      loreDiscussion: false,
      creatorPresets: true
    },
    source: "fallback"
  },
  {
    id: "js_generator_frontend_v1",
    name: "JS Generator Frontend v1",
    roleClass: "Coder",
    subtype: "JS Generator",
    description: "Frontend JS profile for DOM-safe interaction, static page logic and contract-first UI behavior.",
    reasoningLayer: "frontend_js_reasoning_v1",
    promptPack: "coder_operating_prompt",
    modelFamily: "Llama",
    outputContract: "raw_js_file",
    validationGate: "frontend_js_theme_contract",
    quorumDefault: "2-of-3",
    fallbackPolicy: "explicit fallback only",
    timeoutDefault: "75s",
    compatibility: {
      pipelines: true,
      home: false,
      loreDiscussion: false,
      creatorPresets: true
    },
    source: "fallback"
  },
  {
    id: "planner_structured_v1",
    name: "Structured Planner v1",
    roleClass: "Planner",
    subtype: "Structured Planner",
    description: "Reusable planning profile for constrained task decomposition and explicit handoff logic.",
    reasoningLayer: "planner_structured_v1",
    promptPack: "planner_operating_prompt",
    modelFamily: "Gemma",
    outputContract: "structured_markdown_plan",
    validationGate: "plan_contract_gate",
    quorumDefault: "2-of-3",
    fallbackPolicy: "explicit fallback only",
    timeoutDefault: "90s",
    compatibility: {
      pipelines: true,
      home: true,
      loreDiscussion: true,
      creatorPresets: true
    },
    source: "fallback"
  },
  {
    id: "strict_verifier_v1",
    name: "Strict Verifier v1",
    roleClass: "Verifier",
    subtype: "Strict Verifier",
    description: "Hard gate verifier for output contracts, schema discipline and stage correctness.",
    reasoningLayer: "strict_verifier_v2",
    promptPack: "verifier_operating_prompt",
    modelFamily: "Gemma",
    outputContract: "strict_json_verification",
    validationGate: "verification_schema_v1",
    quorumDefault: "3-of-3",
    fallbackPolicy: "no fallback",
    timeoutDefault: "60s",
    compatibility: {
      pipelines: true,
      home: false,
      loreDiscussion: false,
      creatorPresets: true
    },
    source: "fallback"
  },
  {
    id: "audit_writer_v1",
    name: "Audit Writer v1",
    roleClass: "Auditor",
    subtype: "Audit Writer",
    description: "Reusable final-review profile for markdown audit and execution summary.",
    reasoningLayer: "audit_operating_v1",
    promptPack: "audit_operating_prompt",
    modelFamily: "Gemma",
    outputContract: "markdown_audit",
    validationGate: "audit_gate_v1",
    quorumDefault: "2-of-3",
    fallbackPolicy: "explicit fallback only",
    timeoutDefault: "60s",
    compatibility: {
      pipelines: true,
      home: false,
      loreDiscussion: false,
      creatorPresets: true
    },
    source: "fallback"
  }
];

const emptyDraft = {
  id: "",
  name: "New Agent",
  roleClass: "Coder",
  subtype: "",
  description: "",
  reasoningLayer: "",
  promptPack: "",
  modelFamily: "",
  outputContract: "",
  validationGate: "",
  quorumDefault: "2-of-3",
  fallbackPolicy: "explicit fallback only",
  timeoutDefault: "90s",
  compatibility: {
    pipelines: true,
    home: false,
    loreDiscussion: false,
    creatorPresets: true
  },
  source: "draft"
};

const state = {
  agents: [],
  selectedAgentId: null,
  filters: {
    search: "",
    roleClass: "All",
    subtype: "All"
  },
  recommendedTeam: null,
  librarySource: "loading"
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

async function api(path, options = {}) {
  const config = {
    method: "GET",
    headers: {},
    ...options
  };

  if (config.body && typeof config.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(`${PM_API_BASE}${path}`, config);
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: String(error)
    };
  }
}

function normalizeCompatibility(raw = {}) {
  return {
    pipelines: Boolean(raw.pipelines ?? raw.compatibility_pipelines ?? raw.allow_pipelines ?? raw.pipeline ?? false),
    home: Boolean(raw.home ?? raw.compatibility_home ?? raw.allow_home ?? false),
    loreDiscussion: Boolean(raw.loreDiscussion ?? raw.lore_discussion ?? raw.compatibility_lore_discussion ?? false),
    creatorPresets: Boolean(raw.creatorPresets ?? raw.creator_presets ?? raw.compatibility_creator_presets ?? false)
  };
}

function normalizeAgent(raw, index = 0) {
  const name = raw?.name || raw?.title || raw?.agent_name || raw?.profile_name || `Agent ${index + 1}`;
  const subtype = raw?.subtype || raw?.role_subtype || raw?.specialization || "";
  const roleClass = raw?.roleClass || raw?.role_class || raw?.role || "Coder";
  const compatibility = normalizeCompatibility(raw?.compatibility || raw);

  return {
    id:
      raw?.agent_public_id ||
      raw?.agent_id ||
      raw?.public_id ||
      raw?.id ||
      slugify(name) ||
      `agent_${index + 1}`,
    name,
    roleClass,
    subtype,
    description: raw?.description || raw?.summary || raw?.notes || "",
    reasoningLayer: raw?.reasoningLayer || raw?.reasoning_layer || raw?.reasoning || "",
    promptPack: raw?.promptPack || raw?.prompt_pack || raw?.prompt || "",
    modelFamily: raw?.modelFamily || raw?.model_family || raw?.default_model_family || "",
    outputContract: raw?.outputContract || raw?.output_contract || raw?.contract || "",
    validationGate: raw?.validationGate || raw?.validation_gate || raw?.gate || "",
    quorumDefault: raw?.quorumDefault || raw?.quorum_default || raw?.quorum || "2-of-3",
    fallbackPolicy: raw?.fallbackPolicy || raw?.fallback_policy || raw?.fallback || "explicit fallback only",
    timeoutDefault: raw?.timeoutDefault || raw?.timeout_default || raw?.timeout || "90s",
    compatibility,
    source: "backend",
    raw
  };
}

function normalizeAgentsResponse(body) {
  if (Array.isArray(body)) {
    return body.map(normalizeAgent);
  }

  if (Array.isArray(body?.items)) {
    return body.items.map(normalizeAgent);
  }

  if (Array.isArray(body?.agents)) {
    return body.agents.map(normalizeAgent);
  }

  if (Array.isArray(body?.data)) {
    return body.data.map(normalizeAgent);
  }

  return [];
}

function getSelectedAgent() {
  return state.agents.find((agent) => agent.id === state.selectedAgentId) || state.agents[0] || null;
}

function saveDraftSnapshot() {
  const selected = getSelectedAgent();
  if (!selected) return;
  try {
    localStorage.setItem(PM_AGENT_FACTORY_DRAFT_KEY, JSON.stringify(selected));
  } catch (error) {}
}

function loadDraftSnapshot() {
  try {
    const raw = localStorage.getItem(PM_AGENT_FACTORY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeAgent({ ...parsed, source: "draft" });
  } catch (error) {
    return null;
  }
}

function uniqueSubtypes(agents) {
  return [...new Set(agents.map((agent) => agent.subtype).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function filteredAgents() {
  const search = state.filters.search.trim().toLowerCase();

  return state.agents.filter((agent) => {
    const haystack = [
      agent.name,
      agent.roleClass,
      agent.subtype,
      agent.description,
      agent.reasoningLayer,
      agent.promptPack,
      agent.modelFamily
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesRole = state.filters.roleClass === "All" || agent.roleClass === state.filters.roleClass;
    const matchesSubtype = state.filters.subtype === "All" || agent.subtype === state.filters.subtype;

    return matchesSearch && matchesRole && matchesSubtype;
  });
}

function compatibilityLabel(agent) {
  const flags = [];
  if (agent.compatibility?.pipelines) flags.push("Pipelines");
  if (agent.compatibility?.home) flags.push("Home");
  if (agent.compatibility?.loreDiscussion) flags.push("LoreCore");
  if (agent.compatibility?.creatorPresets) flags.push("Creator presets");
  return flags.length ? flags.join(" · ") : "Restricted";
}

function setLibraryStatus(text, toneClass = "status-chip--good") {
  const chip = qs("#libraryStatusChip");
  if (!chip) return;
  chip.textContent = text;
  chip.className = `status-chip ${toneClass}`;
}

function setWorkspaceStatus(text, toneClass = "status-chip--warn") {
  const chip = qs("#workspaceStatusChip");
  if (!chip) return;
  chip.textContent = text;
  chip.className = `status-chip ${toneClass}`;
}

function populateSubtypeFilter() {
  const select = qs("#librarySubtype");
  if (!select) return;

  const current = state.filters.subtype;
  const subtypes = uniqueSubtypes(state.agents);

  select.innerHTML = [
    `<option value="All">All</option>`,
    ...subtypes.map((subtype) => `<option value="${escapeHtml(subtype)}">${escapeHtml(subtype)}</option>`)
  ].join("");

  if (subtypes.includes(current)) {
    select.value = current;
  } else {
    state.filters.subtype = "All";
    select.value = "All";
  }
}

function renderLibrary() {
  const list = qs("#agentLibraryList");
  if (!list) return;

  const agents = filteredAgents();

  if (!agents.length) {
    list.innerHTML = `
      <div class="library-card">
        <strong>No agents found</strong>
        <span>Adjust search or filters, or create a new draft.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = agents
    .map(
      (agent) => `
        <button
          class="library-card ${agent.id === state.selectedAgentId ? "library-card--active" : ""}"
          type="button"
          data-agent-id="${escapeHtml(agent.id)}"
        >
          <strong>${escapeHtml(agent.name)}</strong>
          <span>${escapeHtml(agent.subtype || "No subtype")} · ${escapeHtml(agent.roleClass)}</span>
        </button>
      `
    )
    .join("");
}

function renderWorkspace() {
  const agent = getSelectedAgent();
  if (!agent) return;

  qs("#workspaceRoleClass").textContent = agent.roleClass || "—";
  qs("#workspaceSubtype").textContent = agent.subtype || "—";
  qs("#workspaceQuorum").textContent = agent.quorumDefault || "—";
  qs("#workspaceCompatibility").textContent = compatibilityLabel(agent);

  qs("#agentName").value = agent.name || "";
  qs("#agentRoleClass").value = roleOptions.includes(agent.roleClass) ? agent.roleClass : "Coder";
  qs("#agentSubtype").value = agent.subtype || "";
  qs("#agentDescription").value = agent.description || "";
  qs("#agentReasoningLayer").value = agent.reasoningLayer || "";
  qs("#agentPromptPack").value = agent.promptPack || "";
  qs("#agentModelFamily").value = agent.modelFamily || "";
  qs("#agentOutputContract").value = agent.outputContract || "";
  qs("#agentValidationGate").value = agent.validationGate || "";
  qs("#agentQuorumDefault").value = agent.quorumDefault || "2-of-3";
  qs("#agentFallbackPolicy").value = agent.fallbackPolicy || "explicit fallback only";
  qs("#agentTimeoutDefault").value = agent.timeoutDefault || "90s";

  qs("#compatPipelines").checked = Boolean(agent.compatibility?.pipelines);
  qs("#compatHome").checked = Boolean(agent.compatibility?.home);
  qs("#compatLoreDiscussion").checked = Boolean(agent.compatibility?.loreDiscussion);
  qs("#compatCreatorPresets").checked = Boolean(agent.compatibility?.creatorPresets);

  qs("#previewAgentName").textContent = agent.name || "—";
  qs("#previewAgentDescription").textContent = agent.description || "No description yet.";

  qs("#promptPreviewBox").innerHTML = `
    <strong>${escapeHtml(agent.promptPack || "No prompt pack set")}</strong>
    <span>${escapeHtml(agent.reasoningLayer || "No reasoning layer set")} · ${escapeHtml(agent.modelFamily || "No model family set")}</span>
  `;

  qs("#contractPreviewBox").innerHTML = `
    <strong>${escapeHtml(agent.outputContract || "No output contract set")}</strong>
    <span>Profile outputs should conform to this contract by default.</span>
  `;

  qs("#validationPreviewBox").innerHTML = `
    <strong>${escapeHtml(agent.validationGate || "No validation gate set")}</strong>
    <span>Quorum default: ${escapeHtml(agent.quorumDefault || "—")} · timeout: ${escapeHtml(agent.timeoutDefault || "—")}</span>
  `;

  if (agent.source === "backend") {
    setWorkspaceStatus("Backend-backed profile", "status-chip--good");
  } else if (agent.source === "draft") {
    setWorkspaceStatus("Unsaved draft", "status-chip--warn");
  } else {
    setWorkspaceStatus("Fallback profile", "status-chip--warn");
  }
}

function renderRecommendedTeam() {
  const box = qs("#recommendedTeamBox");
  if (!box) return;

  if (!state.recommendedTeam) {
    box.innerHTML = `
      <strong>No team loaded</strong>
      <span>Use the button below to request a recommended team from the backend.</span>
    `;
    return;
  }

  const body = state.recommendedTeam;
  const members = Array.isArray(body?.members)
    ? body.members
    : Array.isArray(body?.agents)
      ? body.agents
      : Array.isArray(body?.items)
        ? body.items
        : [];

  const title =
    body?.name ||
    body?.team_name ||
    body?.title ||
    `Recommended ${qs("#recommendedPortalType")?.value || "team"}`;

  const detail =
    members.length > 0
      ? members
          .map((member) => member?.name || member?.agent_name || member?.role || member?.id || "member")
          .join(" · ")
      : "Backend returned a team payload, but the member schema is not fully known yet.";

  box.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(detail)}</span>
  `;
}

function renderAll() {
  populateSubtypeFilter();
  renderLibrary();
  renderWorkspace();
  renderRecommendedTeam();
}

function updateSelectedAgentFromForm() {
  const agent = getSelectedAgent();
  if (!agent) return;

  agent.name = qs("#agentName").value.trim() || "Untitled Agent";
  agent.roleClass = qs("#agentRoleClass").value;
  agent.subtype = qs("#agentSubtype").value.trim();
  agent.description = qs("#agentDescription").value.trim();
  agent.reasoningLayer = qs("#agentReasoningLayer").value.trim();
  agent.promptPack = qs("#agentPromptPack").value.trim();
  agent.modelFamily = qs("#agentModelFamily").value.trim();
  agent.outputContract = qs("#agentOutputContract").value.trim();
  agent.validationGate = qs("#agentValidationGate").value.trim();
  agent.quorumDefault = qs("#agentQuorumDefault").value;
  agent.fallbackPolicy = qs("#agentFallbackPolicy").value;
  agent.timeoutDefault = qs("#agentTimeoutDefault").value;
  agent.compatibility = {
    pipelines: qs("#compatPipelines").checked,
    home: qs("#compatHome").checked,
    loreDiscussion: qs("#compatLoreDiscussion").checked,
    creatorPresets: qs("#compatCreatorPresets").checked
  };

  if (agent.source !== "backend") {
    agent.source = "draft";
  }

  saveDraftSnapshot();
  renderAll();
}

function selectAgent(agentId) {
  const found = state.agents.find((agent) => agent.id === agentId);
  if (!found) return;
  state.selectedAgentId = found.id;
  if (found.source === "draft") {
    saveDraftSnapshot();
  }
  renderAll();
}

function createDraftAgent() {
  const copy = deepClone(emptyDraft);
  const suffix = crypto.randomUUID().slice(0, 8);
  copy.id = `draft_${suffix}`;
  copy.name = "New Agent";
  copy.source = "draft";

  state.agents.unshift(copy);
  state.selectedAgentId = copy.id;
  saveDraftSnapshot();
  renderAll();
  showToast("New draft created", "good");
}

function cloneSelectedAgent() {
  const selected = getSelectedAgent();
  if (!selected) return;

  const clone = deepClone(selected);
  clone.id = `draft_${crypto.randomUUID().slice(0, 8)}`;
  clone.name = `${selected.name} Copy`;
  clone.source = "draft";

  state.agents.unshift(clone);
  state.selectedAgentId = clone.id;
  saveDraftSnapshot();
  renderAll();
  showToast("Draft cloned", "good");
}

function archiveSelectedAgent() {
  const selected = getSelectedAgent();
  if (!selected) return;

  if (selected.source === "backend") {
    showToast("Archive route is not confirmed in main.py. Backend-backed agent was not changed.", "warn");
    return;
  }

  state.agents = state.agents.filter((agent) => agent.id !== selected.id);

  if (!state.agents.length) {
    state.agents = deepClone(fallbackLibrary);
  }

  state.selectedAgentId = state.agents[0]?.id || null;
  saveDraftSnapshot();
  renderAll();
  showToast("Draft removed", "warn");
}

function inferMockPayload(agent) {
  return {
    name: agent.name,
    role_class: agent.roleClass,
    subtype: agent.subtype,
    description: agent.description,
    reasoning_layer: agent.reasoningLayer,
    prompt_pack: agent.promptPack,
    model_family: agent.modelFamily,
    output_contract: agent.outputContract,
    validation_gate: agent.validationGate,
    quorum_default: agent.quorumDefault,
    fallback_policy: agent.fallbackPolicy,
    timeout_default: agent.timeoutDefault,
    compatibility: {
      pipelines: Boolean(agent.compatibility?.pipelines),
      home: Boolean(agent.compatibility?.home),
      lore_discussion: Boolean(agent.compatibility?.loreDiscussion),
      creator_presets: Boolean(agent.compatibility?.creatorPresets)
    }
  };
}

async function saveSelectedAgent() {
  updateSelectedAgentFromForm();
  const selected = getSelectedAgent();
  if (!selected) return;

  const payload = inferMockPayload(selected);
  const result = await api("/api/agents/mock", {
    method: "POST",
    body: payload
  });

  if (!result.ok) {
    showToast("Save failed on backend. Draft is still local only.", "warn");
    return;
  }

  const savedBody = result.body;
  const normalized = normalizeAgent(savedBody, 0);
  normalized.source = "backend";

  state.agents = [
    normalized,
    ...state.agents.filter((agent) => agent.id !== selected.id && agent.id !== normalized.id)
  ];
  state.selectedAgentId = normalized.id;
  saveDraftSnapshot();
  renderAll();
  showToast("Agent sent to backend via /api/agents/mock", "good");
}

async function loadRecommendedTeam() {
  const portalType = qs("#recommendedPortalType")?.value || "appcreator";
  const result = await api(`/api/agent-teams/recommended/${encodeURIComponent(portalType)}`, {
    method: "POST"
  });

  if (!result.ok) {
    state.recommendedTeam = null;
    renderRecommendedTeam();
    showToast("Recommended team request failed", "warn");
    return;
  }

  state.recommendedTeam = result.body;
  renderRecommendedTeam();
  showToast("Recommended team loaded", "good");
}

function checkCompatibility() {
  updateSelectedAgentFromForm();
  const selected = getSelectedAgent();
  if (!selected) return;

  const messages = [];
  if (!selected.compatibility?.pipelines) {
    messages.push("Not enabled for Pipelines");
  }
  if (!selected.promptPack) {
    messages.push("Missing prompt pack");
  }
  if (!selected.reasoningLayer) {
    messages.push("Missing reasoning layer");
  }
  if (!selected.outputContract) {
    messages.push("Missing output contract");
  }
  if (!selected.validationGate) {
    messages.push("Missing validation gate");
  }

  if (!messages.length) {
    showToast("Compatibility looks structurally valid for this page", "good");
  } else {
    showToast(messages.join(" · "), "warn");
  }
}

async function loadLibrary() {
  setLibraryStatus("Loading inventory", "status-chip--warn");

  const result = await api("/api/agents");

  if (result.ok) {
    const agents = normalizeAgentsResponse(result.body);

    if (agents.length) {
      state.agents = agents;
      state.selectedAgentId = agents[0].id;
      state.librarySource = "backend";
      setLibraryStatus("Backend inventory", "status-chip--good");

      const draft = loadDraftSnapshot();
      if (draft) {
        state.agents.unshift(draft);
        state.selectedAgentId = draft.id;
        setLibraryStatus("Backend + local draft", "status-chip--good");
      }

      renderAll();
      return;
    }
  }

  const draft = loadDraftSnapshot();
  state.agents = draft ? [draft, ...deepClone(fallbackLibrary)] : deepClone(fallbackLibrary);
  state.selectedAgentId = state.agents[0]?.id || null;
  state.librarySource = "fallback";
  setLibraryStatus("Fallback inventory", "status-chip--warn");
  renderAll();
  showToast("GET /api/agents did not return a usable library. Showing fallback inventory.", "warn");
}

function bindStaticEvents() {
  qs("#agentSearch")?.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderLibrary();
  });

  qs("#libraryRoleClass")?.addEventListener("change", (event) => {
    state.filters.roleClass = event.target.value;
    renderLibrary();
  });

  qs("#librarySubtype")?.addEventListener("change", (event) => {
    state.filters.subtype = event.target.value;
    renderLibrary();
  });

  qs("#agentLibraryList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-agent-id]");
    if (!button) return;
    selectAgent(button.dataset.agentId);
  });

  [
    "#agentName",
    "#agentRoleClass",
    "#agentSubtype",
    "#agentDescription",
    "#agentReasoningLayer",
    "#agentPromptPack",
    "#agentModelFamily",
    "#agentOutputContract",
    "#agentValidationGate",
    "#agentQuorumDefault",
    "#agentFallbackPolicy",
    "#agentTimeoutDefault",
    "#compatPipelines",
    "#compatHome",
    "#compatLoreDiscussion",
    "#compatCreatorPresets"
  ].forEach((selector) => {
    qs(selector)?.addEventListener("input", updateSelectedAgentFromForm);
    qs(selector)?.addEventListener("change", updateSelectedAgentFromForm);
  });

  qs("#newAgentBtn")?.addEventListener("click", createDraftAgent);
  qs("#cloneAgentBtn")?.addEventListener("click", cloneSelectedAgent);
  qs("#saveAgentBtn")?.addEventListener("click", saveSelectedAgent);
  qs("#loadRecommendedBtn")?.addEventListener("click", loadRecommendedTeam);
  qs("#checkCompatibilityBtn")?.addEventListener("click", checkCompatibility);
  qs("#archiveAgentBtn")?.addEventListener("click", archiveSelectedAgent);
}

function init() {
  bindStaticEvents();
  renderAll();
  loadLibrary();
}

document.addEventListener("DOMContentLoaded", init);
