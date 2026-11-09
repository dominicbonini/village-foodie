// scripts/ios/listing-rules.cjs — ios-intl-1 (9 November 2026): the rules every store-listing file in data/store-listing/ must meet.
// A MODULE (used by scripts/ios-intl-1.cjs and by scripts/ios/push-listing.cjs), and a command:
//   node scripts/ios/listing-rules.cjs [file…]     → checks those files (default: every file), exit 1 on a problem
// Limits are App Store Connect's (keywords are counted in characters here; Apple's own counter decides on upload). The content rules
// are the brief's: true in every one of the 44 countries — no prices, no plan names, no trial lengths, no "subscribe / buy on our
// website", no other platform — and the name is "HatchGrab" everywhere.
'use strict'
const fs = require('fs')
const path = require('path')
const DIR = path.join(__dirname, '../../data/store-listing')
const LIMITS = { name: 30, subtitle: 30, promotionalText: 170, description: 4000, keywords: 100, whatsNew: 4000, shortDescription: 80 }
// words that must never appear (any language): other platforms, purchase instructions, money
const FORBIDDEN = [/android/i, /google play/i, /play store/i, /windows/i, /\bweb ?app\b/i, /website to (buy|subscribe)/i, /subscri(be|ption)/i, /free trial/i,
  /[$€£¥₩₹฿]|\b(USD|EUR|GBP|JPY|CHF|AED|MYR|THB|HKD|SGD|BRL|MXN|PLN|CZK|HUF|RON|SEK|NOK|DKK|BGN)\b/, /\b\d+[.,]?\d*\s?%/]
// plan names, in every language: the plans table's English names (read 9 Nov: Pay as you go, Pro, Free trial, Unlimited; Demo and
// Tester are internal) and every language's planNames.<plan>.name (lib/plan-names.ts). Matched CASE-SENSITIVELY as whole words, so
// Czech / Slovak "pro" ("for") is not the plan "Pro".
function planNames() {
  const out = new Set(['Pay as you go', 'Pro', 'Free trial', 'Unlimited'])
  for (const f of fs.readdirSync(path.join(__dirname, '../../messages')).filter(f => f.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '../../messages', f), 'utf8'))
    for (const v of Object.values(j.planNames ?? {})) if (v && typeof v.name === 'string' && v.name.trim()) out.add(v.name.trim())
  }
  return [...out]
}
function check(file, plans = planNames()) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8')), bad = []
  for (const [k, max] of Object.entries(LIMITS)) { if (typeof d[k] !== 'string' || !d[k].trim()) bad.push(`${k} missing`); else if ([...d[k]].length > max) bad.push(`${k} ${[...d[k]].length} > ${max}`) }
  if (d.name !== 'HatchGrab') bad.push(`name must be "HatchGrab" (is "${d.name}")`)
  if (typeof d.keywords === 'string') {
    if (/,\s|\s,/.test(d.keywords)) bad.push('keywords: no spaces around commas')
    if (/hatchgrab/i.test(d.keywords)) bad.push('keywords repeat the app name')
    const kw = d.keywords.split(','); if (new Set(kw.map(x => x.toLowerCase())).size !== kw.length) bad.push('keywords: a repeated keyword')
  }
  const text = ['subtitle', 'promotionalText', 'description', 'keywords', 'whatsNew', 'shortDescription'].map(k => d[k] || '').join('\n')
  for (const re of FORBIDDEN) if (re.test(text)) bad.push(`forbidden: ${re} → "${text.match(re)[0]}"`)
  for (const p of plans) if (new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(text)) bad.push(`plan name: "${p}"`)
  if (!/\b29\b|２９/.test(d.whatsNew || '')) bad.push('whatsNew should say 29 languages')
  for (const k of ['appStoreLocale', 'messagesLocale', 'countrySegment']) if (!d[k]) bad.push(`${k} missing`)
  return bad
}
module.exports = { DIR, LIMITS, check, planNames }
if (require.main === module) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => path.join(DIR, f))
  const plans = planNames(); let n = 0
  for (const f of files) { const b = check(f, plans); if (b.length) { n++; console.log(`🔴 ${path.basename(f)}: ${b.join(' · ')}`) } else console.log(`✓ ${path.basename(f)}`) }
  process.exit(n ? 1 : 0)
}
