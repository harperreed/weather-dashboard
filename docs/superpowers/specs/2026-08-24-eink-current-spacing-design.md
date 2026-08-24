<!-- ABOUTME: Defines the approved eInk current-weather spacing and width correction. -->
<!-- ABOUTME: Keeps the change limited to page gutters and the summary-to-details gap. -->

# eInk Current-Weather Spacing Design

## Goal

Use the eInk viewport more efficiently by tightening the space above the
current temperature, removing the doubled gap below the weather summary, and
fitting the page to the layout viewport without horizontal scrolling.

## Approved layout

- Give the eInk page an 8px outer gutter on every supported width.
- Use `width: 100%` and `max-width: none` for the eInk weather container.
- Keep `box-sizing: border-box` so the gutter stays inside that width.
- Reduce the eInk summary's bottom margin to 8px.
- Remove the eInk details grid's top margin so one rule owns the space between
  the summary and the detail cards.
- Leave the spacing within the temperature, daily range, feels-like text,
  detail cards, and hourly forecast unchanged.
- Leave blue and light themes unchanged.

## Root cause

The eInk container uses `width: 100vw`. On a page with a vertical scrollbar,
that width includes the scrollbar and makes the document wider than its layout
viewport. The container also has 20px of vertical padding. Below the summary,
the eInk rules add both a 24px summary margin and a 16px details-grid margin.

## Verification

- A source contract test fails before the CSS changes and passes after them.
- At 800px eInk width, the document and weather container have no horizontal
  overflow and the main cards use the viewport minus the 16px total gutter.
- At 320px eInk width, the document still has no horizontal overflow and the
  current-weather text and detail cards remain legible.
- The top edge to the current-weather content uses the approved 8px gutter.
- The summary-to-details gap is 8px.
- The complete pytest suite passes.

## Out of scope

- Changing typography, icon sizes, card padding, chart geometry, or widget
  order.
- Changing spacing in blue or light themes.
- Redesigning the service worker or dashboard breakpoints.
