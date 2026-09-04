// ABOUTME: Web Components for weather app using native Custom Elements API
// ABOUTME: Modular, reusable widgets with Shadow DOM encapsulation and weather-icons library

// Weather icon mapping using local weather-icons library
const WEATHER_ICONS = {
    'clear-day': 'clear-day.svg',
    'clear-night': 'clear-night.svg',
    'rain': 'rainy-2.svg',
    'heavy-rain': 'rainy-3.svg',
    'light-rain': 'rainy-1.svg',
    'snow': 'snowy-1.svg',
    'heavy-snow': 'snowy-3.svg',
    'light-snow': 'snowy-1.svg',
    'sleet': 'snowy-2.svg',
    'wind': 'wind.svg',
    'fog': 'fog.svg',
    'cloudy': 'cloudy.svg',
    'partly-cloudy-day': 'cloudy-1-day.svg',
    'partly-cloudy-night': 'cloudy-1-night.svg',
    'thunderstorm': 'thunderstorms.svg',
    'hail': 'hail.svg'
};

// Weather Icon Web Component
class WeatherIcon extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['icon', 'size', 'alt'];
    }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback() {
        this.render();
    }

    render() {
        const iconCode = this.getAttribute('icon') || 'clear-day';
        const size = this.getAttribute('size') || '2.5rem';
        const alt = this.getAttribute('alt') || iconCode;

        // Use static icons on high-contrast eInk displays.
        const urlParams = new URLSearchParams(window.location.search);
        const isEink = window.weatherDashboardConfig?.theme === 'eink';
        const useAnimated = urlParams.get('animated') !== 'false' && !isEink;
        const iconType = useAnimated ? 'animated' : 'static';

        const iconFile = WEATHER_ICONS[iconCode] || WEATHER_ICONS['clear-day'];
        const iconUrl = `/static/icons/weather/${iconType}/${iconFile}`;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                    vertical-align: middle;
                }

                .weather-icon {
                    width: ${size};
                    height: ${size};
                    display: block;
                    object-fit: contain;
                }
            </style>
            <img class="weather-icon" src="${iconUrl}" alt="${alt}" />
        `;
    }
}

// Helper function to create weather icon element
function getWeatherIcon(iconCode, size = '2.5rem') {
    return `<weather-icon icon="${iconCode}" size="${size}"></weather-icon>`;
}

// Helper function to get weather icon for smaller displays
function getWeatherIconSmall(iconCode) {
    return getWeatherIcon(iconCode, '2.25rem');
}

function formatDailyTemperatureRange(daily) {
    const today = daily?.[0];
    if (!Number.isFinite(today?.h) || !Number.isFinite(today?.l)) {
        return null;
    }

    return {
        high: today.h,
        low: today.l,
        text: `HIGH ${today.h}° LOW ${today.l}°`,
        ariaLabel: `Today's high ${today.h} degrees, low ${today.l} degrees.`
    };
}

function formatCardTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        .replace(' ', '')
        .toLowerCase();
}

// A forecast can hold within a degree of itself for twelve hours. Ranging the
// axis to the data alone draws that as a full-height cliff, which reads as a
// temperature crash rather than a still night, so the scale never spans less
// than this. Centring the data in the wider band also covers a flat forecast,
// where the data's own span is zero.
const MIN_TEMPERATURE_SPAN = 10;

function temperatureScale(temperatures) {
    const maxTemp = Math.max(...temperatures);
    const minTemp = Math.min(...temperatures);
    const span = Math.max(maxTemp - minTemp, MIN_TEMPERATURE_SPAN);

    return { top: (maxTemp + minTemp) / 2 + span / 2, span };
}

function calculateHourlyChartPoints(temperatures, width, height, padding) {
    if (!temperatures.length || width <= 0 || height <= 0) return [];

    const plotHeight = Math.max(height - padding * 2, 0);
    const { top, span } = temperatureScale(temperatures);
    const columnWidth = width / temperatures.length;

    return temperatures.map((temperature, index) => ({
        x: columnWidth * (index + 0.5),
        y: padding + ((top - temperature) / span) * plotHeight
    }));
}

// Daily chart markers inset the plot by their own radius so no circle is
// clipped by the chart edge.
const MARKER_RADIUS = 4;

function calculateDailyChartPoints(days, width, height, padding) {
    if (!days.length || width <= 0 || height <= 0) return [];

    const plotHeight = Math.max(height - padding * 2, 0);
    const { top, span } = temperatureScale(days.flatMap(({ h, l }) => [h, l]));
    const columnWidth = width / days.length;

    // Padding is the marker radius, so the hottest high and coldest low still
    // paint as whole circles instead of half-circles on the chart edge.
    const plot = temperature => padding + ((top - temperature) / span) * plotHeight;

    return days.map(({ h, l }, index) => ({
        x: columnWidth * (index + 0.5),
        highY: plot(h),
        lowY: plot(l)
    }));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatDailyTemperatureRange,
        calculateHourlyChartPoints,
        calculateDailyChartPoints
    };
}

// Helper function to determine if an hour is day/night/twilight
function getTimeOfDay(hourString, sunData) {
    if (!sunData) return 'day';

    // Parse hour string (e.g., "6pm" -> 18)
    const hourMatch = hourString.match(/(\d+)(am|pm)/);
    if (!hourMatch) return 'day';

    let hour = parseInt(hourMatch[1]);
    const period = hourMatch[2];

    // Convert to 24-hour format
    if (period === 'pm' && hour !== 12) {
        hour += 12;
    } else if (period === 'am' && hour === 12) {
        hour = 0;
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    const todaySun = sunData[today];

    if (!todaySun) return 'day';

    // Parse sunrise/sunset times
    const sunriseHour = parseInt(todaySun.sunrise.split('T')[1].split(':')[0]);
    const sunsetHour = parseInt(todaySun.sunset.split('T')[1].split(':')[0]);

    // Define time periods
    const civilTwilightStart = sunriseHour - 1; // 1 hour before sunrise
    const civilTwilightEnd = sunsetHour + 1; // 1 hour after sunset

    if (hour >= civilTwilightStart && hour < sunriseHour) {
        return 'dawn';
    } else if (hour >= sunriseHour && hour < sunsetHour) {
        return 'day';
    } else if (hour >= sunsetHour && hour < civilTwilightEnd) {
        return 'dusk';
    } else {
        return 'night';
    }
}

// Helper function to get color for time of day
function getTimeOfDayColor(timeOfDay) {
    const colors = {
        'dawn': 'rgba(255, 183, 77, 0.3)',  // Golden dawn
        'day': 'rgba(135, 206, 235, 0.2)',  // Light blue day
        'dusk': 'rgba(255, 140, 0, 0.3)',   // Orange dusk
        'night': 'rgba(25, 25, 112, 0.4)'   // Dark blue night
    };
    return colors[timeOfDay] || colors.day;
}

// Insight rules and wet-bulb math live in weather-insights.js.
const {
    calculateWetbulbTemp,
    insightFacts,
    insightSentence,
    precipitationWindow,
    wetBulbClause,
    wetBulbPosition
} = (typeof window !== 'undefined' && window.WeatherInsights)
    || require('./weather-insights.js');

// Base WeatherWidget class with shared functionality
class WeatherWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.data = null;
        this.config = {};
    }

    connectedCallback() {
        this.parseConfig();
        if (this.hidden) return;
        this.observeTheme();
        this.render();
        this.setupEventListeners();
    }

    isEnabled(widgetId) {
        return window.DashboardConfig.isWidgetEnabled(
            window.weatherDashboardConfig,
            widgetId
        );
    }

    observeTheme() {
        // Get theme from app-body and apply to this component
        const appBody = document.getElementById('app-body');
        if (appBody) {
            const bodyTheme = appBody.getAttribute('data-theme');
            if (bodyTheme) {
                this.setAttribute('data-theme', bodyTheme);
            }

            // Watch for theme changes
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                        const newTheme = appBody.getAttribute('data-theme');
                        if (newTheme) {
                            this.setAttribute('data-theme', newTheme);
                        }
                    }
                });
            });

            observer.observe(appBody, { attributes: true, attributeFilter: ['data-theme'] });
        }
    }

    parseConfig() {
        this.config = Object.fromEntries(
            window.DashboardConfig.WIDGET_CATALOG.map(({ id }) => [
                id,
                this.isEnabled(id)
            ])
        );
    }

    setupEventListeners() {
        // Listen for weather data updates
        document.addEventListener('weather-data-updated', (e) => {
            this.data = e.detail;
            this.update();
        });

        // Listen for configuration changes
        document.addEventListener('weather-config-changed', (e) => {
            this.config = { ...this.config, ...e.detail };
            this.render();
        });
    }

    // Import external CSS into Shadow DOM + eInk theme styles
    getSharedStyles() {
        return `
            <link rel="stylesheet" href="/static/css/weather-components.css">
            <style>
                :host {
                    display: block;
                    color: var(--text-primary);
                    font-family: system-ui, -apple-system, sans-serif;
                }

                /* eInk theme overrides for Shadow DOM */
                :host([data-theme="eink"]) .day-high {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="eink"]) .day-low {
                    font-weight: 800 !important;
                    font-size: 1.125rem !important;
                }

                :host([data-theme="eink"]) .day-name {
                    font-size: 1.125rem !important;
                    font-weight: 800 !important;
                }

                :host([data-theme="eink"]) .timeline-time {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="eink"]) .timeline-temp {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="eink"]) .timeline-desc {
                    font-size: 1.125rem !important;
                    font-weight: 800 !important;
                }

                :host([data-theme="eink"]) .weather-icon img {
                    width: 12rem !important;
                    height: 12rem !important;
                    filter: contrast(2) brightness(0.8) !important;
                }

                :host([data-theme="eink"]) .day-icon img {
                    width: 6rem !important;
                    height: 6rem !important;
                }
            </style>
        `;
    }

    render() {
        // To be implemented by subclasses
    }

    update() {
        // To be implemented by subclasses
    }

    showLoading() {
        this.shadowRoot.querySelector('.widget-content')?.classList.add('loading');
    }

    hideLoading() {
        this.shadowRoot.querySelector('.widget-content')?.classList.remove('loading');
    }

    showError(message) {
        const errorEl = this.shadowRoot.querySelector('.error-message');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }

    hideError() {
        const errorEl = this.shadowRoot.querySelector('.error-message');
        if (errorEl) {
            errorEl.classList.add('hidden');
        }
    }
}

