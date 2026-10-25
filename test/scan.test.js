const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExtension, loadFixture, waitFor } = require('./helpers.js');

// Default Criteria (no saved values): protein >= 10, fat <= 10, carbs <= 20, calories <= 200.
const PRODUCTS = {
    lean: { protein: 20, fat: 5, carbs: 5, calories: 150 },    // match, protein > fat
    fatty: { protein: 2, fat: 15, carbs: 3, calories: 159 },   // miss
    even: { protein: 10, fat: 10, carbs: 1, calories: 150 },   // match, protein = fat
    noKcal: { protein: 20, fat: 5, carbs: 5, calories: null }, // miss: unknown calories fail "<= 200"
    unknown: null,                                             // no Nutrition on the page
    unknown2: null,
    unknown3: null,
};

function silpoProductPage(nutrition) {
    if (!nutrition) return '<html><body><h1>Капсули для прання</h1></body></html>';
    const { protein, fat, carbs, calories } = nutrition;
    const caloriesRow = calories === null ? '' : `<div>Енергетична цінність (кКал/кДЖ)${calories}/${Math.round(calories * 4.184)}</div>`;
    return `<html><body><div><h3>Харчова цінність на 100 г</h3>
        ${caloriesRow}
        <div>Білки (г)${protein}</div><div>Жири (г)${fat}</div><div>Вуглеводи (г)${carbs}</div>
    </div></body></html>`;
}

function silpoListingPage(names) {
    const cards = names.map(name =>
        `<article class="product-card" data-name="${name}"><a href="/product/${name}">${name}</a></article>`);
    return `<html><body>${cards.join('')}</body></html>`;
}

// onFetch(name, init) runs as each product page is requested; if it returns a Response,
// the store answers with that instead of the product page
async function openListing(names, { onFetch = () => {}, storage } = {}) {
    const window = loadExtension({
        url: 'https://silpo.ua/category/test-1',
        html: silpoListingPage(names),
        storage,
        fetch: async (url, init) => {
            const name = url.split('/product/')[1];
            const answer = await onFetch(name, init);
            if (answer instanceof Response) return answer;
            return new Response(silpoProductPage(PRODUCTS[name]));
        },
    });
    await waitFor(() => window.document.getElementById('silpo-filter-btn'));
    const $ = (id) => window.document.getElementById(id);

    return {
        window,
        async scan() {
            $('silpo-filter-btn').click();
            await waitFor(() => $('silpo-filter-status').textContent.startsWith('✅'), { timeout: 5000 });
        },
        status() {
            return $('silpo-filter-status').textContent;
        },
        setInput(id, value) {
            $(id).value = String(value);
        },
        setCheckbox(id, checked) {
            $(id).checked = checked;
            $(id).dispatchEvent(new window.Event('change'));
        },
        card(name) {
            const card = window.document.querySelector(`[data-name="${name}"]`);
            const colour = ['green', 'red', 'yellow'].find(c => card.classList.contains(`silpo-card-${c}`)) || null;
            const badge = card.querySelector('.silpo-nutrition-info');
            const badgeColour = badge && ['green', 'red', 'yellow'].find(c => badge.classList.contains(`silpo-badge-${c}`));
            return { hidden: card.classList.contains('silpo-hidden'), colour, badgeColour };
        },
    };
}

test('toggling a checkbox uses the applied Criteria, not unapplied input values', async () => {
    const page = await openListing(['lean', 'fatty', 'even']);
    await page.scan();

    page.setInput('silpo-protein-val', 50); // edited, never applied
    page.setCheckbox('silpo-hide-non-matching', true);

    assert.deepEqual(page.card('lean'), { hidden: false, colour: 'green', badgeColour: 'green' });
    assert.deepEqual(page.card('even'), { hidden: false, colour: 'green', badgeColour: 'green' });
    assert.deepEqual(page.card('fatty'), { hidden: true, colour: 'red', badgeColour: 'red' });
    page.window.close();
});

test('toggling "only protein > fat" re-colours cards it turns into misses', async () => {
    const page = await openListing(['lean', 'fatty', 'even']);
    await page.scan();

    page.setCheckbox('silpo-only-protein-more-than-fat', true);
    assert.deepEqual(page.card('even'), { hidden: true, colour: 'red', badgeColour: 'red' });
    assert.deepEqual(page.card('lean'), { hidden: false, colour: 'green', badgeColour: 'green' });

    page.setCheckbox('silpo-only-protein-more-than-fat', false);
    assert.deepEqual(page.card('even'), { hidden: false, colour: 'green', badgeColour: 'green' });
    page.window.close();
});

