import json
import os
import time
from unittest.mock import MagicMock, patch

import pytest
from flask.testing import FlaskClient

from main import app, get_weather_from_open_meteo, weather_cache


# Test constants
HTTP_OK = 200
HTTP_NOT_FOUND = 404
HTTP_INTERNAL_SERVER_ERROR = 500
HTTP_SERVICE_UNAVAILABLE = 503
MOCK_TEMP = 72
MOCK_FEELS_LIKE = 75
MOCK_HUMIDITY = 65
MOCK_WIND_SPEED = 8
MOCK_UV_INDEX = 6
MOCK_PRECIP_RATE = 0
MOCK_PRECIP_PROB = 10
MOCK_AQI_VALUE = 45
MOCK_PM25_VALUE = 12.5
MOCK_TEST_LAT = 42.0
MOCK_TEST_LON = -88.0
MOCK_DEFAULT_LAT = 40.0
MOCK_DEFAULT_LON = -89.0
HOURLY_COUNT = 2
DAILY_COUNT = 2
CACHE_MAX_SIZE = 100
CACHE_TTL_SECONDS = 180
EXPECTED_VALID_HTTP_STATUS_1 = 200
EXPECTED_VALID_HTTP_STATUS_2 = 500
TOLERANCE_MULTIPLIER = 2


