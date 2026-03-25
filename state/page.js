const PM_PREVIEW_HOST = /\.github\.io$/i.test(window.location.hostname);
const PM_API_BASE = window.PM_API_BASE || '/api';
const PM_PREVIEW_NO_API = PM_PREVIEW_HOST && !window.PM_API_BASE;


async function pmApi(path, options = {}) {
  if (PM_PREVIEW_NO_API) {
    throw new Error('GitHub Pages preview has no /api proxy. Add ?apiBase=https://your-host/api for live data.');
  }
  const config = { ...options };
  config.headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(`${PM_API_BASE}${path}`, config);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data.detail || data.error || response.statusText || 'Request failed';
    throw new Error(message);
  }
  return data;
}

function pmShowToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(pmShowToast.timer);
  pmShowToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function pmEscapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const state = {
  data: null,
};

function statusTone(status = '') {
  switch (String(status).toLowerCase()) {
    case 'loaded':
    case 'active':
      return 'good';
    case 'starting':
    case 'activating':
      return 'warn';
    case 'failed':
    case 'error':
      return 'bad';
    default:
      return 'muted';
  }
}

function renderModelHealthList() {
  document.getElementById('modelHealthList').innerHTML = state.data.model_health.map(item => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(item.status)}</small>
      <span>${pmEscapeHtml(item.model)} — ${pmEscapeHtml(item.note)}</span>
    </div>
  `).join('');
}

function renderSummaries() {
  document.getElementById('sessionSummary').innerHTML = state.data.sessions.map(item => `
    <div class="timeline-item">
      <small>session</small>
      <span>${pmEscapeHtml(item.name)} — ${pmEscapeHtml(item.note)}</span>
    </div>
  `).join('');

  document.getElementById('routingSummary').innerHTML = state.data.routing.map(item => `
    <div class="timeline-item">
      <small>route</small>
      <span>${pmEscapeHtml(item.title)} — ${pmEscapeHtml(item.note)}</span>
    </div>
  `).join('');

  document.getElementById('signalLog').innerHTML = state.data.signals.map(item => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(item.time)}</small>
      <span>${pmEscapeHtml(item.text)}</span>
    </div>
  `).join('');

  document.getElementById('alertList').innerHTML = state.data.alerts.map(item => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(item.time)}</small>
      <span>${pmEscapeHtml(item.text)}</span>
    </div>
  `).join('');
}

function renderRuntimeEvents() {
  const events = state.data.runtime_events || [];
  document.getElementById('runtimeEventList').innerHTML = events.map(item => `
    <div class="timeline-item">
      <small>${pmEscapeHtml((item.created_at || '').slice(11,16) || '--:--')}</small>
      <span>${pmEscapeHtml(item.model_name || item.model_public_id || 'pool')} — ${pmEscapeHtml(item.event_type)} · ${pmEscapeHtml(item.message)}</span>
    </div>
  `).join('') || '<div class="timeline-item"><small>--:--</small><span>No runtime events yet.</span></div>';
}

function renderModelPoolTable() {
  const overview = state.data.model_pool_overview || { models: [], control_mode: 'observe' };
  const models = overview.models || [];
  const controlMode = overview.control_mode || 'observe';
  const allowLoadControl = controlMode !== 'observe';
  document.getElementById('stateControlMode').textContent = controlMode;
  document.getElementById('modelPoolTable').innerHTML = models.map(model => `
    <article class="card lane-card lane-card--${statusTone(model.runtime_state)}">
      <div class="meta"><span>${pmEscapeHtml(model.class_type)}</span><span>${pmEscapeHtml(model.runtime_state)}</span></div>
      <div class="stack stack--sm">
        <div>
          <strong>${pmEscapeHtml(model.name)}</strong>
          <p class="muted">${pmEscapeHtml((model.role_tags || []).join(', ') || (model.capability_tags || []).join(', '))}</p>
        </div>
        <div class="field-grid">
          <div class="key-value"><strong>endpoint</strong><span>${pmEscapeHtml(model.local_endpoint || '—')}</span></div>
          <div class="key-value"><strong>service</strong><span>${pmEscapeHtml(model.service_name || '—')}</span></div>
          <div class="key-value"><strong>keep loaded</strong><span>${model.keep_loaded ? 'yes' : 'no'}</span></div>
          <div class="key-value"><strong>hotness</strong><span>${Number(model.hotness || 0).toFixed(2)}</span></div>
        </div>
        <div class="button-row button-row--compact">
          <button class="button" type="button" data-action="toggle-keep" data-model-id="${pmEscapeHtml(model.public_id)}" data-keep-loaded="${model.keep_loaded ? '1' : '0'}">
            ${model.keep_loaded ? 'Unpin hot' : 'Pin hot'}
          </button>
          <button class="button" type="button" data-action="load" data-model-id="${pmEscapeHtml(model.public_id)}" ${allowLoadControl ? '' : 'disabled'}>
            Load
          </button>
          <button class="button button--ghost" type="button" data-action="unload" data-model-id="${pmEscapeHtml(model.public_id)}" ${allowLoadControl ? '' : 'disabled'}>
            Unload
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

