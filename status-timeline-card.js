/*!
 * Status Timeline Card for Home Assistant
 * Displays the on/off history of any entity as daily horizontal timelines,
 * with a configurable "logical day" (e.g. 04:00 -> 04:00), up to 10 days,
 * and the total on-time per day on the right.
 *
 * Inspired by / derived from schedule-timeline-card by andregoncalvespires
 * https://github.com/andregoncalvespires/schedule-timeline-card
 */

const CARD_VERSION = "1.0.0";
const CARD_TAG = "status-timeline-card";
const DAY_MS = 86400000;
const MAX_DAYS = 10;

const DEFAULTS = {
  days: 7,
  include_today: true,
  day_start: "00:00",
  day_end: "00:00",
  order: "newest_first",
  on_states: ["on", "open", "home", "playing", "heat", "cool", "heating", "cooling", "active", "detected", "true"],
  on_above: null,
  invert: false,
  show_total: true,
  total_format: "hm",
  show_summary: true,
  show_hours: true,
  show_now: true,
  show_unavailable: true,
  hour_step: 0,
  row_height: 18,
  refresh_interval: 300,
  time_zone: "auto",
  on_color: "",
  off_color: "",
  unavailable_color: "",
};

const I18N = {
  en: {
    total: "Total", avg: "avg/day", days: "days", loading: "Loading history…",
    error: "Error loading history", not_found: "Entity not found", on: "On", off: "Off",
    unavailable: "Unavailable", no_entity: "Please define an entity",
  },
  es: {
    total: "Total", avg: "prom/día", days: "días", loading: "Cargando historial…",
    error: "Error al cargar el historial", not_found: "Entidad no encontrada", on: "Encendido",
    off: "Apagado", unavailable: "No disponible", no_entity: "Defina una entidad",
  },
  pt: {
    total: "Total", avg: "média/dia", days: "dias", loading: "A carregar histórico…",
    error: "Erro ao carregar histórico", not_found: "Entidade não encontrada", on: "Ligado",
    off: "Desligado", unavailable: "Indisponível", no_entity: "Defina uma entidade",
  },
};

/* ------------------------------------------------------------------ */
/* Pure helpers (time zone aware, no external dependencies)            */
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

