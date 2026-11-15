#!/usr/bin/env node
// scripts/turbopack-merged-modules-check.cjs — app-fixes-1 (14 November 2026, docs/app-fixes-1-report.md §3).
//
// 🔴 WHAT HAPPENED. Turbopack's PRODUCTION build merges modules into one factory ("466019,375647,47834,852807,967316,e=>{…}")
// and the factory sets each merged module's exports with `e.s([...], <id>)`. For lib/printing it emitted only ONE module's
// body: transport.ts. printerText.ts (printerMessageText), the `printing` catalog, netAddress.ts and netTransport.ts had
// ids in the group and NOTHING else — so in the app, Paramètres crashed ("printerMessageText is not a function") and the
// printing card showed raw keys (MISSING_MESSAGE: printing.card). Dev builds were fine, so no screen test could see it.
// The trigger was an import cycle closed by a `require()` (transport.ts ⇄ netTransport.ts), fixed in app-fixes-1.
//
// WHAT THIS CHECKS, on a BUILT app (`next build` first; it reads .next/static/chunks, or the directory given): every
// module id that another factory USES AS A VALUE (`x = e.i(<id>)` then `x.name`, or `e.r(<id>)`) must have its exports set
// somewhere (`e.s([...], <id>)`, or be the sole id of its factory). A used id with no exports anywhere is exactly the
// failure above. Not swept (it needs a build); run it by hand after `next build`. Exit 1 on a finding.
//   node scripts/turbopack-merged-modules-check.cjs [chunks-dir]
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..', '.next/static/chunks'))
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js'))
const groups = []            // { ids: [..], body, file }
const exported = new Set()   // ids whose exports are set
const usedAsValue = new Map() // id -> [file, sample]
for (const f of files) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8')
  // Exports are read from the WHOLE file, not from the brace-matched body: a large body (regex literals, odd strings) can
  // defeat the brace matcher, and a missed `e.s` would be a false finding.
  for (const x of s.matchAll(/e\.s\(\[[^\]]*\],(\d+)\)/g)) exported.add(Number(x[1]))
  // A factory: one or more numeric ids followed by `e=>{` (Turbopack's chunk format: [..., id, id, ..., factory, ...]).
  const re = /(?:^|[,[])((?:\d+,)+)(?:\(?)e\s*=>\s*\{/g
  let m
  while ((m = re.exec(s))) {
    const ids = m[1].split(',').filter(Boolean).map(Number)
    // the body: brace-match from the `{`
    const start = re.lastIndex - 1
    let depth = 0, i = start, inStr = null
    for (; i < s.length; i++) {
      const c = s[i]
      if (inStr) { if (c === '\\') { i++; continue } if (c === inStr) inStr = null; continue }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (!depth) break }
    }
    const body = s.slice(start, i + 1)
    groups.push({ ids, body, file: f })
    if (ids.length === 1) exported.add(ids[0])
    for (const x of body.matchAll(/e\.s\(\[[\s\S]*?\],(\d+)\)/g)) exported.add(Number(x[1]))
    // value uses: `name=e.i(123)` later read as `name.something`, or `e.r(123)`
    for (const x of body.matchAll(/([A-Za-z_$][\w$]*)=e\.i\((\d+)\)/g)) {
      const [, name, id] = x
      if (new RegExp(`[^\\w$.]${name.replace(/\$/g, '\\$')}\\.[A-Za-z_$]`).test(body)) { if (!usedAsValue.has(+id)) usedAsValue.set(+id, [f, name]) }
    }
    for (const x of body.matchAll(/e\.r\((\d+)\)/g)) if (!usedAsValue.has(+x[1])) usedAsValue.set(+x[1], [f, 'e.r'])
  }
}
const merged = groups.filter(g => g.ids.length > 1)
const inMerged = new Map(); for (const g of merged) for (const id of g.ids) inMerged.set(id, g)
const broken = [...usedAsValue.keys()].filter(id => inMerged.has(id) && !exported.has(id))
console.log(`chunks: ${files.length} · factories: ${groups.length} · merged groups: ${merged.length} · ids used as values: ${usedAsValue.size}`)
for (const id of broken) {
  const g = inMerged.get(id)
  console.log(`  ✗ module ${id} is used as a value (${usedAsValue.get(id).join(' · ')}) but its merged group [${g.ids.join(',')}] in ${g.file} never sets its exports`)
}
if (broken.length) { console.log(`\n🔴 ${broken.length} merged module(s) with no exports — a production-only crash`); process.exit(1) }
console.log('✅ every module used as a value has its exports set')
