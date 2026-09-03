<!-- ABOUTME: Implementation plan for the 1a phone and 2b eInk dashboard redesign. -->
<!-- ABOUTME: Nine TDD tasks from the widget catalog through moonrise and browser checks. -->

# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thirteen-widget column with a type-led phone screen and a chart-led eInk screen that answer "what is it doing outside, and what should I do about it" at a glance.

**Architecture:** One DOM in `templates/weather.html` composes two layouts. A `.stat-band` wrapper is `display: contents` in blue and light — its children become flex items of `.weather-container` and CSS `order` produces the phone sequence — and becomes a real bordered box in eInk. A new pure module, `static/js/weather-insights.js`, turns the weather payload into one insight sentence and three short facts with no model call and no network call. `LunarDataProvider` gains moonrise and moonset.

**Tech Stack:** Vanilla Custom Elements with Shadow DOM, CSS custom properties keyed on `[data-theme]`, Flask, `node --test` driven through pytest.

**Spec:** `docs/superpowers/specs/2026-09-02-dashboard-redesign-design.md`

## Global Constraints

- Canonical check: `uv run --locked pytest tests`. Every task ends green.
- Every new `tests/js/*.test.js` file must be added to the parametrize list in `tests/unit/test_frontend_javascript.py` or it never runs.
- Theme names are `blue`, `light`, `eink`. `white` and `dashboard` stay as compat aliases.
- No new runtime dependency, frontend or backend. No new fetch beyond what exists.
- eInk keeps `width: 100%`, `max-width: none`, `padding: 0.5rem`, `box-sizing: border-box` on `.weather-container`, and never uses `100vw`.
- Vertical space between adjacent blocks has exactly one owner.
- Hour labels are zero-padded `%I%p` stripped with `lstrip('0')`. Do not touch that formatting.
- Both service-worker cache names bump once, in Task 9.
- Never bypass git hooks. No `--no-verify`.

## Three Corrections To The Spec

Found while turning the spec into code. Each changes what gets built.

**1. `.sky-pair` is a grid in every theme, never `display: contents`.** The spec's Composition section says both wrappers use `display: contents` in blue and light, then lists `.sky-pair` as item 5 in the ordered sequence and calls it "a two-column grid". Those cannot both hold: an element with `display: contents` generates no box, so it can take neither an `order` nor a `grid-template-columns`. Only `.stat-band` is `display: contents`. `.sky-pair` is a real grid — two columns in blue and light, a right-aligned column in eInk. This is what both mocks show.

**2. `weather-alerts` already hides itself at zero alerts.** The spec says it "renders a header at zero alerts (`static/js/weather-components.js:2565`)". It does not: `render()` sets `this.style.display = 'none'` and returns when `active_count` is 0. What is real is the *loading* state — before the fetch resolves, the widget renders a spinner card above the stat band. Task 3 hides the host during loading instead of the change the spec describes.

**3. Moonrise needs two lines in `main.py`.** The spec scopes the backend to `LunarProvider`. But `main.py:936` calls `lunar_provider.process_weather_data({}, location_name, tz_name)` with no coordinates, and `main.py:915` caches on `f'lunar_{current_hour}'`, which is location-independent. Moonrise is location-dependent, so without those two lines it cannot be computed at all, and the cache would serve Chicago's moonrise to Denver. Task 7 passes `{'lat': lat, 'lon': lon}` — the pattern `SolarDataProvider` already uses at `main.py:850` — and puts the coordinates in the cache key. Nothing else in the route changes.

## File Structure

**Create:**

- `static/js/weather-insights.js` — pure functions: the three insight rules, window detection, precipitation noun, wet-bulb position and clause, `calculateWetbulbTemp`. No DOM, no fetch, no dependency. Follows `dashboard-config.js`: plain functions, `window.` global plus `module.exports`.
- `tests/js/weather-insights.test.js`
- `tests/js/sky-pair.test.js`

**Modify:**

- `templates/weather.html` — the two wrappers, `<weather-insights>`, the flex column, `--insight-surface`, the new script tag.
- `static/js/dashboard-config.js` — `defaultThemes` on every entry, new `insights` and `help` entries, theme-aware default visibility.
- `static/js/weather-components.js` — `calculateHourlyChartPoints` symmetric padding; `CurrentWeatherWidget` and `HourlyForecastWidget` rewritten; new `WeatherInsightsWidget`; `WeatherAlertsWidget` loading state; `SolarProgressWidget` and `MoonPhaseWidget` card rendering; `calculateWetbulbTemp` deleted here and imported from the new module.
- `static/css/weather-components.css` — component-internal layout for every rewritten widget.
- `static/sw.js` — both cache names, precache list.
- `weather_providers.py` — `LunarDataProvider` moonrise and moonset.
- `main.py` — coordinates into the lunar provider and the cache key.
- `tests/unit/test_frontend_javascript.py`, `tests/js/dashboard-config.test.js`, `tests/js/current-weather-range.test.js`, `tests/js/hourly-forecast-layout.test.js`, `tests/unit/test_lunar_provider.py`, `tests/integration/test_api_integration.py`
- `gotchas.md`

Light-DOM layout (`.weather-container`, `.stat-band`, `.sky-pair`) lives in the template's `<style>` block. Everything inside a shadow root lives in `static/css/weather-components.css`. That split already exists; keep it.

---

### Task 1: Theme-aware widget defaults

Default visibility becomes a function of the theme. The seven-day strip stays on for phone and desktop and goes off for eInk; every opt-in widget goes off everywhere; help leaves the default page.

**Files:**
- Modify: `static/js/dashboard-config.js`
- Test: `tests/js/dashboard-config.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: every `WIDGET_CATALOG` entry gains `defaultThemes: readonly string[]`. Two new entries: `{id: 'insights', host: 'weather-insights', aliases: ['insight'], parameters: [], defaultThemes: ['blue','light','eink']}` and `{id: 'help', host: 'help-section', aliases: [], parameters: [], defaultThemes: []}`. `parseDashboardConfig(search)` keeps its `{theme, hasWidgetSelection, enabledWidgets}` shape. `applyDashboardConfig(documentRoot, config)` no longer special-cases `help-section`.

- [ ] **Step 1: Write the failing tests**

In `tests/js/dashboard-config.test.js`, add `defaultThemes` to every entry of `EXPECTED_WIDGET_CATALOG` and append the two new entries. The full expected values:

```js
// current, alerts, insights, hourly, solar, moon:  ['blue', 'light', 'eink']
// daily:                                            ['blue', 'light']
// every other entry:                                []
```

Insert `insights` directly after `alerts` and `help` at the end, so the catalog order is: current, alerts, insights, hourly, daily, temperature-trends, radar, clothing, air-quality, wind, pressure, solar, moon, timeline, help.

Then replace the two tests that assumed everything defaults on, and add four new ones:

```js
test('the seven-day strip is on for phone and desktop and off for eInk', () => {
    assert.equal(isWidgetEnabled(parseDashboardConfig(''), 'daily'), true);
    assert.equal(isWidgetEnabled(parseDashboardConfig('?theme=light'), 'daily'), true);
    assert.equal(isWidgetEnabled(parseDashboardConfig('?theme=eink'), 'daily'), false);
});

test('an explicit selection brings the seven-day strip back on eInk', () => {
    const config = parseDashboardConfig('?theme=eink&widgets=daily');
    assert.equal(isWidgetEnabled(config, 'daily'), true);
});

test('opt-in widgets stay off in every theme until they are named', () => {
    const optIn = ['temperature-trends', 'radar', 'clothing', 'air-quality',
        'wind', 'pressure', 'timeline', 'help'];

    ['', '?theme=light', '?theme=eink'].forEach((search) => {
        const config = parseDashboardConfig(search);
        optIn.forEach((id) => {
            assert.equal(isWidgetEnabled(config, id), false, `${search} ${id}`);
        });
    });
});

test('help returns when it is named', () => {
    assert.equal(isWidgetEnabled(parseDashboardConfig('?widgets=help'), 'help'), true);
});

test('the default page shows the glanceable widgets and hides the rest', () => {
    const documentHolder = createDocumentHolder();
    applyDashboardConfig(documentHolder, parseDashboardConfig(''));

    ['current-weather', 'weather-alerts', 'weather-insights', 'hourly-forecast',
        'solar-progress', 'moon-phase', 'daily-forecast'].forEach((host) => {
        assert.equal(documentHolder.hosts.get(host).hidden, false, host);
    });
    ['precipitation-radar', 'pressure-trends', 'hourly-timeline', 'help-section']
        .forEach((host) => {
            assert.equal(documentHolder.hosts.get(host).hidden, true, host);
        });
});
```

Delete the old `empty widget selection behaves like an omitted parameter` assertion that every widget is enabled — keep the test but assert `hasWidgetSelection === false` and that `daily` is on, which is what the field actually means now. Delete `empty widget selection leaves widgets and help visible` outright; the new default-page test replaces it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/dashboard-config.test.js`
Expected: FAIL — the catalog deep-equal reports missing `defaultThemes` and the two missing entries.

- [ ] **Step 3: Add `defaultThemes` to the catalog**

In `static/js/dashboard-config.js`, add the field to all thirteen existing entries and insert the two new ones. Example of the shape, applied to each:

```js
    Object.freeze({
        id: 'current',
        host: 'current-weather',
        aliases: Object.freeze(['now']),
        parameters: Object.freeze(['current']),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'alerts',
        host: 'weather-alerts',
        aliases: Object.freeze(['warnings']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'insights',
        host: 'weather-insights',
        aliases: Object.freeze(['insight']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
```

`hourly`, `solar` and `moon` take `['blue', 'light', 'eink']`. `daily` takes `['blue', 'light']`. `temperature-trends`, `radar`, `clothing`, `air-quality`, `wind`, `pressure` and `timeline` take `Object.freeze([])`. The last entry is:

```js
    Object.freeze({
        id: 'help',
        host: 'help-section',
        aliases: Object.freeze([]),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze([])
    })
```

- [ ] **Step 4: Resolve the theme before default visibility**

Move the theme block above the `enabledWidgets` seed in `parseDashboardConfig`, and seed from `defaultThemes`:

```js
const DEFAULT_THEME = 'blue';

function parseDashboardConfig(search) {
    const urlParams = new URLSearchParams(search || '');

    const requestedTheme = (urlParams.get('theme') || urlParams.get('background') || '')
        .trim()
        .toLowerCase();
    const theme = Object.prototype.hasOwnProperty.call(THEME_NAMES, requestedTheme)
        ? THEME_NAMES[requestedTheme]
        : DEFAULT_THEME;

    const enabledWidgets = Object.fromEntries(
        WIDGET_CATALOG.map(({ id, defaultThemes }) => [id, defaultThemes.includes(theme)])
    );
```

The `widgets=` block, the per-widget parameter block, and `isWidgetEnabled` are unchanged. The return becomes:

```js
    return { theme, hasWidgetSelection, enabledWidgets };
```

- [ ] **Step 5: Drop the help special case**

`help-section` is a catalog host now, so the loop covers it. Delete the trailing block in `applyDashboardConfig`:

```js
    const helpSection = documentRoot.querySelector('help-section');
    if (helpSection) {
        helpSection.hidden = config.hasWidgetSelection;
        helpSection.setAttribute('data-theme', config.theme);
    }
```

Keep `hasWidgetSelection` in the returned config; it is part of the documented shape and tests assert it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/js/dashboard-config.test.js && node --test tests/js/help-section.test.js`
Expected: PASS

- [ ] **Step 7: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add static/js/dashboard-config.js tests/js/dashboard-config.test.js
git commit -m "feat: give widget defaults a theme"
```

---

### Task 2: The insights module

Pure functions that turn a weather payload into one sentence and three short facts. No DOM, no fetch. This task creates the module and its tests; nothing renders it yet.

**Files:**
- Create: `static/js/weather-insights.js`
- Create: `tests/js/weather-insights.test.js`
- Modify: `static/js/weather-components.js:179-196` (delete `calculateWetbulbTemp`), `templates/weather.html`, `static/sw.js`, `tests/unit/test_frontend_javascript.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `window.WeatherInsights` and `module.exports` with `calculateWetbulbTemp(tempF, humidity) -> number`, `wetBulbPosition(feels, wetBulb, air) -> number|null`, `wetBulbClause(wetBulb) -> string`, `precipitationWindow(hours) -> {start, end, peak, noun}|null`, `precipitationNoun(icons) -> string`, `insightFragments(data, hours) -> {long, short}[]`, `insightSentence(data, hours) -> string`, `insightFacts(data, hours) -> string[]`.

`hours` is always an array of the payload's hourly entries, each `{temp, icon, rain, t, desc, pressure}`. `data` is the whole weather payload; the functions read `data.current` and `data.daily` only.

- [ ] **Step 1: Write the failing tests**

Create `tests/js/weather-insights.test.js`:

```js
// ABOUTME: Unit tests for the dashboard's rule-based insight sentence and facts.
// ABOUTME: Runs the production module with Node's dependency-free test runner.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    calculateWetbulbTemp,
    insightFacts,
    insightFragments,
    insightSentence,
    precipitationNoun,
    precipitationWindow,
    wetBulbClause,
    wetBulbPosition
} = require('../../static/js/weather-insights.js');

const hoursAt = (chances, icon = 'rain') => chances.map((rain, index) => ({
    rain,
    icon,
    t: `${index + 1}pm`,
    temp: 50
}));

test('wet bulb sits between feels-like and air temperature', () => {
    assert.equal(wetBulbPosition(60, 70, 80), 50);
    assert.equal(wetBulbPosition(60, 60, 80), 0);
    assert.equal(wetBulbPosition(60, 80, 80), 100);
});

