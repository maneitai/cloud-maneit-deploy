const PM_SETTINGS_KEY = "PM_SETTINGS_PROVIDERS_V1";
const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

const defaultState = {
  providerMode: "Hybrid",
  providers: [
    { id: "ollama_local", name: "Ollama Local", description: "For local models on the server or workstation", baseUrl: "http://127.0.0.1:11434", policy: "Allowed", connected: true, keyConfigured: false },
    { id: "ollama_cloud", name: "Ollama Cloud", description: "For heavy models and cloud-only aliases", baseUrl: "https://ollama.com", policy: "Heavy roles only", connected: true, keyConfigured: true },
    { id: "openai", name: "OpenAI", description: "Enterprise frontier reasoning and coding", baseUrl: "https://api.openai.com", policy: "Heavy roles only", connected: false, keyConfigured: true },
    { id: "anthropic", name: "Anthropic", description: "Long-context writing and synthesis", baseUrl: "https://api.anthropic.com", policy: "Allowed", connected: false, keyConfigured: false },
    { id: "google", name: "Google", description: "Gemini provider for selected heavy roles", baseUrl: "https://generativelanguage.googleapis.com", policy: "Fallback only", connected: false, keyConfigured: false },
    { id: "grok", name: "Grok / xAI", description: "xAI provider for experimentation and heavy roles", baseUrl: "https://api.x.ai", policy: "Allowed", connected: false, keyConfigured: false },
    { id: "llamacpp", name: "llama.cpp Fleet", description: "Current local fleet and explicit aliases", baseUrl: "http://127.0.0.1:8611+", policy: "Allowed", connected: true, keyConfigured: false }
  ],
  secrets: [
    { id: "ollama_cloud_key", label: "OLLAMA_API_KEY", provider: "ollama_cloud", configured: true, masked: "************" },
    { id: "openai_key", label: "OPENAI_API_KEY", provider: "openai", configured: true, masked: "************" },
    { id: "anthropic_key", label: "ANTHROPIC_API_KEY", provider: "anthropic", configured: false, masked: "" },
    { id: "google_key", label: "GOOGLE_API_KEY", provider: "google", configured: false, masked: "" },
    { id: "grok_key", label: "XAI_API_KEY", provider: "grok", configured: false, masked: "" }
  ],
  policies: [
    { roleClass: "Router / fast verifier", primary: "llama.cpp Fleet", fallback: "Ollama Local", note: "Cheap, locked, deterministic hot path" },
    { roleClass: "Heavy planner / reasoner", primary: "Ollama Cloud", fallback: "llama.cpp Fleet", note: "Use cloud only where depth matters more than latency" },
    { roleClass: "Python / C++ / JS generation", primary: "Ollama Cloud", fallback: "llama.cpp Fleet", note: "Best contract-following coder wins" },
    { roleClass: "Creative writing / lore", primary: "Ollama Cloud", fallback: "Ollama Local", note: "Heavy creative roles live here without touching State runtime" },
    { roleClass: "Enterprise verification", primary: "OpenAI", fallback: "Anthropic", note: "Optional high-confidence second layer" }
  ],
  matches: [
    { roleFamily: "Heavy Planner", layer: "deep_reasoning_v1", providers: "Ollama Cloud, OpenAI", note: "Cloud-heavy by design" },
    { roleFamily: "JS Generator", layer: "coder_contract_v1", providers: "llama.cpp Fleet, Ollama Cloud", note: "Best contract follower wins" },
    { roleFamily: "Python / C++", layer: "systems_coder_v1", providers: "Ollama Cloud, OpenAI", note: "Compile-first role family" },
    { roleFamily: "Creative Writer", layer: "creative_writer_v1", providers: "Ollama Cloud, Anthropic", note: "Separate from runtime side" }
  ],
  aliases: [
    { alias: "pipe_heavy_coder_ollama_qwen3coder480b_cloud", backedBy: "qwen3-coder:480b-cloud", status: "Enabled" },
    { alias: "pipe_heavy_reasoner_ollama_deepseekv31_671b_cloud", backedBy: "deepseek-v3.1:671b-cloud", status: "Enabled" },
    { alias: "pipe_heavy_general_ollama_gptoss120b_cloud", backedBy: "gpt-oss:120b-cloud", status: "Enabled" },
    { alias: "pipe_enterprise_verifier_openai", backedBy: "openai-enterprise-verifier", status: "Fallback only" },
    { alias: "pipe_heavy_writer_grok", backedBy: "grok-heavy-writer", status: "Disabled" }
  ],
  trace: [
    "[PROVIDER] ollama-local ping ok",
    "[PROVIDER] ollama-cloud key present",
    "[SYNC] 3 cloud aliases mapped",
    "[POLICY] heavy coder -> Ollama Cloud"
  ]
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(PM_SETTINGS_KEY);
    if (!raw) return deepClone(defaultState);
    return { ...deepClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return deepClone(defaultState);
  }
}

