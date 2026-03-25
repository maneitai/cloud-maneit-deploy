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
  pmShowToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2000);
}

function pmEscapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pmNowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const modeExplanations = {
  single: {
    label: 'Direct reply',
    promptHint: 'Ask one model for a focused creative move.',
  },
  parallel: {
    label: 'Parallel compare',
    promptHint: 'Run the same creative prompt across multiple models to compare directions.',
  },
  discussion: {
    label: 'Open discussion',
    promptHint: 'Use a lead lane with support models for critique, refinement, and extension.',
  },
};

const state = {
  overview: null,
  selectedLibraryId: null,
  selectedBookId: null,
  selectedStageId: null,
  activeTab: 'manuscript',
  activeDock: 'setup',
  chatSessionId: 'chat-lore-01',
  modelPool: [],
  modelCatalog: [],
  modelOverview: null,
  selectedPanel: { selected: [], active: [] },
  activeLeases: [],
  mode: 'discussion',
  models: [],
};

function selectedBook() {
  return state.overview?.books?.find(book => book.public_id === state.selectedBookId) || state.overview?.selected_book || null;
}

function selectedStage() {
  return state.overview?.pipeline?.stages?.find(stage => stage.id === state.selectedStageId) || state.overview?.pipeline?.stages?.[0] || null;
}

function currentSession() {
  return state.overview?.chat_session || null;
}

function guessExportTitle(text = '', exportType = 'note') {
  const manual = document.getElementById('exportTitleInput')?.value?.trim();
  if (manual) return manual;
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    const book = selectedBook();
    return book ? `${book.title} ${exportType}` : `Lore ${exportType}`;
  }
  const words = cleaned.split(' ').slice(0, 6).join(' ');
  return words.length > 4 ? words : `Lore ${exportType}`;
}

function actionMarkup(text, sourceLabel = '') {
  const encoded = encodeURIComponent(text || '');
  const label = encodeURIComponent(sourceLabel || guessExportTitle(text, 'note'));
  const types = [
    ['note', 'Note'],
    ['draft', 'Draft'],
    ['scene', 'Scene'],
    ['character', 'Character'],
    ['world', 'World'],
  ];
  return `
    <div class="message-actions">
      ${types.map(([type, labelText]) => `
        <button
          type="button"
          class="message-action"
          data-export-type="${type}"
          data-export-content="${encoded}"
          data-export-title="${label}"
        >${labelText}</button>
      `).join('')}
    </div>
  `;
}

function renderLibrarySelect() {
  const select = document.getElementById('librarySelect');
  select.innerHTML = (state.overview?.libraries || []).map(library => `
    <option value="${library.public_id}" ${library.public_id === state.selectedLibraryId ? 'selected' : ''}>
      ${pmEscapeHtml(library.name)}
    </option>
  `).join('');
}

function renderLibrarySummary() {
  const library = state.overview?.selected_library;
  const card = document.getElementById('librarySummary');
  if (!library) {
    card.innerHTML = '<p class="muted">No library loaded.</p>';
    return;
  }
  card.innerHTML = `
    <div class="eyebrow">Library</div>
    <h3>${pmEscapeHtml(library.name)}</h3>
    <p class="muted" style="margin-top:0.7rem;">${pmEscapeHtml(library.description || '')}</p>
    <div class="metric-grid" style="margin-top:0.8rem;">
      <article class="metric-card"><small>Books</small><strong>${state.overview.books.length}</strong></article>
      <article class="metric-card"><small>Worlds</small><strong>${state.overview.worlds.length}</strong></article>
      <article class="metric-card"><small>Characters</small><strong>${state.overview.characters.length}</strong></article>
      <article class="metric-card"><small>Notes</small><strong>${state.overview.notes.length}</strong></article>
    </div>
  `;
}

