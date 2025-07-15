// ABOUTME: Real-time weather updates using WebSockets with polling fallback
// ABOUTME: Manages connection state, handles provider switching, and auto-refreshes weather data

class RealTimeWeatherManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // Start with 1 second
        this.pollingInterval = null;
        this.pollingDelay = 600000; // 10 minutes
        this.usePolling = false;
        this.currentLocation = null;
        this.eventHandlers = new Map();

        this.init();
    }

    init() {
        // Try WebSocket first
        this.connectWebSocket();

        // Setup polling as fallback
        this.setupPolling();
    }

    connectWebSocket() {
        try {
            // Only try WebSocket if Socket.IO is available
            if (typeof io === 'undefined') {
                console.log('📡 Socket.IO not available, falling back to polling');
                this.usePolling = true;
                this.startPolling();
                return;
            }

            console.log('🔗 Attempting WebSocket connection...');
            this.socket = io();

            // Connection event handlers
            this.socket.on('connect', () => {
                console.log('✅ WebSocket connected');
                this.isConnected = true;
                this.retryCount = 0;
                this.usePolling = false;
                this.stopPolling();
                this.broadcastEvent('connection_status', { connected: true, type: 'websocket' });
            });

            this.socket.on('disconnect', () => {
                console.log('❌ WebSocket disconnected');
                this.isConnected = false;
                this.broadcastEvent('connection_status', { connected: false, type: 'websocket' });
                this.handleDisconnection();
            });

            this.socket.on('connect_error', (error) => {
                console.log('❌ WebSocket connection error:', error);
                this.handleConnectionError();
            });

            // Weather-specific event handlers
            this.socket.on('weather_update', (data) => {
                console.log('🌤️  Received weather update via WebSocket');
                this.broadcastEvent('weather_update', data);
            });

            this.socket.on('weather_error', (data) => {
                console.log('❌ Weather error:', data);
                this.broadcastEvent('weather_error', data);
            });

            this.socket.on('provider_switched', (data) => {
                console.log('🔄 Provider switched to:', data.provider);
                this.broadcastEvent('provider_switched', data);

                // Request fresh weather data with new provider
                if (this.currentLocation) {
                    this.requestWeatherUpdate(this.currentLocation);
                }
            });

            this.socket.on('provider_info', (data) => {
                console.log('📋 Provider info received:', data);
                this.broadcastEvent('provider_info', data);
            });

            this.socket.on('pong', (data) => {
                console.log('🏓 Pong received:', data);
            });

        } catch (error) {
            console.log('❌ WebSocket setup failed:', error);
            this.handleConnectionError();
        }
    }

    handleDisconnection() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
            console.log(`🔄 Retrying WebSocket connection in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);

            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            console.log('❌ Max WebSocket retries reached, falling back to polling');
            this.usePolling = true;
            this.startPolling();
        }
    }

    handleConnectionError() {
        if (!this.usePolling) {
            console.log('❌ WebSocket failed, falling back to polling');
            this.usePolling = true;
            this.startPolling();
        }
    }

    setupPolling() {
        // Polling is setup but not started initially
        console.log('📡 Polling system initialized');
    }

    startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        console.log('🔄 Starting weather polling every', this.pollingDelay / 1000, 'seconds');
        this.broadcastEvent('connection_status', { connected: true, type: 'polling' });

        this.pollingInterval = setInterval(() => {
            if (this.currentLocation) {
                this.fetchWeatherData(this.currentLocation);
            }
        }, this.pollingDelay);

        // Also poll immediately
        if (this.currentLocation) {
            this.fetchWeatherData(this.currentLocation);
        }
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('⏹️  Polling stopped');
        }
    }

    async fetchWeatherData(location) {
        try {
            const params = new URLSearchParams();
            if (location.lat) params.append('lat', location.lat);
            if (location.lon) params.append('lon', location.lon);
            if (location.location) params.append('location', location.location);
            if (location.timezone) params.append('timezone', location.timezone);

            const response = await fetch(`/api/weather?${params}`);
            if (response.ok) {
                const data = await response.json();
                console.log('🌤️  Weather data fetched via polling');
                this.broadcastEvent('weather_update', data);
            } else {
                console.log('❌ Failed to fetch weather data:', response.status);
                this.broadcastEvent('weather_error', { error: 'Failed to fetch weather data' });
            }
        } catch (error) {
            console.log('❌ Error fetching weather data:', error);
            this.broadcastEvent('weather_error', { error: error.message });
        }
    }

    requestWeatherUpdate(location) {
        this.currentLocation = location;

        if (this.isConnected && this.socket) {
            console.log('📡 Requesting weather update via WebSocket');
            this.socket.emit('request_weather_update', location);
        } else if (this.usePolling) {
            console.log('📡 Requesting weather update via polling');
            this.fetchWeatherData(location);
        }
    }

    switchProvider(providerName) {
        if (this.isConnected && this.socket) {
            console.log('🔄 Switching provider via WebSocket');
            // The provider switch is handled via REST API, WebSocket will notify us
            return fetch('/api/providers/switch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ provider: providerName })
            });
        } else {
            console.log('🔄 Switching provider via REST API');
            return fetch('/api/providers/switch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ provider: providerName })
            }).then(response => {
                if (response.ok) {
                    // Manually refresh weather data since we don't have WebSocket
                    if (this.currentLocation) {
                        setTimeout(() => this.fetchWeatherData(this.currentLocation), 1000);
                    }
                }
                return response;
            });
        }
    }

    ping() {
        if (this.isConnected && this.socket) {
            this.socket.emit('ping');
        }
    }

    // Event system for components to subscribe to updates
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(handler);
        }
    }

    broadcastEvent(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error('Error in event handler:', error);
                }
            });
        }
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected || this.usePolling,
            type: this.isConnected ? 'websocket' : 'polling',
            retryCount: this.retryCount
        };
    }

    destroy() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.stopPolling();
        this.eventHandlers.clear();
        console.log('🔥 RealTimeWeatherManager destroyed');
    }
}

// Create global instance
window.realTimeWeather = new RealTimeWeatherManager();
