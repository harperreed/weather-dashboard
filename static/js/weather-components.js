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

        // Check URL parameter for animation preference
        const urlParams = new URLSearchParams(window.location.search);
        const theme = urlParams.get('theme') || urlParams.get('background');
        const isDashboard = theme === 'dashboard' || theme === 'eink';
        const useAnimated = urlParams.get('animated') !== 'false' && !isDashboard;
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

// Base WeatherWidget class with shared functionality
class WeatherWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.data = null;
        this.config = {
            current: true,
            hourly: true,
            daily: true,
            timeline: true
        };
    }

    connectedCallback() {
        this.parseConfig();
        this.observeTheme();
        this.render();
        this.setupEventListeners();
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
        const urlParams = new URLSearchParams(window.location.search);

        // Parse widgets parameter
        const widgetsParam = urlParams.get('widgets');
        if (widgetsParam) {
            this.config = {
                current: false,
                hourly: false,
                daily: false,
                timeline: false
            };

            const requestedWidgets = widgetsParam.split(',').map(w => w.trim().toLowerCase());
            requestedWidgets.forEach(widget => {
                switch (widget) {
                    case 'current':
                    case 'now':
                        this.config.current = true;
                        break;
                    case 'hourly':
                    case 'hours':
                        this.config.hourly = true;
                        break;
                    case 'daily':
                    case 'week':
                    case 'days':
                        this.config.daily = true;
                        break;
                    case 'timeline':
                    case 'list':
                        this.config.timeline = true;
                        break;
                }
            });
        }

        // Individual widget parameters
        if (urlParams.has('current')) this.config.current = urlParams.get('current') !== 'false';
        if (urlParams.has('hourly')) this.config.hourly = urlParams.get('hourly') !== 'false';
        if (urlParams.has('daily')) this.config.daily = urlParams.get('daily') !== 'false';
        if (urlParams.has('timeline')) this.config.timeline = urlParams.get('timeline') !== 'false';
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

    // Import external CSS into Shadow DOM + dashboard theme styles
    getSharedStyles() {
        return `
            <link rel="stylesheet" href="/static/css/weather-components.css">
            <style>
                :host {
                    display: block;
                    color: var(--text-primary);
                    font-family: system-ui, -apple-system, sans-serif;
                }

                /* Dashboard theme overrides for Shadow DOM */
                :host([data-theme="dashboard"]) .temperature {
                    font-size: 6rem !important;
                    font-weight: 900 !important;
                    line-height: 1 !important;
                }

                :host([data-theme="dashboard"]) .feels-like {
                    font-size: 1.5rem !important;
                    font-weight: 900 !important;
                    margin-bottom: 1rem !important;
                }

                :host([data-theme="dashboard"]) .summary {
                    font-size: 2rem !important;
                    font-weight: 900 !important;
                    margin-bottom: 1.5rem !important;
                }

                :host([data-theme="dashboard"]) .detail-value {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="dashboard"]) .detail-label {
                    font-size: 1.125rem !important;
                    font-weight: 800 !important;
                }

                :host([data-theme="dashboard"]) .hour-temp-value {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="dashboard"]) .hour-time {
                    font-size: 1.125rem !important;
                    font-weight: 800 !important;
                }

                :host([data-theme="dashboard"]) .day-high {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="dashboard"]) .day-low {
                    font-weight: 800 !important;
                    font-size: 1.125rem !important;
                }

                :host([data-theme="dashboard"]) .day-name {
                    font-size: 1.125rem !important;
                    font-weight: 800 !important;
                }

                :host([data-theme="dashboard"]) .timeline-time {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="dashboard"]) .timeline-temp {
                    font-weight: 900 !important;
                    font-size: 1.25rem !important;
                }

                :host([data-theme="dashboard"]) .timeline-desc {
                    font-size: 1.125rem !important;
                    font-weight: 800 !important;
                }

                :host([data-theme="dashboard"]) .weather-icon img {
                    width: 12rem !important;
                    height: 12rem !important;
                    filter: contrast(2) brightness(0.8) !important;
                }

                :host([data-theme="dashboard"]) .hour-icon img {
                    width: 6rem !important;
                    height: 6rem !important;
                }

                :host([data-theme="dashboard"]) .day-icon img {
                    width: 6rem !important;
                    height: 6rem !important;
                }

                :host([data-theme="dashboard"]) .chart-line {
                    stroke: #000000 !important;
                    stroke-width: 6 !important;
                }

                :host([data-theme="dashboard"]) .temp-display {
                    gap: 2.5rem !important;
                    margin-bottom: 2.5rem !important;
                }

                :host([data-theme="dashboard"]) .weather-details {
                    gap: 1.25rem !important;
                    margin-top: 1.5rem !important;
                }

                :host([data-theme="dashboard"]) .detail-card {
                    padding: 1rem 1.5rem !important;
                    font-size: 1.125rem !important;
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
        if (!this.config.current) {
            this.style.display = 'none';
            return;
        }

        this.style.display = 'block';
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="current-widget widget-content">
                <div class="temp-display">
                    <div class="temperature" id="temp">--°</div>
                    <div class="weather-icon" id="icon">⏳</div>
                </div>

                <div class="feels-like" id="feels-like">LOADING...</div>
                <div class="summary" id="summary">Loading weather data...</div>

                <div class="weather-details">
                    <div class="detail-card theme-card">
                        <span class="detail-label">Humidity</span>
                        <span class="detail-value" id="humidity">--%</span>
                    </div>
                    <div class="detail-card theme-card">
                        <span class="detail-label">Wind</span>
                        <span class="detail-value" id="wind">-- mph</span>
                    </div>
                    <div class="detail-card theme-card">
                        <span class="detail-label">Rain</span>
                        <span class="detail-value" id="rain">--%</span>
                    </div>
                    <div class="detail-card theme-card">
                        <span class="detail-label">UV Index</span>
                        <span class="detail-value" id="uv">--</span>
                    </div>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }

    update() {
        if (!this.data || !this.config.current) return;

        const current = this.data.current;

        this.shadowRoot.getElementById('temp').textContent = `${current.temperature}°F`;
        this.shadowRoot.getElementById('icon').innerHTML = getWeatherIcon(current.icon, '6rem');
        this.shadowRoot.getElementById('feels-like').textContent = `FEELS LIKE ${current.feels_like}°`;

        // Enhance summary with precipitation info
        let summary = current.summary;
        if (current.precipitation_rate > 0) {
            const precipType = current.precipitation_type === 'snow' ? 'snowing' : 'raining';
            summary = `Currently ${precipType} - ${summary}`;
        }
        this.shadowRoot.getElementById('summary').textContent = summary;

        this.shadowRoot.getElementById('humidity').textContent = `${current.humidity}%`;
        this.shadowRoot.getElementById('wind').textContent = `${current.wind_speed} mph`;
        this.shadowRoot.getElementById('uv').textContent = current.uv_index;

        // Update precipitation display
        const rainEl = this.shadowRoot.getElementById('rain');
        if (current.precipitation_rate > 0) {
            rainEl.textContent = `${current.precipitation_rate}" now`;
            rainEl.style.color = '#60a5fa';
        } else if (current.precipitation_prob > 0) {
            rainEl.textContent = `${current.precipitation_prob}%`;
            rainEl.style.color = 'inherit';
        } else {
            rainEl.textContent = '0%';
            rainEl.style.color = 'inherit';
        }

        this.hideError();
        this.hideLoading();
    }
}

