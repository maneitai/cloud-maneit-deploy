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
  pipelines: [],
  selectedPipelineId: null,
  selectedStageId: null,
  previewVisible: true,
};

function filteredPipelines() {
  const portal = document.getElementById('pipelinePortalFilter').value;
  return state.pipelines.filter(item => !portal || (item.compatible_portals || []).includes(portal));
}

function currentPipeline() {
  const visible = filteredPipelines();
  let pipeline = visible.find(item => item.public_id === state.selectedPipelineId);
  if (!pipeline) {
    pipeline = visible[0] || state.pipelines[0];
    state.selectedPipelineId = pipeline?.public_id || null;
  }
  if (pipeline && !state.selectedStageId) {
    state.selectedStageId = pipeline.stages?.[0]?.id || null;
  }
  return pipeline;
}

function currentStage() {
  const pipeline = currentPipeline();
  return pipeline?.stages?.find(stage => stage.id === state.selectedStageId) || pipeline?.stages?.[0] || null;
}

function renderLibrary() {
  const container = document.getElementById('pipelineLibrary');
  const pipelines = filteredPipelines();
  container.innerHTML = pipelines.map(item => `
    <article class="list-item ${item.public_id === state.selectedPipelineId ? 'list-item--active' : ''}" data-pipeline="${item.public_id}">
      <div class="meta"><span>${pmEscapeHtml(item.public_id)}</span><span>${pmEscapeHtml(item.type)}</span></div>
      <strong>${pmEscapeHtml(item.name)}</strong>
      <p class="muted">${pmEscapeHtml((item.compatible_portals || []).join(', '))}</p>
    </article>
  `).join('') || `
    <article class="card">
      <strong>No pipelines</strong>
      <p class="muted">Adjust the portal filter.</p>
    </article>
  `;
}

function renderPreview() {
  const pipeline = currentPipeline();
  const previewCard = document.getElementById('portalPreviewCard');
  const preview = document.getElementById('portalPreview');
  const label = document.getElementById('previewPortalLabel');
  previewCard.style.display = state.previewVisible ? '' : 'none';
  if (!pipeline) {
    preview.innerHTML = '';
    label.textContent = '';
    return;
  }
  label.textContent = pipeline.compatible_portals?.[0] || '';
  preview.innerHTML = (pipeline.portal_representation || []).map(step => `
    <span class="portal-step">${pmEscapeHtml(step)}</span>
  `).join('');
}

function renderInspector() {
  const pipeline = currentPipeline();
  const stage = currentStage();
  const inspector = document.getElementById('pipelineInspector');
  const status = document.getElementById('pipelineInspectorStatus');

  if (!pipeline) {
    inspector.innerHTML = `<article class="card"><p class="muted">No pipeline selected.</p></article>`;
    status.textContent = 'No pipeline';
    return;
  }

  status.textContent = stage ? stage.kind : pipeline.type;

  inspector.innerHTML = `
    <details class="pipelineInspector-fold" open>
      <summary><strong>Pipeline</strong><span>${pmEscapeHtml(pipeline.public_id)}</span></summary>
      <div class="pipelineInspector-body">
        <article class="card">
          <h3>${pmEscapeHtml(pipeline.name)}</h3>
          <div class="field-grid" style="margin-top:0.8rem;">
            <div class="key-value"><strong>type</strong><span>${pmEscapeHtml(pipeline.type)}</span></div>
            <div class="key-value"><strong>compatible portals</strong><span>${pmEscapeHtml((pipeline.compatible_portals || []).join(', '))}</span></div>
            <div class="key-value"><strong>required roles</strong><span>${pmEscapeHtml((pipeline.required_agent_roles || []).join(', '))}</span></div>
          </div>
        </article>
      </div>
    </details>

    <details class="pipelineInspector-fold" open>
      <summary><strong>Selected stage</strong><span>${stage ? pmEscapeHtml(stage.id) : 'none'}</span></summary>
      <div class="pipelineInspector-body">
        ${
          stage ? `
            <article class="card">
              <strong>${pmEscapeHtml(stage.title)}</strong>
              <p class="muted" style="margin-top:0.5rem;">${pmEscapeHtml(stage.summary)}</p>
              <div class="field-grid" style="margin-top:0.8rem;">
                <div class="key-value"><strong>stage kind</strong><span>${pmEscapeHtml(stage.kind)}</span></div>
                <div class="key-value"><strong>stage id</strong><span>${pmEscapeHtml(stage.id)}</span></div>
              </div>
            </article>
          ` : '<article class="card"><p class="muted">Select a stage in the workbench.</p></article>'
        }
      </div>
    </details>

    <details class="pipelineInspector-fold" open>
      <summary><strong>Verifier chain</strong><span>${pmEscapeHtml(String((pipeline.verifier_chain || []).length))}</span></summary>
      <div class="pipelineInspector-body">
        <article class="card">
          <div class="timeline">
            ${(pipeline.verifier_chain || []).map((item, index) => `
              <div class="timeline-item">
                <small>check ${index + 1}</small>
                <span>${pmEscapeHtml(item)}</span>
              </div>
            `).join('') || '<p class="muted">No verifier chain declared.</p>'}
          </div>
        </article>
      </div>
    </details>

    <details class="pipelineInspector-fold">
      <summary><strong>Tool requirements</strong><span>${pmEscapeHtml(String((pipeline.tool_requirements || []).length))}</span></summary>
      <div class="pipelineInspector-body">
        <article class="card">
          <div class="tag-row">
            ${(pipeline.tool_requirements || []).map(item => `<span class="tag">${pmEscapeHtml(item)}</span>`).join('') || '<span class="muted">No tool requirements declared.</span>'}
          </div>
        </article>
      </div>
    </details>
  `;
}

