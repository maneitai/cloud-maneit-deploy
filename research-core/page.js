const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const RC_KEY = "PM_RC_V2";

// ── State ─────────────────────────────────────────────────────────────────────

const defaultJobContext = {
  title: "",
  brief: "",
  goal: "",
  constraints: "",
  outputType: "Research dossier",
  jobMode: "Research",
  sourceClasses: "Mixed primary + secondary",
  provenanceStrictness: "Strict",
  contradictionHandling: "Preserve explicitly",
  verificationDepth: "Deep",
  learningObjective: "",
  failurePattern: "",
  targetPortal: "LoreCore",
  targetRole: "Researcher",
};

let state = {
  selectedSessionId: null,
  sessions: [],
  artifacts: [],
  availableModels: [],
  selectedModels: [],
  messages: [],
  jobContext: { ...defaultJobContext },
  activeTab: "job",   // job | chat | artifacts
  sending: false,
};

try {
  const saved = JSON.parse(localStorage.getItem(RC_KEY) || "{}");
  if (saved.jobContext) state.jobContext = { ...defaultJobContext, ...saved.jobContext };
  if (saved.selectedModels) state.selectedModels = saved.selectedModels;
} catch {}

function persist() {
  localStorage.setItem(RC_KEY, JSON.stringify({
    jobContext: state.jobContext,
    selectedModels: state.selectedModels,
  }));
}

// ── Utils ─────────────────────────────────────────────────────────────────────

const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
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

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 3000);
}

async function api(path, method = "GET", payload = null) {
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, {
      method, headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
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
  const items = Array.isArray(r.body?.items) ? r.body.items : [];
  state.availableModels = items
    .filter(m => m.enabled !== false && m.runtime_driver === "openai_api"
      && (parseSurfaces(m.surface_allowlist).includes("research") || parseSurfaces(m.surface_allowlist).includes("home")))
    .map(m => ({ value: m.alias || m.name, label: m.name || m.alias }));
  if (!state.selectedModels.length && state.availableModels[0]) {
    state.selectedModels = [state.availableModels[0].value];
  }
  renderModelSelector();
}

function renderModelSelector() {
  const wrap = qs("#modelSelectorWrap"); if (!wrap) return;
  if (!state.availableModels.length) {
    wrap.innerHTML = `<span class="soft">No models available.</span>`; return;
  }
  wrap.innerHTML = `
    <div class="model-check-grid">
      ${state.availableModels.map(m => `
        <label class="model-check ${state.selectedModels.includes(m.value) ? "model-check--active" : ""}">
          <input type="checkbox" value="${esc(m.value)}" ${state.selectedModels.includes(m.value) ? "checked" : ""} />
          ${esc(m.label)}
        </label>
      `).join("")}
    </div>
  `;
  qsa(".model-check input", wrap).forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked && !state.selectedModels.includes(cb.value)) state.selectedModels.push(cb.value);
      if (!cb.checked) state.selectedModels = state.selectedModels.filter(v => v !== cb.value);
      cb.closest("label")?.classList.toggle("model-check--active", cb.checked);
      persist();
    });
  });
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function loadSessions() {
  const r = await api("/api/research/sessions");
  if (!r.ok) return;
  state.sessions = Array.isArray(r.body?.items) ? r.body.items.map(s => ({
    id: s.public_id || s.session_public_id || s.id,
    title: s.title || "Untitled",
    updated: s.updated_at || s.created_at || "",
  })) : [];
  renderSessionList();
}

function renderSessionList() {
  const el = qs("#sessionList"); if (!el) return;
  if (!state.sessions.length) {
    el.innerHTML = `<div class="list-empty">No sessions yet. Start a job to create one.</div>`; return;
  }
  el.innerHTML = state.sessions.map(s => `
    <button class="session-item ${s.id === state.selectedSessionId ? "session-item--active" : ""}"
      type="button" data-session="${esc(s.id)}">
      <div class="session-item-title">${esc(s.title)}</div>
      <div class="session-item-meta">${esc(s.updated?.slice(0,16).replace("T"," ") || "")}</div>
    </button>
  `).join("");
  qsa(".session-item", el).forEach(btn => {
    btn.addEventListener("click", () => selectSession(btn.dataset.session));
  });
}

