// scripts/_named-app-fixes-1.cjs (app-fixes-1, 14 November 2026, docs/app-fixes-1-report.md §4): the named change this work makes to
// proxy.ts, a file other harnesses pin byte for byte (loyalty-1, cwv-2, costs-accounts-1 through scripts/_moved-paths.cjs
// changedSince). Its only edits there: the import of lib/app-navigation and the in-app page rule (a request carrying the app's
// user-agent marker, for a page outside the 'stay' list, goes to /app). `undoCode` takes exactly those back; null unless each is there
// exactly once, so the file then reads as changed and every other byte is still compared.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const CODE_FILES = ['proxy.ts']
const IMPORT = "import { inAppRoute } from '@/lib/app-navigation'\n"
const BLOCK_START = '  // ── 🔴 app-fixes-1 (14 November 2026, docs/app-fixes-1-report.md §4): ONLY OPERATOR SCREENS LOAD INSIDE THE APP.'
const BLOCK_END = "    if (isPage && inAppRoute(pathname) !== 'stay') return NextResponse.redirect(new URL('/app', request.url))\n  }\n\n"
function undoCode(file, src) {
  if (!CODE_FILES.includes(file)) return src
  if (src.split(IMPORT).length !== 2 || src.split(BLOCK_START).length !== 2 || src.split(BLOCK_END).length !== 2) return null
  const a = src.indexOf(BLOCK_START), b = src.indexOf(BLOCK_END) + BLOCK_END.length
  if (b <= a) return null
  return (src.slice(0, a) + src.slice(b)).replace(IMPORT, '')
}
const LANDED = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'proxy.ts'), 'utf8').includes(BLOCK_START) } catch { return false } })()
// ── THE AUTH PAGES, THE ERROR / 404 PAGES AND THE ROOT LAYOUT (app/(app)), which cwv-2 pins as their pre-move selves ───────────
// Their exact edits are scripts/fixtures/app-fixes-1-edits.json: [before, after] chunks generated from the diff against the commit
// before this work (`base`) and round-trip proven when written. `undoFile` puts them back IN ORDER; null unless each `after` is there
// exactly once, so a file with any other change still reads as changed.
const EDITS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/app-fixes-1-edits.json'), 'utf8'))
const EDITED_FILES = Object.keys(EDITS.files)
function undoFile(file, src) {
  const pairs = EDITS.files[file]
  if (!pairs) return src
  let out = src
  for (const [before, after] of pairs) { if (out.split(after).length !== 2) return null; out = out.split(after).join(before) }
  return out
}
/** A file app-fixes-1 ADDED (lib/printing/netAvailability.ts): "as before" it did not exist — true only while its content is exactly
 *  what this work wrote (sha-256 in the fixture), so any later edit to it still reads as a change. */
const NEW_FILES = EDITS.new_files || {}
function isOwnNewFile(file, buf) {
  if (!(file in NEW_FILES) || buf == null) return false
  return require('crypto').createHash('sha256').update(buf).digest('hex') === NEW_FILES[file]
}
// ── THE RENDER HARNESSES (scripts/_lp2-named.cjs, reused by language-phase-1b / -1c / -1d2 / -2) ─────────────────────────────────
// Two STRUCTURAL proofs for the views this work changes on purpose. Neither re-pins a view to its new output; each proves that
// everything the BEFORE view said is still there, and that the ONLY differences are the recorded ones.
const decode = x => x.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** The view's text nodes, in order (tags out, whitespace collapsed). */
const texts = html => decode(html).replace(/<[^>]*>/g, '\u0000').split('\u0000').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
/** Every element's attributes in order, except `class` and this work's data-stock-* hooks; elements left with none are dropped.
 *  Component stand-ins (<x-stub data-c data-p>) keep every prop, so a stub that changed still fails. */
const attrs = html => [...html.matchAll(/<([a-z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/g)].map(([, tag, a]) => {
  const kept = [...a.matchAll(/\s+([\w:-]+)(?:="([^"]*)")?/g)].filter(([, k]) => k !== 'class' && !/^data-stock-/.test(k)).map(([, k, v]) => `${k}=${v ?? ''}`)
  return kept.length ? `${tag}[${kept.join(' ')}]` : null
}).filter(Boolean)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
/** Carte & stock (the dashboard's stock tab): Dominic's approved phone layout changed ONLY layout — classes (the shared column widths,
 *  gaps, insets), the data-stock-* hooks, and one wrapper splitting the category name from its counts (same text, same order). */
function proveStockView(exp, f) {
  if (typeof exp !== 'string' || typeof f !== 'string') return { ok: same(exp, f), problems: same(exp, f) ? [] : ['not an HTML view'] }
  const problems = []
  if (!same(texts(exp), texts(f))) problems.push('the text differs (Carte & stock may change layout only)')
  if (!same(attrs(exp), attrs(f))) problems.push('an attribute or a component stand-in differs (only classes and data-stock-* may change)')
  return { ok: !problems.length, problems }
}
/** The auth end states: every BEFORE text and link is still there, with exactly the recorded rewording and the recorded additions. */
const AUTH = {
  forgotSent: { replace: {}, addText: ['Back to log in'], addHref: ['/login'] },
  // the logo is the auth cards' FlowLogo — on the web it links home ('/'), as on every other auth card; in the app it is inert
  resetInvalid: { replace: { 'Request a new reset link': 'Send a new link' }, addText: ['Back to log in'], addHref: ['/login', '/'], allowLogo: true },
}
function proveAuthView(kind) {
  const spec = AUTH[kind]
  return (exp, f) => {
    if (typeof exp !== 'string' || typeof f !== 'string') return { ok: false, problems: ['not an HTML view'] }
    const problems = []
    const want = texts(exp).map(x => spec.replace[x] ?? x).concat(spec.addText)
    const got = texts(f)
    if (!same([...got].sort(), [...want].sort())) problems.push(`texts: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
    const hrefs = h => [...h.matchAll(/<a [^>]*href="([^"]*)"/g)].map(m => m[1])
    const wantHref = hrefs(exp).map(h => (h === '/forgot-password' ? h : h)).concat(spec.addHref).sort()
    if (!same(hrefs(f).sort(), wantHref)) problems.push(`links: expected ${JSON.stringify(wantHref)}, got ${JSON.stringify(hrefs(f))}`)
    const imgs = h => [...h.matchAll(/<(img|link)\b[^>]*>/g)].length
    if (!spec.allowLogo && imgs(f) !== imgs(exp)) problems.push('an image or preload was added')
    return { ok: !problems.length, problems }
  }
}
module.exports = { CODE_FILES, undoCode, LANDED, EDITS, EDITED_FILES, undoFile, NEW_FILES, isOwnNewFile, proveStockView, proveAuthView, texts, attrs }
