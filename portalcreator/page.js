/* PortalCreator — page.js */
'use strict';

// ── Utilities ──────────────────────────────────────────────────────────────────
const API = () => (window.PM_API_BASE || 'https://pm-api.maneit.net').replace(/\/+$/, '');
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const qs  = (s, ctx = document) => ctx.querySelector(s);
const qsa = (s, ctx = document) => [...ctx.querySelectorAll(s)];

async function callApi(path, opts = {}) {
  try {
    const r = await fetch(API() + path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: {} };
  }
}

function showToast(msg, type = 'info') {
  const t = qs('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast--visible${type === 'good' ? ' toast--good' : type === 'bad' ? ' toast--bad' : ''}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  projects:         [],
  pipelines:        [],
  activeProjectId:  localStorage.getItem('pc_project_id') || null,
  activeProject:    null,
  activePipelineId: localStorage.getItem('pc_pipeline_id') || null,
  activePipeline:   null,
  activeTarget:     localStorage.getItem('pc_target') || 'frontend',
  sections:         JSON.parse(localStorage.getItem('pc_sections') || '[]'),
  brief:            JSON.parse(localStorage.getItem('pc_brief') || '{}'),
  jobId:            null,
  jobStatus:        'idle',
  artifacts:        [],
  runs:             [],
  pollTimer:        null,
};

// ── Pipeline type → icon map ───────────────────────────────────────────────────
const PIPELINE_ICONS = {
  web_design:       '🌐',
  creative_writing: '✍️',
  game_design:      '🎮',
  windows_software: '💻',
  research:         '🔬',
};

// ── Default sections by stack target ──────────────────────────────────────────
const DEFAULT_SECTIONS = {
  frontend: [
    { id: 'hero',       name: 'Hero',         note: 'Headline, tagline, CTA buttons' },
    { id: 'services',   name: 'Services',      note: '3 service cards' },
    { id: 'howitworks', name: 'How it works',  note: '3-4 steps' },
    { id: 'about',      name: 'About',         note: 'Who you are, why you do it' },
    { id: 'contact',    name: 'Contact',       note: 'Contact form with response promise' },
  ],
};

// ── Objective assembler ────────────────────────────────────────────────────────
function assembleBrief() {
  const name     = qs('#briefName')?.value?.trim()     || '';
  const tagline  = qs('#briefTagline')?.value?.trim()  || '';
  const audience = qs('#briefAudience')?.value?.trim() || '';
  const location = qs('#briefLocation')?.value?.trim() || '';
  const services = qs('#briefServices')?.value?.trim() || '';
  const design   = qs('#briefDesign')?.value?.trim()   || '';
  const tech     = qs('#briefTech')?.value?.trim()     || '';
  const notes    = qs('#briefNotes')?.value?.trim()    || '';

  const sectionList = state.sections.map(s => `- ${s.name}${s.note ? ': ' + s.note : ''}`).join('\n');

  let parts = [];
  if (name)      parts.push(`Build a complete, deployable landing page for ${name}.`);
  if (tagline)   parts.push(`Tagline: "${tagline}"`);
  if (location)  parts.push(`Location/context: ${location}`);
  if (audience)  parts.push(`Target audience: ${audience}`);
  if (services)  parts.push(`Services:\n${services}`);
  if (sectionList) parts.push(`Required sections:\n${sectionList}`);
  if (design)    parts.push(`Design direction:\n${design}`);
  if (tech)      parts.push(`Technical requirements:\n${tech}`);
  if (notes)     parts.push(`Additional notes:\n${notes}`);

  return parts.join('\n\n');
}

function updateObjectivePreview() {
  const el = qs('#objectiveText');
  if (!el) return;
  const obj = assembleBrief();
  el.textContent = obj || 'Fill in the brief fields above to see the assembled objective.';
}

// ── Brief form ────────────────────────────────────────────────────────────────
function loadBriefFields() {
  const b = state.brief;
  const set = (id, val) => { const el = qs('#' + id); if (el) el.value = val || ''; };
  set('briefName',     b.name);
  set('briefTagline',  b.tagline);
  set('briefAudience', b.audience);
  set('briefLocation', b.location);
  set('briefServices', b.services);
  set('briefDesign',   b.design);
  set('briefTech',     b.tech);
  set('briefNotes',    b.notes);
  updateObjectivePreview();
}

function saveBrief() {
  state.brief = {
    name:     qs('#briefName')?.value?.trim()     || '',
    tagline:  qs('#briefTagline')?.value?.trim()  || '',
    audience: qs('#briefAudience')?.value?.trim() || '',
    location: qs('#briefLocation')?.value?.trim() || '',
    services: qs('#briefServices')?.value?.trim() || '',
    design:   qs('#briefDesign')?.value?.trim()   || '',
    tech:     qs('#briefTech')?.value?.trim()     || '',
    notes:    qs('#briefNotes')?.value?.trim()    || '',
  };
  localStorage.setItem('pc_brief', JSON.stringify(state.brief));
  updateObjectivePreview();
  updateLaunchSummary();
  showToast('Brief saved', 'good');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tabId) {
  qsa('.tab').forEach(t => t.classList.toggle('tab--active', t.dataset.tab === tabId));
  qsa('.tab-pane').forEach(p => {
    p.classList.toggle('tab-pane--active', p.id === 'tab-' + tabId);
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────
async function loadProjects() {
  const r = await callApi('/api/projects');
  if (!r.ok) return;
  state.projects = r.body?.items || [];
  renderProjects();
  if (state.activeProjectId) {
    const found = state.projects.find(p => p.public_id === state.activeProjectId);
    if (found) selectProject(found, false);
  }
}

function renderProjects() {
  const el = qs('#projectList');
  if (!el) return;
  if (!state.projects.length) {
    el.innerHTML = `<div class="empty-state">No projects yet.</div>`;
    return;
  }
  el.innerHTML = state.projects.map(p => `
    <button class="project-item ${p.public_id === state.activeProjectId ? 'project-item--active' : ''}"
            data-pid="${esc(p.public_id)}" type="button">
      <span class="project-icon">🌐</span>
      <span class="project-body">
        <span class="project-name">${esc(p.title || p.name || 'Untitled')}</span>
        <span class="project-meta">${esc(p.status || 'draft')} · ${esc(p.type || 'portal')}</span>
      </span>
    </button>
  `).join('');

  qsa('.project-item', el).forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      const proj = state.projects.find(p => p.public_id === pid);
      if (proj) selectProject(proj);
    });
  });
}

