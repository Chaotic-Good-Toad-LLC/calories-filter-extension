(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    function compareValue(actual, operator, target) {
        switch (operator) {
            case '<': return actual < target;
            case '<=': return actual <= target;
            case '=': return Math.abs(actual - target) < 0.1; // 0.1g tolerance
            case '>=': return actual >= target;
            case '>': return actual > target;
            default: return true;
        }
    }

    BZVK.match = { compareValue };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.match;
})(globalThis);