test('every dot sits at the end when air equals feels-like', () => {
    assert.equal(wetBulbPosition(70, 65, 70), 100);
});

test('a wet bulb outside the pair clamps to the track', () => {
    assert.equal(wetBulbPosition(60, 40, 80), 0);
    assert.equal(wetBulbPosition(60, 100, 80), 100);
});

test('a non-finite temperature has no position', () => {
    assert.equal(wetBulbPosition(60, Number.NaN, 80), null);
    assert.equal(wetBulbPosition(undefined, 70, 80), null);
});

test('the wet bulb clause names the exertion band', () => {
    assert.equal(wetBulbClause(85), 'dangerous for exertion');
    assert.equal(wetBulbClause(80), 'dangerous for exertion');
    assert.equal(wetBulbClause(79), 'limit hard exertion');
    assert.equal(wetBulbClause(70), 'limit hard exertion');
    assert.equal(wetBulbClause(69), '');
    assert.equal(wetBulbClause(50), '');
    assert.equal(wetBulbClause(49), 'safe for exertion above 50°, this is well under');
});

test('the window is the first contiguous run at sixty percent or above', () => {
    const window = precipitationWindow(hoursAt([10, 70, 80, 65, 20, 90, 95]));

    assert.equal(window.start, '2pm');
    assert.equal(window.end, '4pm');
    assert.equal(window.peak, '3pm');
});

test('the earliest hour wins a tie for the heaviest', () => {
    assert.equal(precipitationWindow(hoursAt([80, 80, 70])).peak, '1pm');
});

test('no qualifying hour means no window', () => {
    assert.equal(precipitationWindow(hoursAt([10, 20, 59])), null);
    assert.equal(precipitationWindow([]), null);
    assert.equal(precipitationWindow(undefined), null);
});

test('the noun follows a single precipitation type inside the window', () => {
    assert.equal(precipitationNoun(['rain', 'heavy-rain', 'light-rain']), 'Rain');
    assert.equal(precipitationNoun(['snow', 'light-snow']), 'Snow');
    assert.equal(precipitationNoun(['sleet']), 'Sleet');
});

test('a mixed or unrecognized window is precipitation', () => {
    assert.equal(precipitationNoun(['rain', 'snow']), 'Precipitation');
    assert.equal(precipitationNoun(['cloudy']), 'Precipitation');
    assert.equal(precipitationNoun([]), 'Precipitation');
});

test('an unrecognized icon beside one type does not change the noun', () => {
    assert.equal(precipitationNoun(['cloudy', 'rain']), 'Rain');
});

test('wind chill applies only at a ten degree gap', () => {
    const data = { current: { temperature: 30, feels_like: 20 }, daily: [] };
    assert.equal(insightSentence(data, []), 'Wind makes 30° feel like 20°.');

    const mild = { current: { temperature: 30, feels_like: 21 }, daily: [] };
    assert.equal(insightSentence(mild, []), '');
});

test('the overnight clause follows the low', () => {
    const at = (low) => insightSentence({ current: {}, daily: [{ l: low }] }, []);

    assert.equal(at(15), 'Falling to 15° overnight — layers and a hat.');
    assert.equal(at(20), 'Falling to 20° overnight — bring a jacket.');
    assert.equal(at(45), 'Falling to 45° overnight — bring a jacket.');
    assert.equal(at(46), 'Falling to 46° overnight.');
});

test('every rule joins into one sentence in order', () => {
    const data = {
        current: { temperature: 30, feels_like: 18 },
        daily: [{ l: 12 }]
    };

    assert.equal(
        insightSentence(data, hoursAt([70, 90, 60, 10])),
        'Wind makes 30° feel like 18°. Rain likely 1pm–3pm, heaviest around 2pm. '
        + 'Falling to 12° overnight — layers and a hat.'
    );
});

test('the facts are the short form of the same fragments', () => {
    const data = {
        current: { temperature: 30, feels_like: 18 },
        daily: [{ l: 12 }]
    };

    assert.deepEqual(insightFacts(data, hoursAt([70, 90, 60, 10])), [
        'Feels like 18° in the wind',
        'Rain 1pm–3pm',
        '12° overnight'
    ]);
});

test('inapplicable rules are omitted, not blanked', () => {
    const data = { current: { temperature: 60, feels_like: 59 }, daily: [] };

    assert.deepEqual(insightFragments(data, hoursAt([10, 20])), []);
    assert.equal(insightSentence(data, hoursAt([10, 20])), '');
    assert.deepEqual(insightFacts(data, hoursAt([10, 20])), []);
});

test('a missing low drops the overnight rule', () => {
    const data = { current: {}, daily: [{ h: 70 }] };
    assert.deepEqual(insightFacts(data, []), []);
});

test('wet bulb stays close to air temperature in dry heat', () => {
    assert.equal(calculateWetbulbTemp(90, 20), 65);
    assert.equal(calculateWetbulbTemp(70, 100), 70);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/weather-insights.test.js`
Expected: FAIL with `Cannot find module '../../static/js/weather-insights.js'`

- [ ] **Step 3: Write the module**

Create `static/js/weather-insights.js`:

```js
// ABOUTME: Builds the dashboard's rule-based insight sentence and short facts.
// ABOUTME: Pure functions with no DOM or network access, shared by every theme.

const WIND_CHILL_GAP = 10;
const PRECIPITATION_CHANCE = 60;
const COLD_NIGHT_LIMIT = 20;
const COOL_NIGHT_LIMIT = 45;
const DANGEROUS_WET_BULB = 80;
const HARD_EXERTION_WET_BULB = 70;
const COMFORTABLE_WET_BULB = 50;

const PRECIPITATION_NOUNS = new Map([
    ['snow', 'Snow'],
    ['heavy-snow', 'Snow'],
    ['light-snow', 'Snow'],
    ['sleet', 'Sleet'],
    ['rain', 'Rain'],
    ['heavy-rain', 'Rain'],
    ['light-rain', 'Rain']
]);

function calculateWetbulbTemp(tempF, humidity) {
    const tempC = (tempF - 32) * 5 / 9;
    const rh = humidity;

    // Stull approximation for wetbulb temperature
    const wetbulbC = tempC * Math.atan(0.152 * Math.sqrt(rh + 8.3136))
        + Math.atan(tempC + rh)
        - Math.atan(rh - 1.6763)
        + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
        - 4.686035;

    return Math.round(wetbulbC * 9 / 5 + 32);
}

function wetBulbPosition(feels, wetBulb, air) {
    if (![feels, wetBulb, air].every(Number.isFinite)) return null;
    if (air === feels) return 100;

    const percent = ((wetBulb - feels) / (air - feels)) * 100;
    return Math.min(100, Math.max(0, percent));
}

function wetBulbClause(wetBulb) {
    if (!Number.isFinite(wetBulb)) return '';
    if (wetBulb >= DANGEROUS_WET_BULB) return 'dangerous for exertion';
    if (wetBulb >= HARD_EXERTION_WET_BULB) return 'limit hard exertion';
    if (wetBulb < COMFORTABLE_WET_BULB) {
        return 'safe for exertion above 50°, this is well under';
    }
    return '';
}

function precipitationNoun(icons) {
    const nouns = new Set(
        (icons || []).map((icon) => PRECIPITATION_NOUNS.get(icon)).filter(Boolean)
    );
    return nouns.size === 1 ? [...nouns][0] : 'Precipitation';
}

function precipitationWindow(hours) {
    const list = Array.isArray(hours) ? hours : [];
    let first = -1;
    let last = -1;

    for (let index = 0; index < list.length; index += 1) {
        const chance = list[index]?.rain;
        const qualifies = Number.isFinite(chance) && chance >= PRECIPITATION_CHANCE;

        if (qualifies) {
            if (first === -1) first = index;
            last = index;
        } else if (first !== -1) {
            break;
        }
    }

    if (first === -1) return null;

    const run = list.slice(first, last + 1);
    const peak = run.reduce(
        (heaviest, hour) => (hour.rain > heaviest.rain ? hour : heaviest),
        run[0]
    );

    return {
        start: run[0].t,
        end: run[run.length - 1].t,
        peak: peak.t,
        noun: precipitationNoun(run.map(({ icon }) => icon))
    };
}

function windChillFragment(current) {
    const temperature = current?.temperature;
    const feels = current?.feels_like;
    if (!Number.isFinite(temperature) || !Number.isFinite(feels)) return null;
    if (temperature - feels < WIND_CHILL_GAP) return null;

    return {
        long: `Wind makes ${temperature}° feel like ${feels}°.`,
        short: `Feels like ${feels}° in the wind`
    };
}

function precipitationFragment(window) {
    if (!window) return null;

    return {
        long: `${window.noun} likely ${window.start}–${window.end}, `
            + `heaviest around ${window.peak}.`,
        short: `${window.noun} ${window.start}–${window.end}`
    };
}

function overnightFragment(daily) {
    const low = daily?.[0]?.l;
    if (!Number.isFinite(low)) return null;

    let clause = '';
    if (low < COLD_NIGHT_LIMIT) clause = ' — layers and a hat';
    else if (low <= COOL_NIGHT_LIMIT) clause = ' — bring a jacket';

    return {
        long: `Falling to ${low}° overnight${clause}.`,
        short: `${low}° overnight`
    };
}

function insightFragments(data, hours) {
    return [
        windChillFragment(data?.current),
        precipitationFragment(precipitationWindow(hours)),
        overnightFragment(data?.daily)
    ].filter(Boolean);
}

function insightSentence(data, hours) {
    return insightFragments(data, hours).map(({ long }) => long).join(' ');
}

function insightFacts(data, hours) {
    return insightFragments(data, hours).map(({ short }) => short);
}

const WeatherInsights = {
    calculateWetbulbTemp,
    insightFacts,
    insightFragments,
    insightSentence,
    precipitationNoun,
    precipitationWindow,
    wetBulbClause,
    wetBulbPosition
};

if (typeof window !== 'undefined') window.WeatherInsights = WeatherInsights;
if (typeof module !== 'undefined' && module.exports) module.exports = WeatherInsights;
```

The noun rule reads unmapped icons as contributing nothing: a window whose icons are `cloudy` and `rain` yields `Rain`, and a window with no mapped icon at all yields `Precipitation`. That is what "mixes types or matches none" means in the spec.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/js/weather-insights.test.js`
Expected: PASS

- [ ] **Step 5: Delete the old wet-bulb helper and read the module**

In `static/js/weather-components.js`, delete the whole `calculateWetbulbTemp` function and its comment at lines 178-196. It has exactly one caller, `CurrentWeatherWidget.update`, which Task 5 rewrites. Until then, keep that call working by reading it through the global. Replace the deleted block with:

```js
// Insight rules and wet-bulb math live in weather-insights.js.
const { calculateWetbulbTemp } = (
    typeof window !== 'undefined' && window.WeatherInsights
) || require('./weather-insights.js');
```

`require` is unreachable in the browser and used by the Node tests, which load `weather-components.js` without a `window`. If `global.window` is defined in a test file without `WeatherInsights`, the `||` falls through to `require`.

- [ ] **Step 6: Load the module before the components**

In `templates/weather.html`, add the script tag ahead of `weather-components.js`:

```html
    <!-- Insight rules -->
    <script src="/static/js/weather-insights.js"></script>

    <!-- Weather components -->
    <script src="/static/js/weather-components.js"></script>
```

Add the file to the precache list in `static/sw.js`, after `dashboard-config.js`:

```js
  '/static/js/weather-insights.js',
```

Leave both cache names alone; Task 9 bumps them once.

- [ ] **Step 7: Register the test file with pytest**

In `tests/unit/test_frontend_javascript.py`, add to the parametrize list, keeping it alphabetical:

```python
        'weather-insights.test.js',
```

- [ ] **Step 8: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add static/js/weather-insights.js tests/js/weather-insights.test.js \
    static/js/weather-components.js templates/weather.html static/sw.js \
    tests/unit/test_frontend_javascript.py
git commit -m "feat: add rule-based weather insights"
```

---

### Task 3: Layout scaffolding

The two wrappers, the flex column, the theme orders, and the alerts loading state. After this task the page composes correctly with the widgets it already has; the rewritten widgets land in Tasks 4-8.

**Files:**
- Modify: `templates/weather.html`, `static/css/weather-components.css`, `static/js/weather-components.js:2396` (alerts loading state)
- Test: `tests/js/current-weather-range.test.js`

**Interfaces:**
- Consumes: the `insights` and `help` catalog entries from Task 1.
- Produces: `.weather-container` is a flex column owning all vertical rhythm through `gap`. `.stat-band` is `display: contents` in blue and light, a bordered flex box in eInk. `.sky-pair` is a grid in every theme. A `--insight-surface` token exists in all three theme blocks.

- [ ] **Step 1: Write the failing tests**

Append to `tests/js/current-weather-range.test.js`:

```js
test('the container owns vertical rhythm as a flex column', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const containerRule = template.match(/\.weather-container\s*\{[^}]*\}/s)?.[0] || '';

    assert.match(containerRule, /display:\s*flex;/);
    assert.match(containerRule, /flex-direction:\s*column;/);
    assert.match(containerRule, /gap:\s*1\.75rem;/);
});

test('the stat band collapses in blue and becomes a card in eInk', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    assert.match(template, /\.stat-band\s*\{[^}]*display:\s*contents;/s);
    assert.match(
        template,
        /\[data-theme="eink"\] \.stat-band\s*\{[^}]*display:\s*flex;[^}]*border:\s*2px solid #000;/s
    );
});

test('the sky pair is a grid in every theme', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    assert.match(template, /\.sky-pair\s*\{[^}]*display:\s*grid;/s);
    assert.doesNotMatch(template, /\.sky-pair\s*\{[^}]*display:\s*contents;/s);
});

