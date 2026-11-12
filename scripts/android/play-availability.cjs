#!/usr/bin/env node
// scripts/android/play-availability.cjs — world-countries-5 (12 November 2026, Dominic): Google Play's production countries = EXACTLY the
// go-live countries (docs/world-countries-4/go-live.csv) that Google Play serves as countries of their own (docs/world-countries-4/countries.csv
// `google_play` = yes): 187. Never Russia, Belarus, China, Mexico or any excluded, held or cannot-sell country (none is in go-live.csv).
// The 21 go-live territories Play covers through a parent's listing (`parent:`) and the 2 it does not serve (MH, PW) are not Play countries.
//   node scripts/android/play-availability.cjs            read-only: show the production track, its release(s), the current countries
//                                                          and what would change (the edit is opened and then deleted, never committed)
//   node scripts/android/play-availability.cjs --apply    set them — ONLY if it can be done without changing the release (below)
//
// 🔴 THE KEY LIVES OUTSIDE THE REPOSITORY: ~/.googleplay/hatchgrab-play.json (a Google Cloud service-account key with Play Console access).
//    It is read only to sign a short-lived OAuth token (RS256 JWT, scope androidpublisher); neither the key, its fields nor a token is ever
//    printed or written anywhere. Never in a .env* file, never in git (as the App Store key, scripts/ios/asc.cjs).
//
// ⚠️ WHAT THE API CAN DO (Android Publisher v3, checked 12 Nov 2026): `edits.countryavailability` is GET-only. A production release's countries
//    are set only as `releases[].countryTargeting` { countries: [CLDR two-letter codes], includeRestOfWorld }, and the docs say "this is only
//    allowed to be set for inProgress releases in the production track". So:
//    - production's live release is `inProgress` (a staged rollout) → its countryTargeting is set; versionCodes, userFraction, name and
//      notes are sent back exactly as read, so the release itself is unchanged;
//    - it is `completed` (the usual case) → the API cannot set its countries without turning it into a staged rollout, which WOULD change the
//      release. The script REFUSES and says so; the countries are then set by hand in Play Console (Production › Countries / regions), from
//      the list it prints and saves.
// On success it reads the availability back and saves docs/world-countries-5/play-go-live.json.
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const https = require('https')

const REPO = path.resolve(__dirname, '../..')
const KEY = path.join(os.homedir(), '.googleplay', 'hatchgrab-play.json')
const PACKAGE = 'com.hatchgrab.app'   // lib/app-badges.ts GOOGLE_PLAY_URL; android/app/build.gradle applicationId
const OUT = path.join(REPO, 'docs/world-countries-5/play-go-live.json')
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE

function csv(file) {
  const lines = fs.readFileSync(path.join(REPO, file), 'utf8').trim().split('\n')
  const head = lines[0].split(',')
  return lines.slice(1).map(l => {
    const cells = []; let cur = '', q = false
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = '' } else cur += ch }
    cells.push(cur)
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]))
  })
}
/** The wanted Play countries: go-live ∩ google_play = yes, alpha-2, sorted. */
function wanted() {
  const play = Object.fromEntries(csv('docs/world-countries-4/countries.csv').map(r => [r.alpha2, r.google_play]))
  const golive = csv('docs/world-countries-4/go-live.csv').map(r => r.code)
  return {
    countries: golive.filter(c => play[c] === 'yes').sort(),
    viaParent: golive.filter(c => /^parent:/.test(play[c] || '')).sort(),
    notServed: golive.filter(c => play[c] !== 'yes' && !/^parent:/.test(play[c] || '')).sort(),
  }
}