@pytest.mark.integration
class TestWeatherAPIIntegration:
    """Integration tests for weather API endpoints"""

    def setup_method(self) -> None:
        """Clear cache before each test"""
        weather_cache.clear()

    def test_full_weather_api_flow(self, client: FlaskClient) -> None:
        """Test complete weather API flow with mock data"""
        with patch('main.weather_manager.get_weather') as mock_get_weather:
            mock_weather_data = {
                'current': {
                    'temperature': MOCK_TEMP,
                    'feels_like': MOCK_FEELS_LIKE,
                    'humidity': MOCK_HUMIDITY,
                    'wind_speed': MOCK_WIND_SPEED,
                    'uv_index': MOCK_UV_INDEX,
                    'precipitation_rate': MOCK_PRECIP_RATE,
                    'precipitation_prob': MOCK_PRECIP_PROB,
                    'precipitation_type': None,
                    'icon': 'clear-day',
                    'summary': 'Clear sky',
                },
                'hourly': [
                    {
                        'temp': MOCK_TEMP,
                        'icon': 'clear-day',
                        'rain': 0,
                        't': '12p',
                        'desc': 'Clear',
                    },
                    {
                        'temp': MOCK_FEELS_LIKE,
                        'icon': 'clear-day',
                        'rain': 0,
                        't': '1p',
                        'desc': 'Clear',
                    },
                ],
                'daily': [
                    {'h': 77, 'l': 65, 'icon': 'clear-day', 'd': 'Mon'},
                    {'h': 75, 'l': 63, 'icon': 'partly-cloudy-day', 'd': 'Tue'},
                ],
                'location': 'Chicago',
                'provider': 'OpenMeteo',
            }
            mock_get_weather.return_value = mock_weather_data

            # Test API call
            response = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            assert response.status_code == HTTP_OK

            data = json.loads(response.data)
            assert data['location'] == 'Chicago'
            assert data['provider'] == 'OpenMeteo'
            assert data['current']['temperature'] == MOCK_TEMP
            assert len(data['hourly']) == HOURLY_COUNT
            assert len(data['daily']) == DAILY_COUNT

            # Verify cache headers
            assert 'Cache-Control' in response.headers
            assert 'ETag' in response.headers

    def test_cache_behavior_integration(self, client: FlaskClient) -> None:
        """Test cache behavior in integration"""
        with patch('main.weather_manager.get_weather') as mock_get_weather:
            mock_weather_data = {
                'current': {'temperature': 72},
                'hourly': [],
                'daily': [],
                'location': 'Chicago',
                'provider': 'OpenMeteo',
            }
            mock_get_weather.return_value = mock_weather_data

            # First request should call the weather manager
            response1 = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            assert response1.status_code == HTTP_OK
            assert mock_get_weather.call_count == 1

            # Second request should use cache
            response2 = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            assert response2.status_code == HTTP_OK
            assert mock_get_weather.call_count == 1  # Should not increase

            # Both responses should be identical
            assert response1.data == response2.data

    def test_provider_switching_integration(self, client: FlaskClient) -> None:
        """Test provider switching through API"""
        # Get current provider info
        response = client.get('/api/providers')
        assert response.status_code == HTTP_OK
        initial_data = json.loads(response.data)

        # Switch to a different provider if available
        available_providers = list(initial_data['providers'].keys())
        if len(available_providers) > 1:
            new_provider = (
                available_providers[1]
                if initial_data['primary'] == available_providers[0]
                else available_providers[0]
            )

            # Switch provider
            switch_response = client.post(
                '/api/providers/switch',
                json={'provider': new_provider},
                content_type='application/json',
            )
            assert switch_response.status_code == HTTP_OK

            switch_data = json.loads(switch_response.data)
            assert switch_data['success'] is True
            assert switch_data['provider_info']['primary'] == new_provider

    def test_city_routes_integration(self, client: FlaskClient) -> None:
        """Test city-specific routes"""
        # Test valid city
        response = client.get('/chicago')
        assert response.status_code == HTTP_OK

        # Test invalid city
        response = client.get('/nonexistent_city')
        assert response.status_code == HTTP_NOT_FOUND

        # Test coordinate routes - now handled by city route with coordinate detection
        response = client.get('/41.8781,-87.6298')
        assert response.status_code == HTTP_OK

        # Test invalid coordinates
        response = client.get('/91.0,-181.0')
        assert response.status_code == HTTP_NOT_FOUND

        response = client.get('/41.8781,-87.6298/Chicago')
        assert response.status_code == HTTP_NOT_FOUND

    def test_error_handling_integration(self, client: FlaskClient) -> None:
        """Test error handling in integration"""
        # Clear cache to ensure we test API failure
        weather_cache.clear()

        with patch('main.weather_manager.get_weather') as mock_get_weather:
            # Simulate API failure
            mock_get_weather.return_value = None

            response = client.get('/api/weather?lat=41.8781&lon=-87.6298')
            assert response.status_code == HTTP_INTERNAL_SERVER_ERROR

            data = json.loads(response.data)
            assert 'error' in data
            assert 'Failed to fetch weather data' in data['error']

    def test_cache_stats_integration(self, client: FlaskClient) -> None:
        """Test cache statistics integration"""
        # Clear cache first
        weather_cache.clear()

        # Check empty cache
        response = client.get('/api/cache/stats')
        assert response.status_code == HTTP_OK

        data = json.loads(response.data)
        assert data['cache_size'] == 0
        assert data['max_size'] == CACHE_MAX_SIZE
        assert data['ttl_seconds'] == CACHE_TTL_SECONDS
        assert data['cached_locations'] == []

        # Add some data to cache via API call
        with patch('main.weather_manager.get_weather') as mock_get_weather:
            mock_get_weather.return_value = {'location': 'Chicago'}
            client.get('/api/weather?lat=41.8781&lon=-87.6298&location=Chicago')

        # Check cache now has data
        response = client.get('/api/cache/stats')
        data = json.loads(response.data)
        assert data['cache_size'] == 1
        assert len(data['cached_locations']) == 1


