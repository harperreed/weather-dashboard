<!-- ABOUTME: Defines the approved 1a phone and 2b eInk dashboard redesign. -->
<!-- ABOUTME: Covers layout composition, the insight rules, chart geometry, and moonrise data. -->

# Dashboard Redesign

## Goal

Make the dashboard glanceable. Replace the stack of thirteen widgets with a
type-led phone screen and a chart-led eInk screen that answer "what is it doing
outside, and what should I do about it" without scrolling or interpretation.

The source design is `Dashboard redesign approach.zip` in the repository root:
option **1a** for phone, desktop, and the light theme, option **2b** for eInk
at 800x480. Its `README.md` carries the type, color, and geometry values. Where
this spec and that README disagree, this spec wins and says why.

## Scope

Frontend composition, plus one addition to `LunarProvider`. The theme system,
URL configuration grammar, widget catalog mechanism, weather providers, API
response shapes, refresh behavior, and server routes stay as they are.

## Current Problems

- The default page renders thirteen widgets in one column. Nothing is
  prioritized, so nothing is glanceable.
- Humidity, wind, dew point, and UV are shown as raw numbers. A reader has to
  combine them to learn anything actionable.
- eInk is the blue layout with token overrides. It does not use the shape of an
  800x480 frame, which is the only size those displays have.

## Composition

### Structure

`templates/weather.html` gains two wrappers and one element:

```html
<div class="weather-container">
  <weather-alerts></weather-alerts>
  <div class="stat-band">
    <current-weather></current-weather>
    <div class="sky-pair">
      <solar-progress></solar-progress>
      <moon-phase></moon-phase>
    </div>
  </div>
  <weather-insights></weather-insights>
  <hourly-forecast></hourly-forecast>
  <daily-forecast></daily-forecast>
  <!-- opt-in widgets, unchanged order -->
</div>
```

`.weather-container` becomes a flex column. Both wrappers use
`display: contents` in blue and light, so their children become flex items of
the container and `order` produces the 1a sequence:

1. `current-weather`
2. `weather-alerts`
3. `weather-insights`
4. `hourly-forecast`
5. `.sky-pair`, a two-column grid of the Sun and Moon cards
6. `daily-forecast`
7. opt-in widgets

In eInk, `.stat-band` becomes a real box: the white card with a 2px black
border that holds `current-weather` and `.sky-pair` side by side. The eInk
order is alerts, stat band, hours, footer strip. `daily-forecast` is off.

An active alert renders above the stat band in eInk. That pushes the band below
the 480px frame, which is the correct trade: an alert is worth breaking the
layout for.

### Widget catalog

Each `WIDGET_CATALOG` entry in `static/js/dashboard-config.js` gains
`defaultThemes`. Default visibility becomes `defaultThemes.includes(theme)`.

| Entry | Host | `defaultThemes` |
| --- | --- | --- |
| `current` | `current-weather` | blue, light, eink |
| `alerts` | `weather-alerts` | blue, light, eink |
| `insights` (new) | `weather-insights` | blue, light, eink |
| `hourly` | `hourly-forecast` | blue, light, eink |
| `solar` | `solar-progress` | blue, light, eink |
| `moon` | `moon-phase` | blue, light, eink |
| `daily` | `daily-forecast` | blue, light |
| `temperature-trends` | `enhanced-temperature-trends` | none |
| `radar` | `precipitation-radar` | none |
| `clothing` | `clothing-recommendations` | none |
| `air-quality` | `air-quality` | none |
| `wind` | `wind-direction` | none |
| `pressure` | `pressure-trends` | none |
| `timeline` | `hourly-timeline` | none |
| `help` (new) | `help-section` | none |

`insights` takes the alias `insight`. `help` takes no alias.

`parseDashboardConfig` already resolves the theme in the same pass, so this is
a reordering plus one membership check. An explicit `widgets=` selection and
the existing per-widget boolean parameters override the defaults exactly as
they do today, so every saved URL keeps its current result.

Two consequences of this table:

