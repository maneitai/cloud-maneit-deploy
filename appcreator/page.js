// ═══════════════════════════════════════════════════════════════════════════
// AppCore Creator — page.js
// ═══════════════════════════════════════════════════════════════════════════

const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const FREE_SESSION_ID = "chat-appcore-01";
const SURFACE = "appcore";

const TOOL_ICONS = {
  web_search: "🔍", web_fetch: "🌐", web_crawl: "🕷️", run_python: "🐍",
  read_file: "📂", read_server_file: "🗄️", list_server_files: "📁",
  grep_files: "🔎", query_database: "🗃️", http_request: "📡",
  write_file: "✏️", shell_command: "💻", diff_text: "📊",
  summarise_large_file: "📄", image_analyse: "🖼️", call_model: "🤖",
};

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  // Mode
  uiMode: "design",            // "design" | "library"
  pipelineCollapsed: false,

  // Foundation (workspaces/apps/versions/categories)
  workspaces: [], apps: [], versions: [], categories: [],
  selectedWorkspaceId: null,
  selectedAppId: null,
  selectedVersionId: null,

  // Loaded from /apps/{id}/overview — drives tier visibility, scope status
  appOverview: null,           // { app, active_tiers, scope_status, memory, recent_runs }

  // Sessions / chat
  sessions: [],
  selectedSessionId: FREE_SESSION_ID,
  freeMode: true,
  messages: [],
  streaming: false,
  chatMode: "single",
  selectedModels: [],
  availableModels: [],

  // Library / records
  activeTier: "foundation",
  activeResource: null,
  records: [],
  activeRecord: null,

  // Pipelines
  pipelineTemplates: [],       // /pipelines/for-app/{id} — templates resolved per app
  recentRuns: [],

  // Library tree open state — keyed by tier id, default collapsed except foundation
  treeOpen: { foundation: true },
};

// ── DOM helpers ───────────────────────────────────────────────────────────
const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const escHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");

function showToast(msg, tone = "good") {
  const t = qs("#toast"); if (!t) return;
  t.textContent = msg; t.className = `toast ${tone} is-visible`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2800);
}
function setChip(id, text, cls) { const el = qs(id); if (!el) return; el.textContent = text; el.className = `status-chip ${cls || ""}`; }

