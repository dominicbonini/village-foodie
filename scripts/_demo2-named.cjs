// scripts/_demo2-named.cjs — the views demo-2 (30 October 2026, docs/demo-2-report.md) CHANGED ON PURPOSE or RETIRED.
// A MODULE, read by the language-phase comparison harnesses (1a, 1b, 1c, 2), which compare every view with a frozen
// BEFORE snapshot. demo-2 changed what some demo screens show, so those views can no longer equal BEFORE; they are
// named here, each with its reason, and proved in their new form by scripts/demo-2.cjs instead:
//   • LISTED  — the view still exists and changed on purpose: it is skipped by the byte comparison (and counted);
//   • RETIRED — the component that rendered it is gone: the view must be ABSENT, and that is asserted.
// Ids are `<phase>/<area>/<key>` — the scheme those harnesses already use for Language Phase 2's named changes.
// Keep this list NARROW: a pattern names exactly the screens demo-2 changed, nothing around them.
'use strict'

const RULES = [
  // The demo ORDER PAGE: the walkthrough's banner sentence, its step label, no email field, the payment panel.
  { re: /^1a\/orderPage\/(GB|US)\|demo/, why: 'the demo order page (walkthrough banner, step label, no email, payment panel)' },
  // The demo DASHBOARD: the welcome popup and the "your order arrived" card are retired from it.
  { re: /^1b\/dashboard\/(GB|US)\|demo(\||$)/, why: 'the demo dashboard without DemoWelcome / DemoLoopComplete' },
  // The two retired components themselves.
  { re: /^1b\/components\/(GB|US)\|demo(Loop|Welcome)\|/, retired: true, why: 'DemoLoopComplete / DemoWelcome retired' },
  { re: /^1c\/demo\/(GB|US)\|loop\|/, retired: true, why: 'DemoLoopComplete retired' },
  // The landing UPLOAD MODAL: the email field, the privacy line and the tips box (and Build / the sample need the email).
  { re: /^1c\/demo\/(GB|US)\|(press\|)?up\|/, why: 'the upload modal with the email step' },
  // The rows a demo is PROVISIONED with: no seeded orders on a build or a restart.
  { re: /^1c\/demo\/(GB|US)\|rows\|/, why: 'no seeded orders' },
  { re: /^2\/extra\/(GB|US)\|rows\|demo\|/, why: 'no seeded orders (seededOrders 0, no order rows)' },
  // The 1d2 smoke render of the demo DASHBOARD: DemoWelcome is no longer mounted on it.
  { re: /^1d2\/smoke-dash\/(GB|US)\|demo/, why: 'the demo dashboard smoke view without DemoWelcome / DemoLoopComplete' },
  // /api/demo's SUCCESS answers: /try/<slug>, the slug and emailSent — no dashboard token.
  { re: /^1c\/api\/(GB|US)\|demo\|(imported|template|limiterDown)$/, why: '/api/demo answers with the walkthrough link (limiterDown: the limiter fails open, so the build succeeds)' },
]

/** What demo-2 did to one view: { listed, retired, why } (both false when it did nothing). */
function apply(id) {
  for (const r of RULES) if (r.re.test(id)) return { listed: !r.retired, retired: !!r.retired, why: r.why }
  return { listed: false, retired: false, why: null }
}

/**
 * Applies the list to a BEFORE map in place (`before` keyed by the area's own keys, `prefix` = '<phase>/<area>/').
 * A LISTED view is taken out of the comparison ONLY IF it actually differs from `after` (what the harness rendered now);
 * one that is still byte-identical stays in and is compared as usual — so a broad pattern can never hide a view demo-2
 * did not change. Returns { listed: [ids], retired: [ids] } — the caller asserts each retired id is absent from what it
 * rendered and reports the listed count.
 */
function filterBefore(before, prefix, after = null) {
  const listed = [], retired = []
  for (const k of Object.keys(before)) {
    const r = apply(prefix + k)
    if (r.retired) { retired.push(k); delete before[k]; continue }
    if (!r.listed) continue
    if (after && k in after && JSON.stringify(after[k]) === JSON.stringify(before[k])) continue   // unchanged: compare it
    listed.push(k); delete before[k]
  }
  return { listed, retired }
}

module.exports = { RULES, apply, filterBefore }
