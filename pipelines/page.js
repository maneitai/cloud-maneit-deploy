:root {
  --bg: #071019;
  --bg-2: #0b1520;
  --panel: rgba(11, 21, 32, 0.92);
  --panel-2: rgba(15, 27, 40, 0.94);
  --border: rgba(255,255,255,0.08);
  --text: #eaf2fb;
  --muted: #8ea0b5;
  --accent: #6ee7ff;
  --accent-2: #8b5cf6;
  --good: #34d399;
  --warn: #fbbf24;
  --bad: #fb7185;
  --shadow: 0 18px 60px rgba(0,0,0,0.35);
  --radius: 20px;
  --chip: rgba(255,255,255,0.05);
}

* {
  box-sizing: border-box;
}

html {
  color-scheme: dark;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at top right, rgba(139,92,246,0.16), transparent 28%),
    radial-gradient(circle at top left, rgba(110,231,255,0.12), transparent 22%),
    linear-gradient(180deg, var(--bg), var(--bg-2));
}

.page-shell {
  width: min(1840px, calc(100vw - 32px));
  margin: 18px auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header,
.panel,
.surface-banner {
  background: linear-gradient(180deg, var(--panel), var(--panel-2));
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: var(--shadow);
}

.page-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  color: #08111f;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: var(--shadow);
}

.header-copy {
  min-width: 0;
}

.eyebrow {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin-bottom: 4px;
}

.page-header h1,
.section-title h2,
.section-title h3 {
  margin: 0;
}

.page-header p,
.muted,
.footer-note,
.soft,
.banner-note {
  color: var(--muted);
  line-height: 1.55;
}

.page-header p {
  font-size: 14px;
  margin: 6px 0 0;
  max-width: 920px;
}

.global-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.nav-link,
.button,
.select,
.input,
.textarea,
.library-chip {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  color: var(--text);
  text-decoration: none;
  padding: 10px 12px;
  font-size: 13px;
}

.nav-link {
  font-weight: 700;
}

.nav-link:hover,
.nav-link--active,
.library-chip:hover {
  background: rgba(255,255,255,0.07);
}

.header-actions,
.button-row,
.chip-row,
.workbench-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip,
.status-chip,
.node-badge,
.portal-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  background: var(--chip);
  border: 1px solid rgba(255,255,255,0.04);
  font-size: 12px;
  color: var(--text);
}

.status-chip--good { color: var(--good); }
.status-chip--warn { color: var(--warn); }

.surface-banner {
  padding: 16px 18px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.pipeline-layout {
  display: grid;
  grid-template-columns: 320px 1fr 360px;
  gap: 16px;
  align-items: start;
}

.panel {
  padding: 18px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title span {
  color: var(--muted);
  font-size: 12px;
}

.stack {
  display: grid;
  gap: 16px;
}

.stack--sm {
  gap: 12px;
}

.stack--md {
  gap: 16px;
}

.card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 18px;
  padding: 14px;
}

.card--compact {
  padding: 14px;
}

.field-grid {
  display: grid;
  gap: 12px;
}

.inline-field {
  display: grid;
  gap: 6px;
}

.button {
  cursor: pointer;
  font-weight: 700;
  transition: .18s ease;
}

.button:hover {
  transform: translateY(-1px);
  border-color: rgba(110,231,255,0.18);
}

.button--primary {
  background: linear-gradient(135deg, rgba(110,231,255,0.18), rgba(139,92,246,0.18));
  border-color: rgba(110,231,255,0.24);
}

.library-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.library-chip {
  cursor: pointer;
  font-weight: 700;
}

.rule-list {
  margin: 0;
  padding-left: 18px;
  color: var(--muted);
  display: grid;
  gap: 8px;
  line-height: 1.5;
}

.workbench-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.meta-card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 18px;
  padding: 14px;
  display: grid;
  gap: 6px;
}

.meta-card strong {
  font-size: 15px;
}

.meta-card span {
  color: var(--muted);
  font-size: 12px;
}

.workbench-toolbar {
  margin-bottom: 14px;
}

.chip-button {
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
}

.workbench-canvas {
  position: relative;
  min-height: 760px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.06);
  background:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(180deg, rgba(13, 22, 33, 0.98), rgba(10, 18, 28, 0.98));
  background-size: 28px 28px, 28px 28px, auto;
  overflow: hidden;
}

