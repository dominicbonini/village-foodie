// scripts/_lp-store-badges-1.cjs — ⚠️ RE-PINNED (store-badges-1, 2 November 2026): THE NAMED PUBLIC-PAGE CHANGES OF store-badges-1
// (docs/store-badges-1-report.md), shared by every harness that compares the marketing pages with a BEFORE snapshot. A MODULE.
//
// store-badges-1 changed, ON PURPOSE:
//   1. the footer's store badges follow the page's country's app flags (country_settings.ios_app_available /
//      android_app_available): Apple's only where iOS is, Google's only where Android is, and NOTHING — no `.foot-apps` wrapper —
//      where neither is. The older harnesses' fixture rows set no app flag, so their AFTER footer has no badges at all;
//   2. each badge is the vendor's artwork in the page's language (English pages keep the English files);
//   3. GOOGLE_PLAY_URL lost `&hl=en` (Dominic's go-ahead) — in the footer's Play href and in the JSON-LD Organization's sameAs.
// noBadges / noBadgesMust are PRECISE BEFORE transforms (they throw when the old markup is not there); strip is the symmetric
// normaliser for the harnesses that keep only a HASH (both sides lose the badge block and the Play `hl`); scripts/store-badges-1.cjs
// proves the badges themselves.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with store-badges-1 (lib/store-badge-files.ts). */
const LANDED = fs.existsSync(path.join(REPO, 'lib/store-badge-files.ts'))

const PLAY = 'play.google.com/store/apps/details?id=com.hatchgrab.app'
const FOOT_APPS = /<div class="foot-apps">(?:<a [^>]*><img [^>]*\/?><\/a>)*<\/div>/g
/** The Play URL without `hl=en`, in every form a page carries it (HTML-escaped, raw in the JSON-LD, JSON-escaped). */
const noHl = s => s.split(`${PLAY}&amp;hl=en`).join(PLAY).split(`${PLAY}&hl=en`).join(PLAY).split(`${PLAY}\\u0026hl=en`).join(PLAY)

function walk(v, f) {
  if (typeof v === 'string') return f(v)
  if (Array.isArray(v)) return v.map(x => walk(x, f))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, f)]))
  return v
}
/** BEFORE as store-badges-1 renders it where the page's country has no app: the footer's badge block gone, the Play URL without hl. */
const noBadges = v => walk(v, s => noHl(s.replace(FOOT_APPS, '')))
/** As noBadges, where the country HAS both apps: only the Play URL changes (English pages keep the English files). */
const playOnly = v => walk(v, noHl)
const carriesBadges = v => /<div class="foot-apps">/.test(typeof v === 'string' ? v : JSON.stringify(v))
const carriesHl = v => (typeof v === 'string' ? v : JSON.stringify(v)).includes('hl=en')
/** PRECISE: the BEFORE value must carry the badge block (or at least the old Play URL, for a view with no footer). */
function noBadgesMust(v) { if (!carriesBadges(v) && !carriesHl(v)) throw new Error('store-badges-1: the BEFORE value holds neither the footer badges nor the old Play URL (stale anchor)'); return noBadges(v) }
/** The symmetric normaliser for the hash-only harnesses: the badge block (whatever language) and the Play `hl` taken out. */
const strip = html => (html == null ? html : noHl(String(html).replace(FOOT_APPS, '')))

// ── Manage › Settings (language-phase-1d / 1d2): the app-download card — its title, body and badges, one white card — renders only
//    where the truck's country has an app; the fixtures give /api/manage no flags, so it is gone from every Settings view.
const APP_CARD = /<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"><p class="text-base font-bold text-slate-800">[^<]*<\/p><p class="text-xs text-slate-500 mt-0\.5 leading-relaxed">[^<]*<\/p><div class="mt-3 flex flex-wrap items-center gap-3">(?:<a [^>]*><img [^>]*\/?><\/a>)*<\/div><\/div>/g
const appCardIn = s => (s.match(APP_CARD) || []).filter(m => /apps\.apple\.com|play\.google\.com\/store/.test(m))
/** A Settings view as store-badges-1 renders it for a truck whose country has no app: the app card gone. PRECISE: it was there. */
function noAppCardMust(v) {
  let found = 0
  const out = walk(v, s => { const cards = appCardIn(s); found += cards.length; return cards.reduce((x, c) => x.split(c).join(''), s) })
  if (!found) throw new Error('store-badges-1: the BEFORE Settings view holds no app-download card (stale anchor)')
  return out
}
/** As noAppCardMust, for views that may or may not show Settings' card (the Manage shell's tabs): removed where present. */
const noAppCard = v => walk(v, s => appCardIn(s).reduce((x, c) => x.split(c).join(''), s))
/** GET /api/manage as store-badges-1 answers it: `appsAvailable` (the truck's country's app flags — none in the fixtures) right after
 *  `countrySettings`. */
function manageGetApps(b, apps = { ios: false, android: false }) {
  if (!b || typeof b !== 'object' || typeof b.body !== 'string') return b
  let body; try { body = JSON.parse(b.body) } catch { return b }
  if (!body || !('countrySettings' in body) || 'appsAvailable' in body) return b
  const out = {}
  for (const [k, x] of Object.entries(body)) { out[k] = x; if (k === 'countrySettings') out.appsAvailable = apps }
  return { ...b, body: JSON.stringify(out) }
}

// The named items, in the shape the language-phase registries take (scripts/_lp1e-named.cjs, language-phase-1e-tidy.cjs).
const ITEMS = !LANDED ? [] : [
  { id: 'store-badges-1',
    what: '⚠️ RE-PINNED (store-badges-1, 2 November 2026): the footer\'s store badges follow the country\'s app flags — none set in these fixtures, so no badges and no .foot-apps wrapper — and the Play URL lost &hl=en (the footer href and the JSON-LD sameAs). PRECISE: the BEFORE value must carry the badges or the old URL',
    views: id => /^pages\/(landing|features|compare|about|comparison)\|[A-Z]+\|(html|meta)(?!.*-usOff)/.test(id),
    apply: (id, v) => (carriesBadges(v) || carriesHl(v) ? noBadges(v) : v) },
]

module.exports = { LANDED, PLAY, FOOT_APPS, noHl, noBadges, noBadgesMust, playOnly, strip, carriesBadges, carriesHl, APP_CARD, noAppCard, noAppCardMust, manageGetApps, walk, ITEMS }