async function selectSession(id) {
  state.selectedSessionId = id;
  state.messages = [];
  renderSessionList();
  renderChat();
  switchTab("chat");
  // Load history
  const r = await api(`/api/research/sessions/${encodeURIComponent(id)}/history`);
  if (!r.ok) return;
  const msgs = Array.isArray(r.body?.messages) ? r.body.messages : [];
  state.messages = msgs.map(m => ({
    role: m.role || "assistant",
    content: m.content || m.text || "",
    model: m.selected_model || m.model || "",
  }));
  renderChat();
  // Update session title in job form
  const session = state.sessions.find(s => s.id === id);
  if (session && qs("#jobTitle") && !qs("#jobTitle").value) {
    qs("#jobTitle").value = session.title;
  }
}

async function createSession(title) {
  const r = await api("/api/research/sessions", "POST", {
    title,
    mode: "single",
    selected_models: state.selectedModels,
  });
  if (!r.ok) { showToast("Session create failed", "warn"); return null; }
  const id = r.body?.public_id || r.body?.session_public_id || r.body?.id;
  await loadSessions();
  return id;
}

// ── Artifacts ─────────────────────────────────────────────────────────────────

async function loadArtifacts() {
  const r = await api("/api/research/artifacts");
  if (!r.ok) return;
  state.artifacts = Array.isArray(r.body?.items) ? r.body.items : [];
  renderArtifacts();
}

function renderArtifacts() {
  const el = qs("#artifactList"); if (!el) return;
  if (!state.artifacts.length) {
    el.innerHTML = `<div class="list-empty">No saved knowledge objects yet.</div>`; return;
  }
  el.innerHTML = state.artifacts.map(a => `
    <article class="artifact-card">
      <div class="artifact-head">
        <span class="artifact-type-badge">${esc(a.artifact_type || "dossier")}</span>
        <span class="artifact-date">${esc((a.created_at||"").slice(0,10))}</span>
      </div>
      <div class="artifact-title">${esc(a.title || "Untitled")}</div>
      <div class="artifact-preview">${esc((a.content||"").slice(0,120))}…</div>
      <button class="artifact-view-btn" data-content="${esc(a.content||"")}" data-title="${esc(a.title||"")}">
        View full artifact
      </button>
    </article>
  `).join("");
  qsa(".artifact-view-btn", el).forEach(btn => {
    btn.addEventListener("click", () => showArtifactModal(btn.dataset.title, btn.dataset.content));
  });
}

function showArtifactModal(title, content) {
  const modal = qs("#artifactModal");
  if (!modal) return;
  qs("#artifactModalTitle").textContent = title;
  qs("#artifactModalBody").innerHTML = renderMarkdown(content);
  modal.style.display = "flex";
}

