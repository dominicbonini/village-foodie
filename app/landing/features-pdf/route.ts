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
  const heads = TABLE_PLANS.map((p: TablePlan) => {
    const price = PRICE_MODE === 'omit' ? '' : `<div class="th-price">${esc(px(PLAN_PRICE_LABEL[p]))}</div>`
    const sub = PRICE_MODE === 'omit' || !PLAN_SUB[p] ? '' : `<div class="th-sub">${esc(PLAN_SUB[p])}</div>`
    return `<th><div class="th-plan">${esc(PLAN_META[p].name)}</div>${price}${sub}</th>`
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
  * { box-sizing: border-box; }
  body { font: 9.5px/1.35 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1A2233; margin: 0; }
  h1 { font-size: 19px; margin: 0 0 2px; letter-spacing: -.02em; }
  .sub { color: #5F7A99; font-size: 10px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 5px 6px; }
  thead th { border-bottom: 2px solid #16314F; }
  /* 🔴 REPEAT THE HEADER ON EVERY PAGE. A comparison table whose plan columns are unlabelled after
     page 1 is unreadable, and this is the one thing print gets wrong by default. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .th-plan { font-weight: 700; font-size: 11px; }
  .th-price { font-weight: 700; font-size: 10px; }
  .th-sub { color: #5F7A99; font-size: 8px; font-weight: 400; }
  tbody tr { border-bottom: 1px solid #E6ECF2; }
  tr.grp td { background: #F5F8FB; font-weight: 700; font-size: 9px; letter-spacing: .1em;
              text-transform: uppercase; color: #16314F; border-top: 1px solid #D8E2EC; }
  td.f { width: 40%; }
  .f-name { display: block; font-weight: 600; }
  .f-desc { display: block; color: #5F7A99; font-size: 8.5px; margin-top: 1px; }
  td.c { width: 15%; text-align: center; }
  .yes { color: #1F7A3D; font-weight: 700; }
  .no  { color: #93A1B4; }
  .soon { color: #B26B0F; font-size: 8px; }
  .val { font-weight: 600; }
  sup { font-size: 7px; color: #5F7A99; }
  .allow { margin-top: 12px; }
  .allow h3, .fn h3 { font-size: 10px; margin: 0 0 3px; }
  .allow ul { margin: 0; padding-left: 14px; } .allow li { margin-bottom: 1px; }
  .fn { margin-top: 12px; border-top: 1px solid #D8E2EC; padding-top: 8px; break-inside: avoid; }
  .fn p { margin: 0 0 4px; color: #44566B; font-size: 8px; }
  .tbc { font-size: 8px; color: #B26B0F; margin: 6px 0 0; }
  </style></head><body>
    <h1>HatchGrab — plans and features</h1>
    <p class="sub">Every feature, side by side. Generated ${new Date().toISOString().slice(0, 10)}.</p>
    <table>
      <thead><tr><th></th>${heads}</tr></thead>
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
