const PM_PIPELINES_KEY = "PM_PIPELINES_V2";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const defaultState = {
  selectedNodeId: "node-input",
  portalPreviewVisible: true,
  currentPipelineName: "Homepage Contract Pipeline",
  spawnSelections: {
    roleClass: "Coder",
    subtype: "C++ Coder",
    profile: "DeepSeek"
  },
  inspector: {
    nodeTitle: "Brief Intake",
    nodeDescription: "Input node selected. This is where work enters the graph."
  },
  nodes: [
    {
      id: "node-input",
      title: "Brief Intake",
      description: "Receives task brief and constraints.",
      meta: "No quorum · raw input",
      type: "input",
      roleProfile: "brief_intake_v1",
      reasoningLayer: "input_normalizer_v1",
      outputContract: "raw_brief_payload",
      validationGate: "brief_schema_gate",
      primaryGroup: "router-a, router-b, router-c",
      fallbackGroup: "none",
      timeout: "60s",
      quorumRule: "single pass",
      notes: "",
      x: 46,
      y: 78
    },
    {
      id: "node-planner",
      title: "Structured Planner",
      description: "Builds constrained plan and handoff targets.",
      meta: "planner_structured_v1",
      type: "planner",
      roleProfile: "planner_structured_v1",
      reasoningLayer: "planner_operating_prompt",
      outputContract: "structured_markdown_plan",
      validationGate: "plan_contract_gate",
      primaryGroup: "planner-a, planner-b, planner-c",
      fallbackGroup: "router fallback group",
      timeout: "90s",
      quorumRule: "2-of-3",
      notes: "",
      x: 286,
      y: 78
    },
    {
      id: "node-coder",
      title: "C++ Coder",
      description: "Role profile from Agent Factory, overridable here.",
      meta: "DeepSeek · cpp_generator_v1",
      type: "coder",
      roleProfile: "cpp_generator_v1",
      reasoningLayer: "coder_operating_prompt",
      outputContract: "raw_cpp_module",
      validationGate: "cpp_compile_gate",
      primaryGroup: "cpp-a, cpp-b, cpp-c",
      fallbackGroup: "cloud heavy fallback",
      timeout: "120s",
      quorumRule: "2-of-3",
      notes: "",
      x: 526,
      y: 78
    },
    {
      id: "node-verifier",
      title: "Strict Verifier",
      description: "Contract, output, and compile verification.",
      meta: "strict_verifier_v1",
      type: "verifier",
      roleProfile: "strict_verifier_v1",
      reasoningLayer: "strict_verifier_v2",
      outputContract: "strict_json_verification",
      validationGate: "verification_schema_v1",
      primaryGroup: "verify-a, verify-b, verify-c",
      fallbackGroup: "none",
      timeout: "60s",
      quorumRule: "3-of-3",
      notes: "",
      x: 766,
      y: 78
    },
    {
      id: "node-auditor",
      title: "Audit Node",
      description: "Final review before promotion or export.",
      meta: "audit_operating_v1",
      type: "auditor",
      roleProfile: "audit_operating_v1",
      reasoningLayer: "audit_operating_v1",
      outputContract: "markdown_audit",
      validationGate: "audit_gate_v1",
      primaryGroup: "audit-a, audit-b, audit-c",
      fallbackGroup: "none",
      timeout: "60s",
      quorumRule: "2-of-3",
      notes: "",
      x: 1006,
      y: 78
    },
    {
      id: "node-branch",
      title: "Fallback Path",
      description: "Optional alternate route with explicit trigger.",
      meta: "branch_if_fail",
      type: "branch",
      roleProfile: "branch_if_fail_v1",
      reasoningLayer: "inherit from upstream",
      outputContract: "branch_decision",
      validationGate: "branch_rule_gate",
      primaryGroup: "router-a, router-b, router-c",
      fallbackGroup: "none",
      timeout: "45s",
      quorumRule: "single pass",
      notes: "",
      x: 286,
      y: 220
    },
    {
      id: "node-projection",
      title: "Portal Projection",
      description: "Simplified downstream representation only.",
      meta: "Projects → AppCreator",
      type: "projection",
      roleProfile: "portal_projection_v1",
      reasoningLayer: "projection_minimal_v1",
      outputContract: "portal_projection_payload",
      validationGate: "projection_gate_v1",
      primaryGroup: "projection-a",
      fallbackGroup: "none",
      timeout: "30s",
      quorumRule: "single pass",
      notes: "",
      x: 1246,
      y: 78
    }
  ]
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(PM_PIPELINES_KEY);
    if (!raw) return deepClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...deepClone(defaultState),
      ...parsed,
      nodes: parsed.nodes && Array.isArray(parsed.nodes) ? parsed.nodes : deepClone(defaultState.nodes)
    };
  } catch {
    return deepClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(PM_PIPELINES_KEY, JSON.stringify(state));
}

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
  if (!PM_API_BASE) {
    return { ok: false, mock: true, error: "Missing PM_API_BASE" };
  }

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