function renderMarkdown(text) {
  if (!text) return "";
  let t = escHtml(text);
  t = t.replace(/```[\s\S]*?```/g, m => {
    const inner = m.slice(3, -3).replace(/^[a-z]*\n/, "");
    return `<pre><code>${inner}</code></pre>`;
  });
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  t = t.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${t}</p>`;
}

async function api(path, opts = {}) {
  const cfg = { method: "GET", headers: {}, ...opts };
  if (cfg.body && typeof cfg.body !== "string") {
    cfg.headers["Content-Type"] = "application/json";
    cfg.body = JSON.stringify(cfg.body);
  }
  try {
    const res = await fetch(`${PM_API_BASE}${path}`, cfg);
    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) { return { ok: false, status: 0, error: String(e) }; }
}

function parseSurfaces(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

// Helper: pull array out of {items: [...]} responses or raw arrays
function arr(body, key = "items") {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body[key])) return body[key];
  return [];
}
// ═══════════════════════════════════════════════════════════════════════════
// TIER & RESOURCE DEFINITIONS — 22 tiers + pipelines tab
// ═══════════════════════════════════════════════════════════════════════════
// Each tier has tier_index matching the seeded category.activates_tiers values.
// `tier_index = null` means always-on (foundation, pipelines).
// Resources list: { id, label, endpoint, scopeKey, table, sub_scope? }.
// scopeKey is the query-string param name used to filter list by parent.
// Common scopeKey values:
//   "app"      — filters by app_public_id (most resources)
//   "version"  — filters by version_public_id
//   "schema"   — for migrations under a db_schema
//   "integration" — for sync/auth/conflict rules under an integration
//   "catalog"  — for catalog_items
//   "data_model" — for fields/relations under a model
//   "household" — for household-scoped child rows where applicable
//   etc.
//
// The frontend always queries with `app=<app_public_id>` because the backend
// indexes everything by app_public_id. Parent filters are ALSO sent when
// available so users can drill into one parent's children.

const TIERS = {
  foundation: {
    label: "Foundation", tier_index: 0,
    resources: [
      { id: "design-pillars",      label: "Design pillars",     endpoint: "/api/appcore/design-pillars",      scopeKey: "app", table: "appcore_design_pillars" },
      { id: "purpose-statements",  label: "Purpose statements", endpoint: "/api/appcore/purpose-statements",  scopeKey: "app", table: "appcore_purpose_statements" },
      { id: "limitations",         label: "Limitations",        endpoint: "/api/appcore/limitations",         scopeKey: "app", table: "appcore_limitations" },
      { id: "design-decisions",    label: "Design decisions",   endpoint: "/api/appcore/design-decisions",    scopeKey: "app", table: "appcore_design_decisions" },
      { id: "notes",               label: "Notes",              endpoint: "/api/appcore/notes",               scopeKey: "app", table: "appcore_notes" },
    ],
  },
  domain: {
    label: "Domain", tier_index: 1,
    resources: [
      { id: "personas",          label: "Personas",          endpoint: "/api/appcore/personas",          scopeKey: "app", table: "appcore_personas" },
      { id: "jobs-to-be-done",   label: "Jobs to be done",   endpoint: "/api/appcore/jobs-to-be-done",   scopeKey: "app", table: "appcore_jobs_to_be_done" },
      { id: "use-cases",         label: "Use cases",         endpoint: "/api/appcore/use-cases",         scopeKey: "app", table: "appcore_use_cases" },
      { id: "features",          label: "Features",          endpoint: "/api/appcore/features",          scopeKey: "app", table: "appcore_features" },
      { id: "user-flows",        label: "User flows",        endpoint: "/api/appcore/user-flows",        scopeKey: "app", table: "appcore_user_flows" },
      { id: "entities",          label: "Entities",          endpoint: "/api/appcore/entities",          scopeKey: "app", table: "appcore_entities" },
    ],
  },
  interface: {
    label: "Interface", tier_index: 2,
    resources: [
      { id: "screens",        label: "Screens",        endpoint: "/api/appcore/screens",        scopeKey: "app", table: "appcore_screens" },
      { id: "components",     label: "Components",     endpoint: "/api/appcore/components",     scopeKey: "app", table: "appcore_components" },
      { id: "layouts",        label: "Layouts",        endpoint: "/api/appcore/layouts",        scopeKey: "app", table: "appcore_layouts" },
      { id: "design-tokens",  label: "Design tokens",  endpoint: "/api/appcore/design-tokens",  scopeKey: "app", table: "appcore_design_tokens" },
    ],
  },
  functions: {
    label: "Functions", tier_index: 3,
    resources: [
      { id: "function-categories", label: "Function categories", endpoint: "/api/appcore/function-categories", scopeKey: "app", table: "appcore_function_categories" },
      { id: "functions",           label: "Functions",           endpoint: "/api/appcore/functions",           scopeKey: "app", table: "appcore_functions" },
      { id: "function-chains",     label: "Function chains",     endpoint: "/api/appcore/function-chains",     scopeKey: "app", table: "appcore_function_chains" },
    ],
  },
  data: {
    label: "Data", tier_index: 4,
    resources: [
      { id: "catalogs",                label: "Catalogs",                endpoint: "/api/appcore/catalogs",                scopeKey: "app", table: "appcore_catalogs" },
      { id: "catalog-items",           label: "Catalog items",           endpoint: "/api/appcore/catalog-items",           scopeKey: "app", table: "appcore_catalog_items" },
      { id: "data-models",             label: "Data models",             endpoint: "/api/appcore/data-models",             scopeKey: "app", table: "appcore_data_models" },
      { id: "data-model-fields",       label: "Model fields",            endpoint: "/api/appcore/data-model-fields",       scopeKey: "app", table: "appcore_data_model_fields" },
      { id: "data-model-relations",    label: "Model relations",         endpoint: "/api/appcore/data-model-relations",    scopeKey: "app", table: "appcore_data_model_relations" },
      { id: "settings",                label: "Settings",                endpoint: "/api/appcore/settings",                scopeKey: "app", table: "appcore_settings" },
      { id: "report-formats",          label: "Report formats",          endpoint: "/api/appcore/report-formats",          scopeKey: "app", table: "appcore_report_formats" },
    ],
  },
  tech: {
    label: "Tech", tier_index: 5,
    resources: [
      { id: "tech-stacks",   label: "Tech stacks",   endpoint: "/api/appcore/tech-stacks",   scopeKey: "app", table: "appcore_tech_stacks" },
      { id: "dependencies",  label: "Dependencies",  endpoint: "/api/appcore/dependencies",  scopeKey: "app", table: "appcore_dependencies" },
      { id: "file-layouts",  label: "File layouts",  endpoint: "/api/appcore/file-layouts",  scopeKey: "app", table: "appcore_file_layouts" },
    ],
  },
  distribution: {
    label: "Distribution", tier_index: 6,
    resources: [
      { id: "launchers",          label: "Launchers",          endpoint: "/api/appcore/launchers",          scopeKey: "app", table: "appcore_launchers" },
      { id: "packaging-targets",  label: "Packaging targets",  endpoint: "/api/appcore/packaging-targets",  scopeKey: "app", table: "appcore_packaging_targets" },
    ],
  },
  cognitive: {
    label: "Cognitive", tier_index: 7,
    resources: [
      { id: "cognitive-profiles",   label: "Cognitive profiles",   endpoint: "/api/appcore/cognitive-profiles",   scopeKey: "app", table: "appcore_cognitive_profiles" },
      { id: "friction-points",      label: "Friction points",      endpoint: "/api/appcore/friction-points",      scopeKey: "app", table: "appcore_friction_points" },
      { id: "affordance-choices",   label: "Affordance choices",   endpoint: "/api/appcore/affordance-choices",   scopeKey: "app", table: "appcore_affordance_choices" },
      { id: "anti-patterns",        label: "Anti-patterns",        endpoint: "/api/appcore/anti-patterns",        scopeKey: "app", table: "appcore_anti_patterns" },
    ],
  },
  household: {
    label: "Household", tier_index: 8,
    resources: [
      { id: "household-members",   label: "Members",            endpoint: "/api/appcore/household-members",   scopeKey: "app", table: "appcore_household_members" },
      { id: "shared-resources",    label: "Shared resources",   endpoint: "/api/appcore/shared-resources",    scopeKey: "app", table: "appcore_shared_resources" },
      { id: "invisible-labor",     label: "Invisible labor",    endpoint: "/api/appcore/invisible-labor",     scopeKey: "app", table: "appcore_invisible_labor" },
      { id: "coordination-flows",  label: "Coordination flows", endpoint: "/api/appcore/coordination-flows",  scopeKey: "app", table: "appcore_coordination_flows" },
      { id: "delegation-patterns", label: "Delegation patterns",endpoint: "/api/appcore/delegation-patterns", scopeKey: "app", table: "appcore_delegation_patterns" },
      { id: "exception-flows",     label: "Exception flows",    endpoint: "/api/appcore/exception-flows",     scopeKey: "app", table: "appcore_exception_flows" },
    ],
  },
  multiuser: {
    label: "Multi-user", tier_index: 9,
    resources: [
      { id: "users",              label: "Users",              endpoint: "/api/appcore/users",              scopeKey: "app", table: "appcore_users" },
      { id: "roles",              label: "Roles",              endpoint: "/api/appcore/roles",              scopeKey: "app", table: "appcore_roles" },
      { id: "permissions",        label: "Permissions",        endpoint: "/api/appcore/permissions",        scopeKey: "app", table: "appcore_permissions" },
      { id: "audit-log-entries",  label: "Audit log entries",  endpoint: "/api/appcore/audit-log-entries",  scopeKey: "app", table: "appcore_audit_log_entries" },
    ],
  },
  field: {
    label: "Field ops", tier_index: 10,
    resources: [
      { id: "shifts",           label: "Shifts",           endpoint: "/api/appcore/shifts",           scopeKey: "app", table: "appcore_shifts" },
      { id: "field-locations",  label: "Field locations",  endpoint: "/api/appcore/field-locations",  scopeKey: "app", table: "appcore_field_locations" },
      { id: "field-actions",    label: "Field actions",    endpoint: "/api/appcore/field-actions",    scopeKey: "app", table: "appcore_field_actions" },
      { id: "capture-modes",    label: "Capture modes",    endpoint: "/api/appcore/capture-modes",    scopeKey: "app", table: "appcore_capture_modes" },
    ],
  },
  integrations: {
    label: "Integrations", tier_index: 11,
    resources: [
      { id: "integrations",                label: "Integrations",                endpoint: "/api/appcore/integrations",                scopeKey: "app", table: "appcore_integrations" },
      { id: "integration-auth-configs",    label: "Auth configs",                endpoint: "/api/appcore/integration-auth-configs",    scopeKey: "app", table: "appcore_integration_auth_configs" },
      { id: "integration-sync-rules",      label: "Sync rules",                  endpoint: "/api/appcore/integration-sync-rules",      scopeKey: "app", table: "appcore_integration_sync_rules" },
      { id: "integration-conflict-rules",  label: "Conflict rules",              endpoint: "/api/appcore/integration-conflict-rules",  scopeKey: "app", table: "appcore_integration_conflict_rules" },
    ],
  },
  chemical: {
    label: "Chemical", tier_index: 12,
    resources: [
      { id: "chemical-units",        label: "Units",        endpoint: "/api/appcore/chemical-units",        scopeKey: "app", table: "appcore_chemical_units" },
      { id: "chemical-vessels",      label: "Vessels",      endpoint: "/api/appcore/chemical-vessels",      scopeKey: "app", table: "appcore_chemical_vessels" },
      { id: "chemical-instruments",  label: "Instruments",  endpoint: "/api/appcore/chemical-instruments",  scopeKey: "app", table: "appcore_chemical_instruments" },
      { id: "chemical-samples",      label: "Samples",      endpoint: "/api/appcore/chemical-samples",      scopeKey: "app", table: "appcore_chemical_samples" },
    ],
  },
  windows: {
    label: "Windows", tier_index: 13,
    resources: [
      { id: "windows-specs", label: "Windows specs", endpoint: "/api/appcore/windows-specs", scopeKey: "app", table: "appcore_windows_specs" },
    ],
  },
  macos: {
    label: "macOS", tier_index: 14,
    resources: [
      { id: "macos-specs", label: "macOS specs", endpoint: "/api/appcore/macos-specs", scopeKey: "app", table: "appcore_macos_specs" },
    ],
  },
  linux: {
    label: "Linux", tier_index: 15,
    resources: [
      { id: "linux-specs", label: "Linux specs", endpoint: "/api/appcore/linux-specs", scopeKey: "app", table: "appcore_linux_specs" },
    ],
  },
  android: {
    label: "Android", tier_index: 16,
    resources: [
      { id: "android-specs", label: "Android specs", endpoint: "/api/appcore/android-specs", scopeKey: "app", table: "appcore_android_specs" },
    ],
  },
  ios: {
    label: "iOS", tier_index: 17,
    resources: [
      { id: "ios-specs", label: "iOS specs", endpoint: "/api/appcore/ios-specs", scopeKey: "app", table: "appcore_ios_specs" },
    ],
  },
  web: {
    label: "Web", tier_index: 18,
    resources: [
      { id: "web-specs", label: "Web specs", endpoint: "/api/appcore/web-specs", scopeKey: "app", table: "appcore_web_specs" },
    ],
  },
  backend: {
    label: "Backend", tier_index: 19,
    resources: [
      { id: "db-schemas",           label: "DB schemas",           endpoint: "/api/appcore/db-schemas",           scopeKey: "app", table: "appcore_db_schemas" },
      { id: "db-migrations",        label: "DB migrations",        endpoint: "/api/appcore/db-migrations",        scopeKey: "app", table: "appcore_db_migrations" },
      { id: "auth-flows",           label: "Auth flows",           endpoint: "/api/appcore/auth-flows",           scopeKey: "app", table: "appcore_auth_flows" },
      { id: "background-jobs",      label: "Background jobs",      endpoint: "/api/appcore/background-jobs",      scopeKey: "app", table: "appcore_background_jobs" },
      { id: "caching-strategies",   label: "Caching strategies",   endpoint: "/api/appcore/caching-strategies",   scopeKey: "app", table: "appcore_caching_strategies" },
    ],
  },
  operational: {
    label: "Operational", tier_index: 20,
    resources: [
      { id: "environments",        label: "Environments",        endpoint: "/api/appcore/environments",        scopeKey: "app", table: "appcore_environments" },
      { id: "deployments",         label: "Deployments",         endpoint: "/api/appcore/deployments",         scopeKey: "app", table: "appcore_deployments" },
      { id: "monitoring-signals",  label: "Monitoring signals",  endpoint: "/api/appcore/monitoring-signals",  scopeKey: "app", table: "appcore_monitoring_signals" },
      { id: "incidents",           label: "Incidents",           endpoint: "/api/appcore/incidents",           scopeKey: "app", table: "appcore_incidents" },
    ],
  },
  bridges: {
    label: "Bridges", tier_index: 21,
    resources: [
      { id: "cross-platform-bridges",  label: "Cross-platform bridges",  endpoint: "/api/appcore/cross-platform-bridges",  scopeKey: "app", table: "appcore_cross_platform_bridges" },
      { id: "shared-data-contracts",   label: "Shared data contracts",   endpoint: "/api/appcore/shared-data-contracts",   scopeKey: "app", table: "appcore_shared_data_contracts" },
    ],
  },
  pipelines: {
    label: "Pipelines", tier_index: null,    // always shown
    resources: [
      { id: "pipelines",       label: "Pipeline templates",  endpoint: "/api/appcore/pipelines",       scopeKey: "app", table: "appcore_pipelines" },
      { id: "pipeline-runs",   label: "Pipeline runs",       endpoint: "/api/appcore/pipeline-runs",   scopeKey: "app", table: "appcore_pipeline_runs" },
      { id: "recipes",         label: "Recipes",             endpoint: "/api/appcore/recipes",         scopeKey: "app", table: "appcore_recipes" },
      { id: "validators",      label: "Validators",          endpoint: "/api/appcore/validators",      scopeKey: "app", table: "appcore_validators" },
      { id: "category-links",  label: "Category links",      endpoint: "/api/appcore/category-links",  scopeKey: "app", table: "appcore_category_links" },
    ],
  },
};

// Tier display order for the lib-tabs and library tree
const TIER_ORDER = [
  "foundation", "domain", "interface", "functions", "data", "tech", "distribution",
  "cognitive", "household", "multiuser", "field", "integrations", "chemical",
  "windows", "macos", "linux", "android", "ios", "web",
  "backend", "operational", "bridges", "pipelines",
];
// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE_FIELDS — per-resource editable field schemas
// ═══════════════════════════════════════════════════════════════════════════
// Tiered density:
//   - Tier 0/1/7/Pipelines  → fully hand-tuned (operator-facing daily drivers)
//   - Tier 2-6, Tier 8-12   → moderate (good labels + select enums where it matters)
//   - Tier 13-21            → thin (name, description, kind, key fields as JSON textarea)
//
// Field types: input | textarea | number | select(options) | checkbox
// Field name === DB column name (snake_case). JSONB columns rendered as
// textarea with JSON parsing on save. JSON-shaped fields list at the bottom.

const RESOURCE_FIELDS = {

  // ─── Tier 0: Foundation (HAND-TUNED) ─────────────────────────────────────
  "design-pillars": [
    { name: "name", type: "input", label: "Name" },
    { name: "pillar_order", type: "number", label: "Order" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "rationale", type: "textarea", label: "Rationale" },
    { name: "non_goals", type: "textarea", label: "Non-goals" },
  ],
  "purpose-statements": [
    { name: "name", type: "input", label: "Name" },
    { name: "kind", type: "select", label: "Kind", options: ["mission","vision","tagline","one_liner","elevator_pitch"] },
    { name: "statement", type: "textarea", label: "Statement" },
    { name: "audience", type: "input", label: "Audience" },
    { name: "is_canonical", type: "checkbox", label: "Canonical" },
  ],
  "limitations": [
    { name: "name", type: "input", label: "Name" },
    { name: "kind", type: "select", label: "Kind", options: ["technical","budgetary","temporal","regulatory","cognitive","strategic","ethical"] },
    { name: "severity", type: "select", label: "Severity", options: ["info","minor","major","blocker"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "rationale", type: "textarea", label: "Rationale" },
    { name: "mitigation", type: "textarea", label: "Mitigation" },
  ],
  "design-decisions": [
    { name: "title", type: "input", label: "Title" },
    { name: "context", type: "textarea", label: "Context" },
    { name: "decision", type: "textarea", label: "Decision" },
    { name: "rationale", type: "textarea", label: "Rationale" },
    { name: "alternatives", type: "textarea", label: "Alternatives (JSON array)" },
    { name: "status", type: "select", label: "Status", options: ["proposed","accepted","superseded","reversed","deprecated"] },
    { name: "consequence_summary", type: "textarea", label: "Consequence summary" },
  ],
  "notes": [
    { name: "title", type: "input", label: "Title" },
    { name: "scope_kind", type: "select", label: "Scope kind", options: ["app","feature","function","data_model","screen","persona","integration","general"] },
    { name: "scope_public_id", type: "input", label: "Scope public_id" },
    { name: "content", type: "textarea", label: "Content" },
    { name: "tags", type: "textarea", label: "Tags (JSON array of strings)" },
    { name: "is_pinned", type: "checkbox", label: "Pinned" },
  ],

  // ─── Tier 1: Domain modeling (HAND-TUNED) ────────────────────────────────
  "personas": [
    { name: "name", type: "input", label: "Name" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "cognitive_profile_public_id", type: "input", label: "Cognitive profile (public_id)" },
    { name: "primary_goals", type: "textarea", label: "Primary goals (JSON array)" },
    { name: "primary_frustrations", type: "textarea", label: "Primary frustrations (JSON array)" },
    { name: "constraints", type: "textarea", label: "Constraints (JSON array)" },
    { name: "context_of_use", type: "textarea", label: "Context of use" },
  ],
  "jobs-to-be-done": [
    { name: "name", type: "input", label: "Name" },
    { name: "job_kind", type: "select", label: "Job kind", options: ["functional","emotional","social","support","hidden"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "when_situation", type: "textarea", label: "When (situation)" },
    { name: "i_want", type: "textarea", label: "I want to…" },
    { name: "so_that", type: "textarea", label: "…so that" },
    { name: "priority", type: "select", label: "Priority", options: ["must","should","could","wont"] },
    { name: "persona_public_ids", type: "textarea", label: "Persona public_ids (JSON array)" },
  ],
  "use-cases": [
    { name: "name", type: "input", label: "Name" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "persona_public_id", type: "input", label: "Persona (public_id)" },
    { name: "jtbd_public_id", type: "input", label: "JTBD (public_id)" },
    { name: "criticality", type: "select", label: "Criticality", options: ["low","normal","high","mission_critical"] },
    { name: "preconditions", type: "textarea", label: "Preconditions (JSON array)" },
    { name: "postconditions", type: "textarea", label: "Postconditions (JSON array)" },
    { name: "happy_path", type: "textarea", label: "Happy path" },
    { name: "alternative_paths", type: "textarea", label: "Alternative paths" },
  ],
  "features": [
    { name: "name", type: "input", label: "Name" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "moscow", type: "select", label: "MoSCoW", options: ["must","should","could","wont"] },
    { name: "status", type: "select", label: "Status", options: ["proposed","accepted","building","shipped","deprecated"] },
    { name: "serves_jtbd_public_ids", type: "textarea", label: "Serves JTBD (JSON array)" },
    { name: "serves_use_case_public_ids", type: "textarea", label: "Serves use cases (JSON array)" },
    { name: "depends_on_feature_public_ids", type: "textarea", label: "Depends on features (JSON array)" },
    { name: "acceptance_criteria", type: "textarea", label: "Acceptance criteria (JSON array)" },
  ],
  "user-flows": [
    { name: "name", type: "input", label: "Name" },
    { name: "flow_kind", type: "select", label: "Flow kind", options: ["primary","secondary","exception","onboarding","error_recovery","power_user"] },
    { name: "use_case_public_id", type: "input", label: "Use case (public_id)" },
    { name: "persona_public_id", type: "input", label: "Persona (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "steps", type: "textarea", label: "Steps (JSON array of {index, action, screen_public_id?})" },
    { name: "cognitive_load_curve", type: "textarea", label: "Cognitive load curve (JSON array of {step, load})" },
  ],
  "entities": [
    { name: "name", type: "input", label: "Name" },
    { name: "entity_kind", type: "select", label: "Entity kind", options: ["concept","artifact","actor","record","aggregate","value_object"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "key_attributes", type: "textarea", label: "Key attributes (JSON array)" },
    { name: "lifecycle_states", type: "textarea", label: "Lifecycle states (JSON array)" },
    { name: "relationships", type: "textarea", label: "Relationships (JSON array)" },
  ],

  // ─── Tier 2-3: Interface + Functions (MODERATE) ──────────────────────────
  "screens": [
    { name: "name", type: "input", label: "Name" },
    { name: "screen_kind", type: "select", label: "Screen kind", options: ["primary","detail","list","dialog","wizard","empty_state","error","settings"] },
    { name: "screen_role", type: "select", label: "Role", options: ["entry","work","review","decision","confirmation","navigation"] },
    { name: "layout_public_id", type: "input", label: "Layout (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "primary_action", type: "input", label: "Primary action" },
    { name: "secondary_actions", type: "textarea", label: "Secondary actions (JSON array)" },
  ],
  "components": [
    { name: "name", type: "input", label: "Name" },
    { name: "component_kind", type: "select", label: "Kind", options: ["atom","molecule","organism","template","page_section"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "variants", type: "textarea", label: "Variants (JSON array)" },
    { name: "states", type: "textarea", label: "States (JSON array)" },
    { name: "props", type: "textarea", label: "Props (JSON array)" },
    { name: "events", type: "textarea", label: "Events (JSON array)" },
    { name: "a11y_requirements", type: "textarea", label: "A11y requirements (JSON array)" },
  ],
  "layouts": [
    { name: "name", type: "input", label: "Name" },
    { name: "layout_kind", type: "select", label: "Kind", options: ["single_column","two_column","three_column","grid","split","stack","master_detail"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "slots", type: "textarea", label: "Slots (JSON array)" },
    { name: "responsive_rules", type: "textarea", label: "Responsive rules (JSON array)" },
  ],
  "design-tokens": [
    { name: "name", type: "input", label: "Name" },
    { name: "token_kind", type: "select", label: "Kind", options: ["color","spacing","radius","shadow","typography","motion","z_index","breakpoint"] },
    { name: "theme", type: "input", label: "Theme" },
    { name: "value", type: "input", label: "Value" },
    { name: "description", type: "textarea", label: "Description" },
  ],
  "function-categories": [
    { name: "name", type: "input", label: "Name" },
    { name: "parent_public_id", type: "input", label: "Parent category (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "functions": [
    { name: "name", type: "input", label: "Name" },
    { name: "function_kind", type: "select", label: "Kind", options: ["query","command","computation","integration","background","event_handler","validation"] },
    { name: "feature_public_id", type: "input", label: "Feature (public_id)" },
    { name: "category_public_id", type: "input", label: "Category (public_id)" },
    { name: "status", type: "select", label: "Status", options: ["proposed","accepted","building","shipped","deprecated"] },
    { name: "reversibility", type: "select", label: "Reversibility", options: ["safe","reversible","destructive","irreversible"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "inputs", type: "textarea", label: "Inputs (JSON array)" },
    { name: "outputs", type: "textarea", label: "Outputs (JSON array)" },
    { name: "side_effects", type: "textarea", label: "Side effects (JSON array)" },
    { name: "failure_modes", type: "textarea", label: "Failure modes (JSON array)" },
  ],
  "function-chains": [
    { name: "name", type: "input", label: "Name" },
    { name: "chain_kind", type: "select", label: "Kind", options: ["sequential","parallel","conditional","compensating","saga"] },
    { name: "status", type: "select", label: "Status", options: ["proposed","accepted","building","shipped","deprecated"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "steps", type: "textarea", label: "Steps (JSON array of {index, function_public_id, ...})" },
    { name: "triggers", type: "textarea", label: "Triggers (JSON array)" },
    { name: "rollback_strategy", type: "textarea", label: "Rollback strategy (JSON)" },
  ],

  // ─── Tier 4-6: Data + Tech + Distribution (MODERATE) ─────────────────────
  "catalogs": [
    { name: "name", type: "input", label: "Name" },
    { name: "catalog_kind", type: "select", label: "Kind", options: ["enum","reference","lookup","taxonomy","registry"] },
    { name: "source_kind", type: "select", label: "Source", options: ["seeded","user_managed","integration_synced","computed"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "item_schema", type: "textarea", label: "Item schema (JSON)" },
  ],
  "catalog-items": [
    { name: "catalog_public_id", type: "input", label: "Catalog (public_id)" },
    { name: "key", type: "input", label: "Key" },
    { name: "label", type: "input", label: "Label" },
    { name: "status", type: "select", label: "Status", options: ["active","draft","deprecated","archived"] },
    { name: "payload", type: "textarea", label: "Payload (JSON)" },
    { name: "tags", type: "textarea", label: "Tags (JSON array)" },
  ],
  "data-models": [
    { name: "name", type: "input", label: "Name" },
    { name: "entity_public_id", type: "input", label: "Entity (public_id)" },
    { name: "storage_kind", type: "select", label: "Storage", options: ["relational","document","key_value","graph","time_series","blob"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "primary_key", type: "textarea", label: "Primary key (JSON array)" },
    { name: "indexes", type: "textarea", label: "Indexes (JSON array)" },
    { name: "can_egress", type: "checkbox", label: "Can egress to integrations" },
  ],
  "data-model-fields": [
    { name: "data_model_public_id", type: "input", label: "Data model (public_id)" },
    { name: "name", type: "input", label: "Name" },
    { name: "data_type", type: "select", label: "Data type", options: ["string","text","integer","decimal","boolean","date","timestamp","uuid","json","binary","enum","array"] },
    { name: "is_required", type: "checkbox", label: "Required" },
    { name: "is_unique", type: "checkbox", label: "Unique" },
    { name: "sensitivity", type: "select", label: "Sensitivity", options: ["public","internal","confidential","pii","secret"] },
    { name: "enum_values", type: "textarea", label: "Enum values (JSON array)" },
    { name: "validation", type: "textarea", label: "Validation (JSON)" },
  ],
  "data-model-relations": [
    { name: "from_data_model_public_id", type: "input", label: "From model (public_id)" },
    { name: "to_data_model_public_id", type: "input", label: "To model (public_id)" },
    { name: "relation_kind", type: "select", label: "Kind", options: ["one_to_one","one_to_many","many_to_one","many_to_many","embedded"] },
    { name: "name", type: "input", label: "Relation name" },
    { name: "on_delete", type: "select", label: "On delete", options: ["cascade","restrict","set_null","no_action"] },
  ],
  "settings": [
    { name: "name", type: "input", label: "Name" },
    { name: "scope", type: "select", label: "Scope", options: ["app","user","workspace","tenant","environment"] },
    { name: "group_label", type: "input", label: "Group" },
    { name: "data_type", type: "select", label: "Data type", options: ["string","integer","decimal","boolean","enum","json"] },
    { name: "default_value", type: "input", label: "Default value" },
    { name: "enum_values", type: "textarea", label: "Enum values (JSON array)" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "report-formats": [
    { name: "name", type: "input", label: "Name" },
    { name: "format_kind", type: "select", label: "Kind", options: ["pdf","csv","xlsx","html","json","docx","custom"] },
    { name: "compliance_standard", type: "input", label: "Compliance standard" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "source_data_model_public_ids", type: "textarea", label: "Source models (JSON array)" },
    { name: "output_schema", type: "textarea", label: "Output schema (JSON)" },
  ],
  "tech-stacks": [
    { name: "name", type: "input", label: "Name" },
    { name: "language", type: "input", label: "Language" },
    { name: "framework", type: "input", label: "Framework" },
    { name: "platform_category_slug", type: "input", label: "Platform category slug" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "runtime_requirements", type: "textarea", label: "Runtime requirements (JSON)" },
    { name: "alternatives_considered", type: "textarea", label: "Alternatives considered (JSON array)" },
  ],
  "dependencies": [
    { name: "tech_stack_public_id", type: "input", label: "Tech stack (public_id)" },
    { name: "name", type: "input", label: "Package name" },
    { name: "version_constraint", type: "input", label: "Version constraint" },
    { name: "package_manager", type: "select", label: "Package manager", options: ["npm","pnpm","yarn","pip","poetry","cargo","go","gem","composer","gradle","maven","nuget","apt","rpm","brew"] },
    { name: "dependency_kind", type: "select", label: "Kind", options: ["runtime","dev","build","optional","peer"] },
    { name: "status", type: "select", label: "Status", options: ["active","pinned","frozen","deprecated"] },
    { name: "capability_tags", type: "textarea", label: "Capability tags (JSON array)" },
  ],
  "file-layouts": [
    { name: "tech_stack_public_id", type: "input", label: "Tech stack (public_id)" },
    { name: "path", type: "input", label: "Path" },
    { name: "path_kind", type: "select", label: "Kind", options: ["directory","file","symlink","template"] },
    { name: "purpose", type: "textarea", label: "Purpose" },
  ],
  "launchers": [
    { name: "name", type: "input", label: "Name" },
    { name: "launcher_kind", type: "select", label: "Kind", options: ["script","binary","installer","docker","systemd","scheduled_task","cron","launchd"] },
    { name: "target_platform", type: "input", label: "Target platform" },
    { name: "command", type: "textarea", label: "Command" },
    { name: "elevation_required", type: "checkbox", label: "Elevation required" },
  ],
  "packaging-targets": [
    { name: "name", type: "input", label: "Name" },
    { name: "tech_stack_public_id", type: "input", label: "Tech stack (public_id)" },
    { name: "target_kind", type: "select", label: "Kind", options: ["msi","exe","appimage","deb","rpm","pkg","dmg","apk","ipa","docker_image","npm_pkg","pypi_pkg","static_site","extension"] },
    { name: "target_platform", type: "input", label: "Target platform" },
    { name: "status", type: "select", label: "Status", options: ["planned","building","ready","shipped","deprecated"] },
    { name: "build_config", type: "textarea", label: "Build config (JSON)" },
    { name: "signing_config", type: "textarea", label: "Signing config (JSON)" },
  ],

  // ─── Tier 7: Cognitive design (HAND-TUNED) ───────────────────────────────
  "cognitive-profiles": [
    { name: "name", type: "input", label: "Name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "strengths", type: "textarea", label: "Strengths (JSON array)" },
    { name: "challenges", type: "textarea", label: "Challenges (JSON array)" },
    { name: "ui_preferences", type: "textarea", label: "UI preferences (JSON object)" },
    { name: "harmed_by_anti_patterns", type: "textarea", label: "Harmed by anti-patterns (JSON array of slugs)" },
    { name: "helpful_affordance_kinds", type: "textarea", label: "Helpful affordance kinds (JSON array)" },
    { name: "is_substrate_default", type: "checkbox", label: "Substrate default" },
  ],
  "friction-points": [
    { name: "name", type: "input", label: "Name" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "cognitive_profile_public_id", type: "input", label: "Cognitive profile (public_id)" },
    { name: "use_case_public_id", type: "input", label: "Use case (public_id)" },
    { name: "screen_public_id", type: "input", label: "Screen (public_id)" },
    { name: "severity", type: "select", label: "Severity", options: ["minor","moderate","major","critical"] },
    { name: "status", type: "select", label: "Status", options: ["observed","designing","mitigated","resolved","deferred"] },
    { name: "existing_tool_examples", type: "textarea", label: "Existing tool examples (JSON array)" },
    { name: "user_workarounds", type: "textarea", label: "User workarounds (JSON array)" },
  ],
  "affordance-choices": [
    { name: "name", type: "input", label: "Name" },
    { name: "affordance_kind", type: "select", label: "Kind", options: ["progressive_disclosure","visible_state","reversible_action","explicit_confirmation","keyboard_first","persistent_breadcrumb","cognitive_offload","error_prevention","forgiveness","focus_mode"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "addresses_friction_public_ids", type: "textarea", label: "Addresses friction (JSON array)" },
    { name: "helps_profile_public_ids", type: "textarea", label: "Helps profiles (JSON array)" },
    { name: "realized_in", type: "textarea", label: "Realized in (JSON array)" },
    { name: "tradeoffs", type: "textarea", label: "Tradeoffs (JSON array)" },
  ],
  "anti-patterns": [
    { name: "name", type: "input", label: "Name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "anti_pattern_kind", type: "select", label: "Kind", options: ["dark_pattern","cognitive_overload","silent_failure","irreversible_action","attention_capture","data_egress","trust_violation","mislabeling"] },
    { name: "severity", type: "select", label: "Severity", options: ["info","caution","critical","forbid"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "trigger_phrases", type: "textarea", label: "Trigger phrases (JSON array)" },
    { name: "block_phrases", type: "textarea", label: "Block phrases (JSON array)" },
    { name: "harms_profile_public_ids", type: "textarea", label: "Harms profiles (JSON array)" },
    { name: "is_substrate_default", type: "checkbox", label: "Substrate default" },
  ],

  // ─── Tier 8: Household (MODERATE) ────────────────────────────────────────
  "household-members": [
    { name: "name", type: "input", label: "Name" },
    { name: "role", type: "select", label: "Role", options: ["adult","teen","child","caregiver","guest","extended_family"] },
    { name: "cognitive_profile_public_id", type: "input", label: "Cognitive profile (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "primary_friction_public_ids", type: "textarea", label: "Primary friction (JSON array)" },
    { name: "communication_preferences", type: "textarea", label: "Communication preferences (JSON)" },
    { name: "capacity_context", type: "textarea", label: "Capacity context (JSON)" },
  ],
  "shared-resources": [
    { name: "name", type: "input", label: "Name" },
    { name: "resource_kind", type: "select", label: "Kind", options: ["calendar","grocery_list","todo_list","budget","document_store","photo_album","contact_list","custom"] },
    { name: "integration_public_id", type: "input", label: "Integration (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "owner_member_public_ids", type: "textarea", label: "Owner members (JSON array)" },
    { name: "writer_member_public_ids", type: "textarea", label: "Writer members (JSON array)" },
    { name: "reader_member_public_ids", type: "textarea", label: "Reader members (JSON array)" },
  ],
  "invisible-labor": [
    { name: "name", type: "input", label: "Name" },
    { name: "labor_kind", type: "select", label: "Kind", options: ["mental_load","emotional_labor","logistical_planning","monitoring","scheduling","memory_keeping","conflict_resolution"] },
    { name: "burden_level", type: "select", label: "Burden", options: ["low","moderate","high","unsustainable"] },
    { name: "carried_by_member_public_id", type: "input", label: "Carried by (public_id)" },
    { name: "related_resource_public_id", type: "input", label: "Related resource (public_id)" },
    { name: "status", type: "select", label: "Status", options: ["observed","redistributing","supported","resolved"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "coordination-flows": [
    { name: "name", type: "input", label: "Name" },
    { name: "decision_method", type: "select", label: "Decision method", options: ["consensus","veto","majority","owner_decides","ai_suggested","ad_hoc"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "member_public_ids", type: "textarea", label: "Members (JSON array)" },
    { name: "steps", type: "textarea", label: "Steps (JSON array)" },
    { name: "load_distribution", type: "textarea", label: "Load distribution (JSON)" },
  ],
  "delegation-patterns": [
    { name: "name", type: "input", label: "Name" },
    { name: "delegation_kind", type: "select", label: "Kind", options: ["full_handoff","supervised","reminders_only","fallback","escalation_only"] },
    { name: "member_public_id", type: "input", label: "Member (public_id)" },
    { name: "cognitive_profile_public_id", type: "input", label: "Cognitive profile (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "escalation", type: "textarea", label: "Escalation (JSON)" },
  ],
  "exception-flows": [
    { name: "name", type: "input", label: "Name" },
    { name: "exception_kind", type: "select", label: "Kind", options: ["sickness","travel","capacity_drop","conflict","external_emergency","missed_handoff"] },
    { name: "breaks_flow_public_id", type: "input", label: "Breaks flow (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "recovery_steps", type: "textarea", label: "Recovery steps (JSON array)" },
    { name: "notify_member_public_ids", type: "textarea", label: "Notify members (JSON array)" },
  ],

  // ─── Tier 9: Multi-user (MODERATE) ───────────────────────────────────────
  "users": [
    { name: "name", type: "input", label: "Name" },
    { name: "user_kind", type: "select", label: "Kind", options: ["individual","service_account","group","shared","system"] },
    { name: "persona_public_id", type: "input", label: "Persona (public_id)" },
    { name: "cognitive_profile_public_id", type: "input", label: "Cognitive profile (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "roles": [
    { name: "name", type: "input", label: "Name" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "inherits_from_role_public_id", type: "input", label: "Inherits from (public_id)" },
    { name: "risk_level", type: "select", label: "Risk level", options: ["low","normal","elevated","privileged","root"] },
    { name: "default_user_archetype_public_ids", type: "textarea", label: "Default user archetypes (JSON array)" },
  ],
  "permissions": [
    { name: "name", type: "input", label: "Name" },
    { name: "role_public_id", type: "input", label: "Role (public_id)" },
    { name: "action", type: "select", label: "Action", options: ["read","write","create","delete","admin","execute","approve","export","share"] },
    { name: "target_kind", type: "input", label: "Target kind" },
    { name: "target_public_id", type: "input", label: "Target (public_id)" },
    { name: "effect", type: "select", label: "Effect", options: ["allow","deny"] },
    { name: "conditions", type: "textarea", label: "Conditions (JSON array)" },
  ],
  "audit-log-entries": [
    { name: "name", type: "input", label: "Name" },
    { name: "event_kind", type: "select", label: "Event kind", options: ["auth","data_access","data_change","permission_change","integration_action","admin_action","compliance_event"] },
    { name: "compliance_standard", type: "input", label: "Compliance standard" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "captured_fields", type: "textarea", label: "Captured fields (JSON array)" },
    { name: "reader_role_public_ids", type: "textarea", label: "Reader roles (JSON array)" },
  ],

  // ─── Tier 10: Field operations (MODERATE) ────────────────────────────────
  "shifts": [
    { name: "name", type: "input", label: "Name" },
    { name: "shift_kind", type: "select", label: "Kind", options: ["day","night","swing","split","on_call","weekend","custom"] },
    { name: "default_role_public_id", type: "input", label: "Default role (public_id)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "schedule", type: "textarea", label: "Schedule (JSON)" },
    { name: "handover_items", type: "textarea", label: "Handover items (JSON array)" },
    { name: "load_profile", type: "textarea", label: "Load profile (JSON)" },
  ],
  "field-locations": [
    { name: "name", type: "input", label: "Name" },
    { name: "location_kind", type: "select", label: "Kind", options: ["control_room","plant_floor","outdoor","vehicle","remote_site","customer_site","warehouse"] },
    { name: "parent_location_public_id", type: "input", label: "Parent location (public_id)" },
    { name: "hazard_level", type: "select", label: "Hazard level", options: ["low","moderate","high","extreme"] },
    { name: "connectivity", type: "select", label: "Connectivity", options: ["always_online","intermittent","offline","air_gapped"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "coordinates", type: "textarea", label: "Coordinates (JSON)" },
    { name: "environmental", type: "textarea", label: "Environmental (JSON)" },
  ],
  "field-actions": [
    { name: "name", type: "input", label: "Name" },
    { name: "action_kind", type: "select", label: "Kind", options: ["inspection","maintenance","sampling","reading","handover","incident_response","calibration","cleaning"] },
    { name: "shift_public_id", type: "input", label: "Shift (public_id)" },
    { name: "criticality", type: "select", label: "Criticality", options: ["low","normal","high","safety_critical"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "location_public_ids", type: "textarea", label: "Locations (JSON array)" },
    { name: "capture_mode_public_ids", type: "textarea", label: "Capture modes (JSON array)" },
    { name: "required_outputs", type: "textarea", label: "Required outputs (JSON array)" },
  ],
  "capture-modes": [
    { name: "name", type: "input", label: "Name" },
    { name: "capture_kind", type: "select", label: "Kind", options: ["voice","photo","video","barcode","manual_entry","sensor_read","checkbox","signature"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "environmental_suitability", type: "textarea", label: "Environmental suitability (JSON)" },
    { name: "accuracy_concerns", type: "textarea", label: "Accuracy concerns (JSON array)" },
  ],

  // ─── Tier 11: Integrations (MODERATE) ────────────────────────────────────
  "integrations": [
    { name: "name", type: "input", label: "Name" },
    { name: "integration_kind", type: "select", label: "Kind", options: ["calendar","email","chat","ticketing","crm","erp","plm","scada","historian","cloud_storage","object_storage","vcs","ci_cd","payments","identity_provider","custom"] },
    { name: "direction", type: "select", label: "Direction", options: ["inbound","outbound","bidirectional"] },
    { name: "integration_pattern", type: "select", label: "Pattern", options: ["polling","webhook","streaming","batch","manual_sync","event_driven"] },
    { name: "egress_posture", type: "select", label: "Egress posture", options: ["no_egress","metadata_only","aggregated","summarized","full_data"] },
    { name: "status", type: "select", label: "Status", options: ["proposed","designing","testing","active","disabled","deprecated"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "endpoint_descriptor", type: "textarea", label: "Endpoint descriptor (JSON)" },
  ],
  "integration-auth-configs": [
    { name: "integration_public_id", type: "input", label: "Integration (public_id)" },
    { name: "auth_kind", type: "select", label: "Kind", options: ["api_key","oauth2_authorization_code","oauth2_client_credentials","oauth2_pkce","jwt_bearer","basic_auth","mtls","saml","none"] },
    { name: "scopes", type: "textarea", label: "Scopes (JSON array)" },
    { name: "endpoints", type: "textarea", label: "Endpoints (JSON)" },
  ],
  "integration-sync-rules": [
    { name: "integration_public_id", type: "input", label: "Integration (public_id)" },
    { name: "name", type: "input", label: "Name" },
    { name: "trigger_kind", type: "select", label: "Trigger", options: ["interval","webhook","manual","on_change","on_event"] },
    { name: "target_data_model_public_id", type: "input", label: "Target data model (public_id)" },
    { name: "target_shared_resource_public_id", type: "input", label: "Target shared resource (public_id)" },
    { name: "status", type: "select", label: "Status", options: ["draft","testing","active","paused","disabled"] },
    { name: "source_selector", type: "textarea", label: "Source selector (JSON)" },
    { name: "field_mapping", type: "textarea", label: "Field mapping (JSON array)" },
    { name: "egress_excluded_fields", type: "textarea", label: "Egress-excluded fields (JSON array)" },
  ],
  "integration-conflict-rules": [
    { name: "integration_public_id", type: "input", label: "Integration (public_id)" },
    { name: "sync_rule_public_id", type: "input", label: "Sync rule (public_id)" },
    { name: "scenario", type: "select", label: "Scenario", options: ["concurrent_edit","schema_drift","missing_record","extra_record","value_mismatch","delete_conflict"] },
    { name: "resolution_strategy", type: "select", label: "Resolution", options: ["last_write_wins","first_write_wins","local_authoritative","remote_authoritative","manual_review","merge","reject"] },
    { name: "field_overrides", type: "textarea", label: "Field overrides (JSON)" },
  ],

  // ─── Tier 12: Chemical (MODERATE) ────────────────────────────────────────
  "chemical-units": [
    { name: "name", type: "input", label: "Name" },
    { name: "unit_kind", type: "select", label: "Kind", options: ["reactor","column","tank","heat_exchanger","compressor","pump","filter","silo","mixer","custom"] },
    { name: "process_role", type: "input", label: "Process role" },
    { name: "location_public_id", type: "input", label: "Location (public_id)" },
    { name: "hazard_class", type: "input", label: "Hazard class" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "operating_envelope", type: "textarea", label: "Operating envelope (JSON)" },
    { name: "sop_references", type: "textarea", label: "SOP references (JSON array)" },
  ],
  "chemical-vessels": [
    { name: "name", type: "input", label: "Name" },
    { name: "unit_public_id", type: "input", label: "Unit (public_id)" },
    { name: "vessel_kind", type: "select", label: "Kind", options: ["pressure_vessel","atmospheric_tank","storage_silo","reactor_shell","column_shell","piping_segment"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "construction", type: "textarea", label: "Construction (JSON)" },
    { name: "intended_contents", type: "textarea", label: "Intended contents (JSON array)" },
    { name: "inspection_refs", type: "textarea", label: "Inspection refs (JSON array)" },
    { name: "connected_instrument_public_ids", type: "textarea", label: "Connected instruments (JSON array)" },
  ],
  "chemical-instruments": [
    { name: "name", type: "input", label: "Name" },
    { name: "unit_public_id", type: "input", label: "Unit (public_id)" },
    { name: "vessel_public_id", type: "input", label: "Vessel (public_id)" },
    { name: "instrument_kind", type: "select", label: "Kind", options: ["temperature","pressure","level","flow","ph","conductivity","analyzer","valve_position","interlock"] },
    { name: "data_source", type: "select", label: "Data source", options: ["plc","scada","historian","manual","fieldbus","analog_input"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "range_spec", type: "textarea", label: "Range spec (JSON)" },
  ],
  "chemical-samples": [
    { name: "name", type: "input", label: "Name" },
    { name: "sampled_from_unit_public_id", type: "input", label: "From unit (public_id)" },
    { name: "sampled_from_vessel_public_id", type: "input", label: "From vessel (public_id)" },
    { name: "sampled_at_location_public_id", type: "input", label: "At location (public_id)" },
    { name: "sample_kind", type: "select", label: "Kind", options: ["routine","investigative","compliance","commissioning","research","customer_request"] },
    { name: "compliance_standard", type: "input", label: "Compliance standard" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "required_analyses", type: "textarea", label: "Required analyses (JSON array)" },
    { name: "handling_spec", type: "textarea", label: "Handling spec (JSON)" },
  ],

  // ─── Tier 13-18: Platform specs (THIN) ───────────────────────────────────
  "windows-specs": [
    { name: "min_windows_version", type: "input", label: "Min Windows version" },
    { name: "elevation_profile", type: "select", label: "Elevation profile", options: ["never","install_only","sometimes","always"] },
    { name: "smartscreen_strategy", type: "input", label: "SmartScreen strategy" },
    { name: "start_menu_folder", type: "input", label: "Start menu folder" },
    { name: "architectures", type: "textarea", label: "Architectures (JSON array)" },
    { name: "registry_operations", type: "textarea", label: "Registry operations (JSON array)" },
    { name: "powershell_scripts", type: "textarea", label: "PowerShell scripts (JSON array)" },
    { name: "services_touched", type: "textarea", label: "Services touched (JSON array)" },
    { name: "scheduled_tasks", type: "textarea", label: "Scheduled tasks (JSON array)" },
    { name: "file_locations", type: "textarea", label: "File locations (JSON)" },
    { name: "uninstall_registration", type: "textarea", label: "Uninstall registration (JSON)" },
    { name: "winrt_capabilities", type: "textarea", label: "WinRT capabilities (JSON array)" },
    { name: "group_policy_notes", type: "textarea", label: "Group policy notes" },
  ],
  "macos-specs": [
    { name: "min_macos_version", type: "input", label: "Min macOS version" },
    { name: "sandbox_kind", type: "select", label: "Sandbox kind", options: ["sandboxed","unsandboxed","hardened_runtime_only"] },
    { name: "app_store_distributed", type: "checkbox", label: "App Store distributed" },
    { name: "architectures", type: "textarea", label: "Architectures (JSON array)" },
    { name: "entitlements", type: "textarea", label: "Entitlements (JSON array)" },
    { name: "code_signing", type: "textarea", label: "Code signing (JSON)" },
    { name: "launch_services", type: "textarea", label: "Launch services (JSON array)" },
    { name: "file_locations", type: "textarea", label: "File locations (JSON)" },
    { name: "privacy_permissions", type: "textarea", label: "Privacy permissions (JSON array)" },
  ],
  "linux-specs": [
    { name: "min_kernel", type: "input", label: "Min kernel" },
    { name: "min_glibc", type: "input", label: "Min glibc" },
    { name: "display_server", type: "select", label: "Display server", options: ["x11","wayland","both","headless"] },
    { name: "target_distros", type: "textarea", label: "Target distros (JSON array)" },
    { name: "architectures", type: "textarea", label: "Architectures (JSON array)" },
    { name: "packaging_kinds", type: "textarea", label: "Packaging kinds (JSON array)" },
    { name: "desktop_file", type: "textarea", label: "Desktop file (JSON)" },
    { name: "system_packages", type: "textarea", label: "System packages (JSON array)" },
    { name: "systemd_units", type: "textarea", label: "Systemd units (JSON array)" },
    { name: "file_locations", type: "textarea", label: "File locations (JSON)" },
    { name: "dbus_services", type: "textarea", label: "D-Bus services (JSON array)" },
    { name: "polkit_actions", type: "textarea", label: "PolicyKit actions (JSON array)" },
  ],
  "android-specs": [
    { name: "application_id", type: "input", label: "Application ID" },
    { name: "min_sdk", type: "number", label: "Min SDK" },
    { name: "target_sdk", type: "number", label: "Target SDK" },
    { name: "compile_sdk", type: "number", label: "Compile SDK" },
    { name: "framework_kind", type: "select", label: "Framework", options: ["native_kotlin","native_java","jetpack_compose","react_native","flutter","cordova","capacitor","webview"] },
    { name: "background_work_strategy", type: "select", label: "Background work", options: ["foreground_service","workmanager","jobscheduler","none"] },
    { name: "distribution_channel", type: "select", label: "Distribution", options: ["play_store","play_store_internal","amazon_appstore","samsung_galaxy","fdroid","enterprise_mdm","sideload_apk"] },
    { name: "minification_enabled", type: "checkbox", label: "Minification enabled" },
    { name: "size_budget_mb", type: "number", label: "Size budget (MB)" },
    { name: "permissions", type: "textarea", label: "Permissions (JSON array of {permission, justification, dangerous})" },
    { name: "required_features", type: "textarea", label: "Required features (JSON array)" },
    { name: "activities", type: "textarea", label: "Activities (JSON array)" },
    { name: "services", type: "textarea", label: "Services (JSON array)" },
    { name: "broadcast_receivers", type: "textarea", label: "Broadcast receivers (JSON array)" },
    { name: "content_providers", type: "textarea", label: "Content providers (JSON array)" },
    { name: "signing_config", type: "textarea", label: "Signing config (JSON)" },
  ],
  "ios-specs": [
    { name: "min_ios_version", type: "input", label: "Min iOS version" },
    { name: "bundle_identifier", type: "input", label: "Bundle identifier" },
    { name: "framework_kind", type: "select", label: "Framework", options: ["swiftui","uikit","react_native","flutter","capacitor","cordova"] },
    { name: "distribution_channel", type: "select", label: "Distribution", options: ["app_store","testflight","ad_hoc","enterprise","developer_id"] },
    { name: "push_notifications_enabled", type: "checkbox", label: "Push notifications enabled" },
    { name: "push_certificate_kind", type: "input", label: "Push cert kind" },
    { name: "capabilities", type: "textarea", label: "Capabilities (JSON array)" },
    { name: "privacy_manifest", type: "textarea", label: "Privacy manifest (JSON)" },
    { name: "ats_exceptions", type: "textarea", label: "ATS exceptions (JSON array)" },
    { name: "background_modes", type: "textarea", label: "Background modes (JSON array)" },
    { name: "signing_config", type: "textarea", label: "Signing config (JSON)" },
    { name: "universal_links", type: "textarea", label: "Universal links (JSON array)" },
  ],
  "web-specs": [
    { name: "delivery_kind", type: "select", label: "Delivery", options: ["static","ssr","spa","mpa","pwa","extension","browser_extension_chrome","browser_extension_firefox","electron"] },
    { name: "a11y_target", type: "select", label: "A11y target", options: ["2.1_a","2.1_aa","2.1_aaa","2.2_aa","2.2_aaa"] },
    { name: "service_worker_strategy", type: "input", label: "Service worker strategy" },
    { name: "hosting_target", type: "input", label: "Hosting target" },
    { name: "routes", type: "textarea", label: "Routes (JSON array)" },
    { name: "seo_defaults", type: "textarea", label: "SEO defaults (JSON)" },
    { name: "analytics_events", type: "textarea", label: "Analytics events (JSON array)" },
    { name: "browser_support", type: "textarea", label: "Browser support (JSON array)" },
    { name: "pwa_manifest", type: "textarea", label: "PWA manifest (JSON)" },
    { name: "csp_directives", type: "textarea", label: "CSP directives (JSON)" },
    { name: "cors_allowed_origins", type: "textarea", label: "CORS allowed origins (JSON array)" },
  ],

  // ─── Tier 19: Backend (THIN) ─────────────────────────────────────────────
  "db-schemas": [
    { name: "name", type: "input", label: "Name" },
    { name: "schema_name", type: "input", label: "Physical schema name" },
    { name: "backend_kind", type: "select", label: "Backend kind", options: ["postgres","mysql","mariadb","sqlite","mssql","mongodb","dynamodb","redis","cassandra","duckdb"] },
    { name: "backend_version", type: "input", label: "Backend version" },
    { name: "migration_tool", type: "input", label: "Migration tool" },
    { name: "can_accept_egress_data", type: "checkbox", label: "Can accept egress data" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "data_model_public_ids", type: "textarea", label: "Data model public_ids (JSON array)" },
    { name: "connection_pool", type: "textarea", label: "Connection pool (JSON)" },
    { name: "backup_strategy", type: "textarea", label: "Backup strategy (JSON)" },
  ],
  "db-migrations": [
    { name: "db_schema_public_id", type: "input", label: "Schema (public_id)" },
    { name: "sequence", type: "number", label: "Sequence" },
    { name: "name", type: "input", label: "Name" },
    { name: "status", type: "select", label: "Status", options: ["planned","applied","rolled_back","failed","skipped"] },
    { name: "is_reversible", type: "checkbox", label: "Reversible" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "forward_script", type: "textarea", label: "Forward script" },
    { name: "backward_script", type: "textarea", label: "Backward script" },
  ],
  "auth-flows": [
    { name: "name", type: "input", label: "Name" },
    { name: "auth_kind", type: "select", label: "Kind", options: ["password","magic_link","oauth_login","sso_saml","sso_oidc","mfa_totp","mfa_webauthn","mfa_hardware_key","api_key","service_account","mtls","jwt_bearer","session_cookie"] },
    { name: "is_default", type: "checkbox", label: "Default flow" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "steps", type: "textarea", label: "Steps (JSON array)" },
    { name: "session_management", type: "textarea", label: "Session management (JSON)" },
    { name: "grants_role_public_ids", type: "textarea", label: "Grants role public_ids (JSON array)" },
    { name: "abuse_protection", type: "textarea", label: "Abuse protection (JSON)" },
    { name: "recovery", type: "textarea", label: "Recovery (JSON)" },
  ],
  "background-jobs": [
    { name: "name", type: "input", label: "Name" },
    { name: "job_kind", type: "select", label: "Kind", options: ["cron","queue_consumer","event_listener","webhook_processor","one_off","recurring","streaming"] },
    { name: "runner_kind", type: "select", label: "Runner", options: ["inline","celery","sidekiq","rq","bullmq","dramatiq","arq","systemd_timer","cron","aws_eventbridge","cloud_scheduler"] },
    { name: "failure_handling", type: "select", label: "Failure handling", options: ["fail_loud","fail_soft","circuit_break","dead_letter"] },
    { name: "is_critical", type: "checkbox", label: "Critical-path" },
    { name: "schedule_cron", type: "input", label: "Cron schedule" },
    { name: "schedule_interval_seconds", type: "number", label: "Interval (seconds)" },
    { name: "function_public_id", type: "input", label: "Function (public_id)" },
    { name: "function_chain_public_id", type: "input", label: "Function chain (public_id)" },
    { name: "execution_policy", type: "textarea", label: "Execution policy (JSON)" },
    { name: "resource_budget", type: "textarea", label: "Resource budget (JSON)" },
  ],
  "caching-strategies": [
    { name: "name", type: "input", label: "Name" },
    { name: "cache_kind", type: "select", label: "Kind", options: ["in_memory","redis","memcached","cdn_edge","browser","service_worker","http_cache","sql_query_cache","rag_index"] },
    { name: "ttl_seconds", type: "number", label: "TTL (seconds)" },
    { name: "eviction_policy", type: "select", label: "Eviction", options: ["lru","lfu","fifo","ttl","manual"] },
    { name: "stale_while_revalidate", type: "checkbox", label: "Stale while revalidate" },
    { name: "holds_pii", type: "checkbox", label: "Holds PII" },
    { name: "encryption_at_rest", type: "checkbox", label: "Encryption at rest" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "targets", type: "textarea", label: "Targets (JSON array)" },
    { name: "invalidation_triggers", type: "textarea", label: "Invalidation triggers (JSON array)" },
  ],

  // ─── Tier 20: Operational (THIN) ─────────────────────────────────────────
  "environments": [
    { name: "name", type: "input", label: "Name" },
    { name: "environment_kind", type: "select", label: "Kind", options: ["dev","staging","preprod","prod","tenant_specific","on_premise","air_gapped","demo"] },
    { name: "hosting_target", type: "input", label: "Hosting target" },
    { name: "region", type: "input", label: "Region" },
    { name: "base_url", type: "input", label: "Base URL" },
    { name: "can_egress", type: "checkbox", label: "Can egress" },
    { name: "requires_approval", type: "checkbox", label: "Requires approval" },
    { name: "overrides", type: "textarea", label: "Overrides (JSON)" },
  ],
  "deployments": [
    { name: "version_public_id", type: "input", label: "Version (public_id)" },
    { name: "environment_public_id", type: "input", label: "Environment (public_id)" },
    { name: "packaging_target_public_id", type: "input", label: "Packaging target (public_id)" },
    { name: "status", type: "select", label: "Status", options: ["planned","building","deploying","live","rolled_back","failed","paused"] },
    { name: "strategy", type: "select", label: "Strategy", options: ["replace","blue_green","canary","rolling","manual"] },
    { name: "artifact_uri", type: "input", label: "Artifact URI" },
    { name: "artifact_sha", type: "input", label: "Artifact SHA" },
    { name: "approver", type: "input", label: "Approver" },
    { name: "rollback_target_public_id", type: "input", label: "Rollback target (public_id)" },
    { name: "changelog", type: "textarea", label: "Changelog" },
    { name: "health_probe", type: "textarea", label: "Health probe (JSON)" },
  ],
  "monitoring-signals": [
    { name: "name", type: "input", label: "Name" },
    { name: "signal_kind", type: "select", label: "Kind", options: ["metric","log_pattern","health_check","event_count","trace_span","business_kpi","user_signal"] },
    { name: "collector", type: "input", label: "Collector" },
    { name: "collector_identifier", type: "input", label: "Collector identifier" },
    { name: "is_blocking", type: "checkbox", label: "Blocks deploy when triggered" },
    { name: "runbook_ref", type: "input", label: "Runbook ref" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "thresholds", type: "textarea", label: "Thresholds (JSON array)" },
    { name: "diagnoses", type: "textarea", label: "Diagnoses (JSON array)" },
  ],
  "incidents": [
    { name: "title", type: "input", label: "Title" },
    { name: "severity", type: "select", label: "Severity", options: ["sev1","sev2","sev3","sev4","near_miss"] },
    { name: "status", type: "select", label: "Status", options: ["open","mitigated","resolved","monitoring","closed"] },
    { name: "environment_public_id", type: "input", label: "Environment (public_id)" },
    { name: "detection_signal_public_id", type: "input", label: "Detection signal (public_id)" },
    { name: "root_cause", type: "textarea", label: "Root cause" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "impact", type: "textarea", label: "Impact (JSON array)" },
    { name: "causal_chain", type: "textarea", label: "Causal chain (JSON array of {step, what_happened, why})" },
    { name: "contributing_factors", type: "textarea", label: "Contributing factors (JSON array)" },
    { name: "mitigation_steps", type: "textarea", label: "Mitigation steps (JSON array)" },
    { name: "derived_design_decisions", type: "textarea", label: "Derived design decisions (JSON array)" },
    { name: "derived_limitations", type: "textarea", label: "Derived limitations (JSON array)" },
    { name: "derived_anti_patterns", type: "textarea", label: "Derived anti-patterns (JSON array)" },
  ],

  // ─── Tier 21: Bridges (THIN) ─────────────────────────────────────────────
  "cross-platform-bridges": [
    { name: "name", type: "input", label: "Name" },
    { name: "bridge_kind", type: "select", label: "Kind", options: ["shared_backend","peer_to_peer","cloud_relay","one_way_export","protocol_handler"] },
    { name: "transport", type: "input", label: "Transport" },
    { name: "authoritative_platform_slug", type: "input", label: "Authoritative platform slug" },
    { name: "data_contract_public_id", type: "input", label: "Data contract (public_id)" },
    { name: "latency_expectation", type: "select", label: "Latency expectation", options: ["realtime","near_realtime","eventual","manual_sync"] },
    { name: "description", type: "textarea", label: "Description" },
    { name: "platform_slugs", type: "textarea", label: "Platform slugs (JSON array)" },
    { name: "offline_behavior", type: "textarea", label: "Offline behavior (JSON array)" },
  ],
  "shared-data-contracts": [
    { name: "name", type: "input", label: "Name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "wire_format", type: "select", label: "Wire format", options: ["json","protobuf","msgpack","cbor","avro"] },
    { name: "versioning_strategy", type: "select", label: "Versioning strategy", options: ["breaking","additive_only","semver","rolling"] },
    { name: "contract_version", type: "input", label: "Contract version" },
    { name: "backward_compatible_versions", type: "number", label: "Backward-compatible versions" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "schema_definition", type: "textarea", label: "Schema definition (JSON array)" },
    { name: "producers", type: "textarea", label: "Producers (JSON array)" },
    { name: "consumers", type: "textarea", label: "Consumers (JSON array)" },
  ],

  // ─── Pipelines tab (HAND-TUNED) ──────────────────────────────────────────
  "pipelines": [
    { name: "slug", type: "input", label: "Slug" },
    { name: "label", type: "input", label: "Label" },
    { name: "scope_kind", type: "input", label: "Scope kind" },
    { name: "template_version", type: "input", label: "Template version" },
    { name: "is_active", type: "checkbox", label: "Active" },
    { name: "is_substrate_default", type: "checkbox", label: "Substrate default" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "required_tiers", type: "textarea", label: "Required tiers (JSON array of integers)" },
    { name: "required_categories", type: "textarea", label: "Required categories (JSON array of slugs)" },
    { name: "populates_tables", type: "textarea", label: "Populates tables (JSON array)" },
    { name: "stages", type: "textarea", label: "Stages (JSON array of {index, name, model_alias, prompt_template_ref, validators, retry_policy})" },
    { name: "gating_validator_public_ids", type: "textarea", label: "Gating validators (JSON array)" },
  ],
  "pipeline-runs": [
    { name: "pipeline_public_id", type: "input", label: "Pipeline template (public_id)" },
    { name: "version_public_id", type: "input", label: "Version (public_id)" },
    { name: "status", type: "select", label: "Status", options: ["queued","running","paused","completed","failed","rolled_back","partially_completed"] },
    { name: "idempotency_key", type: "input", label: "Idempotency key" },
    { name: "initiated_by", type: "input", label: "Initiated by" },
    { name: "failure_reason", type: "textarea", label: "Failure reason" },
    { name: "stage_states", type: "textarea", label: "Stage states (JSON array)" },
    { name: "inputs", type: "textarea", label: "Inputs (JSON)" },
    { name: "produced_artifacts", type: "textarea", label: "Produced artifacts (JSON array)" },
    { name: "verifier_findings", type: "textarea", label: "Verifier findings (JSON array)" },
  ],
  "recipes": [
    { name: "slug", type: "input", label: "Slug" },
    { name: "label", type: "input", label: "Label" },
    { name: "scope_kind", type: "input", label: "Scope kind" },
    { name: "is_active", type: "checkbox", label: "Active" },
    { name: "is_substrate_default", type: "checkbox", label: "Substrate default" },
    { name: "gates_between_pipelines", type: "checkbox", label: "Gates between pipelines" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "pipeline_steps", type: "textarea", label: "Pipeline steps (JSON array of {index, pipeline_public_id, ...})" },
  ],
  "validators": [
    { name: "slug", type: "input", label: "Slug" },
    { name: "label", type: "input", label: "Label" },
    { name: "validator_kind", type: "select", label: "Kind", options: ["schema_check","anti_pattern_scan","completeness","consistency","cardinality","compliance","cognitive_load_curve","reversibility_audit","data_egress_audit","custom_function"] },
    { name: "failure_mode", type: "select", label: "Failure mode", options: ["block","warn","soft_warn","flag_for_review"] },
    { name: "is_active", type: "checkbox", label: "Active" },
    { name: "is_substrate_default", type: "checkbox", label: "Substrate default" },
    { name: "function_public_id", type: "input", label: "Function (public_id)" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "target", type: "textarea", label: "Target (JSON)" },
  ],
  "category-links": [
    { name: "source_kind", type: "input", label: "Source kind" },
    { name: "source_public_id", type: "input", label: "Source (public_id)" },
    { name: "target_kind", type: "input", label: "Target kind" },
    { name: "target_public_id", type: "input", label: "Target (public_id)" },
    { name: "relation_label", type: "input", label: "Relation label" },
    { name: "strength", type: "select", label: "Strength", options: ["weak","normal","strong","required"] },
    { name: "notes", type: "textarea", label: "Notes" },
  ],
};
// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE_SCOPES — 16 hardcoded scope cards (match seeded slugs)
// ═══════════════════════════════════════════════════════════════════════════
// Each scope corresponds to a seeded substrate-default pipeline template.
// `scope_kind` MUST match `appcore_pipelines.scope_kind`.
// `requires_tiers` / `requires_categories` are used to gate visibility, BUT
// the authoritative source is the backend: we filter against
// state.appOverview.active_tiers and the app's category slugs.

const PIPELINE_SCOPES = [
  { id: "concept",                       title: "Concept",                       desc: "Purpose, design pillars, limitations, categories.",
    scope_kind: "concept", requires_tiers: [0], requires_categories: [] },
  { id: "cognitive_design",              title: "Cognitive design",              desc: "Profiles, friction, affordances, anti-patterns.",
    scope_kind: "cognitive_design", requires_tiers: [7],
    requires_categories: ["household_coordination","enterprise_coordination","field_operations"] },
  { id: "domain_modeling",               title: "Domain modeling",               desc: "Personas, JTBD, use cases, features, flows, entities.",
    scope_kind: "domain_modeling", requires_tiers: [1], requires_categories: [] },
  { id: "ui_design",                     title: "UI design",                     desc: "Screens, components, layouts, design tokens.",
    scope_kind: "ui_design", requires_tiers: [2], requires_categories: [] },
  { id: "function_design",               title: "Function design",               desc: "Functions, function chains, function categories.",
    scope_kind: "function_design", requires_tiers: [3], requires_categories: [] },
  { id: "data_design",                   title: "Data design",                   desc: "Catalogs, models, fields, relations, settings, reports.",
    scope_kind: "data_design", requires_tiers: [4], requires_categories: [] },
  { id: "tech_selection",                title: "Tech selection",                desc: "Stack, dependencies, file layout.",
    scope_kind: "tech_selection", requires_tiers: [5], requires_categories: [] },
  { id: "platform_specific_windows",     title: "Platform: Windows",             desc: "Registry, PowerShell, services, packaging.",
    scope_kind: "platform_specific_windows", requires_tiers: [13], requires_categories: ["desktop_windows"] },
  { id: "platform_specific_android",     title: "Platform: Android",             desc: "Manifest, permissions, native vs hybrid.",
    scope_kind: "platform_specific_android", requires_tiers: [16], requires_categories: ["mobile_android"] },
  { id: "platform_specific_web",         title: "Platform: Web",                 desc: "Routes, SEO, a11y, PWA, CSP.",
    scope_kind: "platform_specific_web", requires_tiers: [18], requires_categories: ["web_app","web_extension"] },
  { id: "backend_design",                title: "Backend design",                desc: "Schemas, migrations, auth, jobs, caching.",
    scope_kind: "backend_design", requires_tiers: [19], requires_categories: ["web_app","api_service"] },
  { id: "multi_user_design",             title: "Multi-user design",             desc: "Users, roles, permissions, audit log.",
    scope_kind: "multi_user_design", requires_tiers: [9], requires_categories: ["enterprise_coordination"] },
  { id: "integration_design",            title: "Integration design",            desc: "Adapters, auth configs, sync, conflict rules.",
    scope_kind: "integration_design", requires_tiers: [11],
    requires_categories: ["enterprise_coordination","field_operations","ai_agent"] },
  { id: "household_coordination_design", title: "Household coordination",        desc: "Members, shared resources, invisible labor.",
    scope_kind: "household_coordination_design", requires_tiers: [8],
    requires_categories: ["household_coordination"] },
  { id: "field_operations_design",       title: "Field operations design",       desc: "Shifts, locations, actions, capture, chemical domain.",
    scope_kind: "field_operations_design", requires_tiers: [10,12],
    requires_categories: ["field_operations"] },
  { id: "code_scaffolding",              title: "Code scaffolding",              desc: "File layout + launchers + packaging targets.",
    scope_kind: "code_scaffolding", requires_tiers: [5,6], requires_categories: [] },
];

// ═══════════════════════════════════════════════════════════════════════════
// MODELS
// ═══════════════════════════════════════════════════════════════════════════
async function loadModels() {
  const r = await api("/api/model-pool/models");
  const items = arr(r.body);
  if (!r.ok) {
    state.availableModels = [];
    renderModelSelector();
    return;
  }
  state.availableModels = items
    .filter(m => m.runtime_driver === "openai_api" && m.enabled !== false &&
                 (parseSurfaces(m.surface_allowlist).includes(SURFACE) ||
                  parseSurfaces(m.surface_allowlist).includes("gamecore") ||
                  parseSurfaces(m.surface_allowlist).includes("lorecore")))
    .map(m => ({ alias: m.alias || m.name, label: m.name || m.alias }));
  renderModelSelector();
}

function renderModelSelector() {
  const container = qs("#modelSelectorWrap"); if (!container) return;
  if (!state.availableModels.length) {
    container.innerHTML = `<div class="muted" style="font-size:12px;">No models — enable appcore surface in Settings.</div>`;
    return;
  }
  if (state.chatMode === "single") {
    const current = state.selectedModels[0] || "";
    container.innerHTML = `
      <select class="select" id="modelDropdown" style="font-size:12px;">
        <option value="">Select model…</option>
        ${state.availableModels.map(m => `<option value="${escHtml(m.alias)}" ${current === m.alias ? "selected" : ""}>${escHtml(m.label)}</option>`).join("")}
      </select>`;
    qs("#modelDropdown")?.addEventListener("change", e => {
      state.selectedModels = e.target.value ? [e.target.value] : [];
      updateContextRows();
    });
  } else {
    container.innerHTML = `
      <div class="model-check-list">
        ${state.availableModels.map(m => `
          <label class="model-check-item ${state.selectedModels.includes(m.alias) ? "model-check-item--active" : ""}">
            <input type="checkbox" class="model-mcb" value="${escHtml(m.alias)}" ${state.selectedModels.includes(m.alias) ? "checked" : ""} />
            ${escHtml(m.label)}
          </label>`).join("")}
      </div>`;
    qsa(".model-mcb").forEach(cb => cb.addEventListener("change", () => {
      if (cb.checked && !state.selectedModels.includes(cb.value)) state.selectedModels.push(cb.value);
      if (!cb.checked) state.selectedModels = state.selectedModels.filter(a => a !== cb.value);
      cb.closest("label")?.classList.toggle("model-check-item--active", cb.checked);
      updateContextRows();
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FOUNDATION (workspaces / apps / versions / categories)
// ═══════════════════════════════════════════════════════════════════════════
async function loadOverview() {
  setChip("#libraryChip", "Loading", "status-chip--warn");

  // Top dashboard
  const top = await api("/api/appcore/overview");
  if (!top.ok) {
    setChip("#libraryChip", "Failed", "status-chip--bad");
    showToast(`Overview failed: ${top.status}`, "warn");
    return;
  }
  const recentApps = arr(top.body, "recent_apps");

  // Categories registry (seeded — 19 rows)
  const cats = await api("/api/appcore/categories");
  state.categories = arr(cats.body);

  // Workspaces
  const ws = await api("/api/appcore/workspaces?limit=200");
  state.workspaces = arr(ws.body);
  if (!state.selectedWorkspaceId && state.workspaces.length) {
    state.selectedWorkspaceId = state.workspaces[0].public_id;
  }

  // Apps in selected workspace
  if (state.selectedWorkspaceId) {
    const apps = await api(`/api/appcore/apps?workspace=${encodeURIComponent(state.selectedWorkspaceId)}&include_categories=true`);
    state.apps = arr(apps.body);
  } else {
    state.apps = [];
  }

  // Versions for selected app
  if (state.selectedAppId) {
    const versions = await api(`/api/appcore/versions?app=${encodeURIComponent(state.selectedAppId)}`);
    state.versions = arr(versions.body);
  } else {
    state.versions = [];
  }

  // Per-app overview (drives tier visibility, scope status, recent runs)
  if (state.selectedAppId) {
    const ov = await api(`/api/appcore/apps/${encodeURIComponent(state.selectedAppId)}/overview`);
    state.appOverview = ov.ok ? ov.body : null;
    state.recentRuns = state.appOverview?.recent_runs || [];

    const tmpl = await api(`/api/appcore/pipelines/for-app/${encodeURIComponent(state.selectedAppId)}`);
    state.pipelineTemplates = arr(tmpl.body);
  } else {
    state.appOverview = null;
    state.recentRuns = [];
    state.pipelineTemplates = [];
  }

  renderWorkspaceSelect();
  renderAppSelect();
  renderVersionSelect();
  renderCategoryChecks();
  updateScopeChip();
  updateContextRows();
  setChip("#libraryChip", `${state.apps.length} apps`, "status-chip--good");

  await loadSessionList();

  renderPipelineCards();
  renderRunList();
  renderLibraryTree();
  renderCountsBox();
  renderTierTabs();
}

function renderWorkspaceSelect() {
  const sel = qs("#workspaceSelect"); if (!sel) return;
  sel.innerHTML = `<option value="">— select workspace —</option>` +
    state.workspaces.map(w => `<option value="${escHtml(w.public_id)}" ${w.public_id === state.selectedWorkspaceId ? "selected" : ""}>${escHtml(w.name || w.public_id)}</option>`).join("");
}

function renderAppSelect() {
  const sel = qs("#appSelect"); if (!sel) return;
  sel.innerHTML = `<option value="">—</option>` +
    state.apps.map(a => `<option value="${escHtml(a.public_id)}" ${a.public_id === state.selectedAppId ? "selected" : ""}>${escHtml(a.name || a.public_id)}</option>`).join("");
}

function renderVersionSelect() {
  const sel = qs("#versionSelect"); if (!sel) return;
  sel.innerHTML = `<option value="">—</option>` +
    state.versions.map(v => `<option value="${escHtml(v.public_id)}" ${v.public_id === state.selectedVersionId ? "selected" : ""}>${escHtml(v.name || v.public_id)}</option>`).join("");
}

function renderCategoryChecks() {
  const container = qs("#newAppCategoryList"); if (!container) return;
  // Group by kind: scale / platform / domain
  const groups = {};
  for (const c of state.categories) {
    const k = c.kind || "other";
    (groups[k] ||= []).push(c);
  }
  const order = ["scale","platform","domain","other"];
  container.innerHTML = order
    .filter(k => groups[k]?.length)
    .map(k => `
      <div class="category-checks-group">
        <div class="category-checks-group-label">${escHtml(k)}</div>
        <div class="category-checks">
          ${groups[k].map(c => `
            <label class="category-check">
              <input type="checkbox" class="cat-cb" value="${escHtml(c.public_id)}" data-slug="${escHtml(c.slug)}" />
              <span>${escHtml(c.label || c.slug)}</span>
            </label>`).join("")}
        </div>
      </div>`).join("");
  qsa(".cat-cb", container).forEach(cb => cb.addEventListener("change", () => {
    cb.closest("label")?.classList.toggle("category-check--checked", cb.checked);
  }));
}

function appCategorySlugs() {
  const app = state.appOverview?.app;
  if (!app) return [];
  return (app.categories || []).map(c => c.slug).filter(Boolean);
}

function activeTiers() {
  return Array.isArray(state.appOverview?.active_tiers) ? state.appOverview.active_tiers : [];
}

function updateScopeChip() {
  const cnt = state.apps.length;
  const app = state.apps.find(a => a.public_id === state.selectedAppId);
  if (!app) {
    setChip("#scopeChip", `${cnt} apps`, "status-chip--warn");
  } else {
    setChip("#scopeChip", (app.name || app.public_id).slice(0, 14), "status-chip--good");
  }
}

function updateContextRows() {
  const w = state.workspaces.find(x => x.public_id === state.selectedWorkspaceId);
  const a = state.apps.find(x => x.public_id === state.selectedAppId);
  const v = state.versions.find(x => x.public_id === state.selectedVersionId);
  qs("#ctxWorkspace").textContent = w?.name || "—";
  qs("#ctxApp").textContent = a?.name || "—";
  qs("#ctxVersion").textContent = v?.name || "—";
  qs("#ctxMode").textContent = state.uiMode;

  const slugs = appCategorySlugs();
  qs("#ctxCategories").textContent = slugs.length ? slugs.join(", ") : "—";

  qs("#appScopeChip").textContent = a?.name || "Free chat";
  qs("#appScopeChip").className = a ? "status-chip status-chip--accent" : "status-chip";
  qs("#versionScopeLabel").textContent = v?.name || "—";

  const tiers = activeTiers();
  const tierEl = qs("#ctxActiveTiers");
  if (tierEl) {
    if (!tiers.length) {
      tierEl.innerHTML = `<span class="muted" style="font-size:11px;">—</span>`;
    } else {
      tierEl.innerHTML = tiers.map(t => `<span class="active-tier-chip">T${t}</span>`).join("");
    }
  }
}

// ── Selection handlers ────────────────────────────────────────────────────
async function selectWorkspace(wid) {
  state.selectedWorkspaceId = wid || null;
  state.selectedAppId = null;
  state.selectedVersionId = null;
  state.appOverview = null;
  await loadOverview();
}

async function selectApp(aid) {
  state.selectedAppId = aid || null;
  state.selectedVersionId = null;
  state.appOverview = null;
  await loadOverview();
}

function selectVersion(vid) {
  state.selectedVersionId = vid || null;
  updateContextRows();
}

// ── Create handlers ───────────────────────────────────────────────────────
async function createWorkspace() {
  const name = qs("#newWorkspaceName")?.value.trim() || "";
  if (!name) { showToast("Name required", "warn"); return; }
  const summary = qs("#newWorkspaceSummary")?.value.trim() || "";
  const r = await api("/api/appcore/workspaces", { method: "POST", body: { name, summary } });
  if (!r.ok) { showToast(`Create workspace failed: ${r.status}`, "warn"); return; }
  showToast("Workspace created", "good");
  qs("#newWorkspaceForm").style.display = "none";
  qs("#newWorkspaceName").value = "";
  qs("#newWorkspaceSummary").value = "";
  state.selectedWorkspaceId = r.body?.public_id || state.selectedWorkspaceId;
  await loadOverview();
}

async function createApp() {
  const name = qs("#newAppName")?.value.trim() || "";
  if (!name) { showToast("Name required", "warn"); return; }
  if (!state.selectedWorkspaceId) { showToast("Select a workspace first", "warn"); return; }
  const purpose = qs("#newAppPurpose")?.value.trim() || "";
  const cats = qsa(".cat-cb").filter(cb => cb.checked).map(cb => cb.value);
  if (!cats.length) { showToast("Select at least one category", "warn"); return; }
  const r = await api("/api/appcore/apps", {
    method: "POST",
    body: {
      workspace_public_id: state.selectedWorkspaceId,
      name,
      one_line_purpose: purpose,
      category_public_ids: cats,
      primary_category_public_id: cats[0],
    },
  });
  if (!r.ok) { showToast(`Create app failed: ${r.status}`, "warn"); return; }
  showToast("App created", "good");
  qs("#newAppForm").style.display = "none";
  qs("#newAppName").value = "";
  qs("#newAppPurpose").value = "";
  qsa(".cat-cb").forEach(cb => { cb.checked = false; cb.closest("label")?.classList.remove("category-check--checked"); });
  state.selectedAppId = r.body?.public_id || state.selectedAppId;
  await loadOverview();
}

async function createVersion() {
  if (!state.selectedAppId) { showToast("Select an app first", "warn"); return; }
  const name = qs("#newVersionName")?.value.trim() || "v0.1";
  const version_kind = qs("#newVersionKind")?.value || "concept";
  const r = await api("/api/appcore/versions", {
    method: "POST",
    body: { app_public_id: state.selectedAppId, name, version_kind },
  });
  if (!r.ok) { showToast(`Create version failed: ${r.status}`, "warn"); return; }
  showToast("Version created", "good");
  qs("#newVersionForm").style.display = "none";
  qs("#newVersionName").value = "";
  state.selectedVersionId = r.body?.public_id || state.selectedVersionId;
  await loadOverview();
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════════════════════
async function loadSessionList() {
  const r = await api(`/api/chat-sessions?surface=${SURFACE}&limit=30`);
  if (!r.ok) {
    state.sessions = [];
    renderSessionList();
    return;
  }
  const items = arr(r.body);
  state.sessions = items.map(raw => ({
    id: raw.session_public_id || raw.public_id || raw.id,
    title: raw.title || raw.name || "Untitled",
    excerpt: raw.excerpt || "",
    appId: raw.app_public_id || null,
    raw,
  }));
  renderSessionList();
}

function renderSessionList() {
  const el = qs("#sessionList"); if (!el) return;
  const freeBtn = qs("#freeChatBtn");
  if (freeBtn) freeBtn.classList.toggle("session-item--active", state.freeMode);
  if (!state.sessions.length) {
    el.innerHTML = `<div class="lib-placeholder">No sessions yet.</div>`;
    setChip("#sessionChip", "—", "status-chip--warn");
    return;
  }
  el.innerHTML = state.sessions.map(s => {
    const appName = s.appId ? (state.apps.find(a => a.public_id === s.appId)?.name || s.appId) : null;
    const isActive = !state.freeMode && s.id === state.selectedSessionId;
    return `
      <button class="session-item ${isActive ? "session-item--active" : ""}" type="button" data-session-id="${escHtml(s.id)}">
        <div class="session-item-title">${escHtml(s.title)}</div>
        <div class="session-item-sub">${appName ? "🧱 " + escHtml(appName) : escHtml(s.excerpt || "General")}</div>
      </button>`;
  }).join("");
  setChip("#sessionChip", `${state.sessions.length}`, "status-chip--good");
}

async function selectSession(sessionId, freeMode = false) {
  state.freeMode = freeMode;
  state.selectedSessionId = sessionId;
  state.messages = [];
  renderSessionList();
  renderChatFeed();
  if (!freeMode) await loadSessionHistory(sessionId);
}

async function loadSessionHistory(sessionId) {
  if (!sessionId || sessionId === FREE_SESSION_ID) return;
  const r = await api(`/api/home/sessions/${encodeURIComponent(sessionId)}/live-chat/history`);
  if (!r.ok) return;
  const messages = Array.isArray(r.body?.messages) ? r.body.messages : [];
  state.messages = messages.map(raw => ({
    role: raw.role || raw.type || "message",
    content: raw.content || raw.text || "",
    model: raw.selected_model || raw.selected_worker_name || raw.model || "",
  }));
  renderChatFeed();
}

async function createNewSession() {
  const r = await api("/api/chat-sessions", {
    method: "POST",
    body: {
      surface: SURFACE,
      title: "New appcore session",
      summary: "AppCore design thread",
      mode: state.chatMode,
      selected_models: state.selectedModels,
    },
  });
  if (!r.ok) { showToast(`Create session failed: ${r.status}`, "warn"); return; }
  await loadSessionList();
  const newId = r.body?.public_id;
  if (newId) {
    state.freeMode = false;
    state.selectedSessionId = newId;
    state.messages = [];
    renderSessionList();
    renderChatFeed();
  }
  showToast("New session created", "good");
}
// ═══════════════════════════════════════════════════════════════════════════
// CHAT FEED + STREAMING
// ═══════════════════════════════════════════════════════════════════════════
function renderChatFeed() {
  const feed = qs("#chatFeed"); if (!feed) return;
  if (state.streaming) return;
  if (!state.messages.length) {
    const app = state.apps.find(a => a.public_id === state.selectedAppId);
    feed.innerHTML = `<div class="chat-placeholder">
      <div class="chat-placeholder-icon">🧱</div>
      <div class="chat-placeholder-title">AppCore design room</div>
      <div class="muted" style="font-size:13px;">${app ? `App: ${escHtml(app.name)}` : "Free chat — no app context"}</div>
    </div>`;
    return;
  }
  feed.innerHTML = state.messages.map(msg => {
    const isUser = (msg.role === "user");
    const headLabel = isUser ? "User" : (msg.model || "Assistant");
    const bodyHtml = isUser ? `<p>${escHtml(msg.content)}</p>` : renderMarkdown(msg.content);
    return `<div class="chat-msg ${isUser ? "chat-msg--user" : "chat-msg--assistant"}">
      <div class="chat-msg-role">${escHtml(headLabel)}</div>
      <div class="chat-msg-content">${bodyHtml}</div>
    </div>`;
  }).join("");
  feed.scrollTop = feed.scrollHeight;
}

function createStreamingMsg(modelName) {
  const feed = qs("#chatFeed"); if (!feed) return null;
  const placeholder = feed.querySelector(".chat-placeholder");
  if (placeholder) placeholder.remove();
  const msg = document.createElement("div");
  msg.className = "chat-msg chat-msg--assistant";
  msg.id = "streamingMsg";
  msg.innerHTML = `
    <div class="chat-msg-role" id="streamHead">${escHtml(modelName || "Assistant")}</div>
    <div class="chat-msg-content">
      <div class="stream-tools" id="streamTools"></div>
      <div class="stream-body" id="streamBody"></div>
    </div>`;
  feed.appendChild(msg);
  feed.scrollTop = feed.scrollHeight;
  return msg;
}

function appendToolCall(name, args) {
  const tools = qs("#streamTools"); if (!tools) return;
  const icon = TOOL_ICONS[name] || "🔧";
  const argsStr = args && typeof args === "object"
    ? Object.entries(args).map(([k,v]) => `${k}: ${String(v).slice(0,60)}`).join(", ") : "";
  const line = document.createElement("div");
  line.className = "stream-tool-call";
  line.dataset.toolName = name;
  line.innerHTML = `<span class="stream-tool-icon">${icon}</span><span class="stream-tool-name">${escHtml(name)}</span>${argsStr ? `<span class="stream-tool-args">${escHtml(argsStr)}</span>` : ""}<span class="stream-tool-state">…</span>`;
  tools.appendChild(line);
  qs("#chatFeed").scrollTop = qs("#chatFeed").scrollHeight;
}

function markToolDone(name, summary) {
  const tools = qs("#streamTools"); if (!tools) return;
  const lines = qsa(".stream-tool-call", tools);
  const last = [...lines].reverse().find(l => l.dataset.toolName === name);
  if (last) {
    last.classList.add("stream-tool-call--done");
    const stateEl = last.querySelector(".stream-tool-state");
    if (stateEl) stateEl.textContent = summary ? ` ✓ ${summary}` : " ✓";
  }
}

function appendStreamChunk(text) {
  const streamBody = qs("#streamBody"); if (!streamBody) return;
  if (!streamBody._raw) streamBody._raw = "";
  streamBody._raw += text;
  streamBody.textContent = streamBody._raw;
  qs("#chatFeed").scrollTop = qs("#chatFeed").scrollHeight;
}

function finalizeStreamingMsg(fullContent, modelName) {
  const msg = qs("#streamingMsg"); if (!msg) return;
  msg.id = "";
  const streamBody = qs("#streamBody", msg);
  if (streamBody) {
    streamBody.id = "";
    streamBody._raw = undefined;
    streamBody.innerHTML = renderMarkdown(fullContent || "");
  }
  qs("#chatFeed").scrollTop = qs("#chatFeed").scrollHeight;
}

async function sendMessage() {
  if (!state.selectedModels.length) { showToast("Select a model first", "warn"); return; }
  const content = qs("#messageInput")?.value.trim() || "";
  if (!content) return;
  if (state.streaming) { showToast("Already streaming", "warn"); return; }

  state.messages.push({ role: "user", content, model: "" });
  qs("#messageInput").value = "";
  renderChatFeed();

  const st = qs("#chatStatusText"); if (st) st.textContent = "Thinking…";
  const sendBtn = qs("#sendBtn"); if (sendBtn) sendBtn.disabled = true;

  state.streaming = true;
  const modelName = state.selectedModels[0] || "Assistant";
  createStreamingMsg(modelName);

  const params = new URLSearchParams({
    prompt: content,
    mode: state.chatMode,
    models: state.selectedModels.join(","),
    surface: SURFACE,
  });
  if (state.selectedAppId) params.set("app_public_id", state.selectedAppId);
  if (state.selectedVersionId) params.set("version_public_id", state.selectedVersionId);

  const url = `${PM_API_BASE}/api/home/sessions/${encodeURIComponent(state.selectedSessionId)}/live-chat/stream?${params}`;
  let fullContent = "";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "tool_call") {
            appendToolCall(event.name, event.args);
            if (st) st.textContent = `${TOOL_ICONS[event.name] || "🔧"} ${event.name}…`;
          } else if (event.type === "tool_result") {
            markToolDone(event.name, event.summary);
            if (st) st.textContent = "Generating…";
          } else if (event.type === "chunk") {
            appendStreamChunk(event.text);
            fullContent += event.text;
          } else if (event.type === "done") {
            fullContent = event.content || fullContent;
          } else if (event.type === "error") {
            appendStreamChunk(`\n\n⚠️ ${event.message}`);
            fullContent += `\n\n⚠️ ${event.message}`;
          }
        } catch {}
      }
    }
  } catch (err) {
    finalizeStreamingMsg(`Error: ${err.message}`, modelName);
    state.streaming = false;
    if (sendBtn) sendBtn.disabled = false;
    if (st) st.textContent = "";
    showToast("Stream failed", "warn");
    return;
  }

  finalizeStreamingMsg(fullContent, modelName);
  state.streaming = false;
  if (sendBtn) sendBtn.disabled = false;
  if (st) st.textContent = "";
  state.messages.push({ role: "assistant", model: modelName, content: fullContent });
}

// ═══════════════════════════════════════════════════════════════════════════
// LIBRARY TREE (left rail) — filtered by app.active_tiers
// ═══════════════════════════════════════════════════════════════════════════
function getApplicableTierIds() {
  // Always show foundation + pipelines.
  const out = ["foundation", "pipelines"];
  const tierIndices = new Set(activeTiers());
  for (const id of TIER_ORDER) {
    if (id === "foundation" || id === "pipelines") continue;
    const tier = TIERS[id];
    if (!tier) continue;
    if (tier.tier_index == null) { out.push(id); continue; }
    if (tierIndices.has(tier.tier_index)) out.push(id);
  }
  // Preserve TIER_ORDER ordering
  return TIER_ORDER.filter(id => out.includes(id));
}

// scope_status from backend: { [scope_kind]: { status, total_rows } }
// We map tier id → its associated pipeline scope_kind (best effort) for counts.
const TIER_TO_SCOPE_KIND = {
  foundation: "concept",
  domain: "domain_modeling",
  interface: "ui_design",
  functions: "function_design",
  data: "data_design",
  tech: "tech_selection",
  distribution: "code_scaffolding",
  cognitive: "cognitive_design",
  household: "household_coordination_design",
  multiuser: "multi_user_design",
  field: "field_operations_design",
  integrations: "integration_design",
  chemical: "field_operations_design",
  windows: "platform_specific_windows",
  android: "platform_specific_android",
  web: "platform_specific_web",
  backend: "backend_design",
};

function tierTotalRows(tierId) {
  const ss = state.appOverview?.scope_status || {};
  const scopeKind = TIER_TO_SCOPE_KIND[tierId];
  if (!scopeKind) return null;
  const entry = ss[scopeKind];
  return entry && typeof entry.total_rows === "number" ? entry.total_rows : null;
}

function renderLibraryTree() {
  const el = qs("#libraryTree"); if (!el) return;
  if (!state.selectedAppId) {
    el.innerHTML = `<div class="lib-placeholder">Select an app.</div>`;
    return;
  }
  const tiers = getApplicableTierIds();
  el.innerHTML = tiers.map(tid => {
    const tier = TIERS[tid];
    const open = state.treeOpen[tid];
    const tierIdxLabel = tier.tier_index == null ? "" : `<span class="tree-branch-tier-num">T${tier.tier_index}</span>`;
    const total = tierTotalRows(tid);
    const totalLabel = total == null ? "" : String(total);
    return `
      <div class="tree-branch">
        <div class="tree-branch-head ${open ? "tree-branch-head--open" : ""}" data-branch="${escHtml(tid)}">
          <span class="tree-branch-arrow">${open ? "▾" : "▸"}</span>
          ${tierIdxLabel}
          <span>${escHtml(tier.label)}</span>
          <span class="tree-branch-count">${totalLabel}</span>
        </div>
        <div class="tree-children ${open ? "tree-children--open" : ""}">
          ${tier.resources.map(r => `
            <div class="tree-leaf ${state.activeTier === tid && state.activeResource === r.id ? "tree-leaf--active" : ""}"
                 data-tier="${escHtml(tid)}" data-resource="${escHtml(r.id)}">
              <span>${escHtml(r.label)}</span>
            </div>
          `).join("")}
        </div>
      </div>`;
  }).join("");
}

function renderCountsBox() {
  const box = qs("#countsBox"); if (!box) return;
  if (!state.selectedAppId) {
    box.innerHTML = `<strong>${state.apps.length} apps</strong><span>Select one to see counts.</span>`;
    return;
  }
  const app = state.apps.find(a => a.public_id === state.selectedAppId);
  const ss = state.appOverview?.scope_status || {};
  const summaryParts = [];
  let totalAll = 0;
  for (const [scopeKind, entry] of Object.entries(ss)) {
    const n = entry?.total_rows ?? 0;
    if (n > 0) {
      summaryParts.push(`${scopeKind}: ${n}`);
      totalAll += n;
    }
  }
  const heading = totalAll > 0 ? `${app?.name || "App"} · ${totalAll} rows` : (app?.name || "App");
  const detail = summaryParts.length ? summaryParts.join(" · ") : "Empty substrate — run a pipeline to populate.";
  box.innerHTML = `<strong>${escHtml(heading)}</strong><span>${escHtml(detail)}</span>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER TABS + RECORD EDITOR (library mode)
// ═══════════════════════════════════════════════════════════════════════════
function renderTierTabs() {
  const container = qs("#tierTabs"); if (!container) return;
  const tiers = getApplicableTierIds();
  if (!tiers.length) {
    container.innerHTML = `<span class="muted" style="font-size:12px;padding:4px 8px;">Select an app to see tiers.</span>`;
    return;
  }
  if (!tiers.includes(state.activeTier)) state.activeTier = tiers[0];

  container.innerHTML = tiers.map(tid => {
    const tier = TIERS[tid];
    const active = state.activeTier === tid;
    const idxLabel = tier.tier_index == null ? "" : `<span style="font-size:9px;opacity:0.6;margin-right:3px;">T${tier.tier_index}</span>`;
    return `<button class="lib-tab ${active ? "lib-tab--active" : ""}" data-tier="${escHtml(tid)}">${idxLabel}${escHtml(tier.label)}</button>`;
  }).join("");
  renderResourceSelect();
}

function switchTier(tier) {
  if (!TIERS[tier]) return;
  state.activeTier = tier;
  state.activeResource = null;
  state.records = [];
  state.activeRecord = null;
  renderTierTabs();
  renderRecordList();
  closeRecordEditor();
}

function renderResourceSelect() {
  const sel = qs("#resourceSelect"); if (!sel) return;
  const tier = TIERS[state.activeTier];
  if (!tier) { sel.innerHTML = `<option value="">—</option>`; return; }
  sel.innerHTML = `<option value="">— select resource —</option>` +
    tier.resources.map(r =>
      `<option value="${escHtml(r.id)}" ${state.activeResource === r.id ? "selected" : ""}>${escHtml(r.label)}</option>`
    ).join("");
}

async function selectResource(resourceId) {
  state.activeResource = resourceId || null;
  state.activeRecord = null;
  closeRecordEditor();
  if (!resourceId) { state.records = []; renderRecordList(); return; }
  await loadResourceRecords();
}

async function loadResourceRecords() {
  if (!state.activeResource) return;
  const tier = TIERS[state.activeTier];
  const res = tier?.resources.find(r => r.id === state.activeResource);
  if (!res) return;
  let url = res.endpoint;
  if (state.selectedAppId) {
    url += `?app=${encodeURIComponent(state.selectedAppId)}`;
  }
  const r = await api(url);
  if (!r.ok) {
    showToast(`Load ${res.label} failed: ${r.status}`, "warn");
    state.records = [];
    renderRecordList();
    return;
  }
  state.records = arr(r.body);
  renderRecordList();
  renderLibraryTree();
}

function renderRecordList() {
  const el = qs("#recordList"); if (!el) return;
  if (!state.activeResource) {
    el.innerHTML = `<div class="lib-placeholder muted">Pick a resource above.</div>`;
    return;
  }
  if (!state.records.length) {
    el.innerHTML = `<div class="lib-placeholder muted">No records yet. Press + New.</div>`;
    return;
  }
  el.innerHTML = state.records.map(r => {
    const title = r.name || r.title || r.label || r.slug || r.public_id;
    const subtitleSrc = r.summary || r.description || r.statement || r.content || r.kind || r.status || "";
    const isActive = state.activeRecord?.public_id === r.public_id;
    return `<button class="record-card ${isActive ? "record-card--active" : ""}" type="button" data-record-id="${escHtml(r.public_id)}">
      <div class="record-card-title">${escHtml(title)}</div>
      <div class="record-card-meta"><span>${escHtml(String(subtitleSrc).slice(0, 80))}</span></div>
    </button>`;
  }).join("");
}

// ── Record editor ─────────────────────────────────────────────────────────
function openRecordEditor(record, isNew = false) {
  const tier = TIERS[state.activeTier];
  const res = tier?.resources.find(r => r.id === state.activeResource);
  if (!res) return;
  const fields = RESOURCE_FIELDS[state.activeResource] || [];
  qs("#recordEditorEyebrow").textContent = res.label;
  qs("#recordEditorTitle").textContent = isNew
    ? `New ${res.label.replace(/s$/,"").toLowerCase()}`
    : (record?.name || record?.title || record?.label || record?.public_id || "—");
  const html = fields.map(f => renderField(f, record || {})).join("");
  qs("#recordFields").innerHTML = html;
  qs("#recordEditorEmpty").style.display = "none";
  qs("#recordEditorActive").style.display = "flex";
  qs("#deleteRecordBtn").style.display = isNew ? "none" : "inline-flex";
  state.activeRecord = isNew ? { __isNew: true } : record;
  renderRecordList();
}

function closeRecordEditor() {
  state.activeRecord = null;
  if (qs("#recordEditorEmpty")) qs("#recordEditorEmpty").style.display = "flex";
  if (qs("#recordEditorActive")) qs("#recordEditorActive").style.display = "none";
}

function renderField(f, record) {
  const v = record[f.name];
  const id = `f_${f.name}`;
  const label = `<span class="soft">${escHtml(f.label)}</span>`;
  if (f.type === "textarea") {
    const val = typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : (v ?? "");
    return `<label class="inline-field">${label}<textarea class="textarea" id="${id}" rows="3">${escHtml(val)}</textarea></label>`;
  }
  if (f.type === "number") {
    return `<label class="inline-field">${label}<input class="input" id="${id}" type="number" value="${escHtml(v ?? "")}" /></label>`;
  }
  if (f.type === "select") {
    return `<label class="inline-field">${label}
      <select class="select" id="${id}">
        <option value="">—</option>
        ${(f.options||[]).map(o => `<option value="${escHtml(o)}" ${v === o ? "selected" : ""}>${escHtml(o)}</option>`).join("")}
      </select></label>`;
  }
  if (f.type === "checkbox") {
    return `<label class="inline-field" style="flex-direction:row;align-items:center;gap:8px;"><input type="checkbox" id="${id}" ${v ? "checked" : ""} />${label}</label>`;
  }
  return `<label class="inline-field">${label}<input class="input" id="${id}" value="${escHtml(v ?? "")}" /></label>`;
}

async function saveRecord() {
  const tier = TIERS[state.activeTier];
  const res = tier?.resources.find(r => r.id === state.activeResource);
  if (!res || !state.activeRecord) return;
  const fields = RESOURCE_FIELDS[state.activeResource] || [];
  const payload = {};
  if (state.selectedAppId) {
    payload.app_public_id = state.selectedAppId;
  }
  for (const f of fields) {
    const el = qs(`#f_${f.name}`); if (!el) continue;
    let val;
    if (f.type === "checkbox") val = el.checked;
    else if (f.type === "number") val = el.value === "" ? null : Number(el.value);
    else if (f.type === "textarea") {
      val = el.value;
      // Try JSON parse for textareas that look like JSON or for fields that are
      // JSONB columns by convention. Hard heuristic — leading [ or { triggers parse attempt.
      const trimmed = (val || "").trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try { val = JSON.parse(trimmed); } catch { /* leave as string */ }
      }
    }
    else val = el.value;
    if (val !== "" && val !== null && val !== undefined) payload[f.name] = val;
  }

  let r;
  if (state.activeRecord.__isNew || !state.activeRecord.public_id) {
    r = await api(res.endpoint, { method: "POST", body: payload });
  } else {
    r = await api(`${res.endpoint}/${encodeURIComponent(state.activeRecord.public_id)}`, { method: "PATCH", body: payload });
  }
  if (!r.ok) { showToast(`Save failed: ${r.status}`, "warn"); return; }
  showToast("Saved", "good");
  closeRecordEditor();
  await loadResourceRecords();
  // Refresh per-app overview so scope_status counts update
  if (state.selectedAppId) {
    const ov = await api(`/api/appcore/apps/${encodeURIComponent(state.selectedAppId)}/overview`);
    if (ov.ok) state.appOverview = ov.body;
  }
  renderLibraryTree();
  renderCountsBox();
  renderPipelineCards();
}

