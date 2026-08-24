<!-- ABOUTME: Provides the test-first implementation plan for the dashboard design refactor. -->
<!-- ABOUTME: Sequences shared configuration, component integration, visual hierarchy, and verification. -->

# Dashboard Design Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make today's high and low prominent, make URL widget selection cover every dashboard widget, and expose three clear theme names without breaking saved URLs.

**Architecture:** Add a dependency-free configuration module that owns the widget catalog, theme aliases, and query parsing. Load it after dashboard hosts exist but before custom elements are registered, then let components read one canonical configuration object. Keep presentation changes inside the current weather component and shared stylesheet.

**Tech Stack:** Browser JavaScript, Web Components, CSS custom properties, Node's built-in test runner, Python/pytest bridge, Flask templates

## Global Constraints

- Preserve the current weather-provider APIs, response shapes, refresh behavior, and server routes.
- Add no framework, runtime package, or persistence layer.
- Public themes are exactly `blue`, `light`, and `eink`.
- Preserve `white`, `dashboard`, and `background` as unadvertised compatibility aliases.
- A non-empty `widgets` parameter selects only recognized widgets; an empty value behaves as if the parameter were omitted.
- Disabled widgets must not call their widget-specific APIs.
- The daily range renders only when both values are finite numbers and keeps its current accessible label.
- Hand-written source files that support comments begin with two `ABOUTME` lines.
- Use `uv run --locked pytest tests` as the final project check.

---

## File Map

- Create `static/js/dashboard-config.js`: widget catalog, theme aliases, pure query parsing, DOM application, and CommonJS exports for tests.
- Create `tests/js/dashboard-config.test.js`: unit and DOM-contract tests for every widget and theme path.
- Modify `tests/unit/test_frontend_javascript.py`: run both dependency-free JavaScript suites through pytest.
- Modify `templates/weather.html`: load and apply canonical configuration before component registration; rename theme selectors.
- Modify `static/js/weather-components.js`: consume canonical configuration, stop disabled widget loads, generate help names, and strengthen daily-range markup.
- Modify `static/css/weather-components.css`: daily-range hierarchy, canonical theme tokens, tabular numerals, and reliable hidden hosts.
- Modify `tests/js/current-weather-range.test.js`: assert the new visible range markup and copy.
- Modify `tests/integration/test_daily_temperature_range.py`: preserve the provider-to-formatter contract with the new copy.
- Modify `test_components.html`: retain valid, freezing, and missing range scenarios for real-browser checks.
- Modify `TESTING.md`: document the focused JavaScript suites and browser scenarios.

### Task 1: Canonical Dashboard Configuration

**Files:**
- Create: `static/js/dashboard-config.js`
- Create: `tests/js/dashboard-config.test.js`
- Modify: `tests/unit/test_frontend_javascript.py`

**Interfaces:**
- Produces: `WIDGET_CATALOG: readonly WidgetDefinition[]`
- Produces: `parseDashboardConfig(search: string): DashboardConfig`
- Produces: `isWidgetEnabled(config: DashboardConfig, widgetId: string): boolean`
- Produces: `applyDashboardConfig(documentRoot: DocumentLike, config: DashboardConfig): void`
- `DashboardConfig` shape: `{ theme: 'blue' | 'light' | 'eink', hasWidgetSelection: boolean, enabledWidgets: Record<string, boolean> }`

- [x] **Step 1: Write failing parser tests**

Create `tests/js/dashboard-config.test.js` with table-driven coverage for all
public names, all aliases, empty and invalid widget lists, repeated names,
individual boolean parameters, public themes, and compatibility aliases:

