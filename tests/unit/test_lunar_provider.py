# ABOUTME: Unit tests for LunarDataProvider functionality
# ABOUTME: Tests moon phase calculations, illumination, and astronomical data

from datetime import datetime, timezone

from weather_providers import LunarDataProvider


# Test constants to avoid magic numbers
MAX_ILLUMINATION_PERCENT = 100
MAX_LUNAR_AGE_DAYS = 30
JULIAN_DAY_TOLERANCE = 0.01
ILLUMINATION_NEW_MOON_THRESHOLD = 0.05
ILLUMINATION_FULL_MOON_THRESHOLD = 0.95


class TestLunarDataProvider:
    """Test the lunar data provider functionality"""

    def setup_method(self) -> None:
        """Set up test fixtures"""
        self.provider = LunarDataProvider()

    def test_provider_initialization(self) -> None:
        """Test provider initialization"""
        assert self.provider.name == 'LunarDataProvider'

    def test_fetch_weather_data_returns_none(self) -> None:
        """Test that fetch_weather_data returns None (provider calculates data)"""
        result = self.provider.fetch_weather_data(41.8781, -87.6298)
        assert result is None

    def test_process_weather_data_basic(self) -> None:
        """Test basic lunar data processing"""
        result = self.provider.process_weather_data({}, 'Test Location')

        assert result is not None
        assert result['provider'] == 'LunarDataProvider'
        assert result['location_name'] == 'Test Location'
        assert 'lunar_data' in result
        assert 'calculated_at' in result

        lunar_data = result['lunar_data']
        assert 'current_phase' in lunar_data
        assert 'next_phases' in lunar_data
        assert 'lunar_cycle' in lunar_data
        assert 'astronomical_data' in lunar_data

    def test_current_phase_structure(self) -> None:
        """Test current phase data structure"""
        result = self.provider.process_weather_data({}, 'Test Location')
        assert result is not None
        current_phase = result['lunar_data']['current_phase']

        assert 'name' in current_phase
        assert 'illumination_percent' in current_phase
        assert 'lunar_age_days' in current_phase
        assert 'description' in current_phase

        # Validate data types and ranges
        assert isinstance(current_phase['name'], str)
        assert 0 <= current_phase['illumination_percent'] <= MAX_ILLUMINATION_PERCENT
        assert 0 <= current_phase['lunar_age_days'] <= MAX_LUNAR_AGE_DAYS
        assert isinstance(current_phase['description'], str)

    def test_next_phases_structure(self) -> None:
        """Test next phases data structure"""
        result = self.provider.process_weather_data({}, 'Test Location')
        assert result is not None
        next_phases = result['lunar_data']['next_phases']

        assert 'new_moon' in next_phases
        assert 'full_moon' in next_phases

        for phase_data in next_phases.values():
            assert 'date' in phase_data
            assert 'days_until' in phase_data
            assert 'countdown_text' in phase_data
            assert isinstance(phase_data['days_until'], int | float)
            assert phase_data['days_until'] >= 0

    def test_julian_day_conversion(self) -> None:
        """Test Julian Day Number conversion"""
        # Test with known date: January 1, 2000, 12:00 UTC
        test_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        julian_day = self.provider._to_julian_day(test_date)

        # Expected Julian Day for Jan 1, 2000, 12:00 UTC is 2451545.0
        expected_jd = 2451545.0
        assert abs(julian_day - expected_jd) < JULIAN_DAY_TOLERANCE

    def test_julian_day_roundtrip(self) -> None:
        """Test Julian Day conversion roundtrip"""
        original_date = datetime(2024, 7, 24, 15, 30, 45, tzinfo=timezone.utc)
        julian_day = self.provider._to_julian_day(original_date)
        converted_back = self.provider._from_julian_day(julian_day)

        # Should be very close (within seconds)
        time_diff = abs((converted_back - original_date).total_seconds())
        assert time_diff < 1.0

    def test_lunar_age_calculation(self) -> None:
        """Test lunar age calculation"""
        # Use a known Julian day
        test_julian_day = 2451545.0  # Jan 1, 2000
        lunar_age = self.provider._calculate_lunar_age(test_julian_day)

        # Lunar age should be between 0 and synodic month length
        assert 0 <= lunar_age <= self.provider.SYNODIC_MONTH

    def test_illumination_calculation(self) -> None:
        """Test moon illumination calculation"""
        # Test known points in lunar cycle
        new_moon_age = 0.0
        full_moon_age = self.provider.SYNODIC_MONTH / 2

        new_moon_illumination = self.provider._calculate_illumination(new_moon_age)
        full_moon_illumination = self.provider._calculate_illumination(full_moon_age)

        # New moon should be close to 0% illumination
        assert new_moon_illumination < ILLUMINATION_NEW_MOON_THRESHOLD

        # Full moon should be close to 100% illumination
        assert full_moon_illumination > ILLUMINATION_FULL_MOON_THRESHOLD

    def test_phase_name_determination(self) -> None:
        """Test moon phase name determination"""
        # Test various lunar ages
        test_cases = [
            (0.5, 'New Moon'),
            (7.5, 'First Quarter'),
            (14.5, 'Full Moon'),
            (22.0, 'Third Quarter'),
            (3.0, 'Waxing Crescent'),
            (11.0, 'Waxing Gibbous'),
            (18.0, 'Waning Gibbous'),
            (26.0, 'Waning Crescent'),
        ]

        for lunar_age, expected_phase in test_cases:
            illumination = self.provider._calculate_illumination(lunar_age)
            phase_name = self.provider._get_phase_name(lunar_age, illumination)
            assert (
                phase_name == expected_phase
            ), f'Age {lunar_age} should be {expected_phase}, got {phase_name}'

    def test_next_moon_calculations(self) -> None:
        """Test next new moon and full moon calculations"""
        test_date = datetime(2024, 7, 24, 12, 0, 0, tzinfo=timezone.utc)

        next_new_moon = self.provider._calculate_next_new_moon(test_date)
        next_full_moon = self.provider._calculate_next_full_moon(test_date)

        # Both should be in the future
        assert next_new_moon > test_date
        assert next_full_moon > test_date

        # Should be reasonable timeframes (within 30 days)
        new_moon_days = (next_new_moon - test_date).total_seconds() / (24 * 3600)
        full_moon_days = (next_full_moon - test_date).total_seconds() / (24 * 3600)

        assert 0 < new_moon_days <= 30
        assert 0 < full_moon_days <= 30

    def test_countdown_formatting(self) -> None:
        """Test countdown text formatting"""
        test_cases = [
            (0.5, '12 hours'),
            (0.8, '19 hours'),
            (1.0, '1 day'),
            (1.5, '1 day'),
            (2.0, '2 days'),
            (5.3, '5 days'),
            (15.0, '15 days'),
        ]

        for days, expected_text in test_cases:
            result = self.provider._format_countdown(days)
            assert result == expected_text

    def test_phase_descriptions(self) -> None:
        """Test phase descriptions"""
        test_phases = [
            'New Moon',
            'Waxing Crescent',
            'First Quarter',
            'Waxing Gibbous',
            'Full Moon',
            'Waning Gibbous',
            'Third Quarter',
            'Waning Crescent',
        ]

        for phase_name in test_phases:
            description = self.provider._get_phase_description(phase_name, 0.5)
            assert isinstance(description, str)
            assert len(description) > 10  # Should be descriptive

    def test_viewing_recommendations_structure(self) -> None:
        """Test viewing recommendations structure"""
        for phase_name in ['New Moon', 'Full Moon', 'First Quarter', 'Waxing Crescent']:
            recommendations = self.provider._get_viewing_recommendations(
                phase_name, 0.5
            )

            assert 'visibility' in recommendations
            assert 'photography' in recommendations
            assert 'best_time' in recommendations
            assert 'stargazing' in recommendations

            # All should be strings
            for key, value in recommendations.items():
                assert isinstance(value, str)

    def test_lunar_cycle_progress(self) -> None:
        """Test lunar cycle progress calculation"""
        result = self.provider.process_weather_data({}, 'Test Location')
        assert result is not None
        lunar_cycle = result['lunar_data']['lunar_cycle']

        assert 'current_cycle_progress' in lunar_cycle
        assert 'synodic_month_days' in lunar_cycle

        # Progress should be 0-100%
        progress = lunar_cycle['current_cycle_progress']
        assert 0 <= progress <= 100

        # Synodic month should be close to known value
        assert abs(lunar_cycle['synodic_month_days'] - 29.53) < 0.1

    def test_astronomical_data_structure(self) -> None:
        """Test astronomical data structure"""
        result = self.provider.process_weather_data({}, 'Test Location')
        assert result is not None
        astro_data = result['lunar_data']['astronomical_data']

        assert 'julian_day' in astro_data
        assert 'lunar_distance_varies' in astro_data
        assert 'best_viewing' in astro_data

        # Julian day should be reasonable for current era
        jd = astro_data['julian_day']
        assert 2450000 < jd < 2500000  # Between 1995 and 2132

    def test_specific_date_calculation(self) -> None:
        """Test lunar calculation validation with current date"""
        # Test with current date - basic validation that calculations work
        result = self.provider.process_weather_data({}, 'Test Location')

        # Basic validation that it worked
        assert result is not None
        lunar_data = result['lunar_data']
        assert lunar_data is not None
        assert isinstance(lunar_data['current_phase']['name'], str)
        assert 0 <= lunar_data['current_phase']['illumination_percent'] <= 100

        # Verify Julian Day calculation is reasonable for current era
        astro_data = lunar_data['astronomical_data']
        jd = astro_data['julian_day']
        # Current Julian Day should be between 2450000 (1995) and 2500000 (2132)
        assert 2450000 < jd < 2500000

    def test_exception_handling(self) -> None:
        """Test exception handling in lunar calculations"""
        # This should not raise an exception even with edge cases
        result = self.provider.process_weather_data({}, 'Test Location')
        assert result is not None

    def test_timezone_handling(self) -> None:
        """Test timezone handling in lunar data"""
        result_utc = self.provider.process_weather_data({}, 'Test Location', 'UTC')
        result_chicago = self.provider.process_weather_data(
            {}, 'Test Location', 'America/Chicago'
        )

        assert result_utc is not None
        assert result_chicago is not None

        # Lunar calculations should be consistent regardless of display timezone
        # (since we calculate in UTC internally)
        assert (
            result_utc['lunar_data']['current_phase']['name']
            == result_chicago['lunar_data']['current_phase']['name']
        )
        assert (
            result_utc['lunar_data']['current_phase']['illumination_percent']
            == result_chicago['lunar_data']['current_phase']['illumination_percent']
        )

    def test_constants_validity(self) -> None:
        """Test that lunar constants are reasonable"""
        # Synodic month should be close to known astronomical value
        assert 29.5 < self.provider.SYNODIC_MONTH < 29.6

        # New moon reference should be reasonable Julian day
        assert 2450000 < self.provider.NEW_MOON_REFERENCE < 2500000


