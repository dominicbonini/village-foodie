// scripts/_lp-copy-truth-1.cjs — ⚠️ RE-PINNED (copy-truth-1, 2 November 2026): THE NAMED PUBLIC-PAGE CHANGES OF copy-truth-1
// (docs/copy-truth-1-report.md), shared by every harness that compares the marketing pages or the sitemap with a BEFORE snapshot
// (language-phase-0, marketing-country-parity, plans-data-model, language-phase-1e through scripts/_lp1e-named.cjs,
// language-phase-1e-tidy). A MODULE.
//
// copy-truth-1 changed, ON PURPOSE (the live claims were untrue):
//   1. the landing page's offline tile: "If you lose signal, online ordering pauses automatically so customers can’t place orders
//      you won’t see. Carry on taking orders with the iPhone, iPad and Android app." (en-US: "Continue taking …") became "Switch on
//      offline protection and online ordering pauses automatically if you lose signal, so customers can’t place orders you won’t
//      see." — the apps sentence follows ONLY where the country's ios_app_available AND android_app_available are both true,
//      which no older harness's fixture rows set (so their AFTER carries the first sentence alone);
//   2. /features' offline-protection description: the same first sentence, the apps sentence on the same condition;
//   3. lib/marketing-meta.ts MARKETING_COPY_UPDATED '2026-10-20' → '2026-11-02', so each live country's landing and /features
//      sitemap lastmod is at least 2026-11-02 (it is the latest of the copy date, the plan data and the country row).
// Each a PRECISE transform of the BEFORE side: it throws when the old text is not there (a stale anchor).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with copy-truth-1 (lib/marketing-meta.ts's copy date 2026-11-02 or later). */
const LANDED = (() => { try { const m = /MARKETING_COPY_UPDATED\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync(path.join(REPO, 'lib/marketing-meta.ts'), 'utf8')); return !!m && m[1] >= '2026-11-02' } catch { return false } })()

const NEW_FIRST = 'Switch on offline protection and online ordering pauses automatically if you lose signal, so customers can’t place orders you won’t see.'
const OLD_LANDING = [
  'If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app.',
  'If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Continue taking orders with the iPhone, iPad and Android app.',
]
const OLD_FEATURES = 'If you lose signal, online ordering pauses so customers can’t place orders you won’t see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection.'
const LASTMOD_NEW = '2026-11-02T00:00:00.000Z'
const COUNTRY_PAGE = /^https:\/\/www\.hatchgrab\.com\/[a-z]{2}(\/features)?$/

/** Any JSON value with the old offline text replaced by the new first sentence (HTML and captured text alike). */
function offline(v) {
  if (typeof v === 'string') return [...OLD_LANDING, OLD_FEATURES].reduce((s, o) => s.split(o).join(NEW_FIRST), v)
  if (Array.isArray(v)) return v.map(offline)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, offline(x)]))
  return v
}
const carries = v => [...OLD_LANDING, OLD_FEATURES].some(o => JSON.stringify(v).includes(JSON.stringify(o).slice(1, -1)))
/** PRECISE: the BEFORE value must carry the old offline text. */
function offlineMust(v) { if (!carries(v)) throw new Error('copy-truth-1-offline: the BEFORE value holds no old offline text (stale anchor)'); return offline(v) }

/** A sitemap (an array of entries, or its JSON string) with each live country's landing and /features lastmod moved to at least
 *  2026-11-02. PRECISE: at least one entry must move. */
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
  if (!moved) throw new Error('copy-truth-1-sitemap: no country page lastmod to move (stale anchor)')
  return out
}

// The named items, in the shape the language-phase registries take (scripts/_lp1e-named.cjs, language-phase-1e-tidy.cjs).
const ITEMS = !LANDED ? [] : [
  { id: 'copy-truth-1-offline',
    what: '⚠️ RE-PINNED (copy-truth-1, 2 November 2026): the landing\'s offline tile says offline protection is switched on by the truck ("Switch on offline protection and online ordering pauses automatically if you lose signal…"); the apps sentence only where both app flags are on — none in these fixtures. PRECISE: the BEFORE value must carry the old text',
    views: id => /^pages\/landing\|(GB|US)\|html(?!.*-usOff)/.test(id),
    apply: (id, v) => offlineMust(v) },
  { id: 'copy-truth-1-sitemap-lastmod',
    what: '⚠️ RE-PINNED (copy-truth-1, 2 November 2026): MARKETING_COPY_UPDATED 2026-11-02, so each live country\'s landing and /features sitemap lastmod is at least 2026-11-02. PRECISE: at least one entry moves',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
    apply: (id, v) => sitemap(v) },
]

module.exports = { LANDED, NEW_FIRST, OLD_LANDING, OLD_FEATURES, LASTMOD_NEW, offline, offlineMust, sitemap, ITEMS }
