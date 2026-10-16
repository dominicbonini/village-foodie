// scripts/_lp1d2-smoke.cjs — Language Phase 1d Part 2, the OUT-OF-SCOPE areas `smoke-*`: what Part 2 must NOT change.
//   smoke-menu      Part 1's Menu tab views         (scripts/_lp1d-menu.cjs, whole)
//   smoke-schedule  Part 1's Schedule tab views     (scripts/_lp1d-schedule.cjs, whole)
//   smoke-settings  Part 1's Settings tab views     (scripts/_lp1d-settings.cjs) — the PAGE with Auto-replies and Account
//                   deletion cut out (those two sections are Part 2's, rendered by the `wada` area), and WhereYouTrade /
//                   kitchen-capacity pieces
//   smoke-copy      Part 1's copy-module outputs    (scripts/_lp1d-copy.cjs, whole)
//   smoke-api       Part 1's in-scope refusals and successes (scripts/_lp1d-api.cjs) — its `|oos|` views (charges, team,
//                   reports, the reply limit) are Part 2's and are left out here (the `api` area renders them)
//   smoke-dash      the dashboard (scripts/_lp1b-dashboard.cjs's views)
// Every one must be BEFORE === F === A, GB and US, except a NAMED shared change (scripts/_lp1d2-named.cjs SMOKE_SHARED).
const path = require('path')

async function views(ctx, part) {
  if (part === 'dash') {
    const FIX1B = require('./_lp1b-fixtures.cjs')
    const kit = ctx.kit
    // The 1b module's own ctx: every code this harness renders is "after" Phase 1b, so a state's __after always applies.
    const html = (state, el, search) => {
      globalThis.__ms = state && state.__after ? { ...state, ...state.__after } : state
      if (search != null) globalThis.__msSearch = search
      try { return kit.quiet(() => kit.renderStatic(el)) } catch (e) { return 'ERROR ' + String(e && e.message || e).slice(0, 300) }
      finally { delete globalThis.__ms; delete globalThis.__msSearch }
    }
    const fs = require('fs')
    const c = { kit, h: kit.h, html, FIX: FIX1B, GB: FIX1B.country('GB'), US: FIX1B.country('US'), AFTER: true, REPO: ctx.REPO, t() {}, head() {},
      read: f => fs.readFileSync(path.join(ctx.REPO, f), 'utf8') }
    return require('./_lp1b-dashboard.cjs').views(c)
  }
  const mod = require(`./_lp1d-${part}.cjs`)
  const v = await mod.views(ctx)
  const out = {}
  for (const [k, x] of Object.entries(v)) {
    if (/\|oos\|/.test(k)) continue          // Part 2's own (rendered by the wada / api areas)
    out[k] = x
  }
  return out
}

module.exports = { views, PARTS: ['menu', 'schedule', 'settings', 'copy', 'api', 'dash'] }