- The help section leaves the default page. `?widgets=help` brings it back.
  This costs a first-time visitor the discoverability of every URL option; the
  page will no longer advertise that `?theme=eink` exists. The redesign accepts
  that cost in exchange for a glanceable default.
- `?widgets=daily` is how eInk gets the seven-day strip. It does not fit
  alongside the 2b composition in a 480px frame.

`weather-alerts` currently renders a header at zero alerts
(`static/js/weather-components.js:2565`). It must render nothing and hide its
host when the alert list is empty.

## Screen 1a: blue and light

Container padding 28px 24px 32px, flex column, `gap: 28px`. Font
`system-ui, -apple-system, sans-serif`. All numerals use
`font-variant-numeric: tabular-nums`.

### Header row

Flex, space-between. Location left, weekday and time right. 13px, weight 600,
letter-spacing .06em, uppercase, opacity .85. The location reads
`data.location` from the weather payload. The time is client-side on a
one-minute tick. This is a label only; there is no location switcher.

### Temperature block

Column, gap 4px.

- Temperature: weight 200, line-height .9, letter-spacing -.06em,
  margin-left -8px.
- Summary: 22px, weight 500.
- High and low row: flex, gap 20px, margin-top 6px. Label 11px,
  letter-spacing .1em, opacity .75, margin-right 6px; value 17px weight 600.
  High uses `--temp-high`, low uses `--temp-low`.
- Three-temperature module, margin-top 18px, column gap 8px.

The existing daily-range contract carries over unchanged: render only when
today's high and low are both finite, preserve valid zero and negative values,
hide the complete row and remove its accessible label when either value is
missing, and keep the label in the form
`Today's high 23 degrees, low 9 degrees.`

### Hero type scale

The source README specifies 168px for the blue hero and 112px for eInk and asks
for pixel-exact recreation. Those literals overflow: at the 320px container
`-18°` does not fit at 168px, and eInk is supported down to 320px width.

The hero sizes are therefore expressed as `clamp()` that resolves to the
specified value at the design width and shrinks below it. At 390px blue and
800px eInk the rendering is identical to the mock. This is the only deliberate
departure from the README's geometry.

### Three-temperature module

A three-column grid, gap 8px: FEELS left-aligned, WET BULB centered, AIR
right-aligned. Label 11px, letter-spacing .1em, opacity .75, weight 700; value
26px weight 600, line-height 1.

Below it a scale track, height 14px: a 2px line at top 6px in
`rgba(255,255,255,.3)`; a filled segment from 0 to the wet-bulb position in
`--temp-low`; three 10px dots, Feels at left filled with `--temp-low`, Wet bulb
at `wetPct` filled white and translated -50%, Air at right as a 2px white ring
on transparent.

`wetPct = (wetBulb - feels) / (air - feels) * 100`. When `air == feels`, place
every dot at 100%. Clamp the result to [0, 100].

An explainer line follows at 12px, opacity .75, line-height 1.4, whose trailing
clause comes from the wet-bulb rule below.

### Insight card

16px, line-height 1.45, padding 14px 16px, radius 14px, background
`rgba(15,23,42,.45)`, border 1px `rgba(255,255,255,.15)`. A new
`--insight-surface` token carries the background; the existing
`--daily-range-surface` keeps its current value and its current use.

> **Errata, 2026-09-03.** The last clause is stale. Implementation deleted the
> `.daily-range-item` pill — both mock screens show bare high and low text —
> which left `--daily-range-surface` with no consumer, so the token was retired
> in all three theme blocks and a test now forbids its return. Ruling R45 in
> `.superpowers/sdd/2026-09-02-dashboard-redesign/progress.md`. The
> implementation plan repeats the same stale sentence and shows the deleted
> rule; the shipped code and its tests are the authority on this token.

### Next 12 hours

Column, gap 10px.

- Caption row: flex space-between, 11px, letter-spacing .1em, uppercase,
  weight 700, opacity .8. Left `NEXT 12 HOURS`, right the precipitation window
  label, omitted when there is no window.
