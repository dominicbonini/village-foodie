#!/usr/bin/env node
// scripts/us-layout-proposal/B/compare.cjs — BEFORE → (fix 1 alone) → AFTER, per fix, from the measure.json files that
// render.cjs writes. Prints the tables the report quotes.
//   node scripts/us-layout-proposal/B/compare.cjs <beforeDir> <afterDir> [fix1OnlyDir]
const fs = require('fs'); const path = require('path')
const [bDir, aDir, f1Dir] = process.argv.slice(2)
const load = d => (d && fs.existsSync(path.join(d, 'measure.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'measure.json'), 'utf8')) : {})
const B = load(bDir), A = load(aDir), F = load(f1Dir)
const SZ = ['810x1080', '1180x820', '800x1280', '1280x800']
const get = (M, st, sz, cc) => M[`${st}|${sz}|${cc}`]
const card = (M, st, sz, cc, id) => (get(M, st, sz, cc)?.cards || []).find(k => k.id === id)
const cols = (f, fmt) => [B, F, A].map(M => (Object.keys(M).length ? fmt(f(M)) : '–'))
const line = (label, f, fmt = x => (x == null ? '–' : String(x))) => console.log(`  ${label.padEnd(44)} ${cols(f, fmt).map(s => s.padEnd(26)).join('')}`)
const head = t => console.log(`\n== ${t}\n  ${''.padEnd(44)} ${['BEFORE', 'fix 1 only', 'AFTER'].map(s => s.padEnd(26)).join('')}`)
const num = k => (k ? `${k.num.shown}/${k.num.needs}px ${k.num.chars}/${k.num.of}ch${k.num.overlap ? ` overlap ${k.num.overlap}(${k.num.overlapBy})` : ''}` : null)
const nm = k => (k && k.name ? `${k.name.shown}/${k.name.needs}px ${k.name.chars}/${k.name.of}ch r2:${k.row2?.lines}` : null)

head('FIX 6 (B-06) — Cook ticket order number: shown/needed px, characters shown (4-digit; 2-digit = cal2)')
for (const st of ['kds-grid-cook', 'cal2-kds-grid-cook']) for (const sz of SZ) for (const cc of ['GB', 'US'])
  for (const [id2, id4, what] of [['35', '1235', 'Ready'], ['34', '1234', 'late'], ['36', '1236', 'normal']]) {
    const id = st.startsWith('cal2') ? id2 : id4
    line(`${st.replace('kds-grid-', '')} ${sz} ${cc} #${id} ${what}`, M => card(M, st, sz, cc, id), num)
  }
head('FIX 6 (Full) — Full ticket order number and anything drawn over it (Ready badge), row 1 lines')
for (const st of ['kds-grid', 'cal2-kds-grid']) for (const sz of SZ) for (const cc of ['GB', 'US']) {
  const id = st.startsWith('cal2') ? '35' : '1235'
  line(`${st} ${sz} ${cc} #${id} Ready`, M => card(M, st, sz, cc, id), k => (k ? `${num(k)} r1:${k.row1.lines} h${k.h}` : '–'))
}
head('FIX 7 (B-05) — Full ticket row 2 name: shown/needed px, characters shown, row-2 lines')
for (const sz of SZ) for (const cc of ['GB', 'US']) for (const id of ['1236', '1233', '1237', '1238', '1231', '1235', '1234'])
  line(`kds-grid ${sz} ${cc} #${id}`, M => card(M, 'kds-grid', sz, cc, id), nm)
head('FIX 6/7 — Cook ticket row 2 name (the time now shares it)')
for (const sz of SZ) for (const cc of ['GB', 'US']) for (const id of ['1236', '1233', '1237'])
  line(`kds-grid-cook ${sz} ${cc} #${id}`, M => card(M, 'kds-grid-cook', sz, cc, id), nm)
head('FIX 8 (B-01/B-02) — dashboard card row 1: overflow sw-cw, spill into padding, clipped, lines (4-digit)')
for (const st of ['dash-orders', 'cal2-dash-orders']) for (const sz of ['810x1080', '800x1280', '1180x820', '1280x800']) for (const cc of ['GB', 'US'])
  for (const id of st.startsWith('cal2') ? ['34', '36'] : ['1234', '1236', '1231', '1237', '1233', '1238']) {
    line(`${st} ${sz} ${cc} #${id}`, M => card(M, st, sz, cc, id), k => (k ? `over ${k.row1.sw - k.row1.cw} spill ${k.row1.spill} clip ${k.row1.clip} L${k.row1.lines} h${k.h}` : '–'))
  }
head('FIX 9 (B-03) — kitchen-capacity sidebar: row heights, time lines, time over the dot, rows visible')
for (const st of ['dash-orders', 'dash-orders-gbtoo']) for (const sz of ['1180x820', '1280x800']) for (const cc of ['GB', 'US']) {
  line(`${st} ${sz} ${cc}`, M => get(M, st, sz, cc)?.sidebar, s => (s ? `rowH ${s.rowH} lines ${s.timeLines} over ${s.maxTimeOverDot} vis ${s.rowsVisible}/${s.rows} tw ${s.timeW}/${s.timeNeeds}` : '–'))
}
head('FIX 10 (B-07) — card / ticket heights, money block height, cards fully on screen')
for (const [st, ids] of [['dash-orders', ['1231', '1233', '1234']], ['dash-orders-open', ['1231']], ['kds-grid', ['1234', '1233']], ['kds-grid-none', ['1234', '1233']], ['kds-list', ['1234']], ['kds-list-none', ['1234']]])
  for (const sz of SZ) for (const cc of ['GB', 'US']) {
    line(`${st} ${sz} ${cc} fully on screen`, M => get(M, st, sz, cc), m => (m ? String(m.cardsFully) : '–'))
    for (const id of ids) line(`  #${id} h / money h`, M => card(M, st, sz, cc, id), k => (k ? `${k.h} / ${k.chargeH}` : '–'))
  }
