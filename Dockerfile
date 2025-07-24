# ABOUTME: Multi-stage Docker build for weather dashboard using standard Python approach
# ABOUTME: Simplified build process to avoid UV permission issues on Fly.io

# Build stage
FROM python:3.13-slim-bookworm AS builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY pyproject.toml ./

# Install UV
RUN pip install uv

# Install dependencies
RUN uv pip install --system --compile-bytecode .

# Production stage
FROM python:3.13-slim-bookworm

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    tzdata \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid app --shell /bin/bash --create-home app

# Set working directory
WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY --chown=app:app . .

# Switch to non-root user
USER app

# Set environment variables
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/api/cache/stats || exit 1

# Expose port
EXPOSE 5001

# Run the application
CMD ["python", "main.py"]
