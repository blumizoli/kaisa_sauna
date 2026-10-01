// Szenzor-összesítő: a szaunanaplóban (data/alkalmak.csv) szereplő napokhoz kiszámolja a
// begyújtás időpontját, a felfűtési időt (20 → 60 °C), a max hőfokot és az üzemidőt (60 °C fölött),
// és hozzáfűzi a data/szenzor.csv-hez. A már meglévő napokat nem kéri le újra.
// Futtatás: GitHub Actions (.github/workflows/szenzor.yml), vagy kézzel: node scripts/szenzor.mjs
import fs from 'node:fs';

const CHAN_ID = process.env.CHAN_ID || '3213557';
const API_KEY = process.env.THINGSPEAK_API_KEY || '';
const SENSOR_START = process.env.SENSOR_START || '2025-12-01';   // a hőmérő bekötése
const TZ = 'Europe/Budapest';
const ALK = 'data/alkalmak.csv', OUT = 'data/szenzor.csv';
const HEADER = 'datum,begyujtas,felfutes_perc,max_c,uzemido_perc';
const WINDOW_H = 30;   // a nap 00:00-tól másnap 06:00-ig (éjfélen átnyúló szaunázás miatt)

// --- Időzóna: a GitHub-gép UTC-ben fut, a napok magyar idő szerint értendők ---
const fmtParts = ms => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
}).formatToParts(ms).map(p => [p.type, p.value]));
const tzOffset = ms => { const p = fmtParts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms; };
function localMidnight(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, d);
    return guess - tzOffset(guess - tzOffset(guess));
}
const fmtLocal = ms => { const p = fmtParts(ms); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };

// --- Ugyanaz az elemzés, mint a dashboardon ---
function analyzeDay(pts) {
    if (pts.length < 5) return null;
    let iMax = 0;
    pts.forEach((p, i) => { if (p.y > pts[iMax].y) iMax = i; });
    const i60 = pts.findIndex(p => p.y >= 60);
    let start = null, heat = null;
    let k = i60 >= 0 ? i60 : iMax;
    while (k > 0 && pts[k - 1].y >= 20) k--;       // begyújtás: a csúcs előtti utolsó 20 °C alatti mérés utáni pont
    if (k > 0) start = pts[k].x;
    if (i60 >= 0 && start !== null) heat = (pts[i60].x - start) / 60000;
    let hot = 0;
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].y >= 60 && pts[i - 1].y >= 60 && pts[i].x - pts[i - 1].x <= 5 * 60000) hot += pts[i].x - pts[i - 1].x;
    }
    return { max: pts[iMax].y, start, heat, hot: hot / 60000 };
}

async function fetchDay(dateStr) {
    const from = localMidnight(dateStr), to = from + WINDOW_H * 3600000;
    const url = `https://api.thingspeak.com/channels/${CHAN_ID}/feeds.json?api_key=${API_KEY}` +
        `&start=${new Date(from).toISOString()}&end=${new Date(to).toISOString()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} (${dateStr})`);
    const data = await r.json();
    return (data.feeds || []).map(f => ({ x: new Date(f.created_at).getTime(), y: parseFloat(f.field1) }))
        .filter(p => isFinite(p.x) && isFinite(p.y)).sort((a, b) => a.x - b.x);
}

// --- Fő program ---
const dates = [...new Set(fs.readFileSync(ALK, 'utf8').split(/\r?\n/).map(l => l.split(/[,;]/)[0].trim())
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
const rows = new Map();
if (fs.existsSync(OUT)) {
    for (const l of fs.readFileSync(OUT, 'utf8').split(/\r?\n/).slice(1)) {
        const d = l.split(',')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) rows.set(d, l);
    }
}
const now = Date.now();
const todo = dates.filter(d => d >= SENSOR_START && !rows.has(d) && localMidnight(d) + WINDOW_H * 3600000 < now);
console.log(`Szaunanapló: ${dates.length} nap, szenzor.csv: ${rows.size} sor, feldolgozandó: ${todo.length}`);

let failed = 0;
for (const d of todo) {
    try {
        const a = analyzeDay(await fetchDay(d));
        // Ha aznap nincs mérés, üres sor kerül be (így később sem kérdezzük le újra)
        rows.set(d, a ? [d, a.start ? fmtLocal(a.start) : '', a.heat !== null ? Math.round(a.heat) : '',
            a.max.toFixed(1), Math.round(a.hot)].join(',') : `${d},,,,`);
        console.log('  ' + rows.get(d));
    } catch (e) {
        failed++;
        console.error(`  ${d}: ${e.message} – a következő futáskor újra próbálja`);
    }
}
const out = [HEADER, ...[...rows.keys()].sort().map(d => rows.get(d))].join('\n') + '\n';
fs.writeFileSync(OUT, out);
console.log(`Kész: ${rows.size} sor${failed ? `, ${failed} hiba` : ''}.`);
