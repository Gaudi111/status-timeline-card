# Status Timeline Card

A Lovelace card that shows the **on/off history of any entity** (binary_sensor, switch, light, input_boolean, climate, numeric sensor with threshold…) as **one horizontal bar per day**, with the **total on-time on the right**.

Based on the idea and layout of [schedule-timeline-card](https://github.com/andregoncalvespires/schedule-timeline-card) by andregoncalvespires, reworked to read **recorded history** instead of `schedule.*` configuration.

## Features
- **Configurable logical day**: `day_start` / `day_end` (e.g. 04:00 → 04:00). Activity between 00:00 and 03:59 is counted in the *previous* day.
- Windows crossing midnight (e.g. 06:00 → 02:00) and partial windows (e.g. 08:00 → 20:00).
- **1 to 10 days**, current day first (or `oldest_first`), optionally excluding the current day.
- Total on-time per day (`5h 07m` or `5.12 h`), plus summary footer (total, daily average, % on).
- Hour axis, “now” marker, unavailable periods hatched, tooltips with start → end (duration).
- Numeric sensors: `on_above` threshold (e.g. power > 10 W = on). `invert` to count OFF time.
- Time zone aware (follows HA user profile setting: server or browser time zone), DST safe.
- Visual editor (native HA form), theme colors, ES / EN / PT texts.

## Installation
### HACS (custom repository)
1. HACS → ⋮ → **Custom repositories** → add this repo URL, category **Dashboard**.
2. Install **Status Timeline Card**, then reload the browser (Ctrl+F5).

### Manual
1. Copy `status-timeline-card.js` to `/config/www/`.
2. Settings → Dashboards → ⋮ → Resources → add `/local/status-timeline-card.js` (JavaScript module).

## Usage
```yaml
type: custom:status-timeline-card
entity: binary_sensor.water_pump
name: Water pump
day_start: "04:00"
day_end: "04:00"
days: 7
show_total: true
```

Power sensor as on/off, partial window, oldest first:
```yaml
type: custom:status-timeline-card
entity: sensor.heater_power
on_above: 10
day_start: "06:00"
day_end: "02:00"
days: 10
order: oldest_first
total_format: decimal
on_color: "#ff9800"
```

## Options
| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | **required** | Any entity with history. |
| `name` / `icon` | string | entity | Header overrides. |
| `day_start` | time | `00:00` | Start of the logical day. |
| `day_end` | time | `00:00` | End of the logical day. If `≤ day_start`, it ends the next calendar day. Equal = 24 h. |
| `days` | number | `7` | Rows to display (1–10). |
| `include_today` | bool | `true` | `false` = show only completed previous days. |
| `order` | string | `newest_first` | or `oldest_first`. |
| `on_states` | list | on, open, home, playing, heat, cool, heating, cooling, active, detected, true | States counted as ON (case-insensitive). |
| `on_above` | number | – | Numeric sensors: ON when value > threshold (overrides `on_states`). |
| `invert` | bool | `false` | Count OFF time instead. |
| `show_total` | bool | `true` | Total on-time column on the right (hover = % of day). |
| `total_format` | string | `hm` | `hm` (5h 07m) or `decimal` (5.12 h). |
| `show_summary` | bool | `true` | Footer with total, average and %. |
| `show_hours` / `show_now` / `show_unavailable` | bool | `true` | Axis, now marker, hatched unavailable periods. |
| `hour_step` | number | `0` (auto) | Hours between axis labels. |
| `row_height` | number | `18` | Bar height in px. |
| `refresh_interval` | number | `300` | Seconds between history reloads (state changes are drawn live). |
| `time_zone` | string | `auto` | `auto` (user profile), `server`, `local`. |
| `on_color` / `off_color` / `unavailable_color` | CSS color | theme | Color overrides. |

## Notes
- Data comes from the recorder (`history/history_during_period`). The default `purge_keep_days` is **10**; to show 10 *previous* days plus today, set it to at least 11:
  ```yaml
  recorder:
    purge_keep_days: 14
  ```
- Excluding the entity from the recorder will leave the bars empty.
- With `day_start: "04:00"`, at 02:00 on Tuesday the current row is still **Monday** (Mon 04:00 → Tue 04:00).

## License
MIT (keep the attribution to the original project).
