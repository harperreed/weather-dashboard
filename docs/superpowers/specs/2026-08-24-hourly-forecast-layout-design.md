<!-- ABOUTME: Defines the approved responsive repair for the hourly forecast layout. -->
<!-- ABOUTME: Covers shared alignment, chart proportions, overflow, and eInk density. -->

# Hourly Forecast Layout Repair

## Goal

Show up to 12 real forecast hours in one aligned view without horizontal
scrolling, keep each time attached to its temperature and icon, restore a
readable chart shape, and use eInk space more efficiently.

## Current Problems

- The chart, temperature cards, and times use three independent layouts.
- At 800px in the eInk theme, those rows measure 704px, 1,096px, and 856px.
- The temperature and time rows scroll separately, so labels stop matching data.
- The chart height grows more slowly than its width and looks flattened on wide
  eInk displays.
- eInk overrides add large gaps, padding, and section margins around the content.

## Approved Layout

The hourly widget will keep one chart followed by one forecast grid with one
equal-width automatic column per real entry. Each grid cell will contain the
temperature, weather icon, and time for the same hour. The chart will use the
same column centers for its points, including half a column of inset on both
sides.

One to twelve real columns will fit the widget at supported widths. The widget
and its rows will not expose horizontal scrolling. Small screens will reduce
type, icon, and cell padding through responsive CSS rather than invent
placeholder hours, hide real hours, or create another scroll surface. At 390px
in eInk, hour labels use `clamp(0.4375rem, 2vw, 1rem)` with weight 800 so full
times such as `11pm` and `12am` remain visible inside their cells.
Hourly temperatures use `clamp(0.5625rem, 2vw, 1rem)` with weight 900 so the
full `-12°` and `100°` values fit inside the same 12-column layout.
At 320px in focused Chrome, the eInk page uses `1.25rem 1rem` padding to retain
the label sizes while freeing horizontal width. The standalone harness mirrors
that outer spacing and removes its narrow eInk section padding so the fixture
represents the production content width.

Doctor Biz approved this dynamic-column resolution: `displayHours` retains its
maximum of 12 entries, and gapless CSS Grid automatic columns fill the width for
the actual count. The chart helper keeps the same actual-count geometry; no
provider changes or JavaScript layout state are needed.

The chart will reserve top and bottom plot padding and use a responsive height
bounded between 8rem and 11rem. This prevents clipped endpoint labels and keeps
the line readable without making the eInk page taller than necessary.

## eInk Density

The eInk theme will retain high contrast and heavier type while reducing:

- page-side padding;
- widget and section margins;
- current-condition gaps;
- detail-card padding and gaps;
- hourly-cell horizontal padding and icon size.

No weather data, URL option, API, or component registration changes.

## Data and Rendering

`HourlyForecastWidget.update()` will render one `.hour-temp` per hour. Each cell
will contain `.hour-temp-value`, `.hour-icon`, and `.hour-time`. It will no longer
build a separate `.hourly-times` row or assign layout padding and margins inline.
The existing time-of-day background remains the only inline presentation value
because it comes from forecast data.

A pure chart-point helper will calculate coordinates from temperatures and the
rendered SVG size. It will return one centered point per hourly column and keep
all y values inside the chart's plot padding. The SVG renderer will consume
those points for the line and current-time marker. `HourlyForecastWidget` will
observe the rendered chart box and redraw the current up-to-12-hour data when
its border-box size changes, so asynchronous stylesheet layout cannot leave the
SVG path based on a stale width.

## Verification

- Unit tests cover point count, centered x positions, padded y positions, and a
  flat temperature range, including the six-hour case.
- Frontend integration tests cover the single hourly grid, equal automatic
  columns for the actual entry count, absence of horizontal overflow, responsive
  chart height, and dense eInk rules.
- The canonical `uv run --locked pytest tests` check must pass.
- Browser checks at 390x844 in blue, 320x844 and 390x844 in eInk, and 800x480
  in eInk must show up to 12 aligned real cells with no document or hourly
  horizontal overflow.
- The 320x844 and 390x844 eInk manual fixture must keep all 12 full hour strings and
  temperatures inside their cells, including `-12°` and `100°`.

## Out of Scope

- Changing the maximum 12-hour forecast window
- Adding chart axes, tooltips, or interaction
- Changing weather providers or response formats
- Redesigning the daily forecast or temperature-trends widgets