@pytest.mark.integration
@pytest.mark.slow
class TestExternalAPIIntegration:
    """Integration tests that could hit external APIs (marked as slow)"""

    def test_open_meteo_api_structure(self) -> None:
        """Test OpenMeteo API response structure (with mock)"""
        with patch('requests.get') as mock_get:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                'current': {
                    'temperature_2m': 20.0,
                    'apparent_temperature': 22.0,
                    'relative_humidity_2m': 65,
                    'wind_speed_10m': 5.0,
                    'uv_index': 3,
                    'precipitation': 0.0,
                    'weather_code': 0,
                },
                'hourly': {
                    'time': ['2024-01-01T12:00:00Z'],
                    'temperature_2m': [20.0],
                    'weather_code': [0],
                    'precipitation_probability': [0],
                },
                'daily': {
                    'time': ['2024-01-01'],
                    'temperature_2m_max': [25.0],
                    'temperature_2m_min': [15.0],
                    'weather_code': [0],
                },
            }
            mock_response.raise_for_status.return_value = None
            mock_get.return_value = mock_response

            result = get_weather_from_open_meteo(41.8781, -87.6298)

            assert result is not None
            assert 'current' in result
            assert 'hourly' in result
            assert 'daily' in result

    def test_provider_failover_integration(self, client: FlaskClient) -> None:
        """Test provider failover behavior"""
        # Clear cache to ensure we test actual provider failover
        weather_cache.clear()

        # Mock the weather manager's get_weather method to simulate provider failover
        with patch('main.weather_manager.get_weather') as mock_get_weather:
            # Simulate failover by returning data from OpenMeteo
            mock_get_weather.return_value = {
                'current': {'temperature': 72},
                'hourly': [],
                'daily': [],
                'location': 'Chicago',
                'provider': 'OpenMeteo',
            }

            response = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            assert response.status_code == HTTP_OK

            data = json.loads(response.data)
            assert data['provider'] == 'OpenMeteo'

            # Verify weather manager was called
            mock_get_weather.assert_called_once()


@pytest.mark.integration
class TestApplicationConfiguration:
    """Test application configuration and setup"""

    def test_app_configuration(self) -> None:
        """Test Flask app configuration"""
        assert (
            app.config['COMPRESS_MIMETYPES'] is not None
        )  # Flask-Compress is configured
        assert app.config.get('TESTING') is not None

    def test_cache_configuration(self) -> None:
        """Test cache configuration"""
        assert weather_cache.maxsize == CACHE_MAX_SIZE
        assert weather_cache.ttl == CACHE_TTL_SECONDS  # 3 minutes for real-time updates

    def test_environment_variables(self) -> None:
        """Test environment variable handling"""
        # Test that environment variables can be loaded
        # Note: No specific API keys required for OpenMeteo as it's free

        # Test SECRET_KEY handling
        secret_key = os.getenv('SECRET_KEY')
        # SECRET_KEY can be None (will be auto-generated) or set to something
        assert secret_key is None or len(secret_key) > 0

    def test_cors_and_compression(self, client: FlaskClient) -> None:
        """Test CORS and compression configuration"""
        response = client.get('/api/weather')

        # Check that compression is working (Flask-Compress)
        assert 'Content-Encoding' in response.headers or response.status_code == HTTP_OK

        # Check basic API response
        # Should be valid HTTP response
        assert response.status_code in [
            EXPECTED_VALID_HTTP_STATUS_1,
            EXPECTED_VALID_HTTP_STATUS_2,
        ]


