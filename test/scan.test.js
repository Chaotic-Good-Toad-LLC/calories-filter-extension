const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExtension, waitFor } = require('./helpers.js');

// Default Criteria (no saved values): protein >= 10, fat <= 10, carbs <= 20, calories <= 200.
const PRODUCTS = {
    lean: { protein: 20, fat: 5, carbs: 5, calories: 150 },    // match, protein > fat
    fatty: { protein: 2, fat: 15, carbs: 3, calories: 159 },   // miss
    even: { protein: 10, fat: 10, carbs: 1, calories: 150 },   // match, protein = fat
    unknown: null,                                             // no Nutrition on the page
};

function silpoProductPage(nutrition) {
    if (!nutrition) return '<html><body><h1>Капсули для прання</h1></body></html>';
    const { protein, fat, carbs, calories } = nutrition;
    return `<html><body><div><h3>Харчова цінність на 100 г</h3>
        <div>Енергетична цінність (кКал/кДЖ)${calories}/${Math.round(calories * 4.184)}</div>
        <div>Білки (г)${protein}</div><div>Жири (г)${fat}</div><div>Вуглеводи (г)${carbs}</div>
    </div></body></html>`;
}

function silpoListingPage(names) {
    const cards = names.map(name =>
        `<article class="product-card" data-name="${name}"><a href="/product/${name}">${name}</a></article>`);
    return `<html><body>${cards.join('')}</body></html>`;
}

async function openListing(names) {
    const window = loadExtension({
        url: 'https://silpo.ua/category/test-1',
        html: silpoListingPage(names),
        fetch: async (url) => {
            const name = url.split('/product/')[1];
            return { text: async () => silpoProductPage(PRODUCTS[name]) };
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
    assert.equal(page.window.document.getElementById('silpo-filter-status').textContent, '✅ Готово! Показано: 2, приховано: 1');
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