test('the page orders the phone sequence and the eInk sequence', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    assert.match(template, /current-weather\s*\{\s*order:\s*1;\s*\}/);
    assert.match(template, /weather-alerts\s*\{\s*order:\s*2;\s*\}/);
    assert.match(template, /weather-insights\s*\{\s*order:\s*3;\s*\}/);
    assert.match(template, /hourly-forecast\s*\{\s*order:\s*4;\s*\}/);
    assert.match(template, /\.sky-pair\s*\{[^}]*order:\s*5;/s);
    assert.match(template, /daily-forecast\s*\{\s*order:\s*6;\s*\}/);
    assert.match(
        template,
        /\[data-theme="eink"\] weather-insights\s*\{[^}]*order:\s*4;/s
    );
});

test('canonical themes define the insight surface token', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    [':root', '[data-theme="light"]', '[data-theme="eink"]'].forEach((selector) => {
        const escapedSelector = selector.replace(/[\[\]]/g, '\\$&');
        const block = template.match(
            new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's')
        )?.[0] || '';
        assert.match(block, /--insight-surface:/, `${selector} is missing the token`);
    });
});

test('widget wrappers no longer carry their own bottom margin', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    ['.current-widget', '.hourly-widget', '.daily-widget', '.timeline-widget']
        .forEach((selector) => {
            const rule = styles.match(
                new RegExp(`\\${selector}\\s*\\{[^}]*\\}`, 's')
            )?.[0] || '';
            assert.doesNotMatch(rule, /margin-bottom:/, selector);
        });
});
```

Add to `tests/js/current-weather-range.test.js` a test for the alerts loading state:

```js
test('alerts stay out of the layout until their data arrives', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const alertsSource = components.slice(
        components.indexOf('class WeatherAlertsWidget'),
        components.indexOf('// Precipitation Radar Widget')
    );

    assert.match(
        alertsSource,
        /if \(!this\.alertsData\) \{\s*this\.style\.display = 'none';\s*this\.shadowRoot\.innerHTML = '';\s*return;\s*\}/
    );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/current-weather-range.test.js`
Expected: FAIL on the container, band, sky-pair, order, token, margin, and alerts assertions.

- [ ] **Step 3: Restructure the template body**

In `templates/weather.html`, replace the contents of `.weather-container`:

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

        <!-- Opt-in widgets, unchanged order -->
        <enhanced-temperature-trends></enhanced-temperature-trends>
        <precipitation-radar></precipitation-radar>
        <clothing-recommendations></clothing-recommendations>
        <air-quality></air-quality>
        <wind-direction></wind-direction>
        <pressure-trends></pressure-trends>
        <hourly-timeline></hourly-timeline>
        <help-section></help-section>
    </div>
```

`solar-progress` and `moon-phase` move out of the opt-in group into `.sky-pair`.

- [ ] **Step 4: Add the insight surface token**

In the three theme blocks of `templates/weather.html`:

```css
        :root {
            /* ... existing tokens ... */
            --insight-surface: rgba(15, 23, 42, 0.45);
        }

        [data-theme="light"] {
            /* ... existing tokens ... */
            --insight-surface: #f8fafc;
        }

        [data-theme="eink"] {
            /* ... existing tokens ... */
            --insight-surface: #ffffff;
        }
```

`--daily-range-surface` keeps its current value and its current use.

- [ ] **Step 5: Make the container a flex column and order both layouts**

Replace the `.weather-container` rule and add the composition rules below it. The `@media` blocks that widen `max-width` and the eInk override stay as they are, with `gap` added to the eInk block:

```css
        .weather-container {
            max-width: 20rem;
            margin: 0 auto;
            padding: 1.75rem 1.5rem 2rem;
            display: flex;
            flex-direction: column;
            gap: 1.75rem;
        }

        .stat-band {
            display: contents;
        }

        .sky-pair {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.625rem;
            order: 5;
        }

        current-weather { order: 1; }
        weather-alerts { order: 2; }
        weather-insights { order: 3; }
        hourly-forecast { order: 4; }
        daily-forecast { order: 6; }

        /* eInk theme - full viewport width for high-contrast displays */
        [data-theme="eink"] .weather-container {
            max-width: none;
            width: 100%;
            padding: 0.5rem;
            box-sizing: border-box;
            gap: 0.5rem;
        }

        [data-theme="eink"] .stat-band {
            display: flex;
            align-items: center;
            gap: 1.375rem;
            padding: 0.625rem 1rem;
            background: #ffffff;
            border: 2px solid #000000;
            box-sizing: border-box;
            min-height: 8.25rem;
            order: 2;
        }

        [data-theme="eink"] weather-alerts { order: 1; }
        [data-theme="eink"] hourly-forecast { order: 3; flex: 1; }
        [data-theme="eink"] weather-insights { order: 4; }

        [data-theme="eink"] current-weather {
            order: 0;
            flex: 1;
            min-width: 0;
        }

        [data-theme="eink"] .sky-pair {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.375rem;
            margin-left: auto;
            text-align: right;
            order: 0;
        }
```

In eInk, `current-weather` and `.sky-pair` are flex children of the band, so their `order` is scoped to the band and `margin-left: auto` pushes the sky pair right. Everything else orders inside `.weather-container`.

- [ ] **Step 6: Give the container sole ownership of vertical space**

The container `gap` now owns the space between blocks. Delete `margin-bottom` from the widget wrapper rules in `static/css/weather-components.css`: `.current-widget` (line 74), `.hourly-widget` (line 168), `.daily-widget` (line 231), `.timeline-widget` (line 280). Leave inner margins — `.current-temperature`, `.summary`, `.daily-chart-container` — alone; Tasks 5 and 6 rewrite those.

- [ ] **Step 7: Keep alerts out of the layout while loading**

In `static/js/weather-components.js`, `WeatherAlertsWidget.render()` currently paints a spinner card before the fetch resolves. Replace the whole `if (!this.alertsData) { ... }` block at the top of `render()` with:

```js
        if (!this.alertsData) {
            this.style.display = 'none';
            this.shadowRoot.innerHTML = '';
            return;
        }
```

The zero-alert path below already sets `this.style.display = 'none'`. A flex item with `display: none` contributes no gap, so an empty alerts host leaves no hole.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test tests/js/current-weather-range.test.js`
Expected: PASS

- [ ] **Step 9: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add templates/weather.html static/css/weather-components.css \
    static/js/weather-components.js tests/js/current-weather-range.test.js
git commit -m "feat: compose the dashboard from one stat band"
```

---

### Task 4: The insights element

Renders the insight card in blue and light and the three-fact footer strip in eInk, from the module built in Task 2.

**Files:**
- Modify: `static/js/weather-components.js`, `static/css/weather-components.css`
- Test: `tests/js/weather-insights.test.js`

**Interfaces:**
- Consumes: `window.WeatherInsights.insightSentence` and `insightFacts` from Task 2; the `insights` catalog entry from Task 1.
- Produces: `WeatherInsightsWidget`, registered as `weather-insights` and exported on `module.exports`. It reads `weather-data-updated` and never fetches.

- [ ] **Step 1: Write the failing tests**

Append to `tests/js/weather-insights.test.js`. The element needs the same globals the other component tests install, so add this above the existing `require`:

```js
global.HTMLElement = class {
    attachShadow() {
        this.shadowRoot = { innerHTML: '' };
        return this.shadowRoot;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };
global.window = { WeatherInsights: require('../../static/js/weather-insights.js') };
```

Then append the tests:

```js
const { WeatherInsightsWidget } = require('../../static/js/weather-components.js');

const insightsWidget = (theme) => {
    const card = { textContent: '', hidden: true };
    const facts = { innerHTML: '', hidden: true };
    const widget = Object.create(WeatherInsightsWidget.prototype);
    widget.config = { insights: true };
    widget.attributes = new Map([['data-theme', theme]]);
    widget.getAttribute = (name) => widget.attributes.get(name) ?? null;
    widget.shadowRoot = {
        getElementById: (id) => (id === 'insight-card' ? card : facts)
    };
    widget.hidden = false;
    return { widget, card, facts };
};

const insightData = {
    current: { temperature: 30, feels_like: 18 },
    daily: [{ l: 12 }],
    hourly: hoursAt([70, 90, 60, 10])
};

test('blue renders one sentence and no fact strip', () => {
    const { widget, card, facts } = insightsWidget('blue');
    widget.data = insightData;

    widget.update();

    assert.equal(
        card.textContent,
        'Wind makes 30° feel like 18°. Rain likely 1pm–3pm, heaviest around 2pm. '
        + 'Falling to 12° overnight — layers and a hat.'
    );
    assert.equal(card.hidden, false);
    assert.equal(facts.hidden, true);
    assert.equal(widget.hidden, false);
});

test('eInk renders a fact per cell with the first inverted', () => {
    const { widget, card, facts } = insightsWidget('eink');
    widget.data = insightData;

    widget.update();

    assert.equal(card.hidden, true);
    assert.equal(facts.hidden, false);
    assert.equal((facts.innerHTML.match(/class="insight-fact/g) || []).length, 3);
    assert.match(facts.innerHTML, /class="insight-fact insight-fact-lead"/);
    assert.match(facts.innerHTML, /Feels like 18° in the wind/);
});

test('the fact strip sizes to the facts present', () => {
    const { widget, facts } = insightsWidget('eink');
    widget.data = { current: {}, daily: [{ l: 30 }], hourly: [] };

    widget.update();

    assert.equal((facts.innerHTML.match(/class="insight-fact/g) || []).length, 1);
    assert.match(facts.innerHTML, /30° overnight/);
});

test('the host hides when no rule applies', () => {
    const { widget, card, facts } = insightsWidget('blue');
    widget.data = { current: { temperature: 60, feels_like: 59 }, daily: [], hourly: [] };

    widget.update();

    assert.equal(widget.hidden, true);
    assert.equal(card.hidden, true);
    assert.equal(facts.hidden, true);
});

test('a fact with markup in it is inserted as text', () => {
    const { widget, facts } = insightsWidget('eink');
    widget.data = {
        current: {},
        daily: [],
        hourly: [{ rain: 80, icon: 'rain', t: '<img src=x onerror=alert(1)>' }]
    };

    widget.update();

    assert.doesNotMatch(facts.innerHTML, /<img src=x on/);
    assert.match(facts.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/weather-insights.test.js`
Expected: FAIL — `WeatherInsightsWidget` is not a constructor.

- [ ] **Step 3: Write the element**

In `static/js/weather-components.js`, insert after the `HourlyForecastWidget` export block and before `class DailyForecastWidget`:

```js
// Weather Insights Component
const HOURLY_CHART_HOURS = 12;

function escapeText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class WeatherInsightsWidget extends WeatherWidget {
    render() {
        if (this.config.insights === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="insight-card" id="insight-card" hidden></div>
            <div class="insight-facts" id="insight-facts" hidden></div>
        `;
    }

    update() {
        if (!this.data || this.config.insights === false) return;

        const insights = window.WeatherInsights;
        const hours = (this.data.hourly || []).slice(0, HOURLY_CHART_HOURS);
        const card = this.shadowRoot.getElementById('insight-card');
        const factStrip = this.shadowRoot.getElementById('insight-facts');
        const facts = insights.insightFacts(this.data, hours);
        const isEink = this.getAttribute('data-theme') === 'eink';

        this.hidden = facts.length === 0;
        card.hidden = true;
        factStrip.hidden = true;
        if (this.hidden) return;

        if (isEink) {
            factStrip.innerHTML = facts.map((fact, index) => `
                <div class="insight-fact${index === 0 ? ' insight-fact-lead' : ''}">
                    ${escapeText(fact)}
                </div>
            `).join('');
            factStrip.hidden = false;
            return;
        }

        card.textContent = insights.insightSentence(this.data, hours);
        card.hidden = false;
    }
}

customElements.define('weather-insights', WeatherInsightsWidget);

if (typeof module !== 'undefined' && module.exports) {
    module.exports.WeatherInsightsWidget = WeatherInsightsWidget;
}
```

Facts come from hour labels, which are provider strings, so they go through `escapeText` before reaching `innerHTML`. The blue path uses `textContent` and needs no escaping.

- [ ] **Step 4: Style both forms**

Append to `static/css/weather-components.css`, after the current-weather block:

```css
/* Weather Insights Widget */
.insight-card {
    font-size: 1rem;
    line-height: 1.45;
    padding: 0.875rem 1rem;
    border-radius: 0.875rem;
    background: var(--insight-surface);
    border: 1px solid var(--card-border);
}

.insight-facts {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 0.5rem;
}

.insight-fact {
    font-size: 1rem;
    font-weight: 800;
    padding: 0.625rem 0.875rem;
    background: var(--insight-surface);
    border: 2px solid var(--card-border);
    box-sizing: border-box;
}

