# Changelog

## 0.15
- foodboom.ua works again after its redesign; its product pages are opened in the background like a visit, so the store's own analytics see them (see PRIVACY.md)
- Silpo: calories are read correctly, products with 0 kcal are no longer treated as unknown, and each product gets one badge
- Checkboxes and empty filter fields work as expected: an empty field means "no limit"
- Products whose page lists only some values show them, with "—" for the rest; an unknown value doesn't pass a limit on it
- Card colours and the status counts update as soon as you change a filter
- Badges no longer show 🔥 / 👍 next to the calories
- New icon: a filter funnel with a check mark
- Checking is more reliable: slow or failed pages are retried, and checking stops if the store starts limiting requests
- Products that fail to load are counted as "не вдалося" instead of "no data"
- Repeat checks are faster: products without nutrition info are remembered for a day
- "Зупинити пошук" stops at once

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
