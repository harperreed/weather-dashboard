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
