// ABOUTME: Tests hourly chart geometry and the shared 12-column forecast layout.
// ABOUTME: Runs production component and CSS contracts with Node's test runner.

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
    HourlyForecastWidget,
    calculateHourlyChartPoints
} = require('../../static/js/weather-components.js');

test('centers chart points in the same 12 columns as hourly cells', () => {
    const points = calculateHourlyChartPoints([10, 20, 30], 300, 120);

    assert.equal(points.length, 3);
    assert.deepEqual(points.map(({ x }) => x), [50, 150, 250]);
    assert.ok(points.every(({ y }) => y >= 16 && y <= 112));
});

test('centers a flat temperature range vertically', () => {
    const points = calculateHourlyChartPoints([20, 20], 200, 120);

    assert.deepEqual(points, [{ x: 50, y: 64 }, { x: 150, y: 64 }]);
});

test('renders time inside each hourly cell without a second time row', () => {
    const widget = new HourlyForecastWidget();
    widget.render();

    assert.match(widget.shadowRoot.innerHTML, /id="hourly-temps"/);
    assert.match(widget.shadowRoot.innerHTML, /class="hour-time"/);
    assert.doesNotMatch(widget.shadowRoot.innerHTML, /id="hourly-times"/);
});

test('uses one fitted 12-column grid with no hourly scrolling', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.hourly-temps\s*\{[^}]*display:\s*grid;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\);/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*overflow-x:\s*visible;/s);
    assert.doesNotMatch(styles, /\.hourly-times\s*\{/);
    assert.match(styles, /\.chart-container\s*\{[^}]*height:\s*clamp\(8rem, 25vw, 11rem\);/s);
});
