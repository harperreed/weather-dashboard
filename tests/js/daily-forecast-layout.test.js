// ABOUTME: Tests daily chart geometry against the day-label grid it annotates.
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

const { calculateDailyChartPoints } = require('../../static/js/weather-components.js');

function styles() {
    return fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
}

test('centers day points in the same equal-width cells as the day labels', () => {
    const days = [{ h: 10, l: 0 }, { h: 20, l: 10 }, { h: 30, l: 20 }, { h: 40, l: 30 }];

    const points = calculateDailyChartPoints(days, 400, 100, 4);

    // Four labels divide 400 into cells centred at 50, 150, 250 and 350. An
    // edge-to-edge scale would put the first point at 0 and the last at 400,
    // where half of each end marker falls outside the SVG.
    assert.deepEqual(points.map(({ x }) => x), [50, 150, 250, 350]);
});

test('keeps both markers clear of the chart edges', () => {
    const days = [{ h: 30, l: 10 }, { h: 50, l: 0 }];

    const points = calculateDailyChartPoints(days, 200, 100, 4);

    // The marker radius is the padding, so the hottest high and the coldest
    // low still paint as whole circles.
    for (const { highY, lowY } of points) {
        assert.ok(highY >= 4 && highY <= 96, `highY ${highY} outside the pad`);
        assert.ok(lowY >= 4 && lowY <= 96, `lowY ${lowY} outside the pad`);
    }
    assert.equal(points[1].highY, 4);
    assert.equal(points[1].lowY, 96);
});

test('a high always sits above its low', () => {
    const days = [{ h: 40, l: 20 }, { h: 30, l: 25 }];

    const points = calculateDailyChartPoints(days, 200, 100, 4);

    for (const { highY, lowY } of points) {
        assert.ok(highY < lowY, `high ${highY} not above low ${lowY}`);
    }
});

test('centers a flat week vertically', () => {
    const days = [{ h: 20, l: 20 }, { h: 20, l: 20 }];

    const points = calculateDailyChartPoints(days, 200, 100, 4);

    assert.deepEqual(points, [
        { x: 50, highY: 50, lowY: 50 },
        { x: 150, highY: 50, lowY: 50 }
    ]);
});

test('draws nothing without days or without a box to draw in', () => {
    assert.deepEqual(calculateDailyChartPoints([], 400, 100, 4), []);
    assert.deepEqual(calculateDailyChartPoints([{ h: 1, l: 0 }], 0, 100, 4), []);
    assert.deepEqual(calculateDailyChartPoints([{ h: 1, l: 0 }], 400, 0, 4), []);
});

test('the day label grid divides the chart into gapless columns', () => {
    // The chart centres its points on an evenly divided width. A grid gap
    // walks the label centres off those points; cell padding gives the same
    // visual separation without moving them.
    const css = styles();
    const grid = css.match(/\.daily-forecast\s*\{[^}]*\}/s)?.[0] || '';

    assert.match(grid, /display:\s*grid;/);
    assert.match(grid, /gap:\s*0;/);
});
