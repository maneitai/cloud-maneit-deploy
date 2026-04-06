/* ═══════════════════════════════════════════════════════════════
   CREATOR SHELL — Shared CSS
   Used by: AppCreator, PortalCreator, GameDesigner, LoreCore, Research
   ═══════════════════════════════════════════════════════════════ */

/* ── Accent palettes ── */
:root {
  --bg:            #05090f;
  --bg-2:          #070d16;
  --surface:       rgba(10, 18, 30, 0.92);
  --surface-2:     rgba(14, 24, 38, 0.95);
  --surface-3:     rgba(8, 15, 25, 0.98);
  --border:        rgba(255, 255, 255, 0.07);
  --border-strong: rgba(255, 255, 255, 0.13);
  --text:          #e4edf8;
  --muted:         #8a9eb8;
  --soft:          #b8ccdf;
  --shadow:        0 20px 60px rgba(0, 0, 0, 0.5);
  --shadow-sm:     0 4px 16px rgba(0, 0, 0, 0.3);
  --radius:        18px;
  --radius-sm:     12px;
  --radius-xs:     8px;

  --accent:        #4eb8ff;
  --accent-2:      #7dd4ff;
  --accent-dim:    rgba(78, 184, 255, 0.12);
  --accent-border: rgba(78, 184, 255, 0.28);
  --accent-glow:   rgba(78, 184, 255, 0.06);

  --good:          #52d98c;
  --good-dim:      rgba(82, 217, 140, 0.12);
  --warn:          #f2bf61;
  --warn-dim:      rgba(242, 191, 97, 0.12);
  --bad:           #f07070;
  --bad-dim:       rgba(240, 112, 112, 0.12);
}

body[data-page="portal"] {
  --accent:        #4eb8ff;
  --accent-2:      #7dd4ff;
  --accent-dim:    rgba(78, 184, 255, 0.12);
  --accent-border: rgba(78, 184, 255, 0.28);
  --accent-glow:   rgba(78, 184, 255, 0.05);
  --page-bg-1:     rgba(20, 80, 160, 0.14);
  --page-bg-2:     rgba(10, 60, 120, 0.08);
}

body[data-page="app"] {
  --accent:        #3fd9c8;
  --accent-2:      #6eeadb;
  --accent-dim:    rgba(63, 217, 200, 0.12);
  --accent-border: rgba(63, 217, 200, 0.28);
  --accent-glow:   rgba(63, 217, 200, 0.05);
  --page-bg-1:     rgba(15, 100, 90, 0.14);
  --page-bg-2:     rgba(10, 70, 65, 0.08);
}

body[data-page="game"] {
  --accent:        #f5a623;
  --accent-2:      #ffc55a;
  --accent-dim:    rgba(245, 166, 35, 0.12);
  --accent-border: rgba(245, 166, 35, 0.28);
  --accent-glow:   rgba(245, 166, 35, 0.05);
  --page-bg-1:     rgba(120, 70, 10, 0.16);
  --page-bg-2:     rgba(80, 45, 5, 0.08);
}

body[data-page="lorecore"] {
  --accent:        #c084fc;
  --accent-2:      #d8a8ff;
  --accent-dim:    rgba(192, 132, 252, 0.12);
  --accent-border: rgba(192, 132, 252, 0.28);
  --accent-glow:   rgba(192, 132, 252, 0.05);
  --page-bg-1:     rgba(80, 30, 120, 0.16);
  --page-bg-2:     rgba(50, 15, 80, 0.08);
}

body[data-page="research"] {
  --accent:        #34d399;
  --accent-2:      #6ee7b7;
  --accent-dim:    rgba(52, 211, 153, 0.12);
  --accent-border: rgba(52, 211, 153, 0.28);
  --accent-glow:   rgba(52, 211, 153, 0.05);
  --page-bg-1:     rgba(10, 100, 70, 0.16);
  --page-bg-2:     rgba(5, 65, 45, 0.08);
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: dark; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
  background:
    radial-gradient(ellipse at 20% 0%, var(--page-bg-1, rgba(20,80,160,0.14)), transparent 40%),
    radial-gradient(ellipse at 80% 0%, var(--page-bg-2, rgba(10,60,120,0.08)), transparent 35%),
    linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%);
}
button, input, select, textarea { font: inherit; }
button { cursor: pointer; border: none; background: none; }
a { color: inherit; text-decoration: none; }
p { margin: 0; }
h1, h2, h3, h4 { margin: 0; font-weight: 700; letter-spacing: -0.03em; }

