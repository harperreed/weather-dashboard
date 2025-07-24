from main import calculate_pressure_trend, get_pressure_prediction


# Test constants for pressure trend calculations
MINIMAL_PRESSURE_CHANGE = 0.1  # hPa threshold for steady vs changing
STANDARD_PRESSURE = 1013.2  # Standard atmospheric pressure in hPa
MAX_HISTORY_HOURS = 12  # Maximum hours of pressure history to keep
RISING_PRESSURE = 1018.0  # Example high pressure value
FALLING_PRESSURE = 1008.0  # Example low pressure value
HIGH_PRESSURE = 1025.0  # High pressure threshold
LOW_PRESSURE = 995.0  # Low pressure threshold
FAST_PRESSURE_CHANGE = 1.0  # Fast pressure change rate (hPa/hour)
SLOW_PRESSURE_CHANGE = 0.3  # Slow pressure change rate (hPa/hour)
STEADY_PRESSURE_CHANGE = 0.05  # Minimal change for steady conditions
STORM_PRESSURE = 1003.5  # Low pressure indicating storm approach
NORMAL_PRESSURE = 1015.0  # Normal atmospheric pressure
CURRENT_PRESSURE_TEST = 1014.0  # Test pressure for calculations


class TestPressureTrends:
    """Test pressure trend calculation and prediction functionality"""

    def test_calculate_pressure_trend_insufficient_data(self) -> None:
        """Test pressure trend calculation with insufficient data"""
        # Test with empty history
        result = calculate_pressure_trend([])
        assert result['trend'] == 'steady'
        assert result['rate'] == 0.0
        assert 'insufficient data' in result['prediction'].lower()

        # Test with insufficient data points
        short_history = [{'time': '2024-01-01T12:00:00Z', 'pressure': 1013.2}]
        result = calculate_pressure_trend(short_history)
        assert result['trend'] == 'steady'
        assert result['rate'] == 0.0
        assert 'insufficient data' in result['prediction'].lower()

    def test_calculate_pressure_trend_steady(self) -> None:
        """Test pressure trend calculation for steady pressure"""
        history = [
            {'time': '2024-01-01T15:00:00Z', 'pressure': 1013.2},  # Current
            {'time': '2024-01-01T14:00:00Z', 'pressure': 1013.1},
            {'time': '2024-01-01T13:00:00Z', 'pressure': 1013.0},
            {'time': '2024-01-01T12:00:00Z', 'pressure': 1013.1},  # 3 hours ago
        ]

        result = calculate_pressure_trend(history)
        assert result['trend'] == 'steady'
        assert abs(result['rate']) < MINIMAL_PRESSURE_CHANGE  # Should be minimal change
        assert result['current_pressure'] == STANDARD_PRESSURE
        assert len(result['history']) <= MAX_HISTORY_HOURS

    def test_calculate_pressure_trend_rising(self) -> None:
        """Test pressure trend calculation for rising pressure"""
        history = [
            {'time': '2024-01-01T15:00:00Z', 'pressure': 1018.0},  # Current
            {'time': '2024-01-01T14:00:00Z', 'pressure': 1016.5},
            {'time': '2024-01-01T13:00:00Z', 'pressure': 1015.0},
            {'time': '2024-01-01T12:00:00Z', 'pressure': 1013.5},  # 3 hours ago
        ]

        result = calculate_pressure_trend(history)
        assert result['trend'] == 'rising'
        assert result['rate'] > MINIMAL_PRESSURE_CHANGE  # Significant positive rate
        assert result['current_pressure'] == RISING_PRESSURE

    def test_calculate_pressure_trend_falling(self) -> None:
        """Test pressure trend calculation for falling pressure"""
        history = [
            {'time': '2024-01-01T15:00:00Z', 'pressure': 1008.0},  # Current
            {'time': '2024-01-01T14:00:00Z', 'pressure': 1010.0},
            {'time': '2024-01-01T13:00:00Z', 'pressure': 1012.0},
            {'time': '2024-01-01T12:00:00Z', 'pressure': 1014.0},  # 3 hours ago
        ]

        result = calculate_pressure_trend(history)
        assert result['trend'] == 'falling'
        assert result['rate'] < -MINIMAL_PRESSURE_CHANGE  # Significant negative rate
        assert result['current_pressure'] == FALLING_PRESSURE

    def test_get_pressure_prediction_rising_fast(self) -> None:
        """Test pressure prediction for fast rising pressure"""
        prediction = get_pressure_prediction('rising', FAST_PRESSURE_CHANGE, 1020.0)
        assert 'improving' in prediction.lower()
        assert 'clearing' in prediction.lower() or 'expected' in prediction.lower()

    def test_get_pressure_prediction_falling_fast(self) -> None:
        """Test pressure prediction for fast falling pressure"""
        prediction = get_pressure_prediction('falling', -FAST_PRESSURE_CHANGE, 1005.0)
        assert 'storm' in prediction.lower() or 'precipitation' in prediction.lower()

    def test_get_pressure_prediction_steady_high(self) -> None:
        """Test pressure prediction for steady high pressure"""
        prediction = get_pressure_prediction(
            'steady', STEADY_PRESSURE_CHANGE, HIGH_PRESSURE
        )
        assert 'fair' in prediction.lower() or 'continued' in prediction.lower()

    def test_get_pressure_prediction_steady_low(self) -> None:
        """Test pressure prediction for steady low pressure"""
        prediction = get_pressure_prediction(
            'steady', STEADY_PRESSURE_CHANGE, LOW_PRESSURE
        )
        assert 'unsettled' in prediction.lower() or 'continue' in prediction.lower()

    def test_pressure_trend_rate_calculation_accuracy(self) -> None:
        """Test accuracy of pressure trend rate calculation"""
        # Pressure drops 3 hPa over 3 hours = -1.0 hPa/hour
        history = [
            {'time': '2024-01-01T15:00:00Z', 'pressure': 1010.0},  # Current
            {'time': '2024-01-01T14:00:00Z', 'pressure': 1011.0},
            {'time': '2024-01-01T13:00:00Z', 'pressure': 1012.0},
            {'time': '2024-01-01T12:00:00Z', 'pressure': 1013.0},  # 3 hours ago
        ]

        result = calculate_pressure_trend(history)
        assert result['rate'] == -1.0  # Exact calculation
        assert result['trend'] == 'falling'

    def test_pressure_trend_edge_case_zero_change(self) -> None:
        """Test pressure trend with exactly zero change"""
        history = [
            {'time': '2024-01-01T15:00:00Z', 'pressure': 1013.25},  # Current
            {'time': '2024-01-01T14:00:00Z', 'pressure': 1013.25},
            {'time': '2024-01-01T13:00:00Z', 'pressure': 1013.25},
            {'time': '2024-01-01T12:00:00Z', 'pressure': 1013.25},  # 3 hours ago
        ]

        result = calculate_pressure_trend(history)
        assert result['rate'] == 0.0
        assert result['trend'] == 'steady'

    def test_pressure_trend_history_truncation(self) -> None:
        """Test that pressure history is truncated to 12 hours"""
        # Create 20 hours of data
        history = [
            {'time': f'2024-01-01T{15-i:02d}:00:00Z', 'pressure': 1013.0 + i * 0.1}
            for i in range(20)
        ]

        result = calculate_pressure_trend(history)
        assert len(result['history']) == MAX_HISTORY_HOURS  # Should be truncated

    def test_pressure_prediction_categories(self) -> None:
        """Test all pressure prediction categories"""
        # Test all combinations of trend and pressure levels
        test_cases = [
            # rising_fast, high pressure
            ('rising', FAST_PRESSURE_CHANGE, HIGH_PRESSURE),
            # rising_slow, normal pressure
            ('rising', SLOW_PRESSURE_CHANGE, NORMAL_PRESSURE),
            # falling_fast, low pressure
            ('falling', -FAST_PRESSURE_CHANGE, LOW_PRESSURE),
            # falling_slow, normal pressure
            ('falling', -SLOW_PRESSURE_CHANGE, NORMAL_PRESSURE),
            # steady_high
            ('steady', STEADY_PRESSURE_CHANGE, HIGH_PRESSURE),
            # steady_normal
            ('steady', STEADY_PRESSURE_CHANGE, NORMAL_PRESSURE),
            # steady_low
            ('steady', STEADY_PRESSURE_CHANGE, LOW_PRESSURE),
        ]

        for trend, rate, pressure in test_cases:
            prediction = get_pressure_prediction(trend, rate, pressure)
            assert isinstance(prediction, str)
            assert len(prediction) > 0
            # Should not return the default "uncertain" message for these cases
            assert 'uncertain' not in prediction.lower()

    def test_pressure_trend_with_large_history(self) -> None:
        """Test pressure trend calculation with extended history"""
        # Create 24 hours of gradually rising pressure (current is highest)
        history = [
            {
                'time': f'2024-01-01T{15-i:02d}:00:00Z',
                'pressure': CURRENT_PRESSURE_TEST - i * 0.25,
            }
            for i in range(24)
        ]

        result = calculate_pressure_trend(history)
        assert result['trend'] == 'rising'
        assert result['rate'] > 0
        # First item (current)
        assert result['current_pressure'] == CURRENT_PRESSURE_TEST
        assert len(result['history']) == MAX_HISTORY_HOURS  # Truncated to 12 hours

    def test_pressure_trend_realistic_weather_scenario(self) -> None:
        """Test pressure trend with realistic weather approaching scenario"""
        # Simulate pressure drop before storm (common weather pattern)
        history = [
            {
                'time': '2024-01-01T18:00:00Z',
                'pressure': STORM_PRESSURE,
            },  # Current - storm approaching
            {'time': '2024-01-01T17:00:00Z', 'pressure': 1005.0},
            {'time': '2024-01-01T16:00:00Z', 'pressure': 1007.2},
            {
                'time': '2024-01-01T15:00:00Z',
                'pressure': 1010.5,
            },  # 3 hours ago - was normal
            {'time': '2024-01-01T14:00:00Z', 'pressure': 1012.0},
            {'time': '2024-01-01T13:00:00Z', 'pressure': 1013.0},
        ]

        result = calculate_pressure_trend(history)
        assert result['trend'] == 'falling'
        assert result['rate'] < -FAST_PRESSURE_CHANGE  # Significant drop
        assert (
            'storm' in result['prediction'].lower()
            or 'precipitation' in result['prediction'].lower()
        )
