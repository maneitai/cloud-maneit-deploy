const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const KRL_LAYERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const KRL_LABELS = {
  A:"Epistemic base", B:"Intake classifier", C:"Multiscale workspace", D:"Evidence ledger",
  E:"Option lattice", F:"Backtracking", G:"Curiosity", H:"Critical audit",
  I:"Work offloading", J:"Artifact engine", K:"Rule promotion", L:"Portability"
};
const KRL_PRESETS = {
  chat:       ["A","B","G"],
  research:   ["A","B","C","D","G","H"],
  planning:   ["A","B","C","D","E","F","H"],
  reflection: ["A","D","G","H","K"],
  full:       [...KRL_LAYERS],
};
const SURFACES = ["home","lorecore","pipeline"];
const SURFACE_LABELS = { home:"Home", lorecore:"LoreCore", pipeline:"Pipeline" };
const DRIVER_LABELS = { llamacpp:"llama.cpp", systemd_openai:"llama.cpp", ollama:"Ollama", openai_api:"Cloud" };

const state = {
  models: [],
  settings: {},
  modelChanges: {},
  modelReasoning: {},
  customLayers: [],
  runtimeEvents: [],
  dirty: false,
};

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const uid = () => Math.random().toString(36).slice(2,10);

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2800);
}

function setChip(id, text, cls) {
  const el = qs(id); if (!el) return;
  el.textContent = text; el.className = `status-chip ${cls}`;
}

function markDirty() {
  state.dirty = true;
  setChip("#globalStatusChip", "Unsaved changes", "status-chip--warn");
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
  } catch (e) { return { ok: false, status: 0, error: String(e) }; }
}

function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

function isLocalModel(m) {
  const driver = (m.runtime_driver || m.provider || "").toLowerCase();
  return driver === "systemd_openai" || driver === "llamacpp" || driver === "ollama";
}

function getDriverLabel(m) {
  const driver = (m.runtime_driver || "").toLowerCase();
  const provider = (m.provider || "").toLowerCase();
  if (driver === "systemd_openai" || provider === "llamacpp") return "llama.cpp";
  if (provider === "ollama" || driver === "ollama") return "Ollama";
  return driver || provider || "local";
}

function getRuntimeState(m) {
  const s = (m.runtime_state || m.state || "").toLowerCase();
  if (s === "available" || s === "loaded" || s === "active" || s === "warm") return "available";
  if (s === "loading" || s === "warming") return "loading";
  if (s === "disabled") return "disabled";
  return "idle";
}

// ── Load all ──────────────────────────────────────────────────────────────────

async function loadAll() {
  setChip("#globalStatusChip", "Loading", "status-chip--warn");
  const [modelsR, settingsR, eventsR] = await Promise.all([
    api("/api/model-pool/models?sync=false"),
    api("/api/settings"),
    api("/api/model-pool/runtime-events?limit=30"),
  ]);

  if (modelsR.ok) {
    const items = Array.isArray(modelsR.body?.items) ? modelsR.body.items
                : Array.isArray(modelsR.body) ? modelsR.body : [];
    state.models = items.filter(isLocalModel);
  }

  if (settingsR.ok && settingsR.body) {
    state.settings = settingsR.body;
    const raw = settingsR.body.model_reasoning || {};
    state.modelReasoning = {};
    for (const [alias, val] of Object.entries(raw)) {
      if (val && (val.home || val.lorecore || val.pipeline)) {
        state.modelReasoning[alias] = val;
      } else if (val && (val.mode || val.krlLayers)) {
        state.modelReasoning[alias] = {
          home: { ...val }, lorecore: { ...val }, pipeline: { ...val },
        };
      }
    }
    state.customLayers = settingsR.body.custom_layers || [];
  }

  if (eventsR.ok) {
    state.runtimeEvents = Array.isArray(eventsR.body?.items) ? eventsR.body.items : [];
  }

  renderAll();
  setChip("#globalStatusChip", "Loaded", "status-chip--good");
}

