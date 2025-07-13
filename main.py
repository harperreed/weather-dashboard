import requests
import json
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from flask_compress import Compress
import os
from dotenv import load_dotenv
from cachetools import TTLCache
import time

load_dotenv()

app = Flask(__name__)

# Enable gzip compression for all responses
Compress(app)

# You'll need to get your API key from https://pirateweather.net/
PIRATE_WEATHER_API_KEY = os.getenv("PIRATE_WEATHER_API_KEY", "YOUR_API_KEY_HERE")
BASE_URL = "https://api.pirateweather.net/forecast"

# Chicago coordinates (as shown in the image)
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298

# CHICAGO_LAT = 37.773972
# CHICAGO_LON = -122.431297

# Cache for weather API responses (10 minutes TTL, max 100 entries)
weather_cache = TTLCache(maxsize=100, ttl=600)  # 600 seconds = 10 minutes

def get_weather_icon(icon_code):
    """Convert weather icon codes to emoji or icon classes"""
    icon_map = {
        'clear-day': '☀️',
        'clear-night': '🌙',
        'rain': '🌧️',
        'heavy-rain': '🌧️',
        'light-rain': '🌦️',
        'snow': '❄️',
        'heavy-snow': '🌨️',
        'light-snow': '🌨️',
        'sleet': '🌨️',
        'wind': '💨',
        'fog': '🌫️',
        'cloudy': '☁️',
        'partly-cloudy-day': '⛅',
        'partly-cloudy-night': '☁️',
        'thunderstorm': '⛈️',
        'hail': '🌨️'
    }
    return icon_map.get(icon_code, '☀️')

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

@app.route('/')
def index():
    """Main weather page"""
    return render_template('weather.html')

@app.route('/<float:lat>,<float:lon>')
def weather_by_coords(lat, lon):
    """Weather page for specific coordinates"""
    return render_template('weather.html')

@app.route('/<float:lat>,<float:lon>/<location>')
def weather_by_coords_and_location(lat, lon, location):
    """Weather page for specific coordinates and location name"""
    return render_template('weather.html')

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
    
    raw_data = get_weather_data(lat, lon)
    processed_data = process_weather_data(raw_data, location_name)
    
    if processed_data:
        response = jsonify(processed_data)
        # Cache for 5 minutes on client side
        response.headers['Cache-Control'] = 'public, max-age=300'
        response.headers['ETag'] = f'"{hash(str(lat) + str(lon) + str(int(time.time() // 300)))}"'
        return response
    else:
        return jsonify({'error': 'Failed to fetch weather data'}), 500

@app.route('/api/cache/stats')
def cache_stats():
    """API endpoint for cache statistics"""
    return jsonify({
        'cache_size': len(weather_cache),
        'max_size': weather_cache.maxsize,
        'ttl_seconds': weather_cache.ttl,
        'cached_locations': list(weather_cache.keys())
    })

if __name__ == '__main__':
    app.run(debug=True)
