#!/usr/bin/env node
// scripts/ios-intl-1.cjs — ios-intl-1 (9 November 2026; docs/ios-intl-1-report.md): iOS 1.1 in every HatchGrab language. Proves, from the
// repository alone (no network, no App Store Connect, no build):
//   1 · the binary's words: every language base has nativeShell.binary (7 keys); the generated .lproj/*.strings are exactly what
//       scripts/ios/native-strings.cjs writes from messages (web and binary cannot drift); every NS…UsageDescription in Info.plist is
//       localised; Info.plist's English equals en-GB's; the display name is "HatchGrab" everywhere; the Swift shell's user-visible
//       strings go through NSLocalizedString with keys that exist; the project knows every region
//   2 · the store listing: one file per App Store locale (29), each passing scripts/ios/listing-rules.cjs (limits; no prices, plan names,
//       trials, purchase instructions or other platforms); a back-translation for every non-English one
//   3 · the build: version 1.1, build 3, no CURRENT_PROJECT_VERSION[sdk=*] override; ITSAppUsesNonExemptEncryption = false still backed by
//       the audit (no cryptography symbol in any native Swift — the app's or a local plugin's); the privacy manifest declares UserDefaults
//   4 · App Store Connect settings never come from a .env file (scripts/ios/* read ~/.appstoreconnect/hatchgrab-asc.json)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const plist = f => JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(REPO, f)]).toString())

const NS = require('./ios/native-strings.cjs')
const RULES = require('./ios/listing-rules.cjs')

