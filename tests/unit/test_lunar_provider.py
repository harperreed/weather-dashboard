# ABOUTME: Unit tests for LunarDataProvider functionality
# ABOUTME: Tests moon phase calculations, illumination, and astronomical data

from datetime import date, datetime, timedelta, timezone

from weather_providers import LunarDataProvider


# Test constants to avoid magic numbers
MAX_ILLUMINATION_PERCENT = 100
MAX_LUNAR_AGE_DAYS = 30
JULIAN_DAY_TOLERANCE = 0.01
ILLUMINATION_NEW_MOON_THRESHOLD = 0.05
ILLUMINATION_FULL_MOON_THRESHOLD = 0.95

# Times published by the US Naval Observatory for Chicago (41.85, -87.65)
# and Tromso (69.6492, 18.9553): aa.usno.navy.mil/api/rstt/oneday.
TOLERANCE = 5  # minutes; the low-precision series is good to a few tenths of a degree
ALMANAC_CHICAGO_MOONRISE = '2026-09-02T21:52:00-05:00'
ALMANAC_CHICAGO_MOONSET = '2026-09-02T12:31:00-05:00'
# Chicago sets at 16:00 this day and never rises: the rise slipped past midnight.
NO_MOONRISE_DATE = datetime(2026, 9, 5, 12, tzinfo=timezone.utc)
# Tromso holds the moon above the horizon all day: no rise and no set.
HIGH_LATITUDE_DATE = datetime(2026, 9, 2, 12, tzinfo=timezone.utc)
# Days that fall back run twenty-five hours and repeat an hour of wall clock.
# Both crossings below sit in the repeated hour's second pass, bisected from a
# one-minute scan of the true local day.
BERLIN_FALL_BACK = datetime(2028, 10, 29, 12, tzinfo=timezone.utc)
BERLIN_FALL_BACK_MOONSET = '2028-10-29T02:39:00+01:00'
SANTIAGO_FALL_BACK = datetime(2021, 4, 3, 15, tzinfo=timezone.utc)
SANTIAGO_FALL_BACK_MOONRISE = '2021-04-03T23:24:00-04:00'

# Australia/Lord_Howe shifts by half an hour, so its transition days run 23.5
# and 24.5 hours. The rise below sits in the last half hour of a 24.5-hour day.
LORD_HOWE_SHORT_DAY = datetime(2035, 4, 1, 6, tzinfo=timezone.utc)
LORD_HOWE_LATE_MOONRISE = '2035-04-01T23:47:00+10:30'
LORD_HOWE = (-31.5553, 159.0821)

# A crossing in the local day's last half minute, where rounding to the nearest
# minute would carry the reported time past midnight.
CHICAGO_LATE_MOONRISE = datetime(2024, 6, 26, 18, tzinfo=timezone.utc)

