const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const PM_AGENT_FACTORY_DRAFT_KEY = "PM_AGENT_FACTORY_DRAFT_V3";

const roleOptions = ["Planner", "Coder", "Verifier", "Auditor", "Router", "Research", "Creative", "Systems"];

const emptyDraft = {
  id: "",
  name: "New Agent",
  roleClass: "Planner",
  subtype: "",
  description: "",
  systemPrompt: "",
  reasoningLayers: [],
  modelFamily: [],
  taskTypes: [],
  outputContract: "",
  validationGate: "",
  quorumDefault: "single",
  fallbackPolicy: "explicit_fallback_only",
  timeoutSeconds: 60,
  testPrompt: "",
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
  filters: { search: "", roleClass: "All", subtype: "All" },
  recommendedTeam: null,
  librarySource: "loading"
};

function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function qs(selector, root = document) { return root.querySelector(selector); }
function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function showToast(message, tone = "good") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${tone} is-visible`;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

async function api(path, options = {}) {
  const config = { method: "GET", headers: {}, ...options };
  if (config.body && typeof config.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }
  try {
    const response = await fetch(`${PM_API_BASE}${path}`, config);
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, error: String(error) };
  }
}

// ── Normalize backend agent to internal format ────────────────────────────────
function normalizeAgent(raw, index = 0) {
  const name = raw?.name || `Agent ${index + 1}`;
  const roleClass = raw?.roleClass || raw?.role_class || raw?.role || "Planner";

  // Parse JSON fields that may come as strings from PostgreSQL
  function parseList(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    try { return JSON.parse(val); } catch { return []; }
  }

  return {
    id: raw?.public_id || raw?.id || `agent_${index}`,
    publicId: raw?.public_id || raw?.id || "",
    name,
    roleClass,
    subtype: raw?.subtype || "",
    description: raw?.description || "",
    systemPrompt: raw?.system_prompt || "",
    reasoningLayers: parseList(raw?.reasoning_layers),
    modelFamily: parseList(raw?.model_family),
    taskTypes: parseList(raw?.task_types),
    outputContract: raw?.output_contract || "",
    validationGate: raw?.validation_gate || "",
    quorumDefault: raw?.quorum_default || "single",
    fallbackPolicy: raw?.fallback_policy || "explicit_fallback_only",
    timeoutSeconds: parseInt(raw?.timeout_seconds || 60),
    testPrompt: raw?.test_prompt || "",
    parentAgentPublicId: raw?.parent_agent_public_id || null,
    verifierStatus: raw?.verifier_status || "unverified",
    mockFlag: Boolean(raw?.mock_flag),
    lastTestResult: raw?.last_test_result || null,
    lastTestedAt: raw?.last_tested_at || null,
    compatibility: {
      pipelines: Boolean(raw?.compatibility?.pipelines ?? parseList(raw?.compatible_pipeline_stages).length > 0),
      home: Boolean(raw?.compatibility?.home),
      loreDiscussion: Boolean(raw?.compatibility?.loreDiscussion || raw?.compatibility?.lore_discussion),
      creatorPresets: Boolean(raw?.compatibility?.creatorPresets || raw?.compatibility?.creator_presets)
    },
    source: raw?.mock_flag ? "mock" : "backend",
    raw
  };
}

function normalizeAgentsResponse(body) {
  if (Array.isArray(body)) return body.map(normalizeAgent);
  if (Array.isArray(body?.items)) return body.items.map(normalizeAgent);
  return [];
}

// ── Build backend payload from internal agent ─────────────────────────────────
function toBackendPayload(agent) {
  return {
    name: agent.name,
    role: agent.roleClass,
    description: agent.description,
    system_prompt: agent.systemPrompt,
    output_contract: agent.outputContract,
    validation_gate: agent.validationGate,
    quorum_default: agent.quorumDefault,
    fallback_policy: agent.fallbackPolicy,
    timeout_seconds: parseInt(agent.timeoutSeconds) || 60,
    model_family: Array.isArray(agent.modelFamily) ? agent.modelFamily : agent.modelFamily.split(",").map(s => s.trim()).filter(Boolean),
    task_types: Array.isArray(agent.taskTypes) ? agent.taskTypes : agent.taskTypes.split(",").map(s => s.trim()).filter(Boolean),
    reasoning_layers: Array.isArray(agent.reasoningLayers) ? agent.reasoningLayers : agent.reasoningLayers.split(",").map(s => s.trim()).filter(Boolean),
    test_prompt: agent.testPrompt,
    compatible_pipeline_stages: agent.compatibility?.pipelines ? ["all"] : [],
    verifier_status: agent.verifierStatus || "unverified",
    input_type: "text",
    output_type: "text",
    memory_scope: "session",
    permission_level: "standard",
    accent: "blue"
  };
}

function getSelectedAgent() {
  return state.agents.find(a => a.id === state.selectedAgentId) || state.agents[0] || null;
}

function saveDraftSnapshot() {
  const selected = getSelectedAgent();
  if (!selected) return;
  try { localStorage.setItem(PM_AGENT_FACTORY_DRAFT_KEY, JSON.stringify(selected)); } catch {}
}

function uniqueSubtypes(agents) {
  return [...new Set(agents.map(a => a.subtype).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function filteredAgents() {
  const search = state.filters.search.trim().toLowerCase();
  return state.agents.filter(agent => {
    const haystack = [agent.name, agent.roleClass, agent.subtype, agent.description].join(" ").toLowerCase();
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
  select.innerHTML = [`<option value="All">All</option>`, ...subtypes.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)].join("");
  select.value = subtypes.includes(current) ? current : "All";
}

function renderLibrary() {
  const list = qs("#agentLibraryList");
  if (!list) return;
  const agents = filteredAgents();
  if (!agents.length) {
    list.innerHTML = `<div class="library-card"><strong>No agents found</strong><span>Adjust filters or create a new draft.</span></div>`;
    return;
  }
  list.innerHTML = agents.map(agent => `
    <button class="library-card ${agent.id === state.selectedAgentId ? "library-card--active" : ""}" type="button" data-agent-id="${escapeHtml(agent.id)}">
      <strong>${escapeHtml(agent.name)}</strong>
      <span>${escapeHtml(agent.roleClass)}${agent.subtype ? " · " + escapeHtml(agent.subtype) : ""}${agent.mockFlag ? " · mock" : ""}</span>
    </button>
  `).join("");
}

function listToInput(val) {
  if (Array.isArray(val)) return val.join(", ");
  return val || "";
}

function renderWorkspace() {
  const agent = getSelectedAgent();
  if (!agent) return;

  qs("#workspaceRoleClass").textContent = agent.roleClass || "—";
  qs("#workspaceSubtype").textContent = agent.subtype || "—";
  qs("#workspaceQuorum").textContent = agent.quorumDefault || "—";
  qs("#workspaceCompatibility").textContent = compatibilityLabel(agent);

  qs("#agentName").value = agent.name || "";
  qs("#agentRoleClass").value = roleOptions.includes(agent.roleClass) ? agent.roleClass : "Planner";
  qs("#agentSubtype").value = agent.subtype || "";
  qs("#agentDescription").value = agent.description || "";
  qs("#agentSystemPrompt").value = agent.systemPrompt || "";
  qs("#agentReasoningLayers").value = listToInput(agent.reasoningLayers);
  qs("#agentModelFamily").value = listToInput(agent.modelFamily);
  qs("#agentTaskTypes").value = listToInput(agent.taskTypes);
  qs("#agentOutputContract").value = agent.outputContract || "";
  qs("#agentValidationGate").value = agent.validationGate || "";
  qs("#agentQuorumDefault").value = agent.quorumDefault || "single";
  qs("#agentFallbackPolicy").value = agent.fallbackPolicy || "explicit_fallback_only";
  qs("#agentTimeoutSeconds").value = agent.timeoutSeconds || 60;
  qs("#agentTestPrompt").value = agent.testPrompt || "";

  qs("#compatPipelines").checked = Boolean(agent.compatibility?.pipelines);
  qs("#compatHome").checked = Boolean(agent.compatibility?.home);
  qs("#compatLoreDiscussion").checked = Boolean(agent.compatibility?.loreDiscussion);
  qs("#compatCreatorPresets").checked = Boolean(agent.compatibility?.creatorPresets);

  qs("#previewAgentName").textContent = agent.name || "—";
  qs("#previewAgentDescription").textContent = agent.description || "No description yet.";
  qs("#previewAgentId").textContent = agent.publicId || agent.id || "draft";
  qs("#previewVerifierStatus").textContent = agent.verifierStatus || "unverified";

  qs("#promptPreviewBox").innerHTML = `
    <strong>${escapeHtml(agent.outputContract || "No output contract")}</strong>
    <span>Quorum: ${escapeHtml(agent.quorumDefault)} · Timeout: ${escapeHtml(String(agent.timeoutSeconds))}s</span>
  `;

  qs("#contractPreviewBox").innerHTML = `
    <strong>${escapeHtml(agent.validationGate || "No validation gate")}</strong>
    <span>Fallback: ${escapeHtml(agent.fallbackPolicy || "—")}</span>
  `;

  if (agent.lastTestedAt) {
    qs("#validationPreviewBox").innerHTML = `
      <strong>Last tested: ${escapeHtml(agent.lastTestedAt.slice(0, 16))}</strong>
      <span>${escapeHtml(JSON.stringify(agent.lastTestResult || {}).slice(0, 120))}</span>
    `;
  } else {
    qs("#validationPreviewBox").innerHTML = `<strong>Not yet tested</strong><span>Use Test Agent to fire a live test.</span>`;
  }

  const statusMap = { backend: ["Backend profile", "status-chip--good"], mock: ["Mock profile", "status-chip--warn"], draft: ["Unsaved draft", "status-chip--warn"] };
  const [label, cls] = statusMap[agent.source] || ["Unknown", "status-chip--warn"];
  setWorkspaceStatus(label, cls);
}

function renderAll() {
  populateSubtypeFilter();
  renderLibrary();
  renderWorkspace();
}

function updateSelectedAgentFromForm() {
  const agent = getSelectedAgent();
  if (!agent) return;

  function inputList(id) {
    return (qs(id)?.value || "").split(",").map(s => s.trim()).filter(Boolean);
  }

  agent.name = qs("#agentName")?.value.trim() || "Untitled Agent";
  agent.roleClass = qs("#agentRoleClass")?.value || "Planner";
  agent.subtype = qs("#agentSubtype")?.value.trim() || "";
  agent.description = qs("#agentDescription")?.value.trim() || "";
  agent.systemPrompt = qs("#agentSystemPrompt")?.value.trim() || "";
  agent.reasoningLayers = inputList("#agentReasoningLayers");
  agent.modelFamily = inputList("#agentModelFamily");
  agent.taskTypes = inputList("#agentTaskTypes");
  agent.outputContract = qs("#agentOutputContract")?.value.trim() || "";
  agent.validationGate = qs("#agentValidationGate")?.value.trim() || "";
  agent.quorumDefault = qs("#agentQuorumDefault")?.value || "single";
  agent.fallbackPolicy = qs("#agentFallbackPolicy")?.value || "explicit_fallback_only";
  agent.timeoutSeconds = parseInt(qs("#agentTimeoutSeconds")?.value) || 60;
  agent.testPrompt = qs("#agentTestPrompt")?.value.trim() || "";
  agent.compatibility = {
    pipelines: qs("#compatPipelines")?.checked || false,
    home: qs("#compatHome")?.checked || false,
    loreDiscussion: qs("#compatLoreDiscussion")?.checked || false,
    creatorPresets: qs("#compatCreatorPresets")?.checked || false
  };

  if (agent.source === "backend" || agent.source === "mock") agent.source = "draft";
  saveDraftSnapshot();
  renderAll();
}

function selectAgent(agentId) {
  const found = state.agents.find(a => a.id === agentId);
  if (!found) return;
  state.selectedAgentId = found.id;
  renderAll();
}

function createDraftAgent() {
  const copy = deepClone(emptyDraft);
  copy.id = `draft_${crypto.randomUUID().slice(0, 8)}`;
  copy.source = "draft";
  state.agents.unshift(copy);
  state.selectedAgentId = copy.id;
  renderAll();
  showToast("New draft created", "good");
}

async function cloneSelectedAgent() {
  const selected = getSelectedAgent();
  if (!selected) return;

  // If it has a real backend ID, clone via API
  if (selected.publicId && selected.source === "backend") {
    const result = await api(`/api/agents/${selected.publicId}/clone`, {
      method: "POST",
      body: { name: `${selected.name} (clone)` }
    });
    if (result.ok) {
      const cloned = normalizeAgent(result.body);
      state.agents.unshift(cloned);
      state.selectedAgentId = cloned.id;
      renderAll();
      showToast("Cloned on backend", "good");
      return;
    }
    showToast("Backend clone failed — cloning locally", "warn");
  }

  // Local clone for drafts
  const clone = deepClone(selected);
  clone.id = `draft_${crypto.randomUUID().slice(0, 8)}`;
  clone.publicId = "";
  clone.name = `${selected.name} (clone)`;
  clone.source = "draft";
  state.agents.unshift(clone);
  state.selectedAgentId = clone.id;
  saveDraftSnapshot();
  renderAll();
  showToast("Draft cloned locally", "good");
}

async function saveSelectedAgent() {
  updateSelectedAgentFromForm();
  const selected = getSelectedAgent();
  if (!selected) return;

  const payload = toBackendPayload(selected);

  let result;
  if (selected.publicId && (selected.source === "backend" || selected.verifierStatus)) {
    // Update existing
    result = await api(`/api/agents/${selected.publicId}`, { method: "PUT", body: payload });
  } else {
    // Create new
    result = await api("/api/agents", { method: "POST", body: payload });
  }

  if (!result.ok) {
    showToast(`Save failed: ${result.body?.detail || result.status}`, "warn");
    return;
  }

  const saved = normalizeAgent(result.body);
  state.agents = [saved, ...state.agents.filter(a => a.id !== selected.id && a.id !== saved.id)];
  state.selectedAgentId = saved.id;
  saveDraftSnapshot();
  renderAll();
  showToast("Agent saved to backend", "good");
}

async function deleteSelectedAgent() {
  const selected = getSelectedAgent();
  if (!selected) return;

  if (selected.source === "draft") {
    state.agents = state.agents.filter(a => a.id !== selected.id);
    state.selectedAgentId = state.agents[0]?.id || null;
    renderAll();
    showToast("Draft removed", "warn");
    return;
  }

  if (!selected.publicId) { showToast("No public ID — cannot delete", "warn"); return; }
  if (!confirm(`Delete agent "${selected.name}"? This cannot be undone.`)) return;

  const result = await api(`/api/agents/${selected.publicId}`, { method: "DELETE" });
  if (!result.ok) { showToast(`Delete failed: ${result.body?.detail || result.status}`, "warn"); return; }

  state.agents = state.agents.filter(a => a.id !== selected.id);
  state.selectedAgentId = state.agents[0]?.id || null;
  renderAll();
  showToast("Agent deleted", "warn");
}

async function testSelectedAgent() {
  const selected = getSelectedAgent();
  if (!selected || !selected.publicId) { showToast("Save agent first before testing", "warn"); return; }

  const testPrompt = qs("#agentTestPrompt")?.value.trim() || "";
  setWorkspaceStatus("Testing...", "status-chip--warn");

  const result = await api(`/api/agents/${selected.publicId}/test`, {
    method: "POST",
    body: { prompt: testPrompt }
  });

  if (!result.ok) {
    setWorkspaceStatus("Test failed", "status-chip--warn");
    showToast(`Test failed: ${result.body?.detail || result.status}`, "warn");
    return;
  }

  const tested = result.body;
  selected.lastTestResult = tested.result;
  selected.lastTestedAt = tested.tested_at;
  renderWorkspace();
  setWorkspaceStatus("Test complete", "status-chip--good");
  showToast("Test complete — see validation preview", "good");
}

async function loadRecommendedTeam() {
  const portalType = qs("#recommendedPortalType")?.value || "appcreator";
  const result = await api(`/api/agent-teams/recommended/${encodeURIComponent(portalType)}`, { method: "POST" });
  const box = qs("#recommendedTeamBox");
  if (!box) return;

  if (!result.ok) {
    box.innerHTML = `<strong>No team loaded</strong><span>Request failed (${result.status})</span>`;
    showToast("Recommended team request failed", "warn");
    return;
  }

  state.recommendedTeam = result.body;
  const body = result.body;
  const members = Array.isArray(body?.members) ? body.members : Array.isArray(body?.agents) ? body.agents : [];
  const title = body?.name || body?.team_name || `Recommended ${portalType}`;
  const detail = members.length ? members.map(m => m?.name || m?.role || "member").join(" · ") : "Team loaded";
  box.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
  showToast("Recommended team loaded", "good");
}

function checkCompatibility() {
  updateSelectedAgentFromForm();
  const selected = getSelectedAgent();
  if (!selected) return;
  const messages = [];
  if (!selected.systemPrompt) messages.push("Missing system prompt");
  if (!selected.outputContract) messages.push("Missing output contract");
  if (!selected.validationGate) messages.push("Missing validation gate");
  if (!selected.modelFamily?.length) messages.push("No model family set");
  if (!messages.length) { showToast("Profile looks structurally complete", "good"); }
  else { showToast(messages.join(" · "), "warn"); }
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
      setLibraryStatus(`${agents.length} agents`, "status-chip--good");
      renderAll();
      return;
    }
  }

  state.agents = [];
  state.selectedAgentId = null;
  state.librarySource = "empty";
  setLibraryStatus("No agents — create one", "status-chip--warn");
  renderAll();
  showToast("No agents in backend. Create your first agent.", "warn");
}

function bindStaticEvents() {
  qs("#agentSearch")?.addEventListener("input", e => { state.filters.search = e.target.value; renderLibrary(); });
  qs("#libraryRoleClass")?.addEventListener("change", e => { state.filters.roleClass = e.target.value; renderLibrary(); });
  qs("#librarySubtype")?.addEventListener("change", e => { state.filters.subtype = e.target.value; renderLibrary(); });

  qs("#agentLibraryList")?.addEventListener("click", e => {
    const button = e.target.closest("[data-agent-id]");
    if (!button) return;
    selectAgent(button.dataset.agentId);
  });

  const formFields = [
    "#agentName", "#agentRoleClass", "#agentSubtype", "#agentDescription",
    "#agentSystemPrompt", "#agentReasoningLayers", "#agentModelFamily", "#agentTaskTypes",
    "#agentOutputContract", "#agentValidationGate", "#agentQuorumDefault",
    "#agentFallbackPolicy", "#agentTimeoutSeconds", "#agentTestPrompt",
    "#compatPipelines", "#compatHome", "#compatLoreDiscussion", "#compatCreatorPresets"
  ];
  formFields.forEach(selector => {
    qs(selector)?.addEventListener("input", updateSelectedAgentFromForm);
    qs(selector)?.addEventListener("change", updateSelectedAgentFromForm);
  });

  qs("#newAgentBtn")?.addEventListener("click", createDraftAgent);
  qs("#cloneAgentBtn")?.addEventListener("click", cloneSelectedAgent);
  qs("#saveAgentBtn")?.addEventListener("click", saveSelectedAgent);
  qs("#deleteAgentBtn")?.addEventListener("click", deleteSelectedAgent);
  qs("#testAgentBtn")?.addEventListener("click", testSelectedAgent);
  qs("#loadRecommendedBtn")?.addEventListener("click", loadRecommendedTeam);
  qs("#checkCompatibilityBtn")?.addEventListener("click", checkCompatibility);
}

function init() {
  bindStaticEvents();
  renderAll();
  loadLibrary();
}

document.addEventListener("DOMContentLoaded", init);
