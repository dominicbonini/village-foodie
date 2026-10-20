// lib/plans-pdf.ts — the plans-and-features PDF, generated from the same source the landing table
// renders, for every caller that needs one.
//
// 🔴 IT MOVED HERE ON 30 SEPTEMBER 2026 AND NOTHING ABOUT IT CHANGED. Every line below — the price
// policy, the wordmark, the table build, the Chromium launcher — came out of
// `app/landing/features-pdf/route.ts` verbatim; that route now imports `buildPlansPdfHtml` and
// `generatePlansPdf` and keeps its own admin gate and its own headers.
//
// ⚠️ WHY IT HAD TO MOVE. Outreach's compose window gained a "Plans PDF" button, and the alternatives
// were worse in ways worth recording: having the server fetch its own URL needs this request's admin
// cookie replayed by a second HTTP hop (a second auth path to get wrong), and copying `buildHtml`
// would produce exactly the hand-built duplicate the original file's header warns about — "correct
// the day it was written and wrong the first time a row changed". One generator, two callers.
//
// 🔴 A Route Handler CANNOT export helpers. Next validates a route file's exports and refuses
// anything that is not a handler, so "just export buildHtml from the route" is not an option —
// which is the mechanical reason this is a lib and not a smaller change.
//
// 🔴 STAGE B OF THE NEW PRICING (docs/pricing-pages-report.md): THE DOCUMENT IS THE NEW PRICING SECTION AND THE NEW
// PLAN TABLE — the trial banner, one card per public plan, "Which plan is cheapest for me?", then the /features table
// (WHAT YOU PAY and the three feature groups) and the card-fee footnote — in this file's own styling. Every plan, price,
// fee, allowance, switch and the trial length come from public.plans / plan_prices / plan_features (lib/plans.ts, read
// through lib/plan-offer.ts — the module the landing and /features read); every word from the `pricing` / `planTable`
// messages. ⛔ NO PLAN KEY, NAME OR NUMBER IS WRITTEN HERE. The frozen display copy it used to read is deleted.
import type { CountrySettings } from '@/lib/country-settings-types'
import { moneyFormatOf } from '@/lib/country-settings-types'
import { getCountrySettings } from '@/lib/country-settings'
import { HATCHGRAB_NAVY_HEX, HATCHGRAB_ORANGE_HEX, HATCHGRAB_WORDMARK_SVG } from '@/lib/brand'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { maskPrice, maskPriceFor, PRICING_PUBLISHED } from '@/lib/pricing'
import { priceText } from '@/lib/price-text'
import { PRICE_WORD } from '@/lib/price-words'
import { formatAmount, formatWholeAmount, pctLabel } from '@/lib/money-format'
import { cardFeeOnlineLabel } from '@/lib/card-fees'
import type { PlanCatalog } from '@/lib/plans'
import { getPlanCatalog } from '@/lib/plans-server'
import {
  offerPlans, offerTrialMonths, offerFallback, baseBullets, addedFeatureBullets, moneyBullets, cheapestBands,
  tableGroups, tableCell, walkUpFree, type OfferPlan,
} from '@/lib/plan-offer'
import { noteMarker, planTableNotes } from '@/lib/feature-table'
// Language Phase 0: the document's words in the country's locale — its first message, the heading.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/plansPdf'
import '@/lib/i18n/catalog/planFeatures'
import '@/lib/i18n/catalog/pricing'
import '@/lib/i18n/catalog/planTable'
import '@/lib/i18n/catalog/planPrompt'

