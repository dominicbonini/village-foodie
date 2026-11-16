// scripts/_named-app-fixes-2.cjs (app-fixes-2, 15 November 2026, docs/app-fixes-2-report.md): the named changes this work makes to
// files other harnesses pin byte for byte (cwv-2's app/(app) files, through scripts/_moved-paths.cjs changedSince):
//   • the auth pages read the merged keys (auth.forgot.back, auth.login.submit);
//   • the dashboard's Access denied screen gets "Back to log in" (+ the auth catalog import and its translator);
//   • the admin console says "Log out" / "log in again"; the API's fallback sentence says "Log in required";
//   • lib/app-navigation.ts sends /dev to /app; lib/i18n/namespaces.ts gives the dashboard the auth namespace.
// The exact edits are scripts/fixtures/app-fixes-2-edits.json: [before, after] chunks from the diff against the commit before this
// work (`base`), round-trip proven when written. `undoFile` puts them back IN ORDER; null unless each `after` is there exactly once,
// so a file with any other change still reads as changed. app-fixes-1's own undo (scripts/_named-app-fixes-1.cjs) runs AFTER this
// one: app-fixes-2's `before` is app-fixes-1's `after`.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const EDITS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/app-fixes-2-edits.json'), 'utf8'))
const EDITED_FILES = Object.keys(EDITS.files)
function undoFile(file, src) {
  const pairs = EDITS.files[file]
  if (!pairs) return src
  let out = src
  for (const [before, after] of pairs) { if (out.split(after).length !== 2) return null; out = out.split(after).join(before) }
  return out
}
// ── THE RENDER HARNESSES (scripts/_lp2-named.cjs for language-phase-1b / -2; scripts/_lp1d2-named.cjs for the smoke views) ─────────
// The dashboard's "Access denied" screen gains ONE thing: a "Back to log in" button to /login, inside its own wrapper, between the
// sentence and the "← brand" link. STRUCTURAL: BEFORE's text nodes and links, in order, with exactly that button inserted after the
// sentence (worded "Back to log in", or "Back to sign in" — auth.forgot.back in a FROZEN catalogue); nothing else added or moved.
const decode = x => x.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const texts = html => decode(html).replace(/<[^>]*>/g, '\u0000').split('\u0000').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
const hrefs = h => [...h.matchAll(/<a [^>]*href="([^"]*)"/g)].map(m => m[1])
const BUTTON = /<div class="mt-5"><a href="\/login" class="inline-block bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm px-5 py-2\.5 rounded-xl">(Back to log in|Back to sign in)<\/a><\/div>/
const BRAND_LINK = /<a href="\/" class="mt-4 inline-block text-orange-600 text-sm hover:underline">← [^<]*<\/a>/
const BRAND_GONE = (() => { try { const d = fs.readFileSync(path.join(__dirname, '..', 'app/(app)/dashboard/[token]/page.tsx'), 'utf8'); return !/const _brand=/.test(d) } catch { return false } })()
function proveAccessDenied(exp, f) {
  if (typeof exp !== 'string' || typeof f !== 'string') return { ok: false, problems: ['not an HTML view'] }
  const m = f.match(BUTTON)
  if (!m) return { ok: false, problems: ['no "Back to log in" button to /login'] }
  const without = f.replace(m[0], '')
  // ⚠️ RE-PINNED (android-1-1, 15 November 2026, docs/android-1-1-report.md §7): the "← brand" link under the button is REMOVED. BEFORE is
  // compared with exactly that one link taken out (and only while the dashboard source has no `_brand` left, i.e. the removal landed).
  if (BRAND_GONE) exp = exp.replace(BRAND_LINK, '')
  const problems = []
  if (without !== exp) problems.push('with the button taken out, the view is not byte-identical to BEFORE')
  const tb = texts(exp), tf = texts(f)
  if (JSON.stringify(tf.filter(x => x !== m[1])) !== JSON.stringify(tb)) problems.push('the text differs beyond the button')
  if (JSON.stringify(hrefs(f).filter(h => h !== '/login')) !== JSON.stringify(hrefs(exp))) problems.push('the links differ beyond /login')
  return { ok: !problems.length, problems }
}
const LANDED = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'app/(app)/dashboard/[token]/page.tsx'), 'utf8').includes('data-gate-next="login"') } catch { return false } })()
module.exports = { EDITS, EDITED_FILES, undoFile, proveAccessDenied, LANDED }
