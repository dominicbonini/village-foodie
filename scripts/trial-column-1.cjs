#!/usr/bin/env node
// scripts/trial-column-1.cjs — trial-column-1 (16 November 2026, docs/trial-column-1-report.md): the plan table's FREE-TRIAL COLUMN.
//   node scripts/trial-column-1.cjs            NO NETWORK, NO DATABASE — fixture tables (the live plans: a 3-month trial, every feature)
//   node scripts/trial-column-1.cjs --shots    also lays the tables out in WebKit and Chromium at 390 and 1280 (LTR and RTL), measures
//                                              them, and writes docs/trial-column-1/*.png (needs local browsers; by hand, not in the sweep)
// 1 · the columns (lib/plan-offer.ts tableColumns): the trial first, then the offered plans; its length from plans.trial_months; its
//     feature cells from ITS OWN plan_features switches; no trial plan / an inactive one / a country with no plan → no column; and
//     its money cells (nothing a month, no HatchGrab fee) agree with the billing rule (lib/billing/rules.ts planLevelAt, usageMonth).
// 2 · the real /features pages (uk, fr, de, my, ae) render the column first: name, length, 0% / Unlimited / Free, every feature row
//     with one more cell, no "—" in the trial's column. Manage › Billing's table (the card variant) for a truck on its trial: the
//     trial column highlighted with "Ends {date}"; for a truck on a plan: that plan highlighted, the trial with its length.
// 3 · --shots: no sideways scroll on the page, no header or cell text wider than its column, the name column ≥ 90px at 390.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename) // disk-cleanup-1: refuses below 40 GB free, stops below 20 GB (docs/reference-manual.md, "Disk space")
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
const fs = require('fs'); const os = require('os'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'trial-column-1' })
const WF = require('./_world-countries-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const text = s => String(s).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ').trim()
const words = l => JSON.parse(fs.readFileSync(path.join(REPO, `messages/${l}.json`), 'utf8'))
const clone = o => JSON.parse(JSON.stringify(o))

