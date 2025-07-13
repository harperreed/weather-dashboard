# Weather Dashboard - Rust Backend Makefile

# Default target
.DEFAULT_GOAL := help

# Variables
BINARY_NAME := weather-server
DOCKER_IMAGE := weather-backend
DOCKER_TAG := latest

# Help target
.PHONY: help
help: ## Show this help message
	@echo "Weather Dashboard - Rust Backend"
	@echo "================================"
	@echo "Available commands:"
	@echo
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo

# Development targets
.PHONY: run
run: ## Run the application in development mode
	@echo "🚀 Starting Rust weather server..."
	cargo run --bin $(BINARY_NAME)

.PHONY: build
build: ## Build the application in debug mode
	@echo "🔨 Building debug version..."
	cargo build

.PHONY: release
release: ## Build the application in release mode
	@echo "🔨 Building release version..."
	cargo build --release

.PHONY: test
test: ## Run tests
	@echo "🧪 Running tests..."
	cargo test

.PHONY: fmt
fmt: ## Format code
	@echo "🎨 Formatting code..."
	cargo fmt

.PHONY: clippy
clippy: ## Run lints
	@echo "📎 Running clippy..."
	cargo clippy -- -D warnings

.PHONY: check
check: fmt clippy test ## Run all checks (format, lint, test)

.PHONY: clean
clean: ## Clean build artifacts
	@echo "🧹 Cleaning build artifacts..."
	cargo clean

# Docker targets
.PHONY: docker-build
docker-build: ## Build Docker image
	@echo "🐳 Building Docker image..."
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

.PHONY: docker-run
docker-run: ## Run Docker container
	@echo "🐳 Running Docker container..."
	docker run -p 5001:5001 --env-file .env $(DOCKER_IMAGE):$(DOCKER_TAG)

.PHONY: docker-clean
docker-clean: ## Clean Docker images
	@echo "🐳 Cleaning Docker images..."
	docker rmi $(DOCKER_IMAGE):$(DOCKER_TAG) || true

# Development utilities
.PHONY: watch
watch: ## Watch for changes and rebuild
	@echo "👀 Watching for changes..."
	cargo watch -x "run --bin $(BINARY_NAME)"

.PHONY: dev
dev: ## Development mode with auto-reload
	@echo "🔄 Starting development server with auto-reload..."
	cargo install cargo-watch
	$(MAKE) watch

.PHONY: install
install: ## Install development dependencies
	@echo "📦 Installing development dependencies..."
	cargo install cargo-watch

# Performance and profiling
.PHONY: bench
bench: ## Run benchmarks
	@echo "🏃 Running benchmarks..."
	cargo bench

.PHONY: profile
profile: ## Build with profiling enabled
	@echo "📊 Building with profiling..."
	cargo build --release --features profile

# Deployment targets
.PHONY: deploy-build
deploy-build: ## Build for deployment
	@echo "🚀 Building for deployment..."
	cargo build --release --target-dir ./target/deploy

.PHONY: size
size: ## Show binary size
	@echo "📏 Binary size information:"
	@ls -lh target/release/$(BINARY_NAME) 2>/dev/null || echo "Binary not found. Run 'make release' first."

# Environment setup
.PHONY: env
env: ## Create .env file from example
	@echo "📝 Creating .env file..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file from .env.example"; \
	else \
		echo ".env file already exists"; \
	fi

# Documentation
.PHONY: docs
docs: ## Generate documentation
	@echo "📚 Generating documentation..."
	cargo doc --open

# CI/CD targets
.PHONY: ci-build
ci-build: ## CI build target
	@echo "🔧 CI build..."
	cargo build --release --verbose

.PHONY: ci-test
ci-test: ## CI test target
	@echo "🧪 CI test..."
	cargo test --verbose

.PHONY: ci-lint
ci-lint: ## CI lint target
	@echo "📎 CI lint..."
	cargo clippy --verbose -- -D warnings

.PHONY: ci
ci: ci-lint ci-test ci-build ## Run all CI checks

# Utility targets
.PHONY: outdated
outdated: ## Check for outdated dependencies
	@echo "📦 Checking for outdated dependencies..."
	cargo outdated

.PHONY: audit
audit: ## Security audit
	@echo "🔒 Running security audit..."
	cargo audit

.PHONY: deps
deps: ## Update dependencies
	@echo "📦 Updating dependencies..."
	cargo update

.PHONY: tree
tree: ## Show dependency tree
	@echo "🌳 Dependency tree:"
	cargo tree

# Quick start
.PHONY: setup
setup: env install ## Initial setup for development
	@echo "✅ Setup complete! Run 'make run' to start the server."

.PHONY: quick-start
quick-start: setup run ## Complete setup and run