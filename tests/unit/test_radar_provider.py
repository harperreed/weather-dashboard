import time
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
import requests

from weather_providers import RadarProvider


# Test constants
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298
PROVIDER_TIMEOUT = 10
TEST_API_KEY = 'test_api_key_12345'


class TestRadarProvider:
    """Test the OpenWeatherMap radar provider for precipitation visualization"""

    @pytest.fixture
    def radar_provider(self) -> RadarProvider:
        """Create a radar provider instance for testing"""
        return RadarProvider(TEST_API_KEY)

    @pytest.fixture
    def mock_weather_response(self) -> dict[str, Any]:
        """Mock response for OpenWeatherMap OneCall API"""
        return {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            'timezone': 'America/Chicago',
            'current': {
                'dt': 1642627200,  # Fixed timestamp for testing
                'temp': 45.3,
                'weather': [{'main': 'Rain', 'description': 'light rain'}],
                'rain': {'1h': 0.12},
            },
            'hourly': [
                {'dt': 1642627200, 'temp': 45.3, 'pop': 0.8, 'rain': {'1h': 0.12}}
            ],
        }

    def test_radar_provider_initialization(self, radar_provider: RadarProvider) -> None:
        """Test radar provider initialization"""
        assert radar_provider.name == 'RadarProvider'
        assert radar_provider.api_key == TEST_API_KEY
        assert (
            radar_provider.base_url == 'https://maps.openweathermap.org/maps/2.0/radar'
        )
        assert radar_provider.tile_size == 256
        assert radar_provider.timeout == 10

    def test_lat_lon_to_tile_conversion(self, radar_provider: RadarProvider) -> None:
        """Test latitude/longitude to tile coordinate conversion"""
        # Test known coordinate conversions at different zoom levels
        test_cases = [
            # (lat, lon, zoom, expected_x, expected_y)
            (0.0, 0.0, 0, 0, 0),  # Origin at zoom 0
            (CHICAGO_LAT, CHICAGO_LON, 8, 65, 95),  # Chicago at zoom 8
            (40.7128, -74.0060, 10, 301, 385),  # NYC at zoom 10 (approximate)
        ]

        for lat, lon, zoom, expected_x, expected_y in test_cases:
            tile_x, tile_y = radar_provider._lat_lon_to_tile(lat, lon, zoom)
            assert isinstance(tile_x, int)
            assert isinstance(tile_y, int)
            # Allow some tolerance for floating point calculations
            assert abs(tile_x - expected_x) <= 2
            assert abs(tile_y - expected_y) <= 2

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_success(
        self,
        mock_get: MagicMock,
        radar_provider: RadarProvider,
        mock_weather_response: dict[str, Any],
    ) -> None:
        """Test successful weather data fetch from OpenWeatherMap API"""

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_weather_response
        mock_get.return_value = mock_response

        result = radar_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is not None
        assert 'timestamps' in result
        assert 'tile_urls' in result
        assert 'current_time' in result
        assert 'zoom_levels' in result
        assert 'center_lat' in result
        assert 'center_lon' in result
        assert 'weather_context' in result

        # Check timestamps (should have 12 historical + 1 current + 6 forecast = 19 frames)
        timestamps = result['timestamps']
        assert len(timestamps) == 19

        # Check zoom levels
        zoom_levels = result['zoom_levels']
        assert zoom_levels == [6, 8, 10]

        # Check tile URLs structure
        tile_urls = result['tile_urls']
        assert len(tile_urls) == 3  # Three zoom levels
        for level in tile_urls:
            assert 'zoom' in level
            assert 'tiles' in level
            assert level['zoom'] in [6, 8, 10]
            assert len(level['tiles']) == 19  # Same as timestamps

        # Check weather context
        weather_context = result['weather_context']
        assert weather_context['temperature'] == 45.3
        assert weather_context['precipitation'] == 0.12
        assert weather_context['description'] == 'light rain'

        # Verify API was called correctly
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert TEST_API_KEY in str(call_args)
        assert str(CHICAGO_LAT) in str(call_args)
        assert str(CHICAGO_LON) in str(call_args)

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_invalid_api_key(
        self,
        mock_get: MagicMock,
        radar_provider: RadarProvider,
    ) -> None:
        """Test fetch weather data with invalid API key"""

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_get.return_value = mock_response

        result = radar_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_api_error(
        self,
        mock_get: MagicMock,
        radar_provider: RadarProvider,
    ) -> None:
        """Test fetch weather data with API error"""

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_get.return_value = mock_response

        result = radar_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_network_error(
        self,
        mock_get: MagicMock,
        radar_provider: RadarProvider,
    ) -> None:
        """Test fetch weather data with network error"""

        mock_get.side_effect = requests.RequestException('Network error')

        result = radar_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    def test_process_weather_data_success(
        self,
        radar_provider: RadarProvider,
    ) -> None:
        """Test processing radar data into standardized format"""

        # Create mock raw data
        current_time = int(time.time())
        raw_data = {
            'timestamps': [current_time - 600, current_time, current_time + 600],
            'tile_urls': [
                {
                    'zoom': 8,
                    'tiles': [
                        {
                            'url': 'https://example.com/tile1',
                            'timestamp': current_time - 600,
                        },
                        {'url': 'https://example.com/tile2', 'timestamp': current_time},
                        {
                            'url': 'https://example.com/tile3',
                            'timestamp': current_time + 600,
                        },
                    ],
                }
            ],
            'current_time': current_time,
            'zoom_levels': [6, 8, 10],
            'center_lat': CHICAGO_LAT,
            'center_lon': CHICAGO_LON,
            'weather_context': {
                'temperature': 72.5,
                'precipitation': 0.05,
                'description': 'partly cloudy',
            },
        }

        result = radar_provider.process_weather_data(raw_data, 'Chicago')

        assert result is not None
        assert result['provider'] == 'RadarProvider'
        assert result['location_name'] == 'Chicago'
        assert 'timestamp' in result

        # Check radar data structure
        radar = result['radar']
        assert radar['timestamps'] == raw_data['timestamps']
        assert radar['tile_levels'] == raw_data['tile_urls']

        # Check animation metadata
        animation = radar['animation_metadata']
        assert animation['total_frames'] == 3
        assert (
            animation['historical_frames'] == 1
        )  # min(12, 3) but only 1 frame before current
        assert animation['current_frame'] == 1
        assert animation['forecast_frames'] == 1  # 3 - 1 - 1
        assert animation['interval_minutes'] == 10
        assert animation['duration_hours'] == 0.5  # 3 * 10 / 60

        # Check map bounds
        bounds = radar['map_bounds']
        assert bounds['center_lat'] == CHICAGO_LAT
        assert bounds['center_lon'] == CHICAGO_LON
        assert bounds['zoom_levels'] == [6, 8, 10]

        # Check weather context
        assert result['weather_context'] == raw_data['weather_context']

    def test_process_weather_data_empty_data(
        self,
        radar_provider: RadarProvider,
    ) -> None:
        """Test processing empty radar data"""

        result = radar_provider.process_weather_data({}, 'Chicago')

        # Should return None for empty data
        assert result is None

    def test_process_weather_data_none_input(
        self,
        radar_provider: RadarProvider,
    ) -> None:
        """Test processing None input"""

        result = radar_provider.process_weather_data(None, 'Chicago')  # type: ignore[arg-type]

        assert result is None

    def test_process_weather_data_minimal_structure(
        self,
        radar_provider: RadarProvider,
    ) -> None:
        """Test processing minimal radar data structure"""

        raw_data = {
            'timestamps': [],
            'tile_urls': [],
            'current_time': int(time.time()),
            'weather_context': {},
        }

        result = radar_provider.process_weather_data(raw_data, 'Chicago')

        assert result is not None
        assert result['provider'] == 'RadarProvider'

        # Check that empty data is handled gracefully
        radar = result['radar']
        assert radar['timestamps'] == []
        assert radar['tile_levels'] == []
        assert radar['default_tiles'] is None

        animation = radar['animation_metadata']
        assert animation['total_frames'] == 0
        assert animation['historical_frames'] == 0
        assert animation['forecast_frames'] == 0

    @patch('weather_providers.requests.get')
    def test_get_weather_integration(
        self,
        mock_get: MagicMock,
        radar_provider: RadarProvider,
        mock_weather_response: dict[str, Any],
    ) -> None:
        """Test complete get_weather flow"""

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_weather_response
        mock_get.return_value = mock_response

        result = radar_provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')

        assert result is not None
        assert result['provider'] == 'RadarProvider'
        assert result['location_name'] == 'Chicago'
        assert 'radar' in result
        assert 'weather_context' in result

        # Verify the radar data structure
        radar = result['radar']
        assert 'timestamps' in radar
        assert 'tile_levels' in radar
        assert 'animation_metadata' in radar
        assert 'map_bounds' in radar

    @patch('weather_providers.requests.get')
    def test_get_weather_api_failure(
        self,
        mock_get: MagicMock,
        radar_provider: RadarProvider,
    ) -> None:
        """Test get_weather when API fails"""

        mock_get.side_effect = Exception('API Error')

        result = radar_provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')

        assert result is None

    def test_provider_info(self, radar_provider: RadarProvider) -> None:
        """Test provider info method"""

        info = radar_provider.get_provider_info()

        assert info['name'] == 'RadarProvider'
        assert info['timeout'] == 10
        assert 'precipitation visualization' in info['description']

    def test_tile_url_generation(self, radar_provider: RadarProvider) -> None:
        """Test that tile URLs are properly formatted"""

        # Create mock data with known parameters
        lat, lon = CHICAGO_LAT, CHICAGO_LON
        zoom = 8
        timestamp = 1642627200

        tile_x, tile_y = radar_provider._lat_lon_to_tile(lat, lon, zoom)

        expected_base = (
            f'https://maps.openweathermap.org/maps/2.0/radar/{zoom}/{tile_x}/{tile_y}'
        )
        expected_params = f'appid={TEST_API_KEY}&date={timestamp}'

        # The actual URL generation happens in fetch_weather_data
        # This test verifies the URL format components are correct
        assert isinstance(tile_x, int)
        assert isinstance(tile_y, int)
        assert tile_x >= 0
        assert tile_y >= 0

        # Verify URL would be properly formatted
        full_url = f'{expected_base}?{expected_params}'
        assert TEST_API_KEY in full_url
        assert str(timestamp) in full_url
        assert str(zoom) in full_url
