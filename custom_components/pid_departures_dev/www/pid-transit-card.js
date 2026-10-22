/**
 * PID Transit card.
 *
 * Before going out, in one card: the rain radar around home -- ČHMÚ's open
 * composite, every 5 minutes at 1 km -- with the live position of the vehicles
 * of your lines, the next departures from your PID stops with second-by-second
 * countdowns, and the service alerts that apply to them.
 *
 * Bundled with the PID Departure Boards integration and registered by it, so
 * there is nothing to install. Everything is found in the entity registry by
 * translation key: pick the boards, or leave the list empty for all of them.
 *
 *   type: custom:pid-transit-card
 *   device_ids: [<board device id>, ...]   (optional; default: every board)
 *   rows: 12                                total rows (per stop with sort_by: stop)
 *   sort_by: time | stop
 *   max_minutes_ahead: 0                    0 = no limit
 *   show_alerts / show_radar: true
 *   weather: weather.home                   optional, shown in the header
 *   radar_source: chmi | rainviewer         ČHMÚ (Czechia) or RainViewer (world)
 *   radar_product: maxz | cappi
 *   zoom: 9, live_zoom: 14, past_minutes: 60
 *   latitude / longitude                    map centre (default: home)
 *   map_url                                 tile template, default: Home Assistant's own tiles
 *
 * Visual language shared with the dashboard-cards suite.
 */

const CARD_VERSION = "2.0.0";

console.info(
  `%c PID-TRANSIT-CARD %c ${CARD_VERSION} `,
  "color:#0b1020;background:#7ee6c8;font-weight:700;border-radius:3px 0 0 3px",
  "color:#7ee6c8;background:#0b1020;border-radius:0 3px 3px 0"
);

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ----------------------------------------------------------------- strings */

function pluralCs(n, forms) {
  if (n === 1) return forms[0];
  if (n >= 2 && n <= 4) return forms[1];
  return forms[2];
}

const STRINGS = {
  en: {
    title: "Public transport",
    radarTitle: "Rain radar",
    liveTitle: "Live vehicles",
    rain: "Rain",
    vehicles: "Vehicles",
    departures: "Departures",
    alerts: "Service alerts",
    alertsCount: (n) => (n === 1 ? "1 alert" : `${n} alerts`),
    noAlerts: "No alerts",
    noUpcoming: "No upcoming departures",
    noBoards: "No PID stop found: add one with the PID Departure Boards integration.",
    stopsCount: (n) => `${n} stops`,
    updated: (ago) => `updated ${ago} ago`,
    platform: (p) => `platform ${p}`,
    canceled: "canceled",
    now: "now",
    onMap: "on the map",
    latest: "latest",
    weak: "light",
    strong: "heavy",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    recenter: "Back to the default view",
    playPause: "Play or pause",
    e_title: "Title",
    e_device_ids: "Stops (PID boards; empty = all)",
    e_rows: "Rows",
    e_sort_by: "Order",
    e_sort_time: "All together, by time",
    e_sort_stop: "One section per stop",
    e_max_minutes_ahead: "Up to this many minutes ahead (0 = all)",
    e_show_alerts: "Show service alerts",
    e_weather: "Weather in the header (optional)",
    e_radar: "Radar and map",
    e_show_radar: "Show the radar",
    e_radar_source: "Radar source",
    e_src_chmi: "ČHMÚ (Czechia, every 5 min, 1 km)",
    e_src_rainviewer: "RainViewer (worldwide, every 10 min)",
    e_radar_product: "Radar product",
    e_prod_maxz: "Maximum reflectivity (rain reaching the ground highlighted)",
    e_prod_cappi: "Reflectivity at 2 km (rain estimate)",
    e_zoom: "Map zoom",
    e_live_zoom: "Zoom of the vehicles view",
    e_past_minutes: "Minutes of radar to animate",
    e_latitude: "Latitude (empty = home)",
    e_longitude: "Longitude (empty = home)",
  },
  cs: {
    title: "Veřejná doprava",
    radarTitle: "Srážkový radar",
    liveTitle: "Vozidla naživo",
    rain: "Srážky",
    vehicles: "Vozidla",
    departures: "Odjezdy",
    alerts: "Dopravní informace",
    alertsCount: (n) => `${n} ${pluralCs(n, ["informace", "informace", "informací"])}`,
    noAlerts: "Bez omezení",
    noUpcoming: "Žádné nadcházející odjezdy",
    noBoards: "Nenalezena žádná zastávka: přidejte ji integrací PID Departure Boards.",
    stopsCount: (n) => `${n} ${pluralCs(n, ["zastávka", "zastávky", "zastávek"])}`,
    updated: (ago) => `aktualizováno před ${ago}`,
    platform: (p) => `nástupiště ${p}`,
    canceled: "zrušeno",
    now: "teď",
    onMap: "na mapě",
    latest: "poslední",
    weak: "slabé",
    strong: "silné",
    zoomIn: "Přiblížit",
    zoomOut: "Oddálit",
    recenter: "Zpět na výchozí pohled",
    playPause: "Přehrát nebo pozastavit",
    e_title: "Název",
    e_device_ids: "Zastávky (tabule PID; prázdné = všechny)",
    e_rows: "Řádky",
    e_sort_by: "Řazení",
    e_sort_time: "Všechny dohromady podle času",
    e_sort_stop: "Samostatná sekce pro každou zastávku",
    e_max_minutes_ahead: "Nejvýše tolik minut dopředu (0 = vše)",
    e_show_alerts: "Zobrazit dopravní informace",
    e_weather: "Počasí v záhlaví (volitelné)",
    e_radar: "Radar a mapa",
    e_show_radar: "Zobrazit radar",
    e_radar_source: "Zdroj radaru",
    e_src_chmi: "ČHMÚ (Česko, každých 5 min, 1 km)",
    e_src_rainviewer: "RainViewer (celý svět, každých 10 min)",
    e_radar_product: "Radarový produkt",
    e_prod_maxz: "Maximální odrazivost (srážky dopadající na zem zvýrazněny)",
    e_prod_cappi: "Odrazivost ve 2 km (odhad srážek)",
    e_zoom: "Přiblížení mapy",
    e_live_zoom: "Přiblížení pohledu na vozidla",
    e_past_minutes: "Kolik minut radaru animovat",
    e_latitude: "Zeměpisná šířka (prázdné = domov)",
    e_longitude: "Zeměpisná délka (prázdné = domov)",
  },
  it: {
    title: "Trasporti",
    radarTitle: "Radar pioggia",
    liveTitle: "Mezzi in tempo reale",
    rain: "Pioggia",
    vehicles: "Mezzi",
    departures: "Partenze",
    alerts: "Avvisi",
    alertsCount: (n) => (n === 1 ? "1 avviso" : `${n} avvisi`),
    noAlerts: "Nessun avviso",
    noUpcoming: "Nessuna partenza in arrivo",
    noBoards: "Nessuna fermata PID trovata: aggiungila con l'integrazione PID Departure Boards.",
    stopsCount: (n) => `${n} fermate`,
    updated: (ago) => `aggiornato ${ago} fa`,
    platform: (p) => `banchina ${p}`,
    canceled: "cancellata",
    now: "ora",
    onMap: "sulla mappa",
    latest: "ultimo",
    weak: "debole",
    strong: "forte",
    zoomIn: "Avvicina",
    zoomOut: "Allontana",
    recenter: "Torna alla vista iniziale",
    playPause: "Riproduci o metti in pausa",
    e_title: "Titolo",
    e_device_ids: "Fermate (tabelloni PID; vuoto = tutte)",
    e_rows: "Righe",
    e_sort_by: "Ordine",
    e_sort_time: "Tutte insieme, per orario",
    e_sort_stop: "Divise per fermata",
    e_max_minutes_ahead: "Fino a quanti minuti (0 = tutte)",
    e_show_alerts: "Mostra gli avvisi",
    e_weather: "Meteo nell'intestazione (facoltativo)",
    e_radar: "Radar e mappa",
    e_show_radar: "Mostra il radar",
    e_radar_source: "Fonte del radar",
    e_src_chmi: "ČHMÚ (Rep. Ceca, ogni 5 min, 1 km)",
    e_src_rainviewer: "RainViewer (mondo, ogni 10 min)",
    e_radar_product: "Prodotto radar",
    e_prod_maxz: "Massima riflettività (pioggia a terra evidenziata)",
    e_prod_cappi: "Riflettività a 2 km (stima della pioggia)",
    e_zoom: "Zoom della mappa",
    e_live_zoom: "Zoom della vista Mezzi",
    e_past_minutes: "Minuti di radar da animare",
    e_latitude: "Latitudine (vuoto = casa)",
    e_longitude: "Longitudine (vuoto = casa)",
  },
};

/** A UI string in Home Assistant's language, falling back to English. */
function t(hass, key, ...args) {
  const lang = String((hass && ((hass.locale && hass.locale.language) || hass.language)) || "en").slice(0, 2);
  const dict = STRINGS[lang] || STRINGS.en;
  const entry = key in dict ? dict[key] : STRINGS.en[key];
  return typeof entry === "function" ? entry(...args) : entry;
}

/* ----------------------------------------------------------------- helpers */

/**
 * `el.hidden = x` cannot be used on SVG elements (hidden is an HTMLElement
 * property), so the attribute is toggled instead -- it works on both.
 */
function setHidden(element, hide) {
  element.toggleAttribute("hidden", Boolean(hide));
}

function moreInfo(source, entityId) {
  if (!entityId) return;
  const event = new Event("hass-more-info", { bubbles: true, composed: true });
  event.detail = { entityId };
  source.dispatchEvent(event);
}

