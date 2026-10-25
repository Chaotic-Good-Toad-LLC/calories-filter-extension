(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    const DEFAULTS = {
        settle: 8000, // ms to keep waiting after the page has loaded, for its script to add the nutrition
        poll: 100     // ms between checks
    };

    // HTTP status of the page in the frame, where the browser reports it (200 otherwise)
    function navigationStatus(frame) {
        try {
            const entry = frame.contentWindow.performance.getEntriesByType('navigation')[0];
            return entry?.responseStatus || 200;
        } catch (e) {
            return 200;
        }
    }

    // A fetch() for stores whose page script adds the nutrition after the page opens: loads the
    // product page in a hidden frame, as a visit would, and answers with the page as it is once
    // isReady(doc) is true. A page still not ready `settle` ms after it loaded fails like a network
    // error, so it is retried and never cached as "no data". The page loader uses it in place of
    // fetch(), so its pauses, retries, timeout and cancel apply.
    // The frame is sandboxed so the page can't navigate this tab or open windows.
    function createFrameFetch({ document, isReady, options = {} }) {
        const o = { ...DEFAULTS, ...options };

        return function frameFetch(url, { signal } = {}) {
            return new Promise((resolve, reject) => {
                const frame = document.createElement('iframe');
                frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
                frame.setAttribute('aria-hidden', 'true');
                frame.setAttribute('tabindex', '-1');
                frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;visibility:hidden;border:0';

                let pollTimer = null;
                let settleTimer = null;
                let done = false;

                function finish() {
                    done = true;
                    clearInterval(pollTimer);
                    clearTimeout(settleTimer);
                    signal?.removeEventListener('abort', onAbort);
                    frame.remove();
                }

                function respond() {
                    const html = frame.contentDocument?.documentElement?.outerHTML || '';
                    const status = navigationStatus(frame);
                    finish();
                    resolve({
                        status,
                        ok: status >= 200 && status < 300,
                        headers: { get: () => null },
                        text: async () => html
                    });
                }

                function check() {
                    const doc = frame.contentDocument;
                    if (doc && isReady(doc)) respond();
                }

                function onAbort() {
                    finish();
                    reject(new DOMException('Aborted', 'AbortError'));
                }

                function giveUp() {
                    finish();
                    reject(new Error('The page did not show its nutrition'));
                }

                if (signal?.aborted) return onAbort();
                signal?.addEventListener('abort', onAbort);

                frame.addEventListener('load', () => {
                    check();
                    if (done) return;
                    clearTimeout(settleTimer);
                    settleTimer = setTimeout(giveUp, o.settle);
                });
                pollTimer = setInterval(check, o.poll);
                frame.src = url;
                document.body.appendChild(frame);
            });
        };
    }

    BZVK.frameFetch = { createFrameFetch, DEFAULTS };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.frameFetch;
})(globalThis);
