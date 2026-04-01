const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const RC_KEY = "PM_RC_V3";

// ── State ─────────────────────────────────────────────────────────────────────

const defaultJobContext = {
  title: "", brief: "", goal: "", constraints: "",
  outputType: "Research dossier", jobMode: "Research",
  sourceClasses: "Mixed primary + secondary",
  provenanceStrictness: "Strict",
  contradictionHandling: "Preserve explicitly",
  verificationDepth: "Deep",
  learningObjective: "", failurePattern: "",
  targetPortal: "LoreCore", targetRole: "Researcher",
};

let state = {
  selectedSessionId: null,
  sessions: [],
  artifacts: [],
  availableModels: [],
  selectedModels: [],
  messages: [],
  jobContext: { ...defaultJobContext },
  activeTab: "job",
  sending: false,
  // Pipeline run state
  pipelines: [],
  selectedPipelineId: null,
  pipelineRunJobId: null,
  pipelineRunStatus: null,
  pipelineMode: false,   // true = pipeline run mode, false = direct chat mode
  _pollTimer: null,
};

try {
  const saved = JSON.parse(localStorage.getItem(RC_KEY) || "{}");
  if (saved.jobContext) state.jobContext = { ...defaultJobContext, ...saved.jobContext };
  if (saved.selectedModels) state.selectedModels = saved.selectedModels;
  if (saved.selectedPipelineId) state.selectedPipelineId = saved.selectedPipelineId;
  if (saved.pipelineMode !== undefined) state.pipelineMode = saved.pipelineMode;
} catch {}

function persist() {
  localStorage.setItem(RC_KEY, JSON.stringify({
    jobContext: state.jobContext,
    selectedModels: state.selectedModels,
    selectedPipelineId: state.selectedPipelineId,
    pipelineMode: state.pipelineMode,
  }));
}

// ── Utils ─────────────────────────────────────────────────────────────────────

const qs  = (s, r) => (r || document).querySelector(s);
const qsa = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