function nodeTypeClass(type) {
  switch (type) {
    case "input": return "pipeline-node--input";
    case "planner": return "pipeline-node--planner";
    case "coder": return "pipeline-node--coder";
    case "verifier": return "pipeline-node--verifier";
    case "auditor": return "pipeline-node--auditor";
    case "branch": return "pipeline-node--branch";
    case "projection": return "pipeline-node--projection";
    default: return "";
  }
}

function nodeTypeBadge(type) {
  switch (type) {
    case "input": return "Input";
    case "planner": return "Planner";
    case "coder": return "Coder";
    case "verifier": return "Verifier";
    case "auditor": return "Auditor";
    case "branch": return "Branch";
    case "projection": return "Projection";
    default: return "Node";
  }
}

function renderNodes() {
  const canvas = qs("#pipelineCanvas");
  if (!canvas) return;

  qsa(".pipeline-node", canvas).forEach(node => node.remove());

  state.nodes.forEach(node => {
    const el = document.createElement("article");
    el.className = `pipeline-node ${nodeTypeClass(node.type)} ${state.selectedNodeId === node.id ? "is-selected" : ""}`;
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;

    el.innerHTML = `
      <div class="node-head">
        <span class="node-type node-type--${node.type}">${nodeTypeBadge(node.type)}</span>
        <span class="node-badge">${node.quorumRule}</span>
      </div>
      <strong>${node.title}</strong>
      <p>${node.description}</p>
      <div class="node-meta">${node.meta}</div>
    `;

    canvas.appendChild(el);
  });
}

function updateInspector() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId);
  if (!node) return;

  const title = qs("#selectedNodeTitle");
  if (title) title.textContent = node.title;

  const desc = qs(".panel-right .card .muted");
  if (desc) desc.textContent = node.description;

  const selects = qsa(".panel-right .select");
  if (selects.length >= 9) {
    selects[0].value = node.roleProfile || "";
    selects[1].value = node.reasoningLayer || "";
    selects[2].value = node.outputContract || "";
    selects[3].value = node.validationGate || "";
    selects[4].value = node.primaryGroup || "";
    selects[5].value = node.fallbackGroup || "";
    selects[6].value = node.timeout || "";
    selects[7].value = node.quorumRule || "";
    selects[8].value = "inherit from Agent Factory";
  }

  const textarea = qs(".panel-right .textarea");
  if (textarea) textarea.value = node.notes || "";
}

function persistInspectorToNode() {
  const node = state.nodes.find(n => n.id === state.selectedNodeId);
  if (!node) return;

  const selects = qsa(".panel-right .select");
  const textarea = qs(".panel-right .textarea");

  if (selects.length >= 9) {
    node.roleProfile = selects[0].value;
    node.reasoningLayer = selects[1].value;
    node.outputContract = selects[2].value;
    node.validationGate = selects[3].value;
    node.primaryGroup = selects[4].value;
    node.fallbackGroup = selects[5].value;
    node.timeout = selects[6].value;
    node.quorumRule = selects[7].value;
  }

  node.notes = textarea?.value || "";
  saveState();
}

function renderPortalPreview() {
  const preview = qs(".portal-preview");
  if (!preview) return;
  preview.style.display = state.portalPreviewVisible ? "flex" : "none";
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  saveState();
  renderNodes();
  updateInspector();
}

function bindNodeSelection() {
  qsa(".pipeline-node").forEach(nodeEl => {
    nodeEl.addEventListener("click", () => {
      selectNode(nodeEl.dataset.nodeId);
    });
  });
}

