// scripts/_lp-compare-tidy.cjs — ⚠️ RE-PINNED (compare-tidy, 20 October 2026): THE NAMED CHANGES OF compare-tidy, shared by
// the language-phase harnesses (0, 1e, 1e-tidy; through scripts/_lp-stage-b.cjs calcProof and scripts/_lp-pricing-tidy.cjs
// tableNotesProblems, also 1d2). A MODULE.
//
// compare-tidy changed, ON PURPOSE:
//   1. /compare's calculator (app/compare/CostComparison.tsx): the "How many people work the van?" question is GONE (its
//      card, its "One" / "Two or more" buttons, the `staff` state, "Everyone gets their own login."). The "We suggest
//      {plan}" panel moved, unchanged in styling, INTO the online-orders card, right after the "£X included…" line under
//      the slider, and renders whenever that card does; that line no longer waits on the staff answer. The orders, fee,
//      trading-days and months-free cards are disabled only until question 1 is answered, and "See … ↓" + the results
//      render on question 1 alone. Renumbered: system 1, trucks 2, orders 3, fee / trading days 4, months free 5 (the
//      small print's "question 5" → "question 4");
//   2. F1 — the plan table's footnote markers follow ROW POSITION (lib/feature-table.ts noteOrder()): "Kitchen ticket
//      printing" ¹ and its footnote first, "WhatsApp auto-replies" ² second (scripts/_lp-pricing-tidy.cjs);
//   3. F2 — the Village Foodie sitemap: the root, then /contact (yearly, 0.3, no lastmod).
// ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): and then compare-tidy-2 (same file):
//   4. the months-free QUESTION is gone (its card, the "Months free" input, its side text, the `freeMonthsRaw` state):
//      the free months are `freeMonthsOverride ?? offerTrialMonths(catalog) ?? 0` (the page's `?free=N`, whole 1–12);
//      so the cards number 1–4 on each path (system, trucks, orders, fee OR trading days); the small print's
//      "question 4" stays;
//   5. a dimmed card (before question 1 is answered) also carries `pointer-events:none` and `inert` — same look.
// Each a PRECISE transform (exact strings; a transform that must apply and does not is a failure — a stale anchor).
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const src = f => { try { return fs.readFileSync(path.join(REPO, f), 'utf8') } catch { return '' } }

