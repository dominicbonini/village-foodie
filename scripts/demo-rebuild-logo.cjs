#!/usr/bin/env node
// scripts/demo-rebuild-logo.cjs — a rebuilt demo carries the prospect's CURRENT logo, and the modal's
// "unbranded" warning tells the truth in every case.
//   node scripts/demo-rebuild-logo.cjs      (≈ 8 s: one compile, an in-memory Supabase and storage)
//
// 🔴 FAILURE MODE: `copyDemoLogo` was guarded by `!input.existingTruckId` — "first run only" — so a rebuild
//    never re-copied. Two consequences, both observed:
//      • the modal said "This demo is unbranded — no logo was copied" over a demo that was displaying its
//        logo perfectly, because `logoStoragePath` was never filled in on that path; and
//      • a prospect whose logo was ADDED or CHANGED since their first demo got a rebuild still branded with
//        the old one, or with none.
// ⚠️ THE GUARD WAS PROTECTING SOMETHING REAL, AND THIS KEEPS IT. A `static` source uploads a fresh
//    `<truckId>/<epoch>-<file>` object every run, so re-copying unconditionally would leave one orphan per
//    rebuild in `truck-media`. `demoLogoUpToDate` is that protection made precise: skip when the truck
//    already holds exactly what the source would produce, and only then.
//
// HOW: the REAL `copyDemoLogo`, `demoLogoUpToDate` and `classifyDemoLogoSource` compiled from lib/, against
// an in-memory Supabase whose `storage.upload` COUNTS — so "did no copying work" is observed, not asserted.
// Nothing here touches the database, the bucket or the network.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

const TRUCK = 'demo-abc123'
// 🔴 THE ORIGIN IS SET HERE, BEFORE THE MODULE IS COMPILED AND REQUIRED. `classifyDemoLogoSource` decides
// whether a URL is OURS from `ownStorageOrigins(process.env)`; with no origin set, every absolute URL is
// `refused` — which quietly turned the first draft of this harness into a test of the refused branch, with
// both broken variants "failing" for the wrong reason. A fixed fake project keeps it deterministic.
const PROJECT = 'https://demo-project.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT
const BUCKET_URL = `${PROJECT}/storage/v1/object/public/truck-media`
/** Two different prospect logos, as `discovery_trucks.logo_url` actually stores them. */
const OLD_LOGO = `${BUCKET_URL}/discovery/old-logo.png`
const NEW_LOGO = `${BUCKET_URL}/discovery/new-logo.png`

function fakeSupabase(truckRow) {
  const uploads = []
  const updates = []
  return {
    truck: truckRow, uploads, updates,
    from() {
      const q = { f: [], payload: null, op: 'select' }
      const api = {
        select() { return api }, update(p) { q.op = 'update'; q.payload = p; return api },
        eq(k, v) { q.f.push([k, v]); return api },
        maybeSingle() { return Promise.resolve({ data: { ...truckRow }, error: null }) },
        single() { return Promise.resolve({ data: { ...truckRow }, error: null }) },
        then(res) {
          if (q.op === 'update') { updates.push({ ...q.payload }); Object.assign(truckRow, q.payload) }
          return Promise.resolve({ data: null, error: null }).then(res)
        },
      }
      return api
    },
    storage: {
      from() {
        return { upload: async (objectPath) => { uploads.push(objectPath); return { error: null } } }
      },
    },
  }
}

