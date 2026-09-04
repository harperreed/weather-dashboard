// ABOUTME: Unit tests for the dashboard's rule-based insight sentence and facts.
// ABOUTME: Runs the production module with Node's dependency-free test runner.

global.HTMLElement = class {
    attachShadow() {
        this.shadowRoot = { innerHTML: '' };
        return this.shadowRoot;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };
global.window = { WeatherInsights: require('../../static/js/weather-insights.js') };

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    calculateWetbulbTemp,
    insightFacts,
    insightFragments,
    insightSentence,
    precipitationNoun,
    precipitationWindow,
    wetBulbClause,
    wetBulbPosition
} = require('../../static/js/weather-insights.js');

const hoursAt = (chances, icon = 'rain') => chances.map((rain, index) => ({
    rain,
    icon,
    t: `${index + 1}pm`,
    temp: 50
}));

test('wet bulb sits between feels-like and air temperature', () => {
    assert.equal(wetBulbPosition(60, 70, 80), 50);
    assert.equal(wetBulbPosition(60, 60, 80), 0);
    assert.equal(wetBulbPosition(60, 80, 80), 100);
});

test('every dot sits at the end when air equals feels-like', () => {
    assert.equal(wetBulbPosition(70, 65, 70), 100);
});

test('a wet bulb outside the pair clamps to the track', () => {
    assert.equal(wetBulbPosition(60, 40, 80), 0);
    assert.equal(wetBulbPosition(60, 100, 80), 100);
});

test('a non-finite temperature has no position', () => {
    assert.equal(wetBulbPosition(60, Number.NaN, 80), null);
    assert.equal(wetBulbPosition(undefined, 70, 80), null);
});

test('the wet bulb clause names the exertion band', () => {
    assert.equal(wetBulbClause(85), 'dangerous for exertion');
    assert.equal(wetBulbClause(80), 'dangerous for exertion');
    assert.equal(wetBulbClause(79), 'limit hard exertion');
    assert.equal(wetBulbClause(70), 'limit hard exertion');
    assert.equal(wetBulbClause(69), '');
    assert.equal(wetBulbClause(50), '');
    assert.equal(wetBulbClause(49), 'safe for exertion above 50°, this is well under');
});

test('the window is the first contiguous run at sixty percent or above', () => {
    const window = precipitationWindow(hoursAt([10, 70, 80, 65, 20, 90, 95]));

    assert.equal(window.start, '2pm');
    assert.equal(window.end, '4pm');
    assert.equal(window.peak, '3pm');
});

test('the earliest hour wins a tie for the heaviest', () => {
    assert.equal(precipitationWindow(hoursAt([80, 80, 70])).peak, '1pm');
});

test('no qualifying hour means no window', () => {
    assert.equal(precipitationWindow(hoursAt([10, 20, 59])), null);
    assert.equal(precipitationWindow([]), null);
    assert.equal(precipitationWindow(undefined), null);
});

test('the noun follows a single precipitation type inside the window', () => {
    assert.equal(precipitationNoun(['rain', 'heavy-rain', 'light-rain']), 'Rain');
    assert.equal(precipitationNoun(['snow', 'light-snow']), 'Snow');
    assert.equal(precipitationNoun(['sleet']), 'Sleet');
});

test('a mixed or unrecognized window is precipitation', () => {
    assert.equal(precipitationNoun(['rain', 'snow']), 'Precipitation');
    assert.equal(precipitationNoun(['cloudy']), 'Precipitation');
    assert.equal(precipitationNoun([]), 'Precipitation');
});

test('an unrecognized icon beside one type does not change the noun', () => {
    assert.equal(precipitationNoun(['cloudy', 'rain']), 'Rain');
});

test('wind chill applies only at a ten degree gap', () => {
    const data = { current: { temperature: 30, feels_like: 20 }, daily: [] };
    assert.equal(insightSentence(data, []), 'Wind makes 30° feel like 20°.');

    const mild = { current: { temperature: 30, feels_like: 21 }, daily: [] };
    assert.equal(insightSentence(mild, []), '');
});

test('the overnight clause follows the low', () => {
    const at = (low) => insightSentence({ current: {}, daily: [{ l: low }] }, []);

    assert.equal(at(15), 'Falling to 15° overnight — layers and a hat.');
    assert.equal(at(20), 'Falling to 20° overnight — bring a jacket.');
    assert.equal(at(45), 'Falling to 45° overnight — bring a jacket.');
    assert.equal(at(46), 'Falling to 46° overnight.');
});

test('every rule joins into one sentence in order', () => {
    const data = {
        current: { temperature: 30, feels_like: 18 },
        daily: [{ l: 12 }]
    };

    assert.equal(
        insightSentence(data, hoursAt([70, 90, 60, 10])),
        'Wind makes 30° feel like 18°. Rain likely 1pm–3pm, heaviest around 2pm. '
        + 'Falling to 12° overnight — layers and a hat.'
    );
});

test('the facts are the short form of the same fragments', () => {
    const data = {
        current: { temperature: 30, feels_like: 18 },
        daily: [{ l: 12 }]
    };

    assert.deepEqual(insightFacts(data, hoursAt([70, 90, 60, 10])), [
        'Feels like 18° in the wind',
        'Rain 1pm–3pm',
        '12° overnight'
    ]);
});

test('inapplicable rules are omitted, not blanked', () => {
    const data = { current: { temperature: 60, feels_like: 59 }, daily: [] };

    assert.deepEqual(insightFragments(data, hoursAt([10, 20])), []);
    assert.equal(insightSentence(data, hoursAt([10, 20])), '');
    assert.deepEqual(insightFacts(data, hoursAt([10, 20])), []);
});

