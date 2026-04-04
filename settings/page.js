const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const KRL_LAYERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const KRL_LABELS = {
  A:"Epistemic base", B:"Intake classifier", C:"Multiscale workspace", D:"Evidence ledger",
  E:"Option lattice", F:"Backtracking", G:"Curiosity", H:"Critical audit",
  I:"Work offloading", J:"Artifact engine", K:"Rule promotion", L:"Portability"
};
const PROVIDER_BADGES = { groq:"badge-groq", openrouter:"badge-openrouter", ollama:"badge-ollama" };
const SURFACES = ["home","lorecore","pipeline"];
const SURFACE_LABELS = { home:"Home", lorecore:"LoreCore", pipeline:"Pipeline" };

const KRL_PRESETS = {
  chat:       ["A","B","G"],
  research:   ["A","B","C","D","G","H"],
  planning:   ["A","B","C","D","E","F","H"],
  reflection: ["A","D","G","H","K"],
  full:       [...KRL_LAYERS],
};

const state = {
  models: [],
  settings: {},
  dirty: false,
  modelChanges: {},
  apiKeys: {},
  modelReasoning: {},
  customLayers: [],
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

async function loadAll() {
  setChip("#globalStatusChip", "Loading", "status-chip--warn");
  const [modelsR, settingsR] = await Promise.all([
    api("/api/model-pool/models"),
    api("/api/settings"),
  ]);
  if (modelsR.ok) {
    const items = Array.isArray(modelsR.body?.items) ? modelsR.body.items
                : Array.isArray(modelsR.body) ? modelsR.body : [];
    state.models = items.filter(m => m.runtime_driver === "openai_api");
  }
  if (settingsR.ok && settingsR.body) {
    state.settings = settingsR.body;
    state.models.forEach(m => {
      const notes = m.notes || "";
      const keyMatch = notes.match(/api_key=(\S+)/);
      if (keyMatch && keyMatch[1] !== "ollama") state.apiKeys[m.provider] = keyMatch[1];
    });
    // Migrate old flat reasoning shape to new per-surface shape
    const raw = settingsR.body.model_reasoning || {};
    state.modelReasoning = {};
    for (const [alias, val] of Object.entries(raw)) {
      if (val && (val.home || val.lorecore || val.pipeline)) {
        state.modelReasoning[alias] = val; // already new shape
      } else if (val && (val.mode || val.krlLayers)) {
        // migrate old shape — apply to all surfaces
        state.modelReasoning[alias] = {
          home: { ...val },
          lorecore: { ...val },
          pipeline: { ...val },
        };
      }
    }
    state.customLayers = settingsR.body.custom_layers || [];
  }
  renderAll();
  setChip("#globalStatusChip", "Saved", "status-chip--good");
}

function renderAll() {
  renderRoster();
  renderDefaults();
  renderPolicies();
  renderReasoning();
  renderCounts();
}

function groupByProvider(models) {
  const groups = {};
  for (const m of models) {
    const p = m.provider || "unknown";
    if (!groups[p]) groups[p] = [];
    groups[p].push(m);
  }
  return groups;
}

// ── Roster ────────────────────────────────────────────────────────────────────

function renderRoster() {
  const container = qs("#providerGroups"); if (!container) return;
  const groups = groupByProvider(state.models);
  if (!Object.keys(groups).length) {
    container.innerHTML = `<div style="color:var(--muted);padding:20px;">No cloud models loaded.</div>`;
    return;
  }
  container.innerHTML = Object.entries(groups).map(([provider, models]) => {
    const badge = PROVIDER_BADGES[provider] || "badge-custom";
    const apiKey = state.apiKeys[provider] || "";
    return `
      <div class="provider-group" data-provider="${esc(provider)}">
        <div class="provider-group-header">
          <div class="provider-group-title">
            <span class="provider-badge ${badge}">${esc(provider)}</span>
            <span>${models.length} model${models.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="provider-key-row">
            <span class="soft">API key</span>
            <input class="input api-key-input" type="password" data-provider="${esc(provider)}"
              value="${esc(apiKey)}"
              placeholder="${provider === "ollama" ? "ollama (no key needed)" : "sk-..."}" />
            <button class="button button--small save-key-btn" data-provider="${esc(provider)}">Save key</button>
          </div>
          <button class="button button--small add-model-btn" data-provider="${esc(provider)}">+ Add model</button>
        </div>
        <div class="model-table">
          <div class="model-row header">
            <div>Model</div><div>Alias</div><div>Enabled</div>
            <div>Home</div><div>LoreCore</div><div>Pipeline</div><div></div>
          </div>
          ${models.map(m => {
            const surfaces = parseSurfaces(m.surface_allowlist);
            return `
              <div class="model-row" data-model-id="${esc(m.public_id)}">
                <div><div class="model-name">${esc(m.name || m.alias)}</div></div>
                <div><div class="model-alias">${esc(m.alias)}</div></div>
                <div>
                  <label class="toggle-switch">
                    <input type="checkbox" class="model-enabled-toggle" data-id="${esc(m.public_id)}" ${m.enabled ? "checked" : ""} />
                    <div class="toggle-track"></div>
                    <div class="toggle-thumb"></div>
                  </label>
                </div>
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
                <div>
                  <button class="button button--small button--danger remove-model-btn" data-id="${esc(m.public_id)}">✕</button>
                </div>
              </div>`;
          }).join("")}
        </div>
        <div class="add-model-row" id="add-model-form-${esc(provider)}" style="display:none;">
          <div class="form-grid-3" style="margin-bottom:8px;">
            <label class="inline-field">
              <span class="soft">Display name</span>
              <input class="input" id="am_name_${esc(provider)}" placeholder="Daily Driver · Llama 70B" />
            </label>
            <label class="inline-field">
              <span class="soft">Alias</span>
              <input class="input" id="am_alias_${esc(provider)}" placeholder="groq_llama33_70b" />
            </label>
            <label class="inline-field">
              <span class="soft">Model ID</span>
              <input class="input" id="am_modelid_${esc(provider)}" placeholder="llama-3.3-70b-versatile" />
            </label>
          </div>
          <div class="button-row">
            <button class="button cancel-add-model-btn" data-provider="${esc(provider)}">Cancel</button>
            <button class="button button--primary confirm-add-model-btn" data-provider="${esc(provider)}">Add model</button>
          </div>
        </div>
      </div>`;
  }).join("");
  bindRosterEvents();
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function renderDefaults() {
  const s = state.settings;
  const modeEl = qs("#defaultMode");
  if (modeEl && s.default_home_mode) modeEl.value = s.default_home_mode;
  const container = qs("#defaultModelsList"); if (!container) return;
  const defaults = s.default_models || [];
  container.innerHTML = state.models.map(m => `
    <label class="check-chip ${defaults.includes(m.alias) ? "active" : ""}">
      <input type="checkbox" class="default-model-cb" value="${esc(m.alias)}" ${defaults.includes(m.alias) ? "checked" : ""} />
      ${esc(m.name || m.alias)}
    </label>
  `).join("");
  qsa(".check-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const cb = chip.querySelector("input");
      cb.checked = !cb.checked;
      chip.classList.toggle("active", cb.checked);
      markDirty();
    });
  });
}