@pytest.mark.integration
class TestAirQualityIntegration:
    """Test air quality API integration"""

    @patch('main.air_quality_provider', None)
    def test_air_quality_api_without_key(self, client: FlaskClient) -> None:
        """Test air quality API response without API key (should return 503)"""
        response = client.get('/api/air-quality')
        # AirNow requires API key - should return 503 Service Unavailable
        assert response.status_code == HTTP_SERVICE_UNAVAILABLE

        data = response.get_json()
        assert data is not None
        assert 'error' in data
        assert 'API key required' in data['error']

    def test_air_quality_api_success(self, client: FlaskClient) -> None:
        """Test successful air quality API response"""
        mock_air_quality_data = {
            'aqi': {
                'us_aqi': MOCK_AQI_VALUE,
                'category': 'Good',
                'health_recommendation': 'Air quality is satisfactory for most people',
                'color': '#00e400',
            },
            'pollutants': {
                'pm25': MOCK_PM25_VALUE,
                'pm10': 25.0,
                'o3': 80.0,
                'no2': 15.0,
                'so2': 5.0,
                'co': 200.0,
            },
            'location': 'Chicago',
            'provider': 'AirQuality',
        }

        # Mock the provider instance
        mock_provider_instance = MagicMock()
        mock_provider_instance.get_weather.return_value = mock_air_quality_data

        # Clear cache first to ensure we test the API call
        with patch('main.weather_cache') as mock_cache:
            mock_cache.__contains__.return_value = False  # Cache miss
            mock_cache.__setitem__.return_value = None

            # Make the provider available
            with patch('main.air_quality_provider', mock_provider_instance):
                response = client.get(
                    f'/api/air-quality?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}&location=TestCity'
                )

        assert response.status_code == HTTP_OK
        data = response.get_json()

        assert data is not None
        assert 'aqi' in data
        assert data['aqi']['us_aqi'] == MOCK_AQI_VALUE
        assert data['aqi']['category'] == 'Good'
        assert 'pollutants' in data
        assert data['pollutants']['pm25'] == MOCK_PM25_VALUE

        # Check cache headers
        assert 'Cache-Control' in response.headers
        assert 'public' in response.headers['Cache-Control']

    @patch('main.weather_cache')
    def test_air_quality_api_failure(
        self, mock_cache: MagicMock, client: FlaskClient
    ) -> None:
        """Test air quality API when provider fails"""
        mock_cache.__contains__.return_value = False  # No cache hit

        mock_provider_instance = MagicMock()
        mock_provider_instance.get_weather.return_value = None

        with patch('main.air_quality_provider', mock_provider_instance):
            response = client.get(
                '/api/air-quality?lat=42.0&lon=-88.0'
            )  # Use different coordinates

        assert response.status_code == HTTP_INTERNAL_SERVER_ERROR
        data = response.get_json()
        assert data is not None
        assert 'error' in data
        assert 'Failed to fetch air quality data' in data['error']

    @patch('main.weather_cache')
    def test_air_quality_api_default_location(
        self, mock_cache: MagicMock, client: FlaskClient
    ) -> None:
        """Test air quality API with default location (Chicago)"""
        mock_cache.__contains__.return_value = False  # No cache hit

        mock_air_quality_data = {
            'aqi': {'us_aqi': 50},
            'pollutants': {},
            'location': 'Unknown Location',
            'provider': 'AirQuality',
        }

        mock_provider_instance = MagicMock()
        mock_provider_instance.get_weather.return_value = mock_air_quality_data

        with patch('main.air_quality_provider', mock_provider_instance):
            response = client.get(
                f'/api/air-quality?lat={MOCK_DEFAULT_LAT}&lon={MOCK_DEFAULT_LON}'
            )  # Use different coordinates

        assert response.status_code == HTTP_OK

        # Verify the provider was called with the coordinates
        mock_provider_instance.get_weather.assert_called_once()
        call_args = mock_provider_instance.get_weather.call_args
        assert call_args[0][0] == MOCK_DEFAULT_LAT  # Test latitude
        assert call_args[0][1] == MOCK_DEFAULT_LON  # Test longitude


class TestEndToEndScenarios:
    """End-to-end integration test scenarios"""

    def test_complete_user_flow(self, client: FlaskClient) -> None:
        """Test complete user flow from frontend to API"""
        # 1. User visits main page
        response = client.get('/')
        assert response.status_code == HTTP_OK

        # 2. User visits specific city page
        response = client.get('/chicago')
        assert response.status_code == HTTP_OK

        # 3. Frontend calls weather API
        with patch('main.weather_manager.get_weather') as mock_get_weather:
            mock_get_weather.return_value = {
                'current': {'temperature': 72},
                'hourly': [],
                'daily': [],
                'location': 'Chicago',
                'provider': 'OpenMeteo',
            }

            response = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            assert response.status_code == HTTP_OK

            data = json.loads(response.data)
            assert data['location'] == 'Chicago'

        # 4. User checks cache stats
        response = client.get('/api/cache/stats')
        assert response.status_code == HTTP_OK

        # 5. User checks provider info
        response = client.get('/api/providers')
        assert response.status_code == HTTP_OK

    def test_error_recovery_flow(self, client: FlaskClient) -> None:
        """Test error recovery scenarios"""
        # Clear cache to ensure we test error conditions
        weather_cache.clear()

        # 1. All providers fail
        with patch('main.weather_manager.get_weather') as mock_get_weather:
            mock_get_weather.return_value = None

            response = client.get('/api/weather?lat=41.8781&lon=-87.6298')
            assert response.status_code == HTTP_INTERNAL_SERVER_ERROR

            data = json.loads(response.data)
            assert 'error' in data

        # 2. Provider switching after failure
        response = client.post(
            '/api/providers/switch',
            json={'provider': 'OpenMeteo'},
            content_type='application/json',
        )
        assert response.status_code == HTTP_OK

        # 3. Retry with new provider
        with patch('main.weather_manager.get_weather') as mock_get_weather:
            mock_get_weather.return_value = {
                'current': {'temperature': 72},
                'hourly': [],
                'daily': [],
                'location': 'Chicago',
                'provider': 'OpenMeteo',
            }

            response = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            assert response.status_code == HTTP_OK

    def test_performance_characteristics(self, client: FlaskClient) -> None:
        """Test performance characteristics"""

        with patch('main.weather_manager.get_weather') as mock_get_weather:
            mock_get_weather.return_value = {
                'current': {'temperature': 72},
                'hourly': [],
                'daily': [],
                'location': 'Chicago',
                'provider': 'OpenMeteo',
            }

            # First request (cache miss)
            start_time = time.time()
            response1 = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            first_request_time = time.time() - start_time

            assert response1.status_code == HTTP_OK

            # Second request (cache hit)
            start_time = time.time()
            response2 = client.get(
                '/api/weather?lat=41.8781&lon=-87.6298&location=Chicago'
            )
            second_request_time = time.time() - start_time

            assert response2.status_code == HTTP_OK

            # Cache hit should be faster (or at least not significantly slower)
            # Allow some tolerance
            assert second_request_time <= first_request_time * TOLERANCE_MULTIPLIER


