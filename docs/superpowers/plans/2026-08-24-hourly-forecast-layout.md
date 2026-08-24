<!-- ABOUTME: Provides the test-first plan for repairing hourly forecast alignment and density. -->
<!-- ABOUTME: Sequences chart geometry, shared columns, eInk spacing, and browser verification. -->

# Hourly Forecast Layout Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit up to 12 real hourly forecasts in one aligned, non-scrolling view, restore the chart's vertical shape, and reduce excess eInk spacing.

**Architecture:** Render each hour's temperature, icon, and time in one gapless CSS Grid automatic column per real entry. Calculate SVG points at those same column centers with a pure helper, then keep sizing and theme density in the shared stylesheet.

**Tech Stack:** Browser JavaScript, Web Components, SVG, responsive CSS, Node's built-in test runner, Python/pytest bridge, Flask templates

## Global Constraints

- Keep up to 12 real forecast hours visible at every supported width.
- Do not add horizontal scrolling to the document or any hourly element.
- Preserve weather data, API response shapes, URL options, and component registration.
- Keep the time-of-day background as the only data-driven inline layout-adjacent style.
- Retain high contrast and readable type in the eInk theme.
- Hand-written source files that support comments begin with two `ABOUTME` lines.
- Use `uv run --locked pytest tests` as the final project check.

---

## File Map

- Create `tests/js/hourly-forecast-layout.test.js`: unit and markup/style contract tests for hourly geometry and layout.
- Modify `tests/unit/test_frontend_javascript.py`: include the hourly JavaScript suite in the canonical pytest run.
- Modify `static/js/weather-components.js`: add the point helper, render one shared hourly grid, and draw at grid centers.
- Modify `static/css/weather-components.css`: define equal automatic columns for up to 12 real entries, responsive chart height, no-overflow rules, and dense eInk spacing.
- Modify `templates/weather.html`: reduce eInk page padding.
- Modify `TESTING.md`: record the focused test and browser viewport checks.
- Modify `gotchas.md`: preserve the discovered Shadow DOM alignment rule for future changes.

### Task 1: Shared Hourly Grid and Chart Geometry

**Files:**
- Create: `tests/js/hourly-forecast-layout.test.js`
- Modify: `tests/unit/test_frontend_javascript.py`
- Modify: `static/js/weather-components.js:86-102,534-670`
- Modify: `static/js/weather-components.js:309-317`
- Modify: `static/css/weather-components.css:167-223,492-500,555-566,623-635,777-831`

**Interfaces:**
- Produces: `calculateHourlyChartPoints(temperatures: number[], width: number, height: number): {x: number, y: number}[]`
- Produces: `HourlyForecastWidget` CommonJS export for dependency-free unit tests.
- Preserves: `HourlyForecastWidget.update()` and `drawTemperatureChart(hourlyData)` component methods.

- [x] **Step 1: Write failing geometry and markup tests**

Create `tests/js/hourly-forecast-layout.test.js` with production-module stubs and
these checks:

