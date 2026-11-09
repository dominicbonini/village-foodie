#!/usr/bin/env node
// scripts/ios/push-listing.cjs — ios-intl-1 Parts 4 and 6 (9 November 2026; docs/ios-intl-1-report.md): pushes the store listing in every
// language (data/store-listing/<appStoreLocale>.json) to an App Store version, and (with --shots) its screenshots.
//   node scripts/ios/push-listing.cjs <version> [--shots <dir>] [--only <locale,…>] [--dry]
//     <version>      e.g. 1.1 — must exist and be editable (PREPARE_FOR_SUBMISSION); a released version is never touched
//     --shots <dir>  <dir>/<appStoreLocale>/<DISPLAY_TYPE>-<n>.png from scripts/ios/store-shots.cjs: each set is REPLACED by these files
//     --dry          checks only: the rules (scripts/ios/listing-rules.cjs), the URLs answer 200, what would change
// Per locale: the version localisation (description, keywords, promotional text, What's New, support and marketing URLs) and the app-info
// localisation (name, subtitle, privacy policy URL) — the URLs are that language's own live pages (support = its FAQ, which links to
// contact; privacy = its privacy page; marketing = its country landing). Never changes the age rating, App Privacy, pricing or availability.
// Settings: scripts/ios/asc.cjs (~/.appstoreconnect/hatchgrab-asc.json — never a .env file).
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const https = require('https')
const A = require('./asc.cjs')
const RULES = require('./listing-rules.cjs')
const ORIGIN = 'https://www.hatchgrab.com'

