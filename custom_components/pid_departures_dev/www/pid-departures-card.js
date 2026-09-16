/**
 * PID Departures card.
 *
 * A self-contained Lovelace card for the PID Departures integration - no HACS
 * dependency (replaces flex-table-card). Bundled inside the integration and
 * served/registered automatically by the integration's frontend.py.
 *
 * Visual language borrowed from a companion dashboard-cards project: a plain
 * custom element with shadow DOM, CSS custom properties for theming, a soft
 * radial glow, color-mix() pills/chips, and small one-shot keyframe animations
 * triggered by real value changes rather than looping forever.
 *
 * Configuration is device-based: pick one or more PID Departures devices, and toggle
 * which optional bits of information to show. No YAML entity lists required.
 *
 * With more than one device, departures can be shown either merged into a single
 * chronological list (like the original flex-table-card example) or grouped into one
 * section per stop - see `sort_by` in DEFAULT_CONFIG.
 */

const CARD_VERSION = "1.3.0";

console.info(
  `%c PID-DEPARTURES-CARD %c ${CARD_VERSION} `,
  "color:#0b1020;background:#7ee6c8;font-weight:700;border-radius:3px 0 0 3px",
  "color:#7ee6c8;background:#0b1020;border-radius:0 3px 3px 0"
);

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

/* --------------------------------------------------------------- helpers */

function fireEvent(source, type, detail) {
  const event = new Event(type, { bubbles: true, composed: true });
  event.detail = detail;
  source.dispatchEvent(event);
}

function moreInfo(source, entityId) {
  if (entityId) fireEvent(source, "hass-more-info", { entityId });
}

/** Replay a one-shot CSS animation class that may already be on the element. */
function flash(element, className, duration = 600) {
  if (!element || REDUCED_MOTION.matches) return;
  element.classList.remove(className);
  void element.offsetWidth; // force reflow so the re-add is seen as a new animation
  element.classList.add(className);
  clearTimeout(element._flash);
  element._flash = setTimeout(() => element.classList.remove(className), duration);
}

function setHidden(element, hide) {
  if (element) element.toggleAttribute("hidden", Boolean(hide));
}

/** Entities for `deviceId`, as a map of translation_key -> [entity_id, ...] (sorted). */
function entitiesByRole(hass, deviceId) {
  const byRole = {};
  const registry = hass.entities || {};
  const ids = Object.keys(registry).filter((id) => registry[id].device_id === deviceId);
  for (const id of ids) {
    const key = registry[id].translation_key || "unknown";
    (byRole[key] = byRole[key] || []).push(id);
  }
  for (const key of Object.keys(byRole)) {
    byRole[key].sort((a, b) => (trailingIndex(a) ?? 0) - (trailingIndex(b) ?? 0));
  }
  return byRole;
}