async function deleteRecord() {
  if (!state.activeRecord || !state.activeRecord.public_id) return;
  if (!confirm("Delete this record?")) return;
  const tier = TIERS[state.activeTier];
  const res = tier?.resources.find(r => r.id === state.activeResource);
  const r = await api(`${res.endpoint}/${encodeURIComponent(state.activeRecord.public_id)}`, { method: "DELETE" });
  if (!r.ok) { showToast(`Delete failed: ${r.status}`, "warn"); return; }
  showToast("Deleted", "good");
  closeRecordEditor();
  await loadResourceRecords();
  if (state.selectedAppId) {
    const ov = await api(`/api/appcore/apps/${encodeURIComponent(state.selectedAppId)}/overview`);
    if (ov.ok) state.appOverview = ov.body;
  }
  renderLibraryTree();
  renderCountsBox();
  renderPipelineCards();
}
// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE LAUNCHER + RECENT RUNS
// ═══════════════════════════════════════════════════════════════════════════
function pipelineStatusForScope(scope) {
  const ss = state.appOverview?.scope_status || {};
  const entry = ss[scope.scope_kind];
  if (!entry) return { kind: "empty", label: "Empty" };
  const status = entry.status || "empty";
  const total = entry.total_rows ?? 0;
  if (status === "populated") return { kind: "populated", label: `Populated (${total})` };
  if (status === "partial")   return { kind: "partial",   label: `Partial (${total})` };
  return { kind: "empty", label: "Empty" };
}

