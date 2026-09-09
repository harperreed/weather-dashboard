// ABOUTME: Tests the two-hour precipitation nowcast: when it speaks and what it draws.
// ABOUTME: Runs the production component and catalog with Node's test runner.

const assert = require('node:assert/strict');
const test = require('node:test');

const { WIDGET_CATALOG } = require('../../static/js/dashboard-config.js');

global.HTMLElement = class {
    attachShadow() {
        this.shadowRoot = { innerHTML: '' };
        return this.shadowRoot;
    }
    getAttribute() {
        return null;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };

const {
    NOWCAST_THRESHOLD,
    nowcastReading
} = require('../../static/js/weather-components.js');

// The backend hands over a zero-padded 24-hour clock: 09:15, not 9:15.
function slots(chances, extra = {}) {
    return chances.map((precipitation_prob, i) => ({
        time: `${String(9 + Math.floor(i / 4)).padStart(2, '0')}:`
            + `${String((i % 4) * 15).padStart(2, '0')}`,
        precipitation_prob,
        temp: 70,
        snow: 0,
        weather_code: precipitation_prob > 50 ? 61 : 3,
        ...extra
    }));
}

test('the catalog carries the nowcast, off by default on the eInk panel', () => {
    const entry = WIDGET_CATALOG.find(({ id }) => id === 'nowcast');

    assert.ok(entry, 'no nowcast entry in the widget catalog');
    assert.equal(entry.host, 'precipitation-nowcast');
    assert.deepEqual(entry.parameters, ['minutely']);
    assert.deepEqual(entry.defaultThemes, ['blue', 'light']);
});

test('stays silent when the next two hours hold nothing', () => {
    assert.equal(nowcastReading(slots([0, 0, 0, 0, 0, 0, 0, 0])), null);
});

test('stays silent when every slot sits under the threshold', () => {
    const under = NOWCAST_THRESHOLD - 1;

    assert.equal(nowcastReading(slots([under, under, 0, under])), null);
});

test('speaks as soon as one slot reaches the threshold', () => {
    const reading = nowcastReading(slots([0, 0, NOWCAST_THRESHOLD, 0]));

    assert.ok(reading, 'a slot at the threshold must be reported');
    assert.equal(reading.peak, NOWCAST_THRESHOLD);
});

test('reports every slot, so a rising chance is not cropped to its peak', () => {
    const chances = [12, 28, 55, 80, 78, 60, 35, 15];

    const reading = nowcastReading(slots(chances));

    assert.equal(reading.slots.length, chances.length);
    assert.deepEqual(
        reading.slots.map((slot) => slot.precipitation_prob),
        chances
    );
    assert.equal(reading.peak, 80);
});

test('labels the first slot now, because that is the one you are standing in', () => {
    const reading = nowcastReading(slots([60, 61, 61, 60]));

    assert.equal(reading.slots[0].label, 'now');
});

test('reads the clock the way a person says it, not the way the API writes it', () => {
    const reading = nowcastReading(slots([60, 61, 61, 60]));

    assert.deepEqual(
        reading.slots.map(({ label }) => label),
        ['now', '9:15', '9:30', '9:45']
    );
});

test('says snow when snow is what falls', () => {
    assert.equal(nowcastReading(slots([60, 60])).noun, 'Rain');
    assert.equal(nowcastReading(slots([60, 60], { snow: 0.2 })).noun, 'Snow');
});

test('survives a payload with no minutely block at all', () => {
    assert.equal(nowcastReading(undefined), null);
    assert.equal(nowcastReading([]), null);
});

test('treats a missing chance as no chance rather than throwing', () => {
    const reading = nowcastReading([{ time: '9:00', temp: 70 }]);

    assert.equal(reading, null);
});