/** The frontend's own translated state text, with a plain fallback. */
function displayState(hass, stateObj) {
  if (!stateObj) return "--";
  if (hass.formatEntityState) {
    try {
      return hass.formatEntityState(stateObj);
    } catch (err) {
      /* fall through */
    }
  }
  const unit = stateObj.attributes.unit_of_measurement;
  return unit ? `${stateObj.state} ${unit}` : stateObj.state;
}

/** Drop trailing zeros: 1.50 -> 1.5, 2.00 -> 2. */
function trim(value, decimals = 1) {
  return String(Number(Number(value).toFixed(decimals)));
}

/* The tile every card of the dashboard-cards suite shares: generous corners,
   a hairline border, a soft shadow, and a light along the top edge. */
const PID_BASE_STYLES = `
:host {
  --dc-tint: #7ee6c8;
  --dc-ink: var(--primary-text-color, #e8ecf1);
  --dc-muted: var(--secondary-text-color, #93a0b4);
  --dc-surface: var(--ha-card-background, var(--card-background-color, #16181d));
  display: block;
  min-width: 0;
}
[hidden] { display: none !important; }
ha-card {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: var(--dc-card-radius, 24px);
  border: 1px solid color-mix(in srgb, var(--dc-ink) 9%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent),
    0 1px 2px color-mix(in srgb, #000 8%, transparent),
    0 14px 30px -22px color-mix(in srgb, #000 40%, transparent);
  background:
    radial-gradient(130% 100% at 100% 0%, color-mix(in srgb, var(--dc-tint) 13%, transparent), transparent 60%),
    var(--dc-surface);
}
ha-card::after {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--dc-tint) 80%, #fff), transparent);
  background-size: 40% 100%;
  background-repeat: no-repeat;
  animation: dc-edge 7s ease-in-out infinite;
  animation-delay: var(--dc-edge-delay, 0s);
  opacity: .8;
  pointer-events: none;
}
@keyframes dc-edge { 0% { background-position: -60% 0; } 60%, 100% { background-position: 160% 0; } }
@keyframes rise-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

/* ------------------------------------------------------------------- card */

/**
 * Before going out, in one panel: the rain radar around home and the next
 * departures from the PID stops, with the service alerts that apply to them.
 *
 * Departures come from the PID Departure Boards integration
 * (pid_departures_dev): every board is a device, found in the entity
 * registry by translation key, so nothing has to be named in the config.
 *
 * The radar is ČHMÚ's open-data composite -- the Czech Hydrometeorological
 * Institute's own, every 5 minutes at 1 km -- laid over Home Assistant's own
 * map tiles, the ones its map card uses: served by the instance with a token
 * it hands out, so there is no key to sign up for. RainViewer is the fallback
 * outside the Czech Republic: worldwide, but every 10 minutes and only up to
 * zoom 7.
 */
const TRANSIT_TILE = 256;
const TRANSIT_ROUTE_ICON = {
  tram: "mdi:tram",
  metro: "mdi:subway-variant",
  train: "mdi:train",
  bus: "mdi:bus",
  ferry: "mdi:ferry",
  funicular: "mdi:gondola",
  trolleybus: "mdi:bus-electric",
  unknown: "mdi:bus",
};
const CHMI_BASE = "https://opendata.chmi.cz/meteorology/weather/radar/composite";
const CHMI_PRODUCTS = {
  // Maximum reflectivity, with what does not reach the ground paled out.
  maxz: (stamp) => `${CHMI_BASE}/maxz/png_masked/pacz2gmaps3.z_max3d.${stamp}.0.png`,
  // Reflectivity 2 km up: the one used to estimate rain on the ground.
  cappi: (stamp) => `${CHMI_BASE}/pseudocappi2km/png/pacz2gmaps3.z_cappi020.${stamp}.0.png`,
};
// The whole PNG, in EPSG:3857 like the base map. Only its lower-left part is
// map: past x 598 come side profiles, and y 82-96 carry a caption.
const CHMI_IMAGE = { west: 11.267, east: 20.77, south: 48.047, north: 52.167, width: 680, height: 460 };
const CHMI_CROP = { right: 598, top: 97 };
const CHMI_STEP_MS = 5 * 60 * 1000;
// ČHMÚ's own colour scale, weakest to strongest echo.
const TRANSIT_LEGEND = [
  "#380070", "#3000a8", "#0000fc", "#006cc0", "#00a000", "#00bc00", "#34d800",
  "#9cdc00", "#e0dc00", "#fcb000", "#fc5800", "#fc0000", "#a00000",
];
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
// Home Assistant's tile proxy; the token rotates every 30 minutes upstream.
const HA_TILES = "/api/map_tiles/raster/{z}/{x}/{y}.png";
const HA_TILES_TOKEN_MS = 20 * 60 * 1000;
const RAINVIEWER_MAX_ZOOM = 7;
const TRANSIT_WEATHER_ICON = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};
// How far ahead the vehicle on a row's little road starts its approach.
const TRANSIT_ROAD_MIN = 20;

function transitMercX(lon, zoom) {
  return ((lon + 180) / 360) * TRANSIT_TILE * 2 ** zoom;
}

function transitMercY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * TRANSIT_TILE * 2 ** zoom;
}

/** "20261022.0355": how ČHMÚ names a frame, in UTC. */
function chmiStamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `.${p(date.getUTCHours())}${p(date.getUTCMinutes())}`
  );
}

/** PID's own colours per line: metro A/B/C, the dark tram red, bus blue. */
function transitRouteTint(type, name, night) {
  if (night) return "#5b4b8a";
  switch (type) {
    case "tram":
      return "#7d0403";
    case "metro":
      if (name === "A") return "#078943";
      if (name === "B") return "#ffcc00";
      if (name === "C") return "#e2231a";
      return "#1f9d8f";
    case "train":
      return "#7b3f99";
    case "trolleybus":
      return "#00a3c4";
    case "ferry":
      return "#2f7fbf";
    case "funicular":
      return "#e08a1e";
    default:
      return "#0066b3";
  }
}

function transitTrailingIndex(entityId) {
  const match = entityId.match(/_(\d+)$/);
  return match ? Number(match[1]) : 0;
}

class PidTransitCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._rows = new Map();
    this._frames = [];
    this._frameIndex = -1;
    this._playing = true;
    this._hold = 0;
    this._zoomDelta = 0;
    this._mode = "rain";
    this._focus = null;
  }

  static getStubConfig() {
    return { type: "custom:pid-transit-card" };
  }

  static getConfigElement() {
    return document.createElement("pid-transit-card-editor");
  }

  setConfig(config) {
    const num = (value, fallback, min, max) => {
      const n = Number(value);
      return Number.isFinite(n) && value !== null && value !== "" ? Math.min(max, Math.max(min, n)) : fallback;
    };
    this._config = {
      sort_by: "time",
      show_alerts: true,
      show_radar: true,
      radar_source: "chmi",
      radar_product: "maxz",
      ...config,
      rows: num(config.rows, 12, 1, 40),
      zoom: num(config.zoom, 9, 5, 12),
      live_zoom: num(config.live_zoom, 14, 10, 17),
      past_minutes: num(config.past_minutes, 60, 10, 180),
      max_minutes_ahead: num(config.max_minutes_ahead, 0, 0, 600),
    };
    this._built = false;
    this._rows = new Map();
    this._frames = [];
    this._frameIndex = -1;
    this._zoomDelta = 0;
    this._mode = "rain";
    this._focus = null;
    this._mapKey = "";
    this._radarKey = "";
    this.shadowRoot.innerHTML = "";
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto", min_columns: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._update();
  }

  connectedCallback() {
    if (!this.style.getPropertyValue("--dc-edge-delay")) {
      this.style.setProperty("--dc-edge-delay", `${(-Math.random() * 7).toFixed(2)}s`);
    }
    this._stopTimers();
    // One tick a second for the countdowns, one a minute to look for new
    // radar frames, and the animation's own pace.
    this._tick = setInterval(() => this._built && this._everySecond(), 1000);
    this._radarPoll = setInterval(() => this._built && this._refreshRadar(), 60000);
    this._tokenPoll = setInterval(() => this._built && this._fetchTileToken(), HA_TILES_TOKEN_MS);
    this._anim = setInterval(() => this._built && this._advance(), 700);
    if (this._built) this._refreshRadar(true);
  }

  disconnectedCallback() {
    this._stopTimers();
    if (this._resize) this._resize.disconnect();
  }

  _stopTimers() {
    clearInterval(this._tick);
    clearInterval(this._radarPoll);
    clearInterval(this._anim);
    clearInterval(this._tokenPoll);
  }

  /** Ask Home Assistant for the token its own map tiles need. */
  async _fetchTileToken() {
    if (this._config.map_url || !this._hass || !this._hass.callWS) return;
    try {
      const reply = await this._hass.callWS({ type: "map_tiles/access_token" });
      if (reply && reply.token && reply.token !== this._tileToken) {
        this._tileToken = reply.token;
        this._mapKey = "";
        this._layoutMap();
      }
    } catch (err) {
      // An older Home Assistant without the tile proxy: the radar still works
      // on a plain background, and map_url can name a tile server instead.
      this._tileToken = null;
    }
  }

  _tileTemplate() {
    if (this._config.map_url) return this._config.map_url;
    return this._tileToken ? `${HA_TILES}?token=${encodeURIComponent(this._tileToken)}` : null;
  }

  _language() {
    return (this._hass && this._hass.locale && this._hass.locale.language) || navigator.language || "it";
  }

  _clock(date, seconds = false) {
    try {
      return new Intl.DateTimeFormat(this._language(), {
        hour: "2-digit",
        minute: "2-digit",
        ...(seconds ? { second: "2-digit" } : {}),
      }).format(date);
    } catch (err) {
      return date.toTimeString().slice(0, seconds ? 8 : 5);
    }
  }

  /* ----- data ----- */

  _deviceIds() {
    const wanted = this._config.device_ids;
    if (Array.isArray(wanted) && wanted.length) return wanted;
    if (typeof wanted === "string" && wanted) return [wanted];
    // None given: every PID board in the house, in registry order.
    const ids = [];
    for (const entry of Object.values(this._hass.entities || {})) {
      if (entry.platform === "pid_departures_dev" && entry.device_id && !ids.includes(entry.device_id)) {
        ids.push(entry.device_id);
      }
    }
    return ids;
  }

  _boards() {
    const registry = this._hass.entities || {};
    return this._deviceIds().map((deviceId, index) => {
      const roles = {};
      for (const [entityId, entry] of Object.entries(registry)) {
        if (entry.device_id !== deviceId) continue;
        const key = entry.translation_key || "unknown";
        (roles[key] = roles[key] || []).push(entityId);
      }
      for (const key of Object.keys(roles)) {
        roles[key].sort((a, b) => transitTrailingIndex(a) - transitTrailingIndex(b));
      }
      const st = (role) => this._hass.states[(roles[role] || [])[0]] || null;
      const departures = (roles.route_name || []).map((id) => this._hass.states[id]).filter(Boolean);
      const first = departures.find((d) => d.attributes && d.attributes.latitude !== undefined);
      const lat = Number(first ? first.attributes.latitude : (st("latitude") || {}).state);
      const lon = Number(first ? first.attributes.longitude : (st("longitude") || {}).state);
      const device = this._hass.devices ? this._hass.devices[deviceId] : null;
      const stopName = (st("stop_name") && st("stop_name").state) || (device && (device.name_by_user || device.name)) || deviceId;
      const vehicleId = (roles.next_vehicle || [])[0];
      const live = st("live_vehicles");
      return {
        deviceId,
        index,
        stopName,
        platform: st("platform") && st("platform").state,
        updated: st("updated"),
        infotext: st("infotext"),
        infotextId: (roles.infotext || [])[0],
        vehicleId,
        vehicle: vehicleId ? this._hass.states[vehicleId] : null,
        liveId: (roles.live_vehicles || [])[0],
        live: live && Array.isArray(live.attributes.vehicles) ? live.attributes.vehicles : null,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        departures: (roles.route_name || [])
          .map((entityId) => ({ entityId, state: this._hass.states[entityId] }))
          .filter((d) => d.state && d.state.state !== "unavailable"),
      };
    });
  }

  _home() {
    const lat = Number(this._config.latitude);
    const lon = Number(this._config.longitude);
    if (this._config.latitude !== undefined && this._config.latitude !== "" && Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
    const config = this._hass.config || {};
    if (Number.isFinite(config.latitude) && Number.isFinite(config.longitude)) {
      return { lat: config.latitude, lon: config.longitude };
    }
    return { lat: 50.0755, lon: 14.4378 };
  }

  /* ----- build ----- */

  _build() {
    const style = document.createElement("style");
    style.textContent = PID_BASE_STYLES + TRANSIT_STYLES;
    const card = document.createElement("ha-card");
    card.className = "transit";
    card.innerHTML = TRANSIT_TEMPLATE;
    this.shadowRoot.innerHTML = "";
    this.shadowRoot.append(style, card);
    this._card = card;
    for (const node of card.querySelectorAll("[data-i18n]")) node.textContent = t(this._hass, node.dataset.i18n);
    for (const node of card.querySelectorAll("[data-i18n-label]")) {
      node.setAttribute("aria-label", t(this._hass, node.dataset.i18nLabel));
      node.title = t(this._hass, node.dataset.i18nLabel);
    }
    this._el = {};
    for (const node of card.querySelectorAll("[data-ref]")) this._el[node.dataset.ref] = node;

    setHidden(this._el.tRadar, this._config.show_radar === false);
    card.classList.toggle("no-radar", this._config.show_radar === false);
    this._el.legend.style.setProperty("--scale", `linear-gradient(90deg, ${TRANSIT_LEGEND.join(", ")})`);

    this._el.play.addEventListener("click", () => {
      this._playing = !this._playing;
      this._hold = 0;
      this._el.play.dataset.playing = String(this._playing);
    });
    this._el.zoomIn.addEventListener("click", () => this._zoomBy(1));
    this._el.zoomOut.addEventListener("click", () => this._zoomBy(-1));
    this._el.recenter.addEventListener("click", () => {
      this._zoomDelta = 0;
      this._focus = null;
      this._layoutMap();
    });
    this._el.modeRain.addEventListener("click", () => this._setMode("rain"));
    this._el.modeLive.addEventListener("click", () => this._setMode("live"));
    this._el.weather.addEventListener("click", () => moreInfo(this, this._config.weather));

    this._resize = new ResizeObserver(() => this._layoutMap());
    this._resize.observe(this._el.map);

    this._built = true;
    this._fetchTileToken();
    this._refreshRadar(true);
  }

  _zoomBy(step) {
    const base = this._baseZoom();
    this._zoomDelta = Math.max(5 - base, Math.min(18 - base, this._zoomDelta + step));
    this._layoutMap();
  }

  /* ----- update ----- */

  _update() {
    if (!this._built) return;
    const boards = this._boards();
    this._lastBoards = boards;

    this._el.title.textContent = this._config.title || t(this._hass, "title");
    const weather = this._config.weather ? this._hass.states[this._config.weather] : null;
    setHidden(this._el.weather, !weather);
    if (weather) {
      const temp = weather.attributes.temperature;
      const unit = weather.attributes.temperature_unit || "°";
      this._el.weatherIcon.setAttribute("icon", TRANSIT_WEATHER_ICON[weather.state] || "mdi:weather-cloudy");
      this._el.weatherText.textContent =
        `${displayState(this._hass, weather)}` + (temp !== undefined ? ` · ${trim(temp, 1)} ${unit}` : "");
    }

    this._renderDepartures(boards);
    this._renderAlerts(boards);
    const hasLive = boards.some((b) => b.live && b.live.length);
    setHidden(this._el.modes, !hasLive);
    if (!hasLive && this._mode === "live") this._setMode("rain");
    this._el.liveCount.textContent = hasLive ? String(this._liveVehicles().length) : "";
    this._placeMarkers(boards);
    this._everySecond();
  }

  /** Departures, as keyed rows: a row survives updates, so it can move. */
  _renderDepartures(boards) {
    const now = Date.now();
    const horizon = this._config.max_minutes_ahead;
    const grouped = this._config.sort_by === "stop" && boards.length > 1;
    const items = [];
    boards.forEach((board) => {
      let perBoard = 0;
      board.departures
        .map((d) => ({ ...d, board, time: Date.parse(d.state.attributes.departure_time_est || d.state.attributes.departure_time_sched) }))
        .filter((d) => Number.isFinite(d.time) && d.time > now - 45000)
        .filter((d) => !horizon || d.time - now <= horizon * 60000)
        .sort((a, b) => a.time - b.time)
        .forEach((d) => {
          if (grouped && perBoard >= this._config.rows) return;
          perBoard += 1;
          items.push(d);
        });
    });
    items.sort((a, b) => (grouped ? a.board.index - b.board.index : 0) || a.time - b.time);
    const shown = grouped ? items : items.slice(0, this._config.rows);

    const list = this._el.deps;
    const seen = new Set();
    let lastBoard = null;
    const order = [];
    for (const dep of shown) {
      if (grouped && dep.board !== lastBoard) {
        lastBoard = dep.board;
        const key = `section|${dep.board.deviceId}`;
        seen.add(key);
        let head = this._rows.get(key);
        if (!head) {
          head = { el: document.createElement("div") };
          head.el.className = "section";
          this._rows.set(key, head);
        }
        head.el.textContent = dep.board.stopName + (dep.board.platform ? ` · ${dep.board.platform}` : "");
        order.push(head.el);
      }
      const a = dep.state.attributes;
      const key = `${dep.board.deviceId}|${a.trip_id || dep.entityId}`;
      seen.add(key);
      let row = this._rows.get(key);
      if (!row) {
        row = this._makeRow();
        this._rows.set(key, row);
      }
      row.dep = dep;
      this._fillRow(row, dep, boards.length > 1 && !grouped);
      order.push(row.el);
    }
    // Rows that left: fade them out, then drop them.
    for (const [key, row] of this._rows) {
      if (seen.has(key)) continue;
      this._rows.delete(key);
      if (row.el.classList.contains("dep") && !REDUCED_MOTION.matches) {
        row.el.classList.add("leaving");
        setTimeout(() => row.el.remove(), 450);
      } else {
        row.el.remove();
      }
    }
    order.forEach((el, i) => {
      if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
    });
    setHidden(this._el.depsEmpty, shown.length > 0);
    this._el.depsEmpty.textContent = t(this._hass, boards.length ? "noUpcoming" : "noBoards");
    this._el.stopsChip.textContent =
      boards.length === 1 ? boards[0].stopName : t(this._hass, "stopsCount", boards.length);
    setHidden(this._el.stopsChip, boards.length === 0);
  }

  _makeRow() {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "dep entering";
    el.innerHTML = `
      <span class="line"><ha-icon></ha-icon><b></b></span>
      <span class="dep-main">
        <span class="headsign"></span>
        <span class="dep-sub">
          <span class="stop-tag"></span>
          <span class="plat"></span>
          <span class="gps"><ha-icon icon="mdi:crosshairs-gps"></ha-icon>${t(this._hass, "onMap")}</span>
          <span class="feat"></span>
          <span class="delay"></span>
        </span>
        <span class="road"><i class="road-stop"></i><i class="veh"><ha-icon></ha-icon></i></span>
      </span>
      <span class="when"><span class="count"></span><span class="clock"></span></span>`;
    el.addEventListener("animationend", () => el.classList.remove("entering"), { once: true });
    const row = {
      el,
      lineIcon: el.querySelector(".line ha-icon"),
      lineName: el.querySelector(".line b"),
      line: el.querySelector(".line"),
      headsign: el.querySelector(".headsign"),
      stopTag: el.querySelector(".stop-tag"),
      plat: el.querySelector(".plat"),
      feat: el.querySelector(".feat"),
      delay: el.querySelector(".delay"),
      veh: el.querySelector(".veh"),
      vehIcon: el.querySelector(".veh ha-icon"),
      count: el.querySelector(".count"),
      clock: el.querySelector(".clock"),
    };
    el.addEventListener("click", () => {
      if (!row.dep) return;
      const trip = row.dep.state.attributes.trip_id;
      if (trip && this._config.show_radar !== false && this._liveVehicles().some((v) => v.trip_id === trip)) {
        this._setMode("live", trip);
        this._el.map.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        moreInfo(this, row.dep.entityId);
      }
    });
    return row;
  }

  _fillRow(row, dep, showStop) {
    const a = dep.state.attributes;
    const type = a.route_type || "unknown";
    const name = dep.state.state || a.route_name || "?";
    const tint = transitRouteTint(type, name, a.is_night);
    row.el.style.setProperty("--line", tint);
    // Metro B is yellow: it needs dark text.
    row.line.style.color = type === "metro" && name === "B" && !a.is_night ? "#1c1c1c" : "#fff";
    const icon = TRANSIT_ROUTE_ICON[type] || TRANSIT_ROUTE_ICON.unknown;
    row.lineIcon.setAttribute("icon", icon);
    row.vehIcon.setAttribute("icon", icon);
    row.lineName.textContent = name;
    row.headsign.textContent = a.trip_headsign || "";
    row.stopTag.textContent = showStop ? dep.board.stopName : "";
    row.plat.textContent = a.stop_platform ? t(this._hass, "platform", a.stop_platform) : "";
    row.el.classList.toggle("canceled", Boolean(a.is_canceled));
    row.el.classList.toggle("at-stop", Boolean(a.is_at_stop));

    const feats = [];
    if (a.is_air_conditioned) feats.push("mdi:snowflake");
    if (a.is_wheelchair_accessible) feats.push("mdi:wheelchair-accessibility");
    if (a.is_night) feats.push("mdi:weather-night");
    if (a.is_substitute) feats.push("mdi:swap-horizontal-bold");
    const tracked = a.trip_id && (dep.board.live || []).some((v) => v.trip_id === a.trip_id);
    row.el.classList.toggle("tracked", Boolean(tracked));
    const featKey = feats.join(",");
    if (row.featKey !== featKey) {
      row.featKey = featKey;
      row.feat.innerHTML = feats.map((f) => `<ha-icon icon="${f}"></ha-icon>`).join("");
    }

    const delaySec = a.is_delay_avail ? Number(a.delay_sec) || 0 : 0;
    const delayMin = Math.round(delaySec / 60);
    row.delay.textContent = a.is_canceled ? t(this._hass, "canceled") : delayMin >= 1 ? `+${delayMin} min` : "";
    row.delay.dataset.level = a.is_canceled ? "bad" : delayMin >= 5 ? "bad" : delayMin >= 1 ? "warn" : "";

    const est = new Date(dep.time);
    const sched = Date.parse(a.departure_time_sched);
    row.clock.innerHTML = "";
    if (delayMin >= 1 && Number.isFinite(sched)) {
      const old = document.createElement("s");
      old.textContent = this._clock(new Date(sched));
      row.clock.append(old, " ");
    }
    row.clock.append(this._clock(est));
  }

  /** Live countdowns and the vehicles on the rows' roads. */
  _everySecond() {
    const now = Date.now();
    this._el.clockNow.textContent = this._clock(new Date(), true);
    let expired = false;
    for (const row of this._rows.values()) {
      if (!row.dep) continue;
      const left = (row.dep.time - now) / 1000;
      if (left < -45) {
        expired = true;
        continue;
      }
      let text;
      if (left < 45) text = t(this._hass, "now");
      else if (left < 600) text = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
      else text = `${Math.round(left / 60)} min`;
      row.count.textContent = text;
      row.el.dataset.soon = left < 45 ? "now" : left < 120 ? "close" : left < 300 ? "near" : "far";
      // The vehicle covers the road in the last 20 minutes.
      const progress = 1 - Math.min(1, Math.max(0, left / (TRANSIT_ROAD_MIN * 60)));
      row.veh.style.left = `${(progress * 100).toFixed(2)}%`;
    }
    if (expired && this._lastBoards) this._renderDepartures(this._lastBoards);

    const updated = (this._lastBoards || [])
      .map((b) => b.updated && Date.parse(b.updated.state))
      .filter(Number.isFinite);
    if (updated.length) {
      const ago = Math.max(0, Math.round((now - Math.max(...updated)) / 1000));
      this._el.updated.textContent = t(this._hass, "updated", ago < 60 ? `${ago} s` : `${Math.round(ago / 60)} min`);
    } else {
      this._el.updated.textContent = "";
    }
  }

  /** Service alerts, the same text announced at several stops only once. */
  _renderAlerts(boards) {
    const show = this._config.show_alerts !== false;
    const byText = new Map();
    for (const board of boards) {
      if (!board.infotext || board.infotext.state !== "on") continue;
      for (const item of board.infotext.attributes.infotexts || []) {
        const original = item.text || item.header || "";
        const text = item.text_translated || original;
        if (!text) continue;
        const entry = byText.get(text) || { text, original: item.text_translated && item.text_translated !== original ? original : "", stops: [], entityId: board.infotextId };
        if (!entry.stops.includes(board.stopName)) entry.stops.push(board.stopName);
        byText.set(text, entry);
      }
    }
    const alerts = [...byText.values()];
    setHidden(this._el.tAlerts, !show || alerts.length === 0);
    this._el.alertsChip.textContent = alerts.length ? t(this._hass, "alertsCount", alerts.length) : t(this._hass, "noAlerts");
    this._el.alertsChip.dataset.alert = String(alerts.length > 0);
    setHidden(this._el.alertsChip, !show);
    const key = alerts.map((a) => a.text + a.stops.join()).join("|");
    if (key === this._alertsKey) return;
    this._alertsKey = key;
    this._el.alerts.innerHTML = "";
    for (const alert of alerts) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "alert";
      item.innerHTML = `<ha-icon icon="mdi:alert-rhombus"></ha-icon><span class="al-body"><span class="al-stops"></span><span class="al-text"></span><span class="al-orig"></span></span>`;
      item.querySelector(".al-stops").textContent = alert.stops.join(" · ");
      item.querySelector(".al-text").textContent = alert.text;
      item.querySelector(".al-orig").textContent = alert.original;
      item.addEventListener("click", () => moreInfo(this, alert.entityId));
      this._el.alerts.appendChild(item);
    }
  }

  /* ----- map ----- */

  _baseZoom() {
    return this._mode === "live" ? this._config.live_zoom : this._config.zoom;
  }

  _zoom() {
    return Math.max(5, Math.min(18, this._baseZoom() + this._zoomDelta));
  }

  /** Every live vehicle once, whichever stops' boards it appears on. */
  _liveVehicles() {
    const seen = new Map();
    for (const board of this._lastBoards || []) {
      for (const v of board.live || []) {
        const key = v.vehicle_id || v.trip_id;
        const known = seen.get(key);
        if (!known || (v.to_stop && !known.to_stop)) seen.set(key, { ...v, board });
      }
    }
    return [...seen.values()];
  }

  /** Home for the rain; the stops (or the followed vehicle) for the vehicles. */
  _center() {
    if (this._mode === "live") {
      if (this._focus) {
        const v = this._liveVehicles().find((x) => x.trip_id === this._focus);
        if (v) return { lat: Number(v.latitude), lon: Number(v.longitude) };
      }
      const stops = (this._lastBoards || []).filter((b) => b.lat !== null && b.lon !== null);
      if (stops.length) {
        return {
          lat: stops.reduce((sum, b) => sum + b.lat, 0) / stops.length,
          lon: stops.reduce((sum, b) => sum + b.lon, 0) / stops.length,
        };
      }
    }
    return this._home();
  }

  _setMode(mode, focus = null) {
    if (mode !== this._mode) this._zoomDelta = 0;
    this._mode = mode;
    this._focus = focus;
    this._card.dataset.mode = mode;
    this._el.modeRain.setAttribute("aria-pressed", String(mode === "rain"));
    this._el.modeLive.setAttribute("aria-pressed", String(mode === "live"));
    this._el.mapTitle.textContent = t(this._hass, mode === "live" ? "liveTitle" : "radarTitle");
    this._layoutMap();
  }

  /** Base map tiles around home, the radar image placed on them, markers. */
  _layoutMap() {
    if (!this._built || this._config.show_radar === false) return;
    const map = this._el.map;
    const width = map.clientWidth;
    const height = map.clientHeight;
    if (!width || !height) return;
    const zoom = this._zoom();
    const center = this._center();
    const ox = transitMercX(center.lon, zoom) - width / 2;
    const oy = transitMercY(center.lat, zoom) - height / 2;
    // A new view is a jump, not a journey: no gliding markers across it.
    const viewKey = `${zoom}|${Math.round(ox)}|${Math.round(oy)}`;
    if (this._view && this._viewKey !== viewKey) {
      this._el.marks.classList.add("snap");
      requestAnimationFrame(() => requestAnimationFrame(() => this._el.marks.classList.remove("snap")));
    }
    this._viewKey = viewKey;
    this._view = { zoom, ox, oy, width, height };

    const dark = Boolean(this._hass && this._hass.themes && this._hass.themes.darkMode);
    const template = this._tileTemplate();
    const key = `${zoom}|${Math.round(ox)}|${Math.round(oy)}|${width}|${height}|${template}`;
    this._el.map.dataset.dark = String(dark);
    this._el.map.dataset.base = String(Boolean(template));
    if (key !== this._mapKey) {
      this._mapKey = key;
      const n = 2 ** zoom;
      let html = "";
      for (let ty = Math.floor(oy / TRANSIT_TILE); template && ty <= Math.floor((oy + height) / TRANSIT_TILE); ty += 1) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = Math.floor(ox / TRANSIT_TILE); tx <= Math.floor((ox + width) / TRANSIT_TILE); tx += 1) {
          const wrapped = ((tx % n) + n) % n;
          const url = template.replace("{z}", zoom).replace("{x}", wrapped).replace("{y}", ty);
          html +=
            `<img alt="" src="${url}" style="left:${(tx * TRANSIT_TILE - ox).toFixed(1)}px;` +
            `top:${(ty * TRANSIT_TILE - oy).toFixed(1)}px">`;
        }
      }
      this._el.tiles.innerHTML = html;
    }
    this._layoutRadar();
    if (this._lastBoards) this._placeMarkers(this._lastBoards);
  }

  _layoutRadar() {
    if (!this._view) return;
    const { zoom, ox, oy } = this._view;
    if (this._config.radar_source === "rainviewer") {
      this._layoutRainViewer();
      return;
    }
    const left = transitMercX(CHMI_IMAGE.west, zoom) - ox;
    const top = transitMercY(CHMI_IMAGE.north, zoom) - oy;
    const width = transitMercX(CHMI_IMAGE.east, zoom) - transitMercX(CHMI_IMAGE.west, zoom);
    const height = transitMercY(CHMI_IMAGE.south, zoom) - transitMercY(CHMI_IMAGE.north, zoom);
    const cropTop = (height * CHMI_CROP.top) / CHMI_IMAGE.height;
    const clip = this._el.radar;
    clip.style.left = `${left}px`;
    clip.style.top = `${top + cropTop}px`;
    clip.style.width = `${(width * CHMI_CROP.right) / CHMI_IMAGE.width}px`;
    clip.style.height = `${height - cropTop}px`;
    const frames = this._el.frames;
    frames.style.left = "0px";
    frames.style.top = `${-cropTop}px`;
    frames.style.width = `${width}px`;
    frames.style.height = `${height}px`;
  }

  _layoutRainViewer() {
    const { zoom, ox, oy, width, height } = this._view;
    const clip = this._el.radar;
    clip.style.left = "0px";
    clip.style.top = "0px";
    clip.style.width = `${width}px`;
    clip.style.height = `${height}px`;
    Object.assign(this._el.frames.style, { left: "0px", top: "0px", width: `${width}px`, height: `${height}px` });
    // Free tiles stop at zoom 7: draw those, scaled up to the map's zoom.
    const z = Math.min(zoom, RAINVIEWER_MAX_ZOOM);
    const scale = 2 ** (zoom - z);
    const size = TRANSIT_TILE * scale;
    const key = `${zoom}|${Math.round(ox)}|${Math.round(oy)}|${width}|${height}|${this._frames.map((f) => f.path).join()}`;
    if (key === this._radarKey) return;
    this._radarKey = key;
    const n = 2 ** z;
    for (const frame of this._frames) {
      let html = "";
      for (let ty = Math.floor(oy / size); ty <= Math.floor((oy + height) / size); ty += 1) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = Math.floor(ox / size); tx <= Math.floor((ox + width) / size); tx += 1) {
          const wrapped = ((tx % n) + n) % n;
          html +=
            `<img alt="" src="${this._rainHost}${frame.path}/256/${z}/${wrapped}/${ty}/2/1_1.png" ` +
            `style="left:${(tx * size - ox).toFixed(1)}px;top:${(ty * size - oy).toFixed(1)}px;width:${size}px;height:${size}px">`;
        }
      }
      frame.el.innerHTML = html;
    }
  }

  _placeMarkers(boards) {
    if (!this._view || this._config.show_radar === false) return;
    // The followed vehicle moved: move the map with it.
    if (this._mode === "live" && this._focus && !this._following) {
      const c = this._center();
      const zoom = this._view.zoom;
      if (Math.abs(transitMercX(c.lon, zoom) - this._view.width / 2 - this._view.ox) > 1 ||
          Math.abs(transitMercY(c.lat, zoom) - this._view.height / 2 - this._view.oy) > 1) {
        this._following = true;
        this._layoutMap();
        this._following = false;
        return;
      }
    }
    const { zoom, ox, oy } = this._view;
    const at = (lat, lon) => ({ x: transitMercX(lon, zoom) - ox, y: transitMercY(lat, zoom) - oy });
    const home = at(this._home().lat, this._home().lon);
    const live = this._liveVehicles();
    const zoomedIn = zoom >= 12;
    this._el.homeMark.style.transform = `translate(${home.x}px, ${home.y}px)`;

    const layer = this._el.marks;
    const wanted = new Map();
    for (const board of boards) {
      if (board.lat !== null && board.lon !== null) {
        wanted.set(`stop|${board.deviceId}`, { kind: "stop", board, ...at(board.lat, board.lon) });
      }
      const v = board.vehicle;
      // The single tracked vehicle is only needed where there is no live list.
      if (!board.live && v && Number.isFinite(Number(v.attributes.latitude)) && Number.isFinite(Number(v.attributes.longitude))) {
        wanted.set(`veh|${board.deviceId}`, {
          kind: "veh",
          board,
          bearing: Number(v.attributes.bearing) || 0,
          tracking: Boolean(v.attributes.is_tracking),
          ...at(Number(v.attributes.latitude), Number(v.attributes.longitude)),
        });
      }
    }
    for (const v of live) {
      const lat = Number(v.latitude);
      const lon = Number(v.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // Zoomed out, only what is coming to the stops: the rest is a cloud of dots.
      if (!zoomedIn && !v.to_stop) continue;
      wanted.set(`live|${v.vehicle_id || v.trip_id}`, { kind: "live", vehicle: v, board: v.board, ...at(lat, lon) });
    }
    this._marks = this._marks || new Map();
    for (const [key, mark] of this._marks) {
      if (!wanted.has(key)) {
        mark.remove();
        this._marks.delete(key);
      }
    }
    for (const [key, m] of wanted) {
      let el = this._marks.get(key);
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = `mark ${m.kind}`;
        el.innerHTML =
          m.kind === "stop"
            ? `<ha-icon icon="mdi:bus-stop"></ha-icon>`
            : m.kind === "live"
              ? `<i class="arrow"></i><b></b>`
              : `<i class="arrow"></i><ha-icon icon="mdi:crosshairs-gps"></ha-icon>`;
        el.addEventListener("click", () => {
          const mark = el._mark;
          if (mark.kind === "live") {
            this._setMode("live", mark.vehicle.trip_id);
            return;
          }
          moreInfo(this, mark.kind === "stop" ? mark.board.departures[0] && mark.board.departures[0].entityId : mark.board.vehicleId);
        });
        layer.appendChild(el);
        this._marks.set(key, el);
      }
      el._mark = m;
      el.title = m.board.stopName;
      if (m.kind === "live") {
        const v = m.vehicle;
        el.querySelector("b").textContent = v.route || "";
        el.style.setProperty("--line", transitRouteTint(v.route_type, v.route, false));
        el.style.setProperty("--bearing", `${Number(v.bearing) || 0}deg`);
        el.classList.toggle("has-bearing", v.bearing !== null && v.bearing !== undefined);
        el.classList.toggle("coming", Boolean(v.to_stop));
        el.classList.toggle("focus", v.trip_id === this._focus);
        el.classList.toggle("at-stop", v.state === "at_stop");
        el.style.color = v.route_type === "metro" && v.route === "B" ? "#1c1c1c" : "#fff";
        const delay = Math.round((Number(v.delay) || 0) / 60);
        el.title = `${v.route || ""} → ${v.headsign || "?"}` + (delay >= 1 ? ` · +${delay} min` : "");
      }
      el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      if (m.kind === "veh") {
        el.style.setProperty("--bearing", `${m.bearing}deg`);
        el.dataset.tracking = String(m.tracking);
        const first = m.board.departures[0];
        const a = first ? first.state.attributes : {};
        el.style.setProperty("--line", transitRouteTint(a.route_type, first && first.state.state, a.is_night));
      }
    }
  }

  /* ----- radar frames ----- */

  async _refreshRadar(force = false) {
    if (this._config.show_radar === false) return;
    if (this._config.radar_source === "rainviewer") {
      await this._refreshRainViewer(force);
    } else {
      this._refreshChmi(force);
    }
  }

  /** The last hour of ČHMÚ frames: names are predictable, so no listing. */
  _refreshChmi(force) {
    // A frame is published about three minutes after the five it covers.
    const latest = Math.floor((Date.now() - 3.5 * 60000) / CHMI_STEP_MS) * CHMI_STEP_MS;
    if (!force && latest === this._latest) return;
    this._latest = latest;
    const count = Math.round(this._config.past_minutes / 5) + 1;
    const product = CHMI_PRODUCTS[this._config.radar_product] || CHMI_PRODUCTS.maxz;
    const times = Array.from({ length: count }, (_, i) => latest - (count - 1 - i) * CHMI_STEP_MS);
    const keep = new Map(this._frames.map((f) => [f.time, f]));
    const frames = times.map((time) => {
      const old = keep.get(time);
      if (old) {
        keep.delete(time);
        return old;
      }
      const img = document.createElement("img");
      img.alt = "";
      img.className = "frame";
      const frame = { time, el: img, ok: null };
      img.addEventListener("load", () => {
        frame.ok = true;
        this._renderTimeline();
      });
      img.addEventListener("error", () => {
        frame.ok = false;
        this._renderTimeline();
      });
      img.src = product(chmiStamp(new Date(time)));
      this._el.frames.appendChild(img);
      return frame;
    });
    for (const old of keep.values()) old.el.remove();
    this._frames = frames;
    if (this._frameIndex < 0 || this._frameIndex >= frames.length) this._frameIndex = frames.length - 1;
    this._radarCredit("Radar © ČHMÚ");
    this._renderTimeline();
    this._layoutMap();
  }

  async _refreshRainViewer(force) {
    if (!force && Date.now() - (this._rainAt || 0) < 5 * 60000) return;
    this._rainAt = Date.now();
    let data;
    try {
      data = await (await fetch(RAINVIEWER_API)).json();
    } catch (err) {
      console.warn("pid-transit-card: RainViewer unreachable", err);
      return;
    }
    this._rainHost = data.host;
    const past = ((data.radar && data.radar.past) || []).filter(
      (f) => f.time * 1000 >= Date.now() - this._config.past_minutes * 60000 - 10 * 60000
    );
    this._el.frames.innerHTML = "";
    this._frames = past.map((f) => {
      const el = document.createElement("div");
      el.className = "frame";
      this._el.frames.appendChild(el);
      return { time: f.time * 1000, path: f.path, el, ok: true };
    });
    this._frameIndex = this._frames.length - 1;
    this._radarKey = "";
    this._radarCredit("Radar © RainViewer");
    this._layoutMap();
    this._renderTimeline();
  }

  _radarCredit(text) {
    this._el.credit.textContent = `${text} · © OpenStreetMap`;
  }

  /** One step of the loop: through the hour, then a pause on the latest. */
  _advance() {
    if (!this._playing || REDUCED_MOTION.matches || !this._frames.length) return;
    const last = this._lastGood();
    if (this._frameIndex === last && this._hold < 3) {
      this._hold += 1;
      return;
    }
    this._hold = 0;
    let next = this._frameIndex;
    for (let i = 0; i < this._frames.length; i += 1) {
      next = (next + 1) % this._frames.length;
      if (this._frames[next].ok !== false) break;
    }
    this._show(next);
  }

  _lastGood() {
    for (let i = this._frames.length - 1; i >= 0; i -= 1) if (this._frames[i].ok) return i;
    return this._frames.length - 1;
  }

  _show(index) {
    this._frameIndex = index;
    this._frames.forEach((f, i) => f.el.classList.toggle("on", i === index));
    this._renderTimeline();
  }

  _renderTimeline() {
    const frames = this._frames;
    const bar = this._el.ticks;
    if (bar.childElementCount !== frames.length) {
      bar.innerHTML = "";
      frames.forEach((_, i) => {
        const tick = document.createElement("button");
        tick.type = "button";
        tick.className = "tick";
        tick.addEventListener("click", () => {
          this._playing = false;
          this._el.play.dataset.playing = "false";
          this._show(i);
        });
        bar.appendChild(tick);
      });
    }
    if (this._frameIndex < 0 || this._frameIndex >= frames.length) this._frameIndex = this._lastGood();
    frames.forEach((f, i) => {
      f.el.classList.toggle("on", i === this._frameIndex);
      const tick = bar.children[i];
      tick.dataset.state = f.ok === false ? "missing" : f.ok ? "ok" : "loading";
      tick.classList.toggle("current", i === this._frameIndex);
    });
    const frame = frames[this._frameIndex];
    if (!frame) {
      this._el.frameTime.textContent = "--:--";
      this._el.frameAgo.textContent = "";
      return;
    }
    this._el.frameTime.textContent = this._clock(new Date(frame.time));
    const ago = Math.round((Date.now() - frame.time) / 60000);
    const isLatest = this._frameIndex === this._lastGood();
    this._el.frameAgo.textContent = isLatest ? t(this._hass, "latest") : `−${ago} min`;
    this._el.frameAgo.dataset.latest = String(isLatest);
  }
}