/* ── Page shell ── */
.creator-shell {
  width: min(1760px, calc(100vw - 24px));
  margin: 14px auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Header ── */
.creator-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 14px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
}
.header-brand { display: flex; align-items: center; gap: 14px; }
.brand-mark {
  width: 44px; height: 44px; border-radius: 14px;
  display: grid; place-items: center;
  font-size: 13px; font-weight: 800; letter-spacing: -0.02em;
  background: linear-gradient(135deg, var(--accent-dim), rgba(255,255,255,0.04));
  border: 1px solid var(--accent-border);
  color: var(--accent-2);
  flex-shrink: 0;
}
.header-titles { display: flex; flex-direction: column; gap: 2px; }
.header-titles .eyebrow { color: var(--accent); margin-bottom: 0; }
.header-titles h1 { font-size: 18px; line-height: 1.1; }
.header-titles p { font-size: 12px; color: var(--muted); margin-top: 2px; }
.header-nav { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.nav-link {
  padding: 7px 11px; border-radius: 10px;
  border: 1px solid transparent;
  color: var(--muted); font-size: 12px; font-weight: 600;
  transition: .15s ease;
}
.nav-link:hover { color: var(--text); background: rgba(255,255,255,0.05); border-color: var(--border); }
.nav-link--active { color: var(--accent-2); background: var(--accent-dim); border-color: var(--accent-border); }
.header-controls { display: flex; gap: 8px; align-items: center; }

/* ── Job status bar ── */
.job-status-bar {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  min-height: 46px;
}
.job-status-bar.has-job { border-color: var(--accent-border); }
.job-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--muted); flex-shrink: 0;
}
.job-status-dot.running { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1.4s ease infinite; }
.job-status-dot.good  { background: var(--good); }
.job-status-dot.bad   { background: var(--bad); }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.job-status-text { color: var(--text); font-weight: 600; }
.job-status-meta { color: var(--muted); }

/* ── Main layout ── */
.creator-layout {
  display: grid;
  grid-template-columns: 300px 1fr 280px;
  gap: 12px;
  align-items: start;
}

/* ── Panels ── */
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
}
.panel--flush   { padding: 0; }
.panel--accent  { border-color: var(--accent-border); background: linear-gradient(180deg, var(--surface), var(--surface-3)); }

/* ── Left rail ── */
.left-rail {
  display: flex; flex-direction: column; gap: 12px;
  position: sticky; top: 14px;
}
.rail-section { display: flex; flex-direction: column; gap: 8px; }
.rail-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.rail-head h3 { font-size: 13px; color: var(--soft); }

/* Project list */
.project-list { display: flex; flex-direction: column; gap: 4px; }
.project-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted); font-size: 12px; font-weight: 600;
  text-align: left; width: 100%;
  transition: .15s ease;
}
.project-item:hover { background: rgba(255,255,255,0.04); color: var(--text); border-color: var(--border); }
.project-item.active { background: var(--accent-dim); color: var(--accent-2); border-color: var(--accent-border); }
.project-item-icon { font-size: 16px; flex-shrink: 0; }
.project-item-body { flex: 1; min-width: 0; }
.project-item-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-item-meta { font-size: 10px; color: var(--muted); font-weight: 400; }
.project-item.active .project-item-meta { color: var(--accent); }

/* Plan card */
.plan-card {
  padding: 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface-3);
  display: flex; flex-direction: column; gap: 8px;
}
.plan-field { display: flex; flex-direction: column; gap: 3px; }
.plan-field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }
.plan-field-value { font-size: 12px; color: var(--soft); line-height: 1.4; }
.plan-field-value.accent { color: var(--accent-2); font-weight: 600; }

