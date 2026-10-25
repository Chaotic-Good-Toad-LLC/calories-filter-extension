(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    const DEFAULTS = {
        pause: 100,            // ms after each request
        maxPause: 2000,        // the pause doubles each time the store throttles us, up to this
        timeout: 15000,        // ms before a request is given up and retried
        retries: 2,            // tries after the first one
        backoff: 1000,         // ms before the first retry, doubled for each one after
        maxRetryAfter: 30000   // longest wait a Retry-After header can ask for
    };

    // Retry-After is either seconds or an HTTP date
    function retryAfterMs(response) {
        const value = response.headers?.get('retry-after');
        if (!value) return null;
        const seconds = Number(value);
        if (Number.isFinite(seconds)) return seconds * 1000;
        const date = Date.parse(value);
        return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
    }

    // Loads product pages for one Scan, one at a time:
    // - pauses after every request, and pauses longer for the rest of the Scan once the store throttles
    // - retries timeouts, network errors, 429 and 5xx, waiting longer each time (or as Retry-After asks)
    // - stops at once when the store answers with a bot check (403, or Cloudflare's cf-mitigated header);
    //   it never tries to get past one
    // load(url) → { status: 'ok', html } | { status: 'failed' } | { status: 'blocked' } | { status: 'cancelled' }
    function createPageLoader({ fetch, sleep, options = {} }) {
        const o = { ...DEFAULTS, ...options };
        let pause = o.pause;
        let cancelled = false;
        let controller = null;
        const waiting = new Set();

        // A sleep that cancel() cuts short
        function wait(ms) {
            return new Promise(resolve => {
                waiting.add(resolve);
                sleep(ms).then(() => {
                    waiting.delete(resolve);
                    resolve();
                });
            });
        }

        async function attempt(url) {
            controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), o.timeout);
            try {
                const response = await fetch(url, { signal: controller.signal });
                if (response.status === 403 || response.headers?.get('cf-mitigated')) return { status: 'blocked' };
                if (response.status === 429 || response.status >= 500) {
                    return { status: 'retry', throttled: true, retryAfter: retryAfterMs(response) };
                }
                // 404 and the like: trying again won't help
                if (!response.ok) return { status: 'failed' };
                return { status: 'ok', html: await response.text() };
            } catch (e) {
                // Network error or timeout
                return { status: 'retry' };
            } finally {
                clearTimeout(timer);
                controller = null;
            }
        }

        async function load(url) {
            for (let retry = 0; ; retry++) {
                if (cancelled) return { status: 'cancelled' };
                const result = await attempt(url);
                if (cancelled) return { status: 'cancelled' };
                if (result.status === 'blocked') return result;
                if (result.throttled) pause = Math.min(pause * 2, o.maxPause);

                if (result.status !== 'retry') {
                    await wait(pause);
                    return result;
                }
                if (retry === o.retries) {
                    await wait(pause);
                    return { status: 'failed' };
                }
                await wait(Math.min(result.retryAfter ?? o.backoff * 2 ** retry, o.maxRetryAfter));
            }
        }

        function cancel() {
            cancelled = true;
            controller?.abort();
            waiting.forEach(resolve => resolve());
            waiting.clear();
        }

        return { load, cancel };
    }

    BZVK.pageLoader = { createPageLoader, DEFAULTS };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.pageLoader;
})(globalThis);