- Chart: relative, height 150px.
- Hour grid: each cell a centered column, temperature 13px weight 700, time
  10px opacity .75, precipitation label 10px weight 600 in `--temp-low`, shown
  only at 40% or above.
- Legend: 11px opacity .75. A 14x3 swatch in `--temp-high` labelled
  `temperature`, and an 8x10 swatch in `rgba(219,234,254,.35)` labelled with
  the precipitation noun plus ` chance`.

### Sun and Moon cards

`.sky-pair` is a two-column grid, gap 10px, margin-top auto. Each card: padding
14px, radius 14px, `var(--card-bg)`, border 1px `var(--card-border)`, column
gap 6px. Caption 11px, letter-spacing .1em, uppercase, opacity .75, weight 700.

Sun: `Sets 4:31pm` at 20px weight 600; a 4px progress track, radius 2px,
`rgba(255,255,255,.2)`, filled in `--temp-high` to `daylight.progress`; then
`2h 51m of daylight left` at 12px opacity .8.

The mock is a daytime snapshot and the dashboard runs at night, so the card has
a second state. Once the current time passes `times.sunset`, the heading
becomes `Sunrise {time}` from tomorrow's entry in the weather payload's `sun`
map, the track fills completely, and the line reads `{duration} until sunrise`.
The duration never renders negative. When tomorrow's sunrise is unavailable the
heading falls back to `Sunrise` alone and the duration line is dropped.

Moon: phase name at 20px weight 600; an 18px circle rendered as
`linear-gradient(90deg,#fff 0 {illumination}%,rgba(255,255,255,.2) {illumination}%)`;
then `72% lit · rises 3:12pm` at 12px opacity .8.

### Light theme

Same layout with surfaces `#f8fafc`, borders `rgba(0,0,0,.1)`, high `#b45309`,
low `#0369a1`, bar fill `rgba(3,105,161,.25)`, line `#b45309`. These are token
values; no component reads them directly.

## Screen 2b: eInk

800x480, background `#eeeeee`, color `#000`, padding 8px,
`box-sizing: border-box`, column, gap 8px. Cards are `#fff` with
`2px solid #000`. No radii, no opacity, no color. Hierarchy comes from weight
(800 and 900) and hatch fills. The hatch is
`repeating-linear-gradient(45deg,#000 0 2px,transparent 2px 5px)` in the stat
band and `repeating-linear-gradient(45deg,#000 0 2px,transparent 2px 6px)` in
the chart.

The 8px gutter, `width: 100%`, `max-width: none`, and no-horizontal-overflow
rules from `docs/superpowers/specs/2026-08-24-eink-current-spacing-design.md`
continue to apply at every supported width. The hour-label clamps from
`docs/superpowers/specs/2026-08-24-hourly-forecast-layout-design.md` continue
to apply at 320 and 390.

### Stat band

Padding 10px 16px, flex, align-items center, gap 22px. A min-height keeps the
band from collapsing when solar or lunar data has not arrived.

- Temperature: weight 900, line-height .85, letter-spacing -.06em,
  margin-left -6px.
- Text column, `border-left: 2px solid #000`, padding-left 18px, stretching the
  band height with content centered: `CHICAGO · TUE 1:40PM` at 13px weight 800,
  letter-spacing .08em, uppercase; summary 22px weight 800; high and low row,
  gap 16px, label 11px weight 800 letter-spacing .1em margin-right 5px, value
  20px weight 900.
- Three-temperature bars, `border-left: 2px solid #000`, padding-left 18px. A
  grid of `auto 120px auto`, gap 4px 10px, rows AIR, WET BULB, FEELS. Label
  11px weight 800 letter-spacing .1em; bar height 12px, width
  `value / air * 100%` of the 120px track, clamped to [0, 100], with AIR always
  100%; value 18px weight 900. AIR is solid `#000`; WET BULB is hatch with a
  1px black border; FEELS is a 1px black border and empty. A negative feels-like
  renders a zero-width bar and still prints its value.