test('a card hidden for having no data comes back when that checkbox is cleared', async () => {
    const page = await openListing(['lean', 'unknown']);
    page.setCheckbox('silpo-hide-without-nutrition', true);
    await page.scan();
    assert.equal(page.card('unknown').hidden, true);

    page.setCheckbox('silpo-hide-without-nutrition', false);
    assert.deepEqual(page.card('unknown'), { hidden: false, colour: 'yellow', badgeColour: 'yellow' });
    page.window.close();
});

test('a Scan colours, hides and counts by the applied Criteria', async () => {
    const page = await openListing(['lean', 'fatty', 'even', 'unknown']);
    page.setCheckbox('silpo-hide-non-matching', true);
    await page.scan();

    assert.deepEqual(page.card('lean'), { hidden: false, colour: 'green', badgeColour: 'green' });
    assert.deepEqual(page.card('even'), { hidden: false, colour: 'green', badgeColour: 'green' });
    assert.deepEqual(page.card('fatty'), { hidden: true, colour: 'red', badgeColour: 'red' });
    assert.deepEqual(page.card('unknown'), { hidden: false, colour: 'yellow', badgeColour: 'yellow' });
    // the product without data is shown, so it counts as shown
    assert.equal(page.status(), '✅ Готово! Показано: 3, приховано: 1');
    page.window.close();
});

test('an empty number field sets no limit, in the Scan and when toggling checkboxes', async () => {
    const page = await openListing(['lean', 'fatty']);
    page.setInput('silpo-fat-val', '');
    await page.scan();
    assert.deepEqual(page.card('fatty'), { hidden: false, colour: 'red', badgeColour: 'red' }); // still fails protein
    assert.deepEqual(page.card('lean'), { hidden: false, colour: 'green', badgeColour: 'green' });

    page.setCheckbox('silpo-hide-non-matching', true);
    assert.deepEqual(page.card('lean'), { hidden: false, colour: 'green', badgeColour: 'green' });
    assert.equal(JSON.parse(page.window.localStorage.getItem('calories_extention_filter_values')).fatVal, null);
    page.window.close();
});

test('"Очистити результати" removes every badge, colour and hiding', async () => {
    const page = await openListing(['lean', 'fatty', 'unknown']);
    page.setCheckbox('silpo-hide-non-matching', true);
    await page.scan();
    page.window.document.getElementById('silpo-reset-btn').click();
    for (const name of ['lean', 'fatty', 'unknown']) {
        assert.deepEqual(page.card(name), { hidden: false, colour: null, badgeColour: null }, name);
    }
    page.window.close();
});

test('a card the site re-renders during the Scan gets the Nutrition of its new product', async () => {
    const window = loadExtension({
        url: 'https://silpo.ua/category/test-1',
        html: silpoListingPage(['lean', 'fatty']),
        fetch: async (url) => {
            const name = url.split('/product/')[1];
            // While the first product loads, the site reuses the second card for another product
            if (name === 'lean') window.document.querySelector('[data-name="fatty"] a').href = '/product/even';
            return new Response(silpoProductPage(PRODUCTS[name]));
        },
    });
    const $ = (id) => window.document.getElementById(id);
    await waitFor(() => $('silpo-filter-btn'));
    $('silpo-filter-btn').click();
    await waitFor(() => $('silpo-filter-status').textContent.startsWith('✅'), { timeout: 5000 });

    const badge = window.document.querySelector('[data-name="fatty"] .silpo-nutrition-info').textContent;
    assert.match(badge, /Б: 10г/); // "even", not "fatty" (Б: 2г)
    window.close();
});

test('without hiding, the status counts matches, misses and products without data', async () => {
    const page = await openListing(['lean', 'fatty', 'unknown']);
    await page.scan();
    assert.equal(page.status(), '✅ Готово! Підходить: 1, не підходить: 1, без даних: 1');
    page.window.close();
});

test('the status counts each card as it ends up after a checkbox toggled mid-Scan', async () => {
    const page = await openListing(['even', 'lean'], {
        onFetch(name) {
            if (name === 'lean') page.setCheckbox('silpo-only-protein-more-than-fat', false);
        },
    });
    page.setCheckbox('silpo-only-protein-more-than-fat', true);
    await page.scan();
    assert.deepEqual(page.card('even'), { hidden: false, colour: 'green', badgeColour: 'green' });
    assert.equal(page.status(), '✅ Готово! Підходить: 2, не підходить: 0');
    page.window.close();
});

