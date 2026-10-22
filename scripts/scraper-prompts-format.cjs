// scripts/scraper-prompts-format.cjs — the scraper's Pass B prompt reads the address format (address-formats-2 follow-up,
// 22 October 2026, docs/address-formats-2-report.md "Follow-up").
//
// scripts/scraper-prompts.js branched on `addressFormat === 'zip_state'`. address-formats-1's SQL stored the US as `us`,
// so from then on US trucks got the UK lines. Now buildHgPrompt takes its location lines from lib/address-formats.ts
// (`ai.scraper`), imported directly. Against scripts/fixtures/scraper-prompts-before.json (the prompts the file at
// 7fcd4fc9 built, written once by scripts/_scraper-prompts-capture.mjs) it proves:
//   1. GB is byte-identical: 'postcode', 'gb', no format and an unknown one, as before;
//   2. the US prompt ('us', and the legacy 'zip_state') is byte-identical to what 'zip_state' built before the SQL ran,
//      in both date orders — and the prompt the live US row got after the SQL ('us') was the UK one;
//   3. IE / AU / NZ / CA get their own lines and nothing of the UK's, asking only for keys the scraper sends on;
//   4. the one other difference: an mdy date order adds the month-first line whatever the format (only the US is mdy);
//   5. no format value is named in scripts/scraper-prompts.js, and plain Node loads it (the scraper's own runtime);
//   6. the config's validator covers the new slot (controls: an empty rule and a `${` are caught).
// Reads files and runs Node; no database, no network.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path'); const { execFileSync, spawnSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`) } }
const firstDiff = (a, b) => { if (a === b) return ''; let i = 0; while (i < a.length && a[i] === b[i]) i++; return `at ${i}: …${JSON.stringify(a.slice(Math.max(0, i - 40), i + 60))} vs …${JSON.stringify(b.slice(Math.max(0, i - 40), i + 60))}` }

const FIX = require('./fixtures/scraper-prompts-before.json')
const MDY = '\nDates written with numbers only are MONTH first: "10/12" is 12 October, so output "12/10".'
const DATE_LINE = 'Map day names to exact dates based on today.'