/* Target selector */
.target-selector { display: flex; flex-direction: column; gap: 6px; }
.target-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface-3);
  color: var(--muted); font-size: 12px; font-weight: 600;
  text-align: left; width: 100%; transition: .15s ease;
}
.target-btn:hover { border-color: var(--accent-border); color: var(--text); }
.target-btn.active { border-color: var(--accent-border); background: var(--accent-dim); color: var(--accent-2); }
.target-btn-icon { font-size: 18px; flex-shrink: 0; }
.target-btn-body { flex: 1; }
.target-btn-label { display: block; }
.target-btn-desc { font-size: 11px; color: var(--muted); font-weight: 400; }
.target-btn.active .target-btn-desc { color: var(--accent); }

/* ── Center column ── */
.center-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

/* ════════════════════════════════════════════════════════════════
   PIPELINE SELECTOR — above stage list
   ════════════════════════════════════════════════════════════════ */
.pipeline-selector {
  padding: 14px 16px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, var(--accent-dim), rgba(0,0,0,0));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ps-header { display: flex; flex-direction: column; gap: 6px; }

.ps-title-row {
  display: flex; align-items: center; gap: 12px;
}
.ps-title-row .eyebrow { flex-shrink: 0; }
.ps-title-row .select { flex: 1; }

.ps-desc {
  font-size: 12px; color: var(--muted); line-height: 1.4;
  padding-left: 2px;
}

/* Stage chips */
.ps-stages {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.ps-stage-chip {
  display: inline-flex; align-items: center;
  padding: 3px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  color: var(--muted);
  white-space: nowrap;
}

/* Role → model assignments */
.ps-roles { display: flex; flex-direction: column; gap: 6px; }
.ps-roles-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--muted); font-weight: 700;
}
.ps-roles-list { display: flex; flex-direction: column; gap: 5px; }
.ps-role-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px;
  align-items: center;
}
.ps-role-name {
  font-size: 12px; font-weight: 600; color: var(--soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── Stage pipeline ── */
.pipeline-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; margin-bottom: 16px;
}
.pipeline-header h2 { font-size: 20px; }
.pipeline-header p { font-size: 12px; color: var(--muted); margin-top: 4px; }
.pipeline-actions { display: flex; gap: 8px; flex-shrink: 0; }

.stage-list { display: flex; flex-direction: column; gap: 8px; }

.stage-item {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-3);
  transition: .15s ease;
  cursor: pointer;
}
.stage-item:hover { border-color: var(--border-strong); }
.stage-item.active { border-color: var(--accent-border); background: linear-gradient(180deg, var(--accent-dim), transparent); }
.stage-item.running { border-color: var(--accent-border); animation: stage-pulse 2s ease infinite; }
.stage-item.done { border-color: rgba(82,217,140,0.25); }
.stage-item.failed { border-color: rgba(240,112,112,0.25); }
@keyframes stage-pulse {
  0%,100% { box-shadow: 0 0 0 0 var(--accent-glow); }
  50% { box-shadow: 0 0 0 4px var(--accent-glow); }
}
.stage-num {
  width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 700;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  color: var(--muted); flex-shrink: 0;
}
.stage-item.active .stage-num,
.stage-item.running .stage-num { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent-2); }
.stage-item.done .stage-num    { background: var(--good-dim); border-color: rgba(82,217,140,0.3); color: var(--good); }
.stage-item.failed .stage-num  { background: var(--bad-dim); border-color: rgba(240,112,112,0.3); color: var(--bad); }
.stage-body { min-width: 0; }
.stage-title { font-size: 13px; font-weight: 700; color: var(--text); }
.stage-desc  { font-size: 11px; color: var(--muted); margin-top: 2px; }
.stage-item.active .stage-title { color: var(--accent-2); }
.stage-status {
  font-size: 11px; font-weight: 700; padding: 4px 8px;
  border-radius: 999px; border: 1px solid var(--border);
  background: transparent; color: var(--muted); white-space: nowrap;
}
.stage-status.running { color: var(--accent); border-color: var(--accent-border); background: var(--accent-dim); }
.stage-status.done    { color: var(--good); border-color: rgba(82,217,140,0.3); background: var(--good-dim); }
.stage-status.failed  { color: var(--bad); border-color: rgba(240,112,112,0.3); background: var(--bad-dim); }