```javascript
// ABOUTME: Tests hourly chart geometry and the shared dynamic forecast layout.
// ABOUTME: Runs production component and CSS contracts with Node's test runner.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

global.HTMLElement = class {
    attachShadow() {
        this.shadowRoot = { innerHTML: '' };
        return this.shadowRoot;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };

const {
    HourlyForecastWidget,
    calculateHourlyChartPoints
} = require('../../static/js/weather-components.js');

test('centers chart points in the same equal-width cells as hourly entries', () => {
    const points = calculateHourlyChartPoints([10, 20, 30], 300, 120);

    assert.equal(points.length, 3);
    assert.deepEqual(points.map(({ x }) => x), [50, 150, 250]);
    assert.ok(points.every(({ y }) => y >= 16 && y <= 112));
});

test('centers a flat temperature range vertically', () => {
    const points = calculateHourlyChartPoints([20, 20], 200, 120);

    assert.deepEqual(points, [{ x: 50, y: 64 }, { x: 150, y: 64 }]);
});

test('aligns six real forecast hours to six equal auto columns', () => {
    const points = calculateHourlyChartPoints([10, 20, 30, 40, 50, 60], 600, 120);
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.deepEqual(points.map(({ x }) => x), [50, 150, 250, 350, 450, 550]);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-flow:\s*column;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s);
    assert.doesNotMatch(styles, /\.hourly-temps\s*\{[^}]*grid-template-columns:/s);
});

test('renders time inside each hourly cell without a second time row', () => {
    const widget = new HourlyForecastWidget();
    widget.render();

    assert.match(widget.shadowRoot.innerHTML, /id="hourly-temps"/);
    assert.match(widget.shadowRoot.innerHTML, /class="hour-time"/);
    assert.doesNotMatch(widget.shadowRoot.innerHTML, /id="hourly-times"/);
});

test('uses a responsive external eInk time label without an inline override', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.hour-time\s*\{[^}]*min-width:\s*0;[^}]*text-align:\s*center;[^}]*font-size:\s*clamp\(0\.4375rem, 2vw, 1rem\);[^}]*font-weight:\s*800;/s);
    assert.doesNotMatch(components, /:host\(\[data-theme="eink"\]\) \.hour-time\s*\{/);
});

test('uses a responsive external eInk temperature without an inline override', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.hour-temp-value\s*\{[^}]*font-weight:\s*900;[^}]*font-size:\s*clamp\(0\.5625rem, 2vw, 1rem\);/s);
    assert.doesNotMatch(components, /:host\(\[data-theme="eink"\]\) \.hour-temp-value\s*\{/);
});

test('uses one gapless auto-column grid with no hourly scrolling', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.hourly-temps\s*\{[^}]*display:\s*grid;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-flow:\s*column;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*gap:\s*0;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*overflow-x:\s*visible;/s);
    assert.doesNotMatch(styles, /\.hourly-times\s*\{/);
    assert.match(styles, /\.chart-container\s*\{[^}]*height:\s*clamp\(8rem, 25vw, 11rem\);/s);
});
```

- [x] **Step 2: Register and run the failing JavaScript suite**

Add `'hourly-forecast-layout.test.js'` to the parameter list in
`tests/unit/test_frontend_javascript.py`.

Run: `node --test tests/js/hourly-forecast-layout.test.js`

Expected: FAIL because `calculateHourlyChartPoints` and the
`HourlyForecastWidget` export do not exist and the old markup has a separate
time row.

- [x] **Step 3: Implement centered chart geometry**

Add this pure helper after `formatDailyTemperatureRange`:

```javascript
function calculateHourlyChartPoints(temperatures, width, height) {
    if (!temperatures.length || width <= 0 || height <= 0) return [];

    const topPadding = 16;
    const bottomPadding = 8;
    const plotHeight = Math.max(height - topPadding - bottomPadding, 0);
    const maxTemp = Math.max(...temperatures);
    const minTemp = Math.min(...temperatures);
    const tempRange = maxTemp - minTemp;
    const columnWidth = width / temperatures.length;

    return temperatures.map((temperature, index) => {
        const ratio = tempRange === 0 ? 0.5 : (maxTemp - temperature) / tempRange;
        return {
            x: columnWidth * (index + 0.5),
            y: topPadding + ratio * plotHeight
        };
    });
}
```

Export it with the existing CommonJS formatter export. Update
`drawTemperatureChart()` to build its path from the returned points, place the
current-time marker at `points[0].x`, and return early when no points exist.

- [x] **Step 4: Render one hourly cell per data point**

Change the hourly placeholder and update loop so `.hour-time` lives inside
`.hour-temp`:

```javascript
<div class="hourly-temps" id="hourly-temps">
    <div class="hour-temp">
        <div class="hour-temp-value">--°</div>
        <div class="hour-icon">--</div>
        <div class="hour-time">--</div>
    </div>
</div>
```

Populate each real cell with:

```javascript
hourDiv.innerHTML = `
    <div class="hour-temp-value">${hour.temp}°</div>
    <div class="hour-icon">${getWeatherIcon(
        hour.icon,
        'clamp(1.125rem, 4vw, 1.75rem)'
    )}</div>
    <div class="hour-time">${hour.t}</div>
`;
hourDiv.style.backgroundColor = backgroundColor;
```

Remove `hourlyTimesContainer`, the separate time loop, and the inline border,
padding, and margin assignments. Export `HourlyForecastWidget` beside the
existing widget export block.

- [x] **Step 5: Fit and align up to 12 real CSS columns**

