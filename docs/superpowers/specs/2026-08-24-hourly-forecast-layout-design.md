<!-- ABOUTME: Defines the approved responsive repair for the hourly forecast layout. -->
<!-- ABOUTME: Covers shared alignment, chart proportions, overflow, and eInk density. -->

# Hourly Forecast Layout Repair

## Goal

Show all 12 forecast hours in one aligned view without horizontal scrolling, keep
each time attached to its temperature and icon, restore a readable chart shape,
and use eInk space more efficiently.

## Current Problems

- The chart, temperature cards, and times use three independent layouts.
- At 800px in the eInk theme, those rows measure 704px, 1,096px, and 856px.
- The temperature and time rows scroll separately, so labels stop matching data.
- The chart height grows more slowly than its width and looks flattened on wide
  eInk displays.
- eInk overrides add large gaps, padding, and section margins around the content.

## Approved Layout

The hourly widget will keep one chart followed by one 12-column forecast grid.
Each grid cell will contain the temperature, weather icon, and time for the same
hour. The chart will use the same 12 column centers for its points, including
half a column of inset on both sides.

All 12 columns will fit the widget at supported widths. The widget and its rows
will not expose horizontal scrolling. Small screens will reduce type, icon, gap,
and cell padding through responsive CSS rather than hide hours or create another
scroll surface.

The chart will reserve top and bottom plot padding and use a responsive height
bounded between 8rem and 11rem. This prevents clipped endpoint labels and keeps
the line readable without making the eInk page taller than necessary.

## eInk Density

The eInk theme will retain high contrast and heavier type while reducing:

- page-side padding;
- widget and section margins;
- current-condition gaps;
- detail-card padding and gaps;
- hourly-cell padding and icon size.

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
those points for the line and current-time marker.

## Verification

- Unit tests cover point count, centered x positions, padded y positions, and a
  flat temperature range.
- Frontend integration tests cover the single hourly grid, 12 equal columns,
  absence of horizontal overflow, responsive chart height, and dense eInk rules.
- The canonical `uv run --locked pytest tests` check must pass.
- Browser checks at 390x844 in blue, 390x844 in eInk, and 800x480 in eInk must
  show 12 aligned cells with no document or hourly horizontal overflow.

## Out of Scope

- Changing the 12-hour forecast window
- Adding chart axes, tooltips, or interaction
- Changing weather providers or response formats
- Redesigning the daily forecast or temperature-trends widgets