;(async () => {
  const build = (root, tag) => compile(root, ['lib/demo-logo.ts'], tag).req('lib/demo-logo.js')

  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `drl-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/demo-logo.ts'); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return { tmp, L: build(tmp, tag) }
  }
  {
    // V1 — THE GUARD RESTORED, as "never re-copy on a rebuild": every rebuild reports the stored value and
    // the changed logo never lands. This is the shape the code had, expressed inside copyDemoLogo.
    const v = variant('v1', src => src.replace(
      '  if (rebuilding && demoLogoUpToDate(source, truckId, existing)) {',
      '  if (rebuilding) {'))
    const truck = { id: TRUCK, logo_storage_path: 'discovery/old-logo.png', qr_code_style: 'branded' }
    const sb = fakeSupabase(truck)
    const r = await v.L.copyDemoLogo(sb, TRUCK, NEW_LOGO, { existing: truck.logo_storage_path })
    const stale = r.logoStoragePath === 'discovery/old-logo.png' && truck.logo_storage_path === 'discovery/old-logo.png'
    console.log(`  ${stale ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 the guard restored: after a logo CHANGE the demo still holds ${JSON.stringify(r.logoStoragePath)}`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!stale) process.exit(1)
  }
  {
    // V2 — THE WARNING RAISED WHEN A LOGO IS PRESENT: the unchanged case reporting null, which is exactly
    // what the modal reads to decide "This demo is unbranded".
    const v = variant('v2', src => src.replace(
      '    return { logoStoragePath: existing, source, unchanged: true }',
      '    return { logoStoragePath: null, source, unchanged: true }'))
    const truck = { id: TRUCK, logo_storage_path: 'discovery/old-logo.png', qr_code_style: 'branded' }
    const r = await v.L.copyDemoLogo(fakeSupabase(truck), TRUCK, OLD_LOGO, { existing: truck.logo_storage_path })
    const lies = r.logoStoragePath === null && truck.logo_storage_path === 'discovery/old-logo.png'
    console.log(`  ${lies ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 the unchanged case reporting null: the modal would call a branded demo unbranded`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!lies) process.exit(1)
  }

  const L = build(REPO, 'drlReal')

  console.log('\n── A REBUILD AFTER A LOGO CHANGE ────────────────────────────────────────────────────────')
  {
    const truck = { id: TRUCK, logo_storage_path: 'discovery/old-logo.png', qr_code_style: 'branded' }
    const sb = fakeSupabase(truck)
    const r = await sb && await L.copyDemoLogo(sb, TRUCK, NEW_LOGO, { existing: truck.logo_storage_path })
    check(r.logoStoragePath === 'discovery/new-logo.png', `the demo now holds the NEW logo: ${JSON.stringify(r.logoStoragePath)}`)
    check(truck.logo_storage_path === 'discovery/new-logo.png', 'and trucks.logo_storage_path was written')
    check(!r.unchanged && !r.cleared && !r.error, 'reported as a real copy — not unchanged, not cleared, no error')
  }

  console.log('\n── A REBUILD WITH AN UNCHANGED LOGO DOES NO WORK ────────────────────────────────────────')
  {
    const truck = { id: TRUCK, logo_storage_path: 'discovery/old-logo.png', qr_code_style: 'branded' }
    const sb = fakeSupabase(truck)
    const r = await L.copyDemoLogo(sb, TRUCK, OLD_LOGO, { existing: truck.logo_storage_path })
    check(r.unchanged === true && r.logoStoragePath === 'discovery/old-logo.png', 'the same logo is recognised and kept')
    check(sb.uploads.length === 0 && sb.updates.length === 0, `no upload and no write: ${sb.uploads.length} upload(s), ${sb.updates.length} update(s)`)
  }
  {
    // …and the STATIC case, which is the one the old guard existed to protect: its path carries the upload
    // timestamp, so it cannot be compared by string.
    const stored = `${TRUCK}/1758300000000-pizza.png`
    check(L.demoLogoUpToDate({ kind: 'static', file: 'pizza.png' }, TRUCK, stored) === true,
      'a static logo is recognised by the truck prefix and the file name, not by the timestamp in the path')
    check(L.demoLogoUpToDate({ kind: 'static', file: 'burger.png' }, TRUCK, stored) === false,
      'a DIFFERENT static file is not mistaken for it')
    check(L.demoLogoUpToDate({ kind: 'static', file: 'pizza.png' }, 'demo-other', stored) === false,
      "and another truck's object is not either")
  }

  console.log('\n── THE FIVE CASES THE WARNING MUST GET RIGHT ────────────────────────────────────────────')
  {
    // The modal raises "This demo is unbranded — no logo was copied" on `!logoStoragePath`, and prints
    // `logoNote` beneath it. So the assertion is on what provisionDemo would put in each.
    const cases = []
    // 1 · no logo anywhere
    {
      const truck = { id: TRUCK, logo_storage_path: null, qr_code_style: 'standard' }
      const r = await L.copyDemoLogo(fakeSupabase(truck), TRUCK, null, {})
      cases.push(['no logo anywhere (first build)', r, truck])
      check(r.logoStoragePath === null && r.source.kind === 'none' && !r.cleared, 'no logo anywhere → nothing stored, source "none" — the warning shows')
    }
    // 2 · copied on the first build
    {
      const truck = { id: TRUCK, logo_storage_path: null, qr_code_style: 'standard' }
      const r = await L.copyDemoLogo(fakeSupabase(truck), TRUCK, OLD_LOGO, {})
      check(r.logoStoragePath === 'discovery/old-logo.png' && !r.error, 'copied on the first build → stored — no warning')
    }
    // 3 · a logo ADDED before a rebuild
    {
      const truck = { id: TRUCK, logo_storage_path: null, qr_code_style: 'standard' }
      const r = await L.copyDemoLogo(fakeSupabase(truck), TRUCK, NEW_LOGO, { existing: null })
      check(r.logoStoragePath === 'discovery/new-logo.png' && truck.logo_storage_path === 'discovery/new-logo.png',
        'a logo ADDED before a rebuild → copied now — the warning stops showing')
    }
    // 4 · a logo CHANGED before a rebuild — covered above; asserted again as the warning's input
    {
      const truck = { id: TRUCK, logo_storage_path: 'discovery/old-logo.png', qr_code_style: 'branded' }
      const r = await L.copyDemoLogo(fakeSupabase(truck), TRUCK, NEW_LOGO, { existing: truck.logo_storage_path })
      check(!!r.logoStoragePath && r.logoStoragePath !== 'discovery/old-logo.png', 'a logo CHANGED before a rebuild → the new one is stored — no warning')
    }
    // 5 · the prospect's logo REMOVED before a rebuild
    {
      const truck = { id: TRUCK, logo_storage_path: 'discovery/old-logo.png', qr_code_style: 'branded' }
      const sb = fakeSupabase(truck)
      const r = await L.copyDemoLogo(sb, TRUCK, null, { existing: truck.logo_storage_path })
      check(r.cleared === true && r.logoStoragePath === null, 'the prospect\'s logo REMOVED → the demo\'s is removed too, and the warning shows again')
      check(truck.logo_storage_path === null && truck.qr_code_style === 'standard',
        `§4 the QR plate follows: logo_storage_path null and qr_code_style ${JSON.stringify(truck.qr_code_style)} — the branded composite cannot render with an empty centre`)
    }
    // …and the sixth, which is not one of the five but must not regress: a REFUSED source keeps what works.
    {
      const truck = { id: TRUCK, logo_storage_path: 'discovery/old-logo.png', qr_code_style: 'branded' }
      const r = await L.copyDemoLogo(fakeSupabase(truck), TRUCK, 'https://someone-else.example/logo.png', { existing: truck.logo_storage_path })
      check(r.source.kind === 'refused' && r.logoStoragePath === 'discovery/old-logo.png' && truck.logo_storage_path === 'discovery/old-logo.png',
        'a REFUSED source leaves the working brand alone and says why — it is not evidence the logo changed')
    }
    void cases
  }

  console.log('\n── THE FIRST BUILD IS UNCHANGED ─────────────────────────────────────────────────────────')
  {
    // No `existing` ⇒ not rebuilding ⇒ exactly the old behaviour, including for "none".
    const truck = { id: TRUCK, logo_storage_path: 'should-not-be-touched', qr_code_style: 'branded' }
    const sb = fakeSupabase(truck)
    const r = await L.copyDemoLogo(sb, TRUCK, null, {})
    check(r.logoStoragePath === null && !r.cleared && truck.logo_storage_path === 'should-not-be-touched',
      'a FIRST build with no logo records null and clears nothing — only a rebuild may remove a logo')
  }

  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ a rebuild carries the prospect\'s current logo, skips the work when it has not changed, and the warning is true in every case')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('HARNESS THREW', e); process.exit(1) })
