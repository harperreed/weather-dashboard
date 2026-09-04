// ABOUTME: Tests the eInk panel's view model against the four reference scenes.
// ABOUTME: Bar widths, chart geometry, channel choice and footer copy all come from here.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildPanelModel,
    barPercent,
    selectChannel,
    temperatureBars,
    chartGeometry,
    darkBands,
    markDarkHours
} = require('../../static/js/eink-panel-model.js');

// The reference builds each scene from three parallel series. Reshaped here
// into the per-hour records the weather API actually returns.
function hours(times, temps, rains, gusts, uvs, precipType = 'rain') {
    return times.map((t, i) => ({
        t,
        temp: temps[i],
        rain: rains[i],
        gust: gusts ? gusts[i] : 0,
        uv: uvs ? uvs[i] : 0,
        precipType: rains[i] > 0 ? precipType : null
    }));
}

const SPRING = {
    now: 'Thu 3:10pm',
    summary: 'Thunderstorms building',
    temp: 64, feels: 64, wetBulb: 58, high: 71, low: 44,
    hours: hours(
        ['3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am','1am','2am'],
        [64,66,71,68,62,57,54,51,49,47,46,44],
        [20,45,80,90,85,60,30,20,10,10,10,10]
    ),
    dark: [5, 12]
};

const SUMMER = {
    now: 'Sat 12:45pm',
    summary: 'Hazy, oppressive humidity',
    temp: 94, feels: 106, wetBulb: 82, high: 99, low: 79,
    hours: hours(
        ['1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am'],
        [95,97,99,99,98,96,93,90,87,85,83,81],
        [5,5,10,15,15,10,5,5,5,5,5,5],
        null,
        [10,11,11,10,8,6,4,2,0,0,0,0]
    ),
    dark: [8, 12]
};

const FALL = {
    now: 'Mon 7:20am',
    summary: 'Clear, gusty off the lake',
    temp: 41, feels: 33, wetBulb: 37, high: 54, low: 38,
    hours: hours(
        ['8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm'],
        [42,44,47,50,52,54,54,53,51,48,45,43],
        [5,5,5,5,10,10,10,15,15,10,5,5],
        [28,31,34,36,38,35,30,26,22,18,15,12]
    ),
    dark: [11, 12]
};

const WINTER = {
    now: 'Wed 9:05pm',
    summary: 'Light snow, dangerous wind chill',
    temp: -4, feels: -27, wetBulb: -6, high: 3, low: -11,
    hours: hours(
        ['10pm','11pm','12am','1am','2am','3am','4am','5am','6am','7am','8am','9am'],
        [-5,-6,-7,-8,-9,-10,-11,-11,-10,-8,-5,-2],
        [70,75,65,50,40,30,20,10,10,5,5,5],
        null,
        null,
        'snow'
    ),
    dark: [0, 10]
};

test('the spring scene charts precipitation chance', () => {
    const channel = selectChannel(SPRING.hours);

    assert.equal(channel.name, 'precip');
    assert.equal(channel.caption, 'Rain 5pm–8pm');
    assert.equal(channel.legend, 'Chance of rain');
});

test('a dry, breezy scene falls through to wind gusts', () => {
    const channel = selectChannel(FALL.hours);

    assert.equal(channel.name, 'wind');
    assert.equal(channel.caption, 'Gusts 38 mph 8am–3pm');
    assert.equal(channel.legend, 'Wind gusts, mph');
});

test('a calm, dry scene falls through to UV index', () => {
    const channel = selectChannel(SUMMER.hours);

    assert.equal(channel.name, 'uv');
    assert.equal(channel.caption, 'UV 11 peak 2pm');
    assert.equal(channel.legend, 'UV index');
});

test('snow captions use the precipitation noun', () => {
    const channel = selectChannel(WINTER.hours);

    assert.equal(channel.caption, 'Snow 10pm–12am');
    assert.equal(channel.legend, 'Chance of snow');
});

test('a scene with nothing to say charts no bars', () => {
    const flat = hours(
        ['1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am','12pm'],
        [50,50,50,50,50,50,50,50,50,50,50,50],
        [0,0,0,0,0,0,0,0,0,0,0,0]
    );

    const channel = selectChannel(flat);

    assert.equal(channel.name, 'none');
    assert.equal(channel.caption, 'Dry, calm');
    assert.equal(channel.legend, '');
});

test('bars take nine tenths of the chart at the channel maximum', () => {
    assert.equal(barPercent(100, 100), 90);
    assert.equal(barPercent(45, 100), 41);
    // An empty hour still draws a visible foot so the column reads as a bar.
    assert.equal(barPercent(0, 100), 2);
});

