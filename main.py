import requests
import json
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_compress import Compress
from flask_socketio import SocketIO, emit
import os
from dotenv import load_dotenv
from cachetools import TTLCache
import time
from weather_providers import WeatherProviderManager, OpenMeteoProvider, PirateWeatherProvider

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

# Enable gzip compression for all responses
Compress(app)

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Primary weather API: Open-Meteo (free and accurate)
OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast"

# Fallback API: PirateWeather (if needed)
PIRATE_WEATHER_API_KEY = os.getenv("PIRATE_WEATHER_API_KEY", "YOUR_API_KEY_HERE")
PIRATE_WEATHER_BASE_URL = "https://api.pirateweather.net/forecast"

# Chicago coordinates (as shown in the image)
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298

# CHICAGO_LAT = 37.773972
# CHICAGO_LON = -122.431297

# Cache for weather API responses (10 minutes TTL, max 100 entries)
weather_cache = TTLCache(maxsize=100, ttl=600)  # 600 seconds = 10 minutes

# Initialize weather provider manager
weather_manager = WeatherProviderManager()

# Add OpenMeteo as primary provider
open_meteo = OpenMeteoProvider()
weather_manager.add_provider(open_meteo, is_primary=True)

# Add PirateWeather as fallback provider
pirate_weather_api_key = os.getenv("PIRATE_WEATHER_API_KEY", "YOUR_API_KEY_HERE")
if pirate_weather_api_key and pirate_weather_api_key != "YOUR_API_KEY_HERE":
    pirate_weather = PirateWeatherProvider(pirate_weather_api_key)
    weather_manager.add_provider(pirate_weather)

def get_weather_from_open_meteo(lat, lon):
    """Fetch weather data from Open-Meteo API"""
    try:
        # Build URL with comprehensive weather parameters
        url = f"{OPEN_METEO_BASE_URL}?latitude={lat}&longitude={lon}"
        url += "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index"
        url += "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m"
        url += "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max"
        url += "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch"
        url += "&timezone=auto&forecast_days=7"
        
        print(f"🌤️  Fetching Open-Meteo data from: {url}")
        
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        return response.json()
    except Exception as e:
        print(f"❌ Open-Meteo API error: {str(e)}")
        return None

def map_open_meteo_weather_code(code):
    """Map Open-Meteo weather codes to our icon codes"""
    # WMO Weather interpretation codes
    code_map = {
        0: 'clear-day',           # Clear sky
        1: 'clear-day',           # Mainly clear
        2: 'partly-cloudy-day',   # Partly cloudy
        3: 'cloudy',              # Overcast
        45: 'fog',                # Fog
        48: 'fog',                # Depositing rime fog
        51: 'light-rain',         # Light drizzle
        53: 'rain',               # Moderate drizzle
        55: 'heavy-rain',         # Dense drizzle
        61: 'light-rain',         # Slight rain
        63: 'rain',               # Moderate rain
        65: 'heavy-rain',         # Heavy rain
        71: 'light-snow',         # Slight snow fall
        73: 'snow',               # Moderate snow fall
        75: 'heavy-snow',         # Heavy snow fall
        80: 'light-rain',         # Slight rain showers
        81: 'rain',               # Moderate rain showers
        82: 'heavy-rain',         # Violent rain showers
        85: 'light-snow',         # Slight snow showers
        86: 'heavy-snow',         # Heavy snow showers
        95: 'thunderstorm',       # Thunderstorm
        96: 'thunderstorm',       # Thunderstorm with slight hail
        99: 'thunderstorm',       # Thunderstorm with heavy hail
    }
    
    return code_map.get(code, 'clear-day')

def get_weather_icon(icon_code):
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
        'hail': 'hail'
    }
    return icon_map.get(icon_code, 'clear-day')

def get_weather_data(lat=None, lon=None):
    """Fetch weather data from Pirate Weather API with caching"""
    # Use provided coordinates or default to Chicago
    if lat is None or lon is None:
        lat, lon = CHICAGO_LAT, CHICAGO_LON
    
    # Create cache key from coordinates (rounded to 4 decimal places for better cache hits)
    cache_key = f"{round(lat, 4)},{round(lon, 4)}"
    
    # Check cache first
    if cache_key in weather_cache:
        print(f"Cache hit for {cache_key}")
        return weather_cache[cache_key]
    
    try:
        print(f"Cache miss for {cache_key}, fetching from API...")
        url = f"{BASE_URL}/{PIRATE_WEATHER_API_KEY}/{lat},{lon}"
        params = {
            'units': 'us',  # Fahrenheit
            'exclude': 'minutely,alerts'
        }
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Store in cache
        weather_cache[cache_key] = data
        print(f"Cached weather data for {cache_key}")
        
        return data
    except requests.exceptions.RequestException as e:
        print(f"Error fetching weather data: {e}")
        return None

