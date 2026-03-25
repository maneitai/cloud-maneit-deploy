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
  if (!toast) return;
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
  selectedId: null,
  tagFilter: '',
  projects: [],
};

function getFilters() {
  return {
    search: document.getElementById('projectSearch').value.trim().toLowerCase(),
    status: document.getElementById('statusFilter').value,
    type: document.getElementById('typeFilter').value,
    portal: document.getElementById('portalFilter').value,
    pinnedOnly: document.getElementById('pinnedOnly').checked,
  };
}

function filteredProjects() {
  const filters = getFilters();
  return state.projects.filter(project => {
    const text = [
      project.public_id,
      project.title,
      project.type,
      project.target_portal,
      project.origin_chat_id,
      ...(project.tags || []),
    ].join(' ').toLowerCase();

    return (!filters.search || text.includes(filters.search))
      && (!filters.status || project.status === filters.status)
      && (!filters.type || project.type === filters.type)
      && (!filters.portal || project.target_portal === filters.portal)
      && (!filters.pinnedOnly || project.pinned)
      && (!state.tagFilter || (project.tags || []).includes(state.tagFilter));
  });
}

function ensureSelection(projects) {
  if (!projects.length) {
    state.selectedId = null;
    return;
  }
  if (!state.selectedId || !projects.some(project => project.public_id === state.selectedId)) {
    state.selectedId = projects[0].public_id;
  }
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'Unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function renderTagFilters() {
  const tags = [...new Set(state.projects.flatMap(project => project.tags || []))].sort();
  const container = document.getElementById('tagFilters');
  container.innerHTML = tags.map(tag => `
    <button type="button" class="tag-filter ${state.tagFilter === tag ? 'is-active' : ''}" data-tag="${pmEscapeHtml(tag)}">${pmEscapeHtml(tag)}</button>
  `).join('') || '<span class="muted">No tags yet.</span>';
}

function renderQueueBoard(projects) {
  const counts = countBy(projects, 'status');
  document.getElementById('queueDraft').textContent = String(counts.Draft || 0);
  document.getElementById('queueQueued').textContent = String(counts.Queued || 0);
  document.getElementById('queueReview').textContent = String(counts.Review || 0);
  document.getElementById('queueActive').textContent = String(counts.Active || 0);
}

function renderTargetStrip(projects) {
  const targetCounts = Object.entries(countBy(projects, 'target_portal'))
    .sort((a, b) => b[1] - a[1]);
  const targetNode = document.getElementById('targetPortalStrip');
  targetNode.innerHTML = targetCounts.map(([target, count]) => `
    <article class="target-card">
      <small>${pmEscapeHtml(target)}</small>
      <strong>${count}</strong>
      <span>${count === 1 ? 'record' : 'records'}</span>
    </article>
  `).join('') || '<article class="target-card target-card--empty"><small>Targets</small><strong>0</strong><span>No records visible.</span></article>';

  document.getElementById('routingLaneSummary').innerHTML = targetCounts.slice(0, 6).map(([target, count]) => `
    <div class="timeline-item">
      <small>${count} ${count === 1 ? 'record' : 'records'}</small>
      <span>${pmEscapeHtml(target)} is currently a downstream target.</span>
    </div>
  `).join('') || '<div class="timeline-item"><small>routing</small><span>No target portals visible yet.</span></div>';

  document.getElementById('kpiTargets').textContent = String(targetCounts.length);
}