async function syncPool() {
  setChip("#globalStatusChip", "Syncing…", "status-chip--warn");
  const r = await api("/api/model-pool/models?sync=true");
  if (!r.ok) { showToast("Sync failed", "warn"); return; }
  const items = Array.isArray(r.body?.items) ? r.body.items : [];
  state.models = items.filter(isLocalModel);
  renderModels();
  renderHero();
  showToast("Pool synced", "good");
  setChip("#globalStatusChip", "Synced", "status-chip--good");
}

function renderAll() {
  renderHero();
  renderModels();
  renderEvents();
  renderReasoning();
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function renderHero() {
  const available = state.models.filter(m => getRuntimeState(m) === "available").length;
  const total = state.models.length;
  const llamacpp = state.models.filter(m => getDriverLabel(m) === "llama.cpp").length;
  const ollama = state.models.filter(m => getDriverLabel(m) === "Ollama").length;
  const disabled = state.models.filter(m => !m.enabled).length;

  const set = (id, v) => { const el = qs(id); if (el) el.textContent = v; };
  set("#heroActive", available);
  set("#heroTotal", total);
  set("#heroLlamacpp", llamacpp);
  set("#heroOllama", ollama);
  set("#heroDisabled", disabled);
}

// ── Models ────────────────────────────────────────────────────────────────────

function groupByDriver(models) {
  const groups = {};
  for (const m of models) {
    const label = getDriverLabel(m);
    if (!groups[label]) groups[label] = [];
    groups[label].push(m);
  }
  return groups;
}

function renderModels() {
  const container = qs("#modelGroups"); if (!container) return;
  const groups = groupByDriver(state.models);

  if (!Object.keys(groups).length) {
    container.innerHTML = `<div style="color:var(--muted);padding:20px;">No local models found in pool.</div>`;
    return;
  }

  container.innerHTML = Object.entries(groups).map(([driver, models]) => {
    const available = models.filter(m => getRuntimeState(m) === "available").length;
    return `
      <div class="provider-group" data-driver="${esc(driver)}">
        <div class="provider-group-header">
          <div class="provider-group-title">
            <span class="provider-badge ${driver === "Ollama" ? "badge-ollama" : "badge-llamacpp"}">${esc(driver)}</span>
            <span>${models.length} models · ${available} available</span>
          </div>
          ${driver === "llama.cpp" ? `
            <div style="display:flex;gap:8px;">
              <button class="button button--small" id="loadAllBtn_${esc(driver)}">Load all</button>
              <button class="button button--small button--danger" id="unloadAllBtn_${esc(driver)}">Unload all</button>
            </div>` : `<span class="soft" style="font-size:12px;">Ollama manages load/unload automatically</span>`}
        </div>
        <div class="model-table">
          <div class="model-row header">
            <div>Model</div><div>Alias</div><div>State</div>
            <div>Home</div><div>LoreCore</div><div>Pipeline</div><div>Actions</div>
          </div>
          ${models.map(m => {
            const rState = getRuntimeState(m);
            const surfaces = parseSurfaces(m.surface_allowlist);
            const stateColor = rState === "available" ? "var(--good)" : rState === "loading" ? "var(--warn)" : rState === "disabled" ? "var(--bad)" : "var(--muted)";
            const isOllama = driver === "Ollama";
            return `
              <div class="model-row" data-model-id="${esc(m.public_id)}">
                <div>
                  <div class="model-name">${esc(m.name || m.alias)}</div>
                  ${m.keep_loaded ? `<div style="font-size:10px;color:var(--accent);margin-top:2px;">📌 pinned</div>` : ""}
                </div>
                <div><div class="model-alias">${esc(m.alias)}</div></div>
                <div><span style="font-size:12px;font-weight:700;color:${stateColor};">${rState}</span></div>
                ${SURFACES.map(surf => `
                  <div>
                    <label class="surface-check">
                      <input type="checkbox" class="surface-check-input"
                        data-id="${esc(m.public_id)}" data-surface="${surf}"
                        ${surfaces.includes(surf) ? "checked" : ""} />
                      <span>${SURFACE_LABELS[surf]}</span>
                    </label>
                  </div>
                `).join("")}
                <div class="control-row">
                  ${!isOllama ? (rState === "available"
                    ? `<button class="button button--small button--danger model-action-btn" data-id="${esc(m.public_id)}" data-action="unload">Unload</button>`
                    : `<button class="button button--small button--primary model-action-btn" data-id="${esc(m.public_id)}" data-action="load">Load</button>`)
                    : `<span class="soft" style="font-size:11px;">auto</span>`}
                  ${m.enabled
                    ? `<button class="button button--small button--danger model-action-btn" data-id="${esc(m.public_id)}" data-action="disable">Disable</button>`
                    : `<button class="button button--small model-action-btn" data-id="${esc(m.public_id)}" data-action="enable">Enable</button>`}
                  ${!isOllama ? (m.keep_loaded
                    ? `<button class="button button--small model-action-btn" data-id="${esc(m.public_id)}" data-action="unpin">Unpin</button>`
                    : `<button class="button button--small model-action-btn" data-id="${esc(m.public_id)}" data-action="pin">Pin</button>`)
                    : ""}
                </div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }).join("");

  bindModelEvents();
}

function bindModelEvents() {
  // Surface checkboxes
  qsa(".surface-check-input").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      const surf = cb.dataset.surface;
      const model = state.models.find(m => m.public_id === id);
      if (!model) return;
      let surfaces = parseSurfaces(model.surface_allowlist);
      if (cb.checked && !surfaces.includes(surf)) surfaces.push(surf);
      if (!cb.checked) surfaces = surfaces.filter(s => s !== surf);
      model.surface_allowlist = surfaces;
      if (!state.modelChanges[id]) state.modelChanges[id] = {};
      state.modelChanges[id].surface_allowlist = surfaces;
      markDirty();
    });
  });

  // Model action buttons
  qsa(".model-action-btn").forEach(btn => {
    btn.addEventListener("click", () => handleModelAction(btn.dataset.id, btn.dataset.action));
  });
}