test('a missing low drops the overnight rule', () => {
    const data = { current: {}, daily: [{ h: 70 }] };
    assert.deepEqual(insightFacts(data, []), []);
});

test('the humidity rule follows the dew point comfort scale', () => {
    const at = (dew) => insightSentence({ current: { dew_point: dew }, daily: [] }, []);

    // Sixty-five is where the NWS comfort scale turns from noticeable to
    // humid, so it is the first dew point worth a fact of its own.
    assert.equal(at(71), 'Humid at a 71° dew point.');
    assert.equal(at(65), 'Humid at a 65° dew point.');
    assert.equal(at(64), '');
});

test('gusts report only when they run ahead of the steady wind', () => {
    const at = (speed, gust) => insightSentence(
        { current: { wind_speed: speed, wind_gust: gust }, daily: [] }, []
    );

    assert.equal(at(6, 14), 'Wind gusting to 14.');
    assert.equal(at(6, 13), '');
    // A gust reading level with the steady wind is not a gust.
    assert.equal(at(20, 20), '');
    // A gust without a wind to measure it against says nothing.
    assert.equal(at(undefined, 30), '');
});

test('the UV rule follows the high band', () => {
    const at = (uv) => insightSentence({ current: { uv_index: uv }, daily: [] }, []);

    // The WHO exposure scale opens its "high" band at 6.
    assert.equal(at(8), 'UV index 8 — cover up.');
    assert.equal(at(6), 'UV index 6 — cover up.');
    assert.equal(at(5), '');
    // Zero is a reading, not a missing value, and it stays quiet.
    assert.equal(at(0), '');
    // The provider sends fractions; the fact reads as a whole number.
    assert.equal(at(7.6), 'UV index 8 — cover up.');
});

test('the reading rules carry short forms for the eInk strip', () => {
    const data = {
        current: { dew_point: 71, wind_speed: 6, wind_gust: 14, uv_index: 8 },
        daily: []
    };

    assert.deepEqual(insightFacts(data, []), [
        'Humid, dew point 71°',
        'Gusts to 14',
        'UV 8'
    ]);
});

test('a missing reading drops its rule rather than printing a blank', () => {
    const data = { current: { dew_point: null, uv_index: undefined }, daily: [] };

    assert.deepEqual(insightFacts(data, []), []);
});

test('dry air drops the wet bulb far below the air temperature', () => {
    assert.equal(calculateWetbulbTemp(90, 20), 63);
    assert.equal(calculateWetbulbTemp(70, 100), 70);
});

const { WeatherInsightsWidget } = require('../../static/js/weather-components.js');

const insightsWidget = (theme) => {
    const card = { textContent: '', hidden: true };
    const facts = { innerHTML: '', hidden: true };
    const widget = Object.create(WeatherInsightsWidget.prototype);
    widget.config = { insights: true };
    widget.attributes = new Map([['data-theme', theme]]);
    widget.getAttribute = (name) => widget.attributes.get(name) ?? null;
    widget.shadowRoot = {
        getElementById: (id) => (id === 'insight-card' ? card : facts)
    };
    widget.hidden = false;
    return { widget, card, facts };
};

const insightData = {
    current: { temperature: 30, feels_like: 18 },
    daily: [{ l: 12 }],
    hourly: hoursAt([70, 90, 60, 10])
};

test('blue renders one sentence and no fact strip', () => {
    const { widget, card, facts } = insightsWidget('blue');
    widget.data = insightData;

    widget.update();

    assert.equal(
        card.textContent,
        'Wind makes 30° feel like 18°. Rain likely 1pm–3pm, heaviest around 2pm. '
        + 'Falling to 12° overnight — layers and a hat.'
    );
    assert.equal(card.hidden, false);
    assert.equal(facts.hidden, true);
    assert.equal(widget.hidden, false);
});

test('eInk renders a fact per cell with the first inverted', () => {
    const { widget, card, facts } = insightsWidget('eink');
    widget.data = insightData;

    widget.update();

    assert.equal(card.hidden, true);
    assert.equal(facts.hidden, false);
    assert.equal((facts.innerHTML.match(/class="insight-fact/g) || []).length, 3);
    assert.match(facts.innerHTML, /class="insight-fact insight-fact-lead"/);
    assert.match(facts.innerHTML, /Feels like 18° in the wind/);
});

test('the fact strip sizes to the facts present', () => {
    const { widget, facts } = insightsWidget('eink');
    widget.data = { current: {}, daily: [{ l: 30 }], hourly: [] };

    widget.update();

    assert.equal((facts.innerHTML.match(/class="insight-fact/g) || []).length, 1);
    assert.match(facts.innerHTML, /30° overnight/);
});

test('the host hides when no rule applies', () => {
    const { widget, card, facts } = insightsWidget('blue');
    widget.data = { current: { temperature: 60, feels_like: 59 }, daily: [], hourly: [] };

    widget.update();

    assert.equal(widget.hidden, true);
    assert.equal(card.hidden, true);
    assert.equal(facts.hidden, true);
});

test('a fact with markup in it is inserted as text', () => {
    const { widget, facts } = insightsWidget('eink');
    widget.data = {
        current: {},
        daily: [],
        hourly: [{ rain: 80, icon: 'rain', t: '<img src=x onerror=alert(1)>' }]
    };

    widget.update();

    assert.doesNotMatch(facts.innerHTML, /<img src=x on/);
    assert.match(facts.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
