// scripts/_plans-everywhere-2-faq-preload.cjs — LOCAL DEV SERVER ONLY (plans-everywhere-2, 19 November 2026;
// docs/plans-everywhere-2-report.md). NOT A HARNESS, NOT LOADED BY THE APP. Preloaded into a local `next dev` for the screenshots:
//     NODE_OPTIONS="--require ./scripts/_plans-everywhere-2-faq-preload.cjs" npx next dev -p 3477
// so the FAQ pages render as they will once supabase/migrations/20261119_plans_everywhere_2_faq.sql has run (after the deploy): the
// four card-payment answers on 'card_payments' and their pay-at-the-truck versions added on 'pay_at_truck'. The new questions have no
// translations yet (the hourly translator writes them after the migration), so a non-English page lists them only once translated —
// exactly as it will behave.
// 🔴 NOTHING IS WRITTEN ANYWHERE: it wraps this process's own `fetch` and changes, in memory, the JSON of a READ (GET) of faq_items.
// The rows it adds are read from the migration file itself, so the preview cannot drift from what will be written.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261119_plans_everywhere_2_faq.sql'), 'utf8').replace(/^\s*--.*$/gm, '')
const CARD = ['02', '06', '07', '11'].map(x => `fa000002-0000-4000-8000-0000000000${x}`)
// ('<new id>', '<twin id>', '<question>', '<answer>', '<note>') — the VALUES rows of step 3.
const NEW = [...SQL.matchAll(/\('(fa000002-0000-4000-8000-0000000010\d\d)',\s*'([0-9a-f-]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g)]
  .map(m => ({ id: m[1], twin: m[2], question_en: m[3].replace(/''/g, "'"), answer_en: m[4].replace(/''/g, "'") }))
if (NEW.length !== 4) throw new Error(`[plans-everywhere-2 preload] expected 4 new questions in the migration, found ${NEW.length}`)
const original = globalThis.fetch
globalThis.fetch = async function pe2Fetch(input, init) {
  const res = await original.call(this, input, init)
  const url = decodeURIComponent(typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? '')
  const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
  if (method !== 'GET' || !/\/rest\/v1\/faq_items\?/.test(url) || !res.ok) return res
  let data
  try { data = JSON.parse(await res.clone().text()) } catch { return res }
  if (!Array.isArray(data)) return res
  let out = data.map(r => (r && CARD.includes(r.id) ? { ...r, show_in: 'card_payments' } : r))
  for (const n of NEW) {
    const twin = data.find(r => r && r.id === n.twin)
    if (!twin || out.some(r => r && r.id === n.id)) continue
    const row = { ...twin, id: n.id, question_en: n.question_en, answer_en: n.answer_en, show_in: 'pay_at_truck' }
    if ('answer_single_plan_en' in twin) row.answer_single_plan_en = null
    out = [...out, row]
  }
  const headers = new Headers(res.headers); headers.delete('content-length'); headers.delete('content-encoding')
  return new Response(JSON.stringify(out), { status: res.status, statusText: res.statusText, headers })
}
console.log('[plans-everywhere-2 preload] FAQ shown as after 20261119_plans_everywhere_2_faq.sql (in memory; nothing written)')