/** The calculator without the staff question (no `staff` state). */
const CALC_LANDED = (() => { const s = src('app/compare/CostComparison.tsx'); return !!s && !/const\s*\[\s*staff\s*,/.test(s) })()
/** The plan table's footnotes numbered by row position. */
const NOTES_LANDED = /export function noteOrder\(/.test(src('lib/feature-table.ts'))
/** ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): the calculator without the months-free question (no `freeMonthsRaw` state). */
const FREE_LANDED = (() => { const s = src('app/compare/CostComparison.tsx'); return !!s && !/const\s*\[\s*freeMonthsRaw\s*,/.test(s) })()
/** Village Foodie's sitemap lists /contact. */
const SITEMAP_LANDED = /BRANDS\.VILLAGE_FOODIE\.domain\}\/contact`/.test(src('app/sitemap.ts'))

// ── 1 · the calculator ────────────────────────────────────────────────────────────────────────────────────────────
const CARD_OPEN = '<div class="rounded-2xl border bg-white p-5 shadow-sm transition md:p-6" style="border-color:#E2E8F0;opacity:'
const BADGE = /(<span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-black text-slate-500" style="background-color:#F1F5F9">)(\d)(<\/span>)/g
const PEOPLE_TITLE = /<p class="text-base font-bold">How many people work (?:the (?:van|truck)|across your (?:vans|trucks))\?<\/p>/
const SELECTED = 'style="background-color:#EF8B2C;border-color:#EF8B2C;color:#fff"'
const PANEL_OPEN = '<div class="mt-4 rounded-xl px-5 py-4" style="background-color:#F8FAFC">'
const EYEBROW_SUGGEST = '<p class="text-xs font-bold uppercase tracking-wider text-slate-400">We suggest</p>'
const SLIDER = /<input type="range"[^>]*aria-label="Monthly online order value per truck"[^>]*\/>/
const ALLOWANCE_OPEN = '<p class="mt-3 text-sm leading-relaxed text-slate-600">'
const SEE_OPEN = '<p class="mt-6 text-center"><button type="button" class="text-sm font-semibold text-slate-500 underline underline-offset-4 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">'
const SEE_LABEL = { yes: 'See your saving ↓', no: 'See what it costs ↓' }
const RESULTS_OPEN = '<div id="cost-results" class="mt-6 scroll-mt-4 space-y-4">'
const SMALL_PRINT = '<p class="mt-5 text-xs leading-relaxed text-slate-500">'
const QUESTION_REF = ['The all-in figure in question 5 includes it', 'The all-in figure in question 4 includes it']
const MONTHS_INPUT = /<input type="number" step="1" min="0" max="12"[^>]*aria-label="Months free"[^>]*\/>/
const DIMMED = [CARD_OPEN + '0.45"', CARD_OPEN + '0.45;pointer-events:none" inert=""']
// Placeholders: each sits wholly inside a region scripts/_lp-stage-b.cjs calcProof cuts from both sides (the allowance
// sentence, the suggested plan from its eyebrow, the results), so its content is never compared — only where it sits.
const HOLE = what => `⟦compare-tidy: ${what} — cut by Stage B's calcProof⟧`

/** The end (index after the closing tag) of the balanced <div …>…</div> that opens at `start`, or -1. */
function closeDiv(html, start) {
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let d = 0
  for (let m; (m = re.exec(html));) { d += m[0] === '</div>' ? -1 : 1; if (d === 0) return m.index + m[0].length }
  return -1
}

/**
 * BEFORE's calculator HTML (any surrounding page) → compare-tidy's structure. PRECISE, by named steps; throws on a stale
 * anchor (no staff card, no orders card, a step that must apply and does not).
 *   a. the staff card (step 3, "How many people work …?") is removed whole; its opacity says whether question 1 was
 *      answered (1) or not (0.45), its selected button whether the staff question was;
 *   b. in the orders card, after the slider: the "£X included…" line (BEFORE's, or a placeholder where BEFORE had none —
 *      the staff question unanswered), then the suggested-plan panel (BEFORE's own, moved; or the panel's unchanged
 *      wrapper + "We suggest" eyebrow + a placeholder);
 *   c. question 1 answered but not the staff question: the cards after the trucks card lose `opacity:0.45` (→ 1), and
 *      "See … ↓" (the path's label) + the results (a placeholder) are added before the small print;
 *   d. the step badges after the trucks card renumber 4→3, 5→4, 6→5; the small print's "question 5" → "question 4".
 * ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026), on a tree with FREE_LANDED, between c and d:
 *   e. the months-free card (the one holding the "Months free" number input, max 12) is removed whole; so d leaves the
 *      badges exactly 1, 2, 3, 4;
 *   f. every card still dimmed (`opacity:0.45`) gains `;pointer-events:none` and ` inert=""`.
 */
function calc(html) {
  if (typeof html !== 'string') return html
  const fail = m => { throw new Error(`compare-tidy calc: ${m} (stale anchor)`) }
  // a. the staff card
  const t = PEOPLE_TITLE.exec(html); if (!t) fail('BEFORE has no staff question')
  const cs = html.lastIndexOf(CARD_OPEN, t.index); if (cs < 0) fail('the staff question has no card')
  const ce = closeDiv(html, cs); if (ce < 0) fail('the staff card does not close')
  const card = html.slice(cs, ce)
  const q1 = card.startsWith(CARD_OPEN + '1"') ? true : card.startsWith(CARD_OPEN + '0.45"') ? false : fail('the staff card has no opacity')
  const staffAnswered = card.includes(SELECTED)
  const ps = card.indexOf(PANEL_OPEN)
  const panel = ps < 0 ? null : card.slice(ps, closeDiv(card, ps))
  if (staffAnswered !== !!panel) fail(`the staff card ${staffAnswered ? 'is answered but has no panel' : 'has a panel but no answer'}`)
  let v = html.slice(0, cs) + html.slice(ce)
  // b. the orders card: the "£X included…" line, then the panel
  const sl = SLIDER.exec(v); if (!sl || sl.index < cs) fail('no slider after the staff card')
  let at = sl.index + sl[0].length
  if (v.startsWith(ALLOWANCE_OPEN, at)) { if (!staffAnswered) fail('an allowance line without a staff answer'); at = v.indexOf('</p>', at) + 4 }
  else if (staffAnswered) fail('the staff question answered but no allowance line')
  else { const line = ALLOWANCE_OPEN + HOLE('the “£X included…” line') + '</p>'; v = v.slice(0, at) + line + v.slice(at); at += line.length }
  if (!v.startsWith('</div>', at)) fail('the allowance line is not the orders card’s last child')
  const put = panel || PANEL_OPEN + EYEBROW_SUGGEST + HOLE('the suggested plan') + '</div>'
  v = v.slice(0, at) + put + v.slice(at)
  // c. question 1 alone ungates the cards and the results
  if (q1 && !staffAnswered) {
    const n = v.split(CARD_OPEN + '0.45"').length - 1
    if (!n) fail('question 1 answered, the staff question not, yet no card after it was disabled')
    v = v.split(CARD_OPEN + '0.45"').join(CARD_OPEN + '1"')
    if (v.includes(RESULTS_OPEN) || v.includes(SEE_OPEN)) fail('results without a staff answer')
    const sp = v.indexOf(SMALL_PRINT); if (sp < 0) fail('no small print')
    const first = v.indexOf(CARD_OPEN), fc = v.slice(first, closeDiv(v, first))
    const btn = [...fc.matchAll(/<button\b[^>]*>/g)].map(m => m[0].includes(SELECTED))
    const path = btn[0] ? 'yes' : btn[1] ? 'no' : fail('question 1 has no selected answer')
    v = v.slice(0, sp) + SEE_OPEN + SEE_LABEL[path] + '</button></p>' + RESULTS_OPEN + HOLE('the results') + '</div>' + v.slice(sp)
  }
  // e, f. (compare-tidy-2) the months-free card; dimmed cards inert
  if (FREE_LANDED) {
    const mi = MONTHS_INPUT.exec(v); if (!mi) fail('BEFORE has no months-free input')
    const ms = v.lastIndexOf(CARD_OPEN, mi.index), me = ms < 0 ? -1 : closeDiv(v, ms)
    if (me < mi.index) fail('the months-free input has no card')
    v = v.slice(0, ms) + v.slice(me)
    if (MONTHS_INPUT.test(v)) fail('a second months-free input')
    v = v.split(DIMMED[0]).join(DIMMED[1])
  }
  // d. renumber; the small print's question reference
  const badges = []
  v = v.replace(BADGE, (m, a, n, b) => { const k = Number(n) >= 4 ? Number(n) - 1 : Number(n); badges.push(k); return `${a}${k}${b}` })
  if (FREE_LANDED ? badges.join() !== '1,2,3,4' : badges.length < 4) fail(`step badges ${badges.join(', ')}`)
  v = v.split(QUESTION_REF[0]).join(QUESTION_REF[1])
  return v
}

// ── 3 · the Village Foodie sitemap ────────────────────────────────────────────────────────────────────────────────
const VF_ROOT = 'https://www.villagefoodie.co.uk/'
const VF_CONTACT = { url: 'https://www.villagefoodie.co.uk/contact', changeFrequency: 'yearly', priority: 0.3 }
/** [the root entry] → [the root entry, /contact] — exactly; anything else is a stale anchor. */
function sitemapVF(v) {
  if (!Array.isArray(v) || v.length !== 1 || !v[0] || v[0].url !== VF_ROOT) throw new Error('compare-tidy-vf-sitemap: BEFORE is not the one root entry (stale anchor)')
  return [...v, { ...VF_CONTACT }]
}

// ── the items, over the Phase 1e view ids (`<area>/<part>|<CC>|<variant>`), applied after pricing-tidy's
// (the calculator and the plan table's footnotes live inside Stage B's structural proofs: scripts/_lp-stage-b.cjs)
const ITEMS = [
  ...(SITEMAP_LANDED ? [{ id: 'compare-tidy-vf-sitemap', what: '⚠️ RE-PINNED (compare-tidy F2, 20 October 2026): the Village Foodie sitemap lists the root, then /contact (changeFrequency yearly, priority 0.3, no lastmod) — PRECISE, the one entry added',
    views: id => /^parts\/sitemap\|(GB|US)\|villagefoodie/.test(id), apply: (id, v) => sitemapVF(v) }] : []),
]

module.exports = { ITEMS, CALC_LANDED, FREE_LANDED, NOTES_LANDED, SITEMAP_LANDED, calc, sitemapVF, VF_CONTACT }