test('the temperature bars scale against a floor of zero', () => {
    // Spring: all three readings are positive, so zero anchors the scale and
    // the warmest reading fills the track.
    assert.deepEqual(temperatureBars({ air: 64, wetBulb: 58, feels: 64 }), {
        air: 100, wetBulb: 91, feels: 100
    });
});

test('a scene below zero rescales to its own coldest reading', () => {
    // Winter: the wind chill at -27 is the floor, so AIR fills the track and
    // FEELS collapses to the two percent minimum.
    assert.deepEqual(temperatureBars({ air: -4, wetBulb: -6, feels: -27 }), {
        air: 100, wetBulb: 91, feels: 2
    });
});

test('the summer scene puts feels-like ahead of air', () => {
    assert.deepEqual(temperatureBars({ air: 94, wetBulb: 82, feels: 106 }), {
        air: 89, wetBulb: 77, feels: 100
    });
});

test('the temperature line centres a flat twelve hours', () => {
    const flat = new Array(12).fill(60);

    const { points } = chartGeometry(flat);

    assert.ok(points.every(([, y]) => y === 115));
});

test('the temperature line spans the reference viewBox', () => {
    const { points } = chartGeometry(SPRING.hours.map((h) => h.temp));

    // Columns are 632/12 wide and the line is centred in each; the warmest
    // hour sits on the 16px top pad, the coldest on 214.
    assert.deepEqual(points[0].map((n) => Number(n.toFixed(4))), [26.3333, 67.3333]);
    assert.deepEqual(points[2].map((n) => Number(n.toFixed(4))), [131.6667, 16]);
    assert.deepEqual(points[11].map((n) => Number(n.toFixed(4))), [605.6667, 214]);
});

test('dark hours become one band per unbroken run', () => {
    const night = [false, false, true, true, true, false, false, true, true, false, false, false];

    assert.deepEqual(darkBands(night), [
        { left: 2 / 12, width: 3 / 12 },
        { left: 7 / 12, width: 2 / 12 }
    ]);
});

test('a fully dark window is one band across the chart', () => {
    assert.deepEqual(darkBands(new Array(12).fill(true)), [{ left: 0, width: 1 }]);
});

test('a fully lit window draws no band', () => {
    assert.deepEqual(darkBands(new Array(12).fill(false)), []);
});

test('the spring panel reproduces the reference', () => {
    const model = buildPanelModel({
        ...SPRING,
        location: 'Chicago',
        isDaytime: true,
        sunEvent: { kind: 'sunset', time: '7:32pm' },
        moonPercent: 34,
        darkHours: SPRING.hours.map((_, i) => i >= 5)
    });

    assert.equal(model.locationLine, 'Chicago · Thu 3:10pm');
    assert.deepEqual(model.bars, { air: 100, wetBulb: 91, feels: 100 });
    assert.deepEqual(
        model.hours.map((h) => h.barPercent),
        [18, 41, 72, 81, 77, 54, 27, 18, 9, 9, 9, 9]
    );
    assert.deepEqual(
        model.hours.map((h) => h.channelLabel),
        ['', '45%', '80%', '90%', '85%', '60%', '', '', '', '', '', '']
    );
    assert.deepEqual(model.darkBands, [{ left: 5 / 12, width: 7 / 12 }]);
    assert.deepEqual(model.footer, [
        'Feels like 64°',
        '44° tonight',
        'Sunset 7:32pm · Moon 34%'
    ]);
});

test('a hard wind chill leads the footer', () => {
    const model = buildPanelModel({
        ...WINTER,
        location: 'Chicago',
        isDaytime: false,
        sunEvent: { kind: 'sunrise', time: '7:14am' },
        moonPercent: 12,
        darkHours: WINTER.hours.map((_, i) => i < 10)
    });

    assert.deepEqual(model.footer, [
        'Feels like -27° in the wind',
        '-11° tonight',
        'Sunrise 7:14am · Moon 12%'
    ]);
});

test('a dangerous wet bulb outranks the overnight low', () => {
    const model = buildPanelModel({
        ...SUMMER,
        location: 'Chicago',
        isDaytime: true,
        sunEvent: { kind: 'sunset', time: '8:24pm' },
        moonPercent: 91,
        darkHours: SUMMER.hours.map((_, i) => i >= 8)
    });

    assert.deepEqual(model.footer, [
        'Humidity makes it feel like 106°',
        'Wet bulb dangerous — avoid exertion',
        'Sunset 8:24pm · Moon 91%'
    ]);
});

