#!/usr/bin/env node
// scripts/messages-parity.cjs — 🔴 EVERY MESSAGE IN EVERY MESSAGE FILE RENDERS (Language Phase 0,
// docs/language-phase-0-report.md §5).
//
// For messages/*.json, checks:
//   1. the shape: nested objects of non-empty strings, nothing else;
//   2. en-GB is the full base: every key in every other file exists in en-GB (en-US holds only what differs);
//   3. valid ICU in every string, AND no apostrophe next to a brace, '#', '|' or another apostrophe — in ICU a
//      straight ' there starts a quoted literal and silently swallows the text after it (write ’ or rephrase);
//   4. every message renders through next-intl's own createTranslator, in every locale (the deep-merged messages a
//      screen actually gets), with sample values for each argument — both plural branches, every select option,
//      and rich-text tags — raising no error and producing a non-empty string.
// ⚠️ THE SKELETON. Phases 1a–1e extend it with a BEFORE/AFTER comparison per area: the strings a surface rendered
// before its text moved into messages/, against what the messages render now. Add each area to AREAS below.

const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { createTranslator } = require(path.join(REPO, 'node_modules/next-intl'))
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

const DIR = path.join(REPO, 'messages')
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
const msgs = Object.fromEntries(files.map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]))
const BASE = 'en-GB'
const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
const merge = (b, o) => { const out = { ...b }; for (const [k, v] of Object.entries(o)) out[k] = v && typeof v === 'object' && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v; return out }

head('1 · shape — nested objects of non-empty strings')
t(`the base file exists (messages/${BASE}.json)`, BASE in msgs)
for (const [loc, m] of Object.entries(msgs)) {
  const bad = leaves(m).filter(([, v]) => typeof v !== 'string' || !v.trim())
  t(`${loc}: every value is a non-empty string (${leaves(m).length} messages)`, bad.length === 0, bad.map(([k]) => k).join(', '))
}

head(`2 · ${BASE} is the full base — every key elsewhere exists in it`)
const baseKeys = new Set(leaves(msgs[BASE]).map(([k]) => k))
for (const [loc, m] of Object.entries(msgs)) {
  if (loc === BASE) continue
  const extra = leaves(m).map(([k]) => k).filter(k => !baseKeys.has(k))
  t(`${loc}: every key exists in ${BASE}`, extra.length === 0, extra.join(', '))
}

head('3 · valid ICU, and no apostrophe where ICU would treat it as a quote')
const APOS = /'[{}#|']/
for (const [loc, m] of Object.entries(msgs)) for (const [k, v] of leaves(m)) {
  let ok = true, err = ''
  try { parse(v) } catch (e) { ok = false; err = e.message }
  t(`${loc} · ${k}: valid ICU`, ok, err)
  t(`${loc} · ${k}: no apostrophe next to { } # | or '`, !APOS.test(v), v)
}

head('4 · every message renders in every locale, with sample values for every argument')
function samples(ast, vals = {}, variants = [{}]) {
  for (const el of ast) {
    if (el.type === TYPE.argument) vals[el.value] = 'x'
    else if (el.type === TYPE.number) vals[el.value] = 3
    else if (el.type === TYPE.date || el.type === TYPE.time) vals[el.value] = new Date(Date.UTC(2026, 9, 14, 12))
    else if (el.type === TYPE.plural) { variants.push({ [el.value]: 1 }, { [el.value]: 2 }); vals[el.value] = 2; for (const o of Object.values(el.options)) samples(o.value, vals, variants) }
    else if (el.type === TYPE.select) { for (const key of Object.keys(el.options)) variants.push({ [el.value]: key }); vals[el.value] = 'other'; for (const o of Object.values(el.options)) samples(o.value, vals, variants) }
    else if (el.type === TYPE.tag) { vals[el.value] = chunks => `<${el.value}>${chunks}</${el.value}>`; samples(el.children, vals, variants) }
  }
  return { vals, variants }
}
const locales = Object.keys(msgs)
for (const loc of locales) {
  const merged = loc === BASE ? msgs[BASE] : merge(msgs[BASE], msgs[loc])
  const errors = []
  const tr = createTranslator({ locale: loc, messages: merged, onError: e => errors.push(e.message) })
  for (const [k, v] of leaves(merged)) {
    let ast; try { ast = parse(v) } catch { continue }   // reported in §3
    const { vals, variants } = samples(ast)
    const hasTags = ast.some(function walk(el) { return el.type === TYPE.tag || (el.children || []).some(walk) || Object.values(el.options || {}).some(o => o.value.some(walk)) })
    const outs = variants.map(vr => { const all = { ...vals, ...vr }; return hasTags ? tr.markup(k, all) : tr(k, all) })
    t(`${loc} · ${k}: renders (${variants.length} variant${variants.length === 1 ? '' : 's'})`, errors.length === 0 && outs.every(o => typeof o === 'string' && o.trim()), errors.join('; ') || JSON.stringify(outs))
    errors.length = 0
  }
}

// ── Phases 1a–1e: one entry per surface moved into messages/, each comparing BEFORE with AFTER. ──
const AREAS = [
  '_messages-parity-1a.cjs',   // Language Phase 1a — the customer-facing text (docs/language-phase-1a-report.md)
]
if (AREAS.length) for (const a of AREAS) require(`./${a}`)({ t, head, msgs })

console.log(`\n${fail ? '✗' : '✓'} messages-parity: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