console.log('── 1 · the binary\'s words')
const bases = Object.keys(NS.LPROJ)
const missing = bases.filter(l => { const b = JSON.parse(read(`messages/${l}.json`)).nativeShell?.binary; return !b || [...Object.values(NS.PLIST_KEYS), ...NS.SWIFT_KEYS].some(k => typeof b[k] !== 'string' || !b[k].trim()) })
t(`every language (${bases.length}: en-GB and the 28 bases) has all seven nativeShell.binary words`, !missing.length, missing)
let check
try { check = NS.run(true) } catch (e) { check = { problems: [e.message] } }
t('the .lproj/*.strings files and the project\'s localised groups are exactly what native-strings.cjs writes from messages', !check.problems.length, check.problems)
const info = plist('ios/App/App/Info.plist')
const usage = Object.keys(info).filter(k => /^NS.*UsageDescription$/.test(k))
t(`every purpose string in Info.plist is localised (${usage.join(', ')})`, usage.length >= 4 && usage.every(k => NS.PLIST_KEYS[k]), usage.filter(k => !NS.PLIST_KEYS[k]))
const en = JSON.parse(read('messages/en-GB.json')).nativeShell.binary
t('…and Info.plist\'s own (fallback) English is en-GB\'s, word for word', Object.entries(NS.PLIST_KEYS).every(([k, m]) => info[k] === en[m]), Object.entries(NS.PLIST_KEYS).filter(([k, m]) => info[k] !== en[m]).map(([k]) => k))
t('the display name is "HatchGrab" in Info.plist and in every language', info.CFBundleDisplayName === 'HatchGrab' && fs.readdirSync(path.join(REPO, 'ios/App/App')).filter(d => d.endsWith('.lproj') && d !== 'Base.lproj').every(d => read(`ios/App/App/${d}/InfoPlist.strings`).includes('"CFBundleDisplayName" = "HatchGrab";')))
const swift = read('ios/App/App/HGBridgeViewController.swift')
const keys = [...swift.matchAll(/NSLocalizedString\("([^"]+)"/g)].map(m => m[1])
t(`the Swift shell's words are NSLocalizedString keys that exist (${keys.join(', ')})`, keys.length === NS.SWIFT_KEYS.length && keys.every(k => NS.SWIFT_KEYS.includes(k)) && !/\.text = "|setTitle\("/.test(swift))
const proj = read('ios/App/App.xcodeproj/project.pbxproj')
t('the project knows every language as a region', [...new Set(Object.values(NS.LPROJ).flat())].every(r => new RegExp(`\\n\\s*"?${r}"?,`).test(proj.slice(proj.indexOf('knownRegions')))))

console.log('\n── 2 · the store listing')
const files = fs.readdirSync(RULES.DIR).filter(f => f.endsWith('.json'))
const LOCALES = ['en-GB', 'en-US', 'en-AU', 'en-CA', 'fr-FR', 'de-DE', 'es-ES', 'es-MX', 'it', 'pt-PT', 'pt-BR', 'nl-NL', 'sv', 'da', 'no', 'pl', 'cs', 'hu', 'sk', 'ro', 'hr', 'sl-SI', 'fi', 'el', 'ja', 'zh-Hant', 'th', 'ar-SA', 'ms']
t(`one listing per App Store locale (${LOCALES.length}; Bulgarian, Estonian, Latvian and Lithuanian have none — they fall back to en-GB)`, JSON.stringify(files.map(f => f.replace('.json', '')).sort()) === JSON.stringify([...LOCALES].sort()), files)
const plans = RULES.planNames()
const bad = files.map(f => [f, RULES.check(path.join(RULES.DIR, f), plans)]).filter(([, b]) => b.length)
t('every listing passes the rules (limits; no prices, plan names, trials, purchase instructions or other platforms; name "HatchGrab")', !bad.length, bad)
const nonEn = files.filter(f => !f.startsWith('en-'))
t('…and every non-English one has an English back-translation (docs/i18n/back-store-listing)', nonEn.every(f => fs.existsSync(path.join(REPO, 'docs/i18n/back-store-listing', f))), nonEn.filter(f => !fs.existsSync(path.join(REPO, 'docs/i18n/back-store-listing', f))))
t('…each names the messages locale it was translated from, and that file exists', files.every(f => { const d = JSON.parse(fs.readFileSync(path.join(RULES.DIR, f), 'utf8')); return fs.existsSync(path.join(REPO, 'messages', `${d.messagesLocale}.json`)) }))

console.log('\n── 3 · the build')
t('version 1.1, build 3, in both configurations; no CURRENT_PROJECT_VERSION[sdk=*] override', (proj.match(/MARKETING_VERSION = 1\.1;/g) || []).length === 2 && (proj.match(/CURRENT_PROJECT_VERSION = 3;/g) || []).length === 2 && !/CURRENT_PROJECT_VERSION\[sdk/.test(proj))
t('ITSAppUsesNonExemptEncryption is the boolean false', info.ITSAppUsesNonExemptEncryption === false)
const swiftFiles = execFileSync('find', ['ios/App/App', 'ios/App/CapApp-SPM', 'plugins', '-name', '*.swift', '-not', '-path', '*/build/*', '-not', '-path', '*/.build/*'], { cwd: REPO }).toString().trim().split('\n').filter(Boolean)
const crypto = swiftFiles.filter(f => /CommonCrypto|CryptoKit|SecKey|SecItem|import Security|CCCrypt|CC_SHA|kSecAttr|OpenSSL|libcrypto|SecRandom|NWProtocolTLS/.test(read(f)))
t(`…and still backed by the audit: no cryptography in any native Swift (${swiftFiles.length} files: the app's and the local plugins')`, swiftFiles.length >= 4 && !crypto.length, crypto)
const pm = plist('ios/App/App/PrivacyInfo.xcprivacy')
t('the privacy manifest declares UserDefaults (CA92.1) and no tracking', pm.NSPrivacyTracking === false && pm.NSPrivacyAccessedAPITypes.some(a => a.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults' && a.NSPrivacyAccessedAPITypeReasons.includes('CA92.1')))

console.log('\n── 4 · settings')
const ios = fs.readdirSync(path.join(REPO, 'scripts/ios')).map(f => [f, read(`scripts/ios/${f}`)])
t('no scripts/ios file reads a .env file; the client reads ~/.appstoreconnect/hatchgrab-asc.json', ios.every(([, s]) => !/\.env(\.local)?['"`]/.test(s) && !/dotenv/.test(s)) && /hatchgrab-asc\.json/.test(read('scripts/ios/asc.cjs')))

console.log(`\n${fail ? '🔴' : '✅'} ios-intl-1: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