function pipelineScopeIsApplicable(scope) {
  const tiers = activeTiers();
  const slugs = appCategorySlugs();

  // Tier gate: if scope has required_tiers, ALL of them must be active.
  if (scope.requires_tiers?.length) {
    for (const t of scope.requires_tiers) {
      if (!tiers.includes(t)) return false;
    }
  }
  // Category gate: if scope has required_categories, ANY of them must be a category on the app.
  if (scope.requires_categories?.length) {
    if (!scope.requires_categories.some(c => slugs.includes(c))) return false;
  }
  return true;
}

function templatesForScope(scopeKind) {
  return state.pipelineTemplates.filter(t => t.scope_kind === scopeKind);
}

function renderPipelineCards() {
  const el = qs("#pipelineCards"); if (!el) return;
  if (!state.selectedAppId) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">Select an app.</div>`;
    return;
  }
  const visible = PIPELINE_SCOPES.filter(pipelineScopeIsApplicable);
  if (!visible.length) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">No applicable pipelines for this app's categories/tiers.</div>`;
    return;
  }

  el.innerHTML = visible.map(scope => {
    const matching = templatesForScope(scope.scope_kind);
    const status = pipelineStatusForScope(scope);
    const launchableId = matching[0]?.public_id || "";
    const select = matching.length > 1
      ? `<select class="select" data-scope-launch="${escHtml(scope.id)}">
          ${matching.map(m => `<option value="${escHtml(m.public_id)}">${escHtml(m.label || m.slug || m.public_id)}</option>`).join("")}
         </select>`
      : "";
    const btnLabel = matching.length === 0 ? "No template" : "Launch";
    const btnDisabled = matching.length === 0 ? "disabled" : "";
    return `
      <div class="pipeline-card ${matching.length === 0 ? "pipeline-card--disabled" : ""}">
        <div class="pipeline-card-head">
          <div>
            <div class="pipeline-card-title">${escHtml(scope.title)}</div>
            <div class="pipeline-card-desc">${escHtml(scope.desc)}</div>
          </div>
          <span class="pl-status pl-status--${status.kind}">${escHtml(status.label)}</span>
        </div>
        <div class="pipeline-card-foot">
          ${select}
          <button class="button button--small" data-scope-id="${escHtml(scope.id)}" data-default-pipeline="${escHtml(launchableId)}" ${btnDisabled}>${btnLabel}</button>
        </div>
      </div>`;
  }).join("");
}

