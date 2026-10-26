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

    // Cloudflare's challenge page ("Just a moment..."). The frame leaves it at once, answering 403
    // so the Scan stops: its script must not get the chance to pass the check
    function isBotCheck(doc) {
        return /^(Just a moment|Attention Required)/i.test(doc.title) ||
            !!doc.querySelector('#challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification');
    }

    // A fetch() for stores whose page script adds the nutrition after the page opens: loads the
    // product page in a hidden frame, as a visit would, and answers with the page as it is once
    // isReady(doc) is true. A page that loads with an error status is answered at once with it,
    // a page the browser won't show in a frame with status 0, and a bot check as 403. A page still not ready `settle` ms after it loaded fails like a
    // network error, so it is retried and never cached as "no data". The page loader uses it in
    // place of fetch(), so its pauses, retries, timeout and cancel apply.
    // The sandbox stops the store's page navigating this tab or opening windows; it is not a
    // security boundary (allow-scripts + allow-same-origin on a same-origin page), only a guard.
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

                function respond(status = navigationStatus(frame)) {
                    const html = frame.contentDocument?.documentElement?.outerHTML || '';
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
                    if (!doc) return;
                    if (isBotCheck(doc)) respond(403);
                    // Not while the HTML is still arriving: the table could be cut off mid-way
                    else if (doc.readyState !== 'loading' && isReady(doc)) respond();
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
                    // The browser wouldn't show the page in a frame (its own error page, or a page
                    // that forbids framing, as foodboom's 404 does): there is nothing to wait for.
                    // Status 0 fails the product without retries.
                    if (!frame.contentDocument) return respond(0);
                    check();
                    if (done) return;
                    // 404, 5xx and the like: the page loader decides, no point waiting for the script
                    const status = navigationStatus(frame);
                    if (status < 200 || status >= 300) return respond(status);
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