function trailingIndex(entityId) {
  const match = entityId.match(/_(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** Approximate PID brand colours per route, for a bit of authenticity. */
function routeTint(routeType, routeName, isNight) {
  if (isNight) return "#5b4b8a";
  switch (routeType) {
    case "tram":
      return "#7d0403"; // sampled from a real PID tram - noticeably darker than metro C's red
    case "metro":
      if (routeName === "A") return "#078943";
      if (routeName === "B") return "#ffcc00";
      if (routeName === "C") return "#e2231a";
      return "#1f9d8f";
    case "train":
      return "#7b3f99";
    case "trolleybus":
      return "#00a3c4";
    case "ferry":
      return "#2f7fbf";
    case "funicular":
      return "#e08a1e";
    case "bus":
    default:
      return "#0066b3";
  }
}

const ROUTE_TYPE_ICON = {
  tram: "mdi:tram",
  metro: "mdi:train-variant",
  train: "mdi:train",
  bus: "mdi:bus",
  ferry: "mdi:ferry",
  funicular: "mdi:gondola",
  trolleybus: "mdi:bus-electric",
  unknown: "mdi:bus",
};

/** Whether a departure is within the configured `max_minutes_ahead` horizon (if any). */
function withinHorizon(depState, maxMinutesAhead) {
  if (!maxMinutesAhead) return true;
  const diffMin = (Date.parse(depState.attributes.departure_time_est) - Date.now()) / 60000;
  return Number.isFinite(diffMin) ? diffMin <= maxMinutesAhead : true;
}

/** "tra 5 min" / "in 5 min", localized; falls back to a plain "Nm" format. */
/** Current wall-clock time (HH:MM), honoring the user's HA 12h/24h preference when known. */
function formatClock(hass) {
  const locale = (hass && hass.locale) || {};
  const language = locale.language || navigator.language;
  let hour12;
  if (locale.time_format === "12") hour12 = true;
  else if (locale.time_format === "24") hour12 = false;
  try {
    return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).format(new Date());
  } catch (err) {
    return new Date().toTimeString().slice(0, 8);
  }
}

/** Absolute departure clock time (HH:MM), honoring the user's 12h/24h preference. */
function formatClockTime(hass, isoString) {
  if (!isoString) return "--:--";
  const locale = (hass && hass.locale) || {};
  const language = locale.language || navigator.language;
  let hour12;
  if (locale.time_format === "12") hour12 = true;
  else if (locale.time_format === "24") hour12 = false;
  try {
    return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", hour12 }).format(
      new Date(isoString)
    );
  } catch (err) {
    return new Date(isoString).toTimeString().slice(0, 5);
  }
}

function formatEta(hass, isoString) {
  if (!isoString) return "--";
  const diffMs = Date.parse(isoString) - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const language = (hass.locale && hass.locale.language) || navigator.language;
  try {
    const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    if (Math.abs(diffMs) < 45000) return formatter.format(0, "second");
    return formatter.format(diffMin, "minute");
  } catch (err) {
    return diffMin <= 0 ? "now" : `${diffMin} min`;
  }
}

/* --------------------------------------------------------------- i18n */

/** Czech has three plural forms: 1, 2-4, 5+ (e.g. "1 zastávka", "2 zastávky", "5 zastávek"). */
function pluralCs(n, [one, few, many]) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

const STRINGS = {
  en: {
    selectDevice: "Select at least one departure board device.",
    noUpcoming: "No upcoming departures",
    canceled: "canceled",
    updated: (time) => `Updated ${time}`,
    vehicleOnWay: "Vehicle is on its way",
    vehiclePositionKnown: "Vehicle position known",
    stopsCount: (n) => `${n} stops`,
    alertOne: "1 active service alert",
    alertMany: (n) => `${n} active service alerts`,
    arrivalPrefix: "arr.",
    editorDeviceLabel: "Departure board device(s)",
    editorNoDevices: "No PID Departures devices found.",
    editorSortLabel: "Sort departures by",
    editorSortTime: "Time (all selected stops merged together)",
    editorSortStop: "Stop (one section per stop)",
    editorVariantLabel: "Card size",
    variantFull: "Full (all details)",
    variantCompact: "Compact (tighter rows)",
    variantSlim: "Slim (one line per departure)",
    variantMini: "Mini (single departure, gauge)",
    editorRowsLabel: "Number of departures to show (per stop when grouped, total when merged)",
    editorMaxMinutesLabel: "Hide departures further than this many minutes away (empty = no limit)",
    editorMaxMinutesPlaceholder: "no limit",
    editorHint: "Pick one or more devices created by the PID Departures integration.",
    toggle_show_platform: "Show platform",
    toggle_show_zone: "Show zone",
    toggle_show_delay: "Show delay",
    toggle_show_air_condition: "Show air conditioning",
    toggle_show_wheelchair: "Show wheelchair accessibility",
    toggle_show_arrival_time: "Show arrival time",
    toggle_show_alerts: "Show service alerts",
    toggle_show_vehicle_tracking: "Show live vehicle tracking",
    alertsCardTitle: "Service alerts",
    noActiveAlerts: "No active service alerts",
    toggle_show_original: "Show original (Czech) text",
  },
  cs: {
    selectDevice: "Vyber alespoň jednu zastávku odjezdové tabule.",
    noUpcoming: "Žádné nadcházející odjezdy",
    canceled: "zrušeno",
    updated: (time) => `Aktualizováno ${time}`,
    vehicleOnWay: "Vozidlo je na cestě",
    vehiclePositionKnown: "Poloha vozidla známá",
    stopsCount: (n) => `${n} ${pluralCs(n, ["zastávka", "zastávky", "zastávek"])}`,
    alertOne: "1 aktivní dopravní informace",
    alertMany: (n) =>
      `${n} ${pluralCs(n, ["aktivní dopravní informace", "aktivní dopravní informace", "aktivních dopravních informací"])}`,
    arrivalPrefix: "přj.",
    editorDeviceLabel: "Zastávky odjezdové tabule",
    editorNoDevices: "Nenalezena žádná zařízení integrace PID Departures.",
    editorSortLabel: "Řadit odjezdy podle",
    editorSortTime: "Času (všechny vybrané zastávky sloučené dohromady)",
    editorSortStop: "Zastávky (samostatná sekce pro každou)",
    editorVariantLabel: "Velikost karty",
    variantFull: "Plná (všechny detaily)",
    variantCompact: "Kompaktní (užší řádky)",
    variantSlim: "Úzká (jeden řádek na odjezd)",
    variantMini: "Mini (jeden odjezd, ukazatel)",
    editorRowsLabel: "Počet odjezdů k zobrazení (na zastávku při seskupení, celkem při sloučení)",
    editorMaxMinutesLabel: "Skrýt odjezdy vzdálenější než tolik minut (prázdné = bez omezení)",
    editorMaxMinutesPlaceholder: "bez omezení",
    editorHint: "Vyber jedno nebo více zařízení vytvořených integrací PID Departures.",
    toggle_show_platform: "Zobrazit nástupiště",
    toggle_show_zone: "Zobrazit zónu",
    toggle_show_delay: "Zobrazit zpoždění",
    toggle_show_air_condition: "Zobrazit klimatizaci",
    toggle_show_wheelchair: "Zobrazit bezbariérovost",
    toggle_show_arrival_time: "Zobrazit čas příjezdu",
    toggle_show_alerts: "Zobrazit dopravní informace",
    toggle_show_vehicle_tracking: "Zobrazit sledování vozidla naživo",
    alertsCardTitle: "Dopravní informace",
    noActiveAlerts: "Žádné aktivní dopravní informace",
    toggle_show_original: "Zobrazit originální text (čeština)",
  },
};

/** Look up a UI string in the user's HA language, falling back to English. */
function t(hass, key, ...args) {
  const lang = ((hass && (hass.language || (hass.locale && hass.locale.language))) || "en").slice(0, 2);
  const dict = STRINGS[lang] || STRINGS.en;
  const entry = key in dict ? dict[key] : STRINGS.en[key];
  return typeof entry === "function" ? entry(...args) : entry;
}

/* -------------------------------------------------------------- styles */

const STYLES = `
:host {
  --dc-tint: #7ee6c8;
  --dc-ink: var(--primary-text-color, #e8ecf1);
  --dc-muted: var(--secondary-text-color, #93a0b4);
  --dc-surface: var(--ha-card-background, var(--card-background-color, #16181d));
  display: block;
  min-width: 0;
}
ha-card {
  position: relative;
  overflow: hidden;
  padding: 14px 16px 10px;
  background:
    radial-gradient(130% 100% at 100% 0%, color-mix(in srgb, var(--dc-tint) 12%, transparent), transparent 60%),
    var(--dc-surface);
}
.head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  animation: rise-in 480ms cubic-bezier(.22,.61,.36,1) both;
}
.stop-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--dc-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.head-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.head-chips { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.clock {
  font-size: 1.3rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--dc-ink);
  white-space: nowrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: .72rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--dc-tint) 72%, var(--dc-ink));
  background: color-mix(in srgb, var(--dc-tint) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--dc-tint) 30%, transparent);
  white-space: nowrap;
}
.chip ha-icon { --mdc-icon-size: 13px; }

.alert-bar {
  margin-top: 8px;
  padding: 7px 11px;
  border-radius: 10px;
  font-size: .78rem;
  font-weight: 600;
  color: #ffb454;
  background: color-mix(in srgb, #ffb454 14%, transparent);
  border: 1px solid color-mix(in srgb, #ffb454 30%, transparent);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  animation: alert-pulse 2.4s ease-in-out infinite;
}
.alert-bar ha-icon { --mdc-icon-size: 16px; flex: none; }
.alert-bar .alert-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alert-detail {
  margin-top: 4px;
  font-size: .72rem;
  color: var(--dc-muted);
  line-height: 1.4;
}

.vehicles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.vehicle-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px 4px 8px;
  border-radius: 999px;
  font-size: .74rem;
  font-weight: 600;
  color: var(--dc-ink);
  background: color-mix(in srgb, var(--dc-tint) 10%, transparent);
  cursor: pointer;
}
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--dc-tint);
  position: relative;
  flex: none;
}
.dot::after {
  content: "";
  position: absolute; inset: -6px;
  border-radius: 50%;
  border: 2px solid var(--dc-tint);
  opacity: 0;
}
.vehicle-pill.tracking .dot::after { animation: dot-ping 1.6s ease-out infinite; }

.stop-section + .stop-section { margin-top: 14px; padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--dc-ink) 10%, transparent); }
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: .8rem;
  font-weight: 700;
  color: var(--dc-muted);
}
.section-chips { display: inline-flex; gap: 6px; }
.row-stop-tag {
  font-size: .66rem;
  color: var(--dc-tint);
  font-weight: 600;
  margin-top: 1px;
}

.rows { margin-top: 10px; display: flex; flex-direction: column; gap: 2px; }
.row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--dc-ink) 8%, transparent);
  animation: rise-in 480ms cubic-bezier(.22,.61,.36,1) both;
}
.row:last-child { border-bottom: none; }
.row.canceled { opacity: .55; }
.row.canceled .headsign { text-decoration: line-through; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 8px;
  font-weight: 800;
  font-size: .85rem;
  color: white;
  background: var(--route-tint, #0066b3);
  min-width: 2.4em;
  justify-content: center;
}
.badge ha-icon { --mdc-icon-size: 15px; color: white; }

.mid { min-width: 0; }
.headsign {
  font-size: .88rem;
  color: var(--dc-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub-chips { display: flex; gap: 5px; margin-top: 3px; flex-wrap: wrap; }
.mini-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: .68rem;
  color: var(--dc-muted);
}
.mini-chip ha-icon { --mdc-icon-size: 13px; }
.mini-chip.delay { color: #ffb454; font-weight: 700; }
.mini-chip.delay.severe { color: #ff6b6b; }

.eta-col { text-align: right; }
.eta-time {
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--dc-ink);
  white-space: nowrap;
}
.eta-time.soon { color: var(--dc-tint); }
.eta-relative {
  font-size: .72rem;
  color: var(--dc-muted);
  white-space: nowrap;
}
.arrival {
  font-size: .68rem;
  color: var(--dc-muted);
  white-space: nowrap;
}

.footer {
  margin-top: 6px;
  font-size: .66rem;
  color: var(--dc-muted);
  text-align: right;
}

.empty { padding: 18px 4px; text-align: center; color: var(--dc-muted); font-size: .85rem; }

/* --- density variants: same data, less (or differently arranged) space --- */
ha-card[data-variant="compact"] .row { padding: 5px 2px; }
ha-card[data-variant="compact"] .arrival { display: none; }
ha-card[data-variant="compact"] .sub-chips { margin-top: 1px; }
ha-card[data-variant="compact"] .eta-time { font-size: .92rem; }
ha-card[data-variant="compact"] .headsign { font-size: .82rem; }

/* "slim" turns the whole row into one 4-column grid: badge | headsign+stop-tag | icons | time.
   .mid (which normally wraps headsign/stop-tag/sub-chips as one block) is neutralized with
   "display: contents" so those three become direct grid items here instead - that's what lets
   the icons sit in their own column right next to the time, vertically centered against the
   row like the badge, with no extra alignment tricks needed anywhere. */
ha-card[data-variant="slim"] .row {
  grid-template-columns: auto 1fr auto auto;
  grid-template-rows: auto auto;
  column-gap: 8px;
  padding: 5px 2px;
}
ha-card[data-variant="slim"] .mid { display: contents; }
ha-card[data-variant="slim"] .badge { grid-column: 1; grid-row: 1 / 3; align-self: center; padding: 2px 7px; font-size: .76rem; min-width: 2em; }
ha-card[data-variant="slim"] .headsign { grid-column: 2; grid-row: 1; font-size: .82rem; }
ha-card[data-variant="slim"] .row-stop-tag { grid-column: 2; grid-row: 2; }
ha-card[data-variant="slim"] .sub-chips {
  grid-column: 3; grid-row: 1 / 3; align-self: center;
  display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 0;
}
ha-card[data-variant="slim"] .mini-chip { font-size: .6rem; gap: 2px; }
ha-card[data-variant="slim"] .mini-chip ha-icon { --mdc-icon-size: 11px; }
/* eta-col: relative countdown on top (more actionable at a glance), absolute time smaller
   underneath - reordered via flex "order", not DOM order, so full/compact (which want the
   absolute time as the big primary line) don't need their own markup. */
ha-card[data-variant="slim"] .eta-col { grid-column: 4; grid-row: 1 / 3; align-self: center; display: flex; flex-direction: column; align-items: flex-end; }
ha-card[data-variant="slim"] .eta-relative { order: 1; font-size: .88rem; font-weight: 700; color: var(--dc-ink); }
ha-card[data-variant="slim"] .eta-time { order: 2; font-size: .68rem; font-weight: 600; color: var(--dc-muted); }
ha-card[data-variant="slim"] .arrival { display: none; }

.mini-tile { display: flex; align-items: center; gap: 16px; padding: 6px 2px 2px; animation: rise-in 480ms cubic-bezier(.22,.61,.36,1) both; }
.mini-ring { position: relative; width: 84px; height: 84px; flex: none; }
.mini-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.mini-ring circle { fill: none; stroke-width: 8; }
.mini-ring .ring-bg { stroke: color-mix(in srgb, var(--dc-ink) 12%, transparent); }
.mini-ring .ring-fg { stroke: var(--dc-tint); stroke-linecap: round; transition: stroke-dashoffset 900ms ease, stroke 400ms ease; }
.mini-value { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.mini-value .num { font-size: 1.6rem; font-weight: 800; color: var(--dc-ink); line-height: 1; font-variant-numeric: tabular-nums; }
.mini-value .unit { font-size: .6rem; color: var(--dc-muted); text-transform: uppercase; letter-spacing: .04em; }
.mini-info { min-width: 0; }
.mini-info .badge { margin-bottom: 6px; }
.mini-info .headsign { font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

[hidden] { display: none !important; }

@keyframes rise-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
@keyframes value-changed {
  0%   { color: var(--dc-ink); }
  30%  { color: var(--dc-tint); text-shadow: 0 0 12px color-mix(in srgb, var(--dc-tint) 55%, transparent); }
  100% { color: var(--dc-ink); text-shadow: none; }
}
@keyframes alert-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #ffb454 25%, transparent); }
  50% { box-shadow: 0 0 0 5px color-mix(in srgb, #ffb454 0%, transparent); }
}
@keyframes dot-ping {
  0% { transform: scale(0.6); opacity: .9; }
  100% { transform: scale(1.8); opacity: 0; }
}
.changed { animation: value-changed 600ms ease-out; }

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; }
}
`;

const DEFAULT_CONFIG = {
  device_ids: [],
  sort_by: "time", // "time" = merge all stops into one chronological list; "stop" = group by stop
  // "full" = current density; "compact" = tighter rows, no arrival line; "slim" = one line per
  // departure, countdown only; "mini" = a single-departure gauge tile for a small dashboard slot.
  variant: "full",
  rows: 6,
  // A low-frequency stop can otherwise fill its departure quota with trips many hours out
  // (the API looks up to 3 days ahead to satisfy the configured departure count), which looks
  // like a bug when merged next to a frequent stop's near-term rows. null = no limit.
  max_minutes_ahead: null,
  show_zone: true,
  show_platform: true,
  show_delay: true,
  show_air_condition: true,
  show_wheelchair: true,
  show_arrival_time: false,
  show_alerts: true,
  show_vehicle_tracking: true,
};

/** Merge config with defaults and fold the legacy single `device_id` into `device_ids`. */
function normalizeConfig(config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!Array.isArray(cfg.device_ids) || cfg.device_ids.length === 0) {
    cfg.device_ids = cfg.device_id ? [cfg.device_id] : [];
  }
  return cfg;
}

