(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    // Characteristics rows, both the full table and the "key characteristics" block:
    // label "Білки, г", value "2"
    const CHARACTERISTIC_ROWS = '.product-characteristics__item .row, .primary-attrs__info';

    function readCharacteristic(doc, labelPattern) {
        for (const row of doc.querySelectorAll(CHARACTERISTIC_ROWS)) {
            const label = row.querySelector('.description, .primary-attrs__title')?.textContent || '';
            if (!labelPattern.test(label)) continue;
            const value = row.querySelector('.value, .primary-attrs__value')?.textContent.match(/\d+(?:[.,]\d+)?/);
            if (value) return parseFloat(value[0].replace(',', '.'));
        }
        return null;
    }

    function parseCharacteristics(doc) {
        const protein  = readCharacteristic(doc, /^\s*Білки,\s*г/i);
        const fat      = readCharacteristic(doc, /^\s*Жири,\s*г/i);
        const carbs    = readCharacteristic(doc, /^\s*Вуглеводи,\s*г/i);
        const calories = readCharacteristic(doc, /Енергетична цінність,\s*ккал/i);

        if (protein === null || fat === null || carbs === null) return null;
        return { protein, fat, carbs, calories: calories ?? 0 };
    }

    // Older product pages list nutrition in the description: "білки – 2 г"
    function parseDescription(doc) {
        const container = doc.querySelector('.product_description_text');
        const text = container?.textContent || doc.body?.textContent || '';

        const proteinMatch = text.match(/білки\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const fatMatch     = text.match(/жири\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const carbsMatch   = text.match(/вуглеводи\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const calMatch     = text.match(/(\d{2,}[.,]?\d*)\s*ккал/i);

        const parse = (m) => m ? parseFloat(m[1].replace(',', '.')) : null;
        const protein  = parse(proteinMatch);
        const fat      = parse(fatMatch);
        const carbs    = parse(carbsMatch);
        const calories = parse(calMatch);

        if (protein === null || fat === null || carbs === null) return null;
        return { protein, fat, carbs, calories: calories ?? 0 };
    }

    function parseFoodBoomNutrition(doc) {
        return parseCharacteristics(doc) || parseDescription(doc);
    }

    const PRODUCT_LINK = /^https:\/\/foodboom\.ua\/[^/]+\/$/;

    function findProducts(doc) {
        return Array.from(doc.querySelectorAll('.card.card--float'))
            .map(card => ({ card, url: card.querySelector('a.card-title')?.href }))
            .filter(({ url }) => url && PRODUCT_LINK.test(url));
    }

    BZVK.sites.foodboom = {
        hostname: 'foodboom.ua',
        findProducts,
        parseNutrition: parseFoodBoomNutrition
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.sites.foodboom;
})(globalThis);
