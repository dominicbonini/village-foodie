#!/usr/bin/env node
// scripts/us-layout-audit/B-ops/compare.cjs — GB vs US from measures.json: what US has that GB has not.
//   node scripts/us-layout-audit/B-ops/compare.cjs [stateFilter] → stdout, and compare.json beside it
const fs = require('fs'); const path = require('path')
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'measures.json'), 'utf8'))
const only = process.argv[2]
const out = []
const pairs = {}
for (const [k, v] of Object.entries(M)) { const [st, sz, cc] = k.split('|'); (pairs[`${st}|${sz}`] ??= {})[cc] = v }
for (const [k, p] of Object.entries(pairs)) {
  if (only && !k.includes(only)) continue
  const { GB, US } = p; if (!GB || !US) continue
  const r = { key: k, docOverflowX: [GB.docOverflowX, US.docOverflowX], flags: [], time: [], cards: [], selects: [], regions: {} }
  // flags: US flags whose key is absent in GB or larger
  const gbF = new Map(GB.flags.map(f => [f.key + f.mode, f]))
  for (const f of US.flags) {
    if (f.mode === 'scroller' && f.over < 3) continue
    const g = gbF.get(f.key + f.mode)
    if (!g || f.over > g.over + 2) r.flags.push({ mode: f.mode, key: f.key, text: f.text, usOver: f.over, gbOver: g ? g.over : 0, w: f.w, depth: f.depth })
  }
  // time / date elements: line count or clipping or overlap differing
  const gbT = {}; for (const t of GB.timeEls) (gbT[t.key] ??= []).push(t)
  const seen = {}
  for (const t of US.timeEls) {
    const i = (seen[t.key] = (seen[t.key] ?? -1) + 1); const g = (gbT[t.key] || [])[i]
    const bad = t.lines > 1 || t.clippedBy > 0 || t.overlapNext > 0 || t.ellipsis || t.sw > t.cw + 1
    const gbBad = g && (g.lines > 1 || g.clippedBy > 0 || g.overlapNext > 0 || g.ellipsis || g.sw > g.cw + 1)
    if (bad && (!g || !gbBad || t.lines > g.lines || t.clippedBy > g.clippedBy || t.overlapNext > g.overlapNext))
      r.time.push({ key: t.key, us: { text: t.text, lines: t.lines, h: t.h, w: t.w, sw: t.sw, cw: t.cw, clippedBy: t.clippedBy, overlapNext: t.overlapNext, ellipsis: t.ellipsis },
        gb: g ? { text: g.text, lines: g.lines, h: g.h, w: g.w, sw: g.sw, cw: g.cw, clippedBy: g.clippedBy, overlapNext: g.overlapNext, ellipsis: g.ellipsis } : null })
  }
  const gbC = Object.fromEntries(GB.cards.map(c => [c.id, c]))
  for (const c of US.cards) {
    const g = gbC[c.id]; if (!g) continue
    r.cards.push({ id: c.id, w: c.w, gbH: g.h, usH: c.h, gbHdr: g.hdrH, usHdr: c.hdrH, gbRows: g.rows.map(x => x.h), usRows: c.rows.map(x => x.h),
      gbClip: g.clipped, usClip: c.clipped, gbName: g.name, usName: c.name, gbNum: g.num, usNum: c.num, usRowOver: c.rows.map(x => x.sw - x.cw), gbRowOver: g.rows.map(x => x.sw - x.cw) })
  }
  r.selects = US.selects.map((s, i) => ({ us: s, gb: GB.selects[i] }))
  for (const n of Object.keys(US.regions)) r.regions[n] = { gb: GB.regions[n], us: US.regions[n] }
  out.push(r)
}
fs.writeFileSync(path.join(__dirname, 'compare.json'), JSON.stringify(out, null, 1))
for (const r of out) {
  console.log(`\n=== ${r.key}  docOverflowX GB ${r.docOverflowX[0]} US ${r.docOverflowX[1]}`)
  for (const f of r.flags) console.log(`  FLAG ${f.mode} +${f.usOver} (gb +${f.gbOver}) w${f.w} d${f.depth} ${f.key} :: ${f.text.slice(0, 70)}`)
  for (const t of r.time) console.log(`  TIME ${JSON.stringify(t.us)} | gb ${JSON.stringify(t.gb)} ${t.key}`)
  for (const c of r.cards) if (c.gbH !== c.usH || c.usClip > 0 || c.usRowOver.some(x => x > 1) || (c.usName && c.usName.over > 0.05) || (c.usNum && c.usNum.over > 0.05))
    console.log(`  CARD #${c.id} w${c.w} h ${c.gbH}→${c.usH} hdr ${c.gbHdr}→${c.usHdr} rows ${c.gbRows}→${c.usRows} clip ${c.gbClip}/${c.usClip} rowOver ${c.gbRowOver}/${c.usRowOver} name ${c.gbName && c.gbName.shown + '/' + c.gbName.needs}→${c.usName && c.usName.shown + '/' + c.usName.needs} num ${c.gbNum && c.gbNum.shown + '/' + c.gbNum.needs}→${c.usNum && c.usNum.shown + '/' + c.usNum.needs}`)
  for (const s of r.selects) console.log(`  SELECT content ${s.us.content} us sel ${s.us.selected?.w} "${s.us.selected?.text}" widest ${s.us.widest?.w} "${s.us.widest?.text}" | gb sel ${s.gb?.selected?.w} widest ${s.gb?.widest?.w} "${s.gb?.widest?.text}"`)
  for (const [n, v] of Object.entries(r.regions)) console.log(`  REGION ${n} h ${v.gb?.h}→${v.us?.h} ${JSON.stringify(v.us?.lines)}`)
}
