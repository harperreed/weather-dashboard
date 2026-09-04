// ABOUTME: Tests canonical dashboard widget and theme URL configuration.
// ABOUTME: Runs the production configuration module with Node's test runner.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    WIDGET_CATALOG,
    applyDashboardConfig,
    isWidgetEnabled,
    parseDashboardConfig
} = require('../../static/js/dashboard-config.js');

const EXPECTED_WIDGET_CATALOG = [
    {
        id: 'current',
        host: 'current-weather',
        aliases: ['now'],
        parameters: ['current'],
        defaultThemes: ['blue', 'light', 'eink']
    },
    {
        id: 'alerts',
        host: 'weather-alerts',
        aliases: ['warnings'],
        parameters: [],
        defaultThemes: ['blue', 'light', 'eink']
    },
    {
        id: 'insights',
        host: 'weather-insights',
        aliases: ['insight'],
        parameters: [],
        defaultThemes: ['blue', 'light', 'eink']
    },
    {
        id: 'hourly',
        host: 'hourly-forecast',
        aliases: ['hours'],
        parameters: ['hourly'],
        defaultThemes: ['blue', 'light', 'eink']
    },
    {
        id: 'narrative',
        host: 'forecast-narrative',
        aliases: ['forecast'],
        parameters: [],
        defaultThemes: ['eink']
    },
    {
        id: 'daily',
        host: 'daily-forecast',
        aliases: ['week', 'days'],
        parameters: ['daily'],
        defaultThemes: ['blue', 'light']
    },
    {
        id: 'temperature-trends',
        host: 'enhanced-temperature-trends',
        aliases: ['temperature', 'temp-trends'],
        parameters: [],
        defaultThemes: []
    },
    {
        id: 'radar',
        host: 'precipitation-radar',
        aliases: ['precipitation'],
        parameters: [],
        defaultThemes: []
    },
    {
        id: 'clothing',
        host: 'clothing-recommendations',
        aliases: ['clothes'],
        parameters: [],
        defaultThemes: []
    },
    {
        id: 'air-quality',
        host: 'air-quality',
        aliases: ['airquality', 'air', 'aqi'],
        parameters: ['air-quality', 'airquality'],
        defaultThemes: []
    },
    {
        id: 'wind',
        host: 'wind-direction',
        aliases: ['wind-direction', 'compass'],
        parameters: ['wind-direction', 'wind'],
        defaultThemes: []
    },
    {
        id: 'pressure',
        host: 'pressure-trends',
        aliases: ['pressure-trends', 'trends'],
        parameters: ['pressure-trends', 'pressure'],
        defaultThemes: []
    },
    {
        id: 'solar',
        host: 'solar-progress',
        aliases: ['sun'],
        parameters: [],
        defaultThemes: ['blue', 'light', 'eink']
    },
    {
        id: 'moon',
        host: 'moon-phase',
        aliases: ['lunar'],
        parameters: [],
        defaultThemes: ['blue', 'light', 'eink']
    },
    {
        id: 'timeline',
        host: 'hourly-timeline',
        aliases: ['list'],
        parameters: ['timeline'],
        defaultThemes: []
    },
    {
        id: 'help',
        host: 'help-section',
        aliases: [],
        parameters: [],
        defaultThemes: []
    }
];

test('production catalog matches the approved widget contract', () => {
    assert.deepEqual(WIDGET_CATALOG, EXPECTED_WIDGET_CATALOG);
});

test('every public widget name and alias selects its catalog widget', () => {
    EXPECTED_WIDGET_CATALOG.forEach(({ id, aliases }) => {
        [id, ...aliases].forEach((name) => {
            const config = parseDashboardConfig(`?widgets=${name}`);
            assert.equal(config.hasWidgetSelection, true);
            assert.equal(isWidgetEnabled(config, id), true, name);
            assert.equal(
                Object.values(config.enabledWidgets).filter(Boolean).length,
                1,
                name
            );
        });
    });
});

test('empty widget selection behaves like an omitted parameter', () => {
    for (const search of ['', '?widgets=', '?widgets=  ']) {
        const config = parseDashboardConfig(search);
        assert.equal(config.hasWidgetSelection, false);
        assert.equal(isWidgetEnabled(config, 'daily'), true);
    }
});

test('the seven-day strip is on for phone and desktop and off for eInk', () => {
    assert.equal(isWidgetEnabled(parseDashboardConfig(''), 'daily'), true);
    assert.equal(isWidgetEnabled(parseDashboardConfig('?theme=light'), 'daily'), true);
    assert.equal(isWidgetEnabled(parseDashboardConfig('?theme=eink'), 'daily'), false);
});

