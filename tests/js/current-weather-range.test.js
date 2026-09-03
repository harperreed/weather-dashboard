// ABOUTME: Unit tests for formatting today's high and low temperatures.
// ABOUTME: Runs the production JavaScript with Node's dependency-free test runner.

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
    CurrentWeatherWidget,
    formatDailyTemperatureRange,
    SolarProgressWidget
} = require('../../static/js/weather-components.js');

test('renders a hidden daily range beneath the current temperature', () => {
    const widget = new CurrentWeatherWidget();
    widget.style = {};

    widget.render();

    assert.match(widget.shadowRoot.innerHTML, /<div class="current-temperature">\s*<div class="temp-display">[\s\S]*?<\/div>\s*<div class="daily-range" id="daily-range" hidden>\s*<span class="daily-range-item daily-range-high">\s*<span class="daily-range-label">High<\/span>\s*<span class="daily-range-value" id="daily-high">--°<\/span>\s*<\/span>\s*<span class="daily-range-item daily-range-low">\s*<span class="daily-range-label">Low<\/span>\s*<span class="daily-range-value" id="daily-low">--°<\/span>\s*<\/span>\s*<\/div>\s*<\/div>\s*<div class="feels-like"/);
});

test('shows a complete daily range and clears it when later data is missing', () => {
    const attributes = new Map();
    const elements = {
        temp: { textContent: '' },
        icon: { innerHTML: '' },
        'feels-like': { textContent: '' },
        summary: { textContent: '' },
        humidity: { textContent: '' },
        wind: { textContent: '' },
        uv: { textContent: '' },
        rain: { textContent: '', style: {} },
        'daily-range': {
            hidden: true,
            setAttribute(name, value) {
                attributes.set(name, value);
            },
            removeAttribute(name) {
                attributes.delete(name);
            }
        },
        'daily-high': { textContent: '' },
        'daily-low': { textContent: '' }
    };
    const widget = new CurrentWeatherWidget();
    widget.shadowRoot.getElementById = (id) => elements[id];
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    widget.data = {
        current: {
            temperature: 70,
            icon: 'clear-day',
            feels_like: 69,
            summary: 'Clear',
            humidity: 45,
            wind_speed: 8,
            uv_index: 4,
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

test('eInk current weather keeps detail cards inside a mobile grid', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(
        styles,
        /@media \(max-width: 640px\)\s*\{[\s\S]*?:host\(\[data-theme="eink"\]\) \.weather-details\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)(?: !important)?;/s
    );
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

    widget.renderSolarData({});

    assert.equal(solarContent.classList.contains('loading-state'), false);
    assert.match(solarContent.innerHTML, /progress-arc-container/);
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

test('eInk summary owns one compact gap before the detail cards', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );

    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.summary\s*\{[^}]*margin-bottom:\s*0\.5rem;/s
    );
    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.weather-details\s*\{[^}]*margin-top:\s*0;/s
    );
    assert.doesNotMatch(
        components,
        /:host\(\[data-theme="eink"\]\) \.summary\s*\{/
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

    assert.ok(tags.length >= 11, `found only ${tags.length} container tags`);
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
