// scripts/_lp-site-chrome-1.cjs — ⚠️ RE-PINNED (site-chrome-1, 5 November 2026): THE NAMED CHANGES OF site-chrome-1
// (docs/site-chrome-1-report.md), shared by the harnesses that compare pages with an older snapshot. A MODULE; it asserts nothing.
// Each transform is PRECISE: it rewrites the BEFORE value into exactly what this work renders, and throws when its anchor is not there.
//   1 · flowLogo — the focused flows' wordmark links home (components/shared/FlowLogo.tsx): /login, /reset-password (the card <img>
//       wrapped in a link), /signup and /setup (the HatchGrabWordmark wrapped in a link), /forgot-password and /verify-email (the card
//       wordmark added, with the image preload React emits for a page's first image).
//   2 · offline — the landing's offline line and /features' offline description put back to 7e1effa7^'s sentence: a snapshot taken
//       after copy-truth-1 holds that commit's sentence (and its apps sentence where both store flags were on); `toCopyTruth` turns
//       TODAY's render back into it, so a pinned hash can still be compared, every other byte included.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const read = f => { try { return fs.readFileSync(path.join(REPO, f), 'utf8') } catch { return '' } }

/** True on a tree with site-chrome-1. */
const LANDED = /variant\?: 'page' \| 'landing' \| 'split'/.test(read('components/landing/MarketingFrame.tsx'))

// ── 1 · the focused flows' logo ───────────────────────────────────────────────────────────────────────────────────────────
const CARD_SRC = '/logos/hatchgrab-wordmark.svg'
const CARD = `<a href="/" class="block w-fit mx-auto mb-4 hover:opacity-80 transition-opacity"><img src="${CARD_SRC}" alt="HatchGrab" width="191" height="42" class="h-12 w-auto"/></a>`
const PRELOAD = `<link rel="preload" as="image" href="${CARD_SRC}"/>`
const OLD_CARD = `<img src="${CARD_SRC}" alt="HatchGrab" width="191" height="42" class="h-12 w-auto mx-auto mb-4"/>`
const WORDMARK = /<img src="\/logos\/hatchgrab-wordmark(?:-white)?\.svg" alt="HatchGrab" width="127" height="28" class=""\/>/g
const LINK = '<a href="/" class="inline-flex hover:opacity-80 transition-opacity">'

function flowLogoString(s, page) {
  if (typeof s !== 'string' || !/<(div|img|h1)/.test(s)) return s
  let out = s, n = 0
  const sub = (re, fn) => { out = out.replace(re, (...m) => { n++; return fn(...m) }) }
  if (page === 'login' || page === 'reset') sub(new RegExp(OLD_CARD.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g'), () => CARD)
  else if (page === 'signup' || page === 'setup') sub(WORDMARK, m => `${LINK}${m}</a>`)
  else if (page === 'forgot') {
    sub(/<h1 class="text-xl font-semibold text-slate-900">/g, m => CARD + m)
    sub(/<div class="text-3xl mb-4">📧<\/div>/g, m => CARD + m)
  } else if (page === 'verify') sub(/<div class="text-4xl mb-4">/g, m => CARD + m)
  if (!n) return s   // a state of the page with no logo (a redirect, a JSON answer): unchanged
  if ((page === 'forgot' || page === 'verify') && !out.startsWith(PRELOAD)) out = PRELOAD + out
  return out
}
/** The page a view id belongs to: "1c/auth/GB|login|empty" → login; "1c/setup/…" → setup. Null for a view this does not touch. */
function flowPageOf(id) {
  const m = /^(?:1c|2)\/(auth|setup)\/(?:GB|US)\|([a-z]+)/.exec(id)
  if (!m) return null
  if (m[1] === 'setup') return 'setup'
  return ({ login: 'login', reset: 'reset', signup: 'signup', forgot: 'forgot', verify: 'verify' })[m[2]] ?? null
}
const mapStrings = (v, fn) => (typeof v === 'string' ? fn(v) : Array.isArray(v) ? v.map(x => mapStrings(x, fn)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)])) : v)
function flowLogo(before, id) {
  const page = flowPageOf(id)
  return page ? mapStrings(before, s => flowLogoString(s, page)) : before
}

