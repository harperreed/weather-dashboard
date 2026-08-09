# ABOUTME: Guards the Docker build against Python-version-specific dependency paths.
# ABOUTME: Verifies the builder virtual environment is copied intact into runtime.

from pathlib import Path


def test_dockerfile_copies_version_independent_virtual_environment() -> None:
    dockerfile = Path(__file__).parents[2] / 'Dockerfile'
    contents = dockerfile.read_text()
    _, production_stage = contents.split('# Production stage', maxsplit=1)

    assert 'python -m venv /opt/venv' in contents
    assert 'uv pip install --python /opt/venv/bin/python' in contents
    assert 'COPY --from=builder /opt/venv /opt/venv' in contents
    assert 'ENV PATH="/opt/venv/bin:$PATH"' in production_stage
    assert 'ENV HOST=0.0.0.0' in production_stage
    assert 'CMD ["python", "main.py"]' in production_stage
    assert 'site-packages' not in contents
    assert 'COPY --from=builder /usr/local/bin' not in contents