:host([data-theme="eink"]) .insight-fact-lead {
    background: #000000;
    color: #ffffff;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/js/weather-insights.test.js`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add static/js/weather-components.js static/css/weather-components.css \
    tests/js/weather-insights.test.js
git commit -m "feat: render the weather insight card and fact strip"
```

---

### Task 5: Current conditions

The type-led temperature block for phone and desktop, and the same DOM composed as the eInk stat band's three columns.

**Files:**
- Modify: `static/js/weather-components.js:400-506`, `static/css/weather-components.css`
- Test: `tests/js/current-weather-range.test.js`, `tests/js/hourly-forecast-layout.test.js`

**Interfaces:**
- Consumes: `window.WeatherInsights.calculateWetbulbTemp`, `wetBulbPosition` and `wetBulbClause` from Task 2; `--insight-surface` and the band from Task 3.
- Produces: `CurrentWeatherWidget` with element ids `location`, `local-time`, `temp`, `summary`, `daily-range`, `daily-high`, `daily-low`, `feels-value`, `wet-value`, `air-value`, `scale-fill`, `scale-dot-wet`, `three-temps-note`, and the eInk bar ids `bar-air`, `bar-wet`, `bar-feels`. The daily-range contract is unchanged.

- [ ] **Step 1: Write the failing tests**

Rewrite the two markup tests at the top of `tests/js/current-weather-range.test.js` and add the three-temperature tests. Replace `renders a hidden daily range beneath the current temperature` with:

```js
test('renders the header, temperature block, and three-temperature module', () => {
    const widget = new CurrentWeatherWidget();
    widget.style = {};

    widget.render();

    const html = widget.shadowRoot.innerHTML;
    assert.match(html, /<div class="header-row">[\s\S]*?id="location"[\s\S]*?id="local-time"/);
    assert.match(html, /<div class="temperature" id="temp">/);
    assert.match(html, /<div class="current-text">/);
    assert.match(html, /id="daily-range" hidden/);
    assert.match(html, /id="feels-value"[\s\S]*?id="wet-value"[\s\S]*?id="air-value"/);
    assert.match(html, /id="scale-fill"[\s\S]*?id="scale-dot-wet"/);
    assert.match(html, /id="three-temps-note"/);
});
```

Extend the element map in `shows a complete daily range and clears it when later data is missing` so `update()` finds every new id. Replace its `elements` object with:

```js
    const styleHolder = () => ({ textContent: '', style: {}, innerHTML: '' });
    const elements = {
        temp: styleHolder(),
        location: styleHolder(),
        'local-time': styleHolder(),
        summary: styleHolder(),
        'feels-value': styleHolder(),
        'wet-value': styleHolder(),
        'air-value': styleHolder(),
        'scale-fill': styleHolder(),
        'scale-dot-wet': styleHolder(),
        'three-temps-note': styleHolder(),
        'bar-air': styleHolder(),
        'bar-wet': styleHolder(),
        'bar-feels': styleHolder(),
        'daily-range': {
            hidden: true,
            setAttribute(name, value) { attributes.set(name, value); },
            removeAttribute(name) { attributes.delete(name); }
        },
        'daily-high': { textContent: '' },
        'daily-low': { textContent: '' }
    };
```

and drop `icon`, `humidity`, `wind`, `uv` and `rain` from `widget.data.current` expectations — the detail cards are gone. Keep every existing assertion about `daily-high`, `daily-low`, `aria-label` and `hidden`; that contract is unchanged. Add `widget.getAttribute = () => 'blue';` beside `widget.hideError`.

Then add:

```js
test('the three temperatures read feels-like, wet bulb, and air', () => {
    const { widget, elements } = currentWidgetWithData({
        temperature: 88, feels_like: 94, humidity: 60, summary: 'Hazy'
    });

    widget.update();

    assert.equal(elements['air-value'].textContent, '88°');
    assert.equal(elements['feels-value'].textContent, '94°');
    assert.equal(elements['wet-value'].textContent, '77°');
});

test('the scale places the wet bulb between feels-like and air', () => {
    const { widget, elements } = currentWidgetWithData({
        temperature: 88, feels_like: 94, humidity: 60, summary: 'Hazy'
    });

    widget.update();

    // wet bulb 77 against feels 94 and air 88 falls below both, so it clamps to 0
    assert.equal(elements['scale-fill'].style.width, '0%');
    assert.equal(elements['scale-dot-wet'].style.left, '0%');
});

test('every dot sits at the end when air equals feels-like', () => {
    const { widget, elements } = currentWidgetWithData({
        temperature: 70, feels_like: 70, humidity: 50, summary: 'Clear'
    });

    widget.update();

    assert.equal(elements['scale-fill'].style.width, '100%');
    assert.equal(elements['scale-dot-wet'].style.left, '100%');
});

test('the explainer names the exertion band and drops it when comfortable', () => {
    const hot = currentWidgetWithData({
        temperature: 95, feels_like: 105, humidity: 70, summary: 'Hot'
    });
    hot.widget.update();
    assert.match(hot.elements['three-temps-note'].textContent, /dangerous for exertion$/);

    const mild = currentWidgetWithData({
        temperature: 68, feels_like: 68, humidity: 55, summary: 'Mild'
    });
    mild.widget.update();
    assert.doesNotMatch(mild.elements['three-temps-note'].textContent, /exertion/);
});

test('the eInk bars scale against air temperature and keep a negative value', () => {
    const { widget, elements } = currentWidgetWithData(
        { temperature: 40, feels_like: -5, humidity: 60, summary: 'Bitter' },
        'eink'
    );

    widget.update();

    assert.equal(elements['bar-air'].style.width, '100%');
    assert.equal(elements['bar-feels'].style.width, '0%');
    assert.equal(elements['feels-value'].textContent, '-5°');
});
```

Add the shared helper beside the other helpers in the file:

```js
function currentWidgetWithData(current, theme = 'blue') {
    const styleHolder = () => ({ textContent: '', style: {}, innerHTML: '' });
    const ids = ['temp', 'location', 'local-time', 'summary', 'feels-value',
        'wet-value', 'air-value', 'scale-fill', 'scale-dot-wet', 'three-temps-note',
        'bar-air', 'bar-wet', 'bar-feels', 'daily-high', 'daily-low'];
    const elements = Object.fromEntries(ids.map((id) => [id, styleHolder()]));
    elements['daily-range'] = {
        hidden: true,
        setAttribute() {},
        removeAttribute() {}
    };

    const widget = new CurrentWeatherWidget();
    widget.shadowRoot.getElementById = (id) => elements[id];
    widget.getAttribute = () => theme;
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    widget.data = { current, daily: [{ h: 50, l: 30 }], location: 'Chicago' };
    return { widget, elements };
}
```

Delete `eInk current weather keeps detail cards inside a mobile grid` and `eInk summary owns one compact gap before the detail cards` — the detail-card grid they guard no longer exists. Their intent, that eInk spacing has one owner, is carried by the container-gap test added in Task 3.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/current-weather-range.test.js`
Expected: FAIL on the header row, the three-temperature ids, and the scale positions.

- [ ] **Step 3: Rewrite the markup**

Replace `CurrentWeatherWidget.render()`:

```js
    render() {
        if (this.config.current === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="current-widget widget-content">
                <div class="temperature" id="temp">--°</div>

                <div class="current-text">
                    <div class="header-row">
                        <span class="location" id="location">--</span>
                        <span class="local-time" id="local-time">--</span>
                    </div>
                    <div class="summary" id="summary">Loading weather data...</div>
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
                </div>

                <div class="three-temps">
                    <div class="three-temps-grid">
                        <div class="three-temp three-temp-feels">
                            <span class="three-temp-label">Feels</span>
                            <span class="three-temp-bar" id="bar-feels"></span>
                            <span class="three-temp-value" id="feels-value">--°</span>
                        </div>
                        <div class="three-temp three-temp-wet">
                            <span class="three-temp-label">Wet bulb</span>
                            <span class="three-temp-bar" id="bar-wet"></span>
                            <span class="three-temp-value" id="wet-value">--°</span>
                        </div>
                        <div class="three-temp three-temp-air">
                            <span class="three-temp-label">Air</span>
                            <span class="three-temp-bar" id="bar-air"></span>
                            <span class="three-temp-value" id="air-value">--°</span>
                        </div>
                    </div>
                    <div class="three-temps-scale">
                        <div class="scale-track"></div>
                        <div class="scale-fill" id="scale-fill"></div>
                        <div class="scale-dot scale-dot-feels"></div>
                        <div class="scale-dot scale-dot-wet" id="scale-dot-wet"></div>
                        <div class="scale-dot scale-dot-air"></div>
                    </div>
                    <div class="three-temps-note" id="three-temps-note"></div>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
        this.startClock();
    }

    startClock() {
        clearInterval(this.clockTimer);
        this.clockTimer = setInterval(() => this.updateClock(), 60000);
        this.updateClock();
    }

    disconnectedCallback() {
        clearInterval(this.clockTimer);
    }

    updateClock() {
        const label = this.shadowRoot.getElementById('local-time');
        if (!label) return;
        label.textContent = new Date().toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
```

One DOM serves both screens: the eInk stat band shows the same three columns side by side, with the bars visible and the scale hidden; blue shows the scale and hides the bars. Which one is visible is a CSS question, not a markup question.

- [ ] **Step 4: Rewrite the update**

Replace `CurrentWeatherWidget.update()`:

```js
    update() {
        if (!this.data || this.config.current === false) return;

        const insights = window.WeatherInsights;
        const current = this.data.current;
        const air = current.temperature;
        const feels = current.feels_like;
        const wetBulb = insights.calculateWetbulbTemp(air, current.humidity);

        this.shadowRoot.getElementById('temp').textContent = `${air}°`;
        this.shadowRoot.getElementById('location').textContent =
            this.data.location || '';
        this.updateClock();

        let summary = current.summary;
        if (current.precipitation_rate > 0) {
            const precipType = current.precipitation_type === 'snow'
                ? 'snowing'
                : 'raining';
            summary = `Currently ${precipType} - ${summary}`;
        }
        this.shadowRoot.getElementById('summary').textContent = summary;

        const dailyRangeEl = this.shadowRoot.getElementById('daily-range');
        const dailyHighEl = this.shadowRoot.getElementById('daily-high');
        const dailyLowEl = this.shadowRoot.getElementById('daily-low');
        dailyHighEl.textContent = '';
        dailyLowEl.textContent = '';
        dailyRangeEl.removeAttribute('aria-label');
        dailyRangeEl.hidden = true;
        const dailyRange = formatDailyTemperatureRange(this.data.daily);
        if (dailyRange) {
            dailyHighEl.textContent = `${dailyRange.high}°`;
            dailyLowEl.textContent = `${dailyRange.low}°`;
            dailyRangeEl.setAttribute('aria-label', dailyRange.ariaLabel);
            dailyRangeEl.hidden = false;
        }

        this.shadowRoot.getElementById('feels-value').textContent = `${feels}°`;
        this.shadowRoot.getElementById('wet-value').textContent = `${wetBulb}°`;
        this.shadowRoot.getElementById('air-value').textContent = `${air}°`;

        const wetPercent = insights.wetBulbPosition(feels, wetBulb, air) ?? 100;
        this.shadowRoot.getElementById('scale-fill').style.width = `${wetPercent}%`;
        this.shadowRoot.getElementById('scale-dot-wet').style.left = `${wetPercent}%`;

        this.updateBars(air, feels, wetBulb);

        const clause = insights.wetBulbClause(wetBulb);
        this.shadowRoot.getElementById('three-temps-note').textContent =
            `Wet bulb ${wetBulb}°${clause ? ` — ${clause}` : ''}`;

        this.hideError();
        this.hideLoading();
    }

    updateBars(air, feels, wetBulb) {
        const scale = (value) => {
            if (!Number.isFinite(value) || !Number.isFinite(air) || air === 0) {
                return '0%';
            }
            return `${Math.min(100, Math.max(0, (value / air) * 100))}%`;
        };

        this.shadowRoot.getElementById('bar-air').style.width = '100%';
        this.shadowRoot.getElementById('bar-wet').style.width = scale(wetBulb);
        this.shadowRoot.getElementById('bar-feels').style.width = scale(feels);
    }
```

The eInk bars always show `AIR` at full width and clamp the other two into `[0, 100]`, so a negative feels-like draws nothing and still prints its value.

- [ ] **Step 5: Style the temperature block**

In `static/css/weather-components.css`, replace the current-weather block (lines 74-166, from `.current-widget` through `.detail-value`) with:

```css
.current-widget {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.current-text {
    display: contents;
}

.header-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.85;
    order: 1;
}

.temperature {
    font-size: clamp(4.5rem, 43vw, 10.5rem);
    font-weight: 200;
    line-height: 0.9;
    letter-spacing: -0.06em;
    margin-left: -0.5rem;
    font-variant-numeric: tabular-nums;
    order: 2;
}

.summary {
    font-size: 1.375rem;
    font-weight: 500;
    line-height: 1.3;
    order: 3;
}

.daily-range {
    display: flex;
    gap: 1.25rem;
    margin-top: 0.375rem;
    opacity: 1;
    font-variant-numeric: tabular-nums;
    order: 4;
}

.daily-range-item {
    display: inline-flex;
    align-items: baseline;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--daily-range-surface);
}

.daily-range-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
    margin-right: 0.375rem;
}

.daily-range-value {
    font-size: 1.0625rem;
    font-weight: 600;
}

.daily-range-high .daily-range-value { color: var(--temp-high); }
.daily-range-low .daily-range-value { color: var(--temp-low); }

.three-temps {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1.125rem;
    order: 5;
}

.three-temps-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
}

.three-temp {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
}

.three-temp-feels { text-align: left; }
.three-temp-wet { text-align: center; }
.three-temp-air { text-align: right; }

.three-temp-label {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
}

.three-temp-value {
    font-size: 1.625rem;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.three-temp-bar { display: none; }

.three-temps-scale {
    position: relative;
    height: 0.875rem;
}

.scale-track,
.scale-fill {
    position: absolute;
    top: 0.375rem;
    height: 2px;
}

.scale-track {
    left: 0;
    right: 0;
    background: rgba(255, 255, 255, 0.3);
}

.scale-fill {
    left: 0;
    background: var(--temp-low);
}

.scale-dot {
    position: absolute;
    top: 0.125rem;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    box-sizing: border-box;
}

.scale-dot-feels {
    left: 0;
    background: var(--temp-low);
}

.scale-dot-wet {
    background: #ffffff;
    transform: translateX(-50%);
}

.scale-dot-air {
    right: 0;
    border: 2px solid #ffffff;
    background: transparent;
}

.three-temps-note {
    font-size: 0.75rem;
    opacity: 0.75;
    line-height: 1.4;
}
```

Add the eInk stat-band composition after it:

```css
:host([data-theme="eink"]) .current-widget {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1.375rem;
}

:host([data-theme="eink"]) .current-text {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-self: stretch;
    gap: 0.25rem;
    border-left: 2px solid #000000;
    padding-left: 1.125rem;
}

:host([data-theme="eink"]) .temperature {
    font-size: clamp(3rem, 14vw, 7rem);
    font-weight: 900;
    line-height: 0.85;
    margin-left: -0.375rem;
}

:host([data-theme="eink"]) .header-row {
    font-size: 0.8125rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    opacity: 1;
    gap: 0.5rem;
    justify-content: flex-start;
}

:host([data-theme="eink"]) .summary {
    font-size: 1.375rem;
    font-weight: 800;
}

:host([data-theme="eink"]) .daily-range { gap: 1rem; margin-top: 0; }
:host([data-theme="eink"]) .daily-range-label { font-weight: 800; opacity: 1; }
:host([data-theme="eink"]) .daily-range-value { font-size: 1.25rem; font-weight: 900; }

:host([data-theme="eink"]) .three-temps {
    align-self: stretch;
    justify-content: center;
    margin-top: 0;
    border-left: 2px solid #000000;
    padding-left: 1.125rem;
}

:host([data-theme="eink"]) .three-temps-grid {
    grid-template-columns: auto 7.5rem auto;
    gap: 0.25rem 0.625rem;
}

:host([data-theme="eink"]) .three-temp {
    display: contents;
}

:host([data-theme="eink"]) .three-temp-label {
    font-weight: 800;
    opacity: 1;
    align-self: center;
    text-align: left;
}

:host([data-theme="eink"]) .three-temp-bar {
    display: block;
    height: 0.75rem;
    align-self: center;
    box-sizing: border-box;
}

:host([data-theme="eink"]) .three-temp-air .three-temp-bar {
    background: #000000;
}

:host([data-theme="eink"]) .three-temp-wet .three-temp-bar {
    border: 1px solid #000000;
    background: repeating-linear-gradient(
        45deg, #000 0 2px, transparent 2px 5px
    );
}

:host([data-theme="eink"]) .three-temp-feels .three-temp-bar {
    border: 1px solid #000000;
}

:host([data-theme="eink"]) .three-temp-value {
    font-size: 1.125rem;
    font-weight: 900;
    text-align: right;
    align-self: center;
}

:host([data-theme="eink"]) .three-temps-scale,
:host([data-theme="eink"]) .three-temps-note {
    display: none;
}
```

The eInk rows read AIR, WET BULB, FEELS top to bottom, so give them explicit orders inside the grid:

```css
:host([data-theme="eink"]) .three-temp-air { order: 1; }
:host([data-theme="eink"]) .three-temp-wet { order: 2; }
:host([data-theme="eink"]) .three-temp-feels { order: 3; }
```

`display: contents` on `.three-temp` puts the label, bar and value directly into the grid, so `order` on the parent has no effect. Instead, keep `.three-temp` as a `display: contents` wrapper and set the order on its three children:

```css
:host([data-theme="eink"]) .three-temp-air > * { order: 1; }
:host([data-theme="eink"]) .three-temp-wet > * { order: 2; }
:host([data-theme="eink"]) .three-temp-feels > * { order: 3; }
```

- [ ] **Step 6: Remove the eInk overrides for deleted classes**

The base class ships `!important` overrides for `.feels-like`, `.detail-value` and `.detail-label`, which no longer exist. In `WeatherWidget.getSharedStyles()`, delete the `:host([data-theme="eink"]) .feels-like`, `.detail-value`, `.detail-label` rules and the `@media (max-width: 640px)` block that re-sizes those two, and delete the `:host([data-theme="eink"]) .temperature` rule — the component stylesheet owns the hero now. Leave the day, timeline, icon and chart-line overrides alone; those widgets still use them.

Also delete the now-dead `:host([data-theme="eink"]) .temp-display`, `.weather-details`, `.summary`, `.detail-card` and `@media (max-width: 640px) ... .weather-details` rules from `static/css/weather-components.css`.

Two of those rules are pinned by a test in another file. In `tests/js/hourly-forecast-layout.test.js`, the test `eInk keeps strong type with compact page and component spacing` asserts the `.temp-display` and `.weather-details` blocks exist; drop those last two assertions and keep the four that guard the container width and the harness padding. That test's subject is the eInk page gutter, which this task does not touch.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/js/current-weather-range.test.js && node --test tests/js/hourly-forecast-layout.test.js`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add static/js/weather-components.js static/css/weather-components.css \
    tests/js/current-weather-range.test.js tests/js/hourly-forecast-layout.test.js
git commit -m "feat: lead current conditions with type"
```

---

### Task 6: The twelve-hour chart

One aligned chart: precipitation bars behind a temperature line, the hour grid below, and a marker on the current hour. Fixed `viewBox`, so no measurement and no resize observer.

**Files:**
- Modify: `static/js/weather-components.js:100-117` and `512-655`, `static/css/weather-components.css`
- Test: `tests/js/hourly-forecast-layout.test.js`

**Interfaces:**
- Consumes: `window.WeatherInsights.precipitationWindow` from Task 2; `HOURLY_CHART_HOURS` from Task 4.
- Produces: `calculateHourlyChartPoints(temperatures, width, height, padding)` — a fourth required argument replacing the old asymmetric 16/8 constants. `HourlyForecastWidget` renders into ids `hourly-caption-hours`, `hourly-caption-precip`, `precip-bars`, `chart-line`, `chart-marker`, `hourly-temps`, `legend-precip`. `setupChartResizeObserver` and the widget's `disconnectedCallback` are deleted.

- [ ] **Step 1: Write the failing tests**

In `tests/js/hourly-forecast-layout.test.js`, replace the three geometry tests at the top:

```js
test('centers chart points in the same equal-width cells as hourly entries', () => {
    const points = calculateHourlyChartPoints([10, 20, 30], 1000, 150, 14);

    assert.deepEqual(points.map(({ x }) => x), [
        1000 / 6, 1000 / 2, (1000 * 5) / 6
    ]);
    assert.ok(points.every(({ y }) => y >= 14 && y <= 136));
});

test('centers a flat temperature range vertically', () => {
    const points = calculateHourlyChartPoints([20, 20], 1000, 150, 14);

    assert.deepEqual(points, [{ x: 250, y: 75 }, { x: 750, y: 75 }]);
});

test('symmetric padding puts the hottest hour at the top pad', () => {
    const points = calculateHourlyChartPoints([10, 30], 1000, 180, 16);

    assert.equal(points[1].y, 16);
    assert.equal(points[0].y, 164);
});
```

Delete `redraws current forecast hours when the rendered chart box changes size` — no observer remains. Replace `aligns six real forecast hours to six equal auto columns` with an assertion that the bar grid is gapless:

```js
test('the bar grid divides the chart into gapless columns', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.precip-bars\s*\{[^}]*display:\s*grid;/s);
    assert.match(styles, /\.precip-bars\s*\{[^}]*grid-auto-flow:\s*column;/s);
    assert.match(styles, /\.precip-bars\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s);
    assert.match(styles, /\.precip-bars\s*\{[^}]*gap:\s*0;/s);
    assert.match(styles, /\.precip-cell\s*\{[^}]*padding:\s*0 3px;/s);
});
```

Then add the render tests:

```js
const hourAt = (index, temp, rain) => ({
    t: `${index + 1}pm`, temp, rain, icon: 'rain'
});