function renderMarkdown(text) {
  if (!text) return "";
  let t = esc(text);
  t = t.replace(/```[\s\S]*?```/g, m => {
    const inner = m.slice(3,-3).replace(/^[a-z]*\n/,"");
    return `<pre><code>${inner}</code></pre>`;
  });
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  t = t.replace(/^#{1,3} (.+)$/gm, (_, h) => `<h4>${h}</h4>`);
  t = t.replace(/((?:^[ \t]*[\*\-] .+\n?)+)/gm, block => {
    const items = block.trim().split("\n").map(l => `<li>${l.replace(/^[ \t]*[\*\-] /,"")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  t = t.replace(/((?:^[ \t]*\d+\. .+\n?)+)/gm, block => {
    const items = block.trim().split("\n").map(l => `<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  t = t.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  return `<p>${t}</p>`;
}

function showToast(msg, tone) {
  tone = tone || "good";
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = "toast " + tone + " is-visible";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function(){ t.classList.remove("is-visible"); }, 3000);
}

async function api(path, method, payload) {
  method = method || "GET";
  try {
    const res = await fetch(PM_API_BASE + path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body: body };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

// ── Models ────────────────────────────────────────────────────────────────────

async function loadModels() {
  const r = await api("/api/model-pool/models?sync=false");
  if (!r.ok) return;
  const items = Array.isArray(r.body && r.body.items) ? r.body.items : [];
  state.availableModels = items
    .filter(function(m) {
      const surfs = parseSurfaces(m.surface_allowlist);
      return m.enabled !== false && (surfs.includes("research") || surfs.includes("home"));
    })
    .map(function(m) { return { value: m.alias || m.name, label: m.name || m.alias }; });
  if (!state.selectedModels.length && state.availableModels[0]) {
    state.selectedModels = [state.availableModels[0].value];
  }
  renderModelSelector();
  renderPipelineRunPanel();
}

function renderModelSelector() {
  const wrap = qs("#modelSelectorWrap"); if (!wrap) return;
  if (!state.availableModels.length) {
    wrap.innerHTML = '<span class="list-empty">No models available.</span>'; return;
  }
  wrap.innerHTML = '<div class="model-check-grid">' +
    state.availableModels.map(function(m) {
      const active = state.selectedModels.includes(m.value);
      return '<label class="model-check ' + (active ? "model-check--active" : "") + '">' +
        '<input type="checkbox" value="' + esc(m.value) + '" ' + (active ? "checked" : "") + ' />' +
        esc(m.label) + '</label>';
    }).join("") + '</div>';
  qsa(".model-check input", wrap).forEach(function(cb) {
    cb.addEventListener("change", function() {
      if (cb.checked && !state.selectedModels.includes(cb.value)) state.selectedModels.push(cb.value);
      if (!cb.checked) state.selectedModels = state.selectedModels.filter(function(v){ return v !== cb.value; });
      cb.closest("label") && cb.closest("label").classList.toggle("model-check--active", cb.checked);
      persist();
      renderPipelineRunPanel();
    });
  });
}

// ── Pipelines ─────────────────────────────────────────────────────────────────

async function loadPipelines() {
  const r = await api("/api/pipelines");
  if (!r.ok) return;
  state.pipelines = (r.body && r.body.items || []).map(function(p) {
    return {
      id: p.public_id || p.id,
      title: p.title || p.name || "Untitled",
      type: p.type || "",
    };
  });
  renderPipelineSelector();
  renderPipelineRunPanel();
}

function renderPipelineSelector() {
  const wrap = qs("#pipelineSelectorWrap"); if (!wrap) return;
  if (!state.pipelines.length) {
    wrap.innerHTML = '<span class="list-empty">No saved pipelines. Build one in Pipelines.</span>'; return;
  }
  wrap.innerHTML = '<select class="rc-select" id="pipelineSelect">' +
    '<option value="">— select pipeline —</option>' +
    state.pipelines.map(function(p) {
      return '<option value="' + esc(p.id) + '" ' + (p.id === state.selectedPipelineId ? "selected" : "") + '>' +
        esc(p.title) + (p.type ? " [" + esc(p.type) + "]" : "") + '</option>';
    }).join("") + '</select>';
  qs("#pipelineSelect") && qs("#pipelineSelect").addEventListener("change", function(e) {
    state.selectedPipelineId = e.target.value || null;
    persist();
    renderPipelineRunPanel();
  });
}

// ── Run mode toggle ───────────────────────────────────────────────────────────

function renderModeToggle() {
  const wrap = qs("#modeToggleWrap"); if (!wrap) return;
  wrap.innerHTML =
    '<button class="mode-btn ' + (!state.pipelineMode ? "mode-btn--active" : "") + '" id="modeChatBtn" type="button">💬 Direct chat</button>' +
    '<button class="mode-btn ' + (state.pipelineMode ? "mode-btn--active" : "") + '" id="modePipelineBtn" type="button">⚡ Pipeline run</button>';
  qs("#modeChatBtn").addEventListener("click", function() {
    state.pipelineMode = false; persist(); renderModeToggle(); renderPipelineRunPanel(); updateStartBtn();
  });
  qs("#modePipelineBtn").addEventListener("click", function() {
    state.pipelineMode = true; persist(); renderModeToggle(); renderPipelineRunPanel(); updateStartBtn();
  });
}

// ── Pipeline run panel ────────────────────────────────────────────────────────

function renderPipelineRunPanel() {
  const wrap = qs("#pipelineRunWrap"); if (!wrap) return;
  if (!state.pipelineMode) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";

  const running = state.pipelineRunJobId && state.pipelineRunStatus &&
    (state.pipelineRunStatus.status === "queued" || state.pipelineRunStatus.status === "running");

  wrap.innerHTML = '<div class="panel" style="margin-top:12px;">' +
    '<div class="panel-label">Pipeline execution</div>' +
    '<div class="stack" style="gap:10px;">' +

    // Pipeline picker
    '<div>' +
      '<div class="rc-field-label">Pipeline</div>' +
      '<div id="pipelineSelectorWrap"></div>' +
    '</div>' +

    // Model override
    '<div>' +
      '<div class="rc-field-label">Model override <span style="color:var(--muted);font-weight:400;">(optional — uses per-node if blank)</span></div>' +
      '<select class="rc-select" id="pipelineModelOverride">' +
        '<option value="">Use per-node assignments</option>' +
        state.availableModels.map(function(m) {
          return '<option value="' + esc(m.value) + '">' + esc(m.label) + '</option>';
        }).join("") +
      '</select>' +
    '</div>' +

    // Status display
    (state.pipelineRunJobId ? renderPipelineStatusHTML() : "") +

    // View artifacts button
    (state.pipelineRunStatus && (state.pipelineRunStatus.status === "completed" || state.pipelineRunStatus.status === "partial") ?
      '<button class="btn btn-secondary" id="viewPipelineArtifactsBtn" type="button">View artifacts</button>' : "") +

    '</div></div>';

  renderPipelineSelector();

  qs("#pipelineModelOverride") && qs("#pipelineModelOverride").addEventListener("change", function(e) {
    state._pipelineModelOverride = e.target.value || null;
  });

  qs("#viewPipelineArtifactsBtn") && qs("#viewPipelineArtifactsBtn").addEventListener("click", function() {
    if (state.selectedPipelineId && state.pipelineRunJobId) {
      loadAndShowPipelineArtifacts(state.selectedPipelineId, state.pipelineRunJobId);
    }
  });
}

function renderPipelineStatusHTML() {
  const job = state.pipelineRunStatus; if (!job) return "";
  const statusColor = { queued: "#f2bf61", running: "#4eb8ff", completed: "#65d59a", partial: "#f2bf61", failed: "#ff7d7d" }[job.status] || "#7da8d0";
  const nodeStates = job.node_states || {};

  const nodeRows = Object.entries(nodeStates).map(function(entry) {
    const nid = entry[0], ns = entry[1];
    const dot = { queued: "⬜", running: "🔵", done: "✅", failed: "❌" }[ns.status] || "⬜";
    return '<div style="display:flex;gap:8px;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
      '<span style="font-size:13px;">' + dot + '</span>' +
      '<span style="font-size:11px;color:#b8d4f0;flex:1;">' + esc(ns.title || nid) + '</span>' +
      '<span style="font-size:10px;color:#7da8d0;">' + esc(ns.status || "") + '</span>' +
      '</div>';
  }).join("");

  return '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:11px;">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">' +
      '<span style="font-size:12px;font-weight:700;color:' + statusColor + ';">' + (job.status || "").toUpperCase() + '</span>' +
      '<span style="font-size:10px;color:#7da8d0;">' + esc(job.job_id || "") + '</span>' +
    '</div>' +
    (nodeRows ? '<div style="margin-bottom:6px;">' + nodeRows + '</div>' : "") +
    (job.error ? '<p style="color:#ff7d7d;font-size:11px;margin:4px 0 0;">' + esc(job.error) + '</p>' : "") +
    '</div>';
}

// ── Pipeline run execution ────────────────────────────────────────────────────

async function startPipelineRun() {
  if (!state.selectedPipelineId) { showToast("Select a pipeline first", "warn"); return; }
  readJobForm();
  const objective = buildJobPrompt();
  const overrideModel = state._pipelineModelOverride;
  const models = overrideModel ? [overrideModel] : state.selectedModels;

  const btn = qs("#startJobBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Starting pipeline…"; }

  const r = await api("/api/pipelines/" + encodeURIComponent(state.selectedPipelineId) + "/run", "POST", {
    objective: objective,
    selected_models: models,
    surface: "research",
  });

  if (!r.ok || !r.body || !r.body.job_id) {
    showToast("Pipeline start failed", "warn");
    if (btn) { btn.disabled = false; btn.textContent = "Run pipeline"; }
    return;
  }

  state.pipelineRunJobId = r.body.job_id;
  state.pipelineRunStatus = { status: "queued", job_id: r.body.job_id, node_states: {} };
  showToast("Pipeline started — " + r.body.job_id, "good");
  switchTab("chat");
  renderPipelineRunPanel();
  startPipelinePolling();
  if (btn) { btn.disabled = false; btn.textContent = "Run pipeline"; }
}

function startPipelinePolling() {
  clearInterval(state._pollTimer);
  state._pollTimer = setInterval(pollPipelineStatus, 2500);
  pollPipelineStatus();
}

async function pollPipelineStatus() {
  if (!state.pipelineRunJobId) { clearInterval(state._pollTimer); return; }
  const r = await api("/api/pipelines/runs/" + encodeURIComponent(state.pipelineRunJobId));
  if (!r.ok) return;
  state.pipelineRunStatus = r.body;
  renderPipelineRunPanel();
  // Also show inline in chat feed
  renderPipelineChatStatus();

  const status = r.body && r.body.status;
  if (status === "completed" || status === "failed" || status === "partial") {
    clearInterval(state._pollTimer);
    showToast("Pipeline " + status, status === "completed" ? "good" : "warn");
    if (status === "completed" || status === "partial") {
      await loadArtifacts();
    }
  }
}

function renderPipelineChatStatus() {
  const feed = qs("#chatFeed"); if (!feed) return;
  const existing = qs("#pipelineStatusMsg", feed);
  const job = state.pipelineRunStatus; if (!job) return;

  const statusColor = { queued: "#f2bf61", running: "#4eb8ff", completed: "#65d59a", partial: "#f2bf61", failed: "#ff7d7d" }[job.status] || "#7da8d0";
  const nodeStates = job.node_states || {};
  const total = job.node_count || Object.keys(nodeStates).length;
  const done = Object.values(nodeStates).filter(function(n){ return n.status === "done"; }).length;
  const failed = Object.values(nodeStates).filter(function(n){ return n.status === "failed"; }).length;

  const nodeRows = Object.entries(nodeStates).map(function(entry) {
    const nid = entry[0], ns = entry[1];
    const dot = { queued: "⬜", running: "🔵", done: "✅", failed: "❌" }[ns.status] || "⬜";
    return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);">' +
      '<span>' + dot + '</span>' +
      '<span style="font-size:12px;flex:1;color:#b8d4f0;">' + esc(ns.title || nid) + '</span>' +
      '<span style="font-size:11px;color:#7da8d0;">' + esc(ns.status || "") + '</span>' +
    '</div>';
  }).join("");

  const html = '<div id="pipelineStatusMsg" class="chat-msg chat-msg--assistant">' +
    '<div class="chat-msg-head">Pipeline executor</div>' +
    '<div class="chat-msg-body">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">' +
        '<span style="font-size:13px;font-weight:700;color:' + statusColor + ';">' + (job.status || "").toUpperCase() + '</span>' +
        '<span style="font-size:12px;color:#7da8d0;">' + done + '/' + total + ' nodes complete' + (failed ? ', ' + failed + ' failed' : '') + '</span>' +
      '</div>' +
      (nodeRows ? '<div style="margin-bottom:8px;">' + nodeRows + '</div>' : '<p style="color:#7da8d0;font-size:13px;">Initialising nodes…</p>') +
      (job.status === "completed" || job.status === "partial" ?
        '<p style="color:#65d59a;font-size:12px;margin-top:8px;">✅ Run complete — check Saved artifacts tab for output.</p>' : "") +
      (job.error ? '<p style="color:#ff7d7d;font-size:12px;">' + esc(job.error) + '</p>' : "") +
    '</div></div>';

  if (existing) {
    existing.outerHTML = html;
  } else {
    feed.insertAdjacentHTML("beforeend", html);
  }
  feed.scrollTop = feed.scrollHeight;
}

async function loadAndShowPipelineArtifacts(pipelineId, jobId) {
  const r = await api("/api/artifacts?scope_type=pipeline&scope_public_id=" + encodeURIComponent(pipelineId) + "&job_public_id=" + encodeURIComponent(jobId));
  if (!r.ok) { showToast("Could not load artifacts", "warn"); return; }
  const items = r.body && r.body.items || [];
  if (!items.length) { showToast("No artifacts yet", "warn"); return; }

  // Filter to just the final output first, then node outputs
  const finalItems = items.filter(function(a){ return a.artifact_type === "pipeline_output"; });
  const nodeItems  = items.filter(function(a){ return a.artifact_type === "node_output"; });
  const allItems = finalItems.concat(nodeItems);
  if (!allItems.length) { showToast("No artifacts found", "warn"); return; }

  showArtifactModal(allItems[0].title, allItems[0].content);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function loadSessions() {
  const r = await api("/api/research/sessions");
  if (!r.ok) return;
  state.sessions = Array.isArray(r.body && r.body.items) ? r.body.items.map(function(s) {
    return {
      id: s.public_id || s.session_public_id || s.id,
      title: s.title || "Untitled",
      updated: s.updated_at || s.created_at || "",
    };
  }) : [];
  renderSessionList();
}

function renderSessionList() {
  const el = qs("#sessionList"); if (!el) return;
  if (!state.sessions.length) {
    el.innerHTML = '<div class="list-empty">No sessions yet.</div>'; return;
  }
  el.innerHTML = state.sessions.map(function(s) {
    return '<button class="session-item ' + (s.id === state.selectedSessionId ? "session-item--active" : "") + '" type="button" data-session="' + esc(s.id) + '">' +
      '<div class="session-item-title">' + esc(s.title) + '</div>' +
      '<div class="session-item-meta">' + esc((s.updated || "").slice(0,16).replace("T"," ")) + '</div>' +
      '</button>';
  }).join("");
  qsa(".session-item", el).forEach(function(btn) {
    btn.addEventListener("click", function(){ selectSession(btn.dataset.session); });
  });
}

async function selectSession(id) {
  state.selectedSessionId = id;
  state.messages = [];
  renderSessionList();
  renderChat();
  switchTab("chat");
  const r = await api("/api/research/sessions/" + encodeURIComponent(id) + "/history");
  if (!r.ok) return;
  const msgs = Array.isArray(r.body && r.body.messages) ? r.body.messages : [];
  state.messages = msgs.map(function(m) {
    return { role: m.role || "assistant", content: m.content || m.text || "", model: m.selected_model || m.model || "" };
  });
  renderChat();
}

async function createSession(title) {
  const r = await api("/api/research/sessions", "POST", {
    title: title, mode: "single", selected_models: state.selectedModels,
  });
  if (!r.ok) { showToast("Session create failed", "warn"); return null; }
  const id = r.body && (r.body.public_id || r.body.session_public_id || r.body.id);
  await loadSessions();
  return id;
}

// ── Artifacts ─────────────────────────────────────────────────────────────────

async function loadArtifacts() {
  const r = await api("/api/research/artifacts");
  if (!r.ok) return;
  state.artifacts = Array.isArray(r.body && r.body.items) ? r.body.items : [];
  renderArtifacts();
}

function renderArtifacts() {
  const el = qs("#artifactList"); if (!el) return;
  if (!state.artifacts.length) {
    el.innerHTML = '<div class="list-empty">No saved knowledge objects yet.</div>'; return;
  }
  el.innerHTML = state.artifacts.map(function(a) {
    return '<article class="artifact-card">' +
      '<div class="artifact-head">' +
        '<span class="artifact-type-badge">' + esc(a.artifact_type || "dossier") + '</span>' +
        '<span class="artifact-date">' + esc((a.created_at || "").slice(0,10)) + '</span>' +
      '</div>' +
      '<div class="artifact-title">' + esc(a.title || "Untitled") + '</div>' +
      '<div class="artifact-preview">' + esc((a.content || "").slice(0,120)) + '…</div>' +
      '<button class="artifact-view-btn" data-content="' + esc(a.content || "") + '" data-title="' + esc(a.title || "") + '">View full artifact</button>' +
      '</article>';
  }).join("");
  qsa(".artifact-view-btn", el).forEach(function(btn) {
    btn.addEventListener("click", function(){ showArtifactModal(btn.dataset.title, btn.dataset.content); });
  });
}

function showArtifactModal(title, content) {
  const modal = qs("#artifactModal"); if (!modal) return;
  qs("#artifactModalTitle").textContent = title;
  qs("#artifactModalBody").innerHTML = renderMarkdown(content);
  modal.style.display = "flex";
}

async function saveCurrentChatAsArtifact() {
  if (!state.messages.length) { showToast("No chat to save", "warn"); return; }
  if (!state.selectedSessionId) { showToast("No active session", "warn"); return; }
  const outputType = qs("#outputType") ? qs("#outputType").value : "Research dossier";
  const title = state.jobContext.title || "Research artifact";
  const content = state.messages.map(function(m) {
    return "**" + (m.role === "user" ? "User" : (m.model || "Assistant")) + ":**\n" + m.content;
  }).join("\n\n---\n\n");
  const r = await api("/api/research/artifacts", "POST", {
    title: title + " — " + outputType,
    artifact_type: outputType.toLowerCase().replaceAll(" ", "_"),
    content: content,
    session_id: state.selectedSessionId,
    meta: { jobContext: state.jobContext },
  });
  if (!r.ok) { showToast("Save failed", "warn"); return; }
  showToast("Saved as " + outputType, "good");
  await loadArtifacts();
  switchTab("artifacts");
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function renderChat() {
  const feed = qs("#chatFeed"); if (!feed) return;
  if (!state.messages.length && !state.pipelineRunJobId) {
    feed.innerHTML = '<div class="chat-empty">' +
      '<div class="chat-empty-icon">' + (state.pipelineMode ? "⚡" : "🔍") + '</div>' +
      '<div class="chat-empty-title">' + (state.pipelineMode ? "Pipeline Run Mode" : "Research Core") + '</div>' +
      '<p>' + (state.pipelineMode ?
        "Select a pipeline, fill the job definition, then click <strong>Run pipeline</strong>.<br>The DAG executor will run all nodes and stream results here." :
        "Fill in the job definition, then start a job or ask a question directly.<br>The model will search the web and build structured responses.") +
      '</p></div>';
    return;
  }
  feed.innerHTML = state.messages.map(function(msg) {
    const isUser = msg.role === "user";
    return '<div class="chat-msg ' + (isUser ? "chat-msg--user" : "chat-msg--assistant") + '">' +
      '<div class="chat-msg-head">' + esc(isUser ? "You" : (msg.model || "Research model")) + '</div>' +
      '<div class="chat-msg-body">' + (isUser ? "<p>" + esc(msg.content) + "</p>" : renderMarkdown(msg.content)) + '</div>' +
      '</div>';
  }).join("");
  // Re-inject pipeline status if a run is active
  if (state.pipelineRunJobId && state.pipelineRunStatus) {
    renderPipelineChatStatus();
  }
  feed.scrollTop = feed.scrollHeight;
}

async function sendMessage(prompt) {
  if (!prompt || !prompt.trim()) return;
  if (!state.selectedModels.length) { showToast("Select at least one model", "warn"); return; }
  if (state.sending) return;
  if (!state.selectedSessionId) {
    const title = state.jobContext.title || prompt.slice(0, 60);
    const id = await createSession(title);
    if (!id) return;
    state.selectedSessionId = id;
  }
  state.sending = true;
  state.messages.push({ role: "user", content: prompt, model: "" });
  switchTab("chat");
  renderChat();
  const sendBtn = qs("#sendBtn");
  if (sendBtn) sendBtn.disabled = true;
  const statusEl = qs("#chatStatus");
  if (statusEl) statusEl.textContent = "Researching…";

  const r = await api(
    "/api/research/sessions/" + encodeURIComponent(state.selectedSessionId) + "/messages",
    "POST",
    { prompt: prompt, mode: "single", selected_models: state.selectedModels, job_context: state.jobContext }
  );

  state.sending = false;
  if (sendBtn) sendBtn.disabled = false;
  if (statusEl) statusEl.textContent = "";

  if (!r.ok) { showToast("Send failed", "warn"); return; }
  state.messages.push({
    role: "assistant",
    content: r.body && r.body.content || "",
    model: r.body && r.body.model || "",
  });
  renderChat();
}

// ── Job form ──────────────────────────────────────────────────────────────────

function buildJobPrompt() {
  const ctx = state.jobContext;
  const parts = [];
  if (ctx.title)      parts.push("**Research job:** " + ctx.title);
  if (ctx.brief)      parts.push("**Brief:** " + ctx.brief);
  if (ctx.goal)       parts.push("**Goal:** " + ctx.goal);
  if (ctx.constraints) parts.push("**Constraints:** " + ctx.constraints);
  parts.push("**Output type:** " + ctx.outputType);
  parts.push("**Mode:** " + ctx.jobMode);
  if (ctx.learningObjective) parts.push("**Learning objective:** " + ctx.learningObjective);
  if (ctx.failurePattern) parts.push("**Failure pattern to correct:** " + ctx.failurePattern);
  parts.push("\nBased on the above, conduct the research. Use web_search to find real sources. Preserve contradictions. Cite sources. Produce a structured " + ctx.outputType.toLowerCase() + ".");
  return parts.join("\n\n");
}

function readJobForm() {
  var get = function(id) { var el = qs("#" + id); return el ? (el.value || "").trim() : ""; };
  state.jobContext = {
    title: get("jobTitle"), brief: get("brief"), goal: get("goal"), constraints: get("constraints"),
    outputType: get("outputType"), jobMode: get("jobMode"),
    sourceClasses: get("sourceClasses"), provenanceStrictness: get("provenanceStrictness"),
    contradictionHandling: get("contradictionHandling"), verificationDepth: get("verificationDepth"),
    learningObjective: get("learningObjective"), failurePattern: get("failurePattern"),
    targetPortal: get("targetPortal"), targetRole: get("targetRole"),
  };
  persist();
  updateSummary();
}

function restoreJobForm() {
  const ctx = state.jobContext;
  var set = function(id, v) { var el = qs("#" + id); if (el && v) el.value = v; };
  set("jobTitle", ctx.title); set("brief", ctx.brief); set("goal", ctx.goal);
  set("constraints", ctx.constraints); set("outputType", ctx.outputType);
  set("sourceClasses", ctx.sourceClasses); set("provenanceStrictness", ctx.provenanceStrictness);
  set("contradictionHandling", ctx.contradictionHandling); set("verificationDepth", ctx.verificationDepth);
  set("learningObjective", ctx.learningObjective); set("failurePattern", ctx.failurePattern);
  set("targetPortal", ctx.targetPortal); set("targetRole", ctx.targetRole);
}

function updateSummary() {
  var set = function(id, v) { var el = qs("#" + id); if (el) el.textContent = v; };
  set("summaryMode", state.jobContext.jobMode || "—");
  set("summaryOutput", state.jobContext.outputType || "—");
  set("summaryModels", state.selectedModels.join(", ") || "—");
  set("summaryDest", (qs("#destinationProject") && qs("#destinationProject").value) || "—");
}

function updateStartBtn() {
  const btn = qs("#startJobBtn"); if (!btn) return;
  if (state.pipelineMode) {
    btn.textContent = "⚡ Run pipeline";
    btn.title = "Run selected pipeline with job definition as objective";
  } else {
    btn.textContent = "▶ Start job";
    btn.title = "Start a research session with the job definition";
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function switchTab(tab) {
  state.activeTab = tab;
  qsa(".rc-tab").forEach(function(btn) { btn.classList.toggle("rc-tab--active", btn.dataset.tab === tab); });
  var tabJob = qs("#tabJob"), tabChat = qs("#tabChat"), tabArtifacts = qs("#tabArtifacts");
  if (tabJob) tabJob.style.display = tab === "job" ? "block" : "none";
  if (tabChat) tabChat.style.display = tab === "chat" ? "flex" : "none";
  if (tabArtifacts) tabArtifacts.style.display = tab === "artifacts" ? "block" : "none";
}

// ── Bind events ───────────────────────────────────────────────────────────────

function bindEvents() {
  qsa(".rc-tab").forEach(function(btn) {
    btn.addEventListener("click", function(){ switchTab(btn.dataset.tab); });
  });

  qs("#jobForm") && qs("#jobForm").addEventListener("input", readJobForm);
  qs("#jobForm") && qs("#jobForm").addEventListener("change", readJobForm);

  qsa(".segment-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const group = btn.closest(".segment-group");
      qsa(".segment-btn", group).forEach(function(b){ b.classList.remove("segment-btn--active"); });
      btn.classList.add("segment-btn--active");
      const hiddenId = group.dataset.hidden;
      const hidden = qs("#" + hiddenId);
      if (hidden) { hidden.value = btn.dataset.value; readJobForm(); }
    });
  });

  qs("#startJobBtn") && qs("#startJobBtn").addEventListener("click", async function() {
    readJobForm();
    if (state.pipelineMode) {
      await startPipelineRun();
    } else {
      if (!state.jobContext.title && !state.jobContext.brief) {
        showToast("Fill in at least a title or brief first", "warn"); return;
      }
      const prompt = buildJobPrompt();
      const title = state.jobContext.title || "Research job";
      if (!state.selectedSessionId) {
        const id = await createSession(title);
        if (id) state.selectedSessionId = id;
      }
      await sendMessage(prompt);
    }
  });

  qs("#newSessionBtn") && qs("#newSessionBtn").addEventListener("click", async function() {
    state.selectedSessionId = null;
    state.messages = [];
    state.pipelineRunJobId = null;
    state.pipelineRunStatus = null;
    clearInterval(state._pollTimer);
    renderChat();
    renderSessionList();
    renderPipelineRunPanel();
    showToast("New session", "good");
    switchTab("job");
  });

  qs("#sendBtn") && qs("#sendBtn").addEventListener("click", function() {
    const input = qs("#chatInput");
    const text = input && input.value.trim();
    if (!text) return;
    if (input) input.value = "";
    sendMessage(text);
  });
  qs("#chatInput") && qs("#chatInput").addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); qs("#sendBtn") && qs("#sendBtn").click(); }
  });

  qs("#saveArtifactBtn") && qs("#saveArtifactBtn").addEventListener("click", saveCurrentChatAsArtifact);

  qs("#artifactModalClose") && qs("#artifactModalClose").addEventListener("click", function() {
    const m = qs("#artifactModal"); if (m) m.style.display = "none";
  });
  qs("#artifactModal") && qs("#artifactModal").addEventListener("click", function(e) {
    if (e.target === qs("#artifactModal")) qs("#artifactModal").style.display = "none";
  });

  qsa(".object-card").forEach(function(card) {
    card.addEventListener("click", function() {
      const typeMap = { "dossier":"Research dossier","evidence-chain":"Evidence chain","synthesis":"Synthesis notebook","eval":"Eval pack","training":"Training pack" };
      const t = typeMap[card.dataset.object];
      if (t && qs("#outputType")) { qs("#outputType").value = t; readJobForm(); }
      switchTab("job");
      if (t) showToast("Output type set to: " + t, "good");
    });
  });

  qs("#destinationProject") && qs("#destinationProject").addEventListener("change", updateSummary);

  initDragResize();
}

function initDragResize() {
  const handle = qs("#chatResizeHandle");
  const feed = qs("#chatFeed");
  if (!handle || !feed) return;
  const KEY = "rc_chat_height";
  const saved = parseInt(localStorage.getItem(KEY));
  if (saved > 80 && saved < 900) { feed.style.minHeight = saved + "px"; feed.style.maxHeight = saved + "px"; }
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener("mousedown", function(e) {
    dragging = true; startY = e.clientY; startH = feed.getBoundingClientRect().height;
    document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none"; e.preventDefault();
  });
  document.addEventListener("mousemove", function(e) {
    if (!dragging) return;
    const h = Math.max(200, Math.min(900, startH + (e.clientY - startY)));
    feed.style.minHeight = h + "px"; feed.style.maxHeight = h + "px";
  });
  document.addEventListener("mouseup", function() {
    if (!dragging) return; dragging = false;
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height));
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  restoreJobForm();
  switchTab("job");
  renderModeToggle();
  updateStartBtn();
  bindEvents();
  await Promise.all([loadModels(), loadSessions(), loadArtifacts(), loadPipelines()]);
  updateSummary();
}

document.addEventListener("DOMContentLoaded", init);
