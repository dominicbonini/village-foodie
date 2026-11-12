#!/usr/bin/env node
// scripts/pricing-copy-2.cjs — pricing-copy-2 Part B (11 November 2026; docs/pricing-copy-2-report.md): the remaining "card orders" wording.
//   B1 · planTable.pay.fee, every locale: "HatchGrab fee on online card orders*" → "HatchGrab fee on online orders*" (asterisk kept;
//        each locale edited minimally — the word for "card" dropped).
//   B2 · the 3 published FAQ answers (…0001, …0002, …0005): "online card orders" → "online orders" in the English source, through the
//        FAQ's own save path — supabase/migrations/20261091_pricing_copy_2_wording.sql writes exactly what faqAction('item.update')
//        saves, and faqAction's check (checkItem, every switched-on country) passes on each. Translations regenerate by the hourly job.
//   B3 · Pay as you go's plans.description → "No monthly fee. You only pay 0.99% on online orders." (same migration) and its
//        translations (planNames.payg.description in every messages file that has one).
//   B4 · lib/faq/live-values.ts's {K.fee} help line, and /llms.txt's general fee paragraph and Pro's line: "online orders".
// The terms of use (content/legal/terms-and-conditions.md) are NOT changed (they wait for the billing terms).
// BEFORE / AFTER are the commit before pricing-copy-2's message commit and that commit (git log --grep '^pricing-copy-2:'), so other
// sessions' work never moves what this compares. Run: node scripts/pricing-copy-2.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const MIGRATION = 'supabase/migrations/20261091_pricing_copy_2_wording.sql'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  🔴 ${name}${detail === undefined ? '' : '\n      ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`) } }
const head = s => console.log(`\n── ${s}`)
const git = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, q, out); else out[q] = v } return out }
const KEYS = ['planTable.pay.fee', 'planNames.payg.description']
// The word for "card" in each language's plan-table row (it must be gone, and only it).
const CARD = { ar: 'البطاقة', bg: 'карта', cs: 'kartou', da: 'kort', de: 'Karte', el: 'κάρτα', en: 'card', es: 'tarjeta', et: 'kaardi', fi: 'korti', fr: 'carte',
  he: 'כרטיס', hr: 'karticom', hu: 'kártyás', id: 'kartu', is: 'korti', it: 'carta', ja: 'カード', ko: '카드', lt: 'kortele', lv: 'karti', ms: 'kad ', nb: 'kort',
  nl: 'kaart', pl: 'kartą', pt: 'cartão', ro: 'card', sk: 'kartou', sl: 'kartico', sr: 'karticom', sv: 'kort', th: 'บัตร', tr: 'kart', vi: 'thẻ', zh: '信用卡|刷卡',
  // ⚠️ RE-PINNED (pricing-copy-3, 12 November 2026): languages-world-2's new languages. Without their own word a new base fell back to
  // English "card" and its check passed against nothing (the gap compare-suits-1 had for the 8 earlier bases).
  uk: 'карт', ru: 'карт', kk: 'карта', uz: 'karta', az: 'kart', ka: 'ბარათ' }
// A base whose language has no word here is a FAILURE, never a silent pass.
const cardRe = loc => { const w = CARD[loc.slice(0, 2)]; if (!w) throw new Error(`pricing-copy-2: no "card" word for ${loc} — add its language to CARD`); return new RegExp(w) }

/** pricing-copy-2's message commit (the first "pricing-copy-2:" commit that touched messages/), and the one before it. */
const C = git(['log', '--format=%H', '--grep=^pricing-copy-2:', '--reverse', '--', 'messages/']).trim().split('\n').filter(Boolean)
const AFTER = C[0] || null
const BEFORE = AFTER ? git(['rev-parse', `${AFTER}~1`]).trim() : 'HEAD'
const atAfter = f => (AFTER ? git(['show', `${AFTER}:${f}`]) : read(f))