/* ---------------------------------------------------------------- card */

class PidDeparturesCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._hass = null;
    this._alertExpanded = false;
    this._lastEtaText = {};
  }

  static getConfigElement() {
    return document.createElement("pid-departures-card-editor");
  }

  static getStubConfig(hass) {
    const devices = (hass && hass.devices) || {};
    const match = Object.values(devices).find((d) =>
      (d.identifiers || []).some((pair) => pair[0] === "pid_departures_dev")
    );
    return { type: "custom:pid-departures-card", device_ids: match ? [match.id] : [] };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("pid-departures-card: configuration is required");
    }
    // No device selected yet is a valid (if unfinished) state while editing in the visual
    // editor - it renders a hint instead of throwing, so the dashboard doesn't show a big
    // red error card for what is normally a momentary, self-correcting state.
    this._config = normalizeConfig(config);
    this._contentShape = null;
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._buildDom();
    this._update();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._ticker = setInterval(() => this._tick(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this._ticker);
  }

  getCardSize() {
    if (!this._config) return 6;
    if (this._config.variant === "mini") return 2;
    const boardCount = Math.max(1, (this._config.device_ids || []).length);
    const rows = this._config.rows || 6;
    const base = this._config.sort_by === "stop" ? rows * boardCount + boardCount : rows;
    return 2 + (this._config.variant === "slim" ? Math.ceil(base / 2) : base);
  }

  _buildDom() {
    this._built = true;
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="head">
          <div class="stop-name" id="stop-name">-</div>
          <div class="head-right">
            <div class="head-chips" id="head-chips"></div>
            <div class="clock" id="clock"></div>
          </div>
        </div>
        <div class="alert-bar" id="alert-bar" hidden>
          <ha-icon icon="mdi:alert-outline"></ha-icon>
          <span class="alert-text" id="alert-text"></span>
        </div>
        <div class="alert-detail" id="alert-detail" hidden></div>
        <div class="vehicles" id="vehicles"></div>
        <div id="content"></div>
        <div class="empty" id="empty" hidden>No upcoming departures</div>
        <div class="footer" id="footer"></div>
      </ha-card>
    `;

    const alertBar = this.shadowRoot.getElementById("alert-bar");
    alertBar.addEventListener("click", () => {
      this._alertExpanded = !this._alertExpanded;
      setHidden(this.shadowRoot.getElementById("alert-detail"), !this._alertExpanded);
    });
  }

  /** Gather this device's entities and current states into one convenience object. */
  _boardData(deviceId) {
    const hass = this._hass;
    const roles = entitiesByRole(hass, deviceId);
    const state = (id) => (id ? hass.states[id] : undefined);
    const first = (key) => state((roles[key] || [])[0]);
    const stopName = first("stop_name");
    const platform = first("platform");
    const departures = (roles.route_name || [])
      .map((entityId) => ({ entityId, state: state(entityId) }))
      .filter((d) => d.state);
    return {
      deviceId,
      roles,
      stopName: stopName ? stopName.state : deviceId,
      platform: platform && platform.state ? platform.state : "",
      zone: first("zone"),
      infotext: first("infotext"),
      vehicleEntityId: (roles.next_vehicle || [])[0],
      vehicle: first("next_vehicle"),
      updated: first("updated"),
      departures,
    };
  }

  _update() {
    if (!this._hass || !this._config) return;
    const hass = this._hass;
    const cfg = this._config;
    const root = this.shadowRoot;
    const deviceIds = cfg.device_ids || [];

    root.getElementById("clock").textContent = formatClock(hass);
    root.querySelector("ha-card").dataset.variant = cfg.variant || "full";

    if (deviceIds.length === 0) {
      root.getElementById("stop-name").textContent = "PID Departures Card";
      root.getElementById("head-chips").innerHTML = "";
      setHidden(root.getElementById("alert-bar"), true);
      root.getElementById("vehicles").innerHTML = "";
      root.getElementById("content").innerHTML = "";
      setHidden(root.getElementById("empty"), false);
      root.getElementById("empty").textContent = t(hass, "selectDevice");
      root.getElementById("footer").textContent = "";
      this._contentShape = null;
      return;
    }

    const boards = deviceIds.map((id) => this._boardData(id));

    if (cfg.variant === "mini") {
      this._renderMini(root, hass, cfg, boards);
      return;
    }

    const grouped = cfg.sort_by === "stop" && boards.length > 1;
    const showStopTag = !grouped && boards.length > 1;

    // Header: a single stop keeps its own name + platform/zone chips; several stops get a
    // generic title (or the user's own `title`) since per-stop details move into the rows.
    root.getElementById("stop-name").textContent =
      cfg.title || (boards.length === 1 ? boards[0].stopName : t(hass, "stopsCount", boards.length));

    const chips = [];
    if (boards.length === 1) {
      const b = boards[0];
      if (cfg.show_platform && b.platform) {
        chips.push(`<span class="chip"><ha-icon icon="mdi:bus-stop-covered"></ha-icon>${escapeHtml(b.platform)}</span>`);
      }
      if (cfg.show_zone && b.zone && b.zone.state) {
        chips.push(`<span class="chip"><ha-icon icon="mdi:map-clock"></ha-icon>${escapeHtml(b.zone.state)}</span>`);
      }
    }
    root.getElementById("head-chips").innerHTML = chips.join("");

    // Alerts, aggregated across all configured stops.
    const activeAlerts = cfg.show_alerts
      ? boards.filter((b) => b.infotext && b.infotext.state === "on")
      : [];
    const alertBar = root.getElementById("alert-bar");
    setHidden(alertBar, activeAlerts.length === 0);
    if (activeAlerts.length > 0) {
      const totalCount = activeAlerts.reduce(
        (sum, b) => sum + (b.infotext.attributes.count || (b.infotext.attributes.infotexts || []).length || 1),
        0
      );
      root.getElementById("alert-text").textContent =
        totalCount > 1 ? t(hass, "alertMany", totalCount) : t(hass, "alertOne");
      const detail = root.getElementById("alert-detail");
      const lines = [];
      for (const b of activeAlerts) {
        const texts = b.infotext.attributes.infotexts || [];
        const prefix = boards.length > 1 ? `[${b.stopName}] ` : "";
        for (const t of texts.slice(0, 5)) {
          lines.push(`<div>${escapeHtml(prefix + (t.text || t.header || JSON.stringify(t)))}</div>`);
        }
      }
      detail.innerHTML = lines.join("");
      setHidden(detail, !this._alertExpanded);
    }

    // Vehicle tracking: one small pill per tracked stop.
    const vehiclesEl = root.getElementById("vehicles");
    if (cfg.show_vehicle_tracking) {
      const trackedHtml = boards
        .filter((b) => b.vehicle && b.vehicle.state !== "unavailable" && b.vehicle.state !== "unknown")
        .map((b, i) => {
          const isTracking = b.vehicle.attributes.is_tracking;
          const label = boards.length > 1 ? b.stopName : isTracking ? t(hass, "vehicleOnWay") : t(hass, "vehiclePositionKnown");
          return `<div class="vehicle-pill${isTracking ? " tracking" : ""}" data-vehicle="${escapeHtml(b.vehicleEntityId || "")}"><div class="dot"></div><span>${escapeHtml(label)}</span></div>`;
        })
        .join("");
      vehiclesEl.innerHTML = trackedHtml;
      for (const el of vehiclesEl.querySelectorAll("[data-vehicle]")) {
        const entityId = el.getAttribute("data-vehicle");
        el.onclick = () => moreInfo(this, entityId);
      }
    } else {
      vehiclesEl.innerHTML = "";
    }

    // Departure rows: either one merged, time-sorted list, or one section per stop.
    this._renderContent(root, boards, cfg, grouped, showStopTag);

    const anyRows = boards.some((b) =>
      b.departures.some((d) => withinHorizon(d.state, cfg.max_minutes_ahead))
    );
    setHidden(root.getElementById("empty"), anyRows);
    root.getElementById("empty").textContent = t(hass, "noUpcoming");

    const latestUpdate = boards
      .map((b) => b.updated && b.updated.state)
      .filter(Boolean)
      .sort()
      .pop();
    root.getElementById("footer").textContent = latestUpdate ? t(hass, "updated", formatEta(hass, latestUpdate)) : "";
  }

  /** "mini" variant: a single gauge tile for the very next departure - for a small dashboard
   * slot where even the "slim" row list is too much. Header chips, alerts and vehicle pills
   * are dropped entirely to keep the footprint minimal. */
  _renderMini(root, hass, cfg, boards) {
    root.getElementById("stop-name").textContent =
      cfg.title || (boards.length === 1 ? boards[0].stopName : t(hass, "stopsCount", boards.length));
    root.getElementById("head-chips").innerHTML = "";
    setHidden(root.getElementById("alert-bar"), true);
    root.getElementById("vehicles").innerHTML = "";
    root.getElementById("footer").textContent = "";

    const merged = [];
    for (const b of boards) {
      for (const dep of b.departures) {
        if (dep.state.attributes.is_canceled) continue;
        if (!withinHorizon(dep.state, cfg.max_minutes_ahead)) continue;
        merged.push({ ...dep, stopLabel: b.stopName });
      }
    }
    merged.sort(
      (a, b) =>
        (Date.parse(a.state.attributes.departure_time_est) || Infinity) -
        (Date.parse(b.state.attributes.departure_time_est) || Infinity)
    );

    const contentEl = root.getElementById("content");
    const hasNext = merged.length > 0;
    setHidden(root.getElementById("empty"), hasNext);
    root.getElementById("empty").textContent = t(hass, "noUpcoming");

    if (!hasNext) {
      if (this._contentShape !== "mini:empty") {
        this._contentShape = "mini:empty";
        contentEl.innerHTML = "";
      }
      return;
    }

    if (this._contentShape !== "mini") {
      this._contentShape = "mini";
      contentEl.innerHTML = `
        <div class="mini-tile">
          <div class="mini-ring">
            <svg viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="42"></circle>
              <circle class="ring-fg" cx="50" cy="50" r="42"></circle>
            </svg>
            <div class="mini-value"><span class="num"></span><span class="unit"></span></div>
          </div>
          <div class="mini-info">
            <div class="badge"><ha-icon icon="mdi:bus"></ha-icon><span class="badge-text"></span></div>
            <div class="headsign"></div>
            <div class="row-stop-tag" hidden></div>
          </div>
        </div>`;
    }

    const dep = merged[0];
    const a = dep.state.attributes;
    const routeType = a.route_type || "unknown";
    const routeName = dep.state.state || "?";
    const tile = contentEl.querySelector(".mini-tile");
    tile.onclick = () => moreInfo(this, dep.entityId);

    const badge = tile.querySelector(".badge");
    badge.style.setProperty("--route-tint", routeTint(routeType, routeName, a.is_night));
    badge.querySelector("ha-icon").setAttribute("icon", ROUTE_TYPE_ICON[routeType] || ROUTE_TYPE_ICON.unknown);
    badge.querySelector(".badge-text").textContent = routeName;
    tile.querySelector(".headsign").textContent = a.trip_headsign || "";

    const stopTagEl = tile.querySelector(".row-stop-tag");
    const showStopTag = boards.length > 1;
    setHidden(stopTagEl, !showStopTag);
    stopTagEl.textContent = showStopTag ? dep.stopLabel : "";

    const diffMin = Math.max(0, (Date.parse(a.departure_time_est) - Date.now()) / 60000);
    const cap = cfg.max_minutes_ahead || 30;
    const pct = Math.max(0, Math.min(1, diffMin / cap));
    const r = 42;
    const circumference = 2 * Math.PI * r;
    const circle = tile.querySelector(".ring-fg");
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference * (1 - pct)}`;
    circle.style.stroke = diffMin < 1.5 ? "#ff6b6b" : diffMin < 5 ? "#ffb454" : "var(--dc-tint)";

    const roundedMin = Math.round(diffMin);
    const numEl = tile.querySelector(".num");
    const unitEl = tile.querySelector(".unit");
    if (diffMin < 0.75) {
      numEl.textContent = "●";
      unitEl.textContent = "";
    } else {
      numEl.textContent = String(roundedMin);
      unitEl.textContent = "min";
    }
    if (this._lastMiniValue !== undefined && this._lastMiniValue !== numEl.textContent) {
      flash(numEl, "changed");
    }
    this._lastMiniValue = numEl.textContent;
  }

  /** Build (only when the shape changes) and patch the rows/sections for this render. */
  _renderContent(root, boards, cfg, grouped, showStopTag) {
    const rowsPerBoard = Math.max(1, cfg.rows || 6);
    const contentEl = root.getElementById("content");

    const inHorizon = (dep) => withinHorizon(dep.state, cfg.max_minutes_ahead);

    if (grouped) {
      const filtered = boards.map((b) => b.departures.filter(inHorizon));
      const counts = filtered.map((deps) => Math.min(rowsPerBoard, deps.length));
      const shape = `stop:${counts.join(",")}`;
      if (this._contentShape !== shape) {
        this._contentShape = shape;
        contentEl.innerHTML = counts
          .map(
            (count, i) => `
            <div class="stop-section">
              <div class="section-head">
                <span class="section-name"></span>
                <span class="section-chips"></span>
              </div>
              <div class="rows">${Array.from({ length: count }, () => rowTemplate()).join("")}</div>
            </div>`
          )
          .join("");
      }
      const sections = contentEl.querySelectorAll(".stop-section");
      boards.forEach((b, i) => {
        const section = sections[i];
        if (!section) return;
        section.querySelector(".section-name").textContent = b.stopName + (b.platform ? ` (${b.platform})` : "");
        const chips = [];
        if (cfg.show_zone && b.zone && b.zone.state) {
          chips.push(`<span class="chip"><ha-icon icon="mdi:map-clock"></ha-icon>${escapeHtml(b.zone.state)}</span>`);
        }
        section.querySelector(".section-chips").innerHTML = chips.join("");
        const rowsEl = section.querySelector(".rows");
        const deps = filtered[i];
        const count = Math.min(rowsPerBoard, deps.length);
        for (let i2 = 0; i2 < count; i2++) {
          this._updateRow(rowsEl.children[i2], deps[i2].state, deps[i2].entityId, cfg, null);
        }
      });
      return;
    }

    // Flat, merged-by-time mode (also used when there's only a single stop configured).
    const merged = [];
    for (const b of boards) {
      for (const dep of b.departures.filter(inHorizon)) merged.push({ ...dep, stopLabel: b.stopName });
    }
    merged.sort((a, b) => {
      const ta = Date.parse(a.state.attributes.departure_time_est) || Infinity;
      const tb = Date.parse(b.state.attributes.departure_time_est) || Infinity;
      return ta - tb;
    });
    const totalRows = Math.min(cfg.rows || merged.length, merged.length);

    const shape = `time:${totalRows}`;
    if (this._contentShape !== shape) {
      this._contentShape = shape;
      contentEl.innerHTML = `<div class="rows">${Array.from({ length: totalRows }, () => rowTemplate()).join("")}</div>`;
    }
    const rowsEl = contentEl.querySelector(".rows");
    for (let i = 0; i < totalRows; i++) {
      const dep = merged[i];
      this._updateRow(rowsEl.children[i], dep.state, dep.entityId, cfg, showStopTag ? dep.stopLabel : null);
    }
  }

  _updateRow(rowEl, routeState, entityId, cfg, stopLabel) {
    const a = routeState.attributes;
    const routeType = a.route_type || "unknown";
    const routeName = routeState.state || "?";
    const tint = routeTint(routeType, routeName, a.is_night);

    rowEl.classList.toggle("canceled", Boolean(a.is_canceled));
    rowEl.onclick = () => moreInfo(this, entityId);

    const badge = rowEl.querySelector(".badge");
    badge.style.setProperty("--route-tint", tint);
    badge.querySelector("ha-icon").setAttribute("icon", ROUTE_TYPE_ICON[routeType] || ROUTE_TYPE_ICON.unknown);
    badge.querySelector(".badge-text").textContent = routeName;

    rowEl.querySelector(".headsign").textContent = a.trip_headsign || "";
    const stopTagEl = rowEl.querySelector(".row-stop-tag");
    if (stopTagEl) {
      setHidden(stopTagEl, !stopLabel);
      stopTagEl.textContent = stopLabel || "";
    }

    const subChips = rowEl.querySelector(".sub-chips");
    const bits = [];
    if (cfg.show_delay && a.is_delay_avail && a.delay_min) {
      const severe = a.delay_min >= 5;
      const sign = a.delay_min > 0 ? "+" : ""; // delay_min already carries its own "-" when early
      bits.push(
        `<span class="mini-chip delay${severe ? " severe" : ""}"><ha-icon icon="mdi:clock-alert-outline"></ha-icon>${sign}${a.delay_min}m</span>`
      );
    }
    if (cfg.show_air_condition && a.is_air_conditioned) {
      bits.push(`<span class="mini-chip"><ha-icon icon="mdi:snowflake"></ha-icon></span>`);
    }
    if (cfg.show_wheelchair && a.is_wheelchair_accessible) {
      bits.push(`<span class="mini-chip"><ha-icon icon="mdi:wheelchair"></ha-icon></span>`);
    }
    if (a.is_night) {
      bits.push(`<span class="mini-chip"><ha-icon icon="mdi:weather-night"></ha-icon></span>`);
    }
    subChips.innerHTML = bits.join("");

    const timeEl = rowEl.querySelector(".eta-time");
    timeEl.textContent = a.is_canceled ? t(this._hass, "canceled") : formatClockTime(this._hass, a.departure_time_est);
    timeEl.classList.toggle("soon", !a.is_canceled && Date.parse(a.departure_time_est) - Date.now() < 90000);

    // "canceled" always lives in .eta-time (now visible in every variant, including slim);
    // .eta-relative is simply hidden for a canceled row instead of showing a blank line.
    const relativeEl = rowEl.querySelector(".eta-relative");
    setHidden(relativeEl, a.is_canceled);
    if (!a.is_canceled) {
      const relativeText = formatEta(this._hass, a.departure_time_est);
      if (this._lastEtaText[entityId] !== undefined && this._lastEtaText[entityId] !== relativeText) {
        flash(relativeEl, "changed");
      }
      this._lastEtaText[entityId] = relativeText;
      relativeEl.textContent = relativeText;
    }

    const arrivalEl = rowEl.querySelector(".arrival");
    if (cfg.show_arrival_time && a.arrival_time_est) {
      setHidden(arrivalEl, false);
      arrivalEl.textContent = `${t(this._hass, "arrivalPrefix")} ${formatEta(this._hass, a.arrival_time_est)}`;
    } else {
      setHidden(arrivalEl, true);
    }
  }

  /** Re-render the live countdowns every second without waiting for a hass push. */
  _tick() {
    if (this._built && this._hass) this._update();
  }
}

