<!-- ABOUTME: Provides the test-first steps for tightening the eInk current-weather layout. -->
<!-- ABOUTME: Covers the viewport gutter, summary gap, width model, and release cache bump. -->

# eInk Current-Weather Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the eInk dashboard an 8px viewport gutter, an 8px summary-to-details gap, and full usable width without horizontal scrolling.

**Architecture:** Keep page sizing in `templates/weather.html` and component spacing in the shared component stylesheet. Remove the duplicate inline eInk summary rule so the external stylesheet remains the one source of truth, then advance the service-worker cache version so installed clients receive the changed assets.

**Tech Stack:** Flask/Jinja template CSS, Web Components with Shadow DOM, Node's built-in test runner, pytest, service worker Cache API

## Global Constraints

- Apply the spacing and width changes only to the eInk theme.
- Use an 8px (`0.5rem`) gutter on every supported viewport width.
- Use `width: 100%`, `max-width: none`, and `box-sizing: border-box` for the eInk weather container.
- Give the eInk summary an 8px (`0.5rem`) bottom margin and the details grid no top margin.
- Leave typography, icon sizes, card padding, chart geometry, widget order, and blue/light themes unchanged.
- Preserve the external stylesheet as the one source of truth for the eInk summary.
- Advance both service-worker cache names from v3 to v4 in the same release.
- Use `uv run --locked pytest tests` as the final project check.

---

## File Map

- Modify `tests/js/current-weather-range.test.js`: add source contracts for the eInk page gutter, width model, and current-weather gap.
- Modify `tests/test_frontend.py`: require v4 service-worker cache names for this CSS release.
- Modify `templates/weather.html`: replace the eInk `100vw` sizing and breakpoint-specific padding with one 8px full-width rule.
- Modify `static/css/weather-components.css`: make the eInk summary own the 8px gap and remove the details grid's extra top margin.
- Modify `static/js/weather-components.js`: remove the duplicate inline eInk summary override.
- Modify `static/sw.js`: advance both cache namespaces to v4.
- Modify `gotchas.md`: record the layout-width and single-owner spacing rules.

### Task 1: Compact full-width eInk current conditions

**Files:**
- Modify: `tests/js/current-weather-range.test.js`
- Modify: `tests/test_frontend.py`
- Modify: `templates/weather.html:149-161`
- Modify: `static/css/weather-components.css:696-720`
- Modify: `static/js/weather-components.js:293-297`
- Modify: `static/sw.js:3-4`
- Modify: `gotchas.md`

**Interfaces:**
- Preserves: the current-weather Shadow DOM markup and all weather response data.
- Produces: an eInk page with an 8px outer gutter and an 8px summary-to-details gap.
- Produces: `weather-dashboard-v4` and `weather-dashboard-static-v4` cache namespaces.

- [ ] **Step 1: Write failing layout source contracts**

Append these tests to `tests/js/current-weather-range.test.js`:

```javascript
test('eInk page uses the full layout width with an 8px gutter', () => {
    const template = fs.readFileSync(
        path.join(__dirname, '../../templates/weather.html'),
        'utf8'
    );
    const containerRule = template.match(
        /\[data-theme="eink"\] \.weather-container\s*\{[^}]*\}/s
    )?.[0] || '';

    assert.match(containerRule, /max-width:\s*none;/);
    assert.match(containerRule, /width:\s*100%;/);
    assert.match(containerRule, /padding:\s*0\.5rem;/);
    assert.match(containerRule, /box-sizing:\s*border-box;/);
    assert.doesNotMatch(containerRule, /100vw/);
    assert.doesNotMatch(
        template,
        /@media \(max-width: 390px\)[\s\S]*?\[data-theme="eink"\] \.weather-container/
    );
});

test('eInk summary owns one compact gap before the detail cards', () => {
    const styles = fs.readFileSync(
        path.join(__dirname, '../../static/css/weather-components.css'),
        'utf8'
    );
    const components = fs.readFileSync(
        path.join(__dirname, '../../static/js/weather-components.js'),
        'utf8'
    );

    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.summary\s*\{[^}]*margin-bottom:\s*0\.5rem;/s
    );
    assert.match(
        styles,
        /:host\(\[data-theme="eink"\]\) \.weather-details\s*\{[^}]*margin-top:\s*0;/s
    );
    assert.doesNotMatch(
        components,
        /:host\(\[data-theme="eink"\]\) \.summary\s*\{/
    );
});
```

