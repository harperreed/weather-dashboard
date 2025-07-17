import os
import sys
from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from flask.testing import FlaskClient


# Add the project root to the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from weather_providers import OpenMeteoProvider, WeatherProviderManager


@pytest.fixture  # type: ignore[misc]
def flask_app() -> Flask:
    """Create a Flask app instance for testing"""
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    return app


@pytest.fixture  # type: ignore[misc]
def client(flask_app: Flask) -> FlaskClient:
    """Create a test client for the Flask app"""
    return flask_app.test_client()


@pytest.fixture  # type: ignore[misc]
def app_context(flask_app: Flask) -> Generator[Flask, None, None]:
    """Create an application context for testing"""
    with flask_app.app_context():
        yield flask_app


@pytest.fixture  # type: ignore[misc]
def mock_weather_data() -> dict[str, Any]:
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
            'summary': 'Clear sky',
        },
        'hourly': [
            {'temp': 72, 'icon': 'clear-day', 'rain': 0, 't': '12p', 'desc': 'Clear'},
            {'temp': 75, 'icon': 'clear-day', 'rain': 0, 't': '1p', 'desc': 'Clear'},
        ],
        'daily': [
            {'h': 77, 'l': 65, 'icon': 'clear-day', 'd': 'Mon'},
            {'h': 75, 'l': 63, 'icon': 'partly-cloudy-day', 'd': 'Tue'},
        ],
        'location': 'Test Location',
        'provider': 'OpenMeteo',
    }


@pytest.fixture  # type: ignore[misc]
def mock_open_meteo_response() -> dict[str, Any]:
    """Mock OpenMeteo API response"""
    return {
        'current': {
            'temperature_2m': 72.0,
            'apparent_temperature': 75.0,
            'relative_humidity_2m': 65,
            'wind_speed_10m': 8.0,
            'uv_index': 6,
            'precipitation': 0.0,
            'weather_code': 0,
        },
        'hourly': {
            'time': ['2024-01-01T12:00:00Z', '2024-01-01T13:00:00Z'],
            'temperature_2m': [72.0, 75.0],
            'weather_code': [0, 0],
            'precipitation_probability': [0, 0],
        },
        'daily': {
            'time': ['2024-01-01', '2024-01-02'],
            'temperature_2m_max': [77.0, 75.0],
            'temperature_2m_min': [65.0, 63.0],
            'weather_code': [0, 2],
        },
    }


@pytest.fixture  # type: ignore[misc]
def mock_pirate_weather_response() -> dict[str, Any]:
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
            'summary': 'Clear sky',
        },
        'hourly': {
            'data': [
                {
                    'time': 1704110400,  # 2024-01-01T12:00:00Z
                    'temperature': 72,
                    'icon': 'clear-day',
                    'precipProbability': 0,
                    'summary': 'Clear',
                },
                {
                    'time': 1704114000,  # 2024-01-01T13:00:00Z
                    'temperature': 75,
                    'icon': 'clear-day',
                    'precipProbability': 0,
                    'summary': 'Clear',
                },
            ]
        },
        'daily': {
            'data': [
                {
                    'time': 1704067200,  # 2024-01-01
                    'temperatureHigh': 77,
                    'temperatureLow': 65,
                    'icon': 'clear-day',
                    'precipProbability': 0,
                },
                {
                    'time': 1704153600,  # 2024-01-02
                    'temperatureHigh': 75,
                    'temperatureLow': 63,
                    'icon': 'partly-cloudy-day',
                    'precipProbability': 0,
                },
            ]
        },
    }


@pytest.fixture  # type: ignore[misc]
def weather_provider_manager() -> WeatherProviderManager:
    """Create a WeatherProviderManager instance for testing"""
    manager = WeatherProviderManager()
    open_meteo = OpenMeteoProvider()
    manager.add_provider(open_meteo, is_primary=True)
    return manager


@pytest.fixture  # type: ignore[misc]
def mock_requests_get() -> Generator[MagicMock, None, None]:
    """Mock requests.get for testing API calls"""
    with patch('requests.get') as mock_get:
        yield mock_get


@pytest.fixture  # type: ignore[misc]
def mock_cache() -> Generator[MagicMock, None, None]:
    """Mock the weather cache"""
    with patch('main.weather_cache') as mock_cache:
        mock_cache.clear()
        yield mock_cache
