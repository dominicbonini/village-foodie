// node install2.cjs <locale> — languages-world-2: merge parts+fix → messages/<locale>.json + docs/i18n/back/<locale>.json; register the base
// in lib/i18n/locales.ts (+ header note); guard list → lib/allergen-guard/<lang>.json + its import; split-messages; translation-check
// with the flag table in docs/languages-world-2/<locale>-translation-flags.md. Prints the files to commit.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process')
const REPO = '/Users/dominicbonini/dev/village-foodie', S = path.resolve(__dirname, '..')
const loc = process.argv[2], lang = loc.split('-')[0]
const run = (cmd, a, ok = false) => { try { return execFileSync(cmd, a, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString() } catch (e) { if (ok) return (e.stdout || '').toString() + (e.stderr || '').toString(); throw new Error(cmd + ' ' + a.join(' ') + '\n' + (e.stdout || '') + (e.stderr || '')) } }
console.log(run('node', [`${S}/tools/merge.cjs`, loc, '--write']).trim())
// register
console.log(run('node', [`${S}/tools/install.cjs`, 'base', loc]).trim())
const LT = `${REPO}/lib/i18n/locales.ts`; let lt = fs.readFileSync(LT, 'utf8')
const NOTE = '// languages-world-2 (11 November 2026, docs/languages-world-2-report.md): 23 new language bases, every one switched off (no country_settings row),'
if (!lt.includes(NOTE)) lt = lt.replace(/\nexport const LOCALES = /, `\n${NOTE}\n// each added here as its translation is merged: uk-UA, ru-KZ (Kazakhstan's Russian, for KZ/KG — not Russia), kk-KZ, uz-UZ (Latin), az-AZ, ka-GE,\n// hy-AM, sq-AL, mk-MK, bs-BA (Latin), ca-AD, hi-IN, bn-BD, ur-PK (right to left), ne-NP, si-LK, ta-LK, km-KH, lo-LA, mn-MN (Cyrillic),\n// fil-PH, sw-TZ and am-ET.\nexport const LOCALES = `)
fs.writeFileSync(LT, lt)
// guard words
const G = `${S}/guard/${lang}.json`, GT = `${REPO}/lib/allergen-guard.ts`
if (fs.existsSync(G)) {
  fs.copyFileSync(G, `${REPO}/lib/allergen-guard/${lang}.json`)
  let g = fs.readFileSync(GT, 'utf8'); const id = lang === 'is' ? 'is' : lang
  if (!new RegExp(`import ${id} from './allergen-guard/${lang}.json'`).test(g)) {
    const first = !g.includes('// languages-world-2')
    g = g.replace(/(import sr from '\.\/allergen-guard\/sr\.json'[^\n]*\n(?:import [^\n]*languages-world-2[^\n]*\n)*)/, `$1import ${id} from './allergen-guard/${lang}.json'   // languages-world-2${first ? ' (11 November 2026)' : ''}\n`)
    g = g.replace(/(sr: sr as GuardWords)((?:, [a-z]+: [a-z]+ as GuardWords)*) \}/, `$1$2, ${lang}: ${id} as GuardWords }`)
    fs.writeFileSync(GT, g)
  }
  console.log('guard', lang)
}
console.log(run('node', ['scripts/split-messages.cjs']).trim().split('\n').slice(-2).join('\n'))
fs.mkdirSync(`${REPO}/docs/languages-world-2`, { recursive: true })
console.log(run('node', ['scripts/translation-check.cjs', '--locale', loc, '--report', `docs/languages-world-2/${loc}-translation-flags.md`], true).trim().split('\n').slice(0, 6).join('\n'))
