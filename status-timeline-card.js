/*!
 * Status Timeline Card for Home Assistant
 * Daily on/off timelines for up to 3 entities (grouped bars), configurable
 * logical day (e.g. 04:00 -> 04:00), up to 10 days, total on-time per bar,
 * per-entity colors, OFF-state mapping and in-bar duration labels.
 *
 * Inspired by / derived from schedule-timeline-card by andregoncalvespires
 * https://github.com/andregoncalvespires/schedule-timeline-card
 */

const CARD_VERSION = "1.1.0";
const CARD_TAG = "status-timeline-card";
const EDITOR_TAG = "status-timeline-card-editor";
const DAY_MS = 86400000;
const MAX_DAYS = 10;
const MAX_ENTITIES = 3;
const PALETTE = ["#2196f3", "#ff9800", "#4caf50"];
const UNAV_STATES = ["unavailable", "unknown", "none", ""];
const DEFAULT_ON_STATES = ["on", "open", "home", "playing", "heat", "cool", "heating", "cooling", "active", "detected", "true"];

const DEFAULTS = {
  days: 7,
  include_today: true,
  day_start: "00:00",
  day_end: "00:00",
  order: "newest_first",
  on_states: DEFAULT_ON_STATES,
  off_states: [],
  on_above: null,
  invert: false,
  show_total: true,
  total_format: "hm",
  show_summary: true,
  show_hours: true,
  show_now: true,
  show_unavailable: true,
  show_state: true,
  show_block_values: true,
  block_value_min_ms: 0,
  hour_step: 0,
  row_height: 0,
  refresh_interval: 300,
  time_zone: "auto",
  off_color: "",
  unavailable_color: "",
};

