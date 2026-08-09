# Critical Repairs Design

## Scope

Fix three confirmed release blockers without widening the change into a general
cleanup:

- Unknown city paths must not render path content as HTML.
- The production Docker image must carry the same Python environment built in
  the builder stage.
- NWS alert requests must use the documented API contract and must not report
  an upstream failure as zero active alerts.

PR #24 is closed as superseded. Its commits were already patch-equivalent to
work on `main`, and its remaining Dockerfile was older than `main`.

## Design

### Unknown city responses

`weather_by_city` will return a Flask `Response` with status 404 and the
`text/plain` media type. User-controlled path text stays useful in the message
but never enters an HTML parsing context. A route-level regression test will
send an HTML event-handler payload and assert both the plain-text media type and
the lack of an executable HTML fragment.

### Docker environment

The builder will create `/opt/venv`, install the project into it with `uv`, and
the production stage will copy that directory unchanged. Both stages will put
`/opt/venv/bin` first on `PATH`. This removes the duplicated Python minor
version from `COPY`, so a future base-image bump cannot recreate the current
3.10-versus-3.13 mismatch.

A small integration test will inspect the Dockerfile contract: dependencies
must live in the copied virtual environment, and no version-specific
`site-packages` path may remain. A fresh `docker build` and container health
request will verify the real artifact.

### NWS alerts

The provider will request active alerts by `point` and `status`, which are
documented NWS filters. It will not send the unsupported `limit` parameter. If
the alerts endpoint returns a non-200 response, the provider will return
failure instead of a partial object with `alerts=None`. The forecast request
remains optional because the provider's safety-critical contract is alert
delivery.

Unit tests will assert the exact filter set and the failure result. The existing
API integration test will continue to prove that a provider failure becomes an
HTTP 500 response and is not cached as a successful no-alert result. A live NWS
request will confirm the current contract.

## Error handling

- Unknown cities: HTTP 404, plain text.
- NWS alert upstream failure: provider returns `None`; the API returns its
  existing HTTP 500 error shape and does not cache it.
- NWS forecast upstream failure: alert data still succeeds with no forecast.
- Docker build or startup failure: verification fails; no image is treated as
  releasable.

## Success criteria

- The XSS payload has no HTML response context.
- Tests prove NWS requests omit `limit` and alert failures cannot become an
  empty-success response.
- A fresh Docker image builds, starts, and answers its health endpoint.
- The full test suite passes, and the repair adds no Ruff or MyPy errors.

## Known limits

This batch does not add global security headers, redesign provider errors, fix
the existing lint/type backlog, or address the other audit findings.