```javascript
// ABOUTME: Tests canonical dashboard widget and theme URL configuration.
// ABOUTME: Runs the production configuration module with Node's test runner.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    WIDGET_CATALOG,
    applyDashboardConfig,
    isWidgetEnabled,
    parseDashboardConfig
} = require('../../static/js/dashboard-config.js');

test('every public widget name and alias selects its catalog widget', () => {
    WIDGET_CATALOG.forEach(({ id, aliases }) => {
        [id, ...aliases].forEach((name) => {
            const config = parseDashboardConfig(`?widgets=${name}`);
            assert.equal(config.hasWidgetSelection, true);
            assert.equal(isWidgetEnabled(config, id), true, name);
            assert.equal(
                Object.values(config.enabledWidgets).filter(Boolean).length,
                1,
                name
            );
        });
    });
});

test('empty widget selection behaves like an omitted parameter', () => {
    for (const search of ['', '?widgets=', '?widgets=  ']) {
        const config = parseDashboardConfig(search);
        assert.equal(config.hasWidgetSelection, false);
        assert.equal(Object.values(config.enabledWidgets).every(Boolean), true);
    }
});

test('valid widgets survive unknown and repeated names', () => {
    const config = parseDashboardConfig('?widgets=radar,nope,radar,moon');
    assert.equal(isWidgetEnabled(config, 'radar'), true);
    assert.equal(isWidgetEnabled(config, 'moon'), true);
    assert.equal(isWidgetEnabled(config, 'current'), false);
});

test('individual boolean parameters override default visibility', () => {
    const config = parseDashboardConfig('?current=false&hourly=true');
    assert.equal(isWidgetEnabled(config, 'current'), false);
    assert.equal(isWidgetEnabled(config, 'hourly'), true);
});

test('themes resolve to canonical names', () => {
    const cases = new Map([
        ['', 'blue'],
        ['?theme=blue', 'blue'],
        ['?theme=light', 'light'],
        ['?theme=eink', 'eink'],
        ['?theme=white', 'light'],
        ['?theme=dashboard', 'eink'],
        ['?background=white', 'light'],
        ['?theme=unknown', 'blue']
    ]);

    cases.forEach((expected, search) => {
        assert.equal(parseDashboardConfig(search).theme, expected, search);
    });
});
```

- [x] **Step 2: Add failing DOM application tests**

Add this holder and test to the same file; it covers every real host because it
builds from `WIDGET_CATALOG`:

```javascript
function createDocumentHolder() {
    const body = {
        attributes: new Map(),
        setAttribute(name, value) { this.attributes.set(name, value); }
    };
    const hosts = new Map(
        [...WIDGET_CATALOG.map(({ host }) => host), 'help-section'].map(
            (host) => [host, {
                hidden: false,
                attributes: new Map(),
                setAttribute(name, value) { this.attributes.set(name, value); }
            }]
        )
    );
    return {
        body,
        hosts,
        getElementById(id) { return id === 'app-body' ? body : null; },
        querySelector(selector) { return hosts.get(selector) ?? null; }
    };
}

test('applies selected widget visibility and theme to every host', () => {
    const documentHolder = createDocumentHolder();
    const config = parseDashboardConfig('?widgets=radar,solar,moon&theme=light');
    applyDashboardConfig(documentHolder, config);

    assert.equal(documentHolder.body.attributes.get('data-theme'), 'light');
    WIDGET_CATALOG.forEach(({ id, host }) => {
        assert.equal(documentHolder.hosts.get(host).hidden, !config.enabledWidgets[id]);
        assert.equal(documentHolder.hosts.get(host).attributes.get('data-theme'), 'light');
    });
    assert.equal(documentHolder.hosts.get('help-section').hidden, true);
});

test('empty widget selection leaves widgets and help visible', () => {
    const documentHolder = createDocumentHolder();
    applyDashboardConfig(documentHolder, parseDashboardConfig('?widgets='));

    assert.equal(
        [...documentHolder.hosts.values()].every(({ hidden }) => hidden === false),
        true
    );
});
```

- [x] **Step 3: Run JavaScript tests and verify failure**

Run: `node --test tests/js/dashboard-config.test.js`

