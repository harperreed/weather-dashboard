import os
import subprocess  # nosec B404 # Safe subprocess usage for git commands
import time
from datetime import datetime
from typing import Any


try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo  # type: ignore[no-redef]

import requests
from cachetools import TTLCache
from dotenv import load_dotenv
from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_from_directory,
)
from flask_compress import Compress
from flask_socketio import SocketIO, emit

from weather_providers import (
    AirQualityProvider,
    HybridWeatherProvider,
    OpenMeteoProvider,
    PirateWeatherProvider,
    WeatherProviderManager,
)


load_dotenv()

app = Flask(__name__)
secret_key = os.getenv('SECRET_KEY')
if not secret_key:
    import secrets

    secret_key = secrets.token_hex(16)
    print(
        'Warning: No SECRET_KEY environment variable set. '
        'Generated temporary key for this session.'
    )
app.config['SECRET_KEY'] = secret_key

# Enable gzip compression for all responses
Compress(app)

# Initialize SocketIO with secure CORS settings
cors_origins = os.getenv(
    'CORS_ALLOWED_ORIGINS', 'http://localhost:5001,http://127.0.0.1:5001'
).split(',')
socketio = SocketIO(app, cors_allowed_origins=cors_origins)

# Weather API: Open-Meteo (free and accurate)
OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast'

# Chicago coordinates
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298

# Cache for weather API responses (3 minutes TTL for real-time updates, max 100 entries)
weather_cache: TTLCache[str, Any] = TTLCache(maxsize=100, ttl=180)

# Initialize weather provider manager
weather_manager = WeatherProviderManager()

# Initialize individual providers
open_meteo = OpenMeteoProvider()

# Initialize EPA AirNow air quality provider (API key required)
airnow_api_key = os.getenv('AIRNOW_API_KEY')
if airnow_api_key:
    air_quality_provider: AirQualityProvider | None = AirQualityProvider(airnow_api_key)
    print('🏛️ AirNow API key found - official EPA air quality data available')
else:
    air_quality_provider = None
    print('🏛️ No AirNow API key found - air quality service unavailable')

# Check for PirateWeather API key and create hybrid provider if available
pirate_weather_api_key = os.getenv('PIRATE_WEATHER_API_KEY', 'YOUR_API_KEY_HERE')

if pirate_weather_api_key and pirate_weather_api_key != 'YOUR_API_KEY_HERE':
    print('🏴‍☠️ PirateWeather API key found - creating hybrid provider')
    pirate_weather = PirateWeatherProvider(pirate_weather_api_key)
    hybrid_provider = HybridWeatherProvider(pirate_weather, open_meteo)

    # Set up hybrid with fallbacks
    weather_manager.add_provider(hybrid_provider, is_primary=True)
    weather_manager.add_provider(open_meteo, is_primary=False)  # Fallback
    weather_manager.add_provider(pirate_weather, is_primary=False)  # Secondary fallback

    print('✨ Using Hybrid Provider (PirateWeather current + OpenMeteo forecasts)')
    print('🔄 Fallbacks: OpenMeteo → PirateWeather')
else:
    print('🌤️  No PirateWeather API key - using OpenMeteo only')
    weather_manager.add_provider(open_meteo, is_primary=True)


