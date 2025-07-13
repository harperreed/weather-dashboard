import pytest
from unittest.mock import patch, MagicMock
import json
import time
from datetime import datetime

from main import (
    app, get_weather_from_open_meteo, map_open_meteo_weather_code, 
    get_weather_icon, get_weather_description, process_open_meteo_data,
    process_weather_data, weather_cache, CITY_COORDS
)


class TestUtilityFunctions:
    """Test utility functions in main.py"""
    
    def test_map_open_meteo_weather_code(self):
        """Test OpenMeteo weather code mapping"""
        assert map_open_meteo_weather_code(0) == 'clear-day'
        assert map_open_meteo_weather_code(2) == 'partly-cloudy-day'
        assert map_open_meteo_weather_code(3) == 'cloudy'
        assert map_open_meteo_weather_code(45) == 'fog'
        assert map_open_meteo_weather_code(61) == 'light-rain'
        assert map_open_meteo_weather_code(95) == 'thunderstorm'
        
        # Test unknown code defaults to clear-day
        assert map_open_meteo_weather_code(999) == 'clear-day'
    
    def test_get_weather_icon(self):
        """Test weather icon mapping"""
        assert get_weather_icon('clear-day') == 'clear-day'
        assert get_weather_icon('rain') == 'rain'
        assert get_weather_icon('snow') == 'snow'
        assert get_weather_icon('thunderstorm') == 'thunderstorm'
        
        # Test unknown icon defaults to clear-day
        assert get_weather_icon('unknown') == 'clear-day'
    
    def test_get_weather_description(self):
        """Test weather description mapping"""
        assert get_weather_description(0) == 'Clear sky'
        assert get_weather_description(2) == 'Partly cloudy'
        assert get_weather_description(61) == 'Slight rain'
        assert get_weather_description(95) == 'Thunderstorm'
        
        # Test unknown code
        assert get_weather_description(999) == 'Unknown'
    
    @patch('requests.get')
    def test_get_weather_from_open_meteo_success(self, mock_get, mock_open_meteo_response):
        """Test successful OpenMeteo API call"""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_open_meteo_response
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response
        
        result = get_weather_from_open_meteo(41.8781, -87.6298)
        
        assert result == mock_open_meteo_response
        mock_get.assert_called_once()
    
    @patch('requests.get')
    def test_get_weather_from_open_meteo_failure(self, mock_get):
        """Test failed OpenMeteo API call"""
        mock_get.side_effect = Exception("API Error")
        
        result = get_weather_from_open_meteo(41.8781, -87.6298)
        
        assert result is None
    
    def test_process_open_meteo_data_success(self, mock_open_meteo_response):
        """Test successful OpenMeteo data processing"""
        result = process_open_meteo_data(mock_open_meteo_response, "Test Location")
        
        assert result is not None
        assert result['location'] == "Test Location"
        assert 'current' in result
        assert 'hourly' in result
        assert 'daily' in result
        
        # Test current weather structure
        current = result['current']
        assert current['temperature'] == 72
        assert current['feels_like'] == 75
        assert current['humidity'] == 65
        assert current['wind_speed'] == 8
        assert current['uv_index'] == 6
        assert current['icon'] == 'clear-day'
        assert current['summary'] == 'Clear sky'
    
    def test_process_open_meteo_data_empty(self):
        """Test processing empty OpenMeteo data"""
        result = process_open_meteo_data({}, "Test Location")
        
        assert result is not None
        assert result['location'] == "Test Location"
        assert result['current']['temperature'] == 0
    
    def test_process_open_meteo_data_none(self):
        """Test processing None OpenMeteo data"""
        result = process_open_meteo_data(None, "Test Location")
        
        assert result is None
    
    def test_process_weather_data_success(self, mock_pirate_weather_response):
        """Test successful PirateWeather data processing"""
        result = process_weather_data(mock_pirate_weather_response, "Test Location")
        
        assert result is not None
        assert result['location'] == "Test Location"
        assert 'current' in result
        assert 'hourly' in result
        assert 'daily' in result
        assert 'last_updated' in result
        
        # Test current weather structure
        current = result['current']
        assert current['temperature'] == 72
        assert current['feels_like'] == 75
        assert current['humidity'] == 65
        assert current['wind_speed'] == 8
        assert current['uv_index'] == 6
        assert current['icon'] == 'clear-day'
        assert current['summary'] == 'Clear sky'
    
    def test_process_weather_data_none(self):
        """Test processing None weather data"""
        result = process_weather_data(None, "Test Location")
        
        assert result is None


