# ABOUTME: Guards the Docker build against Python-version-specific dependency paths.
# ABOUTME: Verifies the builder virtual environment is copied intact into runtime.

from pathlib import Path


def test_dockerfile_copies_version_independent_virtual_environment() -> None:
    dockerfile = Path(__file__).parents[2] / 'Dockerfile'
    contents = dockerfile.read_text()

    assert 'python -m venv /opt/venv' in contents
    assert 'COPY --from=builder /opt/venv /opt/venv' in contents
    assert 'ENV PATH="/opt/venv/bin:$PATH"' in contents
    assert 'site-packages' not in contents
