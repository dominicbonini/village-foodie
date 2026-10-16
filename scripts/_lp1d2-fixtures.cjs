// scripts/_lp1d2-fixtures.cjs — the shared GB and US fixtures for scripts/language-phase-1d2.cjs (Language Phase 1d
// Part 2: Manage's Payments, Billing, Reports, Team, Social posts, WhatsApp, custom domain, account deletion and the
// shell). A MODULE, not a harness. It is Part 1's context (scripts/_lp1d-fixtures.cjs) unchanged — the GB truck is Pizza
// Kitchen ('test-truck' / 'test-kitchen'); the US truck the same kitchen in the US: USD, en-US, 12-hour, month-day-year,
// SUNDAY weeks, America/Chicago, the US address style — plus a few Part 2 helpers.
//
// ctx.html(state, el)       full HTML of `el`, with useState hooks started from `state` (render-kit `states` patches);
//                           `state.__after = { when, file?, set }` is applied only when `file` (default the Manage page)
//                           matches `when` — a state an effect now holds as a CODE is given on the new code only.
// ctx.states(file, names)   the names this code has as `const [name, …] = useState` (others skipped and reported).
// ctx.has(file, re)         whether this code's `file` matches `re` (guard a view that needs a new export / prop).
// ctx.safe(out, key, fn)    out[key] = fn(), or 'ERROR …' — one broken view never stops an area.
// ctx.safeAsync(out, key, fn)
// 🔴 EVERY VIEW RUNS ON BOTH CODES (826471a and this tree): guard a new export with typeof, give a code-state through
//    __after, and never let a missing name throw the whole area.
const base = require('./_lp1d-fixtures.cjs')

const MANAGE = base.MANAGE
const NOW = base.NOW            // 2026-10-09T17:20:00Z — a Friday
const BEFORE_REF = '826471a'

function context(kit, REPO) {
  const ctx = base.context(kit, REPO)
  ctx.has = (file, re) => re.test(ctx.src(file))
  ctx.safe = (out, key, fn) => { try { out[key] = fn() } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 300) } }
  ctx.safeAsync = async (out, key, fn) => { try { out[key] = await fn() } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 300) } }
  ctx.BEFORE_REF = BEFORE_REF
  return ctx
}

module.exports = { ...base, context, MANAGE, NOW, BEFORE_REF }
