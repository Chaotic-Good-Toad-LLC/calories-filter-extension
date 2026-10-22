(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    function compareValue(actual, operator, target) {
        // An empty field sets no limit
        if (target === null || target === undefined || Number.isNaN(target)) return true;
        switch (operator) {
            case '<': return actual < target;
            case '<=': return actual <= target;
            // Values are given to 0.1 g, so compare them rounded to that (10.04 = 10, 10.1 ≠ 10)
            case '=': return Math.round(actual * 10) === Math.round(target * 10);
            case '>=': return actual >= target;
            case '>': return actual > target;
            default: return true;
        }
    }

    // Decides one product's Verdict against the Criteria, and whether its card is hidden.
    // nutrition: { protein, fat, carbs, calories } or null; calories null means "unknown" and always passes.
    // criteria: { proteinOp, proteinVal, fatOp, fatVal, carbsOp, carbsVal, caloriesOp, caloriesVal,
    //             hideWithoutNutrition, hideNonMatching, onlyProteinMoreThanFat }
    function evaluate(nutrition, criteria) {
        if (!nutrition) {
            return { verdict: 'noData', hidden: !!criteria.hideWithoutNutrition, proteinMoreThanFat: false };
        }

        const { protein, fat, carbs, calories } = nutrition;
        const proteinMoreThanFat = protein > fat;
        const isMatch = compareValue(protein, criteria.proteinOp, criteria.proteinVal) &&
            compareValue(fat, criteria.fatOp, criteria.fatVal) &&
            compareValue(carbs, criteria.carbsOp, criteria.carbsVal) &&
            (calories === null ? true : compareValue(calories, criteria.caloriesOp, criteria.caloriesVal)) &&
            (criteria.onlyProteinMoreThanFat ? proteinMoreThanFat : true);

        // "Only protein > fat" hides its misses even when non-matching cards are shown
        const hidden = !isMatch && (!!criteria.hideNonMatching || (!!criteria.onlyProteinMoreThanFat && !proteinMoreThanFat));

        return { verdict: isMatch ? 'match' : 'miss', hidden, proteinMoreThanFat };
    }

    BZVK.match = { compareValue, evaluate };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.match;
})(globalThis);
