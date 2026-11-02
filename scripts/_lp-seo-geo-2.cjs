// scripts/_lp-seo-geo-2.cjs — ⚠️ RE-PINNED (faq-2-seo-geo-2 Part B, 2 November 2026): THE NAMED PUBLIC-PAGE CHANGES OF seo-geo-2
// (docs/faq-2-seo-geo-2-report.md), shared by every harness that compares the marketing pages, /llms.txt or the router with a
// BEFORE snapshot (language-phase-0, language-phase-1e through scripts/_lp1e-named.cjs, language-phase-1e-tidy, plans-data-model,
// pricing-pages, ai-search-1, copy-truth-1, faq-1, faq-2, faq-3). A MODULE.
//
// seo-geo-2 changed, ON PURPOSE:
//   1. B3 — the landing JSON-LD's SoftwareApplication.operatingSystem is true per country: "Web", plus "iOS" / "Android" only where
//      the country's ios_app_available / android_app_available is true. BEFORE said "Web, iOS, Android" everywhere. The older
//      harnesses' fixture rows set no app flag, so their AFTER says "Web" (os / osMust); the hash-only harnesses compare the HTML
//      with the value masked (withoutOs) — scripts/seo-geo-2.cjs proves the value per country.
//   2. B4 — /llms.txt is rebuilt (a Features section, the English FAQ, every country's lines in English in the side-by-side form):
//      not compared with a BEFORE any more; scripts/seo-geo-2.cjs §5 proves its content.
//   3. B1 — on www.hatchgrab.com, /venues/<slug>, /trucks and /hire answer 308 → the same path on www.villagefoodie.co.uk; on
//      www.villagefoodie.co.uk, /1ng7n4p5omux2gdk9kqvwz answers 308 → www.hatchgrab.com (routerMoved).
// Each BEFORE transform is PRECISE: it throws when the old value is not there (a stale anchor).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with seo-geo-2 (lib/structured-data.ts's operatingSystemsOf). */
const LANDED = (() => { try { return /export function operatingSystemsOf/.test(fs.readFileSync(path.join(REPO, 'lib/structured-data.ts'), 'utf8')) } catch { return false } })()

