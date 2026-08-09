# Daily Temperature Range Design

## Scope

Show today's forecast high and low directly beneath the current temperature as
`H 77° · L 65°`. Keep the daily forecast widget unchanged and do not add an API
request or duplicate the values in the current-weather payload.

## Assumptions

- `daily[0]` is today's forecast in the location's timezone, as supplied by the
  existing Open-Meteo transformation.
- Daily high and low values are already rounded Fahrenheit numbers.
- The range belongs only in the current-weather widget and follows that
  widget's existing visibility setting.

## Design

### Data flow

`CurrentWeatherWidget` will read the existing `data.daily[0].h` and
`data.daily[0].l` values. A small formatter will accept the daily array and
return the visible text plus a descriptive accessibility label. It will return
`null` unless both values are finite numbers, including support for valid zero
and negative temperatures.

The widget will clear and hide the row on every update before leaving it empty
for invalid or missing data. This prevents a previous location's range from
remaining visible after a later payload omits daily values.

### Presentation

The range will sit below the main temperature-and-icon row and above the
existing feels-like line. It will use smaller secondary text and inherit the
current theme's color. Its visible form will be `H 77° · L 65°`; its accessible
label will spell out "Today's high 77 degrees, low 65 degrees."

The element will start hidden so loading and partial payloads do not show
placeholders. No error message will appear when the range is unavailable.

### Testing

A Node built-in unit test, launched by pytest, will test the real JavaScript
formatter with normal, zero, negative, missing, and invalid values. This adds
no npm dependency or browser test framework. A provider-to-formatter
integration test will run the production Open-Meteo transformation and pass
its result into the production JavaScript formatter. It will not extend the
existing API tests that replace the weather manager with a mock.

Manual verification will use the existing `test_components.html` harness to
check the rendered Shadow DOM, the missing-data state, and theme readability.
Doctor Biz chose not to add a permanent end-to-end browser harness for this
feature.

## Success criteria

- Valid daily data renders the exact visible form `H 77° · L 65°` beneath the
  current temperature.
- Zero and negative temperatures render normally.
- Missing, non-numeric, or partial daily values hide and clear the row.
- The row has a descriptive accessibility label when visible and none when
  hidden.
- The daily forecast remains unchanged and no backend data shape changes.
- JavaScript unit tests, the API integration test, and the full pytest suite
  pass; manual browser checks pass without new console errors.

## Known limit

This change does not introduce automated browser coverage. The manual component
harness remains the final check that the formatter output is wired into the
Shadow DOM and styled correctly.
