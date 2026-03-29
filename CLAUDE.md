# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser extension (Manifest V2) for silpo.ua that filters grocery products by nutritional values: protein (Білки), fat (Жири), carbs (Вуглеводи), and calories (Калорії). Ukrainian-language UI.

## Architecture

This is a plain JS/CSS content script extension with no build step or dependencies.

- `manifest.json` — Manifest V2 config, injects content script on `https://silpo.ua/*`
- `content.js` — Single IIFE containing all logic: nutrition cache, product page fetching/parsing, filter UI panel
- `styles.css` — Styling for the filter panel and product card badges (dark/light themes)
- `icons/` — Extension icons (16, 48, 128px)

## Key Concepts

- **Nutrition parsing**: Fetches individual product pages via `fetch()`, parses HTML for "Харчова цінність" section using regex. Handles kcal/kJ swap detection.
- **Caching**: `NutritionCache` class stores parsed nutrition data in `localStorage` with 7-day expiry. Cache key: `calories_extention_nutrition_cache_v7`.
- **Filter panel**: Fixed-position UI injected into the page. Filter values, checkbox states, panel minimized state, and theme preference are all persisted in `localStorage`.
- **Product detection**: Tries multiple CSS selectors to find product cards (`article[class*="product"]`, `div[class*="product-card"]`, etc.) since silpo.ua layout may vary.

## Development

No build tools. Load as unpacked extension in Chrome via `chrome://extensions` with Developer Mode enabled. Reload the extension after changes.

## Conventions

- All user-facing strings are in Ukrainian
- CSS classes prefixed with `silpo-` to avoid conflicts with the host page
- All `localStorage` keys prefixed with `calories_extention_`