def get_git_hash() -> str:
    """Get the current git commit hash"""
    try:
        result = subprocess.run(  # nosec B603 B607 # Safe git command execution
            ['git', 'rev-parse', '--short', 'HEAD'],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=os.path.dirname(__file__) or '.',
            check=False,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
        pass
    return 'unknown'


def get_weather_from_open_meteo(lat: float, lon: float) -> dict | None:
    """Fetch weather data from Open-Meteo API"""
    try:
        # Build URL with comprehensive weather parameters
        url = f'{OPEN_METEO_BASE_URL}?latitude={lat}&longitude={lon}'
        url += (
            '&current=temperature_2m,relative_humidity_2m,apparent_temperature,'
            'precipitation,weather_code,cloud_cover,wind_speed_10m,'
            'wind_direction_10m,uv_index,pressure_msl'
        )
        url += (
            '&hourly=temperature_2m,precipitation_probability,precipitation,'
            'weather_code,cloud_cover,wind_speed_10m,pressure_msl'
        )
        url += (
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,'
            'precipitation_sum,precipitation_probability_max,'
            'wind_speed_10m_max,uv_index_max'
        )
        url += (
            '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch'
        )
        url += '&timezone=auto&forecast_days=7'

        print(f'🌤️  Fetching Open-Meteo data from: {url}')

        response = requests.get(url, timeout=10)
        response.raise_for_status()

        return response.json()  # type: ignore[no-any-return]
    except Exception as e:
        print(f'❌ Open-Meteo API error: {str(e)}')
        return None


def map_open_meteo_weather_code(code: int) -> str:
    """Map Open-Meteo weather codes to our icon codes"""
    # WMO Weather interpretation codes
    code_map = {
        0: 'clear-day',  # Clear sky
        1: 'clear-day',  # Mainly clear
        2: 'partly-cloudy-day',  # Partly cloudy
        3: 'cloudy',  # Overcast
        45: 'fog',  # Fog
        48: 'fog',  # Depositing rime fog
        51: 'light-rain',  # Light drizzle
        53: 'rain',  # Moderate drizzle
        55: 'heavy-rain',  # Dense drizzle
        61: 'light-rain',  # Slight rain
        63: 'rain',  # Moderate rain
        65: 'heavy-rain',  # Heavy rain
        71: 'light-snow',  # Slight snow fall
        73: 'snow',  # Moderate snow fall
        75: 'heavy-snow',  # Heavy snow fall
        80: 'light-rain',  # Slight rain showers
        81: 'rain',  # Moderate rain showers
        82: 'heavy-rain',  # Violent rain showers
        85: 'light-snow',  # Slight snow showers
        86: 'heavy-snow',  # Heavy snow showers
        95: 'thunderstorm',  # Thunderstorm
        96: 'thunderstorm',  # Thunderstorm with slight hail
        99: 'thunderstorm',  # Thunderstorm with heavy hail
    }

    return code_map.get(code, 'clear-day')


def get_weather_icon(icon_code: str) -> str:
    """Return weather icon code for use with weather-icons library"""
    # Map some common variations to standard icon codes
    icon_map = {
        'clear-day': 'clear-day',
        'clear-night': 'clear-night',
        'rain': 'rain',
        'heavy-rain': 'heavy-rain',
        'light-rain': 'light-rain',
        'snow': 'snow',
        'heavy-snow': 'heavy-snow',
        'light-snow': 'light-snow',
        'sleet': 'sleet',
        'wind': 'wind',
        'fog': 'fog',
        'cloudy': 'cloudy',
        'partly-cloudy-day': 'partly-cloudy-day',
        'partly-cloudy-night': 'partly-cloudy-night',
        'thunderstorm': 'thunderstorm',
        'hail': 'hail',
    }
    return icon_map.get(icon_code, 'clear-day')


def process_open_meteo_data(
    data: dict | None, location_name: str | None = None
) -> dict | None:
    """Process Open-Meteo weather data into our expected format"""
    if not data:
        return None

    try:
        current = data.get('current', {})
        hourly = data.get('hourly', {})
        daily = data.get('daily', {})

        # Process current weather
        current_weather = {
            'temperature': round(current.get('temperature_2m', 0)),
            'feels_like': round(current.get('apparent_temperature', 0)),
            'humidity': current.get('relative_humidity_2m', 0),
            'wind_speed': round(current.get('wind_speed_10m', 0)),
            'wind_direction': current.get('wind_direction_10m'),
            'uv_index': current.get('uv_index', 0),
            'precipitation_rate': current.get('precipitation', 0),
            'precipitation_prob': 0,  # Current doesn't have probability
            'precipitation_type': (
                'rain' if current.get('precipitation', 0) > 0 else None
            ),
            'pressure': round(
                current.get('pressure_msl', 0), 1
            ),  # Sea level pressure in hPa
            'icon': map_open_meteo_weather_code(current.get('weather_code', 0)),
            'summary': get_weather_description(current.get('weather_code', 0)),
        }

        # Process hourly forecast (next 24 hours)
        hourly_forecast = []
        pressure_history = []  # Store pressure readings for trend analysis
        if hourly.get('time'):
            for i in range(min(24, len(hourly['time']))):
                pressure_value = hourly.get('pressure_msl', [0] * len(hourly['time']))[
                    i
                ]
                hour_data = {
                    'temp': round(hourly['temperature_2m'][i]),
                    'icon': map_open_meteo_weather_code(hourly['weather_code'][i]),
                    'rain': (
                        hourly['precipitation_probability'][i]
                        if i < len(hourly.get('precipitation_probability', []))
                        else 0
                    ),
                    't': (
                        datetime.fromisoformat(hourly['time'][i].replace('Z', '+00:00'))
                        .astimezone(zoneinfo.ZoneInfo('America/Chicago'))
                        .strftime('%I%p')
                        .lower()
                        .replace('0', '')
                    ),
                    'desc': get_weather_description(hourly['weather_code'][i]),
                    'pressure': round(pressure_value, 1),
                }
                hourly_forecast.append(hour_data)
                pressure_history.append(
                    {'time': hourly['time'][i], 'pressure': round(pressure_value, 1)}
                )

        # Process daily forecast
        daily_forecast = []
        if daily.get('time'):
            for i in range(min(7, len(daily['time']))):
                day_data = {
                    'h': round(daily['temperature_2m_max'][i]),
                    'l': round(daily['temperature_2m_min'][i]),
                    'icon': map_open_meteo_weather_code(daily['weather_code'][i]),
                    'd': datetime.fromisoformat(daily['time'][i]).strftime('%a'),
                }
                daily_forecast.append(day_data)

        # Calculate pressure trends
        pressure_trend = calculate_pressure_trend(pressure_history)

    except Exception as e:
        print(f'❌ Error processing Open-Meteo data: {str(e)}')
        return None
    else:
        return {
            'current': current_weather,
            'hourly': hourly_forecast,
            'daily': daily_forecast,
            'location': location_name or 'Unknown Location',
            'pressure_trend': pressure_trend,
        }


# Pressure trend analysis constants
MIN_PRESSURE_HISTORY_POINTS = 3
PRESSURE_TREND_STEADY_THRESHOLD = 0.1  # hPa/hour
PRESSURE_TREND_SIGNIFICANT_THRESHOLD = 0.5  # hPa/hour
PRESSURE_HIGH_THRESHOLD = 1020  # hPa
PRESSURE_NORMAL_THRESHOLD = 1000  # hPa


def calculate_pressure_trend(pressure_history: list[dict]) -> dict:
    """Calculate pressure trend indicators from historical data"""
    if len(pressure_history) < MIN_PRESSURE_HISTORY_POINTS:
        return {
            'trend': 'steady',
            'rate': 0.0,
            'prediction': 'Unable to determine trend - insufficient data',
        }

    # Get current pressure and 3-hour ago pressure for trend calculation
    current_pressure = pressure_history[0]['pressure'] if pressure_history else 0
    three_hours_ago = pressure_history[min(3, len(pressure_history) - 1)]['pressure']

    # Calculate rate of change in hPa per hour
    pressure_change = current_pressure - three_hours_ago
    rate_per_hour = pressure_change / 3.0  # 3-hour change divided by 3

    # Determine trend direction
    if abs(rate_per_hour) < PRESSURE_TREND_STEADY_THRESHOLD:
        trend = 'steady'
    elif rate_per_hour > PRESSURE_TREND_STEADY_THRESHOLD:
        trend = 'rising'
    else:
        trend = 'falling'

    # Generate weather prediction based on pressure trend
    prediction = get_pressure_prediction(trend, rate_per_hour, current_pressure)

    return {
        'trend': trend,
        'rate': round(rate_per_hour, 2),
        'prediction': prediction,
        'current_pressure': current_pressure,
        'history': pressure_history[:12],  # Last 12 hours for mini-chart
    }


def get_pressure_prediction(trend: str, rate: float, current_pressure: float) -> str:
    """Generate weather prediction based on pressure trends"""
    predictions = {
        'rising_fast': 'Improving weather expected - clearing skies likely',
        'rising_slow': 'Weather gradually improving',
        'steady_high': 'Continued fair weather',
        'steady_normal': 'Current weather conditions expected to persist',
        'steady_low': 'Unsettled weather may continue',
        'falling_slow': 'Weather may deteriorate gradually',
        'falling_fast': 'Stormy weather approaching - expect precipitation',
    }

    # Categorize pressure levels (typical sea level pressure ranges)
    if current_pressure > PRESSURE_HIGH_THRESHOLD:
        pressure_level = 'high'
    elif current_pressure > PRESSURE_NORMAL_THRESHOLD:
        pressure_level = 'normal'
    else:
        pressure_level = 'low'

    # Categorize rate of change
    if abs(rate) < PRESSURE_TREND_STEADY_THRESHOLD:
        rate_category = 'steady'
    elif abs(rate) > PRESSURE_TREND_SIGNIFICANT_THRESHOLD:
        rate_category = f'{trend}_fast'
    else:
        rate_category = f'{trend}_slow'

    # Combine trend and pressure level for prediction
    if rate_category == 'steady':
        prediction_key = f'steady_{pressure_level}'
    else:
        prediction_key = rate_category

    return predictions.get(prediction_key, 'Weather pattern uncertain')


def get_weather_description(weather_code: int) -> str:
    """Get human-readable weather description from WMO code"""
    descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
    }
    return descriptions.get(weather_code, 'Unknown')


