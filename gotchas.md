# Gotchas

- PR #24's nine commits already exist on `main` as patch-equivalent commits; close it rather than merge it.
- Keep Docker's copied `site-packages` path aligned with both Python base-image stages. The current 3.13 image still names the old 3.10 path and cannot build.
- The NWS `/alerts/active` endpoint rejects the `limit` query parameter. Preserve upstream failures as errors; never cache them as a valid zero-alert result.
- Parse location once for the whole page. Independent widget defaults currently mix data from several cities on one route.