function renderTable() {
  const projects = filteredProjects();
  ensureSelection(projects);
  const tbody = document.getElementById('projectRows');

  tbody.innerHTML = projects.map(project => `
    <tr data-id="${project.public_id}" class="${project.public_id === state.selectedId ? 'is-active' : ''}">
      <td>
        <strong>${pmEscapeHtml(project.title)}</strong>
        <div class="meta">
          <span>${pmEscapeHtml(project.public_id)}</span>
          ${project.pinned ? '<span>pinned</span>' : ''}
        </div>
      </td>
      <td>${pmEscapeHtml(project.type)}</td>
      <td>${pmEscapeHtml(project.status)}</td>
      <td>${pmEscapeHtml(project.target_portal)}</td>
      <td>${pmEscapeHtml(project.next_action || '')}</td>
      <td>${pmEscapeHtml(project.origin_chat_id || '')}</td>
    </tr>
  `).join('') || `
    <tr>
      <td colspan="6">
        <div class="card">
          <strong>No matching projects</strong>
          <p class="muted">Adjust filters or create a manual record.</p>
        </div>
      </td>
    </tr>
  `;

  document.getElementById('kpiTotal').textContent = String(state.projects.length);
  document.getElementById('kpiActive').textContent = String(state.projects.filter(project => ['Active', 'Review'].includes(project.status)).length);
  document.getElementById('kpiPinned').textContent = String(state.projects.filter(project => project.pinned).length);

  renderQueueBoard(projects);
  renderTargetStrip(projects);
  renderInspector();
}

function renderInspector() {
  const inspector = document.getElementById('projectInspector');
  const statusChip = document.getElementById('inspectorStatus');
  const project = state.projects.find(item => item.public_id === state.selectedId);

  if (!project) {
    inspector.innerHTML = '<article class="card"><p class="muted">Select a project to inspect its routing, notes, and cross-system links.</p></article>';
    statusChip.textContent = 'No selection';
    return;
  }

  statusChip.textContent = project.status;

  inspector.innerHTML = `
    <article class="card inspector-grid">
      <div>
        <div class="eyebrow">Selected record</div>
        <h3>${pmEscapeHtml(project.title)}</h3>
      </div>
      <div class="tag-row">
        <span class="tag">${pmEscapeHtml(project.type)}</span>
        <span class="tag">${pmEscapeHtml(project.target_portal)}</span>
        ${(project.tags || []).map(tag => `<span class="tag">${pmEscapeHtml(tag)}</span>`).join('')}
      </div>
      <div class="field-grid">
        <div class="key-value"><strong>project_id</strong><span>${pmEscapeHtml(project.public_id)}</span></div>
        <div class="key-value"><strong>status</strong><span>${pmEscapeHtml(project.status)}</span></div>
        <div class="key-value"><strong>origin_chat_id</strong><span>${pmEscapeHtml(project.origin_chat_id || '—')}</span></div>
        <div class="key-value"><strong>next_action</strong><span>${pmEscapeHtml(project.next_action || '—')}</span></div>
      </div>
    </article>

    <article class="card link-grid">
      <div class="eyebrow">Routing map</div>
      <div class="timeline compact-timeline">
        <div class="timeline-item"><small>upstream</small><span>${pmEscapeHtml(project.origin_chat_id || 'manual-entry')} feeds this registry record.</span></div>
        <div class="timeline-item"><small>registry</small><span>${pmEscapeHtml(project.public_id)} is classified as ${pmEscapeHtml(project.type)}.</span></div>
        <div class="timeline-item"><small>downstream</small><span>${pmEscapeHtml(project.target_portal)} owns the next portal-specific move.</span></div>
      </div>
    </article>

    <article class="card link-grid">
      <div class="eyebrow">Cross-system links</div>
      <div class="key-value"><strong>recommended_pipeline_id</strong><span>${pmEscapeHtml(project.recommended_pipeline_id || '—')}</span></div>
      <div class="key-value"><strong>active_pipeline_snapshot_id</strong><span>${pmEscapeHtml(project.active_pipeline_snapshot_id || '—')}</span></div>
      <div class="key-value"><strong>linked_agent_group_id</strong><span>${pmEscapeHtml(project.linked_agent_group_id || '—')}</span></div>
      <div class="key-value"><strong>target_portal</strong><span>${pmEscapeHtml(project.target_portal || '—')}</span></div>
    </article>

    <article class="card">
      <div class="eyebrow">Notes</div>
      <p class="muted" style="margin-top:0.7rem;">${pmEscapeHtml(project.notes || 'No notes yet.')}</p>
    </article>

    <article class="card">
      <div class="eyebrow">Revision trail</div>
      <div class="timeline compact-timeline" style="margin-top:0.7rem;">
        ${(project.revisions || []).map((item, index) => `
          <div class="timeline-item">
            <small>revision ${index + 1}</small>
            <span>${pmEscapeHtml(item)}</span>
          </div>
        `).join('') || '<div class="timeline-item"><small>revisions</small><span>No revisions yet.</span></div>'}
      </div>
    </article>

    <div class="button-row">
      <button class="button" id="pinToggleBtn" type="button">${project.pinned ? 'Unpin' : 'Pin'} project</button>
      <button class="button button--primary" id="advanceStatusBtn" type="button">Advance status</button>
    </div>
  `;

  document.getElementById('pinToggleBtn').addEventListener('click', async () => {
    try {
      const updated = await pmApi(`/projects/${project.public_id}`, {
        method: 'PUT',
        body: { pinned: !project.pinned },
      });
      state.projects = state.projects.map(item => item.public_id === updated.public_id ? updated : item);
      renderTagFilters();
      renderTable();
      pmShowToast(updated.pinned ? 'Project pinned' : 'Project unpinned');
    } catch (error) {
      pmShowToast(error.message);
    }
  });

  document.getElementById('advanceStatusBtn').addEventListener('click', async () => {
    const order = ['Draft', 'Queued', 'Review', 'Active'];
    const currentIndex = order.indexOf(project.status);
    const nextStatus = order[(currentIndex + 1) % order.length];
    try {
      const updated = await pmApi(`/projects/${project.public_id}`, {
        method: 'PUT',
        body: { status: nextStatus },
      });
      state.projects = state.projects.map(item => item.public_id === updated.public_id ? updated : item);
      renderTable();
      pmShowToast(`Status set to ${updated.status}`);
    } catch (error) {
      pmShowToast(error.message);
    }
  });
}

