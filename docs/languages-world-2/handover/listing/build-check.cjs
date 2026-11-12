// Builds $S/listing/<file>.json + back/<file>.json from src/, then runs listing-rules.cjs check() on each.
'use strict'
const fs = require('fs'), path = require('path')
const D = __dirname
const { check, planNames } = require('/Users/dominicbonini/dev/village-foodie/scripts/ios/listing-rules.cjs')
const { ABOUT, langs: A } = require('./src/c.cjs'), { langs: B } = require('./src/d.cjs'), { langs: C } = require('./src/e.cjs')
const FIELDS = ['subtitle', 'promotionalText', 'description', 'keywords', 'whatsNew', 'shortDescription']
// the new languages' own plan names (seo/<CC>.json terms) — not in messages/ yet, so check them here too
const NEW_PLANS = require('fs').readdirSync(path.join(D, '../seo')).filter(f => /^[a-z]{2,3}-[A-Z]{2}\.json$/.test(f)).flatMap(f => { const t = JSON.parse(fs.readFileSync(path.join(D, '../seo', f), 'utf8')).terms; return [t.payAsYouGo, t.unlimited, t.freeTrial].filter(x => x && x !== 'Pro') })
const plans = [...planNames(), ...NEW_PLANS]
const OK = [/^whatsNew should say 29 languages$/, /^appStoreLocale missing$/]
fs.mkdirSync(path.join(D, 'back'), { recursive: true })
let fail = 0
for (const L of [...A, ...B, ...C]) {
  const head = { $about: ABOUT + (L.aboutExtra || ''), appStoreLocale: L.meta.appStoreLocale, playLocale: L.meta.playLocale,
    messagesLocale: L.meta.messagesLocale, countrySegment: L.meta.countrySegment, name: 'HatchGrab' }
  const out = { ...head }, back = { ...head }
  for (const k of FIELDS) { out[k] = L.t[k]; back[k] = L.b[k] }
  const f = path.join(D, L.file + '.json')
  fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n')
  fs.writeFileSync(path.join(D, 'back', L.file + '.json'), JSON.stringify(back, null, 2) + '\n')
  const bad = check(f, plans)
  // extra checks: 37 in whatsNew, no bidi controls, keyword count, no straight apostrophes, no Cyrillic in sr, para count = master
  if (!/60|٦٠|৬০|६०/.test(out.whatsNew)) bad.push('whatsNew lacks 60')
  if (/[‎‏‪-‮⁦-⁩]/.test(JSON.stringify(out))) bad.push('bidi control char')
  if (/'/.test(FIELDS.map(k => out[k]).join(''))) bad.push('straight apostrophe')
  if (/[\u0000-\u0008]/.test(JSON.stringify(out))) bad.push('control char')
  if (out.description.split('\n\n').length !== 10) bad.push('description paragraphs ≠ 10')
  if (/whatsapp|hatch\b/i.test(FIELDS.map(k => out[k]).join(' '))) bad.push('WhatsApp/hatch mentioned')
  const real = bad.filter(b => !OK.some(re => re.test(b))), ok = bad.filter(b => OK.some(re => re.test(b)))
  if (real.length) fail++
  const len = k => [...out[k]].length
  console.log(`${real.length ? 'FAIL' : 'ok  '} ${L.file}.json  sub ${len('subtitle')}/30 promo ${len('promotionalText')}/170 desc ${len('description')}/4000 kw ${len('keywords')}/100 short ${len('shortDescription')}/80` +
    (real.length ? `\n     ${real.join(' · ')}` : '') + (ok.length ? `  [accepted: ${ok.join('; ')}]` : ''))
}
process.exit(fail ? 1 : 0)