// ── Policies ──────────────────────────────────────────────────────────────────

function renderPolicies() {
  const p = state.settings.model_panel_policies || {};
  const i = p.interactive || {};
  const prod = p.production || {};
  const set = (id, v) => {
    const el = qs(`#${id}`); if (!el || v == null) return;
    if (el.type === "checkbox") el.checked = Boolean(v); else el.value = v;
  };
  set("pol_hot", i.reserved_hot_slots ?? 1);
  set("pol_support", i.max_active_support ?? 2);
  set("pol_participants", i.max_selected_participants ?? 8);
  set("pol_diversity", i.family_diversity_required ?? false);
  set("pol_quality", prod.quality_over_speed ?? true);
  set("pol_loaded", prod.max_loaded_total ?? 3);
  set("pol_families", prod.minimum_distinct_families ?? 3);
  set("pol_longjobs", prod.allow_long_running_jobs ?? true);
  set("pol_rounds", prod.panel_rounds ?? 2);
}

// ── Reasoning ─────────────────────────────────────────────────────────────────

function getReasoningCfg(alias, surface) {
  const m = state.modelReasoning[alias];
  if (!m) return { mode: "none", preset: "", krlLayers: [] };
  if (m[surface]) return m[surface];
  return { mode: "none", preset: "", krlLayers: [] };
}