# Common city shortcuts (timezone auto-detected by OpenMeteo API)
CITY_COORDS = {
    'chicago': (41.8781, -87.6298, 'Chicago'),
    'nyc': (40.7128, -74.0060, 'New York City'),
    'sf': (37.7749, -122.4194, 'San Francisco'),
    'london': (51.5074, -0.1278, 'London'),
    'paris': (48.8566, 2.3522, 'Paris'),
    'tokyo': (35.6762, 139.6503, 'Tokyo'),
    'sydney': (-33.8688, 151.2093, 'Sydney'),
    'berlin': (52.5200, 13.4050, 'Berlin'),
    'rome': (41.9028, 12.4964, 'Rome'),
    'madrid': (40.4168, -3.7038, 'Madrid'),
}


@app.route('/')  # type: ignore[misc]
def index() -> str:
    """Main weather page"""
    return str(render_template('weather.html', git_hash=get_git_hash()))


@app.route('/<city>')  # type: ignore[misc]
def weather_by_city(city: str) -> str | tuple[str, int]:
    """Weather page for common cities"""
    city_lower = city.lower()
    if city_lower in CITY_COORDS:
        return str(render_template('weather.html', git_hash=get_git_hash()))

    # Check if this might be coordinates (contains comma and numbers)
    coord_chars = {'.', '-'}
    if ',' in city and any(char.isdigit() or char in coord_chars for char in city):
        try:
            parts = city.split(',')
            coord_parts_expected = 2
            if len(parts) == coord_parts_expected:
                lat = float(parts[0])
                lon = float(parts[1])
                # Valid coordinate range check
                min_lat, max_lat = -90, 90
                min_lon, max_lon = -180, 180
                if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
                    return str(render_template('weather.html', git_hash=get_git_hash()))
        except ValueError:
            pass

    return (
        f"City '{city}' not found. Available cities: {', '.join(CITY_COORDS.keys())}"
    ), 404