test('the written forecast is on for eInk and off for phone and desktop', () => {
    // The prose fills a panel that has height to spare. The phone and desktop
    // layouts scroll, so they have no such gap to fill.
    assert.equal(isWidgetEnabled(parseDashboardConfig('?theme=eink'), 'narrative'), true);
    assert.equal(isWidgetEnabled(parseDashboardConfig(''), 'narrative'), false);
    assert.equal(isWidgetEnabled(parseDashboardConfig('?theme=light'), 'narrative'), false);
});

test('an explicit selection brings the written forecast to the phone', () => {
    const config = parseDashboardConfig('?widgets=forecast');

    assert.equal(isWidgetEnabled(config, 'narrative'), true);
});

test('an explicit selection brings the seven-day strip back on eInk', () => {
    const config = parseDashboardConfig('?theme=eink&widgets=daily');
    assert.equal(isWidgetEnabled(config, 'daily'), true);
});

test('opt-in widgets stay off in every theme until they are named', () => {
    const optIn = ['temperature-trends', 'radar', 'clothing', 'air-quality',
        'wind', 'pressure', 'timeline', 'help'];

    ['', '?theme=light', '?theme=eink'].forEach((search) => {
        const config = parseDashboardConfig(search);
        optIn.forEach((id) => {
            assert.equal(isWidgetEnabled(config, id), false, `${search} ${id}`);
        });
    });
});

test('help returns when it is named', () => {
    assert.equal(isWidgetEnabled(parseDashboardConfig('?widgets=help'), 'help'), true);
});

test('unknown-only widget selection disables every widget', () => {
    const documentHolder = createDocumentHolder();
    const config = parseDashboardConfig('?widgets=nope');

    assert.equal(config.hasWidgetSelection, true);
    assert.equal(Object.values(config.enabledWidgets).every(Boolean), false);
    assert.equal(Object.values(config.enabledWidgets).every((enabled) => !enabled), true);

    applyDashboardConfig(documentHolder, config);

    EXPECTED_WIDGET_CATALOG.forEach(({ host }) => {
        assert.equal(documentHolder.hosts.get(host).hidden, true);
    });
});

test('valid widgets survive unknown and repeated names', () => {
    const config = parseDashboardConfig('?widgets=radar,nope,radar,moon');
    assert.equal(isWidgetEnabled(config, 'radar'), true);
    assert.equal(isWidgetEnabled(config, 'moon'), true);
    assert.equal(isWidgetEnabled(config, 'current'), false);
});

test('individual boolean parameters override default visibility', () => {
    const config = parseDashboardConfig('?current=false&hourly=true');
    assert.equal(isWidgetEnabled(config, 'current'), false);
    assert.equal(isWidgetEnabled(config, 'hourly'), true);
});

test('themes resolve to canonical names', () => {
    const cases = new Map([
        ['', 'blue'],
        ['?theme=blue', 'blue'],
        ['?theme=light', 'light'],
        ['?theme=eink', 'eink'],
        ['?theme=white', 'light'],
        ['?theme=dashboard', 'eink'],
        ['?background=white', 'light'],
        ['?theme=unknown', 'blue']
    ]);

    cases.forEach((expected, search) => {
        assert.equal(parseDashboardConfig(search).theme, expected, search);
    });
});

test('__proto__ theme canonicalizes to blue', () => {
    assert.equal(parseDashboardConfig('?theme=__proto__').theme, 'blue');
});

test('constructor theme canonicalizes to blue', () => {
    assert.equal(parseDashboardConfig('?theme=constructor').theme, 'blue');
});

test('inherited property names are not enabled widgets', () => {
    const config = parseDashboardConfig('');

    for (const widgetId of ['__proto__', 'constructor', 'toString']) {
        assert.equal(isWidgetEnabled(config, widgetId), false, widgetId);
    }
});

