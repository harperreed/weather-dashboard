#!/usr/bin/env python3
"""
Test runner script for the weather dashboard project.

This script provides various options for running tests with different configurations.
"""

import argparse
import os
import subprocess  # nosec B404 # Safe subprocess usage for test runner
import sys
from pathlib import Path


def run_command(cmd: list[str], description: str) -> bool:
    """Run a command and return success status"""
    print(f'\n🚀 {description}')
    print(f'Command: {" ".join(cmd)}')
    print('-' * 50)

    result = subprocess.run(cmd, capture_output=False, check=False)  # nosec B603 # Safe subprocess usage with known command list
    success = result.returncode == 0

    if success:
        print(f'✅ {description} - SUCCESS')
    else:
        print(f'❌ {description} - FAILED')

    return success


def main() -> int:
    parser = argparse.ArgumentParser(description='Run weather dashboard tests')
    parser.add_argument('--unit', action='store_true', help='Run only unit tests')
    parser.add_argument(
        '--integration', action='store_true', help='Run only integration tests'
    )
    parser.add_argument('--fast', action='store_true', help='Skip slow tests')
    parser.add_argument(
        '--coverage', action='store_true', help='Generate coverage report'
    )
    parser.add_argument('--html', action='store_true', help='Generate HTML test report')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--parallel', '-n', type=int, help='Run tests in parallel')
    parser.add_argument('--pattern', '-k', help='Run tests matching pattern')
    parser.add_argument(
        '--install', action='store_true', help='Install test dependencies first'
    )

    args = parser.parse_args()

    # Change to project directory
    project_dir = Path(__file__).parent
    os.chdir(project_dir)

    # Install dependencies if requested
    if args.install:
        success = run_command(
            ['uv', 'sync', '--all-extras', '--dev'], 'Installing test dependencies'
        )
        if not success:
            return 1

    # Build pytest command using uv
    cmd = ['uv', 'run', 'pytest']

    # Add test selection
    if args.unit:
        cmd.append('tests/unit')
    elif args.integration:
        cmd.append('tests/integration')
    else:
        cmd.append('tests')

    # Add markers
    if args.fast:
        cmd.extend(['-m', 'not slow'])

    # Add pattern matching
    if args.pattern:
        cmd.extend(['-k', args.pattern])

    # Add verbosity
    if args.verbose:
        cmd.append('-v')

    # Add parallel execution
    if args.parallel:
        cmd.extend(['-n', str(args.parallel)])

    # Add coverage
    if args.coverage:
        cmd.extend(['--cov=.', '--cov-report=term-missing'])

    # Add HTML report
    if args.html:
        cmd.extend(['--html=tests/report.html', '--self-contained-html'])

    # Run tests
    success = run_command(cmd, 'Running tests')

    if success:
        print('\n🎉 All tests passed!')
        if args.html:
            print('📊 HTML report generated at: tests/report.html')
        if args.coverage:
            print('📈 Coverage report generated at: htmlcov/index.html')
    else:
        print('\n💥 Some tests failed!')
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