function selectProject(proj, saveLocal = true) {
  state.activeProjectId = proj.public_id;
  state.activeProject   = proj;
  if (saveLocal) localStorage.setItem('pc_project_id', proj.public_id);

  // Update UI
  qsa('.project-item').forEach(btn => {
    btn.classList.toggle('project-item--active', btn.dataset.pid === proj.public_id);
  });

  const chip = qs('#activeProjectChip');
  if (chip) { chip.textContent = proj.title || proj.name || 'Project'; }

  const tabName = qs('#tabProjectName');
  if (tabName) tabName.textContent = proj.title || proj.name || 'Project';

  // Load brief from project if available
  if (proj.brief_json) {
    try { state.brief = JSON.parse(proj.brief_json); } catch {}
    loadBriefFields();
  }

  updateLaunchSummary();
  loadRunHistory();
}

// ── Stack target ──────────────────────────────────────────────────────────────
function selectTarget(target) {
  state.activeTarget = target;
  localStorage.setItem('pc_target', target);
  qsa('.stack-btn').forEach(btn => {
    btn.classList.toggle('stack-btn--active', btn.dataset.target === target);
  });
  updateLaunchSummary();
}

// ── Pipelines ─────────────────────────────────────────────────────────────────
async function loadPipelines() {
  const r = await callApi('/api/pipelines');
  if (!r.ok) return;
  state.pipelines = (r.body?.items || []).map(p => ({
    id:          p.public_id || p.id,
    title:       p.title || p.name || 'Untitled',
    type:        p.type || '',
    description: p.description || '',
    stageList:   (() => { try { return JSON.parse(p.stages || '[]'); } catch { return []; } })(),
  }));
  renderPipelineList();
  if (state.activePipelineId) {
    const found = state.pipelines.find(p => p.id === state.activePipelineId);
    if (found) selectPipeline(found, false);
  }
}

