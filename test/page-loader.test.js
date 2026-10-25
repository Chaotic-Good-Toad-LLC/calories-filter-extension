const test = require('node:test');
const assert = require('node:assert/strict');
const { createPageLoader } = require('../src/page-loader.js');

// A loader whose fetch answers from `responses` in order (a Response, an Error to throw, or a
// function of the request), and whose sleep returns at once but records how long it was asked for.
function loaderWith(responses, options) {
    const requests = [];
    const waits = [];
    const loader = createPageLoader({
        fetch: async (url, init) => {
            requests.push(url);
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return typeof next === 'function' ? next(init) : next;
        },
        sleep: async (ms) => { waits.push(ms); },
        options,
    });
    return { loader, requests, waits };
}

const page = (body = '<html>ok</html>', init) => new Response(body, init);
const status = (code, headers) => new Response('', { status: code, headers });

test('a page loads in one request, followed by the pause', async () => {
    const { loader, requests, waits } = loaderWith([page()]);
    assert.deepEqual(await loader.load('https://silpo.ua/product/a'), { status: 'ok', html: '<html>ok</html>' });
    assert.equal(requests.length, 1);
    assert.deepEqual(waits, [100]);
});

test('a 404 fails without retrying', async () => {
    const { loader, requests } = loaderWith([status(404)]);
    assert.deepEqual(await loader.load('u'), { status: 'failed' });
    assert.equal(requests.length, 1);
});

test('5xx is retried with growing waits, and the pause grows for the rest of the Scan', async () => {
    const { loader, waits } = loaderWith([status(500), status(503), page(), page()]);
    assert.equal((await loader.load('a')).status, 'ok');
    // retry after 1 s, then 2 s, then the doubled-twice pause
    assert.deepEqual(waits, [1000, 2000, 400]);
    await loader.load('b');
    assert.deepEqual(waits.slice(3), [400]);
});

test('429 waits as long as Retry-After asks, up to 30 s', async () => {
    const { loader, waits } = loaderWith([status(429, { 'Retry-After': '5' }), status(429, { 'Retry-After': '120' }), page()]);
    assert.equal((await loader.load('a')).status, 'ok');
    assert.deepEqual(waits.slice(0, 2), [5000, 30000]);
});

test('the pause stops growing at 2 s', async () => {
    const { loader, waits } = loaderWith(Array.from({ length: 12 }, () => status(503)), { retries: 0 });
    for (let i = 0; i < 6; i++) await loader.load('u');
    assert.deepEqual(waits, [200, 400, 800, 1600, 2000, 2000]);
});

test('network errors are retried twice, then the product fails', async () => {
    const { loader, requests } = loaderWith([new TypeError('offline'), new TypeError('offline'), new TypeError('offline')]);
    assert.deepEqual(await loader.load('u'), { status: 'failed' });
    assert.equal(requests.length, 3);
});

test('a request that takes too long is aborted and retried', async () => {
    const hang = (init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    const { loader, requests } = loaderWith([hang, page()], { timeout: 20 });
    assert.equal((await loader.load('u')).status, 'ok');
    assert.equal(requests.length, 2);
});

test('a bot check stops at once, without retrying or pausing', async () => {
    for (const response of [status(403), status(503, { 'cf-mitigated': 'challenge' })]) {
        const { loader, requests, waits } = loaderWith([response, page()]);
        assert.deepEqual(await loader.load('u'), { status: 'blocked' });
        assert.equal(requests.length, 1);
        assert.deepEqual(waits, []);
    }
});

test('cancel cuts a long wait short', async () => {
    const loader = createPageLoader({
        fetch: async () => status(503),
        sleep: () => new Promise(() => {}), // never ends by itself
    });
    const loading = loader.load('u');
    await new Promise(resolve => setTimeout(resolve, 10));
    loader.cancel();
    assert.deepEqual(await loading, { status: 'cancelled' });
    assert.deepEqual(await loader.load('v'), { status: 'cancelled' });
});

test('cancel aborts the request in flight', async () => {
    let aborted = false;
    const loader = createPageLoader({
        fetch: (url, init) => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
        }),
        sleep: async () => {},
    });
    const loading = loader.load('u');
    loader.cancel();
    assert.deepEqual(await loading, { status: 'cancelled' });
    assert.equal(aborted, true);
});
