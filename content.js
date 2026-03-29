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

    // === NUTRITION PARSERS ===

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

    function parseFoodBoomNutrition(doc) {
        const container = doc.querySelector('.product_description_text');
        const text = container?.textContent || doc.body?.textContent || '';

        const proteinMatch = text.match(/білки\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const fatMatch     = text.match(/жири\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const carbsMatch   = text.match(/вуглеводи\s*[-–—]\s*(\d+[.,]?\d*)\s*г/i);
        const calMatch     = text.match(/(\d{2,}[.,]?\d*)\s*ккал/i);

        const parse = (m) => m ? parseFloat(m[1].replace(',', '.')) : null;
        const protein  = parse(proteinMatch);
        const fat      = parse(fatMatch);
        const carbs    = parse(carbsMatch);
        const calories = parse(calMatch);

        if (protein === null || fat === null || carbs === null) return null;
        return { protein, fat, carbs, calories: calories ?? 0 };
    }

    // === SITE CONFIG ===
    const SITE_CONFIG = {
        silpo: {
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
        },
        foodboom: {
            hostname: 'foodboom.ua',
            productCardSelectors: [
                '.card-item--float'
            ],
            productLinkPattern: /^https:\/\/foodboom\.ua\/[^/]+\/$/,
            getProductLink: (card) => card.querySelector('.card-item__name a')?.href,
            parseNutrition: parseFoodBoomNutrition
        }
    };

    function detectSite() {
        const hostname = window.location.hostname;
        for (const site of Object.values(SITE_CONFIG)) {
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

    // === PRODUCT FILTERING ===
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

    async function filterProducts(proteinOp, proteinVal, fatOp, fatVal, carbsOp, carbsVal, caloriesOp, caloriesVal, hideWithoutNutrition, hideNonMatching, onlyProteinMoreThanFat, statusEl) {
        let productCards = [];
        for (const selector of currentSite.productCardSelectors) {
            productCards = document.querySelectorAll(selector);
            if (productCards.length > 0) break;
        }

        // Count only cards that have a valid product link
        const validCards = Array.from(productCards).filter(card => {
            const link = currentSite.getProductLink(card);
            return link && currentSite.productLinkPattern.test(link);
        });

        if (validCards.length === 0) {
            statusEl.textContent = '❌ Не знайдено товарів на цій сторінці';
            return;
        }

        statusEl.textContent = `🔍 Знайдено ${validCards.length} товарів. Починаю перевірку...`;

        filterCancelled = false;
        let processed = 0;
        let matched = 0;
        let hidden = 0;

        function createNutritionLabel(prefix, value, suffix) {
            const div = document.createElement('div');
            div.className = 'silpo-nutrition-label';
            const strong = document.createElement('strong');
            strong.textContent = prefix;
            div.appendChild(strong);
            div.appendChild(document.createTextNode(` ${value}${suffix}`));
            return div;
        }

        for (const card of validCards) {
            if (filterCancelled) {
                statusEl.textContent = `⛔ Зупинено. Перевірено: ${processed}, підходить: ${matched}, приховано: ${hidden}`;
                return;
            }

            const productLink = currentSite.getProductLink(card);

            processed++;
            statusEl.textContent = `⏳ Перевірка ${processed}/${validCards.length}... Знайдено: ${matched}`;

            // Highlight the product being checked
            card.classList.add('silpo-checking');

            const nutrition = await fetchNutritionInfo(productLink);

            // Remove highlight
            card.classList.remove('silpo-checking');

            // Remove previous nutrition info if present
            const existingInfo = card.querySelector('.silpo-nutrition-info');
            if (existingInfo) {
                existingInfo.remove();
            }

            if (!nutrition) {
                if (hideWithoutNutrition) {
                    hidden++;
                    card.classList.add('silpo-hidden');
                } else {
                    card.classList.add('silpo-card-yellow');
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'silpo-nutrition-info silpo-badge-yellow';
                    infoDiv.textContent = '⚠️ Немає даних про БЖВ';
                    card.appendChild(infoDiv);
                }
                continue;
            }

            const { protein, fat, carbs, calories } = nutrition;

            // Store nutrition data on card for dynamic filtering
            card.dataset.protein = protein;
            card.dataset.fat = fat;
            card.dataset.carbs = carbs;
            card.dataset.calories = calories;

            // Check all filter conditions
            const proteinMatch = compareValue(protein, proteinOp, proteinVal);
            const fatMatch = compareValue(fat, fatOp, fatVal);
            const carbsMatch = compareValue(carbs, carbsOp, carbsVal);
            const caloriesMatch = calories > 0 ? compareValue(calories, caloriesOp, caloriesVal) : true;
            const proteinMoreThanFat = protein > fat;
            const muscleMatch = onlyProteinMoreThanFat ? proteinMoreThanFat : true;
            const isMatch = proteinMatch && fatMatch && carbsMatch && caloriesMatch && muscleMatch;

            // Add nutrition info badge below the product
            const infoDiv = document.createElement('div');
            infoDiv.className = 'silpo-nutrition-info';

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
            if (proteinMoreThanFat) {
                const muscleDiv = document.createElement('div');
                muscleDiv.className = 'silpo-nutrition-label';
                muscleDiv.textContent = '💪';
                muscleDiv.title = 'Білків більше ніж жирів';
                infoDiv.appendChild(muscleDiv);
            }

            // Hide if muscle filter is on and protein <= fat
            const hideByMuscle = onlyProteinMoreThanFat && !proteinMoreThanFat;

            if (isMatch) {
                matched++;
                card.classList.remove('silpo-hidden');
                card.classList.add('silpo-card-green');
                infoDiv.classList.add('silpo-badge-green');
            } else {
                hidden++;
                card.classList.add('silpo-card-red');
                infoDiv.classList.add('silpo-badge-red');
                if (hideNonMatching || hideByMuscle) {
                    card.classList.add('silpo-hidden');
                } else {
                    card.classList.remove('silpo-hidden');
                }
            }
            // Always append the badge
            card.appendChild(infoDiv);

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        statusEl.textContent = hideNonMatching
            ? `✅ Готово! Показано: ${matched}, приховано: ${hidden}`
            : `✅ Готово! Підходить: ${matched}, не підходить: ${hidden}`;
    }

    // === DYNAMIC VISIBILITY ===
    function applyVisibility() {
        const hideWithoutNutrition = document.getElementById('silpo-hide-without-nutrition')?.checked;
        const hideNonMatching = document.getElementById('silpo-hide-non-matching')?.checked;
        const onlyProteinMoreThanFat = document.getElementById('silpo-only-protein-more-than-fat')?.checked;

        const proteinOp = document.getElementById('silpo-protein-op')?.value || '>=';
        const proteinVal = parseFloat(document.getElementById('silpo-protein-val')?.value) || 0;
        const fatOp = document.getElementById('silpo-fat-op')?.value || '<=';
        const fatVal = parseFloat(document.getElementById('silpo-fat-val')?.value) || 0;
        const carbsOp = document.getElementById('silpo-carbs-op')?.value || '<=';
        const carbsVal = parseFloat(document.getElementById('silpo-carbs-val')?.value) || 0;
        const caloriesOp = document.getElementById('silpo-calories-op')?.value || '<=';
        const caloriesVal = parseFloat(document.getElementById('silpo-calories-val')?.value) || 0;

        // Find all cards with nutrition data
        const cardsWithData = document.querySelectorAll('[data-protein]');
        // Find cards without nutrition (yellow badge)
        const cardsWithoutData = document.querySelectorAll('.silpo-card-yellow');

        // Handle cards without nutrition data
        cardsWithoutData.forEach(card => {
            if (hideWithoutNutrition) {
                card.classList.add('silpo-hidden');
            } else {
                card.classList.remove('silpo-hidden');
            }
        });

        // Handle cards with nutrition data
        cardsWithData.forEach(card => {
            const protein = parseFloat(card.dataset.protein);
            const fat = parseFloat(card.dataset.fat);
            const carbs = parseFloat(card.dataset.carbs);
            const calories = parseFloat(card.dataset.calories);

            const proteinMatch = compareValue(protein, proteinOp, proteinVal);
            const fatMatch = compareValue(fat, fatOp, fatVal);
            const carbsMatch = compareValue(carbs, carbsOp, carbsVal);
            const caloriesMatch = calories > 0 ? compareValue(calories, caloriesOp, caloriesVal) : true;
            const proteinMoreThanFat = protein > fat;
            const muscleMatch = onlyProteinMoreThanFat ? proteinMoreThanFat : true;
            const isMatch = proteinMatch && fatMatch && carbsMatch && caloriesMatch && muscleMatch;

            const hideByMuscle = onlyProteinMoreThanFat && !proteinMoreThanFat;

            if (isMatch) {
                card.classList.remove('silpo-hidden');
            } else if (hideNonMatching || hideByMuscle) {
                card.classList.add('silpo-hidden');
            } else {
                card.classList.remove('silpo-hidden');
            }
        });

        // Save checkbox states
        try {
            localStorage.setItem(CONFIG.hideWithoutNutritionKey, hideWithoutNutrition);
            localStorage.setItem(CONFIG.hideNonMatchingKey, hideNonMatching);
            localStorage.setItem(CONFIG.onlyProteinMoreThanFatKey, onlyProteinMoreThanFat);
        } catch (e) {
            console.error('Failed to save checkbox states:', e);
        }
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

        // Use saved values or defaults from CONFIG
        const proteinOp = savedValues?.proteinOp || CONFIG.proteinOperator;
        const proteinVal = savedValues?.proteinVal ?? CONFIG.minProtein;
        const fatOp = savedValues?.fatOp || CONFIG.fatOperator;
        const fatVal = savedValues?.fatVal ?? CONFIG.maxFat;
        const carbsOp = savedValues?.carbsOp || CONFIG.carbsOperator;
        const carbsVal = savedValues?.carbsVal ?? CONFIG.maxCarbs;
        const caloriesOp = savedValues?.caloriesOp || CONFIG.caloriesOperator;
        const caloriesVal = savedValues?.caloriesVal ?? CONFIG.maxCalories;

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

        filterBtn.addEventListener('click', async () => {
            const proteinOp = document.getElementById('silpo-protein-op').value;
            const proteinVal = parseFloat(document.getElementById('silpo-protein-val').value);
            const fatOp = document.getElementById('silpo-fat-op').value;
            const fatVal = parseFloat(document.getElementById('silpo-fat-val').value);
            const carbsOp = document.getElementById('silpo-carbs-op').value;
            const carbsVal = parseFloat(document.getElementById('silpo-carbs-val').value);
            const caloriesOp = document.getElementById('silpo-calories-op').value;
            const caloriesVal = parseFloat(document.getElementById('silpo-calories-val').value);
            const hideWithoutNutrition = hideCheckbox.checked;
            const hideNonMatching = hideNonMatchingCheckbox.checked;
            const onlyProteinMoreThanFat = onlyProteinMoreThanFatCheckbox.checked;

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
            try {
                localStorage.setItem(CONFIG.filterValuesKey, JSON.stringify(filterValues));
                localStorage.setItem(CONFIG.hideWithoutNutritionKey, hideWithoutNutrition);
                localStorage.setItem(CONFIG.hideNonMatchingKey, hideNonMatching);
                localStorage.setItem(CONFIG.onlyProteinMoreThanFatKey, onlyProteinMoreThanFat);
            } catch (e) {
                console.error('Failed to save filter values:', e);
            }

            filterBtn.disabled = true;
            resetBtn.disabled = true;
            stopBtn.style.display = '';

            await filterProducts(proteinOp, proteinVal, fatOp, fatVal, carbsOp, carbsVal, caloriesOp, caloriesVal, hideWithoutNutrition, hideNonMatching, onlyProteinMoreThanFat, statusEl);

            filterBtn.disabled = false;
            resetBtn.disabled = false;
            stopBtn.style.display = 'none';
        });

        stopBtn.addEventListener('click', () => {
            filterCancelled = true;
        });

        resetBtn.addEventListener('click', () => {
            document.querySelectorAll('.silpo-hidden').forEach(el => {
                el.classList.remove('silpo-hidden');
            });
            document.querySelectorAll('.silpo-nutrition-info').forEach(el => {
                el.remove();
            });
            document.querySelectorAll('.silpo-card-green, .silpo-card-red, .silpo-card-yellow').forEach(el => {
                el.classList.remove('silpo-card-green', 'silpo-card-red', 'silpo-card-yellow');
            });
            document.querySelectorAll('[data-protein]').forEach(el => {
                delete el.dataset.protein;
                delete el.dataset.fat;
                delete el.dataset.carbs;
                delete el.dataset.calories;
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
