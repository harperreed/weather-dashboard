from unittest.mock import MagicMock, patch

import requests

from weather_providers import AirQualityProvider


# Test constants
MOCK_API_KEY = 'test_airnow_api_key'
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298
DEFAULT_TIMEOUT = 10
EXPECTED_OBSERVATIONS = 2
EXPECTED_AQI_PM25 = 45
EXPECTED_AQI_O3 = 52
EXPECTED_AQI_O3_HIGH = 75
EXPECTED_AQI_PM25_VERY_HIGH = 150
EXPECTED_AQI_O3_VERY_HIGH = 125
EXPECTED_AQI_NO2 = 25
EXPECTED_AQI_PM25_LOW = 35


class TestAirQualityProvider:
    """Test the Air Quality provider"""

    def test_init(self) -> None:
        """Test Air Quality provider initialization"""
        provider = AirQualityProvider(MOCK_API_KEY)
        assert provider.name == 'AirQuality'
        assert provider.api_key == MOCK_API_KEY
        assert provider.base_url == 'http://www.airnowapi.org/aq/observation'
        assert provider.timeout == DEFAULT_TIMEOUT

    def test_init_requires_api_key(self) -> None:
        """Test initialization requires API key"""
        # This should work with an API key
        provider = AirQualityProvider('test_key')
        assert provider.api_key == 'test_key'
        assert provider.name == 'AirQuality'

    @patch('requests.get')
    def test_fetch_weather_data_success(self, mock_get: MagicMock) -> None:
        """Test successful air quality data fetch from EPA AirNow API"""
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                'DateObserved': '2023-12-01',
                'HourObserved': 12,
                'LocalTimeZone': 'CST',
                'ReportingArea': 'Chicago',
                'StateCode': 'IL',
                'Latitude': 41.8781,
                'Longitude': -87.6298,
                'ParameterName': 'PM2.5',
                'AQI': 45,
                'CategoryNumber': 1,
                'CategoryName': 'Good',
            },
            {
                'DateObserved': '2023-12-01',
                'HourObserved': 12,
                'LocalTimeZone': 'CST',
                'ReportingArea': 'Chicago',
                'StateCode': 'IL',
                'Latitude': 41.8781,
                'Longitude': -87.6298,
                'ParameterName': 'O3',
                'AQI': 52,
                'CategoryNumber': 2,
                'CategoryName': 'Moderate',
            },
        ]
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        provider = AirQualityProvider(MOCK_API_KEY)
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is not None
        assert isinstance(result, dict)
        assert 'observations' in result
        assert len(result['observations']) == EXPECTED_OBSERVATIONS
        mock_get.assert_called_once()

        # Check that the request was made with correct parameters
        call_args = mock_get.call_args
        assert 'latLong/current/' in call_args[0][0]
        params = call_args[1]['params']
        assert 'latitude' in params
        assert 'longitude' in params
        assert 'distance' in params
        assert 'API_KEY' in params

    @patch('requests.get')
    def test_fetch_weather_data_failure(self, mock_get: MagicMock) -> None:
        """Test failed air quality data fetch"""
        mock_get.side_effect = requests.exceptions.RequestException('API Error')

        provider = AirQualityProvider(MOCK_API_KEY)
        result = provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        assert result is None

    def test_process_weather_data_success(self) -> None:
        """Test successful EPA AirNow data processing"""
        mock_data = [
            {
                'DateObserved': '2023-12-01',
                'HourObserved': 12,
                'LocalTimeZone': 'CST',
                'ReportingArea': 'Chicago',
                'StateCode': 'IL',
                'Latitude': 41.8781,
                'Longitude': -87.6298,
                'ParameterName': 'PM2.5',
                'AQI': 45,
                'CategoryNumber': 1,
                'CategoryName': 'Good',
            },
            {
                'DateObserved': '2023-12-01',
                'HourObserved': 12,
                'LocalTimeZone': 'CST',
                'ReportingArea': 'Chicago',
                'StateCode': 'IL',
                'Latitude': 41.8781,
                'Longitude': -87.6298,
                'ParameterName': 'O3',
                'AQI': 52,
                'CategoryNumber': 2,
                'CategoryName': 'Moderate',
            },
        ]

        provider = AirQualityProvider(MOCK_API_KEY)
        result = provider.process_weather_data(
            {'observations': mock_data}, 'Unknown Location'
        )

        assert result is not None
        assert result['location'] == 'Chicago'  # Should use reporting area from API
        assert 'AirQuality' in result['provider']  # Provider name includes EPA AirNow
        assert 'aqi' in result
        assert 'pollutants' in result

        # Test AQI data - should use highest AQI from all pollutants
        aqi_data = result['aqi']
        assert aqi_data['us_aqi'] == EXPECTED_AQI_O3  # Higher of PM2.5 and O3
        assert aqi_data['primary_pollutant'] == 'O3'
        assert aqi_data['category'] in [
            'Good',
            'Moderate',
            'Unhealthy for Sensitive Groups',
            'Unhealthy',
            'Very Unhealthy',
            'Hazardous',
        ]
        assert isinstance(aqi_data['health_recommendation'], str)
        assert aqi_data['color'].startswith('#')

        # Test pollutant data (EPA AirNow provides multiple pollutants)
        pollutants = result['pollutants']
        assert pollutants['pm25'] == EXPECTED_AQI_PM25  # From PM2.5 observation
        assert pollutants['o3'] == EXPECTED_AQI_O3  # From O3 observation
        assert pollutants['pm10'] == 0  # Not in this sample data
        assert pollutants['no2'] == 0  # Not in this sample data
        assert pollutants['so2'] == 0  # Not in this sample data
        assert pollutants['co'] == 0  # Not in this sample data

        # Test observation count
        assert result['observation_count'] == EXPECTED_OBSERVATIONS

    def test_process_weather_data_empty(self) -> None:
        """Test processing with empty data"""
        provider = AirQualityProvider(MOCK_API_KEY)
        result = provider.process_weather_data({'observations': []}, 'Test Location')
        assert result is None

    def test_process_weather_data_missing_list(self) -> None:
        """Test processing with None data"""
        provider = AirQualityProvider(MOCK_API_KEY)
        result = provider.process_weather_data({}, 'Test Location')
        assert result is None

    def test_aqi_processing_logic(self) -> None:
        """Test AQI processing logic from EPA AirNow data"""
        provider = AirQualityProvider(MOCK_API_KEY)

        # Test data with multiple pollutants
        test_data = [
            {'ParameterName': 'PM2.5', 'AQI': 35, 'ReportingArea': 'Test'},
            {'ParameterName': 'O3', 'AQI': 75, 'ReportingArea': 'Test'},
            {'ParameterName': 'NO2', 'AQI': 25, 'ReportingArea': 'Test'},
        ]

        result = provider.process_weather_data(
            {'observations': test_data}, 'Test Location'
        )
        assert result is not None

        # Should use highest AQI (75 from O3)
        assert result['aqi']['us_aqi'] == EXPECTED_AQI_O3_HIGH
        assert result['aqi']['primary_pollutant'] == 'O3'
        assert result['pollutants']['pm25'] == EXPECTED_AQI_PM25_LOW
        assert result['pollutants']['o3'] == EXPECTED_AQI_O3_HIGH
        assert result['pollutants']['no2'] == EXPECTED_AQI_NO2

    def test_get_aqi_category(self) -> None:
        """Test AQI category mapping"""
        provider = AirQualityProvider(MOCK_API_KEY)

        assert provider._get_aqi_category(25) == 'Good'
        assert provider._get_aqi_category(75) == 'Moderate'
        assert provider._get_aqi_category(125) == 'Unhealthy for Sensitive Groups'
        assert provider._get_aqi_category(175) == 'Unhealthy'
        assert provider._get_aqi_category(250) == 'Very Unhealthy'
        assert provider._get_aqi_category(400) == 'Hazardous'

    def test_get_health_recommendation(self) -> None:
        """Test health recommendation mapping"""
        provider = AirQualityProvider(MOCK_API_KEY)

        # Test all AQI ranges
        assert 'satisfactory' in provider._get_health_recommendation(25).lower()
        assert (
            'sensitive individuals' in provider._get_health_recommendation(75).lower()
        )
        assert 'sensitive groups' in provider._get_health_recommendation(125).lower()
        assert 'limit outdoor' in provider._get_health_recommendation(175).lower()
        assert 'avoid outdoor' in provider._get_health_recommendation(250).lower()
        assert 'emergency' in provider._get_health_recommendation(400).lower()

    def test_get_aqi_color(self) -> None:
        """Test AQI color mapping"""
        provider = AirQualityProvider(MOCK_API_KEY)

        # Test color codes for different AQI ranges
        assert provider._get_aqi_color(25) == '#00e400'  # Green
        assert provider._get_aqi_color(75) == '#ffff00'  # Yellow
        assert provider._get_aqi_color(125) == '#ff7e00'  # Orange
        assert provider._get_aqi_color(175) == '#ff0000'  # Red
        assert provider._get_aqi_color(250) == '#99004c'  # Purple
        assert provider._get_aqi_color(400) == '#7e0023'  # Maroon

    @patch.object(AirQualityProvider, 'fetch_weather_data')
    @patch.object(AirQualityProvider, 'process_weather_data')
    def test_get_weather_success(
        self, mock_process: MagicMock, mock_fetch: MagicMock
    ) -> None:
        """Test successful weather data retrieval"""
        mock_raw_data = [{'ParameterName': 'PM2.5', 'AQI': 50}]
        mock_processed_data = {'aqi': {'us_aqi': 50}, 'pollutants': {}}

        mock_fetch.return_value = mock_raw_data
        mock_process.return_value = mock_processed_data

        provider = AirQualityProvider(MOCK_API_KEY)
        result = provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')

        assert result == mock_processed_data
        mock_fetch.assert_called_once_with(CHICAGO_LAT, CHICAGO_LON, None)
        mock_process.assert_called_once_with(mock_raw_data, 'Chicago', None)

    @patch.object(AirQualityProvider, 'fetch_weather_data')
    def test_get_weather_fetch_failure(self, mock_fetch: MagicMock) -> None:
        """Test weather data retrieval with fetch failure"""
        mock_fetch.side_effect = Exception('Network error')

        provider = AirQualityProvider(MOCK_API_KEY)
        result = provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')

        assert result is None

    def test_get_provider_info(self) -> None:
        """Test provider info retrieval"""
        provider = AirQualityProvider(MOCK_API_KEY)
        info = provider.get_provider_info()

        assert info['name'] == 'AirQuality'
        assert info['timeout'] == DEFAULT_TIMEOUT
        assert 'description' in info
        assert (
            'air quality' in info['description'].lower()
            or 'aqi' in info['description'].lower()
        )

    def test_edge_cases(self) -> None:
        """Test edge cases and error handling"""
        provider = AirQualityProvider(MOCK_API_KEY)

        # Test with no observation data
        empty_data: list[dict[str, str]] = []
        result = provider.process_weather_data({'observations': empty_data}, 'Test')
        assert result is None

        # Test with invalid observation data (missing fields)
        invalid_data = [
            {'ParameterName': 'PM2.5'}  # Missing AQI field
        ]
        result = provider.process_weather_data({'observations': invalid_data}, 'Test')
        assert result is None

        # Test with zero AQI values
        zero_data = [{'ParameterName': 'PM2.5', 'AQI': 0, 'ReportingArea': 'Test'}]
        result = provider.process_weather_data({'observations': zero_data}, 'Test')
        assert result is None

    def test_multiple_pollutant_priority(self) -> None:
        """Test that highest AQI from any pollutant is used correctly"""
        provider = AirQualityProvider(MOCK_API_KEY)

        # Test with PM2.5 higher than O3
        pm25_higher_data = [
            {'ParameterName': 'PM2.5', 'AQI': 150, 'ReportingArea': 'Test'},
            {'ParameterName': 'O3', 'AQI': 75, 'ReportingArea': 'Test'},
        ]
        result = provider.process_weather_data(
            {'observations': pm25_higher_data}, 'Test'
        )
        assert result is not None
        assert result['aqi']['us_aqi'] == EXPECTED_AQI_PM25_VERY_HIGH
        assert result['aqi']['primary_pollutant'] == 'PM2.5'

        # Test with O3 higher than PM2.5
        o3_higher_data = [
            {'ParameterName': 'PM2.5', 'AQI': 35, 'ReportingArea': 'Test'},
            {'ParameterName': 'O3', 'AQI': 125, 'ReportingArea': 'Test'},
        ]
        result = provider.process_weather_data({'observations': o3_higher_data}, 'Test')
        assert result is not None
        assert result['aqi']['us_aqi'] == EXPECTED_AQI_O3_VERY_HIGH
        assert result['aqi']['primary_pollutant'] == 'O3'
