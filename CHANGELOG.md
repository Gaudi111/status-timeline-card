# Changelog

Versioning scheme: **`YEAR.MONTH.SUBVERSION`** (e.g. `2026.10.3` = 3rd release of October 2026).
The subversion restarts at `1` every new month. Git tags / GitHub releases use the same number (HACS reads them).

## 2026.10.3
### Added
- **Day window validation**: `day_end` later than `day_start` is rejected (it would overlap the next day and count the same records twice). Clear error in the card and in the visual editor.
- `partial_day: true` to explicitly allow a same-day window (e.g. `08:00` → `20:00`).
- Safety net: each day row is clamped so it never extends past the next day's start (also DST-safe).
- `state_display` option: `mapped` (default), `mapped_only`, `raw`.
- `CHANGELOG.md`.
### Changed
- **Current-state chips now honor the configured mapping**: a state listed in `off_states` (e.g. `unavailable`) is shown as **Off** with the OFF style, not as *Unavailable*. Same for `invert`. The raw state stays in the chip tooltip.
- Version numbering moved to `YEAR.MONTH.SUBVERSION` (former 1.0.0 → 2026.10.1, 1.1.0 → 2026.10.2).
### Breaking
- Configs with `day_end` > `day_start` (e.g. `08:00` → `20:00`) now need `partial_day: true`.

## 2026.10.2 (formerly 1.1.0)
### Added
- Up to **3 entities** per card, grouped/clustered bars per day, **per-entity color**.
- `off_states` (card default and per entity) to map states such as `unavailable` to OFF.
- Current-state header with one chip per entity in its configured color.
- Duration label inside each ON block, shown only when it fits (`show_block_values`, `block_value_min_ms`).
- Per-entity summary footer. Visual editor with one section per entity.
### Changed
- `entities:` list replaces `entity:` (single `entity:` still supported).

## 2026.10.1 (formerly 1.0.0)
### Added
- Initial release, reworked from schedule-timeline-card to read recorder history of any entity.
- Configurable logical day (`day_start` / `day_end`), 1–10 days, total on-time per day, summary,
  hour axis, now marker, unavailable hatching, `on_states`, `on_above`, `invert`, time zone / DST aware, ES/EN/PT.
