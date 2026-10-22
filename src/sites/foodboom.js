(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    function parseFoodBoomNutrition(doc) {
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

    BZVK.sites.foodboom = {
        hostname: 'foodboom.ua',
        productCardSelectors: [
            '.card-item--float'
        ],
        productLinkPattern: /^https:\/\/foodboom\.ua\/[^/]+\/$/,
        getProductLink: (card) => card.querySelector('.card-item__name a')?.href,
        parseNutrition: parseFoodBoomNutrition
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.sites.foodboom;
})(globalThis);
