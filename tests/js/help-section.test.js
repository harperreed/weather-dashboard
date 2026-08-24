// ABOUTME: Tests the help disclosure through the production web component.
// ABOUTME: Uses a small stateful DOM holder with Node's built-in test runner.

const assert = require('node:assert/strict');
const test = require('node:test');

const { WIDGET_CATALOG } = require('../../static/js/dashboard-config.js');

class StatefulElement {
    constructor() {
        this.attributes = new Map();
        this.listeners = new Map();
        this.style = { display: 'none' };
        this.textContent = '';
    }

    addEventListener(name, listener) {
        this.listeners.set(name, listener);
    }

    click() {
        this.listeners.get('click')();
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }
}

class ShadowRootHolder {
    constructor() {
        this.elements = new Map();
        this.html = '';
    }

    set innerHTML(html) {
        this.html = html;

        const toggleButton = new StatefulElement();
        const buttonMarkup = html.match(/<button id="help-toggle"([^>]*)>([^<]*)<\/button>/);
        if (buttonMarkup) {
            for (const match of buttonMarkup[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
                toggleButton.setAttribute(match[1], match[2]);
            }
            toggleButton.textContent = buttonMarkup[2];
        }

        this.elements.set('help-toggle', toggleButton);
        this.elements.set('help-content', new StatefulElement());
    }

    get innerHTML() {
        return this.html;
    }

    getElementById(id) {
        return this.elements.get(id) ?? null;
    }
}

global.HTMLElement = class {
    attachShadow() {
        this.shadowRoot = new ShadowRootHolder();
        return this.shadowRoot;
    }
};
global.customElements = { define() {} };
global.document = { addEventListener() {} };
global.window = { DashboardConfig: { WIDGET_CATALOG } };

const { HelpSection } = require('../../static/js/weather-components.js');

test('help disclosure exposes and updates its expanded state', () => {
    assert.equal(typeof HelpSection, 'function');

    const helpSection = new HelpSection();
    helpSection.render();
    helpSection.setupEventListeners();

    const toggleButton = helpSection.shadowRoot.getElementById('help-toggle');
    const helpContent = helpSection.shadowRoot.getElementById('help-content');

    assert.equal(toggleButton.getAttribute('aria-controls'), 'help-content');
    assert.equal(toggleButton.getAttribute('aria-expanded'), 'false');
    assert.doesNotMatch(helpSection.shadowRoot.innerHTML, /Widget names accept aliases/);

    toggleButton.click();
    assert.equal(toggleButton.getAttribute('aria-expanded'), 'true');
    assert.equal(helpContent.style.display, 'block');
    assert.equal(toggleButton.textContent, '▼ Hide Help');

    toggleButton.click();
    assert.equal(toggleButton.getAttribute('aria-expanded'), 'false');
    assert.equal(helpContent.style.display, 'none');
    assert.equal(toggleButton.textContent, '▲ Show Help');
});