async function handleModelAction(id, action) {
  const model = state.models.find(m => m.public_id === id);
  if (!model) return;
  const backendId = model.public_id || id;

  let result;
  switch (action) {
    case "load":
      result = await api(`/api/model-pool/models/${encodeURIComponent(backendId)}/load`, { method: "POST", body: { leased_to: "state-surface" } });
      break;
    case "unload":
      result = await api(`/api/model-pool/models/${encodeURIComponent(backendId)}/unload`, { method: "POST" });
      break;
    case "enable":
      result = await api(`/api/model-pool/models/${encodeURIComponent(backendId)}`, { method: "PATCH", body: { enabled: true } });
      if (result.ok) model.enabled = true;
      break;
    case "disable":
      result = await api(`/api/model-pool/models/${encodeURIComponent(backendId)}`, { method: "PATCH", body: { enabled: false } });
      if (result.ok) model.enabled = false;
      break;
    case "pin":
      result = await api(`/api/model-pool/models/${encodeURIComponent(backendId)}`, { method: "PATCH", body: { keep_loaded: true } });
      if (result.ok) model.keep_loaded = true;
      break;
    case "unpin":
      result = await api(`/api/model-pool/models/${encodeURIComponent(backendId)}`, { method: "PATCH", body: { keep_loaded: false } });
      if (result.ok) model.keep_loaded = false;
      break;
    default:
      return;
  }

  if (!result?.ok) { showToast(`${action} failed`, "warn"); return; }
  showToast(`${model.alias} ${action} OK`, "good");

  // Refresh state after load/unload
  if (action === "load" || action === "unload") {
    setTimeout(async () => {
      const r = await api("/api/model-pool/models?sync=false");
      if (r.ok) {
        const items = Array.isArray(r.body?.items) ? r.body.items : [];
        state.models = items.filter(isLocalModel);
        renderModels();
        renderHero();
      }
    }, 1500);
  } else {
    renderModels();
    renderHero();
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

function renderEvents() {
  const el = qs("#eventLog"); if (!el) return;
  if (!state.runtimeEvents.length) {
    el.innerHTML = `<div class="log-line">[STATE] No runtime events yet</div>`;
    return;
  }
  el.innerHTML = state.runtimeEvents.slice(0, 20).map(e => {
    const line = e.message || e.title || e.event || JSON.stringify(e);
    return `<div class="log-line">${esc(line)}</div>`;
  }).join("");
}

// ── Reasoning — identical to Settings ────────────────────────────────────────

function getReasoningCfg(alias, surface) {
  const m = state.modelReasoning[alias];
  if (!m) return { mode: "none", preset: "", krlLayers: [] };
  if (m[surface]) return m[surface];
  return { mode: "none", preset: "", krlLayers: [] };
}

function setReasoningCfg(alias, surface, cfg) {
  if (!state.modelReasoning[alias]) {
    state.modelReasoning[alias] = {
      home: {mode:"none",preset:"",krlLayers:[]},
      lorecore: {mode:"none",preset:"",krlLayers:[]},
      pipeline: {mode:"none",preset:"",krlLayers:[]},
    };
  }
  state.modelReasoning[alias][surface] = cfg;
}

function renderKrlChips(alias, surface, activeLayers, disabled = false) {
  return `<div class="layer-chips ${disabled ? "layer-chips--disabled" : ""}">
    ${KRL_LAYERS.map(l => `
      <span class="layer-chip ${activeLayers.includes(l) ? "active" : ""} ${disabled ? "layer-chip--dim" : ""}"
        data-alias="${esc(alias)}" data-surface="${esc(surface)}" data-layer="${l}"
        title="${esc(KRL_LABELS[l])}">${l}</span>
    `).join("")}
  </div>`;
}

function renderPresetSelect(alias, surface, cfg) {
  const isPreset = cfg.mode === "preset";
  const isNone = cfg.mode === "none" || !cfg.mode;
  return `<select class="select reasoning-preset" data-alias="${esc(alias)}" data-surface="${esc(surface)}" style="font-size:11px;">
    <option value="none" ${isNone ? "selected" : ""}>None</option>
    <option value="preset_chat" ${cfg.preset === "chat" && isPreset ? "selected" : ""}>Chat (A,B,G)</option>
    <option value="preset_research" ${cfg.preset === "research" && isPreset ? "selected" : ""}>Research</option>
    <option value="preset_planning" ${cfg.preset === "planning" && isPreset ? "selected" : ""}>Planning</option>
    <option value="preset_reflection" ${cfg.preset === "reflection" && isPreset ? "selected" : ""}>Reflection</option>
    <option value="preset_full" ${cfg.preset === "full" && isPreset ? "selected" : ""}>Full (A–L)</option>
  </select>`;
}

function renderReasoning() {
  const container = qs("#reasoningList"); if (!container) return;

  const libraryHtml = `
    <div class="custom-layer-library">
      <div class="custom-layer-library-head">
        <div>
          <div class="eyebrow">Custom layer library</div>
          <p class="muted" style="margin:4px 0 0;font-size:12px;">Shared with Settings. Changes here apply across all surfaces.</p>
        </div>
        <button class="button button--small button--primary" id="addCustomLayerBtn">+ New layer</button>
      </div>
      <div id="customLayerLibraryList">${renderCustomLayerLibrary()}</div>
    </div>
    <div class="reasoning-divider"></div>
    <div class="reasoning-surface-header">
      <div class="reasoning-model-col"></div>
      <div class="reasoning-surface-label" style="color:#ff9f9f;">Home Chat</div>
      <div class="reasoning-surface-label" style="color:#9fdfaf;">LoreCore</div>
      <div class="reasoning-surface-label" style="color:#ffbf7f;">Pipeline</div>
    </div>
  `;

  const modelsHtml = state.models.map(m => {
    const cols = SURFACES.map(surf => {
      const cfg = getReasoningCfg(m.alias, surf);
      const isNone = cfg.mode === "none" || !cfg.mode;
      return `
        <div class="reasoning-surface-col">
          ${renderPresetSelect(m.alias, surf, cfg)}
          ${renderKrlChips(m.alias, surf, cfg.krlLayers || [], isNone)}
        </div>`;
    }).join("");

    return `
      <div class="reasoning-row" data-alias="${esc(m.alias)}">
        <div class="reasoning-model-col">
          <div class="reasoning-model-name">${esc(m.name || m.alias)}</div>
          <div class="reasoning-model-provider">${esc(getDriverLabel(m))} · ${esc(m.alias)}</div>
        </div>
        ${cols}
      </div>`;
  }).join("");

  container.innerHTML = libraryHtml + modelsHtml;
  bindReasoningEvents();

  const applyBtn = qs("#applyReasoningBtn");
  if (applyBtn) {
    const fresh = applyBtn.cloneNode(true);
    applyBtn.parentNode.replaceChild(fresh, applyBtn);
    fresh.addEventListener("click", saveReasoningOnly);
  }
}

function renderCustomLayerLibrary() {
  if (!state.customLayers.length) {
    return `<div class="lib-placeholder muted" style="padding:10px 0;font-size:12px;">No custom layers yet.</div>`;
  }
  return state.customLayers.map(layer => `
    <div class="custom-layer-def" data-layer-id="${esc(layer.id)}">
      <div class="custom-layer-def-header">
        <span class="custom-layer-name-tag">${esc(layer.name)}</span>
        <div class="button-row">
          <button class="button button--small toggle-layer-def-btn" data-layer-id="${esc(layer.id)}">Edit</button>
          <button class="button button--small button--danger delete-layer-def-btn" data-layer-id="${esc(layer.id)}">✕</button>
        </div>
      </div>
      <div class="custom-layer-def-body" id="layer-def-body-${esc(layer.id)}" style="display:none;">
        <label class="inline-field" style="margin-bottom:8px;">
          <span class="soft">Layer name</span>
          <input class="input layer-name-input" data-layer-id="${esc(layer.id)}" value="${esc(layer.name)}" />
        </label>
        <label class="inline-field">
          <span class="soft">Prompt content</span>
          <textarea class="textarea layer-content-input" data-layer-id="${esc(layer.id)}" rows="6">${esc(layer.content)}</textarea>
        </label>
        <div class="button-row" style="margin-top:8px;">
          <button class="button button--small save-layer-def-btn" data-layer-id="${esc(layer.id)}">Save layer</button>
        </div>
      </div>
    </div>
  `).join("");
}

function bindReasoningEvents() {
  qs("#addCustomLayerBtn")?.addEventListener("click", () => {
    const newLayer = { id: uid(), name: "New layer", content: "" };
    state.customLayers.push(newLayer);
    markDirty();
    renderReasoning();
    const body = qs(`#layer-def-body-${newLayer.id}`);
    if (body) body.style.display = "block";
  });

  qsa(".toggle-layer-def-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = qs(`#layer-def-body-${btn.dataset.layerId}`);
      if (body) body.style.display = body.style.display === "none" ? "block" : "none";
    });
  });

  qsa(".save-layer-def-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.layerId;
      const layer = state.customLayers.find(l => l.id === id);
      if (!layer) return;
      const nameEl = qs(`.layer-name-input[data-layer-id="${id}"]`);
      const contentEl = qs(`.layer-content-input[data-layer-id="${id}"]`);
      if (nameEl) layer.name = nameEl.value.trim() || layer.name;
      if (contentEl) layer.content = contentEl.value;
      markDirty();
      renderReasoning();
      showToast("Layer saved — press Apply to persist", "good");
    });
  });

  qsa(".delete-layer-def-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.layerId;
      if (!confirm("Delete this layer?")) return;
      state.customLayers = state.customLayers.filter(l => l.id !== id);
      markDirty();
      renderReasoning();
    });
  });

  qsa(".reasoning-preset").forEach(sel => {
    sel.addEventListener("change", () => {
      const alias = sel.dataset.alias;
      const surface = sel.dataset.surface;
      const val = sel.value;
      const cfg = getReasoningCfg(alias, surface);
      if (val === "none") {
        cfg.mode = "none"; cfg.preset = ""; cfg.krlLayers = [];
      } else if (val.startsWith("preset_")) {
        const key = val.replace("preset_", "");
        cfg.mode = "preset"; cfg.preset = key;
        cfg.krlLayers = KRL_PRESETS[key] || [];
      }
      setReasoningCfg(alias, surface, cfg);
      markDirty();
      const row = qs(`.reasoning-row[data-alias="${CSS.escape(alias)}"]`);
      if (row) {
        const cols = qsa(".reasoning-surface-col", row);
        const idx = SURFACES.indexOf(surface);
        if (cols[idx]) {
          const chips = cols[idx].querySelector(".layer-chips");
          if (chips) {
            chips.outerHTML = renderKrlChips(alias, surface, cfg.krlLayers, cfg.mode === "none");
            bindChipEvents(row);
          }
        }
      }
    });
  });

  qsa(".reasoning-row").forEach(row => bindChipEvents(row));
}