class TestLunarDataProviderIntegration:
    """Integration tests for lunar data provider"""

    def setup_method(self) -> None:
        """Set up test fixtures for integration tests"""
        self.provider = LunarDataProvider()

    def test_full_lunar_data_generation(self) -> None:
        """Test complete lunar data generation"""
        result = self.provider.process_weather_data({}, 'Integration Test')

        # Verify complete data structure
        assert result is not None
        lunar_data = result['lunar_data']

        # Current phase completeness
        current = lunar_data['current_phase']
        assert current['name'] in [
            'New Moon',
            'Waxing Crescent',
            'First Quarter',
            'Waxing Gibbous',
            'Full Moon',
            'Waning Gibbous',
            'Third Quarter',
            'Waning Crescent',
        ]
        assert len(current['description']) > 20

        # Next phases should be reasonable
        next_new = lunar_data['next_phases']['new_moon']
        next_full = lunar_data['next_phases']['full_moon']
        assert 0 < next_new['days_until'] <= 30
        assert 0 < next_full['days_until'] <= 30

        # Viewing recommendations should be complete
        viewing = lunar_data['astronomical_data']['best_viewing']
        required_keys = ['visibility', 'photography', 'best_time', 'stargazing']
        for key in required_keys:
            assert key in viewing
            assert len(viewing[key]) > 5

    def test_lunar_accuracy_verification(self) -> None:
        """Test lunar calculation accuracy against known values"""
        # This is a basic sanity check - more detailed accuracy testing
        # would require comparison with astronomical ephemeris data
        result = self.provider.process_weather_data({}, 'Accuracy Test')
        assert result is not None
        lunar_data = result['lunar_data']

        # Basic sanity checks
        illumination = lunar_data['current_phase']['illumination_percent']
        lunar_age = lunar_data['current_phase']['lunar_age_days']

        # Illumination and age should be correlated
        if lunar_age < 2 or lunar_age > 27:
            # Near new moon
            assert illumination < 20
        elif 13 < lunar_age < 16:
            # Near full moon
            assert illumination > 80

    def test_multiple_location_consistency(self) -> None:
        """Test that lunar data is consistent across locations"""
        # Lunar data should be the same regardless of Earth location
        # (only timezone display might differ)
        result1 = self.provider.process_weather_data({}, 'New York', 'America/New_York')
        result2 = self.provider.process_weather_data({}, 'Tokyo', 'Asia/Tokyo')
        result3 = self.provider.process_weather_data({}, 'London', 'Europe/London')

        assert result1 is not None
        assert result2 is not None
        assert result3 is not None

        # Core lunar data should be identical
        phase1 = result1['lunar_data']['current_phase']
        phase2 = result2['lunar_data']['current_phase']
        phase3 = result3['lunar_data']['current_phase']

        assert phase1['name'] == phase2['name'] == phase3['name']
        assert (
            phase1['illumination_percent']
            == phase2['illumination_percent']
            == phase3['illumination_percent']
        )
        assert (
            phase1['lunar_age_days']
            == phase2['lunar_age_days']
            == phase3['lunar_age_days']
        )

    def test_performance_characteristics(self) -> None:
        """Test that lunar calculations are performant"""
        import time

        start_time = time.time()

        # Run multiple calculations
        for _ in range(10):
            result = self.provider.process_weather_data({}, 'Performance Test')
            assert result is not None

        end_time = time.time()
        average_time = (end_time - start_time) / 10

        # Should complete in reasonable time (less than 100ms per calculation)
        assert (
            average_time < 0.1
        ), f'Lunar calculation took {average_time:.3f}s on average'
