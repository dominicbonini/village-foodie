#!/usr/bin/env node
// scripts/country-picker-1.cjs — country-picker-1 (23 October 2026, docs/country-picker-1-report.md).
//   node scripts/country-picker-1.cjs          (NO NETWORK, NO DATABASE — the render kit and fixtures)
//
// The marketing footer's country picker, server-rendered by the REAL pages with the 36 fixture countries switched on:
//   1 · the trigger: flag + code + chevron, the LAST item of the footer's link row, labelled "Country: <name>" in the page's
//       language; no old dropdown (no role="menu", no menuitemradio, no `.cc-menu`), and no picker in the nav;
//   2 · the box, closed but IN THE HTML: role="dialog", aria-modal, labelled by its title; hidden by `.cc-dlg-closed`
//       (display:none); a real <a href="/<cc>"> for EVERY switched-on country, each its own-language name (Intl in the
//       row's locale), sorted by the English name, the current one marked; on every marketing page (landing, features,
//       compare) and on /de and /gr (the German / Greek title and subline);
//   3 · the two new message keys in every locale (en-GB + the 22 bases; the regional variants inherit), back-translated,
//       and translation-check at 0 structural; the × reuses `demoUpload.close`;
//   4 · the CSS: three columns, two on a phone, the box scrolls inside itself and never past the window;
//   5 · nothing else: hreflang and the sitemap are unchanged (the same entries as with the old picker).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'country-picker-1' })
const { REPO } = kit
const EF = require('./_europe-settings-fixtures.cjs')
const CP = require('./_country-picker-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const dec = s => String(s).replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')