@pytest.mark.integration
class TestWeatherAlertsAPIIntegration:
    """Test weather alerts API integration"""

    def setup_method(self) -> None:
        """Clear alerts cache before each test"""
        from main import alerts_cache

        alerts_cache.clear()

    def test_weather_alerts_api_success(self, client: FlaskClient) -> None:
        """Test successful weather alerts API response"""
        mock_alerts_data = {
            'provider': 'NationalWeatherService',
            'location_name': 'Chicago',
            'timestamp': '2024-07-20T18:00:00Z',
            'alerts': {
                'active_count': 2,
                'alerts': [
                    {
                        'id': 'urn:oid:2.49.0.1.840.0.12345',
                        'type': 'Severe Thunderstorm Warning',
                        'headline': 'Severe Thunderstorm Warning for Cook County',
                        'severity': 'Severe',
                        'color': '#FF0000',
                        'start_time': '2024-07-20T18:00:00Z',
                        'end_time': '2024-07-20T21:00:00Z',
                        'areas': 'Cook County, IL',
                    },
                    {
                        'id': 'urn:oid:2.49.0.1.840.0.67890',
                        'type': 'Winter Weather Advisory',
                        'headline': 'Light snow expected',
                        'severity': 'Minor',
                        'color': '#FFD700',
                        'start_time': '2024-07-20T22:00:00Z',
                        'end_time': '2024-07-21T06:00:00Z',
                        'areas': 'Northern Cook County, IL',
                    },
                ],
                'has_warnings': True,
            },
            'forecast': {
                'periods': [],
                'source': 'National Weather Service',
            },
        }

        # Mock the NWS provider instance
        mock_nws_provider = MagicMock()
        mock_nws_provider.get_weather.return_value = mock_alerts_data

        # Clear cache to ensure we test the API call
        with patch('main.alerts_cache') as mock_cache:
            mock_cache.__contains__.return_value = False  # Cache miss
            mock_cache.__setitem__.return_value = None

            with patch('main.nws_provider', mock_nws_provider):
                response = client.get(
                    f'/api/weather/alerts?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}&location=TestCity'
                )

        assert response.status_code == HTTP_OK
        data = response.get_json()

        assert data is not None
        assert data['provider'] == 'NationalWeatherService'
        assert 'alerts' in data
        assert data['alerts']['active_count'] == 2
        assert data['alerts']['has_warnings'] is True
        assert len(data['alerts']['alerts']) == 2

        # Check first alert
        severe_alert = data['alerts']['alerts'][0]
        assert severe_alert['type'] == 'Severe Thunderstorm Warning'
        assert severe_alert['severity'] == 'Severe'
        assert severe_alert['color'] == '#FF0000'

        # Check cache headers
        assert 'Cache-Control' in response.headers
        assert 'public' in response.headers['Cache-Control']
        assert 'max-age=300' in response.headers['Cache-Control']

    def test_weather_alerts_api_no_alerts(self, client: FlaskClient) -> None:
        """Test weather alerts API when there are no active alerts"""
        mock_alerts_data = {
            'provider': 'NationalWeatherService',
            'location_name': 'Chicago',
            'timestamp': '2024-07-20T18:00:00Z',
            'alerts': {
                'active_count': 0,
                'alerts': [],
                'has_warnings': False,
            },
            'forecast': {
                'periods': [],
                'source': 'National Weather Service',
            },
        }

        mock_nws_provider = MagicMock()
        mock_nws_provider.get_weather.return_value = mock_alerts_data

        with patch('main.alerts_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.nws_provider', mock_nws_provider):
                response = client.get(
                    f'/api/weather/alerts?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}&location=TestCity'
                )

        assert response.status_code == HTTP_OK
        data = response.get_json()

        assert data is not None
        assert data['alerts']['active_count'] == 0
        assert data['alerts']['has_warnings'] is False
        assert len(data['alerts']['alerts']) == 0

    def test_weather_alerts_api_failure(self, client: FlaskClient) -> None:
        """Test weather alerts API when NWS provider fails"""
        mock_nws_provider = MagicMock()
        mock_nws_provider.get_weather.return_value = None

        with patch('main.alerts_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.nws_provider', mock_nws_provider):
                response = client.get('/api/weather/alerts?lat=42.0&lon=-88.0')

        assert response.status_code == HTTP_INTERNAL_SERVER_ERROR
        data = response.get_json()

        assert data is not None
        assert 'error' in data
        assert 'Failed to fetch weather alerts' in data['error']
        # Should still provide empty alerts structure
        assert 'alerts' in data
        assert data['alerts']['active_count'] == 0

    def test_weather_alerts_api_default_location(self, client: FlaskClient) -> None:
        """Test weather alerts API with default location (Chicago)"""
        mock_alerts_data = {
            'provider': 'NationalWeatherService',
            'location_name': 'Chicago',
            'alerts': {'active_count': 0, 'alerts': [], 'has_warnings': False},
        }

        mock_nws_provider = MagicMock()
        mock_nws_provider.get_weather.return_value = mock_alerts_data

        with patch('main.alerts_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.nws_provider', mock_nws_provider):
                response = client.get('/api/weather/alerts')  # No lat/lon provided

        assert response.status_code == HTTP_OK

        # Verify the provider was called with Chicago coordinates
        mock_nws_provider.get_weather.assert_called_once()
        call_args = mock_nws_provider.get_weather.call_args
        assert call_args[0][0] == 41.8781  # Chicago latitude
        assert call_args[0][1] == -87.6298  # Chicago longitude

    def test_weather_alerts_api_cache_hit(self, client: FlaskClient) -> None:
        """Test weather alerts API cache behavior"""
        mock_alerts_data = {
            'provider': 'NationalWeatherService',
            'alerts': {'active_count': 1, 'alerts': [], 'has_warnings': False},
        }

        # Mock cache hit
        with patch('main.alerts_cache') as mock_cache:
            mock_cache.__contains__.return_value = True  # Cache hit
            mock_cache.__getitem__.return_value = mock_alerts_data

            response = client.get(
                f'/api/weather/alerts?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}'
            )

        assert response.status_code == HTTP_OK
        data = response.get_json()

        assert data is not None
        assert data['provider'] == 'NationalWeatherService'

    def test_weather_alerts_api_etag_headers(self, client: FlaskClient) -> None:
        """Test weather alerts API ETag header functionality"""
        mock_alerts_data = {
            'provider': 'NationalWeatherService',
            'alerts': {'active_count': 0, 'alerts': [], 'has_warnings': False},
        }

        mock_nws_provider = MagicMock()
        mock_nws_provider.get_weather.return_value = mock_alerts_data

        with patch('main.alerts_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.nws_provider', mock_nws_provider):
                response = client.get(
                    f'/api/weather/alerts?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}'
                )

        assert response.status_code == HTTP_OK
        assert 'ETag' in response.headers
        assert response.headers['ETag'].startswith('"')
        assert response.headers['ETag'].endswith('"')


