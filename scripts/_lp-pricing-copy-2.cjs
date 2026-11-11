// scripts/_lp-pricing-copy-2.cjs — ⚠️ RE-PINNED (pricing-copy-2, 11 November 2026; docs/pricing-copy-2-report.md): THE NAMED WORDING
// CHANGES OF pricing-copy-2, for every harness that compares a public page with a BEFORE snapshot (faq-4's /features, copy-truth-1's
// /features, …). A MODULE: scripts/pricing-copy-2.cjs proves the change itself.
//
// pricing-copy-2 changed, ON PURPOSE and in every language, two message strings (Dominic, 11 November 2026):
//   • planTable.pay.fee — the plan table's fee row: "HatchGrab fee on online card orders*" → "HatchGrab fee on online orders*";
//   • planNames.payg.description — Pay as you go's description: "…You only pay 0.99% on online orders."
// and /llms.txt's general fee paragraph and Pro's line ("online card orders" → "online orders", lib/llms-text.ts).
//
// HOW: exactly as scripts/_lp-pricing-copy-1.cjs — the BEFORE strings from the commit before pricing-copy-2's message commit, the AFTER
// strings from that commit (both fixed); each pair diffed and widened to literal context (pricing-copy-1's pairsOf), HTML-escaped as
// React writes text, per language; asBefore(html, locale) puts them back in one pass. A wrong pair can only make a comparison fail.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const { pairsOf } = require('./_lp-pricing-copy-1.cjs')

const gitOut = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const KEYS = ['planTable.pay.fee', 'planNames.payg.description']
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o)
/** pricing-copy-2's message commit (the first "pricing-copy-2:" commit that touched messages/) and the one before it. */
const AFTER = (() => { try { return gitOut(['log', '--format=%H', '--grep=^pricing-copy-2:', '--reverse', '--', 'messages/']).trim().split('\n').filter(Boolean)[0] || null } catch { return null } })()
const BASE = AFTER ? gitOut(['rev-parse', `${AFTER}~1`]).trim() : null
const LANDED = !!AFTER

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
  .split('&lt;b&gt;').join('<b>').split('&lt;/b&gt;').join('</b>')

let BY = null
/** { locale: [[after, before], …] } from every messages file the commit carried. */
function byLocale() {
  if (BY) return BY
  BY = {}
  if (!LANDED) return BY
  for (const f of gitOut(['ls-tree', '--name-only', AFTER, 'messages/']).trim().split('\n').map(x => x.replace(/^messages\//, '')).filter(x => /^[a-z]{2}-[A-Z]{2}\.json$/.test(x))) {
    let old, now
    try { old = JSON.parse(gitOut(['show', `${BASE}:messages/${f}`])); now = JSON.parse(gitOut(['show', `${AFTER}:messages/${f}`])) } catch { continue }
    const list = []
    for (const k of KEYS) {
      const b = get(old, k), a = get(now, k)
      if (b === undefined || a === undefined || a === b) continue
      for (const [af, bf] of pairsOf(b, a)) {
        if (af.length < 4) throw new Error(`[_lp-pricing-copy-2] ${f} ${k}: a hunk with too little context (${JSON.stringify(af)})`)
        list.push([esc(af), esc(bf)])
      }
    }
    if (list.length) BY[f.slice(0, -5)] = list
  }
  return BY
}
/** /llms.txt (English, plain text): the general paragraph and Pro's line. */
const LLMS = [[' of online orders, on the plans that charge one', ' of online card orders, on the plans that charge one']]
const LLMS_PRO = /(of online orders included each month, then [^\n]*? on online) orders\./g

const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BASE_OF = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', pt: 'pt-PT', de: 'de-DE', ar: 'ar-AE', el: 'el-GR', nl: 'nl-NL' }
/** The text as it was before pricing-copy-2, for a page in `locale` (its own pairs, then its base language's). */
function asBefore(text, locale) {
  if (!LANDED || typeof text !== 'string') return text
  if (!locale) throw new Error('[_lp-pricing-copy-2] asBefore needs the page\'s locale')
  const B = byLocale(); const m = new Map()
  for (const list of [B[locale], B[BASE_OF[locale.slice(0, 2)]]]) for (const [a, b] of list || []) if (!m.has(a)) m.set(a, b)
  if (!m.size) return text
  const list = [...m.entries()].sort((x, y) => y[0].length - x[0].length)
  const re = new RegExp(list.map(([a, b]) => (b.endsWith(a) && b.length > a.length ? `(?<!${reEsc(b.slice(0, b.length - a.length))})` : '') + reEsc(a)).join('|'), 'g')
  return text.replace(re, x => m.get(x))
}
/** /llms.txt as it was before pricing-copy-2. */
function llmsBefore(text) {
  if (!LANDED || typeof text !== 'string') return text
  return text.split(LLMS[0][0]).join(LLMS[0][1]).replace(LLMS_PRO, '$1 card orders.')
}

module.exports = { LANDED, BASE, AFTER, KEYS, asBefore, llmsBefore, byLocale }
