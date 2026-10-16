// scripts/_lp1e-billing.cjs — Manage › Billing's PLAN ROWS for scripts/language-phase-1e.cjs. A MODULE.
// The rows (lib/plan-features.ts, lib/features.ts, lib/pricing.ts) are shared with the marketing pages and move into the
// message files in Phase 1e, read BY ID. These are PART 2'S OWN Billing views (scripts/_lp1d2-shell.cjs — every plan,
// trial states, the matrix, the upgrade modal, the iOS and price-mask variants), for the GB and the US truck, kept
// exactly as Part 2 renders them; only the key changes shape: '<CC>|billing|<state>' → 'billing|<CC>|<state>'.
async function views(ctx) {
  const FIX = require('./_lp1d2-fixtures.cjs')
  const c2 = FIX.context(ctx.kit, ctx.REPO)
  const all = await require('./_lp1d2-shell.cjs').views(c2)
  const out = {}
  for (const [k, v] of Object.entries(all)) {
    const m = /^(GB|US)\|billing\|(.*)$/.exec(k)
    if (m) out[`billing|${m[1]}|${m[2]}`] = v
    else if (/\|bundle$/.test(k)) out[`billing|${k.split('|')[0]}|bundle`] = v
  }
  for (const s of c2.skipped || []) ctx.skipped.push(s)
  return out
}
module.exports = { views }
