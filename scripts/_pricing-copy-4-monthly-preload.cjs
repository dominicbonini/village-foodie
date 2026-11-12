// scripts/_pricing-copy-4-monthly-preload.cjs — LOCAL DEV SERVER ONLY (pricing-copy-4, 12 November 2026; docs/pricing-copy-4-report.md §6).
// NOT A HARNESS, NOT LOADED BY THE APP. Preloaded into a local `next dev` for the screenshots:
//     PC4_MONTHLY_ONLY=IE NODE_OPTIONS="--require ./scripts/_pricing-copy-4-monthly-preload.cjs" npx next dev -p 3123
// so that ONE country renders as a MONTHLY-BILLING-ONLY country (country_billing.payment_model 'billed_at_truck') on that local
// server. Today every country in the database takes online card payments, so this is the only way to SEE the monthly-only wording
// before such a country is switched on.
// 🔴 NOTHING IS WRITTEN ANYWHERE: it wraps this process's own `fetch` and, in the JSON of a READ (GET) of country_settings that
// embeds country_billing (lib/country-settings.ts), sets that one country's embedded payment model in memory. Every write, every
// other table and every other country passes through untouched. The shared database never sees a change.
'use strict'
const CC = String(process.env.PC4_MONTHLY_ONLY || '').trim().toUpperCase()
if (!/^[A-Z]{2}$/.test(CC)) throw new Error('[pricing-copy-4 preload] set PC4_MONTHLY_ONLY to one ISO country code (e.g. IE)')
const original = globalThis.fetch
globalThis.fetch = async function pc4Fetch(input, init) {
  const res = await original.call(this, input, init)
  const url = decodeURIComponent(typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? '')
  const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
  if (method !== 'GET' || !/\/rest\/v1\/country_settings\?/.test(url) || !url.includes('country_billing(payment_model)') || !res.ok) return res
  let data
  try { data = JSON.parse(await res.clone().text()) } catch { return res }
  const one = r => (r && typeof r === 'object' && r.country_code === CC ? { ...r, country_billing: { payment_model: 'billed_at_truck' } } : r)
  const out = Array.isArray(data) ? data.map(one) : one(data)
  const headers = new Headers(res.headers); headers.delete('content-length'); headers.delete('content-encoding')
  return new Response(JSON.stringify(out), { status: res.status, statusText: res.statusText, headers })
}
console.log(`[pricing-copy-4 preload] ${CC} renders as monthly billing only on this local server (in memory; nothing written)`)
