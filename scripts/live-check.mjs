#!/usr/bin/env node
// Live check against the real stores, driven through Orca's browser (`orca` CLI):
// for each store it opens the home page, injects the extension as checked out here, runs a fresh
// Scan, then opens a sample of products as ordinary pages and compares the values shown there with
// the ones the extension read. Writes a Markdown report and exits 1 if anything looks wrong.
//
//   node scripts/live-check.mjs [--out <dir>] [--sample <n>] [--site silpo|foodboom]
//
// The page's own filter settings are put back afterwards; the nutrition cache is emptied first so
// every product is really loaded. It never works around a bot check: a blocked Scan is reported.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SITES = [
    { name: 'silpo', url: 'https://silpo.ua/' },
    { name: 'foodboom', url: 'https://foodboom.ua/' },
];

const SCAN_TIMEOUT = 20 * 60 * 1000;
const DONE_STATUS = /^(✅|⛔|❌|🛑|📡|⚠️)/;

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT_DIR = path.resolve(option('--out', path.join(ROOT, 'live-check-results')));
const SAMPLE = Number(option('--sample', 6));
const ONLY = option('--site', null);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function orca(...cliArgs) {
    let out;
    try {
        out = execFileSync('orca', [...cliArgs, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
        // A failed command still prints its JSON error; without one, keep the first line only
        out = e.stdout;
        if (!out) throw new Error(`orca ${cliArgs[0]} failed: ${String(e.stderr || e.message).split('\n')[0]}`);
    }
    const reply = JSON.parse(out);
    if (reply.ok === false) throw new Error(`orca ${cliArgs[0]}: ${reply.error?.message || out}`);
    return reply.result;
}

// Runs `expression` in the page; a returned value must be JSON-serialisable
function evaluate(page, expression) {
    const result = orca('eval', '--page', page, '--expression', `Promise.resolve(${expression}).then(v => JSON.stringify(v ?? null))`);
    return JSON.parse(result.result);
}

function openTab(url) {
    const page = orca('tab', 'create', '--url', url).browserPageId;
    try { orca('wait', '--page', page, '--timeout', '30000'); } catch (e) { /* slow page: the checks below report it */ }
    return page;
}

function closeTab(page) {
    try { orca('tab', 'close', '--page', page); } catch (e) { /* already gone */ }
}

// The content scripts in manifest order, plus the stylesheet, as one script to inject
function extensionBundle() {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const { js, css } = manifest.content_scripts[0];
    const styles = css.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
    return `document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(styles)} }));\n` +
        js.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n');
}

// Empties the nutrition cache and sets the panel's settings aside (so defaults apply and nothing is
// hidden); returns what was set aside
const PREPARE = `(() => {
    const saved = {};
    for (const key of Object.keys(localStorage)) {
        if (!key.startsWith('calories_extention_')) continue;
        if (!key.startsWith('calories_extention_nutrition_cache')) saved[key] = localStorage.getItem(key);
        localStorage.removeItem(key);
    }
    return saved;
})()`;

const restore = saved => `(() => {
    const saved = ${JSON.stringify(saved)};
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith('calories_extention_') && !key.startsWith('calories_extention_nutrition_cache')) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
    return true;
})()`;

// Tags the cards the Scan is about to check, since the page may load more while it runs
const TAG_CARDS = `(() => {
    const site = Object.values(BZVK.sites).find(s => location.hostname.endsWith(s.hostname));
    const products = site.findProducts(document);
    products.forEach(({ card }) => { card.dataset.liveCheck = '1'; });
    return products.length;
})()`;

// Every product card the Scan checked: its link, title, verdict, badge and the Nutrition the
// extension stored for it
const COLLECT = `(() => {
    const site = Object.values(BZVK.sites).find(s => location.hostname.endsWith(s.hostname));
    const cache = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('calories_extention_nutrition_cache')) || '{}') || '{}');
    const products = site.findProducts(document).filter(({ card }) => card.dataset.liveCheck).map(({ card, url }) => {
        const verdict = ['green', 'red', 'yellow'].find(c => card.classList.contains('silpo-card-' + c)) || null;
        const entry = cache[url];
        const nutrition = entry && !entry.noData ? { protein: entry.protein, fat: entry.fat, carbs: entry.carbs, calories: entry.calories } : null;
        // The name from the product's own link, so it can't come from another element in the card
        const links = [...card.querySelectorAll('a[href]')].filter(a => a.href === url);
        const named = links.find(a => a.textContent.trim()) || links.find(a => a.querySelector('img[alt]'));
        const title = (named?.textContent.trim() || named?.querySelector('img[alt]')?.alt || '').replace(/\\s+/g, ' ');
        return { url, title, verdict, badge: card.querySelector('.silpo-nutrition-info')?.textContent.trim() || null, nutrition, cached: !!entry };
    });
    return {
        status: document.getElementById('silpo-filter-status').textContent,
        products,
        framesLeft: document.querySelectorAll('iframe[sandbox]').length
    };
})()`;

// Reads the four values from a product page as a shopper sees it (its visible text), without the
// extension's parsers. Calories come back as every number after the label (kcal/kJ order varies).
const READ_PAGE = `(async () => {
    for (let i = 0; i < 20 && !/Білки|Харчова|характеристики/i.test(document.body.innerText); i++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, 1000));
    const text = document.body.innerText;
    const start = Math.max(0, text.search(/Харчова цінність|Ключові характеристики|Характеристики/i));
    const part = text.slice(start);
    const num = s => s === undefined ? null : parseFloat(s.replace(',', '.'));
    const value = label => num((part.match(new RegExp(label + '[^\\\\d\\\\n]{0,20}\\\\n?[^\\\\d\\\\n]{0,10}(\\\\d+(?:[.,]\\\\d+)?)', 'i')) || [])[1]);
    const kcal = part.match(/(?:Енергетична цінність|Калорійність)[^\\d]{0,40}(\\d+(?:[.,]\\d+)?)(?:\\s*\\/\\s*(\\d+(?:[.,]\\d+)?))?/i);
    return {
        title: document.title.replace(/\\s+/g, ' ').slice(0, 80),
        protein: value('Білки'), fat: value('Жири'), carbs: value('Вуглеводи'),
        calories: kcal ? [num(kcal[1]), num(kcal[2])].filter(v => v !== null) : []
    };
})()`;

const same = (a, b) => a === b || (a !== null && b !== null && Math.abs(a - b) < 0.051);

// Does what the page shows agree with what the extension read?
function compare(nutrition, shown) {
    const problems = [];
    const ext = nutrition || { protein: null, fat: null, carbs: null, calories: null };
    for (const key of ['protein', 'fat', 'carbs']) {
        if (!same(ext[key], shown[key])) problems.push(`${key}: extension ${ext[key]}, page ${shown[key]}`);
    }
    const kcalOk = ext.calories === null ? shown.calories.length === 0 : shown.calories.some(v => same(v, ext.calories));
    if (!kcalOk) problems.push(`calories: extension ${ext.calories}, page ${shown.calories.join('/') || 'none'}`);
    return problems;
}

function pickSample(products) {
    const withData = products.filter(p => p.nutrition);
    const noData = products.filter(p => p.verdict === 'yellow');
    const shuffle = list => list.map(p => [Math.random(), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
    const noDataCount = Math.min(2, noData.length);
    return [...shuffle(withData).slice(0, SAMPLE - noDataCount), ...shuffle(noData).slice(0, noDataCount)];
}

async function checkSite(site, bundle) {
    const report = { ...site, problems: [], warnings: [], sample: [] };
    const page = openTab(site.url);
    let saved = null;
    try {
        saved = evaluate(page, PREPARE);
        evaluate(page, `(() => { ${bundle}\n; return true; })()`);
        await sleep(1500);
        report.found = evaluate(page, TAG_CARDS);
        if (!report.found) {
            report.problems.push('no products found on the page');
            return report;
        }

        const started = Date.now();
        evaluate(page, `(document.getElementById('silpo-filter-btn').click(), true)`);
        let status = '';
        while (Date.now() - started < SCAN_TIMEOUT) {
            await sleep(3000);
            status = evaluate(page, `document.getElementById('silpo-filter-status').textContent`);
            if (DONE_STATUS.test(status)) break;
        }
        report.seconds = Math.round((Date.now() - started) / 1000);

        const result = evaluate(page, COLLECT);
        Object.assign(report, result);
        const count = verdict => result.products.filter(p => p.verdict === verdict).length;
        report.counts = { match: count('green'), miss: count('red'), noData: count('yellow'), unmarked: count(null) };

        if (!result.status.startsWith('✅')) report.problems.push(`the Scan did not finish: "${result.status}"`);
        if (result.framesLeft) report.problems.push(`${result.framesLeft} hidden frame(s) left on the page`);
        if (report.counts.unmarked) {
            const urls = result.products.filter(p => !p.verdict).map(p => p.url);
            const message = `${urls.length} product(s) failed to load: ${urls.slice(0, 5).join(', ')}${urls.length > 5 ? ', …' : ''}`;
            // One or two can be the store's own broken links; more means loading itself is failing
            if (urls.length <= Math.max(2, report.found * 0.05)) report.warnings.push(message);
            else report.problems.push(message);
        }
        // Home pages mix in non-food, so plenty of "no data" is normal; nearly all of it means the parser broke
        if (report.counts.noData > report.found * 0.8) report.problems.push(`over 80% of the products have no data (${report.counts.noData}/${report.found})`);
        for (const p of result.products.filter(p => p.nutrition && p.badge && /NaN|undefined/.test(p.badge))) {
            report.problems.push(`broken badge "${p.badge}" on ${p.url}`);
        }
    } finally {
        if (saved) { try { evaluate(page, restore(saved)); } catch (e) { report.problems.push('could not restore the panel settings'); } }
        closeTab(page);
    }

    for (const product of pickSample(report.products)) {
        const productPage = openTab(product.url);
        try {
            let shown;
            try { shown = evaluate(productPage, READ_PAGE); } catch (e) { await sleep(2000); shown = evaluate(productPage, READ_PAGE); }
            const problems = compare(product.nutrition, shown);
            report.sample.push({ product, shown, problems });
            problems.forEach(problem => report.problems.push(`${product.url}: ${problem}`));
        } catch (e) {
            const problem = `could not read the page: ${e.message.split('\n')[0].slice(0, 120)}`;
            report.sample.push({ product, shown: null, problems: [problem] });
            report.problems.push(`${product.url}: ${problem}`);
        } finally {
            closeTab(productPage);
        }
    }
    return report;
}

const show = n => n === null || n === undefined ? '—' : String(n);
const values = n => n ? `Б ${show(n.protein)} · Ж ${show(n.fat)} · В ${show(n.carbs)} · ${show(n.calories)} kcal` : 'no data';

function markdown(reports, meta) {
    const ok = reports.every(r => r.problems.length === 0);
    const lines = [
        `# Live check ${meta.when}: ${ok ? 'PASS' : 'FAIL'}`,
        '',
        `Code: \`${meta.commit}\` (${meta.branch}). Sample size: ${SAMPLE} products per store.`,
        '',
    ];
    for (const r of reports) {
        lines.push(`## ${r.name}: ${r.problems.length ? `${r.problems.length} problem(s)` : 'OK'}`, '');
        lines.push(`- Page: ${r.url}`);
        lines.push(`- Products found: ${r.found ?? 0}`);
        if (r.status) {
            lines.push(`- Scan: ${r.status} (${r.seconds} s)`);
            lines.push(`- Cards: ${r.counts.match} match, ${r.counts.miss} miss, ${r.counts.noData} no data, ${r.counts.unmarked} unmarked`);
        }
        if (r.sample.length) {
            lines.push('', '| Product | Extension | Page shows | Result |', '|---|---|---|---|');
            for (const { product, shown, problems } of r.sample) {
                const page = shown ? `Б ${show(shown.protein)} · Ж ${show(shown.fat)} · В ${show(shown.carbs)} · ${shown.calories.join('/') || '—'} kcal` : '—';
                const name = (product.title || product.url).slice(0, 60).replace(/\|/g, '/');
                lines.push(`| [${name}](${product.url}) | ${values(product.nutrition)} | ${page} | ${problems.length ? '❌ ' + problems.join('; ') : '✅'} |`);
            }
        }
        if (r.problems.length) lines.push('', '**Problems**', '', ...r.problems.map(p => `- ${p}`));
        if (r.warnings?.length) lines.push('', '**Warnings** (don\'t fail the check)', '', ...r.warnings.map(w => `- ${w}`));
        lines.push('');
    }
    return { ok, text: lines.join('\n') };
}

const git = (...gitArgs) => { try { return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { return '?'; } };

const now = new Date();
const meta = {
    when: now.toISOString().slice(0, 16).replace('T', ' '),
    commit: git('rev-parse', '--short', 'HEAD'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
};
const bundle = extensionBundle();
const reports = [];
for (const site of SITES.filter(s => !ONLY || s.name === ONLY)) {
    try {
        reports.push(await checkSite(site, bundle));
    } catch (e) {
        reports.push({ ...site, problems: [`the check crashed: ${e.message}`], sample: [] });
    }
}

const { ok, text } = markdown(reports, meta);
fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, `${now.toISOString().slice(0, 16).replace(/[T:]/g, '-')}${ONLY ? '-' + ONLY : ''}.md`);
fs.writeFileSync(file, text);
console.log(text);
console.log(`\nReport: ${file}`);
process.exit(ok ? 0 : 1);
