// ABOUTME: Tests that the connection badge reports a socket that connected before it started listening.
// ABOUTME: Loads the real page scripts into one vm context with a DOM event bus and a controllable socket.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TEMPLATE = path.join(REPO_ROOT, 'templates', 'weather.html');

const noop = () => {};

// Timers the page starts are held here so a polling loop can never pin the
// test process. A live handle keeps node alive whatever the tests score.
const timers = [];
test.after(() => timers.forEach(clearInterval));

function pageScripts() {
    const html = fs.readFileSync(TEMPLATE, 'utf8');
    return [...html.matchAll(/<script\s+src="(\/static\/js\/[^"]+)"/g)].map(([, src]) => src);
}

// className and classList address the same string: the badge sets className
// to reset the element, then adds a state class on top of it.
function element(tag = 'div') {
    const classes = () => new Set(el.className.split(/\s+/).filter(Boolean));
    const write = set => { el.className = [...set].join(' '); };

    const el = {
        tagName: tag,
        id: '',
        className: '',
        textContent: '',
        innerHTML: '',
        style: {},
        children: [],
        classList: {
            add(...names) { const set = classes(); names.forEach(n => set.add(n)); write(set); },
            remove(...names) { const set = classes(); names.forEach(n => set.delete(n)); write(set); },
            contains(name) { return classes().has(name); },
            toggle: noop
        },
        addEventListener: noop,
        removeEventListener: noop,
        appendChild(child) { el.children.push(child); return child; },
        setAttribute: noop,
        getAttribute: () => null,
        remove: noop,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    return el;
}

function browserGlobals() {
    // Elements reach getElementById by being appended to the body, the way
    // createConnectionStatus publishes the badge it just built.
    const byId = new Map();
    const body = element('body');
    body.appendChild = child => {
        body.children.push(child);
        if (child.id) byId.set(child.id, child);
        return child;
    };

    const listeners = new Map();

    // One socket for the whole context, with its handlers reachable, so a
    // test can connect it at a chosen moment instead of on Socket.IO's clock.
    const socketHandlers = new Map();
    const socket = {
        on(event, handler) {
            if (!socketHandlers.has(event)) socketHandlers.set(event, []);
            socketHandlers.get(event).push(handler);
        },
        emit: noop,
        connect: noop,
        disconnect: noop
    };

    const scope = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
        setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; },
        clearTimeout,
        setInterval: (fn, ms) => { const id = setInterval(fn, ms); timers.push(id); return id; },
        clearInterval,
        io: () => socket,
        URLSearchParams,
        URL,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { serviceWorker: { register: () => Promise.resolve() } },
        location: { href: 'http://localhost/', search: '', pathname: '/', reload: noop },
        fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
        customElements: { define: noop, get: () => undefined },
        CustomEvent: class {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        },
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
            addEventListener(type, handler) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(handler);
            },
            removeEventListener: noop,
            dispatchEvent(event) {
                (listeners.get(event.type) || []).forEach(handler => handler(event));
                return true;
            },
            getElementById: id => byId.get(id) || element(),
            querySelector: () => element(),
            querySelectorAll: () => [],
            createElement: tag => element(tag),
            body,
            documentElement: element(),
            readyState: 'complete'
        }
    };

    scope.window = scope;
    scope.globalThis = scope;

    const context = vm.createContext(scope);
    for (const src of pageScripts()) {
        const code = fs.readFileSync(path.join(REPO_ROOT, src.replace(/^\//, '')), 'utf8');
        new vm.Script(code, { filename: src }).runInContext(context);
    }

    return {
        context,
        badge: () => byId.get('connection-status'),
        // weatherApp is a top-level const, so it lives in the context's lexical
        // scope rather than on the global object. Evaluate to reach it.
        weatherApp: () => vm.runInContext('weatherApp', context),
        // The page bridges the manager's events onto the document from inside
        // its DOMContentLoaded handler. Fire the real event rather than
        // rebuilding that bridge here, where a test copy could pass while the
        // page's own wiring is broken.
        domContentLoaded: () =>
            vm.runInContext("document.dispatchEvent(new CustomEvent('DOMContentLoaded'))", context),
        connectSocket: () => (socketHandlers.get('connect') || []).forEach(handler => handler())
    };
}

test('a socket that connects before the badge listens is still reported', () => {
    const page = browserGlobals();

    // The manager is built when its script loads and the badge is built after
    // the first weather fetch, so on a fast LAN the socket wins that race and
    // its one connection_status broadcast lands on nobody.
    page.connectSocket();
    page.domContentLoaded();
    page.weatherApp().createConnectionStatus();

    const badge = page.badge();
    assert.equal(badge.textContent, '🔗 Real-time');
    assert.ok(badge.classList.contains('connected'), `badge classes were "${badge.className}"`);
});

test('a socket that has not connected yet leaves the badge connecting', () => {
    const page = browserGlobals();

    // Reading the live status must not turn "not yet" into "failed" — the
    // handshake is still outstanding here.
    page.domContentLoaded();
    page.weatherApp().createConnectionStatus();

    const badge = page.badge();
    assert.equal(badge.textContent, 'Connecting...');
    assert.ok(!badge.classList.contains('connected'), `badge classes were "${badge.className}"`);
});

test('a connection event after the badge listens still updates it', () => {
    const page = browserGlobals();

    page.domContentLoaded();
    page.weatherApp().createConnectionStatus();
    page.connectSocket();

    const badge = page.badge();
    assert.equal(badge.textContent, '🔗 Real-time');
    assert.ok(badge.classList.contains('connected'), `badge classes were "${badge.className}"`);
});
