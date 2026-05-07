// ═══════════════════════════════════════════════════════════════════════════
// WebCore Builder — page.js
// ═══════════════════════════════════════════════════════════════════════════

const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const FREE_SESSION_ID = "chat-webcore-01";
const SURFACE = "webcore";

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

  // Foundation
  workspaces: [], sites: [], deployments: [], categories: [],
  selectedWorkspaceId: null,
  selectedSiteId: null,
  selectedDeploymentId: null,
  siteCategories: [],          // categories attached to selected site (resolved from overview())

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
  recordCounts: {},            // table_name (without webcore_ prefix) → count

  // Pipelines + scope status
  pipelines: [],               // webcore_pipelines rows (templates)
  pipelineScopeStatus: {},     // scope_code → status row
  recentRuns: [],

  // Library tree open state
  treeOpen: {
    foundation: true, ia_visual: false, components: false, content: false,
    backend: false, seo_a11y: false, analytics: false, deploy: false, pipelines: false,
  },
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

// ═══════════════════════════════════════════════════════════════════════════
// TIER & RESOURCE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
// Each tier maps to a set of resource endpoints + their editable fields.
// Field types: input | textarea | number | select(options) | checkbox

const TIERS = {
  foundation: {
    label: "Foundation",
    resources: [
      { id: "design-pillars",    label: "Design pillars",    endpoint: "/api/webcore/design-pillars",    scopeKey: "site_public_id", table: "design_pillars" },
      { id: "briefs",            label: "Briefs",            endpoint: "/api/webcore/briefs",            scopeKey: "site_public_id", table: "briefs" },
      { id: "design-decisions",  label: "Design decisions",  endpoint: "/api/webcore/design-decisions",  scopeKey: "site_public_id", table: "design_decisions" },
      { id: "notes",             label: "Notes",             endpoint: "/api/webcore/notes",             scopeKey: "site_public_id", table: "notes" },
    ],
  },
  ia_visual: {
    label: "IA · Visual",
    resources: [
      { id: "pages",              label: "Pages",              endpoint: "/api/webcore/pages",              scopeKey: "site_public_id", table: "pages" },
      { id: "routes",             label: "Routes",             endpoint: "/api/webcore/routes",             scopeKey: "site_public_id", table: "routes" },
      { id: "navigation-items",   label: "Navigation items",   endpoint: "/api/webcore/navigation-items",   scopeKey: "site_public_id", table: "navigation_items" },
      { id: "user-flows",         label: "User flows",         endpoint: "/api/webcore/user-flows",         scopeKey: "site_public_id", table: "user_flows" },
      { id: "design-systems",     label: "Design systems",     endpoint: "/api/webcore/design-systems",     scopeKey: "site_public_id", table: "design_systems" },
      { id: "design-tokens",      label: "Design tokens",      endpoint: "/api/webcore/design-tokens",      scopeKey: "site_public_id", table: "design_tokens" },
      { id: "color-palettes",     label: "Color palettes",     endpoint: "/api/webcore/color-palettes",     scopeKey: "site_public_id", table: "color_palettes" },
      { id: "typography-scales",  label: "Typography scales",  endpoint: "/api/webcore/typography-scales",  scopeKey: "site_public_id", table: "typography_scales" },
    ],
  },
  components: {
    label: "Components",
    resources: [
      { id: "components",         label: "Components",         endpoint: "/api/webcore/components",         scopeKey: "site_public_id",       table: "components" },
      { id: "component-variants", label: "Component variants", endpoint: "/api/webcore/component-variants", scopeKey: "component_public_id",  table: "component_variants" },
      { id: "component-props",    label: "Component props",    endpoint: "/api/webcore/component-props",    scopeKey: "component_public_id",  table: "component_props" },
      { id: "layouts",            label: "Layouts",            endpoint: "/api/webcore/layouts",            scopeKey: "site_public_id",       table: "layouts" },
      { id: "layout-slots",       label: "Layout slots",       endpoint: "/api/webcore/layout-slots",       scopeKey: "layout_public_id",     table: "layout_slots" },
      { id: "page-compositions",  label: "Page compositions",  endpoint: "/api/webcore/page-compositions",  scopeKey: "page_public_id",       table: "page_compositions" },
    ],
  },
  content: {
    label: "Content",
    requires: "content",   // gated when site has a content-driven category (resolved in getApplicableTiers)
    resources: [
      { id: "content-models",         label: "Content models",         endpoint: "/api/webcore/content-models",         scopeKey: "site_public_id",          table: "content_models" },
      { id: "content-model-fields",   label: "Model fields",           endpoint: "/api/webcore/content-model-fields",   scopeKey: "content_model_public_id", table: "content_model_fields" },
      { id: "content-relationships",  label: "Relationships",          endpoint: "/api/webcore/content-relationships",  scopeKey: "site_public_id",          table: "content_relationships" },
      { id: "content-examples",       label: "Examples",               endpoint: "/api/webcore/content-examples",       scopeKey: "content_model_public_id", table: "content_examples" },
    ],
  },
  backend: {
    label: "Backend",
    requires: "backend",
    resources: [
      { id: "api-endpoints",  label: "API endpoints", endpoint: "/api/webcore/api-endpoints",  scopeKey: "site_public_id", table: "api_endpoints" },
      { id: "db-schemas",     label: "DB schemas",    endpoint: "/api/webcore/db-schemas",     scopeKey: "site_public_id", table: "db_schemas" },
      { id: "auth-flows",     label: "Auth flows",    endpoint: "/api/webcore/auth-flows",     scopeKey: "site_public_id", table: "auth_flows" },
    ],
  },
  seo_a11y: {
    label: "SEO · A11y",
    resources: [
      { id: "seo-meta",   label: "SEO meta",   endpoint: "/api/webcore/seo-meta",   scopeKey: "site_public_id", table: "seo_meta" },
      { id: "a11y-specs", label: "A11y specs", endpoint: "/api/webcore/a11y-specs", scopeKey: "site_public_id", table: "a11y_specs" },
    ],
  },
  analytics: {
    label: "Analytics",
    requires: "analytics",
    resources: [
      { id: "analytics-events", label: "Events", endpoint: "/api/webcore/analytics-events", scopeKey: "site_public_id", table: "analytics_events" },
    ],
  },
  deploy: {
    label: "Deploy",
    resources: [
      { id: "deploy-configs",            label: "Deploy configs",  endpoint: "/api/webcore/deploy-configs",            scopeKey: "site_public_id", table: "deploy_configs" },
      { id: "deploy-environment-vars",   label: "Env vars",        endpoint: "/api/webcore/deploy-environment-vars",   scopeKey: "site_public_id", table: "deploy_environment_vars" },
      { id: "deploy-domains",            label: "Domains",         endpoint: "/api/webcore/deploy-domains",            scopeKey: "site_public_id", table: "deploy_domains" },
    ],
  },
  pipelines: {
    label: "Pipelines",
    resources: [
      { id: "pipelines",            label: "Pipeline templates", endpoint: "/api/webcore/pipelines",            scopeKey: null,             table: "pipelines" },
      { id: "pipeline-runs",        label: "Pipeline runs",      endpoint: "/api/webcore/pipeline-runs",        scopeKey: "site_public_id", table: "pipeline_runs" },
      { id: "recipes",              label: "Recipes",            endpoint: "/api/webcore/recipes",              scopeKey: null,             table: "recipes" },
      { id: "validators",           label: "Validators",         endpoint: "/api/webcore/validators",           scopeKey: null,             table: "validators" },
      { id: "validator-runs",       label: "Validator runs",     endpoint: "/api/webcore/validator-runs",       scopeKey: "site_public_id", table: "validator_runs" },
      { id: "performance-budgets",  label: "Perf budgets",       endpoint: "/api/webcore/performance-budgets",  scopeKey: "site_public_id", table: "performance_budgets" },
      { id: "cross-domain-links",   label: "Cross-domain links", endpoint: "/api/webcore/cross-domain-links",   scopeKey: "site_public_id", table: "cross_domain_links" },
    ],
  },
};

