# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser extension (Manifest V3, Chrome and Firefox) for silpo.ua and foodboom.ua that filters grocery products by nutritional values: protein (Білки), fat (Жири), carbs (Вуглеводи), and calories (Калорії). Ukrainian-language UI. Domain terms are defined in `GLOSSARY.md`.

## Architecture

This is a plain JS/CSS content script extension with no build step and no runtime dependencies. The content scripts are listed in `manifest.json` and load in order into one isolated world; each `src/` file attaches its exports to `globalThis.BZVK` (and to `module.exports` when loaded by Node for tests).

- `manifest.json` — Manifest V3 config, injects the content scripts on `https://silpo.ua/*` and `https://foodboom.ua/*`
- `src/match.js` — `BZVK.match.evaluate(nutrition, criteria)`: the Verdict for one product and whether its card is hidden
- `src/page-loader.js` — `BZVK.pageLoader.createPageLoader({ fetch, sleep })`: loads product pages for one Scan with pauses, retries and back-off, and stops on a bot check
- `src/frame-fetch.js` — `BZVK.frameFetch.createFrameFetch({ document, isReady })`: a `fetch()` for the page loader that loads a product page in a hidden, sandboxed frame and answers once the page script has added the nutrition
- `src/sites/adapter-kit.js` — `BZVK.adapterKit`: helpers the Site adapters share (decimal-comma numbers, `findProducts`' result list)
- `src/sites/silpo.js`, `src/sites/foodboom.js` — `BZVK.sites.<site>`: one Site adapter per store, `{ hostname, findProducts(doc) → [{ card, url }], parseNutrition(doc) → Nutrition | null }`, plus `nutritionRendered(doc)` for a store whose page script adds the nutrition
- `content.js` — site detection, nutrition cache, product page fetching, the Scan, and the filter UI panel
- `styles.css` — Styling for the filter panel and product card badges (dark/light themes)
- `icons/` — Extension icons (16, 48, 128px)

## Key Concepts

- **Nutrition parsing**: Fetches individual product pages via `fetch()` and hands the parsed document to the current Site adapter. Silpo's parser reads the "Харчова цінність" section with regexes and handles kcal/kJ swap detection; calories are only read right after their label. A value the page doesn't give is `null` (unknown) and fails any limit set on it; `0` is a real value. foodboom pages that list only some values give those, with the rest `null`.
- **Pages whose script adds the nutrition**: foodboom's product HTML mostly has no characteristics; its page script adds them after the page opens. A Site adapter with `nutritionRendered(doc)` has its pages loaded in a frame (`src/frame-fetch.js`) instead of fetched, and the frame answers when `nutritionRendered` is true (foodboom: any characteristics row, which every product page has). A page not ready 8 s after it loaded fails like a network error, so it is retried and not cached as "no data".
- **Request pacing**: the page loader pauses 100 ms after each request (cache hits are not delayed). Timeouts, network errors, 429 and 5xx are retried twice with growing waits (honouring `Retry-After`), and each throttle doubles the pause for the rest of the Scan, up to 2 s. A 403 or Cloudflare's `cf-mitigated` header stops the Scan: never work around a bot check. Five failed products in a row also stop it. A product that fails to load is left unmarked, not shown as "no data".
- **Caching**: `NutritionCache` class stores parsed nutrition data in `localStorage` with 7-day expiry. Pages without nutrition are cached as `{ noData: true }` for 1 day. Cache key: `calories_extention_nutrition_cache_v9` (bump it when the stored shape or meaning changes, and add the old key to `CONFIG.oldCacheKeys`).
- **Filter panel**: Fixed-position UI injected into the page. Filter values, checkbox states, panel minimized state, and theme preference are all persisted in `localStorage`.
- **Product detection**: Each Site adapter's `findProducts` returns only cards with a valid product link. Each `url` is a getter that re-reads the card's link, so the Scan gets the current product even if the site re-renders the card mid-Scan. Silpo tries several card selectors in order (`article[class*="product"]`, `div[class*="product-card"]`, etc.) since its layout may vary; the fallbacks match pieces of a card, which are merged into one card per product.

## Development

No build tools. Load as unpacked extension in Chrome via `chrome://extensions` with Developer Mode enabled. Reload the extension after changes. A new content script file must be added to `manifest.json` `content_scripts.js` (in load order); files under `src/` are already in the `scripts/package.sh` allow-list, other new top-level files must be added there.

- `npm install` once, then `npm test` — runs `node --test` over `test/**/*.test.js`. `package.json` and jsdom are dev-only and never ship.
- Tests run against saved store pages in `test/fixtures/<site>/*.html.gz` (full pages, gzipped; product pages are the raw `fetch()` response, listing pages are the live DOM). Silpo is behind Cloudflare, so capture its pages from a real browser session, not curl. A foodboom page after its script ran (`*-rendered`) keeps only the product section, without scripts or the visitor's delivery city.
- CI (`.github/workflows/ci.yml`, GitHub Actions) runs `npm test` on Node 22 and 24 and checks that the store zips hold every file `manifest.json` loads, on every PR and push to main.
- `scripts/package.sh` — builds `bjvk-filter-chrome.zip` and `calories-filter-firefox.zip` from an explicit file allow-list.

## Conventions

- All user-facing strings are in Ukrainian
- CSS classes prefixed with `silpo-` to avoid conflicts with the host page
- All `localStorage` keys prefixed with `calories_extention_`

## Agent skills

### Issue tracker

Issues live in GitHub Issues for Chaotic-Good-Toad-LLC/calories-filter-extension (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
