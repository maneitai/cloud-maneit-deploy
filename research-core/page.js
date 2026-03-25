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
  renderList('sourceCollectionList', [
    '<div class="list-item"><div><strong>Source stacks</strong><p class="muted">Papers, articles, docs, transcripts, saved pages, and raw references.</p></div></div>',
    '<div class="list-item"><div><strong>Extract library</strong><p class="muted">Quoted fragments, evidence snippets, contradiction notes, and provenance details.</p></div></div>',
    '<div class="list-item"><div><strong>Dataset workbench</strong><p class="muted">Collections for evaluation, training preparation, and structured review.</p></div></div>',
  ]);

  renderList('questionBoard', [
    '<div class="list-item"><div><strong>Question pack</strong><p class="muted">What exactly are we trying to know, test, or verify?</p></div></div>',
    '<div class="list-item"><div><strong>Constraint map</strong><p class="muted">What sources matter, what time range matters, and what would make the answer unsafe?</p></div></div>',
    '<div class="list-item"><div><strong>Confidence rubric</strong><p class="muted">Define what would count as “good enough” before synthesis begins.</p></div></div>',
  ]);

  renderList('researchFramingList', [
    '<div class="list-item"><div><strong>Question frame</strong><p class="muted">Primary question, sub-questions, exclusions, and comparison angles.</p></div></div>',
    '<div class="list-item"><div><strong>Source strategy</strong><p class="muted">Which source classes should be primary, supporting, or excluded?</p></div></div>',
    '<div class="list-item"><div><strong>Verification plan</strong><p class="muted">How many passes, what contradictions, and which verifier style should be used later?</p></div></div>',
  ]);

  renderList('evidenceBoard', [
    '<div class="list-item"><div><strong>Evidence chain</strong><p class="muted">Tie each claim to its source and keep unsupported conclusions visibly provisional.</p></div></div>',
    '<div class="list-item"><div><strong>Contradiction handling</strong><p class="muted">Keep disagreements explicit instead of washing them out during summary.</p></div></div>',
    '<div class="list-item"><div><strong>Verifier handoff</strong><p class="muted">Mark where deeper pipeline verification should challenge the research state.</p></div></div>',
  ]);

  renderList('dossierGrid', [
    '<article class="list-item"><div><strong>Research dossier</strong><p class="muted">Reusable research object with sources, extracts, contradictions, synthesis, and next actions.</p></div></article>',
    '<article class="list-item"><div><strong>Synthesis notebook</strong><p class="muted">Operator-readable synthesis with uncertainty, confidence notes, and follow-up questions.</p></div></article>',
    '<article class="list-item"><div><strong>Learning / eval pack</strong><p class="muted">Curated material for model learning, evaluation, and later training workflows.</p></div></article>',
  ]);

  renderList('trainingModeList', [
    '<div class="list-item"><div><strong>Learning mode</strong><p class="muted">Capture curated notes, corrections, and references for later reuse.</p></div></div>',
    '<div class="list-item"><div><strong>Training mode</strong><p class="muted">Prepare datasets, evals, and experiments before a heavier pipeline or production run.</p></div></div>',
    '<div class="list-item"><div><strong>Guardrail</strong><p class="muted">Do not confuse “collecting better research state” with immediately altering live production behavior.</p></div></div>',
  ]);

  renderList('portalFeedList', [
    '<div class="list-item"><div><strong>PortalCreator</strong><p class="muted">Research-backed IA, scope, requirements, and audience framing.</p></div></div>',
    '<div class="list-item"><div><strong>AppCreator</strong><p class="muted">Technical references, constraints, datasets, and product context.</p></div></div>',
    '<div class="list-item"><div><strong>LoreCore / Game Designer</strong><p class="muted">Worldbuilding research, genre studies, thematic material, and historical references.</p></div></div>',
    '<div class="list-item"><div><strong>Pipelines</strong><p class="muted">Research verification, evidence review, and deeper multi-stage execution.</p></div></div>',
  ]);

  renderList('researchStatusList', [
    '<div class="list-item"><div><strong>Corpus</strong><p class="muted">Ready for tagging, extraction, and synthesis.</p></div></div>',
    '<div class="list-item"><div><strong>Evidence chains</strong><p class="muted">Waiting for deeper verifier-style checking.</p></div></div>',
    '<div class="list-item"><div><strong>Training queue</strong><p class="muted">Prepared here, but not executed from this shell directly.</p></div></div>',
  ]);

  renderList('researchOutputList', [
    '<div class="list-item"><div><strong>Projects</strong><p class="muted">Register mature research objects so other portals can pull them in deliberately.</p></div></div>',
    '<div class="list-item"><div><strong>Pipelines</strong><p class="muted">Send difficult synthesis or verification work into multi-stage flows.</p></div></div>',
    '<div class="list-item"><div><strong>Portal domains</strong><p class="muted">Feed grounded material into Home, LoreCore, Game Designer, PortalCreator, and AppCreator.</p></div></div>',
  ]);

  document.getElementById('newDossierBtn')?.addEventListener('click', () => showToast('Research dossier shell ready.'));
  document.getElementById('runSynthesisBtn')?.addEventListener('click', () => showToast('Synthesis should later hand off into Pipelines or production jobs.'));
}

init();
