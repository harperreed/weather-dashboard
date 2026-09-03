// ABOUTME: Loads every script weather.html includes into one shared global scope.
// ABOUTME: Guards against top-level name collisions that abort a file before it registers anything.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TEMPLATE = path.join(REPO_ROOT, 'templates', 'weather.html');

// The page is the source of truth for which scripts load and in what order.
function pageScripts() {
    const html = fs.readFileSync(TEMPLATE, 'utf8');
    const tags = html.matchAll(/<script\s+src="(\/static\/js\/[^"]+)"/g);
    return [...tags].map(([, src]) => src);
}

const noop = () => {};

// Timers the page starts are held here so a polling loop can never pin the
// test process. A live handle keeps node alive no matter what timeout is set.
const timers = [];

function browserGlobals() {
    const element = () => ({
        style: {},
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        addEventListener: noop,
        removeEventListener: noop,
        appendChild: noop,
        setAttribute: noop,
        getAttribute: () => null,
        remove: noop,
        querySelector: () => null,
        querySelectorAll: () => [],
        innerHTML: '',
        textContent: ''
    });

    const scope = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
        setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; },
        clearTimeout,
        setInterval: (fn, ms) => { const id = setInterval(fn, ms); timers.push(id); return id; },
        clearInterval,
        io: () => ({ on: noop, emit: noop, connect: noop }),
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { serviceWorker: { register: () => Promise.resolve() } },
        location: { href: 'http://localhost/', search: '', pathname: '/', reload: noop },
        fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
        customElements: { define: noop, get: () => undefined },
        HTMLElement: class {
            attachShadow() {
                this.shadowRoot = {
                    innerHTML: '',
                    getElementById: () => null,
                    querySelector: () => null,
                    querySelectorAll: () => [],
                    addEventListener: noop
                };
                return this.shadowRoot;
            }
        },
        document: {
            addEventListener: noop,
            removeEventListener: noop,
            getElementById: () => element(),
            querySelector: () => element(),
            querySelectorAll: () => [],
            createElement: () => element(),
            body: element(),
            documentElement: element(),
            readyState: 'complete'
        }
    };

    scope.window = scope;
    scope.globalThis = scope;
    return vm.createContext(scope);
}

test.after(() => timers.forEach(clearInterval));

// Without this the regex could match nothing and the collision test would
// pass while checking no scripts at all.
test('the page loads several local scripts', () => {
    const scripts = pageScripts();

    assert.ok(
        scripts.length >= 2,
        `expected weather.html to include local scripts, found ${JSON.stringify(scripts)}`
    );
    assert.ok(scripts.includes('/static/js/weather-components.js'));
});

test('every page script loads into one shared global scope', () => {
    const scope = browserGlobals();

    for (const src of pageScripts()) {
        const file = path.join(REPO_ROOT, src.replace(/^\//, ''));
        const code = fs.readFileSync(file, 'utf8');

        // Browsers share one global scope across classic scripts, so a
        // top-level binding in one file collides with the same name in another.
        assert.doesNotThrow(
            () => new vm.Script(code, { filename: src }).runInContext(scope),
            `${src} failed to load alongside the scripts before it`
        );
    }
});