function hourlyWidget(hours, theme = 'blue') {
    const holders = {};
    const holder = () => ({ innerHTML: '', textContent: '', style: {}, hidden: true });
    ['hourly-caption-hours', 'hourly-caption-precip', 'precip-bars', 'chart-line',
        'chart-marker', 'hourly-temps', 'legend-precip', 'hourly-chart']
        .forEach((id) => { holders[id] = holder(); });
    holders['chart-line'].setAttribute = (name, value) => {
        holders['chart-line'][name] = value;
    };
    holders['hourly-chart'].setAttribute = (name, value) => {
        holders['hourly-chart'][name] = value;
    };

    const widget = Object.create(HourlyForecastWidget.prototype);
    widget.config = { hourly: true };
    widget.data = { hourly: hours };
    widget.getAttribute = () => theme;
    widget.shadowRoot = { getElementById: (id) => holders[id] ?? null };
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    return { widget, holders };
}

test('the caption counts the hours actually rendered', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 50, 10), hourAt(1, 52, 20), hourAt(2, 54, 30)
    ]);

    widget.update();

    assert.equal(holders['hourly-caption-hours'].textContent, 'Next 3 hours');
    assert.equal((holders['precip-bars'].innerHTML.match(/precip-cell/g) || []).length, 3);
    assert.equal((holders['hourly-temps'].innerHTML.match(/hour-temp"/g) || []).length, 3);
});

test('twelve hours is the ceiling', () => {
    const hours = Array.from({ length: 24 }, (_, index) => hourAt(index, 50, 10));
    const { widget, holders } = hourlyWidget(hours);

    widget.update();

    assert.equal(holders['hourly-caption-hours'].textContent, 'Next 12 hours');
    assert.equal((holders['precip-bars'].innerHTML.match(/precip-cell/g) || []).length, 12);
});

test('the line lands on the exact bar centers', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 40, 10), hourAt(1, 60, 20)
    ]);

    widget.update();

    assert.equal(holders['chart-line'].points, '250,136 750,14');
});

test('the marker sits on the first point without an SVG circle', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 40, 10), hourAt(1, 60, 20)
    ]);

    widget.update();

    assert.equal(holders['chart-marker'].style.left, '25%');
    assert.equal(holders['chart-marker'].hidden, false);
    assert.doesNotMatch(holders['precip-bars'].innerHTML, /<circle/);
});

test('precipitation labels appear at forty percent and above', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 50, 39), hourAt(1, 52, 40), hourAt(2, 54, 80)
    ]);

    widget.update();

    const labels = holders['hourly-temps'].innerHTML.match(/hour-precip">(\d+)%/g) || [];
    assert.deepEqual(labels, ['hour-precip">40%', 'hour-precip">80%']);
});

test('the caption names the precipitation window and drops it when there is none', () => {
    const wet = hourlyWidget([hourAt(0, 50, 70), hourAt(1, 52, 80), hourAt(2, 54, 10)]);
    wet.widget.update();
    assert.equal(wet.holders['hourly-caption-precip'].textContent, 'Rain 1pm–2pm');
    assert.equal(wet.holders['legend-precip'].textContent, 'rain chance');

    const dry = hourlyWidget([hourAt(0, 50, 10), hourAt(1, 52, 20)]);
    dry.widget.update();
    assert.equal(dry.holders['hourly-caption-precip'].textContent, '');
    assert.equal(dry.holders['legend-precip'].textContent, 'precipitation chance');
});

test('the eInk chart uses its own height and padding', () => {
    const { widget, holders } = hourlyWidget(
        [hourAt(0, 40, 10), hourAt(1, 60, 20)],
        'eink'
    );

    widget.update();

    assert.equal(holders['hourly-chart'].viewBox, '0 0 1000 180');
    assert.equal(holders['chart-line'].points, '250,164 750,16');
});
```

Keep `renders time inside each hourly cell without a second time row`, the two eInk clamp tests and the fixture tests as they are. In `inserts an hourly time as literal text instead of hourly cell markup`, keep every assertion about `textContentAssignments` — that is the escaping guard — and replace the icon assertion:

```js
    assert.doesNotMatch(hourDiv.innerHTMLAssignments[0], /<weather-icon/);
```

In `uses one gapless auto-column grid with no hourly scrolling`, keep every `.hourly-temps` assertion and change the last line to the spec's flat height:

```js
    assert.match(styles, /\.chart-container\s*\{[^}]*height:\s*9\.375rem;/s);
```

The spec fixes the chart at 150px, and the mock it comes from is the 390px phone. The old `clamp(8rem, 25vw, 11rem)` existed because the chart used to compete with a row of weather icons; with the icons gone and the SVG on a fixed `viewBox`, the height is presentational and the spec's number wins. Say so in the commit rather than leaving a reader to wonder why a responsive value went flat.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/hourly-forecast-layout.test.js`
Expected: FAIL — `calculateHourlyChartPoints` ignores the fourth argument and the render ids do not exist.

- [ ] **Step 3: Give the chart symmetric padding**

Replace `calculateHourlyChartPoints` in `static/js/weather-components.js`:

```js
function calculateHourlyChartPoints(temperatures, width, height, padding) {
    if (!temperatures.length || width <= 0 || height <= 0) return [];

    const plotHeight = Math.max(height - padding * 2, 0);
    const maxTemp = Math.max(...temperatures);
    const minTemp = Math.min(...temperatures);
    const tempRange = maxTemp - minTemp;
    const columnWidth = width / temperatures.length;

    return temperatures.map((temperature, index) => {
        const ratio = tempRange === 0 ? 0.5 : (maxTemp - temperature) / tempRange;
        return {
            x: columnWidth * (index + 0.5),
            y: padding + ratio * plotHeight
        };
    });
}
```

- [ ] **Step 4: Rewrite the markup**

Replace `HourlyForecastWidget.render()` and delete `setupChartResizeObserver` and `disconnectedCallback` entirely:

