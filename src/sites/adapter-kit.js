(function (root) {
    'use strict';

    const BZVK = root.BZVK = root.BZVK || { sites: {} };

    // "2,8" or "2.8" → 2.8
    function toNumber(text) {
        return parseFloat(text.replace(',', '.'));
    }

    // findProducts' result: cards with a product link, each url read when it is used,
    // so a card the site re-renders mid-Scan gives its current link
    function productList(cards, productUrl) {
        return Array.from(cards)
            .filter(card => productUrl(card))
            .map(card => ({ card, get url() { return productUrl(card); } }));
    }

    BZVK.adapterKit = { toNumber, productList };

    if (typeof module !== 'undefined' && module.exports) module.exports = BZVK.adapterKit;
})(globalThis);
