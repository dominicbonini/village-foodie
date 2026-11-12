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
const fs = require('fs'), path = require('path')
const REPO = path.resolve(__dirname, '..')
const MC = fs.readFileSync(path.join(REPO, 'lib/marketing-country.ts'), 'utf8')
const CODE_OF = Object.fromEntries([...MC.matchAll(/\b([A-Z]{2}): '([a-z-]+)'/g)].map(m => [m[2], m[1]]))
const LANDED = /from '@\/lib\/country-regions'/.test(fs.readFileSync(path.join(REPO, 'components/landing/CountryMenu.tsx'), 'utf8'))

const withCode = li => li.replace(/(<a href="\/([a-z-]+)[^"]*" lang="[^"]+"(?: aria-current="true")? class="cc-item">[\s\S]*?<span class="cc-item-name">[^<]*<\/span>)(<span class="cc-item-tick">)/,
  (all, a, seg, tick) => { const code = CODE_OF[seg]; if (!code) throw new Error(`_lp-world-countries-5 asBefore: no code for /${seg}`); return `${a}<span class="cc-item-code">${code}</span>${tick}` })
const codeOfLi = li => CODE_OF[(/<a href="\/([a-z-]+)/.exec(li) || [])[1]]

/** `names`: { code: the row's English name } — the BEFORE list's sort key (CountryMenu sorted by it); Intl's English name otherwise.
 *  `label`: the list's aria-label (landingNav.country.menu) in the page's language — "Country" in English. */
function asBefore(html, { names = {}, label = 'Country' } = {}) {
  if (!LANDED || !html.includes('class="cc-list"')) return html
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
module.exports = { LANDED, asBefore }
