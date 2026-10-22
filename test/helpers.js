const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');

// Saved store pages are full and noisy; jsdom's CSS parse errors are not our concern.
function quietConsole() {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', () => {});
    return virtualConsole;
}

function loadFixture(name) {
    return zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', name))).toString('utf8');
}

function parseFixture(name) {
    return new JSDOM(loadFixture(name), { virtualConsole: quietConsole() }).window.document;
}

// Loads the content scripts, in manifest order, into a page at `url` whose DOM is `html`.
// Store scripts in the page never run; only the extension's scripts do.
// `storage` is put in localStorage first, as if saved by an earlier visit.
function loadExtension({ url, html, fetch, storage = {} }) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: quietConsole() });
    const { window } = dom;
    window.fetch = fetch;
    for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);

    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    for (const file of manifest.content_scripts[0].js) {
        window.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    }
    return window;
}

async function waitFor(predicate, { timeout = 3000, interval = 20 } = {}) {
    const start = Date.now();
    for (;;) {
        const value = predicate();
        if (value) return value;
        if (Date.now() - start > timeout) throw new Error('waitFor timed out');
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

module.exports = { loadFixture, parseFixture, loadExtension, waitFor };
