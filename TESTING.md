# Weather Dashboard Testing Guide

This document provides comprehensive information about the testing framework implemented for the weather dashboard project.

## Testing Framework Overview

The weather dashboard uses **pytest** as the primary testing framework with the following features:

- **Unit Tests**: Test individual components and functions in isolation
- **Integration Tests**: Test the complete application flow and API interactions
- **Frontend Tests**: Test static file serving and frontend integration
- **Mocking**: Extensive use of mocks to avoid external API calls during testing
- **Coverage**: Code coverage reporting with HTML and terminal output
- **Parallel Testing**: Support for running tests in parallel for faster execution

## Test Structure

```
tests/
├── __init__.py
├── conftest.py                 # Pytest configuration and fixtures
├── unit/                       # Unit tests
│   ├── __init__.py
│   ├── test_weather_providers.py
│   └── test_main.py
├── integration/                # Integration tests
│   ├── __init__.py
│   └── test_api_integration.py
└── test_frontend.py           # Frontend tests
```

## Installation

### Install Test Dependencies

```bash
# Install test dependencies
pip install -e .[test]

# Or install specific test packages
pip install pytest pytest-flask pytest-cov pytest-mock requests-mock pytest-html
```

### Verify Installation

```bash
pytest --version
```

## Running Tests

### Basic Test Execution

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/unit/test_weather_providers.py

# Run specific test function
pytest tests/unit/test_weather_providers.py::TestOpenMeteoProvider::test_init
```

### Test Selection

```bash
# Run only unit tests
pytest tests/unit/

# Run only integration tests
pytest tests/integration/

# Run tests matching a pattern
pytest -k "weather_provider"

# Run tests with specific markers
pytest -m "not slow"
pytest -m "integration"
```

### Coverage Reports

```bash
# Run tests with coverage
pytest --cov=. --cov-report=term-missing

# Generate HTML coverage report
pytest --cov=. --cov-report=html

# View coverage report
open htmlcov/index.html
```

### Test Reports

```bash
# Generate HTML test report
pytest --html=tests/report.html --self-contained-html

# View test report
open tests/report.html
```

## Using the Test Runner Script

A convenient test runner script is provided for common testing scenarios:

```bash
# Make script executable
chmod +x run_tests.py

# Install dependencies and run all tests
python run_tests.py --install

# Run only unit tests
python run_tests.py --unit

# Run only integration tests
python run_tests.py --integration

# Run fast tests (skip slow tests)
python run_tests.py --fast

# Run with coverage and HTML report
python run_tests.py --coverage --html

# Run tests matching pattern
python run_tests.py --pattern "weather_provider"

# Run tests in parallel
python run_tests.py --parallel 4
```

## Test Types and Markers

### Test Markers

- `@pytest.mark.unit`: Unit tests
- `@pytest.mark.integration`: Integration tests
- `@pytest.mark.slow`: Slow tests that may be skipped

### Test Categories

1. **Unit Tests** (`tests/unit/`):
   - Test individual functions and classes
   - Mock external dependencies
   - Fast execution
   - High coverage

2. **Integration Tests** (`tests/integration/`):
   - Test complete application flow
   - Test API endpoints
   - Test provider failover
   - Cache behavior testing

3. **Frontend Tests** (`tests/test_frontend.py`):
   - Test static file serving
   - Test HTML template integration
   - Test frontend API interactions

## Key Test Fixtures

### Flask Application Fixtures

```python
@pytest.fixture
def flask_app():
    """Create a Flask app instance for testing"""

@pytest.fixture
def client(flask_app):
    """Create a test client for the Flask app"""

@pytest.fixture
def app_context(flask_app):
    """Create an application context for testing"""
```

### Mock Data Fixtures

```python
@pytest.fixture
def mock_weather_data():
    """Mock weather data for testing"""

@pytest.fixture
def mock_open_meteo_response():
    """Mock OpenMeteo API response"""

@pytest.fixture
def mock_pirate_weather_response():
    """Mock PirateWeather API response"""
```

### Provider Fixtures

```python
@pytest.fixture
def weather_provider_manager():
    """Create a WeatherProviderManager instance for testing"""

