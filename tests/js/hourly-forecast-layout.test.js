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

test('inserts an hourly time as literal text instead of hourly cell markup', (t) => {
    const originalDocument = global.document;
    global.document = {
        addEventListener() {},
        createElement() {
            const element = {
                children: [],
                innerHTMLAssignments: [],
                style: {},
                appendChild(child) {
                    this.children.push(child);
                }
            };
            Object.defineProperty(element, 'innerHTML', {
                get() {
                    return this.innerHTMLAssignments.at(-1) ?? '';
                },
                set(value) {
                    this.innerHTMLAssignments.push(value);
                }
            });
            let textContent = '';
            Object.defineProperty(element, 'textContent', {
                get() {
                    return textContent;
                },
                set(value) {
                    textContent = value;
                    this.textContentAssignments = (this.textContentAssignments ?? []).concat(value);
                }
            });
            return element;
        }
    };
    t.after(() => {
        global.document = originalDocument;
    });

    const unsafeTime = '<img src=x onerror=alert(1)>';
    const hourlyContainer = { innerHTML: '', children: [], appendChild(child) { this.children.push(child); } };
    const widget = Object.create(HourlyForecastWidget.prototype);
    widget.config = { hourly: true };
    widget.data = { hourly: [{ t: unsafeTime, temp: 72, icon: 'clear-day' }] };
    widget.shadowRoot = { getElementById: (id) => id === 'hourly-temps' ? hourlyContainer : null };
    widget.drawTemperatureChart = () => {};
    widget.hideError = () => {};
    widget.hideLoading = () => {};

    widget.update();

    const hourDiv = hourlyContainer.children[0];
    const timeSpan = hourDiv.children.find((child) => child.className === 'hour-time');
    assert.deepEqual(timeSpan.textContentAssignments, [unsafeTime]);
    assert.equal(timeSpan.textContent, unsafeTime);
    assert.doesNotMatch(hourDiv.innerHTMLAssignments[0], /<img src=x on/);
    assert.match(hourDiv.innerHTMLAssignments[0], /hour-temp-value">72°/);
    assert.match(hourDiv.innerHTMLAssignments[0], /<weather-icon icon="clear-day"/);
});

test('redraws current forecast hours when the rendered chart box changes size', (t) => {
    const originalResizeObserver = global.ResizeObserver;
    const observers = [];
    const firstChart = {};
    const replacementChart = {};
    const hourly = Array.from({ length: 13 }, (_, index) => ({ temp: index }));

    global.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.disconnected = false;
            observers.push(this);
        }

        observe(target) {
            this.target = target;
        }

        disconnect() {
            this.disconnected = true;
        }
    };
    t.after(() => {
        global.ResizeObserver = originalResizeObserver;
    });

    const widget = Object.create(HourlyForecastWidget.prototype);
    widget.config = { hourly: true };
    widget.data = { hourly };
    let renderCount = 0;
    const shadowRoot = {
        getElementById(id) {
            if (id !== 'hourly-chart') return null;
            return renderCount === 1 ? firstChart : replacementChart;
        }
    };
    Object.defineProperty(shadowRoot, 'innerHTML', {
        get() {
            return '';
        },
        set() {
            renderCount += 1;
        }
    });
    widget.shadowRoot = shadowRoot;
    const redraws = [];
    widget.drawTemperatureChart = (hours) => redraws.push(hours);

    widget.render();

    assert.equal(observers.length, 1);
    assert.equal(observers[0].target, firstChart);
    observers[0].callback();
    assert.deepEqual(redraws, [hourly.slice(0, 12)]);

    widget.render();

    assert.equal(observers[0].disconnected, true);
    assert.equal(observers.length, 2);
    assert.equal(observers[1].target, replacementChart);

    widget.disconnectedCallback();
    assert.equal(observers[1].disconnected, true);
});

test('uses an eInk time label that fits full hour strings without an inline override', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.hour-time\s*\{[^}]*min-width:\s*0;[^}]*text-align:\s*center;[^}]*font-size:\s*clamp\(0\.4375rem, 2vw, 1rem\);[^}]*font-weight:\s*800;/s);
    assert.doesNotMatch(components, /:host\(\[data-theme="eink"\]\) \.hour-time\s*\{/);
});

test('uses a responsive external eInk temperature that fits 12 compact cells', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.hour-temp-value\s*\{[^}]*font-weight:\s*900;[^}]*font-size:\s*clamp\(0\.5625rem, 2vw, 1rem\);/s);
    assert.doesNotMatch(components, /:host\(\[data-theme="eink"\]\) \.hour-temp-value\s*\{/);
});

test('keeps 12 extreme hourly temperatures with full hour strings in the manual fixture', () => {
    const harness = fs.readFileSync(
        path.join(__dirname, '../../test_components.html'),
        'utf8'
    );
    const fixture = harness.match(/hourly:\s*\[(.*?)\n\s*\],\n\s*daily:/s)?.[1] ?? '';

    assert.equal((fixture.match(/\{ t:/g) ?? []).length, 12);
    assert.match(fixture, /t:\s*'[^']+[ap]m',\s*temp:\s*-12/);
    assert.match(fixture, /t:\s*'[^']+[ap]m',\s*temp:\s*100/);
});

test('eInk keeps strong type with compact page and component spacing', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const harness = fs.readFileSync(
        path.join(__dirname, '../../test_components.html'),
        'utf8'
    );
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(template, /\[data-theme="eink"\] \.weather-container\s*\{[^}]*max-width:\s*none;[^}]*width:\s*100%;[^}]*padding:\s*0\.5rem;[^}]*box-sizing:\s*border-box;/s);
    assert.doesNotMatch(template, /@media \(max-width:\s*390px\)[\s\S]*?\[data-theme="eink"\] \.weather-container/);
    assert.match(harness, /@media \(max-width:\s*390px\)\s*\{\s*body\[data-theme="eink"\]\s*\{[^}]*padding:\s*2rem 1rem;/s);
    assert.match(harness, /@media \(max-width:\s*390px\)[\s\S]*?\.test-section\s*\{[^}]*padding:\s*1rem 0;/);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.temp-display\s*\{[^}]*gap:\s*1\.5rem;[^}]*margin-bottom:\s*1\.25rem;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.weather-details\s*\{[^}]*gap:\s*0\.75rem;[^}]*margin-top:\s*0;/s);
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
