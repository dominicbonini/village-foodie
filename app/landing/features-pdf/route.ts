// app/landing/features-pdf/route.ts
// 🔴 THE FEATURES COMPARISON AS A PDF, GENERATED FROM THE SAME SOURCE THE LANDING TABLE RENDERS.
// GET /landing/features-pdf  ->  application/pdf
//
// ── 🔴 IT IS GENERATED FROM lib/plan-features.ts, NEVER FROM A COPY OF THE MARKUP ───────────────────
// Every row, price, fee, allowance and footnote below is read at request time from FEATURE_SECTIONS,
// TRANSACTION_ROWS, PLAN_ALLOWANCES, PLAN_PRICES and FOOTNOTES, and the landing's presentation rules
// (which plans get columns, what Trial resolves to, which rows are hidden or renamed, the three cell
// glyphs) come from lib/landing-table.ts — THE SAME MODULE app/landing/page.tsx imports. Add a row to
// the matrix and it appears here on the next request with nothing to update.
// ⚠️ THE FAILURE THIS AVOIDS IS RECORDED: the manual's standalone HTML artifact was a hand-built copy
// of this table, correct the day it was written and wrong the first time a row changed. A PDF is worse
// than a web page for that, because it is forwarded and kept.
//
// ── 🔴 IT DOES NOT INHERIT app/landing/layout.tsx, AND THAT IS THE POINT OF THE CHECK BELOW ─────────
// A Next.js layout wraps PAGES. A Route Handler renders no React and is never wrapped by one, so being
// filed under app/landing/ buys this file NOTHING — unlike app/landing/cost/page.tsx, which really does
// inherit the admin gate by being a child route. The gate here is therefore EXPLICIT and deliberately
// uses `verifyAdmin`, the same canonical check app/landing/layout.tsx uses, so the two cannot diverge.
// 🔴 IF THIS CHECK IS DELETED THE WHOLE PRICED FEATURE MATRIX BECOMES A PUBLIC DOWNLOAD. Nothing else
// stands between this URL and the internet.
import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  FEATURE_SECTIONS, TRANSACTION_ROWS, FOOTNOTES, PLAN_ALLOWANCES,
  type FeatureValue,
} from '@/lib/plan-features'
import { PLAN_META } from '@/lib/features'
// 🔴 BRAND COLOUR COMES FROM lib/brand.ts, NEVER FROM landing.css. The landing's --head/--ink values
// are landing-LOCAL and explicitly not a brand decision; copying a hex out of that stylesheet would make
// a third uncontrolled copy. These two are the file's own `_HEX` constants, which exist precisely for
// this case — its comment says the suffix marks "a HEX, and everything else in this file's colour
// section is a TAILWIND CLASS STRING… for EMAIL templates", and a PDF is the same kind of consumer.
// ⚠️ HEADER_BG IS NOT USABLE HERE and that is worth recording: it is the string 'bg-slate-900', a
// Tailwind class, not a colour. There is no navy hex to import except HATCHGRAB_NAVY_HEX.
import { HATCHGRAB_NAVY_HEX, HATCHGRAB_ORANGE_HEX, HATCHGRAB_WORDMARK_SVG } from '@/lib/brand'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { maskPrice, PRICING_PUBLISHED } from '@/lib/pricing'
import {
  TABLE_PLANS, type TablePlan, PLAN_SUB, PLAN_PRICE_LABEL,
  trialFeatureValue, visibleRows, rowName, rowDetail, cellLabel,
} from '@/lib/landing-table'

export const dynamic = 'force-dynamic'
// Chromium cold-starts and renders. The established launcher in app/api/manage/verify-schedule-url
// sits on the same budget; this does strictly less work than a scrape.
export const maxDuration = 60

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

/** 🔴 CELL TEXT COMES FROM cellLabel(), THE SAME FUNCTION THE PAGE USES. The '—' it returns is an EM
 *  DASH and a protected string; it is escaped for HTML and NEVER normalised or written back. */