Expected: FAIL because `static/js/dashboard-config.js` does not exist.

- [x] **Step 4: Implement the configuration module**

Create `static/js/dashboard-config.js` with frozen catalog entries for the 13
weather hosts. Use these exact public IDs and aliases from the approved spec.
Keep the seven existing individual parameter groups in each relevant catalog
entry through `parameters`, for example:

```javascript
const WIDGET_CATALOG = Object.freeze([
    Object.freeze({
        id: 'current',
        host: 'current-weather',
        aliases: Object.freeze(['now']),
        parameters: Object.freeze(['current'])
    }),
    Object.freeze({
        id: 'alerts',
        host: 'weather-alerts',
        aliases: Object.freeze(['warnings']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'hourly',
        host: 'hourly-forecast',
        aliases: Object.freeze(['hours']),
        parameters: Object.freeze(['hourly'])
    }),
    Object.freeze({
        id: 'daily',
        host: 'daily-forecast',
        aliases: Object.freeze(['week', 'days']),
        parameters: Object.freeze(['daily'])
    }),
    Object.freeze({
        id: 'temperature-trends',
        host: 'enhanced-temperature-trends',
        aliases: Object.freeze(['temperature', 'temp-trends']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'radar',
        host: 'precipitation-radar',
        aliases: Object.freeze(['precipitation']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'clothing',
        host: 'clothing-recommendations',
        aliases: Object.freeze(['clothes']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'air-quality',
        host: 'air-quality',
        aliases: Object.freeze(['airquality', 'air', 'aqi']),
        parameters: Object.freeze(['air-quality', 'airquality'])
    }),
    Object.freeze({
        id: 'wind',
        host: 'wind-direction',
        aliases: Object.freeze(['wind-direction', 'compass']),
        parameters: Object.freeze(['wind-direction', 'wind'])
    }),
    Object.freeze({
        id: 'pressure',
        host: 'pressure-trends',
        aliases: Object.freeze(['pressure-trends', 'trends']),
        parameters: Object.freeze(['pressure-trends', 'pressure'])
    }),
    Object.freeze({
        id: 'solar',
        host: 'solar-progress',
        aliases: Object.freeze(['sun']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'moon',
        host: 'moon-phase',
        aliases: Object.freeze(['lunar']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'timeline',
        host: 'hourly-timeline',
        aliases: Object.freeze(['list']),
        parameters: Object.freeze(['timeline'])
    })
]);

const THEME_NAMES = Object.freeze({
    blue: 'blue',
    light: 'light',
    eink: 'eink',
    white: 'light',
    dashboard: 'eink'
});
```

`parseDashboardConfig` must trim and lowercase names, ignore unknown values,
deduplicate through a `Set`, apply supported individual boolean parameters,
and return a plain serializable object. Treat only the literal string `false`
as false to preserve current behavior.

`applyDashboardConfig` must set `data-theme` on `#app-body` and every catalog
host, set each host's `hidden` property from `enabledWidgets`, and hide
`help-section` only for a non-empty widget selection.

Expose the API in both environments:

```javascript
const DashboardConfig = {
    WIDGET_CATALOG,
    applyDashboardConfig,
    isWidgetEnabled,
    parseDashboardConfig
};

if (typeof window !== 'undefined') window.DashboardConfig = DashboardConfig;
if (typeof module !== 'undefined' && module.exports) module.exports = DashboardConfig;
```

- [x] **Step 5: Run JavaScript tests and verify success**

Run: `node --test tests/js/dashboard-config.test.js`

Expected: all configuration tests PASS with no warnings.

- [x] **Step 6: Add the suite to the pytest bridge**

Parameterize `tests/unit/test_frontend_javascript.py` over
`current-weather-range.test.js` and `dashboard-config.test.js`. Keep
`capture_output=True`, `check=False`, and assert the return code with combined
stdout and stderr.

- [x] **Step 7: Run the pytest bridge**