def process_open_meteo_data(data, location_name=None):
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
            'uv_index': current.get('uv_index', 0),
            'precipitation_rate': current.get('precipitation', 0),
            'precipitation_prob': 0,  # Current doesn't have probability
            'precipitation_type': 'rain' if current.get('precipitation', 0) > 0 else None,
            'icon': map_open_meteo_weather_code(current.get('weather_code', 0)),
            'summary': get_weather_description(current.get('weather_code', 0))
        }
        
        # Process hourly forecast (next 24 hours)
        hourly_forecast = []
        if hourly.get('time'):
            for i in range(min(24, len(hourly['time']))):
                hour_data = {
                    'temp': round(hourly['temperature_2m'][i]),
                    'icon': map_open_meteo_weather_code(hourly['weather_code'][i]),
                    'rain': hourly['precipitation_probability'][i] if i < len(hourly.get('precipitation_probability', [])) else 0,
                    't': datetime.fromisoformat(hourly['time'][i].replace('Z', '+00:00')).strftime('%I%p').lower().replace('0', ''),
                    'desc': get_weather_description(hourly['weather_code'][i])
                }
                hourly_forecast.append(hour_data)
        
        # Process daily forecast
        daily_forecast = []
        if daily.get('time'):
            for i in range(min(7, len(daily['time']))):
                day_data = {
                    'h': round(daily['temperature_2m_max'][i]),
                    'l': round(daily['temperature_2m_min'][i]),
                    'icon': map_open_meteo_weather_code(daily['weather_code'][i]),
                    'd': datetime.fromisoformat(daily['time'][i]).strftime('%a')
                }
                daily_forecast.append(day_data)
        
        return {
            'current': current_weather,
            'hourly': hourly_forecast,
            'daily': daily_forecast,
            'location': location_name or 'Unknown Location'
        }
        
    except Exception as e:
        print(f"❌ Error processing Open-Meteo data: {str(e)}")
        return None

def get_weather_description(weather_code):
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
        99: 'Thunderstorm with heavy hail'
    }
    return descriptions.get(weather_code, 'Unknown')

def process_weather_data(data, location_name=None):
    """Process raw weather data into format needed for the UI"""
    if not data:
        return None
    
    current = data.get('currently', {})
    hourly = data.get('hourly', {}).get('data', [])
    daily = data.get('daily', {}).get('data', [])
    
    # Current weather
    current_weather = {
        'temperature': round(current.get('temperature', 0)),
        'feels_like': round(current.get('apparentTemperature', 0)),
        'icon': get_weather_icon(current.get('icon', 'clear-day')),
        'summary': current.get('summary', 'Clear'),
        'humidity': round(current.get('humidity', 0) * 100),
        'wind_speed': round(current.get('windSpeed', 0)),
        'pressure': round(current.get('pressure', 0)),
        'visibility': round(current.get('visibility', 0)),
        'uv_index': round(current.get('uvIndex', 0)),
        'precipitation_prob': round(current.get('precipProbability', 0) * 100),
        'precipitation_rate': round(current.get('precipIntensity', 0), 2),
        'precipitation_type': current.get('precipType', 'none')
    }
    
    # Hourly forecast (next 12 hours only for better performance)
    hourly_forecast = []
    for hour in hourly[:12]:
        time = datetime.fromtimestamp(hour['time'])
        hourly_forecast.append({
            't': time.strftime('%I%p').lower().lstrip('0'),  # compressed field names
            'temp': round(hour.get('temperature', 0)),
            'icon': get_weather_icon(hour.get('icon', 'clear-day')),
            'rain': round(hour.get('precipProbability', 0) * 100),
            'desc': hour.get('summary', '')[:30]  # truncate long descriptions
        })
    
    # Daily forecast (next 5 days for better performance)
    daily_forecast = []
    for day in daily[:5]:
        date = datetime.fromtimestamp(day['time'])
        daily_forecast.append({
            'd': date.strftime('%a').upper(),  # compressed field names
            'h': round(day.get('temperatureHigh', 0)),
            'l': round(day.get('temperatureLow', 0)),
            'icon': get_weather_icon(day.get('icon', 'clear-day')),
            'rain': round(day.get('precipProbability', 0) * 100)
            # removed summary and date to reduce payload
        })
    
    return {
        'current': current_weather,
        'hourly': hourly_forecast,
        'daily': daily_forecast,
        'location': location_name or 'Unknown Location',
        'last_updated': datetime.now().strftime('%I:%M %p')
    }