async function launchPipelineFromCard(scopeId, button) {
  const scope = PIPELINE_SCOPES.find(s => s.id === scopeId);
  if (!scope) return;
  const sel = qs(`[data-scope-launch="${scopeId}"]`);
  const pipelineId = sel ? sel.value : button.dataset.defaultPipeline;
  if (!pipelineId) { showToast("No template selected", "warn"); return; }
  if (!state.selectedAppId) { showToast("Select an app first", "warn"); return; }

  const idempotency_key = `${state.selectedAppId}:${pipelineId}:${Date.now()}`;
  const payload = {
    app_public_id: state.selectedAppId,
    pipeline_public_id: pipelineId,
    version_public_id: state.selectedVersionId || null,
    idempotency_key,
    inputs: {},
    initiated_by: "appcore-creator-ui",
  };
  const r = await api("/api/appcore/pipeline-runs/start", { method: "POST", body: payload });
  if (!r.ok) { showToast(`Launch failed: ${r.status}`, "warn"); return; }
  showToast(`Queued: ${scope.title}`, "good");

  // Refresh runs and overview
  if (state.selectedAppId) {
    const ov = await api(`/api/appcore/apps/${encodeURIComponent(state.selectedAppId)}/overview`);
    if (ov.ok) {
      state.appOverview = ov.body;
      state.recentRuns = state.appOverview.recent_runs || [];
    }
  }
  renderRunList();
  renderPipelineCards();
}