async function saveCurrentChatAsArtifact() {
  if (!state.messages.length) { showToast("No chat to save", "warn"); return; }
  if (!state.selectedSessionId) { showToast("No active session", "warn"); return; }
  const outputType = qs("#outputType")?.value || "Research dossier";
  const title = state.jobContext.title || "Research artifact";
  const content = state.messages
    .map(m => `**${m.role === "user" ? "User" : (m.model || "Assistant")}:**\n${m.content}`)
    .join("\n\n---\n\n");

  const r = await api("/api/research/artifacts", "POST", {
    title: `${title} — ${outputType}`,
    artifact_type: outputType.toLowerCase().replaceAll(" ", "_"),
    content,
    session_id: state.selectedSessionId,
    meta: { jobContext: state.jobContext },
  });
  if (!r.ok) { showToast("Save failed", "warn"); return; }
  showToast(`Saved as ${outputType}`, "good");
  await loadArtifacts();
  switchTab("artifacts");
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function renderChat() {
  const feed = qs("#chatFeed"); if (!feed) return;
  if (!state.messages.length) {
    feed.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty-icon">🔍</div>
        <div class="chat-empty-title">Research Core</div>
        <p>Fill in the job definition, then start a job or ask a question directly.<br>
        The model will search the web and build structured responses.</p>
      </div>`;
    return;
  }
  feed.innerHTML = state.messages.map(msg => {
    const isUser = msg.role === "user";
    return `
      <div class="chat-msg ${isUser ? "chat-msg--user" : "chat-msg--assistant"}">
        <div class="chat-msg-head">${esc(isUser ? "You" : (msg.model || "Research model"))}</div>
        <div class="chat-msg-body">${isUser ? `<p>${esc(msg.content)}</p>` : renderMarkdown(msg.content)}</div>
      </div>`;
  }).join("");
  feed.scrollTop = feed.scrollHeight;
}

async function sendMessage(prompt) {
  if (!prompt.trim()) return;
  if (!state.selectedModels.length) { showToast("Select at least one model", "warn"); return; }
  if (state.sending) return;

  // Create session if needed
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
    `/api/research/sessions/${encodeURIComponent(state.selectedSessionId)}/messages`,
    "POST",
    {
      prompt,
      mode: "single",
      selected_models: state.selectedModels,
      job_context: state.jobContext,
    }
  );

  state.sending = false;
  if (sendBtn) sendBtn.disabled = false;
  if (statusEl) statusEl.textContent = "";

  if (!r.ok) { showToast("Send failed", "warn"); return; }

  state.messages.push({
    role: "assistant",
    content: r.body?.content || "",
    model: r.body?.model || "",
  });
  renderChat();

  // Update session title
  const session = state.sessions.find(s => s.id === state.selectedSessionId);
  if (session && session.title === "Research session") {
    session.title = prompt.slice(0, 60);
    renderSessionList();
  }
}

// ── Job form → prompt builder ─────────────────────────────────────────────────

function buildJobPrompt() {
  const ctx = state.jobContext;
  const parts = [];
  if (ctx.title)      parts.push(`**Research job:** ${ctx.title}`);
  if (ctx.brief)      parts.push(`**Brief:** ${ctx.brief}`);
  if (ctx.goal)       parts.push(`**Goal:** ${ctx.goal}`);
  if (ctx.constraints) parts.push(`**Constraints:** ${ctx.constraints}`);
  parts.push(`**Output type:** ${ctx.outputType}`);
  parts.push(`**Mode:** ${ctx.jobMode}`);
  if (ctx.learningObjective) parts.push(`**Learning objective:** ${ctx.learningObjective}`);
  if (ctx.failurePattern) parts.push(`**Failure pattern to correct:** ${ctx.failurePattern}`);
  parts.push(`\nBased on the above, conduct the research. Use web_search to find real sources. Preserve contradictions. Cite sources. Produce a structured ${ctx.outputType.toLowerCase()}.`);
  return parts.join("\n\n");
}

function readJobForm() {
  const get = id => qs(`#${id}`)?.value.trim() || "";
  state.jobContext = {
    title:                get("jobTitle"),
    brief:                get("brief"),
    goal:                 get("goal"),
    constraints:          get("constraints"),
    outputType:           get("outputType"),
    jobMode:              get("jobMode"),
    sourceClasses:        get("sourceClasses"),
    provenanceStrictness: get("provenanceStrictness"),
    contradictionHandling:get("contradictionHandling"),
    verificationDepth:    get("verificationDepth"),
    learningObjective:    get("learningObjective"),
    failurePattern:       get("failurePattern"),
    targetPortal:         get("targetPortal"),
    targetRole:           get("targetRole"),
  };
  persist();
}

function restoreJobForm() {
  const ctx = state.jobContext;
  const set = (id, v) => { const el = qs(`#${id}`); if (el && v) el.value = v; };
  set("jobTitle", ctx.title); set("brief", ctx.brief);
  set("goal", ctx.goal); set("constraints", ctx.constraints);
  set("outputType", ctx.outputType); set("sourceClasses", ctx.sourceClasses);
  set("provenanceStrictness", ctx.provenanceStrictness);
  set("contradictionHandling", ctx.contradictionHandling);
  set("verificationDepth", ctx.verificationDepth);
  set("learningObjective", ctx.learningObjective);
  set("failurePattern", ctx.failurePattern);
  set("targetPortal", ctx.targetPortal);
  set("targetRole", ctx.targetRole);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function switchTab(tab) {
  state.activeTab = tab;
  qsa(".rc-tab").forEach(btn => btn.classList.toggle("rc-tab--active", btn.dataset.tab === tab));
  qs("#tabJob")?.style      && (qs("#tabJob").style.display       = tab === "job"       ? "block" : "none");
  qs("#tabChat")?.style     && (qs("#tabChat").style.display      = tab === "chat"      ? "flex"  : "none");
  qs("#tabArtifacts")?.style && (qs("#tabArtifacts").style.display = tab === "artifacts" ? "block" : "none");
}

// ── Bind events ───────────────────────────────────────────────────────────────

function bindEvents() {
  // Tab switching
  qsa(".rc-tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  // Job form → live sync
  qs("#jobForm")?.addEventListener("input", readJobForm);
  qs("#jobForm")?.addEventListener("change", readJobForm);

  // Segment buttons (job mode)
  qsa(".segment-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".segment-group");
      qsa(".segment-btn", group).forEach(b => b.classList.remove("segment-btn--active"));
      btn.classList.add("segment-btn--active");
      const hiddenId = group.dataset.hidden;
      const hidden = qs(`#${hiddenId}`);
      if (hidden) { hidden.value = btn.dataset.value; readJobForm(); }
    });
  });

  // Start job button
  qs("#startJobBtn")?.addEventListener("click", async () => {
    readJobForm();
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
  });

  // New session button
  qs("#newSessionBtn")?.addEventListener("click", async () => {
    state.selectedSessionId = null;
    state.messages = [];
    renderChat();
    renderSessionList();
    showToast("New session — fill in job details and start", "good");
    switchTab("job");
  });

  // Direct chat send
  qs("#sendBtn")?.addEventListener("click", () => {
    const input = qs("#chatInput");
    const text = input?.value.trim();
    if (!text) return;
    if (input) input.value = "";
    sendMessage(text);
  });
  qs("#chatInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); qs("#sendBtn")?.click(); }
  });

  // Save as artifact
  qs("#saveArtifactBtn")?.addEventListener("click", saveCurrentChatAsArtifact);

  // Artifact modal close
  qs("#artifactModalClose")?.addEventListener("click", () => {
    const m = qs("#artifactModal"); if (m) m.style.display = "none";
  });
  qs("#artifactModal")?.addEventListener("click", e => {
    if (e.target === qs("#artifactModal")) qs("#artifactModal").style.display = "none";
  });

  // Knowledge object cards in left rail
  qsa(".object-card").forEach(card => {
    card.addEventListener("click", () => {
      const typeMap = {
        "dossier": "Research dossier",
        "evidence-chain": "Evidence chain",
        "synthesis": "Synthesis notebook",
        "eval": "Eval pack",
        "training": "Training pack",
        "source-stack": "Research dossier",
      };
      const t = typeMap[card.dataset.object];
      if (t && qs("#outputType")) { qs("#outputType").value = t; readJobForm(); }
      switchTab("job");
      showToast(`Output type set to: ${t || "dossier"}`, "good");
    });
  });

  // Resize handle
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
  handle.addEventListener("mousedown", e => {
    dragging = true; startY = e.clientY; startH = feed.getBoundingClientRect().height;
    document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none"; e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const h = Math.max(200, Math.min(900, startH + (e.clientY - startY)));
    feed.style.minHeight = h + "px"; feed.style.maxHeight = h + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return; dragging = false;
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height));
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  restoreJobForm();
  switchTab("job");
  bindEvents();
  await Promise.all([loadModels(), loadSessions(), loadArtifacts()]);
}

document.addEventListener("DOMContentLoaded", init);
