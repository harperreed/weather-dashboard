// ABOUTME: Tests hourly chart geometry and the shared dynamic forecast layout.
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

test('centers chart points in the same equal-width cells as hourly entries', () => {
    const points = calculateHourlyChartPoints([10, 20, 30], 300, 120);

    assert.equal(points.length, 3);
    assert.deepEqual(points.map(({ x }) => x), [50, 150, 250]);
    assert.ok(points.every(({ y }) => y >= 16 && y <= 112));
});

test('centers a flat temperature range vertically', () => {
    const points = calculateHourlyChartPoints([20, 20], 200, 120);

    assert.deepEqual(points, [{ x: 50, y: 64 }, { x: 150, y: 64 }]);
});

test('aligns six real forecast hours to six equal auto columns', () => {
    const points = calculateHourlyChartPoints([10, 20, 30, 40, 50, 60], 600, 120);
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.deepEqual(points.map(({ x }) => x), [50, 150, 250, 350, 450, 550]);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-flow:\s*column;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s);
    assert.doesNotMatch(styles, /\.hourly-temps\s*\{[^}]*grid-template-columns:/s);
});

test('renders time inside each hourly cell without a second time row', () => {
    const widget = new HourlyForecastWidget();
    widget.render();

    assert.match(widget.shadowRoot.innerHTML, /id="hourly-temps"/);
    assert.match(widget.shadowRoot.innerHTML, /class="hour-time"/);
    assert.doesNotMatch(widget.shadowRoot.innerHTML, /id="hourly-times"/);
});

test('uses one gapless auto-column grid with no hourly scrolling', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.hourly-temps\s*\{[^}]*display:\s*grid;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-flow:\s*column;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*gap:\s*0;/s);
    assert.match(styles, /\.hourly-temps\s*\{[^}]*overflow-x:\s*visible;/s);
    assert.doesNotMatch(styles, /\.hourly-times\s*\{/);
    assert.match(styles, /\.chart-container\s*\{[^}]*height:\s*clamp\(8rem, 25vw, 11rem\);/s);
});