Run: `uv run --locked pytest tests/unit/test_frontend_javascript.py -v`

Expected: both JavaScript suite bridge cases PASS.

- [x] **Step 8: Commit**

```bash
git add static/js/dashboard-config.js tests/js/dashboard-config.test.js tests/unit/test_frontend_javascript.py
git commit -m "feat: centralize dashboard configuration"
```

### Task 2: Apply Configuration to Every Widget and Theme

**Files:**
- Modify: `templates/weather.html:24-209`
- Modify: `static/js/weather-components.js:180-290, 1035-1055, 1870-1890, 2115-2140, 2440-2465, 2760-2785, 3255-3275, 3528-3550, 3860-3895, 4430-4455`
- Modify: `static/css/weather-components.css:1-35`
- Modify: `tests/js/dashboard-config.test.js`

**Interfaces:**
- Consumes: `window.DashboardConfig`
- Consumes: `window.weatherDashboardConfig: DashboardConfig`
- Produces: `WeatherWidget.isEnabled(widgetId: string): boolean`
- Produces: canonical `data-theme` values on the body and every widget host

- [x] **Step 1: Add a failing template integration assertion**

The Task 1 catalog-driven DOM test already covers every host. Add this distinct
template contract test to `TestFrontendIntegration` in
`tests/test_frontend.py`:

```python
def test_dashboard_config_loads_before_components(self, client) -> None:
    html = client.get('/').get_data(as_text=True)

    assert html.index('/static/js/dashboard-config.js') < html.index(
        '/static/js/weather-components.js'
    )
    assert 'const theme = urlParams.get' not in html
```

- [x] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/js/dashboard-config.test.js
uv run --locked pytest tests/test_frontend.py -v
```

Expected: FAIL until the template loads and applies the module in the required
order.

- [x] **Step 3: Integrate canonical configuration in the template**

Load `/static/js/dashboard-config.js` after the widget hosts and before
`realtime-weather.js`. Immediately parse and apply configuration:

```html
<script src="/static/js/dashboard-config.js"></script>
<script>
    window.weatherDashboardConfig = window.DashboardConfig.parseDashboardConfig(
        window.location.search
    );
    window.DashboardConfig.applyDashboardConfig(
        document,
        window.weatherDashboardConfig
    );
</script>
```

Remove the duplicate inline theme handler. Rename template CSS selectors
`[data-theme="white"]` to `[data-theme="light"]` and
`[data-theme="dashboard"]` to `[data-theme="eink"]`. Add an explicit
`[data-theme="blue"]` selector only where the root defaults do not already
cover the property.

- [x] **Step 4: Make components consume the shared configuration**

Replace the base class switch statement with catalog-backed values:

```javascript
isEnabled(widgetId) {
    return window.DashboardConfig.isWidgetEnabled(
        window.weatherDashboardConfig,
        widgetId
    );
}

