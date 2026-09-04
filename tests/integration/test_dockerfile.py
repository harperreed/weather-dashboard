# ABOUTME: Guards the Docker build against Python-version-specific dependency paths.
# ABOUTME: Verifies the builder virtual environment is copied intact into runtime.

from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
EXPECTED_STAGE_COUNT = 2


def _dockerfile_instructions(contents: str) -> list[str]:
    instructions = []
    pending = ''

    for raw_line in contents.splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue

        pending = f'{pending} {line}'.strip()
        if pending.endswith('\\'):
            pending = pending[:-1].rstrip()
            continue

        instructions.append(pending)
        pending = ''

    assert not pending
    return instructions


def test_dockerfile_uses_locked_version_independent_virtual_environment() -> None:
    contents = (PROJECT_ROOT / 'Dockerfile').read_text()
    instructions = _dockerfile_instructions(contents)
    from_indices = [
        index
        for index, instruction in enumerate(instructions)
        if instruction.startswith('FROM ')
    ]

    assert len(from_indices) == EXPECTED_STAGE_COUNT
    base_images = [instructions[index].split()[1] for index in from_indices]
    assert base_images[0] == base_images[1]

    builder_stage = instructions[: from_indices[1]]
    production_stage = instructions[from_indices[1] :]
    create_venv = 'RUN python -m venv /opt/venv'
    activate_venv = 'ENV VIRTUAL_ENV=/opt/venv'
    sync_dependencies = (
        'RUN uv sync --active --locked --no-dev --no-install-project --compile-bytecode'
    )

    assert 'COPY pyproject.toml uv.lock ./' in builder_stage
    assert 'RUN pip install uv==0.9.25' in builder_stage
    assert create_venv in builder_stage
    assert activate_venv in builder_stage
    assert sync_dependencies in builder_stage
    assert builder_stage.index(create_venv) < builder_stage.index(activate_venv)
    assert builder_stage.index(activate_venv) < builder_stage.index(sync_dependencies)

    assert 'COPY --from=builder /opt/venv /opt/venv' in production_stage
    assert 'ENV PATH="/opt/venv/bin:$PATH"' in production_stage
    assert 'ENV HOST=0.0.0.0' in production_stage
    assert 'CMD ["python", "main.py"]' in production_stage
    assert all('site-packages' not in instruction for instruction in instructions)
    assert all(
        '/usr/local/bin' not in instruction
        for instruction in instructions
        if instruction.startswith('COPY --from=builder ')
    )


def test_dockerignore_excludes_non_runtime_artifacts() -> None:
    patterns = {
        line.strip()
        for line in (PROJECT_ROOT / '.dockerignore').read_text().splitlines()
        if line.strip() and not line.lstrip().startswith('#')
    }

    expected_exclusions = {
        '.github/',
        '.mypy_cache/',
        '.private-journal/',
        '.ruff_cache/',
        '.scratch/',
        '*.bak',
        'docs/',
        'tests/',
    }
    required_runtime_files = {
        'main.py',
        'pyproject.toml',
        'static/',
        'templates/',
        'uv.lock',
        'weather_providers.py',
    }

    assert expected_exclusions <= patterns
    assert patterns.isdisjoint(required_runtime_files)
