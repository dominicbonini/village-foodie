// scripts/_lp-country-picker.cjs — THE COUNTRY-PICKER NAMED CHANGE, for the harnesses that compare a marketing page with an
// older snapshot (country-picker-1, 23 October 2026; docs/country-picker-1-report.md). A MODULE: scripts/country-picker-1.cjs
// and scripts/country-picker-1-screens.cjs prove the new picker itself; this file lets every older comparison cut exactly the
// picker block from BOTH sides — so every other byte of the page is still compared.
//
//   PICKER-footer  Dominic's approved mockup: the footer's country picker is a small flag + code trigger INLINE at the end of
//                  the link row, opening one "Choose your country" box (a dialog, closed in the HTML). The block it replaces:
//                  BEFORE  <div class="cc cc-foot"> (the button + the closed <ul role="menu">), after the store badges;
//                  AFTER   <span class="cc cc-foot"> (the trigger + the closed dialog), the last item of .foot-links.
//                  Each side's block is cut whole (a balanced element, exactly one, inside <footer>); a page with none is
//                  left as it is. `optionsOf` reads either block's country links (href, current) for a like-for-like check.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with country-picker-1 (the picker is a dialog). */
const LANDED = fs.readFileSync(path.join(REPO, 'components/landing/CountryMenu.tsx'), 'utf8').includes('cc-dlg')

const OLD_OPEN = '<div class="cc cc-foot">'
const NEW_OPEN = '<span class="cc cc-foot">'
const count = (s, x) => s.split(x).length - 1

/** The balanced element opened at `at` (`tag`: div / span) — [start, end) — or null. */
function blockAt(html, at, tag) {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g'); re.lastIndex = at
  let d = 0
  for (let m; (m = re.exec(html));) { d += m[0] === `</${tag}>` ? -1 : 1; if (d === 0) return [at, m.index + m[0].length] }
  return null
}
/** The one picker block (old or new) inside <footer>: { kind, start, end } — null when there is none, or not exactly one. */
function find(html) {
  if (typeof html !== 'string') return null
  const nOld = count(html, OLD_OPEN), nNew = count(html, NEW_OPEN)
  if (nOld + nNew !== 1) return null
  const [kind, open, tag] = nNew ? ['new', NEW_OPEN, 'span'] : ['old', OLD_OPEN, 'div']
  const at = html.indexOf(open), f0 = html.lastIndexOf('<footer', at), f1 = html.indexOf('</footer>', at)
  if (f0 < 0 || f1 < 0 || html.lastIndexOf('</footer>', at) > f0) return null
  const b = blockAt(html, at, tag)
  return b && b[1] <= f1 ? { kind, start: b[0], end: b[1] } : null
}
/** PICKER-footer: the html with its one picker block cut (old or new); unchanged when it has none. */
function cut(html) {
  if (typeof html !== 'string' || (!html.includes(OLD_OPEN) && !html.includes(NEW_OPEN))) return html
  const f = find(html)
  return f ? html.slice(0, f.start) + html.slice(f.end) : html
}
/** The country links of either block, in their order: [{ href, current }]. */
function optionsOf(html) {
  const f = find(html); if (!f) return null
  const b = html.slice(f.start, f.end)
  return f.kind === 'old'
    ? [...b.matchAll(/<a href="([^"]*)" role="menuitemradio" aria-checked="(true|false)" class="cc-item"/g)].map(m => ({ href: m[1], current: m[2] === 'true' }))
    : [...b.matchAll(/<a href="([^"]*)" lang="[^"]+"( aria-current="true")? class="cc-item"/g)].map(m => ({ href: m[1], current: !!m[2] }))
}
/** Old and new blocks list the SAME countries (as sets — the new box sorts by English name) with the same one current. */
function sameCountries(before, after) {
  const a = optionsOf(before), b = optionsOf(after)
  if (!a || !b || !a.length) return false
  const key = o => `${o.href}${o.current ? '*' : ''}`
  return JSON.stringify(a.map(key).sort()) === JSON.stringify(b.map(key).sort())
}
/** The new block sits as the LAST item of .foot-links (right before the row's closing </div>). */
function inLinkRow(html) {
  const f = find(html)
  return !!f && f.kind === 'new' && html.lastIndexOf('<div class="foot-links">', f.start) > html.lastIndexOf('</div>', f.start) && html.startsWith('</div>', f.end)
}

module.exports = { LANDED, OLD_OPEN, NEW_OPEN, find, cut, optionsOf, sameCountries, inLinkRow }