parseConfig() {
    this.config = Object.fromEntries(
        window.DashboardConfig.WIDGET_CATALOG.map(({ id }) => [
            id,
            this.isEnabled(id)
        ])
    );
}
```

Update component checks to canonical keys, including
`this.config['air-quality']`, `this.config['temperature-trends']`, and the
other hyphenated IDs.

For widgets with their own API load in `connectedCallback`—alerts, air quality,
radar, clothing, solar, temperature trends, and moon—return before rendering,
fetching, registering timers, or attaching update listeners when disabled.
Plain `HTMLElement` widgets call the shared `isWidgetEnabled` function
directly.

Rename all component theme selectors and checks from `white`/`dashboard` to
`light`/`eink`. Do not keep dual CSS paths; URL aliases normalize before styles
run.

- [x] **Step 5: Make hidden hosts authoritative**

Add this shared rule to `static/css/weather-components.css`:

```css
:host([hidden]),
[hidden] {
    display: none !important;
}
```

Ensure enabled render paths do not remove a host's `hidden` attribute. The
configuration module alone owns host visibility.

- [x] **Step 6: Run focused tests**

Run:

```bash
node --test tests/js/dashboard-config.test.js
uv run --locked pytest tests/test_frontend.py tests/unit/test_frontend_javascript.py -v
```

Expected: all focused tests PASS with no new warnings.

- [x] **Step 7: Commit**

```bash
git add templates/weather.html static/js/weather-components.js static/css/weather-components.css tests/js/dashboard-config.test.js tests/test_frontend.py
git commit -m "fix: apply dashboard controls to every widget"
```

### Task 3: Strengthen the Daily Range and Simplify Help

**Files:**
- Modify: `static/js/weather-components.js:80-98, 457-530, 1960-2110`
- Modify: `static/css/weather-components.css:40-95`
- Modify: `tests/js/current-weather-range.test.js`
- Modify: `tests/integration/test_daily_temperature_range.py`
- Modify: `test_components.html`
- Modify: `TESTING.md`

**Interfaces:**
- Consumes: `WIDGET_CATALOG`
- Produces: `formatDailyTemperatureRange(daily)` with visible text `HIGH 77° LOW 65°` and the unchanged accessible label
- Produces: `.daily-range`, `.daily-range-item`, `.daily-range-label`, and `.daily-range-value` markup hooks

- [x] **Step 1: Update tests first**

Change formatter expectations in the Node and integration tests from
`H 77° · L 65°` to `HIGH 77° LOW 65°`. Update the render assertion to require
two semantic child spans and keep the range directly inside
`.current-temperature` after `.temp-display`.

Add these stylesheet contract checks to
`tests/js/current-weather-range.test.js`:

```javascript
const fs = require('node:fs');
const path = require('node:path');

test('daily range has primary contrast and stable numerals', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.daily-range\s*\{[^}]*opacity:\s*1;/s);
    assert.match(styles, /\.daily-range\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\)[^{]*\.daily-range-value\s*\{[^}]*color:\s*currentColor;/s);
});
```

- [x] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/js/current-weather-range.test.js
uv run --locked pytest tests/integration/test_daily_temperature_range.py -v
```

Expected: FAIL because production still returns abbreviated copy and one text
node.

- [x] **Step 3: Implement the range markup and update path**

Keep `formatDailyTemperatureRange` pure and return:

```javascript
{
    high: today.h,
    low: today.l,
    text: `HIGH ${today.h}° LOW ${today.l}°`,
    ariaLabel: `Today's high ${today.h} degrees, low ${today.l} degrees.`
}
```

Render stable child spans once:

```html
<div class="daily-range" id="daily-range" hidden>
    <span class="daily-range-item daily-range-high">
        <span class="daily-range-label">High</span>
        <span class="daily-range-value" id="daily-high">--°</span>
    </span>
    <span class="daily-range-item daily-range-low">
        <span class="daily-range-label">Low</span>
        <span class="daily-range-value" id="daily-low">--°</span>
    </span>
</div>
```

On update, clear both values and the accessible label before validating new
data. Set `daily-high` and `daily-low` separately when valid, then reveal the
container. Never rebuild this markup with weather data.

- [x] **Step 4: Implement visual hierarchy**

Add theme tokens and use this range structure in
`static/css/weather-components.css`:

```css
.daily-range {
    display: flex;
    gap: 1rem;
    margin-top: 0.625rem;
    opacity: 1;
    font-variant-numeric: tabular-nums;
}

.daily-range-item {
    display: inline-flex;
    align-items: baseline;
    gap: 0.375rem;
}