function rowTemplate() {
  return `
    <div class="row">
      <div class="badge"><ha-icon icon="mdi:bus"></ha-icon><span class="badge-text"></span></div>
      <div class="mid">
        <div class="headsign"></div>
        <div class="row-stop-tag" hidden></div>
        <div class="sub-chips"></div>
      </div>
      <div class="eta-col">
        <div class="eta-time"></div>
        <div class="eta-relative"></div>
        <div class="arrival" hidden></div>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text == null ? "" : text);
  return div.innerHTML;
}

customElements.define("pid-departures-card", PidDeparturesCard);

/* ------------------------------------------------------- editor helpers */

const EDITOR_STYLES = `
  :host { display: block; font-family: var(--paper-font-body1_-_font-family); }
  .field { margin-bottom: 14px; }
  label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 4px; color: var(--primary-text-color); }
  select, input[type="number"] {
    width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--divider-color, #444); background: var(--card-background-color, #1c1c1c);
    color: var(--primary-text-color); font-size: .9rem;
  }
  .device-list {
    max-height: 180px; overflow-y: auto; border: 1px solid var(--divider-color, #444);
    border-radius: 8px; padding: 6px 10px;
  }
  .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
  .toggle-row { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--primary-text-color); padding: 3px 0; }
  .hint { font-size: .72rem; color: var(--secondary-text-color); margin-top: 10px; }
