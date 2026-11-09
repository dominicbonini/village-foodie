// scripts/ios/asc.cjs — ios-intl-1 (9 November 2026; docs/ios-intl-1-report.md): the ONE App Store Connect API client every upload and
// listing script uses. A MODULE.
//
// 🔴 ITS SETTINGS LIVE OUTSIDE THE REPOSITORY, in ~/.appstoreconnect/hatchgrab-asc.json (chmod 600):
//      { "ASC_KEY_ID": "…", "ASC_ISSUER_ID": "…", "ASC_KEY_PATH": "~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8" }
//    — never in a .env file (the manual's standing rule: an agent never opens any .env* file) and never in git. The private key is read
//    only to sign a short-lived token; neither the key nor a token is ever printed or written anywhere.
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const https = require('https')

const CONFIG = path.join(os.homedir(), '.appstoreconnect', 'hatchgrab-asc.json')
const APP_ID = '6803543106'   // com.hatchgrab.app

function settings() {
  if (!fs.existsSync(CONFIG)) throw new Error(`missing ${CONFIG} — see the header of scripts/ios/asc.cjs`)
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  for (const k of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_PATH']) if (!c[k]) throw new Error(`${CONFIG} has no ${k}`)
  return { ...c, ASC_KEY_PATH: c.ASC_KEY_PATH.replace(/^~(?=\/)/, os.homedir()) }
}

const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
let cached = null
function token() {
  if (cached && Date.now() - cached.at < 15 * 60e3) return cached.tok
  const s = settings(), now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'ES256', kid: s.ASC_KEY_ID, typ: 'JWT' }), body = b64({ iss: s.ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: fs.readFileSync(s.ASC_KEY_PATH), dsaEncoding: 'ieee-p1363' }).toString('base64url')
  cached = { tok: `${head}.${body}.${sig}`, at: Date.now() }
  return cached.tok
}

/** One request. `body` is JSON unless `opts.raw` (a Buffer, sent as is to an upload URL with `opts.headers`). A dropped connection
 *  (ECONNRESET, a socket hang-up, a timeout) is retried up to three times; an HTTP answer of any status is returned as it is. */
async function req(method, p, body, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await once(method, p, body, opts) } catch (e) {
      if (attempt >= 4 || !/ECONNRESET|socket hang up|ETIMEDOUT|EPIPE|EAI_AGAIN|timed out/i.test(e.message)) throw e
      await new Promise(r => setTimeout(r, 1500 * attempt))
    }
  }
}
function once(method, p, body, opts) {
  return new Promise((resolve, reject) => {
    const url = p.startsWith('http') ? new URL(p) : new URL('https://api.appstoreconnect.apple.com' + p)
    const data = body === undefined || body === null ? null : (opts.raw ? body : Buffer.from(JSON.stringify(body)))
    const headers = opts.raw ? { ...(opts.headers || {}) } : { Authorization: `Bearer ${token()}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }
    if (data) headers['Content-Length'] = data.length
    const r = https.request(url, { method, headers }, resp => {
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => { const t = Buffer.concat(chunks).toString(); let j = null; try { j = t ? JSON.parse(t) : null } catch { j = t } resolve({ status: resp.statusCode, body: j }) })
    })
    r.on('error', reject)
    r.setTimeout(120000, () => r.destroy(new Error('timed out')))
    if (data) r.write(data)
    r.end()
  })
}

/** Every page of a list: { status, data, included }. */
async function all(p) {
  let data = [], included = [], next = p
  while (next) {
    const r = await req('GET', next)
    if (r.status !== 200) return { status: r.status, body: r.body, data, included }
    data = data.concat(r.body.data); included = included.concat(r.body.included || []); next = r.body.links?.next
  }
  return { status: 200, data, included }
}

/** Throws with Apple's own error text unless the status is one of `ok`. */
function must(r, what, ok = [200, 201, 204]) {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body?.errors?.map(e => `${e.code}: ${e.detail}`) ?? r.body).slice(0, 600)}`)
  return r.body
}

module.exports = { APP_ID, CONFIG, settings, req, all, must, get: p => req('GET', p) }
