// ABOUTME: The <eink-panel> element: fetches one weather reading and draws the panel.
// ABOUTME: Layout numbers live in eink-panel.css, derived values in eink-panel-model.js.

(function () {
    'use strict';

    const MODEL =
        typeof module !== 'undefined' && module.exports
            ? require('./eink-panel-model.js')
            : window.EinkPanelModel;

    const CHICAGO = { lat: 41.8781, lon: -87.6298, name: 'Chicago' };
    const REFRESH_MS = 5 * 60 * 1000;
    const MARKER_RADIUS = 8;

    const READINGS = [
        { label: 'Air', fill: 'air', bar: 'air', value: 'temp' },
        { label: 'Wet bulb', fill: 'wet-bulb', bar: 'wetBulb', value: 'wetBulb' },
        { label: 'Feels', fill: 'feels', bar: 'feels', value: 'feels' }
    ];

    const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
    }

    function statCard(model) {
        // A reading the provider could not supply loses its whole row rather
        // than charting a zero that reads as a real temperature.
        const rows = READINGS.filter(({ bar }) => model.bars[bar] !== null)
            .map(
                ({ label, fill, bar, value }) => `
                <span class="reading-label">${escapeHtml(label)}</span>
                <div class="bar bar--${fill}" style="width: ${model.bars[bar]}%"></div>
                <span class="reading-value">${escapeHtml(model[value])}°</span>`
            )
            .join('');

        return `
        <div class="card now">
            <div class="now-head">
                <div class="hero">${escapeHtml(model.temp)}°</div>
                <div class="now-text">
                    <div class="location">${escapeHtml(model.locationLine)}</div>
                    <div class="summary">${escapeHtml(model.summary)}</div>
                    <div class="range">
                        <span><span class="range-label">High</span>${escapeHtml(model.high)}°</span>
                        <span><span class="range-label">Low</span>${escapeHtml(model.low)}°</span>
                    </div>
                </div>
            </div>
            <div class="readings">${rows}</div>
        </div>`;
    }

    function chart(model) {
        const bands = model.darkBands
            .map(({ left, width }) => {
                const style = `left: ${Math.round(left * 100)}%; width: ${Math.round(width * 100)}%`;
                return `<div class="dark-band" style="${style}"></div>`;
            })
            .join('');

        const bars = model.hours
            .map((hour) => `<div class="chart-bar" style="height: ${hour.barPercent}%"></div>`)
            .join('');

        const { points, width, height } = model.chart;
        const [nowX, nowY] = points[0];

        return `
        <div class="chart">
            ${bands}
            <div class="chart-bars">${bars}</div>
            <svg class="chart-line" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <polyline points="${points.map(([x, y]) => `${x},${y}`).join(' ')}" vector-effect="non-scaling-stroke"></polyline>
                <circle cx="${nowX}" cy="${nowY}" r="${MARKER_RADIUS}"></circle>
            </svg>
        </div>`;
    }

    /** Keys for the marks actually on the chart, and no others */
    function legend(model) {
        const items = [['line', 'Temperature']];
        if (model.channel.name !== 'none') items.push(['hatch', model.channel.legend]);
        if (model.darkBands.length) items.push(['dots', 'Dark']);

        return items
            .map(
                ([fill, label]) =>
                    `<span><span class="swatch swatch--${fill}"></span>${escapeHtml(label)}</span>`
            )
            .join('');
    }

    function hoursCard(model) {
        const labels = model.hours
            .map(
                (hour) => `
                <div class="hour">
                    <span class="hour-temp">${escapeHtml(hour.temp)}°</span>
                    <span class="hour-time">${escapeHtml(hour.t)}</span>
                    <span class="hour-channel">${escapeHtml(hour.channelLabel)}</span>
                </div>`
            )
            .join('');

        return `
        <div class="card hours">
            <div class="hours-head">
                <span>Next 12 hours</span>
                <span>${escapeHtml(model.channel.caption)}</span>
            </div>
            ${chart(model)}
            <div class="hour-labels">${labels}</div>
            <div class="legend">${legend(model)}</div>
        </div>`;
    }

    function footer(model) {
        const [lead, ...rest] = model.footer;
        const cells = rest
            .map((text) => `<div class="card insight">${escapeHtml(text)}</div>`)
            .join('');

        return `
        <div class="footer">
            <div class="insight insight--lead">${escapeHtml(lead)}</div>
            ${cells}
        </div>`;
    }

    function panelMarkup(model) {
        return `
        <link rel="stylesheet" href="/static/css/eink-panel.css">
        <div class="panel">
            ${statCard(model)}
            ${hoursCard(model)}
            ${footer(model)}
        </div>`;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { panelMarkup };
        return;
    }

    class EinkPanel extends HTMLElement {
        connectedCallback() {
            this.attachShadow({ mode: 'open' });
            this.load();
            this.timer = setInterval(() => this.load(), REFRESH_MS);
        }

        disconnectedCallback() {
            clearInterval(this.timer);
        }

        place() {
            const params = new URLSearchParams(window.location.search);
            return {
                lat: Number(params.get('lat')) || CHICAGO.lat,
                lon: Number(params.get('lon')) || CHICAGO.lon,
                name: params.get('location') || CHICAGO.name
            };
        }

        async load() {
            const { lat, lon, name } = this.place();
            const query = `lat=${lat}&lon=${lon}&location=${encodeURIComponent(name)}`;

            try {
                const [weather, lunar] = await Promise.all([
                    fetch(`/api/weather?${query}`).then((response) => response.json()),
                    fetch(`/api/lunar?${query}`).then((response) => response.json())
                ]);

                const moon = lunar?.lunar_data?.current_phase?.illumination_percent ?? 0;
                const reading = MODEL.toReading(weather, Math.round(moon), new Date());
                this.shadowRoot.innerHTML = panelMarkup(MODEL.buildPanelModel(reading));
            } catch (error) {
                console.error('Panel refresh failed', error);
            }
        }
    }

    customElements.define('eink-panel', EinkPanel);
})();