// ── 2 · the offline sentence ──────────────────────────────────────────────────────────────────────────────────────────────
const BEFORE = '5622370d'   // copy-truth-1's sentences, the last commit before site-chrome-1
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const get = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o)
let PAIRS = null
/** [today's sentence, copy-truth-1's sentence, its apps sentence] for every language file that has one (escaped as React writes them). */
function pairs() {
  if (PAIRS) return PAIRS
  PAIRS = []
  for (const f of fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2}-[A-Z]{2}\.json$/.test(f))) {
    const now = JSON.parse(read(`messages/${f}`))
    let old; try { old = JSON.parse(execFileSync('git', ['show', `${BEFORE}:messages/${f}`], { cwd: REPO, maxBuffer: 64e6 }).toString()) } catch { continue }
    const gb = JSON.parse(execFileSync('git', ['show', `${BEFORE}:messages/en-GB.json`], { cwd: REPO, maxBuffer: 64e6 }).toString())
    for (const [k, apps] of [['landing.does.offlineBody', 'landing.does.offlineApps'], ['featuresPage.detail.offline_protection', 'featuresPage.offlineApps']]) {
      const n = get(now, k)
      if (n === undefined) continue
      const o = get(old, k) ?? get(gb, k), a = get(old, apps) ?? get(gb, apps)
      if (o !== undefined && o !== n) PAIRS.push([esc(n), esc(o), a === undefined ? null : esc(a)])
    }
  }
  return PAIRS
}
/** Today's render with the offline sentence(s) written as copy-truth-1 wrote them — `withApps` adds its apps sentence (the store flags
 *  on). Returns null when the render has none of today's sentences (a page that shows no offline text). */
function toCopyTruth(html, withApps) {
  let out = String(html), n = 0
  for (const [now, old, apps] of pairs()) {
    if (!out.includes(now)) continue
    out = out.split(now).join(withApps && apps ? `${old} ${apps}` : old); n++
  }
  return n ? out : null
}
/** The candidates a pinned hash may match: today's render as is (a page with no offline text), or copy-truth-1's sentence without or
 *  with its apps sentence. A pinned hash matching ANY of them proves every other byte unchanged. */
function copyTruthCandidates(html) {
  const a = toCopyTruth(html, false), b = toCopyTruth(html, true)
  return a === null ? [String(html)] : [a, b]
}

/** Today's render written as copy-truth-1 rendered it, for comparing with a hash pinned between copy-truth-1 and site-chrome-1 —
 *  copy-truth-1's code added its apps sentence exactly when BOTH store flags were on (comparisonFlagsOf), and the footer shows both
 *  badges exactly then (StoreBadges, store-badges-1), so the render itself says which. A render with no offline text is returned as is. */
function asCopyTruth(html) {
  if (!LANDED || typeof html !== 'string') return html
  const bothApps = (html.match(/class="foot-badge"/g) || []).length >= 2
  return toCopyTruth(html, bothApps) ?? html
}

// ── 3 · the shared chrome on /contact and the legal pages (STRUCTURAL) ───────────────────────────────────────────────────────
/** The shared frame's nav and footer are there: the landing's nav (its logo a link home, the right-hand group) and footer (its links). */
function sharedChrome(html) {
  const problems = []
  if (!/<nav class="bg-slate-900"><div class="nav-in"><a href="[^"]+" class="nav-logo"/.test(html)) problems.push('AFTER: no shared nav (a linked nav-logo)')
  if (!/<div class="nav-r">/.test(html)) problems.push('AFTER: the nav has no right-hand group')
  if (!/<footer class="bg-slate-900"><div class="wrap"><div class="foot-grid">/.test(html) || !/<div class="foot-links">/.test(html)) problems.push('AFTER: no shared footer (.foot-grid, .foot-links)')
  return problems
}
/** HatchGrab's /contact: today's page with ITS chrome (everything up to the nav's end, and the footer onwards) replaced by BEFORE's —
 *  so contact-1's own proof (scripts/_lp-contact-1.cjs contactProof) still compares every byte of the page's body. The chrome itself
 *  must be the shared frame's. Returns { after, problems }. */
function contactChromeBack(before, after, tallyScript) {
  const problems = sharedChrome(after)
  const bNav = before.indexOf('</nav>'), bFoot = before.indexOf('<footer'), aNav = after.indexOf('</nav>'), aFoot = after.lastIndexOf('<footer')
  if (bNav < 0 || bFoot < 0 || aNav < 0 || aFoot < 0) return { after, problems: [...problems, 'the nav or the footer was not found'] }
  const aHead = after.slice(0, after.indexOf('<nav'))
  if (!/^(<link rel="preload"[^>]*\/>)*<div class="hg-landing [^"]*">$/.test(aHead)) problems.push(`AFTER: something other than preloads and the chrome's opening before the nav: ${JSON.stringify(aHead.slice(0, 200))}`)
  return { after: before.slice(0, bNav + 6).replace(tallyScript, '') + after.slice(aNav + 6, aFoot) + before.slice(bFoot), problems }
}
const LEGAL_VIEWS = /^parts\/legal\|(GB|US)\|chrome$/
/** A legal page's chrome view: the document body (BEFORE's `<main class="flex-1 px-4 py-10">…</main>`) is byte-identical inside the
 *  shared frame's `<main class="bg-slate-50 px-4 py-10">…</main>`, the chrome is the shared one, and today's legal chrome is gone. */
