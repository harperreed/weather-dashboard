import pytest
import json
from unittest.mock import MagicMock, patch
from datetime import datetime
import requests

from weather_providers import (
    WeatherProvider, 
    OpenMeteoProvider, 
    PirateWeatherProvider, 
    WeatherProviderManager
)


class TestWeatherProvider:
    """Test the abstract WeatherProvider base class"""
    
    def test_weather_provider_abstract_methods(self):
        """Test that WeatherProvider cannot be instantiated directly"""
        with pytest.raises(TypeError):
            WeatherProvider("TestProvider")
    
    def test_weather_provider_info(self):
        """Test provider info method"""
        # Create a concrete implementation for testing
        class TestProvider(WeatherProvider):
            def fetch_weather_data(self, lat, lon):
                return {}
            
            def process_weather_data(self, raw_data, location_name=None):
                return {}
        
        provider = TestProvider("TestProvider")
        info = provider.get_provider_info()
        
        assert info['name'] == "TestProvider"
        assert info['timeout'] == 10
        assert 'description' in info


class TestOpenMeteoProvider:
    """Test the OpenMeteo weather provider"""
    
    def test_init(self):
        """Test OpenMeteo provider initialization"""
        provider = OpenMeteoProvider()
        assert provider.name == "OpenMeteo"
        assert provider.base_url == "https://api.open-meteo.com/v1/forecast"
        assert provider.timeout == 10
    
    @patch('requests.get')
    def test_fetch_weather_data_success(self, mock_get, mock_open_meteo_response):
        """Test successful weather data fetch from OpenMeteo"""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_open_meteo_response
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response
        
        provider = OpenMeteoProvider()
        result = provider.fetch_weather_data(41.8781, -87.6298)
        
        assert result == mock_open_meteo_response
        mock_get.assert_called_once()
        
        # Check that the request was made with correct parameters
        call_args = mock_get.call_args
        assert call_args[0][0] == provider.base_url
        assert call_args[1]['params']['latitude'] == 41.8781
        assert call_args[1]['params']['longitude'] == -87.6298
    
    @patch('requests.get')
    def test_fetch_weather_data_failure(self, mock_get):
        """Test failed weather data fetch from OpenMeteo"""
        mock_get.side_effect = requests.exceptions.RequestException("API Error")
        
        provider = OpenMeteoProvider()
        result = provider.fetch_weather_data(41.8781, -87.6298)
        
        assert result is None
    
    def test_process_weather_data_success(self, mock_open_meteo_response):
        """Test successful weather data processing"""
        provider = OpenMeteoProvider()
        result = provider.process_weather_data(mock_open_meteo_response, "Test Location")
        
        assert result is not None
        assert result['location'] == "Test Location"
        assert result['provider'] == "OpenMeteo"
        assert 'current' in result
        assert 'hourly' in result
        assert 'daily' in result
        
        # Test current weather data
        current = result['current']
        assert current['temperature'] == 72
        assert current['feels_like'] == 75
        assert current['humidity'] == 65
        assert current['wind_speed'] == 8
        assert current['uv_index'] == 6
        assert current['icon'] == 'clear-day'
        assert current['summary'] == 'Clear sky'
    
    def test_process_weather_data_empty(self):
        """Test processing with empty data"""
        provider = OpenMeteoProvider()
        result = provider.process_weather_data({}, "Test Location")
        
        # Empty data should return None, not an empty result
        assert result is None
    
    def test_process_weather_data_none(self):
        """Test processing with None data"""
        provider = OpenMeteoProvider()
        result = provider.process_weather_data(None, "Test Location")
        
        assert result is None
    
    def test_map_weather_code(self):
        """Test weather code mapping"""
        provider = OpenMeteoProvider()
        
        # Test known codes
        assert provider._map_weather_code(0) == 'clear-day'
        assert provider._map_weather_code(2) == 'partly-cloudy-day'
        assert provider._map_weather_code(3) == 'cloudy'
        assert provider._map_weather_code(61) == 'light-rain'
        assert provider._map_weather_code(95) == 'thunderstorm'
        
        # Test unknown code
        assert provider._map_weather_code(999) == 'clear-day'
    
    def test_get_weather_description(self):
        """Test weather description mapping"""
        provider = OpenMeteoProvider()
        
        # Test known codes
        assert provider._get_weather_description(0) == 'Clear sky'
        assert provider._get_weather_description(2) == 'Partly cloudy'
        assert provider._get_weather_description(61) == 'Slight rain'
        assert provider._get_weather_description(95) == 'Thunderstorm'
        
        # Test unknown code
        assert provider._get_weather_description(999) == 'Unknown'