`;

/** The scrollable checkbox list of PID Departures devices, shared by both card editors. */
function deviceChecklistHtml(hass, selectedIds) {
  const devices = Object.values((hass && hass.devices) || {}).filter((d) =>
    (d.identifiers || []).some((pair) => pair[0] === "pid_departures_dev")
  );
  if (!devices.length) return { devices, html: `<em>${t(hass, "editorNoDevices")}</em>` };
  const html = devices
    .map(
      (d) => `
    <label class="toggle-row">
      <input type="checkbox" class="device-check" value="${d.id}" ${selectedIds.includes(d.id) ? "checked" : ""} />
      ${escapeHtml(d.name_by_user || d.name)}
    </label>`
    )
    .join("");
  return { devices, html };
}

/* ---------------------------------------------------------------- editor */

// Keys only - labels come from t(hass, `toggle_${key}`) so the editor is localized too.
const TOGGLE_FIELDS = [
  "show_platform",
  "show_zone",
  "show_delay",
  "show_air_condition",
  "show_wheelchair",
  "show_arrival_time",
  "show_alerts",
  "show_vehicle_tracking",
];

class PidDeparturesCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
  }

  setConfig(config) {
    this._config = normalizeConfig(config);
    if (this._built) {
      this._syncValues();
    } else {
      this._maybeBuild();
    }
  }

  set hass(hass) {
    this._hass = hass;
    // Deliberately NOT re-rendering here on every call: HA pushes a new `hass` object very
    // frequently (on almost any state change anywhere in the system), and rebuilding the
    // whole form each time would destroy an open <select> dropdown or steal focus from
    // whatever the user is currently typing into. The form is built once and left alone.
    this._maybeBuild();
  }

  _maybeBuild() {
    if (this._built || !this._hass || !this._config) return;
    this._built = true;
    this._buildDom();
  }

  /** Push current config values into the existing fields, skipping whichever the user is
   * actively focused on/interacting with, so an external config change never fights typing. */
  _syncValues() {
    const cfg = this._config;
    const root = this.shadowRoot;
    const active = root.activeElement;
    for (const el of root.querySelectorAll(".device-check")) {
      if (el !== active) el.checked = cfg.device_ids.includes(el.value);
    }
    const sortEl = root.getElementById("sort_by");
    if (sortEl && sortEl !== active) sortEl.value = cfg.sort_by;
    const variantEl = root.getElementById("variant");
    if (variantEl && variantEl !== active) variantEl.value = cfg.variant;
    const rowsEl = root.getElementById("rows");
    if (rowsEl && rowsEl !== active) rowsEl.value = cfg.rows;
    for (const key of TOGGLE_FIELDS) {
      const el = root.getElementById(key);
      if (el && el !== active) el.checked = Boolean(cfg[key]);
    }
  }

  _buildDom() {
    const cfg = this._config;
    const { html: deviceListHtml } = deviceChecklistHtml(this._hass, cfg.device_ids);

    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="field">
        <label>${t(this._hass, "editorDeviceLabel")}</label>
        <div class="device-list">${deviceListHtml}</div>
      </div>
      <div class="field">
        <label>${t(this._hass, "editorSortLabel")}</label>
        <select id="sort_by">
          <option value="time" ${cfg.sort_by === "time" ? "selected" : ""}>${t(this._hass, "editorSortTime")}</option>
          <option value="stop" ${cfg.sort_by === "stop" ? "selected" : ""}>${t(this._hass, "editorSortStop")}</option>
        </select>
      </div>
      <div class="field">
        <label>${t(this._hass, "editorVariantLabel")}</label>
        <select id="variant">
          <option value="full" ${cfg.variant === "full" ? "selected" : ""}>${t(this._hass, "variantFull")}</option>
          <option value="compact" ${cfg.variant === "compact" ? "selected" : ""}>${t(this._hass, "variantCompact")}</option>
          <option value="slim" ${cfg.variant === "slim" ? "selected" : ""}>${t(this._hass, "variantSlim")}</option>
          <option value="mini" ${cfg.variant === "mini" ? "selected" : ""}>${t(this._hass, "variantMini")}</option>
        </select>
      </div>
      <div class="field">
        <label>${t(this._hass, "editorRowsLabel")}</label>
        <input type="number" id="rows" min="1" max="20" value="${cfg.rows}" />
      </div>
      <div class="field">
        <label>${t(this._hass, "editorMaxMinutesLabel")}</label>
        <input type="number" id="max_minutes_ahead" min="1" value="${cfg.max_minutes_ahead || ""}" placeholder="${t(this._hass, "editorMaxMinutesPlaceholder")}" />
      </div>
      <div class="field toggles">
        ${TOGGLE_FIELDS.map(
          (key) => `
          <label class="toggle-row">
            <input type="checkbox" id="${key}" ${cfg[key] ? "checked" : ""} />
            ${t(this._hass, `toggle_${key}`)}
          </label>`
        ).join("")}
      </div>
      <div class="hint">${t(this._hass, "editorHint")}</div>
    `;

    for (const el of this.shadowRoot.querySelectorAll(".device-check")) {
      el.addEventListener("change", () => this._changeDevices());
    }
    this.shadowRoot.getElementById("sort_by").addEventListener("change", (e) => this._change("sort_by", e.target.value));
    this.shadowRoot.getElementById("variant").addEventListener("change", (e) => this._change("variant", e.target.value));
    this.shadowRoot.getElementById("rows").addEventListener("change", (e) => this._change("rows", Number(e.target.value) || 6));
    this.shadowRoot.getElementById("max_minutes_ahead").addEventListener("change", (e) =>
      this._change("max_minutes_ahead", e.target.value ? Number(e.target.value) : null)
    );
    for (const key of TOGGLE_FIELDS) {
      this.shadowRoot.getElementById(key).addEventListener("change", (e) => this._change(key, e.target.checked));
    }
  }

  _changeDevices() {
    const checked = Array.from(this.shadowRoot.querySelectorAll(".device-check"))
      .filter((el) => el.checked)
      .map((el) => el.value);
    this._change("device_ids", checked);
  }

  _change(key, value) {
    this._config = { ...this._config, [key]: value };
    fireEvent(this, "config-changed", { config: this._config });
  }
}