test('a high but survivable wet bulb warns without alarming', () => {
    const model = buildPanelModel({
        ...SUMMER,
        wetBulb: 72,
        location: 'Chicago',
        isDaytime: true,
        sunEvent: { kind: 'sunset', time: '8:24pm' },
        moonPercent: 91,
        darkHours: SUMMER.hours.map(() => false)
    });

    assert.equal(model.footer[1], 'Wet bulb high — limit hard exertion');
});

test('a missing wet bulb drops its bar rather than charting a zero', () => {
    const model = buildPanelModel({
        ...SPRING,
        wetBulb: null,
        location: 'Chicago',
        isDaytime: true,
        sunEvent: { kind: 'sunset', time: '7:32pm' },
        moonPercent: 34,
        darkHours: SPRING.hours.map(() => false)
    });

    assert.equal(model.bars.wetBulb, null);
    assert.deepEqual(model.footer[1], '44° tonight');
});


test('a triggered precipitation channel with no likely hour says so', () => {
    // Every hour clears the 20% trigger but none reaches the 60% the window
    // is drawn from, so the caption reports the chance without inventing one.
    const showers = hours(
        ['1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am'],
        [70,70,70,70,70,70,70,70,70,70,70,70],
        [25,30,35,30,25,25,30,35,30,25,25,25]
    );

    assert.equal(selectChannel(showers).caption, 'Rain possible');
});

test('a breezy scene with no strong gust says only that', () => {
    const breezy = hours(
        ['1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am'],
        [60,60,60,60,60,60,60,60,60,60,60,60],
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [21,22,23,22,21,20,20,21,22,21,20,20]
    );

    assert.equal(selectChannel(breezy).caption, 'Breezy');
});

test('the precipitation window covers one unbroken run', () => {
    // A second burst late in the window must not stretch the first one across
    // the dry hours between them.
    const twoBursts = hours(
        ['1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am'],
        [70,70,70,70,70,70,70,70,70,70,70,70],
        [80,90,20,20,20,20,20,20,20,20,70,75]
    );

    assert.equal(selectChannel(twoBursts).caption, 'Rain 1pm–2pm');
});

test('mixed precipitation types fall back to a neutral noun', () => {
    const mixed = hours(
        ['1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm','12am'],
        [34,34,34,34,34,34,34,34,34,34,34,34],
        [80,80,80,80,20,20,20,20,20,20,20,20]
    );
    mixed[0].precipType = 'snow';

    assert.equal(selectChannel(mixed).caption, 'Precip 1pm–4pm');
});

test('the pre-dawn sky clock names both ends of the day', () => {
    const model = buildPanelModel({
        ...FALL,
        now: 'Mon 6:20am',
        location: 'Chicago',
        isDaytime: false,
        isMorning: true,
        sunriseTime: '7:04am',
        sunsetTime: '6:12pm',
        moonPercent: 8,
        darkHours: FALL.hours.map(() => false)
    });

    assert.equal(model.footer[2], 'Sunrise 7:04am · Sunset 6:12pm');
});

test('an hour counts as dark when it begins after sunset', () => {
    // Spring: sunset lands inside the 7pm hour, which the panel still draws as
    // daylight because it opens in the light.
    const dark = markDarkHours(SPRING.hours, { sunrise: '06:19', sunset: '19:32' });

    assert.deepEqual(dark, [
        false, false, false, false, false,
        true, true, true, true, true, true, true
    ]);
});

test('an hour counts as dark when it begins before sunrise', () => {
    // Winter: the 7am hour opens fourteen minutes before sunrise, so it is dark
    // and the 8am hour is the first light one.
    const dark = markDarkHours(WINTER.hours, { sunrise: '07:14', sunset: '16:30' });

    assert.deepEqual(dark, [
        true, true, true, true, true, true, true, true, true, true,
        false, false
    ]);
});

test('a daylight window ends dark only after its sunset hour', () => {
    const dark = markDarkHours(FALL.hours, { sunrise: '07:04', sunset: '18:12' });

    assert.deepEqual(dark.slice(9), [false, false, true]);
});

test('an afternoon window turns dark at the hour past sunset', () => {
    const dark = markDarkHours(SUMMER.hours, { sunrise: '05:26', sunset: '20:24' });

    assert.deepEqual(dark, [
        false, false, false, false, false, false, false, false,
        true, true, true, true
    ]);
});

test('noon and midnight labels read as themselves', () => {
    const midnight = markDarkHours(
        [{ t: '12am' }, { t: '12pm' }],
        { sunrise: '06:00', sunset: '20:00' }
    );

    assert.deepEqual(midnight, [true, false]);
});
