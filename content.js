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
        cacheKey: 'calories_extention_nutrition_cache_v7',
        cacheExpiry: 604800000, // 7 days
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
                const cached = localStorage.getItem(CONFIG.cacheKey);
                if (!cached) return {};
                const parsed = JSON.parse(cached);

                // Remove expired entries
                const now = Date.now();
                Object.keys(parsed).forEach(url => {
                    if (now - parsed[url].timestamp > CONFIG.cacheExpiry) {
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

        get(url) {
            return this.data[url];
        }

        set(url, protein, fat, carbs, calories) {
            this.data[url] = {
                protein,
                fat,
                carbs,
                calories,
                timestamp: Date.now()
            };
            this.save();
        }
    }

    const cache = new NutritionCache();

    let filterCancelled = false;

    // === NUTRITION FETCHING ===
    async function fetchNutritionInfo(url) {
        // Check cache
        const cached = cache.get(url);
        if (cached) {
            return {
                protein: cached.protein,
                fat: cached.fat,
                carbs: cached.carbs,
                calories: cached.calories
            };
        }

        try {
            const response = await fetch(url);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const nutrition = currentSite.parseNutrition(doc);
            if (!nutrition) return null;

            const { protein, fat, carbs, calories } = nutrition;
            cache.set(url, protein, fat, carbs, calories);
            return nutrition;
        } catch (e) {
            console.error('Failed to fetch nutrition for', url, e);
            return null;
        }
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
        div.appendChild(document.createTextNode(` ${value}${suffix}`));
        return div;
    }

    function storeCardNutrition(card, nutrition) {
        if (nutrition) {
            card.dataset.protein = nutrition.protein;
            card.dataset.fat = nutrition.fat;
            card.dataset.carbs = nutrition.carbs;
            card.dataset.calories = nutrition.calories;
        } else {
            delete card.dataset.protein;
            delete card.dataset.fat;
            delete card.dataset.carbs;
            delete card.dataset.calories;
        }
    }

    function readCardNutrition(card) {
        if (card.dataset.protein === undefined) return null;
        return {
            protein: parseFloat(card.dataset.protein),
            fat: parseFloat(card.dataset.fat),
            carbs: parseFloat(card.dataset.carbs),
            calories: parseFloat(card.dataset.calories)
        };
    }

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

        if (calories > 0) {
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
    async function filterProducts(statusEl) {
        const products = currentSite.findProducts(document);

        if (products.length === 0) {
            statusEl.textContent = '❌ Не знайдено товарів на цій сторінці';
            return;
        }

        statusEl.textContent = `🔍 Знайдено ${products.length} товарів. Починаю перевірку...`;

        filterCancelled = false;
        let processed = 0;
        let matched = 0;
        let hidden = 0;

        for (const { card, url } of products) {
            if (filterCancelled) {
                statusEl.textContent = `⛔ Зупинено. Перевірено: ${processed}, підходить: ${matched}, приховано: ${hidden}`;
                return;
            }

            processed++;
            statusEl.textContent = `⏳ Перевірка ${processed}/${products.length}... Знайдено: ${matched}`;

            // Highlight the product being checked
            card.classList.add('silpo-checking');

            const nutrition = await fetchNutritionInfo(url);

            // Remove highlight
            card.classList.remove('silpo-checking');

            // Store nutrition data on card so checkbox changes can re-evaluate it
            storeCardNutrition(card, nutrition);

            const result = evaluate(nutrition, currentCriteria());
            markCard(card, nutrition, result);

            if (result.verdict === 'match') {
                matched++;
            } else if (result.verdict === 'miss' || result.hidden) {
                hidden++;
            }

            if (!nutrition) continue;

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        statusEl.textContent = readCheckboxFlags().hideNonMatching
            ? `✅ Готово! Показано: ${matched}, приховано: ${hidden}`
            : `✅ Готово! Підходить: ${matched}, не підходить: ${hidden}`;
    }

    // === DYNAMIC VISIBILITY ===
    function applyVisibility() {
        // Re-evaluate every scanned card against the applied Criteria and the new checkbox flags
        if (appliedCriteria) {
            const criteria = currentCriteria();
            document.querySelectorAll('[data-protein], .silpo-card-yellow').forEach(card => {
                const nutrition = readCardNutrition(card);
                markCard(card, nutrition, evaluate(nutrition, criteria));
            });
        }

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
            try {
                localStorage.setItem(CONFIG.filterValuesKey, JSON.stringify(filterValues));
            } catch (e) {
                console.error('Failed to save filter values:', e);
            }
            saveCheckboxFlags();

            filterBtn.disabled = true;
            resetBtn.disabled = true;
            stopBtn.style.display = '';

            await filterProducts(statusEl);

            filterBtn.disabled = false;
            resetBtn.disabled = false;
            stopBtn.style.display = 'none';
        });

        stopBtn.addEventListener('click', () => {
            filterCancelled = true;
        });

        resetBtn.addEventListener('click', () => {
            document.querySelectorAll('[data-protein], .silpo-card-yellow, .silpo-hidden').forEach(card => {
                unmarkCard(card);
                storeCardNutrition(card, null);
            });
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
