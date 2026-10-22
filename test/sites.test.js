const test = require('node:test');
const assert = require('node:assert/strict');
const silpo = require('../src/sites/silpo.js');
const foodboom = require('../src/sites/foodboom.js');
const { parseFixture, loadFixture, loadExtension, waitFor } = require('./helpers.js');

// Expected values are what the parser returned when the pages were captured (2026-10-22).
const silpoProducts = [
    ['product-butter.html.gz', { protein: 0.6, fat: 82, carbs: 0.7, calories: 744 }],
    ['product-milk.html.gz', { protein: 2.8, fat: 2.5, carbs: 4.7, calories: 52 }],
    ['product-pudding.html.gz', { protein: 10.8, fat: 1.5, carbs: 4.9, calories: 78 }],
    ['product-sour-cream.html.gz', { protein: 2.9, fat: 15, carbs: 3, calories: 159 }],
    ['product-glazed-curd.html.gz', { protein: 10.4, fat: 23.8, carbs: 33.4, calories: 392 }],
    ['product-eggs.html.gz', { protein: 13, fat: 11.5, carbs: 0.9, calories: 160 }],
    // product-butter with "744/3125" rewritten as "3125/744"
    ['product-butter-kj-first.html.gz', { protein: 0.6, fat: 82, carbs: 0.7, calories: 744 }],
    ['product-laundry-capsules.html.gz', null],
];

for (const [fixture, expected] of silpoProducts) {
    test(`silpo parseNutrition: ${fixture}`, () => {
        assert.deepEqual(silpo.parseNutrition(parseFixture(`silpo/${fixture}`)), expected);
    });
}

test('foodboom parseNutrition: product-nut-mix', { todo: 'foodboom redesign moved nutrition into a characteristics table' }, () => {
    assert.deepEqual(
        foodboom.parseNutrition(parseFixture('foodboom/product-nut-mix.html.gz')),
        { protein: 2, fat: 11.2, carbs: 67.8, calories: 382 }
    );
});

// Starts a Scan on a saved listing page and reads how many products it found.
// fetch never resolves, so the Scan stays on its first product.
async function scanProductCount(url, fixture) {
    const window = loadExtension({ url, html: loadFixture(fixture), fetch: () => new Promise(() => {}) });
    const filterBtn = await waitFor(() => window.document.getElementById('silpo-filter-btn'));
    filterBtn.click();
    const status = window.document.getElementById('silpo-filter-status');
    await waitFor(() => /Перевірка|Не знайдено/.test(status.textContent));
    const found = status.textContent.match(/Перевірка 1\/(\d+)/);
    window.close();
    return found ? Number(found[1]) : 0;
}

test('silpo Scan finds the products on a category page', async () => {
    assert.equal(await scanProductCount('https://silpo.ua/category/molochni-produkty-ta-iaitsia-234', 'silpo/listing-dairy.html.gz'), 47);
});

test('foodboom Scan finds the products on a category page', { todo: 'foodboom redesign renamed cards to .card.card--float' }, async () => {
    assert.equal(await scanProductCount('https://foodboom.ua/gorichi-v-shokoladi/', 'foodboom/listing-nuts-in-chocolate.html.gz'), 36);
});