```js
const CHART_GEOMETRY = {
    blue: { height: 150, padding: 14 },
    eink: { height: 180, padding: 16 }
};
const CHART_WIDTH = 1000;
const PRECIPITATION_LABEL_FLOOR = 40;
const PRECIPITATION_BAR_SCALE = 0.9;

class HourlyForecastWidget extends WeatherWidget {
    geometry() {
        return this.getAttribute('data-theme') === 'eink'
            ? CHART_GEOMETRY.eink
            : CHART_GEOMETRY.blue;
    }

    render() {
        if (this.config.hourly === false) return;
        const { height } = this.geometry();
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="hourly-widget widget-content">
                <div class="hourly-caption">
                    <span id="hourly-caption-hours">Next 12 hours</span>
                    <span id="hourly-caption-precip"></span>
                </div>

                <div class="chart-container">
                    <div class="precip-bars" id="precip-bars"></div>
                    <svg class="temperature-chart" id="hourly-chart"
                         viewBox="0 0 ${CHART_WIDTH} ${height}"
                         preserveAspectRatio="none">
                        <polyline class="chart-line" id="chart-line" points=""></polyline>
                    </svg>
                    <div class="chart-marker" id="chart-marker" hidden></div>
                </div>

                <div class="hourly-temps" id="hourly-temps"></div>

                <div class="chart-legend">
                    <span class="legend-item">
                        <span class="legend-swatch legend-swatch-line"></span>temperature
                    </span>
                    <span class="legend-item">
                        <span class="legend-swatch legend-swatch-bar"></span>
                        <span id="legend-precip">precipitation chance</span>
                    </span>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }
```

- [ ] **Step 5: Rewrite the update and the draw**

```js
    update() {
        if (!this.data || this.config.hourly === false) return;

        const hours = (this.data.hourly || []).slice(0, HOURLY_CHART_HOURS);
        const window = window.WeatherInsights.precipitationWindow(hours);

        this.shadowRoot.getElementById('hourly-caption-hours').textContent =
            `Next ${hours.length} hours`;
        this.shadowRoot.getElementById('hourly-caption-precip').textContent =
            window ? `${window.noun} ${window.start}–${window.end}` : '';
        this.shadowRoot.getElementById('legend-precip').textContent =
            `${(window?.noun || 'Precipitation').toLowerCase()} chance`;

        this.renderBars(hours);
        this.renderHours(hours);
        this.drawTemperatureChart(hours);

        this.hideError();
        this.hideLoading();
    }

    renderBars(hours) {
        this.shadowRoot.getElementById('precip-bars').innerHTML = hours.map((hour) => {
            const chance = Number.isFinite(hour.rain) ? hour.rain : 0;
            return `
                <div class="precip-cell">
                    <div class="precip-bar"
                         style="height: ${chance * PRECIPITATION_BAR_SCALE}%"></div>
                </div>
            `;
        }).join('');
    }

    renderHours(hours) {
        const container = this.shadowRoot.getElementById('hourly-temps');
        container.innerHTML = '';

        hours.forEach((hour) => {
            const cell = document.createElement('div');
            cell.className = 'hour-temp';
            const chance = Number.isFinite(hour.rain) ? hour.rain : 0;
            cell.innerHTML = `
                <div class="hour-temp-value">${hour.temp}°</div>
            `;

            const timeSpan = document.createElement('div');
            timeSpan.className = 'hour-time';
            timeSpan.textContent = hour.t;
            cell.appendChild(timeSpan);

            const precipSpan = document.createElement('div');
            precipSpan.className = 'hour-precip';
            precipSpan.textContent =
                chance >= PRECIPITATION_LABEL_FLOOR ? `${chance}%` : '';
            cell.appendChild(precipSpan);

            container.appendChild(cell);
        });
    }

    drawTemperatureChart(hours) {
        const { height, padding } = this.geometry();
        const points = calculateHourlyChartPoints(
            hours.map(({ temp }) => temp), CHART_WIDTH, height, padding
        );
        const line = this.shadowRoot.getElementById('chart-line');
        const marker = this.shadowRoot.getElementById('chart-marker');

        line.setAttribute('points', points.map(({ x, y }) => `${x},${y}`).join(' '));

        if (!points.length) {
            marker.hidden = true;
            return;
        }

        marker.style.left = `${(points[0].x / CHART_WIDTH) * 100}%`;
        marker.style.top = `${(points[0].y / height) * 100}%`;
        marker.hidden = false;
    }
}
```

`window` shadows the global inside `update`. Rename the local to `precipWindow` throughout that method to keep `window.WeatherInsights` reachable:

```js
        const precipWindow = window.WeatherInsights.precipitationWindow(hours);
```

and use `precipWindow` in the three lines below it.

Since `render()` bakes the theme into the `viewBox`, and `observeTheme()` sets `data-theme` before `render()` in `connectedCallback`, the geometry is correct on first paint. A later theme change re-renders through `weather-config-changed`, which already calls `render()`.

- [ ] **Step 6: Style the chart**

Replace the hourly block in `static/css/weather-components.css` (lines 168-229) with:

```css
/* Hourly Forecast Widget */
.hourly-widget {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.hourly-caption {
    display: flex;
    justify-content: space-between;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.8;
}

.chart-container {
    position: relative;
    height: 9.375rem;
}

.precip-bars {
    position: absolute;
    inset: 0;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    align-items: end;
    gap: 0;
}

.precip-cell {
    display: flex;
    align-items: flex-end;
    height: 100%;
    padding: 0 3px;
    box-sizing: border-box;
}

.precip-bar {
    width: 100%;
    background: rgba(219, 234, 254, 0.35);
    border-radius: 3px 3px 0 0;
}

.temperature-chart {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.chart-line {
    fill: none;
    stroke: var(--temp-high);
    stroke-width: 3;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
}

.chart-marker {
    position: absolute;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: #ffffff;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
}

.hourly-temps {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    align-items: start;
    gap: 0;
    overflow-x: visible;
}

.hour-temp {
    min-width: 0;
    text-align: center;
}

.hour-temp-value,
.hour-time,
.hour-precip {
    overflow: hidden;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

.hour-temp-value {
    font-size: 0.8125rem;
    font-weight: 700;
}

.hour-time {
    font-size: 0.625rem;
    opacity: 0.75;
}

.hour-precip {
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--temp-low);
}

.chart-legend {
    display: flex;
    gap: 1rem;
    font-size: 0.6875rem;
    opacity: 0.75;
}

.legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
}

.legend-swatch-line {
    width: 0.875rem;
    height: 3px;
    background: var(--temp-high);
}

.legend-swatch-bar {
    width: 0.5rem;
    height: 0.625rem;
    background: rgba(219, 234, 254, 0.35);
}
```

Add the eInk overrides, keeping the existing hour-label and hour-temp clamps intact:

```css
:host([data-theme="eink"]) .hourly-widget {
    background: #ffffff;
    border: 2px solid #000000;
    box-sizing: border-box;
    padding: 0.625rem 0.875rem 0.5rem;
    height: 100%;
    gap: 0.25rem;
}

:host([data-theme="eink"]) .hourly-caption {
    font-size: 0.75rem;
    font-weight: 800;
    opacity: 1;
}

:host([data-theme="eink"]) .chart-container {
    flex: 1;
    height: auto;
}

:host([data-theme="eink"]) .precip-cell { padding: 0 6px; }

:host([data-theme="eink"]) .precip-bar {
    border-radius: 0;
    background: repeating-linear-gradient(
        45deg, #000 0 2px, transparent 2px 6px
    );
}

:host([data-theme="eink"]) .chart-line {
    stroke: #000000;
    stroke-width: 5;
}

:host([data-theme="eink"]) .chart-marker {
    width: 1rem;
    height: 1rem;
    border: 3px solid #000000;
}

:host([data-theme="eink"]) .hour-precip {
    font-size: 0.75rem;
    font-weight: 800;
    color: currentColor;
}

:host([data-theme="eink"]) .chart-legend { display: none; }
```

`.chart-line` currently has three owners: `static/css/weather-components.css:183` and again at `:641` (`stroke-width: 3`), plus `:host([data-theme="eink"]) .chart-line { stroke-width: 6 !important; }` at `:633` and a second copy of that eInk rule inside `WeatherWidget.getSharedStyles()`. Collapse them: delete the `:641` duplicate and both eInk copies, and let the rules written above own the selector outright. The `!important` goes with them — nothing is left to fight.

The hour cell no longer holds an icon, so delete every `.hour-icon` rule: `static/css/weather-components.css:218`, `:775` (`.hour-icon img`) and `:791`, plus the `:host([data-theme="eink"]) .hour-icon img` block in `getSharedStyles()`. `HourlyForecastWidget` was their only consumer; `.day-icon` and `.weather-icon` keep theirs.

The existing eInk clamps for `.hour-time` (`clamp(0.4375rem, 2vw, 1rem)`, weight 800) and `.hour-temp-value` (`clamp(0.5625rem, 2vw, 1rem)`, weight 900) stay exactly as they are; two tests pin them.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/js/hourly-forecast-layout.test.js`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add static/js/weather-components.js static/css/weather-components.css \
    tests/js/hourly-forecast-layout.test.js
git commit -m "feat: align the twelve-hour chart on shared centers"
```

---

### Task 7: Moonrise and moonset

`LunarDataProvider` gains the two times. Location comes in through `raw_data`, the pattern `SolarDataProvider` already uses.

**Files:**
- Modify: `weather_providers.py:2651-2755`, `main.py:913-936` and the fallback payload at `main.py:958-965`
- Test: `tests/unit/test_lunar_provider.py`, `tests/integration/test_api_integration.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `lunar_data['current_phase']['moonrise']` and `['moonset']` — ISO 8601 strings in the location's timezone, or `None`. `LunarDataProvider.process_weather_data(raw_data, location_name, tz_name)` reads optional `raw_data['lat']` and `raw_data['lon']`; both times are `None` when either is absent.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_lunar_provider.py`, inside `TestLunarDataProvider`:

```python
    def test_moon_times_are_none_without_coordinates(self) -> None:
        """Without coordinates the provider reports no rise or set"""
        result = self.provider.process_weather_data({}, 'Test Location')

        assert result is not None
        current_phase = result['lunar_data']['current_phase']
        assert current_phase['moonrise'] is None
        assert current_phase['moonset'] is None

    def test_moonrise_matches_the_almanac_for_chicago(self) -> None:
        """Moonrise for Chicago on 2026-09-02 matches the published time"""
        moonrise, _ = self.provider.calculate_moon_times(
            datetime(2026, 9, 2, tzinfo=timezone.utc),
            41.8781,
            -87.6298,
            'America/Chicago',
        )

        assert moonrise is not None
        assert self._minutes_from(moonrise, ALMANAC_CHICAGO_MOONRISE) <= TOLERANCE

    def test_moonset_matches_the_almanac_for_chicago(self) -> None:
        """Moonset for Chicago on 2026-09-02 matches the published time"""
        _, moonset = self.provider.calculate_moon_times(
            datetime(2026, 9, 2, tzinfo=timezone.utc),
            41.8781,
            -87.6298,
            'America/Chicago',
        )

        assert moonset is not None
        assert self._minutes_from(moonset, ALMANAC_CHICAGO_MOONSET) <= TOLERANCE

    def test_a_day_without_a_moonrise_reports_none(self) -> None:
        """Roughly once a month a calendar day has no moonrise"""
        moonrise, moonset = self.provider.calculate_moon_times(
            NO_MOONRISE_DATE, 41.8781, -87.6298, 'America/Chicago'
        )

        assert moonrise is None
        assert moonset is not None

    def test_high_latitude_day_without_a_crossing(self) -> None:
        """Tromso can go days with the moon always up or always down"""
        moonrise, moonset = self.provider.calculate_moon_times(
            HIGH_LATITUDE_DATE, 69.6492, 18.9553, 'Europe/Oslo'
        )

        assert moonrise is None or moonset is None

    def test_moon_times_carry_the_location_timezone(self) -> None:
        """Times come back in the location's own zone, not UTC"""
        moonrise, _ = self.provider.calculate_moon_times(
            datetime(2026, 9, 2, tzinfo=timezone.utc),
            41.8781,
            -87.6298,
            'America/Chicago',
        )

        assert moonrise is not None
        assert datetime.fromisoformat(moonrise).utcoffset() is not None
        assert datetime.fromisoformat(moonrise).utcoffset() != timedelta(0)

    def test_moon_times_reach_the_payload_with_coordinates(self) -> None:
        """Coordinates in raw_data put the times in current_phase"""
        result = self.provider.process_weather_data(
            {'lat': 41.8781, 'lon': -87.6298}, 'Chicago', 'America/Chicago'
        )

        assert result is not None
        current_phase = result['lunar_data']['current_phase']
        assert 'moonrise' in current_phase
        assert 'moonset' in current_phase

    @staticmethod
    def _minutes_from(iso_time: str, expected: str) -> float:
        actual = datetime.fromisoformat(iso_time)
        target = datetime.fromisoformat(expected)
        return abs((actual - target).total_seconds()) / 60
```

Add at the top of the file, beside the existing constants, with the imports it needs:

```python
from datetime import datetime, timedelta, timezone

TOLERANCE = 5  # minutes; the low-precision series is good to a few tenths of a degree
ALMANAC_CHICAGO_MOONRISE = '2026-09-02T00:00:00-05:00'  # replace with the almanac time
ALMANAC_CHICAGO_MOONSET = '2026-09-02T00:00:00-05:00'  # replace with the almanac time
NO_MOONRISE_DATE = datetime(2026, 9, 1, tzinfo=timezone.utc)  # replace once verified
HIGH_LATITUDE_DATE = datetime(2026, 9, 2, tzinfo=timezone.utc)  # replace once verified
```

