# ABOUTME: Multi-stage Docker build using UV for Python dependency management
# ABOUTME: Optimized for production with smaller final image size

# Build stage - install dependencies
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

# Set working directory
WORKDIR /app

# Install system dependencies needed for building Python packages
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for better caching
COPY pyproject.toml uv.lock ./

# Install dependencies into virtual environment
# --frozen ensures exact versions from lockfile
# --no-cache prevents UV cache from bloating the image
RUN uv sync --frozen --no-cache --no-dev

# Production stage - minimal runtime
FROM python:3.13-slim-bookworm

# Install uv for runtime
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install timezone data and configure timezone
RUN apt-get update && apt-get install -y \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid app --shell /bin/bash --create-home app

# Set working directory
WORKDIR /app

# Copy virtual environment from builder stage with proper ownership
COPY --from=builder --chown=app:app /app/.venv /app/.venv

# Copy application code
COPY --chown=app:app . .

# Switch to non-root user
USER app

# Ensure we use the virtual environment
ENV PATH="/app/.venv/bin:$PATH"

# Set production environment
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/api/cache/stats || exit 1

# Expose port
EXPOSE 5001

# Run the application
CMD ["uv", "run", "main.py"]
