const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const KRL_LAYERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const KRL_LABELS = {
  A:"Epistemic base", B:"Intake classifier", C:"Multiscale workspace", D:"Evidence ledger",
  E:"Option lattice", F:"Backtracking", G:"Curiosity", H:"Critical audit",
  I:"Work offloading", J:"Artifact engine", K:"Rule promotion", L:"Portability"
};
const PROVIDER_BADGES = { groq:"badge-groq", openrouter:"badge-openrouter", ollama:"badge-ollama" };

const state = {
  models: [],
  settings: {},
  dirty: false,
  modelChanges: {},
  apiKeys: {},
  reasoningLayers: {},
};

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const escHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");

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
      if (keyMatch && keyMatch[1] !== "ollama") {
        state.apiKeys[m.provider] = keyMatch[1];
      }
    });
    state.reasoningLayers = settingsR.body.model_reasoning_layers || {};
  }
  renderAll();
  setChip("#globalStatusChip", "Saved", "status-chip--good");
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

function renderAll() {
  renderRoster();
  renderDefaults();
  renderPolicies();
  renderReasoning();
  renderCounts();
}

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
      <div class="provider-group" data-provider="${escHtml(provider)}">
        <div class="provider-group-header">
          <div class="provider-group-title">
            <span class="provider-badge ${badge}">${escHtml(provider)}</span>
            <span>${models.length} model${models.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="provider-key-row">
            <span class="soft">API key</span>
            <input class="input api-key-input" type="password" data-provider="${escHtml(provider)}"
              value="${escHtml(apiKey)}"
              placeholder="${provider === "ollama" ? "ollama (no key needed)" : "sk-..."}" />
            <button class="button button--small save-key-btn" data-provider="${escHtml(provider)}">Save key</button>
          </div>
          <button class="button button--small add-model-btn" data-provider="${escHtml(provider)}">+ Add model</button>
        </div>
        <div class="model-table">
          <div class="model-row header">
            <div>Model</div><div>Alias</div><div>Enabled</div><div>Home</div><div>LoreCore</div><div></div>
          </div>
          ${models.map(m => {
            const surfaces = Array.isArray(m.surface_allowlist) ? m.surface_allowlist
                           : (() => { try { return JSON.parse(m.surface_allowlist || "[]"); } catch { return []; } })();
            const inHome = surfaces.includes("home");
            const inLore = surfaces.includes("lorecore");
            return `
              <div class="model-row" data-model-id="${escHtml(m.public_id)}">
                <div><div class="model-name">${escHtml(m.name || m.alias)}</div></div>
                <div><div class="model-alias">${escHtml(m.alias)}</div></div>
                <div>
                  <label class="toggle-switch">
                    <input type="checkbox" class="model-enabled-toggle" data-id="${escHtml(m.public_id)}" ${m.enabled ? "checked" : ""} />
                    <div class="toggle-track"></div>
                    <div class="toggle-thumb"></div>
                  </label>
                </div>
                <div>
                  <label class="surface-check">
                    <input type="checkbox" class="surface-check-input" data-id="${escHtml(m.public_id)}" data-surface="home" ${inHome ? "checked" : ""} />
                    <span>Home</span>
                  </label>
                </div>
                <div>
                  <label class="surface-check">
                    <input type="checkbox" class="surface-check-input" data-id="${escHtml(m.public_id)}" data-surface="lorecore" ${inLore ? "checked" : ""} />
                    <span>LoreCore</span>
                  </label>
                </div>
                <div>
                  <button class="button button--small button--danger remove-model-btn" data-id="${escHtml(m.public_id)}">✕</button>
                </div>
              </div>`;
          }).join("")}
        </div>
        <div class="add-model-row" id="add-model-form-${escHtml(provider)}" style="display:none;">
          <div class="form-grid-3" style="margin-bottom:8px;">
            <label class="inline-field">
              <span class="soft">Display name</span>
              <input class="input" id="am_name_${escHtml(provider)}" placeholder="Daily Driver · Llama 70B" />
            </label>
            <label class="inline-field">
              <span class="soft">Alias</span>
              <input class="input" id="am_alias_${escHtml(provider)}" placeholder="groq_llama33_70b" />
            </label>
            <label class="inline-field">
              <span class="soft">Model ID</span>
              <input class="input" id="am_modelid_${escHtml(provider)}" placeholder="llama-3.3-70b-versatile" />
            </label>
          </div>
          <div class="button-row">
            <button class="button cancel-add-model-btn" data-provider="${escHtml(provider)}">Cancel</button>
            <button class="button button--primary confirm-add-model-btn" data-provider="${escHtml(provider)}">Add model</button>
          </div>
        </div>
      </div>`;
  }).join("");
  bindRosterEvents();
}

function renderDefaults() {
  const s = state.settings;
  const modeEl = qs("#defaultMode");
  if (modeEl && s.default_home_mode) modeEl.value = s.default_home_mode;
  const container = qs("#defaultModelsList"); if (!container) return;
  const defaults = s.default_models || [];
  container.innerHTML = state.models.map(m => `
    <label class="check-chip ${defaults.includes(m.alias) ? "active" : ""}">
      <input type="checkbox" class="default-model-cb" value="${escHtml(m.alias)}" ${defaults.includes(m.alias) ? "checked" : ""} />
      ${escHtml(m.name || m.alias)}
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

function renderReasoning() {
  const container = qs("#reasoningList"); if (!container) return;
  container.innerHTML = state.models.map(m => {
    const activeLayers = state.reasoningLayers[m.alias] || [];
    return `
      <div class="reasoning-row" data-alias="${escHtml(m.alias)}">
        <div>
          <div class="reasoning-model-name">${escHtml(m.name || m.alias)}</div>
          <div class="reasoning-model-provider">${escHtml(m.provider)} · ${escHtml(m.alias)}</div>
        </div>
        <div>
          <select class="select reasoning-preset" data-alias="${escHtml(m.alias)}">
            <option value="">Custom / none</option>
            <option value="chat">Chat (A, B, G)</option>
            <option value="research">Research (A, B, C, D, G, H)</option>
            <option value="planning">Planning (A, B, C, D, E, F, H)</option>
            <option value="reflection">Reflection (A, D, G, H, K)</option>
            <option value="full">Full KRL (A–L)</option>
          </select>
        </div>
        <div class="layer-chips">
          ${KRL_LAYERS.map(l => `
            <span class="layer-chip ${activeLayers.includes(l) ? "active" : ""}"
              data-alias="${escHtml(m.alias)}" data-layer="${l}" title="${escHtml(KRL_LABELS[l])}">${l}</span>
          `).join("")}
        </div>
      </div>`;
  }).join("");

  qsa(".layer-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const alias = chip.dataset.alias;
      const layer = chip.dataset.layer;
      if (!state.reasoningLayers[alias]) state.reasoningLayers[alias] = [];
      const idx = state.reasoningLayers[alias].indexOf(layer);
      if (idx >= 0) state.reasoningLayers[alias].splice(idx, 1);
      else state.reasoningLayers[alias].push(layer);
      chip.classList.toggle("active", state.reasoningLayers[alias].includes(layer));
      markDirty();
    });
  });

  qsa(".reasoning-preset").forEach(sel => {
    sel.addEventListener("change", () => {
      const alias = sel.dataset.alias;
      const presets = {
        chat: ["A","B","G"],
        research: ["A","B","C","D","G","H"],
        planning: ["A","B","C","D","E","F","H"],
        reflection: ["A","D","G","H","K"],
        full: [...KRL_LAYERS],
      };
      state.reasoningLayers[alias] = presets[sel.value] || [];
      markDirty();
      const row = document.querySelector(`.reasoning-row[data-alias="${CSS.escape(alias)}"]`);
      if (row) {
        qsa(".layer-chip", row).forEach(chip => {
          chip.classList.toggle("active", (state.reasoningLayers[alias] || []).includes(chip.dataset.layer));
        });
      }
    });
  });
}