function saveState(state) {
  localStorage.setItem(PM_SETTINGS_KEY, JSON.stringify(state));
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

function providerTone(provider) {
  if (provider.connected) return "good";
  if (provider.keyConfigured) return "warn";
  return "";
}

function renderHeroCards() {
  const providerMode = qs("#statProviderMode");
  const configuredKeys = qs("#statConfiguredKeys");
  const enabledProviders = qs("#statEnabledProviders");
  const cloudEligibleRoles = qs("#statCloudEligibleRoles");

  if (providerMode) providerMode.textContent = state.providerMode;
  if (configuredKeys) configuredKeys.textContent = String(state.secrets.filter((s) => s.configured).length);
  if (enabledProviders) enabledProviders.textContent = String(state.providers.filter((p) => p.policy !== "Disabled").length);
  if (cloudEligibleRoles) cloudEligibleRoles.textContent = String(state.policies.filter((p) => /Cloud|OpenAI|Anthropic|Grok/i.test(p.primary)).length);
}

function renderProviderRegistry() {
  const container = qs("#providerRegistry");
  if (!container) return;
  container.innerHTML = `
    <div class="provider-row header">
      <div>Provider</div>
      <div>Base / Endpoint</div>
      <div>Default Policy</div>
      <div>Action</div>
    </div>
    ${state.providers.map((provider) => `
      <div class="provider-row" data-provider-id="${provider.id}">
        <div>
          <div class="provider-name">${provider.name}</div>
          <div class="provider-sub">${provider.description}</div>
        </div>
        <div><input class="input" data-field="baseUrl" value="${provider.baseUrl}" /></div>
        <div>
          <select class="select" data-field="policy">
            ${["Allowed", "Heavy roles only", "Fallback only", "Disabled"].map((option) => `<option ${provider.policy === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </div>
        <div class="control-row">
          <button class="button button--small" data-action="ping">Ping</button>
        </div>
      </div>
    `).join("")}
  `;
}

function renderSecrets() {
  const container = qs("#secretsGrid");
  if (!container) return;
  container.innerHTML = state.secrets.map((secret) => `
    <div class="secret-row" data-secret-id="${secret.id}">
      <div>
        <div class="provider-name">${secret.label}</div>
        <div class="provider-sub">${secret.provider}</div>
      </div>
      <div class="control-row">
        <input class="input" type="password" value="${secret.masked}" data-field="masked" />
        <button class="button button--small" data-action="save-secret">Save</button>
        <button class="button button--small" data-action="test-secret">Test</button>
      </div>
    </div>
  `).join("");
}

function renderPolicies() {
  const container = qs("#policyList");
  if (!container) return;
  container.innerHTML = `
    <div class="policy-row header">
      <div>Role Class</div>
      <div>Primary Provider</div>
      <div>Fallback Provider</div>
      <div>Notes</div>
    </div>
    ${state.policies.map((item, idx) => `
      <div class="policy-row" data-policy-index="${idx}">
        <div><strong>${item.roleClass}</strong></div>
        <div><input class="input" data-field="primary" value="${item.primary}" /></div>
        <div><input class="input" data-field="fallback" value="${item.fallback}" /></div>
        <div><input class="input" data-field="note" value="${item.note}" /></div>
      </div>
    `).join("")}
  `;
}

function renderMatching() {
  const container = qs("#matchingList");
  if (!container) return;
  container.innerHTML = state.matches.map((item, idx) => `
    <div class="policy-row" data-match-index="${idx}">
      <div><strong>${item.roleFamily}</strong></div>
      <div><input class="input" data-field="layer" value="${item.layer}" /></div>
      <div><input class="input" data-field="providers" value="${item.providers}" /></div>
      <div><input class="input" data-field="note" value="${item.note}" /></div>
    </div>
  `).join("");
}

function renderAliases() {
  const container = qs("#aliasList");
  if (!container) return;
  container.innerHTML = state.aliases.map((item, idx) => `
    <div class="alias-row" data-alias-index="${idx}">
      <div>
        <div class="runtime-name">${item.alias}</div>
        <div class="runtime-sub">Cloud / enterprise alias</div>
      </div>
      <div><input class="input" data-field="backedBy" value="${item.backedBy}" /></div>
      <div>
        <select class="select" data-field="status">
          ${["Enabled", "Fallback only", "Disabled"].map((option) => `<option ${item.status === option ? "selected" : ""}>${option}</option>`).join("")}
        </select>
      </div>
      <div class="control-row">
        <button class="button button--small" data-action="test-alias">Test</button>
      </div>
    </div>
  `).join("");
}

function renderProviderCensus() {
  const container = qs("#providerCensus");
  if (!container) return;
  container.innerHTML = state.providers.map((provider) => {
    const tone = providerTone(provider);
    const label = provider.connected ? "connected" : (provider.keyConfigured ? "configured" : "missing");
    return `<div class="chip ${tone}">${provider.name} ${label}</div>`;
  }).join("");
}

function renderTrace() {
  const container = qs("#providerTrace");
  if (!container) return;
  container.innerHTML = state.trace.map((line) => `<div class="log-line">${line}</div>`).join("");
}

function renderCloudRuntime() {
  const container = qs("#cloudRuntimeList");
  if (!container) return;
  container.innerHTML = `
    <div class="runtime-row header">
      <div>Cloud Alias</div>
      <div>Backed By</div>
      <div>Eligibility</div>
      <div>Action</div>
    </div>
    ${state.aliases.map((item, idx) => `
      <div class="runtime-row" data-cloud-index="${idx}">
        <div>
          <div class="runtime-name">${item.alias}</div>
          <div class="runtime-sub">Mapped cloud or enterprise alias</div>
        </div>
        <div><input class="input" data-field="backedBy" value="${item.backedBy}" /></div>
        <div>
          <select class="select" data-field="status">
            ${["Enabled", "Fallback only", "Disabled"].map((option) => `<option ${item.status === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </div>
        <div class="control-row">
          <button class="button button--small" data-action="test-runtime-alias">Test</button>
        </div>
      </div>
    `).join("")}
  `;
}

function renderAll() {
  renderHeroCards();
  renderProviderRegistry();
  renderSecrets();
  renderPolicies();
  renderMatching();
  renderAliases();
  renderProviderCensus();
  renderTrace();
  renderCloudRuntime();
  bindEvents();
}

function updateTrace(line) {
  state.trace.unshift(line);
  state.trace = state.trace.slice(0, 12);
  saveState(state);
  renderTrace();
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

function bindEvents() {
  qsa("#providerRegistry .provider-row[data-provider-id]").forEach((row) => {
    const providerId = row.dataset.providerId;

    row.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      const field = target.dataset.field;
      if (!field) return;

      state.providers = state.providers.map((provider) =>
        provider.id === providerId ? { ...provider, [field]: target.value } : provider
      );
      saveState(state);
    });

    qsa("[data-action='ping']", row).forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = state.providers.find((p) => p.id === providerId);
        if (!provider) return;

        updateTrace(`[PROVIDER] ping requested -> ${provider.name}`);
        const result = await callApi("/api/settings/providers/ping", "POST", provider);

        if (result.ok) {
          state.providers = state.providers.map((p) => p.id === providerId ? { ...p, connected: true } : p);
          showToast(`${provider.name} ping ok`, "good");
          updateTrace(`[PROVIDER] ${provider.name.toLowerCase()} ping ok`);
        } else {
          showToast(`${provider.name} ping not live yet`, "warn");
          updateTrace(`[PROVIDER] ${provider.name.toLowerCase()} ping pending/mock`);
        }

        saveState(state);
        renderAll();
      });
    });
  });

  qsa("#secretsGrid .secret-row[data-secret-id]").forEach((row) => {
    const secretId = row.dataset.secretId;

    qsa("[data-action='save-secret']", row).forEach((button) => {
      button.addEventListener("click", () => {
        const input = qs("input[data-field='masked']", row);

        state.secrets = state.secrets.map((secret) =>
          secret.id === secretId
            ? { ...secret, configured: Boolean(input?.value), masked: input?.value || "" }
            : secret
        );

        saveState(state);
        renderHeroCards();
        showToast("Secret saved (masked)", "good");
        updateTrace(`[SECRET] ${secretId} updated`);
      });
    });

    qsa("[data-action='test-secret']", row).forEach((button) => {
      button.addEventListener("click", async () => {
        updateTrace(`[SECRET] test requested -> ${secretId}`);
        const result = await callApi("/api/settings/secrets/test", "POST", { secret_id: secretId });
        showToast(result.ok ? "Secret test ok" : "Secret test pending/mock", result.ok ? "good" : "warn");
      });
    });
  });

  qsa("#policyList [data-policy-index], #matchingList [data-match-index], #aliasList [data-alias-index], #cloudRuntimeList [data-cloud-index]").forEach((row) => {
    row.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      const field = target.dataset.field;
      if (!field) return;

      if (row.dataset.policyIndex !== undefined) {
        const idx = Number(row.dataset.policyIndex);
        state.policies[idx][field] = target.value;
      } else if (row.dataset.matchIndex !== undefined) {
        const idx = Number(row.dataset.matchIndex);
        state.matches[idx][field] = target.value;
      } else if (row.dataset.aliasIndex !== undefined) {
        const idx = Number(row.dataset.aliasIndex);
        state.aliases[idx][field] = target.value;
      } else if (row.dataset.cloudIndex !== undefined) {
        const idx = Number(row.dataset.cloudIndex);
        state.aliases[idx][field] = target.value;
      }

      saveState(state);
    });
  });

  qsa("[data-action='test-alias'], [data-action='test-runtime-alias']").forEach((button) => {
    button.addEventListener("click", async () => {
      updateTrace("[ALIAS] test requested");
      const result = await callApi("/api/settings/aliases/test", "POST", { note: "ui-request" });
      showToast(result.ok ? "Alias test ok" : "Alias test pending/mock", result.ok ? "good" : "warn");
    });
  });

  qs("#saveProfileBtn")?.addEventListener("click", () => {
    saveState(state);
    updateTrace("[SETTINGS] provider profile saved");
    showToast("Provider profile saved", "good");
  });

  qs("#testProvidersBtn")?.addEventListener("click", async () => {
    updateTrace("[SETTINGS] provider health sweep requested");
    const result = await callApi("/api/settings/providers/test-all", "POST", { providers: state.providers });
    showToast(result.ok ? "Provider sweep started" : "No live API yet. UI hooks are ready.", result.ok ? "good" : "warn");
  });

  qs("#reloadInventoryBtn")?.addEventListener("click", async () => {
    updateTrace("[SETTINGS] inventory reload requested");
    const result = await callApi("/api/settings/providers/reload-inventory", "POST", {});
    showToast(result.ok ? "Inventory reload started" : "Inventory reload pending/mock", result.ok ? "good" : "warn");
  });

  qs("#syncAliasesBtn")?.addEventListener("click", async () => {
    updateTrace("[SETTINGS] cloud alias sync requested");
    const result = await callApi("/api/settings/providers/sync-aliases", "POST", { aliases: state.aliases });
    showToast(result.ok ? "Cloud alias sync started" : "Cloud alias sync pending/mock", result.ok ? "good" : "warn");
  });
}

document.addEventListener("DOMContentLoaded", renderAll);
