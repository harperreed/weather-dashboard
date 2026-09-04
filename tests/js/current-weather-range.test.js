// ABOUTME: Unit tests for formatting today's high and low temperatures.
// ABOUTME: Runs the production JavaScript with Node's dependency-free test runner.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, after } = require('node:test');

global.HTMLElement = class {
    attachShadow() {
        this.shadowRoot = { innerHTML: '', getElementById: () => null };
        return this.shadowRoot;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };

const {
    CurrentWeatherWidget,
    formatDailyTemperatureRange,
    SolarProgressWidget
} = require('../../static/js/weather-components.js');

// Always build a CurrentWeatherWidget through this factory, never with
// `new CurrentWeatherWidget()` directly. render() starts a 60s clock
// interval, and a widget built outside this factory never gets it cleared —
// that leaves a live interval pinning the process, so node --test hangs the
// whole file instead of exiting, no matter how the tests themselves score.
// The factory tracks every instance this file constructs so a single
// after() hook below can clear all of them.
const createdCurrentWidgets = [];
function createCurrentWidget() {
    const widget = new CurrentWeatherWidget();
    createdCurrentWidgets.push(widget);
    return widget;
}

after(() => {
    createdCurrentWidgets.forEach((widget) => clearInterval(widget.clockTimer));
});

function currentWidgetWithData(current, theme = 'blue') {
    const styleHolder = () => {
        const style = {
            setProperty(name, value) { style[name] = String(value); }
        };
        return { textContent: '', style, innerHTML: '' };
    };
    const ids = ['temp', 'location', 'local-time', 'summary', 'feels-value',
        'wet-value', 'air-value', 'temp-scale',
        'three-temps-note', 'bar-air', 'bar-wet', 'bar-feels', 'daily-high',
        'daily-low'];
    const elements = Object.fromEntries(ids.map((id) => [id, styleHolder()]));
    elements['daily-range'] = {
        hidden: true,
        setAttribute() {},
        removeAttribute() {}
    };

    const widget = createCurrentWidget();
    widget.shadowRoot.getElementById = (id) => elements[id];
    widget.getAttribute = () => theme;
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    widget.data = { current, daily: [{ h: 50, l: 30 }], location: 'Chicago' };
    return { widget, elements };
}

test('renders the header, temperature block, and three-temperature module', () => {
    const widget = createCurrentWidget();
    widget.style = {};

    widget.render();

    const html = widget.shadowRoot.innerHTML;
    assert.match(html, /<div class="header-row">[\s\S]*?id="location"[\s\S]*?id="local-time"/);
    assert.match(html, /<div class="temperature" id="temp">/);
    assert.match(html, /<div class="current-text">/);
    assert.match(html, /id="daily-range" hidden/);
    assert.match(html, /id="feels-value"[\s\S]*?id="wet-value"[\s\S]*?id="air-value"/);
    assert.match(html, /class="scale-fill"[\s\S]*?class="scale-dot scale-dot-wet"/);
    assert.match(html, /id="three-temps-note"/);
});

test('shows a complete daily range and clears it when later data is missing', () => {
    const attributes = new Map();
    const styleHolder = () => {
        const style = {
            setProperty(name, value) { style[name] = String(value); }
        };
        return { textContent: '', style, innerHTML: '' };
    };
    const elements = {
        temp: styleHolder(),
        location: styleHolder(),
        'local-time': styleHolder(),
        summary: styleHolder(),
        'feels-value': styleHolder(),
        'wet-value': styleHolder(),
        'air-value': styleHolder(),
        'temp-scale': styleHolder(),
        'three-temps-note': styleHolder(),
        'bar-air': styleHolder(),
        'bar-wet': styleHolder(),
        'bar-feels': styleHolder(),
        'daily-range': {
            hidden: true,
            setAttribute(name, value) { attributes.set(name, value); },
            removeAttribute(name) { attributes.delete(name); }
        },
        'daily-high': { textContent: '' },
        'daily-low': { textContent: '' }
    };
    const widget = createCurrentWidget();
    widget.shadowRoot.getElementById = (id) => elements[id];
    widget.getAttribute = () => 'blue';
    widget.hideError = () => {};
    widget.hideLoading = () => {};
    widget.data = {
        current: {
            temperature: 70,
            feels_like: 69,
            summary: 'Clear',
            precipitation_rate: 0,
            precipitation_prob: 0
        },
        daily: [{ h: 77, l: 65 }]
    };

    widget.update();

    assert.equal(elements['daily-high'].textContent, '77°');
    assert.equal(elements['daily-low'].textContent, '65°');
    assert.equal(attributes.get('aria-label'), "Today's high 77 degrees, low 65 degrees.");
    assert.equal(elements['daily-range'].hidden, false);

    widget.data.daily = [];
    widget.update();

    assert.equal(elements['daily-high'].textContent, '');
    assert.equal(elements['daily-low'].textContent, '');
    assert.equal(attributes.has('aria-label'), false);
    assert.equal(elements['daily-range'].hidden, true);
});

test('the three temperatures read feels-like, wet bulb, and air', () => {
    const { widget, elements } = currentWidgetWithData({
        temperature: 88, feels_like: 94, humidity: 60, summary: 'Hazy'
    });

    widget.update();

    assert.equal(elements['air-value'].textContent, '88°');
    assert.equal(elements['feels-value'].textContent, '94°');
    assert.equal(elements['wet-value'].textContent, '77°');
});

test('the scale places the wet bulb between feels-like and air', () => {
    const { widget, elements } = currentWidgetWithData({
        temperature: 88, feels_like: 94, humidity: 60, summary: 'Hazy'
    });

    widget.update();

    // The track runs from feels-like (94) at 0% to air (88) at 100%. Wet
    // bulb 77 sits past the air end of that track, so it clamps to 100%.
    // One property drives both the fill and the dot; the CSS insets them by
    // half a dot so neither leaves the track.
    assert.equal(elements['temp-scale'].style['--wet-position'], '1');
});

test('every dot sits at the end when air equals feels-like', () => {
    const { widget, elements } = currentWidgetWithData({
        temperature: 70, feels_like: 70, humidity: 50, summary: 'Clear'
    });

    widget.update();

    assert.equal(elements['temp-scale'].style['--wet-position'], '1');
});

test('the explainer names the exertion band and drops it when comfortable', () => {
    const hot = currentWidgetWithData({
        temperature: 95, feels_like: 105, humidity: 70, summary: 'Hot'
    });
    hot.widget.update();
    assert.match(hot.elements['three-temps-note'].textContent, /dangerous for exertion$/);

    const mild = currentWidgetWithData({
        temperature: 68, feels_like: 68, humidity: 55, summary: 'Mild'
    });
    mild.widget.update();
    assert.doesNotMatch(mild.elements['three-temps-note'].textContent, /exertion/);
});

test('the eInk bars scale against air temperature and keep a negative value', () => {
    const { widget, elements } = currentWidgetWithData(
        { temperature: 40, feels_like: -5, humidity: 60, summary: 'Bitter' },
        'eink'
    );

    widget.update();

    assert.equal(elements['bar-air'].style.width, '100%');
    assert.equal(elements['bar-feels'].style.width, '0%');
    assert.equal(elements['feels-value'].textContent, '-5°');
});

test('formats today\'s high and low', () => {
    assert.deepEqual(
        formatDailyTemperatureRange([{ h: 77, l: 65 }]),
        {
            high: 77,
            low: 65,
            text: 'HIGH 77° LOW 65°',
            ariaLabel: "Today's high 77 degrees, low 65 degrees."
        }
    );
});

test('keeps zero and negative temperatures', () => {
    assert.deepEqual(
        formatDailyTemperatureRange([{ h: 0, l: -12 }]),
        {
            high: 0,
            low: -12,
            text: 'HIGH 0° LOW -12°',
            ariaLabel: "Today's high 0 degrees, low -12 degrees."
        }
    );
});

test('daily range has primary contrast and stable numerals', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.daily-range\s*\{[^}]*opacity:\s*1;/s);
    assert.match(styles, /\.daily-range\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\)[^{]*\.daily-range-value\s*\{[^}]*color:\s*currentColor;/s);
});

