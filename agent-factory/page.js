const PM_AGENT_FACTORY_KEY = "PM_AGENT_FACTORY_V2";
const PM_API_BASE = window.PM_API_BASE || "";

const defaultState = {
  selectedAgentId: "cpp_generator_v1",
  agents: [
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
    }
  ],
  filters: {
    search: "",
    roleClass: "All",
    subtype: "All"
  }
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(PM_AGENT_FACTORY_KEY);
    if (!raw) return deepClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...deepClone(defaultState),
      ...parsed,
      filters: { ...deepClone(defaultState).filters, ...(parsed.filters || {}) },
      agents: Array.isArray(parsed.agents) ? parsed.agents : deepClone(defaultState).agents
    };
  } catch {
    return deepClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(PM_AGENT_FACTORY_KEY, JSON.stringify(state));
}

let state = loadState();

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

async function callApi(path, method = "GET", payload = null) {
  if (!PM_API_BASE) return { ok: false, mock: true };

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

function getSelectedAgent() {
  return state.agents.find(agent => agent.id === state.selectedAgentId) || state.agents[0];
}

function filterAgents() {
  const search = state.filters.search.trim().toLowerCase();
  return state.agents.filter(agent => {
    const matchesSearch =
      !search ||
      agent.name.toLowerCase().includes(search) ||
      agent.roleClass.toLowerCase().includes(search) ||
      agent.subtype.toLowerCase().includes(search) ||
      agent.reasoningLayer.toLowerCase().includes(search);

    const matchesRole = state.filters.roleClass === "All" || agent.roleClass === state.filters.roleClass;
    const matchesSubtype = state.filters.subtype === "All" || agent.subtype === state.filters.subtype;

    return matchesSearch && matchesRole && matchesSubtype;
  });
}

function renderLibrary() {
  const list = qs("#agentLibraryList");
  if (!list) return;

  const agents = filterAgents();

  list.innerHTML = agents.map(agent => `
    <button class="library-card ${agent.id === state.selectedAgentId ? "library-card--active" : ""}" type="button" data-agent-id="${agent.id}">
      <strong>${agent.name}</strong>
      <span>${agent.subtype} · ${agent.roleClass.toLowerCase()}</span>
    </button>
  `).join("");
}

function setCheckboxStates(agent) {
  const rows = qsa(".checkbox-row input");
  if (rows.length < 4) return;

  rows[0].checked = Boolean(agent.compatibility?.pipelines);
  rows[1].checked = Boolean(agent.compatibility?.home);
  rows[2].checked = Boolean(agent.compatibility?.loreDiscussion);
  rows[3].checked = Boolean(agent.compatibility?.creatorPresets);
}

function renderWorkspace() {
  const agent = getSelectedAgent();
  if (!agent) return;

  const map = {
    "#workspaceRoleClass": agent.roleClass,
    "#workspaceSubtype": agent.subtype,
    "#workspaceQuorum": agent.quorumDefault,
    "#workspaceCompatibility": agent.compatibility?.pipelines ? "Pipelines" : "Restricted",
    "#agentName": agent.name,
    "#agentRoleClass": agent.roleClass,
    "#agentSubtype": agent.subtype,
    "#agentDescription": agent.description,
    "#agentReasoningLayer": agent.reasoningLayer,
    "#agentPromptPack": agent.promptPack,
    "#agentModelFamily": agent.modelFamily,
    "#agentOutputContract": agent.outputContract,
    "#agentValidationGate": agent.validationGate,
    "#agentQuorumDefault": agent.quorumDefault,
    "#agentFallbackPolicy": agent.fallbackPolicy,
    "#agentTimeoutDefault": agent.timeoutDefault,
    "#previewAgentName": agent.name,
    "#previewAgentDescription": agent.description
  };

  Object.entries(map).forEach(([selector, value]) => {
    const el = qs(selector);
    if (!el) return;
    if ("value" in el) {
      el.value = value;
    } else {
      el.textContent = value;
    }
  });

  const promptPreview = qs("#promptPreviewBox");
  if (promptPreview) {
    promptPreview.innerHTML = `
      <strong>${agent.promptPack}</strong>
      <span>${agent.reasoningLayer} · ${agent.modelFamily} family defaults</span>
    `;
  }

  const contractPreview = qs("#contractPreviewBox");
  if (contractPreview) {
    contractPreview.innerHTML = `
      <strong>${agent.outputContract}</strong>
      <span>Profile outputs should conform to this contract by default.</span>
    `;
  }

  const validationPreview = qs("#validationPreviewBox");
  if (validationPreview) {
    validationPreview.innerHTML = `
      <strong>${agent.validationGate}</strong>
      <span>Quorum default: ${agent.quorumDefault} · timeout: ${agent.timeoutDefault}</span>
    `;
  }

  setCheckboxStates(agent);
}

function updateSelectedAgentFromWorkspace() {
  const agent = getSelectedAgent();
  if (!agent) return;

  const rows = qsa(".checkbox-row input");

  agent.name = qs("#agentName")?.value || agent.name;
  agent.roleClass = qs("#agentRoleClass")?.value || agent.roleClass;
  agent.subtype = qs("#agentSubtype")?.value || agent.subtype;
  agent.description = qs("#agentDescription")?.value || agent.description;
  agent.reasoningLayer = qs("#agentReasoningLayer")?.value || agent.reasoningLayer;
  agent.promptPack = qs("#agentPromptPack")?.value || agent.promptPack;
  agent.modelFamily = qs("#agentModelFamily")?.value || agent.modelFamily;
  agent.outputContract = qs("#agentOutputContract")?.value || agent.outputContract;
  agent.validationGate = qs("#agentValidationGate")?.value || agent.validationGate;
  agent.quorumDefault = qs("#agentQuorumDefault")?.value || agent.quorumDefault;
  agent.fallbackPolicy = qs("#agentFallbackPolicy")?.value || agent.fallbackPolicy;
  agent.timeoutDefault = qs("#agentTimeoutDefault")?.value || agent.timeoutDefault;

  agent.compatibility = {
    pipelines: rows[0]?.checked || false,
    home: rows[1]?.checked || false,
    loreDiscussion: rows[2]?.checked || false,
    creatorPresets: rows[3]?.checked || false
  };

  saveState();
  renderLibrary();
  renderWorkspace();
}

function createNewAgent() {
  const id = `agent_${crypto.randomUUID().slice(0, 8)}`;
  const agent = {
    id,
    name: "New Agent",
    roleClass: "Coder",
    subtype: "Python Coder",
    description: "",
    reasoningLayer: "coder_reasoning_v1",
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
    }
  };

  state.agents.unshift(agent);
  state.selectedAgentId = id;
  saveState();
  renderAll();
  showToast("New agent created", "good");
}

