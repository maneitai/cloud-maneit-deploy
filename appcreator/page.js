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
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pmNowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function pmTextToList(value = '') {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

window.pmApi = pmApi;
window.pmShowToast = pmShowToast;
window.pmEscapeHtml = pmEscapeHtml;
window.pmNowTime = pmNowTime;
window.pmTextToList = pmTextToList;


const state = {
  summary: null,
  selectedProjectId: null,
  selectedStageId: null,
  productionJobs: [],
  artifacts: [],
  panelPlan: null,
};

function selectedProject() {
  return state.summary?.projects?.find(project => project.public_id === state.selectedProjectId);
}

function selectedStage() {
  return state.summary?.pipeline?.stages?.find(stage => stage.id === state.selectedStageId);
}

function renderProjectSelect() {
  const select = document.getElementById('projectSelect');
  select.innerHTML = (state.summary?.projects || []).map(project => `
    <option value="${project.public_id}" ${project.public_id === state.selectedProjectId ? 'selected' : ''}>
      ${pmEscapeHtml(project.public_id)} — ${pmEscapeHtml(project.title)}
    </option>
  `).join('');
  renderProjectReference();
  renderStages();
  renderAgentGroup();
  renderActivity();
  hydrateWorkspace();
}

function renderProjectReference() {
  const project = selectedProject();
  const card = document.getElementById('projectReferenceCard');
  if (!project) {
    card.innerHTML = '<p class="muted">No linked project available.</p>';
    return;
  }
  card.innerHTML = `
    <div class="eyebrow">Project record</div>
    <h3 style="margin-top:0.6rem;">${pmEscapeHtml(project.title)}</h3>
    <div class="field-grid" style="margin-top:0.8rem;">
      <div class="key-value"><strong>project_id</strong><span>${pmEscapeHtml(project.public_id)}</span></div>
      <div class="key-value"><strong>status</strong><span>${pmEscapeHtml(project.status)}</span></div>
      <div class="key-value"><strong>origin_chat_id</strong><span>${pmEscapeHtml(project.origin_chat_id || '')}</span></div>
      <div class="key-value"><strong>pipeline snapshot</strong><span>${pmEscapeHtml(project.active_pipeline_snapshot_id || '')}</span></div>
    </div>
    <p class="muted" style="margin-top:0.8rem;">${pmEscapeHtml(project.notes || '')}</p>
  `;
}

function renderStages() {
  const container = document.getElementById('stageControls');
  const flow = state.summary?.pipeline;
  container.innerHTML = (flow?.stages || []).map(stage => `
    <button type="button" class="stage-pill ${stage.id === state.selectedStageId ? 'is-active' : ''}" data-stage="${stage.id}">
      ${pmEscapeHtml(stage.title)}
    </button>
  `).join('');
  renderStatusCopy();
}

function renderStatusCopy() {
  const stage = selectedStage();
  const project = selectedProject();
  document.getElementById('stageStatusCopy').textContent = stage
    ? `${stage.title} selected for ${project ? project.title : 'current project'}.`
    : 'Awaiting stage selection.';
}

function renderAgentGroup() {
  const project = selectedProject();
  const team = state.summary?.team;
  document.getElementById('agentGroup').innerHTML = (team?.member_names || []).map(name => `<span class="portal-step">${pmEscapeHtml(name)}</span>`).join('');
  document.getElementById('executionStatus').textContent = project?.status || 'review';
  document.getElementById('executionProgress').style.width = `${state.summary?.workspace?.progress || 24}%`;
}

function renderActivity() {
  const log = document.getElementById('activityLog');
  log.innerHTML = (state.summary?.workspace?.activity || []).map(item => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(item.time)}</small>
      <span>${pmEscapeHtml(item.text)}</span>
    </div>
  `).join('');
  renderOutputs();
}

function renderOutputs() {
  const grid = document.getElementById('outputGrid');
  grid.innerHTML = (state.summary?.workspace?.outputs || []).map(item => `
    <article class="output-card">
      <div class="meta"><span>${pmEscapeHtml(item.meta_left || '')}</span><span>${pmEscapeHtml(item.meta_right || '')}</span></div>
      <strong>${pmEscapeHtml(item.title || '')}</strong>
      <p class="muted">${pmEscapeHtml(item.body || '')}</p>
    </article>
  `).join('');
}

function renderProductionJobs() {
  const container = document.getElementById('productionJobList');
  if (!container) return;
  if (!state.productionJobs.length) {
    container.innerHTML = '<p class="muted">No production jobs yet.</p>';
    return;
  }
  container.innerHTML = state.productionJobs.slice(0, 6).map(job => `
    <article class="card">
      <div class="meta"><span>${pmEscapeHtml(job.status)}</span><span>${pmEscapeHtml(String(job.progress || 0))}%</span></div>
      <strong>${pmEscapeHtml(job.title || job.public_id)}</strong>
      <p class="muted">${pmEscapeHtml(job.current_stage || job.objective || '')}</p>
      <div class="button-row button-row--compact">
        <button type="button" class="button button--ghost" data-job-restart="${pmEscapeHtml(job.public_id)}">Restart</button>
      </div>
    </article>
  `).join('');
}

function renderArtifacts() {
  const container = document.getElementById('artifactList');
  if (!container) return;
  if (!state.artifacts.length) {
    container.innerHTML = '<p class="muted">No artifacts saved yet.</p>';
    return;
  }
  container.innerHTML = state.artifacts.slice(0, 8).map(item => `
    <article class="card">
      <div class="meta"><span>${pmEscapeHtml(item.artifact_type || 'artifact')}</span><span>${pmEscapeHtml(item.stage_id || 'summary')}</span></div>
      <strong>${pmEscapeHtml(item.title || item.public_id)}</strong>
      <p class="muted">${pmEscapeHtml((item.content || '').slice(0, 180))}</p>
    </article>
  `).join('');
}

async function runProductionPass() {
  if (!state.summary?.workspace?.public_id) return;
  try {
    const objective = document.getElementById('productionObjective').value.trim() || `Run a quality-first production pass for ${selectedProject()?.title || 'current workspace'}.`;
    const selectedModels = pmTextToList(document.getElementById('productionModelsInput').value || '');
    const result = await pmApi('/production/jobs', {
      method: 'POST',
      body: {
        surface: 'appcreator',
        subject_type: 'workspace',
        subject_public_id: state.summary.workspace.public_id,
        objective,
        title: `${selectedProject()?.title || state.summary.workspace.title} · production run`,
        selected_models: selectedModels,
        auto_start: true,
      },
    });
    pmShowToast(`Production job queued: ${result.public_id}`);
    await load(state.selectedProjectId);
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function restartProductionJob(jobPublicId) {
  try {
    await pmApi(`/production/jobs/${jobPublicId}/restart`, { method: 'POST' });
    await load(state.selectedProjectId);
    pmShowToast('Production job restarted');
  } catch (error) {
    pmShowToast(error.message);
  }
}

function hydrateWorkspace() {
  const notes = state.summary?.workspace?.notes || {};
  document.querySelectorAll('[data-block]').forEach(textarea => {
    textarea.value = notes[textarea.dataset.block] || textarea.value || '';
  });
}

async function load(projectPublicId = '') {
  try {
    const query = projectPublicId ? `?project_public_id=${encodeURIComponent(projectPublicId)}` : '';
    state.summary = await pmApi('/portals/AppCreator/summary' + query);
    state.selectedProjectId = state.summary.selected_project?.public_id || state.summary.projects?.[0]?.public_id || null;
    state.selectedStageId = state.summary.workspace?.stage_state?.selected_stage_id || state.summary.pipeline?.stages?.[0]?.id || null;
    state.productionJobs = state.summary.production_jobs || [];
    state.artifacts = state.summary.artifacts || [];
    state.panelPlan = state.summary.panel_plan || null;
    renderProjectSelect();
    renderProductionJobs();
    renderArtifacts();
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function saveWorkspace() {
  const notes = [...document.querySelectorAll('[data-block]')].reduce((acc, textarea) => {
    acc[textarea.dataset.block] = textarea.value;
    return acc;
  }, {});
  try {
    state.summary.workspace = await pmApi(`/portals/workspaces/${state.summary.workspace.public_id}`, {
      method: 'PUT',
      body: { notes },
    });
    pmShowToast('Workspace notes saved');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function runStage() {
  const stage = selectedStage();
  if (!stage) return;
  try {
    const result = await pmApi(`/portals/workspaces/${state.summary.workspace.public_id}/run-stage`, {
      method: 'POST',
      body: { stage_id: stage.id },
    });
    state.summary.workspace = result.workspace;
    document.getElementById('executionProgress').style.width = `${result.workspace.progress}%`;
    document.getElementById('executionStatus').textContent = stage.kind;
    document.getElementById('stageStatusCopy').textContent = `${stage.title} ran for ${selectedProject()?.title || 'current project'} using simplified portal controls.`;
    renderActivity();
    pmShowToast(`${stage.title} executed`);
  } catch (error) {
    pmShowToast(error.message);
  }
}

function attachEvents() {
  document.getElementById('projectSelect').addEventListener('change', (event) => {
    state.selectedProjectId = event.target.value;
    load(state.selectedProjectId);
  });

  document.getElementById('stageControls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-stage]');
    if (!button) return;
    state.selectedStageId = button.dataset.stage;
    renderStages();
  });

  document.getElementById('saveWorkspaceBtn').addEventListener('click', saveWorkspace);
  document.getElementById('runStageBtn').addEventListener('click', runStage);
  document.getElementById('runProductionBtn').addEventListener('click', runProductionPass);
  document.getElementById('refreshProductionBtn').addEventListener('click', () => load(state.selectedProjectId));
  document.getElementById('productionJobList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-job-restart]');
    if (!button) return;
    restartProductionJob(button.dataset.jobRestart);
  });
}

attachEvents();
load();