test('high and low render as bare text with no pill surface', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const itemRule = styles.match(/\.daily-range-item\s*\{[^}]*\}/s)?.[0] || '';

    assert.match(itemRule, /display:\s*inline-flex;/);
    assert.match(itemRule, /align-items:\s*baseline;/);
    assert.match(itemRule, /gap:\s*0\.375rem;/);
    assert.doesNotMatch(itemRule, /padding:/);
    assert.doesNotMatch(itemRule, /border-radius:/);
    assert.doesNotMatch(itemRule, /background:/);
    assert.doesNotMatch(
        styles,
        /:host\(\[data-theme="eink"\]\) \.daily-range-item\s*\{[^}]*border:/s
    );
});

test('the retired daily-range-surface token has no definition and no consumer', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const harness = fs.readFileSync(
        path.join(__dirname, '../../test_components.html'),
        'utf8'
    );

    assert.doesNotMatch(styles, /--daily-range-surface/);
    assert.doesNotMatch(template, /--daily-range-surface/);
    assert.doesNotMatch(harness, /--daily-range-surface/);
});

test('the daily range label gap comes only from the item container', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const labelRule = styles.match(/\.daily-range-label\s*\{[^}]*\}/s)?.[0] || '';

    assert.doesNotMatch(labelRule, /margin-right:/);
    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.daily-range-item\s*\{[^}]*gap:\s*0\.3125rem;/s
    );
});

