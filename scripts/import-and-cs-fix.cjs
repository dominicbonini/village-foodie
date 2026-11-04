#!/usr/bin/env node
// scripts/import-and-cs-fix.cjs — import-and-cs-fix (4 November 2026, docs/import-and-cs-fix-report.md).
//   node scripts/import-and-cs-fix.cjs        (NO NETWORK, NO DATABASE — fixture stores and fixture texts)
//
//   1 · THE FEATURE IMPORT KEEPS ADMIN'S CHOICES: from the 2 Nov state (Admin unticked asap, options, staff and walkup), the real
//       data/comparison-features/features.json applies every tier and adds notify, but Admin's unticks and where-it-shows stay; the
//       four OFF features are still unticked (even one Admin ticked); a value the FILE set still follows the file; Admin's own
//       edits are marked; a rerun writes nothing; the migration's backfill.
//   2 · THE CZECH FAQ CHECK: the refused cs-CZ answer (FAQ 7, "Pro nejlepší zážitek…") passes; a translation that types
//       "Unlimited", "£29" or "£" where the English used a token still fails; like with like (case, whole words, the English's own
//       names and symbols); the token, banned-wording and length checks unchanged; a failed row is retried every run.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'import-and-cs-fix' })
const { REPO } = kit
const FX = require('./_competitor-check-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

;(async () => {
  const L = await kit.bundle('iacf', [
    "export { importFeatures, retierCols, setByAdmin } from '@/lib/data-import/features'",
    "export { updateFeature, addFeature } from '@/lib/admin/feature-actions'",
    "export { fieldProblem, itemProblem, jobFor, ORDINARY_WORDS, ordinaryWordsOf } from '@/lib/faq/translation'",
  ].join('\n'))
  const doc = JSON.parse(read('data/comparison-features/features.json'))
  const byKey = Object.fromEntries(doc.features.map(f => [f.key, f]))

  // ── 1 · the feature import ───────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the feature import applies tiers and adds features, and never undoes Admin\'s choices')
  {
    // The database as it stood on 2 Nov: the 45 untiered rows, every one checked, and Admin's five edits (updated_by set).
    const ADMIN = '6f1c0000-0000-4000-8000-00000000ad31'
    const before = doc.features.filter(f => f.key !== 'notify').map(f0 => { const f = { ...f0 }; delete f.tier; return { ...f, checked: true, show_scope: f.key === 'payattruck' ? 'all' : f.show_scope } })
    for (const [k, scope] of [['asap', 'hidden'], ['options', 'hidden'], ['staff', 'hidden'], ['walkup', 'all'], ['allergens', 'all']]) Object.assign(before.find(f => f.key === k), { checked: false, show_scope: scope, updated_by: ADMIN })
    const store = FX.memoryImportStore({ features: before, competitors: [{ id: 'a1', name: 'A', lifecycle: 'active' }] })
    const r = await L.importFeatures(store, doc, { today: '2026-11-05' })
    const F = k => store.db.features.find(f => f.key === k)
    t('every tier applied (46 features, each with the file\'s tier); notify added', store.db.features.length === 46 && doc.features.every(f => F(f.key).tier === f.tier) && r.added === 1 && F('notify').checked === true, r)
    t('🔴 Admin-unticked walkup STAYS UNTICKED (and asap, options, staff with it)', ['walkup', 'asap', 'options', 'staff'].every(k => F(k).checked === false), ['walkup', 'asap', 'options', 'staff'].map(k => [k, F(k).checked]))
    t('…and where Admin left them showing is kept (walkup all; asap, options, staff hidden)', F('walkup').show_scope === 'all' && ['asap', 'options', 'staff'].every(k => F(k).show_scope === 'hidden'))
    t('the four OFF features become unticked: allergens, deals, qr, buzzers', ['allergens', 'deals', 'qr', 'buzzers'].every(k => F(k).checked === false && F(k).tier === 'off'))
    const fileRows = doc.features.filter(f => !['asap', 'options', 'staff', 'walkup', 'allergens', 'notify'].includes(f.key))
    t('a feature the file set follows the file: its checked and where it shows (payattruck all → hidden)', fileRows.every(f => F(f.key).checked === f.checked && F(f.key).show_scope === f.show_scope) && F('payattruck').show_scope === 'hidden')
    t('…marked as set by the file; Admin\'s rows keep no "file" mark on the values Admin set', F('payattruck').checked_by === 'file' && F('payattruck').scope_by === 'file' && F('notify').checked_by === 'file'
      && F('walkup').checked_by === undefined && F('walkup').scope_by === undefined && F('allergens').checked_by === 'file')
    const w = store.writes.length
    const again = await L.importFeatures(store, doc, { today: '2026-11-05' })
    t('a rerun of the same file writes nothing', again.added === 0 && again.retiered === 0 && store.writes.length === w, again)

    // After the migration: the marks decide (not updated_by).
    const after = doc.features.map(f => ({ ...f, tier: f.tier === 'core' ? 'secondary' : 'core', checked_by: 'file', scope_by: 'file' }))   // every stored tier differs from the file's, so each is re-tiered
    Object.assign(after.find(f => f.key === 'walkup'), { checked: false, checked_by: 'admin', show_scope: 'hidden', scope_by: 'admin' })
    Object.assign(after.find(f => f.key === 'allergens'), { checked: true, checked_by: 'admin' })
    Object.assign(after.find(f => f.key === 'kds'), { checked: false, checked_by: 'file', show_scope: 'hidden', scope_by: 'file' })
    Object.assign(after.find(f => f.key === 'cards'), { checked: true, checked_by: 'admin', show_scope: 'hidden', scope_by: 'file', updated_by: ADMIN })
    const s2 = FX.memoryImportStore({ features: after })
    await L.importFeatures(s2, doc, { today: '2026-11-05' })
    const G = k => s2.db.features.find(f => f.key === k)
    t('with the marks: Admin\'s untick of walkup and its "hidden" survive a re-tiering', G('walkup').checked === false && G('walkup').show_scope === 'hidden' && G('walkup').tier === byKey.walkup.tier)
    t('an OFF tier unticks even a feature Admin ticked (allergens)', G('allergens').checked === false && G('allergens').tier === 'off')
    t('a value the file set last is re-applied (kds: ticked, shown everywhere again)', G('kds').checked === true && G('kds').show_scope === byKey.kds.show_scope)
    t('the two are separate: Admin\'s tick on cards stays, while its file-set scope follows the file', G('cards').checked === true && G('cards').show_scope === byKey.cards.show_scope)
    t('retierCols in one line: Admin\'s tick kept, the file\'s scope applied', JSON.stringify(L.retierCols({ checked_by: 'admin', scope_by: 'file' }, { tier: 'core', checked: true, show_scope: 'all', show_countries: [] })) === JSON.stringify({ tier: 'core', show_scope: 'all', show_countries: [], scope_by: 'file' }))

    // Admin's edits mark themselves.
    const rows = [{ key: 'walkup', checked: true, show_scope: 'all', show_countries: [] }]
    const astore = { features: async () => rows, updateFeature: async (k, cols) => { Object.assign(rows[0], cols); return rows[0] }, markFeatureDue: async () => 0 }
    await L.updateFeature(astore, { key: 'walkup', checked: false }, { at: '2026-11-05T09:00:00Z', by: ADMIN, today: '2026-11-05' })
    t('Admin unticking marks checked_by admin (and leaves scope_by alone)', rows[0].checked === false && rows[0].checked_by === 'admin' && rows[0].scope_by === undefined)
    await L.updateFeature(astore, { key: 'walkup', showScope: 'hidden' }, { at: '2026-11-05T09:01:00Z', by: ADMIN, today: '2026-11-05' })
    t('Admin changing where it shows marks scope_by admin', rows[0].show_scope === 'hidden' && rows[0].scope_by === 'admin')
    t('a feature Admin adds is Admin\'s on both (addFeature)', /checked_by: 'admin', scope_by: 'admin'/.test(read('lib/admin/feature-actions.ts')))
    const mig = read('supabase/migrations/20261067_import_and_cs_fix.sql')
    t('the migration: checked_by / scope_by (admin | file), backfilled admin where updated_by is set, file elsewhere; no value changed', /add column if not exists checked_by text/.test(mig) && /add column if not exists scope_by text/.test(mig)
      && /set checked_by = case when updated_by is not null then 'admin' else 'file' end/.test(mig) && !/set (checked|show_scope)\s*=/.test(mig))
    t('the importer\'s store reads the marks and the row\'s editor', /select\('key, checked, tier, checked_by, scope_by, updated_by'\)/.test(read('lib/data-import/store-supabase.ts')))
  }

  // ── 2 · the Czech FAQ check ──────────────────────────────────────────────────────────────────────────────────────────
  head('2 · the FAQ check: a plan name, digit or symbol fails only where the English did not have it; Czech "Pro" passes')
  {
    const EN = {
      questionEn: 'Do I need an iPad, card reader or special equipment?',
      answerEn: 'No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: customers can pay for pre-orders online by card, and for walk-up orders you keep using the card machine you already have. {apps.sentence}',
      answerSinglePlanEn: null,
    }
    const CS = { question: 'Potřebuji iPad, platební terminál nebo speciální vybavení?', answer: 'Ne. HatchGrab běží ve webovém prohlížeči na jakémkoli telefonu, tabletu nebo notebooku. Pro nejlepší zážitek doporučujeme tablet, ale funguje i na telefonu. Platební terminál nepotřebujete: zákazníci mohou předobjednávky zaplatit online kartou a u objednávek na místě dál používáte platební terminál, který už máte. {apps.sentence}' }
    const PLANS = ['Pay as you go', 'Pro', 'Unlimited', 'Neomezený']
    const cs = { planNames: PLANS, ordinaryWords: L.ordinaryWordsOf('cs-CZ'), bannedLocal: [] }
    t('the refused cs-CZ answer (FAQ 7, "Pro nejlepší zážitek…") now passes', L.itemProblem(EN, CS, cs) === null, L.itemProblem(EN, CS, cs))
    t('…before this change it failed exactly as the row says (no ordinary words: "the plan name "Pro" typed in")', /the plan name "Pro" typed in/.test(L.itemProblem(EN, CS, { planNames: PLANS, bannedLocal: [] }) ?? ''))
    t('Czech is the only language with an ordinary word today (cs: Pro)', JSON.stringify(L.ORDINARY_WORDS) === '{"cs":["Pro"]}' && L.ordinaryWordsOf('de-DE').length === 0 && L.ordinaryWordsOf('cs-CZ')[0] === 'Pro')
    const en = 'You can switch to {plans.top} at any time.'
    const f = (tr, rules = cs, english = en) => L.fieldProblem('answer', english, tr, rules)
    t('a translation that types "Unlimited" where the English used a token still fails', /plan name "Unlimited"/.test(f('Můžete kdykoli přejít na {plans.top}, tedy Unlimited.') ?? ''))
    t('…and "£29" still fails (a typed number), and "£" alone (a currency symbol)', /typed number "29"/.test(f('Můžete kdykoli přejít na {plans.top} za £29.') ?? '') && /currency symbol "£"/.test(f('Můžete kdykoli přejít na {plans.top} (£).') ?? ''))
    t('…and the localised plan name typed in still fails (Neomezený)', /plan name "Neomezený"/.test(f('Můžete kdykoli přejít na {plans.top} (Neomezený).') ?? ''))
    t('German has no exemption: "Pro" typed in still fails there', /plan name "Pro"/.test(f('Sie können jederzeit zu {plans.top} wechseln (Pro).', { planNames: PLANS, ordinaryWords: L.ordinaryWordsOf('de-DE'), bannedLocal: [] }) ?? ''))
    t('like with like — case and whole words: "pro" (lower case) and "Produkt" are not the plan name "Pro"', f('Můžete kdykoli přejít na {plans.top}, pro firmy i Produkt.', { planNames: PLANS, ordinaryWords: [], bannedLocal: [] }) === null)
    t('a name or symbol the English itself has, outside its tokens, may be in the translation', f('Mit Pro und £ wechseln Sie zu {plans.top}.', { planNames: PLANS, ordinaryWords: [], bannedLocal: [] }, 'With Pro and £ you switch to {plans.top}.') === null)
    t('a plan name that only appears INSIDE the English\'s token does not count as the English having it', /plan name "Pro"/.test(f('Wechseln Sie zu Pro.', { planNames: PLANS, ordinaryWords: [], bannedLocal: [] }, 'Switch to {plans.Pro}.') ?? '') || /\{plans\.Pro\}/.test(f('Wechseln Sie zu Pro.', { planNames: PLANS, ordinaryWords: [], bannedLocal: [] }, 'Switch to {plans.Pro}.') ?? ''))
    t('UNCHANGED: a token dropped fails', /\{plans\.top\} must appear exactly once/.test(f('Můžete kdykoli přejít.') ?? ''))
    t('UNCHANGED: paying at the truck fails', /mentions paying at the truck/.test(f('Můžete přejít na {plans.top} a Pay at Hatch.') ?? ''))
    t('UNCHANGED: far too short fails', /length/.test(f('Ne {plans.top}', cs, 'You can switch to {plans.top} at any time, whenever you like and as often as you like.') ?? ''))
    const src = read('lib/faq/translation.ts')
    t('the token, banned-wording and length checks are the same lines as before', /for \(const \[t, n\] of want\) if \(\(got\.get\(t\) \?\? 0\) !== n\)/.test(src) && /for \(const w of \[\.\.\.BANNED_WORDING, \.\.\.rules\.bannedLocal\]\)/.test(src) && /if \(ratio < min \|\| ratio > 3\)/.test(src))
    t('the hourly runner passes each language\'s ordinary words', /ordinaryWords: ordinaryWordsOf\(locale\)/.test(read('scripts/faq-translate/main.ts')))
    const job = L.jobFor({ kind: 'item', id: 'fa7', hash: 'h1' }, [{ itemId: 'fa7', sectionId: null, locale: 'cs-CZ', status: 'failed', sourceHash: 'h1' }])
    t('MARKED FOR RETRY: a failed row is not fresh, so the next hourly run asks for cs-CZ again', !!job && job.locales.includes('cs-CZ'), job)
  }

  console.log(`\nimport-and-cs-fix: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