Doctor Biz approved `gap: 0`, `grid-auto-flow: column`, and
`grid-auto-columns: minmax(0, 1fr)` for the hourly grid. The chart helper
divides the full chart width by the actual `displayHours` count, so one gapless
automatic CSS column per real entry keeps the cell centers aligned. Do not add
gap-aware chart math, placeholder forecasts, provider changes, or JavaScript
layout state.

Task 1 also owns both 390px eInk hourly-label fits exposed by the fitted grid.
Remove only the inline `getSharedStyles()` eInk `.hour-time` and
`.hour-temp-value` overrides. Keep the external stylesheet as the source of
truth:

```css
:host([data-theme="eink"]) .hour-temp-value {
    font-weight: 900;
    font-size: clamp(0.5625rem, 2vw, 1rem);
}

:host([data-theme="eink"]) .hour-temp {
    padding-inline: 0;
}

:host([data-theme="eink"]) .hour-time {
    min-width: 0;
    text-align: center;
    font-size: clamp(0.4375rem, 2vw, 1rem);
    font-weight: 800;
}
```

Task 3 adds a `ResizeObserver` owned by `HourlyForecastWidget`. It disconnects
before each new chart SVG is observed and on widget teardown. When the chart
border box changes after external styles load, it redraws the current up-to-12
hour data through the existing `drawTemperatureChart()` geometry renderer.

Replace the hourly layout rules with:

```css
.chart-container {
    position: relative;
    height: clamp(8rem, 25vw, 11rem);
    margin-bottom: 0.75rem;
}

.hourly-temps {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 0;
    margin-bottom: 0;
    overflow-x: visible;
}

.hour-temp {
    min-width: 0;
    padding: 0.25rem 0.0625rem;
    border-radius: 0.375rem;
    text-align: center;
}

.hour-temp-value,
.hour-time {
    overflow: hidden;
    white-space: nowrap;
}

.hour-temp-value {
    font-size: clamp(0.625rem, 2.5vw, 0.875rem);
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
}

.hour-icon {
    height: 1.75rem;
    margin-top: 0.125rem;
}

.hour-time {
    margin-top: 0.125rem;
    font-size: clamp(0.5rem, 2.3vw, 0.75rem);
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}
```

Delete `.hourly-times` and the breakpoint-specific `.chart-container` heights.
Remove the obsolete eInk scrolling and `min-width: 4rem` rules.

- [x] **Step 6: Run focused tests and commit**

Run:

```bash
node --test tests/js/hourly-forecast-layout.test.js
uv run --locked pytest tests/unit/test_frontend_javascript.py tests/test_frontend.py
```

Expected: all selected tests PASS with no new warnings.

Commit:

```bash
git add tests/js/hourly-forecast-layout.test.js tests/unit/test_frontend_javascript.py static/js/weather-components.js static/css/weather-components.css
git commit -m "fix: align hourly forecast columns"
```

### Task 2: Compact eInk Layout

**Files:**
- Modify: `static/js/weather-components.js:249-386` for the remaining eInk density overrides
- Modify: `static/css/weather-components.css:638-835`
- Modify: `templates/weather.html:149-155`
- Modify: `tests/js/hourly-forecast-layout.test.js`

**Interfaces:**
- Consumes: the `.hour-temp`, `.temp-display`, `.weather-details`, and `.detail-card` selectors.
- Preserves: the canonical `eink` theme name and all theme color tokens.

- [x] **Step 1: Add failing eInk density tests**

Append a test that reads the template and shared stylesheet:

```javascript
test('eInk keeps strong type with compact page and component spacing', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(template, /\[data-theme="eink"\] \.weather-container\s*\{[^}]*padding:\s*1\.25rem 2rem;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.temp-display\s*\{[^}]*gap:\s*1\.5rem;[^}]*margin-bottom:\s*1\.25rem;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.weather-details\s*\{[^}]*gap:\s*0\.75rem;[^}]*margin-top:\s*1rem;/s);
});
```

- [x] **Step 2: Run the eInk test and verify failure**

Run: `node --test tests/js/hourly-forecast-layout.test.js`

Expected: FAIL because eInk still uses 3rem page padding and a 2.5rem current
gap.

- [x] **Step 3: Consolidate and reduce eInk spacing**

