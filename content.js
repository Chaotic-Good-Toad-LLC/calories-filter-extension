(function () {
    'use strict';

    // === CONFIG ===
    const CONFIG = {
        minProtein: 10,  // min protein (g)
        maxFat: 10,      // max fat (g)
        maxCarbs: 20,    // max carbs (g)
        maxCalories: 200, // max calories (kcal)
        proteinOperator: '>=',
        fatOperator: '<=',
        carbsOperator: '<=',
        caloriesOperator: '<=',
        // v9: any value can be null (unknown), so partial tables are kept; pages without nutrition
        // are stored as { noData: true }
        cacheKey: 'calories_extention_nutrition_cache_v9',
        oldCacheKeys: ['calories_extention_nutrition_cache_v7', 'calories_extention_nutrition_cache_v8'],
        cacheExpiry: 604800000, // 7 days
        noDataCacheExpiry: 86400000, // 1 day: the store may add the nutrition table later
        maxFailedInARow: 5, // stop the Scan after this many products in a row fail to load
        hideWithoutNutritionKey: 'calories_extention_hide_without_nutrition',
        hideNonMatchingKey: 'calories_extention_hide_non_matching',
        onlyProteinMoreThanFatKey: 'calories_extention_only_protein_more_than_fat',
        panelMinimizedKey: 'calories_extention_panel_minimized',
        filterValuesKey: 'calories_extention_filter_values',
        themeKey: 'calories_extention_theme'
    };

    const { evaluate } = BZVK.match;

    // === SITE DETECTION ===
    function detectSite() {
        const hostname = window.location.hostname;
        for (const site of Object.values(BZVK.sites)) {
            if (hostname.includes(site.hostname)) return site;
        }
        return null;
    }

    const currentSite = detectSite();

    // === CACHE ===
    class NutritionCache {
        constructor() {
            this.data = this.load();
        }

        load() {
            try {
                CONFIG.oldCacheKeys.forEach(key => localStorage.removeItem(key));
                const cached = localStorage.getItem(CONFIG.cacheKey);
                if (!cached) return {};
                const parsed = JSON.parse(cached);

                // Remove expired entries
                const now = Date.now();
                Object.keys(parsed).forEach(url => {
                    const expiry = parsed[url].noData ? CONFIG.noDataCacheExpiry : CONFIG.cacheExpiry;
                    if (now - parsed[url].timestamp > expiry) {
                        delete parsed[url];
                    }
                });

                return parsed;
            } catch (e) {
                return {};
            }
        }

        save() {
            try {
                localStorage.setItem(CONFIG.cacheKey, JSON.stringify(this.data));
            } catch (e) {
                console.error('Failed to save cache:', e);
            }
        }

        has(url) {
            return url in this.data;
        }

        // Nutrition, or null for a page without it
        get(url) {
            const entry = this.data[url];
            if (!entry || entry.noData) return null;
            const { protein, fat, carbs, calories } = entry;
            return { protein, fat, carbs, calories };
        }

        set(url, nutrition) {
            this.data[url] = { ...(nutrition || { noData: true }), timestamp: Date.now() };
            this.save();
        }
    }

    const cache = new NutritionCache();

    let filterCancelled = false;
    let activeLoader = null; // the running Scan's page loader, so "Зупинити" can cut a request short

    // === NUTRITION FETCHING ===
    // → { status: 'ok', nutrition } (nutrition null when the page has none),
    //   or { status: 'failed' | 'blocked' | 'cancelled' } from the page loader
    async function fetchNutritionInfo(url, loader) {
        if (cache.has(url)) return { status: 'ok', nutrition: cache.get(url) };

        const page = await loader.load(url);
        if (page.status !== 'ok') return page;

        const doc = new DOMParser().parseFromString(page.html, 'text/html');
        const nutrition = currentSite.parseNutrition(doc);
        cache.set(url, nutrition);
        return { status: 'ok', nutrition };
    }

    // === CRITERIA ===
    // Numbers and operators from the last "Застосувати фільтр"; checkbox flags are always read live
    let appliedCriteria = null;

    function readCheckboxFlags() {
        return {
            hideWithoutNutrition: !!document.getElementById('silpo-hide-without-nutrition')?.checked,
            hideNonMatching: !!document.getElementById('silpo-hide-non-matching')?.checked,
            onlyProteinMoreThanFat: !!document.getElementById('silpo-only-protein-more-than-fat')?.checked
        };
    }

    function currentCriteria() {
        return { ...appliedCriteria, ...readCheckboxFlags() };
    }

    function saveCheckboxFlags() {
        const { hideWithoutNutrition, hideNonMatching, onlyProteinMoreThanFat } = readCheckboxFlags();
        try {
            localStorage.setItem(CONFIG.hideWithoutNutritionKey, hideWithoutNutrition);
            localStorage.setItem(CONFIG.hideNonMatchingKey, hideNonMatching);
            localStorage.setItem(CONFIG.onlyProteinMoreThanFatKey, onlyProteinMoreThanFat);
        } catch (e) {
            console.error('Failed to save checkbox states:', e);
        }
    }

    // === CARD MARKING ===
    function createNutritionLabel(prefix, value, suffix) {
        const div = document.createElement('div');
        div.className = 'silpo-nutrition-label';
        const strong = document.createElement('strong');
        strong.textContent = prefix;
        div.appendChild(strong);
        div.appendChild(document.createTextNode(value === null ? ' —' : ` ${value}${suffix}`));
        return div;
    }

    // Every card a Scan has marked → its Nutrition (null for no data), so checkbox changes can re-evaluate it
    const scannedCards = new Map();

    // Removes a card's badge, colour and hiding
    function unmarkCard(card) {
        card.querySelector('.silpo-nutrition-info')?.remove();
        card.classList.remove('silpo-card-green', 'silpo-card-red', 'silpo-card-yellow', 'silpo-hidden');
    }

    // Draws a card's badge, colour and visibility from its Nutrition and the result of evaluate()
    function markCard(card, nutrition, result) {
        unmarkCard(card);
        card.classList.toggle('silpo-hidden', result.hidden);

        const infoDiv = document.createElement('div');

        if (result.verdict === 'noData') {
            card.classList.add('silpo-card-yellow');
            infoDiv.className = 'silpo-nutrition-info silpo-badge-yellow';
            infoDiv.textContent = '⚠️ Немає даних про БЖВ';
            card.appendChild(infoDiv);
            return;
        }

        const { protein, fat, carbs, calories } = nutrition;
        const isMatch = result.verdict === 'match';
        const colour = isMatch ? 'green' : 'red';
        card.classList.add(`silpo-card-${colour}`);
        infoDiv.className = `silpo-nutrition-info silpo-badge-${colour}`;

        infoDiv.appendChild(createNutritionLabel('Б:', protein, 'г'));
        infoDiv.appendChild(createNutritionLabel('Ж:', fat, 'г'));
        infoDiv.appendChild(createNutritionLabel('В:', carbs, 'г'));

        if (calories !== null) {
            const calDiv = document.createElement('div');
            calDiv.className = 'silpo-nutrition-label';
            if (isMatch) {
                const calorieEmoji = calories <= 100 ? '🔥' : '👍';
                calDiv.appendChild(document.createTextNode(calorieEmoji + ' '));
            }
            const strong = document.createElement('strong');
            strong.textContent = calories;
            calDiv.appendChild(strong);
            calDiv.appendChild(document.createTextNode(' ккал'));
            infoDiv.appendChild(calDiv);
        }

        // Add muscle emoji if protein > fat
        if (result.proteinMoreThanFat) {
            const muscleDiv = document.createElement('div');
            muscleDiv.className = 'silpo-nutrition-label';
            muscleDiv.textContent = '💪';
            muscleDiv.title = 'Білків більше ніж жирів';
            infoDiv.appendChild(muscleDiv);
        }

        card.appendChild(infoDiv);
    }

    // === PRODUCT FILTERING ===
    // Counts for the status line, from each card's current state
    function countCards(cards) {
        const criteria = currentCriteria();
        const counts = { match: 0, miss: 0, noData: 0, hidden: 0 };
        for (const card of cards) {
            const result = evaluate(scannedCards.get(card), criteria);
            counts[result.verdict]++;
            if (result.hidden) counts.hidden++;
        }
        return counts;
    }

    async function filterProducts(statusEl) {
        const products = currentSite.findProducts(document);

        if (products.length === 0) {
            statusEl.textContent = '❌ Не знайдено товарів на цій сторінці';
            return;
        }

        statusEl.textContent = `🔍 Знайдено ${products.length} товарів. Починаю перевірку...`;

        filterCancelled = false;
        // A store whose page script adds the nutrition has its pages loaded in a frame instead
        const loader = BZVK.pageLoader.createPageLoader({
            fetch: currentSite.nutritionRendered
                ? BZVK.frameFetch.createFrameFetch({ document, isReady: currentSite.nutritionRendered })
                : (url, init) => fetch(url, init),
            sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
        });
        activeLoader = loader;
        const checked = [];
        let failed = 0;
        let failedInARow = 0;

        const summary = () => {
            const { match, hidden } = countCards(checked);
            return `Перевірено: ${checked.length}, підходить: ${match}, приховано: ${hidden}` +
                (failed > 0 ? `, не вдалося: ${failed}` : '');
        };

        try {
            // url is read here, just before the fetch, since the site may have re-rendered the card
            for (const { card, url } of products) {
                if (filterCancelled) {
                    statusEl.textContent = `⛔ Зупинено. ${summary()}`;
                    return;
                }

                statusEl.textContent = `⏳ Перевірка ${checked.length + failed + 1}/${products.length}... Знайдено: ${countCards(checked).match}`;
                // Skip cards without a product link, and cards the site has removed from the page
                if (!url || !card.isConnected) continue;

                // Highlight the product being checked
                card.classList.add('silpo-checking');
                const result = await fetchNutritionInfo(url, loader);
                card.classList.remove('silpo-checking');

                if (result.status === 'cancelled') continue; // reported at the top of the loop
                if (result.status === 'blocked') {
                    statusEl.textContent = `🛑 Сайт тимчасово обмежив запити, перевірку зупинено. Спробуйте пізніше. ${summary()}`;
                    return;
                }
                // A product that failed to load is left unmarked: no data is not the same as unknown
                if (result.status === 'failed') {
                    failed++;
                    failedInARow++;
                    if (failedInARow >= CONFIG.maxFailedInARow) {
                        statusEl.textContent = `📡 Не вдається завантажити товари, перевірку зупинено. Перевірте з'єднання. ${summary()}`;
                        return;
                    }
                    continue;
                }
                failedInARow = 0;

                scannedCards.set(card, result.nutrition);
                checked.push(card);
                markCard(card, result.nutrition, evaluate(result.nutrition, currentCriteria()));
            }
        } finally {
            activeLoader = null;
        }

        if (filterCancelled) {
            statusEl.textContent = `⛔ Зупинено. ${summary()}`;
            return;
        }

        const { match, miss, noData, hidden } = countCards(checked);
        const failedNote = failed > 0 ? `, не вдалося: ${failed}` : '';
        if (readCheckboxFlags().hideNonMatching) {
            statusEl.textContent = `✅ Готово! Показано: ${checked.length - hidden}, приховано: ${hidden}` + failedNote;
        } else {
            statusEl.textContent = `✅ Готово! Підходить: ${match}, не підходить: ${miss}` +
                (noData > 0 ? `, без даних: ${noData}` : '') + failedNote;
        }
    }

    // === DYNAMIC VISIBILITY ===
    // Re-draws every scanned card by the applied Criteria and the current checkbox flags
    function refreshScannedCards() {
        const criteria = currentCriteria();
        for (const [card, nutrition] of scannedCards) {
            if (!card.isConnected) {
                scannedCards.delete(card);
                continue;
            }
            markCard(card, nutrition, evaluate(nutrition, criteria));
        }
    }

    function applyVisibility() {
        if (appliedCriteria) refreshScannedCards();
        saveCheckboxFlags();
    }

    // === UI PANEL ===
    function createFilterPanel() {
        // Load saved checkbox and panel state
        const hideWithoutNutrition = localStorage.getItem(CONFIG.hideWithoutNutritionKey) === 'true';
        const hideNonMatching = localStorage.getItem(CONFIG.hideNonMatchingKey) === 'true';
        const onlyProteinMoreThanFat = localStorage.getItem(CONFIG.onlyProteinMoreThanFatKey) === 'true';
        const isMinimized = localStorage.getItem(CONFIG.panelMinimizedKey) !== 'false'; // default minimized

        // Load saved filter values
        let savedValues = null;
        try {
            const saved = localStorage.getItem(CONFIG.filterValuesKey);
            if (saved) {
                savedValues = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load saved filter values:', e);
        }

        // Use saved values or defaults from CONFIG; a saved null is a field left empty
        const savedNumber = (key, fallback) => savedValues && key in savedValues ? savedValues[key] ?? '' : fallback;
        const proteinOp = savedValues?.proteinOp || CONFIG.proteinOperator;
        const proteinVal = savedNumber('proteinVal', CONFIG.minProtein);
        const fatOp = savedValues?.fatOp || CONFIG.fatOperator;
        const fatVal = savedNumber('fatVal', CONFIG.maxFat);
        const carbsOp = savedValues?.carbsOp || CONFIG.carbsOperator;
        const carbsVal = savedNumber('carbsVal', CONFIG.maxCarbs);
        const caloriesOp = savedValues?.caloriesOp || CONFIG.caloriesOperator;
        const caloriesVal = savedNumber('caloriesVal', CONFIG.maxCalories);

        // Theme: load saved state
        const savedTheme = localStorage.getItem(CONFIG.themeKey); // 'light' or null (dark)
        const isLight = savedTheme === 'light';
        if (isLight) document.body.classList.add('silpo-theme-light');

        const panel = document.createElement('div');
        panel.id = 'silpo-filter-panel';
        if (isMinimized) {
            panel.classList.add('minimized');
        }

        // Helper to create an operator select element
        function createOperatorSelect(id, currentOp) {
            const select = document.createElement('select');
            select.id = id;
            ['<', '<=', '=', '>=', '>'].forEach(op => {
                const option = document.createElement('option');
                option.value = op;
                option.textContent = op;
                if (op === currentOp) option.selected = true;
                select.appendChild(option);
            });
            return select;
        }

        // Helper to create a filter row (select + number input)
        function createFilterRow(labelText, selectId, selectVal, inputId, inputVal, step) {
            const label = document.createElement('label');
            label.textContent = labelText;

            const row = document.createElement('div');
            row.className = 'filter-row';
            row.appendChild(createOperatorSelect(selectId, selectVal));

            const input = document.createElement('input');
            input.type = 'number';
            input.id = inputId;
            input.value = inputVal;
            input.min = '0';
            input.step = step;
            row.appendChild(input);

            return { label, row };
        }

        // Helper to create a checkbox wrapper
        function createCheckbox(id, labelText, checked) {
            const wrapper = document.createElement('div');
            wrapper.className = 'checkbox-wrapper';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = id;
            cb.checked = checked;
            const lbl = document.createElement('label');
            lbl.htmlFor = id;
            lbl.textContent = labelText;
            wrapper.appendChild(cb);
            wrapper.appendChild(lbl);
            return wrapper;
        }

        // Helper to create a button
        function createButton(id, text, style) {
            const btn = document.createElement('button');
            btn.id = id;
            btn.textContent = text;
            if (style) Object.assign(btn.style, style);
            return btn;
        }

        // Build header
        const h3 = document.createElement('h3');
        const titleSpan = document.createElement('span');
        titleSpan.textContent = '🔍 Фільтр БЖВК';
        const themeBtnEl = document.createElement('button');
        themeBtnEl.id = 'silpo-theme-btn';
        themeBtnEl.type = 'button';
        themeBtnEl.textContent = isLight ? '🌙' : '☀️';
        const toggleBtnEl = document.createElement('button');
        toggleBtnEl.id = 'silpo-toggle-btn';
        toggleBtnEl.type = 'button';
        toggleBtnEl.textContent = isMinimized ? '▼' : '▲';
        h3.appendChild(titleSpan);
        h3.appendChild(themeBtnEl);
        h3.appendChild(toggleBtnEl);

        // Build filter content
        const filterContent = document.createElement('div');
        filterContent.className = 'filter-content';

        const proteinRow = createFilterRow('Білки (г):', 'silpo-protein-op', proteinOp, 'silpo-protein-val', proteinVal, '0.1');
        const fatRow = createFilterRow('Жири (г):', 'silpo-fat-op', fatOp, 'silpo-fat-val', fatVal, '0.1');
        const carbsRow = createFilterRow('Вуглеводи (г):', 'silpo-carbs-op', carbsOp, 'silpo-carbs-val', carbsVal, '0.1');
        const caloriesRow = createFilterRow('Калорії (ккал):', 'silpo-calories-op', caloriesOp, 'silpo-calories-val', caloriesVal, '1');

        [proteinRow, fatRow, carbsRow, caloriesRow].forEach(({ label, row }) => {
            filterContent.appendChild(label);
            filterContent.appendChild(row);
        });

        filterContent.appendChild(createCheckbox('silpo-hide-without-nutrition', 'Ховати товари без БЖВ', hideWithoutNutrition));
        filterContent.appendChild(createCheckbox('silpo-hide-non-matching', 'Ховати товари що не підходять', hideNonMatching));
        filterContent.appendChild(createCheckbox('silpo-only-protein-more-than-fat', 'Ховати не 💪 продукти (білків > жирів)', onlyProteinMoreThanFat));
        filterContent.appendChild(createButton('silpo-filter-btn', 'Застосувати фільтр'));
        filterContent.appendChild(createButton('silpo-stop-btn', 'Зупинити пошук', { background: '#e67e22', marginTop: '5px', display: 'none' }));
        filterContent.appendChild(createButton('silpo-reset-btn', 'Очистити результати', { background: '#666', marginTop: '5px' }));
        filterContent.appendChild(createButton('silpo-clear-cache-btn', 'Очистити кеш БЖВ', { background: '#dc3545', marginTop: '5px', fontSize: '12px', padding: '6px' }));

        const statusDiv = document.createElement('div');
        statusDiv.id = 'silpo-filter-status';
        filterContent.appendChild(statusDiv);

        panel.appendChild(h3);
        panel.appendChild(filterContent);

        document.body.appendChild(panel);

        const toggleBtn = document.getElementById('silpo-toggle-btn');
        const themeBtn = document.getElementById('silpo-theme-btn');
        const filterBtn = document.getElementById('silpo-filter-btn');
        const stopBtn = document.getElementById('silpo-stop-btn');
        const resetBtn = document.getElementById('silpo-reset-btn');
        const clearCacheBtn = document.getElementById('silpo-clear-cache-btn');
        const statusEl = document.getElementById('silpo-filter-status');
        const hideCheckbox = document.getElementById('silpo-hide-without-nutrition');
        const hideNonMatchingCheckbox = document.getElementById('silpo-hide-non-matching');
        const onlyProteinMoreThanFatCheckbox = document.getElementById('silpo-only-protein-more-than-fat');

        // Dynamic visibility on checkbox change
        hideCheckbox.addEventListener('change', applyVisibility);
        hideNonMatchingCheckbox.addEventListener('change', applyVisibility);
        onlyProteinMoreThanFatCheckbox.addEventListener('change', applyVisibility);

        // Toggle minimize/expand handler
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('minimized');
            const isNowMinimized = panel.classList.contains('minimized');
            toggleBtn.textContent = isNowMinimized ? '▼' : '▲';
            localStorage.setItem(CONFIG.panelMinimizedKey, isNowMinimized);
        });

        // Clicking the header also toggles state
        panel.querySelector('h3').addEventListener('click', () => {
            toggleBtn.click();
        });

        // Theme toggle
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowLight = !document.body.classList.contains('silpo-theme-light');
            document.body.classList.toggle('silpo-theme-light', nowLight);
            themeBtn.textContent = nowLight ? '🌙' : '☀️';
            localStorage.setItem(CONFIG.themeKey, nowLight ? 'light' : 'dark');
        });

        // An empty or invalid field is null: no limit
        function readNumber(id) {
            const value = parseFloat(document.getElementById(id).value);
            return Number.isFinite(value) ? value : null;
        }

        filterBtn.addEventListener('click', async () => {
            const proteinOp = document.getElementById('silpo-protein-op').value;
            const proteinVal = readNumber('silpo-protein-val');
            const fatOp = document.getElementById('silpo-fat-op').value;
            const fatVal = readNumber('silpo-fat-val');
            const carbsOp = document.getElementById('silpo-carbs-op').value;
            const carbsVal = readNumber('silpo-carbs-val');
            const caloriesOp = document.getElementById('silpo-calories-op').value;
            const caloriesVal = readNumber('silpo-calories-val');

            // Save all filter values
            const filterValues = {
                proteinOp,
                proteinVal,
                fatOp,
                fatVal,
                carbsOp,
                carbsVal,
                caloriesOp,
                caloriesVal
            };
            appliedCriteria = filterValues;
            // Cards from an earlier Scan follow the new Criteria straight away, not only once reached
            refreshScannedCards();
            try {
                localStorage.setItem(CONFIG.filterValuesKey, JSON.stringify(filterValues));
            } catch (e) {
                console.error('Failed to save filter values:', e);
            }
            saveCheckboxFlags();

            filterBtn.disabled = true;
            resetBtn.style.display = 'none';
            stopBtn.style.display = '';

            await filterProducts(statusEl);

            filterBtn.disabled = false;
            resetBtn.style.display = '';
            stopBtn.style.display = 'none';
        });

        stopBtn.addEventListener('click', () => {
            filterCancelled = true;
            activeLoader?.cancel();
        });

        resetBtn.addEventListener('click', () => {
            scannedCards.forEach((nutrition, card) => unmarkCard(card));
            scannedCards.clear();
            statusEl.textContent = '♻️ Результати очищено';
        });

        clearCacheBtn.addEventListener('click', () => {
            if (confirm('Очистити весь кеш харчової цінності? Наступна перевірка товарів буде повільною.')) {
                localStorage.removeItem(CONFIG.cacheKey);
                cache.data = {};
                statusEl.textContent = '🗑️ Кеш очищено';
            }
        });
    }


    // === INITIALIZATION ===
    if (currentSite) {
        setTimeout(() => {
            createFilterPanel();
        }, 1000);
    } else {
        console.log('БЖВК Filter: Unsupported site');
    }
})();