const I18N = {
  en: {
    total: "Total", avg: "avg/day", days: "days", loading: "Loading history…",
    error: "Error loading history", not_found: "Entity not found", on: "On", off: "Off",
    unavailable: "Unavailable",
  },
  es: {
    total: "Total", avg: "prom/día", days: "días", loading: "Cargando historial…",
    error: "Error al cargar el historial", not_found: "Entidad no encontrada", on: "Encendido",
    off: "Apagado", unavailable: "No disponible",
  },
  pt: {
    total: "Total", avg: "média/dia", days: "dias", loading: "A carregar histórico…",
    error: "Erro ao carregar histórico", not_found: "Entidade não encontrada", on: "Ligado",
    off: "Desligado", unavailable: "Indisponível",
  },
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

const _dtfCache = {};
function _dtf(tz) {
  if (!_dtfCache[tz]) {
    _dtfCache[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }
  return _dtfCache[tz];
}

function wallParts(epoch, tz) {
  const p = {};
  for (const { type, value } of _dtf(tz).formatToParts(new Date(epoch))) p[type] = value;
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

function tzOffset(epoch, tz) {
  const w = wallParts(epoch, tz);
  return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s) - Math.floor(epoch / 1000) * 1000;
}

function zonedToEpoch(y, m, d, minutes, tz) {
  const guess = Date.UTC(y, m, d, 0, minutes);
  const o1 = tzOffset(guess, tz);
  let t = guess - o1;
  const o2 = tzOffset(t, tz);
  if (o2 !== o1) t = guess - o2;
  return t;
}

function parseTime(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 60) % 1440;
  const m = String(v).trim().match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if (!m) return NaN;
  const h = +m[1], mi = +(m[2] || 0);
  if (h > 24 || mi > 59) return NaN;
  return (h * 60 + mi) % 1440;
}

function toList(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") v = v.split(",");
  if (!Array.isArray(v)) return fallback;
  return v.map((x) => String(x).trim().toLowerCase()).filter((x) => x.length || v.length === 0);
}

function computeRows(now, tz, cfg) {
  const startMin = cfg._startMin, endMin = cfg._endMin;
  let lenMin = endMin - startMin;
  if (lenMin <= 0) lenMin += 1440;
  const w = wallParts(now, tz);
  let base = Date.UTC(w.y, w.m, w.d);
  if (w.h * 60 + w.mi < startMin) base -= DAY_MS;
  const rows = [];
  const offset = cfg.include_today ? 0 : 1;
  for (let i = 0; i < cfg.days; i++) {
    const k = i + offset;
    const dd = new Date(base - k * DAY_MS);
    const y = dd.getUTCFullYear(), m = dd.getUTCMonth(), d = dd.getUTCDate();
    rows.push({
      dateUtc: Date.UTC(y, m, d),
      start: zonedToEpoch(y, m, d, startMin, tz),
      end: zonedToEpoch(y, m, d, startMin + lenMin, tz),
      current: k === 0,
    });
  }
  return { rows, startMin, lenMin };
}

/**
 * Classification order:
 *  1. state listed in off_states  -> "off"   (e.g. map "unavailable" to OFF)
 *  2. unavailable / unknown       -> "unav"
 *  3. on_above (numeric)          -> on/off
 *  4. on_states                   -> on/off
 *  invert swaps on/off (never unav).
 */
function classify(state, ec) {
  const s = String(state ?? "").trim().toLowerCase();
  if (ec._offStates.includes(s)) return ec.invert ? "on" : "off";
  if (UNAV_STATES.includes(s)) return "unav";
  let on;
  const thr = ec.on_above;
  if (thr !== null && thr !== undefined && thr !== "" && !isNaN(parseFloat(s))) on = parseFloat(s) > Number(thr);
  else on = ec._onStates.includes(s);
  if (ec.invert) on = !on;
  return on ? "on" : "off";
}

function buildIntervals(changes, now, ec) {
  const out = [];
  for (let i = 0; i < changes.length; i++) {
    const a = changes[i].t;
    const b = i + 1 < changes.length ? changes[i + 1].t : now;
    if (b <= a) continue;
    const c = classify(changes[i].s, ec);
    const last = out[out.length - 1];
    if (last && last.c === c && last.b === a) last.b = b;
    else out.push({ a, b, c });
  }
  return out;
}

function clipToWindow(intervals, start, end, now) {
  const limit = Math.min(end, now);
  const blocks = [];
  let onMs = 0;
  if (limit <= start) return { blocks, onMs };
  for (const it of intervals) {
    if (it.b <= start || it.a >= limit) continue;
    const a = Math.max(it.a, start), b = Math.min(it.b, limit);
    blocks.push({ a, b, c: it.c });
    if (it.c === "on") onMs += b - a;
  }
  return { blocks, onMs };
}

function formatDuration(ms, fmt) {
  if (fmt === "decimal") return (ms / 3600000).toFixed(2) + " h";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function cssColor(v, fallback) {
  if (Array.isArray(v) && v.length >= 3) return `rgb(${v[0]},${v[1]},${v[2]})`;
  if (v && typeof v === "string") return v;
  return fallback;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Normalizes `entity` / `entities` into a list of per-entity configs (max 3). */
function normalizeEntities(c) {
  let list = [];
  if (Array.isArray(c.entities)) list = c.entities;
  else if (c.entity) list = [c.entity];
  list = list
    .map((e) => (typeof e === "string" ? { entity: e } : { ...(e || {}) }))
    .filter((e) => e.entity)
    .slice(0, MAX_ENTITIES);
  return list.map((e, i) => ({
    ...e,
    color: cssColor(e.color, i === 0 && c.on_color ? cssColor(c.on_color) : PALETTE[i]),
    invert: e.invert ?? c.invert,
    on_above: e.on_above ?? c.on_above,
    _onStates: toList(e.on_states ?? c.on_states, DEFAULT_ON_STATES),
    _offStates: toList(e.off_states ?? c.off_states, []),
  }));
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

class StatusTimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._history = null;
    this._fetching = false;
    this._lastFetch = 0;
    this._fetchedFrom = Infinity;
    this._error = null;
    this._lastStates = [];
  }

  static getConfigElement() { return document.createElement(EDITOR_TAG); }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const entity = ids.find((e) => e.startsWith("binary_sensor.")) ||
      ids.find((e) => e.startsWith("switch.")) || ids.find((e) => e.startsWith("light.")) || "";
    return { entities: [{ entity }], days: 7, day_start: "00:00", day_end: "00:00", show_total: true };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const c = { ...DEFAULTS, ...config };
    c._entities = normalizeEntities(c);
    if (!c._entities.length) throw new Error("Please define at least one entity (entity or entities)");
    if (Array.isArray(config.entities) && config.entities.length > MAX_ENTITIES)
      console.warn(`${CARD_TAG}: only the first ${MAX_ENTITIES} entities are shown`);
    c.days = Math.min(MAX_DAYS, Math.max(1, parseInt(c.days, 10) || DEFAULTS.days));
    c._startMin = parseTime(c.day_start);
    c._endMin = parseTime(c.day_end);
    if (isNaN(c._startMin)) throw new Error(`Invalid day_start: ${c.day_start}`);
    if (isNaN(c._endMin)) throw new Error(`Invalid day_end: ${c.day_end}`);
    c.refresh_interval = Math.max(30, Number(c.refresh_interval) || DEFAULTS.refresh_interval);
    const autoH = c._entities.length === 1 ? 18 : 14;
    c.row_height = Math.min(48, Math.max(8, Number(c.row_height) || autoH));

    const ids = c._entities.map((e) => e.entity).join("|");
    if (!this._config || this._ids !== ids) { this._history = null; this._fetchedFrom = Infinity; }
    this._ids = ids;
    this._config = c;
    this._lastFetch = 0;
    this._render();
    this._maybeFetch();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    const states = this._config._entities.map((e) => hass.states[e.entity]);
    if (first || states.some((s, i) => s !== this._lastStates[i])) {
      this._lastStates = states;
      this._render();
    }
    this._maybeFetch();
  }

  connectedCallback() {
    clearInterval(this._timer);
    this._timer = setInterval(() => { this._render(); this._maybeFetch(); }, 60000);
    if (!this._ro && window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._fitLabels());
      this._ro.observe(this);
    }
    this._maybeFetch();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  getCardSize() {
    const n = this._config?._entities?.length || 1;
    return 2 + Math.ceil((this._config?.days || 7) * (0.4 + 0.3 * n));
  }

  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  _tz() {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const server = this._hass?.config?.time_zone || browser;
    const mode = this._config?.time_zone || "auto";
    if (mode === "server") return server;
    if (mode === "local") return browser;
    return this._hass?.locale?.time_zone === "local" ? browser : server;
  }

  _t(key) {
    const lang = (this._hass?.locale?.language || this._hass?.language || "en").slice(0, 2);
    return (I18N[lang] || I18N.en)[key] ?? I18N.en[key];
  }

  _maybeFetch() {
    if (!this._hass || !this._config || this._fetching || !this.isConnected) return;
    const now = Date.now();
    const { rows } = computeRows(now, this._tz(), this._config);
    const from = Math.min(...rows.map((r) => r.start));
    const fresh = now - this._lastFetch < this._config.refresh_interval * 1000;
    if (this._history && fresh && from >= this._fetchedFrom) return;
    this._fetch(from);
  }

  async _fetch(from) {
    const ids = this._config._entities.map((e) => e.entity);
    this._fetching = true;
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(from).toISOString(),
        end_time: new Date().toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const hist = {};
      for (const id of ids) {
        hist[id] = ((res && res[id]) || []).map((it) => ({
          s: String(it.s ?? it.state),
          t: it.lc != null ? it.lc * 1000 : it.lu != null ? it.lu * 1000
            : Date.parse(it.last_changed || it.last_updated),
        })).filter((x) => !isNaN(x.t)).sort((a, b) => a.t - b.t);
      }
      this._history = hist;
      this._fetchedFrom = from;
      this._error = null;
    } catch (e) {
      this._error = e?.message || String(e);
      console.warn(`${CARD_TAG}:`, e);
    } finally {
      this._fetching = false;
      this._lastFetch = Date.now();
      this._render();
    }
  }

  _changes(id) {
    const h = ((this._history && this._history[id]) || []).slice();
    const st = this._hass?.states[id];
    if (st) {
      const t = Date.parse(st.last_changed);
      const last = h[h.length - 1];
      if (!last || t > last.t) h.push({ s: st.state, t });
      else if (last.s !== st.state) h.push({ s: st.state, t: last.t + 1 });
    }
    return h;
  }

  _fmtTime(epoch, tz, refDateUtc) {
    const w = wallParts(epoch, tz);
    const hm = `${String(w.h).padStart(2, "0")}:${String(w.mi).padStart(2, "0")}`;
    return Date.UTC(w.y, w.m, w.d) === refDateUtc
      ? hm : `${String(w.d).padStart(2, "0")}/${String(w.m + 1).padStart(2, "0")} ${hm}`;
  }

  /** Hides in-bar labels that do not fit inside their block. */
  _fitLabels() {
    const root = this.shadowRoot;
    if (!root || !root.querySelectorAll) return;
    for (const v of root.querySelectorAll(".blk .v")) {
      const blk = v.parentElement;
      v.style.visibility = "hidden";
      const fits = blk.clientWidth > 0 && v.scrollWidth + 4 <= blk.clientWidth;
      v.style.visibility = fits ? "visible" : "hidden";
    }
  }

  _render() {
    if (!this._config) return;
    const c = this._config;
    const root = this.shadowRoot;
    const hass = this._hass;
    if (!hass) { root.innerHTML = ""; return; }

    const ents = c._entities.map((ec) => ({ ec, st: hass.states[ec.entity] }));
    const tz = this._tz();
    const now = Date.now();
    const { rows, startMin, lenMin } = computeRows(now, tz, c);
    if (c.order === "oldest_first") rows.reverse();
    const lang = hass.locale?.language || hass.language || "en";
    const dateFmt = new Intl.DateTimeFormat(lang, { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
    const multi = ents.length > 1;

    for (const e of ents) {
      e.name = e.ec.name || e.st?.attributes?.friendly_name || e.ec.entity;
      e.intervals = this._history && e.st ? buildIntervals(this._changes(e.ec.entity), now, e.ec) : [];
      e.cur = e.st ? classify(e.st.state, e.ec) : "unav";
      e.totalOn = 0; e.totalElapsed = 0; e.days = 0;
    }

    // Hour axis
    const hours = lenMin / 60;
    const step = Number(c.hour_step) > 0 ? Number(c.hour_step)
      : hours <= 6 ? 1 : hours <= 12 ? 2 : hours <= 18 ? 3 : 4;
    const ticks = [];
    const first = (60 - (startMin % 60)) % 60;
    for (let off = first; off <= lenMin; off += 60) {
      const idx = Math.round((off - first) / 60);
      if (idx % step === 0) ticks.push({ pct: (off / lenMin) * 100, label: String(((startMin + off) / 60) % 24).padStart(2, "0") });
    }
    const gridHtml = ticks.map((t) => `<div class="gl" style="left:${t.pct.toFixed(3)}%"></div>`).join("");

    // Header: current state per entity with its color reference
    const headerHtml = c.show_state ? `<div class="states">${ents.map((e, i) => {
      if (!e.st) return `<div class="chip missing" style="--c:${e.ec.color}"><span class="dot"></span>${esc(this._t("not_found"))}: ${esc(e.ec.entity)}</div>`;
      const icon = e.ec.icon || e.st.attributes.icon || "";
      const txt = hass.formatEntityState ? hass.formatEntityState(e.st) : e.st.state;
      return `<div class="chip ${e.cur}" data-i="${i}" style="--c:${e.ec.color}" title="${esc(e.ec.entity)}">
          <span class="ico">${icon ? `<ha-icon icon="${esc(icon)}"></ha-icon>` : `<ha-state-icon data-i="${i}"></ha-state-icon>`}</span>
          <span class="nm">${esc(e.name)}</span>
          <span class="badge">${esc(txt)}</span>
        </div>`;
    }).join("")}</div>` : "";

    const titleHtml = c.title || (!multi && !c.show_state) ? `<div class="title">${esc(c.title || ents[0].name)}</div>` : "";

    // Day groups
    const daysHtml = rows.map((r) => {
      const span = r.end - r.start;
      const elapsed = Math.max(0, Math.min(r.end, now) - r.start);
      let futureHtml = "", nowHtml = "";
      if (now < r.end) {
        const p = Math.max(0, ((now - r.start) / span) * 100);
        futureHtml = `<div class="future" style="left:${p.toFixed(3)}%"></div>`;
        if (c.show_now && now >= r.start) nowHtml = `<div class="now" style="left:${p.toFixed(3)}%"></div>`;
      }

      const bars = ents.map((e, i) => {
        const { blocks, onMs } = clipToWindow(e.intervals, r.start, r.end, now);
        if (elapsed > 0 && e.st) { e.totalOn += onMs; e.totalElapsed += elapsed; e.days++; }
        const blocksHtml = blocks
          .filter((b) => b.c === "on" || (b.c === "unav" && c.show_unavailable))
          .map((b) => {
            const left = ((b.a - r.start) / span) * 100;
            const width = ((b.b - b.a) / span) * 100;
            const dur = formatDuration(b.b - b.a, "hm");
            const tip = `${e.name} · ${this._t(b.c === "on" ? "on" : "unavailable")}: ${this._fmtTime(b.a, tz, r.dateUtc)} → ${this._fmtTime(b.b, tz, r.dateUtc)} (${dur})`;
            const showV = c.show_block_values && b.c === "on" && (b.b - b.a) >= Number(c.block_value_min_ms || 0);
            return `<div class="blk ${b.c}" style="left:${left.toFixed(3)}%;width:${Math.max(width, 0.15).toFixed(3)}%" title="${esc(tip)}">${showV ? `<span class="v">${esc(dur)}</span>` : ""}</div>`;
          }).join("");
        const pct = span > 0 ? Math.round((onMs / span) * 100) : 0;
        const totalHtml = c.show_total
          ? `<div class="total" style="--c:${e.ec.color}" title="${esc(e.name)} · ${pct}%">${elapsed > 0 ? esc(formatDuration(onMs, c.total_format)) : "–"}</div>` : "";
        return `<div class="track" style="--c:${e.ec.color};grid-row:${i + 1}">${gridHtml}${blocksHtml}${futureHtml}${nowHtml}</div>${totalHtml.replace('class="total"', `class="total" data-r="${i + 1}"`)}`;
      }).join("");

      return `<div class="day${r.current ? " current" : ""}" style="--n:${ents.length}">
          <div class="label">${esc(dateFmt.format(new Date(r.dateUtc)))}</div>${bars}
        </div>`;
    }).join("");

    const axisHtml = c.show_hours ? `<div class="axis"><div></div><div class="ticks">${
      ticks.map((t) => `<span style="left:${t.pct.toFixed(3)}%">${t.label}</span>`).join("")
    }</div>${c.show_total ? "<div></div>" : ""}</div>` : "";

    let status = "";
    if (!this._history && !this._error) status = `<div class="status">${esc(this._t("loading"))}</div>`;
    if (this._error) status = `<div class="status err">${esc(this._t("error"))}: ${esc(this._error)}</div>`;

    const summaryHtml = c.show_summary && this._history ? `<div class="summary">${ents.filter((e) => e.days > 0).map((e) => `
        <div class="srow" style="--c:${e.ec.color}"><span class="dot"></span>${multi ? `<span class="nm">${esc(e.name)}</span>` : ""}
        ${esc(this._t("total"))} (${e.days} ${esc(this._t("days"))}): <b>${esc(formatDuration(e.totalOn, c.total_format))}</b>
        · ${esc(this._t("avg"))}: <b>${esc(formatDuration(e.totalOn / e.days, c.total_format))}</b>
        · ${e.totalElapsed > 0 ? Math.round((e.totalOn / e.totalElapsed) * 100) : 0}%</div>`).join("")}</div>` : "";

    const offColor = c.off_color || "var(--secondary-background-color, rgba(127,127,127,.15))";
    const unColor = c.unavailable_color || "var(--disabled-text-color, #9e9e9e)";
    const cols = `78px 1fr${c.show_total ? " 64px" : ""}`;

    root.innerHTML = `
      <style>
        :host { --stc-off:${offColor}; --stc-un:${unColor}; --stc-h:${c.row_height}px; }
        ha-card { padding: 12px 16px 14px; }
        .title { font-size:16px; font-weight:500; margin-bottom:8px; }
        .states { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
        .chip { display:flex; align-items:center; gap:6px; padding:3px 10px 3px 4px; border-radius:16px; cursor:pointer;
                border:1px solid var(--c); background: color-mix(in srgb, var(--c) 8%, transparent); min-width:0; }
        .chip .ico { display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%;
                     background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); --mdc-icon-size:18px; }
        .chip.off .ico { background: var(--stc-off); color: var(--secondary-text-color); }
        .chip.unav .ico { background: repeating-linear-gradient(45deg, var(--stc-un) 0 2px, transparent 2px 5px); color: var(--disabled-text-color); }
        .chip .nm { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .chip .badge { font-size:12px; padding:1px 8px; border-radius:10px; white-space:nowrap;
                       background: var(--stc-off); color: var(--secondary-text-color); }
        .chip.on .badge { background: var(--c); color: #fff; }
        .chip.unav .badge { font-style: italic; }
        .chip.missing { color: var(--error-color); padding-left:10px; }
        .dot { display:inline-block; width:10px; height:10px; border-radius:50%; background: var(--c); flex:none; }
        .day { display:grid; grid-template-columns:${cols}; grid-auto-rows: var(--stc-h); align-items:center;
               column-gap:8px; row-gap:2px; margin:0 0 7px; }
        .day .label { grid-row: 1 / span var(--n); grid-column:1; align-self:center; font-size:12px;
                      color: var(--secondary-text-color); white-space:nowrap; text-transform:capitalize; }
        .day.current .label { color: var(--primary-text-color); font-weight:600; }
        .track { grid-column:2; position:relative; height:var(--stc-h); background:var(--stc-off); border-radius:4px; overflow:hidden; }
        .day.current .track { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 60%, transparent) inset; }
        .gl { position:absolute; top:0; bottom:0; width:1px; background: var(--divider-color, rgba(127,127,127,.25)); }
        .blk { position:absolute; top:0; bottom:0; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        .blk.on { background: var(--c); }
        .blk.unav { background: repeating-linear-gradient(45deg, var(--stc-un) 0 3px, transparent 3px 6px); opacity:.6; }
        .blk .v { font-size: clamp(9px, calc(var(--stc-h) - 5px), 11px); line-height:1; color:#fff; white-space:nowrap;
                  font-variant-numeric: tabular-nums; text-shadow: 0 0 2px rgba(0,0,0,.55); pointer-events:none; visibility:hidden; }
        .future { position:absolute; top:0; bottom:0; right:0; background: var(--card-background-color, #fff); opacity:.55; }
        .now { position:absolute; top:0; bottom:0; width:2px; margin-left:-1px; background: var(--error-color, #db4437); }
        .total { grid-column:3; font-size:12px; text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap;
                 color: var(--primary-text-color); border-right: 3px solid var(--c); padding-right:5px; line-height: var(--stc-h); }
        .axis { display:grid; grid-template-columns:${cols}; column-gap:8px; }
        .ticks { position:relative; height:14px; font-size:10px; color: var(--secondary-text-color); }
        .ticks span { position:absolute; transform:translateX(-50%); }
        .summary { margin-top:8px; font-size:12px; color: var(--secondary-text-color); }
        .srow { display:flex; justify-content:flex-end; align-items:center; gap:4px; flex-wrap:wrap; }
        .srow .nm { color: var(--primary-text-color); margin-right:4px; }
        .status { font-size:12px; color: var(--secondary-text-color); margin:4px 0; }
        .status.err { color: var(--error-color); }
      </style>
      <ha-card>
        ${titleHtml}
        ${headerHtml}
        ${status}
        ${daysHtml}
        ${axisHtml}
        ${summaryHtml}
      </ha-card>`;

    // place totals on the same grid row as their bar
    for (const t of root.querySelectorAll(".total[data-r]")) t.style.gridRow = t.dataset.r;
    for (const si of root.querySelectorAll("ha-state-icon")) {
      const e = ents[+si.dataset.i];
      si.hass = hass; si.stateObj = e.st;
    }
    for (const chip of root.querySelectorAll(".chip[data-i]")) {
      chip.addEventListener("click", () => {
        const id = ents[+chip.dataset.i].ec.entity;
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
      });
    }
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => this._fitLabels());
  }
}

/* ------------------------------------------------------------------ */
/* Visual editor (ha-form, flattens the entities list into 3 sections) */
/* ------------------------------------------------------------------ */

const E_FIELDS = ["entity", "name", "color", "icon", "on_states", "off_states", "on_above", "invert"];

function toFormData(cfg) {
  const d = { ...cfg };
  const raw = Array.isArray(cfg.entities) ? cfg.entities : cfg.entity ? [cfg.entity] : [];
  const ents = raw.slice(0, MAX_ENTITIES).map((e) => (typeof e === "string" ? { entity: e } : { ...(e || {}) }));
  delete d.entities; delete d.entity;
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const e = ents[i] || {};
    for (const f of E_FIELDS) if (e[f] !== undefined) d[`e${i + 1}_${f}`] = e[f];
  }
  return d;
}