;(async () => {
  const F = await import(path.join(REPO, 'lib/address-formats.ts'))
  const { buildHgPrompt, buildPassARulePrompt, buildPassAEventPrompt } = await import(path.join(REPO, 'scripts/scraper-prompts.js'))
  const P = (fm, d) => buildHgPrompt({ ...FIX.input, ...(fm === '(none)' ? {} : { addressFormat: fm }), dateOrder: d })
  const B = k => FIX.prompts[k]
  t(`the fixture is the file at ${FIX.ref}: 20 prompts, and that file is still the one in git`, Object.keys(FIX.prompts).length === 20 && FIX.ref === '7fcd4fc9'
    && execFileSync('git', ['show', `${FIX.ref}:scripts/scraper-prompts.js`], { cwd: REPO, encoding: 'utf8' }).includes("if (addressFormat === 'zip_state') {"))

  // ── 1 · GB ──
  console.log('\n── 1 · GB: byte-identical')
  for (const fm of ['postcode', 'gb', '(none)', 'garbage']) t(`GB lines for ${fm === '(none)' ? 'no format' : `'${fm}'`} (dmy): byte-identical to before`, P(fm, 'dmy') === B('postcode|dmy') && B(`${fm}|dmy`) === B('postcode|dmy'), firstDiff(P(fm, 'dmy'), B('postcode|dmy')))
  t('Pass A (rules and events) unchanged: the same text from the same arguments', buildPassARulePrompt({ site: { name: 'H', instructions: 'x' }, cleanText: 'y', country: 'GB' }).includes('You are a Data Extraction Bot.') && /VILLAGE: Extract the town/.test(buildPassAEventPrompt({ site: { name: 'H' }, cleanText: 'y', country: 'GB' }).replace(/\*\*/g, '')))

  // ── 2 · US ──
  console.log('\n── 2 · US: what it built before address-formats-1\'s SQL ran')
  t("BEFORE this fix, the live US row ('us', mdy) got the UK prompt — byte for byte GB's (the bug)", B('us|mdy') === B('postcode|dmy'))
  t("…while 'zip_state' (the US row before the SQL) had city / two-letter state / ZIP lines and the month-first line", /"state" = its two-letter state/.test(B('zip_state|mdy')) && B('zip_state|mdy').includes(MDY) && !B('zip_state|mdy').includes('A UK\nplace-name'))
  for (const d of ['mdy', 'dmy']) {
    t(`'us' (${d}) is byte-identical to 'zip_state' (${d}) before the SQL`, P('us', d) === B(`zip_state|${d}`), firstDiff(P('us', d), B(`zip_state|${d}`)))
    t(`the legacy 'zip_state' (${d}) still builds the same prompt`, P('zip_state', d) === B(`zip_state|${d}`))
  }
  t("the live US row ('us', mdy) no longer gets the UK lines", !P('us', 'mdy').includes('A UK\nplace-name') && !P('us', 'mdy').includes('Cavendish'))

  // ── 3 · the other formats ──
  console.log('\n── 3 · IE / AU / NZ / CA: their own lines')
  const gbRules = F.ADDRESS_FORMATS.gb.ai.scraper
  const asGb = (p, r) => p.replace(r.venueRules, gbRules.venueRules).replace(r.townRules, gbRules.townRules).replace(r.examples, gbRules.examples).replace(`"venue_name":"Name",${r.outputShape}}`, `"venue_name":"Name",${gbRules.outputShape}}`)
  const SENT_ON = ['town', 'state', 'postcode']   // scripts/run-scraper.js: village ← town, postcode, region ← state
  for (const k of ['ie', 'au', 'nz', 'ca']) {
    const f = F.ADDRESS_FORMATS[k], r = f.ai.scraper, p = P(k, 'dmy')
    t(`${k.toUpperCase()}: its own four rule parts are in the prompt, and nothing of the UK's`, [r.venueRules, r.townRules, r.examples].every(x => p.includes(x)) && !/A UK\nplace-name|Cavendish|Lidgate|Nethergate/.test(p))
    t(`${k.toUpperCase()}: everything else is GB's prompt, unchanged (header, dates, times, JSON frame, page text)`, asGb(p, r) === B('postcode|dmy'), firstDiff(asGb(p, r), B('postcode|dmy')))
    const keys = Object.keys(JSON.parse(`{${r.outputShape}}`))
    t(`${k.toUpperCase()}: asks only for keys the scraper sends on (${keys.join(', ')}), "state" exactly when the format has a region`, keys.every(x => SENT_ON.includes(x)) && keys.includes('town') && keys.includes('postcode') && keys.includes('state') === !!F.fieldOf(f, 'region'))
    t(`${k.toUpperCase()}: is not the GB prompt and not the US prompt`, p !== B('postcode|dmy') && p !== B('zip_state|dmy'))
    t(`${k.toUpperCase()}: each example line is valid JSON on the right of "->" with the same keys`, r.examples.split('\n').every(l => { const j = JSON.parse(l.split('->')[1]); return Object.keys(j).every(x => ['venue_name', ...SENT_ON].includes(x)) }))
  }
  t('IE names the Eircode and never asks for a UK postcode; AU the suburb (not the council); NZ the town or city (not the suburb); CA the province',
    /Eircode/.test(P('ie', 'dmy')) && /never a UK postcode/.test(P('ie', 'dmy')) && /suburb it is in \(not the council\)/.test(P('au', 'dmy')) && /town or city it is in \(not the suburb\)/.test(P('nz', 'dmy')) && /province or territory/.test(P('ca', 'dmy')))
  const sc = read('scripts/run-scraper.js')
  t('the scraper still sends on exactly town → village, postcode, state → region (no suburb is read from Pass B)', sc.includes('village: e.town || null,') && sc.includes('postcode: e.postcode || null,') && sc.includes('...(e.state ? { region: e.state } : {}),') && !/e\.suburb/.test(sc))
  t('scripts/run-scraper.js is untouched (7fcd4fc9)', sc === execFileSync('git', ['show', '7fcd4fc9:scripts/run-scraper.js'], { cwd: REPO, encoding: 'utf8' }))

  // ── 4 · the month-first line ──
  console.log('\n── 4 · the month-first line follows the date order')
  for (const fm of ['postcode', 'gb', 'ie', 'au', 'nz', 'ca']) {
    const d = P(fm, 'dmy'), m = P(fm, 'mdy')
    t(`'${fm}' mdy = its dmy prompt plus the one month-first line after the date rules (before, only zip_state had it)`, m === d.replace(DATE_LINE, DATE_LINE + MDY) && m.split(MDY).length === 2)
  }

  // ── 5 · the source ──
  console.log('\n── 5 · scripts/scraper-prompts.js')
  const src = read('scripts/scraper-prompts.js'), code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const named = [...code.matchAll(/['"`](postcode|zip_state|gb|us|ie|au|nz|ca|GB|US|IE|AU|NZ|CA)['"`]/g)].map(m => m[0])
  t('no format value or country code is named in its code', named.length === 0, named)
  t('it imports the config itself (no copy of a rule): addressFormatOrDefault and DEFAULT_ADDRESS_FORMAT from ../lib/address-formats.ts', /^import \{ addressFormatOrDefault, DEFAULT_ADDRESS_FORMAT \} from '\.\.\/lib\/address-formats\.ts';$/m.test(src) && !/TOWN RULES|VENUE RULES|EXAMPLES \(embedded|UK/.test(code.replace(/EXAMPLES \(embedded-town split\):/, '')))
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./scripts/scraper-prompts.js').then(m => { process.stdout.write(typeof m.buildHgPrompt) })"], { cwd: REPO, encoding: 'utf8' })
  t(`plain Node (${process.version}) loads it, with no warning on stderr`, run.status === 0 && run.stdout === 'function' && run.stderr === '', run.stderr || run.stdout)
  const wf = ['.github/workflows/daily_scrape.yml', '.github/workflows/hatchgrab_scrape.yml'].map(f => [f, read(f)])
  t("both scrape workflows run `node scripts/run-scraper.js` on Node 24 (type stripping is on by default there)", wf.every(([, y]) => /node-version: '24'/.test(y) && /run: node scripts\/run-scraper\.js/.test(y)))

  // ── 6 · the validator ──
  console.log('\n── 6 · lib/address-formats.ts validateAddressFormats')
  t('every format has the four scraper rule parts, and the validator finds no problem', F.ADDRESS_FORMAT_KEYS.every(k => ['venueRules', 'townRules', 'examples', 'outputShape'].every(x => (F.ADDRESS_FORMATS[k].ai.scraper?.[x] || '').trim())) && F.validateAddressFormats().length === 0, F.validateAddressFormats())
  const broken = (patch) => F.validateAddressFormats({ ...F.ADDRESS_FORMATS, au: { ...F.ADDRESS_FORMATS.au, ai: { ...F.ADDRESS_FORMATS.au.ai, scraper: { ...F.ADDRESS_FORMATS.au.ai.scraper, ...patch } } } })
  t('control: an empty scraper rule is caught', broken({ examples: '  ' }).some(p => /au: an empty AI rule scraper\.examples/.test(p)), broken({ examples: '  ' }))
  t('control: a `${` in a scraper rule is caught', broken({ venueRules: 'VENUE RULES: ${x}' }).some(p => /au: AI rule scraper\.venueRules holds \$\{/.test(p)))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
