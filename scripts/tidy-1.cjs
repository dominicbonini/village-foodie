// scripts/tidy-1.cjs — tidy-1's proof (3 November 2026; docs/tidy-1-report.md): small outstanding fixes, no design or data change.
//
//   1 · the truck page on the HatchGrab host loads no Tally and offers no Village Foodie newsletter popup (form 81xAKx); Village
//       Foodie's truck pages are byte-identical to HEAD (6c29c2e2); the brand is decided on the server
//   (2 · the app claims — not done: Dominic, 3 November 2026, "dont do point 2. apps will be available shortly")
//   3 · the Privacy Policy's demo section: "simple counts", the two "If you sign up" sentences merged — English + 28, re-stamped
//   4 · the sweep's failures at HEAD settled (each harness's own fix; listed here)
//   5 · pricing-check-1.cjs registered
//   6 · dead code: the stray "page 2.tsx", the phantom is_test, getSlotIndicator / slot_capacity — each proved unreachable
//   7 · the Node version and its time-zone data (reported; engines set only with Node 24 to test under)
// The HEAD side of §1 is scripts/fixtures/tidy-1-identity.json, written by THIS script in a worktree of 6c29c2e2:
//   (in <dir>) HG_KIT_CACHE_SUFFIX=tidy1head node scripts/tidy-1.cjs capture <this repo>/scripts/fixtures/tidy-1-identity.json
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'tidy-1' })
const LP1E = require('./_lp1e-fixtures.cjs')
const IDENTITY = path.join(REPO, 'scripts/fixtures/tidy-1-identity.json')
const BASE = '6c29c2e2'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}`) } }
const head = s => console.log(`\n── ${s}`)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const atBase = f => { try { return execFileSync('git', ['show', `${BASE}:${f}`], { cwd: REPO, maxBuffer: 1 << 26 }).toString() } catch { return null } }

// ── §1's views: the public truck page, as Next serves it, on each host ──
const TRUCKS = {
  GB: { slug: 'harness-gb-truck', name: 'Harness Pizza Co', country: 'GB', type: 'Pizza', logo: '' },
  US: { slug: 'harness-us-truck', name: 'Harness Taco Co', country: 'US', type: 'Tacos', logo: '' },
}
async function truckViews(ctx) {
  const TP = await ctx.bundle('tidy1-truck', "export { default } from '@/app/trucks/[slug]/page'")
  const out = {}
  for (const host of ['www.villagefoodie.co.uk', 'www.hatchgrab.com']) {
    for (const cc of ['GB', 'US']) {
      const T = TRUCKS[cc]
      const req = { host, tables: { trucks: [{ id: `truck-${cc}`, slug: T.slug, name: T.name, country: T.country, logo_url: T.logo, is_active: true }] } }
      const data = { loading: false, loadError: null, refetch() {}, mapEvents: [],
        allTrucks: [{ cleanKey: T.slug, rawName: T.name, type: T.type, logoUrl: T.logo, menuUrl: '', phoneNumber: '', websiteUrl: '', orderUrl: null, country: T.country }] }
      const html = await kit.quietAsync(() => ctx.withReq(req, async () => {
        globalThis.__tcData = data
        try { return await ctx.prerender(kit.h(TP.default, { params: Promise.resolve({ slug: T.slug }) })) } finally { delete globalThis.__tcData }
      }))
      out[`truck:${host.includes('hatchgrab') ? 'hg' : 'vf'}:${cc}`] = html
    }
  }
  return out
}
if (process.argv[2] === 'capture') {
  (async () => {
    const v = await truckViews(LP1E.context(kit, REPO))
    const pages = Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith('truck:vf:')).map(([k, h]) => [k, { html: sha(h), tally: (h.match(/tally\.so/g) || []).length }]))
    fs.writeFileSync(process.argv[3], JSON.stringify({ $why: `tidy-1 §1: sha256 of Village Foodie's truck page (GB, US) as served at ${BASE}, by scripts/tidy-1.cjs capture.`, commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim(), pages }, null, 1) + '\n')
    console.log(`captured ${Object.keys(pages).length} views`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

;(async () => {
  const ctx = LP1E.context(kit, REPO)

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the truck page on hatchgrab.com: no Tally, no Village Foodie popup; Village Foodie byte-identical')
  const V = await truckViews(ctx)
  const want = fs.existsSync(IDENTITY) ? JSON.parse(fs.readFileSync(IDENTITY, 'utf8')) : null
  t('scripts/fixtures/tidy-1-identity.json exists (captured at HEAD)', !!want)
  if (want) for (const k of ['truck:vf:GB', 'truck:vf:US']) t(`${k}: byte-identical to ${want.commit}`, sha(V[k]) === want.pages[k]?.html, { now: sha(V[k]), head: want.pages[k] })
  t('Village Foodie\'s UK truck page still loads Tally and offers the newsletter (its own popup, unchanged)', /tally\.so\/widgets\/embed\.js/.test(V['truck:vf:GB']))
  for (const cc of ['GB', 'US']) t(`hatchgrab.com /trucks/<slug> (${cc}): no tally.so anywhere`, !!V[`truck:hg:${cc}`] && !/tally/i.test(V[`truck:hg:${cc}`]))
  const vfWords = JSON.parse(read('messages/en-GB.json')).siteFooter
  t('hatchgrab.com UK truck page: no newsletter block (its title, call to action and "no spam" line) and no floating weekly-schedule button', !V['truck:hg:GB'].includes(vfWords.cta) && !V['truck:hg:GB'].includes(vfWords.noSpam) && !V['truck:hg:GB'].includes(vfWords.title)
    && V['truck:vf:GB'].includes(vfWords.cta) && V['truck:vf:GB'].includes(vfWords.noSpam))
  t('…the footer\'s other links stay (contact, report an issue)', V['truck:hg:GB'].includes(vfWords.general) && V['truck:hg:GB'].includes(vfWords.reportIssue))
  const page = read('app/trucks/[slug]/page.tsx')
  t('decided on the server from the Host header (isHatchGrabHost, as app/contact/page.tsx): tally: false passed only on hatchgrab.com', /const onHatchGrab = isHatchGrabHost\(await requestHost\(\)\)/.test(page) && /\{\.\.\.\(onHatchGrab \? \{ tally: false \} : \{\}\)\}/.test(page))
  const walk = (d, o = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p, o); else if (/\.(tsx?)$/.test(e.name)) o.push(p) } return o }
  const withTally = ['app', 'components', 'lib'].flatMap(d => walk(d)).filter(f => /tally\.so/.test(read(f))).sort()
  t('every remaining tally.so is Village Foodie\'s (its /contact branch, the embed, the home page, /hire, the venue page, the truck page behind tally=false on HatchGrab)', JSON.stringify(withTally) === JSON.stringify(['app/contact/ContactForm.tsx', 'app/contact/page.tsx', 'app/hire/page.tsx', 'app/page.tsx', 'app/trucks/[slug]/TruckClient.tsx', 'app/venues/[slug]/VenueClient.tsx']), withTally)

  console.log(`\ntidy-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
