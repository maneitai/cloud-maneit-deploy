
const mockAgents = [
  { name: 'Planner Core', role: 'Planner', scope: 'project framing · sequencing · checkpoints' },
  { name: 'Architecture Lead', role: 'Architect', scope: 'system shape · contracts · edge cases' },
  { name: 'Builder Node', role: 'Builder', scope: 'implementation plans · handoff packages' },
  { name: 'Verifier Chain', role: 'Verifier', scope: 'quality gates · drift control · validation' },
  { name: 'Research Support', role: 'Researcher', scope: 'sources · evidence · synthesis' },
];

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

function bindButtons() {
  document.getElementById('createMockAgentBtn')?.addEventListener('click', () => showToast('Mock agent drafting stays in Agent Factory.'));
  document.getElementById('composeTeamBtn')?.addEventListener('click', () => showToast('Reusable team shell prepared.'));
}

function init() {
  renderList('savedMockList', mockAgents.map(item => `<div class="timeline-item"><small>${item.role}</small><span><strong>${item.name}</strong> — ${item.scope}</span></div>`));
  renderList('roleGroupList', ['Planner', 'Architect', 'Builder', 'Verifier', 'Researcher', 'Operator'].map(item => `<span class="chip">${item}</span>`));
  renderList('teamComposition', [
    '<div class="list-item"><div><strong>Discussion panel</strong><p class="muted">Planner Core + Research Support + optional verifier observer</p></div></div>',
    '<div class="list-item"><div><strong>Build shell</strong><p class="muted">Architecture Lead + Builder Node + Verifier Chain</p></div></div>',
    '<div class="list-item"><div><strong>Research shell</strong><p class="muted">Research Support + Planner Core + synthesis verifier</p></div></div>',
  ]);
  renderList('capabilityPackList', [
    '<div class="list-item"><div><strong>Portal build pack</strong><p class="muted">Routes · backend actions · portal shell · export shaping</p></div></div>',
    '<div class="list-item"><div><strong>Research pack</strong><p class="muted">Evidence capture · source tracking · synthesis notes</p></div></div>',
    '<div class="list-item"><div><strong>Verifier pack</strong><p class="muted">Drift checks · criteria scoring · contradiction surfacing</p></div></div>',
  ]);
  renderList('agentCardGrid', mockAgents.map(item => `<article class="card"><div class="meta"><span>${item.role}</span><span>Reusable</span></div><strong>${item.name}</strong><p class="muted">${item.scope}</p></article>`));
  renderList('verifierPatternList', [
    '<div class="timeline-item"><small>stage gate</small><span>Attach one verifier to every handoff when quality matters more than speed.</span></div>',
    '<div class="timeline-item"><small>ring</small><span>Use a verifier ring for high-risk portal/app work where multiple passes are expected.</span></div>',
    '<div class="timeline-item"><small>observer</small><span>Run a silent verifier as an observer during discussion without hijacking the thread.</span></div>',
  ]);
  renderList('agentInspector', [
    '<div class="timeline-item"><small>memory</small><span>Local task frame with explicit handoff boundaries and no hidden long-term drift.</span></div>',
    '<div class="timeline-item"><small>tools</small><span>Prompt routing, export shaping, and portal-specific action suggestions.</span></div>',
    '<div class="timeline-item"><small>permissions</small><span>Scoped by portal surface and by the pipeline stage that invokes the blueprint.</span></div>',
  ]);
  renderList('pipelineFitList', [
    '<div class="timeline-item"><small>Home</small><span>Discussion participants, compare lanes, and optional observer verifiers.</span></div>',
    '<div class="timeline-item"><small>Pipelines</small><span>Attach role packs to stages and drop verifier patterns between nodes.</span></div>',
    '<div class="timeline-item"><small>PortalCreator</small><span>Reusable workforce shells for frontend/backend split work.</span></div>',
  ]);
  renderList('agentOutputList', [
    '<div class="timeline-item"><small>promote</small><span>Send blueprint sets to Projects when they become actual reusable production assets.</span></div>',
    '<div class="timeline-item"><small>handoff</small><span>Capability packs should map cleanly into panel members and pipeline stages.</span></div>',
    '<div class="timeline-item"><small>runtime</small><span>Keep runtime activation in State/Home; Agent Factory defines structure, not service state.</span></div>',
  ]);
  bindButtons();
}

init();
