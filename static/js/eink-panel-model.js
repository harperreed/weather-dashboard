// ABOUTME: Turns a weather reading into the eInk panel's view model.
// ABOUTME: Bar widths, chart geometry, the adaptive channel and footer copy live here.

(function (root, factory) {
    const model = factory();
    if (typeof module === 'object' && module.exports) module.exports = model;
    else root.EinkPanelModel = model;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The chart draws into a fixed viewBox stretched to the card, so these are
    // user units rather than pixels. The pad keeps the end markers whole.
    const CHART_WIDTH = 632;
    const CHART_HEIGHT = 230;
    const CHART_PAD = 16;
    // A bar at the channel maximum stops short of the chart's top so the
    // temperature line stays readable over it.
    const BAR_CEILING = 90;
    const BAR_FLOOR = 2;

    const PRECIP_TRIGGER = 20;
    const PRECIP_LIKELY = 60;
    const PRECIP_LABEL_AT = 40;
    const GUST_TRIGGER = 20;
    const GUST_STRONG = 25;
    const GUST_SCALE_FLOOR = 40;
    const UV_TRIGGER = 6;
    const UV_SCALE = 11;

    const WIND_CHILL_GAP = 10;
    const HUMIDITY_GAP = 6;
    const WET_BULB_DANGEROUS = 80;
    const WET_BULB_HIGH = 70;
    // How long after sunrise the day's whole arc is still the useful fact.
    const MORNING_MINUTES_PAST_SUNRISE = 60;

    const EN_DASH = '–';
    const MIDDLE_DOT = '·';

    function capitalize(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    /** Percent of the chart height one bar fills */
    function barPercent(value, max) {
        const scaled = Math.round((value / (max || 1)) * BAR_CEILING);
        return Math.max(BAR_FLOOR, scaled);
    }

    /** The first unbroken run of hours meeting a test, as [start, end] */
    function firstRun(values, meets) {
        const start = values.findIndex(meets);
        if (start < 0) return null;

        let end = start;
        while (end + 1 < values.length && meets(values[end + 1])) end += 1;
        return [start, end];
    }

    /** The precipitation word for a window: one type, or a neutral fallback */
    function precipitationNoun(hours) {
        const types = new Set(
            hours.map((hour) => hour.precipType).filter(Boolean)
        );
        return types.size === 1 ? capitalize([...types][0]) : 'Precip';
    }

    function precipitationChannel(hours) {
        const chances = hours.map((hour) => hour.rain);
        const noun = precipitationNoun(hours);
        const run = firstRun(chances, (chance) => chance >= PRECIP_LIKELY);

        // A window is only worth naming where the chance is high enough to act
        // on. Below that the panel reports the chance and stops.
        const caption = run
            ? `${noun} ${hours[run[0]].t}${EN_DASH}${hours[run[1]].t}`
            : `${noun} possible`;

        return {
            name: 'precip',
            legend: `Chance of ${noun.toLowerCase()}`,
            caption,
            values: chances,
            max: 100,
            labelAt: PRECIP_LABEL_AT,
            unit: '%'
        };
    }

    function windChannel(hours) {
        const gusts = hours.map((hour) => hour.gust);
        const peak = Math.max(...gusts);
        const strong = gusts
            .map((gust, index) => (gust >= GUST_STRONG ? index : -1))
            .filter((index) => index >= 0);

        const caption = strong.length
            ? `Gusts ${peak} mph ${hours[strong[0]].t}${EN_DASH}${hours[strong[strong.length - 1]].t}`
            : 'Breezy';

        return {
            name: 'wind',
            legend: 'Wind gusts, mph',
            caption,
            values: gusts,
            max: Math.max(GUST_SCALE_FLOOR, peak),
            labelAt: GUST_STRONG,
            unit: ''
        };
    }

    function ultravioletChannel(hours) {
        const readings = hours.map((hour) => hour.uv);
        const peak = Math.max(...readings);

        return {
            name: 'uv',
            legend: 'UV index',
            caption: `UV ${peak} peak ${hours[readings.indexOf(peak)].t}`,
            values: readings,
            max: UV_SCALE,
            labelAt: UV_TRIGGER,
            unit: ''
        };
    }

    function quietChannel(hours) {
        return {
            name: 'none',
            legend: '',
            caption: 'Dry, calm',
            values: hours.map(() => 0),
            max: 1,
            labelAt: Infinity,
            unit: ''
        };
    }

    /**
     * The single most decision-relevant series for the next twelve hours.
     * Evaluated in priority order; the first channel that triggers wins.
     */
    function selectChannel(hours) {
        const peak = (field) => Math.max(...hours.map((hour) => hour[field] || 0));

        if (peak('rain') >= PRECIP_TRIGGER) return precipitationChannel(hours);
        if (peak('gust') >= GUST_TRIGGER) return windChannel(hours);
        if (peak('uv') >= UV_TRIGGER) return ultravioletChannel(hours);
        return quietChannel(hours);
    }

    /**
     * Bar widths for the air, wet bulb and feels-like readings, as percentages
     * of the widest. Freezing anchors the scale so a mild day reads as mild;
     * a reading below zero takes over as the floor.
     */
    function temperatureBars({ air, wetBulb, feels }) {
        const present = [air, wetBulb, feels].filter((v) => v !== null && v !== undefined);
        const low = Math.min(0, ...present);
        const high = Math.max(...present);
        const span = high - low || 1;

        const scale = (value) =>
            value === null || value === undefined
                ? null
                : Math.max(BAR_FLOOR, Math.round(((value - low) / span) * 100));

        return { air: scale(air), wetBulb: scale(wetBulb), feels: scale(feels) };
    }

    /**
     * Points for the temperature line, centred in the same twelve columns the
     * hour labels use. A flat window sits mid-chart rather than on the floor.
     */
    function chartGeometry(temperatures) {
        const low = Math.min(...temperatures);
        const high = Math.max(...temperatures);
        const span = high - low;
        const plot = CHART_HEIGHT - CHART_PAD * 2;
        const column = CHART_WIDTH / temperatures.length;

        const points = temperatures.map((temperature, index) => {
            const fraction = span ? (temperature - low) / span : 0.5;
            return [(index + 0.5) * column, CHART_PAD + (1 - fraction) * plot];
        });

        return { points, width: CHART_WIDTH, height: CHART_HEIGHT };
    }

    /** Each unbroken run of dark hours, as a fraction of the chart width */
    function darkBands(darkHours) {
        const bands = [];
        let start = null;

        darkHours.forEach((dark, index) => {
            if (dark && start === null) start = index;
            if (!dark && start !== null) {
                bands.push({ left: start / darkHours.length, width: (index - start) / darkHours.length });
                start = null;
            }
        });

        if (start !== null) {
            bands.push({ left: start / darkHours.length, width: (darkHours.length - start) / darkHours.length });
        }
        return bands;
    }

    const HOURS_PER_HALF_DAY = 12;

    /** The 24-hour clock hour behind a label like "7pm" or "12am" */
    function parseHourLabel(label) {
        const hour = parseInt(label, 10) % HOURS_PER_HALF_DAY;
        return /pm$/i.test(label) ? hour + HOURS_PER_HALF_DAY : hour;
    }

    function clockFraction(time) {
        const [hour, minute] = time.split(':').map(Number);
        return hour + minute / 60;
    }

    /**
     * Which of the twelve hours are dark. An hour is dark when it begins in
     * darkness, so the hour sunset falls inside still reads as daylight.
     */
    function markDarkHours(hours, { sunrise, sunset }) {
        const dawn = clockFraction(sunrise);
        const dusk = clockFraction(sunset);

        return hours.map((hour) => {
            const start = parseHourLabel(hour.t);
            return start < dawn || start >= dusk;
        });
    }

    const HOUR_COUNT = 12;

    /** "Fri 3:10pm" — the panel's own clock, not the reading's timestamp */
    function clockLine(now) {
        const day = now.toLocaleDateString('en-US', { weekday: 'short' });
        const hour = now.getHours() % HOURS_PER_HALF_DAY || HOURS_PER_HALF_DAY;
        const minute = String(now.getMinutes()).padStart(2, '0');
        const half = now.getHours() < HOURS_PER_HALF_DAY ? 'am' : 'pm';
        return `${day} ${hour}:${minute}${half}`;
    }

    /** A "19:19" clock time as the panel writes it: "7:19pm" */
    function displayTime(time) {
        const [hour, minute] = time.split(':').map(Number);
        const half = hour < HOURS_PER_HALF_DAY ? 'am' : 'pm';
        return `${hour % HOURS_PER_HALF_DAY || HOURS_PER_HALF_DAY}:${String(minute).padStart(2, '0')}${half}`;
    }

    /**
     * Today's sunrise and sunset as clock times. A forecast that no longer
     * reaches today still yields a usable pair rather than blanking the panel.
     */
    function todaysSun(sun, now) {
        const today = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');
        const entry = (sun && sun[today]) || Object.values(sun || {})[0];

        return {
            sunrise: entry.sunrise.split('T')[1],
            sunset: entry.sunset.split('T')[1]
        };
    }

    /** Where the day currently stands, and which sun event is next */
    function skyClock(sun, now) {
        const minutes = now.getHours() * 60 + now.getMinutes();
        const asMinutes = (time) => clockFraction(time) * 60;

        const sunrise = asMinutes(sun.sunrise);
        const isDaytime = minutes >= sunrise && minutes < asMinutes(sun.sunset);
        const next = isDaytime ? 'sunset' : 'sunrise';

        return {
            isMorning: minutes < sunrise + MORNING_MINUTES_PAST_SUNRISE,
            isDaytime,
            sunEvent: { kind: next, time: displayTime(sun[next]) },
            sunriseTime: displayTime(sun.sunrise),
            sunsetTime: displayTime(sun.sunset)
        };
    }

    /** One weather API payload, in the shape buildPanelModel reads */
    function toReading(weather, moonPercent, now) {
        const sun = todaysSun(weather.sun, now);
        const hours = weather.hourly.slice(0, HOUR_COUNT).map((hour) => ({
            t: hour.t,
            temp: hour.temp,
            rain: hour.rain,
            gust: hour.gust,
            uv: hour.uv,
            precipType: hour.precip_type
        }));

        return {
            location: weather.location,
            now: clockLine(now),
            summary: weather.current.summary,
            temp: weather.current.temperature,
            feels: weather.current.feels_like,
            wetBulb: weather.current.wet_bulb,
            high: weather.daily[0].h,
            low: weather.daily[0].l,
            hours,
            darkHours: markDarkHours(hours, sun),
            moonPercent,
            ...skyClock(sun, now)
        };
    }

    function feelsInsight({ temp, feels }) {
        if (temp - feels >= WIND_CHILL_GAP) return `Feels like ${feels}° in the wind`;
        if (feels - temp >= HUMIDITY_GAP) return `Humidity makes it feel like ${feels}°`;
        return `Feels like ${feels}°`;
    }

    function headlineInsight({ wetBulb, low }) {
        if (wetBulb !== null && wetBulb !== undefined) {
            if (wetBulb >= WET_BULB_DANGEROUS) return 'Wet bulb dangerous — avoid exertion';
            if (wetBulb >= WET_BULB_HIGH) return 'Wet bulb high — limit hard exertion';
        }
        return `${low}° tonight`;
    }

    function skyInsight({ isDaytime, isMorning, sunEvent, sunriseTime, sunsetTime, moonPercent }) {
        // Through the morning both ends of the day are the news, and that is
        // more use than a moon nobody is going to look at.
        if (isMorning) return `Sunrise ${sunriseTime} ${MIDDLE_DOT} Sunset ${sunsetTime}`;

        const label = isDaytime ? 'Sunset' : 'Sunrise';
        return `${label} ${sunEvent.time} ${MIDDLE_DOT} Moon ${moonPercent}%`;
    }

    /** Everything the panel renders, derived once from one weather reading */
    function buildPanelModel(reading) {
        const hours = reading.hours.slice(0, HOUR_COUNT);
        const channel = selectChannel(hours);
        const darkHours = reading.darkHours.slice(0, HOUR_COUNT);

        return {
            locationLine: `${reading.location} ${MIDDLE_DOT} ${reading.now}`,
            summary: reading.summary,
            temp: reading.temp,
            high: reading.high,
            low: reading.low,
            wetBulb: reading.wetBulb,
            feels: reading.feels,
            bars: temperatureBars({
                air: reading.temp,
                wetBulb: reading.wetBulb,
                feels: reading.feels
            }),
            channel,
            hours: hours.map((hour, index) => ({
                t: hour.t,
                temp: hour.temp,
                barPercent: channel.name === 'none' ? 0 : barPercent(channel.values[index], channel.max),
                channelLabel:
                    channel.values[index] >= channel.labelAt
                        ? `${channel.values[index]}${channel.unit}`
                        : ''
            })),
            chart: chartGeometry(hours.map((hour) => hour.temp)),
            darkBands: darkBands(darkHours),
            footer: [feelsInsight(reading), headlineInsight(reading), skyInsight(reading)]
        };
    }

    return {
        buildPanelModel,
        barPercent,
        selectChannel,
        temperatureBars,
        chartGeometry,
        darkBands,
        markDarkHours,
        clockLine,
        displayTime,
        todaysSun,
        skyClock,
        toReading,
        precipitationNoun
    };
});
