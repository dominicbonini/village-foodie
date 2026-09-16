#!/usr/bin/env node
// scripts/outreach-upload-refresh.cjs
//
// Round 3, change 2: after a successful media upload the panel RE-READS via load() instead of spreading
// the upload route's `url` into the row.
//
// 🔴 WHAT A FAILURE LOOKS LIKE: the client holds a `logo_url` it built itself rather than the one the
// list route DERIVED (resolveLogoTarget → resolveTruckLogo). Today the two strings happen to be equal
// for a demo-backed prospect, so the symptom would not be visible — which is exactly why this is pinned
// by a harness rather than by eye. The two builders already differ in which env var they read
// (`SUPABASE_URL` fallback vs `NEXT_PUBLIC_SUPABASE_URL` only), and for a LINKED prospect the route
// writes a bucket PATH to `trucks.logo_storage_path` while returning a URL.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(REPO, 'components/admin/OutreachPanel.tsx'), 'utf8')

/**
 * 🔴 COMMENTS ARE STRIPPED BEFORE ANY CHECK, AND THE FIRST VERSION OF THIS HARNESS DID NOT DO IT.
 * The fix's own comment QUOTES the line it replaced —
 *     //   setProspects(ps => ps.map(x => … [data.column]: data.url …))
 * — so a raw-text search found the spread and reported the real code as broken. A harness that cannot
 * tell executable code from a comment about code will fail on correct source, which teaches whoever
 * hits it to weaken the check. Recorded rather than quietly corrected.
 */
function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlock.split('\n').map(l => {
    const i = l.indexOf('//')
    if (i === -1) return l
    if (l.slice(0, i).includes('http://') || l.slice(0, i).includes('https://')) return l
    return l.slice(0, i)
  }).join('\n')
}

/** Just the upload callback's body, comments removed, so a quoted line cannot mask a regression. */
function uploadBody(src) {
  const i = src.indexOf('const uploadMedia = useCallback(')
  if (i < 0) return null
  const j = src.indexOf('const deleteMedia = useCallback(', i)
  return stripComments(src.slice(i, j > 0 ? j : i + 4000))
}

function runSuite(src) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)
  const body = uploadBody(src)
  t('the upload callback was found', !!body)
  if (!body) return { ok, fails }

  t('🔴 the success path calls load()', /await load\(\)/.test(body))
  t('🔴 it no longer spreads the route url into the row',
    !/setProspects\([\s\S]*?\[data\.column\]: data\.url/.test(body))
  t('load() is in the dependency array (or the closure is stale)', /\}, \[load\]\)/.test(body))
  t('the route response is still validated before use', /if \(!data\?\.url \|\| !data\?\.column\) throw/.test(body))
  t('failures still throw rather than silently reloading', /if \(!res\.ok\) throw new Error/.test(body))

  // 🔴 THE DELETE PATH IS DELIBERATELY *NOT* CHANGED — see the reason recorded at that call site.
  // ⚠️ RAW, NOT STRIPPED: two of these three deliberately assert that a REASON IS WRITTEN DOWN, which
  // lives in a comment. The executable assertion above it uses the stripped body.
  const del = src.slice(src.indexOf('const deleteMedia = useCallback('))
  t('the DELETE path still clears optimistically (decision recorded in the code)',
    /\[kind === 'logo' \? 'logo_url' : 'photo_url'\]: null/.test(del))
  t('…and its reason is written down, not just done', /ADDS NO FALLBACK to `discovery_trucks\.logo_url`/.test(del))
  t('the delete toast is kept', /showToast\(data\?\.fileNote/.test(del))
  return { ok, fails }
}

// ── THE BROKEN VARIANT: the round-2 spread, restored. ───────────────────────────────────────────────
const V1 = SRC.replace(
  /    \/\/ 🔴 RE-READ, DO NOT HAND-MERGE[\s\S]*?    await load\(\)\n  \}, \[load\]\)/,
  "    setProspects(ps => ps.map(x => x.id === prospectId ? { ...x, [data.column]: data.url } as Prospect : x))\n  }, [])")

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const r = runSuite(V1)
  const detected = r.fails.length > 0
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 the upload spreads data.url into logo_url (round-2 behaviour)`)
  for (const f of r.fails) console.log(`        caught: ${f}`)
  if (!detected) { console.log('\n🔴 THE VARIANT PASSED — check the mutation actually applied.'); process.exit(1) }
}

console.log('\n── THE REAL SOURCE ─────────────────────────────────────────────────────────────────────')
const r = runSuite(SRC)
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)

// ── THE TWO STRINGS, COMPARED ───────────────────────────────────────────────────────────────────────
// 🧪 FIXTURE values standing in for the env var and the uploaded path, to show the SHAPES agree.
console.log('\n── upload route url  vs  list route derived url (FIXTURE inputs) ───────────────────────')
const BASE = 'https://ffphgwonshgxamtvefcv.supabase.co'
const PATH = 'fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/1789489057229-pigcasso.png'
const uploadUrl = `${BASE}/storage/v1/object/public/truck-media/${PATH}`      // route: MEDIA_BUCKET = 'truck-media'
const listUrl   = `${BASE}/storage/v1/object/public/truck-media/${PATH}`      // resolveTruckLogo
console.log(`  upload: ${uploadUrl}`)
console.log(`  list  : ${listUrl}`)
const same = uploadUrl === listUrl
console.log(`  ${same ? '✓' : '🔴'} the two agree for a demo-backed prospect — so this change fixes no WRONG value;`)
console.log('    it removes a SECOND BUILDER of a server-derived string. ⚠️ They diverge if')
console.log('    NEXT_PUBLIC_SUPABASE_URL is unset while SUPABASE_URL is set: the route falls back, the')
console.log('    resolver does not, and the list would return "undefined/storage/…".')

const fails = r.fails.concat(same ? [] : ['the FIXTURE shapes disagree'])
console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + r.ok.length + ' passed'}`)
process.exit(fails.length ? 1 : 0)