@pytest.fixture
def mock_requests_get():
    """Mock requests.get for testing API calls"""
```

## Writing Tests

### Example Unit Test

```python
def test_weather_provider_functionality(mock_weather_data):
    """Test weather provider functionality"""
    provider = OpenMeteoProvider()
    
    with patch('requests.get') as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_weather_data
        mock_get.return_value = mock_response
        
        result = provider.get_weather(41.8781, -87.6298, "Chicago")
        
        assert result is not None
        assert result['location'] == 'Chicago'
        assert 'current' in result
```

### Example Integration Test

```python
@pytest.mark.integration
def test_weather_api_integration(client, mock_weather_data):
    """Test complete weather API integration"""
    with patch('main.weather_manager.get_weather') as mock_get_weather:
        mock_get_weather.return_value = mock_weather_data
        
        response = client.get('/api/weather?lat=41.8781&lon=-87.6298&location=Chicago')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['location'] == 'Chicago'
```

## Best Practices

### Test Organization

1. **Group Related Tests**: Use test classes to group related test functions
2. **Clear Test Names**: Use descriptive test function names
3. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and assertion phases
4. **Mock External Dependencies**: Always mock external API calls and file system operations

### Test Data Management

1. **Use Fixtures**: Create reusable test data using pytest fixtures
2. **Avoid Hard-coded Values**: Use constants or configuration for test data
3. **Clean Up**: Ensure tests clean up after themselves (cache clearing, etc.)

### Mocking Guidelines

1. **Mock at the Right Level**: Mock external dependencies, not internal functions
2. **Verify Mock Calls**: Assert that mocked functions are called with expected parameters
3. **Test Error Conditions**: Mock failures to test error handling

## Continuous Integration

The test suite is designed to run in CI/CD environments:

```bash
# CI-friendly test command
pytest tests/ --cov=. --cov-report=xml --junit-xml=junit.xml
```

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Set up Python
      uses: actions/setup-python@v2
      with:
        python-version: 3.10
    - name: Install dependencies
      run: |
        pip install -e .[test]
    - name: Run tests
      run: |
        pytest tests/ --cov=. --cov-report=xml
```

## Performance Testing

### Running Performance Tests

```bash
# Run performance-related tests
pytest tests/integration/test_api_integration.py::TestEndToEndScenarios::test_performance_characteristics
```

### Cache Testing

```bash
# Test cache behavior
pytest tests/integration/test_api_integration.py::TestWeatherAPIIntegration::test_cache_behavior_integration
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure the project is installed in development mode (`pip install -e .`)
2. **Module Not Found**: Check that `__init__.py` files exist in test directories
3. **Mock Issues**: Verify that mocks are patching the correct module paths
4. **Fixture Errors**: Ensure fixture dependencies are properly declared

### Debug Mode

```bash
# Run tests with debug output
pytest -v -s tests/

# Run single test with debug
pytest -v -s tests/unit/test_weather_providers.py::TestOpenMeteoProvider::test_init
```

### Coverage Issues

```bash
# Check what's not covered
pytest --cov=. --cov-report=term-missing

# Generate detailed coverage report
pytest --cov=. --cov-report=html --cov-report=term
```

## Contributing

When adding new functionality:

1. **Write Tests First**: Consider TDD approach
2. **Maintain Coverage**: Aim for >90% code coverage
3. **Test Edge Cases**: Include error conditions and boundary cases
4. **Update Documentation**: Update this guide if adding new test patterns

## Test Configuration

The test configuration is defined in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "--cov=.",
    "--cov-report=html",
    "--cov-report=term-missing",
    "--cov-exclude=tests/*",
    "--html=tests/report.html",
    "--self-contained-html",
    "-v"
]
markers = [
    "slow: marks tests as slow (deselect with '-m \"not slow\"')",
    "integration: marks tests as integration tests",
    "unit: marks tests as unit tests",
]
```

## Resources

- [pytest Documentation](https://docs.pytest.org/)
- [pytest-flask Documentation](https://pytest-flask.readthedocs.io/)
- [pytest-cov Documentation](https://pytest-cov.readthedocs.io/)
- [unittest.mock Documentation](https://docs.python.org/3/library/unittest.mock.html)