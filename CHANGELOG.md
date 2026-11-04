# Changelog

Versioning scheme: **`YEAR.MONTH.SUBVERSION`** (e.g. `2026.10.6` = 6th release of October 2026).
The subversion restarts at `1` every new month. GitHub releases use the same number (HACS reads them).

## 2026.10.6
### Added
- **Numeric threshold entities show their current value in the state chip**: `Heater │ 152.3 W │ On`.
  The value uses Home Assistant's formatting (unit and display precision); the status badge on the right
  follows the `on_above` rule (and `invert`).
- Chip tooltip explains the rule, e.g. `152.3 W > 10 W (threshold) → On`.
- `show_value` option (card default `true`, overridable per entity) to hide the value and keep only the status.
### Changed
- For threshold entities the status badge is always the evaluated On / Off (independent of `state_display`).
- If the state is non-numeric (e.g. `unavailable`), the chip shows only the status, following `off_states`.

## 2026.10.5
### Fixed
- `LICENSE` recreated from GitHub's MIT template so the license is detected (HACS license check).

## 2026.10.4
### Added
- Duty cycle column right of each bar's total, with a thin proportional color bar and breakdown tooltip.
- `show_duty_cycle`, `duty_cycle_basis` (`elapsed` | `window` | `available`), `duty_cycle_decimals` (0–2).
- Summary footer percentage uses the same duty-cycle basis and decimals.

## 2026.10.3
### Added
- Day window validation (`day_end` later than `day_start` rejected unless `partial_day: true`).
- Row clamping to the next day's start (DST-safe), `state_display` option, `CHANGELOG.md`.
### Changed
- Current-state chips honor the configured mapping (`off_states`, `invert`).
- Version numbering moved to `YEAR.MONTH.SUBVERSION`.
### Breaking
- Configs with `day_end` > `day_start` now need `partial_day: true`.

## 2026.10.2 (formerly 1.1.0)
### Added
- Up to 3 entities with grouped bars and per-entity color, `off_states`, current-state chips,
  in-bar duration labels, per-entity summary, visual editor with one section per entity.

## 2026.10.1 (formerly 1.0.0)
### Added
- Initial release: recorder history of any entity, configurable logical day, 1–10 days, total on-time,
  summary, hour axis, now marker, unavailable hatching, `on_states`, `on_above`, `invert`, time zone / DST aware, ES/EN/PT.
