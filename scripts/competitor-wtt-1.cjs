#!/usr/bin/env node
// scripts/competitor-wtt-1.cjs — competitor-wtt-1 (4 November 2026, docs/competitor-wtt-1-report.md).
//   node scripts/competitor-wtt-1.cjs        (NO NETWORK, NO DATABASE, NO CLAUDE API — the data file and fixture stores)
//
// What The Truck (whatthetruck.ai, GB) goes into the competitor database through the research importer:
//   1 · the data file: one active food_truck competitor (GB by its plan), its company in the note, one £0 plan with the
//       online first-tier fee, 42 answers — one per checked feature — each yes/partial with a quote and its page on
//       whatthetruck.ai, silence as not_mentioned, no "no"; nothing verified; no comparison entry (GB stays off);
//   2 · the importer writes it once: the competitor (without the instruction keys), check_requested_at set, the plan, the
//       42 answers with their quotes — and a rerun, or a second run by hand, writes nothing;
//   3 · a matching row (by domain) is updated, never duplicated: its placeholders are superseded, the check is requested;
//   4 · the answer rules are the checker's: a quote for yes/partial/no, "no" only with a negation (35.ao-7), not_mentioned
//       without a quote, unknown with its reason, a known key — and a refused file writes nothing;
//   5 · the registry and Admin's line; the requested competitor is first in its country's deep check.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'competitor-wtt-1' })
const { REPO } = kit
const FX = require('./_competitor-check-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const sha = b => crypto.createHash('sha256').update(b).digest('hex')

;(async () => {
  const L = await kit.bundle('wtt1-lib', [
    "export { runImports, importLines, DATA_FILES } from '@/lib/data-import/importer'",
    "export { importResearch, researchProblems } from '@/lib/data-import/research'",
    "export { deepTargets } from '@/lib/competitor-check/core'",
  ].join('\n'))
  const FILE_PATH = 'data/competitor-wtt-1/competitors.json'
  const raw = read(FILE_PATH)
  const doc = JSON.parse(raw)
  const features = JSON.parse(read('data/comparison-features/features.json')).features
  const KEYS = features.map(f => f.key)
  const CHECKED = features.filter(f => f.checked).map(f => f.key)
  const TODAY = '2026-11-05'
  const NOW = new Date(`${TODAY}T02:10:00Z`)
  const c = doc.competitors[0]
  const byKey = Object.fromEntries(c.answers.map(a => [a.key, a]))
  const keysWith = v => c.answers.filter(a => a.value === v).map(a => a.key).sort()
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

  // ── 1 · the data file ──────────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the data file: What The Truck, GB, unverified, every answer quoted or silent')
  t('the file can be imported (no problems against the feature list)', L.researchProblems(doc, { featureKeys: KEYS }).length === 0, L.researchProblems(doc, { featureKeys: KEYS }))
  t('one competitor: "What The Truck", https://whatthetruck.ai, food_truck, active, unverified, checked 4 Nov',
    doc.competitors.length === 1 && c.name === 'What The Truck' && c.website === 'https://whatthetruck.ai' && c.focus === 'food_truck' && c.lifecycle === 'active'
    && c.features_verified_at === null && c.features_checked_on === '2026-11-04' && doc.checked_on === '2026-11-04')
  t('its note is the company: What The Truck Software Ltd, no. 17365285, England and Wales, Harrow', /What The Truck Software Ltd/.test(c.notes) && /17365285/.test(c.notes) && /England and Wales/.test(c.notes) && /Harrow/.test(c.notes), c.notes)
  t('a check is requested (request_check), and the checker reads the ten pages fetched', c.request_check === true && c.check_urls.length === 10 && c.check_urls.every(u => u.startsWith('https://whatthetruck.ai/')))
  const p = doc.plans[0]
  t('one GB plan: £0 a month, counted, research, unverified, source /pricing, checked 4 Nov', doc.plans.length === 1 && p.competitor_id === c.id && p.country_code === 'GB' && p.currency === 'GBP'
    && p.monthly_minor === 0 && p.status === 'counted' && p.source === 'research' && p.verified_at === null && p.source_url === 'https://whatthetruck.ai/pricing' && p.checked_on === '2026-11-04')
  t('…the fee a new account pays online: 3.95% (395 bps), VAT excluded; card processing not stated (card_mode unknown, no card rate)',
    p.truck_fee_bps === 395 && p.vat === 'excl' && p.card_mode === 'unknown' && p.card_bps === null && p.unclear === true)
  t('…its note carries every tier, VAT, proof of turnover, Founder 100, hardware, card processing NOT STATED and the contract',
    ['1.25%', '0.95%', '0.85%', '0.80%', '3.95%', '3.75%', '3.50%', '3.25%', 'VAT at 20%', 'proof of turnover', 'Founder 100', 'first 100 trucks', 'bought separately', 'NOT STATED', 'any time by email'].every(w => p.notes.includes(w)), p.notes)
  t('no comparison entry (GB comparison stays off) and nothing arrives verified', doc.entries.length === 0 && !JSON.stringify(doc).match(/"verified_at":\s*"/))
  t('42 answers: exactly the checked features (the four OFF ones are not asked)', c.answers.length === 42 && same(c.answers.map(a => a.key), CHECKED), c.answers.map(a => a.key).filter(k => !CHECKED.includes(k)))
  t('yes: preorder, capacity, walkup, stock, schedule, options, cards, kds, tickets, offline, reports, social, loyalty, android — plus staff and monthly, perorder',
    same(keysWith('yes'), ['preorder', 'capacity', 'walkup', 'stock', 'schedule', 'options', 'cards', 'kds', 'tickets', 'offline', 'reports', 'social', 'loyalty', 'android', 'staff', 'monthly', 'perorder']), keysWith('yes'))
  t('partial: ipad, hardware, terminal, private, trial', same(keysWith('partial'), ['ipad', 'hardware', 'terminal', 'private', 'trial']), keysWith('partial'))
  t('not_mentioned: the eleven of the brief, plus asap, ahead, localpay, paypal, fiscal and setup',
    same(keysWith('not_mentioned'), ['menuphoto', 'whatsapp', 'igmsg', 'discovery', 'domain', 'payattruck', 'notify', 'vans', 'delivery', 'tips', 'custfee', 'asap', 'ahead', 'localpay', 'paypal', 'fiscal', 'setup']), keysWith('not_mentioned'))
  t('unknown, each with its reason: cardfee (not stated), term (none stated), paymethods (as the vendor states it)', same(keysWith('unknown'), ['cardfee', 'term', 'paymethods']) && keysWith('unknown').every(k => byKey[k].note))
  t('no "no" anywhere (nothing on the site says a feature is not offered)', keysWith('no').length === 0)
  t('every yes / partial carries a quote and its page on whatthetruck.ai; not_mentioned carries none',
    c.answers.filter(a => ['yes', 'partial'].includes(a.value)).every(a => a.quote && a.source_url.startsWith('https://whatthetruck.ai/'))
    && c.answers.filter(a => a.value === 'not_mentioned').every(a => !a.quote))
  t('every quoted page is one of the ten read', c.answers.filter(a => a.source_url).every(a => c.check_urls.includes(a.source_url)))

  // ── 2 · the importer writes it once ────────────────────────────────────────────────────────────────────────────────
  head('2 · the importer: the competitor, the check request, the plan and the 42 quoted answers — once')
  {
    const WTT = [L.DATA_FILES.find(f => f.path === FILE_PATH)]
    const store = FX.memoryImportStore({ competitors: [{ id: 'other', name: 'Hatches Up', website: 'https://hatchesup.com', lifecycle: 'active' }], features: features.map(f => ({ key: f.key, checked: f.checked, tier: f.tier })) })
    const files = { [FILE_PATH]: Buffer.from(raw) }
    const deps = { store, read: q => files[q], sha256: sha, now: () => NOW, log: () => {} }
    const o1 = await L.runImports(deps, WTT)
    const row = store.db.competitors.find(x => x.id === c.id)
    t('imported: 1 competitor added, 1 plan, 42 answers, 1 check requested', o1[0].status === 'imported' && o1[0].counts.added === 1 && o1[0].counts.plansAdded === 1 && o1[0].counts.answersAdded === 42 && o1[0].counts.checksRequested === 1, o1)
    t('…the row has no "answers" or "request_check" column, and check_requested_at is the import time', row && !('answers' in row) && !('request_check' in row) && row.check_requested_at === NOW.toISOString(), row && Object.keys(row))
    t('…its check_urls, focus, note and website as the file has them; unverified', row.check_urls.length === 10 && row.focus === 'food_truck' && row.notes === c.notes && row.features_verified_at === null)
    const vals = store.db.values.filter(v => v.competitor_id === c.id && !v.superseded_at)
    t('…42 current answers, every country, unverified, dated 4 Nov, with the file\'s value, note, quote and page',
      vals.length === 42 && vals.every(v => v.country_code === null && v.verified_at === null && v.checked_on === '2026-11-04')
      && c.answers.every(a => { const v = vals.find(x => x.feature_key === a.key); return v && v.value === a.value && (v.quote ?? undefined) === a.quote && (v.source_url ?? undefined) === a.source_url && (v.note ?? undefined) === a.note }))
    const plan = store.db.plans.find(x => x.id === p.id)
    t('…the plan, unverified, for this competitor', plan && plan.competitor_id === c.id && plan.verified_at === null && plan.monthly_minor === 0)
    t('…Hatches Up is untouched', !store.writes.some(w => w[0] === 'updateCompetitor' && w[1] === 'other'))
    const w = store.writes.length
    t('a rerun of the same file is a no-op (its sha256 is recorded)', (await L.runImports(deps, WTT))[0].status === 'unchanged' && store.writes.length === w)
    const again = await L.importResearch(store, doc, { today: TODAY, path: FILE_PATH, featureKeys: KEYS, nowIso: NOW.toISOString() })
    t('…and run again by hand: matched, no second competitor, plan or answer', again.added === 0 && again.plansAdded === 0 && again.answersAdded === 0
      && store.db.competitors.filter(x => x.name === 'What The Truck').length === 1 && store.db.values.filter(v => v.competitor_id === c.id && !v.superseded_at).length === 42, again)
  }

  // ── 3 · a matching row is updated, never duplicated ────────────────────────────────────────────────────────────────
  head('3 · a competitor already there (by its domain) is updated, not added twice')
  {
    const store = FX.memoryImportStore({
      competitors: [{ id: 'old-wtt', name: 'WhatTheTruck!', website: 'https://www.whatthetruck.ai/', lifecycle: 'active', focus: null, notes: null }],
      values: [{ id: 'ph-kds', competitor_id: 'old-wtt', feature_key: 'kds', country_code: null, value: 'unknown', note: null, source_url: null, superseded_at: null },
        { id: 'said-loyalty', competitor_id: 'old-wtt', feature_key: 'loyalty', country_code: null, value: 'partial', note: 'Admin said so', source_url: null, superseded_at: null }],
    })
    const r = await L.importResearch(store, doc, { today: TODAY, path: FILE_PATH, featureKeys: KEYS, nowIso: NOW.toISOString() })
    const old = store.db.competitors.find(x => x.id === 'old-wtt')
    t('matched by domain: nothing added, the row updated (focus filled, check requested)', r.added === 0 && store.db.competitors.length === 1 && old.focus === 'food_truck' && old.check_requested_at === NOW.toISOString() && r.checksRequested === 1, { r, old })
    t('…a placeholder ("unknown", nothing said) is superseded by the quoted answer', store.db.values.find(v => v.id === 'ph-kds').superseded_at && store.db.values.some(v => v.competitor_id === 'old-wtt' && v.feature_key === 'kds' && v.value === 'yes' && !v.superseded_at))
    t('…an answer that already says something is kept (never overwritten by research)', store.db.values.find(v => v.id === 'said-loyalty').superseded_at === null && !store.db.values.some(v => v.competitor_id === 'old-wtt' && v.feature_key === 'loyalty' && v.id !== 'said-loyalty'))
    t('…the plan is attached to the existing row', store.db.plans.some(x => x.competitor_id === 'old-wtt' && x.country_code === 'GB'))
  }

  // ── 4 · the answer rules ───────────────────────────────────────────────────────────────────────────────────────────
  head('4 · the answer rules are the checker\'s — and a refused file writes nothing')
  {
    const withAnswers = (answers, extra = {}) => ({ ...doc, competitors: [{ ...c, ...extra, answers }], plans: [], entries: [] })
    const probs = (answers, extra) => L.researchProblems(withAnswers(answers, extra), { featureKeys: KEYS })
    const src = 'https://whatthetruck.ai/'
    t('"no" quoting a sentence with no negation is refused (35.ao-7)', probs([{ key: 'whatsapp', value: 'no', quote: 'Card readers are bought separately.', source_url: src }]).some(x => /not offered|35\.ao-7/.test(x)))
    t('"no" quoting the vendor saying it is not offered is accepted', probs([{ key: 'whatsapp', value: 'no', quote: 'WhatsApp is not available.', source_url: src }]).length === 0)
    t('yes or partial without a quote is refused (35.an-4)', probs([{ key: 'kds', value: 'yes' }]).some(x => /35\.an-4/.test(x)) && probs([{ key: 'ipad', value: 'partial' }]).length === 1)
    t('not_mentioned with a quote is refused (silence carries none)', probs([{ key: 'vans', value: 'not_mentioned', quote: 'something', source_url: src }]).some(x => /silence/.test(x)))
    t('unknown without its reason is refused', probs([{ key: 'cardfee', value: 'unknown' }]).some(x => /reason/.test(x)))
    t('a key not in the feature list, a doubled key, a bad value, a quote without its page are each refused',
      probs([{ key: 'teleport', value: 'yes', quote: 'We teleport.', source_url: src }]).some(x => /not in the feature list/.test(x))
      && probs([{ key: 'kds', value: 'not_mentioned' }, { key: 'kds', value: 'not_mentioned' }]).some(x => /twice/.test(x))
      && probs([{ key: 'kds', value: 'maybe' }]).some(x => /is not one of/.test(x))
      && probs([{ key: 'kds', value: 'yes', quote: 'Live kitchen queue' }]).some(x => /source_url/.test(x)))
    t('without the feature list the keys can\'t be checked, so the file is refused', L.researchProblems(doc).some(x => /feature list could not be read/.test(x)))
    t('request_check must be true or false', probs([], { request_check: 'yes' }).some(x => /request_check/.test(x)))
    // A refused file through the real importer: an error recorded, nothing else written.
    const store = FX.memoryImportStore({ features: features.map(f => ({ key: f.key, checked: f.checked, tier: f.tier })) })
    const bad = JSON.stringify(withAnswers([{ key: 'whatsapp', value: 'no', quote: 'Card readers are bought separately.', source_url: src }]))
    const o = await L.runImports({ store, read: () => Buffer.from(bad), sha256: sha, now: () => NOW, log: () => {} }, [L.DATA_FILES.find(f => f.path === FILE_PATH)])
    t('…through the importer: recorded as an error naming the row, and nothing else written', o[0].status === 'error' && /What The Truck.*whatsapp/.test(o[0].message)
      && store.writes.every(w => w[0] === 'recordImport') && store.db.competitors.length === 0, { o, writes: store.writes })
  }

  // ── 5 · the registry, Admin's line, the deep check ─────────────────────────────────────────────────────────────────
  head('5 · the registry, Admin\'s line, and the requested competitor first in its country\'s deep check')
  {
    t('registered last; the first three files unchanged', L.DATA_FILES.length === 4 && L.DATA_FILES[3].path === FILE_PATH && L.DATA_FILES[3].kind === 'research'
      && L.DATA_FILES[0].path === 'data/compare-de-1/competitors.json' && L.DATA_FILES[1].path === 'data/global-players/competitors.json' && L.DATA_FILES[2].kind === 'features')
    const line = L.importLines([{ file_path: FILE_PATH, sha256: 'a'.repeat(64), imported_at: '2026-11-05T02:11:00Z', result: 'ok', counts: { competitors: 1, added: 1, plans: 1, plansAdded: 1, plansExisting: 0, entries: 0, answersAdded: 42, checksRequested: 1 }, message: null }])[3].text
    t('Admin\'s line names the answers and the check request', /What The Truck research imported 5 Nov: 1 competitors, 1 plans, 0 entries \(42 feature answers, unverified; 1 check requested\)/.test(line), line)
    const german = L.importLines([{ file_path: 'data/compare-de-1/competitors.json', sha256: 'b'.repeat(64), imported_at: '2026-10-30T08:32:34Z', result: 'ok', counts: { competitors: 9, added: 0, plans: 19, plansAdded: 14, plansExisting: 5, entries: 8, answersAdded: 0 }, message: null }])[0].text
    t('…the German line reads as before (no answers, no request: nothing added to it)', german === 'German research imported 30 Oct: 9 competitors, 19 plans, 8 entries (9 matched existing competitors; 5 plans were already there)', german)
    const sched = (id, name, extra) => ({ id, name, lifecycle: 'active', checkIntervalDays: 90, nextCheckAt: null, lastCheckedAt: null, deepCheckedAt: null, checkRequestedAt: null, countries: ['GB'], ...extra })
    const rows = [sched('a', 'Aardvark Eats'), sched('b', 'Bun Van'), sched(c.id, 'What The Truck', { checkRequestedAt: NOW.toISOString() }), sched('d', 'Done Already', { deepCheckedAt: '2026-11-04T09:40:00Z' })]
    const picked = L.deepTargets(rows, ['GB', 'DE'], 'GB', '2026-11-03T13:20:11Z', 2).map(x => x.row.name)
    t('GB\'s deep check (15 a day) takes What The Truck first ("Check now" first), then by name', picked[0] === 'What The Truck' && picked[1] === 'Aardvark Eats', picked)
    t('no migration file belongs to this workstream (the answers fit the existing columns)', !fs.readdirSync(path.join(REPO, 'supabase/migrations')).some(f => /wtt/i.test(f)))
  }

  console.log(`\ncompetitor-wtt-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