/** The table's header cells and rows, from rendered HTML (the grid of divs PlanTable writes). */
function parseTable(html) {
  const m = /<div class="pt [^"]*" role="table"[\s\S]*$/.exec(html)
  if (!m) return null
  const src = m[0]
  const heads = [...src.matchAll(/<div class="pt-col([^"]*)" role="columnheader">([\s\S]*?)<\/div>/g)].map(x => ({ cls: x[1], text: text(x[2]), html: x[2] }))
  const rows = [...src.matchAll(/<div class="pt-row" role="row"><div class="pt-label" role="rowheader">([\s\S]*?)<\/div>((?:<div class="pt-cell[^"]*" role="cell">[\s\S]*?<\/div>)+)<\/div>/g)]
    .map(x => ({ label: text(/<span class="pt-name">([\s\S]*?)<\/span>/.exec(x[1])?.[1] ?? x[1]), cells: [...x[2].matchAll(/<div class="pt-cell([^"]*)" role="cell">([\s\S]*?)<\/div>/g)].map(c => ({ cls: c[1], text: text(c[2]), html: c[2] })) }))
  return { heads, rows }
}

;(async () => {
  const wf = WF.renderer(kit, 'tc1')
  const L = await kit.bundle('tc1-lib', [
    "export { tableColumns, tableCell, tableGroups, offerTrialPlan, offerTrialMonths, offerPlans } from '@/lib/plan-offer'",
    "export { planLevelAt, usageMonth } from '@/lib/billing/rules'",
    "export { PlanTable } from '@/components/pricing/PlanTable'",
    "export { renderToStaticMarkup } from 'react-dom/server'",
    "export { createElement } from 'react'",
    "export { localizePlans } from '@/lib/plan-names'",
  ].join('\n'))
  const CAT = wf.catalog
  const rows = WF.rowsWith(WF.WORLD)

  head('1 · the columns (lib/plan-offer.ts tableColumns)')
  {
    const gb = L.tableColumns(CAT, 'GB')
    t('GB: the trial first, then the three plans in sort_order', gb.map(c => c.plan.key).join(',') === 'trial,payg,pro,unlimited', gb.map(c => c.plan.key))
    t('the trial column carries its length from plans.trial_months (3)', gb[0].trial && gb[0].trial.months === 3, gb[0].trial)
    t('only the trial column is marked as the trial', gb.slice(1).every(c => !c.trial))
    t('its money: nothing a month, no allowance cap, no HatchGrab fee (the noFee shape)', gb[0].monthlyMinor === 0 && gb[0].includedMinor === null && gb[0].feeBps === 0 && gb[0].shape === 'noFee', gb[0])
    t('the plan columns are offerPlans exactly (unchanged)', JSON.stringify(gb.slice(1)) === JSON.stringify(L.offerPlans(CAT, 'GB')))
    const my = L.tableColumns(CAT, 'MY')
    t('MY (Unlimited only): the trial, then Unlimited', my.map(c => c.plan.key).join(',') === 'trial,unlimited', my.map(c => c.plan.key))
    t('a country with no plan offered: no columns at all (no lone trial)', L.tableColumns(CAT, 'ZZ').length === 0, L.tableColumns(CAT, 'ZZ'))
    const noTrial = clone(CAT); noTrial.plans = noTrial.plans.filter(p => !p.isTrial); noTrial.plans.find(p => p.key === 'payg').isSignupDefault = true
    t('no trial plan in the catalogue → no trial column', L.tableColumns(noTrial, 'GB').map(c => c.plan.key).join(',') === 'payg,pro,unlimited')
    const off = clone(CAT); off.plans.find(p => p.key === 'trial').active = false
    t('an inactive trial plan → no trial column', !L.tableColumns(off, 'GB').some(c => c.trial))
    const len = clone(CAT); len.plans.find(p => p.key === 'trial').trialMonths = 2
    t('the length follows the data (trial_months 3 → 2)', L.tableColumns(len, 'GB')[0].trial.months === 2 && L.offerTrialMonths(len) === 2)
    const sw = clone(CAT); sw.features.push({ planKey: 'trial', feature: 'event_types', enabled: false })
    const evRow = L.tableGroups().flatMap(g => g.rows).find(r => r.feature === 'event_types')
    t('the trial\'s feature cells are ITS OWN switches: event_types off for the trial → "—" in its column', L.tableCell(sw, evRow, { plan: sw.plans.find(p => p.key === 'trial') }) === 'off' && L.tableCell(CAT, evRow, { plan: CAT.plans.find(p => p.key === 'trial') }) === 'on')
    const trialCells = L.tableGroups().flatMap(g => g.rows).map(r => L.tableCell(CAT, r, gb[0]))
    t('today the trial has every feature: no "—" anywhere in its column', !trialCells.includes('off'), trialCells)
    const unl = L.tableGroups().flatMap(g => g.rows).map(r => L.tableCell(CAT, r, gb[3]))
    t('…which is the same as the plan with the most (Unlimited) — not hardcoded, read from plan_features', JSON.stringify(trialCells) === JSON.stringify(unl))
    // The billing rule the money cells state: a trialling truck pays no plan fee and no order of its trial is billed.
    const truck = { id: 'x', plan: 'trial', trial_expires_at: '2027-01-31T23:59:59Z', country: 'GB', is_customer: true }
    const lv = L.planLevelAt({ truck, history: [], catalog: CAT, countryCode: 'GB', tz: 'Europe/London' }, Date.parse('2026-11-20T12:00:00Z'))
    t('billing agrees — planLevelAt for a trialling truck: trialling, 0 a month, no price row', lv.trialling === true && lv.monthlyMinor === 0 && lv.price === null, lv)
  }

  head('2 · the real /features pages and Manage › Billing\'s table')
  const tLen = (l, n) => ({ 'en-GB': `${n} months`, 'fr-FR': `${n} mois`, 'de-DE': `${n} Monate`, 'ms-MY': `${n} bulan`, 'ar-AE': n === 3 ? '3 أشهر' : null })[l]
  const pages = {}
  for (const [seg, cc, locale] of [['uk', 'GB', 'en-GB'], ['fr', 'FR', 'fr-FR'], ['de', 'DE', 'de-DE'], ['my', 'MY', 'ms-MY'], ['ae', 'AE', 'ar-AE']]) {
    const r = await kit.quietAsync(() => wf.page('features', seg, rows))
    pages[seg] = { html: r.html, cc, locale }
    const tb = parseTable(String(r.html || ''))
    if (!tb) { t(`/${seg}/features renders the plan table`, false, r.redirectedTo || 'no table'); continue }
    const name = (words(locale).planNames?.trial?.name) || 'Free trial'
    const n = L.tableColumns(CAT, cc).length
    t(`/${seg}/features: ${n} columns, the trial first — "${tb.heads[0]?.text}"`, tb.heads.length === n && tb.heads[0].text === `${name} ${tLen(locale, 3)}` && /pt-trial/.test(tb.heads[0].cls), tb.heads.map(h => h.text))
    t(`/${seg}/features: every row has ${n} cells`, tb.rows.length > 30 && tb.rows.every(x => x.cells.length === n), tb.rows.filter(x => x.cells.length !== n).map(x => x.label))
    const tw = words(locale).planTable?.cell || {}, gbw = words('en-GB').planTable.cell
    const [inc, fee, walk] = tb.rows.slice(0, 3).map(x => x.cells[0].text)
    t(`/${seg}/features: the trial pays nothing — "${inc}" · "${fee}" · "${walk}"`, inc === (tw.unlimited || gbw.unlimited) && /^0\s?%$|^%\s?0$|^0٪$|^٠٪$/.test(fee.replace(/[\u200e\u200f\u061c]/g, '')) && walk === (tw.free || gbw.free), [inc, fee, walk])
    t(`/${seg}/features: no "—" in the trial's column`, tb.rows.every(x => !/pt-no/.test(x.cells[0].html)))
  }
  {
    const gbHtml = String(pages.uk.html)
    t('/uk/features: no trial column is highlighted (the page highlights the data\'s plan only)', !/pt-col pt-hl pt-trial/.test(gbHtml))
  }
  const settings = { GB: await wf.rowOf(rows, 'GB'), FR: await wf.rowOf(rows, 'FR'), AE: await wf.rowOf(rows, 'AE'), DE: await wf.rowOf(rows, 'DE') }
  // Manage's catalogue arrives with the plan names in the truck's country's language (app/api/manage/route.ts localizePlans).
  const card = (cc, highlight, trialEnds) => L.renderToStaticMarkup(L.createElement(L.PlanTable, { catalog: L.localizePlans(CAT, settings[cc].locale), settings: settings[cc], highlight, trialEnds }))
  {
    const on = parseTable(card('GB', 'trial', '31 Dec 2026'))
    t('Billing, a truck on its trial: the trial column highlighted, reading "Free trial · Ends 31 Dec 2026"', /pt-hl/.test(on.heads[0].cls) && on.heads[0].text === 'Free trial Ends 31 Dec 2026' && on.heads.slice(1).every(h => !/pt-hl/.test(h.cls)), on.heads)
    t('…and every cell of that column tinted (pt-hl)', on.rows.every(x => /pt-hl/.test(x.cells[0].cls)))
    const notStarted = parseTable(card('GB', 'trial', null))
    t('Billing, a trial with no end date: highlighted, with its length', /pt-hl/.test(notStarted.heads[0].cls) && notStarted.heads[0].text === 'Free trial 3 months')
    const pro = parseTable(card('GB', 'pro', '31 Dec 2026'))
    t('Billing, a truck on Pro: Pro highlighted, the trial reads its length (a date is only ever the trial\'s own)', /pt-hl/.test(pro.heads[2].cls) && !/pt-hl/.test(pro.heads[0].cls) && pro.heads[0].text === 'Free trial 3 months', pro.heads)
    const fr = parseTable(card('FR', 'trial', '31 déc. 2026'))
    t('Billing in French: "Essai gratuit · Jusqu’au 31 déc. 2026"', fr.heads[0].text === 'Essai gratuit Jusqu’au 31 déc. 2026', fr.heads[0].text)
    const ar = parseTable(card('AE', 'trial', '31 ديسمبر 2026'))
    t('Billing in Arabic: "تجربة مجانية · تنتهي في …"', ar.heads[0].text === 'تجربة مجانية تنتهي في 31 ديسمبر 2026', ar.heads[0].text)
  }
  {
    // The plans PDF prints the same table (country-settings-parity B3: Billing's table text = the PDF's): the trial column too.
    const pdf = String(await wf.pdf(rows, 'GB'))
    const ths = [...pdf.matchAll(/<th class="c[^"]*"><div class="th-plan">([^<]*)<\/div>(?:<div class="th-price">([^<]*)<\/div>)?<\/th>/g)].map(m => `${m[1]} ${m[2] ?? ''}`.trim())
    t('the plans PDF: the trial column first — "Free trial 3 months", then the three plans', ths.length === 4 && ths[0] === 'Free trial 3 months' && /^Pay as you go/.test(ths[1]), ths)
    t('the PDF\'s cards are unchanged: three (the trial is a table column, not a card)', (pdf.match(/<div class="card[ "]/g) || []).length === 3, (pdf.match(/<div class="card[ "]/g) || []).length)
  }

  head('the older harnesses\' anchors (scripts/_lp-trial-column-1.cjs)')
  {
    const TC1 = require('./_lp-trial-column-1.cjs')
    const stale = TC1.CODE_FILES.filter(f => TC1.undoCode(f, fs.readFileSync(path.join(REPO, f), 'utf8')) === null)
    t(`every recorded code edit is still there exactly once (${TC1.CODE_FILES.length} files) — else the older identity checks lose their anchor`, stale.length === 0, stale)
    let back = null
    try { back = TC1.tableBack(String(pages.uk.html)) } catch (e) { back = e.message }
    t('/uk/features with the column taken back out: one plan table, three plan columns, no trial', typeof back === 'string' && !/pt-trial/.test(back) && (back.match(/role="columnheader"/g) || []).length === 3, typeof back === 'string' ? back.slice(0, 200) : back)
  }

  if (process.argv.includes('--shots')) {
    head('3 · layout (WebKit and Chromium, 390 and 1280)')
    const { webkit, chromium } = require(path.join(REPO, 'node_modules/playwright'))
    const OUT = path.join(REPO, 'docs/trial-column-1'); fs.mkdirSync(OUT, { recursive: true })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc1-'))
    // The fonts the pages use, from the dev build's next/font output when there is one (else the fallbacks — the run says which).
    const chunks = path.join(REPO, '.next/dev/static/chunks')
    let fontCss = ''
    if (fs.existsSync(chunks)) for (const f of fs.readdirSync(chunks).filter(f => /font_google_(archivo|public_sans|geist|noto_sans_arabic)_.*single\.css$/.test(f)))
      fontCss += fs.readFileSync(path.join(chunks, f), 'utf8').replace(/url\("\.\.\/media\//g, `url("file://${path.join(REPO, '.next/dev/static/media')}/`)
    console.log(fontCss ? '  (fonts: the dev build\'s Archivo, Public Sans, Geist, Noto Sans Arabic)' : '  ⚠️ no .next/dev fonts — fallback fonts, widths are approximate')
    const landingCss = fs.readFileSync(path.join(REPO, 'app/(public)/(site)/landing/landing.css'), 'utf8')
    // The public pages' base stylesheet (Tailwind — the nav's bg-slate-900 and the rest of the frame), compiled as billing-3-screens does,
    // so a page photographs as it is served; before this the nav came out white around the table.
    const publicCss = await (async () => {
      const postcss = require(require.resolve('postcss', { paths: [REPO] }))
      const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
      const from = path.join(REPO, 'app/(public)/public.css')
      return (await postcss([tw({ base: REPO })]).process(fs.readFileSync(from, 'utf8'), { from })).css
    })()
    // Root-relative assets ("/logos/hatchgrab-wordmark-white.svg") read from public/ — from a file:// page they pointed at the disk's
    // root, and the missing logo drew as its alt text in a box (the live page serves it: docs/trial-column-1-report.md §3).
    const assets = html => String(html).replace(/(\ssrc=")\/(?!\/)([^"?#]+)"/g, (m, pre, rel) => (fs.existsSync(path.join(REPO, 'public', rel)) ? `${pre}file://${path.join(REPO, 'public', rel)}"` : m))
    const tableCss = fs.readFileSync(path.join(REPO, 'components/pricing/plan-table.css'), 'utf8')
    const rtl = l => /^(ar|he|ur)-/.test(l)
    const doc = (lang, body, kind) => `<!doctype html><html lang="${lang}" dir="${rtl(lang) ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${fontCss}</style><style>:root{--font-script-ar:'Noto Sans Arabic';--font-script-fallback:'Noto Sans';--font-geist-sans:Geist,'Geist Fallback'}
html,body{margin:0}body{font-family:var(--font-geist-sans),system-ui,sans-serif}</style>${kind === 'card' ? '' : `<style>${publicCss}</style>`}<style>${landingCss}</style><style>${tableCss}</style></head>
<body${kind === 'card' ? ' style="background:#f8fafc"' : ''}>${kind === 'card' ? `<main style="padding:24px 16px">${body}</main>` : assets(body)}</body></html>`
    const cases = [
      ['features-uk', 'en-GB', pages.uk.html, 'page'], ['features-fr', 'fr-FR', pages.fr.html, 'page'], ['features-de', 'de-DE', pages.de.html, 'page'],
      ['features-ae-rtl', 'ar-AE', pages.ae.html, 'page'], ['features-my', 'ms-MY', pages.my.html, 'page'],
      ['billing-gb-on-trial', 'en-GB', card('GB', 'trial', '31 Dec 2026'), 'card'], ['billing-gb-on-pro', 'en-GB', card('GB', 'pro', null), 'card'],
      ['billing-fr-on-trial', 'fr-FR', card('FR', 'trial', '31 déc. 2026'), 'card'], ['billing-de-on-trial', 'de-DE', card('DE', 'trial', '31. Dez. 2026'), 'card'],
      ['billing-ae-rtl-on-trial', 'ar-AE', card('AE', 'trial', '31 ديسمبر 2026'), 'card'],
    ]
    const measure = () => {
      const tb = document.querySelector('.pt'); const r = tb.getBoundingClientRect()
      const over = []
      const fits = (el, box) => { const rg = document.createRange(); rg.selectNodeContents(el); const b = rg.getBoundingClientRect(); return b.width <= box.width + 0.5 && b.left >= box.left - 0.5 && b.right <= box.right + 0.5 }
      for (const c of document.querySelectorAll('.pt-col, .pt-cell')) { const box = c.getBoundingClientRect(); for (const s of c.querySelectorAll('span')) if (!fits(s, box)) { const rg = document.createRange(); rg.selectNodeContents(s); over.push(`${c.className}: "${s.textContent}" text ${Math.round(rg.getBoundingClientRect().width)}px in ${Math.round(box.width)}px`); break } }
      // The trial's own line ("3 months" / "Ends 31 Dec 2026", this workstream's words): no word of it split across two lines.
      const split = []
      const line = document.querySelector('.pt-head .pt-trial .pt-col-price')
      // (Chinese and Japanese break between characters by convention — not a split word; a break after "/" is a chance we give.)
      if (line && line.firstChild && !/^(ja|zh|ko)/.test(document.documentElement.lang)) for (const tx of [...line.childNodes].flatMap(n => n.nodeType === 3 ? [n] : [...n.childNodes].filter(x => x.nodeType === 3))) { const re = /[^\s/\u200b]+/g; let m; while ((m = re.exec(tx.textContent))) { const rg = document.createRange(); rg.setStart(tx, m.index); rg.setEnd(tx, m.index + m[0].length); const tops = new Set([...rg.getClientRects()].map(q => Math.round(q.top))); if (tops.size > 1) split.push(m[0]) } }
      // English: no word anywhere in the table is split or hyphenated across two lines (its names and values fit whole).
      if (/^en/.test(document.documentElement.lang)) {
        const walker = document.createTreeWalker(document.querySelector('.pt'), NodeFilter.SHOW_TEXT)
        // (a break at a word's own hyphen — "Customer-/facing" — is an ordinary line break; Billing's capitalised group headings
        //  are the width they were before this change and are left out)
        // Billing's row names too: its name column is the width it was (104px), and "management" already broke there before.
        for (let tx; (tx = walker.nextNode());) { if (tx.parentElement.closest('.pt-group') || (tx.parentElement.closest('.pt-card') && tx.parentElement.closest('.pt-label'))) continue; const re = /[^\s/\-‐\u200b]+/g; let m; while ((m = re.exec(tx.textContent))) { const rg = document.createRange(); rg.setStart(tx, m.index); rg.setEnd(tx, m.index + m[0].length); if (new Set([...rg.getClientRects()].map(q => Math.round(q.top))).size > 1) split.push(m[0]) } }
      }
      const label = document.querySelector('.pt-row:not(.pt-head) .pt-label').getBoundingClientRect().width
      const cols = [...document.querySelectorAll('.pt-head .pt-col')].map(c => Math.round(c.getBoundingClientRect().width))
      return { sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, tableRight: Math.round(r.right), tableLeft: Math.round(r.left), vw: innerWidth, over, label: Math.round(label), cols, headH: Math.round(document.querySelector('.pt-head').getBoundingClientRect().height), split }
    }
    // Every fixture language at 390 (measured only): the longest single words ("Binnenkort", "Hamarosan", "Kostenlose") decide the fit.
    const SWEEP = ['GB', 'FR', 'DE', 'NL', 'HU', 'FI', 'GR', 'PL', 'CZ', 'SK', 'RO', 'LT', 'LV', 'EE', 'BG', 'HR', 'SI', 'SE', 'DK', 'NO', 'IT', 'ES', 'PT', 'BR', 'JP', 'HK', 'TH', 'AE'].map(cc => [cc, cc === 'GB' ? 'uk' : cc.toLowerCase()])
    for (const [cc, seg] of SWEEP) {
      const r = rows.find(x => x.countryCode === cc); if (!r) continue
      settings[cc] ||= await wf.rowOf(rows, cc)
      const loc = settings[cc].locale
      // The date as Manage writes it (formatInstant, day numeric · month short · year numeric, in the truck's locale).
      const ends = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }).format(new Date('2026-12-31T12:00:00Z'))
      cases.push([`sweep-billing-${cc}`, loc, card(cc, 'trial', ends), 'card', 'sweep'])
      const pg = await kit.quietAsync(() => wf.page('features', seg, rows)).catch(() => null)
      if (pg && pg.html) cases.push([`sweep-features-${cc}`, loc, pg.html, 'page', 'sweep'])
    }
    for (const [engineName, engine] of [['webkit', webkit], ['chromium', chromium]]) {
      const browser = await engine.launch()
      try {
        for (const [name, lang, html, kind, sweep] of cases) for (const w of (sweep ? [390] : [390, 1280])) {
          const file = path.join(dir, `${name}-${w}.html`); fs.writeFileSync(file, doc(lang, String(html), kind))
          const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
          await page.goto('file://' + file); await page.evaluate(() => document.fonts.ready)
          const m = await page.evaluate(measure)
          const tag = `${engineName} ${name} @${w}`
          t(`${tag}: no sideways scroll, the table inside the screen`, m.sideways <= 0 && m.tableLeft >= 0 && m.tableRight <= m.vw, m)
          t(`${tag}: every header and cell's text inside its column`, m.over.length === 0, m.over)
          t(`${tag}: no word of the trial's own line split${/^en/.test(lang) ? ', and in English no word split anywhere' : ''}`, m.split.length === 0, m.split)
          if (w === 390) t(`${tag}: name column ${m.label}px (≥ 100), plan columns ${m.cols.join('/')}px, header ${m.headH}px`, m.label >= 100, m)
          if (engineName === 'webkit' && !sweep) {
            await page.evaluate(() => { const el = document.querySelector('.pt'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 20) })
            await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`), clip: { x: 0, y: 0, width: w, height: w === 390 ? 900 : 800 } })
          }
          await page.close()
        }
      } finally { await browser.close() }
    }
    if (process.env.TC1_KEEP) fs.cpSync(dir, process.env.TC1_KEEP, { recursive: true })   // debugging: a copy of the laid-out pages
    fs.rmSync(dir, { recursive: true, force: true })
  }

  console.log(`\ntrial-column-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
