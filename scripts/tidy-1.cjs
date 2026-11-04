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

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the Privacy Policy\'s demo section: "simple counts", the two "If you sign up" sentences merged — English + 28')
  const T1 = require('./_lp-tidy-1.cjs')
  const en = read('content/legal/privacy-policy.md'), enBase = atBase('content/legal/privacy-policy.md')
  t('the English change is exactly these three edits (taken back, the document is 6c29c2e2\'s byte for byte)', T1.asBefore('content/legal/privacy-policy.md', en) === enBase)
  const demo = en.slice(en.indexOf('**If you try the HatchGrab demo**'), en.indexOf('**If you use our contact form**'))
  t('"We keep simple counts" — "anonymous counts" is gone', demo.includes('We keep simple counts of how far demos get') && !/anonymous counts/.test(en))
  t('one sentence starts "If you sign up" now, with the same two facts (the menu moves and the account\'s terms apply; the record kept up to 30 days, then deleted)', (demo.match(/If you sign up/g) || []).length === 1
    && demo.includes("If you sign up, your menu moves into your account and your account's privacy terms apply from then on; we keep the demo record for up to 30 days so the menu can move across, then delete it."))
  t('the rest of the section is unchanged (the counts still "contain no email address" and can no longer be linked to you)', demo.includes('They contain no email address, and once your demo is deleted they can no longer be linked to you.'))
  // ⚠️ RE-PINNED (paperwork-1, 4 November 2026): paperwork-1 re-dated the Privacy Policy 4 November 2026 later; its change is taken back
  // first (scripts/_lp-paperwork-1.cjs), so this checks tidy-1's own dates.
  const P1 = require('./_lp-paperwork-1.cjs')
  const legal = P1.asBefore('lib/legal.ts', read('lib/legal.ts'))
  t('PRIVACY_UPDATED \'3 November 2026\' and the document\'s own line; TERMS_VERSION \'2026-11-03\' (it moves with the latest document); the Terms\' dates unchanged', /export const PRIVACY_UPDATED = '3 November 2026'/.test(legal) && P1.asBefore('content/legal/privacy-policy.md', en).includes('**Last updated:** 3 November 2026')
    && /export const TERMS_VERSION = '2026-11-03'/.test(legal) && /export const TERMS_UPDATED = '1 November 2026'/.test(legal) && T1.asBefore('lib/legal.ts', read('lib/legal.ts')) === atBase('lib/legal.ts'))
  const L = require('./_legal-translations.cjs')
  const BASES = /export const LANGUAGE_BASES[^=]*=\s*\[([^\]]*)\]/.exec(read('lib/i18n/locales.ts'))[1].match(/'[^']+'/g).map(x => x.slice(1, -1))
  for (const l of BASES) {
    const tr = read(`content/legal/${l}/privacy-policy.md`), old = atBase(`content/legal/${l}/privacy-policy.md`).split('\n')
    // ⚠️ RE-PINNED (paperwork-1, 4 November 2026): paperwork-1's own paragraph (section 3, compliance documents) is set aside by name.
    const changed = tr.split('\n').slice(1).filter(x => !old.includes(x) && !P1.isTranslationParagraph(tr, x))
    t(`${l}: re-stamped, the drift check clean; exactly the demo section's two paragraphs changed (the 30 days kept)`, L.compare('privacy-policy.md', tr).length === 0 && changed.length === 2 && changed.some(x => /\b30\b/.test(x)), changed.map(x => x.slice(0, 80)))
  }
  t('demo-2\'s drift check reads the merged sentence (still tied to CLAIM_GRACE_DAYS = 30)', read('scripts/demo-2.cjs').includes("we keep the demo record for up to 30 days so the menu can move across, then delete it."))

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the sweep\'s failures at HEAD — settled (code wrong: fixed; test stale: updated, each with why and which commit)')
  const ca = JSON.parse(read('messages/en-CA.json')), ch = JSON.parse(read('messages/de-CH.json'))
  t('canada-1 (CODE): Canadian English says "card terminal" — en-CA now overrides the comparison wording that said "card reader" (7d879790)', ca.comparison?.features?.terminal?.explain === 'The vendor provides a card terminal for payments at the truck.')
  t('europe-languages-1 (CODE): Swiss German has no "ß" — de-CH now overrides the comparison wording "Größen, Soßen …"', ch.comparison?.features?.options?.explain === 'Grössen, Saucen und Extras, auch Pflichtauswahl.' && !/ß/.test(JSON.stringify(ch)))
  t('schedule-graphics-places (TEST): lib/pricing-check.ts left the list, stale since a21e868a removed its KEY_FEATURES row', /STALE since a21e868a/.test(read('scripts/schedule-graphics-places.cjs')) && !/schedule_graphics/.test(read('lib/pricing-check.ts')))
  t('world-countries-1 (TEST): its two tagline harness files excluded, stale since 2b625a66 committed them with the check', /STALE since 2b625a66/.test(read('scripts/world-countries-1.cjs')))
  t('world-countries-2 (TEST): its "HEAD" is 3240c536 by name, stale since 2b625a66 committed it with its own changes', /git show 3240c536:/.test(read('scripts/world-countries-2.cjs')))

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · pricing-check-1.cjs is registered')
  t('pricing-check-1.cjs is in harnesses.json\'s list (since 8fd3ba83, 29 October) — nothing to add', JSON.parse(read('scripts/harnesses.json')).harnesses.includes('pricing-check-1.cjs'))

  // ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · dead code — only what is provably unused')
  const tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n')
  t('"app/manage/[token]/page 2.tsx" does not exist (not on disk, not tracked) — already gone', !fs.existsSync(path.join(REPO, 'app/manage/[token]/page 2.tsx')) && !tracked.some(f => / 2\.tsx$/.test(f)))
  const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const src = tracked.filter(f => /^(app|lib|components|hooks)\/.*\.(ts|tsx)$/.test(f) || f === 'proxy.ts')
  const isTestCode = src.filter(f => /\bis_test\b/.test(code(f)))
  t('no code reads a trucks.is_test: every is_test in code is outreach_messages\' own column (20260928_outreach_messages.sql)', isTestCode.every(f => /outreach|ProspectWorkspace|ComposeWindow|ProspectTimeline/.test(f))
    && /is_test boolean not null default false/.test(read('supabase/migrations/20260928_outreach_messages.sql')) && !src.some(f => /trucks?[^\n]{0,80}\bis_test\b/.test(code(f))), isTestCode)
  t('getSlotIndicator is gone — no definition and no caller anywhere in the code', !src.some(f => /getSlotIndicator/.test(code(f))) && !tracked.filter(f => /^scripts\/.*\.cjs$/.test(f) && f !== 'scripts/tidy-1.cjs').some(f => /getSlotIndicator/.test(read(f))))
  t('lib/slot-indicator.ts keeps only the SlotTone type its two importers use', /export type SlotTone = 'green' \| 'amber' \| 'red'/.test(read('lib/slot-indicator.ts')) && !/export function/.test(read('lib/slot-indicator.ts'))
    && /import type \{ SlotTone \} from '@\/lib\/slot-indicator'/.test(read('lib/slot-availability.ts')) && /import type \{ SlotTone \} from '@\/lib\/slot-indicator'/.test(read('lib/slot-display.ts')))
  t('slot_capacity STAYS — it has live callers that write truck data (Manage\'s save_slot_capacity, the event save, demo provisioning and restart)', /if \(action === 'save_slot_capacity'\)/.test(read('app/api/manage/route.ts')) && /from\('slot_capacity'\)/.test(read('lib/provision-demo-event.ts')) && /from\('slot_capacity'\)/.test(read('lib/demo-restart.ts')))

  // ══ 7 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the Node version Vercel builds with, and its time-zone data')
  const pkg = JSON.parse(read('package.json'))
  t('package.json engines.node is "24.x" — Vercel builds on the newest Node 24 patch (24.22.1+ carries tzdb 2026e)', pkg.engines?.node === '24.x')
  t('nothing else pins a version (.nvmrc, vercel.json) that could contradict it', !fs.existsSync(path.join(REPO, '.nvmrc')) && !/node/i.test(JSON.stringify(JSON.parse(read('vercel.json')).functions ?? {})))
  t('the build still prints the time-zone line first (prebuild → scripts/check-tzdata.cjs), so the Vercel log shows "present" or not', /check-tzdata\.cjs/.test(pkg.scripts?.prebuild ?? ''))
  console.log(`  (this run: Node ${process.version}, tz data ${process.versions.tz})`)

  console.log(`\ntidy-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