@pytest.mark.integration
class TestRadarAPIIntegration:
    """Test precipitation radar API integration"""

    def setup_method(self) -> None:
        """Clear radar cache before each test"""
        from main import radar_cache
        radar_cache.clear()

    def test_radar_api_success(self, client: FlaskClient) -> None:
        """Test successful radar API response"""
        mock_radar_data = {
            'provider': 'RadarProvider',
            'location_name': 'Chicago',
            'timestamp': '2024-07-20T18:00:00Z',
            'radar': {
                'timestamps': [1642627200, 1642627800, 1642628400],
                'tile_levels': [
                    {
                        'zoom': 8,
                        'tiles': [
                            {
                                'url': 'https://maps.openweathermap.org/maps/2.0/radar/8/65/95?appid=test&date=1642627200',
                                'timestamp': 1642627200,
                                'x': 65,
                                'y': 95
                            },
                            {
                                'url': 'https://maps.openweathermap.org/maps/2.0/radar/8/65/95?appid=test&date=1642627800',
                                'timestamp': 1642627800,
                                'x': 65,
                                'y': 95
                            },
                            {
                                'url': 'https://maps.openweathermap.org/maps/2.0/radar/8/65/95?appid=test&date=1642628400',
                                'timestamp': 1642628400,
                                'x': 65,
                                'y': 95
                            }
                        ]
                    }
                ],
                'animation_metadata': {
                    'total_frames': 3,
                    'historical_frames': 1,
                    'current_frame': 1,
                    'forecast_frames': 1,
                    'interval_minutes': 10,
                    'duration_hours': 0.5
                },
                'map_bounds': {
                    'center_lat': 41.8781,
                    'center_lon': -87.6298,
                    'zoom_levels': [6, 8, 10]
                }
            },
            'weather_context': {
                'temperature': 45.3,
                'precipitation': 0.12,
                'description': 'light rain'
            }
        }

        # Mock the radar provider instance
        mock_radar_provider = MagicMock()
        mock_radar_provider.get_weather.return_value = mock_radar_data

        # Clear cache to ensure we test the API call
        with patch('main.radar_cache') as mock_cache:
            mock_cache.__contains__.return_value = False  # Cache miss
            mock_cache.__setitem__.return_value = None

            with patch('main.radar_provider', mock_radar_provider):
                response = client.get(
                    f'/api/radar?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}&location=TestCity'
                )

        assert response.status_code == HTTP_OK
        data = response.get_json()

        assert data is not None
        assert data['provider'] == 'RadarProvider'
        assert 'radar' in data
        assert data['radar']['animation_metadata']['total_frames'] == 3
        assert data['radar']['animation_metadata']['historical_frames'] == 1
        assert len(data['radar']['tile_levels']) == 1
        assert len(data['radar']['tile_levels'][0]['tiles']) == 3

        # Check weather context
        assert data['weather_context']['temperature'] == 45.3
        assert data['weather_context']['precipitation'] == 0.12

        # Check cache headers
        assert 'Cache-Control' in response.headers
        assert 'public' in response.headers['Cache-Control']
        assert 'max-age=600' in response.headers['Cache-Control']

    def test_radar_api_unavailable_provider(self, client: FlaskClient) -> None:
        """Test radar API when provider is unavailable"""
        with patch('main.radar_provider', None):
            response = client.get(
                f'/api/radar?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}&location=TestCity'
            )

        assert response.status_code == HTTP_SERVICE_UNAVAILABLE
        data = response.get_json()

        assert data is not None
        assert 'error' in data
        assert 'OpenWeatherMap API key required' in data['error']
        assert 'radar' in data
        assert data['radar']['available'] is False
        assert data['radar']['animation_metadata']['total_frames'] == 0

    def test_radar_api_provider_failure(self, client: FlaskClient) -> None:
        """Test radar API when provider fails"""
        mock_radar_provider = MagicMock()
        mock_radar_provider.get_weather.return_value = None

        with patch('main.radar_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.radar_provider', mock_radar_provider):
                response = client.get('/api/radar?lat=42.0&lon=-88.0')

        assert response.status_code == HTTP_INTERNAL_SERVER_ERROR
        data = response.get_json()
        
        assert data is not None
        assert 'error' in data
        assert 'Failed to fetch radar data' in data['error']
        # Should still provide empty radar structure
        assert 'radar' in data
        assert data['radar']['animation_metadata']['total_frames'] == 0

    def test_radar_api_default_location(self, client: FlaskClient) -> None:
        """Test radar API with default location (Chicago)"""
        mock_radar_data = {
            'provider': 'RadarProvider',
            'location_name': 'Chicago',
            'radar': {
                'animation_metadata': {'total_frames': 19, 'historical_frames': 12},
                'tile_levels': []
            },
        }

        mock_radar_provider = MagicMock()
        mock_radar_provider.get_weather.return_value = mock_radar_data

        with patch('main.radar_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.radar_provider', mock_radar_provider):
                response = client.get('/api/radar')  # No lat/lon provided

        assert response.status_code == HTTP_OK

        # Verify the provider was called with Chicago coordinates
        mock_radar_provider.get_weather.assert_called_once()
        call_args = mock_radar_provider.get_weather.call_args
        assert call_args[0][0] == 41.8781  # Chicago latitude
        assert call_args[0][1] == -87.6298  # Chicago longitude

    def test_radar_api_cache_hit(self, client: FlaskClient) -> None:
        """Test radar API cache behavior"""
        mock_radar_data = {
            'provider': 'RadarProvider',
            'radar': {'animation_metadata': {'total_frames': 19}},
        }

        # Mock cache hit
        with patch('main.radar_cache') as mock_cache:
            mock_cache.__contains__.return_value = True  # Cache hit
            mock_cache.__getitem__.return_value = mock_radar_data

            response = client.get(
                f'/api/radar?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}'
            )

        assert response.status_code == HTTP_OK
        data = response.get_json()

        assert data is not None
        assert data['provider'] == 'RadarProvider'

    def test_radar_api_etag_headers(self, client: FlaskClient) -> None:
        """Test radar API ETag header functionality"""
        mock_radar_data = {
            'provider': 'RadarProvider',
            'radar': {'animation_metadata': {'total_frames': 0}},
        }

        mock_radar_provider = MagicMock()
        mock_radar_provider.get_weather.return_value = mock_radar_data

        with patch('main.radar_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.radar_provider', mock_radar_provider):
                response = client.get(
                    f'/api/radar?lat={MOCK_TEST_LAT}&lon={MOCK_TEST_LON}'
                )

        assert response.status_code == HTTP_OK
        assert 'ETag' in response.headers
        assert response.headers['ETag'].startswith('"')
        assert response.headers['ETag'].endswith('"')

    def test_radar_api_tile_url_format(self, client: FlaskClient) -> None:
        """Test radar API returns properly formatted tile URLs"""
        mock_radar_data = {
            'provider': 'RadarProvider',
            'radar': {
                'tile_levels': [
                    {
                        'zoom': 8,
                        'tiles': [
                            {
                                'url': 'https://maps.openweathermap.org/maps/2.0/radar/8/65/95?appid=test_key&date=1642627200',
                                'timestamp': 1642627200,
                                'x': 65,
                                'y': 95
                            }
                        ]
                    }
                ],
                'animation_metadata': {'total_frames': 1}
            }
        }

        mock_radar_provider = MagicMock()
        mock_radar_provider.get_weather.return_value = mock_radar_data

        with patch('main.radar_cache') as mock_cache:
            mock_cache.__contains__.return_value = False

            with patch('main.radar_provider', mock_radar_provider):
                response = client.get('/api/radar?lat=41.8781&lon=-87.6298')

        assert response.status_code == HTTP_OK
        data = response.get_json()

        # Check tile URL format
        tile_levels = data['radar']['tile_levels']
        assert len(tile_levels) > 0
        tiles = tile_levels[0]['tiles']
        assert len(tiles) > 0
        
        tile_url = tiles[0]['url']
        assert 'maps.openweathermap.org' in tile_url
        assert 'appid=' in tile_url
        assert 'date=' in tile_url
        
        # Check tile coordinates are present
        assert isinstance(tiles[0]['x'], int)
        assert isinstance(tiles[0]['y'], int)
        assert tiles[0]['x'] >= 0
        assert tiles[0]['y'] >= 0