# Common city shortcuts
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

@app.route('/')
def index():
    """Main weather page"""
    return render_template('weather.html')

@app.route('/<float:lat>,<float:lon>', methods=['GET'])
def weather_by_coords(lat, lon):
    """Weather page for specific coordinates"""
    return render_template('weather.html')

@app.route('/<float:lat>,<float:lon>/<location>')
def weather_by_coords_and_location(lat, lon, location):
    """Weather page for specific coordinates and location name"""
    return render_template('weather.html')

@app.route('/<city>')
def weather_by_city(city):
    """Weather page for common cities"""
    city_lower = city.lower()
    if city_lower in CITY_COORDS:
        return render_template('weather.html')
    else:
        return f"City '{city}' not found. Available cities: {', '.join(CITY_COORDS.keys())}", 404

@app.route('/api/weather')
def weather_api():
    """API endpoint for weather data"""
    # Get lat/lon from URL parameters
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    location_name = request.args.get('location', 'Chicago')
    
    # Default to Chicago if no coordinates provided
    if not lat or not lon:
        lat = CHICAGO_LAT
        lon = CHICAGO_LON
    
    # Create cache key
    cache_key = f"{lat:.4f},{lon:.4f}"
    
    # Check cache first
    if cache_key in weather_cache:
        print(f"📦 Returning cached data for {cache_key}")
        cached_data = weather_cache[cache_key]
        cached_data['location'] = location_name  # Update location name
        response = jsonify(cached_data)
        response.headers['Cache-Control'] = 'public, max-age=300'
        response.headers['ETag'] = f'"{hash(str(lat) + str(lon) + str(int(time.time() // 300)))}"'
        return response
    
    # Use weather provider manager to get data
    print(f"🌤️  Fetching weather for {location_name} using provider system")
    processed_data = weather_manager.get_weather(lat, lon, location_name)
    
    if processed_data:
        # Cache the result
        weather_cache[cache_key] = processed_data
        print(f"💾 Cached weather data for {cache_key}")
        
        response = jsonify(processed_data)
        response.headers['Cache-Control'] = 'public, max-age=300'
        response.headers['ETag'] = f'"{hash(str(lat) + str(lon) + str(int(time.time() // 300)))}"'
        return response
    else:
        return jsonify({'error': 'Failed to fetch weather data from all sources'}), 500

@app.route('/api/cache/stats')
def cache_stats():
    """API endpoint for cache statistics"""
    return jsonify({
        'cache_size': len(weather_cache),
        'max_size': weather_cache.maxsize,
        'ttl_seconds': weather_cache.ttl,
        'cached_locations': list(weather_cache.keys())
    })

@app.route('/api/providers')
def get_providers():
    """API endpoint to get weather provider information"""
    return jsonify(weather_manager.get_provider_info())

@app.route('/api/providers/switch', methods=['POST'])
def switch_provider():
    """API endpoint to switch weather provider"""
    data = request.get_json()
    provider_name = data.get('provider')
    
    if not provider_name:
        return jsonify({'error': 'Provider name is required'}), 400
    
    success = weather_manager.switch_provider(provider_name)
    
    if success:
        # Clear cache when switching providers
        weather_cache.clear()
        return jsonify({
            'success': True,
            'message': f'Switched to {provider_name} provider',
            'provider_info': weather_manager.get_provider_info()
        })
    else:
        return jsonify({
            'success': False,
            'error': f'Provider {provider_name} not found',
            'available_providers': list(weather_manager.providers.keys())
        }), 400

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files"""
    return send_from_directory('static', filename)

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5001, allow_unsafe_werkzeug=True)
