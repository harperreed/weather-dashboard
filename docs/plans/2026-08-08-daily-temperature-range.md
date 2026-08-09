# Daily Temperature Range Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show today's forecast high and low below the current temperature, while hiding the row when either value is unavailable.

**Architecture:** Keep `daily[0]` as the sole source of today's range. Add a pure formatter to `weather-components.js`, use its output in `CurrentWeatherWidget`, and test the formatter with Node's built-in test runner launched from pytest. A no-mock integration test will carry an Open-Meteo fixture through the production provider transformation and the same JavaScript formatter.

**Tech Stack:** Native JavaScript Web Components, Shadow DOM, CSS, Node `node:test`, Python, pytest, Flask/Open-Meteo provider transformation.

---

### Task 1: Define the formatter contract

**Files:**
- Create: `tests/js/current-weather-range.test.js`
- Create: `tests/unit/test_frontend_javascript.py`
- Modify: `static/js/weather-components.js:1-130,3180-3200`

**Step 1: Write the failing JavaScript unit tests**

Create `tests/js/current-weather-range.test.js`:

```javascript
// ABOUTME: Unit tests for formatting today's high and low temperatures.
// ABOUTME: Runs the production JavaScript with Node's dependency-free test runner.

const assert = require('node:assert/strict');
const test = require('node:test');

global.HTMLElement = class {};
global.customElements = { define() {} };
global.document = { addEventListener() {} };

const {
    formatDailyTemperatureRange
} = require('../../static/js/weather-components.js');

test('formats today\'s high and low', () => {
    assert.deepEqual(
        formatDailyTemperatureRange([{ h: 77, l: 65 }]),
        {
            text: 'H 77° · L 65°',
            ariaLabel: "Today's high 77 degrees, low 65 degrees."
        }
    );
});

test('keeps zero and negative temperatures', () => {
    assert.deepEqual(
        formatDailyTemperatureRange([{ h: 0, l: -12 }]),
        {
            text: 'H 0° · L -12°',
            ariaLabel: "Today's high 0 degrees, low -12 degrees."
        }
    );
});

test('returns null for incomplete or non-numeric ranges', () => {
    const invalidDailyData = [
        undefined,
        [],
        [{}],
        [{ h: 77 }],
        [{ l: 65 }],
        [{ h: '77', l: 65 }],
        [{ h: 77, l: Number.NaN }]
    ];

    invalidDailyData.forEach((daily) => {
        assert.equal(formatDailyTemperatureRange(daily), null);
    });
});
```

**Step 2: Add the pytest launcher**

Create `tests/unit/test_frontend_javascript.py`:

```python
# ABOUTME: Runs dependency-free JavaScript unit tests through the Python suite.
# ABOUTME: Keeps frontend behavior checks in the project's canonical pytest command.

import subprocess
from pathlib import Path


def test_current_weather_range_javascript() -> None:
    test_file = (
        Path(__file__).parents[1] / 'js' / 'current-weather-range.test.js'
    )
    result = subprocess.run(
        ['node', '--test', str(test_file)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
```

**Step 3: Run the tests and verify RED**

Run:

```bash
uv run pytest tests/unit/test_frontend_javascript.py -v
```

Expected: FAIL because `formatDailyTemperatureRange` is not exported.

**Step 4: Add the minimal pure formatter and CommonJS test export**

Add near the other helper functions in `static/js/weather-components.js`:

```javascript
function formatDailyTemperatureRange(daily) {
    const today = daily?.[0];
    if (!Number.isFinite(today?.h) || !Number.isFinite(today?.l)) {
        return null;
    }

    return {
        text: `H ${today.h}° · L ${today.l}°`,
        ariaLabel: `Today's high ${today.h} degrees, low ${today.l} degrees.`
    };
}
```

Add after the helper definitions:

```javascript
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatDailyTemperatureRange };
}
```

The guard keeps the browser path unchanged; the export exists only for Node.

**Step 5: Run the tests and verify GREEN**

Run:

```bash
uv run pytest tests/unit/test_frontend_javascript.py -v
```

Expected: PASS with three passing Node subtests and one passing pytest test.

**Step 6: Commit the tested formatter**

```bash
git add static/js/weather-components.js tests/js/current-weather-range.test.js tests/unit/test_frontend_javascript.py
git commit -m "feat: add daily temperature range formatter"
```

### Task 2: Render the range in the current-weather widget

**Files:**
- Modify: `static/js/weather-components.js:441-535`
- Modify: `static/css/weather-components.css:61-90`

**Step 1: Add a temperature group and hidden range row**

Replace the current `.temp-display` block in `CurrentWeatherWidget.render()` with:

```html
<div class="current-temperature">
    <div class="temp-display">
        <div class="temperature" id="temp">--°</div>
        <div class="weather-icon" id="icon">⏳</div>
    </div>
    <div class="daily-range" id="daily-range" hidden></div>
</div>
```

**Step 2: Update and clear the row from the formatter result**

Add after the current temperature and icon updates in `CurrentWeatherWidget.update()`:

```javascript
const dailyRange = this.shadowRoot.getElementById('daily-range');
const formattedRange = formatDailyTemperatureRange(this.data.daily);

dailyRange.textContent = '';
dailyRange.removeAttribute('aria-label');
dailyRange.hidden = true;

if (formattedRange) {
    dailyRange.textContent = formattedRange.text;
    dailyRange.setAttribute('aria-label', formattedRange.ariaLabel);
    dailyRange.hidden = false;
}
```

Clearing first ensures a later partial payload cannot leave stale text or an old accessibility label.

**Step 3: Style the group without changing missing-data spacing**

Update `static/css/weather-components.css`:

```css
.current-temperature {
    margin-bottom: 1rem;
}

