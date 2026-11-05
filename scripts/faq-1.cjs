#!/usr/bin/env node
// scripts/faq-1.cjs — faq-1 (1 November 2026, docs/faq-1-report.md §6): THE FAQ'S DATA AND ADMIN › FAQ, PROVED.
//   node scripts/faq-1.cjs                     the proof (in scripts/harnesses.json)
//   node scripts/faq-1.cjs --capture <file>    write the landing / llms.txt hashes (run once at HEAD, in a worktree — §8 below)
//
//   1 · every live value for GB, US, IE, DE, JP, BR and SG from the world fixtures — each amount equal to what the landing page's
//       pricing section prints for that country (the home form, JPY with no decimals); BR reads the single-plan answer; Show in
//       hides "part of the year" in BR
//   2 · the check: an unknown token, a plan not offered and an allowance with no limit each fail and name the countries
//   3 · lib/faq names no plan key or plan name (grep)
//   4 · "Copy feedback for Claude": its format and its count
//   5 · the admin route: 403 for a non-admin on GET and POST; publish refused while the check fails; a published question's
//       failing save refused with the published text kept; notes save without the check
//   6 · the migration: RLS on, no policies, grants revoked from anon / authenticated / public, service role only; no operator_apps
//   7 · the seed: 5 sections, 26 drafts in order (faq-1b's agreed list); no digit, currency sign, plan name or country name outside a live value (one
//       allowed: "60 seconds" in question 6); every question reads correctly in every switched-on country
//   8 · nothing public changes: the landing page (GB, US, BR, JP) and /llms.txt hash exactly as at HEAD; no public file imports
//       lib/faq or the faq messages
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'faq-1' })
const WF = require('./_world-countries-1-fixtures.cjs')
const { snake } = require('./_lp1e-fixtures.cjs')
const { REPO } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const IDENTITY = 'scripts/fixtures/faq-1-identity.json'
const SEG = { GB: 'uk', US: 'us', BR: 'br', JP: 'jp' }
const MIGRATION = 'supabase/migrations/20261056_faq_1.sql'

let pass = 0, fail = 0
const t = (label, ok, d) => { if (ok) pass++; else { fail++; console.log('  🔴 ' + label + (d !== undefined ? `\n      ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700)}` : '')) } }
const head = s => console.log('\n' + s)
const sha = s => crypto.createHash('sha256').update(String(s ?? 'null')).digest('hex')
// ⚠️ RE-PINNED (store-badges-1, 2 November 2026): hashed with the footer's store badges and the Play URL's &hl=en taken out (scripts/
// _lp-store-badges-1.cjs strip, both sides; the badges follow the app flags now and are proven by scripts/store-badges-1.cjs).
const SB1 = require('./_lp-store-badges-1.cjs')
const SG2 = require('./_lp-seo-geo-2.cjs')   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module (seo-geo-2)

/** The landing page for GB, US, BR and JP and /llms.txt, over the world fixtures with every country switched on (as live). */
async function identityViews(tag) {
  const R = WF.renderer(kit, tag)
  const rows = WF.rowsWith(WF.WORLD)
  const out = {}
  for (const [cc, seg] of Object.entries(SEG)) {
    const P = await kit.quietAsync(() => R.page('landing', seg, rows))
    // ⚠️ RE-PINNED (seo-geo-2 B3, 2 November 2026): hashed as HEAD rendered it — operatingSystem set back to "Web, iOS, Android"
    // where seo-geo-2 made it "Web" (scripts/_lp-seo-geo-2.cjs asBefore; seo-geo-2.cjs proves the value per country).
    out[`${cc}/landing`] = sha(SB1.strip(SG2.asBefore(P.html))) + ':' + sha(JSON.stringify(P.meta))
  }
  // ⚠️ RE-PINNED (seo-geo-2 B4): /llms.txt is rebuilt on purpose — not compared with HEAD on a tree with seo-geo-2 (its content is
  // proven by seo-geo-2.cjs §5); captured as before on an older tree.
  if (!SG2.LANDED) out.llms = sha(await R.llms(rows))
  return { out, R, rows }
}