class TestPirateWeatherProvider:
    """Test the PirateWeather provider"""
    
    def test_init(self):
        """Test PirateWeather provider initialization"""
        provider = PirateWeatherProvider("test_api_key")
        assert provider.name == "PirateWeather"
        assert provider.api_key == "test_api_key"
        assert provider.base_url == "https://api.pirateweather.net/forecast"
    
    @patch('requests.get')
    def test_fetch_weather_data_success(self, mock_get, mock_pirate_weather_response):
        """Test successful weather data fetch from PirateWeather"""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_pirate_weather_response
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response
        
        provider = PirateWeatherProvider("test_api_key")
        result = provider.fetch_weather_data(41.8781, -87.6298)
        
        assert result == mock_pirate_weather_response
        mock_get.assert_called_once()
        
        # Check the URL was constructed correctly
        call_args = mock_get.call_args
        expected_url = f"{provider.base_url}/test_api_key/41.8781,-87.6298"
        assert call_args[0][0] == expected_url
    
    def test_fetch_weather_data_no_api_key(self):
        """Test fetch with no API key"""
        provider = PirateWeatherProvider("YOUR_API_KEY_HERE")
        result = provider.fetch_weather_data(41.8781, -87.6298)
        
        assert result is None
    
    def test_fetch_weather_data_empty_api_key(self):
        """Test fetch with empty API key"""
        provider = PirateWeatherProvider("")
        result = provider.fetch_weather_data(41.8781, -87.6298)
        
        assert result is None
    
    @patch('requests.get')
    def test_fetch_weather_data_failure(self, mock_get):
        """Test failed weather data fetch from PirateWeather"""
        mock_get.side_effect = requests.exceptions.RequestException("API Error")
        
        provider = PirateWeatherProvider("test_api_key")
        result = provider.fetch_weather_data(41.8781, -87.6298)
        
        assert result is None
    
    def test_process_weather_data_success(self, mock_pirate_weather_response):
        """Test successful weather data processing"""
        provider = PirateWeatherProvider("test_api_key")
        result = provider.process_weather_data(mock_pirate_weather_response, "Test Location")
        
        assert result is not None
        assert result['location'] == "Test Location"
        assert result['provider'] == "PirateWeather"
        assert 'current' in result
        assert 'hourly' in result
        assert 'daily' in result
        
        # Test current weather data
        current = result['current']
        assert current['temperature'] == 72
        assert current['feels_like'] == 75
        assert current['humidity'] == 65
        assert current['wind_speed'] == 8
        assert current['uv_index'] == 6
        assert current['icon'] == 'clear-day'
        assert current['summary'] == 'Clear sky'
    
    def test_process_weather_data_empty(self):
        """Test processing with empty data"""
        provider = PirateWeatherProvider("test_api_key")
        result = provider.process_weather_data({}, "Test Location")
        
        # Empty data should return None, not an empty result
        assert result is None
    
    def test_process_weather_data_none(self):
        """Test processing with None data"""
        provider = PirateWeatherProvider("test_api_key")
        result = provider.process_weather_data(None, "Test Location")
        
        assert result is None
    
    def test_map_icon_code(self):
        """Test icon code mapping"""
        provider = PirateWeatherProvider("test_api_key")
        
        # Test known codes
        assert provider._map_icon_code('clear-day') == 'clear-day'
        assert provider._map_icon_code('rain') == 'rain'
        assert provider._map_icon_code('snow') == 'snow'
        assert provider._map_icon_code('tornado') == 'wind'
        
        # Test unknown code
        assert provider._map_icon_code('unknown') == 'clear-day'


