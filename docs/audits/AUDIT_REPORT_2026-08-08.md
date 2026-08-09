# Weather Dashboard Codebase Audit

Generated: 2026-08-08
Audit baseline: `8ffe3fd`
Branch: `wip/codebase-review-2026-08-08`

## Executive summary

The app is not ready for another public release. Its unit-heavy test suite passes, but live checks found a reflected XSS flaw, a broken production image, a broken National Weather Service alerts request, mixed-location widgets, incorrect air-quality units, and privacy leaks involving precise coordinates.

The current production deployment is behind the repository because both production runs after the Python 3.13 image change failed. PR #24 should not be merged: all nine commits already exist on `main` as patch-equivalent commits, and the branch trees differ only by the later Docker image change.

| Area | Result |
|---|---|
| Python tests | 268 passed; 83% coverage |
| Live no-mock scenario | Passed after exercising the app and live weather services |
| Ruff format | Passed; 20 files formatted |
| Ruff lint | Failed with 41 findings |
| MyPy | Failed with 18 errors |
| Bandit | Passed |
| Python dependency audit | No known vulnerabilities found |
| Docker build | Failed at `Dockerfile:42` |
| Rendered browser audit | Blocked by missing sandbox-policy metadata in the browser runtime |
| Documentation | 4 documents and 937 lines audited; more than 60 grouped claims are false or need review |

## Critical — fix before shipping

| # | Issue | Evidence | Sources |
|---|---|---|---|
| 1 | **Unknown city paths allow reflected XSS.** The route inserts decoded path text into an HTML response without escaping, and the page has no CSP. | `main.py:481-507`; a live request for an encoded `<img onerror>` payload returned the raw tag in a 404 HTML body. | Security, live verification |
| 2 | **The production image cannot build.** Both stages use Python 3.13, but the runtime copies Python 3.10 site-packages. The last two production deploy runs failed, leaving production behind the repository. | `Dockerfile:5,26,42`; local `docker build` failed with `python3.10/site-packages: not found`. | Performance, Copy, live build |
| 3 | **Weather alerts are silently broken.** The NWS `/alerts/active` request sends unsupported `limit=20`, receives HTTP 400, converts the failure into an empty alert set, caches it, and returns HTTP 200. | `weather_providers.py:1832-1851`; `main.py:590-638`. The current NWS OpenAPI filter list has no `limit` parameter. | Live scenario, Copy, Accessibility |
| 4 | **One page can show several cities at once.** The main controller resolves the selected route, while supporting widgets independently default to Chicago or New York. The page never displays the selected location, so the error is hard to detect. | `weather-components.js:1713-1821,2448-2454,2784-2790,3400-3406,3661-3666,4090-4095,4710-4715`. | Performance, Mobile, Copy, SEO |
| 5 | **Air-quality values use false units.** AirNow pollutant AQI values are displayed as `μg/m³` or `mg/m³`, and CO is rescaled as though it were a concentration. | `weather_providers.py:793-829`; `weather-components.js:968-996,1081-1089`. | Copy |
| 6 | **Precise coordinates leak through public surfaces.** Geolocation writes full coordinates into shareable URLs. Cache keys keep four decimals, and the public health endpoint returns those keys. | `weather-components.js:1556-1567,1618-1637`; `main.py:557-578,1099-1109`. | Security, Social/Meta, Mobile |
| 7 | **Safety and failure states are inaccessible or hidden.** Alert expanders are click-only `<div>` elements; alert refresh listeners cannot receive the document event; fetch failure becomes “no alerts”; main weather errors are emitted but never displayed; cached offline data has no age or stale marker. | `weather-components.js:2417-2445,2501-2504,2631-2641`; `realtime-weather.js:132-149`; `sw.js:101-120`. | Accessibility, Mobile, Copy, Standards |
| 8 | **Enhanced temperature trends never render.** Its required config key does not exist, its own default method is unused, and it hides itself on every load. | `weather-components.js:166,3831-3856`. | Standards, Mobile |

## Important — fix next

