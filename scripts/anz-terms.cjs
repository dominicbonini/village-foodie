// scripts/anz-terms.cjs — the Australia and New Zealand sections of the Country-specific terms (22 October 2026,
// docs/anz-terms-report.md).
//
// Against scripts/fixtures/country-terms-before-anz.md (the page as ireland-3 left it, copied before this change) and the
// Terms of Service and Privacy Policy at 7fcd4fc9, it proves:
//   1. the page is BEFORE byte for byte up to `## Australia` — the intro, the United States and Ireland sections — with
//      only the "Last updated" line moved to 22 October 2026; then Australia, then New Zealand; the Terms of Service and
//      the Privacy Policy are byte-identical;
//   2. each new section has the US / Ireland shape ("For food truck operators", then "Privacy, for everyone in …"), every
//      paragraph a bold label, UK spelling, and carries the points the brief asked for;
//   3. no "[FLAG" anywhere in content/legal;
//   4. lib/legal.ts: COUNTRY_TERMS_UPDATED and TERMS_VERSION moved together to 22 October 2026; nothing else;
//   5. what the sections say the product does is what it does (eftpos notice on AUD checkouts, the ANZ allergen names,
//      card mode allowed outside Ireland, no surcharge, tax-inclusive prices with no rate box);
//   6. the page renders through the real renderer: BEFORE's HTML with the date moved, then the two sections, headings in order.
// Reads files and git only; no database, no network.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'anz-terms' })
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const atRef = (ref, f) => execFileSync('git', ['show', `${ref}:${f}`], { cwd: REPO, encoding: 'utf8' })
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : ''}`) } }
const paras = s => s.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

const FILE = 'content/legal/country-specific-terms.md'
const DATE = '22 October 2026', VERSION = '2026-10-22'
const OLD_LINE = '**Last updated:** 21 October 2026', NEW_LINE = `**Last updated:** ${DATE}`

;(async () => {
  // ── 1 · BEFORE + the two sections ──
  console.log(`\n── ${FILE}`)
  const B = read('scripts/fixtures/country-terms-before-anz.md'), A = read(FILE)
  const au = A.indexOf('\n## Australia\n'), nz = A.indexOf('\n## New Zealand\n')
  t('the fixture is the page ireland-3 published: dated 21 October 2026, United States then Ireland, ending with Ireland\'s contact line',
    B.includes(OLD_LINE) && JSON.stringify([...B.matchAll(/^## (.+)$/gm)].map(m => m[1])) === JSON.stringify(['United States', 'Ireland']) && B.endsWith('Wickham Street, CB8 8PD, United Kingdom.\n'))
  t('`## Australia` follows Ireland and `## New Zealand` follows Australia, each once', au > A.indexOf('\n## Ireland\n') && nz > au && A.split('\n## Australia\n').length === 2 && A.split('\n## New Zealand\n').length === 2)
  t(`everything before \`## Australia\` is BEFORE byte for byte, with only the "Last updated" line moved to ${DATE}`, A.slice(0, au) === B.replace(OLD_LINE, NEW_LINE), `${au} vs ${B.length} bytes`)
  const sec = (s, h, next) => { const i = s.indexOf(`## ${h}`); const j = next ? s.indexOf(`\n## ${next}`, i) : s.length; return s.slice(i, j) }
  t(`the United States section is byte-identical (${sec(B, 'United States', 'Ireland').length} bytes)`, sec(A, 'United States', 'Ireland') === sec(B, 'United States', 'Ireland'))
  t(`the Ireland section is byte-identical (${sec(B, 'Ireland').length} bytes)`, sec(A, 'Ireland', 'Australia') === sec(B, 'Ireland'))
  for (const f of ['content/legal/terms-and-conditions.md', 'content/legal/privacy-policy.md']) t(`${f} is byte-identical (7fcd4fc9)`, read(f) === atRef('7fcd4fc9', f))
  t('the file ends with one newline, after New Zealand\'s contact line', A.endsWith('Wickham Street, CB8 8PD, United Kingdom.\n') && !A.endsWith('\n\n'))

  // ── 2 · the shape and the points ──
  console.log('\n── the Australia and New Zealand sections')
  // ⚠️ RE-PINNED (canada-2, 22 October 2026): Canada follows New Zealand, so New Zealand ends at `## Canada` (scripts/canada-2.cjs
  // proves everything before `## Canada` is the page anz-terms published, byte for byte).
  const caAt = A.indexOf('\n## Canada\n')
  const AU = A.slice(au + 1, nz), NZ = A.slice(nz + 1, caAt === -1 ? A.length : caAt + 1)
  for (const [name, s] of [['Australia', AU], ['New Zealand', NZ]]) {
    const heads = [...s.matchAll(/^#{2,3} (.+)$/gm)].map(m => m[1])
    t(`${name}: the US / Ireland shape — "## ${name}", "### For food truck operators", "### Privacy, for everyone in ${name}"`, JSON.stringify(heads) === JSON.stringify([name, 'For food truck operators', `Privacy, for everyone in ${name}`]), heads)
    const body = paras(s).filter(p => !p.startsWith('#'))
    t(`${name}: every paragraph opens with a bold label, as the other sections do (${body.length})`, body.every(p => /^\*\*[^*]+\.\*\* /.test(p)), body.filter(p => !/^\*\*[^*]+\.\*\* /.test(p)).map(p => p.slice(0, 60)))
    t(`${name}: UK spelling (no -ize / -yze, "license", "honor", "behavior", "program ")`, !/\w(?:iz|yz)(?:e|es|ed|ing|ation)\b|\blicense\b|\bhonor|\bbehavior|\bcenter\b|\bprogram\b/.test(s), s.match(/\w(?:iz|yz)(?:e|es|ed|ing|ation)\b|\blicense\b|\bhonor\w*|\bbehavior\w*/g))
    t(`${name}: the plain-English labels the Ireland section uses (seller, card payments, allergens, prices, our prices, rights, customers' data, notices; then the law, where kept, notes, requests, complaints, marketing, contact)`,
      ['You are the seller.', 'Card payments.', 'Allergens.', 'Our prices.', 'Your rights under local law.', "Your customers' data.", 'Notices and governing law.', 'The law that applies.', 'Allergy and dietary notes.', 'Your requests.', 'Complaints.', 'Marketing emails.', 'Contact.'].every(l => s.includes(`**${l}**`)))
  }
  const has = (s, list) => list.filter(x => !s.includes(x))
  const auPoints = ['the merchant of record', 'Australian Consumer Law', 'consumer guarantees', 'single total figure', 'ABN or ACN', 'over $75 (excluding GST)', 'within 7 days',
    '1 October 2026', 'eftpos, Mastercard or Visa', 'HatchGrab does not add a card surcharge', 'Australian dollars', 'either network',
    'Australia New Zealand Food Standards Code', 'Standard 1.2.3', 'displayed with the food or given to your customer on request', 'show your allergen card',
    'including any GST', 'is not registered for GST', 'give us your ABN', 'reverse charge', 'cannot be excluded, restricted or modified',
    'Australian Privacy Principles in the Privacy Act 1988', 'Office of the Australian Information Commissioner (OAIC)', 'www.oaic.gov.au', 'within 30 days', 'England and Wales']
  t(`Australia carries every point the brief asked for (${auPoints.length})`, has(AU, auPoints).length === 0, has(AU, auPoints))
  const nzPoints = ['the merchant of record', 'in trade', 'Fair Trading Act 1986', 'Consumer Guarantees Act 1993', 'cannot contract out of when you sell to consumers', 'New Zealand dollars',
    'HatchGrab does not add a card surcharge', 'Standard 1.2.3', 'on your menu, or given to your customer on request', 'show your allergen card', 'including any GST',
    'is not registered for GST in New Zealand', 'GST number', 'NZBN', 'reverse charge', 'does not apply to HatchGrab\'s service to you', 'fair and reasonable',
    'Privacy Act 2020', 'carry on business in New Zealand', 'within 20 working days', 'www.privacy.org.nz', '0800 803 909', 'PO Box 10 094, Wellington 6140',
    'serious harm', 'as soon as practicable', 'England and Wales']
  t(`New Zealand carries every point the brief asked for (${nzPoints.length})`, has(NZ, nzPoints).length === 0, has(NZ, nzPoints))
  t('New Zealand makes no surcharge-ban claim (no ban is in force there on 22 October 2026)', !/1 October 2026|surcharges? (?:are|is) (?:banned|not allowed)|no longer allow/.test(NZ))
  t('neither section relies on the Privacy Act 1988 small business exemption', !/small business/i.test(AU + NZ))

  // ── 3 · no flag ──
  const files = fs.readdirSync(path.join(REPO, 'content/legal'))
  t(`no "[FLAG" in any of content/legal's ${files.length} files`, files.length >= 3 && files.every(f => !read(`content/legal/${f}`).includes('[FLAG')))

  // ── 4 · the dates ──
  console.log('\n── lib/legal.ts')
  const L = read('lib/legal.ts')
  t(`COUNTRY_TERMS_UPDATED = '${DATE}' and the page's line agree`, L.includes(`export const COUNTRY_TERMS_UPDATED = '${DATE}'`) && A.includes(NEW_LINE))
  t(`TERMS_VERSION = '${VERSION}' (was '2026-10-21'), the latest of the three documents' dates`, L.includes(`export const TERMS_VERSION = '${VERSION}'`))
  t('PRIVACY_UPDATED and TERMS_UPDATED unchanged (19 and 20 October 2026)', L.includes("export const PRIVACY_UPDATED = '19 October 2026'") && L.includes("export const TERMS_UPDATED = '20 October 2026'"))

  // ── 5 · the product does what the sections say ──
  console.log('\n── what the sections say the product does')
  const order = read('app/trucks/[slug]/order/page.tsx'), cur = read('lib/currencies.ts'), msgs = JSON.parse(read('messages/en-GB.json'))
  t('AUD checkouts show the dual-network notice (registry eftposNotice, AUD only) — "might be processed through either network"',
    /\{ code: 'AUD',[^}]*eftposNotice: true \}/.test(cur) && (cur.match(/eftposNotice: true/g) || []).length === 1 && /currencyInfo\(truck\?\.money\?\.currency\)\?\.eftposNotice &&/.test(order) && /processed through either network/.test(msgs.order.dualNetworkNotice))
  const allergens = read('lib/allergens.ts')
  t('the ANZ allergen list uses the Code\'s names (Milk, Egg, Peanut, Wheat, Crustacean, Mollusc, Lupin, Sesame, Soy, Fish, Added sulphites)', ['Milk', 'Egg', 'Peanut', 'Wheat', 'Crustacean', 'Mollusc', 'Lupin', 'Sesame', 'Soy', 'Fish', 'Added sulphites'].every(n => allergens.includes(`'${n}'`)))
  const mig = read('supabase/migrations/20261029_allergen_card_only.sql')
  t('an allergen card on its own is allowed by default and switched off only for Ireland (AU and NZ keep card, per dish or both)', /allergen_card_only_allowed boolean not null default true/.test(mig) && /allergen_card_only_allowed = false[\s\S]*country_code = 'IE'/.test(mig) && !/country_code = '(AU|NZ)'/.test(mig))
  t('no card surcharge is ever added: the order rules hold `surcharge: null` for every country', /surcharge: null,/.test(read('lib/order-charge-rules.ts')))
  // ⚠️ RE-PINNED (france-1, 22 October 2026): a tax-inclusive country whose address FORMAT names an included tax (France's TVA,
  // `includedTax`) takes a rate that is only worded on receipts, never added; AU and NZ's formats name none, so for them it is
  // exactly as before — no rate box, no rate, no tax line.
  t('a tax-inclusive country has no tax rate box (charges_rate_not_here) and adds no tax line (taxRateMilli null) — unless its format names an included tax (France); AU / NZ name none',
    /if \(c\.pricesIncludeTax && !includedTaxOf\(c\.addressFormat\)\) return refusal\('charges_rate_not_here'\)/.test(read('lib/charge-settings.ts'))
    && /const taxRateMilli = taxInclusive \? \(includedTax \? \(int\(truck\.tax_rate_milli\) \?\? includedTax\.milli\) : null\) :/.test(read('lib/order-charge-rules.ts'))
    && !/includedTax/.test(read('lib/address-formats.ts').slice(read('lib/address-formats.ts').indexOf('  au: {'), read('lib/address-formats.ts').indexOf('  ca: {'))))

  // ── 6 · the rendered page ──
  console.log('\n── /country-terms, through the real renderer')
  const R = await kit.bundle('anzt-md-html', "export { renderLegalMarkdownHtml } from '@/lib/legal-markdown-html'")
  const hA = R.renderLegalMarkdownHtml(A), hB = R.renderLegalMarkdownHtml(B)
  t('the page\'s HTML is BEFORE\'s with the date moved, then Australia\'s and New Zealand\'s (then any later country\'s)', hA.startsWith(hB.replace('21 October 2026', DATE) + R.renderLegalMarkdownHtml(AU) + R.renderLegalMarkdownHtml(NZ)))
  t('the four country headings render in order: United States, Ireland, Australia, New Zealand', /<h2[^>]*>United States<\/h2>[\s\S]*<h2[^>]*>Ireland<\/h2>[\s\S]*<h2[^>]*>Australia<\/h2>[\s\S]*<h2[^>]*>New Zealand<\/h2>/.test(hA))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
