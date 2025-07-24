# ABOUTME: Unit tests for EnhancedTemperatureTrendProvider functionality
# ABOUTME: Tests heat index, wind chill, confidence intervals, and statistical analysis

import math
from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

from weather_providers import EnhancedTemperatureTrendProvider


# Test constants for temperature calculations
HOT_TEMP = 85
HOT_HUMIDITY = 60
COOL_TEMP = 75
COOL_HUMIDITY = 30
EXTREME_HOT_TEMP = 100
EXTREME_HOT_HUMIDITY = 80
WIND_CHILL_TEMP = 35
WIND_CHILL_SPEED = 10
HIGH_TEMP = 60
LOW_WIND = 2
MODERATE_TEMP = 65
MODERATE_WIND = 5
WIND_SPEED_15 = 15  # Test wind speed value
CONFIDENCE_TEMP = 70  # Test temperature for confidence intervals
CONFIDENCE_HOURS_0 = 0  # Zero hours for confidence interval test
CONFIDENCE_HOURS_6 = 6  # Six hours for confidence interval test
CONFIDENCE_HOURS_24 = 24  # 24 hours for confidence interval test
CONFIDENCE_HOURS_12 = 12  # 12 hours for confidence interval test
EXTREME_HOT_TEMP_100 = 100  # Extreme hot temperature for confidence test
EXTREME_COLD_TEMP_10 = 10  # Extreme cold temperature for confidence test
COMFORT_COUNT_2 = 2  # Expected count for comfort analysis
COMFORT_PERCENTAGE_40 = 40.0  # Expected comfort percentage
COMFORT_PERCENTAGE_20 = 20.0  # Expected hot percentage
COOL_ZONE_TEMP = 55  # Cool temperature for comfort zones
COLD_ZONE_TEMP = 30  # Cold temperature for comfort zones
COMFORT_ZONE_COUNT_1 = 1  # Expected count for single category
COMFORT_ZONE_COUNT_2 = 2  # Expected count for comfortable category
OPTIMAL_TEMP_70 = 70  # Optimal temperature for comfort test
OPTIMAL_HUMIDITY_50 = 50  # Optimal humidity for comfort test
OPTIMAL_HUMIDITY_35 = 35  # Optimal humidity within range
HOT_HUMIDITY_80 = 80  # High humidity for hot conditions
COOL_TEMP_50 = 50  # Cool temperature test value
COOL_HUMIDITY_40 = 40  # Humidity for cool conditions
COMFORTABLE_TEMP_75 = 75  # Comfortable temperature outside optimal
COMFORTABLE_HUMIDITY_45 = 45  # Comfortable humidity
STD_DEV_TOLERANCE = 0.01  # Tolerance for standard deviation comparison
TRANSITION_COUNT_4 = 4  # Number of data points for trend analysis
TEST_TEMP_75 = 75  # Test temperature value
TOLERANCE_TEMP_5 = 5  # Temperature tolerance for test assertions
NON_ZERO_CATEGORY_COUNT = 2  # Expected non-zero categories
BOUNDARY_TEMP = 50
BOUNDARY_WIND = 3
COLD_TEMP = 0
HIGH_WIND = 20

# Apparent temperature test constants
WARM_TEMP = 90
WARM_HUMIDITY = 70
COLD_APPARENT_TEMP = 40
COLD_HUMIDITY = 50
MODERATE_APPARENT_TEMP = 65

# Statistical test constants
MIN_TEMP = 65
MAX_TEMP = 80
TEMP_RANGE = 15
COMFORT_TEMP_1 = 72
COMFORT_TEMP_2 = 68
COMFORT_TEMP_3 = 70
APPARENT_TEMP_1 = 72
APPARENT_TEMP_2 = 78
APPARENT_TEMP_3 = 74


