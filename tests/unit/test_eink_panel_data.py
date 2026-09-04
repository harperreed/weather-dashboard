# ABOUTME: Tests the weather fields the eInk panel needs but providers did not expose.
# ABOUTME: Covers wet bulb plus the hourly gust, UV and precipitation-type channels.

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from weather_providers import OpenMeteoProvider, calculate_wet_bulb


CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298

# Stull (2011) works this case through in the paper: 20 degrees C at 50%
# relative humidity gives a wet bulb of 13.7 degrees C.
STULL_CHECK_AIR_F = 68.0
STULL_CHECK_HUMIDITY = 50
STULL_CHECK_WET_BULB_F = 56.66

# The first hour of the panel fixture below.
FIXTURE_FIRST_HOUR_GUST = 18
FIXTURE_FIRST_HOUR_UV = 10


class TestWetBulbTemperature:
    """The panel's WET BULB bar and its exertion warnings read this value"""

    def test_matches_the_published_stull_check_value(self) -> None:
        """The approximation has to reproduce the worked example it comes from"""
        wet_bulb = calculate_wet_bulb(STULL_CHECK_AIR_F, STULL_CHECK_HUMIDITY)

        assert wet_bulb == pytest.approx(STULL_CHECK_WET_BULB_F, abs=0.1)

    def test_never_exceeds_the_air_temperature(self) -> None:
        """Evaporation cannot warm the thermometer, whatever the fit says"""
        # The polynomial overshoots by a few hundredths near saturation, which
        # would draw the WET BULB bar past AIR on a rainy day.
        for humidity in range(5, 101, 5):
            for air_f in (0.0, 32.0, 68.0, 95.0):
                wet_bulb = calculate_wet_bulb(air_f, humidity)
                assert wet_bulb is not None
                assert wet_bulb <= air_f

    def test_rises_with_humidity(self) -> None:
        """Damper air evaporates less, so the wet bulb climbs toward the air"""
        readings = [calculate_wet_bulb(86.0, rh) for rh in (20, 40, 60, 80, 100)]

        assert all(reading is not None for reading in readings)
        assert readings == sorted(readings, key=lambda reading: reading or 0)

    def test_survives_a_missing_humidity_reading(self) -> None:
        """A provider outage drops the bar row rather than charting a zero"""
        assert calculate_wet_bulb(70.0, None) is None


@pytest.fixture
def panel_open_meteo_response() -> dict[str, Any]:
    """An Open-Meteo payload carrying the hourly channels the panel charts"""
    return {
        'timezone': 'America/Chicago',
        'current': {
            'temperature_2m': 94.0,
            'apparent_temperature': 106.0,
            'relative_humidity_2m': 59,
            'weather_code': 0,
        },
        'hourly': {
            'time': ['2025-07-19T13:00', '2025-07-19T14:00'],
            'temperature_2m': [95.0, 97.0],
            'weather_code': [0, 0],
            'precipitation_probability': [5, 10],
            'wind_gusts_10m': [18.0, 22.0],
            'uv_index': [10.0, 11.0],
            'rain': [0.0, 0.1],
            'showers': [0.0, 0.0],
            'snowfall': [0.0, 0.0],
        },
        'daily': {
            'time': ['2025-07-19'],
            'temperature_2m_max': [99.0],
            'temperature_2m_min': [79.0],
            'weather_code': [0],
        },
    }


class TestPanelWeatherFields:
    """The panel reads these off the same payload the dashboard already fetches"""

    def test_current_conditions_expose_wet_bulb(
        self, panel_open_meteo_response: dict[str, Any]
    ) -> None:
        """The stat card charts wet bulb beside air and feels-like"""
        provider = OpenMeteoProvider()

        processed = provider.process_weather_data(panel_open_meteo_response, 'Chicago')

        assert processed is not None
        assert processed['current']['wet_bulb'] == pytest.approx(82, abs=1)

    def test_hourly_entries_carry_the_chart_channels(
        self, panel_open_meteo_response: dict[str, Any]
    ) -> None:
        """Gusts, UV and precipitation type pick which bars the chart draws"""
        provider = OpenMeteoProvider()

        processed = provider.process_weather_data(panel_open_meteo_response, 'Chicago')

        assert processed is not None
        first_hour = processed['hourly'][0]
        assert first_hour['gust'] == FIXTURE_FIRST_HOUR_GUST
        assert first_hour['uv'] == FIXTURE_FIRST_HOUR_UV
        assert first_hour['precip_type'] is None
        assert processed['hourly'][1]['precip_type'] == 'rain'

    def test_hourly_channels_default_when_a_provider_omits_them(
        self, panel_open_meteo_response: dict[str, Any]
    ) -> None:
        """A payload without gusts or UV still renders, with those bars empty"""
        del panel_open_meteo_response['hourly']['wind_gusts_10m']
        del panel_open_meteo_response['hourly']['uv_index']
        provider = OpenMeteoProvider()

        processed = provider.process_weather_data(panel_open_meteo_response, 'Chicago')

        assert processed is not None
        assert processed['hourly'][0]['gust'] == 0
        assert processed['hourly'][0]['uv'] == 0

    def test_the_request_asks_for_the_hourly_channels(self) -> None:
        """Fields absent from the query can never reach the chart"""
        provider = OpenMeteoProvider()
        response = MagicMock()
        response.json.return_value = {}
        response.url = 'https://example.invalid/'

        with patch('requests.get', return_value=response) as request:
            provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)

        hourly = request.call_args.kwargs['params']['hourly']
        assert 'wind_gusts_10m' in hourly
        assert 'uv_index' in hourly
