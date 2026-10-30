# Changelog

Versioning scheme: **`YEAR.MONTH.SUBVERSION`** (e.g. `2026.10.4` = 4th release of October 2026).
The subversion restarts at `1` every new month. GitHub releases use the same number (HACS reads them).

## 2026.10.4
### Added
- **Duty cycle column**: on-time percentage to the right of each bar's total, with a thin color bar
  proportional to the value. Hover shows `on-time / considered time`.
- `show_duty_cycle` (default `true`), `duty_cycle_basis` (`elapsed` | `window` | `available`),
  `duty_cycle_decimals` (0–2). Also available in the visual editor.
- Summary footer percentage now uses the same duty-cycle basis and decimals.
### Changed
- Total tooltip now shows the duty-cycle breakdown.
- Unrecorded time (before the first history record) is treated as unavailable for the `available` basis.
- Preview image and README updated; `documentationURL` points to the repository.

## 2026.10.3
### Added
- Day window validation: `day_end` later than `day_start` is rejected (it would overlap the next day and
  count records twice). Clear error in the card and in the visual editor.
- `partial_day: true` to explicitly allow a same-day window (e.g. `08:00` → `20:00`).
- Safety net: each day row is clamped to the next day's start (DST-safe).
- `state_display` option: `mapped` (default), `mapped_only`, `raw`.
- `CHANGELOG.md`.
### Changed
- Current-state chips honor the configured mapping (`off_states`, `invert`).
- Version numbering moved to `YEAR.MONTH.SUBVERSION`.
### Breaking
- Configs with `day_end` > `day_start` now need `partial_day: true`.

## 2026.10.2 (formerly 1.1.0)
### Added
- Up to 3 entities per card, grouped bars per day, per-entity color.
- `off_states` to map states such as `unavailable` to OFF.
- Current-state header with one chip per entity.
- Duration label inside each ON block when it fits.
- Per-entity summary footer; visual editor with one section per entity.

## 2026.10.1 (formerly 1.0.0)
### Added
- Initial release: recorder history of any entity, configurable logical day, 1–10 days, total on-time per day,
  summary, hour axis, now marker, unavailable hatching, `on_states`, `on_above`, `invert`, time zone / DST aware, ES/EN/PT.
