from main import calculate_pressure_trend, get_pressure_prediction


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
        assert abs(result['rate']) < 0.1  # Should be minimal change
        assert result['current_pressure'] == 1013.2
        assert len(result['history']) <= 12

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
        assert result['rate'] > 0.1  # Significant positive rate
        assert result['current_pressure'] == 1018.0

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
        assert result['rate'] < -0.1  # Significant negative rate
        assert result['current_pressure'] == 1008.0

    def test_get_pressure_prediction_rising_fast(self) -> None:
        """Test pressure prediction for fast rising pressure"""
        prediction = get_pressure_prediction('rising', 1.0, 1020.0)
        assert 'improving' in prediction.lower()
        assert 'clearing' in prediction.lower() or 'expected' in prediction.lower()

    def test_get_pressure_prediction_falling_fast(self) -> None:
        """Test pressure prediction for fast falling pressure"""
        prediction = get_pressure_prediction('falling', -1.0, 1005.0)
        assert 'storm' in prediction.lower() or 'precipitation' in prediction.lower()

    def test_get_pressure_prediction_steady_high(self) -> None:
        """Test pressure prediction for steady high pressure"""
        prediction = get_pressure_prediction('steady', 0.05, 1025.0)
        assert 'fair' in prediction.lower() or 'continued' in prediction.lower()

    def test_get_pressure_prediction_steady_low(self) -> None:
        """Test pressure prediction for steady low pressure"""
        prediction = get_pressure_prediction('steady', 0.05, 995.0)
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
        assert len(result['history']) == 12  # Should be truncated

    def test_pressure_prediction_categories(self) -> None:
        """Test all pressure prediction categories"""
        # Test all combinations of trend and pressure levels
        test_cases = [
            ('rising', 1.0, 1025.0),  # rising_fast, high pressure
            ('rising', 0.3, 1015.0),  # rising_slow, normal pressure
            ('falling', -1.0, 995.0),  # falling_fast, low pressure
            ('falling', -0.3, 1015.0),  # falling_slow, normal pressure
            ('steady', 0.05, 1025.0),  # steady_high
            ('steady', 0.05, 1015.0),  # steady_normal
            ('steady', 0.05, 995.0),  # steady_low
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
            {'time': f'2024-01-01T{15-i:02d}:00:00Z', 'pressure': 1014.0 - i * 0.25}
            for i in range(24)
        ]

        result = calculate_pressure_trend(history)
        assert result['trend'] == 'rising'
        assert result['rate'] > 0
        assert result['current_pressure'] == 1014.0  # First item (current)
        assert len(result['history']) == 12  # Truncated to 12 hours

    def test_pressure_trend_realistic_weather_scenario(self) -> None:
        """Test pressure trend with realistic weather approaching scenario"""
        # Simulate pressure drop before storm (common weather pattern)
        history = [
            {
                'time': '2024-01-01T18:00:00Z',
                'pressure': 1003.5,
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
        assert result['rate'] < -1.0  # Significant drop
        assert (
            'storm' in result['prediction'].lower()
            or 'precipitation' in result['prediction'].lower()
        )