function bindInspector() {
  qsa(".panel-right .select").forEach(select => {
    select.addEventListener("change", persistInspectorToNode);
  });

  const textarea = qs(".panel-right .textarea");
  textarea?.addEventListener("input", persistInspectorToNode);
}

function nextNodeType(roleClass) {
  switch (roleClass) {
    case "Planner": return "planner";
    case "Verifier": return "verifier";
    case "Auditor": return "auditor";
    case "Router": return "planner";
    case "Branch": return "branch";
    case "Handoff": return "branch";
    case "Export": return "projection";
    case "Portal Projection": return "projection";
    case "Coder":
    default: return "coder";
  }
}

function slugify(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "_");
}

function buildNodeFromSpawn() {
  const roleClass = qs("#spawnRoleClass")?.value || "Coder";
  const subtype = qs("#spawnSubtype")?.value || "C++ Coder";
  const profile = qs("#spawnProfile")?.value || "DeepSeek";
  const type = nextNodeType(roleClass);

  const subtypeSlug = slugify(subtype);
  const roleSlug = slugify(roleClass);

  return {
    id: `node-${crypto.randomUUID().slice(0, 8)}`,
    title: subtype,
    description: `${roleClass} node spawned from pipeline workbench.`,
    meta: `${profile} · ${subtypeSlug}_v1`,
    type,
    roleProfile: `${subtypeSlug}_v1`,
    reasoningLayer: roleClass === "Coder" ? "coder_operating_prompt" : `${roleSlug}_operating_prompt`,
    outputContract: roleClass === "Coder" ? "raw_code_file" : `${roleSlug}_contract`,
    validationGate: `${subtypeSlug}_gate`,
    primaryGroup: `${profile} primary group`,
    fallbackGroup: "none",
    timeout: roleClass === "Coder" ? "90s" : "60s",
    quorumRule: roleClass === "Coder" || roleClass === "Verifier" || roleClass === "Auditor" ? "2-of-3" : "single pass",
    notes: "",
    x: 120 + (state.nodes.length % 4) * 240,
    y: 380 + Math.floor(state.nodes.length / 4) * 160
  };
}

function spawnNode() {
  const node = buildNodeFromSpawn();
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  saveState();
  renderAll();
  showToast(`${node.title} spawned`, "good");
}

function spawnBranch() {
  const node = {
    id: `node-${crypto.randomUUID().slice(0, 8)}`,
    title: "Branch",
    description: "Explicit branch node for alternate pipeline paths.",
    meta: "branch_if_condition",
    type: "branch",
    roleProfile: "branch_if_fail_v1",
    reasoningLayer: "inherit from upstream",
    outputContract: "branch_decision",
    validationGate: "branch_rule_gate",
    primaryGroup: "router-a, router-b, router-c",
    fallbackGroup: "none",
    timeout: "45s",
    quorumRule: "single pass",
    notes: "",
    x: 200,
    y: 520
  };

  state.nodes.push(node);
  state.selectedNodeId = node.id;
  saveState();
  renderAll();
  showToast("Branch node spawned", "good");
}

function bindTopButtons() {
  qs("#spawnNodeBtn")?.addEventListener("click", spawnNode);
  qs("#spawnBranchBtn")?.addEventListener("click", spawnBranch);

  qs("#togglePortalPreviewBtn")?.addEventListener("click", () => {
    state.portalPreviewVisible = !state.portalPreviewVisible;
    saveState();
    renderPortalPreview();
    showToast(`Portal preview ${state.portalPreviewVisible ? "shown" : "hidden"}`, "good");
  });

  qs("#clonePipelineBtn")?.addEventListener("click", () => {
    state.currentPipelineName = `${state.currentPipelineName} Copy`;
    saveState();
    showToast("Pipeline cloned", "good");
  });

  qs("#runSelectedPipelineBtn")?.addEventListener("click", async () => {
    const result = await callApi("/api/pipelines/run", "POST", {
      pipeline_name: state.currentPipelineName,
      selected_node_id: state.selectedNodeId,
      nodes: state.nodes
    });

    showToast(result.ok ? "Pipeline run requested" : "No live API yet. UI hook is ready.", result.ok ? "good" : "warn");
  });
}

