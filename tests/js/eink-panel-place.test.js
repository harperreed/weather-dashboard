// ABOUTME: Tests how the panel turns its query string into a place to fetch.
// ABOUTME: Covers the zero coordinate a falsy fallback silently trades for Chicago.

const assert = require('node:assert/strict');
const test = require('node:test');

global.HTMLElement = class {};
global.customElements = { define() {} };

const { panelPlace } = require('../../static/js/eink-panel.js');

const CHICAGO = { lat: 41.8781, lon: -87.6298, name: 'Chicago' };

test('an empty query string asks for Chicago', () => {
    assert.deepEqual(panelPlace(''), CHICAGO);
});

test('lat, lon and location come from the query string', () => {
    assert.deepEqual(panelPlace('?lat=35.6762&lon=139.6503&location=Tokyo'), {
        lat: 35.6762,
        lon: 139.6503,
        name: 'Tokyo'
    });
});

test('a zero coordinate is a real place, not a missing one', () => {
    // Greenwich sits on the prime meridian. Treating 0 as absent swaps its
    // longitude for Chicago's and still labels the panel Greenwich.
    assert.deepEqual(panelPlace('?lat=51.4779&lon=0&location=Greenwich'), {
        lat: 51.4779,
        lon: 0,
        name: 'Greenwich'
    });
});

test('a coordinate that is not a number takes the whole pair back to Chicago', () => {
    // Half a coordinate pair points at open water, so the pair moves together.
    assert.deepEqual(panelPlace('?lat=somewhere&lon=139.6503'), {
        lat: CHICAGO.lat,
        lon: CHICAGO.lon,
        name: 'Chicago'
    });
});

test('a lone latitude does not strand the panel mid-ocean', () => {
    assert.deepEqual(panelPlace('?lat=35.6762&location=Tokyo'), {
        lat: CHICAGO.lat,
        lon: CHICAGO.lon,
        name: 'Tokyo'
    });
});