function createDocumentHolder() {
    const body = {
        attributes: new Map(),
        setAttribute(name, value) { this.attributes.set(name, value); }
    };
    const hosts = new Map(
        EXPECTED_WIDGET_CATALOG.map(({ host }) => [host, {
            hidden: false,
            attributes: new Map(),
            setAttribute(name, value) { this.attributes.set(name, value); }
        }])
    );
    // The template wraps the sun and moon cards in one group, so the group
    // holds the same two hosts the catalog loop switches on and off.
    const skyPair = {
        hidden: false,
        children: [hosts.get('solar-progress'), hosts.get('moon-phase')]
    };
    // rem resolves against the root element, never against body, so the
    // theme has to reach <html> for a root font-size rule to select.
    const documentElement = {
        attributes: new Map(),
        setAttribute(name, value) { this.attributes.set(name, value); }
    };
    return {
        body,
        hosts,
        skyPair,
        documentElement,
        getElementById(id) { return id === 'app-body' ? body : null; },
        querySelector(selector) {
            if (selector === '.sky-pair') return skyPair;
            return hosts.get(selector) ?? null;
        }
    };
}

test('applies selected widget visibility and theme to every host', () => {
    const documentHolder = createDocumentHolder();
    const config = parseDashboardConfig('?widgets=radar,solar,moon&theme=light');
    applyDashboardConfig(documentHolder, config);

    assert.equal(documentHolder.body.attributes.get('data-theme'), 'light');
    EXPECTED_WIDGET_CATALOG.forEach(({ id, host }) => {
        assert.equal(documentHolder.hosts.get(host).hidden, !config.enabledWidgets[id]);
        assert.equal(documentHolder.hosts.get(host).attributes.get('data-theme'), 'light');
    });
});

test('the theme reaches the root element, not only the body', () => {
    const documentHolder = createDocumentHolder();
    applyDashboardConfig(documentHolder, parseDashboardConfig('?theme=eink'));

    // The eInk type scale is a root font-size rule, and every size on that
    // panel is a rem. Set on body alone, the selector never matches and the
    // whole panel silently keeps the browser's default 16px.
    assert.equal(documentHolder.documentElement.attributes.get('data-theme'), 'eink');
    assert.equal(documentHolder.body.attributes.get('data-theme'), 'eink');
});

test('the default page shows the glanceable widgets and hides the rest', () => {
    const documentHolder = createDocumentHolder();
    applyDashboardConfig(documentHolder, parseDashboardConfig(''));

    ['current-weather', 'weather-alerts', 'weather-insights', 'hourly-forecast',
        'solar-progress', 'moon-phase', 'daily-forecast'].forEach((host) => {
        assert.equal(documentHolder.hosts.get(host).hidden, false, host);
    });
    ['precipitation-radar', 'pressure-trends', 'hourly-timeline', 'help-section']
        .forEach((host) => {
            assert.equal(documentHolder.hosts.get(host).hidden, true, host);
        });
});

test('the sky pair hides when both its cards are switched off', () => {
    const documentHolder = createDocumentHolder();

    // The eInk panel asks for the hours chart alone. Both cards go hidden,
    // and a group left visible around them still takes its share of the
    // band's width at zero height, starving the conditions beside it.
    applyDashboardConfig(documentHolder, parseDashboardConfig('?widgets=hourly&current'));

    assert.equal(documentHolder.hosts.get('solar-progress').hidden, true);
    assert.equal(documentHolder.hosts.get('moon-phase').hidden, true);
    assert.equal(documentHolder.skyPair.hidden, true);
});

test('the sky pair stays visible while either card is on', () => {
    const documentHolder = createDocumentHolder();

    applyDashboardConfig(documentHolder, parseDashboardConfig('?widgets=hourly,moon&current'));

    assert.equal(documentHolder.hosts.get('solar-progress').hidden, true);
    assert.equal(documentHolder.hosts.get('moon-phase').hidden, false);
    assert.equal(documentHolder.skyPair.hidden, false);
});

test('hiding the sky pair actually hides it', () => {
    // The group carries an explicit `display: grid`, in the base rules and
    // again for eInk. Both outrank the browser's own `[hidden]` rule, so
    // without an override the JS above sets an attribute that draws nothing.
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );

    const hiddenRule = template.search(/\.sky-pair\[hidden\]\s*\{[^}]*display:\s*none;/s);
    assert.notEqual(hiddenRule, -1, 'no .sky-pair[hidden] rule sets display: none');

    // Equal specificity means source order decides, so existing is not the
    // same as winning: the override has to come last.
    const displayRules = [...template.matchAll(/\.sky-pair\s*\{[^}]*?display:/gs)]
        .map((match) => match.index);
    assert.ok(displayRules.length > 0, 'no .sky-pair rule sets display at all');
    assert.ok(
        hiddenRule > Math.max(...displayRules),
        'a .sky-pair display rule outranks the [hidden] override below it'
    );
});