const TRANSIT_TEMPLATE = `
<div class="bar">
  <span class="bar-title" data-ref="title"></span>
  <span class="now" data-ref="clockNow">--:--:--</span>
  <span class="spacer"></span>
  <button type="button" class="chip weather" data-ref="weather" hidden><ha-icon data-ref="weatherIcon"></ha-icon><span data-ref="weatherText"></span></button>
  <span class="chip alerts-chip" data-ref="alertsChip"></span>
</div>

<div class="grid">
  <section class="tile t-radar" data-ref="tRadar">
    <div class="t-head">
      <span class="t-title"><ha-icon icon="mdi:radar"></ha-icon><span data-ref="mapTitle" data-i18n="radarTitle"></span></span>
      <span class="modes" data-ref="modes" hidden>
        <button type="button" data-ref="modeRain" aria-pressed="true"><ha-icon icon="mdi:weather-pouring"></ha-icon><span data-i18n="rain"></span></button>
        <button type="button" data-ref="modeLive" aria-pressed="false"><ha-icon icon="mdi:bus-marker"></ha-icon><span data-i18n="vehicles"></span><b data-ref="liveCount"></b></button>
      </span>
      <span class="frame-label"><span data-ref="frameTime">--:--</span><span class="ago" data-ref="frameAgo"></span></span>
    </div>
    <div class="map" data-ref="map">
      <div class="tiles" data-ref="tiles"></div>
      <div class="radar" data-ref="radar"><div class="frames" data-ref="frames"></div></div>
      <div class="marks" data-ref="marks">
        <span class="mark home" data-ref="homeMark"><i></i><ha-icon icon="mdi:home"></ha-icon></span>
      </div>
      <div class="zoom">
        <button type="button" data-ref="zoomIn" data-i18n-label="zoomIn"><ha-icon icon="mdi:plus"></ha-icon></button>
        <button type="button" data-ref="zoomOut" data-i18n-label="zoomOut"><ha-icon icon="mdi:minus"></ha-icon></button>
        <button type="button" data-ref="recenter" data-i18n-label="recenter"><ha-icon icon="mdi:crosshairs"></ha-icon></button>
      </div>
      <div class="legend" data-ref="legend"><span data-i18n="weak"></span><i></i><span data-i18n="strong"></span></div>
      <div class="credit" data-ref="credit"></div>
    </div>
    <div class="timeline">
      <button type="button" class="play" data-ref="play" data-playing="true" data-i18n-label="playPause">
        <ha-icon class="i-pause" icon="mdi:pause"></ha-icon><ha-icon class="i-play" icon="mdi:play"></ha-icon>
      </button>
      <div class="ticks" data-ref="ticks"></div>
    </div>
  </section>

  <div class="side">
    <section class="tile t-deps">
      <div class="t-head">
        <span class="t-title"><ha-icon icon="mdi:tram"></ha-icon><span data-i18n="departures"></span></span>
        <span class="t-sub"><span class="chip soft" data-ref="stopsChip"></span><span data-ref="updated"></span></span>
      </div>
      <div class="deps" data-ref="deps"></div>
      <div class="empty" data-ref="depsEmpty" hidden></div>
    </section>

    <section class="tile t-alerts" data-ref="tAlerts" hidden>
      <div class="t-head"><span class="t-title"><ha-icon icon="mdi:alert-rhombus-outline"></ha-icon><span data-i18n="alerts"></span></span></div>
      <div class="alerts" data-ref="alerts"></div>
    </section>
  </div>
</div>
`;