// Field schemas per resource — a focused-but-useful subset; rest stays in JSON `metadata`.
const RESOURCE_FIELDS = {
  // ── Foundation ───────────────────────────────────────────────────────────
  "design-pillars": [
    { name: "name", type: "input", label: "Name" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "rationale", type: "textarea", label: "Rationale" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  briefs: [
    { name: "title", type: "input", label: "Title" },
    { name: "source", type: "select", label: "Source", options: ["operator","client","imported"] },
    { name: "submitted_by", type: "input", label: "Submitted by" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "raw_text", type: "textarea", label: "Raw brief" },
    { name: "target_audience", type: "textarea", label: "Target audience" },
    { name: "primary_goal", type: "input", label: "Primary goal" },
    { name: "success_metrics", type: "textarea", label: "Success metrics (JSON array)" },
    { name: "must_have_features", type: "textarea", label: "Must-have features (JSON array)" },
    { name: "nice_to_have", type: "textarea", label: "Nice-to-have (JSON array)" },
    { name: "constraints", type: "textarea", label: "Constraints (JSON array)" },
    { name: "inspiration_refs", type: "textarea", label: "Inspiration refs (JSON array)" },
    { name: "status", type: "select", label: "Status", options: ["draft","accepted","superseded"] },
  ],
  "design-decisions": [
    { name: "title", type: "input", label: "Title" },
    { name: "decision", type: "textarea", label: "Decision" },
    { name: "rationale", type: "textarea", label: "Rationale" },
    { name: "alternatives", type: "textarea", label: "Alternatives (JSON array)" },
    { name: "constraints", type: "textarea", label: "Constraints (JSON array)" },
    { name: "tier", type: "number", label: "Tier (0-10)" },
    { name: "area", type: "select", label: "Area", options: ["visual","ia","stack","deploy","content","backend","analytics","seo","a11y"] },
    { name: "status", type: "select", label: "Status", options: ["active","superseded","revisited"] },
    { name: "decided_by", type: "select", label: "Decided by", options: ["operator","pipeline","client"] },
  ],
  notes: [
    { name: "title", type: "input", label: "Title" },
    { name: "body", type: "textarea", label: "Body" },
    { name: "tags", type: "textarea", label: "Tags (JSON array)" },
    { name: "author", type: "input", label: "Author" },
  ],

  // ── IA · Visual ──────────────────────────────────────────────────────────
  pages: [
    { name: "name", type: "input", label: "Name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "page_type", type: "select", label: "Page type", options: ["home","landing","article","product","docs","auth","app_view","listing","detail","other"] },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "primary_action", type: "input", label: "Primary action" },
    { name: "target_audience", type: "input", label: "Target audience" },
    { name: "render_mode", type: "select", label: "Render mode", options: ["static","ssg","ssr","csr","isr"] },
    { name: "template_name", type: "input", label: "Template name" },
    { name: "content_model_public_id", type: "input", label: "Content model ID" },
    { name: "parent_page_public_id", type: "input", label: "Parent page ID" },
    { name: "status", type: "select", label: "Status", options: ["draft","designed","built","live"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  routes: [
    { name: "path", type: "input", label: "Path (e.g. /blog/[slug])" },
    { name: "page_public_id", type: "input", label: "Page ID" },
    { name: "is_dynamic", type: "checkbox", label: "Dynamic" },
    { name: "dynamic_params", type: "textarea", label: "Dynamic params (JSON array)" },
    { name: "render_mode", type: "select", label: "Render mode", options: ["static","ssg","ssr","csr","isr"] },
    { name: "revalidate_seconds", type: "number", label: "Revalidate seconds (ISR)" },
    { name: "requires_auth", type: "checkbox", label: "Requires auth" },
    { name: "auth_redirect_to", type: "input", label: "Auth redirect to" },
    { name: "middleware", type: "textarea", label: "Middleware (JSON array)" },
    { name: "is_redirect", type: "checkbox", label: "Is redirect" },
    { name: "redirect_to", type: "input", label: "Redirect to" },
    { name: "redirect_status", type: "number", label: "Redirect status (301/302/307/308)" },
    { name: "status", type: "select", label: "Status", options: ["active","draft","archived"] },
  ],
  "navigation-items": [
    { name: "label", type: "input", label: "Label" },
    { name: "nav_group", type: "select", label: "Group", options: ["header","footer","sidebar","mobile","utility"] },
    { name: "parent_item_public_id", type: "input", label: "Parent item ID" },
    { name: "target_type", type: "select", label: "Target type", options: ["page","route","external","anchor","none"] },
    { name: "target_page_public_id", type: "input", label: "Target page ID" },
    { name: "target_route_public_id", type: "input", label: "Target route ID" },
    { name: "target_url", type: "input", label: "Target URL" },
    { name: "icon_name", type: "input", label: "Icon (e.g. lucide:home)" },
    { name: "badge_text", type: "input", label: "Badge text" },
    { name: "visibility", type: "input", label: "Visibility (always | auth_only | guest_only | role:admin)" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "user-flows": [
    { name: "name", type: "input", label: "Name" },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "flow_type", type: "select", label: "Flow type", options: ["signup","checkout","onboarding","recovery","task","other"] },
    { name: "success_criterion", type: "textarea", label: "Success criterion" },
    { name: "failure_handling", type: "textarea", label: "Failure handling" },
    { name: "steps", type: "textarea", label: "Steps (JSON array)" },
    { name: "status", type: "select", label: "Status", options: ["draft","designed","implemented"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "design-systems": [
    { name: "name", type: "input", label: "Name" },
    { name: "kind", type: "select", label: "Kind", options: ["custom","external","fork"] },
    { name: "external_name", type: "input", label: "External name (shadcn-ui, tailwind-ui, …)" },
    { name: "external_version", type: "input", label: "External version" },
    { name: "external_url", type: "input", label: "External URL" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "voice_and_tone", type: "textarea", label: "Voice & tone" },
    { name: "visual_personality", type: "textarea", label: "Visual personality" },
    { name: "status", type: "select", label: "Status", options: ["active","draft","archived"] },
  ],
  "design-tokens": [
    { name: "token_kind", type: "select", label: "Kind", options: ["color","spacing","font_size","font_family","font_weight","line_height","letter_spacing","shadow","radius","breakpoint","z_index","duration","easing","opacity"] },
    { name: "name", type: "input", label: "Name (e.g. primary, space-4)" },
    { name: "value", type: "input", label: "Value (e.g. #10b981, 1rem)" },
    { name: "theme_mode", type: "select", label: "Theme mode", options: ["default","light","dark","high_contrast"] },
    { name: "aliases", type: "input", label: "Aliases (token name)" },
    { name: "role", type: "select", label: "Role", options: ["brand","semantic","utility"] },
    { name: "description", type: "textarea", label: "Description" },
    { name: "design_system_public_id", type: "input", label: "Design system ID" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "color-palettes": [
    { name: "name", type: "input", label: "Name" },
    { name: "palette_role", type: "select", label: "Role", options: ["brand","neutral","semantic","chart","accent"] },
    { name: "description", type: "textarea", label: "Description" },
    { name: "swatches", type: "textarea", label: "Swatches (JSON array)" },
    { name: "source", type: "select", label: "Source", options: ["custom","tailwind","radix","extracted","palette_tool"] },
    { name: "source_ref", type: "input", label: "Source ref" },
    { name: "design_system_public_id", type: "input", label: "Design system ID" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "typography-scales": [
    { name: "name", type: "input", label: "Name" },
    { name: "purpose", type: "select", label: "Purpose", options: ["headings","paragraph","interface","code"] },
    { name: "base_size", type: "input", label: "Base size (e.g. 1rem)" },
    { name: "ratio", type: "number", label: "Ratio (e.g. 1.250)" },
    { name: "base_line_height", type: "number", label: "Base line height" },
    { name: "base_font_family_token", type: "input", label: "Base font family token" },
    { name: "ramp", type: "textarea", label: "Ramp (JSON array)" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "design_system_public_id", type: "input", label: "Design system ID" },
    { name: "sort_order", type: "number", label: "Order" },
  ],

  // ── Components ───────────────────────────────────────────────────────────
  components: [
    { name: "name", type: "input", label: "Name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "component_kind", type: "select", label: "Kind", options: ["atom","molecule","organism","template","page_section"] },
    { name: "category", type: "select", label: "Category", options: ["button","form","navigation","card","hero","media","data_display","feedback","layout","other"] },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "when_to_use", type: "textarea", label: "When to use" },
    { name: "when_not_to_use", type: "textarea", label: "When not to use" },
    { name: "composes_components", type: "textarea", label: "Composes (JSON array of public_ids)" },
    { name: "source_origin", type: "select", label: "Source origin", options: ["authored","library","wrapper"] },
    { name: "library_name", type: "input", label: "Library name" },
    { name: "library_component_ref", type: "input", label: "Library ref" },
    { name: "anatomy", type: "textarea", label: "Anatomy (JSON array)" },
    { name: "interactivity", type: "select", label: "Interactivity", options: ["static","interactive","stateful","data_bound"] },
    { name: "requires_js", type: "checkbox", label: "Requires JS" },
    { name: "design_system_public_id", type: "input", label: "Design system ID" },
    { name: "status", type: "select", label: "Status", options: ["designed","built","deprecated"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "component-variants": [
    { name: "component_public_id", type: "input", label: "Component ID" },
    { name: "axis", type: "input", label: "Axis (size | intent | shape | density | tone)" },
    { name: "value", type: "input", label: "Value (e.g. lg, primary)" },
    { name: "is_default", type: "checkbox", label: "Default" },
    { name: "token_overrides", type: "textarea", label: "Token overrides (JSON object)" },
    { name: "class_overrides", type: "input", label: "Class overrides" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "component-props": [
    { name: "component_public_id", type: "input", label: "Component ID" },
    { name: "name", type: "input", label: "Name" },
    { name: "prop_type", type: "select", label: "Type", options: ["string","number","boolean","enum","node","array","object","function","token_ref"] },
    { name: "is_required", type: "checkbox", label: "Required" },
    { name: "default_value", type: "input", label: "Default value" },
    { name: "enum_values", type: "textarea", label: "Enum values (JSON array)" },
    { name: "validation", type: "textarea", label: "Validation (JSON object)" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "example", type: "input", label: "Example" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  layouts: [
    { name: "name", type: "input", label: "Name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "layout_kind", type: "select", label: "Layout kind", options: ["page","section","modal","overlay"] },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "structure_type", type: "select", label: "Structure", options: ["single_column","two_column","sidebar_main","header_footer","split","grid","custom"] },
    { name: "breakpoint_behavior", type: "textarea", label: "Breakpoint behavior (JSON object)" },
    { name: "max_width", type: "input", label: "Max width (e.g. 7xl, 1280px, full)" },
    { name: "container_padding", type: "input", label: "Container padding token" },
    { name: "is_default_for_site", type: "checkbox", label: "Default for site" },
    { name: "design_system_public_id", type: "input", label: "Design system ID" },
    { name: "status", type: "select", label: "Status", options: ["designed","built","deprecated"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "layout-slots": [
    { name: "layout_public_id", type: "input", label: "Layout ID" },
    { name: "name", type: "input", label: "Name (e.g. header, main, sidebar)" },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "is_required", type: "checkbox", label: "Required" },
    { name: "min_instances", type: "number", label: "Min instances" },
    { name: "max_instances", type: "number", label: "Max instances (blank = unbounded)" },
    { name: "allowed_component_kinds", type: "textarea", label: "Allowed kinds (JSON array)" },
    { name: "allowed_component_categories", type: "textarea", label: "Allowed categories (JSON array)" },
    { name: "default_component_public_id", type: "input", label: "Default component ID" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "page-compositions": [
    { name: "page_public_id", type: "input", label: "Page ID" },
    { name: "layout_public_id", type: "input", label: "Layout ID" },
    { name: "slot_public_id", type: "input", label: "Slot ID" },
    { name: "component_public_id", type: "input", label: "Component ID" },
    { name: "variant_selections", type: "textarea", label: "Variant selections (JSON object)" },
    { name: "prop_values", type: "textarea", label: "Prop values (JSON object)" },
    { name: "content_binding", type: "textarea", label: "Content binding (JSON object)" },
    { name: "visibility_rule", type: "input", label: "Visibility rule" },
    { name: "status", type: "select", label: "Status", options: ["placed","pinned","experiment","removed"] },
    { name: "notes", type: "textarea", label: "Notes" },
    { name: "sort_order", type: "number", label: "Order" },
  ],

  // ── Content ──────────────────────────────────────────────────────────────
  "content-models": [
    { name: "name", type: "input", label: "Name (e.g. Post, Product)" },
    { name: "plural_name", type: "input", label: "Plural name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "is_singleton", type: "checkbox", label: "Singleton" },
    { name: "has_slug_field", type: "checkbox", label: "Has slug field" },
    { name: "has_publish_workflow", type: "checkbox", label: "Has publish workflow" },
    { name: "has_revisions", type: "checkbox", label: "Has revisions" },
    { name: "has_localization", type: "checkbox", label: "Has localization" },
    { name: "storage_target", type: "select", label: "Storage", options: ["database","markdown","json","cms_external","headless"] },
    { name: "cms_external_name", type: "select", label: "CMS (when external)", options: ["","sanity","contentful","strapi","directus"] },
    { name: "default_route_pattern", type: "input", label: "Default route pattern" },
    { name: "status", type: "select", label: "Status", options: ["designed","built","deprecated"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "content-model-fields": [
    { name: "content_model_public_id", type: "input", label: "Content model ID" },
    { name: "name", type: "input", label: "Name" },
    { name: "label", type: "input", label: "Label" },
    { name: "field_type", type: "select", label: "Type", options: ["string","text","rich_text","markdown","number","boolean","date","datetime","image","file","url","email","enum","reference","array","json","color","slug"] },
    { name: "is_required", type: "checkbox", label: "Required" },
    { name: "is_unique", type: "checkbox", label: "Unique" },
    { name: "is_searchable", type: "checkbox", label: "Searchable" },
    { name: "is_localized", type: "checkbox", label: "Localized" },
    { name: "default_value", type: "input", label: "Default value" },
    { name: "enum_values", type: "textarea", label: "Enum values (JSON array)" },
    { name: "validation", type: "textarea", label: "Validation (JSON object)" },
    { name: "reference_model_public_id", type: "input", label: "Reference model ID" },
    { name: "reference_is_many", type: "checkbox", label: "Reference is many" },
    { name: "edit_widget", type: "select", label: "Edit widget", options: ["","input","textarea","rich_text_editor","image_picker","reference_picker","enum_select"] },
    { name: "placeholder", type: "input", label: "Placeholder" },
    { name: "help_text", type: "textarea", label: "Help text" },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "content-relationships": [
    { name: "from_model_public_id", type: "input", label: "From model ID" },
    { name: "to_model_public_id", type: "input", label: "To model ID" },
    { name: "relationship_kind", type: "select", label: "Kind", options: ["one_to_one","one_to_many","many_to_one","many_to_many"] },
    { name: "from_field_name", type: "input", label: "From field name" },
    { name: "to_field_name", type: "input", label: "To field name (inverse)" },
    { name: "on_delete", type: "select", label: "On delete", options: ["cascade","set_null","restrict","no_action"] },
    { name: "is_required", type: "checkbox", label: "Required" },
    { name: "description", type: "textarea", label: "Description" },
  ],
  "content-examples": [
    { name: "content_model_public_id", type: "input", label: "Content model ID" },
    { name: "name", type: "input", label: "Name" },
    { name: "slug", type: "input", label: "Slug" },
    { name: "content", type: "textarea", label: "Content (JSON object)" },
    { name: "source", type: "select", label: "Source", options: ["authored","generated","imported"] },
    { name: "is_canonical_example", type: "checkbox", label: "Canonical example" },
    { name: "status", type: "select", label: "Status", options: ["draft","reviewed","approved"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],

  // ── Backend ──────────────────────────────────────────────────────────────
  "api-endpoints": [
    { name: "name", type: "input", label: "Name" },
    { name: "kind", type: "select", label: "Kind", options: ["rest","graphql_query","graphql_mutation","graphql_subscription","rpc","webhook"] },
    { name: "method", type: "select", label: "HTTP method", options: ["","GET","POST","PUT","PATCH","DELETE"] },
    { name: "path", type: "input", label: "Path" },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "bound_to_content_model", type: "input", label: "Bound to content model ID" },
    { name: "backing_function_name", type: "input", label: "Backing function name" },
    { name: "path_params", type: "textarea", label: "Path params (JSON array)" },
    { name: "query_params", type: "textarea", label: "Query params (JSON array)" },
    { name: "request_body_schema", type: "textarea", label: "Request body schema (JSON)" },
    { name: "request_examples", type: "textarea", label: "Request examples (JSON array)" },
    { name: "response_schema", type: "textarea", label: "Response schema (JSON)" },
    { name: "response_status_codes", type: "textarea", label: "Response status codes (JSON array)" },
    { name: "response_examples", type: "textarea", label: "Response examples (JSON array)" },
    { name: "requires_auth", type: "checkbox", label: "Requires auth" },
    { name: "required_roles", type: "textarea", label: "Required roles (JSON array)" },
    { name: "required_scopes", type: "textarea", label: "Required scopes (JSON array)" },
    { name: "rate_limit", type: "input", label: "Rate limit (e.g. 100/min)" },
    { name: "cache_strategy", type: "input", label: "Cache strategy" },
    { name: "status", type: "select", label: "Status", options: ["designed","implemented","deprecated"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "db-schemas": [
    { name: "name", type: "input", label: "Table name" },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "derived_from_content_model", type: "input", label: "Derived from content model ID" },
    { name: "columns", type: "textarea", label: "Columns (JSON array)" },
    { name: "indexes", type: "textarea", label: "Indexes (JSON array)" },
    { name: "constraints", type: "textarea", label: "Constraints (JSON array)" },
    { name: "target_dialect", type: "select", label: "Dialect", options: ["postgres","mysql","sqlite","mssql"] },
    { name: "target_orm", type: "select", label: "ORM", options: ["","prisma","drizzle","sqlalchemy","raw_sql"] },
    { name: "initial_migration_status", type: "select", label: "Migration", options: ["planned","generated","applied"] },
    { name: "status", type: "select", label: "Status", options: ["designed","built","deprecated"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "auth-flows": [
    { name: "name", type: "input", label: "Name" },
    { name: "flow_kind", type: "select", label: "Kind", options: ["password","oauth","magic_link","passkey","saml","api_key","jwt","session_only"] },
    { name: "is_primary", type: "checkbox", label: "Primary" },
    { name: "provider_name", type: "input", label: "Provider (google, github, …)" },
    { name: "provider_config", type: "textarea", label: "Provider config (JSON)" },
    { name: "login_page_public_id", type: "input", label: "Login page ID" },
    { name: "register_page_public_id", type: "input", label: "Register page ID" },
    { name: "callback_page_public_id", type: "input", label: "Callback page ID" },
    { name: "forgot_password_page_public_id", type: "input", label: "Forgot password page ID" },
    { name: "session_strategy", type: "select", label: "Session strategy", options: ["cookie","jwt","database","redis","edge_session"] },
    { name: "session_duration_seconds", type: "number", label: "Session duration (s)" },
    { name: "allow_signup", type: "checkbox", label: "Allow signup" },
    { name: "requires_email_verification", type: "checkbox", label: "Email verification" },
    { name: "requires_mfa", type: "checkbox", label: "MFA" },
    { name: "target_library", type: "select", label: "Library", options: ["","authjs","lucia","clerk","supabase_auth","auth0","better_auth","custom"] },
    { name: "status", type: "select", label: "Status", options: ["designed","implemented","deprecated"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],

  // ── SEO · A11y ───────────────────────────────────────────────────────────
  "seo-meta": [
    { name: "scope", type: "select", label: "Scope", options: ["page","route","site_default"] },
    { name: "page_public_id", type: "input", label: "Page ID" },
    { name: "route_public_id", type: "input", label: "Route ID" },
    { name: "title", type: "input", label: "Title" },
    { name: "title_template", type: "input", label: "Title template (e.g. %s | Acme)" },
    { name: "description", type: "textarea", label: "Description (50-160 chars)" },
    { name: "keywords", type: "textarea", label: "Keywords (JSON array)" },
    { name: "canonical_url", type: "input", label: "Canonical URL" },
    { name: "robots", type: "input", label: "Robots (e.g. index,follow)" },
    { name: "og_title", type: "input", label: "OG title" },
    { name: "og_description", type: "textarea", label: "OG description" },
    { name: "og_type", type: "input", label: "OG type" },
    { name: "og_image_url", type: "input", label: "OG image URL" },
    { name: "og_image_alt", type: "input", label: "OG image alt" },
    { name: "og_locale", type: "input", label: "OG locale" },
    { name: "twitter_card", type: "select", label: "Twitter card", options: ["summary","summary_large_image","app","player"] },
    { name: "twitter_site", type: "input", label: "Twitter site (@handle)" },
    { name: "twitter_creator", type: "input", label: "Twitter creator (@handle)" },
    { name: "twitter_image_url", type: "input", label: "Twitter image URL" },
    { name: "jsonld_schemas", type: "textarea", label: "JSON-LD schemas (JSON array)" },
    { name: "in_sitemap", type: "checkbox", label: "In sitemap" },
    { name: "sitemap_priority", type: "number", label: "Sitemap priority (0.0-1.0)" },
    { name: "sitemap_changefreq", type: "select", label: "Sitemap changefreq", options: ["always","hourly","daily","weekly","monthly","yearly","never"] },
  ],
  "a11y-specs": [
    { name: "scope", type: "select", label: "Scope", options: ["site","page","component"] },
    { name: "page_public_id", type: "input", label: "Page ID (when page scope)" },
    { name: "component_public_id", type: "input", label: "Component ID (when component scope)" },
    { name: "wcag_target", type: "select", label: "WCAG target", options: ["A","AA","AAA"] },
    { name: "wcag_version", type: "input", label: "WCAG version (e.g. 2.2)" },
    { name: "min_contrast_text", type: "number", label: "Min contrast (text)" },
    { name: "min_contrast_large_text", type: "number", label: "Min contrast (large text)" },
    { name: "min_contrast_non_text", type: "number", label: "Min contrast (non-text)" },
    { name: "aria_pattern", type: "select", label: "ARIA pattern", options: ["","button","menu","dialog","combobox","tablist","listbox","alert","navigation","other"] },
    { name: "aria_attributes_required", type: "textarea", label: "ARIA attrs required (JSON array)" },
    { name: "keyboard_interaction", type: "textarea", label: "Keyboard interaction (JSON array)" },
    { name: "focus_visible_required", type: "checkbox", label: "Focus visible required" },
    { name: "focus_trap_required", type: "checkbox", label: "Focus trap required" },
    { name: "respect_reduced_motion", type: "checkbox", label: "Respect reduced motion" },
    { name: "respect_color_scheme", type: "checkbox", label: "Respect color scheme" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "status", type: "select", label: "Status", options: ["specified","implemented","audited","failing"] },
    { name: "last_audit_summary", type: "textarea", label: "Last audit summary" },
  ],

  // ── Analytics ────────────────────────────────────────────────────────────
  "analytics-events": [
    { name: "name", type: "input", label: "Name (e.g. signup_completed)" },
    { name: "category", type: "select", label: "Category", options: ["conversion","engagement","navigation","error","system"] },
    { name: "event_kind", type: "select", label: "Kind", options: ["pageview","action","goal","error","system"] },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "providers", type: "textarea", label: "Providers (JSON array)" },
    { name: "properties", type: "textarea", label: "Properties (JSON array)" },
    { name: "trigger_kind", type: "select", label: "Trigger kind", options: ["","auto_pageview","click","submit","scroll","custom_call","server_side"] },
    { name: "trigger_target_selector", type: "input", label: "Trigger selector" },
    { name: "trigger_page_public_id", type: "input", label: "Trigger page ID" },
    { name: "trigger_component_public_id", type: "input", label: "Trigger component ID" },
    { name: "is_conversion_goal", type: "checkbox", label: "Conversion goal" },
    { name: "goal_value", type: "number", label: "Goal value" },
    { name: "pii_fields", type: "textarea", label: "PII fields (JSON array)" },
    { name: "consent_category", type: "select", label: "Consent category", options: ["analytics","marketing","functional","necessary"] },
    { name: "status", type: "select", label: "Status", options: ["designed","implemented","deprecated"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],

  // ── Deploy ───────────────────────────────────────────────────────────────
  "deploy-configs": [
    { name: "deploy_target", type: "input", label: "Target (cloudflare_pages, vercel, …)" },
    { name: "is_primary", type: "checkbox", label: "Primary" },
    { name: "build_command", type: "input", label: "Build command" },
    { name: "install_command", type: "input", label: "Install command" },
    { name: "output_directory", type: "input", label: "Output directory" },
    { name: "node_version", type: "input", label: "Node version" },
    { name: "config_files", type: "textarea", label: "Config files (JSON object)" },
    { name: "headers_config", type: "textarea", label: "Headers (JSON array)" },
    { name: "redirects_config", type: "textarea", label: "Redirects (JSON array)" },
    { name: "rewrites_config", type: "textarea", label: "Rewrites (JSON array)" },
    { name: "edge_functions", type: "textarea", label: "Edge functions (JSON array)" },
    { name: "status", type: "select", label: "Status", options: ["designed","rendered","applied"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "deploy-environment-vars": [
    { name: "deploy_config_public_id", type: "input", label: "Deploy config ID" },
    { name: "name", type: "input", label: "Name (e.g. DATABASE_URL)" },
    { name: "is_secret", type: "checkbox", label: "Secret" },
    { name: "is_required", type: "checkbox", label: "Required" },
    { name: "scope", type: "select", label: "Scope", options: ["all","production","preview","development","build_only","runtime_only"] },
    { name: "description", type: "textarea", label: "Description" },
    { name: "example_value", type: "input", label: "Example value (redacted)" },
    { name: "docs_url", type: "input", label: "Docs URL" },
    { name: "default_value", type: "input", label: "Default value (non-secret only)" },
    { name: "status", type: "select", label: "Status", options: ["designed","applied"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "deploy-domains": [
    { name: "deploy_config_public_id", type: "input", label: "Deploy config ID" },
    { name: "domain", type: "input", label: "Domain" },
    { name: "is_primary", type: "checkbox", label: "Primary" },
    { name: "is_apex", type: "checkbox", label: "Apex" },
    { name: "redirect_to", type: "input", label: "Redirect to" },
    { name: "dns_records", type: "textarea", label: "DNS records (JSON array)" },
    { name: "verification_method", type: "select", label: "Verification", options: ["","cname","txt","http","platform_managed"] },
    { name: "verification_token", type: "input", label: "Verification token" },
    { name: "verification_status", type: "select", label: "Verification status", options: ["pending","verified","failed"] },
    { name: "tls_status", type: "select", label: "TLS status", options: ["pending","active","failed","expired"] },
    { name: "tls_provider", type: "select", label: "TLS provider", options: ["letsencrypt","platform","custom"] },
    { name: "status", type: "select", label: "Status", options: ["pending","live","archived"] },
  ],

  // ── Pipelines ────────────────────────────────────────────────────────────
  pipelines: [
    { name: "name", type: "input", label: "Name" },
    { name: "scope_code", type: "input", label: "Scope code" },
    { name: "version", type: "input", label: "Version (e.g. v1)" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "stages", type: "textarea", label: "Stages (JSON array)" },
    { name: "inputs", type: "textarea", label: "Inputs (JSON array)" },
    { name: "outputs", type: "textarea", label: "Outputs (JSON array)" },
    { name: "gates_on_scopes", type: "textarea", label: "Gates on scopes (JSON array)" },
    { name: "gating_validators", type: "textarea", label: "Gating validators (JSON array)" },
    { name: "default_models", type: "textarea", label: "Default models (JSON array)" },
    { name: "default_temperature", type: "number", label: "Default temperature" },
    { name: "is_default_for_scope", type: "checkbox", label: "Default for scope" },
    { name: "status", type: "select", label: "Status", options: ["active","deprecated","draft"] },
    { name: "sort_order", type: "number", label: "Order" },
  ],
  "pipeline-runs": [
    { name: "pipeline_public_id", type: "input", label: "Pipeline ID" },
    { name: "run_label", type: "input", label: "Run label" },
    { name: "triggered_by", type: "select", label: "Triggered by", options: ["operator","pipeline","schedule","webhook"] },
    { name: "status", type: "select", label: "Status", options: ["queued","running","completed","failed","cancelled","partial"] },
    { name: "status_message", type: "textarea", label: "Status message" },
    { name: "current_stage_index", type: "number", label: "Current stage" },
    { name: "total_stages", type: "number", label: "Total stages" },
    { name: "stage_log", type: "textarea", label: "Stage log (JSON array)" },
    { name: "substrate_writes", type: "textarea", label: "Substrate writes (JSON array)" },
    { name: "validator_results", type: "textarea", label: "Validator results (JSON array)" },
    { name: "error_summary", type: "textarea", label: "Error summary" },
    { name: "error_details", type: "textarea", label: "Error details (JSON object)" },
    { name: "sub_scope", type: "input", label: "Sub-scope" },
    { name: "target_page_public_id", type: "input", label: "Target page ID" },
  ],
  recipes: [
    { name: "name", type: "input", label: "Name" },
    { name: "recipe_kind", type: "select", label: "Kind", options: ["prompt","extract","verify","classify","compose","generate"] },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "system_prompt", type: "textarea", label: "System prompt" },
    { name: "user_prompt_template", type: "textarea", label: "User prompt template" },
    { name: "input_schema", type: "textarea", label: "Input schema (JSON array)" },
    { name: "output_format", type: "select", label: "Output format", options: ["text","json","structured","jsonl","sql"] },
    { name: "output_schema", type: "textarea", label: "Output schema (JSON)" },
    { name: "examples", type: "textarea", label: "Examples (JSON array)" },
    { name: "preferred_models", type: "textarea", label: "Preferred models (JSON array)" },
    { name: "avoid_models", type: "textarea", label: "Avoid models (JSON array, e.g. [\"gemini*\"])" },
    { name: "temperature", type: "number", label: "Temperature" },
    { name: "max_tokens", type: "number", label: "Max tokens" },
    { name: "version", type: "input", label: "Version" },
    { name: "status", type: "select", label: "Status", options: ["active","deprecated","experimental"] },
  ],
  validators: [
    { name: "name", type: "input", label: "Name" },
    { name: "validator_kind", type: "select", label: "Kind", options: ["a11y","seo","performance","structural","data","security","custom"] },
    { name: "purpose", type: "textarea", label: "Purpose" },
    { name: "severity", type: "select", label: "Severity", options: ["info","warning","error","blocking"] },
    { name: "target_kind", type: "select", label: "Target kind", options: ["site","page","component","route","deploy_config","content_model"] },
    { name: "implementation", type: "select", label: "Implementation", options: ["sql","function","recipe","external_tool","manual"] },
    { name: "sql_query", type: "textarea", label: "SQL query" },
    { name: "function_name", type: "input", label: "Function name" },
    { name: "recipe_public_id", type: "input", label: "Recipe ID" },
    { name: "external_tool_command", type: "input", label: "External tool command" },
    { name: "expected_result", type: "textarea", label: "Expected result (JSON)" },
    { name: "config_schema", type: "textarea", label: "Config schema (JSON array)" },
    { name: "status", type: "select", label: "Status", options: ["active","deprecated"] },
  ],
  "validator-runs": [
    { name: "validator_public_id", type: "input", label: "Validator ID" },
    { name: "pipeline_run_public_id", type: "input", label: "Pipeline run ID" },
    { name: "passed", type: "checkbox", label: "Passed" },
    { name: "severity", type: "select", label: "Severity", options: ["info","warning","error","blocking"] },
    { name: "measured_value", type: "textarea", label: "Measured value (JSON)" },
    { name: "expected_value", type: "textarea", label: "Expected value (JSON)" },
    { name: "affected_rows", type: "textarea", label: "Affected rows (JSON array)" },
    { name: "findings", type: "textarea", label: "Findings (JSON array)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "duration_ms", type: "number", label: "Duration (ms)" },
  ],
  "performance-budgets": [
    { name: "scope", type: "select", label: "Scope", options: ["site","page","route"] },
    { name: "page_public_id", type: "input", label: "Page ID (when page scope)" },
    { name: "route_public_id", type: "input", label: "Route ID (when route scope)" },
    { name: "metric_name", type: "select", label: "Metric", options: ["lcp_ms","cls","inp_ms","tbt_ms","js_bundle_kb","css_kb","image_kb","request_count","total_kb"] },
    { name: "budget_value", type: "number", label: "Budget value" },
    { name: "budget_unit", type: "select", label: "Unit", options: ["ms","kb","count","score"] },
    { name: "comparison", type: "select", label: "Comparison", options: ["lte","gte","eq"] },
    { name: "severity", type: "select", label: "Severity (when violated)", options: ["info","warning","error","blocking"] },
    { name: "measured_by", type: "select", label: "Measured by", options: ["lighthouse","webpagetest","crux","rum","bundle_analyzer"] },
    { name: "status", type: "select", label: "Status", options: ["active","archived"] },
  ],
  "cross-domain-links": [
    { name: "source_kind", type: "select", label: "Source kind", options: ["site","page","component","content_model"] },
    { name: "source_public_id", type: "input", label: "Source ID (when not 'site')" },
    { name: "target_domain", type: "select", label: "Target domain", options: ["lorecore","gamecore","appcore","external"] },
    { name: "target_kind", type: "input", label: "Target kind (universe, book, project, app, …)" },
    { name: "target_public_id", type: "input", label: "Target public_id" },
    { name: "target_label", type: "input", label: "Target label (denormalized)" },
    { name: "relationship_kind", type: "select", label: "Relationship", options: ["companion_site","marketing_site","press_kit","docs_for","landing_for","embeds","references"] },
    { name: "is_primary", type: "checkbox", label: "Primary" },
    { name: "direction", type: "select", label: "Direction", options: ["web_to_other","other_to_web","bidirectional"] },
    { name: "description", type: "textarea", label: "Description" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE SCOPES (matches chunk 5 seeded scope_codes)
// ═══════════════════════════════════════════════════════════════════════════
// `requires` semantics:
//   null = always available
//   "content" = needs a content-driven category (content_site/web_app/dashboard/portal/e_commerce/documentation)
//   "backend" = needs a backend-needing category (web_app/dashboard/portal/e_commerce)
//   "analytics" = always available but lit only when explicitly opted in (treat null but show)
const PIPELINE_SCOPES = [
  { id: "brief_to_ia",       title: "Brief → IA",          desc: "Brief into sitemap, pages, navigation, user flows", scope_code: "brief_to_ia",       requires: null },
  { id: "visual_design",     title: "Visual design",        desc: "Design system, palettes, typography, tokens",        scope_code: "visual_design",     requires: null },
  { id: "component_design",  title: "Component design",     desc: "Components, variants, props",                        scope_code: "component_design",  requires: null },
  { id: "page_composition",  title: "Page composition",     desc: "Layouts, slots, page compositions",                  scope_code: "page_composition",  requires: null },
  { id: "content_modeling",  title: "Content modeling",     desc: "Content models, fields, relationships, examples",     scope_code: "content_modeling",  requires: "content" },
  { id: "backend_wiring",    title: "Backend wiring",       desc: "API endpoints, DB schemas, auth flows",               scope_code: "backend_wiring",    requires: "backend" },
  { id: "seo_metadata",      title: "SEO + metadata",       desc: "Per-page meta, OG, JSON-LD, sitemap",                 scope_code: "seo_metadata",      requires: null },
  { id: "a11y_audit",        title: "A11y audit",           desc: "Specs + audit: contrast, ARIA, keyboard, motion",     scope_code: "a11y_audit",        requires: null },
  { id: "analytics",         title: "Analytics",            desc: "Tracked events, conversion goals, providers",         scope_code: "analytics",         requires: null },
  { id: "deploy_config",     title: "Deploy config",        desc: "Target config, env vars, domain DNS",                 scope_code: "deploy_config",     requires: null },
  { id: "code_scaffolding",  title: "Code scaffolding",     desc: "Emit file tree from substrate state",                 scope_code: "code_scaffolding",  requires: null },
  { id: "documentation",     title: "Documentation",        desc: "README, deploy instructions, customer handoff",       scope_code: "documentation",     requires: null },
];

// Categories that imply "content-driven" / "backend-needed"
const CONTENT_SITE_CATEGORIES = new Set(["content_site","web_app","dashboard","portal","e_commerce","documentation"]);
const BACKEND_SITE_CATEGORIES = new Set(["web_app","dashboard","portal","e_commerce"]);

// ═══════════════════════════════════════════════════════════════════════════
// MODELS
// ═══════════════════════════════════════════════════════════════════════════
async function loadModels() {
  const r = await api("/api/model-pool/models");
  const items = r.ok ? (Array.isArray(r.body?.items) ? r.body.items : Array.isArray(r.body) ? r.body : []) : [];
  state.availableModels = items
    .filter(m => m.runtime_driver === "openai_api" && m.enabled !== false &&
                 (parseSurfaces(m.surface_allowlist).includes(SURFACE) ||
                  parseSurfaces(m.surface_allowlist).includes("lorecore") ||
                  parseSurfaces(m.surface_allowlist).includes("gamecore")))
    .map(m => ({ alias: m.alias || m.name, label: m.name || m.alias }));
  renderModelSelector();
}

function renderModelSelector() {
  const container = qs("#modelSelectorWrap"); if (!container) return;
  if (!state.availableModels.length) {
    container.innerHTML = `<div class="muted" style="font-size:12px;">No models — enable webcore surface in Settings.</div>`;
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
// FOUNDATION (workspaces / sites / deployments / categories)
// ═══════════════════════════════════════════════════════════════════════════
async function loadAllFoundation() {
  setChip("#libraryChip", "Loading", "status-chip--warn");

  // Load registries in parallel
  const [wsR, catsR, sitesR] = await Promise.all([
    api("/api/webcore/workspaces"),
    api("/api/webcore/categories"),
    api("/api/webcore/sites"),
  ]);

  state.workspaces = wsR.ok && Array.isArray(wsR.body) ? wsR.body : [];
  state.categories = catsR.ok && Array.isArray(catsR.body) ? catsR.body : [];
  state.sites = sitesR.ok && Array.isArray(sitesR.body) ? sitesR.body : [];

  if (!state.selectedWorkspaceId && state.workspaces.length) {
    state.selectedWorkspaceId = state.workspaces[0].public_id;
  }

  // Filter sites to current workspace
  const wsSites = state.sites.filter(s => !state.selectedWorkspaceId || s.workspace_public_id === state.selectedWorkspaceId);
  if (state.selectedSiteId && !wsSites.find(s => s.public_id === state.selectedSiteId)) {
    state.selectedSiteId = null;
    state.selectedDeploymentId = null;
  }

  // If a site is selected, fetch its overview (categories, row_counts, recent_deploys, scope_status)
  if (state.selectedSiteId) {
    const ovR = await api(`/api/webcore/overview?site_public_id=${encodeURIComponent(state.selectedSiteId)}`);
    if (ovR.ok && ovR.body && ovR.body.scope === "site") {
      state.siteCategories = ovR.body.categories || [];
      state.deployments = ovR.body.recent_deploys || [];
      // overview row_counts is keyed by full table name (webcore_pages); strip prefix for our recordCounts map
      const rc = ovR.body.row_counts || {};
      state.recordCounts = {};
      for (const [tbl, n] of Object.entries(rc)) {
        const stripped = tbl.replace(/^webcore_/, "");
        state.recordCounts[stripped] = n;
      }
      // scope_status: array of {scope_code, status, last_run_at, last_run_status}
      state.pipelineScopeStatus = {};
      for (const s of (ovR.body.scope_status || [])) {
        state.pipelineScopeStatus[s.scope_code] = s;
      }
    }
  } else {
    state.siteCategories = [];
    state.deployments = [];
    state.recordCounts = {};
    state.pipelineScopeStatus = {};
  }

  renderWorkspaceSelect();
  renderSiteSelect();
  renderDeploymentSelect();
  renderCategoryChecks();
  renderDeployTargetSelect();
  updateScopeChip();
  updateContextRows();
  setChip("#libraryChip", `${state.sites.length} sites`, state.sites.length ? "status-chip--good" : "status-chip--warn");

  await Promise.all([
    loadSessionList(),
    loadPipelinesForSite(),
    loadRecentRunsForSite(),
  ]);
  renderLibraryTree();
  renderCountsBox();
  renderDeployMini();
  renderPipelineCards();
  renderTierTabs();
}

function renderWorkspaceSelect() {
  const sel = qs("#workspaceSelect"); if (!sel) return;
  sel.innerHTML = `<option value="">— select workspace —</option>` +
    state.workspaces.map(w => `<option value="${escHtml(w.public_id)}" ${w.public_id === state.selectedWorkspaceId ? "selected" : ""}>${escHtml(w.name || w.public_id)}</option>`).join("");
}

function renderSiteSelect() {
  const sel = qs("#siteSelect"); if (!sel) return;
  const sites = state.sites.filter(s => !state.selectedWorkspaceId || s.workspace_public_id === state.selectedWorkspaceId);
  sel.innerHTML = `<option value="">—</option>` +
    sites.map(s => `<option value="${escHtml(s.public_id)}" ${s.public_id === state.selectedSiteId ? "selected" : ""}>${escHtml(s.name || s.public_id)}</option>`).join("");
}

function renderDeploymentSelect() {
  const sel = qs("#deploymentSelect"); if (!sel) return;
  const deploys = state.deployments.filter(d => !state.selectedSiteId || d.site_public_id === state.selectedSiteId || !d.site_public_id);
  sel.innerHTML = `<option value="">—</option>` +
    deploys.map(d => `<option value="${escHtml(d.public_id)}" ${d.public_id === state.selectedDeploymentId ? "selected" : ""}>${escHtml(d.label || d.version_number || d.public_id)} · ${escHtml(d.status || "?")}</option>`).join("");
}

function renderCategoryChecks() {
  const containers = {
    site: qs("#newSiteSiteCategories"),
    stack: qs("#newSiteStackCategories"),
    deploy: qs("#newSiteDeployCategories"),
  };
  for (const [flavor, container] of Object.entries(containers)) {
    if (!container) continue;
    const cats = state.categories.filter(c => c.flavor === flavor);
    container.innerHTML = cats.map(c => `
      <label class="category-check">
        <input type="checkbox" class="cat-cb" data-flavor="${escHtml(flavor)}" value="${escHtml(c.public_id)}" data-code="${escHtml(c.code)}" />
        <span>${escHtml(c.label || c.code)}</span>
      </label>`).join("");
    qsa(".cat-cb", container).forEach(cb => cb.addEventListener("change", () => {
      cb.closest("label")?.classList.toggle("category-check--checked", cb.checked);
    }));
  }
}

function renderDeployTargetSelect() {
  const sel = qs("#newDeploymentTarget"); if (!sel) return;
  const cats = state.categories.filter(c => c.flavor === "deploy");
  sel.innerHTML = `<option value="">— deploy target —</option>` +
    cats.map(c => `<option value="${escHtml(c.code)}">${escHtml(c.label)}</option>`).join("");
}

function siteCategoryCodes() {
  return state.siteCategories.map(c => c.code).filter(Boolean);
}

function siteHasContentCategory() {
  return siteCategoryCodes().some(code => CONTENT_SITE_CATEGORIES.has(code));
}

function siteHasBackendCategory() {
  return siteCategoryCodes().some(code => BACKEND_SITE_CATEGORIES.has(code));
}

function updateScopeChip() {
  const cnt = state.sites.length;
  const site = state.sites.find(s => s.public_id === state.selectedSiteId);
  if (!site) {
    setChip("#scopeChip", `${cnt} sites`, cnt ? "status-chip--warn" : "status-chip--bad");
  } else {
    setChip("#scopeChip", site.name?.slice(0, 14) || site.public_id, "status-chip--good");
  }
}

function updateContextRows() {
  const w = state.workspaces.find(x => x.public_id === state.selectedWorkspaceId);
  const s = state.sites.find(x => x.public_id === state.selectedSiteId);
  const d = state.deployments.find(x => x.public_id === state.selectedDeploymentId);
  qs("#ctxWorkspace").textContent = w?.name || "—";
  qs("#ctxSite").textContent = s?.name || "—";
  qs("#ctxDeployment").textContent = d ? (d.label || d.version_number || d.public_id) : "—";
  qs("#ctxMode").textContent = state.uiMode;
  qs("#ctxCategories").textContent = siteCategoryCodes().join(", ") || "—";
  qs("#siteScopeChip").textContent = s?.name || "Free chat";
  qs("#siteScopeChip").className = s ? "status-chip status-chip--accent" : "status-chip";
  qs("#deploymentScopeLabel").textContent = d ? (d.label || d.version_number || "—") : "—";
}

// ── Selection handlers ────────────────────────────────────────────────────
async function selectWorkspace(wid) {
  state.selectedWorkspaceId = wid || null;
  state.selectedSiteId = null;
  state.selectedDeploymentId = null;
  state.siteCategories = [];
  state.recordCounts = {};
  state.pipelineScopeStatus = {};
  state.deployments = [];
  await loadAllFoundation();
}

async function selectSite(sid) {
  state.selectedSiteId = sid || null;
  state.selectedDeploymentId = null;
  await loadAllFoundation();
}

function selectDeployment(did) {
  state.selectedDeploymentId = did || null;
  updateContextRows();
  renderDeployMini();
}

// ── Create handlers ───────────────────────────────────────────────────────
async function createWorkspace() {
  const name = qs("#newWorkspaceName")?.value.trim() || "";
  if (!name) { showToast("Name required", "warn"); return; }
  const description = qs("#newWorkspaceDescription")?.value.trim() || "";
  const r = await api("/api/webcore/workspaces", { method: "POST", body: { name, description } });
  if (!r.ok) { showToast(`Create workspace failed: ${r.status}`, "warn"); return; }
  showToast("Workspace created", "good");
  qs("#newWorkspaceForm").style.display = "none";
  qs("#newWorkspaceName").value = "";
  qs("#newWorkspaceDescription").value = "";
  state.selectedWorkspaceId = r.body?.public_id || state.selectedWorkspaceId;
  await loadAllFoundation();
}

async function createSite() {
  const name = qs("#newSiteName")?.value.trim() || "";
  if (!name) { showToast("Name required", "warn"); return; }
  if (!state.selectedWorkspaceId) { showToast("Select a workspace first", "warn"); return; }
  const tagline = qs("#newSiteTagline")?.value.trim() || "";
  const primary_domain = qs("#newSiteDomain")?.value.trim() || "";

  const sitePublicId = `WCS-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const r = await api("/api/webcore/sites", {
    method: "POST",
    body: {
      public_id: sitePublicId,
      workspace_public_id: state.selectedWorkspaceId,
      name, tagline, primary_domain,
    },
  });
  if (!r.ok) { showToast(`Create site failed: ${r.status}`, "warn"); return; }
  const newSiteId = r.body?.public_id || sitePublicId;

  // Attach categories via webcore_site_categories junction; mark first of each flavor as primary
  const checked = qsa(".cat-cb").filter(cb => cb.checked);
  const primaryByFlavor = {};
  for (const cb of checked) {
    const flavor = cb.dataset.flavor;
    const isPrimary = !primaryByFlavor[flavor];
    primaryByFlavor[flavor] = true;
    await api("/api/webcore/site-categories", {
      method: "POST",
      body: {
        site_public_id: newSiteId,
        category_public_id: cb.value,
        is_primary: isPrimary,
      },
    });
  }

  showToast("Site created", "good");
  qs("#newSiteForm").style.display = "none";
  qs("#newSiteName").value = "";
  qs("#newSiteTagline").value = "";
  qs("#newSiteDomain").value = "";
  qsa(".cat-cb").forEach(cb => { cb.checked = false; cb.closest("label")?.classList.remove("category-check--checked"); });
  state.selectedSiteId = newSiteId;
  await loadAllFoundation();
}

async function createDeployment() {
  if (!state.selectedSiteId) { showToast("Select a site first", "warn"); return; }
  const label = qs("#newDeploymentLabel")?.value.trim() || "";
  const version_number = qs("#newDeploymentVersion")?.value.trim() || "";
  const branch = qs("#newDeploymentBranch")?.value.trim() || "main";
  const deploy_target = qs("#newDeploymentTarget")?.value || "";
  if (!deploy_target) { showToast("Deploy target required", "warn"); return; }
  const r = await api("/api/webcore/deployments", {
    method: "POST",
    body: {
      site_public_id: state.selectedSiteId,
      label, version_number, branch, deploy_target,
      status: "queued",
    },
  });
  if (!r.ok) { showToast(`Queue deploy failed: ${r.status}`, "warn"); return; }
  showToast("Deploy queued", "good");
  qs("#newDeploymentForm").style.display = "none";
  qs("#newDeploymentLabel").value = "";
  qs("#newDeploymentVersion").value = "";
  qs("#newDeploymentBranch").value = "";
  state.selectedDeploymentId = r.body?.public_id || state.selectedDeploymentId;
  await loadAllFoundation();
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════════════════════
async function loadSessionList() {
  const r = await api(`/api/chat-sessions?surface=${SURFACE}&limit=30`);
  if (!r.ok) return;
  const items = Array.isArray(r.body?.items) ? r.body.items : Array.isArray(r.body) ? r.body : [];
  state.sessions = items.map(raw => ({
    id: raw.session_public_id || raw.public_id || raw.id,
    title: raw.title || raw.name || "Untitled",
    excerpt: raw.excerpt || "",
    siteId: raw.site_public_id || raw.project_public_id || null,
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
    const siteName = s.siteId ? (state.sites.find(p => p.public_id === s.siteId)?.name || s.siteId) : null;
    const isActive = !state.freeMode && s.id === state.selectedSessionId;
    return `
      <button class="session-item ${isActive ? "session-item--active" : ""}" type="button" data-session-id="${escHtml(s.id)}">
        <div class="session-item-title">${escHtml(s.title)}</div>
        <div class="session-item-sub">${siteName ? "🌐 " + escHtml(siteName) : escHtml(s.excerpt || "General")}</div>
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
      title: "New webcore session",
      summary: "WebCore design thread",
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
    const site = state.sites.find(p => p.public_id === state.selectedSiteId);
    feed.innerHTML = `<div class="chat-placeholder">
      <div class="chat-placeholder-icon">🌐</div>
      <div class="chat-placeholder-title">WebCore design room</div>
      <div class="muted" style="font-size:13px;">${site ? `Site: ${escHtml(site.name)}` : "Free chat — no site context"}</div>
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
  if (state.selectedSiteId) params.set("site_public_id", state.selectedSiteId);
  if (state.selectedDeploymentId) params.set("deployment_public_id", state.selectedDeploymentId);

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
// LIBRARY TREE (left rail) + tier tabs (center)
// ═══════════════════════════════════════════════════════════════════════════
function getApplicableTiers() {
  const out = [];
  for (const [tierId, tier] of Object.entries(TIERS)) {
    if (!tier.requires) { out.push(tierId); continue; }
    if (tier.requires === "content") {
      if (siteHasContentCategory()) out.push(tierId);
      continue;
    }
    if (tier.requires === "backend") {
      if (siteHasBackendCategory()) out.push(tierId);
      continue;
    }
    if (tier.requires === "analytics") {
      out.push(tierId);   // analytics tier always available; opt-in via populating events
      continue;
    }
  }
  return out;
}

function renderLibraryTree() {
  const el = qs("#libraryTree"); if (!el) return;
  if (!state.selectedSiteId) {
    el.innerHTML = `<div class="lib-placeholder">Select a site.</div>`;
    return;
  }
  const tiers = getApplicableTiers();
  el.innerHTML = tiers.map(tid => {
    const tier = TIERS[tid];
    const open = state.treeOpen[tid];
    const tierCount = tier.resources
      .map(r => state.recordCounts[r.table])
      .filter(n => typeof n === "number")
      .reduce((a,b) => a + b, 0);
    return `
      <div class="tree-branch">
        <div class="tree-branch-head ${open ? "tree-branch-head--open" : ""}" data-branch="${escHtml(tid)}">
          <span class="tree-branch-arrow">${open ? "▾" : "▸"}</span>
          <span>${escHtml(tier.label)}</span>
          <span class="tree-branch-count">${tierCount}</span>
        </div>
        <div class="tree-children ${open ? "tree-children--open" : ""}">
          ${tier.resources.map(r => `
            <div class="tree-leaf ${state.activeTier === tid && state.activeResource === r.id ? "tree-leaf--active" : ""}"
                 data-tier="${escHtml(tid)}" data-resource="${escHtml(r.id)}">
              <span>${escHtml(r.label)}</span>
              <span class="tree-leaf-count">${state.recordCounts[r.table] ?? "—"}</span>
            </div>
          `).join("")}
        </div>
      </div>`;
  }).join("");
}

function renderCountsBox() {
  const box = qs("#countsBox"); if (!box) return;
  if (!state.selectedSiteId) {
    box.innerHTML = `<strong>${state.sites.length} sites</strong><span>Select one to see counts.</span>`;
    return;
  }
  const site = state.sites.find(p => p.public_id === state.selectedSiteId);
  const totals = Object.entries(state.recordCounts)
    .filter(([_, n]) => typeof n === "number" && n > 0)
    .map(([id, n]) => `${id}: ${n}`)
    .join(" · ");
  box.innerHTML = `<strong>${escHtml(site?.name || "Site")}</strong><span>${totals || "Empty substrate — start with a brief."}</span>`;
}

// ── Tier tabs (library mode) ──────────────────────────────────────────────
function renderTierTabs() {
  const tiers = getApplicableTiers();
  qsa(".lib-tab").forEach(btn => {
    const tier = btn.dataset.tier;
    const visible = tiers.includes(tier);
    btn.classList.toggle("lib-tab--hidden", !visible);
    btn.classList.toggle("lib-tab--active", state.activeTier === tier);
  });
  if (!tiers.includes(state.activeTier)) state.activeTier = tiers[0] || "foundation";
  renderResourceSelect();
}

function switchTier(tier) {
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
    tier.resources.map(r => {
      const cnt = state.recordCounts[r.table];
      const cntStr = typeof cnt === "number" ? ` (${cnt})` : "";
      return `<option value="${escHtml(r.id)}" ${state.activeResource === r.id ? "selected" : ""}>${escHtml(r.label)}${cntStr}</option>`;
    }).join("");
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
  if (res.scopeKey === "site_public_id" && state.selectedSiteId) {
    url += `?site_public_id=${encodeURIComponent(state.selectedSiteId)}`;
  }
  // Resources scoped by parent_id (component_public_id, layout_public_id, page_public_id, content_model_public_id)
  // load all rows for now; future: prompt user to pick a parent record.
  const r = await api(url);
  if (!r.ok) { showToast(`Load ${res.label} failed: ${r.status}`, "warn"); return; }
  state.records = Array.isArray(r.body) ? r.body : [];
  renderRecordList();
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
    const title = r.name || r.title || r.label || r.path || r.domain || r.public_id;
    const subtitle = r.summary || r.description || r.purpose || r.kind || r.status || r.scope_code || r.metric_name || "";
    const isActive = state.activeRecord?.public_id === r.public_id;
    return `<button class="record-card ${isActive ? "record-card--active" : ""}" type="button" data-record-id="${escHtml(r.public_id)}">
      <div class="record-card-title">${escHtml(title)}</div>
      <div class="record-card-meta"><span>${escHtml((subtitle || "").slice(0, 80))}</span></div>
    </button>`;
  }).join("");
}

// ── Record editor ─────────────────────────────────────────────────────────
function openRecordEditor(record, isNew = false) {
  state.activeRecord = record;
  const tier = TIERS[state.activeTier];
  const res = tier?.resources.find(r => r.id === state.activeResource);
  if (!res) return;
  const fields = RESOURCE_FIELDS[state.activeResource] || [];
  qs("#recordEditorEyebrow").textContent = res.label;
  qs("#recordEditorTitle").textContent = isNew ? `New ${res.label.replace(/s$/,"").toLowerCase()}` : (record?.name || record?.title || record?.label || "—");
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
    return `<label class="inline-field">${label}<input class="input" id="${id}" type="number" step="any" value="${escHtml(v ?? "")}" /></label>`;
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
  if (res.scopeKey === "site_public_id" && state.selectedSiteId) {
    payload.site_public_id = state.selectedSiteId;
  }
  for (const f of fields) {
    const el = qs(`#f_${f.name}`); if (!el) continue;
    let val;
    if (f.type === "checkbox") val = el.checked;
    else if (f.type === "number") val = el.value === "" ? null : Number(el.value);
    else if (f.type === "textarea") {
      val = el.value;
      const trimmed = val.trim();
      // Try to parse JSON when content looks like an array or object
      if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        try { val = JSON.parse(trimmed); } catch {}
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
  await refreshCountsAndStatus();
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
  await refreshCountsAndStatus();
}

// Re-fetch overview to refresh row_counts + scope_status (without reloading sessions etc.)
async function refreshCountsAndStatus() {
  if (!state.selectedSiteId) return;
  const ovR = await api(`/api/webcore/overview?site_public_id=${encodeURIComponent(state.selectedSiteId)}`);
  if (!ovR.ok || !ovR.body || ovR.body.scope !== "site") return;
  const rc = ovR.body.row_counts || {};
  state.recordCounts = {};
  for (const [tbl, n] of Object.entries(rc)) {
    state.recordCounts[tbl.replace(/^webcore_/, "")] = n;
  }
  state.pipelineScopeStatus = {};
  for (const s of (ovR.body.scope_status || [])) state.pipelineScopeStatus[s.scope_code] = s;
  renderLibraryTree();
  renderCountsBox();
  renderResourceSelect();
  renderPipelineCards();
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE LAUNCHER
// ═══════════════════════════════════════════════════════════════════════════
async function loadPipelinesForSite() {
  // Pipelines are global (no site_public_id filter on the templates themselves)
  const r = await api(`/api/webcore/pipelines?status=active`);
  state.pipelines = r.ok && Array.isArray(r.body) ? r.body : [];
}

async function loadRecentRunsForSite() {
  if (!state.selectedSiteId) {
    state.recentRuns = [];
    renderRunList();
    return;
  }
  const r = await api(`/api/webcore/pipeline-runs?site_public_id=${encodeURIComponent(state.selectedSiteId)}`);
  state.recentRuns = r.ok && Array.isArray(r.body) ? r.body.slice(0, 8) : [];
  renderRunList();
}

function renderRunList() {
  const el = qs("#runList"); if (!el) return;
  if (!state.recentRuns.length) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">No runs yet.</div>`;
    return;
  }
  el.innerHTML = state.recentRuns.map(r => `
    <div class="run-item">
      <div class="run-item-title">${escHtml(r.run_label || r.public_id)}</div>
      <div class="run-item-meta">
        <span>${escHtml(r.status || "?")}</span>
        <span>${escHtml((r.current_stage_index ?? "?") + " / " + (r.total_stages ?? "?"))} stages</span>
      </div>
    </div>`).join("");
}

function pipelineStatusForScope(scope) {
  // Prefer the cached pipeline_scope_status row from overview
  const cached = state.pipelineScopeStatus[scope.scope_code];
  if (cached && cached.status) {
    const kind = cached.status;   // "empty" | "partial" | "populated"
    return { kind, label: kind.charAt(0).toUpperCase() + kind.slice(1) };
  }
  return { kind: "empty", label: "Empty" };
}

function renderPipelineCards() {
  const el = qs("#pipelineCards"); if (!el) return;
  if (!state.selectedSiteId) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">Select a site.</div>`;
    return;
  }
  const visibleScopes = PIPELINE_SCOPES.filter(s => {
    if (!s.requires) return true;
    if (s.requires === "content") return siteHasContentCategory();
    if (s.requires === "backend") return siteHasBackendCategory();
    return true;
  });

  if (!visibleScopes.length) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">No applicable pipelines for this site's categories.</div>`;
    return;
  }

  el.innerHTML = visibleScopes.map(scope => {
    const matching = state.pipelines.filter(p => p.scope_code === scope.scope_code);
    const status = pipelineStatusForScope(scope);
    const launchableId = matching.find(m => m.is_default_for_scope)?.public_id || matching[0]?.public_id || "";
    const select = matching.length > 1
      ? `<select class="select" data-scope-launch="${escHtml(scope.id)}">
          ${matching.map(m => `<option value="${escHtml(m.public_id)}" ${m.public_id === launchableId ? "selected" : ""}>${escHtml(m.name || m.public_id)} · ${escHtml(m.version || "")}</option>`).join("")}
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
  if (!state.selectedSiteId) { showToast("Select a site first", "warn"); return; }
  const payload = {
    pipeline_public_id: pipelineId,
    site_public_id: state.selectedSiteId,
    status: "queued",
    triggered_by: "operator",
    run_label: `${scope.title} · ${new Date().toLocaleString()}`,
  };
  const r = await api("/api/webcore/pipeline-runs", { method: "POST", body: payload });
  if (!r.ok) { showToast(`Launch failed: ${r.status}`, "warn"); return; }
  showToast(`Queued: ${scope.title}`, "good");
  // Recompute scope status (treat as if the run already populated rows; the pipeline executor
  // is out of scope but if rows exist from a previous run the status will reflect them)
  await api("/api/webcore/compute-scope-status", {
    method: "POST",
    body: { site_public_id: state.selectedSiteId, scope_code: scope.scope_code },
  });
  await loadRecentRunsForSite();
  await refreshCountsAndStatus();
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPLOY MINI-CARD (right rail)
// ═══════════════════════════════════════════════════════════════════════════
function renderDeployMini() {
  const el = qs("#deployMini"); if (!el) return;
  if (!state.selectedSiteId) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">Select a site to view deploy state.</div>`;
    return;
  }
  const site = state.sites.find(s => s.public_id === state.selectedSiteId);
  // Latest deployment for the selected site
  const siteDeploys = state.deployments.filter(d => !d.site_public_id || d.site_public_id === state.selectedSiteId);
  const latest = siteDeploys[0] || null;

  const targetLabel = latest ? (latest.deploy_target || "—") : "—";
  const url = latest?.target_url || site?.primary_domain || "—";
  const branch = latest?.branch || "—";
  const status = latest?.status || "—";
  const statusKind = ["queued","running","live","failed","rolled_back"].includes(status) ? status : "queued";
  const lastDeployTime = latest?.completed_at || latest?.queued_at || null;
  const lastDeployHuman = lastDeployTime ? new Date(lastDeployTime).toLocaleString() : "—";

  el.innerHTML = `
    <div class="deploy-row"><span class="soft">Target</span><strong>${escHtml(targetLabel)}</strong></div>
    <div class="deploy-row"><span class="soft">URL</span><strong>${escHtml(url)}</strong></div>
    <div class="deploy-row"><span class="soft">Branch</span><strong>${escHtml(branch)}</strong></div>
    <div class="deploy-row"><span class="soft">Status</span><span class="deploy-status-pill deploy-status-pill--${escHtml(statusKind)}">${escHtml(status)}</span></div>
    <div class="deploy-row"><span class="soft">Last deploy</span><strong>${escHtml(lastDeployHuman)}</strong></div>
    <div class="deploy-actions">
      <button class="button button--small button--primary" id="deployNowBtn" type="button">Deploy now</button>
      <button class="button button--small" id="viewDeployConfigBtn" type="button">View config</button>
    </div>
  `;
  qs("#deployNowBtn")?.addEventListener("click", quickDeployNow);
  qs("#viewDeployConfigBtn")?.addEventListener("click", () => {
    if (state.uiMode !== "library") toggleMode();
    state.activeTier = "deploy";
    state.activeResource = "deploy-configs";
    renderTierTabs();
    renderResourceSelect();
    loadResourceRecords();
  });
}

async function quickDeployNow() {
  if (!state.selectedSiteId) { showToast("Select a site first", "warn"); return; }
  // Find the primary deploy_config for this site to learn the target.
  const r = await api(`/api/webcore/deploy-configs?site_public_id=${encodeURIComponent(state.selectedSiteId)}`);
  if (!r.ok) { showToast("Could not load deploy configs", "warn"); return; }
  const configs = Array.isArray(r.body) ? r.body : [];
  const primary = configs.find(c => c.is_primary) || configs[0];
  if (!primary) {
    showToast("No deploy config — open Library → Deploy → Deploy configs", "warn");
    return;
  }
  const payload = {
    site_public_id: state.selectedSiteId,
    deploy_target: primary.deploy_target,
    label: `Deploy now · ${new Date().toLocaleString()}`,
    branch: "main",
    status: "queued",
  };
  const dr = await api("/api/webcore/deployments", { method: "POST", body: payload });
  if (!dr.ok) { showToast(`Queue deploy failed: ${dr.status}`, "warn"); return; }
  showToast(`Deploy queued · ${primary.deploy_target}`, "good");
  await loadAllFoundation();
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
// DRAG RESIZE
// ═══════════════════════════════════════════════════════════════════════════
function initDragResize() {
  const handle = qs("#chatResizeHandle");
  const feed = qs("#chatFeed");
  if (!handle || !feed) return;
  const KEY = "webcore_chat_height";
  const saved = parseInt(localStorage.getItem(KEY));
  if (saved > 80 && saved < 900) { feed.style.minHeight = saved + "px"; feed.style.maxHeight = saved + "px"; }
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener("mousedown", e => { dragging = true; startY = e.clientY; startH = feed.getBoundingClientRect().height; document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none"; e.preventDefault(); });
  document.addEventListener("mousemove", e => { if (!dragging) return; const h = Math.max(120, Math.min(900, startH + (e.clientY - startY))); feed.style.minHeight = h + "px"; feed.style.maxHeight = h + "px"; });
  document.addEventListener("mouseup", () => { if (!dragging) return; dragging = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; localStorage.setItem(KEY, Math.round(feed.getBoundingClientRect().height)); });
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════════════════════════════
function bindEvents() {
  // Header
  qs("#refreshBtn")?.addEventListener("click", loadAllFoundation);
  qs("#modeToggleBtn")?.addEventListener("click", toggleMode);

  // Sessions
  qs("#freeChatBtn")?.addEventListener("click", () => selectSession(FREE_SESSION_ID, true));
  qs("#sessionList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-session-id]");
    if (btn) selectSession(btn.dataset.sessionId, false);
  });
  qs("#newSessionBtn")?.addEventListener("click", createNewSession);

  // Workspace / site / deployment selectors
  qs("#workspaceSelect")?.addEventListener("change", e => selectWorkspace(e.target.value));
  qs("#siteSelect")?.addEventListener("change", e => selectSite(e.target.value));
  qs("#deploymentSelect")?.addEventListener("change", e => selectDeployment(e.target.value));

  qs("#newWorkspaceBtn")?.addEventListener("click", () => { qs("#newWorkspaceForm").style.display = "block"; });
  qs("#cancelWorkspaceBtn")?.addEventListener("click", () => { qs("#newWorkspaceForm").style.display = "none"; });
  qs("#saveWorkspaceBtn")?.addEventListener("click", createWorkspace);

  qs("#newSiteBtn")?.addEventListener("click", () => {
    if (!state.selectedWorkspaceId) { showToast("Select a workspace first", "warn"); return; }
    qs("#newSiteForm").style.display = "block";
  });
  qs("#cancelSiteBtn")?.addEventListener("click", () => { qs("#newSiteForm").style.display = "none"; });
  qs("#saveSiteBtn")?.addEventListener("click", createSite);

  qs("#newDeploymentBtn")?.addEventListener("click", () => {
    if (!state.selectedSiteId) { showToast("Select a site first", "warn"); return; }
    qs("#newDeploymentForm").style.display = "block";
  });
  qs("#cancelDeploymentBtn")?.addEventListener("click", () => { qs("#newDeploymentForm").style.display = "none"; });
  qs("#saveDeploymentBtn")?.addEventListener("click", createDeployment);

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

  // Chat
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
  loadAllFoundation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
