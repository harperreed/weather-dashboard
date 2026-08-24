<!-- ABOUTME: Defines the approved visual and configuration refactor for the weather dashboard. -->
<!-- ABOUTME: Covers daily range prominence, complete widget selection, and clear theme names. -->

# Dashboard Design Refactor

## Goal

Make today's high and low easy to scan, make `widgets` selection work for every
dashboard widget, and give themes a small, clear public vocabulary without
breaking saved URLs.

## Scope

This is a focused frontend refactor. It changes dashboard presentation and URL
configuration only. Weather providers, API response shapes, refresh behavior,
and server routes stay unchanged.

## Current Problems

- Today's high and low use small, partly transparent text beneath the main
  temperature, so they read as tertiary information.
- Widget selection is maintained through a switch statement that covers only
  seven widgets. Alerts, radar, clothing, solar, moon, and temperature trends
  cannot be selected consistently.
- Theme names mix colors, display targets, and aliases. Help text advertises
  several names for the same result without explaining the difference.

## Daily Temperature Range

The current-weather widget will show two labeled values directly beneath the
main temperature:

`HIGH 77°   LOW 65°`

The range will use full opacity, medium-to-semibold weight, tabular numerals,
and enough spacing to read as part of the primary temperature block. Labels
will remain short and visible rather than relying on color alone. Theme tokens
may distinguish the two values in color themes; the e-ink theme will retain
clear contrast without color.

The existing data rules remain in force:

- Render the range only when today's high and low are both finite numbers.
- Preserve valid zero and negative temperatures.
- Hide the complete range and remove its accessible label when either value is
  invalid or missing.
- Keep the accessible label in the form "Today's high 77 degrees, low 65
  degrees."

## Widget Catalog

One catalog will define every selectable widget, its host element, its public
name, and accepted aliases. URL parsing, component configuration, visibility,
and help text will read from this catalog.

| Public name | Host element | Accepted aliases |
| --- | --- | --- |
| `current` | `current-weather` | `now` |
| `alerts` | `weather-alerts` | `warnings` |
| `hourly` | `hourly-forecast` | `hours` |
| `daily` | `daily-forecast` | `week`, `days` |
| `temperature-trends` | `enhanced-temperature-trends` | `temperature`, `temp-trends` |
| `radar` | `precipitation-radar` | `precipitation` |
| `clothing` | `clothing-recommendations` | `clothes` |
| `air-quality` | `air-quality` | `airquality`, `air`, `aqi` |
| `wind` | `wind-direction` | `wind-direction`, `compass` |
| `pressure` | `pressure-trends` | `pressure-trends`, `trends` |
| `solar` | `solar-progress` | `sun` |
| `moon` | `moon-phase` | `lunar` |
| `timeline` | `hourly-timeline` | `list` |

Without a `widgets` parameter, all widgets keep their current default
visibility. With the parameter, only resolved catalog entries appear. Unknown
names are ignored. Repeated names and aliases collapse to one selection.

The existing individual boolean parameters remain accepted for the widgets
they currently support. The catalog becomes the source of truth for their name
resolution so the two selection paths cannot drift further.

The help section is not a weather widget. It remains hidden whenever a
non-empty `widgets` selection is present. An empty value behaves exactly like
an omitted parameter, including leaving help visible.

## Themes

Help and examples will advertise three names:

- `blue`: the default blue gradient and translucent cards
- `light`: a white background with dark text and subtle gray cards
- `eink`: the high-contrast, wide layout intended for e-ink dashboards

No theme parameter means `blue`. The body and components will receive only the
canonical names `blue`, `light`, or `eink`.

Compatibility aliases remain accepted but will not appear in normal help:

- `white` maps to `light`.
- `dashboard` maps to `eink`.
- The `background` parameter remains an alias for `theme`.

Unknown theme names fall back to `blue`. Existing saved links keep their
current visual result.

## Structure and Data Flow

1. Parse the query string once into canonical theme and widget selections.
2. Resolve names through the central theme map and widget catalog.
3. Apply the canonical theme to the page and propagate it to component hosts.
4. Apply host visibility before registering custom elements.
5. Each component reads the shared selection result instead of maintaining its
   own aliases. A disabled component does not call its widget-specific API.
6. Render the help section's available widget names from the catalog. Keep
   hand-written example URLs covered by catalog-aware tests.

Configuration stays client-side. No new persistence, framework, or package is
needed.

## Failure Handling

- Invalid widget names do not reveal unintended widgets or stop valid names
  from working.
- An empty `widgets` value behaves like no explicit selection.
- Invalid themes fall back to `blue`.
- Missing daily range data leaves no stale text or accessible label.
- Existing component fetch errors keep their current behavior.

## Testing

Tests will cover:

- Every public widget name selects its matching host.
- Every documented alias resolves to the same widget.
- Mixed valid and invalid widget lists show only valid selections.
- Default, empty, and repeated widget parameters behave predictably.
- `blue`, `light`, and `eink` resolve to canonical body themes.
- Compatibility theme and parameter aliases retain their current result.
- Unknown themes fall back to `blue`.
- Daily range rendering, missing values, zero, negative values, and non-finite
  values retain their data behavior.
- Rendered current weather gives the range stronger visual hierarchy in each
  theme.
- Narrow and wide browser checks confirm widget visibility and readable
  contrast.

The canonical project check remains `uv run --locked pytest tests`. Frontend
JavaScript tests continue to run through pytest with Node's built-in test
runner.

## Out of Scope

- A settings panel or interactive widget picker
- Drag-and-drop widget ordering
- Persisting preferences outside URL parameters
- New themes
- Backend, provider, caching, or deployment changes