function renderPipelineList() {
  const el = qs('#pipelineList');
  if (!el) return;
  if (!state.pipelines.length) {
    el.innerHTML = `<div class="empty-state">No pipelines found.</div>`;
    return;
  }
  el.innerHTML = state.pipelines.map(p => `
    <button class="pipeline-item ${p.id === state.activePipelineId ? 'pipeline-item--active' : ''}"
            data-pid="${esc(p.id)}" type="button">
      <span class="pipeline-icon">${PIPELINE_ICONS[p.type] || '⚙️'}</span>
      <span>
        <span class="pipeline-name">${esc(p.title)}</span>
        <span class="pipeline-desc">${esc(p.description || p.type)}</span>
      </span>
    </button>
  `).join('');

  qsa('.pipeline-item', el).forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      const pl  = state.pipelines.find(p => p.id === pid);
      if (pl) selectPipeline(pl);
    });
  });
}

function selectPipeline(pl, saveLocal = true) {
  state.activePipelineId = pl.id;
  state.activePipeline   = pl;
  if (saveLocal) localStorage.setItem('pc_pipeline_id', pl.id);

  qsa('.pipeline-item').forEach(btn => {
    btn.classList.toggle('pipeline-item--active', btn.dataset.pid === pl.id);
  });

  const title = qs('#pipelineTitle');
  const meta  = qs('#pipelineMeta');
  if (title) title.textContent = pl.title;
  if (meta)  meta.textContent  = `${pl.stageList.length} stages · ${pl.description || pl.type}`;

  renderStageList(pl.stageList);
  updateLaunchSummary();
}

function renderStageList(stages) {
  const el = qs('#stageList');
  if (!el) return;
  if (!stages?.length) {
    el.innerHTML = `<div class="empty-state">No stages defined.</div>`;
    return;
  }
  const typeLabels = { input:'input', transform:'plan', build:'build', verify:'verify', handoff:'output' };
  el.innerHTML = stages.map((s, i) => `
    <div class="stage-item">
      <div class="stage-num">${i + 1}</div>
      <div class="stage-body">
        <div class="stage-title">${esc(s.title || s.id)}</div>
        <div class="stage-desc">${esc(s.summary || s.desc || '')}</div>
      </div>
      <span class="stage-badge">${esc(typeLabels[s.kind] || s.kind || s.role || '')}</span>
    </div>
  `).join('');
}

// ── Sections ──────────────────────────────────────────────────────────────────
function renderSections() {
  const el = qs('#sectionList');
  if (!el) return;
  if (!state.sections.length) {
    el.innerHTML = `<div class="empty-state">No sections defined. Add sections or load defaults.</div>`;
    return;
  }
  el.innerHTML = state.sections.map((s, i) => `
    <div class="section-item" data-idx="${i}">
      <span class="section-drag">⠿</span>
      <span class="section-num">${i + 1}</span>
      <span class="section-body">
        <span class="section-name">${esc(s.name)}</span>
        ${s.note ? `<span class="section-note">${esc(s.note)}</span>` : ''}
      </span>
      <button class="section-del" data-idx="${i}" type="button" title="Remove">✕</button>
    </div>
  `).join('');

  qsa('.section-del', el).forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      state.sections.splice(idx, 1);
      saveSections();
      renderSections();
      updateObjectivePreview();
    });
  });
}

