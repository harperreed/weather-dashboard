// ABOUTME: Unit tests for formatting today's high and low temperatures.
// ABOUTME: Runs the production JavaScript with Node's dependency-free test runner.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, after } = require('node:test');

global.HTMLElement = class {
    attachShadow() {
        this.shadowRoot = { innerHTML: '', getElementById: () => null };
        return this.shadowRoot;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };

const {
    CurrentWeatherWidget,
    formatDailyTemperatureRange,
    SolarProgressWidget
} = require('../../static/js/weather-components.js');

// Always build a CurrentWeatherWidget through this factory, never with
// `new CurrentWeatherWidget()` directly. render() starts a 60s clock
// interval, and a widget built outside this factory never gets it cleared —
// that leaves a live interval pinning the process, so node --test hangs the
// whole file instead of exiting, no matter how the tests themselves score.
// The factory tracks every instance this file constructs so a single
// after() hook below can clear all of them.
const createdCurrentWidgets = [];
function createCurrentWidget() {
    const widget = new CurrentWeatherWidget();
    createdCurrentWidgets.push(widget);
    return widget;
}

after(() => {
    createdCurrentWidgets.forEach((widget) => clearInterval(widget.clockTimer));
});

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

    const widget = createCurrentWidget();
    widget.shadowRoot.getElementById = (id) => elements[id];
    widget.getAttribute = () => theme;
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    widget.data = { current, daily: [{ h: 50, l: 30 }], location: 'Chicago' };
    return { widget, elements };
}

test('renders the header, temperature block, and three-temperature module', () => {
    const widget = createCurrentWidget();
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

test('shows a complete daily range and clears it when later data is missing', () => {
    const attributes = new Map();
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
    const widget = createCurrentWidget();
    widget.shadowRoot.getElementById = (id) => elements[id];
    widget.getAttribute = () => 'blue';
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    widget.data = {
        current: {
            temperature: 70,
            feels_like: 69,
            summary: 'Clear',
            precipitation_rate: 0,
            precipitation_prob: 0
        },
        daily: [{ h: 77, l: 65 }]
    };

    widget.update();

    assert.equal(elements['daily-high'].textContent, '77°');
    assert.equal(elements['daily-low'].textContent, '65°');
    assert.equal(attributes.get('aria-label'), "Today's high 77 degrees, low 65 degrees.");
    assert.equal(elements['daily-range'].hidden, false);

    widget.data.daily = [];
    widget.update();

    assert.equal(elements['daily-high'].textContent, '');
    assert.equal(elements['daily-low'].textContent, '');
    assert.equal(attributes.has('aria-label'), false);
    assert.equal(elements['daily-range'].hidden, true);
});

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

    // The track runs from feels-like (94) at 0% to air (88) at 100%. Wet
    // bulb 77 sits past the air end of that track, so it clamps to 100%.
    assert.equal(elements['scale-fill'].style.width, '100%');
    assert.equal(elements['scale-dot-wet'].style.left, '100%');
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

test('formats today\'s high and low', () => {
    assert.deepEqual(
        formatDailyTemperatureRange([{ h: 77, l: 65 }]),
        {
            high: 77,
            low: 65,
            text: 'HIGH 77° LOW 65°',
            ariaLabel: "Today's high 77 degrees, low 65 degrees."
        }
    );
});

test('keeps zero and negative temperatures', () => {
    assert.deepEqual(
        formatDailyTemperatureRange([{ h: 0, l: -12 }]),
        {
            high: 0,
            low: -12,
            text: 'HIGH 0° LOW -12°',
            ariaLabel: "Today's high 0 degrees, low -12 degrees."
        }
    );
});

test('daily range has primary contrast and stable numerals', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.daily-range\s*\{[^}]*opacity:\s*1;/s);
    assert.match(styles, /\.daily-range\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\)[^{]*\.daily-range-value\s*\{[^}]*color:\s*currentColor;/s);
});

test('daily range items use the theme surface token', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.daily-range-item\s*\{[^}]*background:\s*var\(--daily-range-surface\);/s);
});

test('help content uses theme tokens instead of hard-coded contrast colors', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const helpSource = components.slice(
        components.indexOf('class HelpSection'),
        components.indexOf('/**\n * Pressure Trends Widget')
    );

    assert.match(helpSource, /\.help-toggle\s*\{[^}]*background:\s*var\(--help-surface\);/s);
    assert.match(helpSource, /\.help-content\s*\{[^}]*background:\s*var\(--help-surface\);/s);
    assert.match(helpSource, /\.param-name\s*\{[^}]*color:\s*var\(--help-param-color\);/s);
    assert.match(helpSource, /\.param-example\s*\{[^}]*color:\s*var\(--help-example-color\);/s);
    assert.doesNotMatch(helpSource, /#fbbf24|#86efac/i);
});

