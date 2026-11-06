# Changelog

Versioning scheme:
- **`YYYY.MM`** for the first release of a month (e.g. `2026.11`).
- **`YYYY.MM.S`** for later releases in the same month (e.g. `2026.11.1`, `2026.11.2`).

GitHub releases use the same number (HACS / Marketplace read them).
Releases up to `2026.10.6` used `YYYY.MM.S` from the first release of the month and are kept unchanged.

## 2026.11.2
### Added
- **ON / OFF duration in the state chip**: the status badge shows how long the entity has been in its current
  state, e.g. `On · 2h 15m`. Tooltip shows the start time (`On since 09:37 (2h 15m)`).
  - `show_on_duration` (default `true`) and `show_off_duration` (default `false`), selectable independently,
    card-wide (visual editor) or per entity (YAML).
  - Calculated from the classified history, so numeric threshold sensors show the time since the threshold was
    crossed, not since the last value change. OFF-mapped states (`off_states`) count as OFF.
  - Shown as `≥ 3d 4h` when the period started before the loaded history.
- **Running indicator** for the current day when the entity is ON (its total is increasing):
  `running_indicator: box` (default, total in a rounded box in the entity color), `badge` (small `ON` pill left of
  the total) or `none`. Tooltip: *Running – total is increasing*.
### Changed
- Total column widened slightly when a running indicator is enabled.
- Durations and running indicator refresh every minute.

## 2026.11.1
### Security
- **Color options can no longer inject markup or CSS** (reported in the HACS default-repository review).
  - New `sanitizeColor()`: accepts `[r, g, b]` (clamped integers) or a CSS color string; strings containing
    `; { } < > " ' \` `` ` `` `@` or line breaks are rejected, and the value must pass `CSS.supports("color", …)`
    (allow-list regex fallback when `CSS.supports` is unavailable).
  - Invalid `color`, `on_color`, `off_color` and `unavailable_color` values are ignored with a console warning and the default is used.
  - Colors are no longer interpolated into HTML or the `<style>` block: they are applied after rendering with
    `element.style.setProperty("--c" | "--stc-off" | "--stc-un", value)`.
  - Duty-cycle width (`--p`), bar height (`--stc-h`) and grid rows are also applied via the CSSOM from validated numbers.
  - Visual editor shows an alert for invalid colors (rendered with `textContent`).
### Changed
- README: new *Colors* section with accepted formats.

## 2026.11
### Added
- README: "Open in HACS / Marketplace" button and installation steps for the Home Assistant Marketplace (2026.11+) and the HACS store.
- README: **Screenshots** section (on/off entity and numeric entity examples).
### Changed
- Versioning moved to `YYYY.MM` / `YYYY.MM.S`.
- README installation section reordered: Marketplace / HACS first, custom repository and manual install as alternatives.
### Removed
- Mock-up preview image (`images/preview.png`, `images/preview.svg`); replaced by real screenshots.

## 2026.10.6
### Added
- Numeric threshold entities show their current value in the state chip: `Heater │ 152.3 W │ On`.
- Chip tooltip explains the rule, e.g. `152.3 W > 10 W (threshold) → On`.
- `show_value` option (card default `true`, overridable per entity).
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
