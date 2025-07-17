# Weather Dashboard

[![Tests](https://github.com/harperreed/weather-dashboard/actions/workflows/test.yml/badge.svg)](https://github.com/harperreed/weather-dashboard/actions/workflows/test.yml)
[![Code Quality](https://github.com/harperreed/weather-dashboard/actions/workflows/lint.yml/badge.svg)](https://github.com/harperreed/weather-dashboard/actions/workflows/lint.yml)
[![Security](https://github.com/harperreed/weather-dashboard/actions/workflows/security.yml/badge.svg)](https://github.com/harperreed/weather-dashboard/actions/workflows/security.yml)
[![Docker](https://github.com/harperreed/weather-dashboard/actions/workflows/docker.yml/badge.svg)](https://github.com/harperreed/weather-dashboard/actions/workflows/docker.yml)

A modern, real-time weather dashboard built with Flask and featuring WebSocket updates, multiple weather provider support, and comprehensive testing.

## Features

- ⚡ **Real-time Weather Updates** - WebSocket-powered live updates with polling fallback
- 🌤️ **Multiple Weather Providers** - Support for OpenMeteo and PirateWeather APIs with automatic failover
- 📱 **Responsive Design** - Web components-based UI that works on all devices
- 🚀 **Fast Performance** - Intelligent caching and optimized API calls
- 🔄 **Provider Management** - Switch between weather providers on-the-fly
- 📊 **Comprehensive Monitoring** - Built-in cache statistics and provider health checks
- 🐳 **Docker Ready** - Containerized deployment with Docker Compose support
- ✅ **Fully Tested** - 95 tests with 73% code coverage

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/harperreed/weather-dashboard.git
cd weather-dashboard

# Start with Docker Compose
docker-compose up -d
```

### Local Development

```bash
# Install dependencies with uv
uv sync --all-extras --dev

# Run the application
uv run python main.py

# Run tests
uv run pytest tests/ -v
```

Visit `http://localhost:5001` to see your weather dashboard!

## API Endpoints

- `GET /` - Main weather dashboard
- `GET /api/weather` - Current weather data (supports lat/lon and location params)
- `GET /api/providers` - Available weather providers
- `POST /api/providers/switch` - Switch active weather provider
- `GET /api/cache/stats` - Cache statistics
- `GET /{city}` - Weather for predefined cities (chicago, nyc, sf, etc.)

## Real-time Features

The dashboard automatically updates using WebSockets with the following features:

- **Live weather updates** every 10 minutes
- **Provider switch notifications** when changing weather sources
- **Connection status indicators** showing WebSocket/polling status
- **Automatic reconnection** with exponential backoff

## Weather Providers

### OpenMeteo (Primary)

- **Free** European weather service
- **No API key required**
- Excellent data quality and reliability

### PirateWeather (Fallback)

- Dark Sky API replacement
- Requires API key (set `PIRATE_WEATHER_API_KEY` environment variable)
- Automatic failover when OpenMeteo is unavailable

## Configuration

Set these environment variables:

```bash
SECRET_KEY=your-secret-key-here
PIRATE_WEATHER_API_KEY=your-pirate-weather-key  # Optional
```

## Testing

The project includes comprehensive testing:

```bash
# Run all tests
uv run pytest tests/ -v

# Run with coverage
uv run pytest tests/ --cov=. --cov-report=html

# Run specific test types
uv run pytest tests/unit/ -v          # Unit tests
uv run pytest tests/integration/ -v   # Integration tests
uv run pytest tests/test_frontend.py -v  # Frontend tests
```

## CI/CD Workflows

This project includes comprehensive GitHub Actions workflows:

### 🧪 Test Workflow (`test.yml`)

- Runs tests across Python 3.10, 3.11, and 3.12
- Generates coverage reports and uploads to Codecov
- Enforces 70% minimum code coverage
- Produces test artifacts for review

### 🔍 Code Quality (`lint.yml`)

- **Ruff** for fast Python linting and formatting
- **Black** for code formatting consistency
- **isort** for import sorting
- **MyPy** for type checking
- **Bandit** for security scanning
- **Radon** for complexity analysis

### 🔒 Security Scanning (`security.yml`)

- **CodeQL** analysis for vulnerability detection
- **Semgrep** for security pattern matching
- **Gitleaks** for secret scanning
- **Safety** and **pip-audit** for dependency vulnerability checks
- **License compatibility** checking

### 🐳 Docker Workflow (`docker.yml`)

- Builds and tests Docker images
- **Trivy** security scanning for container vulnerabilities
- Multi-architecture builds
- Pushes to GitHub Container Registry
- Tests Docker Compose configurations

### 🚀 Deployment (`deploy.yml`)

- Staging deployment on `develop` branch
- Production deployment on version tags
- Automated GitHub releases
- Smoke testing and health checks

### 📊 Status & Metrics (`status.yml`)

- Code metrics and complexity analysis
- Repository health checks
- Dependency graph generation
- Automated status badges

### 📦 Dependency Management

- **Dependabot** for automated dependency updates
- Auto-merge for minor/patch updates after tests pass
- Security update prioritization

## Development

### Adding a New Weather Provider

1. Create a new provider class in `weather_providers.py`:

```python
class NewProvider(WeatherProvider):
    def fetch_weather_data(self, lat, lon):
        # Implement API call
        pass

    def process_weather_data(self, raw_data, location_name=None):
        # Process and normalize data
        pass
```

2. Add the provider to the manager in `main.py`
3. Add tests in `tests/unit/test_weather_providers.py`

### Project Structure

```
weather-dashboard/
├── .github/                 # GitHub workflows and templates
├── static/                  # Frontend assets
│   ├── js/                 # JavaScript components
│   └── icons/              # Weather icons
├── templates/              # HTML templates
├── tests/                  # Test suite
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── conftest.py        # Test configuration
├── main.py                # Flask application
├── weather_providers.py   # Weather provider abstractions
├── pyproject.toml         # Project configuration
└── docker-compose.yml     # Container orchestration
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `uv run pytest tests/ -v`
5. Check code quality: `uv run ruff check . && uv run black --check .`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

## Security

For security vulnerabilities, please email [security@yourproject.com] instead of filing a public issue.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Weather data provided by [Open-Meteo](https://open-meteo.com/) and [PirateWeather](https://pirateweather.net/)
- Weather icons from [Meteocons](https://bas.dev/work/meteocons)
- Built with [Flask](https://flask.palletsprojects.com/), [uv](https://docs.astral.sh/uv/), and [Docker](https://www.docker.com/)
