# Glossary

**Nutrition**: protein, fat, carbs (g) and calories (kcal) per 100 g of a product, as parsed from its product page. A value is `null` when the page doesn't give it: it shows as "—" and fails any criterion set on it (an empty field still passes). `0` is a real value.

**Criteria**: what a Scan filters by: four operator/value pairs (protein, fat, carbs, calories) plus the three checkbox flags (hide products without data, hide non-matching, only protein > fat).

**Verdict**: the outcome of checking one product against the Criteria: `match`, `miss`, or `noData` (the page loaded but gives no Nutrition). A product whose page fails to load gets no Verdict: its card is left unmarked and counted as "не вдалося".

**Site adapter**: everything that is specific to one store (silpo.ua, foodboom.ua): how to find product cards and their links on a listing page, and how to parse Nutrition from a product page. A store whose page script adds the nutrition after the page opens also says when it is there (`nutritionRendered`), and its pages are loaded in a hidden frame. Lives in `src/sites/<site>.js`.

**Scan**: one run of the "Застосувати фільтр" button over the product cards on the current page: fetch (or read from cache) each product's Nutrition, decide its Verdict, and mark the card.
