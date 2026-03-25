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

const modeExplanations = {
  single: {
    label: 'Direct reply',
    promptHint: 'Ask one model to work through a prompt in a single lane.',
  },
  parallel: {
    label: 'Parallel compare',
    promptHint: 'Run the same prompt across multiple models to compare direction.',
  },
  discussion: {
    label: 'Open discussion',
    promptHint: 'Use a lead lane with supporting models nested underneath.',
  },
};

const state = {
  threads: [],
  session: null,
  recentExports: [],
  activeDock: 'setup',
  tasks: [],
  settings: {},
  modelPool: [],
  modelCatalog: [],
  modelOverview: null,
  selectedPanel: { selected: [], active: [] },
  activeLeases: [],
  runtimeProfiles: [],
  panelPlan: null,
  mode: 'discussion',
  models: [],
};

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
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

function currentThreadQuery() {
  return (document.getElementById('threadSearch')?.value || '').trim().toLowerCase();
}

function threadMatchesSearch(thread, query) {
  if (!query) return true;
  return [thread.public_id, thread.title, thread.summary, thread.excerpt]
    .map(value => String(value || '').toLowerCase())
    .some(value => value.includes(query));
}

function renderThreadCards(items, targetId, emptyMessage) {
  const node = document.getElementById(targetId);
  if (!node) return;
  if (!items.length) {
    node.innerHTML = `<article class="empty-state">${pmEscapeHtml(emptyMessage)}</article>`;
    return;
  }
  node.innerHTML = items.map(thread => {
    const active = thread.public_id === state.session?.public_id;
    const badges = [
      active ? '<span class="badge badge--active">Open</span>' : '',
      thread.parent_session_public_id ? '<span class="badge badge--branch">Branch</span>' : '',
      thread.mode ? `<span class="badge">${pmEscapeHtml(thread.mode)}</span>` : '',
    ].filter(Boolean).join('');

    return `
      <article class="card thread-card ${active ? 'thread-card--active' : ''}" data-thread="${pmEscapeHtml(thread.public_id)}">
        <div class="meta"><span>${pmEscapeHtml(thread.public_id)}</span><span>${thread.pinned ? 'Pinned' : 'Thread'}</span></div>
        <strong>${pmEscapeHtml(thread.title || 'Untitled thread')}</strong>
        <small>${pmEscapeHtml(thread.excerpt || thread.summary || 'No summary yet.')}</small>
        <div class="thread-card__footer">
          <div class="thread-card__badges">${badges || '<span class="badge">Ready</span>'}</div>
        </div>
      </article>
    `;
  }).join('');
}

function renderThreads() {
  const visible = (state.threads || []).filter(thread => threadMatchesSearch(thread, currentThreadQuery()));
  const pinned = visible.filter(thread => thread.pinned);
  const recent = visible.filter(thread => !thread.pinned);
  setText('pinnedCount', String(pinned.length));
  setText('recentCount', String(recent.length));
  renderThreadCards(pinned, 'pinnedThreadList', 'No pinned chats yet.');
  renderThreadCards(recent, 'recentThreadList', visible.length ? 'No unpinned chats in this filter.' : 'No matching chats in history.');
}

function renderExports() {
  const exportList = document.getElementById('exportList');
  if (!exportList) return;
  const items = state.recentExports.slice(0, 5);
  if (!items.length) {
    exportList.innerHTML = '<article class="empty-state">No exports yet.</article>';
    return;
  }
  exportList.innerHTML = items.map(item => `
    <article class="subcard">
      <div class="meta"><span>${pmEscapeHtml(item.target_portal)}</span><span>${pmEscapeHtml(item.time_label)}</span></div>
      <strong>${pmEscapeHtml(item.title)}</strong>
      <p class="muted">${pmEscapeHtml(item.export_type)} export ready for ${item.target_portal === 'LoreCore' ? 'LoreCore library' : 'Projects'}.</p>
    </article>
  `).join('');
}

