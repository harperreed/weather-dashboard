# ABOUTME: Runs dependency-free JavaScript unit tests through the Python suite.
# ABOUTME: Keeps frontend behavior checks in the project's canonical pytest command.

import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize(
    'test_name',
    [
        'current-weather-range.test.js',
        'dashboard-config.test.js',
        'help-section.test.js',
    ],
)
def test_frontend_javascript(test_name: str) -> None:
    test_file = Path(__file__).parents[1] / 'js' / test_name
    result = subprocess.run(
        ['node', '--test', str(test_file)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