// Hourly Forecast Component
class HourlyForecastWidget extends WeatherWidget {
    render() {
        if (!this.config.hourly) {
            this.style.display = 'none';
            return;
        }

        this.style.display = 'block';
        this.shadowRoot.innerHTML = `
            ${this.getSharedStyles()}

            <div class="hourly-widget widget-content">
                <div class="chart-container">
                    <svg class="temperature-chart" id="hourly-chart"></svg>
                </div>

                <div class="hourly-temps" id="hourly-temps">
                    <div class="hour-temp">
                        <div class="hour-temp-value">--°</div>
                        <div class="hour-icon">--</div>
                    </div>
                </div>

                <div class="hourly-times" id="hourly-times">
                    <span class="hour-time">--</span>
                </div>

                <div class="error-message error hidden" id="error"></div>
            </div>
        `;
    }

    update() {
        if (!this.data || !this.config.hourly) return;

        const hourlyData = this.data.hourly;

        // Update hourly temperatures
        const hourlyContainer = this.shadowRoot.getElementById('hourly-temps');
        const hourlyTimesContainer = this.shadowRoot.getElementById('hourly-times');

        hourlyContainer.innerHTML = '';
        hourlyTimesContainer.innerHTML = '';

        // Show only next 12 hours for better readability
        const displayHours = hourlyData.slice(0, 12);

        displayHours.forEach((hour, index) => {
            const hourDiv = document.createElement('div');
            hourDiv.className = 'hour-temp';

            // Add time-of-day color coding
            const timeOfDay = getTimeOfDay(hour.t, this.data.sun);
            const backgroundColor = getTimeOfDayColor(timeOfDay);

            hourDiv.innerHTML = `
                <div class="hour-temp-value">${hour.temp}°</div>
                <div class="hour-icon">${getWeatherIcon(hour.icon, '1.75rem')}</div>
            `;

            // Apply background color based on time of day
            hourDiv.style.backgroundColor = backgroundColor;
            hourDiv.style.borderRadius = '0.5rem';
            hourDiv.style.padding = '0.5rem';
            hourDiv.style.margin = '0.125rem';

            hourlyContainer.appendChild(hourDiv);

            const timeSpan = document.createElement('span');
            timeSpan.className = 'hour-time';
            // Show every other hour on small screens, all hours on larger screens
            if (index % 2 === 0) {
                timeSpan.textContent = hour.t;
            } else {
                timeSpan.innerHTML = `<span class="hidden sm:inline">${hour.t}</span>`;
            }
            hourlyTimesContainer.appendChild(timeSpan);
        });

        // Draw temperature chart with 12-hour data
        this.drawTemperatureChart(displayHours);

        this.hideError();
        this.hideLoading();
    }