test('help content uses theme tokens instead of hard-coded contrast colors', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const helpSource = components.slice(
        components.indexOf('class HelpSection'),
        components.indexOf('/**\n * Pressure Trends Widget')
    );

    assert.match(helpSource, /\.help-toggle\s*\{[^}]*background:\s*var\(--help-surface\);/s);
    assert.match(helpSource, /\.help-content\s*\{[^}]*background:\s*var\(--help-surface\);/s);
    assert.match(helpSource, /\.param-name\s*\{[^}]*color:\s*var\(--help-param-color\);/s);
    assert.match(helpSource, /\.param-example\s*\{[^}]*color:\s*var\(--help-example-color\);/s);
    assert.doesNotMatch(helpSource, /#fbbf24|#86efac/i);
});

test('canonical themes define range and help contrast tokens', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    [':root', '[data-theme="light"]', '[data-theme="eink"]'].forEach((selector) => {
        const escapedSelector = selector.replace(/[\[\]]/g, '\\$&');
        const themeBlock = new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's');
        const block = template.match(themeBlock)?.[0] || '';

        ['--help-surface', '--help-param-color', '--help-example-color']
            .forEach((token) => {
                assert.match(block, new RegExp(`${token}:`), `${selector} is missing ${token}`);
            });
    });
});

test('solar widget uses a block host so its card cannot widen the page', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const solarSource = components.slice(
        components.indexOf('class SolarProgressWidget'),
        components.indexOf('// Enhanced Temperature Trends Component')
    );

    assert.match(solarSource, /:host\s*\{\s*display:\s*block;/s);
});

test('solar data replaces the loading layout before rendering its content', () => {
    const classNames = new Set(['loading-state']);
    const solarContent = {
        classList: {
            contains(name) { return classNames.has(name); },
            remove(name) { classNames.delete(name); }
        },
        innerHTML: ''
    };
    const widget = new SolarProgressWidget();
    widget.shadowRoot.getElementById = (id) => (
        id === 'solar-content' ? solarContent : null
    );
    widget.sunMap = {};

    widget.renderSolarData({});

    assert.equal(solarContent.classList.contains('loading-state'), false);
    assert.match(solarContent.innerHTML, /sky-card/);
});

