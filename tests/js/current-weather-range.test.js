// ABOUTME: Unit tests for formatting today's high and low temperatures.
// ABOUTME: Runs the production JavaScript with Node's dependency-free test runner.

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
    CurrentWeatherWidget,
    formatDailyTemperatureRange
} = require('../../static/js/weather-components.js');

test('renders a hidden daily range beneath the current temperature', () => {
    const widget = new CurrentWeatherWidget();
    widget.style = {};

    widget.render();

    assert.match(widget.shadowRoot.innerHTML, /<div class="current-temperature">\s*<div class="temp-display">[\s\S]*?<\/div>\s*<div class="daily-range" id="daily-range" hidden><\/div>\s*<\/div>\s*<div class="feels-like"/);
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
            textContent: '',
            hidden: true,
            setAttribute(name, value) {
                attributes.set(name, value);
            },
            removeAttribute(name) {
                attributes.delete(name);
            }
        }
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

    assert.equal(elements['daily-range'].textContent, 'H 77° · L 65°');
    assert.equal(attributes.get('aria-label'), "Today's high 77 degrees, low 65 degrees.");
    assert.equal(elements['daily-range'].hidden, false);

    widget.data.daily = [];
    widget.update();

    assert.equal(elements['daily-range'].textContent, '');
    assert.equal(attributes.has('aria-label'), false);
    assert.equal(elements['daily-range'].hidden, true);
});

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
