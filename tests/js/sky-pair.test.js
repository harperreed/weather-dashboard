// ABOUTME: Tests the Sun and Moon cards in their day, night, and missing-data states.
// ABOUTME: Runs the production components with Node's dependency-free test runner.

// The cards format times with toLocaleTimeString, which reads the machine's
// zone. Pin it before the first Date is formatted so the assertions below
// mean the same thing on every machine.
process.env.TZ = 'America/Chicago';

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

test('the next sunrise is found whatever date it is filed under', () => {
    // The map is keyed by the location's dates. Composing tomorrow's key from
    // the viewer's own calendar misses whenever the two disagree, and the card
    // silently loses its time.
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR,
        { '2026-09-04': { sunrise: '2026-09-04T06:24:00-05:00' } },
        new Date('2026-09-02T21:00:00-05:00')
    );

    assert.equal(state.heading, 'Sunrise 6:24am');
    assert.match(state.detail, /until sunrise$/);
});

test('the sun and moon cards share one time formatter', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );

    const definitions = [...components.matchAll(/formatCardTime\(isoString\)/g)];
    assert.equal(
        definitions.length,
        1,
        `expected one definition, found ${definitions.length}`
    );
    assert.doesNotMatch(components, /this\.formatCardTime\(/);
});

test('before sunrise the card counts up to sunrise', () => {
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR, SUN_MAP, new Date('2026-09-02T02:00:00-05:00')
    );

    assert.equal(state.heading, 'Sunrise 6:22am');
    assert.match(state.detail, /until sunrise$/);
    assert.doesNotMatch(state.heading, /Sets/);
    assert.equal(state.progress, 0);
});

test('the pre-dawn duration never reads like a claim of daylight', () => {
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR, SUN_MAP, new Date('2026-09-02T00:05:00-05:00')
    );

    assert.match(state.detail, /until sunrise$/);
    const hours = Number(state.detail.match(/^(\d+)h/)[1]);
    assert.ok(hours < 24, `expected under 24h, got "${state.detail}"`);
});

test('midday still returns the sets-tonight state', () => {
    const widget = sunWidget();
    const state = widget.sunHeading(
        SOLAR, SUN_MAP, new Date('2026-09-02T13:40:00-05:00')
    );

    assert.match(state.heading, /^Sets /);
    assert.match(state.detail, /of daylight left$/);
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

    assert.match(content.innerHTML, /class="sky-card"/);
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

    assert.match(html, /class="sky-card"/);
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
