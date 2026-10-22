#!/usr/bin/env node
// scripts/languages-1-e2e.cjs — 🔴 A MADE-UP LANGUAGE, END TO END (languages-1, 22 October 2026, docs/languages-1-report.md §6).
//
//   node scripts/languages-1-e2e.cjs [--keep] [--areas 1a,1b,…] [--shots] [--locale fr-FR] [--currency EUR] [--time 24h,dmy,monday] [--out docs/france-1]
//
// --locale <tag>: a REAL language a country prompt has added (its line in lib/i18n/locales.ts and its messages/<tag>.json) instead
// of the made-up one — the same captures, checks and screenshots, in that language (docs/i18n/add-a-country.md step 8).
//
// Proves a non-English language works on every surface with NO code change — only its locale line and its messages file:
//   1. a throwaway COPY of this tree (node_modules linked; .env files, .git and the native projects never copied) gets the
//      pseudo-locale "eo-XA" (scripts/_pseudo-locale.cjs: en-GB with every letter accented and ~30% longer — Esperanto, so Intl
//      formats its dates and money with non-English data, in "XA", the pseudo-locale region) as a real language: its line in
//      lib/i18n/locales.ts (LOCALES, LANGUAGE_BASES) and messages/eo-XA.json; scripts/split-messages.cjs then generates its catalogue exactly as it would for French;
//   2. in the copy, the language phases' US fixture truck/country is switched to eo-XA (every 'en-US' in their fixtures and
//      the US seed row), and each phase's own capture renders every surface it knows — the customer order page, status page,
//      customer emails and WhatsApp replies (1a); dashboard, KDS, tickets, operator emails (1b); setup, sign-in, demo,
//      go-live (1c); Manage's Menu, Schedule, Settings (1d) and the rest of Manage (1d2); landing, /features, /compare, the
//      plans PDF, Billing (1e) — in the made-up language;
//   3. every rendered word is checked: a plain-ASCII English word from en-GB's own vocabulary, in a product string (not the
//      fixtures' own data — truck, menu and customer names are the operator's content), is ENGLISH LEFT and listed;
//   4. --shots: the HTML views are painted with this tree's built CSS in WebKit and Chromium at 390 and 1280
//      (docs/languages-1/), measuring sideways scroll and clipped text; and EVERY eo-XA HTML view is measured at 390 in
//      Chromium against its GB twin, so an overflow the language causes is told apart from a capture artefact.
// Nothing here touches this tree except docs/languages-1/ (screenshots and the findings JSON). Needs `npm run build` for --shots.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path'); const zlib = require('zlib')
const { execFileSync, spawnSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const P = require('./_pseudo-locale.cjs')
const argv = process.argv.slice(2)
const KEEP = argv.includes('--keep')
const SHOTS = argv.includes('--shots')
const AREAS = (argv.includes('--areas') ? argv[argv.indexOf('--areas') + 1] : '1a,1b,1c,1d,1d2,1e').split(',')
const REAL = argv.includes('--locale') ? argv[argv.indexOf('--locale') + 1] : null
const TAG = REAL || 'eo-XA'
// france-1: --out <dir> (relative to the repo) writes the screenshots and findings there; --currency <ISO> also moves the fixture
// truck's currency ('USD' in the copy's fixtures) to the country's own, so its amounts show in that currency's form.
const OUT = path.join(REPO, argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : (REAL ? `docs/languages-1/${REAL}` : 'docs/languages-1'))
const CURRENCY = argv.includes('--currency') ? argv[argv.indexOf('--currency') + 1] : null
// france-1: --time 24h,dmy,monday moves the US fixture truck's clock, date order and week start to the country's (its 12-hour,
// month-first, Sunday week otherwise shows "5:00 PM" on a French screen — a fixture fact, not the language's).
const TIME = argv.includes('--time') ? argv[argv.indexOf('--time') + 1].split(',') : null

// ── 1 · the copy, with the pseudo-language switched on ──────────────────────────────────────────────────────────────
function makeCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-languages-1-'))
  execFileSync('rsync', ['-a', '--exclude', 'node_modules', '--exclude', '.next', '--exclude', '.git', '--exclude', 'ios', '--exclude', 'android', '--exclude', '.env*', '--exclude', 'docs', REPO + '/', dir + '/'])
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'))
  if (REAL) {
    // A real language: it must already be a base in lib/i18n/locales.ts with its own file — the copy changes neither.
    if (!fs.existsSync(path.join(REPO, `messages/${REAL}.json`))) throw new Error(`--locale ${REAL}: no messages/${REAL}.json`)
    if (!new RegExp(`LANGUAGE_BASES[^\\n]*'${REAL}'`).test(fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8'))) throw new Error(`--locale ${REAL}: not in LANGUAGE_BASES`)
  }
  const en = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  const xx = REAL ? JSON.parse(fs.readFileSync(path.join(REPO, `messages/${REAL}.json`), 'utf8')) : P.pseudoTree(en)
  const cat = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
  // Every plan's words (Pro keeps its name — the glossary invariant — but its description is translated).
  xx.planNames = Object.fromEntries(cat.plans.filter(p => p.active).map(p => [p.key, { ...(p.name !== 'Pro' ? { name: P.pseudoMessage(p.name) } : {}), ...(p.description ? { description: P.pseudoMessage(p.description) } : {}), ...(p.subtitle ? { subtitle: P.pseudoMessage(p.subtitle) } : {}) }]))
  if (!REAL) fs.writeFileSync(path.join(dir, 'messages/eo-XA.json'), JSON.stringify(xx, null, 2) + '\n')
  const loc = path.join(dir, 'lib/i18n/locales.ts')
  let s = fs.readFileSync(loc, 'utf8')
  // ⚠️ RE-PINNED (france-1, 22 October 2026): the lists are matched by their shape, not their text — fr-FR is in both now.
  if (!REAL) {
    const before = s
    s = s.replace(/export const LOCALES = \[([^\]]*)\] as const/, (m, x) => `export const LOCALES = [${x}, '${TAG}'] as const`)
      .replace(/export const LANGUAGE_BASES: readonly AppLocale\[\] = \[([^\]]*)\]/, (m, x) => `export const LANGUAGE_BASES: readonly AppLocale[] = [${x.trim() ? `${x}, ` : ''}'${TAG}']`)
    if ((s.match(new RegExp(`'${TAG}'`, 'g')) || []).length !== (before.match(new RegExp(`'${TAG}'`, 'g')) || []).length + 2) throw new Error('locales.ts: LOCALES / LANGUAGE_BASES not found')
  }
  fs.writeFileSync(loc, s)
  const split = spawnSync(process.execPath, ['scripts/split-messages.cjs'], { cwd: dir, encoding: 'utf8' })
  if (split.status !== 0) throw new Error('split-messages failed in the copy: ' + split.stdout + split.stderr)
  // The US fixtures → eo-XA (the copy's harness fixtures and the US seed row only; no app file is touched).
  const fixtureFiles = fs.readdirSync(path.join(dir, 'scripts')).filter(f => /^(_lp.*|_country-settings-gb|_native-prices-fixtures|_canada-1-fixtures|language-phase-.*)\.cjs$/.test(f)).map(f => path.join(dir, 'scripts', f))
  fixtureFiles.push(path.join(dir, 'supabase/migrations/20261010_04_country_settings_seed_us.sql'))
  let swapped = 0
  for (const f of fixtureFiles) {
    const t = fs.readFileSync(f, 'utf8'); let u = t.replace(/(['"])en-US\1/g, (m, q) => { swapped++; return `${q}${TAG}${q}` })
    if (CURRENCY) u = u.replace(/(['"])USD\1/g, (m, q) => `${q}${CURRENCY}${q}`)
    if (TIME) u = u.replace(/timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday'/g, `timeFormat: '${TIME[0]}', dateOrder: '${TIME[1]}', weekStart: '${TIME[2]}'`)
      .replace(/'12h', 'mdy', 'sunday'/g, `'${TIME[0]}', '${TIME[1]}', '${TIME[2]}'`)
    if (u !== t) fs.writeFileSync(f, u)
  }
  // Manage's fixture wraps the plan-catalogue provider OUTSIDE the language context; the app mounts the language provider in the
  // layout, outermost. The copy mounts them in the app's order, so the catalogue sees the page's language as it does live.
  const manageFixture = path.join(dir, 'scripts/_lp1d-fixtures.cjs')
  const mf = fs.readFileSync(manageFixture, 'utf8')
  const i18nLine = "  if (M.I18nContext) x = h(M.I18nContext.Provider, { value: { locale: C.locale, setLocale() {} } }, x)\n"
  const catLine = "  if (M.PlanCatalogProvider && PLAN_CATALOG) x = h(M.PlanCatalogProvider, { catalog: PLAN_CATALOG }, x)\n"
  if (!mf.includes(i18nLine) || !mf.includes(catLine)) throw new Error('manage fixture: provider lines not found')
  fs.writeFileSync(manageFixture, mf.replace(i18nLine, '').replace(catLine, catLine + i18nLine))
  // The poster fixture asks countryForTruck for the truck's poster key the way the route does — with the truck's locale.
  const posterFixture = path.join(dir, 'scripts/_lp1d2-poster.cjs')
  const pf = fs.readFileSync(posterFixture, 'utf8')
  if (!pf.includes('const country = P.locale.countryForTruck(C.truck)')) throw new Error('poster fixture: countryForTruck call not found')
  fs.writeFileSync(posterFixture, pf.replace('const country = P.locale.countryForTruck(C.truck)', `const country = P.locale.countryForTruck(C.truck, C.truck.country === 'US' ? '${TAG}' : undefined)`))
  // The social fixture hands its views a fixed 'GB' / 'US' poster key; the route hands countryForTruck(truck, locale), which
  // for a truck in a language is that language. The copy passes the language for the US (now eo-XA) truck, as the route does.
  const socialFixture = path.join(dir, 'scripts/_lp1d2-social.cjs')
  const sf = fs.readFileSync(socialFixture, 'utf8')
  if (!sf.includes('country: cc')) throw new Error('social fixture: `country: cc` not found')
  fs.writeFileSync(socialFixture, sf.split('country: cc').join(`country: (isUS ? '${TAG}' : cc)`))
  return { dir, swapped, split: split.stdout.trim() }
}

// ── 2 · the captures, in the copy ───────────────────────────────────────────────────────────────────────────────────
const PHASE = {
  '1a': { file: 'language-phase-1a.cjs', capture: d => ['--capture', path.join(d, '1a.json.gz')] },
  '1b': { file: 'language-phase-1b.cjs', capture: d => [`--capture-to=${path.join(d, '1b')}`], dir: true },
  '1c': { file: 'language-phase-1c.cjs', capture: d => [`--capture-to=${path.join(d, '1c')}`], dir: true },
  '1d': { file: 'language-phase-1d.cjs', areas: ['menu', 'schedule', 'settings', 'copy', 'api'] },
  '1d2': { file: 'language-phase-1d2.cjs', areas: ['shell', 'reports', 'payments', 'social', 'poster', 'wada', 'api'] },
  '1e': { file: 'language-phase-1e.cjs', areas: ['pages', 'parts', 'billing'] },
}
function capture(dir, outDir) {
  const views = {}
  for (const ph of AREAS) {
    const p = PHASE[ph]; const d = path.join(outDir, ph); fs.mkdirSync(d, { recursive: true })
    const runs = p.areas ? p.areas.map(a => [`--capture-to=${d}`, `--area=${a}`]) : [p.capture(outDir)]
    for (const args of runs) {
      const r = spawnSync(process.execPath, [`scripts/${p.file}`, ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, HG_KIT_CACHE_SUFFIX: 'languages-1-e2e' } })
      if (r.status !== 0) { console.log(`  ✗ capture ${ph} ${args.join(' ')} failed:\n${(r.stderr || r.stdout).slice(-1500)}`); process.exitCode = 1 }
    }
    const files = p.areas || p.dir ? fs.readdirSync(d).filter(f => f.endsWith('.json.gz')).map(f => path.join(d, f)) : [path.join(outDir, '1a.json.gz')]
    for (const f of files) {
      if (!fs.existsSync(f)) continue
      const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))
      const v = j.views ?? j
      const area = path.basename(f).replace('.json.gz', '')
      for (const [k, x] of Object.entries(flatViews(v))) views[`${ph}/${area}/${k}`] = x
    }
  }
  return views
}
/** A capture's views as id → value (1a's capture nests its sections). */
function flatViews(v, p = '', out = {}) {
  for (const [k, x] of Object.entries(v)) {
    const id = p ? `${p}/${k}` : k
    // ⚠️ france-1 (22 October 2026): a section whose keys are view ids ("US|menu|…") holding STRINGS (1a's order page and its
    // customer emails) is descended too — until then those views were one composite value, so neither the English-left nor the
    // overflow check ever saw them (named in docs/france-1-report.md).
    const section = x && typeof x === 'object' && !Array.isArray(x) && !('lines' in x) && Object.keys(x).length > 0 && !/\|/.test(k)
    if (section && (Object.values(x).every(y => y && typeof y === 'object' && !Array.isArray(y)) || Object.keys(x).some(kk => /\|/.test(kk)))) flatViews(x, id, out)
    else out[id] = x
  }
  return out
}

// ── 3 · English left ────────────────────────────────────────────────────────────────────────────────────────────────
/** The words a person reads in a view: an HTML view's text; for a data view (JSON — an API body, a ticket), only its string
 *  VALUES that read as words (a space in them), never keys or identifiers ("shadow", "placeId"). */
const valuesOf = v => (typeof v === 'string' ? (/\s/.test(v.trim()) || /^[A-Z][a-z]/.test(v) ? [v] : []) : Array.isArray(v) ? v.flatMap(valuesOf) : v && typeof v === 'object' ? Object.values(v).flatMap(valuesOf) : [])
const textOf = v => {
  const s = typeof v === 'string' ? v : valuesOf(v).join(' \n ')
  return s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\[nrt]/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ').replace(/"[a-zA-Z_]+":/g, ' ').replace(/(https?:\/\/\S+|www\.\S+|\S+@\S+|\/[\w./?=&%-]+)/g, ' ')
}
/** A view rendered for the pseudo-language: the phases' US fixture (now eo-XA) — not a GB view that merely mentions the US. */
const isPseudoView = id => /(^|[|/])US([|/.]|$)/.test(id) && !/(^|[|/])GB([|/.]|$)/.test(id)
function englishLeft(views) {
  const en = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  const vocab = new Set()
  const walk = t => { for (const v of Object.values(t)) { if (typeof v === 'string') for (const w of v.replace(/\{[^}]*\}/g, ' ').match(/[A-Za-z]{3,}/g) || []) vocab.add(w.toLowerCase()); else walk(v) } }
  walk(en)
  // The fixtures' own data (truck, menu, customer, venue, plan rows) is the operator's content, not product words.
  const data = new Set()
  for (const f of fs.readdirSync(path.join(REPO, 'scripts')).filter(f => /\.cjs$/.test(f) && /fixture|_lp1[a-e]|_country-settings|_plans-catalog|_fake/.test(f))) {
    for (const m of fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8').matchAll(/(['"`])((?:(?!\1).){2,120})\1/g)) for (const w of m[2].match(/[A-Za-z]{3,}/g) || []) data.add(w.toLowerCase())
  }
  // Data a country supplies in its own language: allergen-set labels (lib/allergens.ts), cuisines are NOT data (they are
  // translated by id) — only the allergen sets, currency names and region names are.
  for (const f of ['lib/allergens.ts', 'lib/currencies.ts', 'lib/address-formats.ts']) for (const m of fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/'([^']{2,60})'/g)) for (const w of m[1].match(/[A-Za-z]{3,}/g) || []) data.add(w.toLowerCase())
  for (const f of fs.readdirSync(path.join(REPO, 'supabase/migrations')).filter(f => /plans|country_settings|seed/.test(f))) for (const w of fs.readFileSync(path.join(REPO, 'supabase/migrations', f), 'utf8').match(/'[^']*'/g) || []) for (const x of w.match(/[A-Za-z]{3,}/g) || []) data.add(x.toLowerCase())
  // france-1: a real language's reviewed same-spelled words (docs/i18n/same-words/<lang>.json — « planning », « plus ») are not English.
  const sameWordsFile = path.join(REPO, `docs/i18n/same-words/${TAG.split('-')[0]}.json`)
  const LANG_SAME = REAL && fs.existsSync(sameWordsFile) ? JSON.parse(fs.readFileSync(sameWordsFile, 'utf8')).map(w => String(w).toLowerCase()) : []
  const SAME = new Set([...LANG_SAME, ...P.KEEP.map(k => k.toLowerCase()), 'hatchgrab', 'whatsapp', 'pizza', 'online', 'email', 'menu', 'logo', 'emoji', 'pdf', 'csv', 'sms', 'qr', 'kds', 'ipad', 'iphone', 'meta', 'stripe', 'google', 'apple', 'instagram', 'facebook', 'tiktok', 'village', 'foodie', 'usd', 'gbp', 'eur', 'cad', 'aud', 'nzd', 'pro'])
  const byWord = new Map(); const byView = {}
  for (const [id, v] of Object.entries(views)) {
    if (!isPseudoView(id)) continue
    const words = (textOf(v).match(/(?<![\p{L}])[A-Za-z]{3,}(?![\p{L}])/gu) || []).filter(w => vocab.has(w.toLowerCase()) && !data.has(w.toLowerCase()) && !SAME.has(w.toLowerCase()))
    if (!words.length) continue
    byView[id] = [...new Set(words)]
    for (const w of new Set(words)) { const e = byWord.get(w) ?? []; e.push(id); byWord.set(w, e) }
  }
  return { byView, byWord: [...byWord.entries()].sort((a, b) => b[1].length - a[1].length) }
}

// ── 4 · screenshots ─────────────────────────────────────────────────────────────────────────────────────────────────
const SHOT_VIEWS = [
  ['landing', /^1e\/pages\/landing\|US\|html$/], ['features', /^1e\/pages\/features\|US\|html$/], ['compare', /^1e\/pages\/compare\|US\|html$/],
  ['signup-setup', /^1c\/setup\/US\|page\|based\|plain$/], ['signup-demo', /^1c\/demo\/US\|/], ['manage-menu', /^1d\/menu\/US\|menuTab\|list$/],
  ['manage-schedule', /^1d\/schedule\/US\|/], ['manage-settings', /^1d\/settings\/US\|/], ['manage-billing', /^1e\/billing\/billing\|US\|/], ['manage-shell', /^1d2\/shell\/US\|shell\|tab\|menu$/],
  // ⚠️ france-1: the order and status pages by their own ids (the old patterns matched a WhatsApp reply and an API body first).
  ['order-page', /^1a\/1a\/orderPage\/US\|menu$/], ['order-basket', /^1a\/1a\/orderPage\/US\|sheet$/], ['status-page', /^1a\/1a\/statusPage\/US\|confirmed$/],
  ['customer-email', /^1a\/1a\/emails\/confirm\|US\|plain$/],
  ['dashboard', /^1b\/dashboard\/US\|(list|order)/], ['kds', /^1b\/kds\/US\|/], ['operator-email', /^1b\/operatorMail\/new\|US\|/],
  ['ticket', /^1b\/printing\/ticket\|US\|pay_at_hatch\|80\|phone=true$/],
  // The WhatsApp guard: eo-XA has no allergen-guard word list, so a plain menu question FAILS SAFE to the allergen reply.
  ['whatsapp-allergen', /^1a\/1a\/whatsapp\/US\|allergen$/], ['whatsapp-menu', /^1a\/1a\/whatsapp\/US\|menuDeterministic$/],
]
async function shots(views) {
  const { chromium, webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const cssDir = path.join(REPO, '.next/static/chunks')
  const css = fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
  if (!css.includes('.hg-landing')) throw new Error('no built CSS — run `npm run build` first')
  fs.mkdirSync(OUT, { recursive: true })
  const picked = SHOT_VIEWS.map(([name, re]) => [name, Object.keys(views).find(k => re.test(k))]).filter(([, k]) => k)
  const found = []
  for (const [engineName, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch()
    for (const [name, id] of picked) for (const w of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } })
      const v = views[id]
      const body = typeof v === 'string' ? v : v && typeof v.html === 'string' ? v.html : `<pre style="font:14px/1.5 monospace;padding:16px;white-space:pre-wrap">${JSON.stringify(v, null, 1).replace(/</g, '&lt;')}</pre>`
      await page.setContent(`<!doctype html><html lang="${TAG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{background:#fff;margin:0}</style></head><body>${body}</body></html>`, { waitUntil: 'load' })
      await page.waitForTimeout(150)
      const m = await page.evaluate(() => {
        const clipped = []
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el)
          if (!el.textContent.trim() || el.children.length > 3) continue
          const hides = cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis'
          if (hides && el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().width > 0) clipped.push(el.textContent.trim().slice(0, 60))
        }
        return { sideways: document.documentElement.scrollWidth > innerWidth + 1, clipped: clipped.slice(0, 20) }
      })
      found.push({ engine: engineName, name, view: id, width: w, ...m })
      await page.screenshot({ path: path.join(OUT, `${name}-${engineName}-${w}.png`), fullPage: true })
      await page.close()
    }
    await browser.close()
  }
  return found
}

/** Every eo-XA HTML view at 390px in Chromium: does the page scroll sideways? One that does is set against its GB twin (the same
 *  view in English): when the twin scrolls too, the capture is a fragment that expects its parent's padding (a `-mx-4` bar, a
 *  fixed-width ticket) — an artefact, listed apart. Only an overflow the LANGUAGE causes is a finding. */
async function overflowAll(views) {
  const { chromium } = require(path.join(REPO, 'node_modules/playwright'))
  const cssDir = path.join(REPO, '.next/static/chunks')
  const css = fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
  const htmlOf = v => (typeof v === 'string' ? v : v && typeof v.html === 'string' ? v.html : null)   // an email view is { subject, html, text }
  const isHtml = v => { const x = htmlOf(v); return !!x && /<(div|p|span|section|table|button)\b/.test(x) }
  const ids = Object.keys(views).filter(id => isPseudoView(id) && isHtml(views[id]))
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
  const wide = async (html, lang) => {
    await page.setContent(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{background:#fff;margin:0}</style></head><body>${html}</body></html>`, { waitUntil: 'load' })
    return page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  }
  const language = [], artefact = []
  for (const id of ids) {
    const over = await wide(htmlOf(views[id]), TAG)
    if (over <= 1) continue
    const twin = id.replace(/(^|[|/])US(?=[|/.]|$)/, '$1GB')
    const twinOver = isHtml(views[twin]) ? await wide(htmlOf(views[twin]), 'en-GB') : null
    ;(twinOver !== null && twinOver > 1 ? artefact : language).push({ id, over, twin: twinOver === null ? null : twinOver })
  }
  await browser.close()
  return { checked: ids.length, language, artefact }
}

;(async () => {
  const t0 = Date.now()
  const { dir, swapped, split } = makeCopy()
  console.log(`copy: ${dir} — ${TAG} switched on (${split}); ${swapped} 'en-US' fixture values → '${TAG}'${CURRENCY ? `, 'USD' → '${CURRENCY}'` : ''}`)
  const outDir = path.join(dir, '.e2e-out')
  const views = capture(dir, outDir)
  const pseudoViews = Object.keys(views).filter(isPseudoView)
  console.log(`captured ${Object.keys(views).length} views, ${pseudoViews.length} of them in ${TAG} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  const left = englishLeft(views)
  fs.mkdirSync(OUT, { recursive: true })
  if (process.argv.includes('--dump')) fs.writeFileSync(path.join(OUT, 'english-left.json'), JSON.stringify(left.byView, null, 1))
  const findings = { generated: new Date().toISOString().slice(0, 10), views: Object.keys(views).length, pseudoViews: pseudoViews.length, englishLeft: { words: left.byWord.map(([w, ids]) => ({ word: w, views: ids.length, examples: ids.slice(0, 3) })), viewsWithEnglish: Object.keys(left.byView).length } }
  console.log(`English left: ${left.byWord.length} distinct word(s) in ${Object.keys(left.byView).length} of ${pseudoViews.length} ${TAG} views`)
  for (const [w, ids] of left.byWord.slice(0, 40)) console.log(`  ${w.padEnd(16)} ${String(ids.length).padStart(4)}  e.g. ${ids.slice(0, 2).join('  ')}`)
  if (SHOTS) { findings.shots = await shots(views); for (const s of findings.shots) console.log(`  shot ${s.name} ${s.engine} ${s.width}: sideways ${s.sideways}, clipped ${s.clipped.length}${s.clipped.length ? ' — ' + s.clipped.slice(0, 3).join(' | ') : ''}`) }
  if (SHOTS) {
    findings.overflow390 = await overflowAll(views)
    const o = findings.overflow390
    console.log(`overflow at 390px (Chromium): ${o.checked} ${TAG} HTML views — ${o.language.length} overflow because of the language, ${o.artefact.length} overflow in English too (capture artefacts)`)
    for (const x of o.language) console.log(`  ✗ ${x.id}: ${x.over}px sideways (GB twin: ${x.twin === null ? 'none' : x.twin + 'px'})`)
  }
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 1) + '\n')
  if (process.argv.includes('--dump')) fs.writeFileSync(path.join(OUT, 'views.json'), JSON.stringify(Object.fromEntries(pseudoViews.map(k => [k, views[k]]))))
  if (!KEEP) fs.rmSync(dir, { recursive: true, force: true }); else console.log(`kept: ${dir}`)
})().catch(e => { console.error(e); process.exit(1) })
