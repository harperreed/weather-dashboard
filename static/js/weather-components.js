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

// Helper function to calculate wetbulb temperature
function calculateWetbulbTemp(tempF, humidity) {
    // Convert Fahrenheit to Celsius
    const tempC = (tempF - 32) * 5/9;
    const rh = humidity;

    // Stull approximation for wetbulb temperature
    const wetbulbC = tempC * Math.atan(0.152 * Math.sqrt(rh + 8.3136)) +
                     Math.atan(tempC + rh) -
                     Math.atan(rh - 1.6763) +
                     0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
                     4.686035;

    // Convert back to Fahrenheit
    const wetbulbF = wetbulbC * 9/5 + 32;

    return Math.round(wetbulbF);
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
            timeline: true,
            airquality: true,
            wind: true,
            pressure: true
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
                timeline: false,
                airquality: false,
                wind: false,
                pressure: false
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
                    case 'air-quality':
                    case 'airquality':
                    case 'air':
                    case 'aqi':
                        this.config.airquality = true;
                        break;
                    case 'wind-direction':
                    case 'wind':
                    case 'compass':
                        this.config.wind = true;
                        break;
                    case 'pressure-trends':
                    case 'pressure':
                    case 'trends':
                        this.config.pressure = true;
                        break;
                }
            });
        }

        // Individual widget parameters
        if (urlParams.has('current')) this.config.current = urlParams.get('current') !== 'false';
        if (urlParams.has('hourly')) this.config.hourly = urlParams.get('hourly') !== 'false';
        if (urlParams.has('daily')) this.config.daily = urlParams.get('daily') !== 'false';
        if (urlParams.has('timeline')) this.config.timeline = urlParams.get('timeline') !== 'false';
        if (urlParams.has('air-quality') || urlParams.has('airquality')) this.config.airquality = urlParams.get('air-quality') !== 'false' && urlParams.get('airquality') !== 'false';
        if (urlParams.has('wind-direction') || urlParams.has('wind')) this.config.wind = urlParams.get('wind-direction') !== 'false' && urlParams.get('wind') !== 'false';
        if (urlParams.has('pressure-trends') || urlParams.has('pressure')) this.config.pressure = urlParams.get('pressure-trends') !== 'false' && urlParams.get('pressure') !== 'false';
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
                    margin-bottom: 0.5rem !important;
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

        const wetbulbTemp = calculateWetbulbTemp(current.temperature, current.humidity);
        this.shadowRoot.getElementById('feels-like').textContent = `FEELS LIKE ${current.feels_like}° • WETBULB ${wetbulbTemp}°`;

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

        // Draw temperature line
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'chart-line');
        svg.appendChild(path);

        // Add vertical line to show current time position
        // Current time is at the first data point (index 0)
        const currentTimeX = 0; // First hour position
        const currentTimeLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        currentTimeLine.setAttribute('x1', currentTimeX);
        currentTimeLine.setAttribute('y1', 0);
        currentTimeLine.setAttribute('x2', currentTimeX);
        currentTimeLine.setAttribute('y2', height);
        currentTimeLine.setAttribute('stroke', '#f59e0b');
        currentTimeLine.setAttribute('stroke-width', '2');
        currentTimeLine.setAttribute('stroke-dasharray', '4,4');
        currentTimeLine.setAttribute('opacity', '0.8');
        svg.appendChild(currentTimeLine);

        // Add "NOW" label at the top of the current time line
        const nowLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nowLabel.setAttribute('x', currentTimeX);
        nowLabel.setAttribute('y', 15);
        nowLabel.setAttribute('text-anchor', 'middle');
        nowLabel.setAttribute('font-size', '10px');
        nowLabel.setAttribute('font-weight', 'bold');
        nowLabel.setAttribute('fill', '#f59e0b');
        nowLabel.textContent = 'NOW';
        svg.appendChild(nowLabel);
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

// Air Quality Widget Component
class AirQualityWidget extends WeatherWidget {
    render() {
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
        super.connectedCallback();

        // Check if this widget should be displayed
        if (!this.config.airquality) {
            this.style.display = 'none';
            return;
        }

        this.style.display = 'block';
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
        if (!this.config.wind) {
            this.style.display = 'none';
            return;
        }

        this.style.display = 'block';
    }

    render() {
        this.style.display = 'block';
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
                            <span class="param-example">?widgets=current,hourly,daily,air-quality,wind,pressure</span>
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
                        <li>
                            <span class="param-name">air-quality</span> - Show/hide air quality index (true/false)
                            <span class="param-example">?air-quality=false</span>
                        </li>
                        <li>
                            <span class="param-name">wind-direction</span> - Show/hide wind compass (true/false)
                            <span class="param-example">?wind-direction=false</span>
                        </li>
                        <li>
                            <span class="param-name">pressure-trends</span> - Show/hide atmospheric pressure (true/false)
                            <span class="param-example">?pressure-trends=false</span>
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

/**
 * Pressure Trends Widget - displays atmospheric pressure with trends and predictions
 */
class PressureTrendsWidget extends WeatherWidget {
    constructor() {
        super();
        this.weatherData = null;
    }

    connectedCallback() {
        super.connectedCallback();

        // Check if this widget should be displayed
        if (!this.config.pressure) {
            this.style.display = 'none';
            return;
        }

        this.style.display = 'block';
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
                        margin-bottom: 1rem;
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
                    margin-bottom: 1rem;
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

                /* Dashboard theme adjustments */
                [data-theme="dashboard"] .pressure-card {
                    border: 2px solid var(--card-border);
                    background: var(--card-bg);
                }

                [data-theme="dashboard"] .pressure-prediction {
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

// Register all components
customElements.define('weather-icon', WeatherIcon);
customElements.define('current-weather', CurrentWeatherWidget);
customElements.define('hourly-forecast', HourlyForecastWidget);
customElements.define('daily-forecast', DailyForecastWidget);
customElements.define('hourly-timeline', HourlyTimelineWidget);
customElements.define('air-quality', AirQualityWidget);
customElements.define('wind-direction', WindDirectionWidget);
customElements.define('pressure-trends', PressureTrendsWidget);
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