function args() {
  const a = process.argv.slice(2), o = { version: a[0], dry: a.includes('--dry') }
  const i = a.indexOf('--shots'); if (i > 0) o.shots = a[i + 1]
  const j = a.indexOf('--only'); if (j > 0) o.only = a[j + 1].split(',')
  if (!o.version) { console.error('usage: node scripts/ios/push-listing.cjs <version> [--shots <dir>] [--only <locale,…>] [--dry]'); process.exit(2) }
  return o
}
const once = url => new Promise(res => { const q = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; hatchgrab-release-check)' }, timeout: 15000 }, r => { r.resume(); res(r.statusCode) }); q.on('timeout', () => q.destroy()); q.on('error', () => res(0)) })
/** A URL's status; a network error (0) is retried twice, so one blip cannot fail the push. */
async function status(url) { for (let i = 0; i < 3; i++) { const s = await once(url); if (s) return s; await new Promise(r => setTimeout(r, 2000)) } return 0 }
/** That language's own live pages. English countries' privacy page is the one English /privacy (their /<seg>/privacy redirects there). */
function urls(d) {
  const english = /^en-/.test(d.appStoreLocale)
  return { supportUrl: `${ORIGIN}/${d.countrySegment}/faq`, marketingUrl: `${ORIGIN}/${d.countrySegment}`, privacyPolicyUrl: english ? `${ORIGIN}/privacy` : `${ORIGIN}/${d.countrySegment}/privacy` }
}

async function uploadShot(setId, file) {
  const buf = fs.readFileSync(file), name = path.basename(file)
  const r = A.must(await A.req('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: name, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } } }), `reserve ${name}`)
  for (const op of r.data.attributes.uploadOperations) {
    const part = buf.subarray(op.offset, op.offset + op.length)
    const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]))
    const up = await A.req(op.method, op.url, part, { raw: true, headers })
    if (up.status >= 300) throw new Error(`upload ${name}: HTTP ${up.status}`)
  }
  A.must(await A.req('PATCH', `/v1/appScreenshots/${r.data.id}`, { data: { type: 'appScreenshots', id: r.data.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex') } } }), `commit ${name}`)
  return r.data.id
}

;(async () => {
  const o = args()
  const files = fs.readdirSync(RULES.DIR).filter(f => f.endsWith('.json')).map(f => path.join(RULES.DIR, f))
  const listings = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8'))).filter(d => !o.only || o.only.includes(d.appStoreLocale))
  // 1 · rules and URLs, before anything is sent
  const plans = RULES.planNames(); let bad = 0
  for (const f of files) { const b = RULES.check(f, plans); if (b.length) { bad++; console.log(`🔴 ${path.basename(f)}: ${b.join(' · ')}`) } }
  for (const d of listings) for (const [k, u] of Object.entries(urls(d))) { const s = await status(u); if (s !== 200) { bad++; console.log(`🔴 ${d.appStoreLocale} ${k} ${u} → ${s}`) } }
  if (bad) { console.log(`${bad} problem(s) — nothing sent`); process.exit(1) }
  console.log(`✓ ${listings.length} listings pass the rules; every support / marketing / privacy URL answers 200`)
  // 2 · the version and its app info (the editable one)
  const v = (await A.all(`/v1/apps/${A.APP_ID}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${o.version}`)).data[0]
  if (!v) throw new Error(`no version ${o.version}`)
  if (!['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState)) throw new Error(`version ${o.version} is ${v.attributes.appStoreState} — not editable; nothing sent`)
  const info = (await A.all(`/v1/apps/${A.APP_ID}/appInfos`)).data.find(i => !['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(i.attributes.appStoreState || i.attributes.state))
  if (!info) throw new Error('no editable app info (it appears once a new version exists)')
  const vlocs = Object.fromEntries((await A.all(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data.map(l => [l.attributes.locale, l]))
  const ilocs = Object.fromEntries((await A.all(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data.map(l => [l.attributes.locale, l]))
  if (o.dry) { console.log(`dry: version ${o.version} (${v.id}) has ${Object.keys(vlocs).length} localisations, app info ${info.id} has ${Object.keys(ilocs).length}; would write ${listings.length}`); return }
  for (const d of listings) {
    const loc = d.appStoreLocale, u = urls(d)
    const vattrs = { description: d.description, keywords: d.keywords, promotionalText: d.promotionalText, whatsNew: d.whatsNew, supportUrl: u.supportUrl, marketingUrl: u.marketingUrl }
    let vl = vlocs[loc]
    if (vl) A.must(await A.req('PATCH', `/v1/appStoreVersionLocalizations/${vl.id}`, { data: { type: 'appStoreVersionLocalizations', id: vl.id, attributes: vattrs } }), `${loc} version text`)
    else vl = vlocs[loc] = A.must(await A.req('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale: loc, ...vattrs }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } }), `${loc} version text`).data
    const iattrs = { name: d.name, subtitle: d.subtitle, privacyPolicyUrl: u.privacyPolicyUrl }
    const il = ilocs[loc]
    if (il) A.must(await A.req('PATCH', `/v1/appInfoLocalizations/${il.id}`, { data: { type: 'appInfoLocalizations', id: il.id, attributes: iattrs } }), `${loc} app info`)
    else A.must(await A.req('POST', '/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: { locale: loc, ...iattrs }, relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } }), `${loc} app info`)
    let line = `✓ ${loc}: text, name, subtitle and URLs`
    // 3 · screenshots: each display type's set replaced by the rendered files
    if (o.shots) {
      const dir = path.join(o.shots, loc)
      const byType = {}
      for (const f of fs.readdirSync(dir).filter(f => /\.png$/.test(f)).sort()) { const t = f.replace(/-\d+\.png$/, ''); (byType[t] = byType[t] || []).push(path.join(dir, f)) }
      const sets = Object.fromEntries((await A.all(`/v1/appStoreVersionLocalizations/${vl.id}/appScreenshotSets`)).data.map(s => [s.attributes.screenshotDisplayType, s]))
      for (const [type, list] of Object.entries(byType)) {
        let set = sets[type]
        if (!set) set = A.must(await A.req('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: vl.id } } } } }), `${loc} ${type} set`).data
        for (const old of (await A.all(`/v1/appScreenshotSets/${set.id}/appScreenshots`)).data) A.must(await A.req('DELETE', `/v1/appScreenshots/${old.id}`), `${loc} remove old`, [204])
        for (const f of list) await uploadShot(set.id, f)
      }
      line += ` · screenshots ${Object.entries(byType).map(([t, l]) => `${t}×${l.length}`).join(', ')}`
    }
    console.log(line)
  }
})().catch(e => { console.error(`🔴 ${e.message}`); process.exit(1) })
