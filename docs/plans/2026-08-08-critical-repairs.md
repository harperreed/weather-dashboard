# Critical Repairs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the reflected XSS, make the Docker image version-safe, and restore truthful NWS alert behavior.

**Architecture:** Unknown-city errors leave the HTML context through a plain-text Flask response. Docker dependencies live in a copied `/opt/venv` instead of a Python-minor-specific directory. The NWS provider treats alert retrieval as required while keeping forecast retrieval optional.

**Tech Stack:** Python 3.10+, Flask, pytest, requests, Docker, uv

---

## Execution status

Implemented on `wip/critical-repairs`. The repair tasks and their task-level
reviews are complete. Fresh verification recorded 284 passing tests at 83%
coverage, a successful no-cache Docker build and container health request, a
live NWS HTTP 200 response using only `point` and `status`, and an inert
plain-text XSS reproduction. The existing project backlog remains at 27 Ruff
errors and 18 MyPy errors outside this repair diff. A full lock refresh updated
35 packages, added 3, removed 1, and reduced the project dependency audit from
20 advisories across 12 packages to zero.

### Task 1: Make unknown-city errors inert

**Files:**
- Modify: `tests/unit/test_main.py`
- Modify: `main.py:505-507`

**Step 1: Write the failing test**

Add a test that requests an encoded `<img src=x onerror=alert(1)>` city path and
asserts status 404 plus `text/plain; charset=utf-8`.

```python
def test_weather_by_city_route_does_not_render_city_as_html(self, client: Any) -> None:
    response = client.get('/%3Cimg%20src=x%20onerror=alert(1)%3E')

    assert response.status_code == HTTP_NOT_FOUND
    assert response.content_type == 'text/plain; charset=utf-8'
```

**Step 2: Run the test to verify it fails**

Run:

```bash
uv run pytest tests/unit/test_main.py::TestMainRoutes::test_weather_by_city_route_does_not_render_city_as_html -q
```

Expected: FAIL because Flask treats the returned string tuple as `text/html`.

**Step 3: Write the minimal implementation**

Return a `Response` from `weather_by_city`:

```python
message = f"City '{city}' not found. Available cities: {', '.join(CITY_COORDS)}"
return Response(message, status=HTTP_NOT_FOUND, mimetype='text/plain')
```

Use the existing status-code convention or add a local constant if required by
the file's style.

**Step 4: Run focused and route tests**

Run:

```bash
uv run pytest tests/unit/test_main.py tests/test_frontend.py -q
```

Expected: PASS with no warnings introduced by the change.

**Step 5: Commit**

```bash
git add main.py tests/unit/test_main.py
git commit -m "fix: make unknown city errors plain text"
```

### Task 2: Remove the Docker Python-version path coupling

**Files:**
- Create: `tests/integration/test_dockerfile.py`
- Modify: `Dockerfile:15-43`

**Step 1: Write the failing integration test**

Read the Dockerfile and assert that it creates and copies `/opt/venv`, puts its
binary directory on `PATH`, and contains no `site-packages` path.

```python
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]


def test_dockerfile_copies_version_independent_virtual_environment() -> None:
    dockerfile = (PROJECT_ROOT / 'Dockerfile').read_text()

    assert 'uv venv /opt/venv' in dockerfile
    assert 'COPY --from=builder /opt/venv /opt/venv' in dockerfile
    assert 'ENV PATH="/opt/venv/bin:$PATH"' in dockerfile
    assert 'site-packages' not in dockerfile
```

Start the new Python test file with the required two `ABOUTME` comments.

**Step 2: Run the test to verify it fails**

Run:

```bash
uv run pytest tests/integration/test_dockerfile.py -q
```

Expected: FAIL because the Dockerfile copies Python 3.10 `site-packages`.

**Step 3: Write the minimal Docker implementation**

In the builder stage:

```dockerfile
RUN uv venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN uv pip install --compile-bytecode .
```

In the production stage:

```dockerfile
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
```

Keep the existing `/usr/local/bin` copy only if the running image needs a tool
installed there; otherwise remove it because the application starts through the
virtual environment's Python.

**Step 4: Run the integration test**

Run:

```bash
uv run pytest tests/integration/test_dockerfile.py -q
```

Expected: PASS.

**Step 5: Build and exercise the real image**

Run:

```bash
docker build --no-cache -t weather-dashboard:critical-repairs .
docker run --rm -d --name weather-dashboard-critical-repairs -p 5051:5001 weather-dashboard:critical-repairs
curl --fail --retry 10 --retry-delay 1 http://127.0.0.1:5051/api/cache/stats
docker stop weather-dashboard-critical-repairs
```

Expected: the build exits 0, the health request returns JSON, and the container
stops cleanly. Verify port 5051 is free before starting the container.

**Step 6: Commit**

```bash
git add Dockerfile tests/integration/test_dockerfile.py
git commit -m "fix: make Docker Python environment version-safe"
```

### Task 3: Restore the NWS alerts contract

**Files:**
- Modify: `tests/unit/test_nws_provider.py`
- Modify: `weather_providers.py:1831-1853`

**Step 1: Tighten the successful-request test**

Extend `test_fetch_weather_data_success` to assert the complete alert filter
set:

```python
assert alerts_call[1]['params'] == {
    'point': f'{CHICAGO_LAT:.4f},{CHICAGO_LON:.4f}',
    'status': 'actual',
}
```

This fails while the unsupported `limit` parameter is present.

**Step 2: Add the alert-failure test**

Add `test_fetch_weather_data_alerts_failure` with a successful points response
and a 500 alerts response. Assert the provider returns `None` and stops after
the second request.

Update the existing partial-failure test to cover only a forecast failure: use
successful points and alerts responses, a failed forecast response, and assert
that alert data remains available while forecast data is `None`.

**Step 3: Run the tests to verify they fail for the expected reasons**

Run:

```bash
uv run pytest tests/unit/test_nws_provider.py -q
```

Expected: the parameter assertion shows the extra `limit`, and the alert
failure test receives a partial result instead of `None`.

**Step 4: Write the minimal provider fix**

Remove `limit` and return `None` when the alerts response is not HTTP 200:

```python
alerts_params = {
    'point': f'{lat:.4f},{lon:.4f}',
    'status': 'actual',
}

if alerts_response.status_code != 200:
    print(f'❌ NWS alerts API returned {alerts_response.status_code}')
    return None
alerts_data = alerts_response.json()
```

Leave forecast failure handling unchanged.

**Step 5: Run provider and API tests**

Run:

```bash
uv run pytest tests/unit/test_nws_provider.py tests/integration/test_api_integration.py -q
```

Expected: PASS, including the existing HTTP 500 provider-failure case.

**Step 6: Verify the live NWS contract**

Send a real request with the application's user agent and only the `point` and
`status` filters. Record the HTTP status without saving response data in the
repository.

Expected: HTTP 200 from `https://api.weather.gov/alerts/active`.

**Step 7: Commit**

```bash
git add weather_providers.py tests/unit/test_nws_provider.py
git commit -m "fix: restore NWS alert requests"
```

### Task 4: Review and verify the batch

**Files:**
- Modify if needed: files touched in Tasks 1-3
- Modify: `gotchas.md`
- Create: `.private-journal/2026-08-08/<timestamp>-critical-repairs.md`

**Step 1: Run focused security reproductions**

Run the XSS route test, the Docker build test, and the NWS provider tests again.

Expected: PASS.

**Step 2: Run the full project checks**

Run:

```bash
uv run pytest
uvx --from ruff==0.6.4 ruff check .
uv run mypy . --ignore-missing-imports
uv run bandit -r main.py weather_providers.py
uv run --locked --with pip-audit pip-audit
```

Expected: the full tests pass, security and dependency checks pass, and Ruff
and MyPy add no errors beyond the baseline recorded in the audit. Report the
actual totals; do not hide existing failures.

**Step 3: Perform fresh-eyes review**

Review every changed production and test file for security, logic, business
rules, and performance. Fix findings through another red-green cycle.

**Step 4: Record durable lessons**

Append concise entries to `gotchas.md` for the Docker virtual-environment
contract and the NWS alert endpoint's supported filters. Add a project journal
entry with the completed verification evidence.

**Step 5: Commit the review artifacts**

```bash
git add gotchas.md .private-journal/2026-08-08 docs/plans/2026-08-08-critical-repairs.md
git commit -m "docs: record critical repair verification"
```

**Step 6: Final repository check**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: clean WIP branch with the design, plan, three repair commits, and
verification record.