const TRANSIT_STYLES = `
:host { height: 100%; }
ha-card.transit {
  --dc-tint: #4fc3ff;
  container-type: inline-size;
  container-name: transit;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 16px;
}

/* --- header --- */
.bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin: 2px 4px 14px; }
.bar-title { font-size: 1.35rem; font-weight: 750; letter-spacing: -.01em; color: var(--dc-ink); }
.now { font-size: 1rem; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--dc-muted); }
.spacer { flex: 1; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 999px;
  font: inherit; font-size: .78rem; font-weight: 650;
  color: var(--dc-ink);
  background: color-mix(in srgb, var(--dc-ink) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--dc-ink) 10%, transparent);
}
.chip ha-icon { --mdc-icon-size: 18px; color: var(--dc-tint); }
button.chip { cursor: pointer; }
.alerts-chip { color: color-mix(in srgb, #3ddc97 65%, var(--dc-ink)); background: color-mix(in srgb, #3ddc97 13%, transparent); border-color: color-mix(in srgb, #3ddc97 30%, transparent); }
.alerts-chip[data-alert="true"] {
  color: color-mix(in srgb, #ffb457 70%, var(--dc-ink));
  background: color-mix(in srgb, #ffb457 15%, transparent);
  border-color: color-mix(in srgb, #ffb457 40%, transparent);
  animation: tr-glow 2.4s ease-in-out infinite;
}
.chip.soft { padding: 2px 9px; font-size: .7rem; }

/* --- layout --- */
.grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
@container transit (min-width: 900px) {
  .grid { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); align-items: stretch; }
  ha-card.no-radar .grid { grid-template-columns: 1fr; }
}
.side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.tile {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--dc-surface) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--dc-ink) 9%, transparent);
  box-shadow: 0 1px 2px color-mix(in srgb, #000 8%, transparent), 0 14px 30px -22px color-mix(in srgb, #000 40%, transparent);
  animation: rise-in 600ms cubic-bezier(.22,.61,.36,1) both;
}
.side .tile:nth-child(1) { animation-delay: 80ms; }
.side .tile:nth-child(2) { animation-delay: 160ms; }
.t-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.t-title { display: inline-flex; align-items: center; gap: 8px; font-size: 1rem; font-weight: 650; color: var(--dc-ink); }
.t-title ha-icon { --mdc-icon-size: 20px; color: color-mix(in srgb, var(--dc-tint) 70%, var(--dc-muted)); }
.t-sub { display: inline-flex; align-items: center; gap: 8px; font-size: .72rem; color: var(--dc-muted); font-variant-numeric: tabular-nums; }
.empty { padding: 18px 6px; color: var(--dc-muted); text-align: center; font-size: .85rem; }

/* --- radar --- */
.frame-label { display: inline-flex; align-items: baseline; gap: 8px; font-size: 1.05rem; font-weight: 750; font-variant-numeric: tabular-nums; color: var(--dc-ink); }
.frame-label .ago { font-size: .72rem; font-weight: 650; color: var(--dc-muted); }
.frame-label .ago[data-latest="true"] { color: color-mix(in srgb, var(--dc-tint) 70%, var(--dc-ink)); }
.map {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  aspect-ratio: 4 / 3;
  min-height: 260px;
  background: color-mix(in srgb, var(--dc-ink) 6%, var(--dc-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dc-ink) 8%, transparent), inset 0 10px 24px -18px color-mix(in srgb, #000 60%, transparent);
}
/* Side by side, the radar stays put while the departures scroll. */
@container transit (min-width: 900px) {
  .t-radar { align-self: start; position: sticky; top: 0; z-index: 1; }
  .t-radar .map { aspect-ratio: 1 / 1; max-height: 640px; }
}
.tiles img { position: absolute; width: 256px; height: 256px; user-select: none; pointer-events: none; }
.map[data-dark="false"] .tiles { filter: saturate(.7) contrast(.95); }
/* Home Assistant's raster map has no dark variant: like its own map card,
   the light one is turned inside out. */
.map[data-dark="true"] .tiles { filter: invert(1) hue-rotate(180deg) saturate(.6) brightness(.9) contrast(.9); }
/* Without a base map, a faint grid keeps the radar from floating in nothing. */
.map[data-base="false"] {
  background-image:
    linear-gradient(color-mix(in srgb, var(--dc-ink) 6%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--dc-ink) 6%, transparent) 1px, transparent 1px);
  background-size: 32px 32px;
}
/* Blended, not pasted: under the weak echoes the city still reads. */
.radar { position: absolute; overflow: hidden; pointer-events: none; mix-blend-mode: multiply; }
.map[data-dark="true"] .radar { mix-blend-mode: screen; }
.frames { position: absolute; }
.frames .frame { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity 380ms ease; }
.frames .frame.on { opacity: .9; }
.frames .frame img { position: absolute; }
.map[data-dark="true"] .frames .frame.on { opacity: .8; }
.marks { position: absolute; inset: 0; pointer-events: none; }
.marks.snap .mark { transition: none !important; }
.mark {
  position: absolute; left: 0; top: 0;
  pointer-events: auto;
  transition: transform 1s linear;
}
.mark.home { width: 0; height: 0; }
.mark.home i {
  position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--dc-tint);
  box-shadow: 0 0 0 3px #fff, 0 2px 6px rgba(0,0,0,.35);
}
.mark.home i::after {
  content: ""; position: absolute; inset: -3px; border-radius: 50%;
  border: 2px solid var(--dc-tint);
  animation: tr-ripple 2.4s ease-out infinite;
}
.mark.home ha-icon { position: absolute; left: -7px; top: -7px; --mdc-icon-size: 14px; color: #fff; }
.mark.stop, .mark.veh {
  width: 26px; height: 26px; margin: -13px 0 0 -13px;
  border-radius: 50%; border: 2px solid #fff; padding: 0;
  display: grid; place-items: center; cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,.35);
}
.mark.stop { background: #e2231a; }
.mark.stop ha-icon { --mdc-icon-size: 15px; color: #fff; }
.mark.veh { --line: #0066b3; background: var(--line); }
.mark.veh ha-icon { --mdc-icon-size: 14px; color: #fff; }
.mark.veh .arrow {
  position: absolute; left: 50%; top: 50%; width: 0; height: 0;
  border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid var(--line);
  transform: translate(-50%, -50%) rotate(var(--bearing, 0deg)) translateY(-20px);
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.4));
}
.mark.veh[data-tracking="true"]::after {
  content: ""; position: absolute; inset: -4px; border-radius: 50%;
  border: 2px solid var(--line);
  animation: tr-ripple 1.8s ease-out infinite;
}
/* Live vehicles: a pill with the line, pointing where it is heading, gliding
   between the 15-second updates instead of jumping. */
.mark.live {
  --line: #0066b3;
  min-width: 26px; height: 20px; margin: -10px 0 0 -13px; padding: 0 5px;
  box-sizing: border-box;
  display: grid; place-items: center;
  border-radius: 999px; border: 2px solid #fff;
  background: var(--line);
  font: inherit; font-size: .62rem; font-weight: 800; letter-spacing: -.01em;
  box-shadow: 0 2px 6px rgba(0,0,0,.35);
  cursor: pointer;
  opacity: .75;
  transition: transform 14s linear, opacity 300ms ease;
}
.mark.live b { position: relative; z-index: 1; }
.mark.live .arrow { display: none; }
.mark.live.has-bearing .arrow {
  display: block;
  position: absolute; left: 50%; top: 50%; width: 0; height: 0;
  border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 8px solid var(--line);
  transform: translate(-50%, -50%) rotate(var(--bearing, 0deg)) translateY(-17px);
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.4));
}
.mark.live.coming { opacity: 1; z-index: 2; height: 24px; margin-top: -12px; font-size: .72rem; }
.mark.live.coming::after {
  content: ""; position: absolute; inset: -4px; border-radius: 999px;
  border: 2px solid var(--line);
  animation: tr-ripple 2s ease-out infinite;
}
.mark.live.at-stop { box-shadow: 0 0 0 3px color-mix(in srgb, var(--line) 35%, transparent), 0 2px 6px rgba(0,0,0,.35); }
.mark.live.focus { z-index: 3; opacity: 1; transform-origin: center; outline: 3px solid color-mix(in srgb, var(--dc-tint) 80%, #fff); outline-offset: 2px; }
/* Zoomed in on the streets the radar is a blur: it steps back. */
ha-card[data-mode="live"] .frames .frame.on { opacity: .18; }
.modes {
  display: inline-flex; padding: 3px; gap: 3px; border-radius: 999px;
  background: color-mix(in srgb, var(--dc-ink) 7%, transparent);
}
.modes button {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border: none; border-radius: 999px;
  font: inherit; font-size: .74rem; font-weight: 700;
  color: var(--dc-muted); background: transparent; cursor: pointer;
  transition: background 200ms ease, color 200ms ease;
}
.modes button ha-icon { --mdc-icon-size: 15px; }
.modes button b { font-size: .64rem; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--dc-tint) 25%, transparent); }
.modes button b:empty { display: none; }
.modes button[aria-pressed="true"] {
  color: var(--dc-ink);
  background: var(--dc-surface);
  box-shadow: 0 1px 3px rgba(0,0,0,.18);
}
.zoom { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 6px; }
.zoom button, .play {
  width: 34px; height: 34px; border-radius: 12px; padding: 0;
  display: grid; place-items: center; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--dc-ink) 12%, transparent);
  background: color-mix(in srgb, var(--dc-surface) 85%, transparent);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  color: var(--dc-ink);
  box-shadow: 0 2px 8px -4px rgba(0,0,0,.4);
  transition: transform 150ms ease;
}
.zoom button:active, .play:active { transform: scale(.92); }
.zoom ha-icon, .play ha-icon { --mdc-icon-size: 18px; }
.legend {
  position: absolute; left: 10px; bottom: 10px;
  display: flex; align-items: center; gap: 6px;
  padding: 4px 9px; border-radius: 999px;
  font-size: .62rem; font-weight: 700; color: var(--dc-ink);
  background: color-mix(in srgb, var(--dc-surface) 85%, transparent);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
}
.legend i { width: 90px; height: 7px; border-radius: 999px; background: var(--scale); }
.credit {
  position: absolute; right: 8px; bottom: 6px;
  font-size: .55rem; color: var(--dc-muted);
  padding: 1px 6px; border-radius: 6px;
  background: color-mix(in srgb, var(--dc-surface) 75%, transparent);
}
@container transit (max-width: 480px) { .credit { display: none; } }
.timeline { display: flex; align-items: center; gap: 10px; }
.play .i-play { display: none !important; }
.play[data-playing="false"] .i-play { display: inline-flex !important; }
.play[data-playing="false"] .i-pause { display: none !important; }
.ticks { flex: 1; display: flex; align-items: center; gap: 3px; height: 26px; }
.tick {
  flex: 1; height: 8px; padding: 0; border: none; border-radius: 999px; cursor: pointer;
  background: color-mix(in srgb, var(--dc-ink) 14%, transparent);
  transition: height 200ms ease, background 200ms ease;
}
.tick[data-state="ok"] { background: color-mix(in srgb, var(--dc-tint) 45%, transparent); }
.tick[data-state="loading"] { animation: tr-breathe 1.2s ease-in-out infinite; }
.tick[data-state="missing"] { background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--dc-ink) 18%, transparent) 0 3px, transparent 3px 5px); }
.tick.current { height: 18px; background: var(--dc-tint); box-shadow: 0 0 10px color-mix(in srgb, var(--dc-tint) 60%, transparent); }

/* --- departures --- */
.deps { display: flex; flex-direction: column; gap: 6px; }
.section { margin: 8px 2px 0; font-size: .7rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; color: var(--dc-muted); }
.section:first-child { margin-top: 0; }
.dep {
  --line: #0066b3;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 12px;
  padding: 8px 12px 8px 8px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--dc-ink) 7%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--dc-ink) 2.5%, var(--dc-surface)), color-mix(in srgb, var(--dc-ink) 6%, var(--dc-surface)));
  box-shadow: 0 1px 2px color-mix(in srgb, #000 5%, transparent), 0 8px 16px -14px color-mix(in srgb, #000 45%, transparent);
  font: inherit; color: var(--dc-ink); text-align: left; cursor: pointer;
  transition: transform 200ms ease, border-color 200ms ease, opacity 400ms ease;
}
.dep:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--line) 45%, transparent); }
.dep.entering { animation: tr-enter 520ms cubic-bezier(.22,.61,.36,1) both; }
.dep.leaving { animation: tr-leave 420ms ease-in forwards; }
.line {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  min-width: 52px; height: 34px; padding: 0 9px; box-sizing: border-box;
  border-radius: 11px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--line) 82%, #fff), var(--line));
  box-shadow: inset 0 -2px 0 color-mix(in srgb, #000 22%, transparent), 0 3px 8px -4px var(--line);
}
.line ha-icon { --mdc-icon-size: 16px; }
.line b { font-size: 1rem; font-weight: 800; letter-spacing: -.01em; }
.dep-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.headsign { font-size: .95rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dep-sub { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; font-size: .7rem; color: var(--dc-muted); min-height: 14px; }
.dep-sub > span:empty { display: none; }
.stop-tag { font-weight: 700; color: color-mix(in srgb, var(--line) 55%, var(--dc-ink)); }
.feat { display: inline-flex; gap: 3px; }
.gps { display: none; align-items: center; gap: 3px; font-weight: 700; color: color-mix(in srgb, var(--dc-tint) 75%, var(--dc-ink)); }
.gps ha-icon { --mdc-icon-size: 13px; animation: tr-breathe 1.6s ease-in-out infinite; }
.dep.tracked .gps { display: inline-flex; }
.feat ha-icon { --mdc-icon-size: 14px; color: var(--dc-muted); }
.delay { font-weight: 750; padding: 0 6px; border-radius: 999px; }
.delay[data-level="warn"] { color: #c27a00; background: color-mix(in srgb, #ffb457 20%, transparent); }
.delay[data-level="bad"] { color: #fff; background: #ff6b6b; }
/* The little road: the vehicle comes in from the left as departure nears. */
.road {
  position: relative; height: 4px; margin: 4px 0 2px; border-radius: 999px;
  background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--dc-ink) 14%, transparent) 0 8px, transparent 8px 13px);
}
.road-stop { position: absolute; right: -2px; top: -3px; width: 10px; height: 10px; border-radius: 50%; background: var(--line); box-shadow: 0 0 0 2px var(--dc-surface); }
.veh {
  position: absolute; top: -9px; left: 0;
  width: 22px; height: 22px; margin-left: -11px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: var(--line);
  box-shadow: 0 2px 6px -2px rgba(0,0,0,.5);
  transition: left 1s linear;
}
.veh ha-icon { --mdc-icon-size: 13px; color: #fff; }
.dep[data-soon="close"] .veh, .dep[data-soon="now"] .veh { animation: tr-bob .6s ease-in-out infinite alternate; }
.dep.at-stop .road-stop, .dep[data-soon="now"] .road-stop { animation: tr-ripple-dot 1.2s ease-out infinite; }
.when { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 64px; }
.count { font-size: 1.25rem; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.clock { font-size: .7rem; font-weight: 650; color: var(--dc-muted); font-variant-numeric: tabular-nums; }
.clock s { opacity: .6; }
.dep[data-soon="near"] .count { color: color-mix(in srgb, #ffb457 80%, var(--dc-ink)); }
.dep[data-soon="close"] .count { color: #ff8a3d; }
.dep[data-soon="now"] .count { color: #ff6b6b; animation: tr-breathe 1s ease-in-out infinite; }
.dep.canceled { opacity: .55; }
.dep.canceled .headsign, .dep.canceled .count { text-decoration: line-through; }

/* --- alerts --- */
.t-alerts { border-color: color-mix(in srgb, #ffb457 35%, transparent); }
.t-alerts::before {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(90% 70% at 0% 0%, color-mix(in srgb, #ffb457 16%, transparent), transparent 70%);
}
.t-alerts .t-title ha-icon { color: #ffb457; animation: tr-breathe 2s ease-in-out infinite; }
.alerts { display: flex; flex-direction: column; gap: 8px; }
.alert {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px; border-radius: 14px; border: none;
  background: color-mix(in srgb, #ffb457 9%, transparent);
  font: inherit; color: var(--dc-ink); text-align: left; cursor: pointer;
}
.alert > ha-icon { --mdc-icon-size: 20px; color: #ffb457; flex: none; margin-top: 1px; }
.al-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.al-stops { font-size: .66rem; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; color: color-mix(in srgb, #ffb457 70%, var(--dc-ink)); }
.al-text { font-size: .86rem; line-height: 1.4; }
.al-orig { font-size: .72rem; line-height: 1.35; color: var(--dc-muted); font-style: italic; }
.al-orig:empty { display: none; }

@keyframes tr-enter { from { opacity: 0; transform: translateX(14px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes tr-leave { to { opacity: 0; transform: translateX(-24px) scale(.96); } }
@keyframes tr-bob { from { transform: translateY(0); } to { transform: translateY(-2px); } }
@keyframes tr-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes tr-ripple { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(2.4); opacity: 0; } }
@keyframes tr-ripple-dot {
  0% { box-shadow: 0 0 0 2px var(--dc-surface), 0 0 0 2px color-mix(in srgb, var(--line) 70%, transparent); }
  100% { box-shadow: 0 0 0 2px var(--dc-surface), 0 0 0 10px transparent; }
}
@keyframes tr-glow { 0%, 100% { box-shadow: 0 0 0 0 transparent; } 50% { box-shadow: 0 0 16px -2px color-mix(in srgb, #ffb457 55%, transparent); } }

@container transit (max-width: 440px) {
  ha-card.transit { padding: 12px; }
  .tile { padding: 12px; border-radius: 20px; }
  .line { min-width: 46px; height: 32px; }
  .count { font-size: 1.1rem; }
}
`;