function cloneSelectedAgent() {
  const selected = getSelectedAgent();
  if (!selected) return;

  const clone = deepClone(selected);
  clone.id = `agent_${crypto.randomUUID().slice(0, 8)}`;
  clone.name = `${selected.name} Copy`;

  const idx = state.agents.findIndex(a => a.id === selected.id);
  state.agents.splice(idx + 1, 0, clone);
  state.selectedAgentId = clone.id;

  saveState();
  renderAll();
  showToast("Agent cloned", "good");
}

function archiveSelectedAgent() {
  if (state.agents.length <= 1) {
    showToast("At least one agent must remain", "warn");
    return;
  }

  const selected = getSelectedAgent();
  state.agents = state.agents.filter(agent => agent.id !== selected.id);
  state.selectedAgentId = state.agents[0].id;
  saveState();
  renderAll();
  showToast("Agent archived", "warn");
}

function bindLibrary() {
  qsa(".library-card").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedAgentId = button.dataset.agentId;
      saveState();
      renderAll();
    });
  });
}

function bindFilters() {
  qs("#agentSearch")?.addEventListener("input", event => {
    state.filters.search = event.target.value;
    saveState();
    renderLibrary();
    bindLibrary();
  });

  qs("#libraryRoleClass")?.addEventListener("change", event => {
    state.filters.roleClass = event.target.value;
    saveState();
    renderLibrary();
    bindLibrary();
  });

  qs("#librarySubtype")?.addEventListener("change", event => {
    state.filters.subtype = event.target.value;
    saveState();
    renderLibrary();
    bindLibrary();
  });
}

function bindWorkspace() {
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
    "#agentTimeoutDefault"
  ].forEach(selector => {
    qs(selector)?.addEventListener("change", updateSelectedAgentFromWorkspace);
    qs(selector)?.addEventListener("input", updateSelectedAgentFromWorkspace);
  });

  qsa(".checkbox-row input").forEach(input => {
    input.addEventListener("change", updateSelectedAgentFromWorkspace);
  });
}

function bindButtons() {
  qs("#newAgentBtn")?.addEventListener("click", createNewAgent);
  qs("#cloneAgentBtn")?.addEventListener("click", cloneSelectedAgent);

  qs("#saveAgentBtn")?.addEventListener("click", async () => {
    updateSelectedAgentFromWorkspace();
    const selected = getSelectedAgent();
    const result = await callApi("/api/agent-factory/save", "POST", selected);
    showToast(result.ok ? "Agent saved" : "Saved locally. API hook ready.", result.ok ? "good" : "warn");
  });

  qs("#runSampleTestBtn")?.addEventListener("click", async () => {
    const selected = getSelectedAgent();
    const result = await callApi("/api/agent-factory/sample-test", "POST", selected);
    showToast(result.ok ? "Sample test requested" : "No live API yet. UI hook ready.", result.ok ? "good" : "warn");
  });

  qs("#checkCompatibilityBtn")?.addEventListener("click", async () => {
    const selected = getSelectedAgent();
    const result = await callApi("/api/agent-factory/check-compatibility", "POST", selected);
    showToast(result.ok ? "Compatibility check requested" : "Compatibility check is mocked for now.", result.ok ? "good" : "warn");
  });

  qs("#archiveAgentBtn")?.addEventListener("click", archiveSelectedAgent);
}

function renderAll() {
  renderLibrary();
  renderWorkspace();
  bindLibrary();
}

function init() {
  renderAll();
  bindFilters();
  bindWorkspace();
  bindButtons();
}

document.addEventListener("DOMContentLoaded", init);
