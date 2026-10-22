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

test('compareValue passes on an unknown operator', () => {
    assert.equal(compareValue(1, '??', 100), true);
});
