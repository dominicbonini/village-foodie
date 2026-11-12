// scripts/_lp-pricing-copy-4.cjs — ⚠️ RE-PINNED (pricing-copy-4, 12 November 2026; docs/pricing-copy-4-report.md): THE CARD-COUNTRY
// WORDING OF pricing-copy-4, for every harness that compares a public page with a BEFORE snapshot (faq-1's, faq-2's, faq-3's, faq-4's,
// copy-truth-1's, seo-geo-2's and store-badges-1's landing pages). A MODULE: scripts/pricing-copy-4.cjs proves the change itself.
//
// pricing-copy-4 split the pricing wording by whether a country offers online card payments (Dominic, 12 November 2026). Every
// fixture country renders as a CARD country (its settings carry no payment model — lib/country-settings-types.ts
// offersOnlineCardPayments), so a landing page now shows:
//   • the banner's card sentence — pricing.banner.bodyCard / bodyOnlyCard in place of body / bodyOnly ("…card processor at all.
//     Prefer to take payment up front? Add online card payments any time. When your trial ends…");
//   • Pay as you go's fee with its asterisk — pricing.fee.feeOnlyCard in place of feeOnly ("<b>0.99%*</b> on online orders only.").
// Pro's asterisk, the plan table's and the footnote are a card country's exactly as before, so nothing else moves.
//
// HOW: per language, each card key against its monthly-only sibling IN THE SAME FILE (the message commit's file — the first commit
// that added `bodyCard` to en-GB — or the working tree before it lands), diffed and widened to literal context by pricing-copy-1's
// pairsOf, HTML-escaped as React writes text; asBefore(html, locale) puts the monthly-only text back in one pass, giving the page as
// it was before pricing-copy-4. Chain it FIRST (the newest change is taken back first): PC1.asBefore(PC4.asBefore(html, l), l).
// A wrong pair can only make a comparison fail.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const { pairsOf } = require('./_lp-pricing-copy-1.cjs')

const gitOut = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o)
/** [card key, the monthly-only key it replaces on a card country's page]. */
const PAIRS = [['pricing.banner.bodyCard', 'pricing.banner.body'], ['pricing.banner.bodyOnlyCard', 'pricing.banner.bodyOnly'], ['pricing.fee.feeOnlyCard', 'pricing.fee.feeOnly']]
/** The message commit (the first that added `bodyCard` to en-GB), or null while it is only in the working tree. */
const MSG = (() => { try { return gitOut(['log', '--format=%H', '--reverse', '-S"bodyCard"', '--', 'messages/en-GB.json']).trim().split('\n').filter(Boolean)[0] || null } catch { return null } })()
const fileAt = f => (MSG ? gitOut(['show', `${MSG}:messages/${f}`]) : fs.readFileSync(path.join(REPO, 'messages', f), 'utf8'))
/** True when the card keys exist (the commit, or the working tree). */
const LANDED = !!MSG || fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8').includes('"bodyCard"')

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
  .split('&lt;b&gt;').join('<b>').split('&lt;/b&gt;').join('</b>')

let BY = null
/** { locale: [[card text, monthly-only text], …] } from every messages file that carries the card keys. */
function byLocale() {
  if (BY) return BY
  BY = {}
  if (!LANDED) return BY
  const names = MSG ? gitOut(['ls-tree', '--name-only', MSG, 'messages/']).trim().split('\n').map(x => x.replace(/^messages\//, '')) : fs.readdirSync(path.join(REPO, 'messages'))
  for (const f of names.filter(x => /^[a-z]{2}-[A-Z]{2}\.json$/.test(x))) {
    let m; try { m = JSON.parse(fileAt(f)) } catch { continue }
    const list = []
    for (const [ck, k] of PAIRS) {
      const card = get(m, ck), plain = get(m, k)
      if (card === undefined || plain === undefined || card === plain) continue
      // Pay as you go's line: the WHOLE sentence, its fee a wildcard — in several languages its tail is Pro's tail too ("*</b>。店頭注文は
      // 常に無料です。"), and a tail pair would take Pro's asterisk away as well.
      if (k === 'pricing.fee.feeOnly') { list.push({ whole: esc(card), plain: esc(plain) }); continue }
      for (const [af, bf] of pairsOf(plain, card)) {
        if (af.length < 4) throw new Error(`[_lp-pricing-copy-4] ${f} ${ck}: a hunk with too little context (${JSON.stringify(af)})`)
        list.push([esc(af), esc(bf)])
      }
    }
    if (list.length) BY[f.slice(0, -5)] = list
  }
  return BY
}

const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BASE_OF = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', pt: 'pt-PT', de: 'de-DE', ar: 'ar-AE', el: 'el-GR', nl: 'nl-NL' }
/** The page as it was before pricing-copy-4 (a card country's wording put back to the monthly-only text), for a page in `locale`. */
function asBefore(text, locale) {
  if (!LANDED || typeof text !== 'string') return text
  locale = locale || (/<html[^>]*\blang="([a-z]{2}-[A-Z]{2})"/.exec(text) || [])[1]
  if (!locale) throw new Error('[_lp-pricing-copy-4] asBefore needs the page\'s locale')
  const B = byLocale(); const m = new Map(); let whole = null
  for (const list of [B[locale], B[BASE_OF[locale.slice(0, 2)]]]) for (const x of list || []) {
    if (Array.isArray(x)) { if (!m.has(x[0])) m.set(x[0], x[1]) } else if (!whole) whole = x
  }
  let out = text
  if (m.size) {
    const list = [...m.entries()].sort((x, y) => y[0].length - x[0].length)
    out = out.replace(new RegExp(list.map(([a]) => reEsc(a)).join('|'), 'g'), x => m.get(x))
  }
  if (whole) {
    // "{fee}" is the one placeholder: the card sentence with the fee as a wildcard → the monthly-only sentence with the same fee.
    const [pre, post] = whole.whole.split('{fee}')
    out = out.replace(new RegExp(reEsc(pre) + '([^<]{1,24}?)' + reEsc(post), 'g'), (_, fee) => whole.plain.replace('{fee}', fee))
  }
  return out
}

/** pricing-copy-4's CODE in the two settings modules (the payment model on every settings object, and the one helper), for the
 *  harnesses that hold those files byte-identical to an older commit (costs-accounts-1's order paths): `undoCode(file, text)` puts
 *  exactly those edits back (scripts/fixtures/pricing-copy-4-code-edits.json, [now, before] blocks, each found once) — or null when
 *  one of them is not found once, so any other change still fails the comparison. */
const CODE_EDITS = require('./fixtures/pricing-copy-4-code-edits.json')
const CODE_FILES = Object.keys(CODE_EDITS)
function undoCode(file, text) {
  if (!CODE_EDITS[file]) return text
  let out = text
  for (const [now, before] of CODE_EDITS[file]) { if (out.split(now).length !== 2) return null; out = out.split(now).join(before) }
  return out
}

/** The chain the landing identity harnesses use: pricing-copy-4 taken back first, then pricing-copy-1 (scripts/_lp-pricing-copy-1.cjs). */
function pc1After4(text, locale, opts) {
  return require('./_lp-pricing-copy-1.cjs').asBefore(asBefore(text, locale), locale, opts)
}

module.exports = { LANDED, MSG, PAIRS, asBefore, byLocale, CODE_FILES, undoCode, pc1After4 }
