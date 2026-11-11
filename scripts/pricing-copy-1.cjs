#!/usr/bin/env node
// scripts/pricing-copy-1.cjs — pricing-copy-1 (11 November 2026; docs/pricing-copy-1-report.md): two wording changes to the plan
// text, in every language, and nothing else.
//   1. pricing.banner.body / bodyOnly — "Prefer to take payment up front? Add online card payments any time." deleted (and its
//      translation in every locale); nothing else in the strings changes.
//   2. pricing.fee.feeOnly (the Pay as you go card) — "<b>{fee}</b> on online orders only. Walk-up orders are always free.": no
//      asterisk, "online card orders" → "online orders"; each locale edited minimally (asterisk and the word for "card" dropped).
//   3. compare.plan.summaryFeeOnly — "online card orders" → "online orders" in both branches, every locale.
//   4. The same Pay as you go fee line elsewhere: compare.orders.feeOnly, comparison.costs.feeOnly and /llms.txt (lib/llms-text.ts).
// Pro and Unlimited keep their text, asterisks and the footnote exactly as they are.
// BEFORE is the commit before the change and AFTER the change's own commit (scripts/_lp-pricing-copy-1.cjs BASE / AFTER), so other
// work in the tree or later commits never move what this compares. Run: node scripts/pricing-copy-1.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const PC1 = require('./_lp-pricing-copy-1.cjs')
const { BASE, AFTER, COMMITS, KEYS } = PC1

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  🔴 ${name}${detail === undefined ? '' : '\n      ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`) } }
const head = s => console.log(`\n── ${s}`)
const git = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, q, out); else out[q] = v } return out }
const placeholders = s => [...String(s).matchAll(/\{[a-zA-Z]+\}|<\/?[a-z]+>|\{[a-zA-Z]+, select,|\b(?:yes|other) \{/g)].map(m => m[0]).sort().join(' ')

// The word for "card" each language's four fee strings used (it must be gone from all four, and stay in the banner's first sentence).
const CARD = { ar: 'بالبطاقة|البطاقة', bg: 'карт', cs: 'kart', da: 'kort', de: 'Karte', el: 'κάρτ', en: 'card', es: 'tarjeta', et: 'kaardi', fi: 'korti', fr: 'carte',
  he: 'כרטיס', hr: 'kartic', hu: 'kártyás', id: 'kartu', is: 'korti', it: 'carta', ja: 'カード', ko: '카드', lt: 'kortel', lv: 'kart', ms: 'kad ', nb: 'kort',
  nl: 'kaart', pl: 'kartą', pt: 'cartão', ro: 'card', sk: 'kart', sl: 'kartic', sr: 'kartic', sv: 'kort', th: 'บัตร', tr: 'kart', vi: 'thẻ', zh: '信用卡|刷卡' }
const cardRe = loc => new RegExp(CARD[loc.slice(0, 2)])
// The deleted sentence's own mark in the two languages that write it without a question mark.
const NO_QMARK = { 'ja-JP': '先に代金を受け取りたい場合は、オンラインカード決済をいつでも追加できます。', 'th-TH': 'อยากรับเงินล่วงหน้าใช่ไหม เพิ่มการชำระเงินออนไลน์ด้วยบัตรได้ทุกเมื่อ ' }

/** The one span `a` loses to become `b` (null if `b` is not `a` with ONE contiguous span taken out). */
function removedSpan(a, b) {
  if (b.length >= a.length) return null
  let i = 0; while (i < b.length && a[i] === b[i]) i++
  const span = a.slice(i, i + a.length - b.length)
  return a.slice(0, i) + a.slice(i + span.length) === b ? span : null
}

;(async () => {
  const files = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2}-[A-Z]{2}\.json$/.test(f)).sort()

  head('1 · messages: only the six keys moved, in every locale file, and only as asked')
  const touched = []
  for (const f of files) {
    const loc = f.slice(0, -5)
    let old; try { old = flat(JSON.parse(git(['show', `${BASE}:messages/${f}`]))) } catch { t(`${loc}: exists at ${BASE}`, false); continue }
    const now = flat(JSON.parse(git(['show', `${AFTER}:messages/${f}`])))
    const moved = Object.keys({ ...old, ...now }).filter(k => old[k] !== now[k])
    t(`${loc}: every key but the six is ${BASE}'s, and no key added or removed`, moved.every(k => KEYS.includes(k) && k in old && k in now), moved.filter(k => !KEYS.includes(k)))
    if (moved.length) touched.push(loc)
    for (const k of moved) t(`${loc} ${k}: the same placeholders, tags and select branches`, placeholders(old[k]) === placeholders(now[k]), [old[k], now[k]])
    // 1 — the banner sentence.
    if ('pricing.banner.body' in old) {
      const sb = removedSpan(old['pricing.banner.body'], now['pricing.banner.body']), so = removedSpan(old['pricing.banner.bodyOnly'], now['pricing.banner.bodyOnly'])
      t(`${loc}: body and bodyOnly each lose ONE span, and it is the same sentence in both`, !!sb && sb === so, { sb, so })
      t(`${loc}: …the up-front / card-payments sentence (a question, then "add card payments any time")`, !!sb && (NO_QMARK[loc] ? sb === NO_QMARK[loc] : /[?？؟;;]\s?\S/.test(sb) && cardRe(loc).test(sb) || /[?？؟;;]/.test(sb)), sb)
      const at = sb ? old['pricing.banner.body'].indexOf(sb) : -1
      t(`${loc}: …cut at the end of the first sentence (which stays: customers pay on collection, no card processor needed)`, at > 40 && /(?:[.。]\s?|เลย )$/.test(old['pricing.banner.body'].slice(0, at)) && now['pricing.banner.body'].startsWith(old['pricing.banner.body'].slice(0, at)), old['pricing.banner.body'].slice(Math.max(0, at - 30), at))
      t(`${loc}: no doubled space where it was cut`, !/  /.test(now['pricing.banner.body']) && !/  /.test(now['pricing.banner.bodyOnly']))
    }
    // 2 — the Pay as you go card.
    if ('pricing.fee.feeOnly' in old) {
      t(`${loc}: Pay as you go — BEFORE had the asterisk, now none`, /\{fee\}\*/.test(old['pricing.fee.feeOnly']) && !now['pricing.fee.feeOnly'].includes('*'), now['pricing.fee.feeOnly'])
      t(`${loc}: Pro keeps its asterisk (pricing.fee.included unchanged)`, /\{fee\}\*/.test(now['pricing.fee.included'] ?? '{fee}*') && old['pricing.fee.included'] === now['pricing.fee.included'])
      t(`${loc}: the footnote and the plan table's fee row unchanged`, old['pricing.footnote'] === now['pricing.footnote'] && old['planTable.pay.fee'] === now['planTable.pay.fee'])
    }
    // 2–4 — the word for "card".
    for (const k of ['pricing.fee.feeOnly', 'compare.plan.summaryFeeOnly', 'compare.orders.feeOnly', 'comparison.costs.feeOnly']) {
      if (!(k in old)) continue
      t(`${loc} ${k}: BEFORE said "card"; now it does not`, cardRe(loc).test(old[k]) && !cardRe(loc).test(now[k]), [old[k], now[k]])
      t(`${loc} ${k}: shorter, nothing added (a minimal edit)`, now[k].length < old[k].length)
    }
  }
  t(`61 locale files carry the change (39 full bases + 21 English/Spanish/French overlays' banners + es-AR's summary)`, touched.length === 61, touched.length)

  head('1b · en-GB, word for word')
  const EN = flat(JSON.parse(git(['show', `${AFTER}:messages/en-GB.json`]))), ENB = flat(JSON.parse(git(['show', `${BASE}:messages/en-GB.json`])))
  const SENT = 'Prefer to take payment up front? Add online card payments any time. '
  t('pricing.banner.body = BEFORE without the sentence', ENB['pricing.banner.body'].includes(SENT) && EN['pricing.banner.body'] === ENB['pricing.banner.body'].replace(SENT, ''))
  t('pricing.banner.bodyOnly = BEFORE without the sentence', ENB['pricing.banner.bodyOnly'].includes(SENT) && EN['pricing.banner.bodyOnly'] === ENB['pricing.banner.bodyOnly'].replace(SENT, ''))
  t('pricing.fee.feeOnly = "<b>{fee}</b> on online orders only. Walk-up orders are always free."', EN['pricing.fee.feeOnly'] === '<b>{fee}</b> on online orders only. Walk-up orders are always free.')
  t('compare.plan.summaryFeeOnly: "online orders" in both branches', EN['compare.plan.summaryFeeOnly'] === '{hasMonthly, select, yes {{price} per truck per month, plus {pct} on online orders.} other {No monthly fee — {pct} on online orders only.}}')
  t('compare.orders.feeOnly / comparison.costs.feeOnly: "online order"', EN['compare.orders.feeOnly'] === '{pct} on every online order — <b>{over}</b> a month per truck.' && EN['comparison.costs.feeOnly'] === '{fee} per online order')
  t('Pro, Unlimited, the footnote and the plan table keep their words and asterisks', EN['pricing.fee.included'] === 'First <b>{included}</b> of online orders included each month, then <b>{fee}*</b>. Walk-up orders are always free.'
    && EN['pricing.footnote'] === ENB['pricing.footnote'] && EN['pricing.footnote'].startsWith('* Plus ') && / on online card orders /.test(EN['pricing.footnote']) && EN['planTable.pay.fee'] === 'HatchGrab fee on online card orders*')

  head('2 · back-translations follow (docs/i18n/back)')
  for (const loc of touched) {
    const f = `docs/i18n/back/${loc}.json`; if (!fs.existsSync(path.join(REPO, f))) continue
    const b = JSON.parse(git(['show', `${AFTER}:${f}`])), bb = JSON.parse(git(['show', `${BASE}:${f}`]))
    const moved = Object.keys({ ...b, ...bb }).filter(k => b[k] !== bb[k])
    t(`${loc}: only the six keys' back-translations moved`, moved.every(k => KEYS.includes(k)), moved.filter(k => !KEYS.includes(k)))
    for (const k of ['pricing.fee.feeOnly', 'compare.plan.summaryFeeOnly', 'compare.orders.feeOnly', 'comparison.costs.feeOnly']) if (b[k] !== undefined) t(`${loc} back ${k}: no "card", no asterisk on the fee`, !/card/i.test(b[k]) && !/\{fee\}\*/.test(b[k]), b[k])
    for (const k of ['pricing.banner.body', 'pricing.banner.bodyOnly']) if (b[k] !== undefined) t(`${loc} back ${k}: the add-card-payments sentence is gone`, !/\b(add|enable|activate|switch on|turn on)\b[^.]*card/i.test(b[k]), b[k])
  }

  head('3 · the pages, rendered (world fixtures, every country on)')
  const kit = require('./_render-kit.cjs')({ cacheTag: 'pricing-copy-1' })
  const WF = require('./_world-countries-1-fixtures.cjs')
  const R = WF.renderer(kit, 'pc1')
  const rows = WF.rowsWith(WF.WORLD)
  const LOC = { uk: 'en-GB', us: 'en-US', fr: 'fr-FR', de: 'de-DE', jp: 'ja-JP', ae: 'ar-AE' }
  const nowOf = l => flat(JSON.parse(read(`messages/${l}.json`)))
  for (const [seg, l] of Object.entries(LOC)) {
    const P = await kit.quietAsync(() => R.page('landing', seg, rows))
    const html = P.html ?? ''
    const M = { ...nowOf(l.startsWith('en') ? 'en-GB' : l), ...nowOf(l) }
    const B = { ...flat(JSON.parse(git(['show', `${BASE}:messages/${l.startsWith('en') ? 'en-GB' : l}.json`]))), ...flat(JSON.parse(git(['show', `${BASE}:messages/${l}.json`]))) }
    const tail = s => s.replace(/<[^>]+>|\{[^}]*\}/g, '\u0000').split('\u0000').filter(x => x.trim().length > 6).pop() || ''
    const deleted = removedSpan(B['pricing.banner.body'], M['pricing.banner.body'])
    t(`/${seg}: the Pay as you go card reads the new line (no asterisk)`, /<b>[^<*]*<\/b>/.test(html) && html.includes(tail(M['pricing.fee.feeOnly']).replace(/'/g, '&#x27;')), tail(M['pricing.fee.feeOnly']))
    t(`/${seg}: the banner has no "${(deleted || '').trim().slice(0, 30)}…"`, !!deleted && !html.includes(deleted.trim().replace(/'/g, '&#x27;')))
    t(`/${seg}: Pro's fee still carries its asterisk, and the footnote is there`, /<b>[^<]*\*<\/b>/.test(html) && html.includes('class="price-note"'))
    t(`/${seg}: asBefore puts the old wording back (the identity harnesses' view)`, PC1.asBefore(html, l).includes(deleted.trim().replace(/'/g, '&#x27;')))
  }
  for (const cc of ['GB', 'FR']) {
    const pdf = await R.pdf(rows, cc)
    t(`plans PDF (${cc}): the Pay as you go line has no asterisk and no "card"`, cc === 'GB' ? pdf.includes('0.99%</b> on online orders only.') && !pdf.includes('Prefer to take payment up front') : !/payées par carte\. Les commandes au comptoir/.test(pdf) && !pdf.includes('Vous préférez encaisser'))
  }

  head('4 · /llms.txt')
  // ⚠️ RE-PINNED (pricing-copy-2, 11 November 2026): pricing-copy-2 then changed Pro's line and the general paragraph on purpose
  // ("online card orders" → "online orders"); they are put back first (scripts/_lp-pricing-copy-2.cjs llmsBefore), so this section still
  // proves exactly what pricing-copy-1 did and did not change.
  const llms = require('./_lp-pricing-copy-2.cjs').llmsBefore(await R.llms(rows))
  t('Pay as you go: "0.99% on online orders."', /- Pay as you go: £0 per truck per month\. 0\.99% on online orders\./.test(llms))
  t('Pro keeps "then 0.99% on online card orders." and the general fee paragraph is unchanged', /First £4,000 of online orders included each month, then 0\.99% on online card orders\./.test(llms) && /fee is [^\n]* of online card orders, on the plans that charge one/.test(llms))

  head('5 · nothing else changed')
  t('pricing-copy-1 has landed (its commits are in the history)', COMMITS.length > 0)
  const changed = [...new Set(COMMITS.flatMap(c => git(['show', '--name-only', '--format=', c]).trim().split('\n')))].filter(Boolean)
  const allowed = f => /^messages\/[a-z]{2}-[A-Z]{2}\.json$/.test(f) || /^messages\/ns\//.test(f) || /^docs\/i18n\/back\/[a-z]{2}-[A-Z]{2}\.json$/.test(f) || f === 'lib/llms-text.ts'
    || /^scripts\//.test(f) || /^docs\/pricing-copy-1/.test(f)
  const stray = changed.filter(f => !allowed(f))
  t('pricing-copy-1\'s commits change only messages, their split files, back-translations, lib/llms-text.ts, harnesses and this report', stray.length === 0, stray)
  const llmsDiff = COMMITS.flatMap(c => git(['show', '--format=', c, '--', 'lib/llms-text.ts']).split('\n').filter(l => /^[-+][^-+]/.test(l)))
  t('lib/llms-text.ts: one line, Pay as you go\'s fee sentence', llmsDiff.length === 2 && /feeOnly'\) return `\$\{fee\} on online card orders\.`/.test(llmsDiff[0]) && /feeOnly'\) return `\$\{fee\} on online orders\.`/.test(llmsDiff[1]), llmsDiff)
  t('no landing or page component changed (components/, app/)', !changed.some(f => /^(components|app)\//.test(f)))
  t('every messages/ns file it changed is a pricing, compare or comparison namespace', changed.filter(f => f.startsWith('messages/ns/')).every(f => /\/(pricing|compare|comparison)\.json$/.test(f)))

  console.log(`\n${fail ? '🔴' : '✅'} pricing-copy-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