.canvas-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.edge {
  position: absolute;
  height: 2px;
  background: linear-gradient(90deg, rgba(110,231,255,0.55), rgba(139,92,246,0.55));
  transform-origin: left center;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.02);
}

.edge--1 {
  left: 188px;
  top: 141px;
  width: 172px;
  transform: rotate(0deg);
}

.edge--2 {
  left: 430px;
  top: 152px;
  width: 170px;
  transform: rotate(0deg);
}

.edge--3 {
  left: 670px;
  top: 162px;
  width: 160px;
  transform: rotate(0deg);
}

.edge--4 {
  left: 430px;
  top: 284px;
  width: 170px;
  transform: rotate(0deg);
}

.edge--5 {
  left: 844px;
  top: 164px;
  width: 145px;
  transform: rotate(0deg);
}

.pipeline-node {
  position: absolute;
  width: 220px;
  min-height: 128px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(8, 14, 22, 0.95);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 14px 36px rgba(0,0,0,0.32);
  display: grid;
  gap: 10px;
  cursor: grab;
  user-select: none;
}

.pipeline-node:active {
  cursor: grabbing;
}

.pipeline-node.is-selected {
  border-color: rgba(110,231,255,0.36);
  box-shadow: 0 0 0 1px rgba(110,231,255,0.12), 0 14px 36px rgba(0,0,0,0.32);
}

.pipeline-node::before,
.pipeline-node::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.12);
  transform: translateY(-50%);
}

.pipeline-node::before {
  left: -6px;
}

.pipeline-node::after {
  right: -6px;
}

.node-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.node-type {
  display: inline-flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.node-type--input {
  color: #9fe8ff;
  background: rgba(110,231,255,0.12);
}

.node-type--planner {
  color: #d4b8ff;
  background: rgba(139,92,246,0.14);
}

.node-type--coder {
  color: #b3ffd8;
  background: rgba(52,211,153,0.14);
}

.node-type--verifier {
  color: #ffe49f;
  background: rgba(251,191,36,0.16);
}

.node-type--auditor {
  color: #ffd0dc;
  background: rgba(251,113,133,0.14);
}

.node-type--branch {
  color: #cdd6e5;
  background: rgba(255,255,255,0.08);
}

.node-type--projection {
  color: #bfe0ff;
  background: rgba(96,165,250,0.16);
}

.node-badge {
  font-size: 11px;
}

.pipeline-node strong {
  font-size: 15px;
}

.pipeline-node p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.node-meta {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.pipeline-node--input { left: 46px; top: 78px; }
.pipeline-node--planner { left: 286px; top: 78px; }
.pipeline-node--coder { left: 526px; top: 78px; }
.pipeline-node--verifier { left: 766px; top: 78px; }
.pipeline-node--auditor { left: 1006px; top: 78px; }
.pipeline-node--branch { left: 286px; top: 220px; }
.pipeline-node--projection { left: 1246px; top: 78px; }

.portal-preview {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.05);
}

.portal-preview strong {
  margin-right: auto;
}

.textarea {
  width: 100%;
  min-height: 110px;
  resize: vertical;
  background: #0b1520;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  font: inherit;
}

.toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 50;
  min-width: 260px;
  max-width: 420px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(10, 17, 24, 0.94);
  color: var(--text);
  box-shadow: var(--shadow);
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px);
  transition: .18s ease;
}

.toast.is-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.toast.good { border-color: rgba(52,211,153,0.3); }
.toast.warn { border-color: rgba(251,191,36,0.3); }
.toast.bad { border-color: rgba(251,113,133,0.3); }

@media (max-width: 1650px) {
  .pipeline-layout {
    grid-template-columns: 300px 1fr;
  }

  .panel-right {
    grid-column: 1 / -1;
  }

  .workbench-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1450px) {
  .page-header {
    grid-template-columns: 1fr;
  }

  .global-nav,
  .header-actions,
  .button-row {
    justify-content: flex-start;
  }
}

@media (max-width: 1180px) {
  .page-shell {
    width: min(100vw - 18px, 1840px);
  }

  .pipeline-layout {
    grid-template-columns: 1fr;
  }

  .workbench-meta {
    grid-template-columns: 1fr;
  }

  .page-header,
  .surface-banner {
    display: grid;
    gap: 12px;
  }
}

@media (max-width: 840px) {
  .workbench-canvas {
    min-height: 980px;
  }

  .pipeline-node {
    width: 200px;
  }
}