.temp-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.daily-range {
    margin-top: 0.375rem;
    font-size: 0.875rem;
    opacity: 0.8;
}
```

Remove `margin-bottom: 1rem` from `.temp-display`; the wrapper now owns that spacing whether the range is visible or hidden.

**Step 4: Run focused tests**

Run:

```bash
uv run pytest tests/unit/test_frontend_javascript.py tests/test_frontend.py -v
```

Expected: PASS with no new warnings or errors.

**Step 5: Commit the rendered feature**

```bash
git add static/js/weather-components.js static/css/weather-components.css
git commit -m "feat: show today's high and low"
```

### Task 3: Verify the provider-to-formatter contract without mocks

**Files:**
- Create: `tests/integration/test_daily_temperature_range.py`

**Step 1: Write the integration test**

Create `tests/integration/test_daily_temperature_range.py`. Use the existing `mock_open_meteo_response` fixture as input data, but call the real provider transformation and real JavaScript formatter:

```python
# ABOUTME: Verifies Open-Meteo daily temperatures reach the frontend formatter.
# ABOUTME: Exercises production transformation and JavaScript without API mocks.

import json
import subprocess
from pathlib import Path
from typing import Any

from weather_providers import OpenMeteoProvider


def test_open_meteo_daily_range_reaches_frontend(
    mock_open_meteo_response: dict[str, Any],
) -> None:
    weather = OpenMeteoProvider().process_weather_data(
        mock_open_meteo_response,
        'Test Location',
    )
    assert weather is not None

    component_file = (
        Path(__file__).parents[2]
        / 'static'
        / 'js'
        / 'weather-components.js'
    )
    script = """
global.HTMLElement = class {};
global.customElements = { define() {} };
global.document = { addEventListener() {} };
const { formatDailyTemperatureRange } = require(process.argv[1]);
const weather = JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify(formatDailyTemperatureRange(weather.daily)));
"""
    result = subprocess.run(
        ['node', '-e', script, str(component_file), json.dumps(weather)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout) == {
        'text': 'H 77° · L 65°',
        'ariaLabel': "Today's high 77 degrees, low 65 degrees.",
    }
```

Before finalizing the expected values, read `tests/conftest.py` and use the fixture's actual rounded first-day temperatures. Do not change the fixture merely to match this example.

**Step 2: Run the integration test**

Run:

```bash
uv run pytest tests/integration/test_daily_temperature_range.py -v
```

Expected: PASS. The test uses fixture data but no patched function, network mock, or test-only application path.

**Step 3: Run Ruff on the new Python tests**

Run:

```bash
uv run ruff check tests/unit/test_frontend_javascript.py tests/integration/test_daily_temperature_range.py
uv run ruff format --check tests/unit/test_frontend_javascript.py tests/integration/test_daily_temperature_range.py
```

Expected: PASS with no findings.

**Step 4: Commit the integration coverage**

```bash
git add tests/integration/test_daily_temperature_range.py
git commit -m "test: cover daily range data contract"
```

### Task 4: Make manual browser checks repeatable

**Files:**
- Modify: `test_components.html:60-150`

**Step 1: Add controls for valid and missing daily data**

Add buttons beside `Load Test Data`:

```html
<button onclick="loadFreezingRange()">Load Freezing Range</button>
<button onclick="loadMissingRange()">Load Missing Range</button>
```

Add functions beside `loadTestData()`:

```javascript
function loadFreezingRange() {
    const freezingData = {
        ...testData,
        daily: [{ ...testData.daily[0], h: 0, l: -12 }]
    };
    document.dispatchEvent(
        new CustomEvent('weather-data-updated', { detail: freezingData })
    );
}

function loadMissingRange() {
    document.dispatchEvent(
        new CustomEvent('weather-data-updated', {
            detail: { ...testData, daily: [] }
        })
    );
}
```

**Step 2: Run the component harness**

Check that port 7765 is free, then run:

```bash
lsof -nP -iTCP:7765 -sTCP:LISTEN
uv run python -m http.server 7765
```

Open `http://127.0.0.1:7765/test_components.html` in a real browser.

**Step 3: Verify the visible and hidden states**

- `Load Test Data` shows `H 77° · L 65°` below `72°F`.
- `Load Freezing Range` shows `H 0° · L -12°`.
- `Load Missing Range` removes the range and does not leave stale text or an `aria-label`.
- The default and dashboard/e-ink themes keep the line readable.
- The browser console has no new warnings or errors.

Stop the temporary HTTP server after the checks. This is manual integration verification, not a permanent end-to-end suite, as approved by Doctor Biz.

**Step 4: Commit the manual harness**

```bash
git add test_components.html
git commit -m "test: add daily range browser scenarios"
```

### Task 5: Run final verification and review

**Files:**
- No production file changes expected

**Step 1: Run the complete test suite**

Run:

```bash
uv run pytest tests
```

Expected: all tests pass and coverage stays at or above 80%.

**Step 2: Check changed files**

Run:

```bash
git diff --check main...HEAD
uv run ruff check tests/unit/test_frontend_javascript.py tests/integration/test_daily_temperature_range.py
uv run ruff format --check tests/unit/test_frontend_javascript.py tests/integration/test_daily_temperature_range.py
```

Expected: no whitespace errors and no lint or format findings in changed Python files. Record the known pre-existing repository-wide Ruff and MyPy findings separately; do not claim they came from this feature.

**Step 3: Use the verification and fresh-eyes review skills**

Use `superpowers:verification-before-completion`, then `fresh-eyes-review`. Fix any issue in this feature's footprint and rerun the affected checks.

**Step 4: Inspect the final branch**

Run:

```bash
git status --short --branch
git log --oneline main..HEAD
```

Expected: a clean `wip/daily-high-low` branch with the design, plan, tested implementation, integration test, and manual harness commits.