function setReasoningCfg(alias, surface, cfg) {
  if (!state.modelReasoning[alias]) {
    state.modelReasoning[alias] = { home: {mode:"none",preset:"",krlLayers:[]}, lorecore: {mode:"none",preset:"",krlLayers:[]}, pipeline: {mode:"none",preset:"",krlLayers:[]} };
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
          <p class="muted" style="margin:4px 0 0;font-size:12px;">Define reusable prompt layers. Assign them to any model below.</p>
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
      const activeLayers = cfg.krlLayers || [];
      return `
        <div class="reasoning-surface-col">
          ${renderPresetSelect(m.alias, surf, cfg)}
          ${renderKrlChips(m.alias, surf, activeLayers, isNone)}
        </div>`;
    }).join("");

    return `
      <div class="reasoning-row" data-alias="${esc(m.alias)}">
        <div class="reasoning-model-col">
          <div class="reasoning-model-name">${esc(m.name || m.alias)}</div>
          <div class="reasoning-model-provider">${esc(m.provider)} · ${esc(m.alias)}</div>
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

  // Preset dropdowns — one per surface per model
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
      // Re-render just the chips for this surface column
      const row = qs(`.reasoning-row[data-alias="${CSS.escape(alias)}"]`);
      if (row) {
        const col = qsa(".reasoning-surface-col", row).find(c => c.querySelector(`[data-surface="${surface}"]`));
        if (col) {
          const chipsWrap = col.querySelector(".layer-chips");
          if (chipsWrap) {
            const isNone = cfg.mode === "none";
            chipsWrap.outerHTML = renderKrlChips(alias, surface, cfg.krlLayers, isNone);
            bindChipEvents(row);
          }
        }
      }
    });
  });

  // KRL chip toggles
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

// ── Roster events ─────────────────────────────────────────────────────────────

function bindRosterEvents() {
  qsa(".model-enabled-toggle").forEach(cb => {
    cb.addEventListener("change", () => {
      if (!state.modelChanges[cb.dataset.id]) state.modelChanges[cb.dataset.id] = {};
      state.modelChanges[cb.dataset.id].enabled = cb.checked;
      markDirty();
    });
  });

  qsa(".surface-check-input").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      const surface = cb.dataset.surface;
      const model = state.models.find(m => m.public_id === id);
      if (!model) return;
      let surfaces = parseSurfaces(model.surface_allowlist);
      if (cb.checked && !surfaces.includes(surface)) surfaces.push(surface);
      if (!cb.checked) surfaces = surfaces.filter(s => s !== surface);
      model.surface_allowlist = surfaces;
      if (!state.modelChanges[id]) state.modelChanges[id] = {};
      state.modelChanges[id].surface_allowlist = surfaces;
      markDirty();
    });
  });

  qsa(".save-key-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.provider;
      const input = qs(`.api-key-input[data-provider="${provider}"]`);
      const key = input?.value.trim() || "";
      state.apiKeys[provider] = key;
      const providerModels = state.models.filter(m => m.provider === provider);
      for (const m of providerModels) {
        const base = (m.notes || "").replace(/api_key=\S+/g, "").trim();
        await api(`/api/model-pool/models/${m.public_id}`, { method: "PATCH", body: { notes: `${base} api_key=${key}`.trim() } });
      }
      showToast(`API key saved for ${provider}`, "good");
    });
  });

  qsa(".remove-model-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const model = state.models.find(m => m.public_id === id);
      if (!confirm(`Remove "${model?.name || id}"?`)) return;
      const r = await api(`/api/model-pool/models/${id}`, { method: "DELETE" });
      if (!r.ok) { showToast(`Delete failed: ${r.status}`, "warn"); return; }
      state.models = state.models.filter(m => m.public_id !== id);
      renderAll();
      showToast("Model removed", "warn");
    });
  });

  qsa(".add-model-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const form = qs(`#add-model-form-${btn.dataset.provider}`);
      if (form) form.style.display = form.style.display === "none" ? "block" : "none";
    });
  });

  qsa(".cancel-add-model-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const form = qs(`#add-model-form-${btn.dataset.provider}`);
      if (form) form.style.display = "none";
    });
  });

  qsa(".confirm-add-model-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.provider;
      const name = qs(`#am_name_${provider}`)?.value.trim() || "";
      const alias = qs(`#am_alias_${provider}`)?.value.trim() || "";
      const modelId = qs(`#am_modelid_${provider}`)?.value.trim() || "";
      if (!name || !alias) { showToast("Name and alias required", "warn"); return; }
      const apiKey = state.apiKeys[provider] || "";
      const r = await api("/api/model-pool/models", {
        method: "POST",
        body: { alias, name, provider, runtime_driver: "openai_api", enabled: true,
                surface_allowlist: ["home","lorecore"], notes: `api_key=${apiKey} model_id=${modelId}` },
      });
      if (!r.ok) { showToast(`Create failed: ${r.status}`, "warn"); return; }
      state.models.push(r.body);
      const form = qs(`#add-model-form-${provider}`);
      if (form) form.style.display = "none";
      renderAll();
      showToast(`${name} added`, "good");
    });
  });
}

// ── Provider form ─────────────────────────────────────────────────────────────