function fromFormData(d) {
  const cfg = {};
  const ents = [];
  for (const [k, v] of Object.entries(d)) {
    if (/^e\d_/.test(k) || v === undefined || v === "") continue;
    if (k in DEFAULTS && JSON.stringify(v) === JSON.stringify(DEFAULTS[k])) continue; // keep YAML clean
    cfg[k] = v;
  }
  for (let i = 1; i <= MAX_ENTITIES; i++) {
    const e = {};
    for (const f of E_FIELDS) {
      const v = d[`e${i}_${f}`];
      if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) e[f] = v;
    }
    if (e.entity) ents.push(e);
  }
  const out = { type: cfg.type, entities: ents };
  for (const [k, v] of Object.entries(cfg)) if (k !== "type") out[k] = v;
  return out;
}

function entitySection(i) {
  const p = `e${i}_`;
  return {
    type: "expandable", name: "", flatten: true, expanded: i === 1,
    title: `Entity ${i}${i > 1 ? " (optional)" : ""}`,
    schema: [
      { name: `${p}entity`, required: i === 1, selector: { entity: {} } },
      { type: "grid", name: "", flatten: true, schema: [
        { name: `${p}name`, selector: { text: {} } },
        { name: `${p}icon`, selector: { icon: {} } },
      ] },
      { name: `${p}color`, selector: { text: {} } },
      { name: `${p}on_states`, selector: { select: { multiple: true, custom_value: true, options: DEFAULT_ON_STATES } } },
      { name: `${p}off_states`, selector: { select: { multiple: true, custom_value: true, options: ["unavailable", "unknown"] } } },
      { type: "grid", name: "", flatten: true, schema: [
        { name: `${p}on_above`, selector: { number: { mode: "box", step: "any" } } },
        { name: `${p}invert`, selector: { boolean: {} } },
      ] },
    ],
  };
}

