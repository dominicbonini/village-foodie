// scripts/native-prices.cjs — A COUNTRY'S OWN PAGES SHOW OUR PRICES THE WAY LOCALS WRITE THEM (native-prices, 22 October
// 2026, docs/native-prices-report.md; decided by Dominic on 21 Oct).
//
// LOCALHOST ONLY: fixture rows and catalogue (scripts/_native-prices-fixtures.cjs), the real pages, PDF, /llms.txt and admin
// page rendered by the render kit. Nothing reaches a database or the network. Checks:
//   1  AU / NZ and the CA / SE fixtures — landing, /features, /compare: the HOME form ("$39", "$49", "$39", "29 kr"), no
//      international symbol, and ONE currency line ("Prices in New Zealand dollars (NZD)") before the first price;
//   2  GB / US / IE — no currency line anywhere (their output is otherwise compared byte for byte in the report's snapshot);
//   3  THE PLANS PDF — home form, and the line once, in the small print, where the symbol is shared;
//   4  THE SIDE-BY-SIDE PLACES KEEP THE INTERNATIONAL FORM — /llms.txt (A$39, NZ$49) and Admin's plan matrix, rendered;
//   5  BILLING — the shared plan table in the home form; the footnote line once; the van label and plan prompts read the
//      same format; a truck's own money (menu, orders) is untouched;
//   6  THE RULE IS DATA — no `planLocale` left; the international form is used only where currencies sit side by side.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'native-prices' })
const { REPO, h } = kit
const NP = require('./_native-prices-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const text = s => String(s).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
const count = (s, sub) => s.split(sub).length - 1
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const LINE = { AU: 'Prices in Australian dollars (AUD)', NZ: 'Prices in New Zealand dollars (NZD)', CA: 'Prices in Canadian dollars (CAD)', SE: 'Prices in Swedish kronor (SEK)' }
/** The plan prices each country's cards show (fixture catalogue): Pro and Unlimited, in the home form. */
const HOME = { AU: ['$39', '$99'], NZ: ['$49', '$119'], CA: ['$39', '$99'], SE: ['29 kr', '79 kr'] }
/** Any amount written in an international form: A$39, NZ$49, CA$39, US$29, SEK 29. */
const INTL_AMOUNT = /\b(?:A|NZ|CA|US)\$\s?\d|\bSEK\s?\d/

;(async () => {
  const R = NP.renderer(kit, REPO, 'np')

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · AU, NZ (live) and CA, SE (fixtures) — the home form, and one line naming the currency')
  const pages = {}
  for (const cc of ['GB', 'US', 'IE', 'AU', 'NZ', 'CA', 'SE']) for (const p of ['landing', 'features', 'compare']) pages[`${cc}|${p}`] = await R.page(p, cc)
  for (const cc of ['AU', 'NZ', 'CA', 'SE']) for (const p of ['landing', 'features', 'compare']) {
    const { html } = pages[`${cc}|${p}`], tx = text(html)
    const want = p === 'compare' ? [cc === 'SE' ? '2 500 kr' : '$2,500'] : HOME[cc]
    t(`${cc} /${p}: ${want.join(', ')} in the home form, no international amount (A$, NZ$, CA$, SEK …)`, want.every(w => tx.includes(w)) && !INTL_AMOUNT.test(tx), { want, intl: tx.match(new RegExp(INTL_AMOUNT.source, 'g'))?.slice(0, 5) })
    const firstPrice = tx.search(cc === 'SE' ? /\d[\d ,]* kr\b/ : /\$\d/)
    t(`${cc} /${p}: "${LINE[cc]}" exactly once, before the first price`, count(tx, LINE[cc]) === 1 && count(tx, 'Prices in ') === 1 && tx.indexOf(LINE[cc]) < firstPrice, { at: tx.indexOf(LINE[cc]), firstPrice })
  }
  const land = pages['NZ|landing'].html
  t('landing: the line is the `.price-currency` paragraph straight before the cards (`.plans`) — the approved mockup', /<p class="price-currency">Prices in New Zealand dollars \(NZD\)<\/p><div class="plans">/.test(land))
  t('/features: the same paragraph straight before the plan table', /<p class="price-currency">Prices in New Zealand dollars \(NZD\)<\/p>/.test(pages['NZ|features'].html) && pages['NZ|features'].html.indexOf('price-currency') < pages['NZ|features'].html.indexOf('pt-'))
  t('/compare: a small muted line under the intro, before the first question', /<p class="mt-3 text-sm text-slate-500">Prices in New Zealand dollars \(NZD\)<\/p>/.test(pages['NZ|compare'].html)
    && pages['NZ|compare'].html.indexOf('Prices in New Zealand') > pages['NZ|compare'].html.indexOf(JSON.parse(read('messages/en-GB.json')).compare.intro.slice(0, 20))
    && pages['NZ|compare'].html.indexOf('Prices in New Zealand') < pages['NZ|compare'].html.indexOf(JSON.parse(read('messages/en-GB.json')).compare.system.title.replace(/<[^>]+>/g, '').slice(0, 15)))
  const css = read('app/landing/landing.css')
  // ⚠️ RE-PINNED (native-prices follow-up, 22 October 2026, Dominic): the line is `--hero-grey` (#3E5472) so it passes AA —
  // declared on the rule itself at the hero's own value (the token is `.hero`-scoped), and the two must agree.
  const heroGrey = (/\.hg-landing \.hero \{ --hero-grey: (#[0-9A-Fa-f]{6});/.exec(css) || [])[1]
  t('landing.css: `.price-currency` is centred, small and in `--hero-grey` (the hero\'s #3E5472, 7.73:1 on white — AA); on a phone it keeps its place above the cards',
    !!heroGrey && new RegExp(`\\.hg-landing \\.price-currency \\{ --hero-grey: ${heroGrey}; text-align: center; font-size: \\.85rem; color: var\\(--hero-grey\\);`).test(css)
    && /\.hg-landing #pricing \.price-currency, \.hg-landing #pricing \.plans \{ order: 2; \}/.test(css), heroGrey)
  t('JSON-LD keeps the ISO codes (machine-readable): Offers priceCurrency AUD / NZD / CAD / SEK, prices as plain numbers', ['AU', 'NZ', 'CA', 'SE'].every(cc => pages[`${cc}|landing`].html.includes(`"priceCurrency":"${({ AU: 'AUD', NZ: 'NZD', CA: 'CAD', SE: 'SEK' })[cc]}"`) && !/"price":"[^"]*[$£€]/.test(pages[`${cc}|landing`].html)))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · GB, US and IE — no line (their symbols name one currency each)')
  for (const cc of ['GB', 'US', 'IE']) {
    const all = ['landing', 'features', 'compare'].map(p => pages[`${cc}|${p}`].html).join('')
    const sym = { GB: '£', US: '$', IE: '€' }[cc]
    t(`${cc}: no "Prices in …" line and no \`price-currency\` on landing, /features or /compare; prices in ${sym}`, !all.includes('Prices in ') && !all.includes('price-currency') && text(all).includes(sym + '0') && !INTL_AMOUNT.test(text(all)))
  }

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE PLANS PDF')
  for (const cc of ['AU', 'NZ', 'CA', 'SE']) {
    const pdf = await R.pdf(cc), tx = text(pdf)
    const fn = pdf.slice(pdf.indexOf('<div class="fn">'))
    t(`${cc} PDF: ${HOME[cc].join(', ')}; no international amount; the line once, opening the small print`, HOME[cc].every(w => tx.includes(w)) && !INTL_AMOUNT.test(tx) && count(pdf, LINE[cc]) === 1
      && fn.includes(`<p>${LINE[cc]}</p><p>`), { intl: tx.match(new RegExp(INTL_AMOUNT.source, 'g'))?.slice(0, 4), line: count(pdf, LINE[cc]) })
  }
  for (const cc of ['GB', 'US', 'IE']) t(`${cc} PDF: no currency line`, !(await R.pdf(cc)).includes('Prices in '))

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · THE SIDE-BY-SIDE PLACES KEEP THE INTERNATIONAL FORM — /llms.txt and Admin')
  const llms = await R.llms(['GB', 'US', 'IE', 'AU', 'NZ'])
  const section = name => { const i = llms.indexOf(`### ${name}`); return llms.slice(i, llms.indexOf('\n### ', i + 4) === -1 ? llms.indexOf('\n## ', i) : llms.indexOf('\n### ', i + 4)) }
  t('/llms.txt: Australia A$39 / A$99, New Zealand NZ$49 / NZ$119 — no bare "$" amount in either section', section('Australia').includes('A$39') && section('Australia').includes('A$99') && section('New Zealand').includes('NZ$49') && section('New Zealand').includes('NZ$119')
    && !/(?<![A-Z])\$\d/.test(section('Australia') + section('New Zealand')), [section('Australia').slice(0, 200), section('New Zealand').slice(0, 200)])
  t('/llms.txt: the UK £, the US $, Ireland €; no currency line (one document, every country — each price names itself)', /£29/.test(section('United Kingdom')) && /(?<![A-Z])\$\d/.test(section('United States')) && /€29/.test(section('Ireland')) && !llms.includes('Prices in '))

  // Admin › Plans (the catalogue table, "features" tab), the real page with the five countries' settings pre-loaded.
  const A = 'app/admin/page.tsx'
  const settingsOf = Object.fromEntries(await Promise.all(['GB', 'US', 'IE', 'AU', 'NZ'].map(async cc => [cc, await R.rowOf(cc)])))
  const adminText = async (tag, extra = []) => {
    const M = await R.ctx.bundle(tag, "export { default as AdminPage } from '@/app/admin/page'", {
      define: { 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"' },
      patches: [
        { file: A, from: 'const [checkingSession, setCheckingSession] = useState(true)', to: 'const [checkingSession, setCheckingSession] = useState(false)' },
        { file: A, from: "const [adminTab, setAdminTab] = useState<AdminTab>('trucks')", to: "const [adminTab, setAdminTab] = useState<AdminTab>('features')" },
        { file: A, from: 'const [countrySettings, setCountrySettings] = useState<Record<string, CountrySettings>>({})', to: `const [countrySettings, setCountrySettings] = useState<Record<string, CountrySettings>>(${JSON.stringify(settingsOf)} as any)` },
        { file: A, from: 'const [plans, setPlans] = useState<PlanCatalog>({ plans: [], prices: [], features: [] })', to: `const [plans, setPlans] = useState<PlanCatalog>(${JSON.stringify(R.catalog)} as any)` },
        ...extra,
      ],
    })
    return text(kit.renderStatic(h(M.AdminPage)))
  }
  const adm = await adminText('np-admin')
  t('Admin › Plans: Australia A$39 / A$99 and New Zealand NZ$49 / NZ$119, beside £29, €29 and the US "$"', ['A$39', 'A$99', 'NZ$49', 'NZ$119', '£29', '€29'].every(w => adm.includes(w)), adm.match(/(?:[A-Z]{1,2})?[$£€]\d[\d,.]*/g)?.slice(0, 30))
  // The same page with the table on each country's OWN format (what it printed before): only Australia's and New Zealand's
  // amounts may differ, and only by their prefix — GB, US and IE cells are identical.
  const admOwn = await adminText('np-admin-own', [{ file: A, from: 'return cs ? formatAmount(minor, intlMoneyFormatOf(cs)) : \'—\'', to: 'return cs ? formatAmount(minor, moneyFormatOf(cs)) : \'—\'' }])
  t('Admin: every other figure on the tab is what the country\'s own format printed (only A$ / NZ$ prefixes differ)', adm.replace(/(?:A|NZ)\$/g, '$') === admOwn && adm !== admOwn)

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · BILLING, THE VAN MODAL AND THE PLAN PROMPTS — the home form; a truck\'s own money untouched')
  const PT = await R.ctx.bundle('np-pt', "export { PlanTable } from '@/components/pricing/PlanTable'")
  for (const cc of ['AU', 'NZ']) {
    const tx = text(kit.renderStatic(h(PT.PlanTable, { catalog: R.catalog, settings: await R.rowOf(cc), highlight: 'pro' })))
    t(`Billing's plan table (${cc}): ${HOME[cc].join(', ')}, no international amount, and no line inside the table itself`, HOME[cc].every(w => tx.includes(w)) && !INTL_AMOUNT.test(tx) && !tx.includes('Prices in '))
  }
  const manage = code('app/manage/[token]/page.tsx')
  t('Billing: the line once, opening the footnotes under the table (currencyLineOf → pricing.currencyLine), in the footnote style',
    /const billingCurrencyLine = currencyLineOf\(countryRow\)/.test(manage) && count(manage, "tPricing('currencyLine', billingCurrencyLine)") === 1
    && /\{billingCurrencyLine && <p className="text-xs text-slate-500 mt-3 px-1">\{tPricing\('currencyLine', billingCurrencyLine\)\}<\/p>\}\s*<p className="text-xs text-slate-500 mt-3 px-1">\{tPricing\('footnote'/.test(manage))
  t('Billing\'s card price, the van modal\'s add-on price and the plan prompts read planMoneyFormatOf (the home form)',
    /const cardMoney = planMoneyFormatOf\(countryRow\)/.test(manage) && /perMonthLabel\(vanAddonMinor, planMoneyFormatOf\(vanSettings\), unit\)/.test(manage) && /perMonthLabel\(minor, planMoneyFormatOf\(cs\), unit\)/.test(code('components/usePlanPriceLabel.ts')))
  const L = await R.ctx.bundle('np-money', "export * from '@/lib/money-format'\nexport { moneyFormatOf, planMoneyFormatOf } from '@/lib/country-settings-types'")
  const au = await R.rowOf('AU'), nz = await R.rowOf('NZ')
  t('a truck\'s own money is the same format as our plan prices on its pages now — "$12.00" (AU menu), "$1,234.56" (NZ order) — and moneyFormatOf is unchanged',
    L.formatMinor(1200, L.moneyFormatOf(au)) === '$12.00' && L.formatMinor(123456, L.moneyFormatOf(nz)) === '$1,234.56' && JSON.stringify(L.moneyFormatOf(au)) === '{"currency":"AUD","locale":"en-AU"}'
    && JSON.stringify(L.planMoneyFormatOf(au)) === JSON.stringify(L.moneyFormatOf(au)))
  t('the order page and receipts still format through moneyFormatOf / the truck\'s money, never the plan helpers', !/planMoneyFormatOf|intlMoneyFormatOf/.test(read('app/trucks/[slug]/order/page.tsx')))

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · THE RULE IS DATA — one helper per form, each used where it belongs')
  const src = ['app', 'components', 'lib'].flatMap(function walk(d) {
    return fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : [])
  })
  const using = name => src.filter(f => new RegExp(`\\b${name}\\(`).test(code(f))).sort()
  t('no `planLocale` is read anywhere (the registry field is retired)', src.every(f => !/planLocale/.test(code(f))), src.filter(f => /planLocale/.test(code(f))))
  t('the international form (intlMoneyFormatOf) is used only by /llms.txt and Admin', JSON.stringify(using('intlMoneyFormatOf').filter(f => f !== 'lib/country-settings-types.ts')) === JSON.stringify(['app/admin/page.tsx', 'lib/llms-text.ts']), using('intlMoneyFormatOf'))
  t('the home form (planMoneyFormatOf) is what every country page, the PDF, Billing and the plan prompts use — and not /llms.txt',
    ['app/compare/CostComparison.tsx', 'app/manage/[token]/page.tsx', 'components/pricing/PlanTable.tsx', 'components/pricing/PricingSection.tsx', 'components/usePlanPriceLabel.ts', 'lib/plans-pdf.ts'].every(f => using('planMoneyFormatOf').includes(f)) && !using('planMoneyFormatOf').includes('lib/llms-text.ts'), using('planMoneyFormatOf'))
  const en = JSON.parse(read('messages/en-GB.json'))
  t('the line\'s words are a message (pricing.currencyLine, en-GB base), the currency\'s name and code its parameters', en.pricing.currencyLine === 'Prices in {currency} ({code})')

  console.log(`\n${fail ? '🔴' : '✅'} native-prices: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