function renderFlow() {
  const pipeline = currentPipeline();
  const flowPath = document.getElementById('flowPath');
  if (!pipeline) {
    flowPath.innerHTML = `<article class="card"><p class="muted">No pipeline available.</p></article>`;
    return;
  }

  flowPath.innerHTML = (pipeline.stages || []).map((stage, index) => `
    <div class="flow-link">
      <article class="flow-node stage-card ${stage.id === state.selectedStageId ? 'stage-card--active' : ''}" data-stage="${stage.id}">
        <div class="meta"><span>${pmEscapeHtml(stage.id)}</span><span>${pmEscapeHtml(stage.kind)}</span></div>
        <strong>${pmEscapeHtml(stage.title)}</strong>
        <p class="muted">${pmEscapeHtml(stage.summary)}</p>
      </article>
      ${index < (pipeline.stages || []).length - 1 ? '<div class="flow-arrow">handoff to next stage</div>' : ''}
    </div>
  `).join('');
  renderPreview();
  renderInspector();
}

async function loadPipelines() {
  try {
    const data = await pmApi('/pipelines');
    state.pipelines = data.items || [];
    renderLibrary();
    renderFlow();
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function clonePipeline() {
  const pipeline = currentPipeline();
  if (!pipeline) return;
  try {
    const clone = await pmApi(`/pipelines/${pipeline.public_id}/clone`, { method: 'POST' });
    state.pipelines.unshift(clone);
    state.selectedPipelineId = clone.public_id;
    state.selectedStageId = clone.stages?.[0]?.id || null;
    renderLibrary();
    renderFlow();
    pmShowToast('Pipeline cloned');
  } catch (error) {
    pmShowToast(error.message);
  }
}

function attachEvents() {
  document.getElementById('pipelineLibrary').addEventListener('click', (event) => {
    const card = event.target.closest('[data-pipeline]');
    if (!card) return;
    state.selectedPipelineId = card.dataset.pipeline;
    state.selectedStageId = null;
    renderLibrary();
    renderFlow();
  });

  document.getElementById('flowPath').addEventListener('click', (event) => {
    const card = event.target.closest('[data-stage]');
    if (!card) return;
    state.selectedStageId = card.dataset.stage;
    renderFlow();
  });

  document.getElementById('pipelinePortalFilter').addEventListener('change', () => {
    state.selectedPipelineId = null;
    state.selectedStageId = null;
    renderLibrary();
    renderFlow();
  });

  document.getElementById('togglePreviewBtn').addEventListener('click', () => {
    state.previewVisible = !state.previewVisible;
    renderPreview();
    pmShowToast(state.previewVisible ? 'Portal preview shown' : 'Portal preview hidden');
  });

  document.getElementById('clonePipelineBtn').addEventListener('click', clonePipeline);
}

attachEvents();
loadPipelines();
