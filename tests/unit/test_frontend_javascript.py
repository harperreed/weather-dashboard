# ABOUTME: Runs dependency-free JavaScript unit tests through the Python suite.
# ABOUTME: Keeps frontend behavior checks in the project's canonical pytest command.

import subprocess
from pathlib import Path


def test_current_weather_range_javascript() -> None:
    test_file = Path(__file__).parents[1] / 'js' / 'current-weather-range.test.js'
    result = subprocess.run(
        ['node', '--test', str(test_file)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
