# Docker Setup Guide

This weather app is containerized using Docker with UV for fast Python dependency management.

## Quick Start

1. **Set up environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env and add your PIRATE_WEATHER_API_KEY
   ```

2. **Build and run with Docker Compose:**

   ```bash
   # Production
   docker-compose up --build

   # Development with live reloading
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
   ```

3. **Access the app:**
   - Production: <http://localhost:5000>
   - Development: <http://localhost:5000> (with live reloading)

## Docker Architecture

### Multi-Stage Build

- **Builder stage**: Uses `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` for fast dependency installation
- **Runtime stage**: Minimal `python:3.12-slim-bookworm` with only necessary components

### Key Features

- **UV Integration**: Fast dependency resolution and installation
- **Security**: Non-root user for container execution
- **Performance**: Optimized layer caching and minimal final image size
- **Health checks**: Built-in monitoring for container health
- **Development support**: Live reloading and debugging capabilities

## Commands

### Docker Compose

```bash
# Production
docker-compose up -d                    # Run in background
docker-compose down                     # Stop and remove containers
docker-compose logs -f weather-app      # View logs

# Development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Direct Docker Commands

```bash
# Build image
docker build -t weather-app .

# Run container
docker run -p 5000:5000 --env-file .env weather-app

# Run with shell access
docker run -it --entrypoint /bin/bash weather-app
```

### UV Commands in Container

```bash
# Add new dependency
docker-compose exec weather-app uv add requests

# Update dependencies
docker-compose exec weather-app uv sync

# Run specific command
docker-compose exec weather-app uv run python -c "import requests; print(requests.__version__)"
```

## Configuration

### Environment Variables

- `PIRATE_WEATHER_API_KEY`: Required API key from pirateweather.net
- `FLASK_ENV`: Set to `production` or `development`
- `FLASK_DEBUG`: Enable/disable debug mode

### Docker Compose Services

- **weather-app**: Main application container
- **redis**: (Optional) Enhanced caching layer
- **nginx**: (Optional) Reverse proxy and SSL termination

## Development Workflow

1. **Start development environment:**

   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

2. **Make changes to code** - automatically reloaded via Docker Compose watch

3. **Add new dependencies:**

   ```bash
   docker-compose exec weather-app uv add package-name
   ```

4. **Rebuild on dependency changes:**

   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
   ```

## Production Deployment

1. **Set production environment variables in .env**
2. **Build and run:**

   ```bash
   docker-compose up -d
   ```

3. **Enable optional services** (uncomment in docker-compose.yml):
   - Redis for enhanced caching
   - Nginx for reverse proxy

## Troubleshooting

### Common Issues

1. **Build fails**: Ensure Docker daemon is running and you have internet access
2. **API errors**: Check that `PIRATE_WEATHER_API_KEY` is set correctly in `.env`
3. **Port conflicts**: Change port mapping in docker-compose.yml if 5000 is in use

### Debug Commands

```bash
# Check container logs
docker-compose logs weather-app

# Get shell access
docker-compose exec weather-app /bin/bash

# Check UV installation
docker-compose exec weather-app uv --version

# Verify dependencies
docker-compose exec weather-app uv pip list
```

## Performance Optimizations

- **Layer caching**: Dependencies are installed before copying app code
- **UV speed**: Faster dependency resolution than pip
- **Minimal runtime**: Production image excludes build tools
- **Health checks**: Automatic container health monitoring
- **Compression**: Flask-Compress enabled for smaller responses

## Security Features

- **Non-root user**: Container runs as unprivileged user
- **Minimal attack surface**: Only necessary packages in final image
- **Environment isolation**: Secrets managed via .env file
- **Health monitoring**: Built-in health checks for reliability
