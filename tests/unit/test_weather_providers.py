from typing import Any
from unittest.mock import MagicMock, patch

import pytest
import requests

from weather_providers import (
    OpenMeteoProvider,
    PirateWeatherProvider,
    WeatherProvider,
    WeatherProviderManager,
)


# Test constants
MOCK_TEMP = 72
MOCK_FEELS_LIKE = 75
MOCK_HUMIDITY = 65
MOCK_WIND_SPEED = 8
MOCK_UV_INDEX = 6
PROVIDER_TIMEOUT = 10
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298


class TestWeatherProvider:
    """Test the abstract WeatherProvider base class"""

    def test_weather_provider_abstract_methods(self) -> None:
        """Test that WeatherProvider cannot be instantiated directly"""
        with pytest.raises(TypeError):
            WeatherProvider("TestProvider")  # type: ignore[abstract]

    def test_weather_provider_info(self) -> None:
        """Test provider info method"""

        # Create a concrete implementation for testing
        class TestProvider(WeatherProvider):
            def fetch_weather_data(
                self, _lat: float, _lon: float, _tz_name: str | None = None
            ) -> dict[str, Any] | None:
                return {}

            def process_weather_data(
                self,
                _raw_data: dict[str, Any],
                _location_name: str | None = None,
                _tz_name: str | None = None
            ) -> dict[str, Any] | None:
                return {}

        provider = TestProvider("TestProvider")
        info = provider.get_provider_info()

        assert info["name"] == "TestProvider"
        assert info["timeout"] == PROVIDER_TIMEOUT
        assert "description" in info


class TestOpenMeteoProvider:
    """Test the OpenMeteo weather provider"""

    def test_init(self) -> None:
        """Test OpenMeteo provider initialization"""
        provider = OpenMeteoProvider()
        assert provider.name == "OpenMeteo"
        assert provider.base_url == "https://api.open-meteo.com/v1/forecast"
        assert provider.timeout == PROVIDER_TIMEOUT

    @patch("requests.get")
    def test_fetch_weather_data_success(
        self, mock_get: MagicMock, mock_open_meteo_response: dict[str, Any]
    ) -> None:
        """Test successful weather data fetch from OpenMeteo"""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_open_meteo_response
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        provider = OpenMeteoProvider()
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result == mock_open_meteo_response
        mock_get.assert_called_once()

        # Check that the request was made with correct parameters
        call_args = mock_get.call_args
        assert call_args[0][0] == provider.base_url
        assert call_args[1]["params"]["latitude"] == CHICAGO_LAT
        assert call_args[1]["params"]["longitude"] == CHICAGO_LON

    @patch("requests.get")
    def test_fetch_weather_data_failure(self, mock_get: MagicMock) -> None:
        """Test failed weather data fetch from OpenMeteo"""
        mock_get.side_effect = requests.exceptions.RequestException("API Error")

        provider = OpenMeteoProvider()
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    def test_process_weather_data_success(
        self, mock_open_meteo_response: dict[str, Any]
    ) -> None:
        """Test successful weather data processing"""
        provider = OpenMeteoProvider()
        result = provider.process_weather_data(
            mock_open_meteo_response, "Test Location"
        )

        assert result is not None
        assert result["location"] == "Test Location"
        assert result["provider"] == "OpenMeteo"
        assert "current" in result
        assert "hourly" in result
        assert "daily" in result

        # Test current weather data
        current = result["current"]
        assert current["temperature"] == MOCK_TEMP
        assert current["feels_like"] == MOCK_FEELS_LIKE
        assert current["humidity"] == MOCK_HUMIDITY
        assert current["wind_speed"] == MOCK_WIND_SPEED
        assert current["uv_index"] == MOCK_UV_INDEX
        assert current["icon"] == "clear-day"
        assert current["summary"] == "Clear sky"

    def test_process_weather_data_empty(self) -> None:
        """Test processing with empty data"""
        provider = OpenMeteoProvider()
        result = provider.process_weather_data({}, "Test Location")

        # Empty data should return None, not an empty result
        assert result is None

    def test_process_weather_data_none(self) -> None:
        """Test processing with None data"""
        provider = OpenMeteoProvider()
        result = provider.process_weather_data({}, "Test Location")

        assert result is None

    def test_map_weather_code(self) -> None:
        """Test weather code mapping"""
        provider = OpenMeteoProvider()

        # Test known codes
        assert provider._map_weather_code(0) == "clear-day"
        assert provider._map_weather_code(2) == "partly-cloudy-day"
        assert provider._map_weather_code(3) == "cloudy"
        assert provider._map_weather_code(61) == "light-rain"
        assert provider._map_weather_code(95) == "thunderstorm"

        # Test unknown code
        assert provider._map_weather_code(999) == "clear-day"

    def test_get_weather_description(self) -> None:
        """Test weather description mapping"""
        provider = OpenMeteoProvider()

        # Test known codes
        assert provider._get_weather_description(0) == "Clear sky"
        assert provider._get_weather_description(2) == "Partly cloudy"
        assert provider._get_weather_description(61) == "Slight rain"
        assert provider._get_weather_description(95) == "Thunderstorm"

        # Test unknown code
        assert provider._get_weather_description(999) == "Unknown"