test('manual harness starts with ABOUTME documentation', () => {
    const harness = fs.readFileSync(
        path.join(__dirname, '../../test_components.html'),
        'utf8'
    );

    assert.match(harness, /^<!DOCTYPE html>\s*\n<!-- ABOUTME: .+ -->\s*\n<!-- ABOUTME: .+ -->/);
});

test('returns null for incomplete or non-numeric ranges', () => {
    const invalidDailyData = [
        undefined,
        [],
        [{}],
        [{ h: 77 }],
        [{ l: 65 }],
        [{ h: '77', l: 65 }],
        [{ h: 77, l: Number.NaN }],
        [{ h: Number.POSITIVE_INFINITY, l: 65 }],
        [{ h: 77, l: Number.NEGATIVE_INFINITY }]
    ];

    invalidDailyData.forEach((daily) => {
        assert.equal(formatDailyTemperatureRange(daily), null);
    });
});

test('eInk page uses the full layout width with an 8px gutter', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const containerRule = template.match(
        /\[data-theme="eink"\] \.weather-container\s*\{[^}]*\}/s
    )?.[0] || '';

    assert.match(containerRule, /max-width:\s*none;/);
    assert.match(containerRule, /width:\s*100%;/);
    assert.match(containerRule, /padding:\s*0\.5rem;/);
    assert.match(containerRule, /box-sizing:\s*border-box;/);
    assert.doesNotMatch(containerRule, /100vw/);
    assert.doesNotMatch(
        template,
        /@media \(max-width: 390px\)[\s\S]*?\[data-theme="eink"\] \.weather-container/
    );
});

test('the eInk panel resolves a viewport height and hides page chrome it does not use', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const containerRule = template.match(
        /\[data-theme="eink"\] \.weather-container\s*\{[^}]*\}/s
    )?.[0] || '';

    assert.match(containerRule, /height:\s*100vh;/);
    assert.match(
        template,
        /\[data-theme="eink"\] \.app-footer\s*\{[^}]*display:\s*none;[^}]*\}/s
    );
    assert.match(
        template,
        /\[data-theme="eink"\] \.pwa-install-button\s*\{[^}]*display:\s*none;[^}]*\}/s
    );
});

test('the container owns vertical rhythm as a flex column', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const containerRule = template.match(/\.weather-container\s*\{[^}]*\}/s)?.[0] || '';

    assert.match(containerRule, /display:\s*flex;/);
    assert.match(containerRule, /flex-direction:\s*column;/);
    assert.match(containerRule, /gap:\s*1\.75rem;/);
});

test('the stat band collapses in blue and becomes a card in eInk', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    assert.match(template, /\.stat-band\s*\{[^}]*display:\s*contents;/s);
    assert.match(
        template,
        /\[data-theme="eink"\] \.stat-band\s*\{[^}]*display:\s*flex;[^}]*background:\s*var\(--card-bg\);[^}]*border:\s*2px solid var\(--card-border\);/s
    );

    // The band reads its card surface from the theme, so the white-on-black
    // contrast the mock asks for is only guaranteed with the definitions too.
    const einkTheme = template.match(/\[data-theme="eink"\]\s*\{[^}]*\}/s)?.[0] || '';
    assert.match(einkTheme, /--card-bg:\s*#ffffff;/);
    assert.match(einkTheme, /--card-border:\s*#000000;/);
});

test('the sky pair is a grid in every theme', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    assert.match(template, /\.sky-pair\s*\{[^}]*display:\s*grid;/s);
    assert.doesNotMatch(template, /\.sky-pair\s*\{[^}]*display:\s*contents;/s);
});

test('the eInk text and sky columns fit inside the stat band with the bars', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.current-text\s*\{[^}]*min-width:\s*0;/s
    );

    const skyPairRule = template.match(
        /\[data-theme="eink"\] \.sky-pair\s*\{[^}]*\}/s
    )?.[0] || '';
    assert.match(skyPairRule, /flex:\s*0 1 6\.3125rem;/);
    assert.match(skyPairRule, /margin-left:\s*auto;/);
});