function cellHtml(value: FeatureValue): string {
  const label = cellLabel(value)
  const cls = label === '✓' ? 'yes' : label === 'Coming soon' ? 'soon' : 'no'
  return `<td class="c ${cls}">${esc(label)}</td>`
}

function buildHtml(): string {
  const wordmark = wordmarkDataUri()
  const heads = TABLE_PLANS.map((p: TablePlan) => {
    const price = PRICE_MODE === 'omit' ? '' : `<div class="th-price">${esc(px(PLAN_PRICE_LABEL[p]))}</div>`
    const sub = PRICE_MODE === 'omit' || !PLAN_SUB[p] ? '' : `<div class="th-sub">${esc(PLAN_SUB[p])}</div>`
    return `<th class="c"><div class="th-plan">${esc(PLAN_META[p].name)}</div>${price}${sub}</th>`
  }).join('')

  const fees = PRICE_MODE === 'omit' ? '' : `
    <tr class="grp"><td colspan="${TABLE_PLANS.length + 1}">Fees</td></tr>
    ${TRANSACTION_ROWS.map(row => `
      <tr>
        <td class="f"><span class="f-name">${esc(row.name)}${row.footnote ? `<sup>${esc(row.footnote)}</sup>` : ''}</span></td>
        ${TABLE_PLANS.map(p => `<td class="c val">${esc(px(row.cells[p]))}</td>`).join('')}
      </tr>`).join('')}`

  const sections = FEATURE_SECTIONS.map(section => `
    <tr class="grp"><td colspan="${TABLE_PLANS.length + 1}">${esc(section.title)}</td></tr>
    ${visibleRows(section).map(row => `
      <tr>
        <td class="f">
          <span class="f-name">${esc(rowName(row))}${row.footnote ? `<sup>${esc(row.footnote)}</sup>` : ''}</span>
          ${rowDetail(row) ? `<span class="f-desc">${esc(rowDetail(row))}</span>` : ''}
        </td>
        ${TABLE_PLANS.map(p => cellHtml(p === 'trial' ? trialFeatureValue(row) : (row[p as 'starter' | 'pro' | 'max'] as FeatureValue))).join('')}
      </tr>`).join('')}`).join('')

  // 🔴 THE ALLOWANCE LINES AND THE FOOTNOTES TRAVEL WITH THE TABLE, ALWAYS. A comparison table sent
  // without its footnotes reads as a commitment: footnote 1 is the only place the walk-up card detail
  // lives, and footnote 4 is what makes the auto-reply rows honest. See the report's §7.
  const allowances = PRICE_MODE === 'omit' ? '' : `
    <div class="allow"><h3>Online order allowance</h3><ul>
      ${(['starter', 'pro', 'max'] as const).map(p => `<li><b>${esc(PLAN_META[p].name)}</b> — ${esc(px(PLAN_ALLOWANCES[p]))}</li>`).join('')}
    </ul></div>`

  const notes = FOOTNOTES.map(f => `<p><sup>${esc(f.number)}</sup> ${esc(f.text)}</p>`).join('')

  const priceNote = PRICE_MODE === 'follow-flag' && !PRICING_PUBLISHED
    ? `<p class="tbc">Prices shown as “TBC” are not yet published.</p>` : ''
  const omitNote = PRICE_MODE === 'omit'
    ? `<p class="tbc">Prices are deliberately not included in this document.</p>` : ''

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
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
  th.f, td.f { width: 40%; text-align: left; }
  th.c, td.c { width: 15%; text-align: center; }
  thead th { border-bottom: 2px solid var(--navy); }
  /* 🔴 REPEAT THE HEADER ON EVERY PAGE. A comparison table whose plan columns are unlabelled after
     page 1 is unreadable, and this is the one thing print gets wrong by default. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .th-plan { font-weight: 700; font-size: 11px; }
  .th-price { font-weight: 700; font-size: 10px; }
  .th-sub { color: #5F7A99; font-size: 8px; font-weight: 400; }
  tbody tr { border-bottom: 1px solid #E6ECF2; }
  tr.grp td { background: #F5F8FB; font-weight: 700; font-size: 9px; letter-spacing: .1em;
              text-transform: uppercase; color: var(--navy); border-top: 1px solid #D8E2EC; }
  .f-name { display: block; font-weight: 600; }
  .f-desc { display: block; color: #5F7A99; font-size: 8.5px; margin-top: 1px; }
  .yes { color: #1F7A3D; font-weight: 700; }
  .no  { color: #93A1B4; }
  .soon { color: #B26B0F; font-size: 8px; }
  .val { font-weight: 600; }
  sup { font-size: 7px; color: #5F7A99; }
  .allow { margin-top: 12px; }
  .allow h3, .fn h3 { font-size: 10px; margin: 0 0 3px; color: var(--navy); }
  .allow ul { margin: 0; padding-left: 14px; } .allow li { margin-bottom: 1px; }
  .fn { margin-top: 12px; border-top: 1px solid #D8E2EC; padding-top: 8px; break-inside: avoid; }
  .fn p { margin: 0 0 4px; color: #44566B; font-size: 8px; }
  .tbc { font-size: 8px; color: #B26B0F; margin: 6px 0 0; }
  </style></head><body>
    <div class="doc-head">
      ${wordmark ? `<img class="mark" src="${wordmark}" width="${WORDMARK_W}" height="${WORDMARK_H}" alt="HatchGrab">` : ''}
      <h1>Plans and features</h1>
      <span class="gen">Generated ${new Date().toISOString().slice(0, 10)}</span>
    </div>
    <table>
      <thead><tr><th class="f"></th>${heads}</tr></thead>
      <tbody>${fees}${sections}</tbody>
    </table>
    ${allowances}
    <div class="fn"><h3>Small print</h3>${notes}${priceNote}${omitNote}
      <p>Figures are the published plan terms at the date above and may change. Card processing fees are
      Stripe’s own charge, not HatchGrab’s. This document is a summary, not a contract.</p>
    </div>
  </body></html>`
}

// The launcher shape is copied from app/api/manage/verify-schedule-url/route.ts so both paths behave
// the same on Vercel and locally. Serverless Chromium first; full puppeteer's bundled Chrome as the
// local fallback.
async function launchBrowser() {
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

export async function GET() {
  // 🔴 THE GATE. See the header: this is NOT inherited, it is the only thing there is.
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let browser: any = null
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    // ⚠️ setContent, NOT a navigation to our own URL. Navigating would need this request's admin cookie
    // to be replayed by the headless browser — a second auth path to get wrong. The HTML is built here
    // from the same modules the page uses, so there is nothing to fetch.
    await page.setContent(buildHtml(), { waitUntil: 'load' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // 🔴 THE FILENAME IS DEFINED HERE AND NOWHERE ELSE. Admin's download button reads it back off
        // this header rather than composing its own, so there is one definition of what the file is
        // called — the same rule as the document's contents.
        // ⚠️ THE DATE IS IN THE NAME ON PURPOSE. Without it, a second download lands as
        // "…features (1).pdf" and a folder of them cannot be told apart; with it, the file says what it
        // is a snapshot of. The table changes whenever the matrix does, so "which one is current" is a
        // real question and the filename should answer it. ISO order (YYYY-MM-DD) so they sort.
        'Content-Disposition': `attachment; filename="hatchgrab-plans-and-features-${new Date().toISOString().slice(0, 10)}.pdf"`,
        // ⚠️ Never cached: the table is generated from source and the price mask can change.
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: any) {
    console.error('[features-pdf] generation failed:', err?.message || err)
    return NextResponse.json({ error: 'Could not generate the PDF' }, { status: 500 })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