function renderRunList() {
  const el = qs("#runList"); if (!el) return;
  if (!state.recentRuns.length) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">No runs yet.</div>`;
    return;
  }
  el.innerHTML = state.recentRuns.slice(0, 8).map(r => {
    const title = r.run_label || r.label || r.public_id || "run";
    const status = r.status || r.run_status || "?";
    const scope = r.scope_kind || "";
    const completed = r.completed_stages ?? "?";
    const total = r.total_stages ?? "?";
    return `
      <div class="run-item">
        <div class="run-item-title">${escHtml(title)}</div>
        <div class="run-item-meta">
          <span>${escHtml(status)}</span>
          <span>${escHtml(scope)}</span>
          <span>${escHtml(completed + "/" + total)}</span>
        </div>
      </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE TOGGLE (Design / Library)
// ═══════════════════════════════════════════════════════════════════════════
function toggleMode() {
  state.uiMode = state.uiMode === "design" ? "library" : "design";
  qs("#designMode").style.display = state.uiMode === "design" ? "flex" : "none";
  qs("#libraryMode").style.display = state.uiMode === "library" ? "flex" : "none";
  qs("#modeToggleBtn").textContent = state.uiMode === "design" ? "📚 Library" : "💬 Design";
  updateContextRows();
  if (state.uiMode === "library") renderTierTabs();
}

function togglePipelinePanel() {
  state.pipelineCollapsed = !state.pipelineCollapsed;
  qs("#pipelineCards").classList.toggle("pipeline-cards--collapsed", state.pipelineCollapsed);
  qs("#pipelineArrow").classList.toggle("collapse-arrow--collapsed", state.pipelineCollapsed);
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAG RESIZE (chat feed height)
// ═══════════════════════════════════════════════════════════════════════════
function initDragResize() {
  const handle = qs("#chatResizeHandle");
  const feed = qs("#chatFeed");
  if (!handle || !feed) return;
  const KEY = "appcore_chat_height";
  const saved = parseInt(localStorage.getItem(KEY));
  if (saved > 80 && saved < 900) { feed.style.minHeight = saved + "px"; feed.style.maxHeight = saved + "px"; }
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener("mousedown", e => {
    dragging = true;
    startY = e.clientY;
    startH = feed.getBoundingClientRect().height;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const h = Math.max(120, Math.min(900, startH + (e.clientY - startY)));
    feed.style.minHeight = h + "px";
    feed.style.maxHeight = h + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════════════════════════════
function bindEvents() {
  // Header
  qs("#refreshBtn")?.addEventListener("click", loadOverview);
  qs("#modeToggleBtn")?.addEventListener("click", toggleMode);

  // Sessions
  qs("#freeChatBtn")?.addEventListener("click", () => selectSession(FREE_SESSION_ID, true));
  qs("#sessionList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-session-id]");
    if (btn) selectSession(btn.dataset.sessionId, false);
  });
  qs("#newSessionBtn")?.addEventListener("click", createNewSession);

  // Workspace / app / version
  qs("#workspaceSelect")?.addEventListener("change", e => selectWorkspace(e.target.value));
  qs("#appSelect")?.addEventListener("change", e => selectApp(e.target.value));
  qs("#versionSelect")?.addEventListener("change", e => selectVersion(e.target.value));

  qs("#newWorkspaceBtn")?.addEventListener("click", () => { qs("#newWorkspaceForm").style.display = "block"; });
  qs("#cancelWorkspaceBtn")?.addEventListener("click", () => { qs("#newWorkspaceForm").style.display = "none"; });
  qs("#saveWorkspaceBtn")?.addEventListener("click", createWorkspace);

  qs("#newAppBtn")?.addEventListener("click", () => {
    if (!state.selectedWorkspaceId) { showToast("Select a workspace first", "warn"); return; }
    qs("#newAppForm").style.display = "block";
  });
  qs("#cancelAppBtn")?.addEventListener("click", () => { qs("#newAppForm").style.display = "none"; });
  qs("#saveAppBtn")?.addEventListener("click", createApp);

  qs("#newVersionBtn")?.addEventListener("click", () => {
    if (!state.selectedAppId) { showToast("Select an app first", "warn"); return; }
    qs("#newVersionForm").style.display = "block";
  });
  qs("#cancelVersionBtn")?.addEventListener("click", () => { qs("#newVersionForm").style.display = "none"; });
  qs("#saveVersionBtn")?.addEventListener("click", createVersion);

  // Library tree
  qs("#libraryTree")?.addEventListener("click", e => {
    const head = e.target.closest("[data-branch]");
    if (head) {
      const id = head.dataset.branch;
      state.treeOpen[id] = !state.treeOpen[id];
      renderLibraryTree();
      return;
    }
    const leaf = e.target.closest("[data-tier][data-resource]");
    if (leaf) {
      state.activeTier = leaf.dataset.tier;
      state.activeResource = leaf.dataset.resource;
      if (state.uiMode !== "library") toggleMode();
      renderTierTabs();
      renderResourceSelect();
      loadResourceRecords();
    }
  });

  // Tier tabs
  qs("#tierTabs")?.addEventListener("click", e => {
    const btn = e.target.closest(".lib-tab"); if (!btn) return;
    switchTier(btn.dataset.tier);
  });

  // Resource select
  qs("#resourceSelect")?.addEventListener("change", e => selectResource(e.target.value));

  // Record list
  qs("#recordList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-record-id]"); if (!btn) return;
    const rec = state.records.find(r => r.public_id === btn.dataset.recordId);
    if (rec) openRecordEditor(rec, false);
  });

  qs("#newRecordBtn")?.addEventListener("click", () => {
    if (!state.activeResource) { showToast("Select a resource first", "warn"); return; }
    openRecordEditor({}, true);
  });

  qs("#saveRecordBtn")?.addEventListener("click", saveRecord);
  qs("#deleteRecordBtn")?.addEventListener("click", deleteRecord);
  qs("#closeRecordBtn")?.addEventListener("click", closeRecordEditor);

  // Pipeline launcher
  qs("#pipelineToggleBtn")?.addEventListener("click", togglePipelinePanel);
  qs("#pipelineCards")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-scope-id]"); if (!btn) return;
    launchPipelineFromCard(btn.dataset.scopeId, btn);
  });

  // Chat mode cards
  qs("#modeCards")?.addEventListener("click", e => {
    const card = e.target.closest(".mode-card"); if (!card) return;
    state.chatMode = card.dataset.mode;
    qsa(".mode-card").forEach(c => c.classList.toggle("mode-card--active", c.dataset.mode === state.chatMode));
    if (state.chatMode === "single" && state.selectedModels.length > 1) state.selectedModels = [state.selectedModels[0]];
    renderModelSelector();
    updateContextRows();
  });
  qs("#sendBtn")?.addEventListener("click", sendMessage);
  qs("#messageInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
function init() {
  bindEvents();
  initDragResize();
  loadModels();
  loadOverview();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
