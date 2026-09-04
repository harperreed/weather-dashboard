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
    getAttribute() {
        return null;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };

const {
    HourlyForecastWidget,
    calculateHourlyChartPoints
} = require('../../static/js/weather-components.js');

function hourlyWidgetSource() {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const start = components.indexOf('class HourlyForecastWidget');
    const end = components.indexOf('class WeatherInsightsWidget');
    // A renamed marker gives indexOf -1 and a slice that matches nothing, so
    // every assertion against it would pass without reading the widget at all.
    assert.ok(start > 0 && end > start, `bad slice markers: ${start}, ${end}`);
    return components.slice(start, end);
}

test('centers chart points in the same equal-width cells as hourly entries', () => {
    const points = calculateHourlyChartPoints([10, 20, 30], 1000, 150, 14);

    assert.deepEqual(points.map(({ x }) => x), [
        1000 / 6, 1000 / 2, (1000 / 3) * 2.5
    ]);
    assert.ok(points.every(({ y }) => y >= 14 && y <= 136));
});

test('centers a flat temperature range vertically', () => {
    const points = calculateHourlyChartPoints([20, 20], 1000, 150, 14);

    assert.deepEqual(points, [{ x: 250, y: 75 }, { x: 750, y: 75 }]);
});

test('symmetric padding puts the hottest hour at the top pad', () => {
    const points = calculateHourlyChartPoints([10, 30], 1000, 180, 16);

    assert.equal(points[1].y, 16);
    assert.equal(points[0].y, 164);
});

test('a one-degree spread does not fill the chart', () => {
    // The main bedroom panel forecast: twelve hours of 76 with a single 75.
    // Ranging the axis to the data alone drew that dip as a full-height cliff.
    const overnight = [76, 76, 76, 76, 75, 76, 76, 76, 76, 76, 76, 76];

    const ys = calculateHourlyChartPoints(overnight, 1000, 180, 16).map(({ y }) => y);

    // The plot is 148 tall and the axis never spans less than ten degrees, so
    // one degree is a tenth of it.
    const spread = Math.max(...ys) - Math.min(...ys);
    assert.ok(Math.abs(spread - 14.8) < 0.001, `one degree drew ${spread}px of swing`);
});

test('a spread at the floor still fills the chart', () => {
    // Ten degrees is the floor, not a margin added to it.
    const points = calculateHourlyChartPoints([60, 70], 1000, 180, 16);

    assert.equal(points[1].y, 16);
    assert.equal(points[0].y, 164);
});

test('the bar grid divides the chart into gapless columns', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.precip-bars\s*\{[^}]*display:\s*grid;/s);
    assert.match(styles, /\.precip-bars\s*\{[^}]*grid-auto-flow:\s*column;/s);
    assert.match(styles, /\.precip-bars\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s);
    assert.match(styles, /\.precip-bars\s*\{[^}]*gap:\s*0;/s);
    assert.match(styles, /\.precip-cell\s*\{[^}]*padding:\s*0 1\.5px;/s);
});

const hourAt = (index, temp, rain) => ({
    t: `${index + 1}pm`, temp, rain, icon: 'rain'
});

// renderHours builds cells with createElement and fills the labels with
// textContent, so the hour grid is asserted against the constructed
// elements rather than an innerHTML string.
const makeElement = () => {
    let markup = '';
    const element = {
        children: [],
        textContent: '',
        className: '',
        style: {},
        appendChild(child) { this.children.push(child); }
    };
    // Assigning innerHTML drops existing children, the way a real node does.
    Object.defineProperty(element, 'innerHTML', {
        get() { return markup; },
        set(value) { markup = value; element.children = []; }
    });
    return element;
};

function hourlyWidget(hours, theme = 'blue') {
    global.document.createElement = makeElement;

    const holders = {};
    const holder = () => ({ innerHTML: '', textContent: '', style: {}, hidden: true });
    ['hourly-caption-hours', 'hourly-caption-precip', 'precip-bars', 'chart-line',
        'chart-marker', 'legend-precip', 'hourly-chart']
        .forEach((id) => { holders[id] = holder(); });
    holders['hourly-temps'] = makeElement();
    holders['chart-line'].setAttribute = (name, value) => {
        holders['chart-line'][name] = value;
    };
    holders['hourly-chart'].setAttribute = (name, value) => {
        holders['hourly-chart'][name] = value;
    };

    const widget = Object.create(HourlyForecastWidget.prototype);
    widget.config = { hourly: true };
    widget.data = { hourly: hours };
    widget.getAttribute = () => theme;
    widget.shadowRoot = { getElementById: (id) => holders[id] ?? null };
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    return { widget, holders };
}