- Right column, margin-left auto, right-aligned, 14px weight 800,
  line-height 1.25, gap 6px. This is `.sky-pair`. The solar card renders two
  lines, `Sunset {time}` and `{duration} of light left`, becoming
  `Sunrise {time}` and `{duration} until sunrise` after sunset by the same rule
  as the blue card; the moon card renders one, `Moon {illumination}% · rises
  {time}`, dropping to `Moon {illumination}%` when moonrise is `None`.

### Hours card

`flex: 1`, padding 10px 14px 8px, column, gap 4px. Caption `NEXT 12 HOURS` and
the precipitation window at 12px weight 800, letter-spacing .1em, uppercase.
The chart fills the remaining height. Hour grid: temperature 20px weight 900,
time 13px weight 800, precipitation label 12px weight 800 at 40% or above.

### Footer facts

A grid of one column per available fact, gap 8px, each 16px weight 800, padding
10px 14px. The first cell is inverted, `#000` background and `#fff` text. The
facts are the short forms of the wind-chill, precipitation-window, overnight,
humidity, gust, and ultraviolet rules, in that order. The strip hides when no
fact applies.

### Written forecast

The eInk panel is specified at 800x480 and runs at 680x710 inside HADashboard.
`hourly-forecast` is the only `flex: 1` child of the container and
`.chart-container` the only one inside it, so the extra 230px landed in the
chart twice over and left a void under the bars. The written forecast fills it.

The block renders the National Weather Service's prose for the period the panel
is standing in: the caption is `periods[0].name`, the body its
`detailed_forecast`, inserted as text. It reads last on eInk, after the footer
facts, at `order: 5`; on the phone and desktop it is opt-in and joins the
widgets at `order: 7`.

The service covers the United States only. A location it does not cover answers
with no periods and the block hides itself, which returns the void — an honest
gap in preference to an invented paragraph. The prose runs 50 to 60-odd words
and takes the height it needs; the chart, holding the container's only `flex`,
gives up the difference.

`WeatherApp` fetches `/api/weather/alerts` on the weather refresh cadence and
broadcasts the whole answer as `weather-alerts-updated`. Both the alerts strip
and this block read that one broadcast, so the written forecast survives
`?widgets=hourly,forecast` with the alerts strip switched off.

## Chart geometry

Both themes share one chart, differing only in stroke, fill, and padding.

Layer 1 is an N-column grid of precipitation bars, where N is the number of
rendered hours, occupying the bottom third of the chart: a bar is `precip% / 3`
of the chart's height, with a 4px floor so a small chance still paints. Radius
3px 3px 0 0 in blue, square in eInk.

The columns carry **no grid gap**. The visual gap (3px blue, 6px eInk) is
inset padding on a wrapper cell, with the bar itself as an inner element at
100% height. A gap between grid columns would shift column centers away from
the evenly divided SVG width and walk the temperature line off the bars, which
`gotchas.md` already records as a fixed bug. With gapless columns the line,
the bars, the temperatures, and the times share exact centers.

Layer 2 is an absolutely positioned SVG with `viewBox="0 0 1000 H"`,
`preserveAspectRatio="none"`, and `vector-effect: non-scaling-stroke` on the
polyline, so it needs no resize observer and no measured width. `H` is 150 in
blue and 180 in eInk. Points follow the existing `calculateHourlyChartPoints`
contract, generalized to take symmetric padding:

```
x = (i + 0.5) * (1000 / N)
y = pad + (1 - (t - min) / (max - min)) * (H - 2 * pad)
```

`pad` is 14 in blue and 16 in eInk. A flat range centers the line, as today.
Stroke is 3px `--temp-high` in blue and 5px `#000` in eInk, with round joins
and caps.

The current-hour marker is a positioned HTML element, not an SVG circle.
`preserveAspectRatio="none"` scales x and y by different factors, so an SVG
circle would render as an ellipse at every width but the one the viewBox was
authored for. The marker is placed at `left: (i + 0.5) / N * 100%` and
`top: y / H * 100%` with a -50% translate: 10px white in blue, 16px white with
a 3px `#000` border in eInk.