function saveSections() {
  localStorage.setItem('pc_sections', JSON.stringify(state.sections));
}

function addSection() {
  const name = prompt('Section name (e.g. Hero, Services, About):');
  if (!name?.trim()) return;
  const note = prompt('Short description (optional):') || '';
  state.sections.push({ id: name.toLowerCase().replace(/\s+/g, '_'), name: name.trim(), note: note.trim() });
  saveSections();
  renderSections();
  updateObjectivePreview();
}

function loadDefaultSections() {
  const defaults = DEFAULT_SECTIONS[state.activeTarget] || DEFAULT_SECTIONS.frontend;
  state.sections = [...defaults];
  saveSections();
  renderSections();
  updateObjectivePreview();
}

// ── Launch summary ────────────────────────────────────────────────────────────
const TARGET_LABELS = {
  'frontend':          'Frontend only',
  'frontend+backend':  'Frontend + Backend',
  'full-infra':        'Full infrastructure',
  'hardware-setup':    'Hardware setup',
};

function updateLaunchSummary() {
  const lsProject  = qs('#lsProject');
  const lsPipeline = qs('#lsPipeline');
  const lsTarget   = qs('#lsTarget');
  const launchBtn  = qs('#launchBtn');

  if (lsProject)  lsProject.textContent  = state.activeProject?.title || state.activeProject?.name || '—';
  if (lsPipeline) lsPipeline.textContent = state.activePipeline?.title || '—';
  if (lsTarget)   lsTarget.textContent   = TARGET_LABELS[state.activeTarget] || state.activeTarget;

  const ready = state.activeProject && state.activePipeline;
  if (launchBtn) launchBtn.disabled = !ready || state.jobStatus === 'running';
}

// ── Launch ────────────────────────────────────────────────────────────────────
async function launchPipeline() {
  if (!state.activeProject || !state.activePipeline) {
    showToast('Select a project and pipeline first', 'bad');
    return;
  }

  const objective = assembleBrief();
  if (!objective.trim()) {
    showToast('Fill in the Brief tab before launching', 'bad');
    switchTab('brief');
    return;
  }

  const launchBtn = qs('#launchBtn');
  if (launchBtn) { launchBtn.disabled = true; launchBtn.textContent = '⏳ Launching…'; }

  const r = await callApi(`/api/pipelines/${state.activePipeline.id}/run`, {
    method: 'POST',
    body: JSON.stringify({
      objective,
      surface:        'pipelines',
      execution_mode: 'flat',
      selected_models: [],
    }),
  });

  if (!r.ok) {
    showToast('Launch failed: ' + (r.body?.detail || r.status), 'bad');
    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = '▶ Launch Pipeline'; }
    return;
  }

  state.jobId     = r.body.job_id;
  state.jobStatus = 'running';

  showToast(`Pipeline launched — ${state.jobId}`, 'good');
  logLine(`▶ Launched ${state.jobId}`, 'good');

  setJobBar('running', `Running: ${state.jobId}`, 'polling for updates…');
  showRunStatusPanel();
  startPolling();
  updateLaunchSummary();
}

// ── Job bar ───────────────────────────────────────────────────────────────────
function setJobBar(status, label, meta) {
  const dot   = qs('#jobDot');
  const lbl   = qs('#jobLabel');
  const m     = qs('#jobMeta');
  const chip  = qs('#jobChip');
  if (dot)  dot.className   = `job-dot${status === 'running' ? ' job-dot--running' : status === 'error' ? ' job-dot--error' : ''}`;
  if (lbl)  lbl.textContent = label;
  if (m)    m.textContent   = meta;
  if (chip) chip.textContent = status;
}

// ── Run status panel ──────────────────────────────────────────────────────────
function showRunStatusPanel() {
  const panel = qs('#runStatusPanel');
  if (panel) panel.style.display = '';
}