function bindProviderForm() {
  qs("#addProviderBtn")?.addEventListener("click", () => {
    const form = qs("#addProviderForm");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
  });
  qs("#cancelProviderBtn")?.addEventListener("click", () => {
    const form = qs("#addProviderForm");
    if (form) form.style.display = "none";
  });
  qs("#saveProviderBtn")?.addEventListener("click", async () => {
    const provider = qs("#np_id")?.value.trim().toLowerCase() || "";
    const name = qs("#np_name")?.value.trim() || "";
    const url = qs("#np_url")?.value.trim() || "";
    const key = qs("#np_key")?.value.trim() || "";
    if (!provider || !name) { showToast("Provider ID and name required", "warn"); return; }
    state.apiKeys[provider] = key;
    const updatedKeys = { ...(state.settings.api_keys || {}), [provider]: key };
    const updatedEndpoints = { ...(state.settings.provider_endpoints || {}), [provider]: url };
    await api("/api/settings", { method: "PUT", body: { values: { ...state.settings, api_keys: updatedKeys, provider_endpoints: updatedEndpoints } } });
    const form = qs("#addProviderForm");
    if (form) form.style.display = "none";
    ["np_id","np_name","np_url","np_key"].forEach(id => { const el = qs(`#${id}`); if (el) el.value = ""; });
    showToast(`Provider ${name} added`, "good");
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

async function saveAll() {
  setChip("#globalStatusChip", "Saving…", "status-chip--warn");
  let ok = true;

  for (const [id, changes] of Object.entries(state.modelChanges)) {
    const r = await api(`/api/model-pool/models/${id}`, { method: "PATCH", body: changes });
    if (!r.ok) { ok = false; showToast(`Model update failed: ${r.status}`, "warn"); }
  }
  state.modelChanges = {};

  const defaultModels = qsa(".default-model-cb:checked").map(cb => cb.value);
  const defaultMode = qs("#defaultMode")?.value || "single";
  const policies = {
    interactive: {
      reserved_hot_slots: parseInt(qs("#pol_hot")?.value) || 1,
      max_active_support: parseInt(qs("#pol_support")?.value) || 2,
      max_selected_participants: parseInt(qs("#pol_participants")?.value) || 8,
      family_diversity_required: qs("#pol_diversity")?.checked || false,
    },
    production: {
      quality_over_speed: qs("#pol_quality")?.checked ?? true,
      max_loaded_total: parseInt(qs("#pol_loaded")?.value) || 3,
      minimum_distinct_families: parseInt(qs("#pol_families")?.value) || 3,
      allow_long_running_jobs: qs("#pol_longjobs")?.checked ?? true,
      panel_rounds: parseInt(qs("#pol_rounds")?.value) || 2,
    },
  };

  const settingsPayload = {
    ...state.settings,
    default_models: defaultModels,
    default_home_mode: defaultMode,
    model_panel_policies: policies,
    model_reasoning: state.modelReasoning,
    custom_layers: state.customLayers,
    api_keys: state.apiKeys,
  };

  const r = await api("/api/settings", { method: "PUT", body: { values: settingsPayload } });
  if (!r.ok) { ok = false; showToast(`Settings save failed: ${r.status}`, "warn"); }
  else state.settings = settingsPayload;

  state.dirty = false;
  setChip("#globalStatusChip", ok ? "Saved" : "Save errors", ok ? "status-chip--good" : "status-chip--warn");
  if (ok) showToast("All changes saved", "good");
}

// ── Counts ────────────────────────────────────────────────────────────────────

function renderCounts() {
  const el = qs("#snavCounts"); if (!el) return;
  const groups = groupByProvider(state.models);
  el.innerHTML = Object.entries(groups).map(([p, ms]) =>
    `<div>${esc(p)}: ${ms.filter(m => m.enabled).length}/${ms.length}</div>`
  ).join("") + `<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px;">Total active: ${state.models.filter(m => m.enabled).length}</div>`;
}

// ── Nav + init ────────────────────────────────────────────────────────────────

function bindNav() {
  qsa(".snav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".snav-item").forEach(b => b.classList.remove("snav-item--active"));
      qsa(".settings-section").forEach(s => s.classList.remove("active"));
      btn.classList.add("snav-item--active");
      const section = qs(`#section-${btn.dataset.section}`);
      if (section) section.classList.add("active");
    });
  });
}

function bindPolicyChanges() {
  ["pol_hot","pol_support","pol_participants","pol_diversity","pol_quality","pol_loaded","pol_families","pol_longjobs","pol_rounds"].forEach(id => {
    const el = qs(`#${id}`);
    el?.addEventListener("change", markDirty);
    el?.addEventListener("input", markDirty);
  });
  qs("#defaultMode")?.addEventListener("change", markDirty);
}

function init() {
  bindNav();
  bindProviderForm();
  bindPolicyChanges();
  qs("#saveAllBtn")?.addEventListener("click", saveAll);
  loadAll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