/* Stage config */
.stage-config {
  padding: 16px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, var(--accent-dim), transparent);
  display: flex; flex-direction: column; gap: 12px;
}
.stage-config-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.stage-config-title  { font-size: 14px; font-weight: 700; color: var(--accent-2); }
.stage-config-grid   { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

/* Launch bar */
.launch-bar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, var(--accent-dim), rgba(0,0,0,0));
}
.launch-info h3 { font-size: 14px; color: var(--accent-2); }
.launch-info p  { font-size: 12px; color: var(--muted); margin-top: 3px; }

/* Exec log */
.exec-log {
  display: flex; flex-direction: column; gap: 4px;
  max-height: 200px; overflow-y: auto;
  padding: 12px;
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 11px;
}
.log-line        { color: var(--soft); line-height: 1.6; }
.log-line.accent { color: var(--accent-2); }
.log-line.good   { color: var(--good); }
.log-line.warn   { color: var(--warn); }
.log-line.bad    { color: var(--bad); }
.log-line.muted  { color: var(--muted); }

/* Run config */
.run-config-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.config-toggle {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface-3);
  cursor: pointer; transition: .15s;
}
.config-toggle:hover { border-color: var(--border-strong); }
.config-toggle.on    { border-color: var(--accent-border); background: var(--accent-dim); }
.config-toggle-label { font-size: 11px; font-weight: 700; color: var(--soft); }
.config-toggle.on .config-toggle-label { color: var(--accent-2); }
.config-toggle-desc  { font-size: 10px; color: var(--muted); line-height: 1.4; }

/* ── Right rail ── */
.right-rail { display: flex; flex-direction: column; gap: 12px; }

/* Model activity */
.job-monitor { display: flex; flex-direction: column; gap: 8px; }
.model-activity-list { display: flex; flex-direction: column; gap: 6px; }
.model-activity-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--radius-xs);
  border: 1px solid var(--border); background: var(--surface-3);
  font-size: 11px;
}
.model-activity-item.active { border-color: var(--accent-border); background: var(--accent-dim); }
.model-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
.model-dot.active { background: var(--accent); box-shadow: 0 0 6px var(--accent); animation: pulse 1.4s ease infinite; }
.model-dot.done   { background: var(--good); }
.model-name { font-weight: 700; color: var(--soft); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-task { color: var(--muted); font-size: 10px; }
.model-activity-item.active .model-name { color: var(--accent-2); }
.model-activity-item.active .model-task { color: var(--accent); }

/* Artifacts */
.artifact-list { display: flex; flex-direction: column; gap: 6px; }
.artifact-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 12px; border-radius: var(--radius-xs);
  border: 1px solid var(--border); background: var(--surface-3);
  cursor: pointer; transition: .15s; width: 100%; text-align: left;
}
.artifact-item:hover { border-color: var(--accent-border); }
.artifact-item.active { border-color: var(--accent-border); background: var(--accent-dim); }
.artifact-title { font-size: 12px; font-weight: 700; color: var(--text); }
.artifact-meta  { font-size: 10px; color: var(--muted); }
.artifact-item.active .artifact-title { color: var(--accent-2); }

.artifact-viewer-panel { display: flex; flex-direction: column; gap: 10px; }
.artifact-viewer-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
}
.artifact-viewer-body {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 11px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-all;
  max-height: 400px; overflow-y: auto;
  padding: 12px;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--soft);
}

/* Run history */
.run-list { display: flex; flex-direction: column; gap: 6px; }
.run-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 9px 11px; border-radius: var(--radius-xs);
  border: 1px solid var(--border); background: var(--surface-3);
  font-size: 11px; cursor: pointer; text-align: left; width: 100%;
  transition: .15s;
}
.run-item:hover { border-color: var(--border-strong); }
.run-title { font-weight: 700; color: var(--soft); }
.run-meta  { color: var(--muted); }