@app.route('/<float:lat>,<float:lon>', methods=['GET'])  # type: ignore[misc]
def weather_by_coords(_lat: float, _lon: float) -> str:
    """Weather page for specific coordinates"""
    return str(render_template('weather.html', git_hash=get_git_hash()))


@app.route('/<float:lat>,<float:lon>/<location>')  # type: ignore[misc]
def weather_by_coords_and_location(_lat: float, _lon: float, _location: str) -> str:
    """Weather page for specific coordinates and location name"""
    return str(render_template('weather.html', git_hash=get_git_hash()))


@app.route('/api/weather')  # type: ignore[misc]
def weather_api() -> Response:
    """API endpoint for weather data"""
    # Get lat/lon from URL parameters
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    location_name = request.args.get('location', 'Chicago')
    timezone_name = request.args.get('timezone')  # Optional override

    # Default to Chicago if no coordinates provided
    if not lat or not lon:
        lat = CHICAGO_LAT
        lon = CHICAGO_LON

    # Create cache key
    cache_key = f'{lat:.4f},{lon:.4f}'

    # Check cache first
    if cache_key in weather_cache:
        print(f'📦 Returning cached data for {cache_key}')
        cached_data = weather_cache[cache_key]
        cached_data['location'] = location_name  # Update location name
        response = jsonify(cached_data)
        response.headers['Cache-Control'] = 'public, max-age=180'
        etag_value = hash(str(lat) + str(lon) + str(int(time.time() // 300)))
        response.headers['ETag'] = f'"{etag_value}"'
        return response

    # Use weather provider manager to get data
    print(f'🌤️  Fetching weather for {location_name} using provider system')
    processed_data = weather_manager.get_weather(lat, lon, location_name, timezone_name)

    if processed_data:
        # Cache the result
        weather_cache[cache_key] = processed_data
        print(f'💾 Cached weather data for {cache_key}')

        response = jsonify(processed_data)
        response.headers['Cache-Control'] = 'public, max-age=180'
        etag_value = hash(str(lat) + str(lon) + str(int(time.time() // 300)))
        response.headers['ETag'] = f'"{etag_value}"'
        return response
    response = jsonify({'error': 'Failed to fetch weather data from all sources'})
    response.status_code = 500
    return response


@app.route('/api/cache/stats')  # type: ignore[misc]
def cache_stats() -> Response:
    """API endpoint for cache statistics"""
    return jsonify(
        {
            'cache_size': len(weather_cache),
            'max_size': weather_cache.maxsize,
            'ttl_seconds': weather_cache.ttl,
            'cached_locations': list(weather_cache.keys()),
        }
    )


@app.route('/api/providers')  # type: ignore[misc]
def get_providers() -> Response:
    """API endpoint to get weather provider information"""
    return jsonify(weather_manager.get_provider_info())


@app.route('/api/air-quality')  # type: ignore[misc]
def air_quality_api() -> Response:
    """API endpoint for air quality data"""
    # AirNow requires API key - service unavailable without it
    if not air_quality_provider:
        response = jsonify(
            {'error': 'Air quality service unavailable - AirNow API key required'}
        )
        response.status_code = 503
        return response

    # Get lat/lon from URL parameters
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    location_name = request.args.get('location', 'Unknown Location')

    # Default to Chicago if no coordinates provided
    if not lat or not lon:
        lat = CHICAGO_LAT
        lon = CHICAGO_LON

    # Create cache key for air quality
    cache_key = f'air_quality_{lat:.4f},{lon:.4f}'

    # Check cache first (air quality updates less frequently - 30 min TTL)
    air_quality_cache_ttl = 1800  # 30 minutes
    cache_time = int(time.time() // air_quality_cache_ttl)
    cache_key_with_time = f'{cache_key}_{cache_time}'

    if cache_key_with_time in weather_cache:
        print(f'📦 Returning cached air quality data for {cache_key}')
        cached_data = weather_cache[cache_key_with_time]
        response = jsonify(cached_data)
        response.headers['Cache-Control'] = f'public, max-age={air_quality_cache_ttl}'
        return response

    # Fetch fresh air quality data
    print(f'🌬️  Fetching air quality for {location_name}')
    air_quality_data = air_quality_provider.get_weather(lat, lon, location_name)

    if air_quality_data:
        # Cache the result
        weather_cache[cache_key_with_time] = air_quality_data
        print(f'💾 Cached air quality data for {cache_key}')

        response = jsonify(air_quality_data)
        response.headers['Cache-Control'] = f'public, max-age={air_quality_cache_ttl}'
        return response

    response = jsonify({'error': 'Failed to fetch air quality data'})
    response.status_code = 500
    return response


@app.route('/api/providers/switch', methods=['POST'])  # type: ignore[misc]
def switch_provider() -> Response:
    """API endpoint to switch weather provider"""
    data = request.get_json()
    provider_name = data.get('provider')

    if not provider_name:
        response = jsonify({'error': 'Provider name is required'})
        response.status_code = 400
        return response

    success = weather_manager.switch_provider(provider_name)

    if success:
        # Clear cache when switching providers
        weather_cache.clear()

        # Notify all connected clients via WebSocket
        provider_info = weather_manager.get_provider_info()
        socketio.emit(
            'provider_switched',
            {'provider': provider_name, 'provider_info': provider_info},
        )

        return jsonify(
            {
                'success': True,
                'message': f'Switched to {provider_name} provider',
                'provider_info': provider_info,
            }
        )
    response = jsonify(
        {
            'success': False,
            'error': f'Provider {provider_name} not found',
            'available_providers': list(weather_manager.providers.keys()),
        }
    )
    response.status_code = 400
    return response


# WebSocket event handlers
@socketio.on('connect')  # type: ignore[misc]
def handle_connect() -> None:
    """Handle client connection"""
    print(f'🔗 Client connected: {request.sid}')

    # Send current provider info to the newly connected client
    provider_info = weather_manager.get_provider_info()
    emit('provider_info', provider_info)


@socketio.on('disconnect')  # type: ignore[misc]
def handle_disconnect() -> None:
    """Handle client disconnection"""
    print(f'📡 Client disconnected: {request.sid}')


@socketio.on('request_weather_update')  # type: ignore[misc]
def handle_weather_update_request(data: dict) -> None:
    """Handle weather update request from client"""
    lat = data.get('lat', CHICAGO_LAT)
    lon = data.get('lon', CHICAGO_LON)
    location = data.get('location', 'Chicago')
    timezone_name = data.get('timezone')  # Optional override

    print(f'🌤️  Weather update requested for {location}')

    # Get fresh weather data
    weather_data = weather_manager.get_weather(lat, lon, location, timezone_name)

    if weather_data:
        # Send updated weather data to requesting client
        emit('weather_update', weather_data)

        # Update cache
        cache_key = f'{lat:.4f},{lon:.4f}'
        weather_cache[cache_key] = weather_data
    else:
        emit('weather_error', {'error': 'Failed to fetch weather data'})


@socketio.on('ping')  # type: ignore[misc]
def handle_ping() -> None:
    """Handle ping from client to check connection"""
    emit('pong', {'timestamp': time.time()})


@app.route('/static/<path:filename>')  # type: ignore[misc]
def static_files(filename: str) -> Response:
    """Serve static files"""
    return send_from_directory('static', filename)


@app.route('/sw.js')  # type: ignore[misc]
def service_worker() -> Response:
    """Serve service worker from root for security"""
    response = send_from_directory('static', 'sw.js')
    # Cache control headers
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    # Security headers
    response.headers['Content-Type'] = 'text/javascript'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


@app.route('/manifest.json')  # type: ignore[misc]
def manifest() -> Response:
    """Serve manifest file from root"""
    response = send_from_directory('static', 'manifest.json')
    response.headers['Content-Type'] = 'application/manifest+json'
    return response


if __name__ == '__main__':
    port = int(os.getenv('PORT', '5001'))
    host = os.getenv('HOST', '127.0.0.1')  # Default to localhost, allow override
    socketio.run(app, debug=False, host=host, port=port, allow_unsafe_werkzeug=True)