test('the page orders the phone sequence and the eInk sequence', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    assert.match(template, /current-weather\s*\{\s*order:\s*1;\s*\}/);
    assert.match(template, /weather-alerts\s*\{\s*order:\s*2;\s*\}/);
    assert.match(template, /weather-insights\s*\{\s*order:\s*3;\s*\}/);
    assert.match(template, /hourly-forecast\s*\{\s*order:\s*4;\s*\}/);
    assert.match(template, /\.sky-pair\s*\{[^}]*order:\s*5;/s);
    assert.match(template, /daily-forecast\s*\{\s*order:\s*6;\s*\}/);
    assert.match(
        template,
        /\[data-theme="eink"\] weather-insights\s*\{[^}]*order:\s*4;/s
    );

    // The written forecast is the panel's long block, so it reads last on
    // eInk: chart, then the one-line strip, then the paragraph. On the phone
    // it is opt-in and joins the widgets that follow the hero sequence.
    assert.match(template, /forecast-narrative\s*\{\s*order:\s*7;\s*\}/);
    assert.match(
        template,
        /\[data-theme="eink"\] forecast-narrative\s*\{[^}]*order:\s*5;/s
    );
});

test('the eInk stat band leads with temperature, then text, then the bars', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.temperature\s*\{[^}]*order:\s*1;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.current-text\s*\{[^}]*order:\s*2;/s);
});

test('every widget in the container has an explicit flex order', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const container = template.match(
        /<div class="weather-container">([\s\S]*?)\n    <\/div>/
    )?.[1] ?? '';
    // .sky-pair is a grid; its children are grid items, not flex items of
    // the container, so they take no part in this ordering.
    const flexItems = container.replace(
        /<div class="sky-pair">[\s\S]*?<\/div>/,
        ''
    );
    const tags = [...new Set(
        [...flexItems.matchAll(/<([a-z]+(?:-[a-z]+)+)>/g)].map(([, tag]) => tag)
    )];

    // A child with no order falls to the flex default of 0 and jumps the hero.
    const css = template.replace(/\/\*[\s\S]*?\*\//g, '');
    const ordered = new Set();
    for (const [, selectors] of css.matchAll(
        /([^{}]+)\{[^}]*(?:^|[\s;{])order:[^}]*\}/g
    )) {
        selectors.split(',').forEach((selector) => {
            ordered.add(selector.trim().replace(/^\[data-theme="\w+"\]\s*/, ''));
        });
    }

    assert.ok(tags.length >= 14, `found only ${tags.length} container tags`);
    tags.forEach((tag) => {
        assert.ok(ordered.has(tag), `${tag} has no explicit flex order`);
    });
});

test('canonical themes define the insight surface token', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    [':root', '[data-theme="light"]', '[data-theme="eink"]'].forEach((selector) => {
        const escapedSelector = selector.replace(/[\[\]]/g, '\\$&');
        const block = template.match(
            new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's')
        )?.[0] || '';
        assert.match(block, /--insight-surface:/, `${selector} is missing the token`);
    });
});

test('widget wrappers no longer carry their own bottom margin', () => {
    // .solar-widget and .moon-phase-widget live in weather-components.js's
    // inline <style> blocks, not the shared stylesheet, so both sources are
    // searched. margin(-bottom)? also catches .solar-widget's shorthand
    // `margin: 1rem 0`, which sets a top AND bottom margin.
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    ) + fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );

    ['.current-widget', '.hourly-widget', '.daily-widget', '.timeline-widget', '.solar-widget', '.moon-phase-widget']
        .forEach((selector) => {
            const rule = styles.match(
                new RegExp(`\\${selector}\\s*\\{[^}]*\\}`, 's')
            )?.[0] || '';
            assert.doesNotMatch(rule, /margin(-bottom)?:/, selector);
        });
});