const EDITOR_SCHEMA = [
  { name: "title", selector: { text: {} } },
  entitySection(1), entitySection(2), entitySection(3),
  { type: "grid", name: "", flatten: true, schema: [
    { name: "day_start", selector: { time: {} } },
    { name: "day_end", selector: { time: {} } },
    { name: "days", selector: { number: { min: 1, max: MAX_DAYS, step: 1, mode: "slider" } } },
    { name: "include_today", selector: { boolean: {} } },
  ] },
  { type: "grid", name: "", flatten: true, schema: [
    { name: "show_state", selector: { boolean: {} } },
    { name: "show_total", selector: { boolean: {} } },
    { name: "show_block_values", selector: { boolean: {} } },
    { name: "show_summary", selector: { boolean: {} } },
    { name: "show_hours", selector: { boolean: {} } },
    { name: "show_now", selector: { boolean: {} } },
    { name: "show_unavailable", selector: { boolean: {} } },
    { name: "total_format", selector: { select: { mode: "dropdown", options: [
      { value: "hm", label: "5h 07m" }, { value: "decimal", label: "5.12 h" }] } } },
  ] },
  { name: "order", selector: { select: { mode: "dropdown", options: [
    { value: "newest_first", label: "Newest first" }, { value: "oldest_first", label: "Oldest first" }] } } },
  { type: "expandable", name: "", flatten: true, title: "Defaults for all entities", schema: [
    { name: "on_states", selector: { select: { multiple: true, custom_value: true, options: DEFAULT_ON_STATES } } },
    { name: "off_states", selector: { select: { multiple: true, custom_value: true, options: ["unavailable", "unknown"] } } },
    { name: "on_above", selector: { number: { mode: "box", step: "any" } } },
    { name: "invert", selector: { boolean: {} } },
  ] },
  { type: "expandable", name: "", flatten: true, title: "Appearance & advanced", schema: [
    { name: "off_color", selector: { text: {} } },
    { name: "unavailable_color", selector: { text: {} } },
    { name: "row_height", selector: { number: { min: 0, max: 48, step: 1, mode: "box" } } },
    { name: "hour_step", selector: { number: { min: 0, max: 12, step: 1, mode: "box" } } },
    { name: "refresh_interval", selector: { number: { min: 30, max: 3600, step: 30, mode: "box" } } },
    { name: "time_zone", selector: { select: { mode: "dropdown", options: [
      { value: "auto", label: "Follow user profile" }, { value: "server", label: "Server time zone" },
      { value: "local", label: "Browser time zone" }] } } },
  ] },
];