    drawTemperatureChart(hourlyData) {
        const svg = this.shadowRoot.getElementById('hourly-chart');
        const rect = svg.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        svg.innerHTML = '';

        if (width === 0 || height === 0) return;

        const temps = hourlyData.map(h => h.temp);
        const maxTemp = Math.max(...temps);
        const minTemp = Math.min(...temps);
        const tempRange = maxTemp - minTemp || 1;

        let pathData = '';
        temps.forEach((temp, index) => {
            const x = (index / (temps.length - 1)) * width;
            const y = height - ((temp - minTemp) / tempRange) * height;
            pathData += (index === 0 ? 'M' : 'L') + x + ',' + y;
        });

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'chart-line');
        svg.appendChild(path);
    }
}

// Daily Forecast Component
class DailyForecastWidget extends WeatherWidget {
    render() {
        if (!this.config.daily) {
            this.style.display = 'none';
            return;
        }

        this.style.display = 'block';
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
        if (!this.data || !this.config.daily) return;

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
        const width = rect.width;
        const height = rect.height;

        svg.innerHTML = '';

        if (width === 0 || height === 0) return;

        const highs = dailyData.map(d => d.h);
        const lows = dailyData.map(d => d.l);
        const allTemps = [...highs, ...lows];
        const maxTemp = Math.max(...allTemps);
        const minTemp = Math.min(...allTemps);
        const tempRange = maxTemp - minTemp || 1;

        dailyData.forEach((day, index) => {
            const x = (index / (dailyData.length - 1)) * width;
            const highY = height - ((day.h - minTemp) / tempRange) * height;
            const lowY = height - ((day.l - minTemp) / tempRange) * height;

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
            highCircle.setAttribute('r', '4');
            highCircle.setAttribute('fill', '#f59e0b');
            svg.appendChild(highCircle);

            // Low temp circle
            const lowCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            lowCircle.setAttribute('cx', x);
            lowCircle.setAttribute('cy', lowY);
            lowCircle.setAttribute('r', '4');
            lowCircle.setAttribute('fill', '#3b82f6');
            svg.appendChild(lowCircle);
        });
    }
}

