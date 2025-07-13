import pytest
import os
import sys
from unittest.mock import patch, MagicMock

# Add the project root to the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from weather_providers import WeatherProviderManager, OpenMeteoProvider, PirateWeatherProvider


@pytest.fixture
def flask_app():
    """Create a Flask app instance for testing"""
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    return app


@pytest.fixture
def client(flask_app):
    """Create a test client for the Flask app"""
    return flask_app.test_client()


@pytest.fixture
def app_context(flask_app):
    """Create an application context for testing"""
    with flask_app.app_context():
        yield flask_app


@pytest.fixture
def mock_weather_data():
    """Mock weather data for testing"""
    return {
        'current': {
            'temperature': 72,
            'feels_like': 75,
            'humidity': 65,
            'wind_speed': 8,
            'uv_index': 6,
            'precipitation_rate': 0,
            'precipitation_prob': 10,
            'precipitation_type': None,
            'icon': 'clear-day',
            'summary': 'Clear sky'
        },
        'hourly': [
            {
                'temp': 72,
                'icon': 'clear-day',
                'rain': 0,
                't': '12p',
                'desc': 'Clear'
            },
            {
                'temp': 75,
                'icon': 'clear-day',
                'rain': 0,
                't': '1p',
                'desc': 'Clear'
            }
        ],
        'daily': [
            {
                'h': 77,
                'l': 65,
                'icon': 'clear-day',
                'd': 'Mon'
            },
            {
                'h': 75,
                'l': 63,
                'icon': 'partly-cloudy-day',
                'd': 'Tue'
            }
        ],
        'location': 'Test Location',
        'provider': 'OpenMeteo'
    }


@pytest.fixture
def mock_open_meteo_response():
    """Mock OpenMeteo API response"""
    return {
        'current': {
            'temperature_2m': 72.0,
            'apparent_temperature': 75.0,
            'relative_humidity_2m': 65,
            'wind_speed_10m': 8.0,
            'uv_index': 6,
            'precipitation': 0.0,
            'weather_code': 0
        },
        'hourly': {
            'time': [
                '2024-01-01T12:00:00Z',
                '2024-01-01T13:00:00Z'
            ],
            'temperature_2m': [72.0, 75.0],
            'weather_code': [0, 0],
            'precipitation_probability': [0, 0]
        },
        'daily': {
            'time': [
                '2024-01-01',
                '2024-01-02'
            ],
            'temperature_2m_max': [77.0, 75.0],
            'temperature_2m_min': [65.0, 63.0],
            'weather_code': [0, 2]
        }
    }


@pytest.fixture
def mock_pirate_weather_response():
    """Mock PirateWeather API response"""
    return {
        'currently': {
            'temperature': 72,
            'apparentTemperature': 75,
            'humidity': 0.65,
            'windSpeed': 8,
            'uvIndex': 6,
            'precipIntensity': 0,
            'precipProbability': 0.1,
            'precipType': None,
            'icon': 'clear-day',
            'summary': 'Clear sky'
        },
        'hourly': {
            'data': [
                {
                    'time': 1704110400,  # 2024-01-01T12:00:00Z
                    'temperature': 72,
                    'icon': 'clear-day',
                    'precipProbability': 0,
                    'summary': 'Clear'
                },
                {
                    'time': 1704114000,  # 2024-01-01T13:00:00Z
                    'temperature': 75,
                    'icon': 'clear-day',
                    'precipProbability': 0,
                    'summary': 'Clear'
                }
            ]
        },
        'daily': {
            'data': [
                {
                    'time': 1704067200,  # 2024-01-01
                    'temperatureHigh': 77,
                    'temperatureLow': 65,
                    'icon': 'clear-day',
                    'precipProbability': 0
                },
                {
                    'time': 1704153600,  # 2024-01-02
                    'temperatureHigh': 75,
                    'temperatureLow': 63,
                    'icon': 'partly-cloudy-day',
                    'precipProbability': 0
                }
            ]
        }
    }


@pytest.fixture
def weather_provider_manager():
    """Create a WeatherProviderManager instance for testing"""
    manager = WeatherProviderManager()
    open_meteo = OpenMeteoProvider()
    manager.add_provider(open_meteo, is_primary=True)
    return manager


@pytest.fixture
def mock_requests_get():
    """Mock requests.get for testing API calls"""
    with patch('requests.get') as mock_get:
        yield mock_get


@pytest.fixture
def mock_cache():
    """Mock the weather cache"""
    with patch('main.weather_cache') as mock_cache:
        mock_cache.clear()
        yield mock_cache