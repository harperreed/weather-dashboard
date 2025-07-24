from typing import Any
from unittest.mock import MagicMock, patch

import pytest
import requests

from weather_providers import NationalWeatherServiceProvider


# Test constants
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298
PROVIDER_TIMEOUT = 10

# NWS grid constants
NWS_GRID_X = 75
NWS_GRID_Y = 73
EXPECTED_API_CALLS = 3
EXPECTED_ALERT_COUNT = 2
FORECAST_TEMP = 42


class TestNationalWeatherServiceProvider:
    """Test the National Weather Service provider for weather alerts"""

    @pytest.fixture
    def nws_provider(self) -> NationalWeatherServiceProvider:
        """Create a NWS provider instance for testing"""
        return NationalWeatherServiceProvider()

    @pytest.fixture
    def mock_points_response(self) -> dict[str, Any]:
        """Mock response for NWS points API"""
        return {
            'properties': {
                'cwa': 'LOT',
                'gridX': 75,
                'gridY': 73,
                'forecastOffice': 'https://api.weather.gov/offices/LOT',
            }
        }

    @pytest.fixture
    def mock_alerts_response(self) -> dict[str, Any]:
        """Mock response for NWS alerts API"""
        return {
            'type': 'FeatureCollection',
            'features': [
                {
                    'properties': {
                        'id': 'urn:oid:2.49.0.1.840.0.12345',
                        'event': 'Severe Thunderstorm Warning',
                        'headline': 'Severe Thunderstorm Warning issued for Cook',
                        'description': 'Large hail and damaging winds expected',
                        'severity': 'Severe',
                        'certainty': 'Likely',
                        'urgency': 'Immediate',
                        'onset': '2024-07-20T18:00:00Z',
                        'expires': '2024-07-20T21:00:00Z',
                        'senderName': 'NWS Chicago',
                        'areaDesc': 'Cook County, IL',
                        'instruction': 'Move to interior room on lowest floor',
                        'response': 'Shelter',
                    }
                },
                {
                    'properties': {
                        'id': 'urn:oid:2.49.0.1.840.0.67890',
                        'event': 'Winter Weather Advisory',
                        'headline': 'Light snow expected this evening',
                        'description': '1-3 inches of snow expected',
                        'severity': 'Minor',
                        'certainty': 'Likely',
                        'urgency': 'Expected',
                        'onset': '2024-07-20T22:00:00Z',
                        'expires': '2024-07-21T06:00:00Z',
                        'senderName': 'NWS Chicago',
                        'areaDesc': 'Northern Cook County, IL',
                        'instruction': 'Use caution when driving',
                        'response': 'Monitor',
                    }
                },
            ],
        }

    @pytest.fixture
    def mock_forecast_response(self) -> dict[str, Any]:
        """Mock response for NWS forecast API"""
        return {
            'properties': {
                'periods': [
                    {
                        'number': 1,
                        'name': 'Tonight',
                        'temperature': 42,
                        'temperatureUnit': 'F',
                        'windSpeed': '10 mph',
                        'windDirection': 'NW',
                        'shortForecast': 'Partly Cloudy',
                        'detailedForecast': 'Partly cloudy with low around 42',
                        'isDaytime': False,
                        'icon': 'https://api.weather.gov/icons/land/night/sct?size=medium',
                    }
                ]
            }
        }

    def test_nws_provider_initialization(
        self, nws_provider: NationalWeatherServiceProvider
    ) -> None:
        """Test NWS provider initialization"""
        assert nws_provider.name == 'NationalWeatherService'
        assert nws_provider.base_url == 'https://api.weather.gov'
        assert nws_provider.timeout == PROVIDER_TIMEOUT
        assert 'WeatherDashboard' in nws_provider.user_agent

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_success(
        self,
        mock_get: MagicMock,
        nws_provider: NationalWeatherServiceProvider,
        mock_points_response: dict[str, Any],
        mock_alerts_response: dict[str, Any],
        mock_forecast_response: dict[str, Any],
    ) -> None:
        """Test successful weather data fetch from NWS API"""

        # Mock the three API calls: points, alerts, forecast
        mock_responses = [
            MagicMock(
                status_code=200, json=MagicMock(return_value=mock_points_response)
            ),
            MagicMock(
                status_code=200, json=MagicMock(return_value=mock_alerts_response)
            ),
            MagicMock(
                status_code=200, json=MagicMock(return_value=mock_forecast_response)
            ),
        ]

        mock_get.side_effect = mock_responses

        result = nws_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is not None
        assert 'points' in result
        assert 'alerts' in result
        assert 'forecast' in result
        assert 'grid_info' in result
        assert result['grid_info']['office'] == 'LOT'
        assert result['grid_info']['x'] == NWS_GRID_X
        assert result['grid_info']['y'] == NWS_GRID_Y

        # Verify API calls were made with correct parameters
        assert mock_get.call_count == EXPECTED_API_CALLS

        # Verify points API call
        points_call = mock_get.call_args_list[0]
        assert f'/points/{CHICAGO_LAT:.4f},{CHICAGO_LON:.4f}' in points_call[0][0]

        # Verify alerts API call
        alerts_call = mock_get.call_args_list[1]
        assert '/alerts/active' in alerts_call[0][0]
        assert (
            alerts_call[1]['params']['point'] == f'{CHICAGO_LAT:.4f},{CHICAGO_LON:.4f}'
        )

        # Verify forecast API call
        forecast_call = mock_get.call_args_list[2]
        assert '/gridpoints/LOT/75,73/forecast' in forecast_call[0][0]

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_points_failure(
        self,
        mock_get: MagicMock,
        nws_provider: NationalWeatherServiceProvider,
    ) -> None:
        """Test fetch weather data when points API fails"""

        mock_get.return_value = MagicMock(status_code=404)

        result = nws_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None
        assert mock_get.call_count == 1

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_missing_grid_info(
        self,
        mock_get: MagicMock,
        nws_provider: NationalWeatherServiceProvider,
    ) -> None:
        """Test fetch weather data when grid info is missing"""

        # Mock points response without required grid info
        mock_response = {
            'properties': {
                'cwa': 'LOT',
                # Missing gridX and gridY
            }
        }

        mock_get.return_value = MagicMock(
            status_code=200, json=MagicMock(return_value=mock_response)
        )

        result = nws_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_partial_failure(
        self,
        mock_get: MagicMock,
        nws_provider: NationalWeatherServiceProvider,
        mock_points_response: dict[str, Any],
    ) -> None:
        """Test fetch weather data when alerts/forecast APIs fail"""

        # Points succeeds, alerts and forecast fail
        mock_responses = [
            MagicMock(
                status_code=200, json=MagicMock(return_value=mock_points_response)
            ),
            MagicMock(status_code=500),  # alerts fail
            MagicMock(status_code=500),  # forecast fail
        ]

        mock_get.side_effect = mock_responses

        result = nws_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        # Should still return data even if alerts/forecast fail
        assert result is not None
        assert result['alerts'] is None
        assert result['forecast'] is None
        assert result['grid_info']['office'] == 'LOT'

    @patch('weather_providers.requests.get')
    def test_fetch_weather_data_network_error(
        self,
        mock_get: MagicMock,
        nws_provider: NationalWeatherServiceProvider,
    ) -> None:
        """Test fetch weather data with network error"""

        mock_get.side_effect = requests.RequestException('Network error')

        result = nws_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    def test_process_weather_data_with_alerts(
        self,
        nws_provider: NationalWeatherServiceProvider,
        mock_points_response: dict[str, Any],
        mock_alerts_response: dict[str, Any],
        mock_forecast_response: dict[str, Any],
    ) -> None:
        """Test processing weather data with alerts"""

        raw_data = {
            'points': mock_points_response,
            'alerts': mock_alerts_response,
            'forecast': mock_forecast_response,
            'grid_info': {'office': 'LOT', 'x': 75, 'y': 73},
        }

        result = nws_provider.process_weather_data(raw_data, 'Chicago')

        assert result is not None
        assert result['provider'] == 'NationalWeatherService'
        assert result['location_name'] == 'Chicago'
        assert 'timestamp' in result

        # Check alerts processing
        alerts = result['alerts']
        assert alerts['active_count'] == EXPECTED_ALERT_COUNT
        assert alerts['has_warnings'] is True  # Has Severe alert
        assert len(alerts['alerts']) == EXPECTED_ALERT_COUNT

        # Check first alert (Severe Thunderstorm Warning)
        severe_alert = alerts['alerts'][0]
        assert severe_alert['type'] == 'Severe Thunderstorm Warning'
        assert severe_alert['severity'] == 'Severe'
        assert severe_alert['color'] == '#FF0000'  # Red for severe
        assert severe_alert['headline'] == 'Severe Thunderstorm Warning issued for Cook'
        assert severe_alert['areas'] == 'Cook County, IL'

        # Check second alert (Winter Weather Advisory)
        minor_alert = alerts['alerts'][1]
        assert minor_alert['type'] == 'Winter Weather Advisory'
        assert minor_alert['severity'] == 'Minor'
        assert minor_alert['color'] == '#FFD700'  # Gold for minor

        # Check forecast processing
        forecast = result['forecast']
        assert forecast['source'] == 'National Weather Service'
        assert len(forecast['periods']) == 1
        assert forecast['periods'][0]['name'] == 'Tonight'
        assert forecast['periods'][0]['temperature'] == FORECAST_TEMP

    def test_process_weather_data_no_alerts(
        self,
        nws_provider: NationalWeatherServiceProvider,
        mock_points_response: dict[str, Any],
    ) -> None:
        """Test processing weather data with no alerts"""

        raw_data = {
            'points': mock_points_response,
            'alerts': {'features': []},
            'forecast': None,
            'grid_info': {'office': 'LOT', 'x': 75, 'y': 73},
        }

        result = nws_provider.process_weather_data(raw_data, 'Chicago')

        assert result is not None
        alerts = result['alerts']
        assert alerts['active_count'] == 0
        assert alerts['has_warnings'] is False
        assert len(alerts['alerts']) == 0

    def test_process_weather_data_empty_data(
        self,
        nws_provider: NationalWeatherServiceProvider,
    ) -> None:
        """Test processing empty weather data"""

        result = nws_provider.process_weather_data({}, 'Chicago')

        # Empty data dict is falsy and should return None
        assert result is None

    def test_process_weather_data_none_input(
        self,
        nws_provider: NationalWeatherServiceProvider,
    ) -> None:
        """Test processing None input"""

        result = nws_provider.process_weather_data(None, 'Chicago')  # type: ignore[arg-type]

        assert result is None

    def test_severity_color_mapping(
        self,
        nws_provider: NationalWeatherServiceProvider,
    ) -> None:
        """Test alert severity to color mapping"""

        test_cases = [
            ('Extreme', '#8B0000'),  # Dark red
            ('Severe', '#FF0000'),  # Red
            ('Moderate', '#FF8C00'),  # Dark orange
            ('Minor', '#FFD700'),  # Gold
            ('Unknown', '#1E90FF'),  # Dodger blue
            ('', '#1E90FF'),  # Default to blue
        ]

        for severity, expected_color in test_cases:
            raw_data = {
                'alerts': {
                    'features': [
                        {
                            'properties': {
                                'id': 'test',
                                'event': 'Test Alert',
                                'severity': severity,
                            }
                        }
                    ]
                },
                'forecast': None,
            }

            result = nws_provider.process_weather_data(raw_data, 'Test')
            assert result is not None
            alert = result['alerts']['alerts'][0]
            assert alert['color'] == expected_color

    @patch('weather_providers.requests.get')
    def test_get_weather_integration(
        self,
        mock_get: MagicMock,
        nws_provider: NationalWeatherServiceProvider,
        mock_points_response: dict[str, Any],
        mock_alerts_response: dict[str, Any],
        mock_forecast_response: dict[str, Any],
    ) -> None:
        """Test the complete get_weather flow"""

        mock_responses = [
            MagicMock(
                status_code=200, json=MagicMock(return_value=mock_points_response)
            ),
            MagicMock(
                status_code=200, json=MagicMock(return_value=mock_alerts_response)
            ),
            MagicMock(
                status_code=200, json=MagicMock(return_value=mock_forecast_response)
            ),
        ]

        mock_get.side_effect = mock_responses

        result = nws_provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')

        assert result is not None
        assert result['provider'] == 'NationalWeatherService'
        assert result['location_name'] == 'Chicago'
        assert result['alerts']['active_count'] == EXPECTED_ALERT_COUNT
        assert result['alerts']['has_warnings'] is True

    @patch('weather_providers.requests.get')
    def test_get_weather_api_failure(
        self,
        mock_get: MagicMock,
        nws_provider: NationalWeatherServiceProvider,
    ) -> None:
        """Test get_weather when API fails"""

        mock_get.side_effect = Exception('API Error')

        result = nws_provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')

        assert result is None

    def test_provider_info(self, nws_provider: NationalWeatherServiceProvider) -> None:
        """Test provider info method"""

        info = nws_provider.get_provider_info()

        assert info['name'] == 'NationalWeatherService'
        assert info['timeout'] == PROVIDER_TIMEOUT
        assert 'weather alerts' in info['description']