| # | Issue | Evidence | Sources |
|---|---|---|---|
| 1 | **Cold page loads duplicate live weather work.** Independent widgets fan out into seven app requests and up to four current-weather acquisitions before provider multiplication. Several upstream calls run sequentially with separate ten-second waits. | `templates/weather.html:138-157`; `main.py:721-1078`; `weather_providers.py:563-715,1809-1868`. | Performance |
| 2 | **Public API and Socket.IO inputs lack one validation path and abuse controls.** Valid zero coordinates become Chicago, invalid ranges and non-finite values reach providers, Socket.IO bypasses caches, and JSON `null` makes provider switching return 500. Any caller can mutate the global provider. | `main.py:543-573,1204-1282`. | Security, live verification |
| 3 | **Provider keys can leak.** AirNow uses plain HTTP and logs its full key-bearing URL. Pirate Weather places the key in its URL path and logs that URL. | `weather_providers.py:452-459,732-753`. | Security |
| 4 | **The app has no global security headers, and upstream text enters `innerHTML`.** A strict CSP will also require removing inline scripts and inline event handlers. | `main.py:1299-1312`; `templates/weather.html:171-278`; `weather-components.js:2527-2662`. | Security, Standards |
| 5 | **Production runs Werkzeug directly.** Docker launches `python main.py`, which enables `allow_unsafe_werkzeug=True`. Socket.IO origin defaults also omit the Fly origin. | `Dockerfile:63`; `main.py:60-64,1323-1326`. | Security, Performance |
| 6 | **Shared caches are unsafe under concurrency.** Check-then-get operations race expiry, misses can stampede upstream, cached weather dicts are mutated for location labels, and air quality uses the weather cache instead of its declared TTL. | `main.py:79-98,557-578,1150-1198`. | Performance |
| 7 | **HTTP validators and route contracts are false or ambiguous.** ETags omit representation fields, use process-random hashes, and never return 304. Duplicate single-segment and static routes leave later handlers unreachable. | `main.py:45,481,510,561,1293`. | Standards, Performance |
| 8 | **Service-worker work can be dropped or stay stale forever.** Important cache and lifecycle promises are not awaited, cache names never advance, API entries have no age or bound, and manifest URLs differ. | `sw.js:2-3,66-87,101-120,154-189`; `templates/weather.html:24`. | Standards, Performance, Mobile |
| 9 | **Core accessibility is weak.** The page lacks a main landmark, H1/H2 and skip link; charts lack names or data alternatives; default-theme contrast fails; motion ignores `prefers-reduced-motion`; collapsed radar controls remain focusable. | `templates/weather.html:28-38,138-157`; `weather-components.js:3078-3132,3874-4036`; `static/manifest.json:9`. | Accessibility, Mobile |
| 10 | **Mobile controls and layouts need repair.** Radar controls and trend checkboxes are too small, the radar canvas distorts, dashboard mode can overflow narrow screens, and long alerts have no narrow layout. | `weather-components.js:2590-2612,3027-3069,3917-4036`; `templates/weather.html:129-135`. | Mobile, Accessibility |
| 11 | **Search and sharing have no explicit policy.** Routes share one title and description, have no canonical/OG/X metadata, city routes have no server-rendered location content or links, and robots/sitemap routes return 404. Generated deep links fail on the stale production deployment. | `templates/weather.html:3-26,138-178`; `main.py:475-533`. | SEO, Social/Meta |
| 12 | **Test labels overstate coverage.** Integration and frontend tests mock internal boundaries or inspect strings rather than a browser. Some assertions cannot fail. There is no committed end-to-end browser scenario, accessibility test, PWA lifecycle test, concurrency test, request budget, or conditional-request test. | `tests/integration/test_api_integration.py`; `tests/test_frontend.py:20-34,78,253`; `TESTING.md`. | Performance, Accessibility, Standards, documentation audit |
| 13 | **Quality gates are red despite green tests.** Ruff reports 41 issues and MyPy reports 18 errors. The pre-commit coverage threshold, CI threshold and README threshold disagree. | `pyproject.toml`; `.pre-commit-config.yaml`; `.github/workflows/test.yml`; `README.md`. | Live verification, documentation audit |
| 14 | **Build and workflow inputs are mutable.** Fly setup uses `@master`, Claude uses `@beta`, Docker installs unpinned uv and ignores `uv.lock`, and Socket.IO loads from a CDN without SRI. | `.github/workflows/fly-*.yml`; `.github/workflows/claude.yml`; `Dockerfile:16-23`; `templates/weather.html:171`. | Security, Standards |
| 15 | **Tracked artifacts disclose or duplicate stale state.** `main.py.bak` is a large stale source copy. `static/icons/tests/report.html` is publicly deployed and contains local environment/test metadata. The notification “PNG” is actually a data-URL text file. | `main.py.bak`; `static/icons/tests/report.html`; `static/icons/icon-72x72.png`. | Security, Social/Meta, Standards |

## Minor — backlog after the core repair

| # | Issue | Sources |
|---|---|---|
| 1 | PWA manifest locks portrait orientation and does not preserve location/theme context. | Accessibility, Mobile |
| 2 | Apple touch and mask icons reuse a detailed SVG; the maskable icon may have padding. | Social/Meta |
| 3 | Weather icons expose machine names such as `clear-day` as alt text; several emoji repeat adjacent text. | Accessibility |
| 4 | Provider branding, units, acronyms, locale and time formats are inconsistent. | Copy |
| 5 | Missing `SECRET_KEY` silently creates an ephemeral key; `.env.example` omits it. | Security |
| 6 | The NWS User-Agent still contains a placeholder repository URL. | Security |
| 7 | Several controls omit `type="button"`, `aria-expanded`, `aria-controls` or stable labels. | Accessibility, Standards |
| 8 | Current production health checks prove only that Flask responds, not that weather dependencies work. | Deployment documentation audit |

## Documentation audit

### Scope