class TestEnhancedTemperatureTrendProvider:
    """Test the enhanced temperature trend provider functionality"""

    def setup_method(self) -> None:
        """Set up test fixtures"""
        self.provider = EnhancedTemperatureTrendProvider()

    def test_provider_initialization(self) -> None:
        """Test provider initialization"""
        assert self.provider.name == 'EnhancedTemperatureTrendProvider'

    def test_fetch_weather_data_returns_none(self) -> None:
        """Test that fetch_weather_data returns None (provider processes data)"""
        result = self.provider.fetch_weather_data(41.8781, -87.6298)
        assert result is None

    def test_process_weather_data_empty_input(self) -> None:
        """Test processing with empty input data"""
        result = self.provider.process_weather_data({}, 'Test Location')
        assert result is None

    def test_process_weather_data_none_input(self) -> None:
        """Test processing with None input"""
        result = self.provider.process_weather_data(None, 'Test Location')  # type: ignore[arg-type]
        assert result is None

    def test_calculate_heat_index_basic(self) -> None:
        """Test basic heat index calculation"""
        # Test with conditions where heat index applies (>= 80°F, >= 40% humidity)
        heat_index = self.provider._calculate_heat_index(HOT_TEMP, HOT_HUMIDITY)
        assert isinstance(heat_index, float)
        assert heat_index > HOT_TEMP  # Heat index should be higher than actual temp

    def test_calculate_heat_index_not_applicable(self) -> None:
        """Test heat index when conditions don't apply"""
        # Temperature too low
        result = self.provider._calculate_heat_index(COOL_TEMP, HOT_HUMIDITY)
        assert result == COOL_TEMP

        # Humidity too low
        result = self.provider._calculate_heat_index(HOT_TEMP, COOL_HUMIDITY)
        assert result == HOT_TEMP

    def test_calculate_heat_index_extreme_conditions(self) -> None:
        """Test heat index with extreme conditions"""
        # Test with very high temperature and humidity
        heat_index = self.provider._calculate_heat_index(
            EXTREME_HOT_TEMP, EXTREME_HOT_HUMIDITY
        )
        assert isinstance(heat_index, float)
        assert heat_index > EXTREME_HOT_TEMP

        # Test edge case values
        heat_index = self.provider._calculate_heat_index(80, 40)
        assert isinstance(heat_index, float)

    def test_calculate_wind_chill_basic(self) -> None:
        """Test basic wind chill calculation"""
        # Test with conditions where wind chill applies (<= 50°F, > 3 mph wind)
        wind_chill = self.provider._calculate_wind_chill(
            WIND_CHILL_TEMP, WIND_CHILL_SPEED
        )
        assert isinstance(wind_chill, float)
        # Wind chill should be lower than actual temp
        assert wind_chill < WIND_CHILL_TEMP

    def test_calculate_wind_chill_not_applicable(self) -> None:
        """Test wind chill when conditions don't apply"""
        # Temperature too high
        result = self.provider._calculate_wind_chill(HIGH_TEMP, WIND_CHILL_SPEED)
        assert result == HIGH_TEMP

        # Wind speed too low
        result = self.provider._calculate_wind_chill(WIND_CHILL_TEMP, LOW_WIND)
        assert result == WIND_CHILL_TEMP

    def test_calculate_wind_chill_edge_cases(self) -> None:
        """Test wind chill with edge case values"""
        # Test with exactly 50°F and 3 mph (boundary conditions)
        wind_chill = self.provider._calculate_wind_chill(BOUNDARY_TEMP, BOUNDARY_WIND)
        assert isinstance(wind_chill, int | float)

        # Test with very cold conditions
        wind_chill = self.provider._calculate_wind_chill(COLD_TEMP, HIGH_WIND)
        assert isinstance(wind_chill, float)
        assert wind_chill < 0

    def test_calculate_apparent_temperature_hot_conditions(self) -> None:
        """Test apparent temperature in hot conditions (uses heat index)"""
        apparent_temp = self.provider._calculate_apparent_temperature(
            WARM_TEMP, WARM_HUMIDITY, MODERATE_WIND
        )
        # Should use heat index since temp >= 80
        heat_index = self.provider._calculate_heat_index(WARM_TEMP, WARM_HUMIDITY)
        assert apparent_temp == heat_index

    def test_calculate_apparent_temperature_cold_conditions(self) -> None:
        """Test apparent temperature in cold conditions (uses wind chill)"""
        apparent_temp = self.provider._calculate_apparent_temperature(
            COLD_APPARENT_TEMP, COLD_HUMIDITY, WIND_SPEED_15
        )
        # Should use wind chill since temp <= 50 and wind > 3
        wind_chill = self.provider._calculate_wind_chill(
            COLD_APPARENT_TEMP, WIND_SPEED_15
        )
        assert apparent_temp == wind_chill

    def test_calculate_apparent_temperature_moderate_conditions(self) -> None:
        """Test apparent temperature in moderate conditions"""
        apparent_temp = self.provider._calculate_apparent_temperature(
            MODERATE_APPARENT_TEMP, COLD_HUMIDITY, MODERATE_WIND
        )
        # Should return actual temperature for moderate conditions
        assert apparent_temp == MODERATE_APPARENT_TEMP

    def test_calculate_confidence_intervals_increasing_uncertainty(self) -> None:
        """Test confidence intervals increase with time"""
        interval_0h = self.provider._calculate_confidence_intervals(
            CONFIDENCE_HOURS_0, CONFIDENCE_TEMP
        )
        interval_6h = self.provider._calculate_confidence_intervals(
            CONFIDENCE_HOURS_6, CONFIDENCE_TEMP
        )
        interval_24h = self.provider._calculate_confidence_intervals(
            CONFIDENCE_HOURS_24, CONFIDENCE_TEMP
        )

        # Uncertainty should increase with time
        assert interval_0h['uncertainty'] < interval_6h['uncertainty']
        assert interval_6h['uncertainty'] < interval_24h['uncertainty']

        # Intervals should be symmetric around temperature
        assert interval_0h['lower'] < CONFIDENCE_TEMP < interval_0h['upper']
        assert interval_6h['lower'] < CONFIDENCE_TEMP < interval_6h['upper']

    def test_calculate_confidence_intervals_extreme_temps(self) -> None:
        """Test confidence intervals with extreme temperatures"""
        # Very hot temperature should have additional uncertainty
        hot_interval = self.provider._calculate_confidence_intervals(
            CONFIDENCE_HOURS_12, EXTREME_HOT_TEMP_100
        )
        normal_interval = self.provider._calculate_confidence_intervals(
            CONFIDENCE_HOURS_12, CONFIDENCE_TEMP
        )

        assert hot_interval['uncertainty'] > normal_interval['uncertainty']

        # Very cold temperature should have additional uncertainty
        cold_interval = self.provider._calculate_confidence_intervals(
            CONFIDENCE_HOURS_12, EXTREME_COLD_TEMP_10
        )
        assert cold_interval['uncertainty'] > normal_interval['uncertainty']

    def test_analyze_comfort_zones(self) -> None:
        """Test comfort zone analysis"""
        # Create test hourly data with different temperature ranges
        hourly_data = [
            {'temperature': COMFORT_TEMP_1},  # comfortable
            {'temperature': COMFORT_TEMP_2},  # comfortable
            {'temperature': HOT_TEMP},  # hot
            {'temperature': COOL_ZONE_TEMP},  # cool
            {'temperature': COLD_ZONE_TEMP},  # cold
        ]

        comfort_analysis = self.provider._analyze_comfort_zones(hourly_data)

        assert 'categories' in comfort_analysis
        assert 'percentages' in comfort_analysis
        assert 'primary_comfort' in comfort_analysis

        # Check that categories add up correctly
        categories = comfort_analysis['categories']
        assert categories['comfortable'] == COMFORT_ZONE_COUNT_2
        assert categories['hot'] == COMFORT_ZONE_COUNT_1
        assert categories['cool'] == COMFORT_ZONE_COUNT_1
        assert categories['cold'] == COMFORT_ZONE_COUNT_1

        # Check percentages
        percentages = comfort_analysis['percentages']
        assert percentages['comfortable'] == COMFORT_PERCENTAGE_40
        assert percentages['hot'] == COMFORT_PERCENTAGE_20

    def test_analyze_comfort_zones_empty_data(self) -> None:
        """Test comfort zone analysis with empty data"""
        comfort_analysis = self.provider._analyze_comfort_zones([])

        # Should return default comfort categories structure (no nested dict)
        expected_categories = {'comfortable': 0, 'hot': 0, 'cool': 0, 'cold': 0}
        assert comfort_analysis == expected_categories

    def test_categorize_comfort_optimal(self) -> None:
        """Test optimal comfort categorization"""
        result = self.provider._categorize_comfort(OPTIMAL_TEMP_70, OPTIMAL_HUMIDITY_50)
        assert result == 'optimal'

    def test_categorize_comfort_various_conditions(self) -> None:
        """Test comfort categorization for various conditions"""
        # Test conditions that should be optimal (68-72°F, 30-60% humidity)
        # Within optimal range
        assert (
            self.provider._categorize_comfort(COMFORT_TEMP_2, OPTIMAL_HUMIDITY_35)
            == 'optimal'
        )
        assert self.provider._categorize_comfort(HOT_TEMP, HOT_HUMIDITY_80) == 'hot'
        assert (
            self.provider._categorize_comfort(COOL_TEMP_50, COOL_HUMIDITY_40) == 'cool'
        )
        # Slightly outside optimal but comfortable
        assert (
            self.provider._categorize_comfort(
                COMFORTABLE_TEMP_75, COMFORTABLE_HUMIDITY_45
            )
            == 'comfortable'
        )

    def test_calculate_temperature_statistics(self) -> None:
        """Test comprehensive temperature statistics calculation"""
        hourly_data = [
            {
                'temperature': OPTIMAL_TEMP_70,
                'apparent_temperature': APPARENT_TEMP_1,
            },
            {
                'temperature': COMFORTABLE_TEMP_75,
                'apparent_temperature': APPARENT_TEMP_2,
            },
            {'temperature': MAX_TEMP, 'apparent_temperature': HOT_TEMP},
            {'temperature': MIN_TEMP, 'apparent_temperature': MIN_TEMP},
            {'temperature': COMFORT_TEMP_1, 'apparent_temperature': APPARENT_TEMP_3},
        ]

        stats = self.provider._calculate_temperature_statistics(hourly_data)

        # Check temperature statistics
        temp_stats = stats['temperature']
        assert temp_stats['min'] == MIN_TEMP
        assert temp_stats['max'] == MAX_TEMP
        assert temp_stats['range'] == TEMP_RANGE
        assert 'mean' in temp_stats
        assert 'median' in temp_stats
        assert 'std_dev' in temp_stats

        # Check apparent temperature statistics
        apparent_stats = stats['apparent_temperature']
        assert apparent_stats['min'] == MIN_TEMP
        assert apparent_stats['max'] == HOT_TEMP

    def test_calculate_temperature_statistics_empty_data(self) -> None:
        """Test temperature statistics with empty data"""
        stats = self.provider._calculate_temperature_statistics([])
        assert stats == {}

    def test_calculate_standard_deviation(self) -> None:
        """Test standard deviation calculation"""
        values = [10.0, 12.0, 14.0, 16.0, 18.0]
        std_dev = self.provider._calculate_standard_deviation(values)

        # Manual calculation: mean = 14, variance = 10, std_dev = sqrt(10) ≈ 3.16
        expected_std_dev = math.sqrt(10)
        assert abs(std_dev - expected_std_dev) < STD_DEV_TOLERANCE

    def test_calculate_standard_deviation_edge_cases(self) -> None:
        """Test standard deviation with edge cases"""
        # Single value
        assert self.provider._calculate_standard_deviation([5]) == 0.0

        # Empty list
        assert self.provider._calculate_standard_deviation([]) == 0.0

    def test_analyze_temperature_trends(self) -> None:
        """Test temperature trend analysis"""
        # Create trend data: warming trend
        hourly_data = [
            {'temperature': 60},
            {'temperature': 62},
            {'temperature': 64},
            {'temperature': 66},
            {'temperature': 68},
            {'temperature': 70},
        ]

        trend_analysis = self.provider._analyze_temperature_trends(hourly_data)

        assert 'overall_slope_per_hour' in trend_analysis
        assert 'trend_direction' in trend_analysis
        assert 'temperature_change_24h' in trend_analysis
        assert 'peaks' in trend_analysis
        assert 'valleys' in trend_analysis
        assert 'volatility' in trend_analysis

        # Should detect warming trend
        assert trend_analysis['trend_direction'] == 'warming'
        assert trend_analysis['overall_slope_per_hour'] > 0

    def test_analyze_temperature_trends_cooling(self) -> None:
        """Test temperature trend analysis for cooling trend"""
        # Create cooling trend
        hourly_data = [
            {'temperature': 80},
            {'temperature': 78},
            {'temperature': 76},
            {'temperature': 74},
            {'temperature': 72},
            {'temperature': 70},
        ]

        trend_analysis = self.provider._analyze_temperature_trends(hourly_data)
        assert trend_analysis['trend_direction'] == 'cooling'
        assert trend_analysis['overall_slope_per_hour'] < 0

    def test_analyze_temperature_trends_stable(self) -> None:
        """Test temperature trend analysis for stable conditions"""
        # Create stable trend
        hourly_data = [
            {'temperature': 70},
            {'temperature': 71},
            {'temperature': 70},
            {'temperature': 69},
            {'temperature': 70},
            {'temperature': 71},
        ]

        trend_analysis = self.provider._analyze_temperature_trends(hourly_data)
        assert trend_analysis['trend_direction'] == 'stable'

    def test_analyze_temperature_trends_insufficient_data(self) -> None:
        """Test temperature trend analysis with insufficient data"""
        # Less than 6 hours of data
        hourly_data = [
            {'temperature': 70},
            {'temperature': 72},
        ]

        trend_analysis = self.provider._analyze_temperature_trends(hourly_data)
        assert trend_analysis == {}

    def test_generate_percentile_bands(self) -> None:
        """Test percentile band generation"""
        current_temp = 70.0
        daily_data: list[dict[str, float]] = []  # Not used in current implementation

        percentile_bands = self.provider._generate_percentile_bands(
            current_temp, daily_data
        )

        assert '10th_percentile' in percentile_bands
        assert '25th_percentile' in percentile_bands
        assert '50th_percentile' in percentile_bands
        assert '75th_percentile' in percentile_bands
        assert '90th_percentile' in percentile_bands

        # 50th percentile should equal current temperature
        assert percentile_bands['50th_percentile'] == current_temp

        # Percentiles should be in ascending order
        assert (
            percentile_bands['10th_percentile']
            < percentile_bands['25th_percentile']
            < percentile_bands['50th_percentile']
            < percentile_bands['75th_percentile']
            < percentile_bands['90th_percentile']
        )

        assert percentile_bands['data_source'] == 'estimated'

    @patch('weather_providers.datetime')
    def test_process_weather_data_complete(self, mock_datetime: Any) -> None:
        """Test complete weather data processing"""
        # Mock current time
        mock_now = datetime(2024, 7, 15, 12, 0, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = mock_now

        # Create comprehensive test data
        weather_data = {
            'current': {
                'temperature': 75,
                'humidity': 60,
                'wind_speed': 8,
                'dew_point': 65,
            },
            'hourly': [
                {'temp': 75, 't': '12pm'},
                {'temp': 77, 't': '1pm'},
                {'temp': 79, 't': '2pm'},
                {'temp': 80, 't': '3pm'},
            ],
            'daily': [
                {'h': 85, 'l': 70},
            ],
        }

        result = self.provider.process_weather_data(weather_data, 'Test Location')

        assert result is not None
        assert result['provider'] == 'EnhancedTemperatureTrendProvider'
        assert result['location_name'] == 'Test Location'
        assert 'temperature_trends' in result

        trends = result['temperature_trends']
        assert 'hourly_data' in trends
        assert 'statistics' in trends
        assert 'comfort_analysis' in trends
        assert 'trend_analysis' in trends
        assert 'percentile_bands' in trends
        assert 'current' in trends

        # Check hourly data structure
        hourly_data = trends['hourly_data']
        assert len(hourly_data) == TRANSITION_COUNT_4
        for hour_data in hourly_data:
            assert 'temperature' in hour_data
            assert 'apparent_temperature' in hour_data
            assert 'confidence_lower' in hour_data
            assert 'confidence_upper' in hour_data
            assert 'uncertainty' in hour_data

        # Check current data
        current = trends['current']
        assert current['temperature'] == TEST_TEMP_75
        assert 'apparent_temperature' in current
        assert 'comfort_category' in current

    def test_process_weather_data_exception_handling(self) -> None:
        """Test exception handling in process_weather_data"""
        # Create malformed data that will cause an exception
        malformed_data = {
            'current': 'invalid_data_type',  # Should be dict, not string
        }

        result = self.provider.process_weather_data(malformed_data, 'Test Location')
        assert result is None


class TestEnhancedTemperatureTrendProviderIntegration:
    """Integration tests for the enhanced temperature trend provider"""

    def setup_method(self) -> None:
        """Set up test fixtures for integration tests"""
        self.provider = EnhancedTemperatureTrendProvider()

    def test_realistic_summer_scenario(self) -> None:
        """Test with realistic summer weather data"""
        summer_data = {
            'current': {
                'temperature': 88,
                'humidity': 75,
                'wind_speed': 5,
                'dew_point': 78,
            },
            'hourly': [
                {'temp': 88, 't': '2pm'},
                {'temp': 90, 't': '3pm'},
                {'temp': 92, 't': '4pm'},
                {'temp': 89, 't': '5pm'},
                {'temp': 85, 't': '6pm'},
                {'temp': 82, 't': '7pm'},
            ],
            'daily': [{'h': 93, 'l': 75}],
        }

        result = self.provider.process_weather_data(summer_data, 'Summer Test')
        assert result is not None

        trends = result['temperature_trends']

        # Should detect hot conditions
        comfort = trends['comfort_analysis']
        assert comfort['primary_comfort'] == 'hot'

        # Heat index should be higher than actual temperature
        current = trends['current']
        assert current['apparent_temperature'] > current['temperature']

    def test_realistic_winter_scenario(self) -> None:
        """Test with realistic winter weather data"""
        winter_data = {
            'current': {
                'temperature': 25,
                'humidity': 65,
                'wind_speed': 15,
                'dew_point': 18,
            },
            'hourly': [
                {'temp': 25, 't': '10am'},
                {'temp': 28, 't': '11am'},
                {'temp': 30, 't': '12pm'},
                {'temp': 32, 't': '1pm'},
                {'temp': 29, 't': '2pm'},
                {'temp': 26, 't': '3pm'},
            ],
            'daily': [{'h': 35, 'l': 20}],
        }

        result = self.provider.process_weather_data(winter_data, 'Winter Test')
        assert result is not None

        trends = result['temperature_trends']

        # Should detect cold conditions
        comfort = trends['comfort_analysis']
        assert comfort['primary_comfort'] == 'cold'

        # Wind chill should be lower than actual temperature
        current = trends['current']
        assert current['apparent_temperature'] < current['temperature']

    def test_moderate_conditions_scenario(self) -> None:
        """Test with moderate spring/fall weather data"""
        moderate_data = {
            'current': {
                'temperature': 68,
                'humidity': 55,
                'wind_speed': 8,
                'dew_point': 50,
            },
            'hourly': [
                {'temp': 68, 't': '9am'},
                {'temp': 70, 't': '10am'},
                {'temp': 72, 't': '11am'},
                {'temp': 73, 't': '12pm'},
                {'temp': 71, 't': '1pm'},
                {'temp': 69, 't': '2pm'},
            ],
            'daily': [{'h': 75, 'l': 60}],
        }

        result = self.provider.process_weather_data(moderate_data, 'Moderate Test')
        assert result is not None

        trends = result['temperature_trends']

        # Should detect comfortable conditions
        comfort = trends['comfort_analysis']
        # Most hours should be comfortable
        assert comfort['categories']['comfortable'] > 0

        # Apparent temperature should be close to actual temperature
        current = trends['current']
        temp_diff = abs(current['apparent_temperature'] - current['temperature'])
        # Should be within 5 degrees for moderate conditions
        assert temp_diff < TOLERANCE_TEMP_5

    def test_temperature_swing_scenario(self) -> None:
        """Test with large temperature swings"""
        swing_data = {
            'current': {
                'temperature': 45,
                'humidity': 50,
                'wind_speed': 10,
                'dew_point': 35,
            },
            'hourly': [
                {'temp': 45, 't': '6am'},
                {'temp': 55, 't': '9am'},
                {'temp': 65, 't': '12pm'},
                {'temp': 75, 't': '3pm'},
                {'temp': 68, 't': '6pm'},
                {'temp': 58, 't': '9pm'},
            ],
            'daily': [{'h': 78, 'l': 42}],
        }

        result = self.provider.process_weather_data(
            swing_data, 'Temperature Swing Test'
        )
        assert result is not None

        trends = result['temperature_trends']

        # Should show high volatility
        trend_analysis = trends['trend_analysis']
        # Significant temperature variation
        assert trend_analysis['volatility'] > TOLERANCE_TEMP_5

        # Should have mixed comfort categories
        comfort = trends['comfort_analysis']
        category_counts = comfort['categories']
        # Should have multiple categories with non-zero counts
        non_zero_categories = sum(1 for count in category_counts.values() if count > 0)
        assert non_zero_categories >= NON_ZERO_CATEGORY_COUNT
