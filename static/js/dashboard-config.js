// ABOUTME: Defines the canonical dashboard widget catalog and URL configuration.
// ABOUTME: Applies parsed theme and visibility settings without external dependencies.

const WIDGET_CATALOG = Object.freeze([
    Object.freeze({
        id: 'current',
        host: 'current-weather',
        aliases: Object.freeze(['now']),
        parameters: Object.freeze(['current']),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'alerts',
        host: 'weather-alerts',
        aliases: Object.freeze(['warnings']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'insights',
        host: 'weather-insights',
        aliases: Object.freeze(['insight']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'hourly',
        host: 'hourly-forecast',
        aliases: Object.freeze(['hours']),
        parameters: Object.freeze(['hourly']),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'narrative',
        host: 'forecast-narrative',
        aliases: Object.freeze(['forecast']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze(['eink'])
    }),
    Object.freeze({
        id: 'daily',
        host: 'daily-forecast',
        aliases: Object.freeze(['week', 'days']),
        parameters: Object.freeze(['daily']),
        defaultThemes: Object.freeze(['blue', 'light'])
    }),
    Object.freeze({
        id: 'temperature-trends',
        host: 'enhanced-temperature-trends',
        aliases: Object.freeze(['temperature', 'temp-trends']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze([])
    }),
    Object.freeze({
        id: 'radar',
        host: 'precipitation-radar',
        aliases: Object.freeze(['precipitation']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze([])
    }),
    Object.freeze({
        id: 'clothing',
        host: 'clothing-recommendations',
        aliases: Object.freeze(['clothes']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze([])
    }),
    Object.freeze({
        id: 'air-quality',
        host: 'air-quality',
        aliases: Object.freeze(['airquality', 'air', 'aqi']),
        parameters: Object.freeze(['air-quality', 'airquality']),
        defaultThemes: Object.freeze([])
    }),
    Object.freeze({
        id: 'wind',
        host: 'wind-direction',
        aliases: Object.freeze(['wind-direction', 'compass']),
        parameters: Object.freeze(['wind-direction', 'wind']),
        defaultThemes: Object.freeze([])
    }),
    Object.freeze({
        id: 'pressure',
        host: 'pressure-trends',
        aliases: Object.freeze(['pressure-trends', 'trends']),
        parameters: Object.freeze(['pressure-trends', 'pressure']),
        defaultThemes: Object.freeze([])
    }),
    Object.freeze({
        id: 'solar',
        host: 'solar-progress',
        aliases: Object.freeze(['sun']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'moon',
        host: 'moon-phase',
        aliases: Object.freeze(['lunar']),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze(['blue', 'light', 'eink'])
    }),
    Object.freeze({
        id: 'timeline',
        host: 'hourly-timeline',
        aliases: Object.freeze(['list']),
        parameters: Object.freeze(['timeline']),
        defaultThemes: Object.freeze([])
    }),
    Object.freeze({
        id: 'help',
        host: 'help-section',
        aliases: Object.freeze([]),
        parameters: Object.freeze([]),
        defaultThemes: Object.freeze([])
    })
]);

const THEME_NAMES = Object.freeze({
    blue: 'blue',
    light: 'light',
    eink: 'eink',
    white: 'light',
    dashboard: 'eink'
});

const WIDGET_NAMES = new Map(
    WIDGET_CATALOG.flatMap(({ id, aliases }) => [
        [id, id],
        ...aliases.map((alias) => [alias, id])
    ])
);

const DEFAULT_THEME = 'blue';

function parseDashboardConfig(search) {
    const urlParams = new URLSearchParams(search || '');

    const requestedTheme = (urlParams.get('theme') || urlParams.get('background') || '')
        .trim()
        .toLowerCase();
    const theme = Object.prototype.hasOwnProperty.call(THEME_NAMES, requestedTheme)
        ? THEME_NAMES[requestedTheme]
        : DEFAULT_THEME;

    const enabledWidgets = Object.fromEntries(
        WIDGET_CATALOG.map(({ id, defaultThemes }) => [id, defaultThemes.includes(theme)])
    );

    const widgetNames = new Set();
    const widgetsParam = urlParams.get('widgets');
    const hasWidgetSelection = Boolean(widgetsParam && widgetsParam.trim());
    if (hasWidgetSelection) {
        widgetsParam.split(',').forEach((name) => {
            const canonicalId = WIDGET_NAMES.get(name.trim().toLowerCase());
            if (canonicalId) widgetNames.add(canonicalId);
        });
    }

    if (hasWidgetSelection) {
        WIDGET_CATALOG.forEach(({ id }) => {
            enabledWidgets[id] = widgetNames.has(id);
        });
    }

    WIDGET_CATALOG.forEach(({ id, parameters }) => {
        const presentParameters = parameters.filter((parameter) => urlParams.has(parameter));
        if (presentParameters.length > 0) {
            enabledWidgets[id] = parameters.every(
                (parameter) => urlParams.get(parameter) !== 'false'
            );
        }
    });

    return { theme, hasWidgetSelection, enabledWidgets };
}

function isWidgetEnabled(config, widgetId) {
    return Boolean(
        config?.enabledWidgets
        && Object.prototype.hasOwnProperty.call(config.enabledWidgets, widgetId)
        && config.enabledWidgets[widgetId]
    );
}

function applyDashboardConfig(documentRoot, config) {
    const body = documentRoot.getElementById('app-body');
    if (body) body.setAttribute('data-theme', config.theme);

    WIDGET_CATALOG.forEach(({ id, host }) => {
        const element = documentRoot.querySelector(host);
        if (!element) return;
        element.hidden = !isWidgetEnabled(config, id);
        element.setAttribute('data-theme', config.theme);
    });

    // A group wrapped around hidden widgets still takes its share of the row.
    // With the sun and moon both switched off, the sky pair went on reserving
    // a column at zero height, squeezing the conditions beside it until the
    // time and summary wrapped. The cards own the visibility decision; the
    // group follows them.
    const skyPair = documentRoot.querySelector('.sky-pair');
    if (skyPair) {
        skyPair.hidden = Array.from(skyPair.children).every((card) => card.hidden);
    }
}

const DashboardConfig = {
    WIDGET_CATALOG,
    applyDashboardConfig,
    isWidgetEnabled,
    parseDashboardConfig
};

if (typeof window !== 'undefined') window.DashboardConfig = DashboardConfig;
if (typeof module !== 'undefined' && module.exports) module.exports = DashboardConfig;