function bindChipEvents(row) {
  qsa(".layer-chip:not(.layer-chip--dim)", row).forEach(chip => {
    chip.addEventListener("click", () => {
      const alias = chip.dataset.alias;
      const surface = chip.dataset.surface;
      const layer = chip.dataset.layer;
      const cfg = getReasoningCfg(alias, surface);
      const layers = cfg.krlLayers || [];
      const idx = layers.indexOf(layer);
      if (idx >= 0) layers.splice(idx, 1); else layers.push(layer);
      cfg.krlLayers = layers;
      cfg.mode = "preset";
      setReasoningCfg(alias, surface, cfg);
      chip.classList.toggle("active", layers.includes(layer));
      markDirty();
    });
  });
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveReasoningOnly() {
  const btn = qs("#applyReasoningBtn");
  if (btn) { btn.textContent = "Applying…"; btn.disabled = true; }
  const payload = { ...state.settings, model_reasoning: state.modelReasoning, custom_layers: state.customLayers };
  const r = await api("/api/settings", { method: "PUT", body: { values: payload } });
  if (btn) { btn.textContent = "Apply reasoning changes"; btn.disabled = false; }
  if (!r.ok) { showToast(`Apply failed: ${r.status}`, "warn"); return; }
  state.settings = { ...state.settings, model_reasoning: state.modelReasoning, custom_layers: state.customLayers };
  setChip("#globalStatusChip", "Saved", "status-chip--good");
  showToast("Reasoning changes applied", "good");
}

async function saveSurfaceChanges() {
  setChip("#globalStatusChip", "Saving…", "status-chip--warn");
  let ok = true;
  for (const [id, changes] of Object.entries(state.modelChanges)) {
    const r = await api(`/api/model-pool/models/${id}`, { method: "PATCH", body: changes });
    if (!r.ok) { ok = false; showToast(`Save failed for ${id}`, "warn"); }
  }
  state.modelChanges = {};
  state.dirty = false;
  setChip("#globalStatusChip", ok ? "Saved" : "Errors", ok ? "status-chip--good" : "status-chip--warn");
  if (ok) showToast("Surface assignments saved", "good");
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function bindNav() {
  qsa(".snav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".snav-item").forEach(b => b.classList.remove("snav-item--active"));
      qsa(".state-section").forEach(s => s.classList.remove("active"));
      btn.classList.add("snav-item--active");
      const section = qs(`#section-${btn.dataset.section}`);
      if (section) section.classList.add("active");
    });
  });
}

function bindTopButtons() {
  qs("#syncBtn")?.addEventListener("click", syncPool);
  qs("#saveAllBtn")?.addEventListener("click", saveSurfaceChanges);
  qs("#refreshEventsBtn")?.addEventListener("click", async () => {
    const r = await api("/api/model-pool/runtime-events?limit=30");
    if (r.ok) {
      state.runtimeEvents = Array.isArray(r.body?.items) ? r.body.items : [];
      renderEvents();
      showToast("Events refreshed", "good");
    }
  });
}

function init() {
  bindNav();
  bindTopButtons();
  loadAll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