test('canonical themes define range and help contrast tokens', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    [':root', '[data-theme="light"]', '[data-theme="eink"]'].forEach((selector) => {
        const escapedSelector = selector.replace(/[\[\]]/g, '\\$&');
        const themeBlock = new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's');
        const block = template.match(themeBlock)?.[0] || '';

        ['--daily-range-surface', '--help-surface', '--help-param-color', '--help-example-color']
            .forEach((token) => {
                assert.match(block, new RegExp(`${token}:`), `${selector} is missing ${token}`);
            });
    });
});

test('solar widget uses a block host so its card cannot widen the page', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const solarSource = components.slice(
        components.indexOf('class SolarProgressWidget'),
        components.indexOf('// Enhanced Temperature Trends Widget')
    );

    assert.match(solarSource, /:host\s*\{\s*display:\s*block;/s);
});

test('solar data replaces the loading layout before rendering its content', () => {
    const classNames = new Set(['loading-state']);
    const solarContent = {
        classList: {
            contains(name) { return classNames.has(name); },
            remove(name) { classNames.delete(name); }
        },
        innerHTML: ''
    };
    const widget = new SolarProgressWidget();
    widget.shadowRoot.getElementById = (id) => (
        id === 'solar-content' ? solarContent : null
    );
    widget.sunMap = {};

    widget.renderSolarData({});

    assert.equal(solarContent.classList.contains('loading-state'), false);
    assert.match(solarContent.innerHTML, /sky-card/);
});

test('manual harness starts with ABOUTME documentation', () => {
    const harness = fs.readFileSync(
        path.join(__dirname, '../../test_components.html'),
        'utf8'
    );

    assert.match(harness, /^<!DOCTYPE html>\s*\n<!-- ABOUTME: .+ -->\s*\n<!-- ABOUTME: .+ -->/);
});

test('returns null for incomplete or non-numeric ranges', () => {
    const invalidDailyData = [
        undefined,
        [],
        [{}],
        [{ h: 77 }],
        [{ l: 65 }],
        [{ h: '77', l: 65 }],
        [{ h: 77, l: Number.NaN }],
        [{ h: Number.POSITIVE_INFINITY, l: 65 }],
        [{ h: 77, l: Number.NEGATIVE_INFINITY }]
    ];

    invalidDailyData.forEach((daily) => {
        assert.equal(formatDailyTemperatureRange(daily), null);
    });
});

test('eInk page uses the full layout width with an 8px gutter', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const containerRule = template.match(
        /\[data-theme="eink"\] \.weather-container\s*\{[^}]*\}/s
    )?.[0] || '';

    assert.match(containerRule, /max-width:\s*none;/);
    assert.match(containerRule, /width:\s*100%;/);
    assert.match(containerRule, /padding:\s*0\.5rem;/);
    assert.match(containerRule, /box-sizing:\s*border-box;/);
    assert.doesNotMatch(containerRule, /100vw/);
    assert.doesNotMatch(
        template,
        /@media \(max-width: 390px\)[\s\S]*?\[data-theme="eink"\] \.weather-container/
    );
});

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

test('every widget in the container has an explicit flex order', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const container = template.match(
        /<div class="weather-container">([\s\S]*?)\n    <\/div>/
    )?.[1] ?? '';
    // .sky-pair is a grid; its children are grid items, not flex items of
    // the container, so they take no part in this ordering.
    const flexItems = container.replace(
        /<div class="sky-pair">[\s\S]*?<\/div>/,
        ''
    );
    const tags = [...new Set(
        [...flexItems.matchAll(/<([a-z]+(?:-[a-z]+)+)>/g)].map(([, tag]) => tag)
    )];

    // A child with no order falls to the flex default of 0 and jumps the hero.
    const css = template.replace(/\/\*[\s\S]*?\*\//g, '');
    const ordered = new Set();
    for (const [, selectors] of css.matchAll(
        /([^{}]+)\{[^}]*(?:^|[\s;{])order:[^}]*\}/g
    )) {
        selectors.split(',').forEach((selector) => {
            ordered.add(selector.trim().replace(/^\[data-theme="\w+"\]\s*/, ''));
        });
    }

    assert.ok(tags.length >= 13, `found only ${tags.length} container tags`);
    tags.forEach((tag) => {
        assert.ok(ordered.has(tag), `${tag} has no explicit flex order`);
    });
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
    // .solar-widget and .moon-phase-widget live in weather-components.js's
    // inline <style> blocks, not the shared stylesheet, so both sources are
    // searched. margin(-bottom)? also catches .solar-widget's shorthand
    // `margin: 1rem 0`, which sets a top AND bottom margin.
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    ) + fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );

    ['.current-widget', '.hourly-widget', '.daily-widget', '.timeline-widget', '.solar-widget', '.moon-phase-widget']
        .forEach((selector) => {
            const rule = styles.match(
                new RegExp(`\\${selector}\\s*\\{[^}]*\\}`, 's')
            )?.[0] || '';
            assert.doesNotMatch(rule, /margin(-bottom)?:/, selector);
        });
});

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