async function loadProjects() {
  try {
    const data = await pmApi('/projects');
    state.projects = data.items || [];
    renderTagFilters();
    renderTable();
  } catch (error) {
    pmShowToast(error.message);
  }
}

function defaultManualType() {
  return document.getElementById('typeFilter').value || 'Portal';
}

function defaultManualTarget() {
  return document.getElementById('portalFilter').value || 'PortalCreator';
}

async function createManualProject() {
  try {
    const record = await pmApi('/projects', {
      method: 'POST',
      body: {
        title: 'Manual project record',
        type: defaultManualType(),
        tags: ['manual', 'registry'],
        origin_chat_id: 'manual-entry',
        target_portal: defaultManualTarget(),
        status: 'Draft',
        next_action: 'Classify, enrich, and hand off deliberately',
        notes: 'Created directly inside Projects to reinforce it as the manual source-of-truth registry.',
        revisions: ['Manual record created inside Projects'],
      },
    });
    state.projects.unshift(record);
    state.selectedId = record.public_id;
    renderTagFilters();
    renderTable();
    pmShowToast('Manual project record created');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function resetProjects() {
  await loadProjects();
  state.selectedId = state.projects[0]?.public_id || null;
  state.tagFilter = '';
  document.getElementById('projectSearch').value = '';
  document.getElementById('statusFilter').value = '';
  document.getElementById('typeFilter').value = '';
  document.getElementById('portalFilter').value = '';
  document.getElementById('pinnedOnly').checked = false;
  renderTagFilters();
  renderTable();
  pmShowToast('Project registry reloaded');
}

function attachEvents() {
  document.getElementById('projectRows').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    state.selectedId = row.dataset.id;
    renderTable();
  });

  document.getElementById('tagFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (!button) return;
    const tag = button.dataset.tag;
    state.tagFilter = state.tagFilter === tag ? '' : tag;
    renderTagFilters();
    renderTable();
  });

  ['projectSearch', 'statusFilter', 'typeFilter', 'portalFilter', 'pinnedOnly'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderTable);
    document.getElementById(id).addEventListener('change', renderTable);
  });

  document.getElementById('newProjectBtn').addEventListener('click', createManualProject);
  document.getElementById('seedProjectsBtn').addEventListener('click', resetProjects);
}

attachEvents();
loadProjects();
