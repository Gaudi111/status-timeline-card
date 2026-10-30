# Status Timeline Card

Lovelace card showing the **on/off history of up to 3 entities** as **grouped horizontal bars per day**, with the **total on-time on the right** of each bar.

Based on the idea of [schedule-timeline-card](https://github.com/andregoncalvespires/schedule-timeline-card) by andregoncalvespires, reworked to read recorded history.

## Features
- **Up to 3 entities** per card, shown as clustered bars for each day, each with its **own color**.
- **Current state header**: one chip per entity, outlined in its configured color, with the current state.
- **OFF mapping** (`off_states`): e.g. treat `unavailable` / `unknown` as OFF instead of hatched gaps.
- **Duration inside each ON block**, shown only when it fits (re-evaluated on resize).
- **Configurable logical day**: `day_start` / `day_end` (e.g. 04:00 → 04:00), midnight-crossing and partial windows.
- **1 to 10 days**, newest or oldest first, optionally excluding the current day.
- Total per bar (`5h 07m` or `5.12 h`), summary footer per entity (total, average, %).
- Hour axis, "now" marker, tooltips, numeric thresholds (`on_above`), `invert`.
- Time zone and DST aware. Visual editor. ES / EN / PT.

## Installation
**HACS**: ⋮ → Custom repositories → this repo, category **Dashboard** → install → Ctrl+F5.
**Manual**: copy `status-timeline-card.js` to `/config/www/` and add `/local/status-timeline-card.js` as a JavaScript module resource.

## Usage
```yaml
type: custom:status-timeline-card
title: Water system
day_start: "04:00"
day_end: "04:00"
days: 7
off_states: [unavailable, unknown]      # default for all entities
entities:
  - entity: binary_sensor.water_pump
    name: Pump
    color: "#2196f3"
  - entity: switch.pressure_booster
    name: Booster
    color: "#ff9800"
  - entity: sensor.heater_power
    name: Heater
    color: "#e91e63"
    on_above: 10                        # W
    off_states: []                      # keep unavailable hatched for this one
```
The v1.0 single-entity form (`entity: binary_sensor.x`) still works.

## Options
### Card
| Option | Default | Description |
|---|---|---|
| `entities` | – | List (max 3) of entity IDs or objects (see below). |
| `entity` | – | Single entity (backward compatible). |
| `title` | – | Optional card title. |
| `day_start` / `day_end` | `00:00` | Logical day window. `day_end ≤ day_start` ends next day; equal = 24 h. |
| `days` | `7` | 1–10. |
| `include_today` | `true` | `false` = completed days only. |
| `order` | `newest_first` | or `oldest_first`. |
| `show_state` | `true` | Current-state chips with color reference. |
| `show_total` | `true` | Total on-time right of each bar (hover = %). |
| `total_format` | `hm` | `hm` or `decimal`. |
| `show_block_values` | `true` | Duration inside ON blocks when it fits. |
| `block_value_min_ms` | `0` | Only label blocks at least this long. |
| `show_summary` / `show_hours` / `show_now` / `show_unavailable` | `true` | Footer, axis, now marker, hatched unavailable. |
| `on_states` | on, open, home, … | Default ON states. |
| `off_states` | `[]` | Default states forced to OFF (checked first). |
| `on_above` / `invert` | – / `false` | Default numeric threshold / count OFF time. |
| `row_height` | `0` (auto: 18 single, 14 grouped) | Bar height in px. Labels need ≥ 12. |
| `hour_step` | `0` (auto) | Hours between axis labels. |
| `refresh_interval` | `300` | History reload seconds. |
| `time_zone` | `auto` | `auto`, `server`, `local`. |
| `off_color` / `unavailable_color` | theme | Bar background / hatch color. |

### Per entity
| Option | Description |
|---|---|
| `entity` | Required. |
| `name` / `icon` | Overrides. |
| `color` | CSS color (`"#2196f3"`, `red`, `var(--accent-color)`) or `[r, g, b]`. Defaults: blue, orange, green. |
| `on_states`, `off_states`, `on_above`, `invert` | Override the card defaults. |

### State classification order
1. In `off_states` → **OFF**
2. `unavailable` / `unknown` → **unavailable** (hatched, not counted)
3. `on_above` (numeric) → ON if value > threshold
4. `on_states` → ON, anything else OFF
`invert` swaps ON/OFF.

## Notes
- History comes from the recorder; for 10 previous days set `recorder: purge_keep_days: 14`.
- With `day_start: "04:00"`, at 02:00 Tuesday the current row is still Monday.

## License
MIT (keep the attribution to the original project).