/** Wall-clock parts of an epoch (ms) in a given IANA time zone. */
function wallParts(epoch, tz) {
  const p = {};
  for (const { type, value } of _dtf(tz).formatToParts(new Date(epoch))) p[type] = value;
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** Offset (wall - UTC) in ms for an instant in a time zone. */
function tzOffset(epoch, tz) {
  const w = wallParts(epoch, tz);
  const asUtc = Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** Epoch (ms) of a wall-clock time in a time zone. Minute overflow is allowed. */
function zonedToEpoch(y, m, d, minutes, tz) {
  const guess = Date.UTC(y, m, d, 0, minutes);
  const o1 = tzOffset(guess, tz);
  let t = guess - o1;
  const o2 = tzOffset(t, tz);
  if (o2 !== o1) t = guess - o2;
  return t;
}

/** "04:00", "04:00:00", "4", 4 -> minutes since midnight. */
function parseTime(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 60) % 1440;
  const m = String(v).trim().match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if (!m) return NaN;
  const h = +m[1], mi = +(m[2] || 0);
  if (h > 24 || mi > 59) return NaN;
  return (h * 60 + mi) % 1440;
}

/**
 * Builds the list of logical-day windows.
 * Logical day D runs from D @ day_start to (D or D+1) @ day_end.
 * If day_end <= day_start the window crosses midnight; equal values = 24 h.
 */
function computeRows(now, tz, cfg) {
  const startMin = cfg._startMin, endMin = cfg._endMin;
  let lenMin = endMin - startMin;
  if (lenMin <= 0) lenMin += 1440;

  const w = wallParts(now, tz);
  let base = Date.UTC(w.y, w.m, w.d);
  if (w.h * 60 + w.mi < startMin) base -= DAY_MS; // still belongs to the previous logical day

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

/** on / off / unav classification of a raw state. */
function classify(state, cfg) {
  const s = String(state ?? "").toLowerCase();
  if (s === "unavailable" || s === "unknown" || s === "none" || s === "") return "unav";
  let on;
  if (cfg.on_above !== null && cfg.on_above !== undefined && cfg.on_above !== "" && !isNaN(parseFloat(s))) {
    on = parseFloat(s) > Number(cfg.on_above);
  } else {
    on = cfg._onStates.includes(s);
  }
  if (cfg.invert) on = !on;
  return on ? "on" : "off";
}

/** Converts a sorted list of {s,t} changes into merged intervals [{a,b,c}]. */
function buildIntervals(changes, now, cfg) {
  const out = [];
  for (let i = 0; i < changes.length; i++) {
    const a = changes[i].t;
    const b = i + 1 < changes.length ? changes[i + 1].t : now;
    if (b <= a) continue;
    const c = classify(changes[i].s, cfg);
    const last = out[out.length - 1];
    if (last && last.c === c && last.b === a) last.b = b;
    else out.push({ a, b, c });
  }
  return out;
}

/** Clips intervals to a window; returns blocks and on-time (ms). */
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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  }

  /* ---------- Visual editor (HA native form) ---------- */
  static getConfigForm() {
    const labels = {
      entity: "Entity", name: "Name", icon: "Icon",
      day_start: "Day start", day_end: "Day end",
      days: "Days to display (1–10)", include_today: "Include current day",
      order: "Order", show_total: "Show total on-time (right)", total_format: "Total format",
      show_summary: "Show summary footer", show_hours: "Show hour axis", show_now: "Show 'now' marker",
      show_unavailable: "Mark unavailable periods", on_states: "States considered ON",
      on_above: "Numeric sensor: ON above", invert: "Invert (count OFF time)",
      hour_step: "Hour axis step (0 = auto)", row_height: "Row height (px)",
      refresh_interval: "History refresh (s)", time_zone: "Time zone",
      on_color: "ON color", off_color: "OFF color", unavailable_color: "Unavailable color",
    };
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: {} } },
        {
          type: "grid", name: "", flatten: true, schema: [
            { name: "name", selector: { text: {} } },
            { name: "icon", selector: { icon: {} } },
          ],
        },
        {
          type: "grid", name: "", flatten: true, schema: [
            { name: "day_start", selector: { time: {} } },
            { name: "day_end", selector: { time: {} } },
          ],
        },
        {
          type: "grid", name: "", flatten: true, schema: [
            { name: "days", selector: { number: { min: 1, max: MAX_DAYS, step: 1, mode: "slider" } } },
            { name: "include_today", selector: { boolean: {} } },
          ],
        },
        {
          type: "grid", name: "", flatten: true, schema: [
            { name: "show_total", selector: { boolean: {} } },
            {
              name: "total_format", selector: {
                select: { mode: "dropdown", options: [
                  { value: "hm", label: "5h 07m" }, { value: "decimal", label: "5.12 h" }] },
              },
            },
            { name: "show_summary", selector: { boolean: {} } },
            { name: "show_hours", selector: { boolean: {} } },
            { name: "show_now", selector: { boolean: {} } },
            { name: "show_unavailable", selector: { boolean: {} } },
          ],
        },
        {
          name: "order", selector: {
            select: { mode: "dropdown", options: [
              { value: "newest_first", label: "Newest first" }, { value: "oldest_first", label: "Oldest first" }] },
          },
        },
        {
          type: "expandable", name: "", title: "ON detection", flatten: true, schema: [
            {
              name: "on_states", selector: {
                select: { multiple: true, custom_value: true, options: DEFAULTS.on_states },
              },
            },
            { name: "on_above", selector: { number: { mode: "box", step: "any" } } },
            { name: "invert", selector: { boolean: {} } },
          ],
        },
        {
          type: "expandable", name: "", title: "Appearance & advanced", flatten: true, schema: [
            { name: "on_color", selector: { text: {} } },
            { name: "off_color", selector: { text: {} } },
            { name: "unavailable_color", selector: { text: {} } },
            { name: "row_height", selector: { number: { min: 8, max: 48, step: 1, mode: "box" } } },
            { name: "hour_step", selector: { number: { min: 0, max: 12, step: 1, mode: "box" } } },
            { name: "refresh_interval", selector: { number: { min: 30, max: 3600, step: 30, mode: "box" } } },
            {
              name: "time_zone", selector: {
                select: { mode: "dropdown", options: [
                  { value: "auto", label: "Follow user profile" },
                  { value: "server", label: "Server time zone" },
                  { value: "local", label: "Browser time zone" }] },
              },
            },
          ],
        },
      ],
      computeLabel: (s) => labels[s.name] ?? s.name,
    };
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const entity = ids.find((e) => e.startsWith("binary_sensor.")) ||
      ids.find((e) => e.startsWith("switch.")) || ids.find((e) => e.startsWith("light.")) || "";
    return { entity, days: 7, day_start: "00:00", day_end: "00:00", show_total: true };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("Please define an entity");
    const c = { ...DEFAULTS, ...config };
    c.days = Math.min(MAX_DAYS, Math.max(1, parseInt(c.days, 10) || DEFAULTS.days));
    c._startMin = parseTime(c.day_start);
    c._endMin = parseTime(c.day_end);
    if (isNaN(c._startMin)) throw new Error(`Invalid day_start: ${c.day_start}`);
    if (isNaN(c._endMin)) throw new Error(`Invalid day_end: ${c.day_end}`);
    let st = c.on_states;
    if (typeof st === "string") st = st.split(",");
    c._onStates = (Array.isArray(st) && st.length ? st : DEFAULTS.on_states)
      .map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    c.refresh_interval = Math.max(30, Number(c.refresh_interval) || DEFAULTS.refresh_interval);
    c.row_height = Math.min(48, Math.max(8, Number(c.row_height) || DEFAULTS.row_height));

    const changedEntity = !this._config || this._config.entity !== c.entity;
    this._config = c;
    if (changedEntity) { this._history = null; this._fetchedFrom = Infinity; }
    this._lastFetch = 0;
    this._render();
    this._maybeFetch();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const st = this._config ? hass.states[this._config.entity] : undefined;
    if (first || st !== this._lastStateObj) {
      this._lastStateObj = st;
      this._render();
    }
    this._maybeFetch();
  }

  connectedCallback() {
    clearInterval(this._timer);
    this._timer = setInterval(() => { this._render(); this._maybeFetch(); }, 60000);
    this._maybeFetch();
  }

  disconnectedCallback() { clearInterval(this._timer); }

  getCardSize() { return 2 + Math.ceil((this._config?.days || 7) * 0.6); }

  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  /* ---------- internals ---------- */
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
    const entity = this._config.entity;
    this._fetching = true;
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(from).toISOString(),
        end_time: new Date().toISOString(),
        entity_ids: [entity],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const list = (res && res[entity]) || [];
      this._history = list.map((it) => ({
        s: String(it.s ?? it.state),
        t: it.lc != null ? it.lc * 1000 : it.lu != null ? it.lu * 1000
          : Date.parse(it.last_changed || it.last_updated),
      })).filter((x) => !isNaN(x.t)).sort((a, b) => a.t - b.t);
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

  _changes() {
    const h = (this._history || []).slice();
    const st = this._hass?.states[this._config.entity];
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
    const sameDay = Date.UTC(w.y, w.m, w.d) === refDateUtc;
    return sameDay ? hm : `${String(w.d).padStart(2, "0")}/${String(w.m + 1).padStart(2, "0")} ${hm}`;
  }

  _render() {
    if (!this._config) return;
    const c = this._config;
    const root = this.shadowRoot;
    const hass = this._hass;

    if (!hass) { root.innerHTML = ""; return; }
    const stateObj = hass.states[c.entity];
    if (!stateObj) {
      root.innerHTML = `<ha-card><div class="warn" style="padding:16px">${esc(this._t("not_found"))}: ${esc(c.entity)}</div></ha-card>`;
      return;
    }

    const tz = this._tz();
    const now = Date.now();
    const { rows, startMin, lenMin } = computeRows(now, tz, c);
    if (c.order === "oldest_first") rows.reverse();
    const lang = hass.locale?.language || hass.language || "en";
    const dateFmt = new Intl.DateTimeFormat(lang, { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

    const intervals = this._history ? buildIntervals(this._changes(), now, c) : [];
    const name = c.name || stateObj.attributes.friendly_name || c.entity;
    const curClass = classify(stateObj.state, c);
    const icon = c.icon || stateObj.attributes.icon || "";

    // hour axis ticks (nominal wall-clock minutes from day start)
    const hours = lenMin / 60;
    const step = Number(c.hour_step) > 0 ? Number(c.hour_step)
      : hours <= 6 ? 1 : hours <= 12 ? 2 : hours <= 18 ? 3 : 4;
    const ticks = [];
    let first = (60 - (startMin % 60)) % 60;
    for (let off = first; off <= lenMin; off += 60) {
      const hh = ((startMin + off) / 60) % 24;
      const idx = Math.round((off - first) / 60);
      if (idx % step === 0) ticks.push({ pct: (off / lenMin) * 100, label: String(hh).padStart(2, "0") });
    }

    let totalOn = 0, totalElapsed = 0, countedDays = 0;
    const rowsHtml = rows.map((r) => {
      const span = r.end - r.start;
      const { blocks, onMs } = clipToWindow(intervals, r.start, r.end, now);
      const elapsed = Math.max(0, Math.min(r.end, now) - r.start);
      if (elapsed > 0) { totalOn += onMs; totalElapsed += elapsed; countedDays++; }

      const blocksHtml = blocks
        .filter((b) => b.c === "on" || (b.c === "unav" && c.show_unavailable))
        .map((b) => {
          const left = ((b.a - r.start) / span) * 100;
          const width = ((b.b - b.a) / span) * 100;
          const tip = `${this._t(b.c === "on" ? "on" : "unavailable")}: ${this._fmtTime(b.a, tz, r.dateUtc)} → ${this._fmtTime(b.b, tz, r.dateUtc)} (${formatDuration(b.b - b.a, "hm")})`;
          return `<div class="blk ${b.c}" style="left:${left.toFixed(3)}%;width:${Math.max(width, 0.15).toFixed(3)}%" title="${esc(tip)}"></div>`;
        }).join("");

      const gridHtml = ticks.map((t) => `<div class="gl" style="left:${t.pct.toFixed(3)}%"></div>`).join("");
      let futureHtml = "", nowHtml = "";
      if (now < r.end) {
        const p = Math.max(0, ((now - r.start) / span) * 100);
        futureHtml = `<div class="future" style="left:${p.toFixed(3)}%"></div>`;
        if (c.show_now && now >= r.start) nowHtml = `<div class="now" style="left:${p.toFixed(3)}%"></div>`;
      }
      const pct = span > 0 ? Math.round((onMs / span) * 100) : 0;
      const totalHtml = c.show_total
        ? `<div class="total" title="${pct}%">${elapsed > 0 ? esc(formatDuration(onMs, c.total_format)) : "–"}</div>` : "";

      return `<div class="row${r.current ? " current" : ""}">
          <div class="label">${esc(dateFmt.format(new Date(r.dateUtc)))}</div>
          <div class="track">${gridHtml}${blocksHtml}${futureHtml}${nowHtml}</div>${totalHtml}
        </div>`;
    }).join("");

    const axisHtml = c.show_hours ? `<div class="row axis"><div class="label"></div><div class="ticks">${
      ticks.map((t) => `<span style="left:${t.pct.toFixed(3)}%">${t.label}</span>`).join("")
    }</div>${c.show_total ? `<div class="total"></div>` : ""}</div>` : "";

    let status = "";
    if (!this._history && !this._error) status = `<div class="status">${esc(this._t("loading"))}</div>`;
    if (this._error) status = `<div class="status err">${esc(this._t("error"))}: ${esc(this._error)}</div>`;

    const summaryHtml = c.show_summary && countedDays > 0 && this._history ? `<div class="summary">
        ${esc(this._t("total"))} (${countedDays} ${esc(this._t("days"))}): <b>${esc(formatDuration(totalOn, c.total_format))}</b>
        · ${esc(this._t("avg"))}: <b>${esc(formatDuration(totalOn / countedDays, c.total_format))}</b>
        · ${totalElapsed > 0 ? Math.round((totalOn / totalElapsed) * 100) : 0}%
      </div>` : "";

    const onColor = c.on_color || "var(--state-active-color, var(--primary-color))";
    const offColor = c.off_color || "var(--secondary-background-color, rgba(127,127,127,.15))";
    const unColor = c.unavailable_color || "var(--disabled-text-color, #9e9e9e)";

    root.innerHTML = `
      <style>
        :host { --stc-on:${onColor}; --stc-off:${offColor}; --stc-un:${unColor}; --stc-h:${c.row_height}px; }
        ha-card { padding: 12px 16px 14px; }
        .head { display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px; }
        .head ha-state-icon, .head ha-icon { color: var(--state-icon-color); }
        .head.on ha-state-icon, .head.on ha-icon { color: var(--stc-on); }
        .name { flex:1; font-size:16px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .state { font-size:13px; color: var(--secondary-text-color); }
        .row { display:grid; grid-template-columns: 78px 1fr ${c.show_total ? "64px" : ""}; align-items:center; column-gap:8px; margin:4px 0; }
        .label { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; text-transform:capitalize; }
        .row.current .label { color: var(--primary-text-color); font-weight:600; }
        .track { position:relative; height:var(--stc-h); background:var(--stc-off); border-radius:4px; overflow:hidden; }
        .row.current .track { box-shadow: 0 0 0 1px var(--primary-color) inset; }
        .gl { position:absolute; top:0; bottom:0; width:1px; background: var(--divider-color, rgba(127,127,127,.25)); }
        .blk { position:absolute; top:0; bottom:0; }
        .blk.on { background: var(--stc-on); }
        .blk.unav { background: repeating-linear-gradient(45deg, var(--stc-un) 0 3px, transparent 3px 6px); opacity:.6; }
        .future { position:absolute; top:0; bottom:0; right:0; background: var(--card-background-color, #fff); opacity:.55; }
        .now { position:absolute; top:0; bottom:0; width:2px; margin-left:-1px; background: var(--error-color, #db4437); }
        .total { font-size:12px; text-align:right; font-variant-numeric: tabular-nums; color: var(--primary-text-color); white-space:nowrap; }
        .axis { margin-top:2px; }
        .ticks { position:relative; height:14px; font-size:10px; color: var(--secondary-text-color); }
        .ticks span { position:absolute; transform:translateX(-50%); }
        .summary { margin-top:8px; font-size:12px; color: var(--secondary-text-color); text-align:right; }
        .status { font-size:12px; color: var(--secondary-text-color); margin:4px 0; }
        .status.err { color: var(--error-color); }
      </style>
      <ha-card>
        <div class="head ${curClass}">
          ${icon ? `<ha-icon icon="${esc(icon)}"></ha-icon>` : `<ha-state-icon></ha-state-icon>`}
          <div class="name">${esc(name)}</div>
          <div class="state">${esc(hass.formatEntityState ? hass.formatEntityState(stateObj) : stateObj.state)}</div>
        </div>
        ${status}
        ${rowsHtml}
        ${axisHtml}
        ${summaryHtml}
      </ha-card>`;

    const si = root.querySelector("ha-state-icon");
    if (si) { si.hass = hass; si.stateObj = stateObj; }
    root.querySelector(".head").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: c.entity }, bubbles: true, composed: true }));
    });
  }
}

StatusTimelineCard._helpers = { parseTime, computeRows, classify, buildIntervals, clipToWindow, formatDuration, wallParts, zonedToEpoch };

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, StatusTimelineCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TAG,
    name: "Status Timeline Card",
    description: "Daily on/off timeline of any entity with configurable day start/end and total on-time.",
    preview: true,
    documentationURL: "https://github.com/YOUR_USER/status-timeline-card",
  });
  console.info(`%c STATUS-TIMELINE-CARD %c v${CARD_VERSION} `,
    "color:white;background:#03a9f4;font-weight:700", "color:#03a9f4;background:white;font-weight:700");
}
