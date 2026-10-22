const test = require('node:test');
const assert = require('node:assert/strict');
const { compareValue } = require('../src/match.js');

test('compareValue applies each operator', () => {
    const cases = [
        [5, '<', 10, true], [10, '<', 10, false],
        [10, '<=', 10, true], [10.1, '<=', 10, false],
        [10, '>=', 10, true], [9.9, '>=', 10, false],
        [11, '>', 10, true], [10, '>', 10, false],
    ];
    for (const [actual, op, target, expected] of cases) {
        assert.equal(compareValue(actual, op, target), expected, `${actual} ${op} ${target}`);
    }
});

test('compareValue "=" allows less than 0.1g either side', () => {
    assert.equal(compareValue(10.05, '=', 10), true);
    assert.equal(compareValue(9.95, '=', 10), true);
    assert.equal(compareValue(10.2, '=', 10), false);
});

test('compareValue: an empty field sets no limit', () => {
    for (const target of [null, undefined, NaN]) {
        assert.equal(compareValue(5, '>=', target), true, String(target));
        assert.equal(compareValue(5, '=', target), true, String(target));
    }
});

test('compareValue passes on an unknown operator', () => {
    assert.equal(compareValue(1, '??', 100), true);
});

const { evaluate } = require('../src/match.js');

const DEFAULTS = {
    proteinOp: '>=', proteinVal: 10, fatOp: '<=', fatVal: 10,
    carbsOp: '<=', carbsVal: 20, caloriesOp: '<=', caloriesVal: 200,
    hideWithoutNutrition: false, hideNonMatching: false, onlyProteinMoreThanFat: false,
};
const lean = { protein: 20, fat: 5, carbs: 5, calories: 150 };
const fatty = { protein: 2, fat: 15, carbs: 3, calories: 159 };
const even = { protein: 10, fat: 10, carbs: 1, calories: 150 };

test('evaluate: Verdict and visibility for each combination of flags', () => {
    const cases = [
        // nutrition, criteria overrides, expected
        [lean, {}, { verdict: 'match', hidden: false, proteinMoreThanFat: true }],
        [fatty, {}, { verdict: 'miss', hidden: false, proteinMoreThanFat: false }],
        [fatty, { hideNonMatching: true }, { verdict: 'miss', hidden: true, proteinMoreThanFat: false }],
        [lean, { hideNonMatching: true }, { verdict: 'match', hidden: false, proteinMoreThanFat: true }],
        // "only protein > fat" is a criterion, and hides its misses on its own
        [even, {}, { verdict: 'match', hidden: false, proteinMoreThanFat: false }],
        [even, { onlyProteinMoreThanFat: true }, { verdict: 'miss', hidden: true, proteinMoreThanFat: false }],
        [lean, { onlyProteinMoreThanFat: true }, { verdict: 'match', hidden: false, proteinMoreThanFat: true }],
        // a miss on macros with protein > fat stays visible unless non-matching cards are hidden
        [{ protein: 30, fat: 5, carbs: 50, calories: 150 }, { onlyProteinMoreThanFat: true },
            { verdict: 'miss', hidden: false, proteinMoreThanFat: true }],
        // no data
        [null, {}, { verdict: 'noData', hidden: false, proteinMoreThanFat: false }],
        [null, { hideWithoutNutrition: true }, { verdict: 'noData', hidden: true, proteinMoreThanFat: false }],
        [null, { hideNonMatching: true }, { verdict: 'noData', hidden: false, proteinMoreThanFat: false }],
    ];
    for (const [nutrition, overrides, expected] of cases) {
        assert.deepEqual(evaluate(nutrition, { ...DEFAULTS, ...overrides }), expected, JSON.stringify([nutrition, overrides]));
    }
});

test('evaluate: calories 0 means unknown and always passes the calories criterion', () => {
    const noCalories = { ...lean, calories: 0 };
    assert.equal(evaluate(noCalories, { ...DEFAULTS, caloriesOp: '>', caloriesVal: 1000 }).verdict, 'match');
    assert.equal(evaluate(lean, { ...DEFAULTS, caloriesOp: '>', caloriesVal: 1000 }).verdict, 'miss');
});