// Current Weather Component
class CurrentWeatherWidget extends WeatherWidget {
    render() {
        if (this.config.current === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="current-widget widget-content">
                <div class="temperature" id="temp">--°</div>

                <div class="current-text">
                    <div class="header-row">
                        <span class="location" id="location">--</span>
                        <span class="local-time" id="local-time">--</span>
                    </div>
                    <div class="summary" id="summary">Loading weather data...</div>
                    <div class="daily-range" id="daily-range" hidden>
                        <span class="daily-range-item daily-range-high">
                            <span class="daily-range-label">High</span>
                            <span class="daily-range-value" id="daily-high">--°</span>
                        </span>
                        <span class="daily-range-item daily-range-low">
                            <span class="daily-range-label">Low</span>
                            <span class="daily-range-value" id="daily-low">--°</span>
                        </span>
                    </div>
                </div>

                <div class="three-temps">
                    <div class="three-temps-grid">
                        <div class="three-temp three-temp-feels">
                            <span class="three-temp-label">Feels</span>
                            <span class="three-temp-bar" id="bar-feels"></span>
                            <span class="three-temp-value" id="feels-value">--°</span>
                        </div>
                        <div class="three-temp three-temp-wet">
                            <span class="three-temp-label">Wet bulb</span>
                            <span class="three-temp-bar" id="bar-wet"></span>
                            <span class="three-temp-value" id="wet-value">--°</span>
                        </div>
                        <div class="three-temp three-temp-air">
                            <span class="three-temp-label">Air</span>
                            <span class="three-temp-bar" id="bar-air"></span>
                            <span class="three-temp-value" id="air-value">--°</span>
                        </div>
                    </div>
                    <div class="three-temps-scale" id="temp-scale">
                        <div class="scale-track"></div>
                        <div class="scale-fill"></div>
                        <div class="scale-dot scale-dot-feels"></div>
                        <div class="scale-dot scale-dot-wet"></div>
                        <div class="scale-dot scale-dot-air"></div>
                    </div>
                    <div class="three-temps-note" id="three-temps-note"></div>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
        this.startClock();
    }

    startClock() {
        clearInterval(this.clockTimer);
        this.clockTimer = setInterval(() => this.updateClock(), 60000);
        this.updateClock();
    }

    disconnectedCallback() {
        clearInterval(this.clockTimer);
    }

    updateClock() {
        const label = this.shadowRoot.getElementById('local-time');
        if (!label) return;
        label.textContent = new Date().toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    update() {
        if (!this.data || this.config.current === false) return;

        const current = this.data.current;
        const air = current.temperature;
        const feels = current.feels_like;
        const wetBulb = calculateWetbulbTemp(air, current.humidity);

        this.shadowRoot.getElementById('temp').textContent = `${air}°`;
        this.shadowRoot.getElementById('location').textContent =
            this.data.location || '';
        this.updateClock();

        let summary = current.summary;
        if (current.precipitation_rate > 0) {
            const precipType = current.precipitation_type === 'snow'
                ? 'snowing'
                : 'raining';
            summary = `Currently ${precipType} - ${summary}`;
        }
        this.shadowRoot.getElementById('summary').textContent = summary;

        const dailyRangeEl = this.shadowRoot.getElementById('daily-range');
        const dailyHighEl = this.shadowRoot.getElementById('daily-high');
        const dailyLowEl = this.shadowRoot.getElementById('daily-low');
        dailyHighEl.textContent = '';
        dailyLowEl.textContent = '';
        dailyRangeEl.removeAttribute('aria-label');
        dailyRangeEl.hidden = true;
        const dailyRange = formatDailyTemperatureRange(this.data.daily);
        if (dailyRange) {
            dailyHighEl.textContent = `${dailyRange.high}°`;
            dailyLowEl.textContent = `${dailyRange.low}°`;
            dailyRangeEl.setAttribute('aria-label', dailyRange.ariaLabel);
            dailyRangeEl.hidden = false;
        }

        this.shadowRoot.getElementById('feels-value').textContent = `${feels}°`;
        this.shadowRoot.getElementById('wet-value').textContent = `${wetBulb}°`;
        this.shadowRoot.getElementById('air-value').textContent = `${air}°`;

        const wetPercent = wetBulbPosition(feels, wetBulb, air) ?? 100;
        this.shadowRoot
            .getElementById('temp-scale')
            .style.setProperty('--wet-position', wetPercent / 100);

        this.updateBars(air, feels, wetBulb);

        const clause = wetBulbClause(wetBulb);
        this.shadowRoot.getElementById('three-temps-note').textContent =
            `Wet bulb ${wetBulb}°${clause ? ` — ${clause}` : ''}`;

        this.hideError();
        this.hideLoading();
    }

    updateBars(air, feels, wetBulb) {
        const scale = (value) => {
            if (!Number.isFinite(value) || !Number.isFinite(air) || air === 0) {
                return '0%';
            }
            return `${Math.min(100, Math.max(0, (value / air) * 100))}%`;
        };

        this.shadowRoot.getElementById('bar-air').style.width = '100%';
        this.shadowRoot.getElementById('bar-wet').style.width = scale(wetBulb);
        this.shadowRoot.getElementById('bar-feels').style.width = scale(feels);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.CurrentWeatherWidget = CurrentWeatherWidget;
}

// Hourly Forecast Component
const CHART_GEOMETRY = {
    blue: { height: 150, padding: 14 },
    eink: { height: 180, padding: 16 }
};
const CHART_WIDTH = 1000;
const PRECIPITATION_LABEL_FLOOR = 40;
// The line and the bars are two layers over one box. Scaled to the whole of
// it, a wet hour's bar paints straight over the line it crosses. The bars own
// this share of the chart from the bottom and the line plots into the rest, so
// a certain hour and a cold front can be read at the same time.
const PRECIPITATION_BAND = 1 / 3;
const HOURLY_CHART_HOURS = 12;

class HourlyForecastWidget extends WeatherWidget {
    geometry() {
        return this.getAttribute('data-theme') === 'eink'
            ? CHART_GEOMETRY.eink
            : CHART_GEOMETRY.blue;
    }

    render() {
        if (this.config.hourly === false) return;
        const { height } = this.geometry();
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="hourly-widget widget-content">
                <div class="hourly-caption">
                    <span id="hourly-caption-hours">Next 12 hours</span>
                    <span id="hourly-caption-precip"></span>
                </div>

                <div class="chart-container">
                    <div class="precip-bars" id="precip-bars"></div>
                    <svg class="temperature-chart" id="hourly-chart"
                         viewBox="0 0 ${CHART_WIDTH} ${height}"
                         preserveAspectRatio="none">
                        <polyline class="chart-line" id="chart-line" points=""></polyline>
                    </svg>
                    <div class="chart-marker" id="chart-marker" hidden></div>
                </div>

                <div class="hourly-temps" id="hourly-temps"></div>

                <div class="chart-legend">
                    <span class="legend-item">
                        <span class="legend-swatch legend-swatch-line"></span>temperature
                    </span>
                    <span class="legend-item">
                        <span class="legend-swatch legend-swatch-bar"></span>
                        <span id="legend-precip">precipitation chance</span>
                    </span>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }

    update() {
        if (!this.data || this.config.hourly === false) return;

        const hours = (this.data.hourly || []).slice(0, HOURLY_CHART_HOURS);
        const precipWindow = precipitationWindow(hours);

        this.shadowRoot.getElementById('hourly-caption-hours').textContent =
            `Next ${hours.length} hours`;
        this.shadowRoot.getElementById('hourly-caption-precip').textContent =
            precipWindow ? `${precipWindow.noun} ${precipWindow.start}–${precipWindow.end}` : '';
        this.shadowRoot.getElementById('legend-precip').textContent =
            `${(precipWindow?.noun || 'Precipitation').toLowerCase()} chance`;

        this.renderBars(hours);
        this.renderHours(hours);
        this.drawTemperatureChart(hours);

        this.hideError();
        this.hideLoading();
    }

    renderBars(hours) {
        this.shadowRoot.getElementById('precip-bars').innerHTML = hours.map((hour) => {
            const chance = Number.isFinite(hour.rain) ? hour.rain : 0;
            // A dry hour draws nothing. The bar carries a paint floor so a
            // slight chance stays visible, and that floor would turn a zero
            // into a mark of its own.
            const bar = chance > 0
                ? `<div class="precip-bar" style="height: ${chance * PRECIPITATION_BAND}%"></div>`
                : '';
            return `<div class="precip-cell">${bar}</div>`;
        }).join('');
    }

    renderHours(hours) {
        const container = this.shadowRoot.getElementById('hourly-temps');
        container.innerHTML = '';

        hours.forEach((hour) => {
            const cell = document.createElement('div');
            cell.className = 'hour-temp';
            const chance = Number.isFinite(hour.rain) ? hour.rain : 0;
            cell.innerHTML = `
                <div class="hour-temp-value">${hour.temp}°</div>
            `;

            const timeSpan = document.createElement('div');
            timeSpan.className = 'hour-time';
            timeSpan.textContent = hour.t;
            cell.appendChild(timeSpan);

            const precipSpan = document.createElement('div');
            precipSpan.className = 'hour-precip';
            precipSpan.textContent =
                chance >= PRECIPITATION_LABEL_FLOOR ? `${chance}%` : '';
            cell.appendChild(precipSpan);

            container.appendChild(cell);
        });
    }

    drawTemperatureChart(hours) {
        const { height, padding } = this.geometry();
        // A third of the viewBox is not exact in binary, and the remainder
        // lands in the points attribute as 86.00000000000001. The boundary
        // between the two zones is a whole viewBox unit.
        const band = Math.round(height * PRECIPITATION_BAND);
        const points = calculateHourlyChartPoints(
            hours.map(({ temp }) => temp), CHART_WIDTH, height - band, padding
        );
        const chart = this.shadowRoot.getElementById('hourly-chart');
        const line = this.shadowRoot.getElementById('chart-line');
        const marker = this.shadowRoot.getElementById('chart-marker');

        chart.setAttribute('viewBox', `0 0 ${CHART_WIDTH} ${height}`);
        line.setAttribute('points', points.map(({ x, y }) => `${x},${y}`).join(' '));

        if (!points.length) {
            marker.hidden = true;
            return;
        }

        marker.style.left = `${(points[0].x / CHART_WIDTH) * 100}%`;
        marker.style.top = `${(points[0].y / height) * 100}%`;
        marker.hidden = false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.HourlyForecastWidget = HourlyForecastWidget;
}

// Weather Insights Component

function escapeText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class WeatherInsightsWidget extends WeatherWidget {
    render() {
        if (this.config.insights === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="insight-card" id="insight-card" hidden></div>
            <div class="insight-facts" id="insight-facts" hidden></div>
        `;
    }

    update() {
        if (!this.data || this.config.insights === false) return;

        const hours = (this.data.hourly || []).slice(0, HOURLY_CHART_HOURS);
        const card = this.shadowRoot.getElementById('insight-card');
        const factStrip = this.shadowRoot.getElementById('insight-facts');
        const facts = insightFacts(this.data, hours);
        const isEink = this.getAttribute('data-theme') === 'eink';

        // Second writer of this flag: applyDashboardConfig sets it from the
        // widget catalog before data arrives. After first paint the widget
        // owns it, so reapplying the config would show a disabled widget.
        this.hidden = facts.length === 0;
        card.hidden = true;
        factStrip.hidden = true;
        if (this.hidden) return;

        if (isEink) {
            factStrip.innerHTML = facts.map((fact, index) => `
                <div class="insight-fact${index === 0 ? ' insight-fact-lead' : ''}">
                    ${escapeText(fact)}
                </div>
            `).join('');
            factStrip.hidden = false;
            return;
        }

        card.textContent = insightSentence(this.data, hours);
        card.hidden = false;
    }
}

customElements.define('weather-insights', WeatherInsightsWidget);

/**
 * Forecast Narrative Widget - the National Weather Service's written forecast
 * for the period the panel is standing in.
 */
class ForecastNarrativeWidget extends WeatherWidget {
    constructor() {
        super();
        this.forecast = null;
    }

    render() {
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="narrative-card">
                <div class="narrative-caption" id="narrative-caption"></div>
                <p class="narrative-body" id="narrative-body"></p>
            </div>
        `;
    }

    setupEventListeners() {
        super.setupEventListeners();

        // The app fetches the alerts endpoint once and broadcasts the whole
        // answer. Reading it here rather than fetching again keeps one
        // request per refresh and frees this block from the alerts widget,
        // which the reader can switch off.
        document.addEventListener('weather-alerts-updated', (e) => {
            this.forecast = e.detail?.forecast || null;
            this.update();
        });
    }

    update() {
        if (this.config.narrative === false) return;

        const period = this.forecast?.periods?.[0];
        const prose = period?.detailed_forecast;

        // The service is the US National Weather Service. A location it does
        // not cover answers with no periods, and the block steps aside.
        this.hidden = !prose;
        if (this.hidden) return;

        this.shadowRoot.getElementById('narrative-caption').textContent = period.name;
        this.shadowRoot.getElementById('narrative-body').textContent = prose;
    }
}

customElements.define('forecast-narrative', ForecastNarrativeWidget);

if (typeof module !== 'undefined' && module.exports) {
    module.exports.ForecastNarrativeWidget = ForecastNarrativeWidget;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.WeatherInsightsWidget = WeatherInsightsWidget;
}

// Daily Forecast Component
class DailyForecastWidget extends WeatherWidget {
    connectedCallback() {
        super.connectedCallback();

        const svg = this.shadowRoot.getElementById('daily-chart');
        if (!svg) return;

        // Chart geometry is in pixels, and weather data only refreshes every
        // ten minutes. Without this the chart keeps the width it was drawn at
        // and drifts off its labels for the rest of that interval.
        this.chartResizeObserver = new ResizeObserver(() => {
            if (this.data) this.drawDailyChart(this.data.daily);
        });
        this.chartResizeObserver.observe(svg);
    }

    disconnectedCallback() {
        if (this.chartResizeObserver) {
            this.chartResizeObserver.disconnect();
        }
    }

    render() {
        if (this.config.daily === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="daily-widget widget-content">
                <div class="daily-chart-container">
                    <svg class="daily-chart" id="daily-chart"></svg>
                </div>

                <div class="daily-forecast" id="daily-forecast">
                    <div class="day-forecast">
                        <div class="day-name">---</div>
                        <div class="day-icon">--</div>
                        <div class="day-high">--°</div>
                        <div class="day-low">--°</div>
                    </div>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }

    update() {
        if (!this.data || this.config.daily === false) return;

        const dailyData = this.data.daily;

        // Update daily forecast
        const dailyContainer = this.shadowRoot.getElementById('daily-forecast');
        dailyContainer.innerHTML = '';

        dailyData.forEach((day, index) => {
            // Show first 4 days on mobile, all 7 on larger screens
            const dayDiv = document.createElement('div');
            dayDiv.className = 'day-forecast';
            if (index >= 4) {
                dayDiv.classList.add('sm:block');
                dayDiv.style.display = 'none';
            }

            dayDiv.innerHTML = `
                <div class="day-name">${day.d}</div>
                <div class="day-icon">${getWeatherIcon(day.icon, '2rem')}</div>
                <div class="day-high">${day.h}°</div>
                <div class="day-low">${day.l}°</div>
            `;
            dailyContainer.appendChild(dayDiv);
        });

        // Draw daily chart
        this.drawDailyChart(dailyData);

        this.hideError();
        this.hideLoading();
    }

    drawDailyChart(dailyData) {
        const svg = this.shadowRoot.getElementById('daily-chart');
        const rect = svg.getBoundingClientRect();

        svg.innerHTML = '';

        // The grid drops to four columns on narrow screens, so plot the days
        // it actually shows. Reading the rendered cells keeps the breakpoint
        // in the stylesheet instead of copying it into JavaScript.
        const cells = [...this.shadowRoot.querySelectorAll('.day-forecast')];
        const visibleDays = dailyData.filter(
            (day, index) => cells[index] && getComputedStyle(cells[index]).display !== 'none'
        );

        // The chart spans the same box as those labels, so each point lands on
        // the centre of the label it annotates.
        const points = calculateDailyChartPoints(
            visibleDays,
            rect.width,
            rect.height,
            MARKER_RADIUS
        );

        points.forEach(({ x, highY, lowY }) => {
            // Temperature range line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x);
            line.setAttribute('y1', highY);
            line.setAttribute('x2', x);
            line.setAttribute('y2', lowY);
            line.setAttribute('stroke', '#f59e0b');
            line.setAttribute('stroke-width', '3');
            svg.appendChild(line);

            // High temp circle
            const highCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            highCircle.setAttribute('cx', x);
            highCircle.setAttribute('cy', highY);
            highCircle.setAttribute('r', MARKER_RADIUS);
            highCircle.setAttribute('fill', '#f59e0b');
            svg.appendChild(highCircle);

            // Low temp circle
            const lowCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            lowCircle.setAttribute('cx', x);
            lowCircle.setAttribute('cy', lowY);
            lowCircle.setAttribute('r', MARKER_RADIUS);
            lowCircle.setAttribute('fill', '#3b82f6');
            svg.appendChild(lowCircle);
        });
    }
}

// Hourly Timeline Component
class HourlyTimelineWidget extends WeatherWidget {
    render() {
        if (this.config.timeline === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="timeline-widget widget-content">
                <div class="timeline-container" id="timeline-container">
                    <div class="loading-message">Loading hourly forecast...</div>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }

    update() {
        if (!this.data || this.config.timeline === false) return;

        const hourlyData = this.data.hourly.slice(0, 8);
        const timelineContainer = this.shadowRoot.getElementById('timeline-container');

        timelineContainer.innerHTML = '';

        hourlyData.forEach((hour, index) => {
            const timelineItem = document.createElement('div');
            timelineItem.className = 'timeline-item';

            const isCurrentHour = index === 0;
            const dotClass = isCurrentHour ? 'current' : 'future';

            // Add time-of-day color coding
            const timeOfDay = getTimeOfDay(hour.t, this.data.sun);
            const backgroundColor = getTimeOfDayColor(timeOfDay);

            timelineItem.innerHTML = `
                <div class="timeline-dot ${dotClass}"></div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <div class="timeline-time">${isCurrentHour ? 'NOW' : hour.t}</div>
                        <div class="timeline-temp">${hour.temp}°</div>
                    </div>
                    ${hour.desc ? `<div class="timeline-desc">${hour.desc}</div>` : ''}
                    ${hour.rain > 0 ? `<div class="timeline-rain">${hour.rain}% rain</div>` : ''}
                </div>
            `;

            // Apply background color based on time of day
            timelineItem.style.backgroundColor = backgroundColor;
            timelineItem.style.borderRadius = '0.5rem';
            timelineItem.style.padding = '0.5rem';
            timelineItem.style.margin = '0.25rem 0';

            timelineContainer.appendChild(timelineItem);
        });

        this.hideError();
        this.hideLoading();
    }
}

// Air Quality Widget Component
class AirQualityWidget extends WeatherWidget {
    render() {
        if (this.config['air-quality'] === false) return;
        this.style.display = 'block';
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <style>
                .air-quality-widget {
                    margin: 1rem 0;
                }

                .aqi-display {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 1rem;
                }

                .aqi-value {
                    font-size: 2.5rem;
                    font-weight: 900;
                    line-height: 1;
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    color: white;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                }

                .aqi-info {
                    text-align: right;
                    flex: 1;
                    margin-left: 1rem;
                }

                .aqi-category {
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin-bottom: 0.5rem;
                }

                .health-recommendation {
                    font-size: 0.875rem;
                    opacity: 0.8;
                    line-height: 1.4;
                }

                .pollutants-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 0.5rem;
                    margin-top: 1rem;
                }

                .pollutant-card {
                    padding: 0.75rem;
                    border-radius: 0.5rem;
                    text-align: center;
                    background: var(--card-bg);
                    border: 1px solid var(--card-border);
                }

                .pollutant-name {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    opacity: 0.7;
                    margin-bottom: 0.25rem;
                }

                .pollutant-value {
                    font-size: 1rem;
                    font-weight: 700;
                }

                .pollutant-unit {
                    font-size: 0.75rem;
                    opacity: 0.6;
                }

                .loading-message, .error-message {
                    text-align: center;
                    padding: 2rem;
                    opacity: 0.7;
                }

                @media (max-width: 640px) {
                    .aqi-display {
                        flex-direction: column;
                        text-align: center;
                    }

                    .aqi-info {
                        margin-left: 0;
                        margin-top: 1rem;
                        text-align: center;
                    }

                    .pollutants-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
            </style>

            <div class="air-quality-widget widget-content">
                <div class="loading-message" id="loading">Loading air quality data...</div>

                <div class="aqi-content" id="aqi-content" style="display: none;">
                    <div class="aqi-display">
                        <div class="aqi-value" id="aqi-value">--</div>
                        <div class="aqi-info">
                            <div class="aqi-category" id="aqi-category">Loading...</div>
                            <div class="health-recommendation" id="health-recommendation">Fetching recommendations...</div>
                        </div>
                    </div>

                    <div class="pollutants-grid" id="pollutants-grid">
                        <div class="pollutant-card theme-card">
                            <div class="pollutant-name">PM2.5</div>
                            <div class="pollutant-value" id="pm25-value">--</div>
                            <div class="pollutant-unit">μg/m³</div>
                        </div>
                        <div class="pollutant-card theme-card">
                            <div class="pollutant-name">PM10</div>
                            <div class="pollutant-value" id="pm10-value">--</div>
                            <div class="pollutant-unit">μg/m³</div>
                        </div>
                        <div class="pollutant-card theme-card">
                            <div class="pollutant-name">O₃</div>
                            <div class="pollutant-value" id="o3-value">--</div>
                            <div class="pollutant-unit">μg/m³</div>
                        </div>
                        <div class="pollutant-card theme-card">
                            <div class="pollutant-name">NO₂</div>
                            <div class="pollutant-value" id="no2-value">--</div>
                            <div class="pollutant-unit">μg/m³</div>
                        </div>
                        <div class="pollutant-card theme-card">
                            <div class="pollutant-name">SO₂</div>
                            <div class="pollutant-value" id="so2-value">--</div>
                            <div class="pollutant-unit">μg/m³</div>
                        </div>
                        <div class="pollutant-card theme-card">
                            <div class="pollutant-name">CO</div>
                            <div class="pollutant-value" id="co-value">--</div>
                            <div class="pollutant-unit">mg/m³</div>
                        </div>
                    </div>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }

    connectedCallback() {
        if (!this.isEnabled('air-quality')) return;
        super.connectedCallback();
        this.fetchAirQuality();

        // Refresh air quality every 30 minutes
        setInterval(() => this.fetchAirQuality(), 30 * 60 * 1000);
    }

    async fetchAirQuality() {
        try {
            // Get location parameters from the main weather app
            const weatherApp = document.querySelector('weather-app');
            const { lat, lon, location } = weatherApp ? weatherApp.parseLocationParams() : this.parseLocationParams();

            const params = new URLSearchParams();
            if (lat && lon) {
                params.append('lat', lat);
                params.append('lon', lon);
            }
            if (location) {
                params.append('location', location);
            }

            const response = await fetch(`/api/air-quality?${params}`);
            const data = await response.json();

            if (response.ok && data.aqi) {
                this.updateAirQuality(data);
                this.hideError();
            } else {
                // Hide the widget completely if service is unavailable
                this.style.display = 'none';
            }
        } catch (error) {
            console.error('Air quality fetch error:', error);
            // Hide the widget completely on network errors too
            this.style.display = 'none';
        }
    }

    updateAirQuality(data) {
        const loadingEl = this.shadowRoot.getElementById('loading');
        const contentEl = this.shadowRoot.getElementById('aqi-content');

        // Hide loading, show content
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

        // Update AQI display
        const aqiValueEl = this.shadowRoot.getElementById('aqi-value');
        const aqiCategoryEl = this.shadowRoot.getElementById('aqi-category');
        const healthRecommendationEl = this.shadowRoot.getElementById('health-recommendation');

        if (aqiValueEl && data.aqi) {
            aqiValueEl.textContent = data.aqi.us_aqi;
            aqiValueEl.style.backgroundColor = data.aqi.color;
        }

        if (aqiCategoryEl && data.aqi) {
            aqiCategoryEl.textContent = data.aqi.category;
        }

        if (healthRecommendationEl && data.aqi) {
            healthRecommendationEl.textContent = data.aqi.health_recommendation;
        }

        // Update pollutant values
        if (data.pollutants) {
            const pollutantElements = {
                'pm25-value': Math.round(data.pollutants.pm25),
                'pm10-value': Math.round(data.pollutants.pm10),
                'o3-value': Math.round(data.pollutants.o3),
                'no2-value': Math.round(data.pollutants.no2),
                'so2-value': Math.round(data.pollutants.so2),
                'co-value': (data.pollutants.co / 1000).toFixed(1), // Convert to mg/m³
            };

            Object.entries(pollutantElements).forEach(([id, value]) => {
                const el = this.shadowRoot.getElementById(id);
                if (el) el.textContent = value;
            });
        }
    }

    parseLocationParams() {
        // Use same city mapping as main weather app
        const cityCoords = {
            'chicago': [41.8781, -87.6298, 'Chicago'],
            'nyc': [40.7128, -74.0060, 'New York City'],
            'sf': [37.7749, -122.4194, 'San Francisco'],
            'london': [51.5074, -0.1278, 'London'],
            'paris': [48.8566, 2.3522, 'Paris'],
            'tokyo': [35.6762, 139.6503, 'Tokyo'],
            'sydney': [-33.8688, 151.2093, 'Sydney'],
            'berlin': [52.5200, 13.4050, 'Berlin'],
            'rome': [41.9028, 12.4964, 'Rome'],
            'madrid': [40.4168, -3.7038, 'Madrid'],
        };

        let lat, lon, location;

        const pathParts = window.location.pathname.split('/').filter(part => part);
        if (pathParts.length >= 1 && pathParts[0].includes(',')) {
            // Format: /lat,lon or /lat,lon/location
            const [latStr, lonStr] = pathParts[0].split(',');
            lat = latStr;
            lon = lonStr;
            if (pathParts.length >= 2) {
                location = pathParts[1].replace(/-/g, ' ');
            }
        } else if (pathParts.length >= 1 && cityCoords[pathParts[0].toLowerCase()]) {
            // Format: /city (like /london, /nyc, etc.)
            const cityData = cityCoords[pathParts[0].toLowerCase()];
            lat = cityData[0];
            lon = cityData[1];
            location = cityData[2];
        } else {
            // Query parameters
            const urlParams = new URLSearchParams(window.location.search);
            lat = urlParams.get('lat');
            lon = urlParams.get('lon');
            location = urlParams.get('location');

            // Only use defaults if no parameters at all are provided
            if (!lat && !lon && !location) {
                lat = '41.8781';
                lon = '-87.6298';
                location = 'Chicago';
            }
        }

        return { lat, lon, location };
    }

    showError(message) {
        const errorEl = this.shadowRoot.getElementById('error');
        const contentEl = this.shadowRoot.getElementById('aqi-content');
        const loadingEl = this.shadowRoot.getElementById('loading');

        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
        if (contentEl) contentEl.style.display = 'none';
        if (loadingEl) loadingEl.style.display = 'none';
    }

    hideError() {
        const errorEl = this.shadowRoot.getElementById('error');
        if (errorEl) errorEl.classList.add('hidden');
    }
}


// Wind Direction Compass Component
class WindDirectionWidget extends WeatherWidget {
    connectedCallback() {
        super.connectedCallback();

        // Check if this widget should be displayed
        if (this.config.wind === false) {
            return;
        }
    }

    render() {
        if (this.config.wind === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <style>
                .wind-widget {
                    margin: 1rem 0;
                    text-align: center;
                }

                .wind-compass {
                    width: 120px;
                    height: 120px;
                    margin: 0 auto 1rem;
                    position: relative;
                }

                .compass-svg {
                    width: 100%;
                    height: 100%;
                    transform: rotate(-90deg); /* North at top */
                }

                .compass-circle {
                    fill: none;
                    stroke: var(--text-primary);
                    stroke-width: 2;
                    opacity: 0.3;
                }

                .compass-tick {
                    stroke: var(--text-primary);
                    stroke-width: 1;
                    opacity: 0.5;
                }

                .compass-tick-major {
                    stroke-width: 2;
                    opacity: 0.7;
                }

                .compass-label {
                    fill: var(--text-primary);
                    font-size: 12px;
                    font-weight: 600;
                    text-anchor: middle;
                    dominant-baseline: central;
                    transform: rotate(90deg);
                }

                .wind-arrow {
                    fill: #3b82f6;
                    stroke: #1d4ed8;
                    stroke-width: 1;
                    opacity: 0.9;
                    transition: transform 0.5s ease;
                    transform-origin: 60px 60px;
                }

                .wind-info {
                    display: flex;
                    justify-content: space-around;
                    margin: 1rem 0;
                }

                .wind-detail {
                    text-align: center;
                }

                .wind-value {
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin-bottom: 0.25rem;
                }

                .wind-label {
                    font-size: 0.75rem;
                    opacity: 0.7;
                    text-transform: uppercase;
                    font-weight: 600;
                }

                .wind-description {
                    font-size: 0.875rem;
                    opacity: 0.8;
                    margin-top: 0.5rem;
                }

                .beaufort-scale {
                    font-size: 0.75rem;
                    opacity: 0.6;
                    font-style: italic;
                }

                @media (max-width: 640px) {
                    .wind-compass {
                        width: 100px;
                        height: 100px;
                    }

                    .compass-label {
                        font-size: 10px;
                    }

                    .wind-info {
                        flex-wrap: wrap;
                        gap: 0.5rem;
                    }
                }
            </style>

            <div class="wind-widget widget-content">
                <div class="wind-compass">
                    <svg class="compass-svg" viewBox="0 0 120 120">
                        <!-- Compass circle -->
                        <circle class="compass-circle" cx="60" cy="60" r="50"></circle>

                        <!-- Compass ticks and labels -->
                        <!-- North -->
                        <line class="compass-tick-major" x1="60" y1="10" x2="60" y2="20"></line>
                        <text class="compass-label" x="60" y="15">N</text>

                        <!-- Northeast -->
                        <line class="compass-tick" x1="95.36" y1="24.64" x2="88.64" y2="31.36"></line>

                        <!-- East -->
                        <line class="compass-tick-major" x1="110" y1="60" x2="100" y2="60"></line>
                        <text class="compass-label" x="105" y="60">E</text>

                        <!-- Southeast -->
                        <line class="compass-tick" x1="95.36" y1="95.36" x2="88.64" y2="88.64"></line>

                        <!-- South -->
                        <line class="compass-tick-major" x1="60" y1="110" x2="60" y2="100"></line>
                        <text class="compass-label" x="60" y="105">S</text>

                        <!-- Southwest -->
                        <line class="compass-tick" x1="24.64" y1="95.36" x2="31.36" y2="88.64"></line>

                        <!-- West -->
                        <line class="compass-tick-major" x1="10" y1="60" x2="20" y2="60"></line>
                        <text class="compass-label" x="15" y="60">W</text>

                        <!-- Northwest -->
                        <line class="compass-tick" x1="24.64" y1="24.64" x2="31.36" y2="31.36"></line>

                        <!-- Wind arrow (pointing in wind direction) -->
                        <path class="wind-arrow" id="wind-arrow"
                              d="M60,25 L65,35 L60,30 L55,35 Z M60,30 L60,85 M55,80 L60,85 L65,80"
                              style="display: none;">
                        </path>

                        <!-- Center dot -->
                        <circle cx="60" cy="60" r="3" fill="var(--text-primary)" opacity="0.5"></circle>
                    </svg>
                </div>

                <div class="wind-info">
                    <div class="wind-detail">
                        <div class="wind-value" id="wind-speed">-- mph</div>
                        <div class="wind-label">Speed</div>
                    </div>
                    <div class="wind-detail">
                        <div class="wind-value" id="wind-direction">--</div>
                        <div class="wind-label">Direction</div>
                    </div>
                    <div class="wind-detail">
                        <div class="wind-value" id="wind-gust">-- mph</div>
                        <div class="wind-label">Gusts</div>
                    </div>
                </div>

                <div class="wind-description" id="wind-description">Wind data loading...</div>
                <div class="beaufort-scale" id="beaufort-scale"></div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }

    update() {
        if (!this.data || !this.data.current) return;

        const current = this.data.current;

        // Update wind speed
        const windSpeedEl = this.shadowRoot.getElementById('wind-speed');
        if (windSpeedEl && current.wind_speed !== undefined) {
            windSpeedEl.textContent = `${current.wind_speed} mph`;
        }

        // Update wind direction
        const windDirectionEl = this.shadowRoot.getElementById('wind-direction');
        const windArrow = this.shadowRoot.getElementById('wind-arrow');

        // Check if we have valid numeric wind direction
        const windDirection = current.wind_direction;
        const isValidDirection = windDirection !== undefined &&
                               windDirection !== null &&
                               typeof windDirection === 'number' &&
                               !isNaN(windDirection) &&
                               windDirection >= 0 &&
                               windDirection <= 360;

        if (isValidDirection) {
            const direction = windDirection;
            const directionText = this.getWindDirectionText(direction);

            if (windDirectionEl) {
                windDirectionEl.textContent = `${direction}° ${directionText}`;
            }

            // Rotate arrow to show wind direction
            if (windArrow) {
                windArrow.style.display = 'block';
                windArrow.style.transform = `rotate(${direction}deg)`;
            }
        } else {
            // Handle case where wind direction is not available or invalid
            if (windDirectionEl) {
                windDirectionEl.textContent = current.wind_speed > 0 ? 'Variable' : '--';
            }
            if (windArrow) windArrow.style.display = 'none';
        }

        // Update wind gusts (if available)
        const windGustEl = this.shadowRoot.getElementById('wind-gust');
        if (windGustEl) {
            if (current.wind_gust !== undefined) {
                windGustEl.textContent = `${current.wind_gust} mph`;
            } else {
                // Estimate gusts as 1.3x sustained wind for display
                const estimatedGust = Math.round(current.wind_speed * 1.3);
                windGustEl.textContent = `~${estimatedGust} mph`;
            }
        }

        // Update wind description and Beaufort scale
        this.updateWindDescription(current.wind_speed);

        this.hideError();
        this.hideLoading();
    }

    getWindDirectionText(degrees) {
        const directions = [
            'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
            'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
        ];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    updateWindDescription(windSpeed) {
        const descriptionEl = this.shadowRoot.getElementById('wind-description');
        const beaufortEl = this.shadowRoot.getElementById('beaufort-scale');

        if (!descriptionEl || !beaufortEl) return;

        const beaufort = this.getBeaufortData(windSpeed);
        descriptionEl.textContent = beaufort.description;
        beaufortEl.textContent = `Beaufort Scale: ${beaufort.scale} - ${beaufort.name}`;
    }

    getBeaufortData(windSpeedMph) {
        // Convert mph to m/s for Beaufort calculation, then back
        const windSpeedMs = windSpeedMph * 0.44704;

        if (windSpeedMs < 0.3) {
            return { scale: 0, name: 'Calm', description: 'Smoke rises vertically' };
        } else if (windSpeedMs < 1.5) {
            return { scale: 1, name: 'Light air', description: 'Smoke drift indicates wind direction' };
        } else if (windSpeedMs < 3.3) {
            return { scale: 2, name: 'Light breeze', description: 'Wind felt on face, leaves rustle' };
        } else if (windSpeedMs < 5.5) {
            return { scale: 3, name: 'Gentle breeze', description: 'Leaves and twigs move, flags extend' };
        } else if (windSpeedMs < 7.9) {
            return { scale: 4, name: 'Moderate breeze', description: 'Small branches move, dust rises' };
        } else if (windSpeedMs < 10.7) {
            return { scale: 5, name: 'Fresh breeze', description: 'Small trees sway, waves on water' };
        } else if (windSpeedMs < 13.8) {
            return { scale: 6, name: 'Strong breeze', description: 'Large branches move, whistling in wires' };
        } else if (windSpeedMs < 17.1) {
            return { scale: 7, name: 'Near gale', description: 'Whole trees move, resistance walking' };
        } else if (windSpeedMs < 20.7) {
            return { scale: 8, name: 'Gale', description: 'Twigs break off trees, difficult to walk' };
        } else if (windSpeedMs < 24.4) {
            return { scale: 9, name: 'Strong gale', description: 'Slight structural damage, chimney pots fall' };
        } else if (windSpeedMs < 28.4) {
            return { scale: 10, name: 'Storm', description: 'Trees uprooted, considerable damage' };
        } else if (windSpeedMs < 32.6) {
            return { scale: 11, name: 'Violent storm', description: 'Widespread damage, rare on land' };
        } else {
            return { scale: 12, name: 'Hurricane', description: 'Devastating damage, extreme danger' };
        }
    }
}


// Weather App Main Controller
class WeatherApp {
    constructor() {
        this.activeRequests = new Map();
        this.geolocationRequested = false;
        this.cityCoords = {
            'chicago': [41.8781, -87.6298, 'Chicago'],
            'nyc': [40.7128, -74.0060, 'New York City'],
            'sf': [37.7749, -122.4194, 'San Francisco'],
            'london': [51.5074, -0.1278, 'London'],
            'paris': [48.8566, 2.3522, 'Paris'],
            'tokyo': [35.6762, 139.6503, 'Tokyo'],
            'sydney': [-33.8688, 151.2093, 'Sydney'],
            'berlin': [52.5200, 13.4050, 'Berlin'],
            'rome': [41.9028, 12.4964, 'Rome'],
            'madrid': [40.4168, -3.7038, 'Madrid'],
        };
    }

    // Save location to localStorage
    saveLocationToStorage(lat, lon, location) {
        try {
            const locationData = {
                lat: lat,
                lon: lon,
                location: location,
                timestamp: Date.now()
            };
            localStorage.setItem('weather_location', JSON.stringify(locationData));
            console.log('📍 Location saved to localStorage:', locationData);
        } catch (error) {
            console.error('Failed to save location to localStorage:', error);
        }
    }

    // Load location from localStorage
    loadLocationFromStorage() {
        try {
            const stored = localStorage.getItem('weather_location');
            if (stored) {
                const locationData = JSON.parse(stored);

                // Check if location is less than 24 hours old
                const twentyFourHours = 24 * 60 * 60 * 1000;
                if (Date.now() - locationData.timestamp < twentyFourHours) {
                    console.log('📍 Loaded location from localStorage:', locationData);
                    return locationData;
                } else {
                    console.log('📍 Stored location is too old, removing from localStorage');
                    localStorage.removeItem('weather_location');
                }
            }
        } catch (error) {
            console.error('Failed to load location from localStorage:', error);
        }
        return null;
    }

    // Request user's geolocation
    async requestGeolocation() {
        if (!navigator.geolocation) {
            console.log('❌ Geolocation is not supported by this browser');
            return null;
        }

        if (this.geolocationRequested) {
            console.log('📍 Geolocation already requested');
            return null;
        }

        this.geolocationRequested = true;
        console.log('📍 Requesting geolocation permission...');

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    console.log('📍 Geolocation success:', lat, lon);

                    // Use reverse geocoding to get a readable location name
                    this.reverseGeocode(lat, lon)
                        .then(location => {
                            const locationData = { lat, lon, location };
                            this.saveLocationToStorage(lat, lon, location);
                            this.updateUrlWithLocation(lat, lon, location);
                            resolve(locationData);
                        })
                        .catch(() => {
                            const locationData = { lat, lon, location: 'Your Location' };
                            this.saveLocationToStorage(lat, lon, 'Your Location');
                            this.updateUrlWithLocation(lat, lon, 'Your Location');
                            resolve(locationData);
                        });
                },
                (error) => {
                    console.log('❌ Geolocation error:', error.message);
                    resolve(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 600000 // 10 minutes
                }
            );
        });
    }

    // Simple reverse geocoding using OpenStreetMap Nominatim
    async reverseGeocode(lat, lon) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
            const data = await response.json();

            if (data && data.address) {
                const address = data.address;
                const city = address.city || address.town || address.village || address.county;
                const state = address.state || address.region;
                const country = address.country;

                if (city && state && country === 'United States') {
                    return `${city}, ${state}`;
                } else if (city && country) {
                    return `${city}, ${country}`;
                } else if (city) {
                    return city;
                }
            }

            return 'Your Location';
        } catch (error) {
            console.error('Reverse geocoding failed:', error);
            return 'Your Location';
        }
    }

    // Update URL with detected location
    updateUrlWithLocation(lat, lon, location) {
        const currentUrl = new URL(window.location);

        // Don't update URL if it already has coordinates or city parameters
        if (currentUrl.pathname !== '/' && currentUrl.pathname !== '') {
            console.log('📍 URL already has location, not updating');
            return;
        }

        // Don't update URL if it already has lat/lon parameters
        if (currentUrl.searchParams.has('lat') && currentUrl.searchParams.has('lon')) {
            console.log('📍 URL already has lat/lon parameters, not updating');
            return;
        }

        // Update URL with coordinates
        const newUrl = `${currentUrl.origin}/${lat},${lon}/${location.replace(/\s+/g, '-')}`;
        console.log('📍 Updating URL to:', newUrl);
        window.history.replaceState({}, '', newUrl);
    }

    async init() {
        // Try to get location from localStorage first, then geolocation
        const storedLocation = this.loadLocationFromStorage();
        if (storedLocation) {
            console.log('📍 Using stored location:', storedLocation);
            // Update URL if we're on the root page
            if (window.location.pathname === '/' || window.location.pathname === '') {
                this.updateUrlWithLocation(storedLocation.lat, storedLocation.lon, storedLocation.location);
            }
        } else {
            // Request geolocation if no stored location and we're on the root page
            if (window.location.pathname === '/' || window.location.pathname === '') {
                console.log('📍 No stored location, requesting geolocation...');
                await this.requestGeolocation();
            }
        }

        await this.fetchWeatherData();
        this.fetchAlertsData();

        // Create connection status indicator
        this.createConnectionStatus();

        // Refresh weather data every 10 minutes (fallback if real-time fails)
        setInterval(() => this.fetchWeatherData(), 600000);
        setInterval(() => this.fetchAlertsData(), 600000);
    }

    createConnectionStatus() {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'connection-status';
        statusDiv.className = 'connection-status disconnected';
        statusDiv.textContent = 'Connecting...';
        document.body.appendChild(statusDiv);

        // Auto-hide after 3 seconds when connected
        let hideTimeout = null;

        const showStatus = (status) => {
            const statusEl = document.getElementById('connection-status');
            if (!statusEl) return;

            statusEl.className = 'connection-status';

            if (status.connected) {
                if (status.type === 'websocket') {
                    statusEl.classList.add('connected');
                    statusEl.textContent = '🔗 Real-time';
                } else if (status.type === 'polling') {
                    statusEl.classList.add('polling');
                    statusEl.textContent = '📡 Polling';
                }

                // Auto-hide after 3 seconds
                if (hideTimeout) clearTimeout(hideTimeout);
                hideTimeout = setTimeout(() => {
                    statusEl.style.opacity = '0';
                    setTimeout(() => statusEl.style.display = 'none', 300);
                }, 3000);
            } else {
                statusEl.classList.add('disconnected');
                statusEl.textContent = '❌ Disconnected';
                statusEl.style.opacity = '0.9';
                statusEl.style.display = 'block';

                if (hideTimeout) clearTimeout(hideTimeout);
            }
        };

        // Listen for connection status changes
        document.addEventListener('connection-status', (e) => showStatus(e.detail));

        // A connection event is an edge, and this badge is built after the
        // first weather fetch returns, while the manager connects as soon as
        // its script loads. On a fast link that edge is long gone, so read the
        // live state rather than wait for one that already passed. A handshake
        // still in flight also reports not-connected, and calling that failure
        // would be a lie, so only a live connection speaks here.
        const status = window.realTimeWeather && window.realTimeWeather.getConnectionStatus();
        if (status && status.connected) showStatus(status);
    }

    async fetchWeatherData() {
        try {
            this.broadcastEvent('weather-loading', { loading: true });

            const { lat, lon, location, timezone } = this.parseLocationParams();
            const apiUrl = this.buildApiUrl(lat, lon, location, timezone);

            // Request deduplication
            if (this.activeRequests.has(apiUrl)) {
                console.log('Request deduplication: reusing existing request for', apiUrl);
                const data = await this.activeRequests.get(apiUrl);
                this.broadcastWeatherData(data);
                return;
            }

            // Create and cache the request promise
            const requestPromise = fetch(apiUrl).then(response => response.json());
            this.activeRequests.set(apiUrl, requestPromise);

            const data = await requestPromise;
            this.activeRequests.delete(apiUrl);

            if (data.error) {
                console.error('Weather API error:', data.error);
                this.broadcastEvent('weather-error', { error: data.error });
                return;
            }

            this.broadcastWeatherData(data);
        } catch (error) {
            console.error('Error fetching weather:', error);
            this.broadcastEvent('weather-error', {
                error: 'Failed to load weather data. Please check your internet connection.'
            });
        }
    }

    // The alerts endpoint answers with both the active alerts and the National
    // Weather Service's written forecast. One request serves every block that
    // reads either, so it lives here rather than inside a widget.
    async fetchAlertsData() {
        try {
            const { lat, lon, location } = this.parseLocationParams();
            const params = new URLSearchParams();
            if (lat && lon) {
                params.append('lat', lat);
                params.append('lon', lon);
            }
            if (location) {
                params.append('location', location);
            }

            const response = await fetch(`/api/weather/alerts?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.broadcastEvent('weather-alerts-updated', await response.json());
        } catch (error) {
            // A panel that repaints slowly and is read at a glance is better
            // off holding a stale forecast than blanking on a network blip,
            // so a failure broadcasts nothing and the last answer stands.
            console.error('Failed to load weather alerts:', error);
        }
    }

    parseLocationParams() {
        let lat, lon, location, timezone;

        // Check URL format
        const pathParts = window.location.pathname.split('/').filter(part => part);
        if (pathParts.length >= 1 && pathParts[0].includes(',')) {
            // Format: /lat,lon/location or /lat,lon
            const [latStr, lonStr] = pathParts[0].split(',');
            lat = latStr;
            lon = lonStr;
            if (pathParts.length >= 2) {
                location = pathParts[1].replace(/-/g, ' ');
            }
            // Timezone will be auto-detected by OpenMeteo API
        } else if (pathParts.length >= 1 && this.cityCoords[pathParts[0].toLowerCase()]) {
            // Format: /city
            const cityData = this.cityCoords[pathParts[0].toLowerCase()];
            lat = cityData[0];
            lon = cityData[1];
            location = cityData[2];
            // Timezone will be auto-detected by OpenMeteo API
        } else {
            // Fallback to query parameters
            const urlParams = new URLSearchParams(window.location.search);
            lat = urlParams.get('lat');
            lon = urlParams.get('lon');
            location = urlParams.get('location');
            timezone = urlParams.get('timezone'); // Optional override
        }

        // Check localStorage if no location found in URL
        if (!lat && !lon && !location) {
            const storedLocation = this.loadLocationFromStorage();
            if (storedLocation) {
                lat = storedLocation.lat;
                lon = storedLocation.lon;
                location = storedLocation.location;
                console.log('📍 Using stored location for weather data:', storedLocation);
            }
        }

        // Default to Chicago if no location provided
        if (!lat && !lon && !location) {
            const defaultCity = this.cityCoords['chicago'];
            lat = defaultCity[0];
            lon = defaultCity[1];
            location = defaultCity[2];
            // Timezone will be auto-detected by OpenMeteo API
        }

        return { lat, lon, location, timezone };
    }

    buildApiUrl(lat, lon, location, timezone) {
        let apiUrl = '/api/weather';
        const params = new URLSearchParams();

        if (lat && lon) {
            params.append('lat', lat);
            params.append('lon', lon);
        }
        if (location) {
            params.append('location', location);
        }
        if (timezone) {
            params.append('timezone', timezone); // Optional override only
        }
        if (params.toString()) {
            apiUrl += '?' + params.toString();
        }

        return apiUrl;
    }

    broadcastWeatherData(data) {
        this.broadcastEvent('weather-data-updated', data);
        this.broadcastEvent('weather-loading', { loading: false });
    }

    broadcastEvent(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        document.dispatchEvent(event);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.WeatherApp = WeatherApp;
}

// Help Section Component
class HelpSection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isVisible = false;
    }

    connectedCallback() {
        if (this.hidden) return;

        this.render();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const toggleButton = this.shadowRoot.getElementById('help-toggle');
        const helpContent = this.shadowRoot.getElementById('help-content');

        toggleButton.addEventListener('click', () => {
            this.isVisible = !this.isVisible;
            helpContent.style.display = this.isVisible ? 'block' : 'none';
            toggleButton.textContent = this.isVisible ? '▼ Hide Help' : '▲ Show Help';
            toggleButton.setAttribute('aria-expanded', String(this.isVisible));
        });
    }

    render() {
        const widgetIds = window.DashboardConfig.WIDGET_CATALOG
            .map(({ id }) => id)
            .join(', ');

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    margin-top: 2rem;
                    padding: 1rem;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: var(--text-primary);
                    font-size: 0.875rem;
                }

                .help-toggle {
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-size: 0.875rem;
                    width: 100%;
                    text-align: center;
                    transition: opacity 0.2s ease;
                    background: var(--help-surface);
                    border: 1px solid var(--card-border);
                    color: var(--text-primary);
                }

                .help-toggle:hover {
                    opacity: 0.8;
                }

                .help-content {
                    display: none;
                    margin-top: 1rem;
                    padding: 1rem;
                    border-radius: 0.5rem;
                    background: var(--help-surface);
                    border: 1px solid var(--card-border);
                }

                .param-name {
                    color: var(--help-param-color);
                    font-weight: 600;
                    font-family: monospace;
                }

                .param-example {
                    color: var(--help-example-color);
                    font-family: monospace;
                    font-size: 0.8rem;
                    display: block;
                    margin-top: 0.25rem;
                    opacity: 1;
                }

                .city-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 0.5rem;
                    margin: 0.5rem 0;
                }

                .city-item {
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.25rem;
                    font-family: monospace;
                    font-size: 0.8rem;
                    text-align: center;
                    background: var(--card-bg);
                    border: 1px solid var(--card-border);
                }

                @media (max-width: 640px) {
                    :host {
                        font-size: 0.8rem;
                    }

                    .city-list {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
            </style>

            <button id="help-toggle" class="help-toggle theme-card" aria-controls="help-content" aria-expanded="false">▲ Show Help</button>

            <div id="help-content" class="help-content theme-card">
                <div class="help-section">
                    <h3>🌐 Location Parameters</h3>
                    <p>Specify location using coordinates or city names:</p>
                    <ul class="param-list">
                        <li>
                            <span class="param-name">lat</span> & <span class="param-name">lon</span> - Latitude and longitude coordinates
                            <span class="param-example">?lat=41.8781&lon=-87.6298</span>
                        </li>
                        <li>
                            <span class="param-name">location</span> - Display name for the location
                            <span class="param-example">?lat=41.8781&lon=-87.6298&location=Chicago</span>
                        </li>
                    </ul>

                    <h3>🏙️ City Shortcuts</h3>
                    <p>Use city names directly in the URL path:</p>
                    <div class="city-list">
                        <div class="city-item theme-card">/chicago</div>
                        <div class="city-item theme-card">/nyc</div>
                        <div class="city-item theme-card">/sf</div>
                        <div class="city-item theme-card">/london</div>
                        <div class="city-item theme-card">/paris</div>
                        <div class="city-item theme-card">/tokyo</div>
                        <div class="city-item theme-card">/sydney</div>
                        <div class="city-item theme-card">/berlin</div>
                        <div class="city-item theme-card">/rome</div>
                        <div class="city-item theme-card">/madrid</div>
                    </div>
                </div>

                <div class="help-section">
                    <h3>📱 Widget Controls</h3>
                    <p>Show or hide specific weather widgets:</p>
                    <ul class="param-list">
                        <li>
                            <span class="param-name">widgets</span> - Comma-separated list of widgets to show
                            <span class="param-example">?widgets=${widgetIds}</span>
                        </li>
                    </ul>
                </div>

                <div class="help-section">
                    <h3>🎨 Visual Options</h3>
                    <p>Customize the appearance and behavior:</p>
                    <ul class="param-list">
                        <li>
                            <span class="param-name">animated</span> - Use animated weather icons (true/false)
                            <span class="param-example">?animated=false</span>
                        </li>
                        <li>
                            <span class="param-name">theme</span> - Themes: blue (default), light, eink
                            <span class="param-example">?theme=light</span>
                        </li>
                    </ul>
                </div>

                <div class="help-section">
                    <h3>🔗 Example URLs</h3>
                    <p>Here are some example configurations:</p>
                    <ul class="param-list">
                        <li>
                            <strong>Minimal Chicago view:</strong>
                            <span class="param-example">/chicago?widgets=current</span>
                        </li>
                        <li>
                            <strong>Static icons, no timeline:</strong>
                            <span class="param-example">/nyc?animated=false&timeline=false</span>
                        </li>
                        <li>
                            <strong>Custom location:</strong>
                            <span class="param-example">?lat=34.0522&lon=-118.2437&location=Los Angeles</span>
                        </li>
                        <li>
                            <strong>Hourly forecast only:</strong>
                            <span class="param-example">/london?widgets=hourly</span>
                        </li>
                        <li>
                            <strong>Light background theme:</strong>
                            <span class="param-example">/tokyo?theme=light</span>
                        </li>
                        <li>
                            <strong>High contrast eInk display:</strong>
                            <span class="param-example">/chicago?theme=eink</span>
                        </li>
                    </ul>
                </div>

                <div class="help-section">
                    <h3>💡 Tips</h3>
                    <p>• Parameters can be combined for maximum customization</p>
                    <p>• Default location is Chicago if no location is specified</p>
                    <p>• All weather data includes beautiful sunrise/sunset color coding</p>
                </div>
            </div>
        `;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.HelpSection = HelpSection;
}

/**
 * Pressure Trends Widget - displays atmospheric pressure with trends and predictions
 */
class PressureTrendsWidget extends WeatherWidget {
    constructor() {
        super();
        this.weatherData = null;
    }

    connectedCallback() {
        if (!this.isEnabled('pressure')) return;
        super.connectedCallback();
        this.render();

        // Listen for weather data updates
        document.addEventListener('weather-data-updated', (event) => {
            this.updateWeatherData(event.detail);
        });

        // Listen for theme changes
        document.addEventListener('theme-changed', () => {
            this.render();
        });
    }

    updateWeatherData(data) {
        this.weatherData = data;
        this.render();
    }

    getTrendArrow(trend) {
        switch(trend) {
            case 'rising': return '↗';
            case 'falling': return '↘';
            case 'steady':
            default: return '→';
        }
    }

    getTrendColor(trend, rate) {
        if (trend === 'steady') return 'var(--text-primary)';

        const absRate = Math.abs(rate);
        if (absRate > 0.5) {
            // Fast change - red for falling, green for rising
            return trend === 'rising' ? '#10b981' : '#ef4444';
        } else {
            // Slow change - yellow for caution
            return '#f59e0b';
        }
    }

    createMiniChart(history) {
        if (!history || history.length < 3) return '<div class="no-chart">Insufficient data</div>';

        const width = 100;
        const height = 30;
        const padding = 5;

        const values = history.map(h => h.pressure);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const range = maxValue - minValue || 1; // Avoid division by zero

        // Create SVG path for pressure line
        const points = history.map((h, index) => {
            const x = padding + ((width - 2 * padding) * index) / (history.length - 1);
            const y = height - padding - ((h.pressure - minValue) / range) * (height - 2 * padding);
            return `${x},${y}`;
        });

        const pathData = `M ${points.join(' L ')}`;

        return `
            <svg class="pressure-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
                <path d="${pathData}"
                      stroke="var(--text-primary)"
                      stroke-width="1"
                      fill="none"
                      opacity="0.8"/>
                ${points.map((point, index) =>
                    `<circle cx="${point.split(',')[0]}"
                             cy="${point.split(',')[1]}"
                             r="1"
                             fill="var(--text-primary)"
                             opacity="0.6"/>`
                ).join('')}
            </svg>
        `;
    }

    render() {
        if (!this.weatherData?.pressure_trend) {
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: block;
                    }
                    .loading {
                        padding: 1rem;
                        text-align: center;
                        opacity: 0.6;
                        font-size: 0.9rem;
                    }
                </style>
                <div class="loading">Loading pressure data...</div>
            `;
            return;
        }

        const trend = this.weatherData.pressure_trend;
        const currentPressure = this.weatherData.current?.pressure || trend.current_pressure;

        // Convert pressure from hPa to inHg for US users
        const pressureInHg = (currentPressure * 0.02953).toFixed(2);
        const trendArrow = this.getTrendArrow(trend.trend);
        const trendColor = this.getTrendColor(trend.trend, trend.rate);

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                }

                .pressure-card {
                    background: var(--card-bg);
                    backdrop-filter: blur(10px);
                    border-radius: 1rem;
                    border: 1px solid var(--card-border);
                    padding: 1rem;
                    margin-bottom: 1rem;
                }

                .pressure-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }

                .pressure-title {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    opacity: 0.9;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .pressure-main {
                    display: grid;
                    grid-template-columns: 1fr auto 1fr;
                    gap: 1rem;
                    align-items: center;
                    margin-bottom: 1rem;
                }

                .pressure-current {
                    text-align: center;
                }

                .pressure-value {
                    font-size: 1.8rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    line-height: 1;
                }

                .pressure-unit {
                    font-size: 0.8rem;
                    opacity: 0.7;
                    margin-top: 0.25rem;
                }

                .pressure-hpa {
                    font-size: 0.7rem;
                    opacity: 0.6;
                    margin-top: 0.1rem;
                }

                .pressure-trend {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                }

                .trend-arrow {
                    font-size: 2rem;
                    color: ${trendColor};
                    line-height: 1;
                }

                .trend-rate {
                    font-size: 0.8rem;
                    color: ${trendColor};
                    font-weight: 600;
                    text-align: center;
                }

                .pressure-chart-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.25rem;
                }

                .chart-label {
                    font-size: 0.7rem;
                    opacity: 0.7;
                    text-align: center;
                }

                .pressure-chart {
                    width: 100px;
                    height: 30px;
                    opacity: 0.8;
                }

                .pressure-prediction {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 0.5rem;
                    padding: 0.75rem;
                    text-align: center;
                    margin-top: 0.5rem;
                }

                .prediction-text {
                    font-size: 0.85rem;
                    color: var(--text-primary);
                    opacity: 0.9;
                    font-weight: 500;
                }

                .no-chart {
                    font-size: 0.7rem;
                    opacity: 0.5;
                    text-align: center;
                    padding: 0.5rem;
                }

                /* Mobile optimizations */
                @media (max-width: 640px) {
                    .pressure-main {
                        grid-template-columns: 1fr;
                        gap: 0.75rem;
                        text-align: center;
                    }

                    .pressure-value {
                        font-size: 1.5rem;
                    }

                    .trend-arrow {
                        font-size: 1.5rem;
                    }

                    .pressure-chart {
                        width: 80px;
                        height: 25px;
                    }
                }

                /* eInk theme adjustments */
                :host([data-theme="eink"]) .pressure-card {
                    border: 2px solid var(--card-border);
                    background: var(--card-bg);
                }

                :host([data-theme="eink"]) .pressure-prediction {
                    background: rgba(0, 0, 0, 0.1);
                    border: 1px solid var(--card-border);
                }
            </style>

            <div class="pressure-card">
                <div class="pressure-header">
                    <div class="pressure-title">
                        📊 Atmospheric Pressure
                    </div>
                </div>

                <div class="pressure-main">
                    <div class="pressure-current">
                        <div class="pressure-value">${pressureInHg}</div>
                        <div class="pressure-unit">inHg</div>
                        <div class="pressure-hpa">${currentPressure} hPa</div>
                    </div>

                    <div class="pressure-trend">
                        <div class="trend-arrow" title="Pressure ${trend.trend} at ${trend.rate} hPa/hour">
                            ${trendArrow}
                        </div>
                        <div class="trend-rate">
                            ${trend.rate > 0 ? '+' : ''}${trend.rate} hPa/h
                        </div>
                    </div>

                    <div class="pressure-chart-container">
                        <div class="chart-label">12hr trend</div>
                        ${this.createMiniChart(trend.history)}
                    </div>
                </div>

                <div class="pressure-prediction">
                    <div class="prediction-text">
                        ${trend.prediction}
                    </div>
                </div>
            </div>
        `;
    }
}

// Weather Alerts Widget for National Weather Service alerts and warnings
class WeatherAlertsWidget extends WeatherWidget {
    constructor() {
        super();
        this.alertsData = null;
        this.isExpanded = false;
    }

    connectedCallback() {
        if (!this.isEnabled('alerts')) return;
        super.connectedCallback();
    }

    setupEventListeners() {
        super.setupEventListeners();

        // The app makes this request on the weather refresh cadence and
        // broadcasts the answer, which the forecast narrative reads too.
        document.addEventListener('weather-alerts-updated', (e) => {
            this.alertsData = e.detail;
            this.render();
        });
    }

    toggleExpanded() {
        this.isExpanded = !this.isExpanded;
        this.render();
    }

    render() {
        if (!this.alertsData) {
            this.style.display = 'none';
            this.shadowRoot.innerHTML = '';
            return;
        }

        const alerts = this.alertsData.alerts || {};
        const alertCount = alerts.active_count || 0;
        const alertsList = alerts.alerts || [];
        const hasWarnings = alerts.has_warnings || false;

        // Hide the entire widget if there are no alerts
        if (alertCount === 0) {
            this.style.display = 'none';
            return;
        }

        // Show the widget if there are alerts
        this.style.display = 'block';

        // Determine widget state and styling
        let statusIcon = '🟢';
        let statusText = 'No Active Alerts';
        let statusColor = '#22c55e';

        if (alertCount > 0) {
            if (hasWarnings) {
                statusIcon = '🔴';
                statusText = `${alertCount} Alert${alertCount > 1 ? 's' : ''} - Warnings Active`;
                statusColor = '#ef4444';
            } else {
                statusIcon = '🟡';
                statusText = `${alertCount} Alert${alertCount > 1 ? 's' : ''} Active`;
                statusColor = '#f59e0b';
            }
        }

        this.shadowRoot.innerHTML = `
            <style>
                ${this.getBaseStyles()}
                .alerts-widget {
                    background: var(--widget-background);
                    border: 1px solid var(--border-color);
                    border-radius: 0.5rem;
                    overflow: hidden;
                }
                .alerts-header {
                    padding: 1rem;
                    cursor: ${alertCount > 0 ? 'pointer' : 'default'};
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transition: background-color 0.2s ease;
                }
                .alerts-header:hover {
                    background: ${alertCount > 0 ? 'var(--hover-background)' : 'transparent'};
                }
                .status-indicator {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .status-icon {
                    font-size: 1.25rem;
                }
                .status-text {
                    font-weight: 600;
                    color: var(--text-primary);
                    font-size: 0.95rem;
                }
                .alert-count {
                    background: ${statusColor};
                    color: white;
                    padding: 0.25rem 0.5rem;
                    border-radius: 1rem;
                    font-size: 0.8rem;
                    font-weight: 600;
                    min-width: 1.5rem;
                    text-align: center;
                }
                .expand-icon {
                    font-size: 0.9rem;
                    color: var(--text-muted);
                    transform: rotate(${this.isExpanded ? '180deg' : '0deg'});
                    transition: transform 0.2s ease;
                }
                .alerts-list {
                    border-top: 1px solid var(--border-color);
                    max-height: ${this.isExpanded ? '400px' : '0'};
                    overflow-y: auto;
                    transition: max-height 0.3s ease;
                }
                .alert-item {
                    padding: 1rem;
                    border-bottom: 1px solid var(--border-color);
                    background: var(--widget-background);
                }
                .alert-item:last-child {
                    border-bottom: none;
                }
                .alert-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.5rem;
                }
                .alert-severity {
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.25rem;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: white;
                }
                .alert-type {
                    font-weight: 600;
                    color: var(--text-primary);
                    flex-grow: 1;
                }
                .alert-time {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .alert-headline {
                    font-size: 0.9rem;
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                    line-height: 1.4;
                }
                .alert-areas {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                    font-style: italic;
                }
                .no-alerts-message {
                    padding: 1rem;
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 0.9rem;
                }
            </style>
            <div class="alerts-widget">
                <div class="alerts-header" ${alertCount > 0 ? 'onclick="this.getRootNode().host.toggleExpanded()"' : ''}>
                    <div class="status-indicator">
                        <span class="status-icon">${statusIcon}</span>
                        <span class="status-text">${statusText}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${alertCount > 0 ? `<span class="alert-count">${alertCount}</span>` : ''}
                        ${alertCount > 0 ? '<span class="expand-icon">▼</span>' : ''}
                    </div>
                </div>
                ${alertCount === 0 ? '' : `
                    <div class="alerts-list">
                        ${alertsList.map(alert => `
                            <div class="alert-item">
                                <div class="alert-header">
                                    <span class="alert-severity" style="background-color: ${alert.color || '#6b7280'}">
                                        ${alert.severity || 'Unknown'}
                                    </span>
                                    <span class="alert-type">${alert.type || 'Weather Alert'}</span>
                                    <span class="alert-time">
                                        ${this.formatAlertTime(alert.start_time, alert.end_time)}
                                    </span>
                                </div>
                                ${alert.headline ? `<div class="alert-headline">${alert.headline}</div>` : ''}
                                ${alert.areas ? `<div class="alert-areas">Areas: ${alert.areas}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    formatAlertTime(startTime, endTime) {
        try {
            if (!startTime && !endTime) return '';

            const formatTime = (timeStr) => {
                if (!timeStr) return '';
                const date = new Date(timeStr);
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
            };

            if (startTime && endTime) {
                return `${formatTime(startTime)} - ${formatTime(endTime)}`;
            } else if (startTime) {
                return `From ${formatTime(startTime)}`;
            } else if (endTime) {
                return `Until ${formatTime(endTime)}`;
            }
            return '';
        } catch (error) {
            console.error('Error formatting alert time:', error);
            return '';
        }
    }

    getBaseStyles() {
        return `
            :host {
                display: block;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            :host([data-theme="dark"]) {
                --widget-background: #1f2937;
                --text-primary: #f9fafb;
                --text-muted: #9ca3af;
                --border-color: #374151;
                --hover-background: #374151;
            }

            :host([data-theme="light"]) {
                --widget-background: #ffffff;
                --text-primary: #111827;
                --text-muted: #6b7280;
                --border-color: #e5e7eb;
                --hover-background: #f9fafb;
            }
        `;
    }
}

// Precipitation Radar Widget for animated weather radar visualization
class PrecipitationRadarWidget extends WeatherWidget {
    constructor() {
        super();
        this.radarData = null;
        this.currentFrame = 0;
        this.isPlaying = false;
        this.animationTimer = null;
        this.mapCanvas = null;
        this.canvasContext = null;
        this.currentZoom = 8; // Default zoom level
        this.isExpanded = false;
    }

    connectedCallback() {
        if (!this.isEnabled('radar')) return;
        super.connectedCallback();
        this.loadRadar();

        // Listen for weather updates to refresh radar
        this.addEventListener('weather-data-updated', () => {
            this.loadRadar();
        });
    }

    disconnectedCallback() {
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
        }
    }

    async loadRadar() {
        try {
            // Get location from URL parameters or weather app
            const params = this.getLocationParams();
            const radarUrl = `/api/radar?lat=${params.lat}&lon=${params.lon}&location=${params.location}`;

            console.log('🌧️ Loading precipitation radar from:', radarUrl);

            const response = await fetch(radarUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.radarData = await response.json();
            this.currentFrame = this.radarData.radar?.animation_metadata?.current_frame || 0;
            this.render();

        } catch (error) {
            console.error('❌ Failed to load precipitation radar:', error);
            this.radarData = {
                radar: {
                    available: false,
                    animation_metadata: {
                        total_frames: 0,
                        historical_frames: 0,
                        current_frame: 0,
                        forecast_frames: 0
                    }
                }
            };
            this.render();
        }
    }

    getLocationParams() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            lat: urlParams.get('lat') || '41.8781',
            lon: urlParams.get('lon') || '-87.6298',
            location: urlParams.get('location') || 'Chicago'
        };
    }

    toggleExpanded() {
        this.isExpanded = !this.isExpanded;
        this.render();
    }

    toggleAnimation() {
        if (this.isPlaying) {
            this.stopAnimation();
        } else {
            this.startAnimation();
        }
        this.updateControls();
    }

    startAnimation() {
        if (!this.radarData?.radar?.animation_metadata) return;

        this.isPlaying = true;
        const totalFrames = this.radarData.radar.animation_metadata.total_frames;

        this.animationTimer = setInterval(() => {
            this.currentFrame = (this.currentFrame + 1) % totalFrames;
            this.updateRadarFrame();
        }, 500); // 500ms between frames for smooth animation
    }

    stopAnimation() {
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        }
        this.isPlaying = false;
    }

    setFrame(frameIndex) {
        this.currentFrame = frameIndex;
        this.updateRadarFrame();
        this.updateControls();
    }

    changeZoom(newZoom) {
        this.currentZoom = newZoom;
        this.updateRadarFrame();
        this.updateControls();
    }

    updateRadarFrame() {
        const canvas = this.shadowRoot.querySelector('.radar-canvas');
        if (!canvas || !this.radarData?.radar) return;

        const ctx = canvas.getContext('2d');
        const radar = this.radarData.radar;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Find the appropriate zoom level tiles
        let tiles = radar.default_tiles || [];
        for (const level of radar.tile_levels || []) {
            if (level.zoom === this.currentZoom) {
                tiles = level.tiles || [];
                break;
            }
        }

        if (tiles[this.currentFrame]) {
            const tile = tiles[this.currentFrame];
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.globalAlpha = 0.7; // Semi-transparent overlay
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1.0;

                // Add location marker
                this.drawLocationMarker(ctx, canvas.width / 2, canvas.height / 2);
            };
            img.onerror = () => {
                // Fallback: draw placeholder
                this.drawPlaceholder(ctx, canvas.width, canvas.height);
            };
            img.src = tile.url;
        } else {
            this.drawPlaceholder(ctx, canvas.width, canvas.height);
        }
    }

    drawLocationMarker(ctx, x, y) {
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    drawPlaceholder(ctx, width, height) {
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#666666';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Radar data unavailable', width / 2, height / 2);
    }

    updateControls() {
        const playButton = this.shadowRoot.querySelector('.play-button');
        const frameSlider = this.shadowRoot.querySelector('.frame-slider');
        const zoomSelect = this.shadowRoot.querySelector('.zoom-select');
        const frameInfo = this.shadowRoot.querySelector('.frame-info');

        if (playButton) {
            playButton.textContent = this.isPlaying ? '⏸️' : '▶️';
        }

        if (frameSlider) {
            frameSlider.value = this.currentFrame;
        }

        if (zoomSelect) {
            zoomSelect.value = this.currentZoom;
        }

        if (frameInfo && this.radarData?.radar) {
            const meta = this.radarData.radar.animation_metadata;
            const isHistorical = this.currentFrame < meta.current_frame;
            const isForecast = this.currentFrame > meta.current_frame;
            const timeOffset = (this.currentFrame - meta.current_frame) * meta.interval_minutes;

            let timeLabel = 'Now';
            if (isHistorical) {
                timeLabel = `${Math.abs(timeOffset)} min ago`;
            } else if (isForecast) {
                timeLabel = `+${timeOffset} min`;
            }

            frameInfo.textContent = `Frame ${this.currentFrame + 1}/${meta.total_frames} - ${timeLabel}`;
        }
    }

    render() {
        if (!this.radarData) {
            this.shadowRoot.innerHTML = `
                <style>
                    ${this.getBaseStyles()}
                    .loading {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        color: var(--text-muted);
                        font-size: 0.9rem;
                        padding: 0.75rem;
                    }
                    .loading-spinner {
                        width: 16px;
                        height: 16px;
                        border: 2px solid var(--border-color);
                        border-top: 2px solid var(--primary-color);
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
                <div class="loading">
                    <div class="loading-spinner"></div>
                    Loading precipitation radar...
                </div>
            `;
            return;
        }

        const radar = this.radarData.radar || {};
        const isAvailable = radar.available !== false && radar.animation_metadata?.total_frames > 0;
        const meta = radar.animation_metadata || {};
        const weatherContext = this.radarData.weather_context || {};

        this.shadowRoot.innerHTML = `
            <style>
                ${this.getBaseStyles()}
                .radar-widget {
                    background: var(--widget-background);
                    border: 1px solid var(--border-color);
                    border-radius: 0.5rem;
                    overflow: hidden;
                }
                .radar-header {
                    padding: 1rem;
                    cursor: ${isAvailable ? 'pointer' : 'default'};
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transition: background-color 0.2s ease;
                }
                .radar-header:hover {
                    background: ${isAvailable ? 'var(--hover-background)' : 'transparent'};
                }
                .radar-status {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .radar-icon {
                    font-size: 1.25rem;
                }
                .radar-title {
                    font-weight: 600;
                    color: var(--text-primary);
                    font-size: 0.95rem;
                }
                .radar-context {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                    margin-top: 0.25rem;
                }
                .expand-icon {
                    font-size: 0.9rem;
                    color: var(--text-muted);
                    transform: rotate(${this.isExpanded ? '180deg' : '0deg'});
                    transition: transform 0.2s ease;
                }
                .radar-content {
                    border-top: 1px solid var(--border-color);
                    max-height: ${this.isExpanded ? '600px' : '0'};
                    overflow: hidden;
                    transition: max-height 0.3s ease;
                }
                .radar-display {
                    position: relative;
                    padding: 1rem;
                }
                .radar-canvas {
                    width: 100%;
                    height: 300px;
                    border: 1px solid var(--border-color);
                    border-radius: 0.25rem;
                    background: #f8f9fa;
                }
                .radar-controls {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-top: 1rem;
                    flex-wrap: wrap;
                }
                .control-group {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .play-button {
                    background: var(--primary-color);
                    color: white;
                    border: none;
                    border-radius: 0.25rem;
                    padding: 0.5rem 0.75rem;
                    cursor: pointer;
                    font-size: 0.9rem;
                }
                .play-button:hover {
                    opacity: 0.9;
                }
                .frame-slider {
                    flex: 1;
                    min-width: 120px;
                }
                .zoom-select, .frame-info {
                    padding: 0.25rem 0.5rem;
                    border: 1px solid var(--border-color);
                    border-radius: 0.25rem;
                    background: var(--widget-background);
                    color: var(--text-primary);
                    font-size: 0.8rem;
                }
                .unavailable-message {
                    padding: 1rem;
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 0.9rem;
                }
            </style>
            <div class="radar-widget">
                <div class="radar-header" ${isAvailable ? 'onclick="this.getRootNode().host.toggleExpanded()"' : ''}>
                    <div class="radar-status">
                        <span class="radar-icon">🌧️</span>
                        <div>
                            <div class="radar-title">Precipitation Radar</div>
                            ${weatherContext.description ? `
                                <div class="radar-context">
                                    ${weatherContext.temperature ? `${Math.round(weatherContext.temperature)}°F, ` : ''}
                                    ${weatherContext.description}
                                    ${weatherContext.precipitation > 0 ? ` (${weatherContext.precipitation}" rain)` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${isAvailable ? `
                            <span style="font-size: 0.8rem; color: var(--text-muted);">
                                ${meta.total_frames} frames
                            </span>
                            <span class="expand-icon">▼</span>
                        ` : ''}
                    </div>
                </div>
                ${!isAvailable ? `
                    <div class="unavailable-message">
                        Precipitation radar unavailable
                        ${radar.available === false ? '<br>API key required for radar service' : ''}
                    </div>
                ` : `
                    <div class="radar-content">
                        <div class="radar-display">
                            <canvas class="radar-canvas" width="400" height="300"></canvas>
                            <div class="radar-controls">
                                <div class="control-group">
                                    <button class="play-button" onclick="this.getRootNode().host.toggleAnimation()">
                                        ${this.isPlaying ? '⏸️' : '▶️'}
                                    </button>
                                </div>
                                <div class="control-group" style="flex: 1;">
                                    <input type="range" class="frame-slider"
                                           min="0" max="${meta.total_frames - 1}"
                                           value="${this.currentFrame}"
                                           onchange="this.getRootNode().host.setFrame(parseInt(this.value))">
                                </div>
                                <div class="control-group">
                                    <select class="zoom-select" onchange="this.getRootNode().host.changeZoom(parseInt(this.value))">
                                        <option value="6" ${this.currentZoom === 6 ? 'selected' : ''}>Regional</option>
                                        <option value="8" ${this.currentZoom === 8 ? 'selected' : ''}>Local</option>
                                        <option value="10" ${this.currentZoom === 10 ? 'selected' : ''}>Detailed</option>
                                    </select>
                                </div>
                                <div class="control-group">
                                    <span class="frame-info">Frame ${this.currentFrame + 1}/${meta.total_frames}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `}
            </div>
        `;

        // Initialize canvas and draw initial frame
        if (isAvailable) {
            // Use setTimeout to ensure the canvas is in the DOM
            setTimeout(() => {
                this.updateRadarFrame();
                this.updateControls();
            }, 100);
        }
    }

    getBaseStyles() {
        return `
            :host {
                display: block;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            :host([data-theme="dark"]) {
                --widget-background: #1f2937;
                --text-primary: #f9fafb;
                --text-muted: #9ca3af;
                --border-color: #374151;
                --hover-background: #374151;
                --primary-color: #3b82f6;
            }

            :host([data-theme="light"]) {
                --widget-background: #ffffff;
                --text-primary: #111827;
                --text-muted: #6b7280;
                --border-color: #e5e7eb;
                --hover-background: #f9fafb;
                --primary-color: #3b82f6;
            }
        `;
    }
}

// Register all components
customElements.define('weather-icon', WeatherIcon);
customElements.define('current-weather', CurrentWeatherWidget);
customElements.define('hourly-forecast', HourlyForecastWidget);
customElements.define('daily-forecast', DailyForecastWidget);
customElements.define('hourly-timeline', HourlyTimelineWidget);
customElements.define('air-quality', AirQualityWidget);
customElements.define('wind-direction', WindDirectionWidget);
customElements.define('pressure-trends', PressureTrendsWidget);
customElements.define('weather-alerts', WeatherAlertsWidget);
customElements.define('precipitation-radar', PrecipitationRadarWidget);
customElements.define('help-section', HelpSection);

// Initialize the weather app
const weatherApp = new WeatherApp();
document.addEventListener('DOMContentLoaded', () => {
    weatherApp.init();

    // Set up real-time weather updates
    if (window.realTimeWeather) {
        // Subscribe to real-time weather updates
        window.realTimeWeather.on('weather_update', (data) => {
            console.log('🌤️  Real-time weather update received');
            weatherApp.broadcastWeatherData(data);
        });

        // Subscribe to provider switch notifications
        window.realTimeWeather.on('provider_switched', (data) => {
            console.log('🔄 Provider switched notification received');
            weatherApp.broadcastEvent('provider-switched', data);
        });

        // Subscribe to connection status changes
        window.realTimeWeather.on('connection_status', (status) => {
            console.log('📡 Connection status:', status);
            weatherApp.broadcastEvent('connection-status', status);
        });

        // Request initial weather data
        const { lat, lon, location, timezone } = weatherApp.parseLocationParams();
        window.realTimeWeather.requestWeatherUpdate({ lat, lon, location, timezone });
    }
});

/**
 * Clothing Recommendations Widget - smart clothing suggestions based on weather conditions
 */
class ClothingRecommendationsWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (!window.DashboardConfig.isWidgetEnabled(
            window.weatherDashboardConfig,
            'clothing'
        )) return;
        this.render();
        this.fetchClothingRecommendations();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="/static/css/weather-components.css">
            <style>
                .clothing-widget {
                    background: var(--card-bg);
                    border: 1px solid var(--card-border);
                    border-radius: 12px;
                    padding: 1.5rem;
                    margin: 1rem 0;
                    backdrop-filter: blur(10px);
                }

                .clothing-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 1rem;
                    gap: 0.75rem;
                }

                .clothing-icon {
                    font-size: 1.5rem;
                }

                .clothing-title {
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .primary-suggestion {
                    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1));
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    border-radius: 8px;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    font-size: 1rem;
                    font-weight: 500;
                }

                .recommendation-section {
                    margin-bottom: 1rem;
                }

                .section-title {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                    opacity: 0.9;
                }

                .items-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                }

                .clothing-item {
                    background: rgba(59, 130, 246, 0.2);
                    color: var(--text-primary);
                    padding: 0.25rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.85rem;
                    font-weight: 500;
                }

                .warnings {
                    margin-bottom: 0.75rem;
                }

                .warning-item {
                    background: rgba(239, 68, 68, 0.15);
                    border-left: 4px solid #ef4444;
                    padding: 0.5rem 0.75rem;
                    margin-bottom: 0.5rem;
                    border-radius: 0 6px 6px 0;
                    font-size: 0.9rem;
                }

                .comfort-tips {
                    margin-bottom: 1rem;
                }

                .tip-item {
                    background: rgba(34, 197, 94, 0.15);
                    border-left: 4px solid #22c55e;
                    padding: 0.5rem 0.75rem;
                    margin-bottom: 0.5rem;
                    border-radius: 0 6px 6px 0;
                    font-size: 0.9rem;
                }

                .activity-recommendations {
                    display: grid;
                    gap: 0.75rem;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                }

                .activity-card {
                    background: rgba(99, 102, 241, 0.1);
                    border: 1px solid rgba(99, 102, 241, 0.2);
                    border-radius: 8px;
                    padding: 0.75rem;
                }

                .activity-title {
                    font-size: 0.9rem;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                    text-transform: capitalize;
                }

                .activity-text {
                    font-size: 0.85rem;
                    opacity: 0.9;
                    line-height: 1.4;
                }

                .loading {
                    text-align: center;
                    padding: 2rem;
                    color: var(--text-primary);
                    opacity: 0.7;
                }

                .error {
                    text-align: center;
                    padding: 1rem;
                    color: var(--error-color);
                    background: rgba(239, 68, 68, 0.1);
                    border-radius: 8px;
                    margin: 1rem 0;
                }

                @media (max-width: 640px) {
                    .clothing-widget {
                        padding: 1rem;
                    }

                    .activity-recommendations {
                        grid-template-columns: 1fr;
                    }
                }
            </style>

            <div class="clothing-widget">
                <div class="clothing-header">
                    <span class="clothing-icon">👔</span>
                    <h3 class="clothing-title">Clothing Recommendations</h3>
                </div>
                <div id="clothing-content">
                    <div class="loading">
                        Analyzing weather conditions...
                    </div>
                </div>
            </div>
        `;
    }

    async fetchClothingRecommendations() {
        const content = this.shadowRoot.getElementById('clothing-content');

        try {
            // Get current location from URL or use Chicago as default
            const urlParams = new URLSearchParams(window.location.search);
            const lat = urlParams.get('lat') || 41.8781;
            const lon = urlParams.get('lon') || -87.6298;
            const location = urlParams.get('location') || 'Chicago';

            const response = await fetch(`/api/clothing?lat=${lat}&lon=${lon}&location=${encodeURIComponent(location)}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.renderRecommendations(data.clothing.recommendations);

        } catch (error) {
            console.error('Failed to fetch clothing recommendations:', error);
            content.innerHTML = `
                <div class="error">
                    Unable to load clothing recommendations. Please try again later.
                </div>
            `;
        }
    }

    renderRecommendations(recommendations) {
        const content = this.shadowRoot.getElementById('clothing-content');

        let html = `
            <div class="primary-suggestion">
                ${recommendations.primary_suggestion}
            </div>
        `;

        // Recommended items
        if (recommendations.items && recommendations.items.length > 0) {
            html += `
                <div class="recommendation-section">
                    <div class="section-title">Recommended Items</div>
                    <div class="items-list">
                        ${recommendations.items.map(item => `
                            <span class="clothing-item">${item}</span>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Warnings
        if (recommendations.warnings && recommendations.warnings.length > 0) {
            html += `
                <div class="recommendation-section warnings">
                    <div class="section-title">Weather Warnings</div>
                    ${recommendations.warnings.map(warning => `
                        <div class="warning-item">${warning}</div>
                    `).join('')}
                </div>
            `;
        }

        // Comfort tips
        if (recommendations.comfort_tips && recommendations.comfort_tips.length > 0) {
            html += `
                <div class="recommendation-section comfort-tips">
                    <div class="section-title">Comfort Tips</div>
                    ${recommendations.comfort_tips.map(tip => `
                        <div class="tip-item">${tip}</div>
                    `).join('')}
                </div>
            `;
        }

        // Activity-specific recommendations
        if (recommendations.activity_specific && Object.keys(recommendations.activity_specific).length > 0) {
            html += `
                <div class="recommendation-section">
                    <div class="section-title">Activity-Specific Advice</div>
                    <div class="activity-recommendations">
                        ${Object.entries(recommendations.activity_specific).map(([activity, advice]) => `
                            <div class="activity-card">
                                <div class="activity-title">${activity.replace('_', ' ')}</div>
                                <div class="activity-text">${advice}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        content.innerHTML = html;
    }
}

// Register the clothing recommendations component
customElements.define('clothing-recommendations', ClothingRecommendationsWidget);

// Solar Progress Widget - displays sunrise/sunset progress and solar data
class SolarProgressWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (!window.DashboardConfig.isWidgetEnabled(
            window.weatherDashboardConfig,
            'solar'
        )) return;
        this.render();
        this.fetchSolarData();
        this.sunMap = {};
        document.addEventListener('weather-data-updated', (event) => {
            this.sunMap = event.detail?.sun || {};
            if (this.solarData) this.renderSolarData(this.solarData);
        });
    }

    render() {
        this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="/static/css/weather-components.css">
            <style>
                :host {
                    display: block;
                }

                .loading-state {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 120px;
                    font-size: 0.9rem;
                    opacity: 0.7;
                }

                .error-state {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 8px;
                    padding: 1rem;
                    text-align: center;
                    color: #fca5a5;
                    font-size: 0.9rem;
                }
            </style>

            <div class="solar-widget">
                <div id="solar-content" class="loading-state">
                    Loading solar data...
                </div>
            </div>
        `;
    }

    async fetchSolarData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const lat = urlParams.get('lat') || '40.7128';
            const lon = urlParams.get('lon') || '-74.0060';
            const location = urlParams.get('location') || 'New York';

            const response = await fetch(`/api/solar?lat=${lat}&lon=${lon}&location=${encodeURIComponent(location)}`);
            const data = await response.json();

            if (response.ok && data.solar) {
                this.renderSolarData(data.solar);
            } else {
                this.renderError(data.error || 'Failed to load solar data');
            }
        } catch (error) {
            console.error('Error fetching solar data:', error);
            this.renderError('Network error loading solar data');
        }
    }

    renderSolarData(solarData) {
        this.solarData = solarData;
        const content = this.shadowRoot.getElementById('solar-content');
        content.classList.remove('loading-state');
        const state = this.sunHeading(solarData, this.sunMap, new Date());

        content.innerHTML = `
            <div class="sky-card">
                <div class="sky-caption">Sun</div>
                <div class="sky-heading">${state.heading}</div>
                <div class="sky-track">
                    <div class="sky-track-fill"
                         style="width: ${Math.round(state.progress * 100)}%"></div>
                </div>
                <div class="sky-detail">${state.detail}</div>
            </div>
        `;
    }

    renderError(message) {
        const content = this.shadowRoot.getElementById('solar-content');
        content.innerHTML = `
            <div class="error-state">
                ⚠️ ${message}
            </div>
        `;
    }

    formatSpan(milliseconds) {
        if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '';
        const totalMinutes = Math.round(milliseconds / 60000);
        return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    }

    sunHeading(solarData, sunMap, now) {
        const sunriseToday = new Date(solarData?.times?.sunrise);
        const beforeSunrise = !Number.isNaN(sunriseToday.getTime()) && now < sunriseToday;

        if (beforeSunrise) {
            return {
                heading: `Sunrise ${formatCardTime(solarData.times.sunrise)}`,
                detail: `${this.formatSpan(sunriseToday - now)} until sunrise`,
                progress: 0
            };
        }

        const sunset = new Date(solarData?.times?.sunset);
        const beforeSunset = !Number.isNaN(sunset.getTime()) && now < sunset;

        if (beforeSunset) {
            return {
                heading: `Sets ${formatCardTime(solarData.times.sunset)}`,
                detail: `${this.formatSpan(sunset - now)} of daylight left`,
                progress: solarData?.daylight?.progress ?? 0
            };
        }

        const upcoming = Object.values(sunMap || {})
            .map((day) => new Date(day?.sunrise))
            .filter((time) => !Number.isNaN(time.getTime()) && time > now)
            .sort((first, second) => first - second);
        const sunrise = upcoming[0] ?? new Date(NaN);

        if (Number.isNaN(sunrise.getTime())) {
            return { heading: 'Sunrise', detail: '', progress: 1 };
        }

        const span = this.formatSpan(sunrise - now);
        return {
            heading: `Sunrise ${formatCardTime(sunrise.toISOString())}`,
            detail: span ? `${span} until sunrise` : '',
            progress: 1
        };
    }
}

// Enhanced Temperature Trends Component
class EnhancedTemperatureTrendsWidget extends WeatherWidget {
    constructor() {
        super();
        this.trendsData = null;
        this.showApparentTemp = true;
        this.showConfidenceIntervals = true;
        this.showPercentileBands = true;
    }

    getDefaultConfig() {
        return { 'temperature-trends': true };
    }

    connectedCallback() {
        if (!this.isEnabled('temperature-trends')) return;
        super.connectedCallback();
    }

    render() {
        if (this.config['temperature-trends'] === false) return;
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="enhanced-temp-trends-widget widget-content">
                <div class="widget-header">
                    <h3>Enhanced Temperature Trends</h3>
                    <div class="trend-controls">
                        <label class="control-toggle">
                            <input type="checkbox" id="apparent-temp-toggle" ${this.showApparentTemp ? 'checked' : ''}>
                            <span class="toggle-text">Heat Index/Wind Chill</span>
                        </label>
                        <label class="control-toggle">
                            <input type="checkbox" id="confidence-toggle" ${this.showConfidenceIntervals ? 'checked' : ''}>
                            <span class="toggle-text">Confidence Bands</span>
                        </label>
                        <label class="control-toggle">
                            <input type="checkbox" id="percentile-toggle" ${this.showPercentileBands ? 'checked' : ''}>
                            <span class="toggle-text">Historical Range</span>
                        </label>
                    </div>
                </div>

                <div class="temp-trends-chart-container">
                    <svg class="temp-trends-chart" id="temp-trends-chart" viewBox="0 0 800 300"></svg>
                </div>

                <div class="trend-stats" id="trend-stats">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Loading temperature trends...
                    </div>
                </div>

                <div class="comfort-analysis" id="comfort-analysis"></div>

                <div class="error-message error hidden" id="error"></div>
            </div>

            <style>
                .enhanced-temp-trends-widget {
                    margin-bottom: 1rem;
                }

                .widget-header {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }

                .trend-controls {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1rem;
                    font-size: 0.85rem;
                }

                .control-toggle {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    cursor: pointer;
                    user-select: none;
                }

                .control-toggle input[type="checkbox"] {
                    width: 14px;
                    height: 14px;
                }

                .toggle-text {
                    color: var(--text-secondary);
                }

                .temp-trends-chart-container {
                    margin-bottom: 1rem;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 0.5rem;
                    padding: 1rem;
                    min-height: 300px;
                }

                .temp-trends-chart {
                    width: 100%;
                    height: 300px;
                    overflow: visible;
                }

                .trend-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1rem;
                }

                .stat-card {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 0.5rem;
                    padding: 0.75rem;
                    text-align: center;
                }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: bold;
                    color: var(--text-primary);
                }

                .stat-label {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    margin-top: 0.25rem;
                }

                .comfort-analysis {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }

                .comfort-category {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 0.5rem;
                    padding: 0.5rem;
                    text-align: center;
                    font-size: 0.85rem;
                }

                .comfort-percentage {
                    font-weight: bold;
                    font-size: 1.1rem;
                }

                .temp-line {
                    fill: none;
                    stroke: #3b82f6;
                    stroke-width: 2;
                }

                .apparent-temp-line {
                    fill: none;
                    stroke: #f59e0b;
                    stroke-width: 2;
                    stroke-dasharray: 5,5;
                }

                .confidence-area {
                    fill: rgba(59, 130, 246, 0.2);
                    opacity: 0.6;
                }

                .percentile-band {
                    fill: none;
                    stroke: rgba(156, 163, 175, 0.4);
                    stroke-width: 1;
                    stroke-dasharray: 2,2;
                }

                .chart-axis {
                    stroke: rgba(156, 163, 175, 0.3);
                    stroke-width: 1;
                }

                .axis-label {
                    fill: var(--text-secondary);
                    font-size: 10px;
                    text-anchor: middle;
                }

                .temp-point {
                    fill: #3b82f6;
                    r: 2;
                }

                .now-line {
                    stroke: #f59e0b;
                    stroke-width: 2;
                    stroke-dasharray: 4,4;
                }

                .chart-legend {
                    font-size: 10px;
                    fill: var(--text-secondary);
                }

                @media (max-width: 640px) {
                    .trend-controls {
                        flex-direction: column;
                        gap: 0.5rem;
                    }

                    .temp-trends-chart-container {
                        padding: 0.5rem;
                    }

                    .trend-stats {
                        grid-template-columns: 1fr 1fr;
                    }
                }
            </style>
        `;

        this.setupEventListeners();
        this.loadTrendsData();
    }

    setupEventListeners() {
        const apparentTempToggle = this.shadowRoot.getElementById('apparent-temp-toggle');
        const confidenceToggle = this.shadowRoot.getElementById('confidence-toggle');
        const percentileToggle = this.shadowRoot.getElementById('percentile-toggle');

        if (apparentTempToggle) {
            apparentTempToggle.addEventListener('change', (e) => {
                this.showApparentTemp = e.target.checked;
                this.updateChart();
            });
        }

        if (confidenceToggle) {
            confidenceToggle.addEventListener('change', (e) => {
                this.showConfidenceIntervals = e.target.checked;
                this.updateChart();
            });
        }

        if (percentileToggle) {
            percentileToggle.addEventListener('change', (e) => {
                this.showPercentileBands = e.target.checked;
                this.updateChart();
            });
        }
    }

    async loadTrendsData() {
        try {
            this.showLoading();

            // Get coordinates from global location or use defaults
            const lat = window.location.lat || 41.8781;
            const lon = window.location.lon || -87.6298;
            const location = window.location.name || 'Chicago';

            const response = await fetch(`/api/temperature-trends?lat=${lat}&lon=${lon}&location=${encodeURIComponent(location)}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.trendsData = await response.json();
            this.updateDisplay();
            this.hideLoading();

        } catch (error) {
            console.error('Enhanced temperature trends error:', error);
            this.showError(`Failed to load temperature trends: ${error.message}`);
        }
    }

    updateDisplay() {
        if (!this.trendsData?.temperature_trends) {
            this.showError('No temperature trends data available');
            return;
        }

        this.updateStats();
        this.updateComfortAnalysis();
        this.updateChart();
        this.hideError();
    }

    updateStats() {
        const statsContainer = this.shadowRoot.getElementById('trend-stats');
        if (!statsContainer || !this.trendsData?.temperature_trends) return;

        const trends = this.trendsData.temperature_trends;
        const stats = trends.statistics;
        const trendAnalysis = trends.trend_analysis;

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.temperature?.max || 0}°</div>
                <div class="stat-label">High (48h)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.temperature?.min || 0}°</div>
                <div class="stat-label">Low (48h)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.temperature?.mean || 0}°</div>
                <div class="stat-label">Average</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${trendAnalysis?.trend_direction || 'stable'}</div>
                <div class="stat-label">Trend</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Math.abs(trendAnalysis?.temperature_change_24h || 0)}°</div>
                <div class="stat-label">24h Change</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.temperature?.std_dev || 0}°</div>
                <div class="stat-label">Volatility</div>
            </div>
        `;
    }

    updateComfortAnalysis() {
        const comfortContainer = this.shadowRoot.getElementById('comfort-analysis');
        if (!comfortContainer || !this.trendsData?.temperature_trends) return;

        const comfort = this.trendsData.temperature_trends.comfort_analysis;
        if (!comfort?.percentages) return;

        comfortContainer.innerHTML = Object.entries(comfort.percentages)
            .map(([category, percentage]) => `
                <div class="comfort-category">
                    <div class="comfort-percentage">${percentage}%</div>
                    <div>${category}</div>
                </div>
            `).join('');
    }

    updateChart() {
        const svg = this.shadowRoot.getElementById('temp-trends-chart');
        if (!svg || !this.trendsData?.temperature_trends?.hourly_data) return;

        const hourlyData = this.trendsData.temperature_trends.hourly_data;
        const percentileBands = this.trendsData.temperature_trends.percentile_bands;

        // Clear existing content
        svg.innerHTML = '';

        // Chart dimensions
        const width = 800;
        const height = 300;
        const margin = { top: 20, right: 60, bottom: 40, left: 60 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        // Calculate temperature ranges
        const allTemps = hourlyData.flatMap(d => [
            d.temperature,
            d.apparent_temperature,
            d.confidence_lower,
            d.confidence_upper
        ]);

        if (this.showPercentileBands && percentileBands) {
            allTemps.push(
                percentileBands['10th_percentile'],
                percentileBands['90th_percentile']
            );
        }

        const minTemp = Math.min(...allTemps.filter(t => t !== undefined)) - 5;
        const maxTemp = Math.max(...allTemps.filter(t => t !== undefined)) + 5;
        const tempRange = maxTemp - minTemp;

        // Helper functions
        const xScale = (hour) => margin.left + (hour / Math.max(1, hourlyData.length - 1)) * chartWidth;
        const yScale = (temp) => margin.top + chartHeight - ((temp - minTemp) / tempRange) * chartHeight;

        // Draw percentile bands (background)
        if (this.showPercentileBands && percentileBands) {
            const band10 = percentileBands['10th_percentile'];
            const band90 = percentileBands['90th_percentile'];

            const bandPath = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bandPath.setAttribute('x', margin.left);
            bandPath.setAttribute('y', yScale(band90));
            bandPath.setAttribute('width', chartWidth);
            bandPath.setAttribute('height', yScale(band10) - yScale(band90));
            bandPath.setAttribute('class', 'percentile-band');
            bandPath.setAttribute('fill', 'rgba(156, 163, 175, 0.1)');
            svg.appendChild(bandPath);

            // Add percentile labels
            const label10 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label10.setAttribute('x', width - 10);
            label10.setAttribute('y', yScale(band10) + 5);
            label10.setAttribute('class', 'chart-legend');
            label10.textContent = '10th %ile';
            svg.appendChild(label10);

            const label90 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label90.setAttribute('x', width - 10);
            label90.setAttribute('y', yScale(band90) - 5);
            label90.setAttribute('class', 'chart-legend');
            label90.textContent = '90th %ile';
            svg.appendChild(label90);
        }

        // Draw confidence intervals
        if (this.showConfidenceIntervals) {
            const confidencePath = hourlyData.map((d, i) => {
                const x = xScale(i);
                const yUpper = yScale(d.confidence_upper);
                const yLower = yScale(d.confidence_lower);
                return i === 0 ? `M${x},${yUpper}` : `L${x},${yUpper}`;
            }).join(' ') + ' ' +
            hourlyData.slice().reverse().map((d, i) => {
                const x = xScale(hourlyData.length - 1 - i);
                const yLower = yScale(d.confidence_lower);
                return `L${x},${yLower}`;
            }).join(' ') + ' Z';

            const confidenceArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            confidenceArea.setAttribute('d', confidencePath);
            confidenceArea.setAttribute('class', 'confidence-area');
            svg.appendChild(confidenceArea);
        }

        // Draw apparent temperature line
        if (this.showApparentTemp) {
            const apparentPath = hourlyData.map((d, i) => {
                const x = xScale(i);
                const y = yScale(d.apparent_temperature);
                return (i === 0 ? 'M' : 'L') + x + ',' + y;
            }).join(' ');

            const apparentLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            apparentLine.setAttribute('d', apparentPath);
            apparentLine.setAttribute('class', 'apparent-temp-line');
            svg.appendChild(apparentLine);
        }

        // Draw main temperature line
        const tempPath = hourlyData.map((d, i) => {
            const x = xScale(i);
            const y = yScale(d.temperature);
            return (i === 0 ? 'M' : 'L') + x + ',' + y;
        }).join(' ');

        const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLine.setAttribute('d', tempPath);
        tempLine.setAttribute('class', 'temp-line');
        svg.appendChild(tempLine);

        // Add current time indicator (NOW line)
        const nowLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        nowLine.setAttribute('x1', xScale(0));
        nowLine.setAttribute('y1', margin.top);
        nowLine.setAttribute('x2', xScale(0));
        nowLine.setAttribute('y2', height - margin.bottom);
        nowLine.setAttribute('class', 'now-line');
        svg.appendChild(nowLine);

        // Add NOW label
        const nowLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nowLabel.setAttribute('x', xScale(0));
        nowLabel.setAttribute('y', margin.top - 5);
        nowLabel.setAttribute('text-anchor', 'middle');
        nowLabel.setAttribute('class', 'chart-legend');
        nowLabel.setAttribute('font-weight', 'bold');
        nowLabel.textContent = 'NOW';
        svg.appendChild(nowLabel);

        // Add Y-axis labels
        const tempLabels = [];
        for (let temp = Math.ceil(minTemp / 10) * 10; temp <= maxTemp; temp += 10) {
            tempLabels.push(temp);
        }

        tempLabels.forEach(temp => {
            const y = yScale(temp);

            // Grid line
            const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            gridLine.setAttribute('x1', margin.left);
            gridLine.setAttribute('y1', y);
            gridLine.setAttribute('x2', width - margin.right);
            gridLine.setAttribute('y2', y);
            gridLine.setAttribute('class', 'chart-axis');
            svg.appendChild(gridLine);

            // Label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', margin.left - 10);
            label.setAttribute('y', y + 4);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('class', 'axis-label');
            label.textContent = temp + '°';
            svg.appendChild(label);
        });

        // Add X-axis labels (hours)
        const hourSteps = Math.max(1, Math.floor(hourlyData.length / 8));
        for (let i = 0; i < hourlyData.length; i += hourSteps) {
            const x = xScale(i);
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', x);
            label.setAttribute('y', height - margin.bottom + 15);
            label.setAttribute('class', 'axis-label');
            label.textContent = i + 'h';
            svg.appendChild(label);
        }

        // Add legend
        let legendY = height - 15;
        const legends = [
            { color: '#3b82f6', text: 'Temperature', solid: true },
        ];

        if (this.showApparentTemp) {
            legends.push({ color: '#f59e0b', text: 'Heat Index/Wind Chill', solid: false });
        }

        legends.forEach((legend, i) => {
            const legendX = margin.left + i * 150;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', legendX);
            line.setAttribute('y1', legendY);
            line.setAttribute('x2', legendX + 20);
            line.setAttribute('y2', legendY);
            line.setAttribute('stroke', legend.color);
            line.setAttribute('stroke-width', '2');
            if (!legend.solid) {
                line.setAttribute('stroke-dasharray', '5,5');
            }
            svg.appendChild(line);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', legendX + 25);
            text.setAttribute('y', legendY + 4);
            text.setAttribute('class', 'chart-legend');
            text.textContent = legend.text;
            svg.appendChild(text);
        });
    }

    update() {
        this.loadTrendsData();
    }
}

// Register the solar progress component
customElements.define('solar-progress', SolarProgressWidget);

if (typeof module !== 'undefined' && module.exports) {
    module.exports.SolarProgressWidget = SolarProgressWidget;
}

// Register the enhanced temperature trends component
customElements.define('enhanced-temperature-trends', EnhancedTemperatureTrendsWidget);


class MoonPhaseWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        this.lunarData = null;
        this.isLoading = true;
    }

    connectedCallback() {
        if (!window.DashboardConfig.isWidgetEnabled(
            window.weatherDashboardConfig,
            'moon'
        )) return;
        this.render();
        this.loadLunarData();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="/static/css/weather-components.css">
            <style>
                .moon-phase-widget {
                    transition: all 0.3s ease;
                }

                .loading-state {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2rem;
                    opacity: 0.7;
                }

                .loading-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid transparent;
                    border-top: 2px solid currentColor;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-right: 0.5rem;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .error-state {
                    color: var(--error-color);
                    text-align: center;
                    padding: 1rem;
                    font-size: 0.9rem;
                }
            </style>

            <div class="moon-phase-widget">
                ${this.isLoading ? this.renderLoading() : ''}
                <div class="content" style="display: ${this.isLoading ? 'none' : 'block'}">
                    ${this.renderContent()}
                </div>
            </div>
        `;
    }

    renderLoading() {
        return `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <span>Calculating lunar position...</span>
            </div>
        `;
    }

    renderContent() {
        if (!this.lunarData) {
            return `
                <div class="error-state">
                    ❌ Unable to load lunar data
                </div>
            `;
        }

        return `${this.moonCard()}`;
    }

    moonCard() {
        const phase = this.lunarData?.current_phase || {};
        const illumination = Math.round(phase.illumination_percent ?? 0);
        const rise = phase.moonrise
            ? ` · rises ${formatCardTime(phase.moonrise)}`
            : '';

        return `
            <div class="sky-card">
                <div class="sky-caption">Moon</div>
                <div class="sky-heading">${phase.name || ''}</div>
                <div class="moon-disc" style="background: linear-gradient(90deg,
                    #fff 0 ${illumination}%,
                    rgba(255, 255, 255, 0.2) ${illumination}%)"></div>
                <div class="sky-detail">${illumination}% lit${rise}</div>
            </div>
        `;
    }

    async loadLunarData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const lat = urlParams.get('lat') || 41.8781;
            const lon = urlParams.get('lon') || -87.6298;
            const location = urlParams.get('location') || 'Chicago';

            const response = await fetch(`/api/lunar?lat=${lat}&lon=${lon}&location=${encodeURIComponent(location)}`);

            if (!response.ok) {
                throw new Error(`Lunar API request failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.lunarData = data.lunar_data;
            this.isLoading = false;
            this.render();

        } catch (error) {
            console.error('Error loading lunar data:', error);
            this.isLoading = false;
            this.lunarData = null;
            this.render();
        }
    }

    update() {
        this.loadLunarData();
    }
}

// Register the moon phase component
customElements.define('moon-phase', MoonPhaseWidget);

if (typeof module !== 'undefined' && module.exports) {
    module.exports.MoonPhaseWidget = MoonPhaseWidget;
}
