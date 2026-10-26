const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createFrameFetch } = require('../src/frame-fetch.js');
const { createPageLoader } = require('../src/page-loader.js');

// jsdom does not load pages into frames, so the test plays the browser: it puts a page in
// the frame (show) and fires its load event (load).
class FakeFrame {
    constructor() {
        this.attributes = {};
        this.style = {};
        this.listeners = [];
        this.contentDocument = null;
        this.contentWindow = null;
        this.appended = false;
        this.removed = false;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(type, listener) { if (type === 'load') this.listeners.push(listener); }
    remove() { this.removed = true; }

    show(html, status) {
        this.contentDocument = new JSDOM(html).window.document;
        const entries = status ? [{ responseStatus: status }] : [];
        this.contentWindow = { performance: { getEntriesByType: () => entries } };
    }
    load() { this.listeners.forEach(listener => listener()); }
}

function fakeDocument() {
    const frames = [];
    return {
        frames,
        createElement: () => { const frame = new FakeFrame(); frames.push(frame); return frame; },
        body: { appendChild(frame) { frame.appended = true; } },
    };
}

const BARE = '<html><body><h1>Комбуча</h1></body></html>';
const WITH_TABLE = '<html><body><h1>Комбуча</h1><div class="nutrition">Білки, г 0</div></body></html>';
const isReady = doc => !!doc.querySelector('.nutrition');
const options = { settle: 50, poll: 5 };
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

test('answers with the page as soon as its script adds the nutrition', async () => {
    const document = fakeDocument();
    const frameFetch = createFrameFetch({ document, isReady, options });
    const loading = frameFetch('https://foodboom.ua/kombucha/');
    const [frame] = document.frames;
    assert.equal(frame.src, 'https://foodboom.ua/kombucha/');
    assert.equal(frame.appended, true);
    assert.equal(frame.attributes.sandbox, 'allow-scripts allow-same-origin');

    frame.show(BARE);
    await tick(20);
    frame.show(WITH_TABLE); // the page script ran; the page has not even fired load yet

    const response = await loading;
    assert.equal(response.status, 200);
    assert.equal(response.ok, true);
    assert.match(await response.text(), /Білки, г 0/);
    assert.equal(frame.removed, true);
});

test('a page still without the nutrition `settle` ms after it loaded fails, like a network error', async () => {
    const document = fakeDocument();
    let settled = false;
    const loading = createFrameFetch({ document, isReady, options })('u');
    loading.catch(() => {}).finally(() => { settled = true; });
    const [frame] = document.frames;
    frame.show(BARE);
    await tick(100);
    assert.equal(settled, false, 'still waiting: the page has not loaded');

    frame.load();
    await tick(20);
    assert.equal(settled, false, 'still waiting for the page script');
    await assert.rejects(loading, /did not show its nutrition/);
    assert.equal(frame.removed, true);
});

test('gives the status the browser reports for the page, or 200 when it reports none', async () => {
    for (const [reported, expected] of [[403, 403], [undefined, 200]]) {
        const document = fakeDocument();
        const loading = createFrameFetch({ document, isReady, options })('u');
        document.frames[0].show(WITH_TABLE, reported);
        const response = await loading;
        assert.equal(response.status, expected);
        assert.equal(response.ok, expected === 200);
    }
});

test('an abort removes the frame', async () => {
    const document = fakeDocument();
    const controller = new AbortController();
    const loading = createFrameFetch({ document, isReady, options })('u', { signal: controller.signal });
    controller.abort();
    await assert.rejects(loading, { name: 'AbortError' });
    assert.equal(document.frames[0].removed, true);

    const again = createFrameFetch({ document, isReady, options })('v', { signal: controller.signal });
    await assert.rejects(again, { name: 'AbortError' });
    assert.equal(document.frames[1].appended, false);
});

test('the page loader times out a frame that never answers and tries again', async () => {
    const document = fakeDocument();
    const loader = createPageLoader({
        fetch: createFrameFetch({ document, isReady, options }),
        sleep: async () => {},
        options: { timeout: 30 },
    });
    const loading = loader.load('u');
    while (document.frames.length < 2) await tick(1);
    assert.equal(document.frames[0].removed, true);
    document.frames[1].show(WITH_TABLE);
    const page = await loading;
    assert.equal(page.status, 'ok');
    assert.match(page.html, /Білки/);
});

test('a bot check page is answered at once as 403, before its script can pass the check', async () => {
    const document = fakeDocument();
    const loading = createFrameFetch({ document, isReady, options: { ...options, settle: 10000 } })('u');
    document.frames[0].show('<html><head><title>Just a moment...</title></head><body><div id="challenge-running"></div></body></html>');
    const response = await loading;
    assert.equal(response.status, 403);
    assert.equal(document.frames[0].removed, true);
});

test('a page that loads with an error status is answered at once with it', async () => {
    const document = fakeDocument();
    const loading = createFrameFetch({ document, isReady, options: { ...options, settle: 10000 } })('u');
    const [frame] = document.frames;
    frame.show(BARE, 404);
    frame.load();
    const response = await loading;
    assert.equal(response.status, 404);
    assert.equal(response.ok, false);
});

test('the page loader stops on a bot check in a frame, and fails a 404 without retrying', async () => {
    const document = fakeDocument();
    const loader = createPageLoader({ fetch: createFrameFetch({ document, isReady, options }), sleep: async () => {} });

    const blocked = loader.load('a');
    document.frames[0].show('<html><head><title>Just a moment...</title></head><body></body></html>');
    assert.deepEqual(await blocked, { status: 'blocked' });

    const missing = loader.load('b');
    document.frames[1].show(BARE, 404);
    document.frames[1].load();
    assert.deepEqual(await missing, { status: 'failed' });
    assert.equal(document.frames.length, 2);
});

test('a page the browser refuses to show in a frame fails at once, without retries', async () => {
    const document = fakeDocument();
    const loader = createPageLoader({ fetch: createFrameFetch({ document, isReady, options: { ...options, settle: 10000 } }), sleep: async () => {} });
    const loading = loader.load('u');
    document.frames[0].load(); // no document: an error page from another origin
    assert.deepEqual(await loading, { status: 'failed' });
    assert.equal(document.frames.length, 1);
});