;(async () => {
  const R = EF.renderer(kit, 'cp1')
  const rows = CP.ROWS()
  const L = await kit.bundle('cp1-lib', "export { flagDataUri } from '@/lib/flags'\nexport { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'")
  const SEG = L.COUNTRY_PATH_SEGMENTS
  const live = rows.filter(r => r.enabled && r.countryCode in SEG)
  const byEnglish = [...live].sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const own = r => new Intl.DisplayNames([r.locale], { type: 'region' }).of(r.countryCode)
  const footOf = html => (/<footer[\s\S]*<\/footer>/.exec(html) || [''])[0]
  const navOf = html => (/<nav[\s\S]*?<\/nav>/.exec(html) || [''])[0]
  const itemsOf = html => [...footOf(html).matchAll(/<a href="([^"]*)" lang="([^"]+)"( aria-current="true")? class="cc-item"><img class="cc-flag" src="data:image\/svg\+xml[^"]*" alt="" width="21" height="14"\/><span class="cc-item-name">([^<]*)<\/span><span class="cc-item-code">([A-Z]{2})<\/span>/g)]
    .map(m => ({ href: m[1], lang: m[2], current: !!m[3], name: dec(m[4]), code: m[5] }))

  t('the fixtures: 36 countries switched on, every one with a country address', live.length === 36 && rows.every(r => r.enabled), live.length)

  const pages = {}
  for (const [seg, page] of [['uk', 'landing'], ['uk', 'features'], ['uk', 'compare'], ['de', 'landing'], ['gr', 'landing'], ['us', 'features']]) {
    pages[`${seg}/${page}`] = await R.page(page, seg, rows)
  }

  head('1 · the trigger — flag + code, the last item of the footer link row; no old dropdown; nothing in the nav')
  for (const [k, P] of Object.entries(pages)) {
    const f = footOf(P.html)
    const row = (/<div class="foot-links">([\s\S]*?)<div class="cc-dlg/.exec(f) || [])[1] || ''
    const cc = live.find(r => SEG[r.countryCode] === k.split('/')[0]).countryCode
    t(`${k}: one trigger, after the row's last link, showing the flag and "${cc}" and a chevron`,
      (f.match(/class="cc-btn"/g) || []).length === 1 && /<a href="\/contact\?topic=General%20Enquiry">[^<]*<\/a><span class="cc cc-foot"><button type="button" class="cc-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="[^"]+"/.test(row)
      && new RegExp(`<img class="cc-flag" src="data:image/svg\\+xml[^"]*" alt="" width="21" height="14"/><span class="cc-code">${cc}</span><svg class="cc-chev"`).test(row))
    t(`${k}: no old dropdown (role="menu", menuitemradio, .cc-menu) and no picker in the nav`, !/role="menu"|menuitemradio|cc-menu/.test(P.html) && !/cc-btn|class="cc[ "]/.test(navOf(P.html)))
  }
  const label = k => (/class="cc-btn"[^>]*aria-label="([^"]+)"/.exec(pages[k].html) || [])[1]
  t('its label is "Country: <name>" in the page\'s language: "Country: United Kingdom. Change country", „Land: Deutschland. Land ändern“, «Χώρα: Ελλάδα. Αλλαγή χώρας»',
    label('uk/landing') === 'Country: United Kingdom. Change country' && label('de/landing') === 'Land: Deutschland. Land ändern' && label('gr/landing') === 'Χώρα: Ελλάδα. Αλλαγή χώρας', [label('uk/landing'), label('de/landing'), label('gr/landing')])

  head('2 · the box — in the closed page\'s HTML, a link for every switched-on country, own-language names, English order')
  for (const [k, P] of Object.entries(pages)) {
    const f = footOf(P.html)
    const items = itemsOf(P.html)
    const cc = live.find(r => SEG[r.countryCode] === k.split('/')[0]).countryCode
    t(`${k}: the closed box is in the HTML — class "cc-dlg cc-dlg-closed", role="dialog" aria-modal="true", labelled by its <h2>`,
      /<div class="cc-dlg cc-dlg-closed"><div id="([^"]+)" role="dialog" aria-modal="true" aria-labelledby="([^"]+)" class="cc-box" tabindex="-1">/.test(f)
      && (() => { const m = /aria-controls="([^"]+)"[\s\S]*?<div id="([^"]+)" role="dialog" aria-modal="true" aria-labelledby="([^"]+)"[\s\S]*?<h2 id="([^"]+)" class="cc-title">/.exec(f); return !!m && m[1] === m[2] && m[3] === m[4] })())
    t(`${k}: ${items.length} country links — exactly the 36 switched-on countries, in English-name order, each <a href="/<cc>">`,
      items.map(i => i.code).join() === byEnglish.map(r => r.countryCode).join() && items.every(i => i.href === `/${SEG[i.code]}` || (k.endsWith('features') && i.href === `/${SEG[i.code]}/features`) || (k.endsWith('compare') && i.href === `/${SEG[i.code]}/compare`)),
      items.map(i => `${i.code}${i.href}`).join(' '))
    t(`${k}: each name is the country's own (Intl, its row's locale) and carries that lang; only ${cc} is marked current`,
      items.every(i => i.name === own(live.find(r => r.countryCode === i.code)) && i.lang === live.find(r => r.countryCode === i.code).locale) && items.filter(i => i.current).map(i => i.code).join() === cc)
  }
  const names = Object.fromEntries(itemsOf(pages['uk/landing'].html).map(i => [i.code, i.name]))
  t('own-language names, e.g. Deutschland, España, Ελλάδα, United Kingdom, Österreich, Schweiz, België, Κύπρος, България, Polska',
    names.DE === 'Deutschland' && names.ES === 'España' && names.GR === 'Ελλάδα' && names.GB === 'United Kingdom' && names.AT === 'Österreich' && names.CH === 'Schweiz' && names.BE === 'België' && names.CY === 'Κύπρος' && names.BG === 'България' && names.PL === 'Polska', names)
  // The render kit's pathname is '/', so its links are the landings; in the app usePathname() is the page's own address and
  // the same switchCountryPath call (unchanged) gives the same page in the chosen country.
  const MC = await kit.bundle('cp1-mc', "export { switchCountryPath, countryPagePath } from '@/lib/marketing-country'")
  t('on /uk/features and /uk/compare a country links to the same page there (switchCountryPath, unchanged): /de/features, /gr/compare',
    MC.switchCountryPath('/uk/features', 'DE') === '/de/features' && MC.switchCountryPath('/uk/compare', 'GR') === '/gr/compare' && /const hrefOf = \(code: string\) => switchCountryPath\(pathname, code\) \?\? countryPagePath\(code, 'landing'\) \?\? undefined/.test(read('components/landing/CountryMenu.tsx')))
  const words = k => { const f = footOf(pages[k].html); return [(/class="cc-title">([^<]*)</.exec(f) || [])[1], (/class="cc-sub">([^<]*)</.exec(f) || [])[1], (/class="cc-x" aria-label="([^"]*)"/.exec(f) || [])[1]].map(dec) }
  t('the title, subline and × in the page\'s language — English, German, Greek', JSON.stringify(words('uk/landing')) === JSON.stringify(['Choose your country', 'Prices, language and settings change to match.', 'Close'])
    && JSON.stringify(words('de/landing')) === JSON.stringify(['Wählen Sie Ihr Land', 'Preise, Sprache und Einstellungen passen sich entsprechend an.', 'Schließen'])
    && JSON.stringify(words('gr/landing')) === JSON.stringify(['Επιλέξτε τη χώρα σας', 'Οι τιμές, η γλώσσα και οι ρυθμίσεις προσαρμόζονται ανάλογα.', 'Κλείσιμο']), [words('uk/landing'), words('de/landing'), words('gr/landing')])
  // A switched-off country is never linked: France off → no /fr link.
  const off = await R.page('landing', 'uk', rows.map(r => (r.countryCode === 'FR' ? { ...r, enabled: false } : r)))
  t('a switched-off country is not listed (France off → 35 links, no /fr)', itemsOf(off.html).length === 35 && !itemsOf(off.html).some(i => i.href === '/fr'))

  head('3 · the two message keys — every locale, back-translated, 0 structural; the × reuses demoUpload.close')
  const LOC = read('lib/i18n/locales.ts')
  const BASES = JSON.parse('[' + /export const LANGUAGE_BASES: readonly AppLocale\[\] = \[([^\]]*)\]/.exec(LOC)[1].replace(/'/g, '"') + ']')
  const EN = JSON.parse(read('messages/en-GB.json')).landingNav.country
  t('en-GB: landingNav.country.title "Choose your country", .subline "Prices, language and settings change to match."', EN.title === 'Choose your country' && EN.subline === 'Prices, language and settings change to match.')
  const missing = BASES.filter(l => { const c = JSON.parse(read(`messages/${l}.json`)).landingNav.country; const b = JSON.parse(read(`docs/i18n/back/${l}.json`)); return !c.title || !c.subline || c.title === EN.title || !b['landingNav.country.title'] || !b['landingNav.country.subline'] })
  t(`all ${BASES.length} non-English bases carry both, translated, with back-translations`, BASES.length === 22 && missing.length === 0, missing)
  const structural = BASES.concat(['de-AT', 'de-CH', 'de-LI', 'nl-BE', 'el-CY', 'fr-LU']).map(l => { const r = spawnSync(process.execPath, ['scripts/translation-check.cjs', '--locale', l], { cwd: REPO, encoding: 'utf8' }); return [l, /\*\*Structural: 0\*\*/.test(r.stdout)] }).filter(([, ok]) => !ok).map(([l]) => l)
  t('translation-check: 0 structural for every base and regional variant', structural.length === 0, structural)
  const src = read('components/landing/CountryMenu.tsx')
  t('the × is labelled by demoUpload.close (no third key)', /useT\('demoUpload'\)/.test(src) && /aria-label=\{tClose\('close'\)\}/.test(src))

  head('4 · the CSS — three columns, two on a phone; the box scrolls inside itself, never past the window')
  const css = read('app/landing/landing.css')
  t('closed = display:none; the box is fixed over a dimmed page; max-height the window, scrolling inside', /\.hg-landing \.cc-dlg-closed \{ display: none; \}/.test(css) && /\.hg-landing \.cc-dlg \{ position: fixed; inset: 0;[^}]*background: rgba\(/.test(css)
    && /\.hg-landing \.cc-box \{[^}]*max-height: calc\(100dvh - 32px\); overflow-y: auto;/.test(css))
  t('three columns; at ≤720px two, the code hidden, 44px rows, and the trigger on its own centred line', /\.hg-landing \.cc-list \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/.test(css)
    && /@media\(max-width:720px\)\{[^@]*\.cc-list \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[^@]*\.cc-item-code \{ display: none; \}/.test(css) && /\.foot-links \.cc \{ grid-column: 1 \/ -1; \}/.test(css))
  t('the old dropdown\'s rules are gone (.cc-menu, .cc-menu-closed)', !/\.cc-menu/.test(css))

  head('5 · hreflang and the sitemap — unchanged')
  const alt = pages['uk/landing'].meta?.alternates?.languages || {}
  t('/uk hreflang: one entry per switched-on country (36) plus x-default', Object.keys(alt).length === 37 && alt['x-default'], Object.keys(alt).length)
  const sm = (await R.sitemap(rows)).map(e => e.url)
  t('sitemap: every switched-on country\'s landing and features page (as before; the picker never fed it)', live.every(r => ['', '/features'].every(p => sm.includes(`https://www.hatchgrab.com/${SEG[r.countryCode]}${p}`))))

  console.log(`\n${fail ? '🔴' : '✅'} country-picker-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