function renderModelOptions() {
  const node = document.getElementById('modelOptions');
  if (!node) return;
  if (!state.models.length) {
    node.innerHTML = '<article class="empty-state">No manual participants selected yet.</article>';
    return;
  }
  node.innerHTML = state.models.map(model => `
    <button type="button" class="model-toggle model-toggle--active" data-model="${pmEscapeHtml(model)}">
      <span>●</span>
      <span>${pmEscapeHtml(model)}</span>
      <span aria-hidden="true">×</span>
    </button>
  `).join('');
}

function renderSelectedPanel() {
  const node = document.getElementById('selectedPanelList');
  if (!node) return;
  const items = state.models
    .map(name => state.modelCatalog.find(item => item.name === name || item.display_name === name || item.alias === name))
    .filter(Boolean);
  if (!items.length) {
    node.innerHTML = '<article class="empty-state">Choose models from the catalog to build a manual discussion roster.</article>';
    return;
  }
  node.innerHTML = items.map(item => `
    <article class="subcard">
      <div class="meta"><span>${pmEscapeHtml(item.family || 'other')}</span><span>${pmEscapeHtml(item.catalog_state || item.runtime_state || 'catalog')}</span></div>
      <strong>${pmEscapeHtml(item.display_name || item.name || item.alias || 'model')}</strong>
      <small class="muted">${pmEscapeHtml((item.roles || []).slice(0, 3).join(' · ') || 'general')}</small>
    </article>
  `).join('');
}

