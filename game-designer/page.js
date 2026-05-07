// ═══════════════════════════════════════════════════════════════════════════
// GameCore Designer — page.js
// ═══════════════════════════════════════════════════════════════════════════

const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");
const FREE_SESSION_ID = "chat-gamecore-01";
const SURFACE = "gamecore";

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
  universes: [], projects: [], builds: [], categories: [],
  selectedUniverseId: null,
  selectedProjectId: null,
  selectedBuildId: null,
  projectCategories: [],       // categories attached to selected project

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
  recordCounts: {},            // table_name → count

  // Pipelines
  pipelines: [],               // gamecore_pipelines rows (templates)
  recentRuns: [],

  // Library tree open state
  treeOpen: { foundation: true, entities: false, arpg: false, td: false, cb: false, bridges: false },
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
      { id: "pillars",       label: "Design pillars",  endpoint: "/api/gamecore/pillars",        scopeKey: "project_public_id", table: "gamecore_design_pillars" },
      { id: "fantasies",     label: "Player fantasies",endpoint: "/api/gamecore/fantasies",      scopeKey: "project_public_id", table: "gamecore_player_fantasies" },
      { id: "pacing-curves", label: "Pacing curves",   endpoint: "/api/gamecore/pacing-curves",  scopeKey: "project_public_id", table: "gamecore_pacing_curves" },
      { id: "decisions",     label: "Design decisions",endpoint: "/api/gamecore/decisions",      scopeKey: "project_public_id", table: "gamecore_design_decisions" },
      { id: "scopes",        label: "Scopes",          endpoint: "/api/gamecore/scopes",         scopeKey: "project_public_id", table: "gamecore_scopes" },
      { id: "notes",         label: "Notes",           endpoint: "/api/gamecore/notes",          scopeKey: "project_public_id", table: "gamecore_notes" },
    ],
  },
  entities: {
    label: "Entities",
    resources: [
      { id: "entities",  label: "Entities",  endpoint: "/api/gamecore/entities",  scopeKey: "project_public_id", table: "gamecore_entities" },
      { id: "locations", label: "Locations", endpoint: "/api/gamecore/locations", scopeKey: "project_public_id", table: "gamecore_locations" },
      { id: "items",     label: "Items",     endpoint: "/api/gamecore/items",     scopeKey: "project_public_id", table: "gamecore_items" },
      { id: "assets",    label: "Assets",    endpoint: "/api/gamecore/assets",    scopeKey: "project_public_id", table: "gamecore_assets" },
      { id: "scripts",   label: "Scripts",   endpoint: "/api/gamecore/scripts",   scopeKey: "project_public_id", table: "gamecore_scripts" },
      { id: "playtests", label: "Playtests", endpoint: "/api/gamecore/playtests", scopeKey: "project_public_id", table: "gamecore_playtests" },
    ],
  },
  arpg: {
    label: "ARPG",
    requires: "action_rpg",
    resources: [
      { id: "soulbinds",         label: "Soulbinds",         endpoint: "/api/gamecore/arpg/soulbinds",         scopeKey: "project_public_id", table: "gamecore_arpg_soulbinds" },
      { id: "forms",             label: "Forms",             endpoint: "/api/gamecore/arpg/forms",             scopeKey: "project_public_id", table: "gamecore_arpg_forms" },
      { id: "form-kits",         label: "Form kits",         endpoint: "/api/gamecore/arpg/form-kits",         scopeKey: "project_public_id", table: "gamecore_arpg_form_kits" },
      { id: "kit-abilities",     label: "Kit abilities",     endpoint: "/api/gamecore/arpg/kit-abilities",     scopeKey: "kit_public_id",     table: "gamecore_arpg_form_kit_abilities" },
      { id: "combat-moves",      label: "Combat moves",      endpoint: "/api/gamecore/arpg/combat-moves",      scopeKey: "project_public_id", table: "gamecore_arpg_combat_moves" },
      { id: "dungeons",          label: "Dungeons",          endpoint: "/api/gamecore/arpg/dungeons",          scopeKey: "project_public_id", table: "gamecore_arpg_dungeons" },
      { id: "dungeon-zones",     label: "Dungeon zones",     endpoint: "/api/gamecore/arpg/dungeon-zones",     scopeKey: "dungeon_public_id", table: "gamecore_arpg_dungeon_zones" },
      { id: "encounters",        label: "Encounters",        endpoint: "/api/gamecore/arpg/encounters",        scopeKey: "project_public_id", table: "gamecore_arpg_encounters" },
      { id: "enemies",           label: "Enemies",           endpoint: "/api/gamecore/arpg/enemies",           scopeKey: "project_public_id", table: "gamecore_arpg_enemies" },
      { id: "enemy-behaviors",   label: "Enemy behaviors",   endpoint: "/api/gamecore/arpg/enemy-behaviors",   scopeKey: "project_public_id", table: "gamecore_arpg_enemy_behaviors" },
      { id: "loot-tables",       label: "Loot tables",       endpoint: "/api/gamecore/arpg/loot-tables",       scopeKey: "project_public_id", table: "gamecore_arpg_loot_tables" },
      { id: "loot-drops",        label: "Loot drops",        endpoint: "/api/gamecore/arpg/loot-drops",        scopeKey: "project_public_id", table: "gamecore_arpg_loot_drops" },
      { id: "progression-curves",label: "Progression curves",endpoint: "/api/gamecore/arpg/progression-curves",scopeKey: "project_public_id", table: "gamecore_arpg_progression_curves" },
      { id: "transformation-events", label: "Transformations", endpoint: "/api/gamecore/arpg/transformation-events", scopeKey: "project_public_id", table: "gamecore_arpg_transformation_events" },
      { id: "player-builds",     label: "Player builds",     endpoint: "/api/gamecore/arpg/player-builds",     scopeKey: "project_public_id", table: "gamecore_arpg_player_builds" },
    ],
  },
  td: {
    label: "TD",
    requires: "tower_defense",
    resources: [
      { id: "maps",                label: "Maps",                endpoint: "/api/gamecore/td/maps",                scopeKey: "project_public_id", table: "gamecore_td_maps" },
      { id: "map-tiles",           label: "Map tiles",           endpoint: "/api/gamecore/td/map-tiles",           scopeKey: "map_public_id",     table: "gamecore_td_map_tiles" },
      { id: "tower-families",      label: "Tower families",      endpoint: "/api/gamecore/td/tower-families",      scopeKey: "project_public_id", table: "gamecore_td_tower_families" },
      { id: "tower-tiers",         label: "Tower tiers",         endpoint: "/api/gamecore/td/tower-tiers",         scopeKey: "family_public_id", table: "gamecore_td_tower_tiers" },
      { id: "tower-specs",         label: "Tower specs",         endpoint: "/api/gamecore/td/tower-specs",         scopeKey: "family_public_id", table: "gamecore_td_tower_specializations" },
      { id: "tower-spec-levels",   label: "Tower spec levels",   endpoint: "/api/gamecore/td/tower-spec-levels",   scopeKey: "specialization_public_id", table: "gamecore_td_tower_spec_levels" },
      { id: "synergy-patterns",    label: "Synergy patterns",    endpoint: "/api/gamecore/td/synergy-patterns",    scopeKey: "project_public_id", table: "gamecore_td_synergy_patterns" },
      { id: "synergy-effects",     label: "Synergy effects",     endpoint: "/api/gamecore/td/synergy-effects",     scopeKey: "pattern_public_id", table: "gamecore_td_synergy_effects" },
      { id: "enemy-types",         label: "Enemy types",         endpoint: "/api/gamecore/td/enemy-types",         scopeKey: "project_public_id", table: "gamecore_td_enemy_types" },
      { id: "enemy-traits",        label: "Enemy traits",        endpoint: "/api/gamecore/td/enemy-traits",        scopeKey: "project_public_id", table: "gamecore_td_enemy_traits" },
      { id: "waves",               label: "Waves",               endpoint: "/api/gamecore/td/waves",               scopeKey: "map_public_id",     table: "gamecore_td_waves" },
      { id: "counter-rotations",   label: "Counter rotations",   endpoint: "/api/gamecore/td/counter-rotations",   scopeKey: "map_public_id",     table: "gamecore_td_counter_rotations" },
      { id: "pvp-lobbies",         label: "PvP lobbies",         endpoint: "/api/gamecore/td/pvp-lobbies",         scopeKey: "project_public_id", table: "gamecore_td_pvp_lobbies" },
      { id: "pvp-send-units",      label: "PvP send units",      endpoint: "/api/gamecore/td/pvp-send-units",      scopeKey: "project_public_id", table: "gamecore_td_pvp_send_units" },
    ],
  },
  cb: {
    label: "CB",
    requires: "city_builder",
    resources: [
      { id: "regions",                label: "Regions",                endpoint: "/api/gamecore/cb/regions",                scopeKey: "project_public_id", table: "gamecore_cb_regions" },
      { id: "buildings",              label: "Buildings",              endpoint: "/api/gamecore/cb/buildings",              scopeKey: "project_public_id", table: "gamecore_cb_buildings" },
      { id: "resources",              label: "Resources",              endpoint: "/api/gamecore/cb/resources",              scopeKey: "project_public_id", table: "gamecore_cb_resources" },
      { id: "production-chains",      label: "Production chains",      endpoint: "/api/gamecore/cb/production-chains",      scopeKey: "project_public_id", table: "gamecore_cb_production_chains" },
      { id: "economy-curves",         label: "Economy curves",         endpoint: "/api/gamecore/cb/economy-curves",         scopeKey: "project_public_id", table: "gamecore_cb_economy_curves" },
      { id: "civic-systems",          label: "Civic systems",          endpoint: "/api/gamecore/cb/civic-systems",          scopeKey: "project_public_id", table: "gamecore_cb_civic_systems" },
      { id: "unlock-trees",           label: "Unlock trees",           endpoint: "/api/gamecore/cb/unlock-trees",           scopeKey: "project_public_id", table: "gamecore_cb_unlock_trees" },
      { id: "citizens",               label: "Citizens",               endpoint: "/api/gamecore/cb/citizens",               scopeKey: "project_public_id", table: "gamecore_cb_citizens" },
      { id: "citizen-schedules",      label: "Citizen schedules",      endpoint: "/api/gamecore/cb/citizen-schedules",      scopeKey: "citizen_public_id",table: "gamecore_cb_citizen_schedules" },
      { id: "seasons-events",         label: "Seasons / events",       endpoint: "/api/gamecore/cb/seasons-events",         scopeKey: "project_public_id", table: "gamecore_cb_seasons_events" },
      { id: "construction-jobs",      label: "Construction jobs",      endpoint: "/api/gamecore/cb/construction-jobs",      scopeKey: "project_public_id", table: "gamecore_cb_construction_jobs" },
      { id: "active-player-actions",  label: "Active player actions",  endpoint: "/api/gamecore/cb/active-player-actions",  scopeKey: "project_public_id", table: "gamecore_cb_active_player_actions" },
    ],
  },
  bridges: {
    label: "Bridges",
    requires: "multi",   // only show when project has 2+ categories
    resources: [
      { id: "category-links",      label: "Category links",      endpoint: "/api/gamecore/category-links",      scopeKey: "project_public_id", table: "gamecore_category_links" },
      { id: "hybrid-raid-yields",  label: "Hybrid raid yields",  endpoint: "/api/gamecore/hybrid-raid-yields",  scopeKey: "project_public_id", table: "gamecore_hybrid_raid_yields" },
      { id: "hybrid-unlocks",      label: "Hybrid unlocks",      endpoint: "/api/gamecore/hybrid-unlocks",      scopeKey: "project_public_id", table: "gamecore_hybrid_unlocks" },
    ],
  },
};