- [ ] **Step 2: Update the service-worker release contract**

In `tests/test_frontend.py`, rename the current cache test to
`test_service_worker_uses_v4_cache_names_for_spacing_release` and require:

```python
assert "const CACHE_NAME = 'weather-dashboard-v4';" in source
assert "const STATIC_CACHE_NAME = 'weather-dashboard-static-v4';" in source
assert 'weather-dashboard-v3' not in source
assert 'weather-dashboard-static-v3' not in source
```

- [ ] **Step 3: Run the focused tests to verify RED**

Run:

```bash
node --test tests/js/current-weather-range.test.js
uv run --locked pytest tests/test_frontend.py -k service_worker_uses_v4_cache_names_for_spacing_release
```

Expected: the Node suite fails because the eInk container still uses `100vw`
and large padding, the summary/details rules still stack margins, and the
inline summary override remains. The pytest contract fails because both cache
names still use v3.

- [ ] **Step 4: Implement the scoped eInk CSS changes**

Replace the eInk container rules in `templates/weather.html` with:

```css
[data-theme="eink"] .weather-container {
    max-width: none;
    width: 100%;
    padding: 0.5rem;
    box-sizing: border-box;
}
```

Delete the eInk `.weather-container` rule inside the 390px media query because
the approved 8px gutter applies at every width.

In `static/css/weather-components.css`, keep the existing summary typography
and change only its margin, then remove the extra grid margin:

```css
:host([data-theme="eink"]) .summary {
    font-size: 2rem;
    font-weight: 900;
    margin-bottom: 0.5rem;
}

:host([data-theme="eink"]) .weather-details {
    gap: 0.75rem;
    margin-top: 0;
}
```

Delete the complete inline eInk `.summary` block from `getSharedStyles()` in
`static/js/weather-components.js`; the external rule already owns the same
font size and weight.

- [ ] **Step 5: Advance the service-worker cache names**

Change the two declarations in `static/sw.js` to:

```javascript
const CACHE_NAME = 'weather-dashboard-v4';
const STATIC_CACHE_NAME = 'weather-dashboard-static-v4';
```

- [ ] **Step 6: Record the layout rules**

Append these lines to `gotchas.md`:

```markdown
- Size full-width pages against the layout viewport with `width: 100%`; `100vw` includes the desktop scrollbar and can create horizontal overflow.
- Give vertical space between adjacent eInk blocks one owner; stacked margins hid usable screen area in current conditions.
```

- [ ] **Step 7: Run focused GREEN checks**

Run:

```bash
node --test tests/js/current-weather-range.test.js
uv run --locked pytest tests/test_frontend.py -k service_worker_uses_v4_cache_names_for_spacing_release
```

Expected: both commands pass with no warnings or errors.

- [ ] **Step 8: Verify the rendered layout**

Run the Flask application and inspect eInk at 800px and 320px. At each width,
measure the document, `.weather-container`, current-widget top position,
`.summary`, and `.weather-details` bounding boxes.

Expected at both widths:

- `document.documentElement.scrollWidth === window.innerWidth`
- the container's left and right padding are both 8px
- `.weather-details` starts 8px below `.summary`
- all four detail cards remain inside the viewport
- the hourly chart and labels retain their prior no-overflow behavior

- [ ] **Step 9: Run the full project checks**

Run:

```bash
uv run --locked pytest tests
uvx --from 'ruff==0.6.4' ruff format --check .
uvx --from 'ruff==0.6.4' ruff check tests/test_frontend.py
git diff --check
```

Expected: all 294 pytest items pass, including the expanded JavaScript suite;
all Python files are formatted; the changed Python test passes Ruff; and the
diff has no whitespace errors.

- [ ] **Step 10: Fresh-eyes review and commit**

Review every changed file for theme leakage, duplicated spacing rules,
horizontal overflow, cache-version mismatch, and test gaps. Then run:

```bash
git add tests/js/current-weather-range.test.js tests/test_frontend.py templates/weather.html static/css/weather-components.css static/js/weather-components.js static/sw.js gotchas.md
git commit -m "fix: tighten eink current conditions"
```
