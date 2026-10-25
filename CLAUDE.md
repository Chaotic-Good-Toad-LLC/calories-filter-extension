# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser extension (Manifest V3, Chrome and Firefox) for silpo.ua and foodboom.ua that filters grocery products by nutritional values: protein (Білки), fat (Жири), carbs (Вуглеводи), and calories (Калорії). Ukrainian-language UI. Domain terms are defined in `GLOSSARY.md`.

## Architecture

This is a plain JS/CSS content script extension with no build step and no runtime dependencies. The content scripts are listed in `manifest.json` and load in order into one isolated world; each `src/` file attaches its exports to `globalThis.BZVK` (and to `module.exports` when loaded by Node for tests).

- `manifest.json` — Manifest V3 config, injects the content scripts on `https://silpo.ua/*` and `https://foodboom.ua/*`
- `src/match.js` — `BZVK.match`: comparison of a nutrition value against an operator and target
- `src/sites/silpo.js`, `src/sites/foodboom.js` — `BZVK.sites.<site>`: one Site adapter per store (card selectors, product link rules, Nutrition parser)
- `content.js` — site detection, nutrition cache, product page fetching, the Scan, and the filter UI panel
- `styles.css` — Styling for the filter panel and product card badges (dark/light themes)
- `icons/` — Extension icons (16, 48, 128px)

## Key Concepts

- **Nutrition parsing**: Fetches individual product pages via `fetch()` and hands the parsed document to the current Site adapter. Silpo's parser reads the "Харчова цінність" section with regexes and handles kcal/kJ swap detection.
- **Caching**: `NutritionCache` class stores parsed nutrition data in `localStorage` with 7-day expiry. Cache key: `calories_extention_nutrition_cache_v7`.
- **Filter panel**: Fixed-position UI injected into the page. Filter values, checkbox states, panel minimized state, and theme preference are all persisted in `localStorage`.
- **Product detection**: Each Site adapter lists CSS selectors to try in order for product cards (silpo: `article[class*="product"]`, `div[class*="product-card"]`, etc., since its layout may vary) and a pattern for valid product links.

## Development

No build tools. Load as unpacked extension in Chrome via `chrome://extensions` with Developer Mode enabled. Reload the extension after changes. A new content script file must be added to `manifest.json` `content_scripts.js` and to the allow-list in `scripts/package.sh`.

- `npm install` once, then `npm test` — runs `node --test` over `test/**/*.test.js`. `package.json` and jsdom are dev-only and never ship.
- Tests run against saved store pages in `test/fixtures/<site>/*.html.gz` (full pages, gzipped; product pages are the raw `fetch()` response, listing pages are the live DOM). Silpo is behind Cloudflare, so capture its pages from a real browser session, not curl.
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
