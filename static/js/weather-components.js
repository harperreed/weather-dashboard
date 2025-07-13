// ABOUTME: Web Components for weather app using native Custom Elements API
// ABOUTME: Modular, reusable widgets with Shadow DOM encapsulation and weather-icons library

// Weather icon mapping using weather-icons library
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
    'wind': 'windy.svg',
    'fog': 'fog.svg',
    'cloudy': 'cloudy.svg',
    'partly-cloudy-day': 'partly-cloudy-day.svg',
    'partly-cloudy-night': 'partly-cloudy-night.svg',
    'thunderstorm': 'thunderstorms.svg',
    'hail': 'hail.svg'
};

// Icon base URL for weather-icons library
const WEATHER_ICON_BASE_URL = 'https://raw.githubusercontent.com/Makin-Things/weather-icons/main/animated/';

// Helper function to get weather icon HTML
function getWeatherIcon(iconCode, size = '2rem') {
    const iconFile = WEATHER_ICONS[iconCode] || WEATHER_ICONS['clear-day'];
    const iconUrl = WEATHER_ICON_BASE_URL + iconFile;
    
    return `<img src="${iconUrl}" alt="${iconCode}" style="width: ${size}; height: ${size}; display: inline-block; vertical-align: middle;">`;
}

// Helper function to get weather icon for smaller displays
function getWeatherIconSmall(iconCode) {
    return getWeatherIcon(iconCode, '1.5rem');
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
        this.render();
        this.setupEventListeners();
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

    // Shared styles for all components
    getSharedStyles() {
        return `
            <style>
                :host {
                    display: block;
                    color: white;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                
                .loading {
                    opacity: 0.6;
                    pointer-events: none;
                }
                
                .error {
                    color: #fca5a5;
                }
                
                .hidden {
                    display: none !important;
                }
                
                /* Responsive utilities */
                
                @media (max-width: 640px) {
                    .sm\\:hidden { display: none !important; }
                    .text-xs { font-size: 0.75rem; }
                    .text-sm { font-size: 0.875rem; }
                    .text-base { font-size: 1rem; }
                    .text-lg { font-size: 1.125rem; }
                }
                
                @media (min-width: 641px) {
                    .sm\\:block { display: block !important; }
                    .sm\\:inline { display: inline !important; }
                    .sm\\:text-sm { font-size: 0.875rem; }
                    .sm\\:text-base { font-size: 1rem; }
                    .sm\\:text-lg { font-size: 1.125rem; }
                    .sm\\:text-xl { font-size: 1.25rem; }
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
            <style>
                .current-widget {
                    margin-bottom: 1.5rem;
                }
                
                .temp-display {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }
                
                .temperature {
                    font-size: 2.5rem;
                    font-weight: 100;
                    line-height: 1;
                }
                
                .weather-icon {
                    display: inline-block;
                    vertical-align: middle;
                }
                
                .weather-icon img {
                    width: 2rem;
                    height: 2rem;
                }
                
                .feels-like {
                    font-size: 0.875rem;
                    opacity: 0.8;
                    margin-bottom: 0.5rem;
                }
                
                .summary {
                    font-size: 1.125rem;
                    font-weight: 300;
                    margin-bottom: 1rem;
                    line-height: 1.4;
                }
                
                .weather-details {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 0.75rem;
                }
                
                .detail-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.5rem 0.75rem;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 0.5rem;
                    font-size: 0.75rem;
                }
                
                .detail-label {
                    opacity: 0.8;
                }
                
                .detail-value {
                    font-weight: 500;
                }
                
                @media (min-width: 641px) {
                    .current-widget {
                        margin-bottom: 2rem;
                    }
                    
                    .temp-display {
                        gap: 1rem;
                    }
                    
                    .temperature {
                        font-size: 3rem;
                    }
                    
                    .weather-icon img {
                        width: 2.5rem;
                        height: 2.5rem;
                    }
                    
                    .feels-like {
                        font-size: 1rem;
                    }
                    
                    .summary {
                        font-size: 1.25rem;
                    }
                    
                    .detail-card {
                        padding: 0.75rem 1rem;
                        font-size: 0.875rem;
                    }
                }
                
                @media (min-width: 1024px) {
                    .temperature {
                        font-size: 4rem;
                    }
                    
                    .weather-icon img {
                        width: 3rem;
                        height: 3rem;
                    }
                    
                    .weather-details {
                        grid-template-columns: repeat(4, 1fr);
                    }
                    
                    .detail-card {
                        flex-direction: column;
                        text-align: center;
                        gap: 0.25rem;
                    }
                }
            </style>
            
            <div class="current-widget widget-content">
                <div class="temp-display">
                    <div class="temperature" id="temp">--°</div>
                    <div class="weather-icon" id="icon">⏳</div>
                </div>
                
                <div class="feels-like" id="feels-like">LOADING...</div>
                <div class="summary" id="summary">Loading weather data...</div>
                
                <div class="weather-details">
                    <div class="detail-card">
                        <span class="detail-label">Humidity</span>
                        <span class="detail-value" id="humidity">--%</span>
                    </div>
                    <div class="detail-card">
                        <span class="detail-label">Wind</span>
                        <span class="detail-value" id="wind">-- mph</span>
                    </div>
                    <div class="detail-card">
                        <span class="detail-label">Rain</span>
                        <span class="detail-value" id="rain">--%</span>
                    </div>
                    <div class="detail-card">
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
        this.shadowRoot.getElementById('icon').innerHTML = getWeatherIcon(current.icon);
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
            <style>
                .hourly-widget {
                    margin-bottom: 1.5rem;
                }
                
                .chart-container {
                    position: relative;
                    height: 7rem;
                    margin-bottom: 1rem;
                }
                
                .temperature-chart {
                    width: 100%;
                    height: 100%;
                }
                
                .chart-line {
                    stroke: #ef4444;
                    stroke-width: 2;
                    fill: none;
                }
                
                .hourly-temps {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                    overflow-x: auto;
                }
                
                .hour-temp {
                    text-align: center;
                    flex-shrink: 0;
                    min-width: 0;
                }
                
                .hour-temp-value {
                    font-size: 0.75rem;
                    opacity: 0.8;
                }
                
                .hour-icon {
                    margin-top: 0.25rem;
                }
                
                .hour-icon img {
                    width: 1.25rem;
                    height: 1.25rem;
                }
                
                .hourly-times {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.75rem;
                    opacity: 0.6;
                    overflow-x: auto;
                }
                
                .hour-time {
                    flex-shrink: 0;
                    min-width: 0;
                }
                
                @media (min-width: 641px) {
                    .hourly-widget {
                        margin-bottom: 2rem;
                    }
                    
                    .chart-container {
                        height: 9rem;
                    }
                    
                    .hour-temp-value {
                        font-size: 0.875rem;
                    }
                }
                
                @media (min-width: 768px) {
                    .chart-container {
                        height: 11rem;
                    }
                }
                
                @media (min-width: 1024px) {
                    .chart-container {
                        height: 12rem;
                    }
                }
            </style>
            
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
        
        hourlyData.forEach((hour, index) => {
            const hourDiv = document.createElement('div');
            hourDiv.className = 'hour-temp';
            hourDiv.innerHTML = `
                <div class="hour-temp-value">${hour.temp}°</div>
                <div class="hour-icon">${getWeatherIconSmall(hour.icon)}</div>
            `;
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
        
        // Draw temperature chart
        this.drawTemperatureChart(hourlyData);
        
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
            <style>
                .daily-widget {
                    margin-bottom: 1.5rem;
                }
                
                .daily-chart-container {
                    position: relative;
                    height: 5rem;
                    margin-bottom: 1rem;
                }
                
                .daily-chart {
                    width: 100%;
                    height: 100%;
                }
                
                .daily-forecast {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 0.25rem;
                    margin-bottom: 1rem;
                }
                
                .day-forecast {
                    text-align: center;
                    padding: 0.25rem 0.5rem;
                }
                
                .day-name {
                    font-size: 0.75rem;
                    opacity: 0.6;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .day-icon {
                    margin: 0.25rem 0;
                }
                
                .day-icon img {
                    width: 1.5rem;
                    height: 1.5rem;
                }
                
                .day-high {
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                
                .day-low {
                    font-size: 0.75rem;
                    opacity: 0.6;
                }
                
                @media (min-width: 641px) {
                    .daily-widget {
                        margin-bottom: 2rem;
                    }
                    
                    .daily-chart-container {
                        height: 7rem;
                    }
                    
                    .daily-forecast {
                        grid-template-columns: repeat(7, 1fr);
                        gap: 0.5rem;
                    }
                    
                    .day-forecast {
                        padding: 0.5rem;
                    }
                    
                    .day-icon img {
                        width: 1.75rem;
                        height: 1.75rem;
                    }
                    
                    .day-high {
                        font-size: 0.875rem;
                    }
                }
                
                @media (min-width: 768px) {
                    .daily-chart-container {
                        height: 9rem;
                    }
                }
                
                @media (min-width: 1024px) {
                    .daily-chart-container {
                        height: 10rem;
                    }
                }
            </style>
            
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
                <div class="day-icon">${getWeatherIconSmall(day.icon)}</div>
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
            <style>
                .timeline-widget {
                    margin-bottom: 1.5rem;
                }
                
                .timeline-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .timeline-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .timeline-dot {
                    width: 0.5rem;
                    height: 1.5rem;
                    border-radius: 9999px;
                    flex-shrink: 0;
                }
                
                .timeline-dot.current {
                    background-color: #fbbf24;
                }
                
                .timeline-dot.future {
                    background-color: #9ca3af;
                }
                
                .timeline-content {
                    flex: 1;
                    margin-left: 0.75rem;
                    min-width: 0;
                }
                
                .timeline-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .timeline-time {
                    font-weight: 500;
                    font-size: 0.875rem;
                }
                
                .timeline-temp {
                    font-size: 0.875rem;
                    flex-shrink: 0;
                    margin-left: 0.5rem;
                }
                
                .timeline-desc {
                    font-size: 0.75rem;
                    opacity: 0.8;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .timeline-rain {
                    font-size: 0.75rem;
                    opacity: 0.6;
                }
                
                .loading-message {
                    text-align: center;
                    font-size: 0.875rem;
                    opacity: 0.6;
                }
                
                @media (min-width: 641px) {
                    .timeline-widget {
                        margin-bottom: 2rem;
                    }
                    
                    .timeline-container {
                        gap: 0.75rem;
                    }
                    
                    .timeline-dot {
                        height: 2rem;
                        margin-left: 0.25rem;
                    }
                    
                    .timeline-content {
                        margin-left: 1rem;
                    }
                    
                    .timeline-time {
                        font-size: 1rem;
                    }
                    
                    .timeline-temp {
                        font-size: 1rem;
                    }
                    
                    .timeline-desc {
                        font-size: 0.875rem;
                    }
                }
            </style>
            
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
        
        // Refresh weather data every 10 minutes
        setInterval(() => this.fetchWeatherData(), 600000);
    }

    async fetchWeatherData() {
        try {
            this.broadcastEvent('weather-loading', { loading: true });
            
            const { lat, lon, location } = this.parseLocationParams();
            const apiUrl = this.buildApiUrl(lat, lon, location);
            
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
        let lat, lon, location;
        
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
        } else if (pathParts.length >= 1 && this.cityCoords[pathParts[0].toLowerCase()]) {
            // Format: /city
            const cityData = this.cityCoords[pathParts[0].toLowerCase()];
            lat = cityData[0];
            lon = cityData[1];
            location = cityData[2];
        } else {
            // Fallback to query parameters
            const urlParams = new URLSearchParams(window.location.search);
            lat = urlParams.get('lat');
            lon = urlParams.get('lon');
            location = urlParams.get('location');
        }
        
        // Default to Chicago if no location provided
        if (!lat && !lon && !location) {
            const defaultCity = this.cityCoords['chicago'];
            lat = defaultCity[0];
            lon = defaultCity[1];
            location = defaultCity[2];
        }
        
        return { lat, lon, location };
    }

    buildApiUrl(lat, lon, location) {
        let apiUrl = '/api/weather';
        const params = new URLSearchParams();
        
        if (lat && lon) {
            params.append('lat', lat);
            params.append('lon', lon);
        }
        if (location) {
            params.append('location', location);
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

// Register all components
customElements.define('current-weather', CurrentWeatherWidget);
customElements.define('hourly-forecast', HourlyForecastWidget);
customElements.define('daily-forecast', DailyForecastWidget);
customElements.define('hourly-timeline', HourlyTimelineWidget);

// Initialize the weather app
const weatherApp = new WeatherApp();
document.addEventListener('DOMContentLoaded', () => {
    weatherApp.init();
});