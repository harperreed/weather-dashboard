# ABOUTME: Verifies Open-Meteo daily temperatures reach the frontend formatter.
# ABOUTME: Exercises production transformation and JavaScript without API mocks.

import json
import subprocess
from pathlib import Path
from typing import Any

from weather_providers import OpenMeteoProvider


def test_open_meteo_daily_range_reaches_frontend(
    mock_open_meteo_response: dict[str, Any],
) -> None:
    weather = OpenMeteoProvider().process_weather_data(
        mock_open_meteo_response,
        'Test Location',
    )
    assert weather is not None

    component_directory = Path(__file__).parents[2] / 'static' / 'js'
    component_file = component_directory / 'weather-components.js'
    script = """
global.HTMLElement = class {};
global.customElements = { define() {} };
global.document = { addEventListener() {} };
const { formatDailyTemperatureRange } = require(process.argv[1]);
const weather = JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify(formatDailyTemperatureRange(weather.daily)));
"""
    result = subprocess.run(
        ['node', '-e', script, str(component_file), json.dumps(weather)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout) == {
        'high': 77,
        'low': 65,
        'text': 'HIGH 77° LOW 65°',
        'ariaLabel': "Today's high 77 degrees, low 65 degrees.",
    }
