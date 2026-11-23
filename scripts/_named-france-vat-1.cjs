// scripts/_named-france-vat-1.cjs — france-vat-1's edit under app/(app) that the path-freeze harnesses see (scripts/cwv-2.cjs), named so
// they can take it back EXACTLY and compare the rest byte for byte (docs/france-vat-1-report.md; a MODULE, listed under shared_modules).
//   • app/(app)/trucks/[slug]/order/page.tsx — the totals preview splits the food by rate (lib/order-tax.ts) where tax is added at
//     checkout and a dish has its own rate: one import, the `pageFoodParts` memo, and `foodParts: pageFoodParts` in the engine call.
// The pairs are in scripts/fixtures/france-vat-1-edits.json ([now, was], recorded from the committed file; putting them back gives the
// file exactly as it was at 59ae6161). undoCode(file, src): the source with the edits put back, `src` unchanged for any other file, or
// null when an edit is not there exactly once (so the caller fails rather than passing a file it cannot account for).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const path = require('path')
const EDITS = require(path.join(__dirname, 'fixtures/france-vat-1-edits.json'))

function undoCode(file, src) {
  const list = EDITS.edits[file]
  if (!list) return src
  let out = src
  for (const [now, was] of list) {
    if (out.split(now).length !== 2) return null
    out = out.replace(now, was)
  }
  return out
}

module.exports = { BASE: EDITS.base, EDITED_FILES: Object.keys(EDITS.edits), undoCode }

/* ── Language Phase 1d Part 2's Payments views (scripts/_lp1d2-named.cjs uses these) ─────────────────────────────────────────────────
 * france-vat-1 changes four kinds of view, each proved here against the expected (BEFORE) view:
 *   1 · tax added (US): the card gains the "Item rates" row right after the rate row — PRECISE: F is the expected view with exactly
 *       ITEM_ROW inserted before the tips row;
 *   2 · prices include tax with no default (GB): the card, which rendered nothing, now renders the "No VAT" form — STRUCTURAL: the
 *       expected view is '' (or, on the whole Payments page, F with exactly that card taken out), and the card is the No VAT dropdown
 *       on "No VAT", its hint, and the Item rates row, with no tips or fee row;
 *   3 · a 20.5 % rate (the fixtures' "out of range" value) is now inside the 0–30 % limit — the refusal became a save of 20500;
 *   4 · a rate where prices include tax (GB) is now taken — the "no rate to set" refusal became a save of 5000. */
const ITEM_ROW = '<div class="py-3" data-charges-row="item-rates"><div class="flex items-start justify-between gap-4"><div class="min-w-0"><p class="text-sm font-semibold text-slate-800">Item rates</p><p class="text-xs text-slate-500 mt-0.5"></p></div><div class="flex-shrink-0"><button type="button" disabled="" data-item-rates-open="true" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">Change item rates</button></div></div></div>'
const TIPS_AT = '<div class="py-3" data-charges-row="tips"'
const CARD_AT = '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"><h3 class="text-base font-bold text-slate-800">Tax, tips and fees</h3>'
const once = (s, a) => s.split(a).length === 2
/** The element starting at `at` (balanced <div>…</div>), or null. */
function divAt(html, at) {
  const i = html.indexOf(at); if (i < 0) return null
  let depth = 0
  const re = /<div\b|<\/div>/g; re.lastIndex = i
  for (let m; (m = re.exec(html));) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) return html.slice(i, re.lastIndex) }
  return null
}
function isNoVatCard(card) {
  return typeof card === 'string' && /data-no-vat-select/.test(card) && /<option value="none"( selected="")?>No VAT<\/option>/.test(card)
    && /data-charges-row="item-rates"/.test(card) && !/data-charges-row="(tips|fee)"/.test(card)
}
function proveLp1d2(id, exp, f) {
  const problems = []
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return null } }
  if (/^api\/(GB|US)\|manage\|charges\.(rateRange|rateNotHere)$/.test(id)) {
    const want = /rateRange$/.test(id) ? 25000 : 8250   // the API fixtures send 25 (over the old 20 %, inside 30 %) and 8.25
    const b = parse(f?.body)
    if (!f || f.status !== 200 || b?.ok !== true || b?.truck?.tax_rate_milli !== want) problems.push(`not a save of ${want}`)
    if (JSON.stringify(f?.writes) !== JSON.stringify([{ table: 'trucks', op: 'update', patch: { tax_rate_milli: want }, ids: ['test-truck'] }])) problems.push('the write is not exactly that one column')
    if (!exp || exp.status !== 400) problems.push('the expected view was not the refusal')
    return { ok: !problems.length, problems }
  }
  if (/\|copy\|checkCharge\|(rateRange|rateNotHere)$/.test(id)) {
    const want = /rateRange$/.test(id) ? 20500 : 5000
    const v = parse(f)
    if (!(v?.ok === true && v?.values?.tax_rate_milli === want && Object.keys(v.values).length === 1)) problems.push(`not ok with tax_rate_milli ${want} only`)
    if (parse(exp)?.ok !== false) problems.push('the expected view was not the refusal')
    return { ok: !problems.length, problems }
  }
  if (/\|chargeErr\|rateRange$/.test(id)) {
    const v = parse(f)
    if (!(v?.ok === true && v?.error === null && Array.isArray(v?.toasts) && v.toasts.length === 0)) problems.push('not a clean save')
    if (parse(exp)?.ok !== false) problems.push('the expected view was not the refusal')
    return { ok: !problems.length, problems }
  }
  // A card the fixtures render with tax ADDED (every US view, and the GB views whose fixture switches tax-added on): the Item rates row,
  // PRECISE. A GB card that rendered nothing (prices include tax, no default): the No VAT form, STRUCTURAL.
  if (/^payments\/(GB|US)\|charges\|/.test(id) && exp !== '') {
    if (typeof exp !== 'string' || !once(exp, TIPS_AT)) return { ok: false, problems: ['the expected card has no single tips row'] }
    const want = exp.replace(TIPS_AT, ITEM_ROW + TIPS_AT)
    return want === f ? { ok: true, problems } : { ok: false, problems: ['F is not the expected card with exactly the Item rates row added'] }
  }
  if (/^payments\/GB\|charges\|/.test(id)) {
    if (divAt(f, CARD_AT) !== f || !isNoVatCard(f)) problems.push('F is not exactly the No VAT card')
    return { ok: !problems.length, problems }
  }
  if (/^payments\/GB\|page\|ready$/.test(id)) {
    const card = typeof f === 'string' ? divAt(f, CARD_AT) : null
    if (!card || !isNoVatCard(card) || !once(f, card)) return { ok: false, problems: ['no single No VAT card on the page'] }
    return f.replace(card, '') === exp ? { ok: true, problems } : { ok: false, problems: ['the page, with the No VAT card taken out, is not the expected page'] }
  }
  return { ok: false, problems: [`not a france-vat-1 view: ${id}`] }
}
module.exports.ITEM_ROW = ITEM_ROW
module.exports.proveLp1d2 = proveLp1d2