**Before writing any implementation, replace those four placeholder values with real published times.** Look them up at timeanddate.com/moon/usa/chicago (and .../norway/tromso), read the moonrise, moonset, and the day marked with no moonrise for that month, and paste them in. The test is the specification: the implementation is correct when it reproduces the almanac, not when it reproduces itself. Never widen `TOLERANCE` to make a test pass — if it needs more than five minutes, the position code is wrong.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --locked pytest tests/unit/test_lunar_provider.py -v`
Expected: FAIL with `AttributeError: 'LunarDataProvider' object has no attribute 'calculate_moon_times'`

- [ ] **Step 3: Add the lunar position math**

In `weather_providers.py`, add the constants to `LunarDataProvider` beside the existing ones:

```python
    MOON_HORIZON_DEGREES = 0.125  # accounts for parallax, refraction, semidiameter
    OBLIQUITY_DEGREES = 23.4397
    J2000 = 2451545.0
    CROSSING_BISECTIONS = 12
```

and the three methods:

```python
    def _moon_equatorial_position(self, julian_day: float) -> tuple[float, float]:
        """Return the moon's right ascension and declination in degrees.

        Low-precision series: the leading term of each of the moon's longitude
        and latitude expansions. Good to a few tenths of a degree, which is a
        few minutes of rise time — enough for a card that reads "rises 3:12pm".
        """
        days = julian_day - self.J2000

        mean_longitude = 218.316 + 13.176396 * days
        mean_anomaly = math.radians(134.963 + 13.064993 * days)
        argument_of_latitude = math.radians(93.272 + 13.229350 * days)

        longitude = math.radians(mean_longitude + 6.289 * math.sin(mean_anomaly))
        latitude = math.radians(5.128 * math.sin(argument_of_latitude))
        obliquity = math.radians(self.OBLIQUITY_DEGREES)

        right_ascension = math.atan2(
            math.sin(longitude) * math.cos(obliquity)
            - math.tan(latitude) * math.sin(obliquity),
            math.cos(longitude),
        )
        declination = math.asin(
            math.sin(latitude) * math.cos(obliquity)
            + math.cos(latitude) * math.sin(obliquity) * math.sin(longitude)
        )
        return math.degrees(right_ascension), math.degrees(declination)

    def _moon_altitude(self, moment: datetime, lat: float, lon: float) -> float:
        """Return the moon's geocentric altitude in degrees at a moment"""
        julian_day = self._to_julian_day(moment.astimezone(timezone.utc))
        right_ascension, declination = self._moon_equatorial_position(julian_day)

        sidereal_time = 280.46061837 + 360.98564736629 * (julian_day - self.J2000)
        hour_angle = math.radians((sidereal_time + lon - right_ascension) % 360)

        lat_rad = math.radians(lat)
        dec_rad = math.radians(declination)
        return math.degrees(
            math.asin(
                math.sin(lat_rad) * math.sin(dec_rad)
                + math.cos(lat_rad) * math.cos(dec_rad) * math.cos(hour_angle)
            )
        )

    def _refine_crossing(
        self,
        local_midnight: datetime,
        hour: int,
        lat: float,
        lon: float,
        rising: bool,
    ) -> str:
        """Bisect one straddling hour down to the crossing minute"""
        low = float(hour)
        high = hour + 1.0

        for _ in range(self.CROSSING_BISECTIONS):
            middle = (low + high) / 2
            altitude = (
                self._moon_altitude(
                    local_midnight + timedelta(hours=middle), lat, lon
                )
                - self.MOON_HORIZON_DEGREES
            )
            if (altitude >= 0) == rising:
                high = middle
            else:
                low = middle

        crossing = local_midnight + timedelta(hours=(low + high) / 2)
        return crossing.replace(second=0, microsecond=0).isoformat()
```

`_to_julian_day` reads the naive date and time fields, so every caller must hand it a UTC datetime — `_moon_altitude` converts before calling. Add `timedelta` to the `datetime` import at the top of the file if it is not already there.

- [ ] **Step 4: Find the crossings across the local day**

```python
    def calculate_moon_times(
        self,
        moment_utc: datetime,
        lat: float,
        lon: float,
        tz_name: str | None = None,
    ) -> tuple[str | None, str | None]:
        """Return the local day's moonrise and moonset as ISO strings or None.

        A calendar day with no crossing is ordinary: the moon rises about fifty
        minutes later each day, so roughly once a month a day has no moonrise.
        """
        try:
            import zoneinfo

            local_zone = zoneinfo.ZoneInfo(tz_name) if tz_name else timezone.utc
        except Exception:
            local_zone = timezone.utc

        local_midnight = moment_utc.astimezone(local_zone).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        altitudes = [
            self._moon_altitude(local_midnight + timedelta(hours=hour), lat, lon)
            - self.MOON_HORIZON_DEGREES
            for hour in range(25)
        ]

        moonrise = None
        moonset = None
        for hour in range(24):
            below, above = altitudes[hour], altitudes[hour + 1]
            if below < 0 <= above and moonrise is None:
                moonrise = self._refine_crossing(
                    local_midnight, hour, lat, lon, rising=True
                )
            elif below >= 0 > above and moonset is None:
                moonset = self._refine_crossing(
                    local_midnight, hour, lat, lon, rising=False
                )

        return moonrise, moonset
```

- [ ] **Step 5: Put the times in the payload**

Change `_calculate_lunar_data` to take the location and add the two keys:

```python
    def _calculate_lunar_data(
        self,
        now_utc: datetime,
        lat: float | None = None,
        lon: float | None = None,
        tz_name: str | None = None,
    ) -> dict:
```

and inside it, before the return:

```python
        moonrise, moonset = (None, None)
        if lat is not None and lon is not None:
            moonrise, moonset = self.calculate_moon_times(now_utc, lat, lon, tz_name)
```

then add to the `current_phase` dict:

```python
                'moonrise': moonrise,
                'moonset': moonset,
```

and change the call in `process_weather_data`:

```python
            lunar_data = self._calculate_lunar_data(
                now_utc,
                raw_data.get('lat'),
                raw_data.get('lon'),
                tz_name,
            )
```

Drop the `# noqa: ARG002` on that method's `raw_data` parameter — it is used now.

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `uv run --locked pytest tests/unit/test_lunar_provider.py -v`
Expected: PASS, including both almanac comparisons within five minutes.

- [ ] **Step 7: Write the failing route test**

Append to `tests/integration/test_api_integration.py`:

```python
def test_lunar_endpoint_carries_moon_times(client) -> None:
    """The lunar endpoint reports moonrise and moonset for the requested point"""
    response = client.get('/api/lunar?lat=41.8781&lon=-87.6298&location=Chicago')

    assert response.status_code == 200
    current_phase = response.get_json()['lunar_data']['current_phase']
    assert 'moonrise' in current_phase
    assert 'moonset' in current_phase


def test_lunar_cache_separates_locations(client) -> None:
    """Two points do not share one cached moonrise"""
    chicago = client.get('/api/lunar?lat=41.8781&lon=-87.6298&location=Chicago')
    tromso = client.get('/api/lunar?lat=69.6492&lon=18.9553&location=Tromso')

    assert chicago.status_code == 200
    assert tromso.status_code == 200
    assert (
        chicago.get_json()['lunar_data']['current_phase']['moonrise']
        != tromso.get_json()['lunar_data']['current_phase']['moonrise']
    )
```

Match the fixture name the file already uses for the Flask test client; if it differs from `client`, use that name.

- [ ] **Step 8: Run the route test to verify it fails**

Run: `uv run --locked pytest tests/integration/test_api_integration.py -k lunar -v`
Expected: FAIL — both locations return the same cached payload with `moonrise` absent.

- [ ] **Step 9: Pass coordinates through the route**

In `main.py`, in `lunar_data_api`, put the coordinates in the cache key and the ETag:

```python
        current_hour = int(time.time() // 3600)
        cache_key = f'lunar_{lat}_{lon}_{current_hour}'
```

```python
            etag_value = hash(f'{lat}{lon}{current_hour}')
```

in both the hit and miss branches, and pass them to the provider:

```python
        lunar_data = lunar_provider.process_weather_data(
            {'lat': lat, 'lon': lon}, location_name, tz_name
        )
```

Add the two keys to the error fallback payload's `current_phase` so the shape never changes:

```python
                    'description': 'Unable to calculate moon phase',
                    'moonrise': None,
                    'moonset': None,
```

- [ ] **Step 10: Run the route test to verify it passes**

Run: `uv run --locked pytest tests/integration/test_api_integration.py -k lunar -v`
Expected: PASS

- [ ] **Step 11: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add weather_providers.py main.py tests/unit/test_lunar_provider.py \
    tests/integration/test_api_integration.py
git commit -m "feat: compute moonrise and moonset for the location"
```

---

### Task 8: The Sun and Moon cards

Two compact cards replacing the arc widget and the phase panel, with the sun card's night state.

**Files:**
- Modify: `static/js/weather-components.js` (`SolarProgressWidget` render path, `MoonPhaseWidget` render path and export), `static/css/weather-components.css`
- Create: `tests/js/sky-pair.test.js`
- Modify: `tests/unit/test_frontend_javascript.py`, `tests/js/current-weather-range.test.js`

**Interfaces:**
- Consumes: `current_phase.moonrise` from Task 7; `.sky-pair` from Task 3.
- Produces: `SolarProgressWidget.renderSolarData(solarData)` renders the card into `#solar-content`; `SolarProgressWidget.sunHeading(solarData, sunMap, now)` returns `{heading, detail, progress}`; `MoonPhaseWidget` is exported on `module.exports`. Both cards read `--card-bg` and `--card-border`.

- [ ] **Step 1: Write the failing tests**

Create `tests/js/sky-pair.test.js`:

```js
// ABOUTME: Tests the Sun and Moon cards in their day, night, and missing-data states.
// ABOUTME: Runs the production components with Node's dependency-free test runner.

const assert = require('node:assert/strict');
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
    MoonPhaseWidget,
    SolarProgressWidget
} = require('../../static/js/weather-components.js');

const SOLAR = {
    times: {
        sunrise: '2026-09-02T06:22:00-05:00',
        sunset: '2026-09-02T16:31:00-05:00'
    },
    daylight: { progress: 0.72, is_daylight: true }
};

const SUN_MAP = {
    '2026-09-02': {
        sunrise: '2026-09-02T06:22:00-05:00',
        sunset: '2026-09-02T16:31:00-05:00'
    },
    '2026-09-03': {
        sunrise: '2026-09-03T06:23:00-05:00',
        sunset: '2026-09-03T16:29:00-05:00'
    }
};

const sunWidget = () => Object.create(SolarProgressWidget.prototype);

test('daytime counts down to sunset', () => {
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR, SUN_MAP, new Date('2026-09-02T13:40:00-05:00')
    );

    assert.equal(state.heading, 'Sets 4:31pm');
    assert.equal(state.detail, '2h 51m of daylight left');
    assert.equal(state.progress, 0.72);
});

test('after sunset the card counts up to tomorrow morning', () => {
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR, SUN_MAP, new Date('2026-09-02T21:00:00-05:00')
    );

    assert.equal(state.heading, 'Sunrise 6:23am');
    assert.equal(state.detail, '9h 23m until sunrise');
    assert.equal(state.progress, 1);
});

test('the duration never renders negative', () => {
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR, SUN_MAP, new Date('2026-09-02T16:32:00-05:00')
    );

    assert.doesNotMatch(state.detail, /-/);
    assert.match(state.heading, /^Sunrise /);
});

test('a missing tomorrow drops the heading time and the duration', () => {
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR, {}, new Date('2026-09-02T21:00:00-05:00')
    );

    assert.equal(state.heading, 'Sunrise');
    assert.equal(state.detail, '');
    assert.equal(state.progress, 1);
});

test('the sun card renders its heading, track, and detail', () => {
    const content = {
        classList: { contains: () => false, remove() {} },
        innerHTML: ''
    };
    const widget = sunWidget();
    widget.shadowRoot = { getElementById: () => content };
    widget.sunMap = SUN_MAP;

    widget.renderSolarData(SOLAR);

    assert.match(content.innerHTML, /class="sky-card sky-card-sun"/);
    assert.match(content.innerHTML, /class="sky-track-fill"/);
    assert.doesNotMatch(content.innerHTML, /progress-arc/);
});

test('the moon card names the phase, illumination, and moonrise', () => {
    const widget = Object.create(MoonPhaseWidget.prototype);
    widget.lunarData = {
        current_phase: {
            name: 'Waxing Gibbous',
            illumination_percent: 72,
            moonrise: '2026-09-02T15:12:00-05:00'
        }
    };

    const html = widget.moonCard();

    assert.match(html, /Waxing Gibbous/);
    assert.match(html, /72% lit · rises 3:12pm/);
});

test('a day with no moonrise keeps the rest of the moon card', () => {
    const widget = Object.create(MoonPhaseWidget.prototype);
    widget.lunarData = {
        current_phase: {
            name: 'Waning Crescent',
            illumination_percent: 18,
            moonrise: null
        }
    };

    const html = widget.moonCard();

    assert.match(html, /Waning Crescent/);
    assert.match(html, /18% lit/);
    assert.doesNotMatch(html, /rises/);
});
```

Register it in `tests/unit/test_frontend_javascript.py`:

```python
        'sky-pair.test.js',
```

