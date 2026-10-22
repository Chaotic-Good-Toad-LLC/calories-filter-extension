# Changelog

## 0.15
- Fix checkboxes hiding products by unapplied filter values, leaving card colours stale, or not bringing back products hidden for having no data
- Fix foodboom.ua after its redesign: find cards by `.card.card--float` and read nutrition from the characteristics table
- Split content.js into content scripts: src/match.js, one Site adapter per store in src/sites/, and content.js
- Add tests (node --test + jsdom) against saved silpo and foodboom pages
- Add scripts/package.sh to build the store zips from an explicit allow-list
- Site adapters own product discovery (`findProducts`); silpo parser restructured without behaviour change
- An empty filter field means "no limit" (it used to hide everything when a checkbox was toggled)
- Read each card's product link just before fetching it, so re-rendered cards get the right badge
- Fix silpo calories being read from unrelated numbers on the page (such as "1000" from a script) when the nutrition section has none
- Unknown calories are `null` instead of `0`, so products with a real 0 kcal are filtered correctly; the cache moves to v8 and the v7 cache is removed
- Pause 100 ms after each product page request, including products without data, instead of after each cached product
- Silpo's fallback card selectors give one card per product instead of duplicates and card fragments
- "=" compares values rounded to 0.1 g, the same at any size
- Re-colour cards from an earlier Scan as soon as a new filter is applied
- The status line counts each card as it ends up, including products without data and checkbox changes mid-Scan

## 0.14
- Add foodboom.ua support with site-specific card selectors and nutrition parser
- Introduce SITE_CONFIG + detectSite() to keep silpo and foodboom logic separate
- Fix product count to reflect only cards with valid links
- Move createNutritionLabel out of loop; clear dataset on reset

## 0.13
- Migrate to Manifest V3

## 0.12
- Add store links to README

## 0.11
- Store nutrition data on DOM for dynamic visibility toggling
- Make all checkboxes apply instantly without re-fetching
- Add "protein more than fat" checkbox filter

## 0.10
- Add subtle background colors to filtered product cards
- Replace square outlines with rounded borders (12px radius)
- Support both dark and light themes

## 0.9
- Add browser_specific_settings with gecko ID and data_collection_permissions
- Replace all innerHTML usage with safe DOM creation methods

## 0.1
- Initial release