const LABELS = {
  title: "Title", day_start: "Day start", day_end: "Day end", days: "Days (1–10)",
  include_today: "Include current day", order: "Order", show_state: "Show current state",
  show_total: "Total on-time (right)", show_block_values: "Duration inside bars (if it fits)",
  show_summary: "Summary footer", show_hours: "Hour axis", show_now: "'Now' marker",
  show_unavailable: "Hatch unavailable", total_format: "Total format",
  on_states: "States = ON", off_states: "States mapped to OFF", on_above: "Numeric: ON above",
  invert: "Invert (count OFF)", off_color: "OFF bar color", unavailable_color: "Unavailable color",
  row_height: "Bar height px (0 = auto)", hour_step: "Hour step (0 = auto)",
  refresh_interval: "History refresh (s)", time_zone: "Time zone",
  entity: "Entity", name: "Name", icon: "Icon", color: "Color (CSS, e.g. #2196f3)",
};

class StatusTimelineCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; else this._render(); }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name.replace(/^e\d_/, "")] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const cfg = fromFormData(ev.detail.value);
        this._config = cfg;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = { ...DEFAULTS, ...toFormData(this._config) };
  }
}

StatusTimelineCard._helpers = { parseTime, computeRows, classify, buildIntervals, clipToWindow, formatDuration, normalizeEntities, toFormData, fromFormData };

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, StatusTimelineCard);
  customElements.define(EDITOR_TAG, StatusTimelineCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TAG,
    name: "Status Timeline Card",
    description: "Daily on/off timelines for up to 3 entities with configurable day start/end and total on-time.",
    preview: true,
    documentationURL: "https://github.com/YOUR_USER/status-timeline-card",
  });
  console.info(`%c STATUS-TIMELINE-CARD %c v${CARD_VERSION} `,
    "color:white;background:#03a9f4;font-weight:700", "color:#03a9f4;background:white;font-weight:700");
}
