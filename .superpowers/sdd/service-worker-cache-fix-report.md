# Service-worker Cache Fix Report

Implementation commit: `d0675e4bdeefbee141083426b820afb33707aee5`
(`fix: refresh service worker caches`)

## Change

- Bumped `CACHE_NAME` and `STATIC_CACHE_NAME` from v2 to v3 so cache-first
  clients receive the updated hourly component JavaScript and CSS.
- Replaced the prior cache-name test with a served-worker contract requiring
  both v3 names and rejecting both v2 names.
- Recorded the cache-bump release rule in `gotchas.md` and the hourly plan.

## TDD Evidence

RED:

```text
$ uv run --locked pytest tests/test_frontend.py -k service_worker_uses_v3_cache_names_for_component_release
1 failed, 21 deselected
assert "const CACHE_NAME = 'weather-dashboard-v3';" in source
```

GREEN:

```text
$ uv run --locked pytest tests/test_frontend.py -k service_worker_uses_v3_cache_names_for_component_release
1 passed, 21 deselected
```

## Verification

```text
$ uv run --locked pytest tests/test_frontend.py
22 passed

$ uv run --locked pytest tests
294 passed; 85% coverage

$ uvx --from ruff==0.6.4 ruff format --check .
23 files already formatted

$ git diff --check
(no output)
```

`ruff check .` still reports the accepted 27 findings only in unchanged
`tests/unit/test_lunar_provider.py`. `mypy .` still reports the accepted 22
findings in unchanged `main.py`, `weather_providers.py`, and `tests/conftest.py`.
The commit's normal hooks passed, including Ruff, mypy, and the coverage gate.

Fresh-eyes review found one overlong test declaration before commit; it was
wrapped, then the full suite was rerun.