// Field schemas per resource — minimum useful set; rest stays in JSON `meta`
const RESOURCE_FIELDS = {
  // foundation
  pillars: [
    { name: "name", type: "input", label: "Name" },
    { name: "pillar_order", type: "number", label: "Order" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "rationale", type: "textarea", label: "Rationale" },
    { name: "anti_patterns", type: "textarea", label: "Anti-patterns" },
  ],
  fantasies: [
    { name: "name", type: "input", label: "Name" },
    { name: "first_person_statement", type: "input", label: "First-person ('I want to…')" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "target_emotion", type: "input", label: "Target emotion" },
    { name: "delivery_systems", type: "input", label: "Delivery systems (CSV)" },
    { name: "validation_criteria", type: "textarea", label: "Validation criteria" },
  ],
  "pacing-curves": [
    { name: "name", type: "input", label: "Name" },
    { name: "curve_kind", type: "select", label: "Curve kind",
      options: ["intensity","challenge","novelty","tension","reward_density","cognitive_load"] },
    { name: "x_axis_label", type: "input", label: "X axis label" },
    { name: "y_axis_label", type: "input", label: "Y axis label" },
    { name: "y_axis_min", type: "number", label: "Y min" },
    { name: "y_axis_max", type: "number", label: "Y max" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "points", type: "textarea", label: "Points (JSON array)" },
  ],
  decisions: [
    { name: "title", type: "input", label: "Title" },
    { name: "context", type: "textarea", label: "Context" },
    { name: "decision", type: "textarea", label: "Decision" },
    { name: "rationale", type: "textarea", label: "Rationale" },
    { name: "decision_status", type: "select", label: "Status", options: ["active","superseded","reversed","draft"] },
  ],
  scopes: [
    { name: "name", type: "input", label: "Name" },
    { name: "scope_kind", type: "select", label: "Scope kind", options: ["general","data","execution","review","external"] },
    { name: "description", type: "textarea", label: "Description" },
  ],
  notes: [
    { name: "title", type: "input", label: "Title" },
    { name: "content", type: "textarea", label: "Content" },
    { name: "note_kind", type: "select", label: "Kind", options: ["general","todo","question","reference","postmortem"] },
    { name: "pinned", type: "checkbox", label: "Pinned" },
  ],
  // entities
  entities: [
    { name: "name", type: "input", label: "Name" },
    { name: "entity_kind", type: "select", label: "Kind", options: ["character","npc","creature","faction","group","abstract"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "canon_status", type: "select", label: "Canon", options: ["canonical","draft","deprecated"] },
  ],
  locations: [
    { name: "name", type: "input", label: "Name" },
    { name: "location_kind", type: "select", label: "Kind", options: ["settlement","wilderness","dungeon","region","landmark","interior","abstract"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
  ],
  items: [
    { name: "name", type: "input", label: "Name" },
    { name: "item_kind", type: "select", label: "Kind", options: ["weapon","armor","consumable","quest","key","artifact","material","misc"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
  ],
  assets: [
    { name: "name", type: "input", label: "Name" },
    { name: "asset_kind", type: "select", label: "Kind", options: ["image","model_3d","animation","audio_sfx","audio_music","texture","video","prompt","spec"] },
    { name: "asset_status", type: "select", label: "Status", options: ["placeholder","prompt_written","generated","in_review","approved","needs_revision"] },
    { name: "file_path", type: "input", label: "File path" },
    { name: "prompt_text", type: "textarea", label: "Prompt" },
  ],
  scripts: [
    { name: "name", type: "input", label: "Name" },
    { name: "script_kind", type: "select", label: "Kind", options: ["dialogue","quest","event","cutscene","behavior_tree","trigger","ui_logic","gameplay_logic"] },
    { name: "script_status", type: "select", label: "Status", options: ["draft","reviewed","approved","deprecated"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "content", type: "textarea", label: "Content" },
  ],
  playtests: [
    { name: "title", type: "input", label: "Title" },
    { name: "session_kind", type: "select", label: "Kind", options: ["internal","focus_group","public_alpha","public_beta","ai_simulated"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "findings", type: "textarea", label: "Findings" },
  ],
  // arpg
  soulbinds: [
    { name: "name", type: "input", label: "Name" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "is_unlocked_by_default", type: "checkbox", label: "Unlocked by default" },
  ],
  forms: [
    { name: "name", type: "input", label: "Name" },
    { name: "form_index", type: "number", label: "Order" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "form-kits": [
    { name: "name", type: "input", label: "Name" },
    { name: "soulbind_public_id", type: "input", label: "Soulbind ID" },
    { name: "form_public_id", type: "input", label: "Form ID" },
    { name: "primary_role", type: "select", label: "Primary role", options: ["damage","tank","support","control","mobility","utility"] },
    { name: "ability_slot_count", type: "number", label: "Ability slots" },
    { name: "design_status", type: "select", label: "Status", options: ["concept","balancing","approved","deprecated"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "kit-abilities": [
    { name: "name", type: "input", label: "Name" },
    { name: "kit_public_id", type: "input", label: "Kit ID" },
    { name: "slot_index", type: "number", label: "Slot" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
    { name: "design_status", type: "select", label: "Status", options: ["concept","balancing","approved","deprecated"] },
  ],
  "combat-moves": [
    { name: "name", type: "input", label: "Name" },
    { name: "move_kind", type: "select", label: "Kind", options: ["light","heavy","special","finisher","dodge","block","parry","counter"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
  ],
  dungeons: [
    { name: "name", type: "input", label: "Name" },
    { name: "dungeon_kind", type: "select", label: "Kind", options: ["story","side","raid","challenge","tutorial","procedural"] },
    { name: "is_raid_expedition", type: "checkbox", label: "Raid expedition (ARPG↔CB hybrid)" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
  ],
  "dungeon-zones": [
    { name: "name", type: "input", label: "Name" },
    { name: "dungeon_public_id", type: "input", label: "Dungeon ID" },
    { name: "zone_index", type: "number", label: "Order" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  encounters: [
    { name: "name", type: "input", label: "Name" },
    { name: "encounter_kind", type: "select", label: "Kind", options: ["trash","mini_boss","boss","ambush","puzzle","environmental","scripted"] },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "description", type: "textarea", label: "Description" },
  ],
  enemies: [
    { name: "name", type: "input", label: "Name" },
    { name: "enemy_kind", type: "select", label: "Kind", options: ["minion","elite","champion","mini_boss","boss","ambient"] },
    { name: "enemy_archetype", type: "input", label: "Archetype" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "enemy-behaviors": [
    { name: "name", type: "input", label: "Name" },
    { name: "behavior_archetype", type: "select", label: "Archetype", options: ["aggressive","defensive","ranged","caster","tank","kiter","swarm","ambusher"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "loot-tables": [
    { name: "name", type: "input", label: "Name" },
    { name: "table_kind", type: "select", label: "Kind", options: ["enemy","boss","chest","quest","crafting","random_event"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "loot-drops": [
    { name: "name", type: "input", label: "Name" },
    { name: "rarity", type: "select", label: "Rarity", options: ["common","uncommon","rare","epic","legendary","mythic","unique"] },
    { name: "slot", type: "select", label: "Slot", options: ["weapon","helm","chest","gloves","boots","ring","amulet","trinket","offhand"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "progression-curves": [
    { name: "name", type: "input", label: "Name" },
    { name: "curve_kind", type: "select", label: "Kind", options: ["xp","damage","health","resource","loot_quality","ability_unlock"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "transformation-events": [
    { name: "name", type: "input", label: "Name" },
    { name: "event_kind", type: "select", label: "Kind", options: ["form_unlock","kit_unlock","soulbind_swap","ability_evolution","milestone"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "player-builds": [
    { name: "name", type: "input", label: "Name" },
    { name: "soulbind_public_id", type: "input", label: "Soulbind ID" },
    { name: "is_recommended_starter", type: "checkbox", label: "Recommended starter" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  // td
  maps: [
    { name: "name", type: "input", label: "Name" },
    { name: "map_kind", type: "select", label: "Kind", options: ["fixed_path","open_anchor","branching","dynamic","pvp"] },
    { name: "starting_currency", type: "number", label: "Starting currency" },
    { name: "starting_lives", type: "number", label: "Starting lives" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "anchor_visit_order", type: "textarea", label: "Anchor visit order (JSON array)" },
  ],
  "map-tiles": [
    { name: "map_public_id", type: "input", label: "Map ID" },
    { name: "grid_x", type: "number", label: "Grid X" },
    { name: "grid_y", type: "number", label: "Grid Y" },
    { name: "tile_kind", type: "select", label: "Kind", options: ["path","buildable","blocked","anchor","spawn","goal","decorative"] },
  ],
  "tower-families": [
    { name: "name", type: "input", label: "Name" },
    { name: "family_kind", type: "select", label: "Kind", options: ["physical","elemental","status","support","economy","aerial_only","anti_air"] },
    { name: "has_specialization_fork", type: "checkbox", label: "Has spec fork" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "tower-tiers": [
    { name: "family_public_id", type: "input", label: "Family ID" },
    { name: "tier_level", type: "number", label: "Tier level" },
    { name: "name", type: "input", label: "Tier name" },
  ],
  "tower-specs": [
    { name: "family_public_id", type: "input", label: "Family ID" },
    { name: "name", type: "input", label: "Spec name" },
    { name: "fork_index", type: "number", label: "Fork index" },
    { name: "spec_kind", type: "select", label: "Kind", options: ["damage","control","support","economy","hybrid"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "tower-spec-levels": [
    { name: "specialization_public_id", type: "input", label: "Spec ID" },
    { name: "spec_level", type: "number", label: "Level" },
    { name: "name", type: "input", label: "Level name" },
  ],
  "synergy-patterns": [
    { name: "name", type: "input", label: "Name" },
    { name: "pattern_kind", type: "select", label: "Kind", options: ["shape","family_combo","tier_combo","element_combo","positional","temporal"] },
    { name: "is_hidden", type: "checkbox", label: "Hidden until discovered" },
    { name: "summary", type: "textarea", label: "Summary" },
    { name: "pattern_offsets", type: "textarea", label: "Pattern offsets (JSON)" },
  ],
  "synergy-effects": [
    { name: "pattern_public_id", type: "input", label: "Pattern ID" },
    { name: "effect_kind", type: "select", label: "Kind", options: ["damage_multiplier","range_buff","speed_buff","status_proc","resource_yield","unlock"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "enemy-types": [
    { name: "name", type: "input", label: "Name" },
    { name: "enemy_class", type: "select", label: "Class", options: ["ground","aerial","burrowing","amphibious","stealth","construct"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "enemy-traits": [
    { name: "trait_key", type: "input", label: "Trait key" },
    { name: "name", type: "input", label: "Display name" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  waves: [
    { name: "map_public_id", type: "input", label: "Map ID" },
    { name: "wave_number", type: "number", label: "Wave #" },
    { name: "wave_kind", type: "select", label: "Kind", options: ["normal","boss","mini_boss","swarm","mixed"] },
    { name: "is_anti_air_wave", type: "checkbox", label: "Anti-air wave (2× bounty)" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "counter-rotations": [
    { name: "map_public_id", type: "input", label: "Map ID" },
    { name: "rotation_index", type: "number", label: "Rotation #" },
    { name: "name", type: "input", label: "Name" },
  ],
  "pvp-lobbies": [
    { name: "name", type: "input", label: "Name" },
    { name: "match_status", type: "select", label: "Status", options: ["waiting","matched","in_progress","completed","abandoned"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "pvp-send-units": [
    { name: "name", type: "input", label: "Name" },
    { name: "tier", type: "number", label: "Tier" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  // cb
  regions: [
    { name: "name", type: "input", label: "Name" },
    { name: "region_kind", type: "select", label: "Kind", options: ["starter","frontier","mountain","coastal","forest","desert","arctic","contested"] },
    { name: "starting_population", type: "number", label: "Starting pop." },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  buildings: [
    { name: "name", type: "input", label: "Name" },
    { name: "building_kind", type: "select", label: "Kind", options: ["residential","production","civic","military","decorative","wonder","infrastructure"] },
    { name: "tier", type: "number", label: "Tier" },
    { name: "player_can_accelerate", type: "checkbox", label: "Player can accelerate" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  resources: [
    { name: "name", type: "input", label: "Name" },
    { name: "resource_kind", type: "select", label: "Kind", options: ["raw","intermediate","luxury","strategic","abstract","raid_only"] },
    { name: "resource_tier", type: "number", label: "Tier" },
    { name: "is_tradeable", type: "checkbox", label: "Tradeable" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "production-chains": [
    { name: "name", type: "input", label: "Name" },
    { name: "building_public_id", type: "input", label: "Building ID" },
    { name: "is_default_recipe", type: "checkbox", label: "Default recipe" },
    { name: "workforce_required", type: "number", label: "Workforce" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "economy-curves": [
    { name: "name", type: "input", label: "Name" },
    { name: "curve_kind", type: "select", label: "Kind", options: ["population_growth","resource_demand","price_elasticity","unlock_pacing"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "civic-systems": [
    { name: "name", type: "input", label: "Name" },
    { name: "system_kind", type: "select", label: "Kind", options: ["happiness","health","education","crime","loyalty","faith","culture"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "unlock-trees": [
    { name: "name", type: "input", label: "Name" },
    { name: "tree_kind", type: "select", label: "Kind", options: ["technology","civic","military","trade","exploration","wonder"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  citizens: [
    { name: "name", type: "input", label: "Name" },
    { name: "archetype_kind", type: "select", label: "Archetype", options: ["worker","artisan","merchant","scholar","soldier","leader","farmer","cleric"] },
    { name: "tier", type: "number", label: "Tier" },
    { name: "is_player_takeover_target", type: "checkbox", label: "Player can take over" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "citizen-schedules": [
    { name: "citizen_public_id", type: "input", label: "Citizen ID" },
    { name: "name", type: "input", label: "Schedule name" },
  ],
  "seasons-events": [
    { name: "name", type: "input", label: "Name" },
    { name: "event_kind", type: "select", label: "Kind", options: ["seasonal","scripted","random","raid","trade","diplomatic","disaster"] },
    { name: "spawns_raid_threat", type: "checkbox", label: "Spawns raid threat" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "construction-jobs": [
    { name: "region_public_id", type: "input", label: "Region ID" },
    { name: "name", type: "input", label: "Job name" },
    { name: "job_status", type: "select", label: "Status", options: ["queued","in_progress","paused","completed","cancelled"] },
    { name: "completed_work_units", type: "number", label: "Work units done" },
    { name: "player_actively_working", type: "checkbox", label: "Player actively working" },
  ],
  "active-player-actions": [
    { name: "region_public_id", type: "input", label: "Region ID" },
    { name: "name", type: "input", label: "Action name" },
    { name: "action_kind", type: "select", label: "Kind", options: ["construction","resource_gather","training","research","raid","quest"] },
  ],
  // bridges
  "category-links": [
    { name: "name", type: "input", label: "Name" },
    { name: "link_kind", type: "select", label: "Kind", options: ["unlock_dep","resource_flow","narrative","balance_link","gating"] },
    { name: "from_table", type: "input", label: "From table" },
    { name: "to_table", type: "input", label: "To table" },
    { name: "weight", type: "number", label: "Weight" },
    { name: "is_active", type: "checkbox", label: "Active" },
  ],
  "hybrid-raid-yields": [
    { name: "name", type: "input", label: "Name" },
    { name: "arpg_dungeon_public_id", type: "input", label: "Dungeon ID (ARPG)" },
    { name: "cb_resource_public_id", type: "input", label: "Resource ID (CB)" },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
  "hybrid-unlocks": [
    { name: "name", type: "input", label: "Name" },
    { name: "unlock_direction", type: "select", label: "Direction", options: ["arpg_to_cb","cb_to_arpg","td_to_cb","cb_to_td","arpg_to_td","td_to_arpg"] },
    { name: "summary", type: "textarea", label: "Summary" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE SCOPES (hardcoded substrate map)
// ═══════════════════════════════════════════════════════════════════════════
const PIPELINE_SCOPES = [
  { id: "preplanning",  title: "Preplanning",        desc: "Universe foundation — pillars, fantasies, pacing, decisions",
    pipeline_kind: "preplanning", populates_tables: ["gamecore_design_pillars","gamecore_player_fantasies","gamecore_pacing_curves","gamecore_design_decisions"], requires: null },
  { id: "entities",     title: "Universal entities", desc: "Characters, locations, items canon to the universe",
    pipeline_kind: "entities", populates_tables: ["gamecore_entities","gamecore_locations","gamecore_items"], requires: null },
  { id: "arpg_combat",  title: "ARPG combat systems",desc: "Soulbinds, forms, kits, abilities, combat moves",
    pipeline_kind: "arpg_combat", populates_tables: ["gamecore_arpg_soulbinds","gamecore_arpg_forms","gamecore_arpg_form_kits","gamecore_arpg_form_kit_abilities","gamecore_arpg_combat_moves"], requires: "action_rpg" },
  { id: "arpg_content", title: "ARPG content",       desc: "Dungeons, zones, encounters, enemies, loot",
    pipeline_kind: "arpg_content", populates_tables: ["gamecore_arpg_dungeons","gamecore_arpg_dungeon_zones","gamecore_arpg_encounters","gamecore_arpg_enemies","gamecore_arpg_loot_tables","gamecore_arpg_loot_drops"], requires: "action_rpg" },
  { id: "td_systems",   title: "TD systems",         desc: "Tower families, tiers, specs, synergies, enemies",
    pipeline_kind: "td_systems", populates_tables: ["gamecore_td_tower_families","gamecore_td_tower_tiers","gamecore_td_tower_specializations","gamecore_td_synergy_patterns","gamecore_td_enemy_types"], requires: "tower_defense" },
  { id: "td_content",   title: "TD content",         desc: "Maps, waves, counter-rotations",
    pipeline_kind: "td_content", populates_tables: ["gamecore_td_maps","gamecore_td_map_tiles","gamecore_td_waves","gamecore_td_counter_rotations"], requires: "tower_defense" },
  { id: "cb_systems",   title: "CB systems",         desc: "Buildings, resources, production chains, civic systems",
    pipeline_kind: "cb_systems", populates_tables: ["gamecore_cb_buildings","gamecore_cb_resources","gamecore_cb_production_chains","gamecore_cb_civic_systems"], requires: "city_builder" },
  { id: "cb_content",   title: "CB content",         desc: "Regions, seasons/events, unlock trees, citizens",
    pipeline_kind: "cb_content", populates_tables: ["gamecore_cb_regions","gamecore_cb_seasons_events","gamecore_cb_unlock_trees","gamecore_cb_citizens"], requires: "city_builder" },
  { id: "bridges",      title: "Cross-category bridges", desc: "Category links, hybrid raid yields, hybrid unlocks",
    pipeline_kind: "bridges", populates_tables: ["gamecore_category_links","gamecore_hybrid_raid_yields","gamecore_hybrid_unlocks"], requires: "multi" },
];

// ═══════════════════════════════════════════════════════════════════════════
// MODELS
// ═══════════════════════════════════════════════════════════════════════════
async function loadModels() {
  const r = await api("/api/model-pool/models");
  const items = r.ok ? (Array.isArray(r.body?.items) ? r.body.items : Array.isArray(r.body) ? r.body : []) : [];
  state.availableModels = items
    .filter(m => m.runtime_driver === "openai_api" && m.enabled !== false &&
                 (parseSurfaces(m.surface_allowlist).includes(SURFACE) || parseSurfaces(m.surface_allowlist).includes("lorecore")))
    .map(m => ({ alias: m.alias || m.name, label: m.name || m.alias }));
  renderModelSelector();
}

function renderModelSelector() {
  const container = qs("#modelSelectorWrap"); if (!container) return;
  if (!state.availableModels.length) {
    container.innerHTML = `<div class="muted" style="font-size:12px;">No models — enable gamecore surface in Settings.</div>`;
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
// FOUNDATION (universes / projects / builds / categories)
// ═══════════════════════════════════════════════════════════════════════════
async function loadOverview() {
  setChip("#libraryChip", "Loading", "status-chip--warn");
  const r = await api("/api/gamecore/overview");
  if (!r.ok) {
    setChip("#libraryChip", "Failed", "status-chip--bad");
    showToast(`Overview failed: ${r.status}`, "warn");
    return;
  }
  const ov = r.body || {};
  state.universes = Array.isArray(ov.universes) ? ov.universes : [];
  state.categories = Array.isArray(ov.categories) ? ov.categories : [];
  state.projects = Array.isArray(ov.projects) ? ov.projects : [];
  state.builds = Array.isArray(ov.builds) ? ov.builds : [];
  state.projectCategories = Array.isArray(ov.project_categories) ? ov.project_categories : [];

  if (ov.selected_universe) state.selectedUniverseId = ov.selected_universe.public_id;
  else if (state.universes.length && !state.selectedUniverseId) state.selectedUniverseId = state.universes[0].public_id;

  if (ov.selected_project) state.selectedProjectId = ov.selected_project.public_id;
  if (ov.selected_build) state.selectedBuildId = ov.selected_build.public_id;

  renderUniverseSelect();
  renderProjectSelect();
  renderBuildSelect();
  renderCategoryChecks();
  updateScopeChip();
  updateContextRows();
  setChip("#libraryChip", `${state.projects.length} projects`, "status-chip--good");

  await Promise.all([
    loadSessionList(),
    loadPipelinesForProject(),
    loadRecentRunsForProject(),
    refreshLibraryTree(),
  ]);
  renderPipelineCards();
  renderTierTabs();
}

function renderUniverseSelect() {
  const sel = qs("#universeSelect"); if (!sel) return;
  sel.innerHTML = `<option value="">— select universe —</option>` +
    state.universes.map(u => `<option value="${escHtml(u.public_id)}" ${u.public_id === state.selectedUniverseId ? "selected" : ""}>${escHtml(u.name || u.public_id)}</option>`).join("");
}

function renderProjectSelect() {
  const sel = qs("#projectSelect"); if (!sel) return;
  const projects = state.projects.filter(p => !state.selectedUniverseId || p.universe_public_id === state.selectedUniverseId);
  sel.innerHTML = `<option value="">—</option>` +
    projects.map(p => `<option value="${escHtml(p.public_id)}" ${p.public_id === state.selectedProjectId ? "selected" : ""}>${escHtml(p.name || p.public_id)}</option>`).join("");
}

function renderBuildSelect() {
  const sel = qs("#buildSelect"); if (!sel) return;
  const builds = state.builds.filter(b => !state.selectedProjectId || b.project_public_id === state.selectedProjectId);
  sel.innerHTML = `<option value="">—</option>` +
    builds.map(b => `<option value="${escHtml(b.public_id)}" ${b.public_id === state.selectedBuildId ? "selected" : ""}>${escHtml(b.name || b.public_id)}</option>`).join("");
}

function renderCategoryChecks() {
  const container = qs("#newProjectCategoryList"); if (!container) return;
  container.innerHTML = state.categories.map(c => `
    <label class="category-check">
      <input type="checkbox" class="cat-cb" value="${escHtml(c.public_id)}" data-kind="${escHtml(c.kind)}" />
      <span>${escHtml(c.display_name || c.kind)}</span>
    </label>`).join("");
  qsa(".cat-cb", container).forEach(cb => cb.addEventListener("change", () => {
    cb.closest("label")?.classList.toggle("category-check--checked", cb.checked);
  }));
}

function projectCategoryKinds() {
  return state.projectCategories.map(pc => pc.kind || pc.category_kind).filter(Boolean);
}

function updateScopeChip() {
  const cnt = state.projects.length;
  const proj = state.projects.find(p => p.public_id === state.selectedProjectId);
  if (!proj) {
    setChip("#scopeChip", `${cnt} proj`, "status-chip--warn");
  } else {
    setChip("#scopeChip", proj.name?.slice(0, 14) || proj.public_id, "status-chip--good");
  }
}

function updateContextRows() {
  const u = state.universes.find(x => x.public_id === state.selectedUniverseId);
  const p = state.projects.find(x => x.public_id === state.selectedProjectId);
  const b = state.builds.find(x => x.public_id === state.selectedBuildId);
  qs("#ctxUniverse").textContent = u?.name || "—";
  qs("#ctxProject").textContent = p?.name || "—";
  qs("#ctxBuild").textContent = b?.name || "—";
  qs("#ctxMode").textContent = state.uiMode;
  qs("#ctxCategories").textContent = projectCategoryKinds().join(", ") || "—";
  qs("#projectScopeChip").textContent = p?.name || "Free chat";
  qs("#projectScopeChip").className = p ? "status-chip status-chip--accent" : "status-chip";
  qs("#buildScopeLabel").textContent = b?.name || "—";
}

// ── Selection handlers ────────────────────────────────────────────────────
async function selectUniverse(uid) {
  state.selectedUniverseId = uid || null;
  state.selectedProjectId = null;
  state.selectedBuildId = null;
  state.projectCategories = [];
  renderProjectSelect();
  renderBuildSelect();
  updateScopeChip();
  updateContextRows();
  await loadOverview();
}

async function selectProject(pid) {
  state.selectedProjectId = pid || null;
  state.selectedBuildId = null;
  if (!pid) {
    state.projectCategories = [];
    renderBuildSelect();
    updateScopeChip();
    updateContextRows();
    return;
  }
  // Fetch project detail (includes categories)
  const r = await api(`/api/gamecore/projects/${encodeURIComponent(pid)}`);
  if (r.ok) {
    state.projectCategories = r.body?.categories || [];
  }
  await loadOverview();
}

function selectBuild(bid) {
  state.selectedBuildId = bid || null;
  updateContextRows();
}

// ── Create handlers ───────────────────────────────────────────────────────
async function createUniverse() {
  const name = qs("#newUniverseName")?.value.trim() || "";
  if (!name) { showToast("Name required", "warn"); return; }
  const summary = qs("#newUniverseSummary")?.value.trim() || "";
  const r = await api("/api/gamecore/universes", { method: "POST", body: { name, summary } });
  if (!r.ok) { showToast(`Create universe failed: ${r.status}`, "warn"); return; }
  showToast("Universe created", "good");
  qs("#newUniverseForm").style.display = "none";
  qs("#newUniverseName").value = "";
  qs("#newUniverseSummary").value = "";
  state.selectedUniverseId = r.body?.public_id || state.selectedUniverseId;
  await loadOverview();
}

async function createProject() {
  const name = qs("#newProjectName")?.value.trim() || "";
  if (!name) { showToast("Name required", "warn"); return; }
  if (!state.selectedUniverseId) { showToast("Select a universe first", "warn"); return; }
  const premise = qs("#newProjectPremise")?.value.trim() || "";
  const cats = qsa(".cat-cb").filter(cb => cb.checked).map(cb => cb.value);
  if (!cats.length) { showToast("Select at least one category", "warn"); return; }
  const r = await api("/api/gamecore/projects", {
    method: "POST",
    body: {
      universe_public_id: state.selectedUniverseId,
      name, premise,
      category_public_ids: cats,
      primary_category_public_id: cats[0],
    },
  });
  if (!r.ok) { showToast(`Create project failed: ${r.status}`, "warn"); return; }
  showToast("Project created", "good");
  qs("#newProjectForm").style.display = "none";
  qs("#newProjectName").value = "";
  qs("#newProjectPremise").value = "";
  qsa(".cat-cb").forEach(cb => { cb.checked = false; cb.closest("label")?.classList.remove("category-check--checked"); });
  state.selectedProjectId = r.body?.public_id || state.selectedProjectId;
  await loadOverview();
}

async function createBuild() {
  if (!state.selectedProjectId) { showToast("Select a project first", "warn"); return; }
  const name = qs("#newBuildName")?.value.trim() || "v0.1";
  const build_kind = qs("#newBuildKind")?.value || "prototype";
  const r = await api("/api/gamecore/builds", { method: "POST", body: { project_public_id: state.selectedProjectId, name, build_kind } });
  if (!r.ok) { showToast(`Create build failed: ${r.status}`, "warn"); return; }
  showToast("Build created", "good");
  qs("#newBuildForm").style.display = "none";
  qs("#newBuildName").value = "";
  state.selectedBuildId = r.body?.public_id || state.selectedBuildId;
  await loadOverview();
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
    projectId: raw.project_public_id || null,
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
    const projName = s.projectId ? (state.projects.find(p => p.public_id === s.projectId)?.name || s.projectId) : null;
    const isActive = !state.freeMode && s.id === state.selectedSessionId;
    return `
      <button class="session-item ${isActive ? "session-item--active" : ""}" type="button" data-session-id="${escHtml(s.id)}">
        <div class="session-item-title">${escHtml(s.title)}</div>
        <div class="session-item-sub">${projName ? "🎮 " + escHtml(projName) : escHtml(s.excerpt || "General")}</div>
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
      title: "New gamecore session",
      summary: "GameCore design thread",
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
    const proj = state.projects.find(p => p.public_id === state.selectedProjectId);
    feed.innerHTML = `<div class="chat-placeholder">
      <div class="chat-placeholder-icon">🎮</div>
      <div class="chat-placeholder-title">GameCore design room</div>
      <div class="muted" style="font-size:13px;">${proj ? `Project: ${escHtml(proj.name)}` : "Free chat — no project context"}</div>
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

  // Stream via the home live-chat endpoint (same as lorecore uses for non-lorecore-specific surfaces).
  // Falls back to the home stream endpoint with surface=gamecore.
  const params = new URLSearchParams({
    prompt: content,
    mode: state.chatMode,
    models: state.selectedModels.join(","),
    surface: SURFACE,
  });
  if (state.selectedProjectId) params.set("project_public_id", state.selectedProjectId);
  if (state.selectedBuildId) params.set("build_public_id", state.selectedBuildId);

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
  const cats = projectCategoryKinds();
  const out = [];
  for (const [tierId, tier] of Object.entries(TIERS)) {
    if (!tier.requires) { out.push(tierId); continue; }
    if (tier.requires === "multi") {
      if (cats.length >= 2) out.push(tierId);
      continue;
    }
    if (cats.includes(tier.requires)) out.push(tierId);
  }
  return out;
}

async function refreshLibraryTree() {
  // Compute counts per resource
  state.recordCounts = {};
  if (state.selectedProjectId) {
    const tiers = getApplicableTiers();
    const counts = await Promise.all(tiers.flatMap(tid =>
      TIERS[tid].resources.map(async res => {
        // Skip resources scoped to non-project ids — they need a parent record selected
        if (res.scopeKey !== "project_public_id") return [res.id, null];
        const r = await api(`${res.endpoint}?project_public_id=${encodeURIComponent(state.selectedProjectId)}`);
        const arr = r.ok && Array.isArray(r.body) ? r.body : [];
        return [res.id, arr.length];
      })
    ));
    for (const [id, n] of counts) state.recordCounts[id] = n;
  }
  renderLibraryTree();
  renderCountsBox();
}

function renderLibraryTree() {
  const el = qs("#libraryTree"); if (!el) return;
  if (!state.selectedProjectId) {
    el.innerHTML = `<div class="lib-placeholder">Select a project.</div>`;
    return;
  }
  const tiers = getApplicableTiers();
  el.innerHTML = tiers.map(tid => {
    const tier = TIERS[tid];
    const open = state.treeOpen[tid];
    const tierCount = tier.resources
      .map(r => state.recordCounts[r.id])
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
              <span class="tree-leaf-count">${state.recordCounts[r.id] ?? "—"}</span>
            </div>
          `).join("")}
        </div>
      </div>`;
  }).join("");
}

function renderCountsBox() {
  const box = qs("#countsBox"); if (!box) return;
  if (!state.selectedProjectId) {
    box.innerHTML = `<strong>${state.projects.length} projects</strong><span>Select one to see counts.</span>`;
    return;
  }
  const proj = state.projects.find(p => p.public_id === state.selectedProjectId);
  const totals = Object.entries(state.recordCounts)
    .filter(([_, n]) => typeof n === "number" && n > 0)
    .map(([id, n]) => `${id}: ${n}`)
    .join(" · ");
  box.innerHTML = `<strong>${escHtml(proj?.name || "Project")}</strong><span>${totals || "Empty substrate — run preplanning first."}</span>`;
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
  // ensure activeTier is valid
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
      const cnt = state.recordCounts[r.id];
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
  if (res.scopeKey === "project_public_id" && state.selectedProjectId) {
    url += `?project_public_id=${encodeURIComponent(state.selectedProjectId)}`;
  }
  // Resources scoped by parent_id (kit_public_id, dungeon_public_id, etc.) load all rows for now;
  // future improvement: prompt user to pick parent record.
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
    const title = r.name || r.title || r.public_id;
    const subtitle = r.summary || r.description || r.kind || r.canon_status || "";
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
  qs("#recordEditorTitle").textContent = isNew ? `New ${res.label.replace(/s$/,"").toLowerCase()}` : (record?.name || record?.title || "—");
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
    const val = typeof v === "object" ? JSON.stringify(v, null, 2) : (v ?? "");
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
  if (res.scopeKey === "project_public_id" && state.selectedProjectId) {
    payload.project_public_id = state.selectedProjectId;
  }
  for (const f of fields) {
    const el = qs(`#f_${f.name}`); if (!el) continue;
    let val;
    if (f.type === "checkbox") val = el.checked;
    else if (f.type === "number") val = el.value === "" ? null : Number(el.value);
    else if (f.type === "textarea") {
      val = el.value;
      // Try to parse JSON if field name suggests it
      if (/(_offsets|points|tags|enemy_composition|^[a-z_]+_data$|references_)/i.test(f.name) && val.trim().startsWith("[")) {
        try { val = JSON.parse(val); } catch {}
      } else if (/(_offsets|points|tags|enemy_composition|_data$)/i.test(f.name) && val.trim().startsWith("{")) {
        try { val = JSON.parse(val); } catch {}
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
  await refreshLibraryTree();
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
  await refreshLibraryTree();
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE LAUNCHER
// ═══════════════════════════════════════════════════════════════════════════
async function loadPipelinesForProject() {
  if (!state.selectedProjectId) {
    state.pipelines = [];
    return;
  }
  const r = await api(`/api/gamecore/pipelines?project_public_id=${encodeURIComponent(state.selectedProjectId)}&is_active=true`);
  state.pipelines = r.ok && Array.isArray(r.body) ? r.body : [];
}

async function loadRecentRunsForProject() {
  if (!state.selectedProjectId) {
    state.recentRuns = [];
    renderRunList();
    return;
  }
  const r = await api(`/api/gamecore/pipeline-runs?project_public_id=${encodeURIComponent(state.selectedProjectId)}`);
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
        <span>${escHtml(r.run_status || "?")}</span>
        <span>${escHtml((r.completed_stages ?? "?") + " / " + (r.total_stages ?? "?"))} stages</span>
      </div>
    </div>`).join("");
}

function pipelineStatusForScope(scope) {
  // Aggregate row counts across populates_tables
  const tables = scope.populates_tables || [];
  let total = 0;
  for (const tbl of tables) {
    const resId = Object.entries(TIERS).flatMap(([_, t]) => t.resources)
      .find(r => r.table === tbl)?.id;
    if (resId && typeof state.recordCounts[resId] === "number") total += state.recordCounts[resId];
  }
  if (total === 0) return { kind: "empty", label: "Empty" };
  if (total < 8) return { kind: "partial", label: `Partial (${total})` };
  return { kind: "populated", label: `Populated (${total})` };
}

function renderPipelineCards() {
  const el = qs("#pipelineCards"); if (!el) return;
  if (!state.selectedProjectId) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">Select a project.</div>`;
    return;
  }
  const cats = projectCategoryKinds();
  const visibleScopes = PIPELINE_SCOPES.filter(s => {
    if (!s.requires) return true;
    if (s.requires === "multi") return cats.length >= 2;
    return cats.includes(s.requires);
  });

  if (!visibleScopes.length) {
    el.innerHTML = `<div class="muted" style="font-size:12px;">No applicable pipelines for this project's categories.</div>`;
    return;
  }

  el.innerHTML = visibleScopes.map(scope => {
    const matching = state.pipelines.filter(p => p.pipeline_kind === scope.pipeline_kind);
    const status = pipelineStatusForScope(scope);
    const launchableId = matching[0]?.public_id || "";
    const select = matching.length > 1
      ? `<select class="select" data-scope-launch="${escHtml(scope.id)}">
          ${matching.map(m => `<option value="${escHtml(m.public_id)}">${escHtml(m.name || m.public_id)}</option>`).join("")}
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
  if (!state.selectedProjectId) { showToast("Select a project first", "warn"); return; }
  const payload = {
    pipeline_public_id: pipelineId,
    project_public_id: state.selectedProjectId,
    build_public_id: state.selectedBuildId || null,
    run_status: "queued",
    started_at: new Date().toISOString(),
    run_label: `${scope.title} · ${new Date().toLocaleString()}`,
  };
  const r = await api("/api/gamecore/pipeline-runs", { method: "POST", body: payload });
  if (!r.ok) { showToast(`Launch failed: ${r.status}`, "warn"); return; }
  showToast(`Queued: ${scope.title}`, "good");
  await loadRecentRunsForProject();
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
  const KEY = "gamecore_chat_height";
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
  qs("#refreshBtn")?.addEventListener("click", loadOverview);
  qs("#modeToggleBtn")?.addEventListener("click", toggleMode);

  // Sessions
  qs("#freeChatBtn")?.addEventListener("click", () => selectSession(FREE_SESSION_ID, true));
  qs("#sessionList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-session-id]");
    if (btn) selectSession(btn.dataset.sessionId, false);
  });
  qs("#newSessionBtn")?.addEventListener("click", createNewSession);

  // Universe / project / build
  qs("#universeSelect")?.addEventListener("change", e => selectUniverse(e.target.value));
  qs("#projectSelect")?.addEventListener("change", e => selectProject(e.target.value));
  qs("#buildSelect")?.addEventListener("change", e => selectBuild(e.target.value));

  qs("#newUniverseBtn")?.addEventListener("click", () => { qs("#newUniverseForm").style.display = "block"; });
  qs("#cancelUniverseBtn")?.addEventListener("click", () => { qs("#newUniverseForm").style.display = "none"; });
  qs("#saveUniverseBtn")?.addEventListener("click", createUniverse);

  qs("#newProjectBtn")?.addEventListener("click", () => {
    if (!state.selectedUniverseId) { showToast("Select a universe first", "warn"); return; }
    qs("#newProjectForm").style.display = "block";
  });
  qs("#cancelProjectBtn")?.addEventListener("click", () => { qs("#newProjectForm").style.display = "none"; });
  qs("#saveProjectBtn")?.addEventListener("click", createProject);

  qs("#newBuildBtn")?.addEventListener("click", () => {
    if (!state.selectedProjectId) { showToast("Select a project first", "warn"); return; }
    qs("#newBuildForm").style.display = "block";
  });
  qs("#cancelBuildBtn")?.addEventListener("click", () => { qs("#newBuildForm").style.display = "none"; });
  qs("#saveBuildBtn")?.addEventListener("click", createBuild);

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
      // Switch to library mode if not already there
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
  loadOverview();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