function renderCatalog() {
  const node = document.getElementById('modelCatalogList');
  if (!node) return;
  const items = state.modelCatalog || [];
  if (!items.length) {
    node.innerHTML = '<article class="empty-state">No catalog items discovered yet.</article>';
    return;
  }
  node.innerHTML = items.map(item => {
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
      <article class="subcard catalog-card">
        <div class="meta"><span>${pmEscapeHtml(item.family || 'other')}</span><span>${pmEscapeHtml(item.catalog_state || 'catalog')}</span></div>
        <strong>${pmEscapeHtml(item.display_name || item.name || item.alias || 'model')}</strong>
        <small class="muted">${pmEscapeHtml((item.roles || []).slice(0, 4).join(' · ') || 'general')}</small>
        <div class="button-row button-row--compact block-gap">
          <button type="button" class="button ${toneClass}" data-catalog-model="${pmEscapeHtml(item.name || item.display_name || item.alias)}" data-catalog-action="${pmEscapeHtml(action)}" ${disabled ? 'disabled' : ''}>${actionLabel}</button>
        </div>
        <p class="muted block-gap">${pmEscapeHtml(item.notes || item.endpoint || item.gguf_path || '')}</p>
      </article>
    `;
  }).join('');
}

function renderModeOptions() {
  document.querySelectorAll('#modeOptions .list-item').forEach(item => {
    const input = item.querySelector('input');
    item.classList.toggle('list-item--active', input.value === state.mode);
    input.checked = input.value === state.mode;
  });
  const label = modeExplanations[state.mode]?.label || 'Open discussion';
  setText('modeLabel', label);
  setText('modeLabelDock', label);
}

function renderRailSummaries() {
  const modeLabel = modeExplanations[state.mode]?.label || 'Open discussion';
  const modelCount = state.models.length;
  const modelLabel = `${modelCount} model${modelCount === 1 ? '' : 's'}`;
  const counts = state.modelOverview?.counts || {};
  const loaded = counts.loaded || 0;
  const active = (state.activeLeases || []).length;
  const targetPortal = document.getElementById('projectPortal')?.value || 'PortalCreator';
  const projectType = document.getElementById('projectType')?.value || 'Portal';
  const catalogTotal = (state.modelCatalog || []).length;
  const selectableCount = (state.modelCatalog || []).filter(item => item.selectable).length;
  setText('setupSummary', `${modeLabel} · ${modelLabel}`);
  setText('exportSummary', `${projectType} → ${targetPortal}`);
  setText('runtimeSummary', `${active} active · ${loaded} loaded`);
  setText('catalogSummary', `${selectableCount}/${catalogTotal} ready`);
  setText('selectedModelCount', String(modelCount));
  setText('selectedModelCountBadge', String(modelCount));
  setText('activeLaneCount', String(active));
  setText('poolLoadedCountMini', String(loaded));
  setText('exportTargetSummary', targetPortal);
  setText('sessionFocusLine', state.session?.summary || state.session?.excerpt || 'Discussion stays a discussion until you promote it.');
}

function renderDock() {
  document.querySelectorAll('#homeRail [data-dock-view]').forEach(section => {
    section.open = section.dataset.dockView === state.activeDock;
  });
}

function renderChat() {
  const node = document.getElementById('chatStream');
  if (!node) return;
  const messages = state.session?.messages || [];
  if (!messages.length) {
    node.innerHTML = `
      <article class="message message--system">
        <div class="message__bubble">
          Open a chat from the left lane or start a new one. Home is for open discussion and comparison first. Nothing here becomes work until you deliberately promote it.
        </div>
      </article>
    `;
    return;
  }

  node.innerHTML = messages.map(entry => {
    if (entry.type === 'user') {
      return `
        <article class="message message--user">
          <div class="message-head"><strong>${pmEscapeHtml(entry.author || 'You')}</strong><span>${pmEscapeHtml(entry.time || '')}</span></div>
          <div class="message__bubble">${pmEscapeHtml(entry.text || '')}</div>
        </article>
      `;
    }

    if (entry.mode === 'parallel') {
      return `
        <article class="message">
          <div class="message-head"><strong>Parallel comparison</strong><span>${pmEscapeHtml(entry.time || '')}</span></div>
          <div class="stack stack--sm">
            ${(entry.responses || []).map(response => `
              <section class="message__bubble">
                <div class="model-lane__header"><strong>${pmEscapeHtml(response.model)}</strong><span>Direct reply</span></div>
                <p class="muted">${pmEscapeHtml(response.text || '')}</p>
              </section>
            `).join('')}
          </div>
        </article>
      `;
    }

    if (entry.mode === 'discussion') {
      return `
        <article class="message">
          <div class="message-head"><strong>Open discussion</strong><span>${pmEscapeHtml(entry.time || '')}</span></div>
          <section class="message__bubble">
            <div class="model-lane">
              <div class="model-lane__header"><span>Lead lane</span><strong>${pmEscapeHtml(entry.leadModel || 'Lead')}</strong></div>
              <p>${pmEscapeHtml(entry.leadText || '')}</p>
              <div class="model-nest">
                ${(entry.support || []).map(item => `
                  <div class="model-commentary">
                    <div class="model-lane__header"><strong>${pmEscapeHtml(item.model)}</strong><span>supporting input</span></div>
                    <p class="muted">${pmEscapeHtml(item.text || '')}</p>
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
        <div class="message-head"><strong>${pmEscapeHtml(entry.model || 'Assistant')}</strong><span>${pmEscapeHtml(entry.time || '')}</span></div>
        <div class="message__bubble">${pmEscapeHtml(entry.text || '')}</div>
      </article>
    `;
  }).join('');
  node.scrollTop = node.scrollHeight;
}

function renderActiveLanes() {
  const node = document.getElementById('activeLaneList');
  if (!node) return;
  const leases = state.activeLeases || [];
  if (!leases.length) {
    node.innerHTML = '<article class="empty-state">No active lanes yet. Run a prompt to lease models for this session.</article>';
    return;
  }
  node.innerHTML = leases.map(lease => {
    const model = lease.model || {};
    const role = lease.role || 'lane';
    const runtimeState = model.runtime_state || 'available';
    return `
      <article class="subcard">
        <div class="meta"><span>${pmEscapeHtml(role)}</span><span>${pmEscapeHtml(runtimeState)}</span></div>
        <strong>${pmEscapeHtml(model.name || lease.model_public_id || 'model')}</strong>
        <small class="muted">${pmEscapeHtml(model.local_endpoint || 'endpoint pending')}</small>
      </article>
    `;
  }).join('');
}

function renderPoolSummary() {
  const overview = state.modelOverview || { counts: {}, control_mode: 'observe' };
  const counts = overview.counts || {};
  setText('poolControlMode', overview.control_mode || 'observe');
  setText('poolLoadedCount', String(counts.loaded || 0));
  setText('poolStartingCount', String(counts.starting || 0));
  setText('poolFailedCount', String(counts.failed || 0));
  setText('poolCatalogCount', String(counts.catalog_total || 0));
  setText('poolCatalogDiskCount', String(counts.catalog_on_disk || 0));
}

function syncSessionStatus() {
  if (!state.session) return;
  setText('sessionChatId', state.session.public_id || 'chat-home');
  setText('sessionFocus', state.session.summary || state.session.excerpt || 'Open discussion');
  const progress = document.getElementById('sessionProgress');
  if (progress) {
    progress.style.width = `${Math.min(34 + (state.session.messages?.length || 0) * 6, 92)}%`;
  }
  setText('sessionTitle', state.session.title || 'Conversation workspace');
  const selectedModels = state.models.length ? ` · ${state.models.length} model${state.models.length === 1 ? '' : 's'} selected` : '';
  setText('sessionSubtitle', `${modeExplanations[state.mode]?.label || 'Open discussion'}${selectedModels}`);
  setText('sessionFocusLine', state.session.summary || state.session.excerpt || 'Discussion stays a discussion until you promote it.');
  const exportTitle = document.getElementById('exportTitle');
  if (exportTitle && !exportTitle.dataset.userTouched) {
    exportTitle.value = state.session?.title || '';
  }
}


async function load(sessionPublicId = state.session?.public_id || '') {
  try {
    const query = sessionPublicId ? `?session_public_id=${encodeURIComponent(sessionPublicId)}` : '';
    const data = await pmApi('/home/summary' + query);
    state.threads = data.threads || [];
    state.session = data.session || null;
    state.recentExports = data.recent_exports || [];
    state.tasks = data.tasks || [];
    state.settings = data.settings || {};
    state.modelPool = data.model_pool || [];
    state.modelCatalog = data.model_catalog || [];
    state.modelOverview = data.model_pool_overview || { counts: {}, control_mode: 'observe' };
    state.runtimeProfiles = data.runtime_profiles || [];
    state.panelPlan = data.panel_plan || null;
    state.selectedPanel = data.selected_panel || { selected: [], active: [] };
    state.activeLeases = data.active_leases || [];
    state.mode = state.session?.mode || state.settings.default_home_mode || 'discussion';
    state.models = state.session?.selected_models?.length ? state.session.selected_models : (state.settings.default_models || []);
    if (!state.models.length && state.modelPool.length) {
      state.models = [state.modelPool[0].name];
    }
    renderThreads();
    renderExports();
    renderModelOptions();
    renderModeOptions();
    renderDock();
    renderSelectedPanel();
    renderCatalog();
    renderChat();
    renderActiveLanes();
    renderPoolSummary();
    syncSessionStatus();
    renderRailSummaries();
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function createThread(branch = false) {
  try {
    const created = await pmApi('/chat-sessions', {
      method: 'POST',
      body: {
        surface: 'home',
        title: branch && state.session ? `${state.session.title} branch` : 'New chat',
        summary: branch ? 'Branched from current chat.' : 'Open discussion chat',
        mode: state.mode,
        selected_models: state.models,
        clone_from_public_id: branch ? state.session?.public_id : null,
      },
    });
    await load(created.public_id);
    pmShowToast(branch ? 'Chat branched' : 'New chat created');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function sendPrompt() {
  const promptInput = document.getElementById('promptInput');
  const text = promptInput?.value.trim();
  if (!text) {
    pmShowToast(modeExplanations[state.mode]?.promptHint || 'Write a message first');
    return;
  }
  try {
    await pmApi(`/home/sessions/${state.session?.public_id || 'chat-home-91'}/messages`, {
      method: 'POST',
      body: {
        prompt: text,
        mode: state.mode,
        selected_models: state.models,
      },
    });
    promptInput.value = '';
    await load();
    pmShowToast('Message sent');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function exportRecord() {
  const title = document.getElementById('exportTitle')?.value.trim() || state.session?.title || 'Untitled export';
  const productionType = document.getElementById('projectType')?.value;
  const targetPortal = document.getElementById('projectPortal')?.value;
  const quickCapture = document.getElementById('exportNote')?.value.trim();

  try {
    const result = await pmApi('/home/exports', {
      method: 'POST',
      body: {
        title,
        production_type: productionType,
        target_portal: targetPortal,
        quick_capture: quickCapture,
        session_public_id: state.session?.public_id || 'chat-home-91',
        mode: state.mode,
      },
    });
    await load();
    pmShowToast(result.destination_type === 'lore_book'
      ? `Exported "${title}" to LoreCore library`
      : `Promoted "${title}" to Projects / portal queue`);
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
    await load();
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
    await load();
    pmShowToast('Runtime materialized');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function syncPool() {
  try {
    await pmApi('/model-pool/sync', { method: 'POST' });
    await load();
    pmShowToast('Model pool synced');
  } catch (error) {
    pmShowToast(error.message);
  }
}

async function releaseLanes() {
  if (!state.session?.public_id) {
    pmShowToast('No active session');
    return;
  }
  try {
    await pmApi('/model-pool/release-session', {
      method: 'POST',
      body: {
        surface: 'home',
        session_public_id: state.session.public_id,
        reason: 'manual-release',
      },
    });
    await load();
    pmShowToast('Session lanes released');
  } catch (error) {
    pmShowToast(error.message);
  }
}

function bindThreadList(id) {
  const node = document.getElementById(id);
  if (!node) return;
  node.addEventListener('click', event => {
    const card = event.target.closest('[data-thread]');
    if (!card) return;
    load(card.dataset.thread);
  });
}

function attachEvents() {
  document.getElementById('seedPromptBtn')?.addEventListener('click', () => {
    document.getElementById('promptInput').value = 'Discuss openly. Compare directions, challenge assumptions, and decide what is worth promoting into Projects or a downstream portal.';
    pmShowToast('Starter inserted');
  });

  document.getElementById('clearChatBtn')?.addEventListener('click', async () => {
    document.getElementById('promptInput').value = '';
    await load();
    pmShowToast('Chat refreshed');
  });

  document.getElementById('newThreadBtn')?.addEventListener('click', () => createThread(false));
  document.getElementById('branchThreadBtn')?.addEventListener('click', () => createThread(true));
  document.getElementById('sendPromptBtn')?.addEventListener('click', sendPrompt);
  document.getElementById('exportProjectBtn')?.addEventListener('click', exportRecord);
  document.getElementById('syncPoolBtn')?.addEventListener('click', syncPool);
  document.getElementById('releaseLanesBtn')?.addEventListener('click', releaseLanes);
  document.getElementById('threadSearch')?.addEventListener('input', renderThreads);

  document.getElementById('homeRail')?.addEventListener('toggle', event => {
    const section = event.target.closest('[data-dock-view]');
    if (!section || !section.open) return;
    state.activeDock = section.dataset.dockView;
    renderDock();
  }, true);

  document.getElementById('projectType')?.addEventListener('change', renderRailSummaries);
  document.getElementById('projectPortal')?.addEventListener('change', renderRailSummaries);

  document.getElementById('exportTitle')?.addEventListener('input', event => {
    if (event.target.value.trim()) {
      event.target.dataset.userTouched = '1';
    } else {
      delete event.target.dataset.userTouched;
    }
  });

  document.getElementById('promptInput')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    sendPrompt();
  });

  document.getElementById('modeOptions')?.addEventListener('change', event => {
    if (event.target.name !== 'mode') return;
    state.mode = event.target.value;
    renderModeOptions();
    renderDock();
    syncSessionStatus();
    renderRailSummaries();
  });

  document.getElementById('modelOptions')?.addEventListener('click', event => {
    const button = event.target.closest('[data-model]');
    if (!button) return;
    const model = button.dataset.model;
    state.models = state.models.filter(item => item !== model);
    renderModelOptions();
    renderSelectedPanel();
    renderCatalog();
    syncSessionStatus();
    renderRailSummaries();
  });

  document.getElementById('modelCatalogList')?.addEventListener('click', async event => {
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
    if (action === 'noop') return;

    if (state.models.includes(model)) {
      state.models = state.models.filter(item => item !== model);
    } else {
      state.models = [...state.models, model];
    }
    renderModelOptions();
    renderSelectedPanel();
    renderCatalog();
    syncSessionStatus();
    renderRailSummaries();
  });

  bindThreadList('pinnedThreadList');
  bindThreadList('recentThreadList');
}

attachEvents();
load();
