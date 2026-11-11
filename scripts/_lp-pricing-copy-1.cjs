// scripts/_lp-pricing-copy-1.cjs — ⚠️ RE-PINNED (pricing-copy-1, 11 November 2026; docs/pricing-copy-1-report.md): THE NAMED WORDING
// CHANGES OF pricing-copy-1, for every harness that compares a public page with a BEFORE snapshot (faq-1, seo-geo-2,
// store-badges-1, …). A MODULE: scripts/pricing-copy-1.cjs proves the change itself.
//
// pricing-copy-1 changed, ON PURPOSE and in every language, six message strings (Dominic, 11 November 2026):
//   • pricing.banner.body / bodyOnly — the sentence "Prefer to take payment up front? Add online card payments any time." deleted;
//   • pricing.fee.feeOnly (the Pay as you go card) — no asterisk, "online card orders" → "online orders";
//   • compare.plan.summaryFeeOnly, compare.orders.feeOnly, comparison.costs.feeOnly — the same "card" word dropped;
// and /llms.txt's Pay as you go fee line ("on online card orders." → "on online orders.", lib/llms-text.ts).
//
// HOW asBefore works: the BEFORE strings are read from the commit before the change (BASE), the AFTER strings from the change's own
// commit (AFTER) — both fixed, so a later edit to the same strings, or another session's work in the tree, never moves the anchor. Each before/after pair is diffed character by character; every hunk is widened with its literal
// neighbours (never across an ICU placeholder, and across no tag but <b> / </b>, which render as themselves) and HTML-escaped as
// React writes text. asBefore(html) puts every hunk back in ONE pass. It cannot hide a difference: the caller still compares the
// result with HEAD byte for byte, so a wrong or stale pair fails the comparison, never passes it.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')

/** The last commit before pricing-copy-1 (billing-2's report). */
const gitOut = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
/** pricing-copy-1's commits, oldest first (their messages start "pricing-copy-1:"). */
const COMMITS = (() => { try { return gitOut(['log', '--format=%H', '--grep=^pricing-copy-1:', '--reverse']).trim().split('\n').filter(Boolean) } catch { return [] } })()
/** The commit the wording change landed in (the first pricing-copy-1 commit), and the one before it. */
const AFTER = COMMITS[0] || null
const BASE = AFTER ? gitOut(['rev-parse', `${AFTER}~1`]).trim() : '92d9ed1b'
const KEYS = ['pricing.banner.body', 'pricing.banner.bodyOnly', 'pricing.fee.feeOnly', 'compare.plan.summaryFeeOnly', 'compare.orders.feeOnly', 'comparison.costs.feeOnly']
/** The keys the landing page, /pricing, /features and the plans PDF print; the comparison pages' keys are added with { compare: true }
 *  (a pair is short in a language without spaces — "、オンライン注文に" — and must not be tried on a page that cannot carry it). */
const PAGE_KEYS = KEYS.slice(0, 3)
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o)

/** True on a tree with pricing-copy-1 (its commit is in the history). */
const LANDED = !!AFTER

/** Character hunks between a and b (LCS): [aStart, aEnd, bStart, bEnd]. */
function hunks(a, b) {
  const n = a.length, m = b.length, W = m + 1
  const L = new Uint16Array((n + 1) * W)
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = a[i] === b[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1])
  const out = []; let i = 0, j = 0, cur = null
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { if (cur) { out.push(cur); cur = null } i++; j++; continue }
    if (!cur) cur = [i, i, j, j]
    if (j >= m || (i < n && L[(i + 1) * W + j] >= L[i * W + j + 1])) { i++; cur[1] = i } else { j++; cur[3] = j }
  }
  if (cur) out.push(cur)
  return out
}

const BREAK = /[{}]/
/** How far a literal context may reach from `at` in direction `dir` (stops before { } and any tag but <b> / </b>). */
function reach(s, at, dir, max = 40) {
  let k = at, used = 0
  while (used < max) {
    const p = dir < 0 ? k - 1 : k
    if (p < 0 || p >= s.length) break
    const ch = s[p]
    if (BREAK.test(ch)) break
    if (ch === '<' || ch === '>') {
      const tagAt = dir < 0 ? s.lastIndexOf('<', p) : p
      const tag = s.slice(tagAt, s.indexOf('>', tagAt) + 1)
      if (tag !== '<b>' && tag !== '</b>') break
      k = dir < 0 ? tagAt : tagAt + tag.length; used += tag.length; continue
    }
    k += dir; used++
  }
  return k
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
  .split('&lt;b&gt;').join('<b>').split('&lt;/b&gt;').join('</b>')

/** [after, before] pairs for one message pair, widened to literal context and merged where contexts touch. */
function pairsOf(before, after) {
  const hs = hunks(before, after)
  const spans = hs.map(([a0, a1, b0, b1]) => ({ a0: reach(before, a0, -1), a1: reach(before, a1, 1), b0: reach(after, b0, -1), b1: reach(after, b1, 1) }))
  const merged = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s.b0 <= last.b1 && s.a0 <= last.a1) { last.a1 = Math.max(last.a1, s.a1); last.b1 = Math.max(last.b1, s.b1) } else merged.push({ ...s })
  }
  return merged.map(s => [after.slice(s.b0, s.b1), before.slice(s.a0, s.a1)])
}

