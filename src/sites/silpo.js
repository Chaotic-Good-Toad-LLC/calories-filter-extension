(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    // Silpo's layout varies, so try card selectors in order and use the first that finds any
    const PRODUCT_CARD_SELECTORS = [
        'article[class*="product"]',
        'div[class*="product-card"]',
        'a[href*="/product/"]',
        '[data-testid*="product"]'
    ];
    const PRODUCT_LINK = /\/product\//;

    function productUrl(card) {
        const url = card.href || card.querySelector('a')?.href;
        return url && PRODUCT_LINK.test(url) ? url : null;
    }

    function findProducts(doc) {
        let cards = [];
        for (const selector of PRODUCT_CARD_SELECTORS) {
            cards = doc.querySelectorAll(selector);
            if (cards.length > 0) break;
        }
        // url is read each time it is used, so a card the site re-renders mid-Scan gives its current link
        return Array.from(cards)
            .filter(card => productUrl(card))
            .map(card => ({ card, get url() { return productUrl(card); } }));
    }

    // Calories: "NUMBER/NUMBER" (kcal/kJ) or just "NUMBER/" (no kJ)
    const CALORIES = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)?/;
    // Inside the nutrition section, the label sits right before its value: "Білки (г)2.8"
    const SECTION_MACROS = {
        protein: /Білки\s*\(г\)[^\d]*(\d+[.,]?\d*)/i,
        fat: /Жири\s*\(г\)[^\d]*(\d+[.,]?\d*)/i,
        carbs: /Вуглеводи\s*\(г\)[^\d]*(\d+[.,]?\d*)/i
    };
    // Anywhere on the page, allow text between the name and "(г)"
    const LOOSE_MACROS = {
        protein: /Білки.*?\(г\)[^\d]*(\d+[.,]?\d*)/i,
        fat: /Жири.*?\(г\)[^\d]*(\d+[.,]?\d*)/i,
        carbs: /Вуглеводи.*?\(г\)[^\d]*(\d+[.,]?\d*)/i
    };

    function toNumber(text) {
        return parseFloat(text.replace(',', '.'));
    }

    function parseCalories(text) {
        const match = text.match(CALORIES);
        if (!match) return null;
        const a = toNumber(match[1]);
        const b = match[2] ? toNumber(match[2]) : null;
        // Only one number before the slash — treat as kcal
        if (b === null) return a;
        // Normal order: kcal/kJ (62/260)
        if (b > a && b < a * 10) return a;
        // Reversed order: kJ/kcal (427/101) — swap
        if (a > b && a < b * 10) return b;
        return null;
    }

    function isComplete(found) {
        return found.protein !== null && found.fat !== null && found.carbs !== null && found.calories !== null;
    }

    // Fills whichever values are still missing from each element's text, in order
    function fillFrom(elements, macros, found) {
        for (const el of elements) {
            const text = el.textContent;
            if (found.calories === null) found.calories = parseCalories(text);
            for (const key of ['protein', 'fat', 'carbs']) {
                if (found[key] !== null) continue;
                const match = text.match(macros[key]);
                if (match) found[key] = toNumber(match[1]);
            }
            if (isComplete(found)) return;
        }
    }

    function parseNutrition(doc) {
        const allElements = Array.from(doc.querySelectorAll('*'));

        // The nutrition section, from smallest element (most specific) to largest
        const sections = allElements.filter(el => {
            const text = el.textContent;
            return (text.includes('Харчова цінність') || text.includes('харчова цінність')) &&
                text.includes('Білки');
        });
        sections.sort((a, b) => a.textContent.length - b.textContent.length);

        const found = { protein: null, fat: null, carbs: null, calories: null };
        fillFrom(sections, SECTION_MACROS, found);

        // If not found in the section, fall back to the whole page
        if (!isComplete(found)) fillFrom(allElements, LOOSE_MACROS, found);

        const { protein, fat, carbs, calories } = found;
        if (protein === null || fat === null || carbs === null) return null;
        return { protein, fat, carbs, calories: calories ?? 0 };
    }

    BZVK.sites.silpo = {
        hostname: 'silpo.ua',
        findProducts,
        parseNutrition
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.sites.silpo;
})(globalThis);
