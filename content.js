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
        panelMinimizedKey: 'calories_extention_panel_minimized',
        filterValuesKey: 'calories_extention_filter_values',
        themeKey: 'calories_extention_theme'
    };
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

    // === NUTRITION PARSING ===
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

            // If not found — return null
            if (protein === null || fat === null || carbs === null) {
                return null;
            }

            // Calories are optional — default to 0 if not found
            if (calories === null) {
                calories = 0;
            }

            // Save to cache
            cache.set(url, protein, fat, carbs, calories);

            return { protein, fat, carbs, calories };
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

    async function filterProducts(proteinOp, proteinVal, fatOp, fatVal, carbsOp, carbsVal, caloriesOp, caloriesVal, hideWithoutNutrition, hideNonMatching, statusEl) {
        // Find all product cards (multiple selectors for different page layouts)
        const possibleSelectors = [
            'article[class*="product"]',
            'div[class*="product-card"]',
            'a[href*="/product/"]',
            '[data-testid*="product"]'
        ];

        let productCards = [];
        for (const selector of possibleSelectors) {
            productCards = document.querySelectorAll(selector);
            if (productCards.length > 0) break;
        }

        if (productCards.length === 0) {
            statusEl.textContent = '❌ Не знайдено товарів на цій сторінці';
            return;
        }

        statusEl.textContent = `🔍 Знайдено ${productCards.length} товарів. Починаю перевірку...`;

        filterCancelled = false;
        let processed = 0;
        let matched = 0;
        let hidden = 0;

        for (const card of productCards) {
            if (filterCancelled) {
                statusEl.textContent = `⛔ Зупинено. Перевірено: ${processed}, підходить: ${matched}, приховано: ${hidden}`;
                return;
            }
            // Find product link
            let productLink = card.href || card.querySelector('a')?.href;

            if (!productLink || !productLink.includes('/product/')) {
                continue;
            }

            processed++;
            statusEl.textContent = `⏳ Перевірка ${processed}/${productCards.length}... Знайдено: ${matched}`;

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

            // Check all filter conditions
            const proteinMatch = compareValue(protein, proteinOp, proteinVal);
            const fatMatch = compareValue(fat, fatOp, fatVal);
            const carbsMatch = compareValue(carbs, carbsOp, carbsVal);
            const caloriesMatch = calories > 0 ? compareValue(calories, caloriesOp, caloriesVal) : true;
            const isMatch = proteinMatch && fatMatch && carbsMatch && caloriesMatch;

            // Add nutrition info badge below the product
            const infoDiv = document.createElement('div');
            infoDiv.className = 'silpo-nutrition-info';

            function createNutritionLabel(prefix, value, suffix) {
                const div = document.createElement('div');
                div.className = 'silpo-nutrition-label';
                const strong = document.createElement('strong');
                strong.textContent = prefix;
                div.appendChild(strong);
                div.appendChild(document.createTextNode(` ${value}${suffix}`));
                return div;
            }

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

            if (isMatch) {
                matched++;
                card.classList.remove('silpo-hidden');
                card.classList.add('silpo-card-green');
                infoDiv.classList.add('silpo-badge-green');
                card.appendChild(infoDiv);
            } else {
                hidden++;
                if (hideNonMatching) {
                    card.classList.add('silpo-hidden');
                } else {
                    card.classList.remove('silpo-hidden');
                    card.classList.add('silpo-card-red');
                    infoDiv.classList.add('silpo-badge-red');
                    card.appendChild(infoDiv);
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        statusEl.textContent = hideNonMatching
            ? `✅ Готово! Показано: ${matched}, приховано: ${hidden}`
            : `✅ Готово! Підходить: ${matched}, не підходить: ${hidden}`;
    }

    // === UI PANEL ===
    function createFilterPanel() {
        // Load saved checkbox and panel state
        const hideWithoutNutrition = localStorage.getItem(CONFIG.hideWithoutNutritionKey) === 'true';
        const hideNonMatching = localStorage.getItem(CONFIG.hideNonMatchingKey) !== 'false'; // default ON
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

        panel.innerHTML = `
            <h3>
                <span>🔍 Фільтр БЖВК</span>
                <button id="silpo-theme-btn" type="button">${isLight ? '🌙' : '☀️'}</button>
                <button id="silpo-toggle-btn" type="button">${isMinimized ? '▼' : '▲'}</button>
            </h3>
            <div class="filter-content">
                <label>Білки (г):</label>
                <div class="filter-row">
                    <select id="silpo-protein-op">
                        <option value="<" ${proteinOp === '<' ? 'selected' : ''}>&lt;</option>
                        <option value="<=" ${proteinOp === '<=' ? 'selected' : ''}>&lt;=</option>
                        <option value="=" ${proteinOp === '=' ? 'selected' : ''}>=</option>
                        <option value=">=" ${proteinOp === '>=' ? 'selected' : ''}>&gt;=</option>
                        <option value=">" ${proteinOp === '>' ? 'selected' : ''}>&gt;</option>
                    </select>
                    <input type="number" id="silpo-protein-val" value="${proteinVal}" min="0" step="0.1">
                </div>
                
                <label>Жири (г):</label>
                <div class="filter-row">
                    <select id="silpo-fat-op">
                        <option value="<" ${fatOp === '<' ? 'selected' : ''}>&lt;</option>
                        <option value="<=" ${fatOp === '<=' ? 'selected' : ''}>&lt;=</option>
                        <option value="=" ${fatOp === '=' ? 'selected' : ''}>=</option>
                        <option value=">=" ${fatOp === '>=' ? 'selected' : ''}>&gt;=</option>
                        <option value=">" ${fatOp === '>' ? 'selected' : ''}>&gt;</option>
                    </select>
                    <input type="number" id="silpo-fat-val" value="${fatVal}" min="0" step="0.1">
                </div>
                
                <label>Вуглеводи (г):</label>
                <div class="filter-row">
                    <select id="silpo-carbs-op">
                        <option value="<" ${carbsOp === '<' ? 'selected' : ''}>&lt;</option>
                        <option value="<=" ${carbsOp === '<=' ? 'selected' : ''}>&lt;=</option>
                        <option value="=" ${carbsOp === '=' ? 'selected' : ''}>=</option>
                        <option value=">=" ${carbsOp === '>=' ? 'selected' : ''}>&gt;=</option>
                        <option value=">" ${carbsOp === '>' ? 'selected' : ''}>&gt;</option>
                    </select>
                    <input type="number" id="silpo-carbs-val" value="${carbsVal}" min="0" step="0.1">
                </div>
                
                <label>Калорії (ккал):</label>
                <div class="filter-row">
                    <select id="silpo-calories-op">
                        <option value="<" ${caloriesOp === '<' ? 'selected' : ''}>&lt;</option>
                        <option value="<=" ${caloriesOp === '<=' ? 'selected' : ''}>&lt;=</option>
                        <option value="=" ${caloriesOp === '=' ? 'selected' : ''}>=</option>
                        <option value=">=" ${caloriesOp === '>=' ? 'selected' : ''}>&gt;=</option>
                        <option value=">" ${caloriesOp === '>' ? 'selected' : ''}>&gt;</option>
                    </select>
                    <input type="number" id="silpo-calories-val" value="${caloriesVal}" min="0" step="1">
                </div>
                
                <div class="checkbox-wrapper">
                    <input type="checkbox" id="silpo-hide-without-nutrition" ${hideWithoutNutrition ? 'checked' : ''}>
                    <label for="silpo-hide-without-nutrition">Ховати товари без БЖВ</label>
                </div>
                
                <div class="checkbox-wrapper">
                    <input type="checkbox" id="silpo-hide-non-matching" ${hideNonMatching ? 'checked' : ''}>
                    <label for="silpo-hide-non-matching">Ховати товари що не підходять</label>
                </div>
                
                <button id="silpo-filter-btn">Застосувати фільтр</button>
                <button id="silpo-stop-btn" style="background: #e67e22; margin-top: 5px; display: none;">Зупинити фільтрацію</button>
                <button id="silpo-reset-btn" style="background: #666; margin-top: 5px;">Скинути фільтр</button>
                <button id="silpo-clear-cache-btn" style="background: #dc3545; margin-top: 5px; font-size: 12px; padding: 6px;">Очистити кеш БЖВ</button>
                
                <div id="silpo-filter-status"></div>
            </div>
        `;

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
            } catch (e) {
                console.error('Failed to save filter values:', e);
            }

            filterBtn.disabled = true;
            resetBtn.disabled = true;
            stopBtn.style.display = '';

            await filterProducts(proteinOp, proteinVal, fatOp, fatVal, carbsOp, carbsVal, caloriesOp, caloriesVal, hideWithoutNutrition, hideNonMatching, statusEl);

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
            statusEl.textContent = '♻️ Фільтр скинуто';
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
    setTimeout(() => {
        createFilterPanel();
    }, 1000);
})();
