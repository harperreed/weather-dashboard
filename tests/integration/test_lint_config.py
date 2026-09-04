# ABOUTME: Guards the ruff version against drifting between local hooks and CI.
# ABOUTME: An unpinned CI install enforces a ruleset no local check ever runs.

import re
from pathlib import Path

import yaml


PROJECT_ROOT = Path(__file__).parents[2]
RUFF_PRE_COMMIT_REPO = 'https://github.com/astral-sh/ruff-pre-commit'


def _pre_commit_ruff_revision() -> str:
    config = yaml.safe_load((PROJECT_ROOT / '.pre-commit-config.yaml').read_text())
    revisions = [
        repo['rev'] for repo in config['repos'] if repo['repo'] == RUFF_PRE_COMMIT_REPO
    ]

    assert len(revisions) == 1, f'expected one ruff hook repo, found {revisions}'
    return str(revisions[0]).lstrip('v')


def _dev_dependency_ruff_pin() -> str:
    pyproject = (PROJECT_ROOT / 'pyproject.toml').read_text()
    pins = re.findall(r'^\s*"ruff==([^"]+)",\s*$', pyproject, re.MULTILINE)

    assert len(pins) == 1, f'expected one exact ruff pin in pyproject, found {pins}'
    return str(pins[0])


def test_local_hooks_and_the_project_pin_name_one_ruff_version() -> None:
    # The hook and the dev group are the two ways a developer gets ruff. When
    # they disagree, a commit can pass the hook and fail the same check in CI.
    assert _pre_commit_ruff_revision() == _dev_dependency_ruff_pin()


def test_ci_installs_the_pinned_ruff_rather_than_resolving_latest() -> None:
    workflow = (PROJECT_ROOT / '.github' / 'workflows' / 'lint.yml').read_text()

    # `uv add --dev ruff` resolves whatever is newest at run time, so the
    # enforced ruleset changes on ruff's release schedule rather than on a
    # commit here. Code Quality went red on untouched code for over a year.
    unpinned = re.findall(r'^\s*uv add .*\bruff\b(?!==).*$', workflow, re.MULTILINE)

    assert not unpinned, f'CI installs ruff unpinned: {unpinned}'


def test_the_formatter_leaves_markdown_alone() -> None:
    pyproject = (PROJECT_ROOT / 'pyproject.toml').read_text()
    exclude = re.search(r'^exclude = \[(.*?)^\]', pyproject, re.MULTILINE | re.DOTALL)

    assert exclude is not None, 'ruff has no exclude list'

    # Code fences in the plans and specs are excerpts, not modules. Formatting
    # them dedents class-method excerpts to top level with a dangling `self`,
    # and rewrites a single list element as a one-tuple — turning working
    # instructions into wrong ones.
    assert '"*.md"' in exclude.group(1)
