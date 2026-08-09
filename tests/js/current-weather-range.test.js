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
