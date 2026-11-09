#!/usr/bin/env node
// scripts/compare-ux-1.cjs — compare-ux-1 (8 November 2026; docs/compare-ux-1-report.md). The comparison pages easy to read on any device,
// with everything search and AI tools read kept. Proves, against the real modules, stylesheets and messages on the committed fixtures
// (no network, no database, no build):
//   1 · the words: "In short" (comparison.tldr.*) and the two manual checklist items are gone from every messages file; the new words
//       (legend, swipe hint, ⓘ, "Doesn't say", "None", the one-line admin banner) are in en-GB and every language base
//   2 · the page as the public sees it (DE, live): no "In short"; "Which suits…" straight under the byline; the table with its caption,
//       th scope, the short verdicts (✓ ◐ ✗, "Not listed", "—" with a spoken label, amounts), the ⓘ as a native <details> holding EVERY
//       cell's note and source link (the JSON twin's), nothing visually hidden; no admin badges or group line; the legend; the swipe hint;
//       the shared sticky header; the breadcrumb (and its BreadcrumbList) kept, and no longer sticky
//   3 · the admin banner: one line (status · shown · what the public sees · Pricing check) and "Details"; no verified-vendors or Impressum
//       item; never in a public response
//   4 · the twins: the Markdown has no "In short"; the JSON keeps each cell's full words (the page's short verdicts are the page's only)
//   5 · the footer: "Compare" is a link in the row, after FAQ (no column), only where live; the phone grid's rules; one shared sticky piece
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-ux-1' })
const FX = require('./_compare-de-1-fixtures.cjs')
const REPO = kit.REPO

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const unesc = s => s.replace(/<!-- -->/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const BASES = ['fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'da-DK', 'nb-NO', 'pl-PL', 'cs-CZ', 'hu-HU', 'sk-SK', 'ro-RO', 'hr-HR', 'sl-SI', 'fi-FI', 'et-EE', 'lv-LV', 'lt-LT', 'el-GR', 'bg-BG', 'pt-BR', 'ms-MY', 'ja-JP', 'zh-HK', 'th-TH', 'ar-AE']
const NEW = ['table.legend', 'table.swipe', 'cell.details', 'cell.doesntSay', 'cell.none', 'admin.liveAuto', 'admin.adminsOnly', 'admin.whyFewer', 'admin.whyAutoOff', 'admin.shown', 'admin.details']
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o)

;(async () => {
  // ══ 1 · words ══
  head('1 · the words')
  const files = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json')).map(f => `messages/${f}`)
  const nsFiles = fs.readdirSync(path.join(REPO, 'messages/ns')).map(l => `messages/ns/${l}/comparison.json`).filter(f => fs.existsSync(path.join(REPO, f)))
  const tldr = [...files, ...nsFiles].filter(f => { const j = JSON.parse(read(f)); const c = j.comparison ?? j; return c && (c.tldr !== undefined || c.admin?.check?.verified !== undefined || c.admin?.check?.impressum !== undefined) })
  t(`"In short" (tldr) and the verified-vendors / Impressum checklist items are in no messages file (${files.length} + ${nsFiles.length} namespace files)`, !tldr.length, tldr)
  const backs = fs.readdirSync(path.join(REPO, 'docs/i18n/back')).filter(f => f.endsWith('.json'))
  const backTldr = backs.filter(f => Object.keys(JSON.parse(read(`docs/i18n/back/${f}`))).some(k => /^comparison\.(tldr\.|admin\.check\.(verified|impressum))/.test(k)))
  t('…nor in any back-translation file', !backTldr.length, backTldr)
  const missing = []
  for (const l of ['en-GB', ...BASES]) { const c = JSON.parse(read(`messages/${l}.json`)).comparison; for (const k of NEW) if (typeof get(c, k) !== 'string' || !get(c, k).trim()) missing.push(`${l} ${k}`) }
  t(`the ${NEW.length} new words (legend, swipe hint, ⓘ, "Doesn't say", "None", the one-line banner) are in en-GB and all ${BASES.length} language bases`, !missing.length, missing.slice(0, 20))
  const en = JSON.parse(read('messages/en-GB.json')).comparison
  t('the legend names the five verdicts and the ⓘ, in one line', /✓/.test(en.table.legend) && /◐/.test(en.table.legend) && /✗/.test(en.table.legend) && /—/.test(en.table.legend) && /ⓘ/.test(en.table.legend) && !/\n/.test(en.table.legend), en.table.legend)
  const deW = JSON.parse(read('messages/de-DE.json')).comparison

  // ══ 2 · the public page ══
  head('2 · the page as the public sees it (DE fixtures, live)')
  const R = await FX.renderer(kit, 'ux1h')
  const live = await R.page({ status: 'live' })
  const html = live.html || ''
  t('the page renders for an anonymous visitor', !live.notFound && !!html)
  t('no "In short" (no .cmp-tldr, no heading)', !/cmp-tldr/.test(html) && !html.includes('Kurz gesagt'))
  t('"Which suits your food truck?" comes straight under the title and checked-date line, before the table', /<\/h1><p class="cmp-byline">(?:(?!<\/p>)[\s\S])*<\/p><section aria-labelledby="suits" class="cmp-suits" data-suits="true">/.test(html) && html.indexOf('data-suits') < html.indexOf('data-table'))
  const table = /<table[^>]*data-table[\s\S]*?<\/table>/.exec(html)?.[0] ?? ''
  t('the table keeps its caption and th scope (col for products, row for features)', /<caption>/.test(table) && /<th scope="col"/.test(table) && /<th scope="row"/.test(table))
  const tds = table.match(/<td[\s\S]*?<\/td>/g) || []
  const verdictOf = td => /class="cmp-v cmp-v-(yes|partial|no|not_listed|none|amt|na)"/.exec(td)?.[1] ?? null
  const noVerdict = tds.filter(td => !verdictOf(td))
  t(`every one of the ${tds.length} cells shows a short verdict (✓ Yes · ◐ Partly · ✗ No · Not listed · — · an amount)`, tds.length > 10 && !noVerdict.length, noVerdict.slice(0, 2))
  t('…the icons are hidden from screen readers, the word is not; "—" is spoken as "Doesn\'t say"', /<span class="cmp-v cmp-v-yes"><span aria-hidden="true">✓ ?<\/span>[^<]+<\/span>/.test(table) && (!/cmp-v-none/.test(table) || new RegExp(`role="img" aria-label="${deW.cell.doesntSay}"`).test(unesc(table))))
  // The verdicts as SHOWN (the text of each .cmp-v): never the old long words. (German's spoken "—" label, "Nicht angegeben", is the
  // translator's "Doesn't say" — the same words — and is a label, not shown text.)
  const shown = (table.match(/<span class="cmp-v [^"]*"[^>]*>[\s\S]*?<\/span>(?=<details|<\/td>)/g) || []).map(x => unesc(x.replace(/<[^>]+>/g, '')).trim())
  t(`…the old long words are not shown ("${deW.cell.unknown}", "${deW.cell.not_mentioned}"): every verdict is short (≤ 40 characters)`, shown.length === tds.length && !shown.some(x => x.includes(deW.cell.unknown) || x.includes(deW.cell.not_mentioned) || x.length > 40), shown.filter(x => x.length > 40 || x.includes(deW.cell.unknown)).slice(0, 4))
  const js = JSON.parse((await R.twin('json', { status: 'live' })).body)
  const plain = unesc(table)
  const hrefs = new Set([...table.matchAll(/href="([^"]+)"/g)].map(m => unesc(m[1])))
  const cells = js.rows.flatMap(r => r.cells.map(c => ({ ...c, row: r.key })))
  const noNote = cells.filter(c => c.note && !plain.includes(c.note)), noSrc = cells.filter(c => c.source && !hrefs.has(c.source))
  t(`EVERY cell's note (${cells.filter(c => c.note).length}) and source link (${cells.filter(c => c.source).length}) is in the page HTML — the JSON twin's, cell for cell`, !noNote.length && !noSrc.length, { noNote: noNote.slice(0, 3), noSrc: noSrc.slice(0, 3) })
  t('…inside a native ⓘ <details> with a spoken summary, never visually hidden', /<details class="cmp-i"><summary aria-label="[^"]+" title="[^"]+"><span aria-hidden="true">ⓘ<\/span><\/summary><div class="cmp-i-body">/.test(table) && !/sr-only|visually-hidden|display:\s*none/.test(table))
  t('no admin badges and no category line in the public table', !/cmp-badge/.test(table) && !/cmp-group"/.test(table))
  t('the one-line legend follows the table', /<\/table>[\s\S]{0,400}<p class="cmp-legend" data-legend="true">/.test(html) && unesc(html).includes(deW.table.legend))
  t('the "Swipe sideways" hint is in the HTML, hidden from screen readers (CSS shows it on narrow screens while the table overflows)', /<p class="cmp-swipe" data-swipe="true" aria-hidden="true">/.test(html))
  t('the shared sticky header sits in the scroll box (an empty hidden span — StickyTableHead)', /<div class="cmp-scroll" role="region" aria-labelledby="[^"]+" tabindex="0"><span hidden=""><\/span><table/.test(html))
  t('the breadcrumb and its BreadcrumbList data are kept', /class="cmp-crumbs"/.test(html) && /"@type":"BreadcrumbList"/.test(html))
  t('no admin banner in a public response', !/cmp-admin/.test(html))

  // ══ 3 · the admin banner ══
  head('3 · the admin banner')
  const adm = (await R.page({ status: 'admin', admin: true })).html || ''
  const line = /<p class="cmp-admin-line"[\s\S]*?<\/p>/.exec(adm)?.[0] ?? ''
  t('one line: the status, the number shown, "What the public sees" and the Pricing check', !!line && line.includes(deW.admin.viewPublic) && line.includes(deW.admin.pricingCheck) && /\d/.test(line.replace(/<[^>]+>/g, '')))
  t('…the rest behind "Details" (a native <details>)', new RegExp(`<details class="cmp-admin-more"><summary>${deW.admin.details}</summary>`).test(unesc(adm)))
  t('no verified-vendors or Impressum item in the checklist', !/data-check="(verified|impressum)"/.test(adm) && /data-check="apps"/.test(adm))
  t('admins may still see the badges and the category line', /cmp-group"/.test(adm) || /cmp-badge/.test(adm))
  const adPublic = (await R.page({ status: 'admin', admin: true, search: { view: 'public' } })).html || ''
  t('"What the public sees" (admin preview) shows no badges or category line in the table', !/cmp-badge|cmp-group"/.test(/<table[\s\S]*?<\/table>/.exec(adPublic)?.[0] ?? 'x'))

  // ══ 4 · the twins ══
  head('4 · the twins')
  const md = (await R.twin('md', { status: 'live' })).body
  t('the Markdown has no "In short"', !md.includes('Kurz gesagt') && !/^## In short/m.test(md))
  t('the JSON keeps each cell\'s full words (label and text), as before', cells.every(c => typeof c.label === 'string' && typeof c.text === 'string') && cells.some(c => [deW.cell.unknown, deW.cell.not_mentioned, deW.table.unknown].includes(c.label)), cells.slice(0, 2))
  t('lib/comparison.ts: no tldr in the Markdown, the word list or the checklist', !/tldr|impressum|allVerified/i.test(read('lib/comparison.ts')))

  // ══ 5 · the footer and the shared pieces ══
  head('5 · the footer and the shared pieces')
  const linkIn = h => /<div class="foot-links">[\s\S]*?<a href="\/de\/vergleich\/foodtruck-bestellsystem" class="foot-compare" data-footer-comparison="live">Vergleich<\/a>/.test(h)
  const lLive = await R.landing('live'), lAdmin = await R.landing('admin'), lOff = await R.landing('off')
  t('live: "Vergleich" is a link in the footer row (server HTML), after Pricing / FAQ', linkIn(lLive) && /#pricing">[^<]+<\/a>(?:<a href="[^"]*faq[^"]*">[^<]+<\/a>)?<a href="\/de\/vergleich\//.test(lLive))
  t('…and the old "Compare / Ordering system comparison" column is gone', !/foot-col/.test(lLive + lAdmin + lOff))
  t('admin: no link in the server HTML (AdminOnly shows it in an admin\'s browser); off: none', !/foot-compare/.test(lAdmin.replace(/<script\b[\s\S]*?<\/script>/g, '')) && !/foot-compare|data-footer-comparison/.test(lOff))
  const footer = read('components/landing/LandingFooter.tsx')
  t('the old column\'s slot is kept empty ({null}) so React\'s generated ids stay the same on every page', /\{null\}\s*\n\s*<div className="foot-right">/.test(footer))
  const css = read('app/(public)/(site)/landing/landing.css')
  t('landing.css: no .foot-col rule; nine items put the country menu on its own row; the order rule is unchanged', !/\.foot-col[\s{.-]/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')) && /\.hg-landing \.foot-links > \.cc:nth-child\(9\) \{ grid-column: 1 \/ -1; \}/.test(css) && /\.foot-links > :nth-last-child\(5\), \.hg-landing \.foot-links > :nth-last-child\(4\),\s*\n\s*\.hg-landing \.foot-links > :nth-last-child\(2\), \.hg-landing \.foot-links > :nth-last-child\(1\) \{ order: 1; \}/.test(css))
  const ccss = read('app/(public)/[country]/[section]/[slug]/comparison.css')
  t('comparison.css: the breadcrumb scrolls with the page (not the nav\'s sticky rule)', /\.hg-landing \.cmp-crumbs \{ position: static;/.test(ccss))
  t('…the feature column is sticky left; from 900px the header is CSS-sticky under the nav and the box does not scroll', /tbody th \{[^}]*\}/.test(ccss) && /position: sticky; left: 0;/.test(ccss) && /@media \(min-width: 900px\) \{[\s\S]*?\.cmp-scroll \{ overflow: visible; \}[\s\S]*?thead th \{ position: sticky; top: var\(--nav-h\);/.test(ccss))
  t('…the swipe hint shows only on narrow screens while the table overflows', /@media \(max-width: 899px\) \{\s*\.hg-landing \.cmp-tablewrap:has\(\.cmp-scroll\[data-overflows\]\) \.cmp-swipe \{ display: block; \}/.test(ccss))
  const page = read('app/(public)/[country]/[section]/[slug]/page.tsx')
  t('ONE sticky piece: /features (PlanTableHeadHeight) and the comparison page both use components/StickyTableHead.tsx', /<StickyTableHead head="\.pt-head" heightVar="--pt-head-h" \/>/.test(read('components/pricing/PlanTableHeadHeight.tsx')) && /<StickyTableHead head="thead" heightVar="--cmp-head-h" pin \/>/.test(page))
  t('…which pins under the site nav only where the box scrolls sideways, and marks data-overflows', /overflowX === 'visible'/.test(read('components/StickyTableHead.tsx')) && /toggleAttribute\('data-overflows'/.test(read('components/StickyTableHead.tsx')))

  console.log(`\n${fail ? '🔴' : '✅'} compare-ux-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
