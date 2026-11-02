// scripts/store-badges-1.cjs — store-badges-1's proof (2 November 2026; docs/store-badges-1-report.md): THE STORE BADGES IN EVERY
// LANGUAGE, SHOWN WHEREVER EACH APP IS AVAILABLE.
//
//   1 · both flags on: /de, /fr, /jp and the Arabic page (/ae) render that language's badges, Apple first, each file's own width ×
//       height reserved, the alt / aria words from landingFooter.badges in the page's language
//   2 · by flag: iOS only → Apple only; Android only → Google only; neither → nothing (no .foot-apps wrapper)
//   3 · the language lookup: every base has its own file; a regional variant reads its base's; English locales the English files
//   4 · /uk byte-identical to HEAD (6d00f678) apart from the Play href (&hl=en removed)
//   5 · Manage › Settings: the "Get the app" card shows only for a test truck whose country has an app (never a live truck)
//   6 · every badge file's sha256 matches what was downloaded (scripts/fixtures/store-badges-1-manifest.json); vendor hosts only
//
// §4's HEAD side is scripts/fixtures/store-badges-1-identity.json, written by THIS script in a worktree of 6d00f678:
//   (in <dir>) HG_KIT_CACHE_SUFFIX=sb1head node scripts/store-badges-1.cjs capture <this repo>/scripts/fixtures/store-badges-1-identity.json
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'store-badges-1' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const IDENTITY = path.join(REPO, 'scripts/fixtures/store-badges-1-identity.json')
const MANIFEST = path.join(REPO, 'scripts/fixtures/store-badges-1-manifest.json')
const HEAD_COMMIT = '6d00f678'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`) } }
const head = s => console.log(`\n── ${s}`)
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const ents = s => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

/** The world rows with each country's app flags set by `flags(code)` → [ios, android]. */
const rowsWith = flags => WF.rowsWith(WF.WORLD).map(r => { const [i, a] = flags(r.countryCode); return { ...r, iosAppAvailable: i, androidAppAvailable: a } })

async function landingRenderer(ctx, tag) {
  const LB = await ctx.bundle(tag, "export { default as Landing } from '@/app/[country]/page'\nexport { clearComparisonCache as __cmp } from '@/lib/comparison-flags'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'")
  const wf = WF.renderer(kit, `${tag}-tables`)
  return (seg, rows) => {
    const info = console.info; console.info = () => {}
    return kit.quietAsync(() => ctx.withReq({ rows, tables: wf.tables }, async () => { LB.__p(); LB.__cmp?.(); return ctx.prerender(kit.h(LB.Landing, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) })) })).finally(() => { console.info = info })
  }
}

if (process.argv[2] === 'capture') {
  (async () => {
    const ctx = LP1E.context(kit, REPO)
    const render = await landingRenderer(ctx, 'sb1-capture')
    const html = await render('uk', rowsWith(c => (c === 'GB' ? [true, true] : [false, false])))
    fs.writeFileSync(process.argv[3], JSON.stringify({ $why: `store-badges-1 §4: /uk (GB's app flags on, as live) at ${HEAD_COMMIT}, by scripts/store-badges-1.cjs capture.`, commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim(), uk: { sha256: sha(html), playHrefs: (html.match(/play\.google\.com\/store\/apps\/details\?id=com\.hatchgrab\.app(&amp;hl=en)?/g) || []) } }, null, 1) + '\n')
    fs.writeFileSync(process.argv[3].replace(/\.json$/, '.uk.html'), html)
    console.log('captured /uk')
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

/** The footer's badges in a page: [{ vendor, href, src, width, height, alt, aria }] in DOM order, and whether .foot-apps exists. */
function badgesOf(html) {
  const foot = (/<footer[\s\S]*?<\/footer>/.exec(html) || [''])[0]
  const wrap = /class="foot-apps"/.test(foot)
  const list = [...foot.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer" class="foot-badge" aria-label="([^"]*)"><img src="([^"]+)" alt="([^"]*)" width="(\d+)" height="(\d+)"/g)]
    .map(m => ({ vendor: /apps\.apple\.com/.test(m[1]) ? 'apple' : /play\.google\.com/.test(m[1]) ? 'google' : '?', href: ents(m[1]), aria: ents(m[2]), src: m[3], alt: ents(m[4]), width: Number(m[5]), height: Number(m[6]) }))
  return { wrap, list }
}

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const render = await landingRenderer(ctx, 'sb1')
  const M = await ctx.bundle('sb1-lib', "export { badgeFor, APPLE_BADGES, GOOGLE_BADGES, APPLE_ENGLISH, GOOGLE_ENGLISH } from '@/lib/store-badge-files'\nexport { GOOGLE_PLAY_URL, APP_STORE_URL, appStoreUrlFor } from '@/lib/app-badges'\nexport { translatorFor } from '@/lib/i18n/translator'\nexport { LANGUAGE_BASES, LOCALES } from '@/lib/i18n/locales'\nimport '@/lib/i18n/catalog/landingFooter'")
  const MAN = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const ALL_ON = rowsWith(() => [true, true]), ALL_OFF = rowsWith(() => [false, false])

  head('1 · both flags on: each page in its own language, Apple first')
  for (const [seg, locale] of [['de', 'de-DE'], ['fr', 'fr-FR'], ['jp', 'ja-JP'], ['ae', 'ar-AE']]) {
    const b = badgesOf(await render(seg, ALL_ON))
    const tf = M.translatorFor(locale, 'landingFooter')
    const apple = MAN.files.find(f => f.vendor === 'apple' && f.locale === locale), google = MAN.files.find(f => f.vendor === 'google' && f.locale === locale)
    t(`/${seg}: two badges, Apple first`, b.wrap && b.list.length === 2 && b.list[0].vendor === 'apple' && b.list[1].vendor === 'google', b.list)
    if (b.list.length !== 2) continue
    t(`/${seg}: Apple's ${locale} badge (${apple.file}), its own ${apple.width} × ${apple.height} → ${b.list[0].width} × 40 reserved`, b.list[0].src === apple.file && b.list[0].width === Math.round(apple.width / apple.height * 40) && b.list[0].height === 40, b.list[0])
    t(`/${seg}: Google's ${locale} badge (${google.file}), its own ${google.width} × ${google.height} → ${b.list[1].width} × 40 reserved`, b.list[1].src === google.file && b.list[1].width === Math.round(google.width / google.height * 40) && b.list[1].height === 40, b.list[1])
    t(`/${seg}: alt and aria words from landingFooter.badges in ${locale}`, b.list[0].alt === tf('badges.appStoreAlt') && b.list[0].aria === tf('badges.appStoreLink') && b.list[1].alt === tf('badges.googlePlayAlt') && b.list[1].aria === tf('badges.googlePlayLink'))
    t(`/${seg}: the links — the locale-free App Store listing, Play with no hl`, b.list[0].href === M.appStoreUrlFor(seg.toUpperCase()) && b.list[1].href === 'https://play.google.com/store/apps/details?id=com.hatchgrab.app')
    t(`/${seg}: height-driven sizing (height set, width auto), no filter or transform`, /<img src="\/badges\/apple\/[^"]+"[^>]*style="height:40px;width:auto;display:block"/.test(await render(seg, ALL_ON)))
  }

  head('2 · by flag: only the available app, and nothing at all when neither')
  const iosOnly = badgesOf(await render('de', rowsWith(c => (c === 'DE' ? [true, false] : [false, false]))))
  t('iOS only → Apple\'s badge alone', iosOnly.wrap && iosOnly.list.length === 1 && iosOnly.list[0].vendor === 'apple', iosOnly.list)
  const andOnly = badgesOf(await render('de', rowsWith(c => (c === 'DE' ? [false, true] : [false, false]))))
  t('Android only → Google\'s badge alone', andOnly.wrap && andOnly.list.length === 1 && andOnly.list[0].vendor === 'google', andOnly.list)
  for (const seg of ['de', 'uk', 'us', 'jp']) {
    const html = await render(seg, ALL_OFF)
    t(`/${seg}, neither flag: no badge, no .foot-apps wrapper, no store link`, !/foot-apps|foot-badge|apps\.apple\.com\/[a-z]*\/?app|play\.google\.com\/store/.test((/<footer[\s\S]*?<\/footer>/.exec(html) || [''])[0]))
  }
  const ukLive = badgesOf(await render('uk', rowsWith(c => (c === 'GB' ? [true, true] : [false, false]))))
  const usLive = badgesOf(await render('us', rowsWith(c => (c === 'GB' ? [true, true] : [false, false]))))
  t('as live (only the UK has the apps): /uk shows both English badges, /us none', ukLive.list.length === 2 && ukLive.list[0].src === M.APPLE_ENGLISH.src && ukLive.list[1].src === M.GOOGLE_ENGLISH.src && usLive.list.length === 0 && !usLive.wrap)

  head('3 · the language lookup')
  t('every one of the 28 bases has its own Apple and Google file', M.LANGUAGE_BASES.every(l => M.APPLE_BADGES[l] && M.GOOGLE_BADGES[l]) && Object.keys(M.APPLE_BADGES).length === 28 && Object.keys(M.GOOGLE_BADGES).length === 28)
  for (const [variant, base] of [['de-AT', 'de-DE'], ['de-CH', 'de-DE'], ['de-LI', 'de-DE'], ['es-MX', 'es-ES'], ['fr-LU', 'fr-FR'], ['nl-BE', 'nl-NL'], ['el-CY', 'el-GR']])
    t(`${variant} reads ${base}'s badges`, M.badgeFor('apple', variant).src === M.APPLE_BADGES[base].src && M.badgeFor('google', variant).src === M.GOOGLE_BADGES[base].src)
  t('every English locale reads the English files (unchanged names)', M.LOCALES.filter(l => l.startsWith('en-')).every(l => M.badgeFor('apple', l).src === '/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg' && M.badgeFor('google', l).src === '/badges/GetItOnGooglePlay_Badge_Web_color_English.svg'))
  t('no language falls back to English (both vendors had all 28) — and an unknown one would', M.LANGUAGE_BASES.every(l => M.badgeFor('apple', l) !== M.APPLE_ENGLISH && M.badgeFor('google', l) !== M.GOOGLE_ENGLISH) && M.badgeFor('apple', 'xx-XX') === M.APPLE_ENGLISH)
  t('the English files are where they were, byte for byte (git)', execFileSync('git', ['diff', '--stat', HEAD_COMMIT, '--', 'public/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg', 'public/badges/Download_on_the_App_Store_Badge_US-UK_RGB_wht_092917.svg', 'public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg'], { cwd: REPO }).toString().trim() === '')
  t('GOOGLE_PLAY_URL has no hl; the App Store link logic is unchanged', M.GOOGLE_PLAY_URL === 'https://play.google.com/store/apps/details?id=com.hatchgrab.app' && M.appStoreUrlFor('GB') === 'https://apps.apple.com/gb/app/hatchgrab/id6803543106' && M.appStoreUrlFor('DE') === 'https://apps.apple.com/app/id6803543106' && M.appStoreUrlFor(null) === M.APP_STORE_URL)

  head(`4 · /uk byte-identical to HEAD (${HEAD_COMMIT}) apart from the Play href`)
  if (!fs.existsSync(IDENTITY)) t('scripts/fixtures/store-badges-1-identity.json exists (captured at HEAD)', false)
  else {
    const want = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'))
    const now = await render('uk', rowsWith(c => (c === 'GB' ? [true, true] : [false, false])))
    const before = fs.readFileSync(IDENTITY.replace(/\.json$/, '.uk.html'), 'utf8')
    t('the HEAD capture is the one recorded (sha256)', sha(before) === want.uk.sha256)
    const PLAY = 'play.google.com/store/apps/details?id=com.hatchgrab.app'
    const footOf = h => (/<footer[\s\S]*?<\/footer>/.exec(h) || [''])[0]
    t('HEAD\'s footer Play href carried &hl=en; now it does not', footOf(before).includes(`${PLAY}&amp;hl=en"`) && footOf(now).includes(`${PLAY}"`) && !now.includes('hl=en'))
    t('the /uk footer now === HEAD\'s footer with only "&hl=en" taken out of the Play href', footOf(now) === footOf(before).split(`${PLAY}&amp;hl=en`).join(PLAY))
    // The same constant is the Organization's sameAs in the JSON-LD (lib/structured-data.ts), so the one URL changes there too.
    t('the whole /uk page === HEAD with that one Play URL changed (the footer href, and the same URL in the JSON-LD\'s sameAs) — every other byte identical', now === before.split(`${PLAY}&amp;hl=en`).join(PLAY).split(`${PLAY}&hl=en`).join(PLAY))
  }

  head('5 · Manage › Settings: the "Get the app" card by flag (test trucks only)')
  const PAGE = 'app/manage/[token]/page.tsx'
  const S = await kit.bundle('sb1-settings', "export * from '@/app/manage/[token]/page'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\nexport { PlanCatalogProvider } from '@/components/PlanCatalogProvider'\nexport { PricingPolicyProvider } from '@/components/PricingPolicy'", {
    patches: [{ file: PAGE, append: 'export { SettingsTab }' }],
  })
  const GB = LP1E.GB ? LP1E.GB() : null
  const catalog = WF.CATALOG()
  const settingsHtml = apps => {
    const truck = { id: 'test-truck', slug: 'test-truck', name: 'Test Truck', plan: 'pro', country: 'GB', currency: 'GBP', trial_expires_at: null }
    const noop = () => {}
    const el = kit.h(S.SettingsTab, { userRole: 'owner', truck, whatsappConnection: null, whatsappUsage: null, onConnectionUpdate: noop, token: 'test-truck-token', api: async () => ({}), showToast: noop, onVerifySuccess: noop, onSwitchTab: noop, categories: [], items: [], subcategories: [], onTruckUpdate: noop, onItemsPatch: noop, onCategoriesPatch: noop, onOpenWalkthrough: noop, notices: null, appsAvailable: apps })
    let tree = kit.h(S.PricingPolicyProvider, { hidePricing: false }, el)
    if (GB) tree = kit.h(S.CountrySettingsProvider, { settings: GB }, tree)
    tree = kit.h(S.PlanCatalogProvider, { catalog }, tree)
    return kit.renderStatic(tree)
  }
  // The card's own words (manageSettings.getApp.*, en-GB — the test truck is in GB).
  const getApp = JSON.parse(read('messages/en-GB.json')).manageSettings.getApp
  const escHtml = x => x.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  const hasTitle = h => h.includes(`>${escHtml(getApp.title)}<`), hasBody = h => h.includes(escHtml(getApp.body))
  const both = settingsHtml({ ios: true, android: true }), ios = settingsHtml({ ios: true, android: false }), none = settingsHtml({ ios: false, android: false })
  const hasCard = h => /apps\.apple\.com|play\.google\.com\/store/.test(h)
  t(`both apps: the card renders — "${getApp.title}", its body, both badges (Apple first)`, hasTitle(both) && hasBody(both) && hasCard(both) && both.indexOf('apps.apple.com') < both.indexOf('play.google.com/store'))
  t('iOS only: the card with Apple\'s badge alone', hasTitle(ios) && hasCard(ios) && /apps\.apple\.com/.test(ios) && !/play\.google\.com\/store/.test(ios))
  t('neither: no card — no title, no body, no badge', !hasTitle(none) && !hasBody(none) && !hasCard(none))
  t('the wording is unchanged (getApp.title / getApp.body, the same keys)', /t\('getApp\.title'\)/.test(read(PAGE)) && /t\('getApp\.body'\)/.test(read(PAGE)))
  const route = read('app/api/manage/route.ts')
  t('the flags come from /api/manage, from the same cached reader (comparisonFlagsOf), never fatal', /const flags = await comparisonFlagsOf\(/.test(route) && /appsAvailable,/.test(route) && /setAppsAvailable\(\{ ios: data\.appsAvailable\?\.ios === true, android: data\.appsAvailable\?\.android === true \}\)/.test(read(PAGE)))
  t('only a test truck ("test-truck") was rendered — no live truck', /id: 'test-truck', slug: 'test-truck'/.test(read('scripts/store-badges-1.cjs')))

  head('6 · every badge file as downloaded')
  t(`56 files in the manifest (28 Apple SVG, 28 Google PNG), downloaded ${MAN.downloaded}`, MAN.files.length === 56 && MAN.files.filter(f => f.vendor === 'apple').every(f => f.file.endsWith('.svg')) && MAN.files.filter(f => f.vendor === 'google').every(f => f.file.endsWith('.png')))
  const bad = MAN.files.filter(f => { const b = fs.readFileSync(path.join(REPO, 'public', f.file)); return b.length !== f.bytes || sha(b) !== f.sha256 })
  t('every file\'s sha256 and size on disk match what was downloaded', bad.length === 0, bad.map(f => f.file))
  t('every source is a vendor host (apple.com, google.com)', MAN.files.every(f => /^https:\/\/([a-z0-9-]+\.)*(apple\.com|google\.com)\//.test(f.source)))
  t('Apple: SVG, black (Apple\'s "blk" files), the dimensions recorded are the files\' own', MAN.files.filter(f => f.vendor === 'apple').every(f => { const s = fs.readFileSync(path.join(REPO, 'public', f.file), 'utf8'); const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s); return vb && Number(vb[1]) === f.width && Number(vb[2]) === f.height && (f.title === null || /_blk_/.test(f.title)) }))
  t('Google: PNG at least 3× the 40px display height (250px), the dimensions recorded are the files\' own', MAN.files.filter(f => f.vendor === 'google').every(f => { const b = fs.readFileSync(path.join(REPO, 'public', f.file)); return b.readUInt32BE(16) === f.width && b.readUInt32BE(20) === f.height && f.height >= 120 }))
  t('lib/store-badge-files.ts carries the manifest\'s dimensions, file for file', MAN.files.every(f => { const e = (f.vendor === 'apple' ? M.APPLE_BADGES : M.GOOGLE_BADGES)[f.locale]; return e && e.src === f.file && e.width === f.width && e.height === f.height }))
  const readme = read('public/badges/README.md')
  t('public/badges/README.md lists every file with its language, source URL and date', MAN.files.every(f => readme.includes(`\`${f.file.replace('/badges/', '')}\``) && readme.includes(f.source)) && readme.includes('| 2026-11-02 |'))

  console.log(`\nstore-badges-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
