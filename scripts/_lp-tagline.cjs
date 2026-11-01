// scripts/_lp-tagline.cjs — ⚠️ RE-PINNED (world-countries-1, tagline): THE ONE NAMED DIFFERENCE of world-countries-1 (31 October
// 2026, docs/world-countries-1-report.md §0). Dominic removed the tagline "Less time booking. More time cooking." everywhere: the
// hero's <p class="hero-tag">…</p> and the footer's <p class="foot-tag">…</p>, in every language. A harness that compares a page
// with a BEFORE snapshot cuts exactly those two elements from the BEFORE side — every other byte must still match.
'use strict'
const RE = [/<p class="hero-tag">[\s\S]*?<\/p>/g, /<p class="foot-tag">[\s\S]*?<\/p>/g]
// The same two elements as captured TEXT (a snapshot of a page's words): "Less time booking. More time cooking." in English.
const TEXT = [/ ?Less time booking\.? ?More time cooking\.?/g]
/** A snapshot (a string, or any JSON value holding strings) with the tagline's two elements cut out. */
function cut(v) {
  if (typeof v === 'string') return [...RE, ...TEXT].reduce((s, re) => s.replace(re, ''), v)
  if (Array.isArray(v)) return v.map(cut)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cut(x)]))
  return v
}
// The named item, in the shape the language-phase registries take (scripts/_lp1e-named.cjs, language-phase-1e-tidy.cjs): every
// marketing page's rendered HTML (the landing's hero and every footer) — PRECISE: the BEFORE value must carry the tagline.
const PAGE_HTML = /^pages\/(landing|features|compare)\|(GB|US)\|html(?!.*-usOff)/
const ITEMS = [{
  id: 'world-countries-1-tagline',
  what: '⚠️ RE-PINNED (world-countries-1, tagline, 31 October 2026, Dominic): "Less time booking. More time cooking." removed — the hero\'s <p class="hero-tag"> and the footer\'s <p class="foot-tag"> cut — PRECISE, both elements where BEFORE has them',
  views: id => PAGE_HTML.test(id),
  apply: (id, v) => { const out = cut(v); if (JSON.stringify(out) === JSON.stringify(v)) throw new Error('world-countries-1-tagline: nothing to cut in the BEFORE value (stale anchor)'); return out },
}]

// ── ⚠️ RE-PINNED (world-countries-1, 31 October 2026): GET /api/manage's answer gains three DATA fields, each with the value every
// existing row reads as (no column = the old behaviour, lib/plans.ts / lib/country-settings.ts):
//   • `countrySettings.platformFeeAllowed: true`, right after `platformFeeEnabled` (country_settings.platform_fee_allowed);
//   • each `plans.prices[]` row's `offered: true, trialEnd: false`, right after `extraVanMonthlyMinor` (plan_prices.offered /
//     is_trial_end).
// PRECISE: those fields only; every other byte identical.
function onJson(s, f) {
  if (!((s[0] === '{' || s[0] === '[') && /[}\]]$/.test(s))) return null
  try { const p = JSON.parse(s); if (JSON.stringify(p) !== s) return null; return JSON.stringify(f(p)) } catch { return null }
}
function manageFields(v) {
  if (typeof v === 'string') return onJson(v, manageFields) ?? v
  if (Array.isArray(v)) return v.map(manageFields)
  if (!v || typeof v !== 'object') return v
  const isCs = 'countryCode' in v && 'platformFeeEnabled' in v && !('platformFeeAllowed' in v)
  const isPrice = 'planKey' in v && 'extraVanMonthlyMinor' in v && !('offered' in v)
  const out = {}
  for (const [k, x] of Object.entries(v)) {
    out[k] = manageFields(x)
    if (isCs && k === 'platformFeeEnabled') out.platformFeeAllowed = true
    if (isPrice && k === 'extraVanMonthlyMinor') { out.offered = true; out.trialEnd = false }
  }
  return out
}
module.exports = { cut, ITEMS, manageFields }
