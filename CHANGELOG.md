# Changelog

## 0.15
- Fix foodboom.ua after its redesign: find cards by `.card.card--float` and read nutrition from the characteristics table
- Split content.js into content scripts: src/match.js, one Site adapter per store in src/sites/, and content.js
- Add tests (node --test + jsdom) against saved silpo and foodboom pages
- Add scripts/package.sh to build the store zips from an explicit allow-list

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