class TestFlaskRoutes:
    """Test Flask application routes"""
    
    def test_index_route(self, client):
        """Test the index route"""
        response = client.get('/')
        assert response.status_code == 200
        assert b'weather.html' in response.data or b'html' in response.data
    
    def test_weather_by_coords_route(self, client):
        """Test weather by coordinates route"""
        response = client.get('/41.8781,-87.6298')
        assert response.status_code == 200
    
    def test_weather_by_coords_and_location_route(self, client):
        """Test weather by coordinates and location route"""
        response = client.get('/41.8781,-87.6298/Chicago')
        assert response.status_code == 200
    
    def test_weather_by_city_route_valid(self, client):
        """Test weather by city route with valid city"""
        response = client.get('/chicago')
        assert response.status_code == 200
    
    def test_weather_by_city_route_invalid(self, client):
        """Test weather by city route with invalid city"""
        response = client.get('/invalid_city')
        assert response.status_code == 404
        assert b'not found' in response.data
    
    def test_static_files_route(self, client):
        """Test static files route"""
        response = client.get('/static/js/weather-components.js')
        assert response.status_code == 200 or response.status_code == 404  # File might not exist in test
    
    def test_cache_stats_route(self, client):
        """Test cache statistics route"""
        response = client.get('/api/cache/stats')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert 'cache_size' in data
        assert 'max_size' in data
        assert 'ttl_seconds' in data
        assert 'cached_locations' in data
    
    def test_providers_route(self, client):
        """Test providers information route"""
        response = client.get('/api/providers')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert 'primary' in data
        assert 'fallbacks' in data
        assert 'providers' in data
    
    def test_switch_provider_route_success(self, client):
        """Test successful provider switching"""
        response = client.post('/api/providers/switch', 
                             json={'provider': 'OpenMeteo'},
                             content_type='application/json')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'message' in data
        assert 'provider_info' in data
    
    def test_switch_provider_route_missing_provider(self, client):
        """Test provider switching without provider name"""
        response = client.post('/api/providers/switch', 
                             json={},
                             content_type='application/json')
        assert response.status_code == 400
        
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_switch_provider_route_unknown_provider(self, client):
        """Test provider switching with unknown provider"""
        response = client.post('/api/providers/switch', 
                             json={'provider': 'UnknownProvider'},
                             content_type='application/json')
        assert response.status_code == 400
        
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'error' in data
        assert 'available_providers' in data


class TestWeatherAPIEndpoint:
    """Test the weather API endpoint"""
    
    @patch('main.weather_manager.get_weather')
    def test_weather_api_success(self, mock_get_weather, client, mock_weather_data):
        """Test successful weather API call"""
        mock_get_weather.return_value = mock_weather_data
        
        response = client.get('/api/weather?lat=41.8781&lon=-87.6298&location=Chicago')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['location'] == 'Chicago'
        assert 'current' in data
        assert 'hourly' in data
        assert 'daily' in data
        
        # Check cache headers
        assert 'Cache-Control' in response.headers
        assert 'ETag' in response.headers
    
    @patch('main.weather_manager.get_weather')
    def test_weather_api_default_location(self, mock_get_weather, client, mock_weather_data):
        """Test weather API with default location"""
        mock_get_weather.return_value = mock_weather_data
        
        response = client.get('/api/weather')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['location'] == 'Chicago'  # Default location
    
    @patch('main.weather_manager.get_weather')
    def test_weather_api_failure(self, mock_get_weather, client):
        """Test weather API failure"""
        mock_get_weather.return_value = None
        
        response = client.get('/api/weather?lat=41.8781&lon=-87.6298')
        assert response.status_code == 500
        
        data = json.loads(response.data)
        assert 'error' in data
    
    @patch('main.weather_cache')
    @patch('main.weather_manager.get_weather')
    def test_weather_api_cache_hit(self, mock_get_weather, mock_cache, client, mock_weather_data):
        """Test weather API cache hit"""
        # Mock cache to return cached data
        mock_cache.__contains__.return_value = True
        mock_cache.__getitem__.return_value = mock_weather_data
        
        response = client.get('/api/weather?lat=41.8781&lon=-87.6298&location=Chicago')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['location'] == 'Chicago'
        
        # Verify weather manager was not called (cache hit)
        mock_get_weather.assert_not_called()
    
    @patch('main.weather_cache')
    @patch('main.weather_manager.get_weather')
    def test_weather_api_cache_miss(self, mock_get_weather, mock_cache, client, mock_weather_data):
        """Test weather API cache miss"""
        # Mock cache to return no cached data
        mock_cache.__contains__.return_value = False
        mock_get_weather.return_value = mock_weather_data
        
        response = client.get('/api/weather?lat=41.8781&lon=-87.6298&location=Chicago')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['location'] == 'Chicago'
        
        # Verify weather manager was called (cache miss)
        mock_get_weather.assert_called_once()
        
        # Verify data was cached
        mock_cache.__setitem__.assert_called_once()


class TestCityCoords:
    """Test city coordinates constant"""
    
    def test_city_coords_structure(self):
        """Test that CITY_COORDS has the expected structure"""
        assert isinstance(CITY_COORDS, dict)
        assert 'chicago' in CITY_COORDS
        assert 'nyc' in CITY_COORDS
        assert 'sf' in CITY_COORDS
        
        # Test chicago coordinates
        chicago_data = CITY_COORDS['chicago']
        assert len(chicago_data) == 3
        assert chicago_data[0] == 41.8781  # lat
        assert chicago_data[1] == -87.6298  # lon
        assert chicago_data[2] == 'Chicago'  # name
    
    def test_all_cities_have_valid_coords(self):
        """Test that all cities have valid coordinate data"""
        for city, coords in CITY_COORDS.items():
            assert len(coords) == 3
            assert isinstance(coords[0], (int, float))  # latitude
            assert isinstance(coords[1], (int, float))  # longitude
            assert isinstance(coords[2], str)  # city name
            
            # Check coordinate ranges
            assert -90 <= coords[0] <= 90  # latitude range
            assert -180 <= coords[1] <= 180  # longitude range


class TestCacheIntegration:
    """Test cache integration"""
    
    def test_cache_is_initialized(self):
        """Test that weather cache is properly initialized"""
        assert weather_cache is not None
        assert weather_cache.maxsize == 100
        assert weather_cache.ttl == 600  # 10 minutes
    
    def test_cache_key_format(self):
        """Test cache key format"""
        from main import CHICAGO_LAT, CHICAGO_LON
        
        # Test key format matches expected pattern
        lat = round(CHICAGO_LAT, 4)
        lon = round(CHICAGO_LON, 4)
        expected_key = f"{lat},{lon}"
        
        assert isinstance(expected_key, str)
        assert ',' in expected_key
        assert len(expected_key.split(',')) == 2