/* ── Shared components ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 14px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface-3);
  color: var(--text); font-size: 13px; font-weight: 600;
  transition: .15s ease; white-space: nowrap;
}
.btn:hover    { background: rgba(255,255,255,0.06); border-color: var(--border-strong); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--primary {
  background: linear-gradient(135deg, var(--accent-dim), rgba(0,0,0,0.2));
  border-color: var(--accent-border); color: var(--accent-2);
}
.btn--primary:hover { filter: brightness(1.1); }
.btn--launch {
  padding: 12px 24px; font-size: 14px;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, white));
  border-color: var(--accent); color: #05090f; font-weight: 800;
  box-shadow: 0 4px 20px color-mix(in srgb, var(--accent) 30%, transparent);
}
.btn--launch:hover  { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 40%, transparent); }
.btn--launch:active { transform: translateY(0); }
.btn--sm     { padding: 5px 10px; font-size: 11px; border-radius: var(--radius-xs); }
.btn--danger { border-color: rgba(240,112,112,0.3); color: var(--bad); }
.btn--danger:hover { background: var(--bad-dim); }
.btn-row     { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.input, .select, .textarea {
  width: 100%;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: rgba(0,0,0,0.3); color: var(--text);
  padding: 8px 11px; font: inherit; font-size: 13px;
  outline: none; transition: border-color .15s;
}
.input:focus, .select:focus, .textarea:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.select--sm { padding: 5px 8px; font-size: 12px; border-radius: var(--radius-xs); }
.select { cursor: pointer; }
.textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
.textarea--tall { min-height: 200px; }
.textarea--code { font-family: ui-monospace, monospace; font-size: 12px; min-height: 300px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 11px; color: var(--muted); font-weight: 600; }
.field-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

.eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
.eyebrow.accent { color: var(--accent); }
.section-title { font-size: 15px; font-weight: 700; color: var(--soft); }
.section-meta  { font-size: 12px; color: var(--muted); margin-top: 3px; }

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 700;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.04); color: var(--muted);
}
.chip.good   { color: var(--good); background: var(--good-dim); border-color: rgba(82,217,140,0.25); }
.chip.warn   { color: var(--warn); background: var(--warn-dim); border-color: rgba(242,191,97,0.25); }
.chip.bad    { color: var(--bad);  background: var(--bad-dim);  border-color: rgba(240,112,112,0.25); }
.chip.accent { color: var(--accent-2); background: var(--accent-dim); border-color: var(--accent-border); }

.toast {
  position: fixed; right: 18px; bottom: 18px; z-index: 100;
  min-width: 220px; max-width: 360px;
  padding: 11px 14px; border-radius: var(--radius-sm);
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text); font-size: 13px; box-shadow: var(--shadow);
  opacity: 0; pointer-events: none; transform: translateY(8px);
  transition: .18s ease;
}
.toast.is-visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
.toast.good { border-color: rgba(82,217,140,0.3); }
.toast.warn { border-color: rgba(242,191,97,0.3); }
.toast.bad  { border-color: rgba(240,112,112,0.3); }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 20px; text-align: center;
}
.empty-icon   { font-size: 48px; }
.empty-state h2 { font-size: 20px; }
.empty-state p  { color: var(--muted); font-size: 13px; }

.new-project-form {
  padding: 14px; border-radius: var(--radius-sm);
  border: 1px solid var(--accent-border); background: var(--accent-dim);
  display: flex; flex-direction: column; gap: 10px;
}

.progress-bar { height: 3px; border-radius: 999px; background: var(--border); overflow: hidden; }
.progress-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  transition: width .5s ease;
}

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }

/* ── Responsive ── */
@media (max-width: 1400px) {
  .creator-layout { grid-template-columns: 260px 1fr 260px; }
  .run-config-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 1200px) {
  .creator-header { grid-template-columns: 1fr; }
  .header-nav { justify-content: flex-start; }
  .creator-layout { grid-template-columns: 240px 1fr; }
  .right-rail { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; }
  .ps-role-row { grid-template-columns: 120px 1fr; }
}
@media (max-width: 900px) {
  .creator-layout { grid-template-columns: 1fr; }
  .left-rail { position: static; }
  .right-rail { grid-template-columns: 1fr; }
  .stage-config-grid, .field-grid-2, .field-grid-3, .run-config-grid { grid-template-columns: 1fr; }
  .ps-role-row { grid-template-columns: 1fr; }
  .ps-role-name { font-size: 11px; }
}