| Document | Lines | Main drift patterns |
|---|---:|---|
| `README.md` | 208 | Nonexistent workflows, wrong test/coverage numbers, broken Docker quick start, missing license, placeholder security address |
| `DOCKER.md` | 171 | Stale ports and Python versions, ineffective reload instructions, required `.env` called optional, unwired Redis/Nginx claims |
| `TESTING.md` | 386 | Parallel mode lacks xdist, stale tree and CI example, unused markers, mocked “integration” claims, invalid option/fixture names |
| `.github/DEPLOYMENT_SETUP.md` | 172 | Deprecated/incomplete token commands, missing issue permission, runtime-env confusion, unconfigured protection rules |

### False claims requiring immediate correction

| Document:line | Claim | Reality |
|---|---|---|
| `README.md:5-6,120-148` | Security, Docker, deploy and status workflows exist as described. | Only `test.yml`, `lint.yml`, `claude.yml`, `fly-deploy-prod.yml` and `fly-pr-preview.yml` exist. |
| `README.md:19` | 95 tests and 73% coverage. | 268 tests pass with 83% coverage. |
| `README.md:106-109` | CI covers Python 3.10–3.12 and enforces 70%. | CI uses Python 3.10 and enforces 80%; pre-commit uses 76%. |
| `README.md:153-154` | Dependabot auto-merges and prioritizes security updates. | Dependabot opens scheduled update PRs; no auto-merge or priority rule exists. |
| `README.md:164` | All weather tests live in one file. | Provider tests span many unit files. |
| `README.md:191` | Black is part of the quality command. | Black is not a dependency or workflow step. |
| `README.md:198` | Security reports go to `security@yourproject.com`. | This is a placeholder address. |
| `README.md:202` | The repository contains an MIT `LICENSE`. | No `LICENSE` file exists. |
| `DOCKER.md:7` | `.env` setup is optional. | Compose requires `.env` and fails without it. |
| `DOCKER.md:25-33` | Production uses port 5000 and Python 3.12/uv images. | Production uses port 5001 and Python 3.13; uv is installed with pip. |
| `DOCKER.md:41,107` | The development setup reloads automatically. | `debug=False` is hard-coded, and the documented command does not enable Compose watch. |
| `DOCKER.md:96-97,130-132` | Redis and Nginx can be enabled by uncommenting them. | Redis has no application integration; Nginx refers to missing config and certificate paths. |
| `TESTING.md:14,134-135` | Parallel test execution works. | `pytest-xdist` is absent; `-n` fails. |
| `TESTING.md:142-143` | Unit and integration markers map the suites. | Unit selects 0 tests; integration misses 3 integration tests. |
| `TESTING.md:157` | The integration suite calls Open-Meteo. | The cited test patches `requests.get`. |
| `TESTING.md:162` | Frontend tests cover the production template. | They mainly inspect `test_components.html` and source strings. |
| `TESTING.md:194-196,369` | Fixture and coverage option names are valid. | `mock_openmeteo_response` and `--cov-exclude` do not exist. |
| `.github/DEPLOYMENT_SETUP.md:82` | Failed deploys create GitHub issues. | The workflow lacks `issues: write`; recent failed runs created no matching issue. |
| `.github/DEPLOYMENT_SETUP.md:119` | `flyctl tokens create` is a complete command. | Current Fly CLI requires a token type such as `deploy`. |
| `.github/DEPLOYMENT_SETUP.md:138-154` | Workflow environment and VM settings configure the deployed runtime as described. | Runtime env lives in Fly config/secrets; production VM size lives in `fly.toml`. |

### Pass 2 gap findings

- README documents 2 of the app's 11 API endpoints.
- README describes workflows and tools that are not present, while omitting the real Fly workflows.
- TESTING omits 9 unit-test files and does not describe the mock-heavy integration boundary.
- Deployment docs omit the hard-coded preview organization, fork-PR secret limitation, absent protection rules and recent deploy failures.
- Docker docs repeat stale port 5000 in four places and stale reload behavior in four places.

## PR #24

Do not merge it. `git cherry` marks all nine PR commits as patch-equivalent to commits already on `main`. A direct tree comparison differs only in `Dockerfile`, where `main` has the later Python 3.13 base-image bump. Close the PR with a note that its changes landed separately.

## Recommended repair order

1. Add failing tests for the reflected city path and fix the XSS response.
2. Fix the Docker Python path, add a real image-build check, and restore deployability.
3. Remove the unsupported NWS parameter; distinguish a provider failure from a valid empty alert response and test the live contract.
4. Create one location state used by every widget, show location and data age, and stop putting precise coordinates into public URLs and health data.
5. Correct AQI labels and alert/error/offline copy.
6. Repair input validation, rate limits, global provider mutation, headers, key logging and production serving.
7. Repair accessibility, service-worker lifecycle, cache concurrency and request fan-out.
8. Make Ruff and MyPy clean, add real browser/PWA scenarios to CI, then update the docs to match the working system.

## Deferred decisions

| Issue | Reason |
|---|---|
| SEO, canonical and social-card implementation | Decide whether this personal dashboard should be indexed before building public search pages. |
| Full visual, keyboard and focus verification | The in-app browser runtime rejected all calls because sandbox-policy metadata was missing. Source-backed findings still need a real browser pass after fixes. |
| Removing `main.py.bak` and the tracked HTML test report | Both are likely accidental artifacts, but deletion should be explicit. |