const OLD_OS = '"operatingSystem":"Web, iOS, Android"'
/** Any JSON value (HTML, captured metadata) with BEFORE's operatingSystem set to `to` (no app flag in the fixtures → "Web"). */
function os(v, to = 'Web') {
  if (typeof v === 'string') return v.split(OLD_OS).join(`"operatingSystem":"${to}"`).split(OLD_OS.replace(/"/g, '\\"')).join(`\\"operatingSystem\\":\\"${to}\\"`)
  if (Array.isArray(v)) return v.map(x => os(x, to))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'operatingSystem' && x === 'Web, iOS, Android' ? to : os(x, to)]))
  return v
}
const carries = v => typeof v === 'string' ? (v.includes(OLD_OS) || v.includes(OLD_OS.replace(/"/g, '\\"'))) : JSON.stringify(v).includes('Web, iOS, Android')
/** PRECISE: the BEFORE value must carry the old operatingSystem. */
function osMust(v, to = 'Web') { if (!carries(v)) throw new Error('seo-geo-2-os: the BEFORE value holds no "Web, iOS, Android" (stale anchor)'); return os(v, to) }
/** The reverse, for a harness whose expected side is BUILT from BEFORE (seo-fixes' JSON-LD): AFTER's "Web" (no app flag in the
 *  fixtures) set back to "Web, iOS, Android". PRECISE: AFTER must carry "Web". */
function osBack(v) {
  const NEW = '"operatingSystem":"Web"'
  if (typeof v === 'string') {
    if (!v.includes(NEW) && !v.includes(NEW.replace(/"/g, '\\"'))) throw new Error('seo-geo-2-os: the AFTER value holds no "operatingSystem":"Web" (stale anchor)')
    return v.split(NEW).join(OLD_OS).split(NEW.replace(/"/g, '\\"')).join(OLD_OS.replace(/"/g, '\\"'))
  }
  const j = JSON.stringify(v)
  if (!j.includes('"operatingSystem":"Web"')) throw new Error('seo-geo-2-os: the AFTER value holds no "operatingSystem":"Web" (stale anchor)')
  return JSON.parse(j.split('"operatingSystem":"Web"').join(OLD_OS))
}
/** For a harness that keeps only HEAD's HASH of a landing page: the AFTER HTML as HEAD would have rendered it — "Web" (no app flag)
 *  set back to "Web, iOS, Android"; a page whose fixture flags are both on already says it. Anything else throws (stale anchor). */
function asBefore(html) {
  if (!LANDED || html == null) return html
  const v = String(html)
  if (v.includes('"operatingSystem":"Web"')) return osBack(v)
  if (v.includes(OLD_OS) || !v.includes('"operatingSystem"')) return v
  throw new Error(`seo-geo-2-os: an operatingSystem this harness does not know (${(/"operatingSystem":"[^"]*"/.exec(v) || [])[0]})`)
}
/** The HTML with the operatingSystem value masked — for the harnesses that keep only a hash. */
const withoutOs = html => (html == null ? html : String(html).replace(/"operatingSystem":"[^"]*"/g, '"operatingSystem":"…"').replace(/\\"operatingSystem\\":\\"[^\\]*\\"/g, '\\"operatingSystem\\":\\"…\\"'))

/** B1: the router views seo-geo-2 moved — [host, path] → its new Location. */
const ROUTER_MOVED = [
  ['www.hatchgrab.com', /^\/venues\/[^/?]+/, p => `https://www.villagefoodie.co.uk${p}`],
  ['www.hatchgrab.com', /^\/trucks(\?|$)/, p => `https://www.villagefoodie.co.uk${p}`],
  ['www.hatchgrab.com', /^\/hire(\?|$)/, p => `https://www.villagefoodie.co.uk${p}`],
  ['www.villagefoodie.co.uk', /^\/1ng7n4p5omux2gdk9kqvwz(\?|$)/, p => `https://www.hatchgrab.com${p}`],
]
/** The Location seo-geo-2 sends for this host and path, or null when it leaves the view alone. */
function routerMoved(host, p) {
  if (!LANDED) return null
  const m = ROUTER_MOVED.find(([h, re]) => h === host && re.test(p))
  return m ? m[2](p) : null
}

// The named items, in the shape the language-phase registries take (scripts/_lp1e-named.cjs, language-phase-1e-tidy.cjs).
const ITEMS = !LANDED ? [] : [
  { id: 'seo-geo-2-os',
    what: '⚠️ RE-PINNED (seo-geo-2 B3, 2 November 2026): the landing JSON-LD\'s operatingSystem is true per country — "Web" here (no app flag in these fixtures; it was "Web, iOS, Android" everywhere). PRECISE: the BEFORE value must carry the old value',
    views: id => /^pages\/landing\|(GB|US)\|(html|meta)(?!.*-usOff)/.test(id),
    apply: (id, v) => osMust(v) },
  { id: 'seo-geo-2-router',
    what: '⚠️ RE-PINNED (seo-geo-2 B1, 2 November 2026): on www.hatchgrab.com /venues/<slug>, /trucks and /hire, and on www.villagefoodie.co.uk the landing preview, now answer 308 to the same path on the other host. PRECISE: BEFORE must be the untouched 200',
    views: id => !!routerView(id),
    apply: (id, v) => {
      const { want } = routerView(id)
      const b = typeof v === 'string' ? JSON.parse(v) : v
      if (!b || b.status !== 200 || b.kind !== 'next') throw new Error(`seo-geo-2-router: ${id} BEFORE was not the untouched 200 (stale anchor)`)
      const after = { status: 308, kind: 'redirect', location: want, rewrite: null, setCookie: [], chain: [{ offHost: want }], ends: `off-host ${want}` }
      return typeof v === 'string' ? JSON.stringify(after) : after
    } },
]
/** A router view id ("router/router|X|<host> <path> c=… ip=… us=…") that seo-geo-2 moved, with its new Location; else null. */
function routerView(id) {
  const m = /^(?:router\/)?router\|X\|(\S+) (\S+) c=/.exec(id)
  const want = m && routerMoved(m[1], m[2])
  return want ? { want } : null
}

module.exports = { LANDED, OLD_OS, os, osMust, osBack, asBefore, withoutOs, routerMoved, ROUTER_MOVED, ITEMS }