class TestWeatherProviderManager:
    """Test the WeatherProviderManager"""
    
    def test_init(self):
        """Test manager initialization"""
        manager = WeatherProviderManager()
        assert manager.providers == {}
        assert manager.primary_provider is None
        assert manager.fallback_providers == []
    
    def test_add_provider_primary(self):
        """Test adding a primary provider"""
        manager = WeatherProviderManager()
        provider = OpenMeteoProvider()
        
        manager.add_provider(provider, is_primary=True)
        
        assert provider.name in manager.providers
        assert manager.primary_provider == provider.name
        assert provider.name not in manager.fallback_providers
    
    def test_add_provider_fallback(self):
        """Test adding a fallback provider"""
        manager = WeatherProviderManager()
        provider = OpenMeteoProvider()
        
        manager.add_provider(provider, is_primary=False)
        
        assert provider.name in manager.providers
        assert manager.primary_provider is None
        assert provider.name in manager.fallback_providers
    
    def test_set_primary_provider(self):
        """Test setting primary provider"""
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)
        
        # Switch primary
        manager.set_primary_provider(provider2.name)
        
        assert manager.primary_provider == provider2.name
        assert provider1.name in manager.fallback_providers
        assert provider2.name not in manager.fallback_providers
    
    def test_set_primary_provider_unknown(self):
        """Test setting unknown provider as primary"""
        manager = WeatherProviderManager()
        
        with pytest.raises(ValueError):
            manager.set_primary_provider("UnknownProvider")
    
    @patch.object(OpenMeteoProvider, 'get_weather')
    def test_get_weather_primary_success(self, mock_get_weather, mock_weather_data):
        """Test successful weather fetch from primary provider"""
        mock_get_weather.return_value = mock_weather_data
        
        manager = WeatherProviderManager()
        provider = OpenMeteoProvider()
        manager.add_provider(provider, is_primary=True)
        
        result = manager.get_weather(41.8781, -87.6298, "Test Location")
        
        assert result == mock_weather_data
        mock_get_weather.assert_called_once_with(41.8781, -87.6298, "Test Location")
    
    @patch.object(PirateWeatherProvider, 'get_weather')
    @patch.object(OpenMeteoProvider, 'get_weather')
    def test_get_weather_fallback_success(self, mock_open_meteo, mock_pirate_weather, mock_weather_data):
        """Test successful weather fetch from fallback provider"""
        mock_open_meteo.return_value = None  # Primary fails
        mock_pirate_weather.return_value = mock_weather_data  # Fallback succeeds
        
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)
        
        result = manager.get_weather(41.8781, -87.6298, "Test Location")
        
        assert result == mock_weather_data
        mock_open_meteo.assert_called_once()
        mock_pirate_weather.assert_called_once()
    
    @patch.object(PirateWeatherProvider, 'get_weather')
    @patch.object(OpenMeteoProvider, 'get_weather')
    def test_get_weather_all_fail(self, mock_open_meteo, mock_pirate_weather):
        """Test weather fetch when all providers fail"""
        mock_open_meteo.return_value = None
        mock_pirate_weather.return_value = None
        
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)
        
        result = manager.get_weather(41.8781, -87.6298, "Test Location")
        
        assert result is None
        mock_open_meteo.assert_called_once()
        mock_pirate_weather.assert_called_once()
    
    def test_get_provider_info(self):
        """Test getting provider information"""
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)
        
        info = manager.get_provider_info()
        
        assert info['primary'] == provider1.name
        assert info['fallbacks'] == [provider2.name]
        assert provider1.name in info['providers']
        assert provider2.name in info['providers']
    
    def test_switch_provider_success(self):
        """Test successful provider switching"""
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)
        
        result = manager.switch_provider(provider2.name)
        
        assert result is True
        assert manager.primary_provider == provider2.name
        assert provider1.name in manager.fallback_providers
    
    def test_switch_provider_unknown(self):
        """Test switching to unknown provider"""
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        manager.add_provider(provider1, is_primary=True)
        
        result = manager.switch_provider("UnknownProvider")
        
        assert result is False
        assert manager.primary_provider == provider1.name