;(async () => {
  const cap = process.argv.indexOf('--capture')
  if (cap > 0) {
    const file = process.argv[cap + 1]
    const { out } = await identityViews('faq1-capture')
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
    console.log(`captured ${Object.keys(out).length} views → ${file}`)
    return
  }

  const L = await kit.bundle('faq1-lib', [
    "export * from '@/lib/faq/live-values'",
    "export * from '@/lib/faq/check'",
    "export * from '@/lib/faq/feedback'",
    "export { faqAction, listFaq, asPatch } from '@/lib/admin/faq-actions'",
    "export { mapCountryRow } from '@/lib/country-settings'",
  ].join('\n'))
  const catalog = WF.CATALOG()
  const rows = WF.rowsWith(WF.WORLD)
  // The app flags as live: the iPad and Android app in the UK stores only (country_settings, 20261042).
  const countries = rows.filter(r => r.enabled).map(r => ({ settings: L.mapCountryRow(snake(r)), apps: r.countryCode === 'GB' }))
  const world = { catalog, countries }
  const C = cc => countries.find(c => c.settings.countryCode === cc)
  const val = (tok, cc) => { const v = L.tokenValue(tok, world, C(cc), L.previewLocaleOf(C(cc).settings)); return 'value' in v ? v.value : `!${v.problem.kind}` }
  const publicKeys = catalog.plans.filter(p => p.isPublic).map(p => p.key)
  const nameOf = k => catalog.plans.find(p => p.key === k).name

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · live values for GB, US, IE, DE, JP, BR and SG — as the pricing section prints them')
  t('44 switched-on countries in the fixtures, as live', countries.length === 44, countries.length)
  const { R } = await identityViews('faq1-pages')
  for (const cc of ['GB', 'US', 'IE', 'DE', 'JP', 'BR', 'SG']) {
    const P = await kit.quietAsync(() => R.page('landing', cc === 'IE' ? 'ie' : cc === 'DE' ? 'de' : cc === 'SG' ? 'sg' : SEG[cc], rows))
    const html = P.html ?? ''
    const amounts = [...html.matchAll(/<span class="plan-amount">([^<]*)<\/span>/g)].map(m => m[1].replace(/&nbsp;| /g, ' '))
    const offered = L.PLAN_FIELDS && publicKeys.filter(k => !val(`${k}.price`, cc).startsWith('!'))
    const ours = offered.map(k => val(`${k}.price`, cc))
    t(`${cc}: {K.price} for each offered plan = the pricing cards' amounts (${ours.join(' · ')})`, ours.length > 0 && JSON.stringify(ours) === JSON.stringify(amounts), { ours, amounts })
    for (const k of offered) {
      const inc = val(`${k}.included`, cc), fee = val(`${k}.fee`, cc)
      const row = catalog.prices.find(p => p.planKey === k && p.countryCode === cc)
      if (row.feeBps > 0) t(`${cc}: {${k}.fee} appears in its card's fee sentence`, html.includes(`<b>${fee}*</b>`), fee)
      if (row.includedOnlineMinor > 0) t(`${cc}: {${k}.included} appears in its card's fee sentence`, html.includes(`<b>${inc}</b>`), inc)
      t(`${cc}: {${k}.extraVan} is the plan_prices extra van, in the same form`, val(`${k}.extraVan`, cc) === val(`${k}.price`, cc))   // extra van = the monthly price everywhere (data)
    }
    t(`${cc}: {card.fee} is the footnote's figure`, html.includes(val('card.fee', cc).replace(/&/g, '&amp;')), val('card.fee', cc))
    t(`${cc}: {trial.months} is the trial plan's length`, val('trial.months', cc) === String(catalog.plans.find(p => p.isTrial).trialMonths))
  }
  t('GB: home form and the UK words', val('pro.price', 'GB') === '£29' && val('pro.included', 'GB') === '£4,000' && val('payg.fee', 'GB') === '0.99%' && val('card.fee', 'GB') === '1.5% + 20p' && val('payAtTruck', 'GB') === 'Pay at Hatch')
  t('US: "$29" and "Pay at the truck"', val('pro.price', 'US') === '$29' && val('payAtTruck', 'US') === 'Pay at the truck' && val('card.fee', 'US') === '2.9% + 30¢')
  t('IE: "€29", the card fee as an amount', val('pro.price', 'IE') === '€29' && val('card.fee', 'IE') === '1.5% + €0.25')
  t('DE: the home form "29 €" and "0,99 %"', val('pro.price', 'DE') === '29 €' && val('payg.fee', 'DE') === '0,99 %', [val('pro.price', 'DE'), val('payg.fee', 'DE')])
  t('JP: JPY has no decimals — "¥1,980", "¥250,000"', val('pro.price', 'JP') === '¥1,980' && val('pro.included', 'JP') === '¥250,000' && !/[.,]\d{2}\b/.test(val('unlimited.price', 'JP')), [val('pro.price', 'JP'), val('pro.included', 'JP')])
  t('BR and SG: only one plan offered — the trial-end plan is it, priced at home', val('trialEnd.name', 'BR') === nameOf('unlimited') && val('trialEnd.price', 'BR') === val('unlimited.price', 'BR') && val('trialEnd.name', 'SG') === nameOf('unlimited'))
  t('GB: the trial-end plan is the global fallback', val('trialEnd.name', 'GB') === catalog.plans.find(p => p.isExpiryFallback).name)
  t('{apps.sentence}: the sentence in GB, nothing in US', val('apps.sentence', 'GB').startsWith('There’s also an iPad and Android app') && val('apps.sentence', 'US') === '')
  t('{apps.offline}: the app wording in GB, the web wording elsewhere', /^The iPad and Android app keeps taking walk-up orders/.test(val('apps.offline', 'GB')) && val('apps.offline', 'JP') === 'The web dashboard needs a connection to show new orders.')
  t('{plansWith.whatsapp_replies}: the offered plans with it switched on, as a list', val('plansWith.whatsapp_replies', 'GB') === `${nameOf('pro')} and ${nameOf('unlimited')}` && val('plansWith.whatsapp_replies', 'BR') === nameOf('unlimited'))
  t('{countries}: every switched-on country, in English, as one list', (() => { const v = val('countries', 'GB'); return v.startsWith('Australia, Austria') && v.endsWith('United Kingdom and United States') && v.split(', ').length === 43 })(), val('countries', 'GB').slice(0, 120))
  const seed = parseSeed()
  const q = n => seed.items[n - 1]
  const br = L.resolveItem(q(1), world, C('BR'), 'en-GB'), gb = L.resolveItem(q(1), world, C('GB'), 'en-GB')
  t('BR reads question 1\'s single-plan answer; GB the main one', br.shown && br.single && br.text.startsWith(`There’s one plan: ${nameOf('unlimited')}, R$`) && gb.shown && !gb.single && gb.text.startsWith('Each plan is per truck per month: Pay as you go £0'), [br.text, gb.text])
  t('Show in hides question 5 ("part of the year", plan:payg) in BR and shows it in GB', !L.resolveItem(q(5), world, C('BR'), 'en-GB').shown && L.resolveItem(q(5), world, C('GB'), 'en-GB').shown)
  t('question 7 in the US: the apps sentence is left out cleanly (no trailing space)', (() => { const r = L.resolveItem(q(7), world, C('US'), 'en-US'); return r.text.endsWith('the card machine you already have.') && r.omitted.join() === 'apps.sentence' })())

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the check fails, and names the countries')
  const item = a => ({ questionEn: 'Q?', answerEn: a, answerSinglePlanEn: null, showIn: 'all' })
  const unk = L.checkItem(item('Hello {foo.bar}.'), world)
  t('an unknown token fails in every country', !unk.ok && unk.failures.length === 44 && /\{foo\.bar\}, which isn't a live value we know/.test(unk.sentences.join(' ')), unk.sentences)
  const off = L.checkItem(item('From {payg.price}.'), world)
  const offNames = off.failures.map(f => f.name).sort()
  t('a plan not offered fails in exactly BR, MX, MY, SG and TH — named in English', !off.ok && JSON.stringify(offNames) === JSON.stringify(['Brazil', 'Malaysia', 'Mexico', 'Singapore', 'Thailand']), offNames)
  t('…its sentence names the plan and the countries', off.sentences[0] === `This answer uses {payg.price}, but ${nameOf('payg')} isn't offered in Brazil, Malaysia, Mexico, Singapore and Thailand.`, off.sentences)
  t('…and offers both fixes ("Add an answer for those countries", "Show only where … is offered")', off.fixes.addSingle === true && off.fixes.showOnly?.key === 'payg')
  const nul = L.checkItem(item('Up to {unlimited.included}.'), world)
  t('a NULL allowance has no value: fails in every country', !nul.ok && nul.failures.length === 44 && /which has no value in all 44 countries/.test(nul.sentences[0]), nul.sentences)
  t('…and adding a single-plan answer would not help there', nul.fixes.addSingle === false && nul.fixes.showOnly === null)
  const fixedSingle = L.checkItem({ ...item('From {payg.price}.'), answerSinglePlanEn: 'Just {unlimited.price}.' }, world)
  t('with a single-plan answer the same text passes everywhere', fixedSingle.ok, fixedSingle.sentences)
  t('…and so does "Show only where … is offered"', L.checkItem({ ...item('From {payg.price}.'), showIn: 'plan:payg' }, world).ok)
  const offWorld = { catalog, countries: countries.filter(c => !['BR', 'MX', 'MY', 'SG', 'TH'].includes(c.settings.countryCode)) }
  t('switched-off countries are not checked (the five off → it passes)', L.checkItem(item('From {payg.price}.'), offWorld).ok)
  t('a token in a question fails', !L.checkItem({ ...item('ok'), questionEn: 'From {pro.price}?' }, world).ok)
  t('a stray brace fails', !L.checkItem(item('Oops { this'), world).ok)
  t('the single-plan label is computed: "Where only Unlimited is offered (5 countries)"', L.singlePlanLabel(world) === `Where only ${nameOf('unlimited')} is offered (5 countries)`, L.singlePlanLabel(world))

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · lib/faq names no plan key or plan name')
  const faqFiles = fs.readdirSync(path.join(REPO, 'lib/faq')).map(f => `lib/faq/${f}`)
  const words = [...publicKeys, ...catalog.plans.filter(p => p.isPublic).map(p => p.name)]
  // ⚠️ RE-PINNED (costs-accounts-1, 4 November 2026): import-and-cs-fix (489b4f5f) added `ORDINARY_WORDS = { cs: ['Pro'] }` to
  // lib/faq/translation.ts — Czech "Pro" ("for"), listed BECAUSE it is not a plan name — and its comments say why. That one declaration
  // and the file's comments are set aside before the grep (the declaration pinned exactly, so a second entry still fails); every other
  // line of every lib/faq file is checked as before.
  const ORDINARY = "export const ORDINARY_WORDS: Readonly<Record<string, readonly string[]>> = { cs: ['Pro'] }"
  t('lib/faq/translation.ts: ORDINARY_WORDS is exactly Czech "Pro" (import-and-cs-fix)', read('lib/faq/translation.ts').split(ORDINARY).length === 2)
  for (const f of faqFiles) {
    const src = f === 'lib/faq/translation.ts' ? read(f).replace(ORDINARY, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1') : read(f)
    const hits = words.filter(w => new RegExp(`(^|[^A-Za-z0-9_])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`, 'i').test(src))
    t(`${f}: none of ${words.join(', ')}`, hits.length === 0, hits)
    t(`${f}: no internal plan key as a quoted string either`, !catalog.plans.some(p => new RegExp(`['"\`]${p.key}['"\`]`).test(src)))
  }
  // ⚠️ RE-PINNED (faq-3): lib/faq/public.ts, the public FAQ's loader — it names no plan either (this same grep covers it).
  // ⚠️ RE-PINNED (faq-2): + translation.ts, source-hash.ts and translator.ts (the FAQ in every language) — the same grep covers them.
  // ⚠️ RE-PINNED (perf-1, 5 November 2026, docs/perf-1-report.md): + public-cache.ts, the public FAQ's reads in the marketing pages' tagged
  // shared cache (read only by public.ts, only during a marketing render) — the same grep above covers it (it names no plan).
  t('eight files in lib/faq (faq-3: public.ts; faq-2: translation.ts, source-hash.ts, translator.ts; perf-1: public-cache.ts)', faqFiles.length === 8 && ['lib/faq/public.ts', 'lib/faq/translation.ts', 'lib/faq/source-hash.ts', 'lib/faq/translator.ts', 'lib/faq/public-cache.ts'].every(f => faqFiles.includes(f)), faqFiles)

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · Copy feedback for Claude')
  const secs = seed.sections
  const items = seed.items.map((i, n) => ({ ...i, status: 'draft', note: null, noteDone: false, publishedAt: null, createdAt: 'x', updatedAt: 'x', updatedBy: null }))
  items[0] = { ...items[0], note: 'Lead with the cheapest plan.' }
  items[4] = { ...items[4], note: 'Done already', noteDone: true }
  items[21] = { ...items[21], note: '   ' }
  items[24] = { ...items[24], note: 'Confirm with the lawyer.', status: 'published' }   // faq-1b: "Do I own my customers’ data?" is the 25th
  const text = L.feedbackText(secs, items, world, 'GB', new Date('2026-11-01T12:00:00Z'))
  const lines = text.split('\n')
  t('the count: notes with words that aren\'t done (2 — a done note and a blank one are left out)', L.openNotes(items) === 2)
  t('the header: "HatchGrab FAQ feedback — 1 November 2026 — 2 notes"', lines[0] === 'HatchGrab FAQ feedback — 1 November 2026 — 2 notes', lines[0])
  t('grouped by section, only sections with an open note', (text.match(/^## /gm) || []).join() === '## ,## ' && text.includes('## Pricing') && text.includes('## About HatchGrab') && !text.includes('## Getting started'))
  const block = text.slice(text.indexOf('### How much'))
  t('each block: question with id and status, Answer, single-plan answer, UK preview, My note — in that order', new RegExp([
    `^### How much does HatchGrab cost\\?  \\[id: ${items[0].id}\\] \\[draft\\]`, '^Answer: Each plan is per truck per month: \\{payg\\.name\\}[^\\n]*', '^Answer where one plan is offered: There’s one plan[^\\n]*',
    '^UK preview: Each plan is per truck per month: Pay as you go £0[^\\n]*', '^My note: Lead with the cheapest plan\\.'].join('\\n'), 'm').test(block), block.slice(0, 600))
  t('"none" where there is no single-plan answer, and the status as stored', text.includes(`[id: ${items[24].id}] [published]`) && /Answer where one plan is offered: none\nUK preview: You control it/.test(text))
  t('the done note is not in the text', !text.includes('Done already'))
  t('the button shows the same number (FaqTab renders openNotes)', /Copy feedback for Claude \(\{notes\}\)/.test(read('components/admin/FaqTab.tsx')) && /const notes = openNotes\(items\)/.test(read('components/admin/FaqTab.tsx')))

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the admin route')
  const store = memoryStore(seed, world)
  globalThis.__faqStore = store
  const Rt = await kit.bundle('faq1-route', "export { GET, POST } from '@/app/api/admin/faq/route'\nexport { NextRequest } from 'next/server'", {
    stubs: {
      '@/lib/auth/admin': 'export async function adminUser() { return globalThis.__faqAdmin ?? null }\nexport async function verifyAdmin() { return !!globalThis.__faqAdmin }',
      '@/lib/admin/faq-store': 'export const serviceFaqStore = new Proxy({}, { get: (_, k) => globalThis.__faqStore[k] })',
    },
  })
  const url = 'http://hatchgrab.localhost:3000/api/admin/faq'
  const post = body => kit.quietAsync(() => Rt.POST(new Rt.NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })))
  globalThis.__faqAdmin = null
  const g403 = await kit.quietAsync(() => Rt.GET(new Rt.NextRequest(url)))
  const p403 = await post({ action: 'item.publish', id: q(4).id })
  t('a non-admin GET gets 403 and no data', g403.status === 403 && !('items' in await g403.json()))
  t('a non-admin POST gets 403 and writes nothing', p403.status === 403 && store.writes === 0)
  globalThis.__faqAdmin = { id: 'admin-1', email: 'dominic@hatchgrab.com' }
  const g = await kit.quietAsync(() => Rt.GET(new Rt.NextRequest(url)))
  const gb2 = await g.json()
  t('an admin GET: 5 sections, 26 questions and the world', g.status === 200 && gb2.sections.length === 5 && gb2.items.length === 26 && gb2.world.countries.length === 44)
  // Question 4 has no single-plan answer and shows everywhere, so a plan token in it fails in the five Unlimited-only countries.
  store.patchItem(q(4).id, { answerEn: 'From {payg.price}.' })
  const pubBad = await post({ action: 'item.publish', id: q(4).id })
  const pubBadBody = await pubBad.json()
  t('publish is refused while the check fails, naming the countries', pubBad.status === 400 && /isn't offered in Brazil, Malaysia, Mexico, Singapore and Thailand/.test(pubBadBody.error) && store.item(q(4).id).status === 'draft', pubBadBody)
  store.patchItem(q(4).id, { answerEn: q(4).answerEn })
  const pubOk = await post({ action: 'item.publish', id: q(4).id })
  t('a question that reads correctly publishes (status, published_at, updated_by)', pubOk.status === 200 && store.item(q(4).id).status === 'published' && !!store.item(q(4).id).publishedAt && store.item(q(4).id).updatedBy === 'dominic@hatchgrab.com')
  const before = store.item(q(4).id).answerEn
  const badSave = await post({ action: 'item.update', id: q(4).id, patch: { answerEn: 'Only {payg.price}.' } })
  t('saving failing text over a PUBLISHED question is refused and the published text stays', badSave.status === 400 && store.item(q(4).id).answerEn === before && /Not saved: this question is published/.test((await badSave.json()).error))
  const badShowPub = await post({ action: 'item.update', id: q(4).id, patch: { showIn: 'plan:nosuchplan' } })
  t('a Show in naming a plan offered nowhere is saved even when published: it shows nowhere, so nothing reads wrongly', badShowPub.status === 200)
  await post({ action: 'item.update', id: q(4).id, patch: { showIn: 'all' } })
  const draftSave = await post({ action: 'item.update', id: q(1).id, patch: { answerEn: 'Draft text {foo.bar}' } })
  t('a draft saves freely (the check only gates publishing)', draftSave.status === 200 && store.item(q(1).id).answerEn === 'Draft text {foo.bar}')
  const okSave = await post({ action: 'item.update', id: q(4).id, patch: { answerEn: before + ' ' } })
  t('a published question\'s save that still reads correctly is saved', okSave.status === 200 && store.item(q(4).id).answerEn === before + ' ')
  store.patchItem(q(4).id, { answerEn: 'Only {payg.price}.' })   // the data moved under a published question…
  const note = await post({ action: 'item.update', id: q(4).id, patch: { note: 'my note', noteDone: true } })
  t('…a note still saves without the check (notes never change what is published)', note.status === 200 && store.item(q(4).id).note === 'my note' && store.item(q(4).id).noteDone === true)
  t('a bad Show in is refused', (await post({ action: 'item.update', id: q(3).id, patch: { showIn: 'plan:Pro Plan' } })).status === 400)
  const unp = await post({ action: 'item.unpublish', id: q(4).id })
  t('unpublish returns it to a draft', unp.status === 200 && store.item(q(4).id).status === 'draft')
  const writesBefore = store.writes
  const del = await post({ action: 'section.delete', id: secs[4].id })
  t('deleting a section takes its questions with it', del.status === 200 && store.state.sections.length === 4 && store.state.items.length === 22 && store.writes > writesBefore)
  const mv = await post({ action: 'item.move', id: q(1).id, dir: -1 })
  t('moving the first question up stays put (nothing above it)', mv.status === 200 && store.item(q(1).id).sectionId === secs[0].id)
  await post({ action: 'item.move', id: q(6).id, dir: -1 })
  t('moving a section\'s first question up moves it to the end of the section above', store.item(q(6).id).sectionId === secs[0].id && store.item(q(6).id).position > Math.max(...store.state.items.filter(i => i.sectionId === secs[0].id && i.id !== q(6).id).map(i => i.position)))
  t('the route is admin-checked on the server, before anything else', /const user = await adminUser\(req\)\s*\n\s*if \(!user\) return forbidden\(\)/.test(read('app/api/admin/faq/route.ts')) && /status: 403/.test(read('app/api/admin/faq/route.ts')))
  t('the store is the service role (lib/supabase) and server-only', /import 'server-only'/.test(read('lib/admin/faq-store.ts')) && /@\/lib\/supabase/.test(read('lib/admin/faq-store.ts')))

  // ── the page itself, rendered (no admin session is available, so this is the closest look at it: the real component with its
  //    first read's state filled in) ──
  const T = await kit.bundle('faq1-tab', "export { default as FaqTab } from '@/components/admin/FaqTab'", {
    patches: [{ file: 'components/admin/FaqTab.tsx', states: ['sections', 'items', 'world'] }],
    stubs: { '@/lib/native/session': 'export async function nativeAuthHeader() { return {} }' },
  })
  const tabItems = seed.items.map(i => ({ ...i, status: 'draft', noteDone: false, publishedAt: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', updatedBy: null }))
  tabItems[3] = { ...tabItems[3], answerEn: 'From {payg.price}.', note: 'Lead with the cheapest plan.' }
  tabItems[6] = { ...tabItems[6], status: 'published', publishedAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z', note: 'Apps only where they are on the store.', noteDone: true }
  globalThis.__ms = { sections: seed.sections, items: tabItems, world }
  let page = ''
  try { page = kit.renderStatic(kit.h(T.FaqTab)) } finally { delete globalThis.__ms }
  if (process.env.FAQ1_DUMP) fs.writeFileSync(process.env.FAQ1_DUMP, page)
  const plain = page.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  t('the page renders: heading, Preview as, + Section, + Question, Copy feedback for Claude (n)', /FAQ/.test(plain) && plain.includes('Preview as:') && plain.includes('+ Section') && plain.includes('+ Question') && plain.includes(`Copy feedback for Claude (${L.openNotes(tabItems)})`) && L.openNotes(tabItems) === 10, plain.slice(0, 300))
  // ⚠️ RE-PINNED (faq-3): the seed's …0007 and …0010 now fail the check too (the paying-at-the-truck wording) — 3, not 1.
  // ⚠️ RE-PINNED (faq-2): the first chip names the languages, and the published chip the translations' state (none here).
  t('the summary: 44 countries · 28 languages · 1 published (translating) · 3 questions need an answer for some countries (faq-3: …0007 and …0010 by their wording)', plain.includes('44 countries · 28 languages') && plain.includes('✓ 1 published · ● 1 translating') && plain.includes('3 questions need an answer for some countries'))
  t('five sections with Rename · ↑ ↓ · Delete', (page.match(/>Rename</g) || []).length === 5)
  t('the single-plan answer under its computed label', plain.includes('Where only Unlimited is offered (5 countries)'))
  t('green "✓ Reads correctly in all 44 countries", and "… where it shows" for Show in', plain.includes('✓ Reads correctly in all 44 countries') && plain.includes('✓ Reads correctly in all 39 countries where it shows'))
  t('the red check with both fixes, worded as the mockup', plain.includes(`This answer uses {payg.price}, but ${nameOf('payg')} isn't offered in Brazil, Malaysia, Mexico, Singapore and Thailand.`) && plain.includes('Add an answer for those countries') && plain.includes(`show only where ${nameOf('payg')} is offered`) && plain.includes("It can't be published until one is chosen."))
  t('the preview line for the default country (GB), English', plain.includes('United Kingdom preview: Each plan is per truck per month: Pay as you go £0'))
  t('MY NOTES with Done; a done note is dimmed', (page.match(/>My notes</g) || []).length === 26 && /text-slate-400[^>]*>Apps only where they are on the store\./.test(page))
  t('tokens drawn highlighted in the answers at rest', /<code class="[^"]*font-mono[^"]*text-orange-700[^"]*">\{payg\.name\}<\/code>/.test(page))
  t('Draft / Published labels, "New" and "Edited <date>"', plain.includes('Published') && plain.includes('Draft') && plain.includes('New') && plain.includes('Edited 1 Nov'))
  // ⚠️ RE-PINNED (faq-2): the indicators are here now — scripts/faq-2.cjs §9 proves each one.
  t('the translation indicators (faq-2): the published question translating, the drafts "Translates when published"', /● Translating — within the hour \(0\/28\)/.test(plain) && /○ Translates when published/.test(plain))

  // ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · the migration: security, columns and no new app column')
  const sql = read(MIGRATION)
  const code = sql.replace(/--[^\n]*/g, '')
  for (const tb of ['faq_sections', 'faq_items']) {
    t(`${tb}: RLS on`, new RegExp(`alter table public\\.${tb} enable row level security;`).test(code))
    t(`${tb}: every grant revoked from anon, authenticated and public`, new RegExp(`revoke all on public\\.${tb} from anon, authenticated, public;`).test(code))
    t(`${tb}: the service role only`, new RegExp(`grant all on public\\.${tb} to service_role;`).test(code) && !new RegExp(`grant [^;]* on public\\.${tb} to (anon|authenticated|public)`).test(code))
  }
  t('no policies', !/create policy/i.test(code))
  t('section_id cascades; show_in, status and the published stamp are CHECKed', /references public\.faq_sections\(id\) on delete cascade/.test(code) && /show_in = 'all' or show_in = 'apps' or show_in ~ '\^plan:\[a-z\]\[a-z0-9_\]\*\$'/.test(code) && /status in \('draft', 'published'\)/.test(code) && /status <> 'published' or published_at is not null/.test(code))
  t('the show_in CHECK and lib/faq isShowIn agree', ['all', 'apps', 'plan:payg', 'plan:a_b2'].every(L.isShowIn) && !['plan:', 'plan:Pro', 'everywhere', 'plan:1x'].some(L.isShowIn))
  t('every column the brief names', ['position int', 'question_en', 'answer_en', 'answer_single_plan_en', 'show_in', 'note', 'note_done', 'published_at', 'created_at', 'updated_at', 'updated_by', 'title_en'].every(c => code.includes(c.split(' ')[0])))
  t('no operator_apps column (decision faq-1 Q1 → A) and no write to country_settings or its app flags', !/operator_apps/.test(code) && !/(alter table|update|insert into)\s+public\.country_settings/i.test(code))
  t('one transaction, safe twice (if not exists; fixed ids, on conflict do nothing)', /^begin;/m.test(code) && /^commit;/m.test(code) && (code.match(/create table if not exists/g) || []).length === 2 && (code.match(/on conflict \(id\) do nothing;/g) || []).length === 2)
  // ⚠️ RE-PINNED (faq-1c-undo, 2 November 2026): 20261058_faq_1c_undo.sql follows it now (faq-1c's 20261057 ran and was removed from
  // the repo; 20261058 reverses it outside the FAQ). 20261056 is still the one faq-1 file, and nothing else came after it.
  // ⚠️ RE-PINNED (contact-1, 2 November 2026): 20261061 (contact_messages) follows too.
  // ⚠️ RE-PINNED (competitor-features-2, 3 November 2026): and 20261062 (tiers, not_mentioned, competitor_feature_checks).
  // ⚠️ RE-PINNED (tidy-2, 3 November 2026): and 20261063 / 20261064 (the apps everywhere; Real Thai Food).
  // ⚠️ RE-PINNED (costs-accounts-1, 4 November 2026): this assertion FAILED AT HEAD (41de9294). It pinned the EXACT list of migrations
  // after faq-1's, so every later migration that had nothing to do with the FAQ (brand-kit-1's 20261065, paperwork-1's 20261066,
  // import-and-cs-fix's 20261067) broke it and needed a re-pin. What it guards is unchanged: 20261056 is the one faq-1 file, the
  // files known to follow it are still there in order, and no LATER file touches the FAQ's tables — the only kind of later
  // migration that could change what this harness proves.
  {
    const MIG = path.join(REPO, 'supabase/migrations')
    const after = fs.readdirSync(MIG).filter(f => f > '20261056_faq_1.sql' && /^\d{8}/.test(f))
    const KNOWN = ['20261058_faq_1c_undo.sql', '20261059_faq_3.sql', '20261060_faq_2_translations.sql', '20261061_contact_1.sql', '20261062_competitor_features_2.sql', '20261063_tidy_2_apps_everywhere.sql', '20261064_tidy_2_real_thai_food.sql']
    const later = after.slice(KNOWN.length)
    const touchingFaq = later.filter(f => /\bfaq_(items|sections|translations)\b/.test(fs.readFileSync(path.join(MIG, f), 'utf8').replace(/--.*$/gm, '')))
    t('the faq-1 migration number is unique; 20261058 … 20261064 follow it in order, and no later migration touches the FAQ tables', fs.readdirSync(MIG).filter(f => f.startsWith('20261056')).length === 1
      && JSON.stringify(after.slice(0, KNOWN.length)) === JSON.stringify(KNOWN) && !touchingFaq.length, { after, touchingFaq })
  }

  // ══ 7 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the seed')
  t('5 sections, in order', seed.sections.map(s => s.titleEn).join('|') === 'Pricing|Getting started|Orders and payments|Reaching customers|About HatchGrab')
  t('26 questions, all drafts (status left to its default)', seed.items.length === 26 && !/'published'\s*[,)]/.test(sql.slice(sql.indexOf('insert into public.faq_items'))))
  t('questions per section 5 · 4 · 9 · 4 · 4, positions 1..n (faq-1b)', JSON.stringify(seed.sections.map(s => seed.items.filter(i => i.sectionId === s.id).map(i => i.position))) === JSON.stringify([[1, 2, 3, 4, 5], [1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4], [1, 2, 3, 4]]))
  const planNames = catalog.plans.map(p => p.name)
  const countryNames = [...new Set(rows.flatMap(r => [r.name, r.shortName]).filter(n => n && n.length > 2))]
  for (const [n, i] of seed.items.entries()) {
    for (const [field, txt] of [['question', i.questionEn], ['answer', i.answerEn], ['single-plan answer', i.answerSinglePlanEn]]) {
      if (!txt) continue
      let bare = txt.replace(/\{[^{}]*\}/g, ' ')
      if (n === 5 && field === 'answer') bare = bare.replace('under 60 seconds', 'under ‹allowed›')
      const digits = bare.match(/\d+/g), money = bare.match(/\p{Sc}/gu)
      const plans = planNames.filter(p => new RegExp(`\\b${p}\\b`).test(bare)), places = countryNames.filter(c => new RegExp(`\\b${c}\\b`).test(bare))
      if (digits || money || plans.length || places.length) t(`question ${n + 1} (${field}): no digit, currency sign, plan name or country outside a live value`, false, { digits, money, plans, places })
    }
  }
  t('the one allowed figure is "60 seconds", in question 6 only', /under 60 seconds/.test(q(6).answerEn) && seed.items.filter(i => /\d/.test([i.questionEn, i.answerEn, i.answerSinglePlanEn ?? ''].join(' ').replace(/\{[^{}]*\}/g, ''))).length === 1)
  // ⚠️ RE-PINNED (faq-3, 2 November 2026): the check also refuses an answer that mentions paying at the truck (lib/faq/check.ts
  // BANNED_WORDING). The seed's …0007 ("pay at the truck") and …0010 ({payAtTruck}) say so, as faq-1b agreed them then; live,
  // …0007 was reworded and …0010 is a draft (20261059). Every other part of the check still passes for every seed question.
  const WORDING = /Published answers can't mention Pay at Hatch/
  const wordingFails = []
  for (const [n, i] of seed.items.entries()) {
    const c = L.checkItem(i, world)
    if (c.sentences.some(x => WORDING.test(x))) wordingFails.push(i.id.slice(-4))
    const rest = c.sentences.filter(x => !WORDING.test(x))
    t(`question ${n + 1} reads correctly in every switched-on country it shows in (${c.shownCount})`, rest.length === 0 && c.shownCount > 0, rest)
  }
  t('faq-3: of the seed, only …0007 and …0010 carry the wording the check now refuses', wordingFails.join() === '0007,0010', wordingFails)
  // faq-1b (2 November 2026): the agreed list — every kept id in its place, …0017 folded into …0007, three new rows.
  const ID = n => `fa000002-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
  t('faq-1b: the 26 ids in the agreed order', JSON.stringify(seed.items.map(i => i.id)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 25, 26, 18, 19, 20, 21, 22, 23, 24, 27].map(ID)))
  t('faq-1b: "Do I need a card reader?" (…0017) is gone, folded into question 7', !seed.items.some(i => i.id === ID(17)) && /card reader/.test(q(7).questionEn) && /card machine you already have/.test(q(7).answerEn))
  t('faq-1b: answers short — none over about 80 words', seed.items.every(i => [i.answerEn, i.answerSinglePlanEn ?? ''].every(a => a.split(/\s+/).filter(Boolean).length <= 85)), seed.items.map(i => i.answerEn.split(/\s+/).length))
  t('faq-1b: question 12 avoids "kitchen capacity"', !/capacity/i.test(q(12).answerEn))
  t('faq-1b: question 21 says it fills your design and nothing is posted automatically', /your own design/.test(q(21).answerEn) && /nothing is posted automatically/.test(q(21).answerEn))
  t('faq-1b: question 26 promises no hours, response time or phone number, and carries its CHECK note', !/\d|hour|within|phone|call us/i.test(q(26).answerEn) && /^CHECK \(Cursor\): .*support details/.test(q(26).note))
  t('every CHECK note starts "CHECK (Cursor): "', seed.items.filter(i => i.note).every(i => i.note.startsWith('CHECK (Cursor): ')) && seed.items.filter(i => i.note).length === 9)
  t('en-GB spelling: no US forms', !/\b(color|center|program|organiz|apologiz|favorite|license)\w*/i.test(seed.items.map(i => [i.questionEn, i.answerEn, i.answerSinglePlanEn].join(' ')).join(' ')))

  // ══ 8 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · nothing public changes')
  // ⚠️ RE-PINNED (copy-truth-1, 2 November 2026): the landing page's offline line changed on purpose (offline protection is switched
  // on by the truck; the apps sentence only where the apps are in the stores). scripts/copy-truth-1.cjs proves that line is the ONLY
  // difference from the commit before it, so scripts/fixtures/faq-1-identity.json was recaptured from the tree after it. /llms.txt's
  // hash did not move.
  const pinned = JSON.parse(read(IDENTITY))
  if (SG2.LANDED) delete pinned.llms   // ⚠️ RE-PINNED (seo-geo-2 B4): /llms.txt rebuilt — see identityViews
  const { out } = await identityViews('faq1-identity')
  for (const k of Object.keys(pinned)) t(`${k} byte-identical to HEAD (sha256 of HTML and metadata)`, out[k] === pinned[k], { now: out[k], head: pinned[k] })
  t(`the same views (GB, US, BR, JP landing${SG2.LANDED ? '; /llms.txt rebuilt by seo-geo-2 B4' : ' + /llms.txt'})`, JSON.stringify(Object.keys(out).sort()) === JSON.stringify(Object.keys(pinned).sort()))
  const publicFiles = []
  const walk = d => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) publicFiles.push(p) } }
  for (const d of ['app', 'components', 'lib']) walk(d)
  const importers = publicFiles.filter(f => /@\/lib\/faq\/|@\/lib\/i18n\/catalog\/faq'|translatorFor\([^)]*'faq'\)/.test(read(f)))
  // ⚠️ RE-PINNED (faq-3): the FAQ is public on the English landing pages — lib/faq/public.ts, read by app/landing/page.tsx, its
  // cache cleared by the Admin route. scripts/faq-3.cjs proves what those pages show.
  const allowed = new Set(['components/admin/FaqTab.tsx', 'lib/admin/faq-actions.ts', 'lib/faq/check.ts', 'lib/faq/feedback.ts', 'lib/faq/live-values.ts', 'lib/i18n/catalog/faq.ts',
    'lib/faq/public.ts', 'app/landing/page.tsx', 'app/api/admin/faq/route.ts', 'lib/faq/translation.ts', 'lib/faq/translator.ts',
    // ⚠️ RE-PINNED (seo-geo-2 B4): /llms.txt carries the English FAQ (lib/faq/public.ts landingFaq for GB); lib/llms-text.ts takes its type.
    'app/llms.txt/route.ts', 'lib/llms-text.ts',
    // ⚠️ RE-PINNED (faq-4): the FAQ is its own page, app/faq/page.tsx; the sitemap lists it and the marketing pages' footers link it
    // (faqHrefFor) where it has content. scripts/faq-4.cjs proves the page, the sitemap and the footer link.
    'app/faq/page.tsx', 'app/sitemap.ts', 'components/landing/MarketingFrame.tsx', 'app/about/page.tsx', 'app/compare/page.tsx', 'app/[country]/[section]/[slug]/page.tsx',
    // ⚠️ RE-PINNED (perf-1, 5 November 2026): lib/faq/public-cache.ts (the FAQ's cached reads) imports lib/faq/public.ts, its own module.
    'lib/faq/public-cache.ts'])
  t('only Admin › FAQ, its server code and the English landing page (faq-3) import lib/faq or the faq messages', importers.every(f => allowed.has(f)), importers.filter(f => !allowed.has(f)))
  t('the admin page mounts it as the last tab', /pricing:[^\n]*\n[\s\S]*demos:[^\n]*\n[^\n]*\n\s*faq:\s*\{ icon: '❓', label: 'FAQ' \},\n\} as const/.test(read('app/admin/page.tsx')))
  t('faq.phrases.* is in en-GB only for now (Dominic, 1 Nov: English until approved)', (() => { const d = JSON.parse(read('messages/en-GB.json')).faq?.phrases; return d && Object.keys(d).join() === 'appsSentence,appsOffline,webOffline' })())

  // ══ 9 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // faq-1c-undo (2 November 2026): the six FAQ rows Dominic kept from faq-1c, as supabase/migrations/20261058_faq_1c_undo.sql leaves
  // them (faq-1c's own migration, 20261057, ran and was removed from the repo; 20261058 carries its FAQ edits and nothing else of it).
  head('9 · the FAQ rows kept from faq-1c (20261058) read correctly everywhere')
  {
    const undo = read('supabase/migrations/20261058_faq_1c_undo.sql')
    const blocks = undo.split('update public.faq_items set').slice(1)
    const blockOf = id => blocks.find(bk => new RegExp(`^[\\s\\S]*?\\n\\s+where id = 'fa000002-0000-4000-8000-00000000${id}'`).test(bk) && !/^\\s*note_done/.test(bk))
    const dq = (b, tag) => { const m = new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`).exec(b); return m ? m[1] : null }
    const byId = Object.fromEntries(seed.items.map(i => [i.id.slice(-4), { ...i }]))
    { const b = blockOf('0002'); byId['0002'].questionEn = dq(b, 'q'); byId['0002'].answerEn = dq(b, 'a'); byId['0002'].answerSinglePlanEn = dq(b, 's') }
    { const x = dq(blockOf('0003'), 'x'); byId['0003'].answerEn += x; byId['0003'].answerSinglePlanEn += x }
    { const m6 = /replace\(answer_en, '([^']*)', '([^']*)'\)/.exec(blockOf('0006')); byId['0006'].answerEn = byId['0006'].answerEn.replace(m6[1], m6[2]) }   // the phrase read from 20261058 (a swept harness never names the payment provider)
    for (const id of ['0007', '0010', '0015']) byId[id].answerEn = dq(blockOf(id), 'a')
    t('the six rows rebuilt from 20261058', ['0002', '0003', '0006', '0007', '0010', '0015'].every(id => byId[id].answerEn && !byId[id].answerEn.includes('$')) && byId['0002'].questionEn === 'What do I pay on each order?' && byId['0010'].answerEn.startsWith('During your free trial, yes:'))
    for (const id of ['0002', '0003', '0006', '0007', '0010', '0015']) {
      const c = L.checkItem(byId[id], world)
      // faq-3: …0010 as 20261058 left it names {payAtTruck}, which the check now refuses — it is a draft since 20261059.
      const rest = c.sentences.filter(x => !(id === '0010' && /Published answers can't mention Pay at Hatch/.test(x)))
      t(`…${id} reads correctly in every switched-on country (${c.shownCount})${id === '0010' ? ' apart from the wording faq-3 refuses' : ''}`, rest.length === 0 && c.shownCount === 44 && (id !== '0010' || !c.ok), c.sentences)
      const bare = [byId[id].questionEn, byId[id].answerEn, byId[id].answerSinglePlanEn || ''].join(' ').replace(/\{[^{}]*\}/g, ' ').replace('under 60 seconds', '')
      t(`…${id}: no digit, currency sign or plan name outside a live value`, !/\d/.test(bare) && !/\p{Sc}/u.test(bare) && !catalog.plans.some(p => new RegExp(`\\b${p.name}\\b`).test(bare)))
    }
    t('20261058 writes no status and no note text, and reverses faq-1c outside the FAQ (plans true, Gusto\'s override, the comparison row)',
      !/status\s*=/.test(undo) && !/set note\s*=/.test(undo) && /set pay_at_hatch_allowed = true/.test(undo) && /feature_overrides - 'online_ordering_pay_at_hatch'/.test(undo) && /hatchgrab_source = 'plan:online_ordering_pay_at_hatch'/.test(undo))
    t('no faq-1c migration that changes plans stays in the repo', !fs.existsSync(path.join(REPO, 'supabase/migrations/20261057_faq_1c.sql')))
  }

  console.log(`\nfaq-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })

// ── the seed, read back out of the migration (a small SQL literal reader: strings with '' escapes, null, integers) ───────
function parseSeed() {
  const sql = read(MIGRATION)
  const block = (start, end) => { const a = sql.indexOf(start); return sql.slice(sql.indexOf('values', a) + 6, sql.indexOf(end, a)) }
  const tuples = src => {
    const out = []; let i = 0, cur = null, val = []
    while (i < src.length) {
      const ch = src[i]
      if (ch === '-' && src[i + 1] === '-') { i = src.indexOf('\n', i); if (i < 0) break; continue }
      if (ch === "'") { let s = ''; i++; for (;;) { if (src[i] === "'" && src[i + 1] === "'") { s += "'"; i += 2 } else if (src[i] === "'") { i++; break } else s += src[i++] } val.push(s); continue }
      if (ch === '(') { cur = []; val = cur; i++; continue }
      if (ch === ')') { out.push(cur); cur = null; i++; continue }
      const m = /^(null|-?\d+)/.exec(src.slice(i))
      if (m && cur) { val.push(m[1] === 'null' ? null : Number(m[1])); i += m[1].length; continue }
      i++
    }
    return out
  }
  const sections = tuples(block('insert into public.faq_sections', 'on conflict')).map(([id, position, titleEn]) => ({ id, position, titleEn }))
  const items = tuples(block('insert into public.faq_items', 'on conflict')).map(([id, sectionId, position, questionEn, answerEn, answerSinglePlanEn, showIn, note]) => ({ id, sectionId, position, questionEn, answerEn, answerSinglePlanEn, showIn, note }))
  return { sections, items }
}

// ── an in-memory FaqStore (lib/admin/faq-actions.ts), counting writes ────────────────────────────────────────────────────
function memoryStore(seed, world) {
  const state = {
    sections: seed.sections.map(s => ({ ...s })),
    items: seed.items.map(i => ({ ...i, status: 'draft', noteDone: false, publishedAt: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', updatedBy: 'faq-1 seed' })),
  }
  let n = 0
  const s = {
    state, get writes() { return n },
    item: id => state.items.find(i => i.id === id),
    patchItem: (id, cols) => Object.assign(state.items.find(i => i.id === id), cols),
    async sections() { return state.sections.map(x => ({ ...x })) },
    async items() { return state.items.map(x => ({ ...x })) },
    async world() { return world },
    async insertSection(row) { n++; const r = { id: `s-${state.sections.length + 1}`, ...row }; state.sections.push(r); return r },
    async updateSection(id, cols) { const r = state.sections.find(x => x.id === id); if (!r) return 0; n++; Object.assign(r, cols); return 1 },
    async deleteSection(id) { const before = state.sections.length; state.sections = state.sections.filter(x => x.id !== id); state.items = state.items.filter(x => x.sectionId !== id); n++; return before - state.sections.length },
    async insertItem(row) { n++; const r = { id: `i-${state.items.length + 1}`, answerSinglePlanEn: null, showIn: 'all', status: 'draft', note: null, noteDone: false, publishedAt: null, createdAt: 'now', updatedAt: 'now', ...row }; state.items.push(r); return { ...r } },
    async updateItem(id, cols) { const r = state.items.find(x => x.id === id); if (!r) return null; n++; Object.assign(r, Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined))); return { ...r } },
    async deleteItem(id) { const before = state.items.length; state.items = state.items.filter(x => x.id !== id); n++; return before - state.items.length },
  }
  return s
}
