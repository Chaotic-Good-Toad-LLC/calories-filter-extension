(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };
    if (typeof module !== 'undefined' && module.exports) require('./adapter-kit.js');
    const { toNumber, productList } = BZVK.adapterKit;

    // Silpo's layout varies, so try card selectors in order and use the first that finds any products.
    // `parts`: the selector matches pieces of a card (several per product), not whole cards.
    const PRODUCT_CARD_SELECTORS = [
        { selector: 'article[class*="product"]', parts: false },
        { selector: 'div[class*="product-card"]', parts: true },
        { selector: 'a[href*="/product/"]', parts: true },
        { selector: '[data-testid*="product"]', parts: false }
    ];
    const PRODUCT_LINK_SELECTOR = 'a[href*="/product/"]';

    function productLinks(el) {
        const links = Array.from(el.querySelectorAll(PRODUCT_LINK_SELECTOR));
        if (el.matches(PRODUCT_LINK_SELECTOR)) links.unshift(el);
        return new Set(links.map(link => link.href));
    }

    // The card's product link, or null if it has none or links to several products
    function productUrl(card) {
        const links = productLinks(card);
        return links.size === 1 ? links.values().next().value : null;
    }

    // Matches that sit inside another match are part of that one
    function outermost(elements) {
        const matched = new Set(elements);
        return elements.filter(el => {
            for (let parent = el.parentElement; parent; parent = parent.parentElement) {
                if (matched.has(parent)) return false;
            }
            return true;
        });
    }

    // Pieces of one card (its image block and its title block, say) all link to the same product;
    // their card is the smallest element holding them all, if that links to that product only.
    // Otherwise they are separate cards for the same product, such as one in a promo row.
    function cardsFromParts(elements) {
        const groups = new Map();
        for (const el of elements) {
            const url = productUrl(el);
            if (!groups.has(url)) groups.set(url, []);
            groups.get(url).push(el);
        }
        return Array.from(groups.values()).flatMap(([first, ...rest]) => {
            let card = first;
            while (rest.some(el => !card.contains(el))) card = card.parentElement;
            return productUrl(card) ? [card] : [first, ...rest];
        });
    }

    function findProducts(doc) {
        for (const { selector, parts } of PRODUCT_CARD_SELECTORS) {
            // A match linking to several products is a list, not a card
            const matches = outermost(Array.from(doc.querySelectorAll(selector)).filter(productUrl));
            if (matches.length === 0) continue;
            return productList(parts ? cardsFromParts(matches) : matches, productUrl);
        }
        return [];
    }

    // Calories after their label: "Енергетична цінність (кКал/кДЖ)62/260", or just "62/" (no kJ).
    // Without the label, any "N/" on the page would do, such as "24 * 1000 // in seconds" in a script.
    const CALORIES = /(?:Енергетична цінність|Калорійність|ккал)[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)?/i;
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

    // Each element's text, read only when the loop gets to it
    function* textsOf(elements) {
        for (const el of elements) yield el.textContent;
    }

    // Fills whichever values are still missing from each text, in order
    function fillFrom(texts, macros, found) {
        for (const text of texts) {
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

        // The nutrition section's text, from smallest element (most specific) to largest
        const sections = [];
        for (const el of allElements) {
            const text = el.textContent;
            if ((text.includes('Харчова цінність') || text.includes('харчова цінність')) && text.includes('Білки')) {
                sections.push(text);
            }
        }
        sections.sort((a, b) => a.length - b.length);

        const found = { protein: null, fat: null, carbs: null, calories: null };
        fillFrom(sections, SECTION_MACROS, found);

        // If not found in the section, fall back to the whole page
        if (!isComplete(found)) fillFrom(textsOf(allElements), LOOSE_MACROS, found);

        const { protein, fat, carbs, calories } = found;
        if (protein === null || fat === null || carbs === null) return null;
        return { protein, fat, carbs, calories };
    }

    BZVK.sites.silpo = {
        hostname: 'silpo.ua',
        findProducts,
        parseNutrition
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.sites.silpo;
})(globalThis);