const cellText = (cell, className) =>
    cell.children.find((child) => child.className === className)?.textContent ?? '';

test('the caption counts the hours actually rendered', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 50, 10), hourAt(1, 52, 20), hourAt(2, 54, 30)
    ]);

    widget.update();

    assert.equal(holders['hourly-caption-hours'].textContent, 'Next 3 hours');
    assert.equal((holders['precip-bars'].innerHTML.match(/precip-cell/g) || []).length, 3);
    assert.equal(holders['hourly-temps'].children.length, 3);
});

test('twelve hours is the ceiling', () => {
    const hours = Array.from({ length: 24 }, (_, index) => hourAt(index, 50, 10));
    const { widget, holders } = hourlyWidget(hours);

    widget.update();

    assert.equal(holders['hourly-caption-hours'].textContent, 'Next 12 hours');
    assert.equal((holders['precip-bars'].innerHTML.match(/precip-cell/g) || []).length, 12);
});

test('the line lands on the exact bar centers', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 40, 10), hourAt(1, 60, 20)
    ]);

    widget.update();

    assert.equal(holders['chart-line'].points, '250,86 750,14');
});

test('the marker sits on the first point', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 40, 10), hourAt(1, 60, 20)
    ]);

    widget.update();

    assert.equal(holders['chart-marker'].style.left, '25%');
    assert.equal(holders['chart-marker'].hidden, false);
});

test('the hourly chart never measures itself', () => {
    // The chart is a fixed viewBox with preserveAspectRatio="none". A
    // measurement pass reintroduces the resize loop the fixed viewBox exists
    // to avoid.
    const hourly = hourlyWidgetSource();

    assert.doesNotMatch(hourly, /ResizeObserver/);
    assert.doesNotMatch(hourly, /getBoundingClientRect/);
});

test('the hourly chart draws no circle', () => {
    // The same fixed viewBox scales x and y by different factors, so a circle
    // in that SVG paints as an ellipse. The current-hour marker is a
    // positioned HTML element for exactly this reason.
    const hourly = hourlyWidgetSource();

    assert.doesNotMatch(hourly, /<circle/);
});

test('precipitation labels appear at forty percent and above', () => {
    const { widget, holders } = hourlyWidget([
        hourAt(0, 50, 39), hourAt(1, 52, 40), hourAt(2, 54, 80)
    ]);

    widget.update();

    const labels = holders['hourly-temps'].children
        .map((cell) => cellText(cell, 'hour-precip'));
    assert.deepEqual(labels, ['', '40%', '80%']);
});

test('the caption names the precipitation window and drops it when there is none', () => {
    const wet = hourlyWidget([hourAt(0, 50, 70), hourAt(1, 52, 80), hourAt(2, 54, 10)]);
    wet.widget.update();
    assert.equal(wet.holders['hourly-caption-precip'].textContent, 'Rain 1pm–2pm');
    assert.equal(wet.holders['legend-precip'].textContent, 'rain chance');

    const dry = hourlyWidget([hourAt(0, 50, 10), hourAt(1, 52, 20)]);
    dry.widget.update();
    assert.equal(dry.holders['hourly-caption-precip'].textContent, '');
    assert.equal(dry.holders['legend-precip'].textContent, 'precipitation chance');
});

test('the eInk chart uses its own height and padding', () => {
    const { widget, holders } = hourlyWidget(
        [hourAt(0, 40, 10), hourAt(1, 60, 20)],
        'eink'
    );

    widget.update();

    assert.equal(holders['hourly-chart'].viewBox, '0 0 1000 180');
    assert.equal(holders['chart-line'].points, '250,104 750,16');
});