function bindSpawnSelectors() {
  const roleClass = qs("#spawnRoleClass");
  const subtype = qs("#spawnSubtype");
  const profile = qs("#spawnProfile");
  if (!roleClass || !subtype || !profile) return;

  const subtypeOptions = {
    Coder: ["C++ Coder", "Python Coder", "JS Coder", "HTML Coder", "CSS Coder", "Backend API Coder"],
    Planner: ["Structured Planner", "Chapter Planner", "Research Planner", "Pipeline Planner"],
    Verifier: ["Strict Verifier", "Compile Verifier", "Contract Verifier", "Canon Verifier"],
    Auditor: ["Audit Writer", "Policy Auditor", "Release Auditor"],
    Router: ["Task Router", "Provider Router", "Stage Router"],
    Branch: ["Fallback Branch", "Quorum Split", "Failure Branch"],
    Handoff: ["Portal Handoff", "Worker Handoff", "Node Handoff"],
    Export: ["Bundle Export", "Artifact Export", "Registry Export"],
    "Portal Projection": ["Projects Projection", "PortalCreator Projection", "AppCreator Projection"]
  };

  const profileOptions = {
    "C++ Coder": ["DeepSeek", "Starcoder", "Llama", "Qwen Coder", "Ollama Cloud Heavy Coder"],
    "Python Coder": ["DeepSeek", "Starcoder", "Llama", "Qwen Coder", "Ollama Cloud Heavy Coder"],
    "JS Coder": ["DeepSeek", "Llama", "Gemma", "Qwen Coder", "Ollama Cloud Heavy Coder"],
    "HTML Coder": ["Gemma", "Llama", "DeepSeek"],
    "CSS Coder": ["Gemma", "Llama", "DeepSeek"],
    "Backend API Coder": ["DeepSeek", "Starcoder", "OpenAI"],
    "Structured Planner": ["Gemma", "Qwen", "DeepSeek", "OpenAI"],
    "Strict Verifier": ["Gemma", "Qwen", "OpenAI"],
    "Audit Writer": ["Gemma", "Claude", "OpenAI"]
  };

  function refillSubtype() {
    const values = subtypeOptions[roleClass.value] || ["Generic"];
    subtype.innerHTML = values.map((value, idx) => `<option ${idx === 0 ? "selected" : ""}>${value}</option>`).join("");
    refillProfile();
  }

  function refillProfile() {
    const values = profileOptions[subtype.value] || ["DeepSeek", "Llama", "Gemma"];
    profile.innerHTML = values.map((value, idx) => `<option ${idx === 0 ? "selected" : ""}>${value}</option>`).join("");
  }

  roleClass.addEventListener("change", refillSubtype);
  subtype.addEventListener("change", refillProfile);

  refillSubtype();
}

function makeNodesDraggable() {
  const canvas = qs("#pipelineCanvas");
  if (!canvas) return;

  let active = null;
  let offsetX = 0;
  let offsetY = 0;

  qsa(".pipeline-node", canvas).forEach(nodeEl => {
    nodeEl.addEventListener("pointerdown", event => {
      const id = nodeEl.dataset.nodeId;
      const node = state.nodes.find(n => n.id === id);
      if (!node) return;

      active = node;
      offsetX = event.clientX - nodeEl.offsetLeft;
      offsetY = event.clientY - nodeEl.offsetTop;
      nodeEl.setPointerCapture(event.pointerId);
      selectNode(id);
    });

    nodeEl.addEventListener("pointermove", event => {
      if (!active || active.id !== nodeEl.dataset.nodeId) return;

      const rect = canvas.getBoundingClientRect();
      let x = event.clientX - rect.left - offsetX;
      let y = event.clientY - rect.top - offsetY;

      x = Math.max(12, Math.min(x, rect.width - nodeEl.offsetWidth - 12));
      y = Math.max(12, Math.min(y, rect.height - nodeEl.offsetHeight - 12));

      active.x = x;
      active.y = y;
      nodeEl.style.left = `${x}px`;
      nodeEl.style.top = `${y}px`;
    });

    nodeEl.addEventListener("pointerup", () => {
      if (active && active.id === nodeEl.dataset.nodeId) {
        saveState();
      }
      active = null;
    });

    nodeEl.addEventListener("pointercancel", () => {
      active = null;
    });
  });
}

let state = loadState();

function renderAll() {
  renderNodes();
  bindNodeSelection();
  updateInspector();
  renderPortalPreview();
  makeNodesDraggable();
}

function init() {
  bindSpawnSelectors();
  bindTopButtons();
  bindInspector();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
