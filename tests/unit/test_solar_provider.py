from datetime import datetime
from typing import Any

import pytest

from weather_providers import SolarDataProvider


# Test constants
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298
PROVIDER_TIMEOUT = 10


class TestSolarDataProvider:
    """Test the solar data provider for sunrise/sunset calculations"""

    @pytest.fixture
    def solar_provider(self) -> SolarDataProvider:
        """Create a solar data provider instance for testing"""
        return SolarDataProvider()

    @pytest.fixture
    def mock_solar_request(self) -> dict[str, Any]:
        """Mock solar data request for testing"""
        return {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            'date': '2025-07-23',  # Summer date for testing
        }

    def test_solar_provider_initialization(
        self, solar_provider: SolarDataProvider
    ) -> None:
        """Test solar data provider initialization"""
        assert solar_provider.name == 'SolarDataProvider'
        assert solar_provider.timeout == PROVIDER_TIMEOUT

    def test_fetch_weather_data_returns_none(
        self, solar_provider: SolarDataProvider
    ) -> None:
        """Test that fetch_weather_data returns None as provider processes data"""
        result = solar_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)
        assert result is None

    def test_process_weather_data_summer_solstice(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test solar calculations for summer solstice (longest day)"""

        # Summer solstice 2025
        summer_request = {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            'date': '2025-06-21',
        }

        result = solar_provider.process_weather_data(
            summer_request, 'Chicago', 'America/Chicago'
        )

        assert result is not None
        assert result['provider'] == 'SolarDataProvider'
        assert result['location_name'] == 'Chicago'
        assert 'timestamp' in result

        # Check solar data structure
        solar = result['solar']
        assert 'times' in solar
        assert 'daylight' in solar
        assert 'location' in solar

        times = solar['times']

        # Should have all required time fields
        assert 'sunrise' in times
        assert 'sunset' in times
        assert 'solar_noon' in times

        # Times should be valid datetime strings
        assert times['sunrise'] is not None
        assert times['sunset'] is not None
        assert times['solar_noon'] is not None

    def test_process_weather_data_winter_solstice(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test solar calculations for winter solstice (shortest day)"""

        # Winter solstice 2025
        winter_request = {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            'date': '2025-12-21',
        }

        result = solar_provider.process_weather_data(
            winter_request, 'Chicago', 'America/Chicago'
        )

        assert result is not None
        solar = result['solar']
        times = solar['times']

        # Should still have valid times even in winter
        assert times['sunrise'] is not None
        assert times['sunset'] is not None

        # Check that winter day is shorter than summer (basic sanity check)
        sunrise = datetime.fromisoformat(times['sunrise'].replace('Z', '+00:00'))
        sunset = datetime.fromisoformat(times['sunset'].replace('Z', '+00:00'))
        winter_duration = sunset - sunrise

        # Winter day should be less than 10 hours in Chicago
        assert winter_duration.total_seconds() < 10 * 3600

    def test_process_weather_data_arctic_location(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test solar calculations for arctic location (polar day/night)"""

        # Northern Alaska in summer
        arctic_request = {
            'lat': 70.0,  # Well above Arctic Circle
            'lon': -150.0,
            'date': '2025-06-21',  # Summer solstice
        }

        result = solar_provider.process_weather_data(
            arctic_request, 'Arctic', 'America/Anchorage'
        )

        assert result is not None
        solar = result['solar']
        times = solar['times']

        # Should handle polar day scenario
        assert 'sunrise' in times
        assert 'sunset' in times

        # Daylight should indicate continuous daylight
        daylight = solar['daylight']
        assert 'progress' in daylight
        assert 'is_daylight' in daylight

    def test_process_weather_data_default_date(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test solar calculations with no specific date (should use today)"""

        no_date_request = {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            # No date field - should default to today
        }

        result = solar_provider.process_weather_data(
            no_date_request, 'Chicago', 'America/Chicago'
        )

        assert result is not None
        solar = result['solar']
        location = solar['location']

        # Should have location info (date is not in this structure)
        assert 'timezone' in location

    def test_process_weather_data_empty_request(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test processing empty request"""

        result = solar_provider.process_weather_data({}, 'Chicago')

        # Should return None for empty data
        assert result is None

    def test_process_weather_data_none_input(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test processing None input"""

        result = solar_provider.process_weather_data(None, 'Chicago')  # type: ignore[arg-type]

        assert result is None

    def test_solar_progress_calculation(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test that solar progress is calculated correctly"""

        request = {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            'date': '2025-07-23',
        }

        result = solar_provider.process_weather_data(
            request, 'Chicago', 'America/Chicago'
        )

        assert result is not None
        solar = result['solar']
        daylight = solar['daylight']
        solar_elevation = solar['solar_elevation']

        # Should have daylight and elevation fields
        assert 'progress' in daylight
        assert 'is_daylight' in daylight
        assert 'current_degrees' in solar_elevation

        # Progress should be valid numbers
        assert isinstance(daylight['progress'], int | float)
        assert isinstance(solar_elevation['current_degrees'], int | float)
        assert isinstance(daylight['is_daylight'], bool)

        # Daylight progress should be 0-1 (not 0-100)
        assert 0 <= daylight['progress'] <= 1

    def test_solar_times_order(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test that solar times are in logical order"""

        request = {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            'date': '2025-07-23',
        }

        result = solar_provider.process_weather_data(
            request, 'Chicago', 'America/Chicago'
        )

        assert result is not None
        times = result['solar']['times']

        # Convert times to datetime objects for comparison
        sunrise = datetime.fromisoformat(times['sunrise'].replace('Z', '+00:00'))
        solar_noon = datetime.fromisoformat(times['solar_noon'].replace('Z', '+00:00'))
        sunset = datetime.fromisoformat(times['sunset'].replace('Z', '+00:00'))

        # Times should be in logical order
        assert sunrise < solar_noon < sunset

    def test_get_weather_integration(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test complete get_weather flow"""

        # Since this provider doesn't fetch data, get_weather should return None
        result = solar_provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')

        assert result is None

    def test_provider_info(self, solar_provider: SolarDataProvider) -> None:
        """Test provider info method"""

        info = solar_provider.get_provider_info()

        assert info['name'] == 'SolarDataProvider'
        assert info['timeout'] == PROVIDER_TIMEOUT
        assert 'solar' in info['description'].lower()

    def test_timezone_handling(
        self,
        solar_provider: SolarDataProvider,
    ) -> None:
        """Test different timezone handling"""

        request = {
            'lat': CHICAGO_LAT,
            'lon': CHICAGO_LON,
            'date': '2025-07-23',
        }

        # Test with specific timezone
        result_chicago = solar_provider.process_weather_data(
            request, 'Chicago', 'America/Chicago'
        )

        # Test with UTC
        result_utc = solar_provider.process_weather_data(request, 'Chicago', 'UTC')

        assert result_chicago is not None
        assert result_utc is not None

        # Both should have valid data but different timezones
        assert result_chicago['solar']['location']['timezone'] == 'America/Chicago'
        assert result_utc['solar']['location']['timezone'] == 'UTC'