Update the two solar assertions in `tests/js/current-weather-range.test.js`: `solar widget uses a block host so its card cannot widen the page` stays; `solar data replaces the loading layout before rendering its content` changes its final assertion from `/progress-arc-container/` to `/sky-card/`, and its widget needs `widget.sunMap = {};` set before the call.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/sky-pair.test.js`
Expected: FAIL — `widget.sunHeading is not a function`.

- [ ] **Step 3: Give the sun card its two states**

In `SolarProgressWidget`, add the shared formatters and the state function:

```js
    formatCardTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '';
        return date
            .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            .replace(' ', '')
            .toLowerCase();
    }

    formatSpan(milliseconds) {
        if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '';
        const totalMinutes = Math.round(milliseconds / 60000);
        return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    }

    sunHeading(solarData, sunMap, now) {
        const sunset = new Date(solarData?.times?.sunset);
        const beforeSunset = !Number.isNaN(sunset.getTime()) && now < sunset;

        if (beforeSunset) {
            return {
                heading: `Sets ${this.formatCardTime(solarData.times.sunset)}`,
                detail: `${this.formatSpan(sunset - now)} of daylight left`,
                progress: solarData?.daylight?.progress ?? 0
            };
        }

        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const key = `${tomorrow.getFullYear()}-`
            + `${String(tomorrow.getMonth() + 1).padStart(2, '0')}-`
            + `${String(tomorrow.getDate()).padStart(2, '0')}`;
        const sunrise = new Date((sunMap || {})[key]?.sunrise);

        if (Number.isNaN(sunrise.getTime())) {
            return { heading: 'Sunrise', detail: '', progress: 1 };
        }

        const span = this.formatSpan(sunrise - now);
        return {
            heading: `Sunrise ${this.formatCardTime(sunrise.toISOString())}`,
            detail: span ? `${span} until sunrise` : '',
            progress: 1
        };
    }
```

`formatCardTime` takes an ISO string, so the sunrise branch round-trips through `toISOString()`; the resulting UTC instant renders in the viewer's zone, which is the display zone for every other time on the page.

- [ ] **Step 4: Replace the arc with the card**

Replace the body of `renderSolarData` — everything after `content.classList.remove('loading-state')` — with:

```js
        const state = this.sunHeading(solarData, this.sunMap, new Date());

        content.innerHTML = `
            <div class="sky-card sky-card-sun">
                <div class="sky-caption">Sun</div>
                <div class="sky-heading">${state.heading}</div>
                <div class="sky-track">
                    <div class="sky-track-fill"
                         style="width: ${Math.round(state.progress * 100)}%"></div>
                </div>
                <div class="sky-detail">${state.detail}</div>
            </div>
        `;
```

Delete `calculateDaylightDuration`, the golden-hour and blue-hour period logic, and the arc markup along with its `.progress-arc*`, `.arc-*`, `.sun-position`, `.solar-times`, `.time-item`, `.time-label`, `.time-value`, `.solar-status`, `.status-text` and `.elevation-text` styles in the widget's own `<style>` block. `formatTime` stays; the loading and error states stay.

Subscribe to the weather payload so the night state has tomorrow's sunrise. In `connectedCallback`, after `this.fetchSolarData()`:

```js
        this.sunMap = {};
        document.addEventListener('weather-data-updated', (event) => {
            this.sunMap = event.detail?.sun || {};
            if (this.solarData) this.renderSolarData(this.solarData);
        });
```

and set `this.solarData = solarData;` as the first line of `renderSolarData`. The card reads the `sun` map that already rides on every weather update; it adds no request.

- [ ] **Step 5: Replace the moon panel with the card**

In `MoonPhaseWidget`, add:

```js
    moonCard() {
        const phase = this.lunarData?.current_phase || {};
        const illumination = Math.round(phase.illumination_percent ?? 0);
        const rise = phase.moonrise
            ? ` · rises ${this.formatCardTime(phase.moonrise)}`
            : '';

        return `
            <div class="sky-card sky-card-moon">
                <div class="sky-caption">Moon</div>
                <div class="sky-heading">${phase.name || ''}</div>
                <div class="moon-disc" style="background: linear-gradient(90deg,
                    #fff 0 ${illumination}%,
                    rgba(255, 255, 255, 0.2) ${illumination}%)"></div>
                <div class="sky-detail">${illumination}% lit${rise}</div>
            </div>
        `;
    }

    formatCardTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '';
        return date
            .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            .replace(' ', '')
            .toLowerCase();
    }
```

Replace the widget's data branch in `render()` — the block that builds `renderMoonSVG()`, the phase name, illumination and lunar age — with `${this.moonCard()}`, and delete `renderMoonSVG` and its `.moon-*` styles apart from the new `.moon-disc`. Keep the loading and error branches.

Export the class beside the solar one:

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports.MoonPhaseWidget = MoonPhaseWidget;
}
```

- [ ] **Step 6: Style both cards**

Append to `static/css/weather-components.css`:

```css
/* Sun and Moon cards */
.sky-card {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.875rem;
    border-radius: 0.875rem;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    box-sizing: border-box;
}

.sky-caption {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
}

.sky-heading {
    font-size: 1.25rem;
    font-weight: 600;
}

.sky-track {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;
}

.sky-track-fill {
    height: 100%;
    background: var(--temp-high);
}

.sky-detail {
    font-size: 0.75rem;
    opacity: 0.8;
}

.moon-disc {
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 50%;
}

:host([data-theme="eink"]) .sky-card {
    background: transparent;
    border: 0;
    padding: 0;
    gap: 0.125rem;
    font-size: 0.875rem;
    font-weight: 800;
    line-height: 1.25;
}

:host([data-theme="eink"]) .sky-caption,
:host([data-theme="eink"]) .sky-track,
:host([data-theme="eink"]) .moon-disc {
    display: none;
}

:host([data-theme="eink"]) .sky-heading,
:host([data-theme="eink"]) .sky-detail {
    font-size: 0.875rem;
    font-weight: 800;
    opacity: 1;
}
```

In eInk the sun card prints its two lines and the moon card its one, right-aligned by `.sky-pair`, with no chrome — which is what 2b shows.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/js/sky-pair.test.js && node --test tests/js/current-weather-range.test.js`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add static/js/weather-components.js static/css/weather-components.css \
    tests/js/sky-pair.test.js tests/js/current-weather-range.test.js \
    tests/unit/test_frontend_javascript.py
git commit -m "feat: pair compact sun and moon cards"
```

---

### Task 9: Ship it

Bump the caches, record what future readers need, and check the real thing in a real browser.

**Files:**
- Modify: `static/sw.js`, `gotchas.md`
- Test: `tests/js/current-weather-range.test.js`

**Interfaces:**
- Consumes: every earlier task.
- Produces: cache names at `v5`; three new gotchas entries.

- [ ] **Step 1: Write the failing test**

Append to `tests/js/current-weather-range.test.js`:

```js
test('the service worker precaches every shipped asset under one cache version', () => {
    const worker = fs.readFileSync(
        path.join(__dirname, '../../static/sw.js'),
        'utf8'
    );
    const cacheVersions = [...worker.matchAll(/weather-dashboard[\w-]*-?v(\d+)/g)]
        .map(([, version]) => version);

    assert.equal(new Set(cacheVersions).size, 1);
    assert.match(worker, /'\/static\/js\/weather-insights\.js'/);
    assert.match(worker, /'\/static\/js\/dashboard-config\.js'/);
    assert.match(worker, /'\/static\/js\/weather-components\.js'/);
    assert.match(worker, /'\/static\/css\/weather-components\.css'/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/js/current-weather-range.test.js`
Expected: PASS on the file list, FAIL nothing yet — the versions already match at v4. This test is a regression guard, not a driver; confirm it passes before the bump and after.

- [ ] **Step 3: Bump both cache names**

In `static/sw.js`:

```js
const CACHE_NAME = 'weather-dashboard-v5';
const STATIC_CACHE_NAME = 'weather-dashboard-static-v5';
```

Cache-first clients keep the prior release otherwise, and every shipped asset changed.

- [ ] **Step 4: Record the gotchas**

Append to `gotchas.md`:

```markdown
- `.weather-container` is a flex column and its `gap` is the only owner of space between blocks. Widget wrappers carry no `margin-bottom`; adding one double-spaces the page.
- `.stat-band` is `display: contents` in blue and light so `order` composes the phone layout, and a bordered flex box in eInk. `.sky-pair` is a grid in every theme — giving it `display: contents` would strip its `order` and its columns.
- The hourly chart is a fixed `viewBox="0 0 1000 H"` with `preserveAspectRatio="none"`. Do not reintroduce `getBoundingClientRect` or a resize observer, and never put a circle in that SVG: the two axes scale differently, so it renders as an ellipse. The current-hour marker is a positioned HTML element.
- Precipitation bar columns carry no grid gap; the visual gap is inset padding on the cell. A grid gap walks the column centers away from the evenly divided SVG width.
- The lunar cache key includes latitude and longitude. Moonrise is location-dependent, and the old hour-only key served one city's moonrise to every other.
```

- [ ] **Step 5: Run the full suite**

Run: `uv run --locked pytest tests`
Expected: PASS

- [ ] **Step 6: Check it in a real browser**

Start the app, then drive `agent-browser` against it. Start with `agent-browser skills get core`. Real data, no mocks. For each check, take a screenshot and read it:

```bash
agent-browser set viewport 390 844
agent-browser open 'http://localhost:5000/?lat=41.8781&lon=-87.6298&location=Chicago'
agent-browser screenshot --full
agent-browser eval 'document.documentElement.scrollWidth > document.documentElement.clientWidth'
```

Confirm at each size:

1. **Blue at 390x844 and 1280x800** — the 1a sequence reads temperature, alerts, insight, hours, sun and moon, seven-day. `scrollWidth > clientWidth` is `false` at both.
2. **eInk at 800x480** (`?theme=eink`) — the whole 2b composition fits the frame with no page scroll, the stat band holds temperature, text and bars side by side with the sky pair right, and the seven-day strip is absent.
3. **eInk at 320x480** — the stat band and the hour labels stay legible, nothing overflows horizontally.
4. **Light at 390x844** (`?theme=light`) — surfaces and the high and low colors are the substituted tokens, not the blue ones.
5. **`?widgets=radar,pressure,timeline` at 390x844** — the opt-in widgets are evenly spaced. Flex items do not collapse margins, so if any inner margin survived Task 3 it shows here as a doubled gap.

Fix anything these turn up before committing. If a check fails for a reason the plan did not anticipate, stop and say so rather than adjusting the check.

- [ ] **Step 7: Commit**

```bash
git add static/sw.js gotchas.md tests/js/current-weather-range.test.js
git commit -m "chore: bump the service worker for the redesign"
```

- [ ] **Step 8: Open the pull request**

```bash
git push -u origin dashboard-redesign
gh pr create --title "Redesign the dashboard around one glance" --body "$(cat <<'BODY'
Applies the approved 1a phone and 2b eInk treatments from
docs/superpowers/specs/2026-09-02-dashboard-redesign-design.md.

- Widget defaults become theme-aware; the seven-day strip is off on eInk and
  every detail widget is opt-in.
- New rule-based insight sentence and eInk fact strip, computed client-side.
- Current conditions lead with type and a three-temperature module.
- One aligned twelve-hour chart: precipitation bars, temperature line, and
  hour labels on shared centers.
- LunarProvider computes moonrise and moonset for the requested location.

Three departures from the spec, each explained in the plan's opening section:
`.sky-pair` is a grid rather than `display: contents`, the alerts fix targets
the loading state rather than the zero-alert state, and moonrise needs two
lines in the lunar route.
BODY
)"
```

---

## Self-Review

**Spec coverage.** Composition → Task 3. Widget catalog table → Task 1. Alerts → Task 3. Screen 1a header, temperature block, hero scale, three-temperature module, insight card → Tasks 4 and 5. Next 12 hours, chart geometry, hour grid, legend → Task 6. Sun and Moon cards including the post-sunset state → Task 8. Light theme → Task 3 tokens, verified in Task 9. Screen 2b stat band, hours card, footer facts → Tasks 3, 4, 5, 6. Insights rules table → Task 2. Moonrise → Task 7. Data flow → unchanged, plus the one `weather-data-updated` listener the sun card's night state needs. Failure-handling table → every row has a test: rows 1-2 and 9-10 in Tasks 5 and 8, rows 3-5 and 7 in Task 6, row 6 in Task 4, row 8 in Tasks 7 and 8, row 12 in Task 3, rows 11 and 13 unchanged behavior. Testing → Tasks 1-8. Service worker → Task 9.

**Two spec items deliberately not implemented as written**, both explained at the top: `.sky-pair` cannot be `display: contents` and take an order, and `weather-alerts` already hides at zero alerts. A third, the two lines in `main.py`, extends the spec's stated backend scope because moonrise cannot work without them.

**Type consistency.** `calculateHourlyChartPoints(temperatures, width, height, padding)` is defined in Task 6 and called only there. `insightSentence`, `insightFacts`, `insightFragments`, `precipitationWindow`, `precipitationNoun`, `wetBulbPosition`, `wetBulbClause` and `calculateWetbulbTemp` are defined in Task 2 and consumed in Tasks 4, 5 and 6 under those exact names. `HOURLY_CHART_HOURS` is defined in Task 4 and used in Task 6 — Task 6 must not redefine it. `calculate_moon_times(moment_utc, lat, lon, tz_name)` is defined and consumed in Task 7. `sunHeading(solarData, sunMap, now)` and `moonCard()` are defined and consumed in Task 8. `formatCardTime` is defined separately on both widget classes because they share no base class.

**Four assertions in the existing suite change, each deliberately.** Task 5 drops the `.temp-display` and `.weather-details` assertions from `eInk keeps strong type with compact page and component spacing` because it deletes those rules. Task 6 replaces the `.chart-container` clamp with the spec's flat 150px and drops the `<weather-icon` assertion from the escaping test, keeping the escaping guard itself. No other existing assertion is weakened; where a test is deleted outright — the resize-observer lifecycle, the two eInk detail-grid tests — the plan names what replaces its intent.

**One placeholder is deliberate and marked.** Task 7 Step 1 ships four almanac constants as placeholders with an explicit instruction to replace them with published times before writing any implementation. Writing celestial coordinates from memory would be inventing technical details; the almanac lookup is the honest version, and the tolerance is stated at five minutes with an instruction never to widen it.