// Hourly Timeline Component
class HourlyTimelineWidget extends WeatherWidget {
    render() {
        if (!this.config.timeline) {
            this.style.display = 'none';
            return;
        }

        this.style.display = 'block';
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
        if (!this.data || !this.config.timeline) return;

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

// Weather App Main Controller
class WeatherApp {
    constructor() {
        this.activeRequests = new Map();
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

    async init() {
        await this.fetchWeatherData();

        // Create connection status indicator
        this.createConnectionStatus();

        // Refresh weather data every 10 minutes (fallback if real-time fails)
        setInterval(() => this.fetchWeatherData(), 600000);
    }

    createConnectionStatus() {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'connection-status';
        statusDiv.className = 'connection-status disconnected';
        statusDiv.textContent = 'Connecting...';
        document.body.appendChild(statusDiv);

        // Auto-hide after 3 seconds when connected
        let hideTimeout = null;

        // Listen for connection status changes
        this.broadcastEvent('connection-status', { connected: false, type: 'disconnected' });

        document.addEventListener('connection-status', (e) => {
            const status = e.detail;
            const statusEl = document.getElementById('connection-status');

            if (statusEl) {
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
            }
        });
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

// Help Section Component
class HelpSection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isVisible = false;
    }

    connectedCallback() {
        // Hide help section if widgets parameter is specified
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('widgets')) {
            this.style.display = 'none';
            return;
        }

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
        });
    }

    render() {
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
                    transition: all 0.2s ease;
                    background: var(--card-bg);
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
                    background: var(--card-bg);
                    border: 1px solid var(--card-border);
                }

                .param-name {
                    color: #fbbf24;
                    font-weight: 600;
                    font-family: monospace;
                }

                .param-example {
                    color: #86efac;
                    font-family: monospace;
                    font-size: 0.8rem;
                    display: block;
                    margin-top: 0.25rem;
                    opacity: 0.8;
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

            <button id="help-toggle" class="help-toggle theme-card">▲ Show Help</button>

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
                            <span class="param-example">?widgets=current,hourly,daily</span>
                        </li>
                        <li>
                            <span class="param-name">current</span> - Show/hide current weather (true/false)
                            <span class="param-example">?current=false</span>
                        </li>
                        <li>
                            <span class="param-name">hourly</span> - Show/hide hourly forecast (true/false)
                            <span class="param-example">?hourly=false</span>
                        </li>
                        <li>
                            <span class="param-name">daily</span> - Show/hide daily forecast (true/false)
                            <span class="param-example">?daily=false</span>
                        </li>
                        <li>
                            <span class="param-name">timeline</span> - Show/hide hourly timeline (true/false)
                            <span class="param-example">?timeline=false</span>
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
                            <span class="param-name">theme</span> - Background theme (white/light/dashboard/eink available)
                            <span class="param-example">?theme=white</span>
                        </li>
                        <li>
                            <span class="param-name">background</span> - Alias for theme parameter
                            <span class="param-example">?background=light</span>
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
                            <strong>White background theme:</strong>
                            <span class="param-example">/tokyo?theme=white</span>
                        </li>
                        <li>
                            <strong>High contrast dashboard (eInk displays):</strong>
                            <span class="param-example">/chicago?theme=dashboard</span>
                        </li>
                    </ul>
                </div>

                <div class="help-section">
                    <h3>💡 Tips</h3>
                    <p>• Widget names accept aliases: current/now, hourly/hours, daily/days/week, timeline/list</p>
                    <p>• Parameters can be combined for maximum customization</p>
                    <p>• Default location is Chicago if no location is specified</p>
                    <p>• All weather data includes beautiful sunrise/sunset color coding</p>
                </div>
            </div>
        `;
    }
}

// Register all components
customElements.define('weather-icon', WeatherIcon);
customElements.define('current-weather', CurrentWeatherWidget);
customElements.define('hourly-forecast', HourlyForecastWidget);
customElements.define('daily-forecast', DailyForecastWidget);
customElements.define('hourly-timeline', HourlyTimelineWidget);
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
