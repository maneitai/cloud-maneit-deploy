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
  renderList('pillarList', [
    '<div class="list-item"><div><strong>Core loop</strong><p class="muted">The repeatable player action cycle that defines the game.</p></div></div>',
    '<div class="list-item"><div><strong>Progression</strong><p class="muted">Levels, unlocks, classes, upgrades, and reward pacing.</p></div></div>',
    '<div class="list-item"><div><strong>Faction / role asymmetry</strong><p class="muted">Playable roles, enemies, allies, and strategic contrast.</p></div></div>',
  ]);

  renderList('designDocList', [
    '<div class="list-item"><div><strong>High concept doc</strong><p class="muted">What the game is, who it is for, and why the loop is worth repeating.</p></div></div>',
    '<div class="list-item"><div><strong>System spec</strong><p class="muted">Rules, counters, economy, progression, and fail states.</p></div></div>',
    '<div class="list-item"><div><strong>Content grammar</strong><p class="muted">Quest templates, encounter shapes, and replay structures.</p></div></div>',
  ]);

  renderList('systemGrid', [
    '<article class="list-item"><div><strong>Combat / interaction</strong><p class="muted">Rules, timing, counters, feel, and readability.</p></div></article>',
    '<article class="list-item"><div><strong>Economy / crafting</strong><p class="muted">Resource loops, sinks, inflation control, and upgrade hooks.</p></div></article>',
    '<article class="list-item"><div><strong>Quest / content structures</strong><p class="muted">Mission templates, branching content, and long-term replayability.</p></div></article>',
  ]);

  renderList('experienceLaneList', [
    '<div class="list-item"><div><strong>Readability</strong><p class="muted">Can the player parse state, risk, reward, and intention quickly enough?</p></div></div>',
    '<div class="list-item"><div><strong>Cadence</strong><p class="muted">How often do tension, novelty, mastery, and payoff actually arrive?</p></div></div>',
    '<div class="list-item"><div><strong>Drift control</strong><p class="muted">Which verifier-style checks should later challenge system bloat or balance drift?</p></div></div>',
  ]);

  renderList('handoffLaneList', [
    '<div class="list-item"><div><strong>Projects</strong><p class="muted">Canonical design docs and linked production records.</p></div></div>',
    '<div class="list-item"><div><strong>Pipelines</strong><p class="muted">Quality-controlled design review, balance checking, and structured validation.</p></div></div>',
    '<div class="list-item"><div><strong>Portal / App surfaces</strong><p class="muted">Use PortalCreator or AppCreator when the game needs player-facing or operator-facing software.</p></div></div>',
  ]);

  renderList('inputFeedList', [
    '<div class="list-item"><div><strong>Research Core</strong><p class="muted">Genre studies, reference material, and mechanical research.</p></div></div>',
    '<div class="list-item"><div><strong>LoreCore</strong><p class="muted">Worlds, factions, characters, and story concepts.</p></div></div>',
    '<div class="list-item"><div><strong>Home / Projects</strong><p class="muted">Captured design direction and structured project records.</p></div></div>',
  ]);

  renderList('outputFeedList', [
    '<div class="list-item"><div><strong>Projects</strong><p class="muted">Canonical design docs and linked work packages.</p></div></div>',
    '<div class="list-item"><div><strong>Pipelines</strong><p class="muted">Verifier-heavy review and deeper design validation.</p></div></div>',
    '<div class="list-item"><div><strong>PortalCreator / AppCreator</strong><p class="muted">When the game needs public portals, tools, dashboards, or software surfaces.</p></div></div>',
  ]);

  renderList('gameStatusList', [
    '<div class="list-item"><div><strong>Systems</strong><p class="muted">Studio shell ready for iterative system work.</p></div></div>',
    '<div class="list-item"><div><strong>World crossover</strong><p class="muted">LoreCore can feed it, but Game Designer owns playable structure.</p></div></div>',
    '<div class="list-item"><div><strong>Production link</strong><p class="muted">Can hand off to Projects and Pipelines when the design stabilizes.</p></div></div>',
  ]);

  document.getElementById('newSystemBtn')?.addEventListener('click', () => showToast('New system shell ready.'));
  document.getElementById('draftDesignDocBtn')?.addEventListener('click', () => showToast('Game design doc shell ready.'));
}

init();
