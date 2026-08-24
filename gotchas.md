# Gotchas

- PR #24's nine commits already exist on `main` as patch-equivalent commits; it was closed as superseded on 2026-08-08.
- Docker dependencies live in a locked `/opt/venv` copied between identical Python base images. Keep both stage images aligned and keep production installs tied to `uv.lock`.
- Audit this project's environment with `uv run --locked --with pip-audit pip-audit`; `uvx pip-audit` audits its isolated tool environment and can give a false clean result.
- NWS `/alerts/active` accepts the `point` and `status` filters used here, but rejects `limit`. Validate alert response shape and preserve upstream failures as errors; never cache them as a valid zero-alert result.
- Unknown-city paths contain user input. Keep their 404 responses in a plain-text context unless a template escapes the value explicitly.
- Parse location once for the whole page. Independent widget defaults currently mix data from several cities on one route.
- Frontend JavaScript unit tests run through pytest and require `node` on `PATH`; they use Node's built-in test runner and need no npm packages.
- The widget catalog is the only source for widget URL names; do not recreate aliases or host mappings in components.
- Public theme names are `blue|light|eink`; normalize legacy aliases before applying any styles.
- Keep the hourly chart, temperatures, icons, and times on the same centers for the actual number of rendered hours. Separate flex rows produce different widths and independent scroll positions, especially in eInk.
- Hour labels use zero-padded `%I%p`; strip only the leading padding with `lstrip('0')`, because replacing every zero corrupts labels such as `10pm`.
- Bump both service-worker cache names whenever a cached UI asset changes, or cache-first clients can keep the prior release.
- Size full-width pages against the layout viewport with `width: 100%`; `100vw` includes the desktop scrollbar and can create horizontal overflow.
- Give vertical space between adjacent eInk blocks one owner; stacked margins hid usable screen area in current conditions.