// ── 🔴 THE PAGE SIZE IS THE COUNTRY'S (Language Phase 1e). A US reader prints on US Letter; A4 there is clipped or
// shrunk. The CSS `@page` rule and Chromium's `format` both read this one answer, so they cannot disagree.
// ⚠️ GB (and every other country) stays A4 — byte-identical HTML and the same `page.pdf` options as before.
// The Letter countries are the ones that use it as their standard paper size; only US is switched on today.
const LETTER_COUNTRIES = new Set(['US', 'CA'])
export function pdfPaperOf(s: Pick<CountrySettings, 'countryCode'>): { css: string; format: 'A4' | 'Letter' } {
  return LETTER_COUNTRIES.has(s.countryCode) ? { css: 'letter', format: 'Letter' } : { css: 'A4', format: 'A4' }
}
// ── 🔴 THE PRICE POLICY. ONE CONSTANT, THREE MODES, AND IT IS A DECISION NOT A DEFAULT. ─────────────
//   'follow-flag'  prices obey NEXT_PUBLIC_PRICING_PUBLISHED exactly as Billing does. While the flag is
//                  off the PDF prints "TBC" for £/% amounts; Free, 0%, Pay at Hatch, Unlimited and the
//                  bare '—' are exempt (lib/pricing.ts NON_SECRET_PRICE) and still read correctly.
//   'always-real'  real prices regardless of the flag. ⚠️ A PDF IS FORWARDABLE AND KEPT. Choosing this
//                  publishes the price list to anyone the recipient sends it to, permanently.
//   'omit'         no price header row and no fee table at all — features only.
// 🔴 SET TO 'always-real' ON 2 SEPTEMBER 2026, DELIBERATELY, AND THE REASONING IS THE OPERATOR'S:
// "The route is admin-only and the PDF is for sending deliberately, so a masked one does not do the job."
// It shipped on 'follow-flag' for one day and produced a PDF whose plan prices read "TBC" — safe, and
// useless for the thing it exists for.
// ⚠️ WHAT THIS MEANS, STATED SO NOBODY HAS TO REDISCOVER IT: this PDF now carries the real price list
// whatever NEXT_PUBLIC_PRICING_PUBLISHED says, and a PDF is forwardable and kept. The gate in GET()
// controls who can GENERATE one; it controls nothing about where the file goes afterwards. Sending it is
// a deliberate act and the document should be treated as published the moment it leaves an outbox.
// 🟢 THE OTHER TWO MODES STILL WORK and this is still a one-word switch back.
type PriceMode = 'follow-flag' | 'always-real' | 'omit'
// ⚠ `as PriceMode`, not a plain annotation: TypeScript narrows a `const` to its literal initialiser,
// which makes every comparison against the other two modes a compile error and would force whoever
// changes this to edit the comparisons too. The cast keeps all three modes live as a one-word switch.
const PRICE_MODE = 'always-real' as PriceMode

const px = (v: string) => (PRICE_MODE === 'always-real' ? v : maskPrice(v))