test('alerts stay out of the layout until their data arrives', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const alertsSource = components.slice(
        components.indexOf('class WeatherAlertsWidget'),
        components.indexOf('// Precipitation Radar Widget')
    );

    assert.match(
        alertsSource,
        /if \(!this\.alertsData\) \{\s*this\.style\.display = 'none';\s*this\.shadowRoot\.innerHTML = '';\s*return;\s*\}/
    );
});

test('the eInk precipitation bar keeps its outline over the hatch', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.precip-bar\s*\{[^}]*border:\s*1px solid #000000;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.precip-bar\s*\{[^}]*border-bottom:\s*none;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.precip-bar\s*\{[^}]*box-sizing:\s*border-box;/s);
});

test('the eInk bar gap is half the mock\'s 6px on each cell', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.precip-cell\s*\{[^}]*padding:\s*0 3px;/s);
});

test('the eInk three-temp bars grid centers itself', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.three-temps-grid\s*\{[^}]*align-items:\s*center;/s);
    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.three-temps-grid\s*\{[^}]*align-content:\s*center;/s);

    // The track width is no longer pinned here. It has to flex so the text
    // column beside it stops paying for the whole shortfall; that contract
    // lives in "the eInk bar track can flex...".
});

test('the eInk sky card carries no corner radius', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /:host\(\[data-theme="eink"\]\) \.sky-card\s*\{[^}]*border-radius:\s*0;/s);
});

test('the hourly chart legend matches the mock\'s 14px gap', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    assert.match(styles, /\.chart-legend\s*\{[^}]*gap:\s*0\.875rem;/s);
    assert.doesNotMatch(styles, /\.chart-legend\s*\{[^}]*gap:\s*1rem;/s);
});

test('the eInk header wraps its two spans as whole units', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    // The mock's header is one text node that wraps to two lines. Ours is two
    // spans; without wrap they are squeezed to equal widths and each wraps
    // internally, which orphans "AM" onto a third line.
    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.header-row\s*\{[^}]*flex-wrap:\s*wrap;/s
    );
});

test('narrow eInk panels drop the three-temperature bars', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const narrow = styles.slice(styles.indexOf('@media (max-width: 640px)'));
    const block = narrow.slice(0, narrow.indexOf('@media', 1));

    // `.three-temps` has a ~233px min-content floor from its
    // `auto 7.5rem auto` grid. At 320 the eInk row has 149px to give it, so
    // the band overflows the frame by 78px. It is the only element in the
    // band that cannot be legible at any width that fits.
    assert.match(
        block,
        /:host\(\[data-theme="eink"\]\) \.three-temps\s*\{[^}]*display:\s*none;/s
    );
});

test('no widget host carries a bottom margin', () => {
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );

    // `.weather-container` is a flex column and its gap owns the space
    // between blocks. Flex items do not collapse margins, so a host margin
    // adds to the gap instead of replacing it.
    const offenders = [...components.matchAll(/:host[^{]*\{[^}]*\}/gs)]
        .filter(([block]) => /margin-bottom:/.test(block))
        .map(({ index }) => components.slice(0, index).split('\n').length);

    assert.deepEqual(offenders, [], `:host margin-bottom at lines ${offenders}`);
});

test('narrow eInk panels stack the stat band', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const narrow = template.slice(template.indexOf('@media (max-width: 640px)'));
    const block = narrow.slice(0, narrow.indexOf('</style>'));

    // A row of temperature, text and sky needs about 391px; a 320px panel
    // leaves the band 268. Stacked, the current widget gets the full width
    // and its high and low row stops overflowing its own column.
    assert.match(
        block,
        /\[data-theme="eink"\] \.stat-band\s*\{[^}]*flex-direction:\s*column;/s
    );
    assert.match(
        block,
        /\[data-theme="eink"\] \.stat-band\s*\{[^}]*align-items:\s*stretch;/s
    );

    // The 101px basis is a height in a column, and the sun and moon cards
    // read better side by side once they have the full width.
    assert.match(
        block,
        /\[data-theme="eink"\] \.sky-pair\s*\{[^}]*flex:\s*0 0 auto;/s
    );
    assert.match(
        block,
        /\[data-theme="eink"\] \.sky-pair\s*\{[^}]*grid-template-columns:\s*1fr 1fr;/s
    );
    assert.match(
        block,
        /\[data-theme="eink"\] \.sky-pair\s*\{[^}]*text-align:\s*left;/s
    );
});