function renderBookList() {
  const container = document.getElementById('bookList');
  container.innerHTML = (state.overview?.books || []).map(book => `
    <article class="list-item ${book.public_id === state.selectedBookId ? 'list-item--active' : ''}" data-book="${book.public_id}">
      <div class="meta"><span>${pmEscapeHtml(book.status)}</span><span>${pmEscapeHtml(book.genre || 'Unspecified')}</span></div>
      <strong>${pmEscapeHtml(book.title)}</strong>
      <p class="muted">${pmEscapeHtml(book.premise || 'No premise yet.')}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No books in this library yet.</p></article>';
}

function renderThreadList() {
  const container = document.getElementById('threadList');
  container.innerHTML = (state.overview?.chat_threads || []).map(thread => `
    <article class="card thread-card ${thread.public_id === state.chatSessionId ? 'list-item--active' : ''}" data-thread="${thread.public_id}">
      <div class="meta"><span>${pmEscapeHtml(thread.mode)}</span><span>${thread.pinned ? 'Pinned' : 'Recent'}</span></div>
      <strong>${pmEscapeHtml(thread.title)}</strong>
      <p class="muted">${pmEscapeHtml(thread.excerpt || thread.summary || '')}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No creative threads yet.</p></article>';
}

function renderNoteList() {
  const container = document.getElementById('noteList');
  container.innerHTML = (state.overview?.notes || []).slice(0, 4).map(note => `
    <article class="card note-card">
      <div class="meta"><span>${pmEscapeHtml(note.category || 'note')}</span><span>${pmEscapeHtml((note.tags || []).join(', '))}</span></div>
      <strong>${pmEscapeHtml(note.title)}</strong>
      <p class="muted">${pmEscapeHtml(note.content || '')}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No notes captured yet.</p></article>';
}

function renderDraftList() {
  const container = document.getElementById('draftList');
  container.innerHTML = (state.overview?.drafts || []).slice(0, 4).map(draft => `
    <article class="card draft-card">
      <div class="meta"><span>${pmEscapeHtml(draft.stage || 'draft')}</span><span>v${pmEscapeHtml(String(draft.version || 1))}</span></div>
      <strong>${pmEscapeHtml(draft.label)}</strong>
      <p class="muted">${pmEscapeHtml((draft.content || '').slice(0, 160))}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No draft snapshots yet.</p></article>';
}

function renderBookFields() {
  const book = selectedBook();
  document.getElementById('selectedBookTitle').textContent = book ? book.title : 'Select or create a book';
  document.getElementById('selectedBookMeta').textContent = book
    ? `${book.status} · ${book.genre || 'Unspecified'} · ${book.current_word_count || 0} words`
    : 'Creative discussion is the main workspace. Promote the best material straight into the library.';
  document.getElementById('currentBookDisplay').value = book ? book.title : 'No book selected';
  if (!book) {
    return;
  }
  document.getElementById('bookTitle').value = book.title || '';
  document.getElementById('bookGenre').value = book.genre || '';
  document.getElementById('wordGoal').value = book.word_goal || 80000;
  document.getElementById('bookPremise').value = book.premise || '';
  document.getElementById('outlineText').value = book.outline || '';
  document.getElementById('manuscriptText').value = book.manuscript || '';
}

function renderTabs() {
  document.querySelectorAll('#loreTabNav [data-tab]').forEach(button => {
    button.classList.toggle('list-item--active', button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll('.lore-tab').forEach(section => {
    section.classList.toggle('is-active', section.dataset.tab === state.activeTab);
  });
}

function renderDock() {
  document.querySelectorAll('#loreRail [data-dock-view]').forEach(section => {
    section.open = section.dataset.dockView === state.activeDock;
  });
}

function renderRailSummaries() {
  const modeLabel = modeExplanations[state.mode]?.label || 'Open discussion';
  const modelCount = state.models.length;
  const loaded = state.modelOverview?.counts?.loaded || 0;
  const active = (state.activeLeases || []).length;
  const stage = selectedStage()?.name || selectedStage()?.id || 'capture';
  const catalogTotal = (state.modelCatalog || []).length;
  const selectableCount = (state.modelCatalog || []).filter(item => item.selectable).length;
  const session = currentSession();
  setText('modeLabelDock', modeLabel);
  setText('setupSummary', `${modeLabel} · ${modelCount} model${modelCount === 1 ? '' : 's'}`);
  setText('runtimeSummary', `${active} active · ${loaded} loaded`);
  setText('catalogSummary', `${selectableCount}/${catalogTotal} ready`);
  setText('outputSummary', `${stage} stage`);
  setText('selectedModelCount', String(modelCount));
  setText('activeLaneCount', String(active));
  setText('poolLoadedCountMini', String(loaded));
  setText('activeStageMini', String(stage));
  setText('chatSessionLabel', session?.public_id || state.chatSessionId || 'chat-lore-01');
  setText('bookContextLine', selectedBook()?.premise || selectedBook()?.summary || 'Keep the chat exploratory. Save notes, scenes, or drafts only when they are worth keeping.');
}

function renderWorlds() {
  const container = document.getElementById('worldList');
  container.innerHTML = (state.overview?.worlds || []).map(world => `
    <article class="card entity-card">
      <div class="meta"><span>${pmEscapeHtml(world.canon_state || 'draft')}</span><span>${pmEscapeHtml((world.locations || []).length + ' locations')}</span></div>
      <strong>${pmEscapeHtml(world.name)}</strong>
      <p class="muted">${pmEscapeHtml(world.summary || '')}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No world objects yet.</p></article>';
}

function renderCharacters() {
  const container = document.getElementById('characterList');
  container.innerHTML = (state.overview?.characters || []).map(character => `
    <article class="card entity-card">
      <div class="meta"><span>${pmEscapeHtml(character.role)}</span><span>${pmEscapeHtml((character.traits || []).join(', '))}</span></div>
      <strong>${pmEscapeHtml(character.name)}</strong>
      <p class="muted">${pmEscapeHtml(character.summary || '')}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No characters yet.</p></article>';
}

function renderScenes() {
  const container = document.getElementById('sceneList');
  container.innerHTML = (state.overview?.scenes || []).map(scene => `
    <article class="card entity-card">
      <div class="meta"><span>#${pmEscapeHtml(String(scene.order_index))}</span><span>${pmEscapeHtml(scene.status)}</span></div>
      <strong>${pmEscapeHtml(scene.title)}</strong>
      <p class="muted">${pmEscapeHtml(scene.summary || '')}</p>
    </article>
  `).join('') || '<article class="card"><p class="muted">No scenes yet.</p></article>';
}

function renderStages() {
  const container = document.getElementById('stageControls');
  container.innerHTML = (state.overview?.pipeline?.stages || []).map(stage => `
    <button type="button" class="stage-pill ${stage.id === state.selectedStageId ? 'is-active' : ''}" data-stage="${stage.id}">
      ${pmEscapeHtml(stage.title)}
    </button>
  `).join('');
  const stage = selectedStage();
  document.getElementById('stageStatusCopy').textContent = stage
    ? `${stage.title} ready for ${selectedBook()?.title || 'current book'}.`
    : 'Select a stage to run.';
}

function renderAgentGroup() {
  document.getElementById('agentGroup').innerHTML = (state.overview?.team?.member_names || []).map(name => `
    <span class="portal-step">${pmEscapeHtml(name)}</span>
  `).join('');
}

function renderMetrics() {
  const book = selectedBook();
  document.getElementById('executionStatus').textContent = book?.status || 'Idle';
  document.getElementById('wordCount').textContent = book?.current_word_count || 0;
  document.getElementById('wordGoalPreview').textContent = book?.word_goal || 0;
  document.getElementById('activeStage').textContent = book?.active_stage || 'capture';
}

function renderExportTargets() {
  const container = document.getElementById('exportTargets');
  container.innerHTML = (state.overview?.export_targets || []).map(target => `
    <article class="export-target-card">
      <strong>${pmEscapeHtml(target.label)}</strong>
      <p class="muted">${pmEscapeHtml(target.description || '')}</p>
    </article>
  `).join('');
}

function renderModelOptions() {
  const modelOptions = document.getElementById('modelOptions');
  if (!modelOptions) return;
  if (!state.models.length) {
    modelOptions.innerHTML = '<p class="muted">No creative participants selected yet.</p>';
    return;
  }
  modelOptions.innerHTML = state.models.map(model => `
    <button type="button" class="model-toggle model-toggle--active" data-model="${pmEscapeHtml(model)}">
      <span>●</span>
      <span>${pmEscapeHtml(model)}</span>
      <span aria-hidden="true">×</span>
    </button>
  `).join('');
}

function renderSelectedPanel() {
  const container = document.getElementById('selectedPanelList');
  if (!container) return;
  const items = state.models.map(name => state.modelCatalog.find(item => item.name === name || item.display_name === name || item.alias === name)).filter(Boolean);
  if (!items.length) {
    container.innerHTML = '<p class="muted">Choose creative participants from the catalog to build the session roster.</p>';
    return;
  }
  container.innerHTML = items.map(item => `
    <article class="card lane-card lane-card--${statusTone(item.runtime_state || item.catalog_state || 'available')}">
      <div class="meta"><span>${pmEscapeHtml(item.family || 'other')}</span><span>${pmEscapeHtml(item.catalog_state || item.runtime_state || 'catalog')}</span></div>
      <strong>${pmEscapeHtml(item.display_name || item.name || item.alias || 'model')}</strong>
      <small>${pmEscapeHtml((item.roles || []).slice(0, 4).join(' · ') || 'general')}</small>
    </article>
  `).join('');
}

function renderCatalog() {
  const container = document.getElementById('modelCatalogList');
  if (!container) return;
  const items = state.modelCatalog || [];
  if (!items.length) {
    container.innerHTML = '<p class="muted">No catalog items discovered yet.</p>';
    return;
  }
  container.innerHTML = items.map(item => {
    const selected = state.models.includes(item.name) || state.models.includes(item.display_name) || state.models.includes(item.alias);
    let action = 'toggle';
    let actionLabel = selected ? 'Selected' : 'Add to panel';
    let disabled = false;
    let toneClass = selected ? 'button--primary' : '';
    if (!item.selectable && item.profile_exists && !item.materialized) {
      action = 'materialize';
      actionLabel = 'Materialize';
    } else if (!item.profile_exists && item.source === 'disk') {
      action = 'draft-profile';
      actionLabel = 'Draft profile';
      toneClass = 'button--ghost';
    } else if (!item.selectable) {
      action = 'noop';
      actionLabel = 'On disk';
      disabled = true;
      toneClass = 'button--ghost';
    }
    return `
      <article class="card catalog-card catalog-card--${statusTone(item.runtime_state || item.catalog_state || 'available')}">
        <div class="meta"><span>${pmEscapeHtml(item.family || 'other')}</span><span>${pmEscapeHtml(item.catalog_state || 'catalog')}</span></div>
        <strong>${pmEscapeHtml(item.display_name || item.name || item.alias || 'model')}</strong>
        <small>${pmEscapeHtml((item.roles || []).slice(0, 4).join(' · ') || 'general')}</small>
        <div class="button-row button-row--compact" style="margin-top:0.6rem;">
          <button type="button" class="button ${toneClass}" data-catalog-model="${pmEscapeHtml(item.name || item.display_name || item.alias)}" data-catalog-action="${pmEscapeHtml(action)}" ${disabled ? 'disabled' : ''}>${actionLabel}</button>
        </div>
        <p class="muted">${pmEscapeHtml(item.notes || item.endpoint || item.gguf_path || '')}</p>
      </article>
    `;
  }).join('');
}

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

function renderActiveLanes() {
  const container = document.getElementById('activeLaneList');
  const leases = state.activeLeases || [];
  if (!container) return;
  if (!leases.length) {
    container.innerHTML = '<p class="muted">No active creative lanes yet. Run a prompt to lease the current discussion models.</p>';
    return;
  }
  container.innerHTML = leases.map(lease => {
    const model = lease.model || {};
    return `
      <article class="card lane-card lane-card--${statusTone(model.runtime_state || 'available')}">
        <div class="meta"><span>${pmEscapeHtml(lease.role || 'lane')}</span><span>${pmEscapeHtml(model.runtime_state || 'available')}</span></div>
        <strong>${pmEscapeHtml(model.name || lease.model_public_id || 'model')}</strong>
        <p class="muted">${pmEscapeHtml(model.local_endpoint || 'endpoint pending')}</p>
      </article>
    `;
  }).join('');
}

function renderPoolSummary() {
  const overview = state.modelOverview || { counts: {}, control_mode: 'observe' };
  const counts = overview.counts || {};
  document.getElementById('poolControlMode').textContent = overview.control_mode || 'observe';
  document.getElementById('poolLoadedCount').textContent = String(counts.loaded || 0);
  document.getElementById('poolStartingCount').textContent = String(counts.starting || 0);
  document.getElementById('poolFailedCount').textContent = String(counts.failed || 0);
  document.getElementById('poolCatalogCount').textContent = String(counts.catalog_total || 0);
  document.getElementById('poolCatalogDiskCount').textContent = String(counts.catalog_on_disk || 0);
}

function renderModeOptions() {
  document.querySelectorAll('#modeOptions .list-item').forEach(item => {
    const input = item.querySelector('input');
    item.classList.toggle('list-item--active', input.value === state.mode);
    input.checked = input.value === state.mode;
  });
  document.getElementById('modeLabel').textContent = modeExplanations[state.mode]?.label || 'Discussion mode';
}

function renderChat() {
  const chatStream = document.getElementById('chatStream');
  const messages = currentSession()?.messages || [];
  if (!messages.length) {
    chatStream.innerHTML = '<article class="card"><p class="muted">Start a creative discussion to populate the workspace.</p></article>';
    return;
  }
  chatStream.innerHTML = messages.map(entry => {
    if (entry.type === 'user') {
      return `
        <article class="message message--user">
          <div class="message-head"><strong>${entry.author}</strong><span>${entry.time}</span></div>
          <div class="message__bubble">${pmEscapeHtml(entry.text)}</div>
        </article>
      `;
    }

    if (entry.mode === 'parallel') {
      return `
        <article class="message">
          <div class="message-head"><strong>Parallel responses</strong><span>${entry.time}</span></div>
          <div class="stack stack--sm">
            ${(entry.responses || []).map(response => `
              <section class="message__bubble">
                <div class="model-lane__header"><strong>${pmEscapeHtml(response.model)}</strong><span>Direct reply</span></div>
                <p class="muted">${pmEscapeHtml(response.text)}</p>
                ${actionMarkup(response.text, response.model)}
              </section>
            `).join('')}
          </div>
        </article>
      `;
    }

    if (entry.mode === 'discussion') {
      return `
        <article class="message">
          <div class="message-head"><strong>Discussion mode</strong><span>${entry.time}</span></div>
          <section class="message__bubble">
            <div class="model-lane">
              <div class="model-lane__header"><span>Lead lane</span><strong>${pmEscapeHtml(entry.leadModel)}</strong></div>
              <p>${pmEscapeHtml(entry.leadText)}</p>
              ${actionMarkup(entry.leadText, entry.leadModel)}
              <div class="model-nest">
                ${(entry.support || []).map(item => `
                  <div class="model-commentary">
                    <div class="model-lane__header"><strong>${pmEscapeHtml(item.model)}</strong><span>supporting input</span></div>
                    <p class="muted">${pmEscapeHtml(item.text)}</p>
                    ${actionMarkup(item.text, item.model)}
                  </div>
                `).join('')}
              </div>
            </div>
          </section>
        </article>
      `;
    }

    return `
      <article class="message">
        <div class="message-head"><strong>${pmEscapeHtml(entry.model)}</strong><span>${entry.time}</span></div>
        <div class="message__bubble">
          <div>${pmEscapeHtml(entry.text)}</div>
          ${actionMarkup(entry.text, entry.model)}
        </div>
      </article>
    `;
  }).join('');
  chatStream.scrollTop = chatStream.scrollHeight;
}

function renderOutputsAndActivity() {
  const selectedBookId = selectedBook()?.public_id;
  const runs = (state.overview?.recent_runs || []).filter(run => run.subject_public_id === selectedBookId).slice(0, 6);
  document.getElementById('outputGrid').innerHTML = runs.map(run => `
    <article class="output-card">
      <div class="meta"><span>${pmEscapeHtml(run.stage_id)}</span><span>${pmEscapeHtml(run.status)}</span></div>
      <strong>${pmEscapeHtml(run.summary)}</strong>
      <p class="muted">${pmEscapeHtml((run.outputs?.[0]?.body) || 'LoreCore run output ready.')}</p>
    </article>
  `).join('') || `
    <article class="output-card">
      <div class="meta"><span>lore</span><span>ready</span></div>
      <strong>Creative workspace ready</strong>
      <p class="muted">Run a stage or export a strong response from chat to generate structured creative outputs.</p>
    </article>
  `;

  document.getElementById('activityLog').innerHTML = runs.map(run => `
    <div class="timeline-item">
      <small>${pmEscapeHtml(run.created_at?.slice(11,16) || pmNowTime())}</small>
      <span>${pmEscapeHtml(run.summary)}</span>
    </div>
  `).join('') || '<div class="timeline-item"><small>--:--</small><span>No recent LoreCore runs.</span></div>';
}

function renderAll() {
  renderLibrarySelect();
  renderLibrarySummary();
  renderBookList();
  renderThreadList();
  renderNoteList();
  renderDraftList();
  renderBookFields();
  renderTabs();
  renderWorlds();
  renderCharacters();
  renderScenes();
  renderStages();
  renderAgentGroup();
  renderMetrics();
  renderExportTargets();
  renderModelOptions();
  renderModeOptions();
  renderSelectedPanel();
  renderCatalog();
  renderActiveLanes();
  renderPoolSummary();
  renderChat();
  renderOutputsAndActivity();
}

async function loadModelPool() {
  try {
    const [poolData, catalogData] = await Promise.all([
      pmApi('/model-pool/models'),
      pmApi('/model-catalog'),
    ]);
    state.modelPool = poolData.items || [];
    state.modelCatalog = catalogData.items || [];
    if (!state.models.length && state.modelPool.length) {
      state.models = state.modelPool.slice(0, 3).map(item => item.name);
    }
    renderModelOptions();
    renderSelectedPanel();
    renderCatalog();
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function loadOverview(libraryPublicId = '', bookPublicId = '', sessionPublicId = '') {
  try {
    const params = new URLSearchParams();
    if (libraryPublicId) params.set('library_public_id', libraryPublicId);
    if (bookPublicId) params.set('book_public_id', bookPublicId);
    if (sessionPublicId) params.set('session_public_id', sessionPublicId);
    const query = params.toString() ? `?${params.toString()}` : '';
    state.overview = await pmApi('/lorecore/overview' + query);
    state.selectedLibraryId = state.overview.selected_library?.public_id || state.overview.libraries?.[0]?.public_id || null;
    state.selectedBookId = state.overview.selected_book?.public_id || state.overview.books?.[0]?.public_id || null;
    state.chatSessionId = state.overview.chat_session?.public_id || sessionPublicId || 'chat-lore-01';
    state.selectedStageId = selectedBook()?.active_stage || state.overview.pipeline?.stages?.[0]?.id || 'capture';
    state.mode = state.overview.chat_session?.mode || state.mode;
    state.modelOverview = state.overview.model_pool_overview || state.modelOverview;
    state.runtimeProfiles = state.overview.runtime_profiles || [];
    state.panelPlan = state.overview.panel_plan || null;
    state.activeLeases = state.overview.active_leases || [];
    state.selectedPanel = state.overview.selected_panel || { selected: [], active: [] };
    if ((state.overview.model_pool || []).length) {
      state.modelPool = state.overview.model_pool;
    }
    if ((state.overview.model_catalog || []).length) {
      state.modelCatalog = state.overview.model_catalog;
    }
    const sessionModels = state.overview.chat_session?.selected_models || [];
    if (sessionModels.length) {
      state.models = sessionModels;
    }
    renderAll();
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function createThread(branch = false) {
  try {
    const book = selectedBook();
    const created = await pmApi('/chat-sessions', {
      method: 'POST',
      body: {
        surface: 'lorecore',
        title: book ? book.title : 'LoreCore studio',
        summary: branch ? 'Branched creative thread.' : 'LoreCore creative writing thread',
        mode: state.mode,
        selected_models: state.models,
        clone_from_public_id: branch ? state.chatSessionId : null,
      },
    });
    state.chatSessionId = created.public_id;
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast(branch ? 'Creative thread branched' : 'Creative thread created');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function sendPrompt() {
  const promptInput = document.getElementById('promptInput');
  const text = promptInput.value.trim();
  if (!text) {
    pmShowToast(modeExplanations[state.mode]?.promptHint || 'Capture a prompt first');
    return;
  }
  try {
    await pmApi(`/lorecore/sessions/${state.chatSessionId || 'chat-lore-01'}/messages`, {
      method: 'POST',
      body: {
        prompt: text,
        mode: state.mode,
        selected_models: state.models,
        library_public_id: state.selectedLibraryId,
        book_public_id: state.selectedBookId,
      },
    });
    promptInput.value = '';
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast('Message sent');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function performExport(exportType, content, suggestedTitle = '') {
  try {
    const title = window.prompt(`Title for ${exportType}`, guessExportTitle(suggestedTitle || content, exportType));
    if (!title) {
      return;
    }
    const result = await pmApi('/lorecore/exports', {
      method: 'POST',
      body: {
        library_public_id: state.selectedLibraryId,
        book_public_id: state.selectedBookId,
        source_session_public_id: state.chatSessionId,
        export_type: exportType,
        title,
        content,
        summary: String(content).replace(/\s+/g, ' ').trim().slice(0, 240),
        tags: ['lorecore', 'chat-export', exportType],
      },
    });
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast(`Saved to ${result.destination_type.replace('lore_', '')}`);
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function saveBook() {
  const book = selectedBook();
  if (!book) {
    pmShowToast('Select a book first');
    return;
  }
  try {
    const updated = await pmApi(`/lorecore/books/${book.public_id}`, {
      method: 'PUT',
      body: {
        title: document.getElementById('bookTitle').value.trim() || book.title,
        genre: document.getElementById('bookGenre').value.trim() || book.genre,
        word_goal: Number(document.getElementById('wordGoal').value || book.word_goal || 0),
        premise: document.getElementById('bookPremise').value,
        outline: document.getElementById('outlineText').value,
        manuscript: document.getElementById('manuscriptText').value,
        active_stage: state.selectedStageId,
      },
    });
    state.overview.books = state.overview.books.map(item => item.public_id === updated.public_id ? updated : item);
    state.overview.selected_book = updated;
    state.selectedBookId = updated.public_id;
    renderBookFields();
    renderMetrics();
    pmShowToast('Book saved');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function createBook() {
  const title = window.prompt('New book title');
  if (!title) return;
  try {
    const book = await pmApi('/lorecore/books', {
      method: 'POST',
      body: {
        library_public_id: state.selectedLibraryId,
        title,
        premise: '',
        genre: 'Unspecified',
      },
    });
    state.selectedBookId = book.public_id;
    await loadOverview(state.selectedLibraryId, book.public_id, state.chatSessionId);
    pmShowToast('Book created');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function addWorld() {
  const name = document.getElementById('worldName').value.trim();
  if (!name) {
    pmShowToast('World name required');
    return;
  }
  try {
    await pmApi('/lorecore/worlds', {
      method: 'POST',
      body: {
        library_public_id: state.selectedLibraryId,
        name,
        summary: document.getElementById('worldSummary').value.trim(),
      },
    });
    document.getElementById('worldName').value = '';
    document.getElementById('worldSummary').value = '';
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast('World entry added');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function addCharacter() {
  const name = document.getElementById('characterName').value.trim();
  if (!name) {
    pmShowToast('Character name required');
    return;
  }
  try {
    await pmApi('/lorecore/characters', {
      method: 'POST',
      body: {
        library_public_id: state.selectedLibraryId,
        name,
        role: document.getElementById('characterRole').value.trim() || 'Supporting',
        summary: document.getElementById('characterSummary').value.trim(),
      },
    });
    document.getElementById('characterName').value = '';
    document.getElementById('characterRole').value = '';
    document.getElementById('characterSummary').value = '';
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast('Character added');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function addScene() {
  const book = selectedBook();
  if (!book) {
    pmShowToast('Select a book first');
    return;
  }
  const title = document.getElementById('sceneTitle').value.trim();
  if (!title) {
    pmShowToast('Scene title required');
    return;
  }
  try {
    await pmApi('/lorecore/scenes', {
      method: 'POST',
      body: {
        book_public_id: book.public_id,
        title,
        summary: document.getElementById('sceneSummary').value.trim(),
        stage: state.selectedStageId,
      },
    });
    document.getElementById('sceneTitle').value = '';
    document.getElementById('sceneSummary').value = '';
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast('Scene added');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function runStage() {
  const book = selectedBook();
  const stage = selectedStage();
  if (!book || !stage) {
    pmShowToast('Select a book and stage first');
    return;
  }
  try {
    await saveBook();
    await pmApi(`/lorecore/books/${book.public_id}/run-stage`, {
      method: 'POST',
      body: { stage_id: stage.id },
    });
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast(`${stage.title} executed`);
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function draftProfile(modelName) {
  try {
    await pmApi('/model-catalog/runtime-profiles/ensure', {
      method: 'POST',
      body: { aliases: [modelName], overwrite: false, include_runtime: false },
    });
    await loadOverview();
    pmShowToast('Runtime profile drafted');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function materializeProfile(modelName) {
  try {
    await pmApi('/model-catalog/runtime-profiles/materialize', {
      method: 'POST',
      body: { aliases: [modelName], overwrite: false },
    });
    await loadOverview();
    pmShowToast('Runtime materialized');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function syncPool() {
  try {
    await pmApi('/model-pool/sync', { method: 'POST' });
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast('Model pool synced');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function releaseLanes() {
  try {
    await pmApi('/model-pool/release-session', {
      method: 'POST',
      body: {
        surface: 'lorecore',
        session_public_id: state.chatSessionId,
        reason: 'manual-release',
      },
    });
    await loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
    pmShowToast('Creative lanes released');
  } catch (error) {
    pmShowToast(error.message);
  }
}

function attachEvents() {
  document.getElementById('librarySelect').addEventListener('change', (event) => {
    state.selectedLibraryId = event.target.value;
    loadOverview(state.selectedLibraryId, '', state.chatSessionId);
  });

  document.getElementById('bookList').addEventListener('click', (event) => {
    const card = event.target.closest('[data-book]');
    if (!card) return;
    state.selectedBookId = card.dataset.book;
    loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
  });

  document.getElementById('threadList').addEventListener('click', (event) => {
    const card = event.target.closest('[data-thread]');
    if (!card) return;
    state.chatSessionId = card.dataset.thread;
    loadOverview(state.selectedLibraryId, state.selectedBookId, state.chatSessionId);
  });

  document.getElementById('newThreadBtn').addEventListener('click', () => createThread(false));
  document.getElementById('branchThreadBtn').addEventListener('click', () => createThread(true));
  document.getElementById('createBookBtn').addEventListener('click', createBook);
  document.getElementById('saveBookBtn').addEventListener('click', saveBook);
  document.getElementById('runStageBtn').addEventListener('click', runStage);
  document.getElementById('sendPromptBtn').addEventListener('click', sendPrompt);
  document.getElementById('syncPoolBtn').addEventListener('click', syncPool);
  document.getElementById('releaseLanesBtn').addEventListener('click', releaseLanes);
  document.getElementById('loreRail').addEventListener('toggle', (event) => {
    const section = event.target.closest('[data-dock-view]');
    if (!section || !section.open) return;
    state.activeDock = section.dataset.dockView;
    renderDock();
  }, true);
  document.getElementById('promptInput').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    sendPrompt();
  });
  document.getElementById('clearChatBtn').addEventListener('click', () => {
    document.getElementById('promptInput').value = '';
  });
  document.getElementById('seedPromptBtn').addEventListener('click', () => {
    document.getElementById('promptInput').value = 'For the current book, run an open creative discussion that generates one strong scene idea, one canon note, and one paragraph of prose worth keeping.';
  });

  document.getElementById('chatStream').addEventListener('click', (event) => {
    const button = event.target.closest('[data-export-type]');
    if (!button) return;
    const exportType = button.dataset.exportType;
    const content = decodeURIComponent(button.dataset.exportContent || '');
    const title = decodeURIComponent(button.dataset.exportTitle || '');
    performExport(exportType, content, title);
  });

  document.getElementById('loreTabNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    state.activeTab = button.dataset.tab;
    renderTabs();
  });

  document.getElementById('stageControls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-stage]');
    if (!button) return;
    state.selectedStageId = button.dataset.stage;
    renderStages();
    renderRailSummaries();
  });

  document.getElementById('modeOptions').addEventListener('change', (event) => {
    const input = event.target.closest('input[name="mode"]');
    if (!input) return;
    state.mode = input.value;
    renderModeOptions();
    renderDock();
    renderRailSummaries();
  });

  document.getElementById('modelOptions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-model]');
    if (!button) return;
    const model = button.dataset.model;
    state.models = state.models.filter(item => item !== model);
    renderModelOptions();
    renderSelectedPanel();
    renderCatalog();
    renderRailSummaries();
  });

  document.getElementById('modelCatalogList').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-catalog-model]');
    if (!button || button.disabled) return;
    const model = button.dataset.catalogModel;
    const action = button.dataset.catalogAction || 'toggle';
    if (action === 'draft-profile') {
      await draftProfile(model);
      return;
    }
    if (action === 'materialize') {
      await materializeProfile(model);
      return;
    }
    if (action === 'noop') {
      return;
    }
    if (state.models.includes(model)) {
      state.models = state.models.filter(item => item !== model);
    } else {
      state.models = [...state.models, model];
    }
    renderModelOptions();
    renderSelectedPanel();
    renderCatalog();
    renderRailSummaries();
  });

  document.getElementById('addWorldBtn').addEventListener('click', addWorld);
  document.getElementById('addCharacterBtn').addEventListener('click', addCharacter);
  document.getElementById('addSceneBtn').addEventListener('click', addScene);
}

attachEvents();
loadModelPool().then(() => loadOverview());