N is the number of rendered hours, `min(12, available)`. The grid, the SVG, the
hour labels, and the caption all read N, never a hardcoded 12; the caption
reads `NEXT {N} HOURS`.

## Insights

Rule-based and client-side. No model call, no network call. Fragments are built
independently, inapplicable ones are omitted, and the rest join with spaces.

| Rule | Condition | Long form | Short form |
| --- | --- | --- | --- |
| Wind chill | `temp - feels_like >= 10` | `Wind makes {temp}° feel like {feels}°.` | `Feels like {feels}° in the wind` |
| Precipitation window | the first run of contiguous hours at 60% or above | `{Noun} likely {start}–{end}, heaviest around {peak}.` | `{Noun} {start}–{end}` |
| Overnight | always, when a low exists | `Falling to {low}° overnight{clause}.` | `{low}° overnight` |
| Humidity | `dew_point >= 65` | `Humid at a {dew}° dew point.` | `Humid, dew point {dew}°` |
| Gust | `wind_gust - wind_speed >= 8` | `Wind gusting to {gust}.` | `Gusts to {gust}` |
| Ultraviolet | `uv_index >= 6` | `UV index {uv} — cover up.` | `UV {uv}` |

The overnight clause is ` — layers and a hat` below 20°F, ` — bring a jacket`
from 20°F to 45°F, and absent above 45°F.

The window is scanned across the same N hours the chart renders, and only the
first qualifying run is used. `{peak}` is the hour with the highest chance
inside that run, the earliest one on a tie. `{start}` and `{end}` are the hour
labels of the run's first and last hours.

The precipitation noun comes from the hourly `icon` values inside the window:
snow from `snow`, `heavy-snow`, `light-snow`; sleet from `sleet`; rain from
`rain`, `heavy-rain`, `light-rain`; `Precipitation` when the window mixes types
or matches none. The caption form is uppercase, the footer form is sentence
case.

The humidity threshold is the NWS comfort scale's turn from "noticeable" to
"humid"; the ultraviolet threshold opens the WHO's "high" band, and the reading
prints rounded to a whole number. No standard sets the gust gap: 8 mph over the
steady wind is where a gust starts slamming a door rather than moving a leaf.
A rule whose reading is missing or non-numeric is dropped rather than printed
blank.

The wet-bulb explainer clause is `dangerous for exertion` at 80°F or above,
`limit hard exertion` from 70°F to 79°F, and
`safe for exertion above 50°, this is well under` below 50°F. Between 50°F and
69°F the clause is dropped.

`static/js/weather-insights.js` holds these as pure exported functions
alongside `wetBulbPosition` and `calculateWetbulbTemp`, which moves here from
`static/js/weather-components.js:179` and gains an export. The module follows
`dashboard-config.js`: plain functions, `module.exports`, no dependencies.

## Moonrise

`LunarProvider` gains `moonrise` and `moonset` under `current_phase`.

The method computes the moon's apparent position from a low-precision lunar
theory, samples altitude hourly across the local day, and interpolates the
crossings of the standard `h0 = +0.125°` horizon, which accounts for parallax,
refraction, and semidiameter. Results are ISO strings in the location's
timezone.

Either value is `None` when no crossing occurs that day. This is ordinary, not
exceptional: the moon rises roughly fifty minutes later each day, so about once
a month a calendar day has no moonrise, and high latitudes produce longer runs.
The moon card drops the `rises` clause when the value is `None` and keeps the
rest of its content.

Tests pin the computed times to published almanac values for fixed dates and
locations, never to this implementation's own output.

## Data flow

1. `parseDashboardConfig` resolves theme and visibility from the query string.
2. `applyDashboardConfig` sets `data-theme` and `hidden` on every host before
   custom elements register.
3. `WeatherApp` resolves the location and fetches `/api/weather`, then
   dispatches `weather-data-updated`.
4. `current-weather`, `hourly-forecast`, `weather-insights`, and
   `daily-forecast` read that one event. None of them fetch.
5. `solar-progress` and `moon-phase` keep their own `/api/solar` and
   `/api/lunar` calls.
6. Socket.IO updates dispatch the same event.