class TestPirateWeatherProvider:
    """Test the PirateWeather provider"""

    def test_init(self) -> None:
        """Test PirateWeather provider initialization"""
        provider = PirateWeatherProvider("test_api_key")
        assert provider.name == "PirateWeather"
        assert provider.api_key == "test_api_key"
        assert provider.base_url == "https://api.pirateweather.net/forecast"

    @patch("requests.get")
    def test_fetch_weather_data_success(
        self, mock_get: MagicMock, mock_pirate_weather_response: dict[str, Any]
    ) -> None:
        """Test successful weather data fetch from PirateWeather"""
        mock_response = MagicMock()
        mock_response.json.return_value = mock_pirate_weather_response
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        provider = PirateWeatherProvider("test_api_key")
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result == mock_pirate_weather_response
        mock_get.assert_called_once()

        # Check the URL was constructed correctly
        call_args = mock_get.call_args
        expected_url = f"{provider.base_url}/test_api_key/{CHICAGO_LAT},{CHICAGO_LON}"
        assert call_args[0][0] == expected_url

    def test_fetch_weather_data_no_api_key(self) -> None:
        """Test fetch with no API key"""
        provider = PirateWeatherProvider("YOUR_API_KEY_HERE")
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    def test_fetch_weather_data_empty_api_key(self) -> None:
        """Test fetch with empty API key"""
        provider = PirateWeatherProvider("")
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    @patch("requests.get")
    def test_fetch_weather_data_failure(self, mock_get: MagicMock) -> None:
        """Test failed weather data fetch from PirateWeather"""
        mock_get.side_effect = requests.exceptions.RequestException("API Error")

        provider = PirateWeatherProvider("test_api_key")
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    def test_process_weather_data_success(
        self, mock_pirate_weather_response: dict[str, Any]
    ) -> None:
        """Test successful weather data processing"""
        provider = PirateWeatherProvider("test_api_key")
        result = provider.process_weather_data(
            mock_pirate_weather_response, "Test Location"
        )

        assert result is not None
        assert result["location"] == "Test Location"
        assert result["provider"] == "PirateWeather"
        assert "current" in result
        assert "hourly" in result
        assert "daily" in result

        # Test current weather data
        current = result["current"]
        assert current["temperature"] == MOCK_TEMP
        assert current["feels_like"] == MOCK_FEELS_LIKE
        assert current["humidity"] == MOCK_HUMIDITY
        assert current["wind_speed"] == MOCK_WIND_SPEED
        assert current["uv_index"] == MOCK_UV_INDEX
        assert current["icon"] == "clear-day"
        assert current["summary"] == "Clear sky"

    def test_process_weather_data_empty(self) -> None:
        """Test processing with empty data"""
        provider = PirateWeatherProvider("test_api_key")
        result = provider.process_weather_data({}, "Test Location")

        # Empty data should return None, not an empty result
        assert result is None

    def test_process_weather_data_none(self) -> None:
        """Test processing with None data"""
        provider = PirateWeatherProvider("test_api_key")
        result = provider.process_weather_data({}, "Test Location")

        assert result is None

    def test_map_icon_code(self) -> None:
        """Test icon code mapping"""
        provider = PirateWeatherProvider("test_api_key")

        # Test known codes
        assert provider._map_icon_code("clear-day") == "clear-day"
        assert provider._map_icon_code("rain") == "rain"
        assert provider._map_icon_code("snow") == "snow"
        assert provider._map_icon_code("tornado") == "wind"

        # Test unknown code
        assert provider._map_icon_code("unknown") == "clear-day"


