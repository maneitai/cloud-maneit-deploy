const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const KRL_LAYERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const KRL_LABELS = {
  A:"Epistemic base", B:"Intake classifier", C:"Multiscale workspace", D:"Evidence ledger",
  E:"Option lattice", F:"Backtracking", G:"Curiosity", H:"Critical audit",
  I:"Work offloading", J:"Artifact engine", K:"Rule promotion", L:"Portability"
};

const PROVIDER_BADGES = { groq:"badge-groq", openrouter:"badge-openrouter", ollama:"badge-ollama" };

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  models: [],        // cloud models from pool
  settings: {},      // from GET /api/settings
  dirty: false,
  // pending changes: { [publicId]: { enabled, surface_allowlist, notes, name } }
  modelChanges: {},
  // API keys per provider: { groq: "gsk_...", openrouter: "sk-or-...", ollama: "ollama" }
  apiKeys: {},
  // reasoning layers per alias: { alias: ["A","B","C"] }
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

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadAll() {
  setChip("#globalStatusChip", "Loading", "status-chip--warn");
  const [modelsR, settingsR] = await Promise.all([
    api("/api/model-pool/models"),
    api("/api/settings"),
  ]);

  if (modelsR.ok) {
    const items = Array.isArray(modelsR.body?.items) ? modelsR.body.items
                : Array.isArray(modelsR.body) ? modelsR.body : [];
    // Only cloud models (openai_api driver)
    state.models = items.filter(m => m.runtime_driver === "openai_api");
  }

  if (settingsR.ok && settingsR.body) {
    state.settings = settingsR.body;
    // Extract API keys from model notes fields
    state.models.forEach(m => {
      const notes = m.notes || "";
      const keyMatch = notes.match(/api_key=(\S+)/);
      if (keyMatch && keyMatch[1] !== "ollama") {
        state.apiKeys[m.provider] = keyMatch[1];
      }
    });
    // Load reasoning layers from settings
    state.reasoningLayers = settingsR.body.model_reasoning_layers || {};
  }

  renderAll();
  setChip("#globalStatusChip", "Saved", "status-chip--good");
}

// ── Render ────────────────────────────────────────────────────────────────────
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

function renderRoster() {
  const container = qs("#providerGroups"); if (!container) return;
  const groups = groupByProvider(state.models);

  container.innerHTML = Object.entries(groups).map(([provider, models]) => {
    const badge = PROVIDER_BADGES[provider] || "badge-custom";
    const apiKey = state.apiKeys[provider] || "";
    const maskedKey = apiKey ? apiKey.slice(0,8) + "••••••••" : "";

    return `
      <div class="provider-group" data-provider="${escHtml(provider)}">
        <div class="provider-group-header">
          <div class="provider-group-title">
            <span class="provider-badge ${badge}">${escHtml(provider)}</span>
            <span>${models.length} model${models.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="provider-key-row">
            <span class="soft">API key</span>
            <input class="input api-key-input" type="password"
              data-provider="${escHtml(provider)}"
              value="${escHtml(apiKey)}"
              placeholder="${provider === "ollama" ? "ollama (no key needed)" : "sk-..."}" />
            <button class="button button--small save-key-btn" data-provider="${escHtml(provider)}">Save key</button>
          </div>
          <button class="button button--small add-model-btn" data-provider="${escHtml(provider)}">+ Add model</button>
        </div>

        <div class="model-table">
          <div class="model-row header">
            <div>Model</div>
            <div>Alias</div>
            <div>Surfaces</div>
            <div>Home</div>
            <div>LoreCore</div>
            <div></div>
          </div>
          ${models.map(m => {
            const surfaces = Array.isArray(m.surface_allowlist) ? m.surface_allowlist
                           : (typeof m.surface_allowlist === "string" ? JSON.parse(m.surface_allowlist || "[]") : []);
            const inHome = surfaces.includes("home");
            const inLore = surfaces.includes("lorecore");
            return `
              <div class="model-row" data-model-id="${escHtml(m.public_id)}">
                <div>
                  <div class="model-name">${escHtml(m.name || m.alias)}</div>
                </div>
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
                  <button class="button button--small button--danger remove-model-btn" data-id="${escHtml(m.public_id)}" title="Remove">✕</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>

        <!-- Add model inline form (hidden) -->
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
              <span class="soft">Model ID (provider's name)</span>
              <input class="input" id="am_modelid_${escHtml(provider)}" placeholder="llama-3.3-70b-versatile" />
            </label>
          </div>
          <div class="button-row">
            <button class="button cancel-add-model-btn" data-provider="${escHtml(provider)}">Cancel</button>
            <button class="button button--primary confirm-add-model-btn" data-provider="${escHtml(provider)}">Add model</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  bindRosterEvents();
}

function renderDefaults() {
  const s = state.settings;

  // Mode
  const modeEl = qs("#defaultMode");
  if (modeEl && s.default_home_mode) modeEl.value = s.default_home_mode;

  // Default models checkboxes
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

  qsa(".default-model-cb").forEach(cb => cb.addEventListener("change", markDirty));
}

function renderPolicies() {
  const p = state.settings.model_panel_policies || {};
  const i = p.interactive || {};
  const prod = p.production || {};
  const set = (id, v) => { const el = qs(`#${id}`); if (el && v != null) { if (el.type === "checkbox") el.checked = Boolean(v); else el.value = v; } };
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
              data-alias="${escHtml(m.alias)}" data-layer="${l}" title="${escHtml(KRL_LABELS[l])}">
              ${l}
            </span>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  // Layer chip toggles
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