function updateRunStatusPanel(nodeStates) {
  const el = qs('#stageProgress');
  if (!el) return;
  if (!nodeStates || !Object.keys(nodeStates).length) return;
  el.innerHTML = Object.entries(nodeStates).map(([nid, ns]) => {
    const status = ns.status || 'queued';
    return `
      <div class="progress-item">
        <span class="progress-dot${status === 'running' ? ' progress-dot--running' : status === 'done' ? ' progress-dot--done' : status === 'failed' ? ' progress-dot--failed' : ''}"></span>
        <span>${esc(ns.title || nid)}</span>
        <span class="muted" style="margin-left:auto;font-size:10px;">${esc(status)}</span>
      </div>
    `;
  }).join('');
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(pollJob, 3000);
}

function stopPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function pollJob() {
  if (!state.jobId) return;
  const r = await callApi(`/api/pipelines/runs/${state.jobId}`);
  if (!r.ok) return;

  const job = r.body;
  const status = job.status || 'running';

  updateRunStatusPanel(job.node_states);

  if (status === 'completed' || status === 'partial' || status === 'failed') {
    stopPolling();
    state.jobStatus = status;

    const launchBtn = qs('#launchBtn');
    if (launchBtn) { launchBtn.disabled = false; launchBtn.textContent = '▶ Launch Pipeline'; }

    const statusChip = qs('#runStatusChip');
    if (statusChip) {
      statusChip.textContent = status;
      statusChip.className = `status-chip${status === 'completed' ? '' : status === 'failed' ? ' status-chip--bad' : ' status-chip--warn'}`;
    }

    setJobBar(
      status === 'failed' ? 'error' : 'idle',
      status === 'completed' ? `Completed: ${state.jobId}` : `${status}: ${state.jobId}`,
      status === 'completed' ? 'Pipeline finished. Check artifacts.' : 'Check execution log for details.',
    );

    logLine(`■ Job ${status}: ${state.jobId}`, status === 'completed' ? 'good' : 'bad');
    showToast(`Pipeline ${status}`, status === 'completed' ? 'good' : 'bad');

    await loadArtifacts();
    loadRunHistory();
    updateLaunchSummary();

    // Auto-assemble for web pipelines
    if (status !== 'failed' && state.activePipeline?.type === 'web_design') {
      await assembleOutput();
    }
  }
}

// ── Artifacts ─────────────────────────────────────────────────────────────────
async function loadArtifacts() {
  if (!state.jobId) return;
  const r = await callApi(`/api/pipelines/${state.activePipeline?.id}/artifacts?job_id=${state.jobId}`);
  if (!r.ok) return;
  state.artifacts = r.body?.items || [];
  renderArtifacts();
}

function renderArtifacts() {
  const el = qs('#artifactList');
  const count = qs('#artifactCount');
  if (!el) return;
  if (count) count.textContent = state.artifacts.length;
  if (!state.artifacts.length) {
    el.innerHTML = `<div class="empty-state">No artifacts yet.</div>`;
    return;
  }
  el.innerHTML = state.artifacts.map(a => `
    <button class="artifact-item" data-aid="${esc(a.public_id || a.id)}" type="button">
      <span>
        <span class="artifact-name">${esc(a.title || 'Artifact')}</span>
        <span class="artifact-meta">${esc(a.artifact_type || '')} · ${a.content?.length || 0} chars</span>
      </span>
    </button>
  `).join('');
}

// ── Auto-assemble ─────────────────────────────────────────────────────────────
async function assembleOutput() {
  if (!state.jobId || !state.activePipeline) return;
  logLine('⚙ Assembling output…', 'good');
  const r = await callApi(`/api/pipelines/${state.activePipeline.id}/assemble/${state.jobId}`, { method: 'POST' });
  if (r.ok && r.body?.assembled) {
    logLine(`✓ Assembled: ${r.body.chars} chars`, 'good');
    showToast(`Output assembled — ${r.body.chars} chars`, 'good');
    loadPreview();
  } else {
    logLine('⚠ Assembly failed or not applicable', 'warn');
  }
}

