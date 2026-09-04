// ABOUTME: Tests the panel markup the element renders from a finished view model.
// ABOUTME: Covers bar widths, the chart layers, conditional legend items and escaping.

const assert = require('node:assert/strict');
const test = require('node:test');

global.HTMLElement = class {};
global.customElements = { define() {} };

const { buildPanelModel } = require('../../static/js/eink-panel-model.js');
const { panelMarkup } = require('../../static/js/eink-panel.js');

function scene(overrides = {}) {
    const times = ['3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am','1am','2am'];
    const temps = [64,66,71,68,62,57,54,51,49,47,46,44];
    const rains = [20,45,80,90,85,60,30,20,10,10,10,10];

    return buildPanelModel({
        location: 'Chicago',
        now: 'Thu 3:10pm',
        summary: 'Thunderstorms building',
        temp: 64, feels: 64, wetBulb: 58, high: 71, low: 44,
        hours: times.map((t, i) => ({
            t, temp: temps[i], rain: rains[i], gust: 0, uv: 0, precipType: 'rain'
        })),
        darkHours: times.map((_, i) => i >= 5),
        isDaytime: true,
        sunEvent: { kind: 'sunset', time: '7:32pm' },
        moonPercent: 34,
        ...overrides
    });
}

test('the hero shows the air temperature once', () => {
    const html = panelMarkup(scene());

    assert.match(html, /<div class="hero">64°<\/div>/);
});

test('each reading bar carries its own width and fill', () => {
    const html = panelMarkup(scene());

    assert.match(html, /class="bar bar--air" style="width: 100%"/);
    assert.match(html, /class="bar bar--wet-bulb" style="width: 91%"/);
    assert.match(html, /class="bar bar--feels" style="width: 100%"/);
});

test('a missing wet bulb drops its whole row', () => {
    const html = panelMarkup(scene({ wetBulb: null }));

    assert.doesNotMatch(html, /bar--wet-bulb/);
    assert.doesNotMatch(html, /Wet bulb/);
    assert.match(html, /bar--air/);
});

test('the chart stacks a night band, twelve bars and the temperature line', () => {
    const html = panelMarkup(scene());

    assert.match(html, /class="dark-band" style="left: 42%; width: 58%"/);
    assert.equal(html.match(/class="chart-bar"/g).length, 12);
    assert.match(html, /viewBox="0 0 632 230"/);
    assert.match(html, /preserveAspectRatio="none"/);
    assert.match(html, /vector-effect="non-scaling-stroke"/);
});

test('the now marker sits on the first point of the line', () => {
    const html = panelMarkup(scene());

    const points = html.match(/points="([^"]+)"/)[1].split(' ');
    const [, cx, cy] = html.match(/<circle cx="([^"]+)" cy="([^"]+)"/);
    assert.equal(`${cx},${cy}`, points[0]);
});

test('two runs of darkness draw two bands', () => {
    const html = panelMarkup(scene({
        darkHours: [true, true, false, false, false, false, false, false, false, false, true, true]
    }));

    assert.equal(html.match(/class="dark-band"/g).length, 2);
});

test('the legend names the channel and the night band', () => {
    const html = panelMarkup(scene());

    assert.match(html, /swatch--line"><\/span>Temperature/);
    assert.match(html, /swatch--hatch"><\/span>Chance of rain/);
    assert.match(html, /swatch--dots"><\/span>Dark/);
});

test('a quiet, fully lit window shows only the temperature key', () => {
    const html = panelMarkup(scene({
        hours: ['1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am','12pm']
            .map((t) => ({ t, temp: 50, rain: 0, gust: 0, uv: 0, precipType: null })),
        darkHours: new Array(12).fill(false)
    }));

    assert.match(html, /swatch--line/);
    assert.doesNotMatch(html, /swatch--hatch/);
    assert.doesNotMatch(html, /swatch--dots/);
});

test('the hour row reserves a channel slot for every hour', () => {
    const html = panelMarkup(scene());

    assert.equal(html.match(/class="hour-channel"/g).length, 12);
    assert.match(html, /class="hour-channel">90%</);
    assert.match(html, /class="hour-channel"><\/span>/);
});

test('the lead insight is the only inverted cell', () => {
    const html = panelMarkup(scene());

    assert.equal(html.match(/insight--lead/g).length, 1);
    assert.match(html, /insight--lead">Feels like 64°/);
    assert.equal(html.match(/class="card insight"/g).length, 2);
});

test('a location from the query string cannot inject markup', () => {
    const html = panelMarkup(scene({ location: '<script>alert(1)</script>' }));

    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
});