function renderActiveLeases() {
  const leases = state.data.active_leases || [];
  document.getElementById('activeLeaseList').innerHTML = leases.map(lease => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(lease.surface || 'surface')}</small>
      <span>
        ${pmEscapeHtml(lease.model?.name || lease.model_public_id || 'model')} — ${pmEscapeHtml(lease.role || 'lane')} · ${pmEscapeHtml(lease.leased_to || 'operator')}
        <button class="button button--ghost" style="margin-left:0.8rem;" type="button" data-action="release-lease" data-lease-id="${pmEscapeHtml(lease.public_id)}">Release</button>
      </span>
    </div>
  `).join('') || '<div class="timeline-item"><small>leases</small><span>No active leases.</span></div>';
}

function renderRuntimeProfiles() {
  const items = state.data.runtime_profiles || [];
  document.getElementById('runtimeProfileList').innerHTML = items.map(item => `
    <article class="card lane-card lane-card--${statusTone(item.materialized ? 'loaded' : item.profile_exists ? 'starting' : 'available')}">
      <div class="meta"><span>${pmEscapeHtml(item.family || 'other')}</span><span>${pmEscapeHtml(item.materialized ? 'materialized' : item.profile_exists ? 'profiled' : item.catalog_state || 'disk')}</span></div>
      <strong>${pmEscapeHtml(item.name || item.alias || 'model')}</strong>
      <small>${pmEscapeHtml(((item.profile || {}).roles || []).slice(0, 4).join(' · ') || 'general')}</small>
      <div class="field-grid" style="margin-top:0.7rem;">
        <div class="key-value"><strong>port</strong><span>${pmEscapeHtml(String((item.profile || {}).port || '—'))}</span></div>
        <div class="key-value"><strong>service</strong><span>${pmEscapeHtml((item.profile || {}).service_name || '—')}</span></div>
      </div>
      <p class="muted">${pmEscapeHtml(item.gguf_path || item.notes || '')}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No runtime profiles yet.</p></article>';
}

function renderServicePlan() {
  const plan = state.data.service_plan || { shell_script: '' };
  document.getElementById('servicePlanScript').textContent = plan.shell_script || '# No service scaffold generated yet';
}

