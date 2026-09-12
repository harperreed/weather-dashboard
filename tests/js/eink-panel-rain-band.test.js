// ABOUTME: Tests the panel's rain band: when it speaks, what it says, and where it sits.
// ABOUTME: The band is the headline, so silence when dry matters as much as the copy.

const assert = require('node:assert/strict');
const test = require('node:test');

global.HTMLElement = class {};
global.customElements = { define() {} };

const { buildPanelModel, rainBand } = require('../../static/js/eink-panel-model.js');
const { panelMarkup } = require('../../static/js/eink-panel.js');

// Two hours of quarter-hour slots on the zero-padded clock the API sends.
function slots(chances, extra = {}) {
    return chances.map((chance, i) => ({
        time: `${String(9 + Math.floor(i / 4)).padStart(2, '0')}:`
            + `${String((i % 4) * 15).padStart(2, '0')}`,
        chance,
        snow: 0,
        ...extra
    }));
}

function reading(overrides = {}) {
    return { precipRate: 0, precipType: null, minutely: [], ...overrides };
}

test('stays silent when nothing falls and nothing is likely', () => {
    assert.equal(
        rainBand(reading({ minutely: slots([10, 25, 40, 55, 30, 10, 0, 0]) })),
        null
    );
});

test('speaks while precipitation is falling, however the next hours look', () => {
    const band = rainBand(reading({
        precipRate: 0.02,
        precipType: 'rain',
        minutely: slots([10, 10, 10, 10, 10, 10, 10, 10])
    }));

    assert.ok(band, 'rain on the ground has to reach the panel');
    assert.match(band.headline, /^Raining/);
});

test('speaks when the chance reaches the mark the panel acts on', () => {
    const band = rainBand(reading({ minutely: slots([0, 0, 60, 0, 0, 0, 0, 0]) }));

    assert.ok(band, 'a slot at the likely mark has to reach the panel');
    assert.equal(band.headline, 'Rain likely from 9:30am');
});

test('says when the rain it is reporting eases', () => {
    const band = rainBand(reading({
        precipRate: 0.04,
        precipType: 'rain',
        minutely: slots([90, 90, 80, 40, 20, 10, 10, 10])
    }));

    assert.equal(band.headline, 'Raining — eases 9:45am');
});

test('promises no end it cannot see', () => {
    const band = rainBand(reading({
        precipRate: 0.04,
        precipType: 'rain',
        minutely: slots([90, 90, 90, 90, 90, 90, 90, 90])
    }));

    assert.equal(band.headline, 'Raining');
});

test('names the end of a window that has already started', () => {
    const band = rainBand(reading({ minutely: slots([70, 75, 80, 50, 20, 10, 10, 10]) }));

    assert.equal(band.headline, 'Rain likely until 9:45am');
});

test('names the start of a window still ahead', () => {
    const band = rainBand(reading({ minutely: slots([10, 20, 30, 65, 80, 70, 40, 20]) }));

    assert.equal(band.headline, 'Rain likely from 9:45am');
});

test('says snow when snow is what falls', () => {
    const falling = rainBand(reading({
        precipRate: 0.03,
        precipType: 'snow',
        minutely: slots([90, 90, 90, 40, 10, 10, 10, 10])
    }));
    const forecast = rainBand(reading({
        minutely: slots([70, 75, 80, 50, 20, 10, 10, 10], { snow: 0.2 })
    }));

    assert.equal(falling.headline, 'Snowing — eases 9:45am');
    assert.equal(forecast.headline, 'Snow likely until 9:45am');
});

test('anchors the peak chance to the clock, never to a bare direction', () => {
    const nowIsWorst = rainBand(reading({ minutely: slots([80, 70, 60, 20, 10, 10, 10, 10]) }));
    const laterIsWorse = rainBand(reading({ minutely: slots([10, 20, 30, 65, 80, 70, 40, 20]) }));

    assert.equal(nowIsWorst.detail, '80% now');
    assert.equal(laterIsWorse.detail, '80% at 10:00am');
});

test('survives a payload carrying no minutely block', () => {
    assert.deepEqual(
        rainBand(reading({ precipRate: 0.05, precipType: 'rain', minutely: undefined })),
        { headline: 'Raining', detail: '' }
    );
    assert.equal(rainBand(reading()), null);
});

test('the panel model carries the band alongside the rest', () => {
    const times = ['3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am','1am','2am'];
    const model = buildPanelModel({
        location: 'Chicago',
        now: 'Thu 3:10pm',
        summary: 'Rain moving through',
        temp: 64, feels: 64, wetBulb: 58, high: 71, low: 44,
        hours: times.map((t) => ({ t, temp: 64, rain: 70, gust: 0, uv: 0, precipType: 'rain' })),
        darkHours: times.map(() => false),
        isDaytime: true,
        sunEvent: { kind: 'sunset', time: '7:32pm' },
        moonPercent: 34,
        precipRate: 0.04,
        precipType: 'rain',
        minutely: slots([90, 90, 80, 40, 20, 10, 10, 10])
    });

    assert.equal(model.rainBand.headline, 'Raining — eases 9:45am');
    assert.match(panelMarkup(model), /<div class="panel">\s*<div class="rain-band">/);
});
