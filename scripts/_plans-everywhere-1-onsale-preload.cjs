// scripts/_plans-everywhere-1-onsale-preload.cjs — LOCAL DEV SERVER ONLY (plans-everywhere-1, 19 November 2026;
// docs/plans-everywhere-1-report.md). NOT A HARNESS, NOT LOADED BY THE APP. Preloaded into a local `next dev` for the screenshots:
//     PE1_ON_SALE=TZ,BR NODE_OPTIONS="--require ./scripts/_plans-everywhere-1-onsale-preload.cjs" npx next dev -p 3477
// so that the named countries render as they will once supabase/migrations/20261119_plans_everywhere_1.sql has run: Pay as you go
// and Pro ON SALE, and a finished trial falling back to Pay as you go (no is_trial_end row) — before that migration is run.
// 🔴 NOTHING IS WRITTEN ANYWHERE: it wraps this process's own `fetch` and, in the JSON of a READ (GET) of plan_prices
// (lib/plans-server.ts), sets `offered` / `is_trial_end` on the named countries' rows in memory. Every write, every other table and
// every other country passes through untouched. The shared database never sees a change.
'use strict'
const ON = String(process.env.PE1_ON_SALE || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
if (!ON.length || !ON.every(c => /^[A-Z]{2}$/.test(c))) throw new Error('[plans-everywhere-1 preload] set PE1_ON_SALE to ISO country codes (e.g. TZ,BR)')
const original = globalThis.fetch
globalThis.fetch = async function pe1Fetch(input, init) {
  const res = await original.call(this, input, init)
  const url = decodeURIComponent(typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? '')
  const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
  if (method !== 'GET' || !/\/rest\/v1\/plan_prices\?/.test(url) || !res.ok) return res
  let data
  try { data = JSON.parse(await res.clone().text()) } catch { return res }
  const one = r => {
    if (!r || typeof r !== 'object' || !ON.includes(r.country_code)) return r
    if (r.plan_key === 'payg' || r.plan_key === 'pro') return { ...r, offered: true }
    if (r.plan_key === 'unlimited' && r.is_trial_end) return { ...r, is_trial_end: false }
    return r
  }
  const out = Array.isArray(data) ? data.map(one) : one(data)
  const headers = new Headers(res.headers); headers.delete('content-length'); headers.delete('content-encoding')
  return new Response(JSON.stringify(out), { status: res.status, statusText: res.statusText, headers })
}
console.log(`[plans-everywhere-1 preload] ${ON.join(', ')}: Pay as you go and Pro shown on sale on this local server (in memory; nothing written)`)
