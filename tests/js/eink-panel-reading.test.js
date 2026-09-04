// ABOUTME: Tests the clock and sun arithmetic that turns an API payload into a reading.
// ABOUTME: Covers am/pm wording, the day's sun entry, and where the day currently stands.

const assert = require('node:assert/strict');
const test = require('node:test');

const { clockLine, displayTime, todaysSun, skyClock, toReading } =
    require('../../static/js/eink-panel-model.js');

const SUN = {
    '2026-09-04': { sunrise: '2026-09-04T06:19', sunset: '2026-09-04T19:19' },
    '2026-09-05': { sunrise: '2026-09-05T06:20', sunset: '2026-09-05T19:17' }
};

function weatherPayload() {
    return {
        location: 'Chicago',
        current: {
            summary: 'Clear sky',
            temperature: 80,
            feels_like: 90,
            wet_bulb: 77
        },
        daily: [{ d: 'Fri', h: 96, l: 73 }],
        hourly: Array.from({ length: 24 }, (_, i) => ({
            t: `${((i + 9) % 12) + 1}${i < 3 ? 'am' : 'pm'}`,
            temp: 80 + i,
            rain: 5,
            gust: 7,
            uv: 3,
            precip_type: null
        })),
        sun: SUN
    };
}

test('the clock line names the day and a lowercase half', () => {
    assert.equal(clockLine(new Date(2026, 8, 4, 15, 10)), 'Fri 3:10pm');
    assert.equal(clockLine(new Date(2026, 8, 4, 9, 5)), 'Fri 9:05am');
});

test('midnight and noon read as twelve, not zero', () => {
    assert.equal(clockLine(new Date(2026, 8, 4, 0, 30)), 'Fri 12:30am');
    assert.equal(clockLine(new Date(2026, 8, 4, 12, 0)), 'Fri 12:00pm');
});

test('a twenty-four hour time becomes the panel wording', () => {
    assert.equal(displayTime('19:19'), '7:19pm');
    assert.equal(displayTime('06:19'), '6:19am');
    assert.equal(displayTime('00:05'), '12:05am');
    assert.equal(displayTime('12:00'), '12:00pm');
});

test('the sun entry for today is the one keyed by today', () => {
    assert.deepEqual(todaysSun(SUN, new Date(2026, 8, 5, 12, 0)), {
        sunrise: '06:20',
        sunset: '19:17'
    });
});

test('a date the forecast does not cover falls back to its first day', () => {
    // The panel keeps drawing rather than blanking when the sun block lags.
    assert.deepEqual(todaysSun(SUN, new Date(2026, 8, 9, 12, 0)), {
        sunrise: '06:19',
        sunset: '19:19'
    });
});

test('an afternoon is daytime and looks ahead to sunset', () => {
    const clock = skyClock({ sunrise: '06:19', sunset: '19:19' }, new Date(2026, 8, 4, 15, 10));

    assert.equal(clock.isDaytime, true);
    assert.equal(clock.isMorning, false);
    assert.deepEqual(clock.sunEvent, { kind: 'sunset', time: '7:19pm' });
});

test('an evening is night and looks ahead to sunrise', () => {
    const clock = skyClock({ sunrise: '06:19', sunset: '19:19' }, new Date(2026, 8, 4, 21, 5));

    assert.equal(clock.isDaytime, false);
    assert.equal(clock.isMorning, false);
    assert.deepEqual(clock.sunEvent, { kind: 'sunrise', time: '6:19am' });
});

test('the small hours are night and carry both ends of the coming day', () => {
    const clock = skyClock({ sunrise: '06:19', sunset: '19:19' }, new Date(2026, 8, 4, 3, 40));

    assert.equal(clock.isDaytime, false);
    assert.equal(clock.isMorning, true);
    assert.equal(clock.sunriseTime, '6:19am');
    assert.equal(clock.sunsetTime, '7:19pm');
});

test('the hour after sunrise still counts as morning', () => {
    // The fall scene reads 7:20am against a 7:04am sunrise and still names
    // both ends of the day, so the case runs past the sunrise itself.
    const clock = skyClock({ sunrise: '07:04', sunset: '18:12' }, new Date(2026, 8, 7, 7, 20));

    assert.equal(clock.isDaytime, true);
    assert.equal(clock.isMorning, true);
    assert.equal(clock.sunriseTime, '7:04am');
    assert.equal(clock.sunsetTime, '6:12pm');
});

test('an hour past sunrise the morning is over', () => {
    const clock = skyClock({ sunrise: '07:04', sunset: '18:12' }, new Date(2026, 8, 7, 8, 5));

    assert.equal(clock.isMorning, false);
});

test('the minute of sunset is already night', () => {
    const clock = skyClock({ sunrise: '06:19', sunset: '19:19' }, new Date(2026, 8, 4, 19, 19));

    assert.equal(clock.isDaytime, false);
});

test('a reading carries twelve hours in the shape the model reads', () => {
    const reading = toReading(weatherPayload(), 40, new Date(2026, 8, 4, 15, 10));

    assert.equal(reading.hours.length, 12);
    assert.deepEqual(Object.keys(reading.hours[0]).sort(), [
        'gust', 'precipType', 'rain', 't', 'temp', 'uv'
    ]);
    assert.equal(reading.darkHours.length, 12);
});

test('a reading takes its range from the first forecast day', () => {
    const reading = toReading(weatherPayload(), 40, new Date(2026, 8, 4, 15, 10));

    assert.equal(reading.high, 96);
    assert.equal(reading.low, 73);
    assert.equal(reading.temp, 80);
    assert.equal(reading.wetBulb, 77);
    assert.equal(reading.moonPercent, 40);
});
