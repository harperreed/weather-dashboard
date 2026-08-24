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
    formatDailyTemperatureRange
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