test('a new Apply re-colours cards from the earlier Scan before reaching them', async () => {
    let hang = false;
    const page = await openListing(['unknown', 'fatty'], {
        onFetch: () => hang && new Promise(() => {}),
    });
    await page.scan();
    assert.equal(page.card('fatty').colour, 'red');

    // Empty the cache so the second Scan fetches "unknown" first and hangs there
    page.window.confirm = () => true;
    page.window.document.getElementById('silpo-clear-cache-btn').click();
    hang = true;
    page.setInput('silpo-protein-val', 1);
    page.setInput('silpo-fat-val', 20);
    page.window.document.getElementById('silpo-filter-btn').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(page.status(), /Перевірка 1\/2/);
    assert.equal(page.card('fatty').colour, 'green');
    page.window.close();
});

const CACHE_KEY = 'calories_extention_nutrition_cache_v9';

test('products read from the cache are not delayed', async () => {
    const names = ['lean', 'fatty', 'even', 'lean', 'fatty', 'even'];
    const cache = { timestamp: Date.now() };
    const storage = {
        [CACHE_KEY]: JSON.stringify(Object.fromEntries(['lean', 'fatty', 'even'].map(name =>
            [`https://silpo.ua/product/${name}`, { ...PRODUCTS[name], ...cache }]))),
    };
    let fetches = 0;
    const page = await openListing(names, { onFetch: () => { fetches++; }, storage });
    const start = Date.now();
    await page.scan();
    assert.equal(fetches, 0);
    assert.ok(Date.now() - start < 300, `took ${Date.now() - start}ms`);
    page.window.close();
});

test('requests are spaced out, even for products without data', async () => {
    const times = [];
    const page = await openListing(['unknown', 'unknown2', 'unknown3'], { onFetch: () => { times.push(Date.now()); } });
    await page.scan();
    assert.equal(times.length, 3);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 90, `gap ${times[i] - times[i - 1]}ms`);
    page.window.close();
});

test('caches from every earlier version are dropped; other settings are kept', async () => {
    const old = ['calories_extention_nutrition_cache', 'calories_extention_nutrition_cache_v1',
        'calories_extention_nutrition_cache_v7', 'calories_extention_nutrition_cache_v8'];
    const page = await openListing(['lean'], {
        storage: { ...Object.fromEntries(old.map(key => [key, '{}'])), calories_extention_theme: 'light' },
    });
    for (const key of old) assert.equal(page.window.localStorage.getItem(key), null, key);
    assert.equal(page.window.localStorage.getItem('calories_extention_theme'), 'light');
    page.window.close();
});

test('a page without nutrition is cached, so the next Scan does not fetch it again', async () => {
    let fetches = 0;
    const page = await openListing(['unknown', 'lean'], { onFetch: () => { fetches++; } });
    await page.scan();
    assert.equal(fetches, 2);
    await page.scan();
    assert.equal(fetches, 2);
    assert.equal(page.card('unknown').colour, 'yellow');
    page.window.close();
});

test('a product that fails to load is left unmarked and counted, not shown as "no data"', async () => {
    const page = await openListing(['lean', 'fatty'], {
        onFetch: (name) => name === 'fatty' ? new Response('', { status: 404 }) : undefined,
    });
    await page.scan();
    assert.deepEqual(page.card('fatty'), { hidden: false, colour: null, badgeColour: null });
    assert.equal(page.status(), '✅ Готово! Підходить: 1, не підходить: 0, не вдалося: 1');
    page.window.close();
});

test('a bot check from the store stops the Scan', async () => {
    const requested = [];
    const page = await openListing(['lean', 'fatty', 'even'], {
        onFetch: (name) => {
            requested.push(name);
            if (name === 'fatty') return new Response('', { status: 403 });
        },
    });
    page.window.document.getElementById('silpo-filter-btn').click();
    await waitFor(() => page.status().startsWith('🛑'), { timeout: 5000 });
    assert.deepEqual(requested, ['lean', 'fatty']);
    assert.equal(page.card('even').colour, null);
    page.window.close();
});

test('the Scan stops after five products in a row fail to load', async () => {
    const names = ['unknown', 'unknown2', 'unknown3', 'lean', 'fatty', 'even'];
    let fetches = 0;
    const page = await openListing(names, { onFetch: () => { fetches++; return new Response('', { status: 404 }); } });
    page.window.document.getElementById('silpo-filter-btn').click();
    await waitFor(() => page.status().startsWith('📡'), { timeout: 5000 });
    assert.equal(fetches, 5);
    page.window.close();
});

