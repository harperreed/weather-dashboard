// ABOUTME: Builds the dashboard's rule-based insight sentence and short facts.
// ABOUTME: Pure functions with no DOM or network access, shared by every theme.

const WIND_CHILL_GAP = 10;
const PRECIPITATION_CHANCE = 60;
const COLD_NIGHT_LIMIT = 20;
const COOL_NIGHT_LIMIT = 45;
const DANGEROUS_WET_BULB = 80;
const HARD_EXERTION_WET_BULB = 70;
const COMFORTABLE_WET_BULB = 50;

const PRECIPITATION_NOUNS = new Map([
    ['snow', 'Snow'],
    ['heavy-snow', 'Snow'],
    ['light-snow', 'Snow'],
    ['sleet', 'Sleet'],
    ['rain', 'Rain'],
    ['heavy-rain', 'Rain'],
    ['light-rain', 'Rain']
]);

function calculateWetbulbTemp(tempF, humidity) {
    const tempC = (tempF - 32) * 5 / 9;
    const rh = humidity;

    // Stull approximation for wetbulb temperature
    const wetbulbC = tempC * Math.atan(0.152 * Math.sqrt(rh + 8.3136))
        + Math.atan(tempC + rh)
        - Math.atan(rh - 1.6763)
        + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
        - 4.686035;

    return Math.round(wetbulbC * 9 / 5 + 32);
}

function wetBulbPosition(feels, wetBulb, air) {
    if (![feels, wetBulb, air].every(Number.isFinite)) return null;
    if (air === feels) return 100;

    const percent = ((wetBulb - feels) / (air - feels)) * 100;
    return Math.min(100, Math.max(0, percent));
}

function wetBulbClause(wetBulb) {
    if (!Number.isFinite(wetBulb)) return '';
    if (wetBulb >= DANGEROUS_WET_BULB) return 'dangerous for exertion';
    if (wetBulb >= HARD_EXERTION_WET_BULB) return 'limit hard exertion';
    if (wetBulb < COMFORTABLE_WET_BULB) {
        return 'safe for exertion above 50°, this is well under';
    }
    return '';
}

function precipitationNoun(icons) {
    const nouns = new Set(
        (icons || []).map((icon) => PRECIPITATION_NOUNS.get(icon)).filter(Boolean)
    );
    return nouns.size === 1 ? [...nouns][0] : 'Precipitation';
}

function precipitationWindow(hours) {
    const list = Array.isArray(hours) ? hours : [];
    let first = -1;
    let last = -1;

    for (let index = 0; index < list.length; index += 1) {
        const chance = list[index]?.rain;
        const qualifies = Number.isFinite(chance) && chance >= PRECIPITATION_CHANCE;

        if (qualifies) {
            if (first === -1) first = index;
            last = index;
        } else if (first !== -1) {
            break;
        }
    }

    if (first === -1) return null;

    const run = list.slice(first, last + 1);
    const peak = run.reduce(
        (heaviest, hour) => (hour.rain > heaviest.rain ? hour : heaviest),
        run[0]
    );

    return {
        start: run[0].t,
        end: run[run.length - 1].t,
        peak: peak.t,
        noun: precipitationNoun(run.map(({ icon }) => icon))
    };
}

function windChillFragment(current) {
    const temperature = current?.temperature;
    const feels = current?.feels_like;
    if (!Number.isFinite(temperature) || !Number.isFinite(feels)) return null;
    if (temperature - feels < WIND_CHILL_GAP) return null;

    return {
        long: `Wind makes ${temperature}° feel like ${feels}°.`,
        short: `Feels like ${feels}° in the wind`
    };
}

function precipitationFragment(window) {
    if (!window) return null;

    return {
        long: `${window.noun} likely ${window.start}–${window.end}, `
            + `heaviest around ${window.peak}.`,
        short: `${window.noun} ${window.start}–${window.end}`
    };
}

function overnightFragment(daily) {
    const low = daily?.[0]?.l;
    if (!Number.isFinite(low)) return null;

    let clause = '';
    if (low < COLD_NIGHT_LIMIT) clause = ' — layers and a hat';
    else if (low <= COOL_NIGHT_LIMIT) clause = ' — bring a jacket';

    return {
        long: `Falling to ${low}° overnight${clause}.`,
        short: `${low}° overnight`
    };
}

function insightFragments(data, hours) {
    return [
        windChillFragment(data?.current),
        precipitationFragment(precipitationWindow(hours)),
        overnightFragment(data?.daily)
    ].filter(Boolean);
}

function insightSentence(data, hours) {
    return insightFragments(data, hours).map(({ long }) => long).join(' ');
}

function insightFacts(data, hours) {
    return insightFragments(data, hours).map(({ short }) => short);
}

const WeatherInsights = {
    calculateWetbulbTemp,
    insightFacts,
    insightFragments,
    insightSentence,
    precipitationNoun,
    precipitationWindow,
    wetBulbClause,
    wetBulbPosition
};

if (typeof window !== 'undefined') window.WeatherInsights = WeatherInsights;
if (typeof module !== 'undefined' && module.exports) module.exports = WeatherInsights;