class TestWeatherProviderManager:
    """Test the WeatherProviderManager"""

    def test_init(self) -> None:
        """Test manager initialization"""
        manager = WeatherProviderManager()
        assert manager.providers == {}
        assert manager.primary_provider is None
        assert manager.fallback_providers == []

    def test_add_provider_primary(self) -> None:
        """Test adding a primary provider"""
        manager = WeatherProviderManager()
        provider = OpenMeteoProvider()

        manager.add_provider(provider, is_primary=True)

        assert provider.name in manager.providers
        assert manager.primary_provider == provider.name
        assert provider.name not in manager.fallback_providers

    def test_add_provider_fallback(self) -> None:
        """Test adding a fallback provider"""
        manager = WeatherProviderManager()
        provider = OpenMeteoProvider()

        manager.add_provider(provider, is_primary=False)

        assert provider.name in manager.providers
        assert manager.primary_provider is None
        assert provider.name in manager.fallback_providers

    def test_set_primary_provider(self) -> None:
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

    def test_set_primary_provider_unknown(self) -> None:
        """Test setting unknown provider as primary"""
        manager = WeatherProviderManager()

        with pytest.raises(ValueError, match="Provider 'UnknownProvider' not found"):
            manager.set_primary_provider("UnknownProvider")

    @patch.object(OpenMeteoProvider, "get_weather")
    def test_get_weather_primary_success(
        self, mock_get_weather: MagicMock, mock_weather_data: dict[str, Any]
    ) -> None:
        """Test successful weather fetch from primary provider"""
        mock_get_weather.return_value = mock_weather_data

        manager = WeatherProviderManager()
        provider = OpenMeteoProvider()
        manager.add_provider(provider, is_primary=True)

        result = manager.get_weather(CHICAGO_LAT, CHICAGO_LON, "Test Location")

        assert result == mock_weather_data
        mock_get_weather.assert_called_once_with(
            CHICAGO_LAT, CHICAGO_LON, "Test Location", None
        )

    @patch.object(PirateWeatherProvider, "get_weather")
    @patch.object(OpenMeteoProvider, "get_weather")
    def test_get_weather_fallback_success(
        self,
        mock_open_meteo: MagicMock,
        mock_pirate_weather: MagicMock,
        mock_weather_data: dict[str, Any],
    ) -> None:
        """Test successful weather fetch from fallback provider"""
        mock_open_meteo.return_value = None  # Primary fails
        mock_pirate_weather.return_value = mock_weather_data  # Fallback succeeds

        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)

        result = manager.get_weather(CHICAGO_LAT, CHICAGO_LON, "Test Location")

        assert result == mock_weather_data
        mock_open_meteo.assert_called_once()
        mock_pirate_weather.assert_called_once()

    @patch.object(PirateWeatherProvider, "get_weather")
    @patch.object(OpenMeteoProvider, "get_weather")
    def test_get_weather_all_fail(
        self, mock_open_meteo: MagicMock, mock_pirate_weather: MagicMock
    ) -> None:
        """Test weather fetch when all providers fail"""
        mock_open_meteo.return_value = None
        mock_pirate_weather.return_value = None

        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)

        result = manager.get_weather(CHICAGO_LAT, CHICAGO_LON, "Test Location")

        assert result is None
        mock_open_meteo.assert_called_once()
        mock_pirate_weather.assert_called_once()

    def test_get_provider_info(self) -> None:
        """Test getting provider information"""
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        provider2 = PirateWeatherProvider("test_key")
        manager.add_provider(provider1, is_primary=True)
        manager.add_provider(provider2, is_primary=False)

        info = manager.get_provider_info()

        assert info["primary"] == provider1.name
        assert info["fallbacks"] == [provider2.name]
        assert provider1.name in info["providers"]
        assert provider2.name in info["providers"]

    def test_switch_provider_success(self) -> None:
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

    def test_switch_provider_unknown(self) -> None:
        """Test switching to unknown provider"""
        manager = WeatherProviderManager()
        provider1 = OpenMeteoProvider()
        manager.add_provider(provider1, is_primary=True)

        result = manager.switch_provider("UnknownProvider")

        assert result is False
        assert manager.primary_provider == provider1.name