function req(method, url, { body, token, form } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : null
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
    } }, res => { let t = ''; res.on('data', d => { t += d }); res.on('end', () => {
      let j = null; try { j = t ? JSON.parse(t) : null } catch { /* not JSON */ }
      if (res.statusCode >= 300) reject(new Error(`${method} ${u.pathname} → ${res.statusCode} ${j?.error?.message ?? t.slice(0, 300)}`)); else resolve(j)
    }) })
    r.on('error', reject); if (data) r.write(data); r.end()
  })
}
async function token() {
  if (!fs.existsSync(KEY)) throw new Error(`no key at ${KEY} — create the Play service-account key there first (never in the repo or a .env file)`)
  const k = JSON.parse(fs.readFileSync(KEY, 'utf8'))   // never printed
  const now = Math.floor(Date.now() / 1000)
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: k.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 })
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(k.private_key).toString('base64url')
  const t = await req('POST', k.token_uri || 'https://oauth2.googleapis.com/token', { form: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig } })
  return t.access_token
}

;(async () => {
  const apply = process.argv.includes('--apply')
  const w = wanted()
  console.log(`wanted: ${w.countries.length} Play countries (go-live ∩ google_play=yes); via a parent's listing: ${w.viaParent.join(' ')}; not served: ${w.notServed.join(' ')}`)
  const tk = await token()
  const edit = await req('POST', `${API}/edits`, { token: tk, body: {} })
  let committed = false
  try {
    const track = await req('GET', `${API}/edits/${edit.id}/tracks/production`, { token: tk })
    const avail = await req('GET', `${API}/edits/${edit.id}/countryAvailability/production`, { token: tk })
    const now = (avail.countries || []).map(c => c.countryCode).sort()
    const add = w.countries.filter(c => !now.includes(c)), remove = now.filter(c => !w.countries.includes(c))
    console.log(`production releases: ${(track.releases || []).map(r => `${r.name || '(no name)'} [${r.status}] versionCodes ${(r.versionCodes || []).join(',')}${r.userFraction ? ' fraction ' + r.userFraction : ''}`).join('; ') || 'none'}`)
    console.log(`available now: ${now.length}${avail.restOfWorld ? ' + rest of world' : ''}; to add: ${add.join(' ') || 'none'}; to remove: ${remove.join(' ') || 'none'}`)
    if (!apply) { console.log('read-only: nothing changed (run with --apply)'); return }
    if (!add.length && !remove.length && !avail.restOfWorld) { console.log('already exactly the wanted set'); }
    else {
      const live = (track.releases || []).filter(r => r.status === 'inProgress')
      if (live.length !== 1 || (track.releases || []).some(r => r.status === 'completed')) {
        throw new Error('REFUSED: production has a completed release (or not exactly one inProgress release). The API sets countries only on an inProgress release, so doing it here would change the release. Set the countries by hand in Play Console (Production › Countries / regions) to the wanted list above; nothing was changed.')
      }
      // Send every release back exactly as read; only the inProgress one gains countryTargeting.
      const releases = track.releases.map(r => (r.status === 'inProgress' ? { ...r, countryTargeting: { countries: w.countries, includeRestOfWorld: false } } : r))
      await req('PUT', `${API}/edits/${edit.id}/tracks/production`, { token: tk, body: { track: 'production', releases } })
      await req('POST', `${API}/edits/${edit.id}:commit`, { token: tk })
      committed = true
    }
    // Read back in a fresh edit.
    const e2 = await req('POST', `${API}/edits`, { token: tk, body: {} })
    const back = await req('GET', `${API}/edits/${e2.id}/countryAvailability/production`, { token: tk })
    await req('DELETE', `${API}/edits/${e2.id}`, { token: tk })
    const after = (back.countries || []).map(c => c.countryCode).sort()
    const exact = after.join() === w.countries.join() && !back.restOfWorld
    console.log(`available after: ${after.length} — ${after.join(' ')}; exactly the wanted set: ${exact}`)
    fs.writeFileSync(OUT, JSON.stringify({ applied: true, at: new Date().toISOString(), package: PACKAGE, track: 'production', exact, countries: after,
      viaParent: w.viaParent, notServed: w.notServed, source: 'docs/world-countries-4/go-live.csv ∩ countries.csv google_play=yes' }, null, 1) + '\n')
    console.log('saved', path.relative(REPO, OUT))
  } finally {
    if (!committed) await req('DELETE', `${API}/edits/${edit.id}`, { token: tk }).catch(() => {})
  }
})().catch(e => { console.error(e.message); process.exit(1) })