test('renders time inside each hourly cell without a second time row', () => {
    const widget = new HourlyForecastWidget();
    widget.render();

    assert.match(widget.shadowRoot.innerHTML, /id="hourly-temps"/);
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
    widget.shadowRoot = {
        getElementById: (id) => id === 'hourly-temps' ? hourlyContainer : { textContent: '', innerHTML: '' }
    };
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
    assert.doesNotMatch(hourDiv.innerHTMLAssignments[0], /<weather-icon/);
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

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.hour-time\s*\{[^}]*min-width:\s*0;[^}]*text-align:\s*center;[^}]*font-size:\s*clamp\(0\.4375rem, 1\.625vw, 0\.8125rem\);[^}]*font-weight:\s*800;/s);
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

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.hour-temp-value\s*\{[^}]*font-weight:\s*900;[^}]*font-size:\s*clamp\(0\.5625rem, 2\.5vw, 1\.25rem\);/s);
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

    assert.match(template, /\[data-theme="eink"\] \.weather-container\s*\{[^}]*max-width:\s*none;[^}]*width:\s*100%;[^}]*padding:\s*0\.5rem;[^}]*box-sizing:\s*border-box;/s);
    assert.doesNotMatch(template, /@media \(max-width:\s*390px\)[\s\S]*?\[data-theme="eink"\] \.weather-container/);
    assert.match(harness, /@media \(max-width:\s*390px\)\s*\{\s*body\[data-theme="eink"\]\s*\{[^}]*padding:\s*2rem 1rem;/s);
    assert.match(harness, /@media \(max-width:\s*390px\)[\s\S]*?\.test-section\s*\{[^}]*padding:\s*1rem 0;/);
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
    assert.match(styles, /\.chart-container\s*\{[^}]*height:\s*9\.375rem;/s);
});

// The line and the bars are two layers over one box. Overlaid and each scaled
// to the whole of it, a wet hour's bar covers the line it is drawn across, so
// the box is split: the line plots into the top share, a certain hour fills
// the rest, and neither reaches the other's zone.
const PRECIPITATION_BAND = 1 / 3;

const barHeights = (markup) =>
    [...markup.matchAll(/class="precip-bar"[^>]*height:\s*([\d.]+)%/g)]
        .map(([, percent]) => Number(percent));

test('the temperature line keeps clear of the precipitation band', () => {
    // Forty and sixty is a twenty-degree spread, wider than the ten-degree
    // floor, so the line runs the full height of the room it is given.
    const { widget, holders } = hourlyWidget([hourAt(0, 40, 0), hourAt(1, 60, 0)]);

    widget.update();

    const deepest = Math.max(
        ...holders['chart-line'].points.split(' ').map((point) => Number(point.split(',')[1]))
    );
    const bandTop = 150 * (1 - PRECIPITATION_BAND);
    assert.ok(deepest <= bandTop, `the line reached ${deepest}, inside the bars' band`);
    // Clearing the band is half the contract. A line that stops well short of
    // it has quietly given the bars two thirds of the chart.
    assert.ok(deepest > bandTop - 20, `the line only reached ${deepest} of ${bandTop}`);
});

test('a certain hour fills the precipitation band and no more', () => {
    const { widget, holders } = hourlyWidget([hourAt(0, 50, 100)]);

    widget.update();

    const [height] = barHeights(holders['precip-bars'].innerHTML);
    assert.ok(
        Math.abs(height - PRECIPITATION_BAND * 100) < 0.01,
        `a certain hour drew ${height}% of the chart`
    );
});

test('a dry hour draws no bar at all', () => {
    // The floor below would otherwise give a zero chance a visible stub.
    const { widget, holders } = hourlyWidget([hourAt(0, 50, 0), hourAt(1, 52, 30)]);

    widget.update();

    const markup = holders['precip-bars'].innerHTML;
    assert.equal((markup.match(/precip-cell/g) || []).length, 2, 'both cells hold their column');
    assert.equal(barHeights(markup).length, 1, 'a dry hour drew a bar');
});

test('a slight chance still draws something visible', () => {
    // The overnight forecast this panel shows runs 1-10% for hours at a time.
    // Scaled honestly into a band a third of a short chart, that is under a
    // pixel — which reads as a dry night rather than a slight chance. The
    // floor is a paint minimum in pixels, so it holds in both chart heights
    // and leaves the shape above it alone.
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    const floor = styles.match(/\.precip-bar\s*\{[^}]*min-height:\s*(\d+)px;/s);
    assert.ok(floor, 'no min-height floor on .precip-bar');
    assert.ok(Number(floor[1]) >= 3, `a ${floor[1]}px bar is not a visible mark`);
});