test('the eInk high and low row wraps instead of overflowing its column', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );

    // Every other width in the band is pinned to the mock: temperature 185,
    // text column 169, bars 233, gaps 22, sky 101. The row's own width is
    // data-bearing — the mock's "HIGH 23° LOW 9°" fits 149px with 4px spare,
    // while "HIGH 88° LOW 73°" needs 162. Wrapping is the only slack left,
    // and it costs a second line only on the days that need one.
    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.daily-range\s*\{[^}]*flex-wrap:\s*wrap;/s
    );
});

test('the wet bulb dot travels between the dot centers, not the track edges', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const scale = styles.slice(
        styles.indexOf('.three-temps-scale {'),
        styles.indexOf('.three-temps-note')
    );

    // The wet dot is centered on its position, and the fixed feels and air
    // dots each sit half a dot inside their end of the track. A bare
    // percentage puts the wet dot's center on the track edge instead, so at
    // 100% — where a wet bulb below the air temperature always lands — half
    // the dot hangs outside the track.
    assert.match(
        scale,
        /--wet-offset:\s*calc\(0\.3125rem \+ \(100% - 0\.625rem\) \* var\(--wet-position, 1\)\);/
    );
    assert.match(scale, /\.scale-fill\s*\{[^}]*width:\s*var\(--wet-offset\);/s);
    assert.match(scale, /\.scale-dot-wet\s*\{[^}]*left:\s*var\(--wet-offset\);/s);

    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );
    const bare = [...components.matchAll(/style\.(?:left|width) = `\$\{wetPercent\}%`/g)]
        .map(({ index }) => components.slice(0, index).split('\n').length);
    assert.deepEqual(bare, [], `bare wetPercent position at lines ${bare}`);

    const wired = [
        ...components.matchAll(/setProperty\('--wet-position', wetPercent \/ 100\)/g)
    ].length;
    assert.equal(wired, 1, 'the widget sets --wet-position once from wetPercent');
});

test('the service worker precaches every shipped asset under one cache version', () => {
    const worker = fs.readFileSync(
        path.join(__dirname, '../../static/sw.js'),
        'utf8'
    );
    const cacheVersions = [...worker.matchAll(/weather-dashboard[\w-]*-?v(\d+)/g)]
        .map(([, version]) => version);

    assert.equal(new Set(cacheVersions).size, 1);
    assert.match(worker, /'\/static\/js\/weather-insights\.js'/);
    assert.match(worker, /'\/static\/js\/dashboard-config\.js'/);
    assert.match(worker, /'\/static\/js\/weather-components\.js'/);
    assert.match(worker, /'\/static\/css\/weather-components\.css'/);
});

test('the eInk bar track can flex so one column never absorbs the whole squeeze', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const grid = styles.match(
        /:host\(\[data-theme="eink"\]\)\s*\.three-temps-grid\s*\{[^}]*\}/s
    )?.[0] || '';

    assert.notEqual(grid, '', 'no eInk .three-temps-grid rule found');

    // A fixed bar track gives the grid a hard min-content floor. The band
    // then takes every missing pixel out of the text column beside it, which
    // is what wrapped the time onto three lines and pushed the high and low
    // across the divider.
    assert.match(
        grid,
        /grid-template-columns:[^;]*fr/,
        'a fixed bar track forces the whole shortfall onto the text column'
    );
});