let BY = null
/** Every rendered [after, before] pair, per locale file — { locale: [[after, before], …] }. */
function byLocale() {
  if (BY) return BY
  BY = {}
  for (const f of fs.readdirSync(path.join(REPO, 'messages')).filter(x => /^[a-z]{2}-[A-Z]{2}\.json$/.test(x))) {
    let old, now
    try { old = JSON.parse(gitOut(['show', `${BASE}:messages/${f}`])); now = JSON.parse(gitOut(['show', `${AFTER}:messages/${f}`])) } catch { continue }
    const list = []
    for (const k of KEYS) {
      const b = get(old, k), a = get(now, k)
      if (b === undefined || a === undefined || a === b) continue
      for (const [af, bf] of pairsOf(b, a)) {
        if (af.length < 4) throw new Error(`[_lp-pricing-copy-1] ${f} ${k}: a hunk with too little context (${JSON.stringify(af)})`)
        list.push([esc(af), esc(bf), k])
      }
    }
    if (list.length) BY[f.slice(0, -5)] = list
  }
  return BY
}

/** /llms.txt (English for every country, plain text). */
const LLMS = [[' on online orders.\n', ' on online card orders.\n']]

/** The pairs for one locale (its own file's pairs win; then its base language's, for a sparse overlay), or, with no locale,
 *  every pair whose AFTER text maps to one BEFORE text in every locale (`ambiguous` lists the rest). */
function pairs(locale, keys = PAGE_KEYS) {
  const B = Object.fromEntries(Object.entries(byLocale()).map(([l, list]) => [l, list.filter(x => keys.includes(x[2])).map(x => [x[0], x[1]])]))
  if (locale) {
    const m = new Map()
    const add = list => { for (const [a, b] of list || []) if (!m.has(a)) m.set(a, b) }
    add(B[locale]); add(B[{ en: 'en-GB', es: 'es-ES', fr: 'fr-FR', pt: 'pt-PT', de: 'de-DE', ar: 'ar-AE', el: 'el-GR', nl: 'nl-NL' }[locale.slice(0, 2)]])
    add(LLMS)
    return { list: [...m.entries()].sort((x, y) => y[0].length - x[0].length), ambiguous: [] }
  }
  const m = new Map(), bad = new Set()
  for (const list of Object.values(B)) for (const [a, b] of list) { if (m.has(a) && m.get(a) !== b) bad.add(a); else m.set(a, b) }
  for (const a of bad) m.delete(a)
  for (const [a, b] of LLMS) m.set(a, b)
  return { list: [...m.entries()].sort((x, y) => y[0].length - x[0].length), ambiguous: [...bad] }
}

const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Where BEFORE is AFTER with something put IN FRONT (the asterisk: "*</b>。…" ← "</b>。…"), a text that already has it in front is
// BEFORE's own (Pro's "<b>0.99%*</b>。…") and is left alone: (?<!*) guards that alternative.
const rx = list => new RegExp(list.map(([a, b]) => (b.endsWith(a) && b.length > a.length ? `(?<!${reEsc(b.slice(0, b.length - a.length))})` : '') + reEsc(a)).join('|'), 'g')
/** The text as it was before pricing-copy-1 (every pair put back in one pass). Unchanged on an older tree. `locale` (or the
 *  page's own <html lang>) picks that language's pairs; without one, a text that carries an AFTER shared by two languages with
 *  different BEFOREs (the Spanish variants' banner) THROWS rather than guess. */
function asBefore(text, locale, { compare = false } = {}) {
  if (!LANDED || typeof text !== 'string') return text
  const lang = locale || (/<html[^>]*\blang="([a-z]{2}-[A-Z]{2})"/.exec(text) || [])[1]
  const { list, ambiguous } = pairs(lang, compare ? KEYS : PAGE_KEYS)
  const hit = ambiguous.find(a => text.includes(a))
  if (hit) throw new Error(`[_lp-pricing-copy-1] asBefore needs the locale: ${JSON.stringify(hit.slice(0, 60))} is two languages' text`)
  const back = new Map(list)
  return text.replace(rx(list), m => back.get(m))
}

module.exports = { LANDED, BASE, AFTER, COMMITS, KEYS, PAGE_KEYS, asBefore, pairs, pairsOf, byLocale }