test('"Зупинити пошук" stops a request that is still loading', async () => {
    const page = await openListing(['lean', 'fatty'], {
        onFetch: (name, init) => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    page.window.document.getElementById('silpo-filter-btn').click();
    await waitFor(() => page.status().startsWith('⏳'));
    page.window.document.getElementById('silpo-stop-btn').click();
    await waitFor(() => page.status().startsWith('⛔'), { timeout: 1000 });
    assert.equal(page.status(), '⛔ Зупинено. Перевірено: 0, підходить: 0, приховано: 0');
    page.window.close();
});

test('foodboom product pages are loaded in a frame, not with fetch()', async () => {
    const window = loadExtension({
        url: 'https://foodboom.ua/napoi/',
        html: `<div class="card card--float"><a class="card-title" href="/monster/">Monster</a></div>
            <div class="card card--float"><a class="card-title" href="/sik/">Сік</a></div>`,
        fetch: () => { throw new Error('fetch() was used'); },
    });
    const framed = [];
    window.BZVK.frameFetch.createFrameFetch = ({ isReady }) => {
        assert.equal(isReady, window.BZVK.sites.foodboom.nutritionRendered);
        return async (url) => {
            framed.push(url);
            const html = url.endsWith('/monster/') ? loadFixture('foodboom/product-monster-rendered.html.gz') : '<html><body></body></html>';
            return { status: 200, ok: true, headers: { get: () => null }, text: async () => html };
        };
    };
    const $ = (id) => window.document.getElementById(id);
    await waitFor(() => $('silpo-filter-btn'));
    $('silpo-filter-btn').click();
    await waitFor(() => $('silpo-filter-status').textContent.startsWith('✅'), { timeout: 5000 });
    assert.deepEqual(framed, ['https://foodboom.ua/monster/', 'https://foodboom.ua/sik/']);
    assert.equal($('silpo-filter-status').textContent, '✅ Готово! Підходить: 0, не підходить: 1, без даних: 1');
    window.close();
});

test('"Очистити результати" is hidden while a Scan runs and comes back after it', async () => {
    let release;
    const page = await openListing(['lean'], { onFetch: () => new Promise(resolve => { release = resolve; }) });
    const resetBtn = page.window.document.getElementById('silpo-reset-btn');
    page.window.document.getElementById('silpo-filter-btn').click();
    await waitFor(() => release);
    assert.equal(resetBtn.style.display, 'none');
    release();
    await waitFor(() => page.status().startsWith('✅'));
    assert.equal(resetBtn.style.display, '');
    page.window.close();
});

test('unknown calories show as "— ккал" and fail a calories limit', async () => {
    const page = await openListing(['noKcal']);
    await page.scan();
    assert.equal(page.card('noKcal').colour, 'red');
    const badge = page.window.document.querySelector('[data-name="noKcal"] .silpo-nutrition-info');
    assert.match(badge.textContent, /— ккал/);
    page.window.close();
});

test('a card from an earlier Scan that fails to load this time is unmarked', async () => {
    let fail = false;
    const page = await openListing(['lean'], { onFetch: () => fail ? new Response('', { status: 404 }) : undefined });
    await page.scan();
    assert.equal(page.card('lean').colour, 'green');

    page.window.confirm = () => true;
    page.window.document.getElementById('silpo-clear-cache-btn').click();
    fail = true;
    await page.scan();
    assert.deepEqual(page.card('lean'), { hidden: false, colour: null, badgeColour: null });
    page.window.close();
});

test('if the Scan throws, the panel buttons come back', async () => {
    const page = await openListing(['lean']);
    page.window.BZVK.sites.silpo.parseNutrition = () => { throw new Error('the store changed its page'); };
    const $ = (id) => page.window.document.getElementById(id);
    page.window.console.error = () => {};
    $('silpo-filter-btn').click();
    await waitFor(() => !$('silpo-filter-btn').disabled);
    assert.match(page.status(), /^⚠️ Перевірку перервано/);
    assert.equal($('silpo-stop-btn').style.display, 'none');
    assert.equal($('silpo-reset-btn').style.display, '');
    assert.equal(page.window.document.querySelector('.silpo-checking'), null);
    page.window.close();
});

test('"Очистити результати" also clears marks on cards the Scan no longer tracks', async () => {
    const page = await openListing(['lean']);
    const card = page.window.document.querySelector('[data-name="lean"]');
    card.classList.add('silpo-card-red', 'silpo-hidden');
    card.appendChild(Object.assign(page.window.document.createElement('div'), { className: 'silpo-nutrition-info' }));
    page.window.document.getElementById('silpo-reset-btn').click();
    assert.deepEqual(page.card('lean'), { hidden: false, colour: null, badgeColour: null });
    page.window.close();
});