No new fetch, no new persistence, no new package.

## Failure Handling

| Condition | Result |
| --- | --- |
| High or low missing or non-finite | Row hidden, accessible label removed |
| `air == feels` | Every scale dot at 100% |
| Fewer than 12 hourly entries | Grid, SVG, and labels size to the actual count |
| Flat temperature range | Line centers vertically |
| No hours at 60% or above | Caption label omitted, precipitation clause dropped |
| No insight clause applies | `weather-insights` hides its host |
| Fewer than three footer facts | Footer grid sizes to the facts present |
| Moonrise `None` | Clause dropped, rest of the moon card intact |
| Current time past sunset | Sun card switches to the sunrise state; no negative duration |
| Tomorrow's sunrise unavailable | Heading reads `Sunrise`, duration line dropped |
| Solar or lunar fetch fails | Cards keep current error behavior; band min-height holds |
| Zero alerts | `weather-alerts` hides its host |
| Unknown theme or widget name | Existing fallbacks, unchanged |

## Testing

The canonical check remains `uv run --locked pytest tests`. Frontend JavaScript
tests run through pytest with Node's built-in test runner, and each new test
file must be added to the parametrize list in
`tests/unit/test_frontend_javascript.py` or it never runs.

JavaScript unit tests:

- `weather-insights.test.js`, new: every rule and threshold, fragment joining
  and omission, contiguous-window detection and peak selection, noun selection
  including the mixed case, the wet-bulb clause bands, `wetBulbPosition`
  including the `air == feels` guard, and `calculateWetbulbTemp`.
- `dashboard-config.test.js`, extended: `daily` on in blue and light and off in
  eInk; every opt-in widget off by default in all three themes; `?widgets=daily`
  showing it in eInk; `?widgets=help` showing help; every existing public name,
  alias, and boolean parameter resolving exactly as before.
- `current-weather-range.test.js`, rewritten: the new markup, the daily-range
  contract including zero, negative, and non-finite values, and the
  three-temperature values and scale positions.
- `hourly-forecast-layout.test.js`, extended: gapless column count equal to the
  rendered hour count, chart points landing on exact column centers, fewer than
  twelve hours, a flat range, and precipitation labels only at 40% or above.
- `sky-pair.test.js`, new: the sun card's daytime and post-sunset states, the
  duration never rendering negative, the missing-tomorrow-sunrise fallback, and
  the moon card with and without a moonrise.

Python tests:

- `test_lunar_provider.py`, extended: moonrise and moonset against published
  almanac values for fixed dates and locations, a day with no moonrise, a
  high-latitude case, and timezone conversion.
- Integration: `/api/lunar` carries the new fields and survives the no-rise
  case.

Browser checks with real data and no mocks:

- Blue at 390 and 1280 matches 1a with no horizontal overflow.
- eInk at 800x480 fits the frame, shows the 2b composition, and omits the
  seven-day strip.
- eInk at 320 keeps the band and hour labels legible with no overflow.
- Light theme renders the substituted tokens.
- `?widgets=radar,pressure,timeline` confirms that making `.weather-container`
  a flex column did not double the opt-in widgets' spacing, since flex items do
  not collapse margins.

## Service Worker

`templates/weather.html`, `static/js/weather-components.js`,
`static/css/weather-components.css`, and `static/js/dashboard-config.js` all
change, and `static/js/weather-insights.js` is new. Both cache names in
`static/sw.js` must be bumped and the new file added to the precache list.
`gotchas.md` records that cache-first clients otherwise keep the prior release.

## Out of Scope

- The Fahrenheit and Celsius toggle from the mock's tweaks panel
- A settings panel or interactive widget picker
- New themes
- Extracting a shared `WeatherStore` to own every fetch. It is the right
  long-term shape and would remove the duplicated fetch and refresh logic
  across widgets, but its blast radius does not belong in a design change.
  Filed as a follow-up.
- Backend changes beyond `LunarProvider`, including caching, providers,
  routing, and deployment
- Replacing the UV index, which leaves the default view with the detail cards
  and has no substitute in either mock
