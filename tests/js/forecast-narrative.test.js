// ABOUTME: Tests the eInk forecast narrative block against the NWS period it renders.
// ABOUTME: Runs the production widget with Node's dependency-free test runner.

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
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ForecastNarrativeWidget } = require('../../static/js/weather-components.js');

const narrativeWidget = () => {
    const caption = { textContent: '' };
    const body = { textContent: '' };
    const widget = Object.create(ForecastNarrativeWidget.prototype);
    widget.config = { narrative: true };
    widget.shadowRoot = {
        getElementById: (id) => (id === 'narrative-caption' ? caption : body)
    };
    widget.hidden = false;
    return { widget, caption, body };
};

const forecastOf = (...periods) => ({ periods });

test('the block renders the period the forecast opens with', () => {
    const { widget, caption, body } = narrativeWidget();
    widget.forecast = forecastOf({
        name: 'Tonight',
        detailed_forecast: 'A chance of showers and thunderstorms after 10pm.'
    });

    widget.update();

    assert.equal(widget.hidden, false);
    assert.equal(caption.textContent, 'Tonight');
    assert.equal(
        body.textContent,
        'A chance of showers and thunderstorms after 10pm.'
    );
});

test('the opening period wins whatever it is called', () => {
    const { widget, caption } = narrativeWidget();
    widget.forecast = forecastOf(
        { name: 'Today', detailed_forecast: 'Mostly sunny, with a high near 94.' },
        { name: 'Tonight', detailed_forecast: 'Partly cloudy.' }
    );

    widget.update();

    assert.equal(caption.textContent, 'Today');
});

test('a location outside the service hides the block', () => {
    // The forecast endpoint is the National Weather Service, so a location
    // it does not cover answers with no periods at all.
    const { widget } = narrativeWidget();
    widget.forecast = forecastOf();

    widget.update();

    assert.equal(widget.hidden, true);
});

test('no forecast at all hides the block', () => {
    const { widget } = narrativeWidget();
    widget.forecast = null;

    widget.update();

    assert.equal(widget.hidden, true);
});

test('a period carrying no prose hides the block', () => {
    const { widget } = narrativeWidget();
    widget.forecast = forecastOf({ name: 'Tonight', detailed_forecast: '' });

    widget.update();

    assert.equal(widget.hidden, true);
});

test('the forecast prose is inserted as text, never as markup', () => {
    const { widget, body } = narrativeWidget();
    widget.forecast = forecastOf({
        name: 'Tonight',
        detailed_forecast: '<img src=x onerror=alert(1)> Clear.'
    });

    widget.update();

    // textContent is the guard. Assert the string arrives whole rather than
    // parsed, so a later switch to innerHTML fails here instead of in a page.
    assert.equal(body.textContent, '<img src=x onerror=alert(1)> Clear.');
    assert.equal(body.innerHTML, undefined);
});

// The narrative's data path: the app makes the request, every block reads the
// broadcast. Two widgets fetching this endpoint would be two sources of truth
// for one answer, and would double the traffic on a panel that refreshes all
// day.
const { WeatherApp } = require('../../static/js/weather-components.js');

const appWith = (respond) => {
    const app = Object.create(WeatherApp.prototype);
    const broadcasts = [];
    const requested = [];

    app.broadcastEvent = (name, detail) => broadcasts.push({ name, detail });
    app.parseLocationParams = () => ({
        lat: '41.8781',
        lon: '-87.6298',
        location: 'Chicago'
    });
    global.fetch = (url) => {
        requested.push(url);
        return respond();
    };

    return { app, broadcasts, requested };
};

const answering = (body) => () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

test('the app requests the forecast once and broadcasts the whole answer', async () => {
    const answer = { forecast: { periods: [{ name: 'Tonight' }] }, alerts: {} };
    const { app, broadcasts, requested } = appWith(answering(answer));

    await app.fetchAlertsData();

    assert.equal(requested.length, 1);
    assert.match(requested[0], /^\/api\/weather\/alerts\?/);
    assert.match(requested[0], /lat=41\.8781/);
    assert.deepEqual(broadcasts.map(({ name }) => name), ['weather-alerts-updated']);
    assert.deepEqual(broadcasts[0].detail, answer);
});

test('a refused request leaves the last good forecast standing', async () => {
    // An eInk panel repaints slowly and is read at a glance. A blip that
    // blanks the block is worse than a forecast a few minutes stale.
    const { app, broadcasts } = appWith(() => Promise.reject(new Error('offline')));

    await app.fetchAlertsData();

    assert.deepEqual(broadcasts, []);
});

test('an error status broadcasts nothing either', async () => {
    const { app, broadcasts } = appWith(() =>
        Promise.resolve({ ok: false, status: 503 })
    );

    await app.fetchAlertsData();

    assert.deepEqual(broadcasts, []);
});

function styles() {
    return fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
}

test('the eInk card takes the panel\'s square high-contrast frame', () => {
    // The block sits directly under the chart, which draws itself on a white
    // ground inside a 2px black rule. A rounded translucent card beside it
    // reads as a different panel.
    const css = styles();
    const card = css.match(
        /:host\(\[data-theme="eink"\]\) \.narrative-card\s*\{[^}]*\}/s
    )?.[0] || '';

    assert.match(card, /background:\s*#ffffff;/);
    assert.match(card, /border:\s*2px solid #000000;/);
    assert.match(card, /box-sizing:\s*border-box;/);
});

test('the paragraph carries no default margin', () => {
    // A <p> arrives with a 1em margin top and bottom. On a panel whose chart
    // takes whatever height is left, that margin is stolen chart.
    const css = styles();
    const body = css.match(/\.narrative-body\s*\{[^}]*\}/s)?.[0] || '';

    assert.match(body, /margin:\s*0;/);
});