customElements.define("pid-departures-card-editor", PidDeparturesCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "pid-departures-card",
  name: "PID Departures Card",
  description: "Animated departure board for the PID Departures integration - no extra dependencies.",
  preview: false,
});

/* ------------------------------------------------------------ alerts card */

const ALERTS_STYLES = `
.alert-item {
  padding: 10px 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--dc-ink) 8%, transparent);
  animation: rise-in 480ms cubic-bezier(.22,.61,.36,1) both;
}
.alert-item:last-child { border-bottom: none; }
.alert-stop {
  font-size: .7rem;
  font-weight: 700;
  color: var(--dc-tint);
  text-transform: uppercase;
  letter-spacing: .02em;
  margin-bottom: 2px;
}
.alert-text { font-size: .88rem; color: var(--dc-ink); line-height: 1.4; }
.alert-original { font-size: .74rem; color: var(--dc-muted); line-height: 1.4; margin-top: 3px; font-style: italic; }
.empty.good { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--dc-muted); }
.empty.good ha-icon { --mdc-icon-size: 18px; color: var(--dc-tint); }
`;

class PidAlertsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
  }

  static getConfigElement() {
    return document.createElement("pid-alerts-card-editor");
  }

  static getStubConfig(hass) {
    const devices = (hass && hass.devices) || {};
    const matches = Object.values(devices).filter((d) =>
      (d.identifiers || []).some((pair) => pair[0] === "pid_departures_dev")
    );
    return { type: "custom:pid-alerts-card", device_ids: matches.map((d) => d.id) };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("pid-alerts-card: configuration is required");
    }
    this._config = normalizeAlertsConfig(config);
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._buildDom();
    this._update();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 3;
  }

  _buildDom() {
    this._built = true;
    this.shadowRoot.innerHTML = `
      <style>${STYLES}${ALERTS_STYLES}</style>
      <ha-card>
        <div class="head"><div class="stop-name" id="title">-</div></div>
        <div id="list"></div>
      </ha-card>
    `;
  }

  _update() {
    if (!this._hass || !this._config) return;
    const hass = this._hass;
    const cfg = this._config;
    const root = this.shadowRoot;
    const deviceIds = cfg.device_ids || [];

    root.getElementById("title").textContent = cfg.title || t(hass, "alertsCardTitle");

    const listEl = root.getElementById("list");
    if (deviceIds.length === 0) {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t(hass, "selectDevice"))}</div>`;
      return;
    }

    const entries = [];
    for (const deviceId of deviceIds) {
      const roles = entitiesByRole(hass, deviceId);
      const infoState = hass.states[(roles.infotext || [])[0]];
      const stopNameState = hass.states[(roles.stop_name || [])[0]];
      const stopName = stopNameState ? stopNameState.state : deviceId;
      if (!infoState || infoState.state !== "on") continue;
      for (const item of infoState.attributes.infotexts || []) {
        entries.push({ stopName, item });
      }
    }

    if (entries.length === 0) {
      listEl.innerHTML = `
        <div class="empty good">
          <ha-icon icon="mdi:check-circle-outline"></ha-icon>
          <span>${escapeHtml(t(hass, "noActiveAlerts"))}</span>
        </div>`;
      return;
    }

    listEl.innerHTML = entries
      .map(({ stopName, item }) => {
        const original = item.text || item.header || "";
        const translated = item.text_translated;
        const primary = translated || original;
        const showOriginal = cfg.show_original !== false && translated && translated !== original;
        return `
          <div class="alert-item">
            <div class="alert-stop">${escapeHtml(stopName)}</div>
            <div class="alert-text">${escapeHtml(primary)}</div>
            ${showOriginal ? `<div class="alert-original">${escapeHtml(original)}</div>` : ""}
          </div>`;
      })
      .join("");
  }
}

function normalizeAlertsConfig(config) {
  const cfg = { device_ids: [], show_original: true, ...config };
  if (!Array.isArray(cfg.device_ids) || cfg.device_ids.length === 0) {
    cfg.device_ids = cfg.device_id ? [cfg.device_id] : [];
  }
  return cfg;
}

customElements.define("pid-alerts-card", PidAlertsCard);

class PidAlertsCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
  }

  setConfig(config) {
    this._config = normalizeAlertsConfig(config);
    if (this._built) {
      this._syncValues();
    } else {
      this._maybeBuild();
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._maybeBuild();
  }

  _maybeBuild() {
    if (this._built || !this._hass || !this._config) return;
    this._built = true;
    this._buildDom();
  }

  _syncValues() {
    const cfg = this._config;
    const root = this.shadowRoot;
    const active = root.activeElement;
    for (const el of root.querySelectorAll(".device-check")) {
      if (el !== active) el.checked = cfg.device_ids.includes(el.value);
    }
    const showOriginalEl = root.getElementById("show_original");
    if (showOriginalEl && showOriginalEl !== active) showOriginalEl.checked = cfg.show_original !== false;
  }

  _buildDom() {
    const cfg = this._config;
    const { html: deviceListHtml } = deviceChecklistHtml(this._hass, cfg.device_ids);

    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="field">
        <label>${t(this._hass, "editorDeviceLabel")}</label>
        <div class="device-list">${deviceListHtml}</div>
      </div>
      <label class="toggle-row">
        <input type="checkbox" id="show_original" ${cfg.show_original !== false ? "checked" : ""} />
        ${t(this._hass, "toggle_show_original")}
      </label>
      <div class="hint">${t(this._hass, "editorHint")}</div>
    `;

    for (const el of this.shadowRoot.querySelectorAll(".device-check")) {
      el.addEventListener("change", () => this._changeDevices());
    }
    this.shadowRoot.getElementById("show_original").addEventListener("change", (e) =>
      this._change("show_original", e.target.checked)
    );
  }

  _changeDevices() {
    const checked = Array.from(this.shadowRoot.querySelectorAll(".device-check"))
      .filter((el) => el.checked)
      .map((el) => el.value);
    this._change("device_ids", checked);
  }

  _change(key, value) {
    this._config = { ...this._config, [key]: value };
    fireEvent(this, "config-changed", { config: this._config });
  }
}

customElements.define("pid-alerts-card-editor", PidAlertsCardEditor);

window.customCards.push({
  type: "pid-alerts-card",
  name: "PID Alerts Card",
  description: "Service announcements for your PID stops, optionally translated via a Home Assistant conversation agent.",
  preview: false,
});
