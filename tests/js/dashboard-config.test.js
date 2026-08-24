// ABOUTME: Tests canonical dashboard widget and theme URL configuration.
// ABOUTME: Runs the production configuration module with Node's test runner.

const assert = require('node:assert/strict');
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
        parameters: ['current']
    },
    {
        id: 'alerts',
        host: 'weather-alerts',
        aliases: ['warnings'],
        parameters: []
    },
    {
        id: 'hourly',
        host: 'hourly-forecast',
        aliases: ['hours'],
        parameters: ['hourly']
    },
    {
        id: 'daily',
        host: 'daily-forecast',
        aliases: ['week', 'days'],
        parameters: ['daily']
    },
    {
        id: 'temperature-trends',
        host: 'enhanced-temperature-trends',
        aliases: ['temperature', 'temp-trends'],
        parameters: []
    },
    {
        id: 'radar',
        host: 'precipitation-radar',
        aliases: ['precipitation'],
        parameters: []
    },
    {
        id: 'clothing',
        host: 'clothing-recommendations',
        aliases: ['clothes'],
        parameters: []
    },
    {
        id: 'air-quality',
        host: 'air-quality',
        aliases: ['airquality', 'air', 'aqi'],
        parameters: ['air-quality', 'airquality']
    },
    {
        id: 'wind',
        host: 'wind-direction',
        aliases: ['wind-direction', 'compass'],
        parameters: ['wind-direction', 'wind']
    },
    {
        id: 'pressure',
        host: 'pressure-trends',
        aliases: ['pressure-trends', 'trends'],
        parameters: ['pressure-trends', 'pressure']
    },
    {
        id: 'solar',
        host: 'solar-progress',
        aliases: ['sun'],
        parameters: []
    },
    {
        id: 'moon',
        host: 'moon-phase',
        aliases: ['lunar'],
        parameters: []
    },
    {
        id: 'timeline',
        host: 'hourly-timeline',
        aliases: ['list'],
        parameters: ['timeline']
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
        assert.equal(Object.values(config.enabledWidgets).every(Boolean), true);
    }
});

test('unknown-only widget selection disables every widget and help', () => {
    const documentHolder = createDocumentHolder();
    const config = parseDashboardConfig('?widgets=nope');

    assert.equal(config.hasWidgetSelection, true);
    assert.equal(Object.values(config.enabledWidgets).every(Boolean), false);
    assert.equal(Object.values(config.enabledWidgets).every((enabled) => !enabled), true);

    applyDashboardConfig(documentHolder, config);

    assert.equal(documentHolder.hosts.get('help-section').hidden, true);
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
        [...EXPECTED_WIDGET_CATALOG.map(({ host }) => host), 'help-section'].map(
            (host) => [host, {
                hidden: false,
                attributes: new Map(),
                setAttribute(name, value) { this.attributes.set(name, value); }
            }]
        )
    );
    return {
        body,
        hosts,
        getElementById(id) { return id === 'app-body' ? body : null; },
        querySelector(selector) { return hosts.get(selector) ?? null; }
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
    assert.equal(documentHolder.hosts.get('help-section').hidden, true);
    assert.equal(
        documentHolder.hosts.get('help-section').attributes.get('data-theme'),
        'light'
    );
});

test('empty widget selection leaves widgets and help visible', () => {
    const documentHolder = createDocumentHolder();
    applyDashboardConfig(documentHolder, parseDashboardConfig('?widgets='));

    assert.equal(
        [...documentHolder.hosts.values()].every(({ hidden }) => hidden === false),
        true
    );
});