function legalProof(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return { ok: false, problems: ['not HTML'] }
  const problems = sharedChrome(after)
  const b = /<main class="flex-1 px-4 py-10">([\s\S]*?)<\/main>/.exec(before), a = /<main class="bg-slate-50 px-4 py-10">([\s\S]*?)<\/main>/.exec(after)
  if (!b) problems.push('BEFORE: the legal chrome\'s <main> was not found')
  if (!a) problems.push('AFTER: the shared frame\'s <main class="bg-slate-50 px-4 py-10"> was not found')
  if (a && b && a[1] !== b[1]) problems.push(`the document body differs: ${JSON.stringify(b[1].slice(0, 120))} → ${JSON.stringify(a[1].slice(0, 120))}`)
  if (/min-h-dvh bg-slate-50 flex flex-col|border-t border-slate-200 bg-white/.test(after)) problems.push('AFTER: the old legal header or footer is still there on the web')
  if (!/class="hg-landing [^"]*chrome-nav-only"/.test(after)) problems.push('AFTER: the nav is not in the split frame\'s chrome-nav-only wrapper')
  return { ok: !problems.length, problems }
}

// ── 4 · the sitemap's copy date (PRECISE) ─────────────────────────────────────────────────────────────────────────────────────
const LASTMOD_NEW = '2026-11-05T00:00:00.000Z'
const COUNTRY_PAGE = /^https:\/\/www\.hatchgrab\.com\/[a-z]{2}(\/features)?$/
/** A sitemap with each live country's landing and /features lastmod moved to at least 2026-11-05 (MARKETING_COPY_UPDATED, 35.aj-8).
 *  PRECISE: at least one entry must move. */
function sitemap(v) {
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(sitemap(p)) } catch { /* not JSON */ } return v }
  if (!Array.isArray(v)) return v
  let moved = 0
  const out = v.map(e => {
    if (!e || !COUNTRY_PAGE.test(e.url || '')) return e
    const at = e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified
    if (typeof at !== 'string' || at >= LASTMOD_NEW) return e
    moved++
    return { ...e, lastModified: e.lastModified instanceof Date ? new Date(LASTMOD_NEW) : LASTMOD_NEW }
  })
  if (!moved) throw new Error('site-chrome-1-sitemap: no country page lastmod to move (stale anchor)')
  return out
}
const COPY_LANDED = /MARKETING_COPY_UPDATED = '(\d{4}-\d{2}-\d{2})'/.test(read('lib/marketing-meta.ts')) && /MARKETING_COPY_UPDATED = '(\d{4}-\d{2}-\d{2})'/.exec(read('lib/marketing-meta.ts'))[1] >= '2026-11-05'

// The named items, in the shape the language-phase registries take (scripts/_lp1e-named.cjs, language-phase-1e-tidy.cjs).
const ITEMS = !LANDED ? [] : [
  { id: 'site-chrome-1-sitemap-lastmod',
    what: '⚠️ RE-PINNED (site-chrome-1, 5 November 2026): MARKETING_COPY_UPDATED 2026-11-05 (the offline line put back), so each live country\'s landing and /features sitemap lastmod is at least 2026-11-05. PRECISE: at least one entry moves',
    views: id => COPY_LANDED && /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => sitemap(v) },
  { id: 'site-chrome-1-legal-chrome',
    what: '⚠️ RE-PINNED (site-chrome-1, 5 November 2026, manual 35.ao-13): on the web the legal pages wear the ONE shared header and footer (components/landing/MarketingFrame.tsx, "split"); the document body is byte-identical. STRUCTURAL (legalProof); scripts/site-chrome-1.cjs proves the chrome, and that the app and Village Foodie keep today\'s',
    views: id => LEGAL_VIEWS.test(id), apply: (id, v) => v, proveWith: (exp, f) => legalProof(exp, f) },
]

module.exports = { asCopyTruth, LANDED, flowLogo, flowLogoString, flowPageOf, toCopyTruth, copyTruthCandidates, pairs, sharedChrome, contactChromeBack, legalProof, LEGAL_VIEWS, sitemap, LASTMOD_NEW, COPY_LANDED, ITEMS }