.daily-range-label {
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.daily-range-value {
    font-size: 1.125rem;
    font-weight: 600;
}

.daily-range-high .daily-range-value { color: var(--temp-high); }
.daily-range-low .daily-range-value { color: var(--temp-low); }
:host([data-theme="eink"]) .daily-range-value { color: currentColor; }
```

Define `--temp-high` and `--temp-low` beside the other page-level tokens for
blue and light. Define both as `currentColor` for e-ink.

Do not use `transition: all`. Keep the range static during weather refreshes to
avoid distracting layout movement.

- [x] **Step 5: Generate clear help names**

Render the catalog's public IDs into the widget help copy with
`WIDGET_CATALOG.map(({ id }) => id).join(', ')`. Advertise only:

```text
Themes: blue (default), light, eink
```

Update examples to `?theme=light` and `?theme=eink`. Do not advertise
`white`, `dashboard`, or `background`; compatibility remains in the parser.

- [x] **Step 6: Update the manual harness and test guide**

Keep the harness scenarios for valid, freezing, and missing ranges. Add links
or controls for `blue`, `light`, and `eink`, plus a full-catalog selection such
as `?widgets=alerts,radar,clothing,solar,moon,temperature-trends`.

Document the two Node suites and these browser checks in `TESTING.md`.

- [x] **Step 7: Run focused tests**

Run:

```bash
node --test tests/js/current-weather-range.test.js tests/js/dashboard-config.test.js
uv run --locked pytest tests/integration/test_daily_temperature_range.py tests/unit/test_frontend_javascript.py tests/test_frontend.py -v
```

Expected: all focused tests PASS with no warnings.

- [x] **Step 8: Commit**

```bash
git add static/js/weather-components.js static/css/weather-components.css tests/js/current-weather-range.test.js tests/integration/test_daily_temperature_range.py test_components.html TESTING.md
git commit -m "feat: clarify dashboard temperature and controls"
```

### Task 4: Full Verification and Real-Browser Scenarios

**Files:**
- Modify only if verification reveals a defect in files already listed above.

**Interfaces:**
- Consumes: the completed dashboard refactor
- Produces: fresh verification evidence for the branch

- [x] **Step 1: Run static JavaScript checks**

Run:

```bash
node --check static/js/dashboard-config.js
node --check static/js/weather-components.js
```

Expected: both commands exit 0 with no output.

- [x] **Step 2: Run formatting and diff checks**

Run:

```bash
uv run --locked ruff check tests/unit/test_frontend_javascript.py tests/integration/test_daily_temperature_range.py tests/test_frontend.py
uv run --locked ruff format --check tests/unit/test_frontend_javascript.py tests/integration/test_daily_temperature_range.py tests/test_frontend.py
git diff --check main...HEAD
```

Expected: all commands exit 0 with no new warnings.

- [x] **Step 3: Run the canonical suite**

Run: `uv run --locked pytest tests`

Expected: all tests PASS and coverage does not drop below the current 83%.

- [x] **Step 4: Verify real-browser behavior**

Serve the app on an available local port and verify these URLs in a real
browser at 390px and 1280px widths:

```text
/?theme=blue
/?theme=light
/?theme=eink
/?theme=white
/?theme=dashboard
/?widgets=current
/?widgets=alerts,radar,clothing,solar,moon,temperature-trends
/?widgets=radar,nope,moon
/?widgets=
```

Confirm the high/low pair is visible in blue, light, and e-ink; only requested
widgets appear; disabled widget APIs do not appear in the network log; aliases
match their canonical themes; and there are no new console errors.

- [x] **Step 5: Run fresh-eyes review**

Review every changed file for unsafe query rendering, alias precedence,
empty-selection behavior, stale range state, hidden-widget fetches, theme
contrast, and mobile overflow. Fix findings with a failing test first, then
repeat the relevant checks.

- [x] **Step 6: Record durable project knowledge**

Append concise entries to `gotchas.md` stating that the widget catalog is the
only source for widget URL names and that public theme names are
`blue|light|eink` while legacy aliases normalize before styling.

- [x] **Step 7: Commit final verification notes**

```bash
git add gotchas.md docs/superpowers/plans/2026-08-24-dashboard-design-refactor.md
git commit -m "docs: record dashboard refactor verification"
```
