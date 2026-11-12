/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
// scripts/_lp-world-countries-5.cjs — ⚠️ RE-PINNED (world-countries-5, 12 November 2026): THE NAMED CHANGE OF world-countries-5 to the
// country selector's rendered HTML (components/landing/CountryMenu.tsx), for the harnesses that compare a page with an older
// snapshot. A MODULE; it asserts nothing. PRECISE: it rewrites TODAY's render back into the HTML before world-countries-5, and throws
// when its anchor is not there.
//   asBefore(html, { names, label }) — the selector now shows region buttons (a tablist) and one list per region, each with its panel
//   id, and an item no longer shows its code ("no codes", Dominic's brief). Put back: the buttons removed, the lists merged into the
//   ONE list it was (`<ul class="cc-list" aria-label="Country">`), in English-name order (the BEFORE sort key: `names`, else Intl's
//   English name), and `<span class="cc-item-code">XX</span>` after each name, XX read from the item's own link
//   (lib/marketing-country.ts COUNTRY_PATH_SEGMENTS).
//   cssAsBefore(css) — landing.css with world-countries-5's selector rules put back as they were: each hunk of commit 2d2a5e2e's change to
//   it (the wider box and the region buttons; 5 / 4 columns; the full-screen phone panel), read from git, replaced EXACTLY by the text
//   it replaced — throws when a hunk is not there, so every other byte is still compared.
const fs = require('fs'), path = require('path')
const REPO = path.resolve(__dirname, '..')
const MC = fs.readFileSync(path.join(REPO, 'lib/marketing-country.ts'), 'utf8')
const CODE_OF = Object.fromEntries([...MC.matchAll(/\b([A-Z]{2}): '([a-z-]+)'/g)].map(m => [m[2], m[1]]))
const { execFileSync } = require('child_process')
const CSS_FILE = 'app/(public)/(site)/landing/landing.css'
let HUNKS = null
const hunks = () => HUNKS ?? (HUNKS = execFileSync('git', ['diff', '-U0', '2d2a5e2e~1', '2d2a5e2e', '--', CSS_FILE], { cwd: REPO, encoding: 'utf8' })
  .split(/\n(?=@@ )/).slice(1).map(h => { const L = h.split('\n').slice(1); return { before: L.filter(l => l.startsWith('-')).map(l => l.slice(1)).join('\n'), after: L.filter(l => l.startsWith('+')).map(l => l.slice(1)).join('\n') } }))
function cssAsBefore(css) {
  let out = String(css)
  for (const h of hunks()) {
    if (!out.includes(h.after)) throw new Error('_lp-world-countries-5 cssAsBefore: a hunk of 2d2a5e2e is not in the file: ' + h.after.slice(0, 80))
    out = out.replace(h.after, () => h.before)
  }
  return out
}
const LANDED = /from '@\/lib\/country-regions'/.test(fs.readFileSync(path.join(REPO, 'components/landing/CountryMenu.tsx'), 'utf8'))

const withCode = li => li.replace(/(<a href="\/([a-z-]+)[^"]*" lang="[^"]+"(?: aria-current="true")? class="cc-item">[\s\S]*?<span class="cc-item-name">[^<]*<\/span>)(<span class="cc-item-tick">)/,
  (all, a, seg, tick) => { const code = CODE_OF[seg]; if (!code) throw new Error(`_lp-world-countries-5 asBefore: no code for /${seg}`); return `${a}<span class="cc-item-code">${code}</span>${tick}` })
const codeOfLi = li => CODE_OF[(/<a href="\/([a-z-]+)/.exec(li) || [])[1]]

/** `names`: { code: the row's English name } — the BEFORE list's sort key (CountryMenu sorted by it); Intl's English name otherwise.
 *  `label`: the list's aria-label (landingNav.country.menu) in the page's language — "Country" in English. */
// The list's label (landingNav.country.menu) in a page's locale: its own file, else its language's base, else en-GB.
const LOCALES_SRC = fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8')
const BASES = (/export const LANGUAGE_BASES[^=]*=\s*\[([^\]]*)\]/.exec(LOCALES_SRC) || [, ''])[1].match(/'[a-z]{2,3}-[A-Z]{2}'/g)?.map(x => x.slice(1, -1)) ?? []
const menuLabelOf = locale => {
  const read = l => { try { return JSON.parse(fs.readFileSync(path.join(REPO, `messages/${l}.json`), 'utf8')).landingNav?.country?.menu } catch { return undefined } }
  return (locale && read(locale)) ?? read(BASES.find(b => locale && b.split('-')[0] === locale.split('-')[0])) ?? read('en-GB')
}
function asBefore(html, { names = {}, label, locale } = {}) {
  if (!LANDED || !html.includes('class="cc-list"')) return html
  label = label ?? menuLabelOf(locale)
  const en = new Intl.DisplayNames(['en'], { type: 'region' })
  const nameOf = c => names[c] ?? en.of(c)
  // the region buttons (a tablist of plain buttons) go; every region's list becomes ONE list, in English-name order, as before
  const tabs = /<div class="cc-regions" role="tablist" aria-label="[^"]*">(?:<button [^>]*>[^<]*<\/button>)+<\/div>/
  const lists = /(?:<ul id="[^"]*-list"[^>]*class="cc-list">[\s\S]*?<\/ul>)+/
  const block = lists.exec(html)
  if (!block) throw new Error('_lp-world-countries-5 asBefore: no <ul id="…-list" class="cc-list"> anchor')
  const lis = block[0].match(/<li>[\s\S]*?<\/li>/g) || []
  const sorted = [...lis].sort((a, b) => nameOf(codeOfLi(a)).localeCompare(nameOf(codeOfLi(b)), 'en'))
  const one = `<ul class="cc-list" aria-label="${label}">${sorted.map(withCode).join('')}</ul>`
  return html.replace(tabs, '').replace(block[0], one)
}
/** pricing-copy-4's pc1After4 with world-countries-5's list markup put back first — for the harnesses that hash a page against a
 *  snapshot taken before both (faq-1…4, seo-geo-2, copy-truth-1). */
const pc1After4AsBefore = (html, locale, opts) => require('./_lp-pricing-copy-4.cjs').pc1After4(asBefore(html, { locale }), locale, opts)
module.exports = { LANDED, asBefore, cssAsBefore, pc1After4AsBefore }
