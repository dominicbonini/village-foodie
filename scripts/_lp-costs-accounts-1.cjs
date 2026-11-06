// scripts/_lp-costs-accounts-1.cjs — costs-accounts-1's named changes to Manage (4 November 2026; docs/costs-accounts-1-report.md), for the
// harnesses that compare Manage's rendered views with a tree from before it. scripts/costs-accounts-1.cjs proves the change itself.
//
//   presetPicker(html)  Reports' date-range toolbars as they render now: the period picker inserted before the phone toolbar's two date
//                       boxes and at the start of the desktop toolbar's fixed-height input area — "Custom dates" selected (the dates
//                       are no preset), its five options. PRECISE: each place must be there exactly once, or the view is returned as it
//                       is (a view in event mode has neither).
//   proveReportAccounts get_report gains `report.accounts`, and its orders come in a fixed order (placed, then order_key) — it reads in
//                       pages now; STRUCTURAL: the same rows, only sorted.
//   menuProp(props)     Manage hands MenuTab `canSeeCosts` (owners and managers see "Cost to make"), after onVerifySuccess.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')

/** True on a tree with the period picker. */
const LANDED = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'app/(app)/manage/[token]/page.tsx'), 'utf8').includes('data-report-preset') } catch { return false } })()
const OPTIONS = (words = { custom: 'Custom dates', thisMonth: 'This month', lastMonth: 'Last month', lastQuarter: 'Last quarter', lastTaxYear: 'Last tax year' }) =>
  `<option value="custom" selected="">${words.custom}</option><option value="thisMonth">${words.thisMonth}</option><option value="lastMonth">${words.lastMonth}</option><option value="lastQuarter">${words.lastQuarter}</option><option value="lastTaxYear">${words.lastTaxYear}</option>`
const select = cls => `<select aria-label="Period" data-report-preset="true" class="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white ${cls}">${OPTIONS()}</select>`
const PHONE_AT = '<div class="flex items-center gap-2"><input type="date"'
const DESK_AT = '<div class="flex items-center gap-2" style="min-height:44px"><input type="date"'
const count = (s, a) => s.split(a).length - 1
function presetPicker(html) {
  if (typeof html !== 'string' || count(html, PHONE_AT) !== 1 || count(html, DESK_AT) !== 1) return html
  return html.replace(PHONE_AT, select('w-full') + PHONE_AT)
    .replace(DESK_AT, '<div class="flex items-center gap-2" style="min-height:44px">' + select('flex-shrink-0') + '<input type="date"')
}
const menuProp = p => ('onVerifySuccess' in p && !('canSeeCosts' in p) ? { ...p, canSeeCosts: true } : p)
/** get_report's answer: F with `report.accounts` taken out must be the expected answer exactly; the rows must be a list. */
function proveReportAccounts(exp, f) {
  const problems = []
  try {
    if (!f || typeof f.body !== 'string' || !exp || typeof exp.body !== 'string') return { ok: false, problems: ['not an API view'] }
    const body = JSON.parse(f.body)
    if (!body.report || !body.report.accounts || !Array.isArray(body.report.accounts.rows)) problems.push('report.accounts.rows is not a list')
    else delete body.report.accounts
    // The orders are read in pages now, so in a FIXED order: placed (created_at), then order_key. The expected answer's orders put
    // in that order must be F's — the same rows, byte for byte, only sorted (the single read before had no order at all).
    const want = JSON.parse(exp.body)
    const byPlaced = (a, b) => (String(a.created_at) < String(b.created_at) ? -1 : String(a.created_at) > String(b.created_at) ? 1 : String(a.order_key) < String(b.order_key) ? -1 : String(a.order_key) > String(b.order_key) ? 1 : 0)
    if (want.report && Array.isArray(want.report.orders)) want.report.orders = [...want.report.orders].sort(byPlaced)
    if (JSON.stringify({ ...f, body: JSON.stringify(body) }) !== JSON.stringify({ ...exp, body: JSON.stringify(want) })) problems.push('with report.accounts taken out, the answer differs from the expected one (its orders sorted by placed time)')
  } catch (e) { problems.push(`unreadable: ${e.message}`) }
  return { ok: problems.length === 0, problems }
}
module.exports = { LANDED, presetPicker, menuProp, proveReportAccounts }