function renderProductionPanelPlan() {
  const plan = state.data.production_panel_plan || { stages: [] };
  document.getElementById('productionPanelPlan').innerHTML = (plan.stages || []).map(stage => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(stage.stage || 'stage')}</small>
      <span>${pmEscapeHtml(stage.label || '')} — ${pmEscapeHtml((stage.members || []).map(item => item.name).join(' · ') || 'No members planned')}</span>
    </div>
  `).join('') || '<div class="timeline-item"><small>plan</small><span>No production panel plan yet.</span></div>';
}

function renderProductionState() {
  const jobs = state.data.production_jobs || [];
  const artifacts = state.data.artifacts || [];
  document.getElementById('productionJobsList').innerHTML = jobs.map(item => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(String(item.progress || 0))}%</small>
      <span>${pmEscapeHtml(item.surface || 'job')} — ${pmEscapeHtml(item.title || item.public_id)} · ${pmEscapeHtml(item.status || 'queued')}</span>
    </div>
  `).join('') || '<div class="timeline-item"><small>jobs</small><span>No production jobs yet.</span></div>';
  document.getElementById('artifactStateList').innerHTML = artifacts.slice(0, 10).map(item => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(item.artifact_type || 'artifact')}</small>
      <span>${pmEscapeHtml(item.title || item.public_id)} — ${pmEscapeHtml(item.stage_id || 'summary')}</span>
    </div>
  `).join('') || '<div class="timeline-item"><small>artifacts</small><span>No artifacts yet.</span></div>';
}

function render() {
  if (!state.data) return;
  document.getElementById('environmentMode').textContent = state.data.environment_mode;
  document.getElementById('modelCount').textContent = state.data.model_health.length;
  document.getElementById('kpiSessions').textContent = String(state.data.kpis.sessions);
  document.getElementById('kpiPipelines').textContent = String(state.data.kpis.pipelines);
  document.getElementById('kpiWarnings').textContent = String(state.data.kpis.warnings);
  document.getElementById('kpiJobs').textContent = String(state.data.kpis.jobs || 0);
  document.getElementById('kpiArtifacts').textContent = String(state.data.kpis.artifacts || 0);
  renderModelHealthList();
  renderSummaries();
  renderRuntimeEvents();
  renderModelPoolTable();
  renderActiveLeases();
  renderRuntimeProfiles();
  renderServicePlan();
  renderProductionPanelPlan();
  renderProductionState();
}

async function load() {
  try {
    state.data = await pmApi('/state/overview');
    render();
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function refreshMetrics() {
  try {
    state.data = await pmApi('/state/refresh', { method: 'POST' });
    render();
    pmShowToast('State metrics refreshed');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function reduceNoise() {
  try {
    state.data = await pmApi('/state/reduce-noise', { method: 'POST' });
    render();
    pmShowToast('Noise reduced');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function syncModelPool() {
  try {
    await pmApi('/model-pool/sync', { method: 'POST' });
    await load();
    pmShowToast('Model pool synced');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function draftProfiles() {
  try {
    await pmApi('/model-catalog/runtime-profiles/ensure', {
      method: 'POST',
      body: { aliases: [], overwrite: false, include_runtime: false },
    });
    await load();
    pmShowToast('Runtime profiles drafted');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function materializeProfiles() {
  try {
    await pmApi('/model-catalog/runtime-profiles/materialize', {
      method: 'POST',
      body: { aliases: [], overwrite: false },
    });
    await load();
    pmShowToast('Profiled models materialized');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function toggleKeepLoaded(modelId, currentlyKeepLoaded) {
  try {
    await pmApi(`/model-pool/models/${modelId}`, {
      method: 'PATCH',
      body: { keep_loaded: !currentlyKeepLoaded },
    });
    await load();
    pmShowToast(!currentlyKeepLoaded ? 'Model pinned hot' : 'Model unpinned');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function loadModel(modelId) {
  try {
    await pmApi(`/model-pool/models/${modelId}/load`, {
      method: 'POST',
      body: { leased_to: 'state-operator' },
    });
    await load();
    pmShowToast('Load requested');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function unloadModel(modelId) {
  try {
    await pmApi(`/model-pool/models/${modelId}/unload`, { method: 'POST' });
    await load();
    pmShowToast('Unload requested');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function releaseLease(leaseId) {
  try {
    await pmApi(`/model-pool/leases/${leaseId}/release`, {
      method: 'POST',
      body: { reason: 'state-ui-release' },
    });
    await load();
    pmShowToast('Lease released');
  } catch (error) {
    pmShowToast(error.message);
  }
}

document.getElementById('refreshMetricsBtn').addEventListener('click', refreshMetrics);
document.getElementById('reduceNoiseBtn').addEventListener('click', reduceNoise);
document.getElementById('syncModelPoolBtn').addEventListener('click', syncModelPool);
  document.getElementById('draftProfilesBtn').addEventListener('click', draftProfiles);
  document.getElementById('materializeProfilesBtn').addEventListener('click', materializeProfiles);

document.getElementById('modelPoolTable').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const modelId = button.dataset.modelId;
  if (action === 'toggle-keep') {
    await toggleKeepLoaded(modelId, button.dataset.keepLoaded === '1');
  } else if (action === 'load') {
    await loadModel(modelId);
  } else if (action === 'unload') {
    await unloadModel(modelId);
  }
});

document.getElementById('activeLeaseList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="release-lease"]');
  if (!button) return;
  await releaseLease(button.dataset.leaseId);
});

load();
