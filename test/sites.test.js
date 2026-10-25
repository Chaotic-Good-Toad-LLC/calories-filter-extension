const test = require('node:test');
const assert = require('node:assert/strict');
const silpo = require('../src/sites/silpo.js');
const foodboom = require('../src/sites/foodboom.js');
const { JSDOM } = require('jsdom');
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

const foodboomProducts = [
    ['product-nut-mix.html.gz', { protein: 2, fat: 11.2, carbs: 67.8, calories: 382 }],
    ['product-kombucha.html.gz', { protein: 0, fat: 0, carbs: 6, calories: 24 }],
    ['product-tea-gift-set.html.gz', null],
    // The same product page as fetch() gets it now, and after the page script added the table
    ['product-monster-fetched.html.gz', null],
    ['product-monster-rendered.html.gz', { protein: 0, fat: 0, carbs: 0.7, calories: 2 }],
];

for (const [fixture, expected] of foodboomProducts) {
    test(`foodboom parseNutrition: ${fixture}`, () => {
        assert.deepEqual(foodboom.parseNutrition(parseFixture(`foodboom/${fixture}`)), expected);
    });
}

test('foodboom nutritionRendered tells a page with the characteristics from one still waiting for them', () => {
    assert.equal(foodboom.nutritionRendered(parseFixture('foodboom/product-monster-fetched.html.gz')), false);
    assert.equal(foodboom.nutritionRendered(parseFixture('foodboom/product-monster-rendered.html.gz')), true);
});

test('foodboom parseNutrition still reads nutrition written in the description', () => {
    const doc = new JSDOM('<div class="product_description_text">Харчова цінність: білки – 7,5 г, жири – 3 г, вуглеводи – 60 г, 310 ккал</div>').window.document;
    assert.deepEqual(foodboom.parseNutrition(doc), { protein: 7.5, fat: 3, carbs: 60, calories: 310 });
});

const listings = [
    [silpo, 'https://silpo.ua/category/molochni-produkty-ta-iaitsia-234', 'silpo/listing-dairy.html.gz', 47],
    [foodboom, 'https://foodboom.ua/gorichi-v-shokoladi/', 'foodboom/listing-nuts-in-chocolate.html.gz', 36],
];

for (const [site, url, fixture, count] of listings) {
    test(`${site.hostname} findProducts: every card on ${fixture} with its product url`, () => {
        const doc = new JSDOM(loadFixture(fixture), { url }).window.document;
        const products = site.findProducts(doc);
        assert.equal(products.length, count);
        for (const { card, url: productUrl } of products) {
            assert.ok(card.nodeType === 1, 'card is an element');
            assert.match(productUrl, new RegExp(`^https://${site.hostname.replace('.', '\\.')}/`));
        }
        assert.equal(new Set(products.map(p => p.url)).size, count, 'one card per product');
    });
}

// The saved dairy listing with its <article> cards turned into <section>s, so the fallback selectors are used
function silpoListingWithout(...rewrites) {
    let html = loadFixture('silpo/listing-dairy.html.gz');
    for (const [from, to] of rewrites) html = html.replaceAll(from, to);
    return new JSDOM(html, { url: 'https://silpo.ua/category/molochni-produkty-ta-iaitsia-234' }).window.document;
}

for (const [fallback, rewrites] of [
    ['div[class*="product-card"]', [['<article', '<section'], ['</article>', '</section>']]],
    ['a[href*="/product/"]', [['<article', '<section'], ['</article>', '</section>'], ['product-card', 'pc']]],
]) {
    test(`silpo findProducts: one card per product when falling back to ${fallback}`, () => {
        const products = silpo.findProducts(silpoListingWithout(...rewrites));
        assert.equal(products.length, 47);
        assert.equal(new Set(products.map(p => p.url)).size, 47);
        for (const { card } of products) assert.equal(card.tagName, 'SECTION', 'the whole card, not a piece of it');
    });
}

test('silpo findProducts keeps two cards for a product shown twice', () => {
    const doc = new JSDOM(`<div class="promo"><article class="product-card"><a href="/product/kefir-1">Кефір</a></article></div>
        <div class="grid"><article class="product-card"><a href="/product/kefir-1">Кефір</a></article>
        <article class="product-card"><a href="/product/milk-2">Молоко</a></article></div>`, { url: 'https://silpo.ua/category/x' }).window.document;
    assert.deepEqual(silpo.findProducts(doc).map(p => p.card.tagName), ['ARTICLE', 'ARTICLE', 'ARTICLE']);
});

test('silpo parseNutrition only reads calories after their label', () => {
    // The butter page with its calories removed; a script on the page has "24 * 1000 // in seconds"
    const html = loadFixture('silpo/product-butter.html.gz').replaceAll('744/3125', '');
    const doc = new JSDOM(html).window.document;
    assert.deepEqual(silpo.parseNutrition(doc), { protein: 0.6, fat: 82, carbs: 0.7, calories: null });
});

test('foodboom parseNutrition keeps a real 0 kcal and gives null when calories are missing', () => {
    const row = (label, value) => `<div class="row"><span class="description">${label}</span><span class="value">${value}</span></div>`;
    const table = (rows) => new JSDOM(`<div class="product-characteristics__item">${rows.join('')}</div>`).window.document;
    const macros = [row('Білки, г', '0'), row('Жири, г', '0'), row('Вуглеводи, г', '0')];
    assert.deepEqual(foodboom.parseNutrition(table([...macros, row('Енергетична цінність, ккал', '0')])),
        { protein: 0, fat: 0, carbs: 0, calories: 0 });
    assert.deepEqual(foodboom.parseNutrition(table(macros)), { protein: 0, fat: 0, carbs: 0, calories: null });
});

test('silpo findProducts skips cards whose link is not a product', () => {
    const doc = new JSDOM(`<article class="product-card"><a href="/product/kefir-1">Кефір</a></article>
        <article class="product-card"><a href="/category/promo">Акція</a></article>`, { url: 'https://silpo.ua/category/x' }).window.document;
    assert.deepEqual(silpo.findProducts(doc).map(p => p.url), ['https://silpo.ua/product/kefir-1']);
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

test('foodboom Scan finds the products on a category page', async () => {
    assert.equal(await scanProductCount('https://foodboom.ua/gorichi-v-shokoladi/', 'foodboom/listing-nuts-in-chocolate.html.gz'), 36);
});

test('foodboom parseNutrition gives a partial table as it is, without filling it from the description', () => {
    const doc = new JSDOM(`<div class="product-characteristics__item">
        <div class="row"><span class="description">Білки, г</span><span class="value">2</span></div>
        <div class="row"><span class="description">Жири, г</span><span class="value">11,2</span></div>
    </div>
    <div class="related">Інший товар: білки – 7 г, жири – 3 г, вуглеводи – 60 г</div>`).window.document;
    assert.deepEqual(foodboom.parseNutrition(doc), { protein: 2, fat: 11.2, carbs: null, calories: null });
});

