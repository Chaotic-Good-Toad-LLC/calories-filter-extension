(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    function parseSilpoNutrition(doc) {
        // Find the nutrition section — more specific search
        const nutritionSectionCandidates = Array.from(doc.querySelectorAll('*')).filter(el => {
            const text = el.textContent;
            return (text.includes('Харчова цінність') || text.includes('харчова цінність')) &&
                text.includes('Білки');
        });

        // Sort from smallest element (most specific) to largest
        nutritionSectionCandidates.sort((a, b) => a.textContent.length - b.textContent.length);

        let protein = null;
        let fat = null;
        let carbs = null;
        let calories = null;

        // Search within the nutrition section
        for (const section of nutritionSectionCandidates) {
            const sectionText = section.textContent;

            // Calories: match "NUMBER/NUMBER" (kcal/kJ) or just "NUMBER/" (no kJ)
            // Sometimes the order is swapped (kJ/kcal), so we detect and swap back
            if (calories === null) {
                const caloriesMatch = sectionText.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)?/);
                if (caloriesMatch) {
                    let a = parseFloat(caloriesMatch[1].replace(',', '.'));
                    let b = caloriesMatch[2] ? parseFloat(caloriesMatch[2].replace(',', '.')) : null;
                    if (b === null) {
                        // Only one number before the slash — treat as kcal
                        calories = a;
                    } else if (b > a && b < a * 10) {
                        // Normal order: kcal/kJ (62/260)
                        calories = a;
                    } else if (a > b && a < b * 10) {
                        // Reversed order: kJ/kcal (427/101) — swap
                        calories = b;
                    }
                }
            }

            if (protein === null) {
                const proteinMatch = sectionText.match(/Білки\s*\(г\)[^\d]*(\d+[.,]?\d*)/i);
                if (proteinMatch) {
                    protein = parseFloat(proteinMatch[1].replace(',', '.'));
                }
            }

            if (fat === null) {
                const fatMatch = sectionText.match(/Жири\s*\(г\)[^\d]*(\d+[.,]?\d*)/i);
                if (fatMatch) {
                    fat = parseFloat(fatMatch[1].replace(',', '.'));
                }
            }

            if (carbs === null) {
                const carbsMatch = sectionText.match(/Вуглеводи\s*\(г\)[^\d]*(\d+[.,]?\d*)/i);
                if (carbsMatch) {
                    carbs = parseFloat(carbsMatch[1].replace(',', '.'));
                }
            }

            if (protein !== null && fat !== null && carbs !== null && calories !== null) break;
        }

        // If not found in main sections, try fallback approach
        if (protein === null || fat === null || carbs === null || calories === null) {
            const allElements = Array.from(doc.querySelectorAll('*'));

            for (const el of allElements) {
                const text = el.textContent;

                // Calories via NUMBER/ or NUMBER/NUMBER format (with swap if order is reversed)
                if (calories === null) {
                    const match = text.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)?/);
                    if (match) {
                        let a = parseFloat(match[1].replace(',', '.'));
                        let b = match[2] ? parseFloat(match[2].replace(',', '.')) : null;
                        if (b === null) {
                            calories = a;
                        } else if (b > a && b < a * 10) {
                            calories = a;
                        } else if (a > b && a < b * 10) {
                            calories = b;
                        }
                    }
                }

                if (protein === null && /Білки.*?\(г\)/i.test(text)) {
                    const match = text.match(/Білки.*?\(г\)[^\d]*(\d+[.,]?\d*)/i);
                    if (match) protein = parseFloat(match[1].replace(',', '.'));
                }

                if (fat === null && /Жири.*?\(г\)/i.test(text)) {
                    const match = text.match(/Жири.*?\(г\)[^\d]*(\d+[.,]?\d*)/i);
                    if (match) fat = parseFloat(match[1].replace(',', '.'));
                }

                if (carbs === null && /Вуглеводи.*?\(г\)/i.test(text)) {
                    const match = text.match(/Вуглеводи.*?\(г\)[^\d]*(\d+[.,]?\d*)/i);
                    if (match) carbs = parseFloat(match[1].replace(',', '.'));
                }

                if (protein !== null && fat !== null && carbs !== null && calories !== null) break;
            }
        }

        if (protein === null || fat === null || carbs === null) return null;
        if (calories === null) calories = 0;

        return { protein, fat, carbs, calories };
    }

    BZVK.sites.silpo = {
        hostname: 'silpo.ua',
        productCardSelectors: [
            'article[class*="product"]',
            'div[class*="product-card"]',
            'a[href*="/product/"]',
            '[data-testid*="product"]'
        ],
        productLinkPattern: /\/product\//,
        getProductLink: (card) => card.href || card.querySelector('a')?.href,
        parseNutrition: parseSilpoNutrition
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.sites.silpo;
})(globalThis);