/* ------------------------------------------------------------------ editor */

/** The visual editor: Home Assistant's own <ha-form>, labels in its language. */
class PidTransitCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const tr = (key) => t(this._hass, key);
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (schema) => tr(`e_${schema.name}`);
      this._form.addEventListener("value-changed", (ev) => {
        const value = { ...ev.detail.value };
        // Nothing left at its default is written out.
        const defaults = { rows: 12, sort_by: "time", max_minutes_ahead: 0, show_alerts: true, show_radar: true,
          radar_source: "chmi", radar_product: "maxz", zoom: 9, live_zoom: 14, past_minutes: 60 };
        for (const [key, def] of Object.entries(defaults)) if (value[key] === def) delete value[key];
        for (const key of Object.keys(value)) {
          if (value[key] === "" || value[key] === null || (Array.isArray(value[key]) && !value[key].length)) delete value[key];
        }
        this._config = { type: "custom:pid-transit-card", ...value };
        const event = new Event("config-changed", { bubbles: true, composed: true });
        event.detail = { config: this._config };
        this.dispatchEvent(event);
      });
      this.appendChild(this._form);
    }
    const select = (options) => ({ select: { mode: "dropdown", options } });
    this._form.hass = this._hass;
    this._form.schema = [
      { name: "title", selector: { text: {} } },
      { name: "device_ids", selector: { device: { integration: "pid_departures_dev", multiple: true } } },
      { name: "rows", selector: { number: { mode: "box", min: 1, max: 40, step: 1 } } },
      { name: "sort_by", selector: select([{ value: "time", label: tr("e_sort_time") }, { value: "stop", label: tr("e_sort_stop") }]) },
      { name: "max_minutes_ahead", selector: { number: { mode: "box", min: 0, max: 600, step: 5 } } },
      { name: "show_alerts", selector: { boolean: {} } },
      { name: "weather", selector: { entity: { domain: "weather" } } },
      {
        name: "radar",
        type: "expandable",
        flatten: true,
        title: tr("e_radar"),
        schema: [
          { name: "show_radar", selector: { boolean: {} } },
          { name: "radar_source", selector: select([{ value: "chmi", label: tr("e_src_chmi") }, { value: "rainviewer", label: tr("e_src_rainviewer") }]) },
          { name: "radar_product", selector: select([{ value: "maxz", label: tr("e_prod_maxz") }, { value: "cappi", label: tr("e_prod_cappi") }]) },
          { name: "zoom", selector: { number: { mode: "slider", min: 5, max: 12, step: 1 } } },
          { name: "live_zoom", selector: { number: { mode: "slider", min: 10, max: 17, step: 1 } } },
          { name: "past_minutes", selector: { number: { mode: "slider", min: 10, max: 180, step: 5 } } },
          { name: "latitude", selector: { number: { mode: "box", step: "any" } } },
          { name: "longitude", selector: { number: { mode: "box", step: "any" } } },
        ],
      },
    ];
    this._form.data = {
      rows: 12, sort_by: "time", max_minutes_ahead: 0, show_alerts: true, show_radar: true,
      radar_source: "chmi", radar_product: "maxz", zoom: 9, live_zoom: 14, past_minutes: 60,
      ...this._config,
    };
  }
}

/* ---------------------------------------------------------------- register */

if (!customElements.get("pid-transit-card")) customElements.define("pid-transit-card", PidTransitCard);
if (!customElements.get("pid-transit-card-editor")) customElements.define("pid-transit-card-editor", PidTransitCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "pid-transit-card")) {
  window.customCards.push({
    type: "pid-transit-card",
    name: "PID Transit",
    description:
      "Rain radar with live vehicles on the map, next departures with countdowns and service alerts for your PID stops.",
    preview: true,
  });
}