/** The migration's FAQ updates: [{ id, before, after }] and the plans update. */
function migration() {
  const sql = read(MIGRATION).replace(/^--.*$/gm, '')
  const lit = s => s.replace(/''/g, "'")
  const faq = [...sql.matchAll(/update public\.faq_items\s+set answer_en\s+= '((?:[^']|'')*)',[\s\S]*?where id = '([0-9a-f-]+)'\s+and answer_en = '((?:[^']|'')*)';/g)].map(m => ({ id: m[2], after: lit(m[1]), before: lit(m[3]) }))
  const p = /update public\.plans\s+set description = '((?:[^']|'')*)'\s+where key = 'payg'\s+and description = '((?:[^']|'')*)';/.exec(sql)
  return { sql, faq, plans: p ? { after: lit(p[1]), before: lit(p[2]) } : null }
}

;(async () => {
  head('B2 / B3 · the migration')
  const M = migration()
  const ids = ['fa000002-0000-4000-8000-000000000001', 'fa000002-0000-4000-8000-000000000002', 'fa000002-0000-4000-8000-000000000005']
  t('three FAQ updates, the three approved answers', JSON.stringify(M.faq.map(x => x.id)) === JSON.stringify(ids), M.faq.map(x => x.id))
  for (const f of M.faq) {
    t(`…${f.id.slice(-4)}: AFTER = BEFORE with "online card orders" → "online orders", once, nothing else`, f.before.split('online card orders').length === 2 && f.after === f.before.replace('online card orders', 'online orders'))
  }
  t('every UPDATE is guarded by the old text; one transaction; no DELETE, no INSERT, no other table', /^\s*begin;/m.test(M.sql) && /^\s*commit;/m.test(M.sql) && !/\b(delete|insert|truncate|drop|alter)\b/i.test(M.sql)
    && (M.sql.match(/\bupdate\s+public\.(\w+)/gi) || []).every(u => /faq_items|plans/.test(u)) && (M.sql.match(/\bupdate\b/gi) || []).length === 4)
  t('the translations table is not written (the hourly translator regenerates them)', !/faq_translations/.test(M.sql))
  t('plans.description: "No monthly fee. You only pay 0.99% on online orders." (only for payg, guarded by the old text)', !!M.plans && M.plans.after === 'No monthly fee. You only pay 0.99% on online orders.' && M.plans.before === 'No monthly fee. You only pay when a customer pays online by card.')
  t('the 0.99% in it is Pay as you go\'s fee in the seeded catalogue (99 bps)', /\('payg'[^)]*\)/.test(read('supabase/migrations/20261024_plans.sql')) && Object.values(require('./_world-countries-1-fixtures.cjs').CATALOG().prices).filter(p => p.planKey === 'payg').every(p => p.feeBps === 99))

  head('B2 · the FAQ\'s own save path: faqAction(\'item.update\') on each published answer — its check runs')
  const kit = require('./_render-kit.cjs')({ cacheTag: 'pricing-copy-2' })
  const WF = require('./_world-countries-1-fixtures.cjs')
  const { snake } = require('./_lp1e-fixtures.cjs')
  const L = await kit.bundle('pc2-faq', "export { faqAction, changesPublicPages } from '@/lib/admin/faq-actions'\nexport { checkItem } from '@/lib/faq/check'\nexport { mapCountryRow } from '@/lib/country-settings'\nexport { itemSourceHash } from '@/lib/faq/source-hash'")
  const rows = WF.rowsWith(WF.WORLD)
  const world = { catalog: WF.CATALOG(), countries: rows.filter(r => r.enabled).map(r => ({ settings: L.mapCountryRow(snake(r)), apps: r.countryCode === 'GB' })) }
  // The rows' single-plan answers as they are live (read 11 November 2026; unchanged by pricing-copy-2 — neither says "card orders"):
  // where a country offers one plan, the check reads that answer instead, so the rows are checked as they really are. (…0002's names the
  // card processor by its brand live; here it is written generically — the sweep's screen refuses the name in a harness, and the check
  // reads only the {tokens}, which are as live.)
  const SINGLE = {
    'fa000002-0000-4000-8000-000000000001': 'There’s one plan: {unlimited.name}, {unlimited.price} per truck per month, with no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.',
    'fa000002-0000-4000-8000-000000000002': 'Nothing. {unlimited.name} has no HatchGrab fee on any order. Online card payments carry the card processing fee, currently {card.fee}, which goes to the payment processor, not to us.',
  }
  t('neither single-plan answer says "card orders" (so B2 leaves them alone)', Object.values(SINGLE).every(x => !/card orders/.test(x)))
  const seeds = M.faq.map(f => ({ id: f.id, sectionId: 's1', position: 1, questionEn: 'Q', answerEn: f.before, answerSinglePlanEn: SINGLE[f.id] ?? null, showIn: f.id.endsWith('5') ? 'plan:payg' : 'all', note: null, noteDone: false, status: 'published', publishedAt: '2026-11-02T00:00:00Z', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', updatedBy: 'x' }))
  const items = seeds.map(x => ({ ...x }))
  const store = {
    async sections() { return [{ id: 's1', position: 1, titleEn: 'Pricing' }] }, async items() { return items.map(x => ({ ...x })) }, async world() { return world },
    async updateItem(id, cols) { const r = items.find(x => x.id === id); if (!r) return null; Object.assign(r, Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined))); return { ...r } },
  }
  const stamp = { by: 'pricing-copy-2', at: '2026-11-11T12:00:00Z' }
  for (const f of M.faq) {
    const before = seeds.find(x => x.id === f.id)
    t(`…${f.id.slice(-4)}: the CURRENT text passes the check too (a fair baseline)`, L.checkItem(before, world).ok)
    const body = { action: 'item.update', id: f.id, patch: { answerEn: f.after } }
    const r = await L.faqAction(store, body, stamp)
    t(`…${f.id.slice(-4)}: faqAction saves it — the check passes in every country`, r.ok === true, r)
    t(`…${f.id.slice(-4)}: the saved answer is the migration's text, stamped as a save`, r.ok && r.data.item.answerEn === f.after && r.data.item.updatedBy === 'pricing-copy-2' && r.data.item.status === 'published')
    t(`…${f.id.slice(-4)}: a published text change refreshes the public pages (changesPublicPages)`, L.changesPublicPages(body, r) === true)
    t(`…${f.id.slice(-4)}: its source hash changes, so the translator re-translates it`, L.itemSourceHash({ ...before }) !== L.itemSourceHash({ ...before, answerEn: f.after }))
  }

  head('B1 / B3 · messages: only the two keys moved, as asked')
  t('pricing-copy-2 has a message commit', !!AFTER)
  const files = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2}-[A-Z]{2}\.json$/.test(f)).sort()
  let feeN = 0, descN = 0
  for (const f of files) {
    const loc = f.slice(0, -5)
    let old; try { old = flat(JSON.parse(git(['show', `${BEFORE}:messages/${f}`]))) } catch { old = null }
    let now; try { now = flat(JSON.parse(atAfter(`messages/${f}`))) } catch { continue }
    if (!old) { if ('planTable.pay.fee' in now) t(`${loc} (new since): the plan-table row has no "card"`, !cardRe(loc).test(now['planTable.pay.fee']) && now['planTable.pay.fee'].endsWith('*'), now['planTable.pay.fee']); continue }
    const moved = Object.keys({ ...old, ...now }).filter(k => old[k] !== now[k])
    t(`${loc}: only planTable.pay.fee and planNames.payg.description moved`, moved.every(k => KEYS.includes(k)), moved.filter(k => !KEYS.includes(k)))
    if ('planTable.pay.fee' in old) {
      const a = old['planTable.pay.fee'], b = now['planTable.pay.fee'], re = cardRe(loc)
      t(`${loc}: plan-table row — the word for "card" gone, the asterisk kept, nothing added`, re.test(a) && !re.test(b) && a.endsWith('*') && b.endsWith('*') && b.length < a.length, [a, b])
      feeN++
    }
    if ('planNames.payg.description' in old) {
      const a = old['planNames.payg.description'], b = now['planNames.payg.description']
      t(`${loc}: Pay as you go's description — first sentence kept, the fee named (0.99 in its own form), no "card"`, b !== a && /0[.,]99/.test(b) && !cardRe(loc).test(b) && b.startsWith(a.split(/[.。，]| (?=[\u0e00-\u0e7f])/)[0]) && !/[‎‏؜]/.test(b), [a, b])
      descN++
    }
    for (const k of ['pricing.fee.included', 'pricing.footnote', 'pricing.fee.feeOnly']) t(`${loc}: ${k} unchanged (Pro, the footnote and the cards keep their text)`, old[k] === now[k])
  }
  t('every locale that had the row changed it (38+)', feeN >= 38, feeN)
  t('every locale that had a Pay as you go description changed it (41+)', descN >= 41, descN)
  const EN = flat(JSON.parse(atAfter('messages/en-GB.json')))
  t('en-GB: "HatchGrab fee on online orders*"', EN['planTable.pay.fee'] === 'HatchGrab fee on online orders*')
  // ⚠️ Applied at HEAD too: any locale file added after the message commit (languages-world-2) carries the new row.
  for (const f of files) { const m = flat(JSON.parse(read(`messages/${f}`))); if ('planTable.pay.fee' in m) t(`HEAD ${f.slice(0, -5)}: the plan-table row says no "card"`, !cardRe(f.slice(0, 5)).test(m['planTable.pay.fee']), m['planTable.pay.fee']) }

  head('B1 / B3 · back-translations follow')
  for (const f of files) {
    const bf = `docs/i18n/back/${f}`; if (!fs.existsSync(path.join(REPO, bf))) continue
    const b = JSON.parse(read(bf))
    if (b['planTable.pay.fee'] !== undefined) t(`${f.slice(0, -5)} back planTable.pay.fee: no "card", asterisk kept`, !/card/i.test(b['planTable.pay.fee']) && b['planTable.pay.fee'].endsWith('*'), b['planTable.pay.fee'])
    if (b['planNames.payg.description'] !== undefined) t(`${f.slice(0, -5)} back planNames.payg.description: "…only pay 0.99% on online orders."`, /only pay 0\.99% on online orders\.$/.test(b['planNames.payg.description']), b['planNames.payg.description'])
  }

  head('B4 · the help line and /llms.txt')
  const lv = read('lib/faq/live-values.ts'), lt = read('lib/llms-text.ts')
  t('lib/faq/live-values.ts: "{K.fee}" — "Its fee on online orders, as a percentage"', lv.includes("['{K.fee}', 'Its fee on online orders, as a percentage'],"))
  t('lib/llms-text.ts: no "card orders" left', !/card orders/.test(lt))
  const R = WF.renderer(kit, 'pc2')
  const llms = await R.llms(rows)
  t('/llms.txt: the general paragraph says "of online orders, on the plans that charge one"', /fee is [^\n]* of online orders, on the plans that charge one/.test(llms))
  t('/llms.txt: Pro — "then 0.99% on online orders."; Pay as you go — "0.99% on online orders."', /First £4,000 of online orders included each month, then 0\.99% on online orders\./.test(llms) && /- Pay as you go: £0 per truck per month\. 0\.99% on online orders\./.test(llms))
  t('/llms.txt: "card orders" appears only in the card-processing footnote lines (kept, as on the pricing pages)', llms.split('\n').filter(l => /card orders/.test(l)).every(l => /card processing on online card orders/.test(l)))

  head('B5 · the terms of use are not changed')
  const terms = 'content/legal/terms-and-conditions.md'
  const touched = [...new Set(git(['log', '--format=%H', '--grep=^pricing-copy-2:']).trim().split('\n').filter(Boolean).flatMap(c => git(['show', '--name-only', '--format=', c]).trim().split('\n')))]
  t('no pricing-copy-2 commit touches content/legal/', !touched.some(f => f.startsWith('content/legal/')), touched.filter(f => f.startsWith('content/legal/')))
  t('the terms still say "HatchGrab fees on online card orders" (they wait for the billing terms)', read(terms).includes('**HatchGrab fees on online card orders.**'))

  console.log(`\n${fail ? '🔴' : '✅'} pricing-copy-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