// ── 🔴 THE WORDMARK. INLINED AS A DATA URI, AND IT HAS TO BE. ─────────────────────────────────
// This document is produced with page.setContent(), not by navigating to our own origin, so the page
// has NO base URL: `src="/logos/…"` would resolve to nothing and the header would render empty. Reading
// the file off disk and inlining it is the only way the artwork can arrive.
// 🟢 PATH FROM lib/brand.ts, NOT TYPED OUT — HATCHGRAB_WORDMARK_SVG is '/logos/hatchgrab-wordmark.svg'
// and is the same constant every other surface uses. It is a public/ URL, so it is joined onto process.cwd().
// 🔴 THE DARK (navy/orange) VARIANT, BECAUSE THIS DOCUMENT IS WHITE. The white variant exists at
// HATCHGRAB_WORDMARK_WHITE_SVG for dark grounds; using it here would render invisible.
// ⚠️ READ ONCE PER REQUEST, not at module load: a missing file must fail this request, not the build.
function wordmarkDataUri(): string | null {
  try {
    const abs = path.join(process.cwd(), 'public', HATCHGRAB_WORDMARK_SVG.replace(/^\//, ''))
    return 'data:image/svg+xml;base64,' + readFileSync(abs).toString('base64')
  } catch (err) {
    // 🔴 A MISSING LOGO MUST NOT COST THE WHOLE DOCUMENT. The table is the point; the wordmark is
    // decoration. Logged so it is not silent, then the header renders without it.
    console.error('[features-pdf] wordmark could not be read, rendering without it:', err)
    return null
  }
}

// 🔴 4.548:1 — THE MANDATORY CROP RATIO, RECORDED IN lib/brand.ts:26-29: the artwork is tight-cropped
// to viewBox "21 39 1287 283", and "EVERY hardcoded width/height PAIR must use 4.548:1 — a stale pair
// letterboxes or squashes." 136.44 / 30 = 4.548 exactly. Change one number and you must change both.
const WORDMARK_H = 30
const WORDMARK_W = +(WORDMARK_H * 4.548).toFixed(2)   // 136.44

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── 🔴 THE TICK IS DRAWN, NOT TYPED, AND THIS IS NOT A STYLE CHOICE ─────────────────────────────
// U+2713 (✓) IS A DINGBATS CHARACTER AND THE PRODUCTION FONT HAS NO GLYPH FOR IT.
// On Vercel this route renders under @sparticuz/chromium, whose README states: "The AWS Lambda runtime
// is not provisioned with any font faces. Because of this, this package ships with Open Sans." Open Sans
// covers Latin, Greek and Cyrillic — NOT Dingbats. Verified by reading the cmap of all three bundled
// TTFs (Regular, Bold, Italic): U+2713 is MISSING from every one, while U+2014 (—) and U+00A3 (£) are
// present. So every tick rendered as NOTHING in production while the rest of the table was perfect.
// 🔴 IT NEVER WORKED IN PRODUCTION. It looked fine in every PDF generated on a Mac, because desktop
// Chrome falls back to a system font that has the glyph. The environment differed, not the code.
// 🟢 A SWEEP, NOT A PATCH: every visible character in the generated document was checked against the
// production font. 72 distinct characters, and U+2713 was the ONLY one missing — 69 occurrences. There
// is no second victim of this class hiding in the footnotes or the plan names.
// ⚠️ THE PATH IS THE LANDING PAGE'S OWN CHECK MARK (app/landing/page.tsx's Check component), so the
// document and the page draw the same tick.
// ⚠️ Its label is a word (`planFeatures.cell.included`), so the tick is built in the document's locale.
const tick = (locale: string) => `<svg class="tick" viewBox="0 0 12 12" role="img" aria-label="${esc(translatorFor(locale, 'planFeatures')('cell.included'))}">`
  + '<path d="M2 6.5 L4.6 9 L10 3"/></svg>'

/** A message with markup (`<b>`, `<plan>`) as HTML. Its PARAMETERS are data (plan names) and are escaped here; the
 *  message text itself is ours. */
type Markup = { markup: (key: never, values: Record<string, unknown>) => string }
const html = (t: unknown, key: string, values: Record<string, string | number> = {}): string => {
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) safe[k] = typeof v === 'string' ? esc(v) : v
  // The tags first, the values last: a message whose `{plan}` is a VALUE (the cheapest bar) keeps it; one whose <plan> is a
  // TAG (the banner) gets the tag.
  return (t as Markup).markup(key as never, { b: (c: string) => `<b>${c}</b>`, plan: (c: string) => `<u>${c}</u>`, ...safe })
}

/**
 * The document's HTML for ONE country's prices. Pure apart from reading the wordmark file.
 * 🔴 MASKING: the existing rule — prices are real (PRICE_MODE 'always-real', below) EXCEPT for a country that is
 * switched off, whose every amount is masked to the "TBC" / US "TBD" word, exactly as Manage masks a switched-off
 * country's truck (components/usePlanPriceLabel.ts) — a prospect in a country not yet open never gets a price list.
 */
export function buildPlansPdfHtml(s: CountrySettings, catalog: PlanCatalog): string {
  const wordmark = wordmarkDataUri()
  // 🔴 THE DOCUMENT'S WORDS ARE THE COUNTRY'S LOCALE (Language Phase 1e). A price is masked FIRST (on its code), then shown.
  const locale = s.locale
  const t = translatorFor(locale, 'plansPdf')
  const tp = translatorFor(locale, 'pricing')
  const tt = translatorFor(locale, 'planTable')
  const tRow = translatorFor(locale, 'planFeatures')
  const tPrompt = translatorFor(locale, 'planPrompt')
  const masked = !s.enabled
  const show = (v: string) => priceText(masked ? maskPriceFor(v, true) : px(v), locale)
  const paper = pdfPaperOf(s)
  const money = moneyFormatOf(s)
  const plans = offerPlans(catalog, s.countryCode)
  const months = offerTrialMonths(catalog)
  const fallback = offerFallback(catalog, s.countryCode)
  const bands = cheapestBands(plans, s.currency)
  const fee = (p: OfferPlan) => show(pctLabel(p.feeBps / 100, s))
  const whole = (minor: number) => show(formatWholeAmount(minor, money))
  const words = (f: string) => (tp.has(`added.${f}` as never) ? tp(`added.${f}` as never) : tPrompt(`features.${f}.name` as never))
  const soon = `<span class="soon-chip">${esc(tp('comingSoon'))}</span>`
  const omit = PRICE_MODE === 'omit'

  // ── THE TRIAL BANNER ──
  const banner = months === null ? '' : `
    <div class="banner"><b>${esc(tp('banner.title', { months }))}</b>
      <span>${html(tp, 'banner.body', { brand: priceText(PRICE_WORD.payAtHatch, locale), fallback: fallback.plan.name, fallbackFree: fallback.free ? 'yes' : 'no' })}</span></div>`

  // ── THE CARDS — one per public plan, the landing's content ──
  const feeSentence = (p: OfferPlan) => p.shape === 'feeOnly' ? html(tp, 'fee.feeOnly', { fee: fee(p) })
    : p.shape === 'included' ? html(tp, 'fee.included', { included: whole(p.includedMinor as number), fee: fee(p) })
      : html(tp, 'fee.noFee')
  const cards = `<div class="cards">${plans.map((p, i) => {
    const prev = i > 0 ? plans[i - 1] : null
    const items = prev === null
      ? [`<li class="lead">${esc(tp('card.everything'))}</li>`, ...baseBullets(catalog, p).map(k => `<li>${esc(tp(`base.${k}` as never))}</li>`)]
      : [`<li class="lead">${esc(tp('card.everythingIn', { plan: prev.plan.name }))}</li>`,
        ...addedFeatureBullets(catalog, p, prev).map(f => `<li>${esc(words(f.feature))}${f.comingSoon ? soon : ''}${f.sub.map(x => `<span class="sub">${esc(words(x.feature))}${x.comingSoon ? soon : ''}</span>`).join('')}</li>`),
        ...moneyBullets(p).map(m => `<li>${esc(tp(`money.${m}`))}</li>`)]
    return `<div class="card${p.highlighted ? ' hl' : ''}">
      ${p.highlighted ? `<div class="tag">${esc(tp('card.mostTrucks'))}</div>` : ''}
      <div class="c-name">${esc(p.plan.name)}</div>
      ${p.plan.subtitle ? `<div class="c-who">${esc(p.plan.subtitle)}</div>` : ''}
      ${omit ? '' : `<div class="c-price">${esc(show(formatAmount(p.monthlyMinor, money)))} <span>${esc(tp('card.perTruckMonth'))}</span></div>
      <div class="c-fee">${feeSentence(p)}</div>`}
      <ul>${items.join('')}</ul>
    </div>`
  }).join('')}</div>`

  // ── WHICH PLAN IS CHEAPEST ──
  const bar = omit || bands.length === 0 ? '' : `<div class="cheap"><b>${esc(tp('bar.title'))}</b> ${bands.length === 1
    ? html(tp, 'bar.only', { plan: bands[0].plan.plan.name })
    : bands.map((band, i) => i === 0 ? html(tp, 'bar.first', { to: whole(band.toMinor as number), plan: band.plan.plan.name })
      : band.toMinor === null ? html(tp, 'bar.last', { from: whole(band.fromMinor as number), plan: band.plan.plan.name })
        : html(tp, 'bar.middle', { from: whole(band.fromMinor as number), to: whole(band.toMinor), plan: band.plan.plan.name })).join(' · ')}</div>`

  // ── THE TABLE — the /features table (components/pricing/PlanTable.tsx), as print HTML ──
  const hlKey = plans.find(p => p.highlighted)?.plan.key
  const hl = (p: OfferPlan) => (p.plan.key === hlKey ? ' hl' : '')
  const cols = plans.length + 1
  const none = `<span class="no">—</span>`
  const heads = plans.map(p => `<th class="c${hl(p)}"><div class="th-plan">${esc(p.plan.name)}</div>${omit ? '' : `<div class="th-price">${esc(tt('perMonth', { price: show(formatAmount(p.monthlyMinor, money)) }))}</div>`}</th>`).join('')
  const row = (label: string, cells: string[], marker?: string) => `<tr><td class="f"><span class="f-name">${esc(label)}${marker ? `<sup>${esc(marker)}</sup>` : ''}</span></td>${cells.map((c, i) => `<td class="c${hl(plans[i])}">${c}</td>`).join('')}</tr>`
  const grp = (label: string) => `<tr class="grp"><td colspan="${cols}">${esc(label)}</td></tr>`
  const pay = omit ? '' : grp(tt('group.pay'))
    + row(tt('pay.included'), plans.map(p => p.shape === 'feeOnly' ? none : `<span class="val">${esc(p.includedMinor === null ? tt('cell.unlimited') : whole(p.includedMinor))}</span>`))
    + row(tt('pay.fee'), plans.map(p => p.shape === 'noFee' ? `<span class="val">${esc(show(pctLabel(0, s)))}</span>`
      : p.shape === 'included' ? html(tt, 'cell.feeAbove', { fee: fee(p), included: whole(p.includedMinor as number) }) : `<span class="val">${esc(fee(p))}</span>`))
    + row(tt('pay.walkUp'), plans.map(p => walkUpFree(catalog, p) ? `<span class="val">${esc(tt('cell.free'))}</span>` : none))
  const sections = tableGroups().map(g => grp(tt(`group.${g.group}` as never)) + g.rows.map(r => row(tRow(`row.${r.id}.name` as never), plans.map(p => {
    const c = tableCell(catalog, r, p)
    return c === 'off' ? none : c === 'soon' ? `<span class="soon">${esc(tt('cell.comingSoon'))}</span>` : `<span class="yes">${tick(locale)}</span>`
  }), r.note ? noteMarker(r.note) : undefined)).join('')).join('')

  // pricing-tidy (20 October 2026): the card-fee footnote, then the rows' disclosures (¹ WhatsApp auto-replies, ² Kitchen
  // ticket printing) — the same notes /features and Billing print (components/pricing/PlanTable.tsx planTableNotes).
  const footnote = `<p>${esc(tp('footnote', { cardFee: show(cardFeeOnlineLabel(s)), country: s.shortName ?? s.name }))}</p>`
    + planTableNotes(locale).map(n => `<p><sup>${esc(n.marker)}</sup> ${esc(n.text)}</p>`).join('')
  const priceNote = (PRICE_MODE === 'follow-flag' && !PRICING_PUBLISHED) || masked
    ? `<p class="tbc">${esc(t('priceNoteMasked'))}</p>` : ''
  const omitNote = omit
    ? `<p class="tbc">${esc(t('omitNote'))}</p>` : ''

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: ${paper.css}; margin: 14mm 12mm 16mm; }
  /* 🟢 THE ONLY TWO BRAND COLOURS, INTERPOLATED FROM lib/brand.ts — see the import note above.
     Everything else on this page stays the neutral greys it already was. */
  :root { --navy: ${HATCHGRAB_NAVY_HEX}; --orange: ${HATCHGRAB_ORANGE_HEX}; }
  * { box-sizing: border-box; }
  body { font: 9.5px/1.35 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1A2233; margin: 0; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -.02em; color: var(--navy); }
  /* 🔴 ONE ROW: wordmark, title, generated date. The title's "Every feature, side by side" sub-line
     was removed on 2 September 2026 so the title sits on the SAME baseline as the wordmark rather than
     stacked above a second line, which pushed it off the logo's centre. "align-items: center" is what
     lines the two up; the date is pushed to the far right by "margin-left: auto".
     The rule beneath is the only place brand orange appears — see the greyscale note in
     docs/pdf-styling-report.md 7: nothing on this page depends on it to be understood.
     ⚠️ THE DATE IS NOT DECORATION. This document is forwarded and kept, and it carries real prices; the
     reader must be able to tell how old it is. Moved, never dropped. */
  /* 🔴 BASELINE, NOT CENTRE. "center" lines up the BOXES, and the boxes are not comparable: the
     wordmark is tight-cropped artwork whose swoosh rises well above its letterforms, so centring the
     boxes left the two pieces of type on DIFFERENT BASELINES — measured, the wordmark's letters sat
     6.7px lower than the title's, which is exactly what reads as "not aligned". Baseline alignment puts
     the two sets of letters on one line, which is what the eye is actually looking for. */
  .doc-head { display: flex; align-items: baseline; gap: 12px; padding-bottom: 6px; margin-bottom: 12px;
              border-bottom: 2px solid var(--orange); }
  /* 🟢 THE DATE DROPS TO THE BOTTOM INSTEAD OF SHARING THE TITLE'S BASELINE — it is metadata, not
     part of the title, and sitting just above the rule is what was asked for. */
  .gen { margin-left: auto; align-self: flex-end; color: #5F7A99; font-size: 9px; white-space: nowrap; }
  /* 🔴 136.44 x 30 = 4.548:1, the mandatory crop ratio. display:block stops inline baseline gaps. */
  /* 🔴 136.44 x 30 = 4.548:1, the mandatory crop ratio. display:block stops inline baseline gaps.
     ⚠️ THE 1.33px NUDGE IS MEASURED, NOT TASTE. align-items:baseline uses an image's BOTTOM EDGE as its
     baseline, and this artwork's tight crop leaves about 1.33px of space below the letterforms at 30px
     tall — so the wordmark's letters landed 1.33px ABOVE the title's. Pushing the image down by that
     amount puts the two sets of letters on one line. Measured from the rendered pixels, not the boxes.
     If WORDMARK_H changes, re-measure this: it scales with the artwork, it is not a constant. */
  .mark { display: block; width: ${WORDMARK_W}px; height: ${WORDMARK_H}px; position: relative; top: 1.33px; }
  /* 🔴 table-layout: fixed IS HALF THE ALIGNMENT FIX. With the default "auto", the browser sizes
     columns from CONTENT and the width declarations below are hints it may ignore, so the header and the
     body could resolve to different grids. "fixed" makes the declared widths authoritative for both. */
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* 🔴 AND THIS IS THE OTHER HALF — IT IS THE BUG ITSELF. This rule read "th, td { text-align: left }",
     which applied to the HEADER cells, while "td.c" below centred only the BODY cells. So every plan name
     sat at the left edge of its column while the tick beneath it sat at the centre — measured at 36-45px
     out, and UNEVEN, because a left-aligned word's centre depends on how long the word is ("Starter" was
     36px out, "Pro" 44.9px). Alignment is now declared per COLUMN CLASS and shared by th and td, so a
     header and its cells cannot disagree. */
  th, td { vertical-align: top; padding: 5px 6px; }
  th.f, td.f { width: 40%; text-align: left; }   /* Stage B: the plan columns share the other 60% — one per public plan. */
  th.c, td.c { width: ${(60 / Math.max(1, plans.length)).toFixed(2)}%; text-align: center; }
  thead th { border-bottom: 2px solid var(--navy); }
  /* 🔴 REPEAT THE HEADER ON EVERY PAGE. A comparison table whose plan columns are unlabelled after
     page 1 is unreadable, and this is the one thing print gets wrong by default. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .th-plan { font-weight: 700; font-size: 11px; }
  .th-price { font-weight: 700; font-size: 10px; }
  tbody tr { border-bottom: 1px solid #E6ECF2; }
  tr.grp td { background: #F5F8FB; font-weight: 700; font-size: 9px; letter-spacing: .1em;
              text-transform: uppercase; color: var(--navy); border-top: 1px solid #D8E2EC; }
  .f-name { display: block; font-weight: 600; }
  .yes { color: #1F7A3D; font-weight: 700; }
  /* The drawn tick. "stroke: currentColor" means it inherits .yes's green, so the colour still lives in
     one place. Sized to the 9.5px body text and nudged onto its baseline. */
  .tick { width: 10px; height: 10px; display: inline-block; vertical-align: -1px;
          fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .no  { color: #93A1B4; }
  .soon { color: #B26B0F; font-size: 8px; }
  .val { font-weight: 600; }
  sup { font-size: 7px; color: #5F7A99; }
  .fn h3 { font-size: 10px; margin: 0 0 3px; color: var(--navy); }
  /* ── Stage B: the pricing section (banner, cards, cheapest bar) above the table, in this document's palette. ── */
  .banner { border: 1px solid #F3D3AE; background: #FFF7EE; border-radius: 6px; padding: 7px 9px; margin-bottom: 10px; }
  .banner b { display: block; font-size: 12px; color: var(--navy); margin-bottom: 2px; }
  .banner span { color: #44566B; }
  .cards { display: flex; gap: 8px; margin-bottom: 8px; break-inside: avoid; }
  .card { flex: 1; min-width: 0; border: 1px solid #D8E2EC; border-radius: 6px; padding: 8px 9px; position: relative; }
  .card.hl { border: 2px solid var(--orange); }
  .tag { position: absolute; top: -7px; left: 9px; background: var(--orange); color: #fff; font-size: 7px; font-weight: 700;
         letter-spacing: .1em; padding: 1px 5px; border-radius: 3px; }
  .c-name { font-size: 12px; font-weight: 700; color: var(--navy); }
  .c-who { color: #5F7A99; font-size: 8.5px; }
  .c-price { font-size: 15px; font-weight: 700; margin-top: 4px; }
  .c-price span { font-size: 8.5px; font-weight: 400; color: #5F7A99; }
  .c-fee { margin: 3px 0 5px; color: #44566B; }
  .card ul { margin: 0; padding-left: 12px; } .card li { margin-bottom: 1px; }
  .card li.lead { list-style: none; margin-left: -12px; font-weight: 700; }
  .card .sub { display: block; color: #5F7A99; font-size: 8.5px; }
  .soon-chip { margin-left: 4px; font-size: 7px; text-transform: uppercase; letter-spacing: .05em; color: #93A1B4;
               border: 1px solid #D8E2EC; border-radius: 3px; padding: 0 3px; }
  .cheap { margin-bottom: 12px; color: #44566B; }
  .cheap b { color: #1A2233; }
  th.hl, td.hl { background: #FFF7EE; }
  .fn { margin-top: 12px; border-top: 1px solid #D8E2EC; padding-top: 8px; break-inside: avoid; }
  .fn p { margin: 0 0 4px; color: #44566B; font-size: 8px; }
  .tbc { font-size: 8px; color: #B26B0F; margin: 6px 0 0; }
  </style></head><body>
    <div class="doc-head">
      ${wordmark ? `<img class="mark" src="${wordmark}" width="${WORDMARK_W}" height="${WORDMARK_H}" alt="HatchGrab">` : ''}
      <h1>${esc(translatorFor(s.locale, 'plansPdf')('title'))}</h1>
      <span class="gen">${esc(t('generated', { date: new Date().toISOString().slice(0, 10) }))}</span>
    </div>
    ${banner}${cards}${bar}
    <table>
      <thead><tr><th class="f"></th>${heads}</tr></thead>
      <tbody>${pay}${sections}</tbody>
    </table>
    <div class="fn"><h3>${esc(t('smallPrint'))}</h3>${footnote}${priceNote}${omitNote}
      <p>${esc(t('terms'))}</p>
    </div>
  </body></html>`
}

// The launcher shape is copied from app/api/manage/verify-schedule-url/route.ts so both paths behave
// the same on Vercel and locally. Serverless Chromium first; full puppeteer's bundled Chrome as the
// local fallback.
export async function launchPdfBrowser() {
  try {
    const chromium = require('@sparticuz/chromium')
    const puppeteer = require('puppeteer-core')
    return await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  } catch (serverlessErr: any) {
    console.error('[features-pdf] serverless chromium launch failed, falling back to full puppeteer:', serverlessErr?.message || serverlessErr)
    const puppeteer = require('puppeteer')
    return await puppeteer.launch({ headless: true })
  }
}

/**
 * The PDF itself, as bytes.
 * 🔴 ONE IMPLEMENTATION FOR BOTH CALLERS — the admin download and outreach's attach button. A second
 * `page.pdf()` with its own options would eventually disagree about the page size or the background,
 * and the difference would only show up in a file already sent to a prospect.
 * ⚠️ THE BROWSER IS ALWAYS CLOSED. A leaked Chromium on a serverless container is a container that
 * runs out of memory for the next request rather than for this one.
 */
/**
 * The PDF for ONE country. 🔴 THE COUNTRY IS A REQUIRED ARGUMENT, NOT A DEFAULT: both callers pass 'GB'
 * explicitly today (the admin download and the outreach attachment), each saying why at the call site.
 * A default here would be the silent GB fallback lib/country-settings.ts exists to refuse.
 */
export async function generatePlansPdf(country: string): Promise<Buffer> {
  // Read BEFORE the browser launches, so an unknown country (or an unreadable catalogue) fails fast and costs no Chromium.
  const settings = await getCountrySettings(country)
  const catalog = await getPlanCatalog()
  let browser: unknown = null
  try {
    browser = await launchPdfBrowser()
    const b = browser as { newPage: () => Promise<{ setContent: (h: string, o: object) => Promise<void>; pdf: (o: object) => Promise<Uint8Array> }> }
    const page = await b.newPage()
    // ⚠️ setContent, NOT a navigation to our own URL — the note the route carried, kept with the code.
    await page.setContent(buildPlansPdfHtml(settings, catalog), { waitUntil: 'load' })
    const pdf = await page.pdf({ format: pdfPaperOf(settings).format, printBackground: true, preferCSSPageSize: true })
    return Buffer.from(pdf)
  } finally {
    if (browser) await (browser as { close: () => Promise<void> }).close().catch(() => {})
  }
}