Change the template's eInk container padding to `1.25rem 2rem`. In
`getSharedStyles()`, remove inline eInk rules for `.temp-display`,
`.weather-details`, and `.detail-card`, including their mobile duplicates, so
the external stylesheet owns those values. Task 1 already owns the external
responsive `.hour-temp-value` and `.hour-time` rules and removal of their inline
overrides.

Set these shared eInk values:

```css
:host([data-theme="eink"]) .temp-display {
    gap: 1.5rem;
    margin-bottom: 1.25rem;
}

:host([data-theme="eink"]) .weather-details {
    gap: 0.75rem;
    margin-top: 1rem;
}

:host([data-theme="eink"]) .detail-card {
    padding: 0.75rem 1rem;
}

```

Keep existing color, border, and font-weight rules unchanged.

- [x] **Step 4: Run focused tests and commit**

Run:

```bash
node --test tests/js/hourly-forecast-layout.test.js
uv run --locked pytest tests/unit/test_frontend_javascript.py tests/test_frontend.py
```

Expected: all selected tests PASS with no new warnings.

Commit:

```bash
git add tests/js/hourly-forecast-layout.test.js static/js/weather-components.js static/css/weather-components.css templates/weather.html
git commit -m "fix: tighten eink dashboard spacing"
```

### Task 3: Full and Real-Browser Verification

**Files:**
- Modify: `TESTING.md`
- Modify: `gotchas.md`

**Interfaces:**
- Verifies: deployed DOM geometry without changing application behavior.

- [x] **Step 1: Document the repeatable focused checks**

Add `node --test tests/js/hourly-forecast-layout.test.js` to the frontend test
commands in `TESTING.md`. Record the four browser viewport and theme cases from
the design spec. Add this project note to `gotchas.md`:

```markdown
- Keep the hourly chart, temperatures, icons, and times on the same centers for the actual number of rendered hours. Separate flex rows produce different widths and independent scroll positions, especially in eInk.
```

- [x] **Step 2: Run the canonical project checks**

Run:

```bash
uv run --locked pytest tests
uvx --from ruff==0.6.4 ruff check .
uvx --from ruff==0.6.4 ruff format --check .
uv run --locked mypy .
git diff --check
```

Expected: pytest and Ruff format PASS with no new warnings. Ruff lint reports
only the accepted 27 findings in untouched `tests/unit/test_lunar_provider.py`;
mypy reports only the 22 unchanged-file diagnostics; `git diff --check` prints
nothing. Ruff uses the exact version pinned in `.pre-commit-config.yaml` because
Ruff is not part of the application's locked dependency groups.

- [x] **Step 3: Run browser end-to-end geometry assertions**

Start the app in a separate terminal with:

```bash
HOST=127.0.0.1 PORT=5001 uv run --locked python main.py
```

Use isolated browser sessions to open `http://127.0.0.1:5001/chicago` at
390x844 and `http://127.0.0.1:5001/chicago?theme=eink` at 320x844, 390x844,
and 800x480, then assert in each page:

```javascript
const host = document.querySelector('hourly-forecast');
const root = host.shadowRoot;
const temperatures = root.querySelector('.hourly-temps');
const cells = [...root.querySelectorAll('.hour-temp')];
const chart = root.querySelector('.temperature-chart');

({
    documentFits: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    hourlyFits: temperatures.scrollWidth === temperatures.clientWidth,
    upToTwelveCells: cells.length > 0 && cells.length <= 12,
    chartFits: chart.scrollWidth === chart.clientWidth,
    everyTimeInsideCell: cells.every((cell) => cell.querySelector('.hour-time'))
});
```

Expected: every returned value is `true`. Also serve the manual 12-entry eInk
extreme fixture at 320x844 and 390x844, confirm all times and temperatures fit,
and capture screenshots for visual review.

- [x] **Step 4: Commit verification documentation**

```bash
git add TESTING.md gotchas.md
git commit -m "docs: record hourly layout verification"
```

- [x] **Step 5: Run a fresh-eyes review before integration**

Inspect the complete branch diff against `main`, fix any correctness or scope
issues, rerun the checks affected by each fix, and leave the branch ready for a
separate merge and push decision.

### Provider time-label follow-up

- [x] The layout work deliberately left provider behavior unchanged. A separate
  regression fix now preserves `10pm` and removes only a leading zero for both
  OpenMeteo and PirateWeather hourly labels.