// ── Preview ───────────────────────────────────────────────────────────────────
async function loadPreview() {
  const wrap = qs('#previewWrap');
  if (!wrap || !state.jobId) return;
  // Try to load assembled artifact
  const assembled = state.artifacts.find(a => a.artifact_type === 'assembled_html');
  if (assembled?.content) {
    const blob = new Blob([assembled.content], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    wrap.innerHTML = `<iframe class="preview-iframe" src="${url}"></iframe>`;
    return;
  }
  wrap.innerHTML = `<div class="empty-state" style="padding:40px;">No assembled output yet. Run the pipeline first.</div>`;
}

// ── Run history ───────────────────────────────────────────────────────────────
async function loadRunHistory() {
  if (!state.activePipeline) return;
  const r = await callApi(`/api/pipelines/${state.activePipeline.id}/runs?limit=10`);
  if (!r.ok) return;
  const runs = r.body?.items || [];
  const el = qs('#runHistory');
  if (!el) return;
  if (!runs.length) {
    el.innerHTML = `<div class="empty-state">No runs yet.</div>`;
    return;
  }
  el.innerHTML = runs.map(run => `
    <button class="run-item" data-rid="${esc(run.public_id || run.id)}" type="button">
      <div class="run-id">${esc(run.public_id || run.id)}</div>
      <div class="run-meta">${esc(run.status || 'unknown')} · ${esc(run.created_at?.slice(0,16) || '')}</div>
    </button>
  `).join('');
}

// ── Exec log ──────────────────────────────────────────────────────────────────
function logLine(text, type = '') {
  const el = qs('#execLog');
  if (!el) return;
  const placeholder = el.querySelector('.empty-state') || el.querySelector('.muted');
  if (placeholder?.textContent === 'No activity yet.') placeholder.remove();
  const line = document.createElement('div');
  line.className = `log-line${type ? ' ' + type : ''}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Tabs
  qsa('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // Stack targets
  qsa('.stack-btn').forEach(btn => {
    btn.addEventListener('click', () => selectTarget(btn.dataset.target));
  });
  selectTarget(state.activeTarget);

  // Brief form — live preview
  qsa('#briefName,#briefTagline,#briefAudience,#briefLocation,#briefServices,#briefDesign,#briefTech,#briefNotes').forEach(el => {
    el?.addEventListener('input', updateObjectivePreview);
  });

  // Save brief
  qs('#saveBriefBtn')?.addEventListener('click', saveBrief);

  // Sections
  qs('#addSectionBtn')?.addEventListener('click', addSection);

  // Launch
  qs('#launchBtn')?.addEventListener('click', launchPipeline);

  // Refresh
  qs('#refreshBtn')?.addEventListener('click', async () => {
    await loadProjects();
    await loadPipelines();
    showToast('Refreshed', 'good');
  });

  // View code / download
  qs('#viewCodeBtn')?.addEventListener('click', () => {
    const assembled = state.artifacts.find(a => a.artifact_type === 'assembled_html');
    if (assembled?.content) {
      const win = window.open();
      win.document.write('<pre style="font:12px monospace;white-space:pre-wrap;">' +
        assembled.content.replace(/</g,'&lt;') + '</pre>');
    }
  });

  qs('#downloadBtn')?.addEventListener('click', () => {
    const assembled = state.artifacts.find(a => a.artifact_type === 'assembled_html');
    if (!assembled?.content) { showToast('No output to download', 'bad'); return; }
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([assembled.content], { type: 'text/html' }));
    a.download = 'index.html';
    a.click();
  });

  // Load data
  loadBriefFields();
  renderSections();
  await loadProjects();
  await loadPipelines();

  // If no sections, load defaults
  if (!state.sections.length) loadDefaultSections();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
