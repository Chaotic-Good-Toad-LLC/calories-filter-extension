(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };
    if (typeof module !== 'undefined' && module.exports) require('./adapter-kit.js');
    const { toNumber, productList } = BZVK.adapterKit;

    // Characteristics rows, both the full table and the "key characteristics" block:
    // label "Білки, г", value "2"
    const CHARACTERISTIC_ROWS = '.product-characteristics__item .row, .primary-attrs__info';

    function readCharacteristic(doc, labelPattern) {
        for (const row of doc.querySelectorAll(CHARACTERISTIC_ROWS)) {
            const label = row.querySelector('.description, .primary-attrs__title')?.textContent || '';
            if (!labelPattern.test(label)) continue;
            const value = row.querySelector('.value, .primary-attrs__value')?.textContent.match(/\d+(?:[.,]\d+)?/);
            if (value) return toNumber(value[0]);
        }
        return null;
    }

    // Each value is null when the table has no row for it
    function parseCharacteristics(doc) {
        return {
            protein:  readCharacteristic(doc, /^\s*Білки,\s*г/i),
            fat:      readCharacteristic(doc, /^\s*Жири,\s*г/i),
            carbs:    readCharacteristic(doc, /^\s*Вуглеводи,\s*г/i),
            calories: readCharacteristic(doc, /Енергетична цінність,\s*ккал/i)
        };
    }

    // Older product pages list nutrition in the description: "білки – 2 г"
    function parseDescription(doc) {
        const container = doc.querySelector('.product_description_text');
        const text = container?.textContent || doc.body?.textContent || '';

        const proteinMatch = text.match(/білки\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const fatMatch     = text.match(/жири\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const carbsMatch   = text.match(/вуглеводи\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const calMatch     = text.match(/(\d{2,}[.,]?\d*)\s*ккал/i);

        const parse = (m) => m ? toNumber(m[1]) : null;
        const protein  = parse(proteinMatch);
        const fat      = parse(fatMatch);
        const carbs    = parse(carbsMatch);
        const calories = parse(calMatch);

        if (protein === null || fat === null || carbs === null) return null;
        return { protein, fat, carbs, calories };
    }

    // A table that lists only some values gives those, with the rest null
    function parseFoodBoomNutrition(doc) {
        const nutrition = parseCharacteristics(doc);
        const { protein, fat, carbs, calories } = nutrition;
        // Only pages whose table has no macros at all use the description; a partial table
        // is not topped up from it, since the body text can include other products
        if (protein === null && fat === null && carbs === null) {
            const described = parseDescription(doc);
            // The table's calories still count when the description gives none
            if (described) return { ...described, calories: described.calories ?? calories };
        }
        return Object.values(nutrition).some(value => value !== null) ? nutrition : null;
    }

    const PRODUCT_LINK = /^https:\/\/foodboom\.ua\/[^/]+\/$/;

    function productUrl(card) {
        const url = card.querySelector('a.card-title')?.href;
        return url && PRODUCT_LINK.test(url) ? url : null;
    }

    function findProducts(doc) {
        return productList(doc.querySelectorAll('.card.card--float'), productUrl);
    }

    // The product page's script adds the characteristics after the page opens, so the HTML
    // fetch() gets mostly has none; the Scan loads these pages in a frame and waits for this
    function nutritionRendered(doc) {
        return !!doc.querySelector(CHARACTERISTIC_ROWS);
    }

    BZVK.sites.foodboom = {
        hostname: 'foodboom.ua',
        findProducts,
        parseNutrition: parseFoodBoomNutrition,
        nutritionRendered
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.sites.foodboom;
})(globalThis);