# A synodic month is ~29.53 days, so the next new or full moon is always
# less than 30 days out.
MAX_DAYS_UNTIL_NEXT_PHASE = 30
MIN_PHASE_DESCRIPTION_LENGTH = 10
MIN_DETAILED_DESCRIPTION_LENGTH = 20
MAX_CYCLE_PROGRESS_PERCENT = 100
SYNODIC_MONTH_TOLERANCE_DAYS = 0.1
MIN_REASONABLE_JULIAN_DAY = 2450000  # 1995
MAX_REASONABLE_JULIAN_DAY = 2500000  # 2132
MIN_SYNODIC_MONTH_DAYS = 29.5
MAX_SYNODIC_MONTH_DAYS = 29.6
MIN_VIEWING_TEXT_LENGTH = 5
YOUNG_MOON_AGE_DAYS = 2
OLD_MOON_AGE_DAYS = 27
NEAR_NEW_MOON_ILLUMINATION_PERCENT = 20
FULL_MOON_AGE_LOWER_DAYS = 13
FULL_MOON_AGE_UPPER_DAYS = 16
NEAR_FULL_MOON_ILLUMINATION_PERCENT = 80
MAX_AVERAGE_CALCULATION_SECONDS = 0.1


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

        assert 0 < new_moon_days <= MAX_DAYS_UNTIL_NEXT_PHASE
        assert 0 < full_moon_days <= MAX_DAYS_UNTIL_NEXT_PHASE

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
            assert (
                len(description) > MIN_PHASE_DESCRIPTION_LENGTH
            )  # Should be descriptive

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
            for value in recommendations.values():
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
        assert 0 <= progress <= MAX_CYCLE_PROGRESS_PERCENT

        # Synodic month should be close to known value
        assert (
            abs(lunar_cycle['synodic_month_days'] - 29.53)
            < SYNODIC_MONTH_TOLERANCE_DAYS
        )

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
        assert (
            MIN_REASONABLE_JULIAN_DAY < jd < MAX_REASONABLE_JULIAN_DAY
        )  # Between 1995 and 2132

    def test_specific_date_calculation(self) -> None:
        """Test lunar calculation validation with current date"""
        # Test with current date - basic validation that calculations work
        result = self.provider.process_weather_data({}, 'Test Location')

        # Basic validation that it worked
        assert result is not None
        lunar_data = result['lunar_data']
        assert lunar_data is not None
        assert isinstance(lunar_data['current_phase']['name'], str)
        assert (
            0
            <= lunar_data['current_phase']['illumination_percent']
            <= MAX_ILLUMINATION_PERCENT
        )

        # Verify Julian Day calculation is reasonable for current era
        astro_data = lunar_data['astronomical_data']
        jd = astro_data['julian_day']
        # Current Julian Day should be between 2450000 (1995) and 2500000 (2132)
        assert MIN_REASONABLE_JULIAN_DAY < jd < MAX_REASONABLE_JULIAN_DAY

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
        assert (
            MIN_SYNODIC_MONTH_DAYS
            < self.provider.SYNODIC_MONTH
            < MAX_SYNODIC_MONTH_DAYS
        )

        # New moon reference should be reasonable Julian day
        assert (
            MIN_REASONABLE_JULIAN_DAY
            < self.provider.NEW_MOON_REFERENCE
            < MAX_REASONABLE_JULIAN_DAY
        )

    def test_moon_times_are_none_without_coordinates(self) -> None:
        """Without coordinates the provider reports no rise or set"""
        result = self.provider.process_weather_data({}, 'Test Location')

        assert result is not None
        current_phase = result['lunar_data']['current_phase']
        assert current_phase['moonrise'] is None
        assert current_phase['moonset'] is None

    def test_moonrise_matches_the_almanac_for_chicago(self) -> None:
        """Moonrise for Chicago on 2026-09-02 matches the published time"""
        moonrise, _ = self.provider.calculate_moon_times(
            datetime(2026, 9, 2, 12, tzinfo=timezone.utc),
            41.8781,
            -87.6298,
            'America/Chicago',
        )

        assert moonrise is not None
        assert self._minutes_from(moonrise, ALMANAC_CHICAGO_MOONRISE) <= TOLERANCE

    def test_moonset_matches_the_almanac_for_chicago(self) -> None:
        """Moonset for Chicago on 2026-09-02 matches the published time"""
        _, moonset = self.provider.calculate_moon_times(
            datetime(2026, 9, 2, 12, tzinfo=timezone.utc),
            41.8781,
            -87.6298,
            'America/Chicago',
        )

        assert moonset is not None
        assert self._minutes_from(moonset, ALMANAC_CHICAGO_MOONSET) <= TOLERANCE

    def test_a_day_without_a_moonrise_reports_none(self) -> None:
        """Roughly once a month a calendar day has no moonrise"""
        moonrise, moonset = self.provider.calculate_moon_times(
            NO_MOONRISE_DATE, 41.8781, -87.6298, 'America/Chicago'
        )

        assert moonrise is None
        assert moonset is not None

    def test_moonset_in_a_repeated_hour_is_not_cut_short(self) -> None:
        """A fall-back day repeats an hour; the set lands in its second pass"""
        _, moonset = self.provider.calculate_moon_times(
            BERLIN_FALL_BACK, 52.52, 13.405, 'Europe/Berlin'
        )

        assert moonset is not None
        assert self._minutes_from(moonset, BERLIN_FALL_BACK_MOONSET) <= TOLERANCE

    def test_moonrise_in_a_repeated_hour_is_not_cut_short(self) -> None:
        """The same trap on the rising edge, in the southern hemisphere"""
        moonrise, _ = self.provider.calculate_moon_times(
            SANTIAGO_FALL_BACK, -33.4489, -70.6693, 'America/Santiago'
        )

        assert moonrise is not None
        assert self._minutes_from(moonrise, SANTIAGO_FALL_BACK_MOONRISE) <= TOLERANCE

    def test_a_crossing_in_a_half_hour_zones_last_minutes_is_found(self) -> None:
        """A 24.5-hour day's final half hour is part of the day"""
        moonrise, _ = self.provider.calculate_moon_times(
            LORD_HOWE_SHORT_DAY, *LORD_HOWE, 'Australia/Lord_Howe'
        )

        assert moonrise is not None
        assert self._minutes_from(moonrise, LORD_HOWE_LATE_MOONRISE) <= TOLERANCE

    def test_a_crossing_never_carries_the_next_days_date(self) -> None:
        """Rounding to the nearest minute must not move the day"""
        moonrise, _ = self.provider.calculate_moon_times(
            CHICAGO_LATE_MOONRISE, 41.8781, -87.6298, 'America/Chicago'
        )

        assert moonrise is not None
        assert datetime.fromisoformat(moonrise).date() == date(2024, 6, 26)

    def test_high_latitude_day_without_a_crossing(self) -> None:
        """Tromso can go days with the moon always up or always down"""
        moonrise, moonset = self.provider.calculate_moon_times(
            HIGH_LATITUDE_DATE, 69.6492, 18.9553, 'Europe/Oslo'
        )

        assert moonrise is None
        assert moonset is None

    def test_moon_times_carry_the_location_timezone(self) -> None:
        """Times come back in the location's own zone, not UTC"""
        moonrise, _ = self.provider.calculate_moon_times(
            datetime(2026, 9, 2, 12, tzinfo=timezone.utc),
            41.8781,
            -87.6298,
            'America/Chicago',
        )

        assert moonrise is not None
        assert datetime.fromisoformat(moonrise).utcoffset() is not None
        assert datetime.fromisoformat(moonrise).utcoffset() != timedelta(0)

    def test_moon_times_reach_the_payload_with_coordinates(self) -> None:
        """Coordinates in raw_data put the times in current_phase"""
        result = self.provider.process_weather_data(
            {'lat': 41.8781, 'lon': -87.6298}, 'Chicago', 'America/Chicago'
        )

        assert result is not None
        current_phase = result['lunar_data']['current_phase']
        crossings = (current_phase['moonrise'], current_phase['moonset'])

        # This runs against today, and Chicago misses a moonrise on thirteen
        # days a year and a moonset on twelve — but never both on one day, over
        # six years scanned. Assert the pair, so the plumbing is still proved
        # without the test going red on the calendar.
        assert any(crossing is not None for crossing in crossings)
        for crossing in crossings:
            if crossing is None:
                continue
            offset = datetime.fromisoformat(crossing).utcoffset()
            assert offset is not None
            assert offset != timedelta(0)

    @staticmethod
    def _minutes_from(iso_time: str, expected: str) -> float:
        actual = datetime.fromisoformat(iso_time)
        target = datetime.fromisoformat(expected)
        return abs((actual - target).total_seconds()) / 60


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
        assert len(current['description']) > MIN_DETAILED_DESCRIPTION_LENGTH

        # Next phases should be reasonable
        next_new = lunar_data['next_phases']['new_moon']
        next_full = lunar_data['next_phases']['full_moon']
        assert 0 < next_new['days_until'] <= MAX_DAYS_UNTIL_NEXT_PHASE
        assert 0 < next_full['days_until'] <= MAX_DAYS_UNTIL_NEXT_PHASE

        # Viewing recommendations should be complete
        viewing = lunar_data['astronomical_data']['best_viewing']
        required_keys = ['visibility', 'photography', 'best_time', 'stargazing']
        for key in required_keys:
            assert key in viewing
            assert len(viewing[key]) > MIN_VIEWING_TEXT_LENGTH

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
        if lunar_age < YOUNG_MOON_AGE_DAYS or lunar_age > OLD_MOON_AGE_DAYS:
            # Near new moon
            assert illumination < NEAR_NEW_MOON_ILLUMINATION_PERCENT
        elif FULL_MOON_AGE_LOWER_DAYS < lunar_age < FULL_MOON_AGE_UPPER_DAYS:
            # Near full moon
            assert illumination > NEAR_FULL_MOON_ILLUMINATION_PERCENT

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
            average_time < MAX_AVERAGE_CALCULATION_SECONDS
        ), f'Lunar calculation took {average_time:.3f}s on average'
