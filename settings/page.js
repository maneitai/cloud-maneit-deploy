
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function renderList(targetId, items) {
  const node = document.getElementById(targetId);
  if (!node) return;
  node.innerHTML = items.join('');
}

function init() {
  renderList('settingGroupList', [
    '<article class="card card--compact"><div class="eyebrow">Workspace</div><p class="muted">Enter-to-send, history split, right-rail density, and shell calmness.</p></article>',
    '<article class="card card--compact"><div class="eyebrow">Models</div><p class="muted">Default discussion mode, activation policy, and missing-model behavior.</p></article>',
    '<article class="card card--compact"><div class="eyebrow">Promote</div><p class="muted">Where chat exports go and how they are tagged for downstream portals.</p></article>',
    '<article class="card card--compact"><div class="eyebrow">Privacy</div><p class="muted">Local-first storage, alerts, and notification noise level.</p></article>',
  ]);

  renderList('savedValueList', [
    '<div class="timeline-item"><small>history</small><span>Pinned + general history stay separate and durable.</span></div>',
    '<div class="timeline-item"><small>discussion</small><span>Home stays discussion-first until you explicitly promote/export.</span></div>',
    '<div class="timeline-item"><small>promote</small><span>Projects remains the default landing zone with explicit class tagging.</span></div>',
  ]);

  renderList('settingsPreviewList', [
    '<div class="timeline-item"><small>Home</small><span>Compact control rail, enter-to-send, strong history, open chat continuation.</span></div>',
    '<div class="timeline-item"><small>Runtime</small><span>State stays the primary low-noise diagnostic page.</span></div>',
    '<div class="timeline-item"><small>Portals</small><span>PortalCreator, AppCreator, Research Core, LoreCore, and Game Designer inherit the same shell language.</span></div>',
  ]);

  renderList('settingsGuardrailList', [
    '<div class="timeline-item"><small>boundary</small><span>Settings defines defaults. It does not become a second workspace.</span></div>',
    '<div class="timeline-item"><small>history</small><span>Do not make chat disposable. Threads must remain reopenable and resumable.</span></div>',
    '<div class="timeline-item"><small>models</small><span>Model choices stay manual and visible, not hidden behind fixed assistant roles.</span></div>',
  ]);

  document.getElementById('resetDefaultsBtn')?.addEventListener('click', () => showToast('Defaults reset on this local shell pass.'));
  document.getElementById('saveSettingsBtn')?.addEventListener('click', () => showToast('Settings shell saved locally.'));
}

init();