function renderCounts() {
  const el = qs("#snavCounts"); if (!el) return;
  const groups = groupByProvider(state.models);
  el.innerHTML = Object.entries(groups).map(([p, ms]) =>
    `<div>${escHtml(p)}: ${ms.filter(m => m.enabled).length}/${ms.length}</div>`
  ).join("") + `<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px;">Total active: ${state.models.filter(m => m.enabled).length}</div>`;
}

function bindRosterEvents() {
  qsa(".model-enabled-toggle").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      if (!state.modelChanges[id]) state.modelChanges[id] = {};
      state.modelChanges[id].enabled = cb.checked;
      markDirty();
    });
  });

  qsa(".surface-check-input").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      const surface = cb.dataset.surface;
      const model = state.models.find(m => m.public_id === id);
      if (!model) return;
      let surfaces;
      try { surfaces = Array.isArray(model.surface_allowlist) ? [...model.surface_allowlist] : JSON.parse(model.surface_allowlist || "[]"); }
      catch { surfaces = []; }
      if (cb.checked && !surfaces.includes(surface)) surfaces.push(surface);
      if (!cb.checked) surfaces = surfaces.filter(s => s !== surface);
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
    const driver = qs("#np_driver")?.value || "openai_api";
    if (!provider || !name) { showToast("Provider ID and name required", "warn"); return; }
    state.apiKeys[provider] = key;
    const updatedKeys = { ...(state.settings.api_keys || {}), [provider]: key };
    const updatedEndpoints = { ...(state.settings.provider_endpoints || {}), [provider]: url };
    await api("/api/settings", { method: "PUT", body: { values: { ...state.settings, api_keys: updatedKeys, provider_endpoints: updatedEndpoints } } });
    if (qs("#addProviderForm")) qs("#addProviderForm").style.display = "none";
    ["np_id","np_name","np_url","np_key"].forEach(id => { const el = qs(`#${id}`); if (el) el.value = ""; });
    showToast(`Provider ${name} added — now add models to it`, "good");
  });
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
    model_reasoning_layers: state.reasoningLayers,
    api_keys: state.apiKeys,
  };

  const r = await api("/api/settings", { method: "PUT", body: { values: settingsPayload } });
  if (!r.ok) { ok = false; showToast(`Settings save failed: ${r.status}`, "warn"); }
  else state.settings = settingsPayload;

  state.dirty = false;
  setChip("#globalStatusChip", ok ? "Saved" : "Save errors", ok ? "status-chip--good" : "status-chip--warn");
  if (ok) showToast("All changes saved", "good");
}

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

document.addEventListener("DOMContentLoaded", init);
