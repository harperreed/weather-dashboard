// ABOUTME: Defines the canonical dashboard widget catalog and URL configuration.
// ABOUTME: Applies parsed theme and visibility settings without external dependencies.

const WIDGET_CATALOG = Object.freeze([
    Object.freeze({
        id: 'current',
        host: 'current-weather',
        aliases: Object.freeze(['now']),
        parameters: Object.freeze(['current'])
    }),
    Object.freeze({
        id: 'alerts',
        host: 'weather-alerts',
        aliases: Object.freeze(['warnings']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'hourly',
        host: 'hourly-forecast',
        aliases: Object.freeze(['hours']),
        parameters: Object.freeze(['hourly'])
    }),
    Object.freeze({
        id: 'daily',
        host: 'daily-forecast',
        aliases: Object.freeze(['week', 'days']),
        parameters: Object.freeze(['daily'])
    }),
    Object.freeze({
        id: 'temperature-trends',
        host: 'enhanced-temperature-trends',
        aliases: Object.freeze(['temperature', 'temp-trends']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'radar',
        host: 'precipitation-radar',
        aliases: Object.freeze(['precipitation']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'clothing',
        host: 'clothing-recommendations',
        aliases: Object.freeze(['clothes']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'air-quality',
        host: 'air-quality',
        aliases: Object.freeze(['airquality', 'air', 'aqi']),
        parameters: Object.freeze(['air-quality', 'airquality'])
    }),
    Object.freeze({
        id: 'wind',
        host: 'wind-direction',
        aliases: Object.freeze(['wind-direction', 'compass']),
        parameters: Object.freeze(['wind-direction', 'wind'])
    }),
    Object.freeze({
        id: 'pressure',
        host: 'pressure-trends',
        aliases: Object.freeze(['pressure-trends', 'trends']),
        parameters: Object.freeze(['pressure-trends', 'pressure'])
    }),
    Object.freeze({
        id: 'solar',
        host: 'solar-progress',
        aliases: Object.freeze(['sun']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'moon',
        host: 'moon-phase',
        aliases: Object.freeze(['lunar']),
        parameters: Object.freeze([])
    }),
    Object.freeze({
        id: 'timeline',
        host: 'hourly-timeline',
        aliases: Object.freeze(['list']),
        parameters: Object.freeze(['timeline'])
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

function parseDashboardConfig(search) {
    const urlParams = new URLSearchParams(search || '');
    const enabledWidgets = Object.fromEntries(
        WIDGET_CATALOG.map(({ id }) => [id, true])
    );

    const widgetNames = new Set();
    const widgetsParam = urlParams.get('widgets');
    if (widgetsParam && widgetsParam.trim()) {
        widgetsParam.split(',').forEach((name) => {
            const canonicalId = WIDGET_NAMES.get(name.trim().toLowerCase());
            if (canonicalId) widgetNames.add(canonicalId);
        });
    }

    const hasWidgetSelection = widgetNames.size > 0;
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

    const requestedTheme = (urlParams.get('theme') || urlParams.get('background') || '')
        .trim()
        .toLowerCase();

    return {
        theme: THEME_NAMES[requestedTheme] || 'blue',
        hasWidgetSelection,
        enabledWidgets
    };
}

function isWidgetEnabled(config, widgetId) {
    return Boolean(config?.enabledWidgets?.[widgetId]);
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

    const helpSection = documentRoot.querySelector('help-section');
    if (helpSection) helpSection.hidden = config.hasWidgetSelection;
}

const DashboardConfig = {
    WIDGET_CATALOG,
    applyDashboardConfig,
    isWidgetEnabled,
    parseDashboardConfig
};

if (typeof window !== 'undefined') window.DashboardConfig = DashboardConfig;
if (typeof module !== 'undefined' && module.exports) module.exports = DashboardConfig;
