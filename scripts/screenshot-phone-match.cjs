#!/usr/bin/env node
// scripts/screenshot-phone-match.cjs — a phone number alone never decides which prospect a screenshot is
// (docs/outreach-screenshot-match-report.md, 15 October 2026).
//
//   node scripts/screenshot-phone-match.cjs
//
// 🔴 THE INCIDENT. Smash and Grab's Facebook page was dropped on the Screenshots tab. Its mobile is shared with
// Tacoman (one owner, two trucks), the matcher took the phone hit as definite, and Smash and Grab's email and
// Instagram were written onto Tacoman.
//
// 🔴 THE METHOD. The REAL admin route is bundled (scripts/_render-kit.cjs) and run end to end against an
// in-memory database (scripts/_fake-pg.cjs) that records every write. Gemini is stubbed by prompt; nothing
// reaches a network, no email is sent, and every truck here is made up (07700 900xxx is Ofcom's drama range).
// Each case is ONE function. It must PASS on the real code and FAIL on a broken variant — the same route
// bundled with one plausible mistake patched in — so a check that cannot fail is caught here, not trusted.

const path = require('path'); const fs = require('fs')
const kit = require('./_render-kit.cjs')({ cacheTag: 'screenshot-phone-match' })
const { REPO } = kit
const { makeFakePg, KEYS_AFTER, COUNTRY_DEFAULTS } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

process.env.GEMINI_API_KEY = 'harness-gemini'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.SUPABASE_URL = 'http://127.0.0.1:9'

const STUBS = {
  '@/lib/email': `export async function sendConfirmationEmail(m) { (globalThis.__emails = globalThis.__emails || []).push({ to: m.to, subject: m.subject }) ; return { ok: true } }`,
  '@/lib/auth/admin': `export async function verifyAdmin() { return true }`,
}
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

/* ─────────────────────────── A MADE-UP WORLD ─────────────────────────── */
const TACO = {
  id: 't-taco', name: 'Taco Fixture', country: 'GB', contact_email: null, phone: '07700 900123', mobile: null,
  website: null, facebook_url: null, instagram_url: null, show_on_vf: true, show_on_hg: true, excluded: false,
}
const MAILVAN = {
  id: 't-mail', name: 'Saved Mail Van', country: 'GB', contact_email: 'old@savedmail.example', phone: null, mobile: null,
  website: 'savedmail.example', facebook_url: null, instagram_url: null, show_on_vf: true, show_on_hg: true, excluded: false,
}
function world() {
  const pg = makeFakePg({
    discovery_trucks: [TACO, MAILVAN],
    // ⚠️ The fake does not resolve embedded selects, so each prospect carries its truck (as _fake-pg.cjs says).
    outreach_prospects: [
      { id: 'p-taco', discovery_truck_id: 't-taco', stage: 'not_contacted', notes: null, truck: { ...TACO } },
      { id: 'p-mail', discovery_truck_id: 't-mail', stage: 'not_contacted', notes: null, truck: { ...MAILVAN } },
    ],
    outreach_events: [], screenshot_log: [],
    country_settings: [snake(SEEDS.gbFromSeed())],
    discovery_exclusion_terms: [{ id: 'x1', term: 'Quiz Night', term_key: 'quiz night', country: 'GB' }],
  }, { keys: KEYS_AFTER, defaults: COUNTRY_DEFAULTS })
  globalThis.__harnessDb = pg
  return pg
}
/** The writes that matter: anything on a truck, a prospect or the prospect history. The log line is a record. */
const dataWrites = pg => pg.writes.filter(w => ['discovery_trucks', 'outreach_prospects', 'outreach_events'].includes(w.table))

/* ─────────────────────────── THE ROUTE, AND ITS BROKEN VARIANTS ─────────────────────────── */
const ENTRY = `export { POST } from '@/app/api/admin/screenshot-events/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`
const VARIANTS = {
  // V1 — the code before this fix: a phone hit is definite whatever the name says.
  phoneDecides: [{ file: 'lib/admin/truck-details.ts', from: "if (h.on === 'phone') {", to: "if (false) {" }],
  // V2 — over-correction: every phone hit asks, even when the names agree.
  phoneAlwaysAsks: [{ file: 'lib/admin/truck-details.ts', from: 'if (!dn || dn !== rn) {', to: 'if (true) {' }],
  // V3 — fill overwrites: a saved value that differs is replaced without asking.
  overwrites: [{ file: 'lib/admin/truck-details.ts', from: 'if (isBlank(saved)) { fills[field] = found; continue }', to: '{ fills[field] = found; continue }' }],
  // V3b — "Replace" trusts the browser: the saved value the admin was shown is not re-checked.
  replaceTrustsBrowser: [{ file: 'lib/admin/truck-details.ts', from: "if (c.saved.toLowerCase() !== String(a.saved ?? '').trim().toLowerCase()) {", to: 'if (false) {' }],
  // V4 — "Different truck — add as new" fills the matched prospect instead of creating one.
  addAsNewFills: [{ file: 'app/api/admin/screenshot-events/route.ts', from: 'const f = await addAsNewTruck(db, reDetails, country.code)', to: "const f = await fillConfirmedTruck(db, (await matchRows(true, country.code)).rows.find(r => r.prospect_id === 'p-taco')!, reDetails)" }],
}
const bundles = {}
async function routeFor(variant) {
  if (!bundles[variant]) bundles[variant] = await kit.bundle(`shots-${variant}`, ENTRY, { stubs: STUBS, patches: variant === 'real' ? [] : VARIANTS[variant] })
  bundles[variant].clearCountrySettingsCache?.()
  return bundles[variant]
}

/* ─────────────────────────── DRIVING IT ─────────────────────────── */
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const URL_ = 'http://127.0.0.1:3999/api/admin/screenshot-events'
function stubGemini(details) {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (!u.includes('generativelanguage')) throw new Error(`harness: unexpected request to ${u}`)
    const text = JSON.parse(init.body).contents[0].parts.find(p => p.text)?.text ?? ''
    const out = /"kind"/.test(text) ? { kind: 'truck_details' } : details
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}
async function upload(M, details) {
  stubGemini(details)
  const fd = new FormData()
  fd.append('files', new File([Buffer.from('not-really-a-png')], 'shot.png', { type: 'image/png' }))
  fd.append('waiting', '0'); fd.append('consecutiveNonContent', '0'); fd.append('country', 'GB')
  const res = await kit.quietAsync(() => M.POST(new NextRequest(URL_, { method: 'POST', body: fd })))
  return (await res.json()).results?.[0] ?? {}
}
async function decide(M, body) {
  const res = await kit.quietAsync(() => M.POST(new NextRequest(URL_, { method: 'POST', body: JSON.stringify({ country: 'GB', fileName: 'shot.png', fileSize: 1, ...body }), headers: { 'content-type': 'application/json' } })))
  return { status: res.status, body: await res.json() }
}

// The Smash-and-Grab shape, made up: another truck's page, the shared number, its own email and Instagram.
const OTHER_TRUCK = { name: 'Grab Fixture Truck', phone: '+44 7700 900123', email: 'info@grabfixture.example', instagram: '@grabfixture', area: 'Cambridge' }

/* ─────────────────────────── THE CASES ─────────────────────────── */
const CASES = [
  {
    name: 'phone matches + different name ⇒ asks the question, and writes nothing',
    broken: 'phoneDecides',
    async run(M) {
      const pg = world()
      const r = await upload(M, OTHER_TRUCK)
      const want = 'This number belongs to Taco Fixture. The screenshot says Grab Fixture Truck. Is this Taco Fixture, or a different truck?'
      const checks = {
        outcome: r.outcome === 'needs_a_look', ask: r.ask === 'phone_only', question: r.summary === want,
        candidate: r.candidates?.length === 1 && r.candidates[0].prospect_id === 'p-taco',
        noWrites: dataWrites(pg).length === 0,
        tacoUntouched: pg.tables.discovery_trucks.find(t => t.id === 't-taco').contact_email === null,
      }
      return checks
    },
  },
  {
    name: 'phone matches + NO name on the screenshot ⇒ asks too, and writes nothing',
    broken: 'phoneDecides',
    async run(M) {
      const pg = world()
      const r = await upload(M, { phone: '07700 900123', email: 'someone@grabfixture.example' })
      return {
        outcome: r.outcome === 'needs_a_look' && r.ask === 'phone_only',
        question: r.summary === 'This number belongs to Taco Fixture. The screenshot shows no name. Is this Taco Fixture, or a different truck?',
        noWrites: dataWrites(pg).length === 0,
      }
    },
  },
  {
    name: 'name and phone match ⇒ fills as before (empty fields only, matched on phone number)',
    broken: 'phoneAlwaysAsks',
    async run(M) {
      const pg = world()
      const r = await upload(M, { name: 'Taco Fixture', phone: '07700 900123', email: 'hola@tacofixture.example', instagram: '@tacofixture' })
      const upd = pg.writes.find(w => w.table === 'discovery_trucks' && w.op === 'update')
      const hist = pg.tables.outreach_events.find(e => e.prospect_id === 'p-taco')
      return {
        outcome: r.outcome === 'updated' && r.prospectId === 'p-taco',
        patch: !!upd && upd.ids[0] === 't-taco' && upd.patch.contact_email === 'hola@tacofixture.example'
          && upd.patch.instagram_url === 'https://www.instagram.com/tacofixture' && !('phone' in upd.patch),
        // the number sat in `phone`, so the empty `mobile` is filled too — exactly what the Tacoman fill did
        summary: r.summary === 'Added email hola@tacofixture.example, mobile 07700 900123, Instagram link https://www.instagram.com/tacofixture · matched on phone number',
        history: hist?.body === `Filled from a screenshot — ${r.summary}`,
      }
    },
  },
  {
    name: 'name matches (no phone) ⇒ fills as before',
    broken: null,
    async run(M) {
      const pg = world()
      const r = await upload(M, { name: 'taco fixture', email: 'hola@tacofixture.example' })
      const upd = pg.writes.find(w => w.table === 'discovery_trucks' && w.op === 'update')
      return { outcome: r.outcome === 'updated', patch: upd?.patch?.contact_email === 'hola@tacofixture.example', on: /matched on name$/.test(r.summary || '') }
    },
  },
  {
    name: 'an existing email that differs is NOT overwritten — it is shown old → new to confirm',
    broken: 'overwrites',
    async run(M) {
      const pg = world()
      const r = await upload(M, { website: 'savedmail.example', email: 'new@savedmail.example', instagram: '@savedmail' })
      const upd = pg.writes.filter(w => w.table === 'discovery_trucks' && w.op === 'update')
      return {
        outcome: r.outcome === 'updated' && r.prospectId === 'p-mail',
        emailKept: upd.every(w => !('contact_email' in w.patch)) && pg.tables.discovery_trucks.find(t => t.id === 't-mail').contact_email === 'old@savedmail.example',
        emptyFilled: upd.some(w => w.patch.instagram_url === 'https://www.instagram.com/savedmail'),
        asked: r.conflicts?.length === 1 && r.conflicts[0].field === 'contact_email'
          && r.conflicts[0].line === 'Email: old@savedmail.example → new@savedmail.example',
      }
    },
  },
  {
    name: '"Replace" writes only the confirmed field, and only if the saved value is still the one shown',
    broken: 'replaceTrustsBrowser',
    async run(M) {
      const details = { contact_email: 'new@savedmail.example' }
      // a stale confirmation (the admin was shown a different saved value) is refused and writes nothing
      let pg = world()
      const stale = await decide(M, { action: 'replace_fields', prospectId: 'p-mail', details, fields: [{ field: 'contact_email', saved: 'someone-else@savedmail.example' }] })
      const staleOk = stale.status === 200 && stale.body.outcome === 'nothing_new' && dataWrites(pg).length === 0
      // the real confirmation replaces it and says so in the history
      pg = world()
      const res = await decide(M, { action: 'replace_fields', prospectId: 'p-mail', details, fields: [{ field: 'contact_email', saved: 'old@savedmail.example' }] })
      const upd = pg.writes.find(w => w.table === 'discovery_trucks' && w.op === 'update')
      const hist = pg.tables.outreach_events.find(e => e.prospect_id === 'p-mail')
      return {
        staleRefused: staleOk,
        replaced: res.body.outcome === 'updated' && JSON.stringify(upd?.patch) === JSON.stringify({ contact_email: 'new@savedmail.example' }),
        history: hist?.body === 'Filled from a screenshot — Replaced email old@savedmail.example → new@savedmail.example · confirmed by hand',
      }
    },
  },
  {
    name: '"Different truck — add as new" creates a new hidden prospect and leaves the matched one alone',
    broken: 'addAsNewFills',
    async run(M) {
      const pg = world()
      const res = await decide(M, { action: 'add_as_new', details: { name: 'Grab Fixture Truck', mobile: '07700 900123', contact_email: 'info@grabfixture.example', instagram_url: 'https://www.instagram.com/grabfixture' } })
      const truck = pg.writes.find(w => w.table === 'discovery_trucks' && w.op === 'insert')
      const prospect = pg.writes.find(w => w.table === 'outreach_prospects' && w.op === 'insert')
      return {
        outcome: res.body.outcome === 'new_truck',
        truck: !!truck && truck.row.name === 'Grab Fixture Truck' && truck.row.show_on_vf === false && truck.row.show_on_hg === false
          && truck.row.contact_email === 'info@grabfixture.example' && truck.row.mobile === '07700 900123',
        prospect: !!prospect && prospect.row.discovery_truck_id === truck?.id && prospect.row.stage === 'not_contacted',
        tacoUntouched: !pg.writes.some(w => w.table === 'discovery_trucks' && w.op === 'update' && w.ids.includes('t-taco')),
      }
    },
  },
]

/* ─────────────────────────── RUN ─────────────────────────── */
;(async () => {
  let pass = 0, fail = 0
  const line = (good, label, detail) => { if (good) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  🔴 ${label}${detail ? `\n      ${detail}` : ''}`) } }
  const real = await routeFor('real')
  for (const c of CASES) {
    const got = await c.run(real)
    const bad = Object.entries(got).filter(([, v]) => !v).map(([k]) => k)
    line(bad.length === 0, c.name, bad.length ? `failed: ${bad.join(', ')}` : '')
    if (c.broken) {
      const broken = await c.run(await routeFor(c.broken))
      const caught = Object.values(broken).some(v => !v)
      line(caught, `   broken variant "${c.broken}" fails this case`, caught ? '' : 'the variant passed — this check cannot fail')
    }
  }

  // The panel: the question's three choices, and Cancel writes nothing (it never calls the route).
  const PANEL = read('components/admin/ScreenshotsPanel.tsx')
  line(/Same truck — update \{c\.name \?\? 'unnamed'\}/.test(PANEL) && /Different truck — add as new/.test(PANEL) && />Cancel</.test(PANEL),
    'the panel offers "Same truck — update …", "Different truck — add as new" and "Cancel"')
  line(/decide\(item, 'add_as_new'\)\}[\s\S]{0,260}Different truck — add as new/.test(PANEL), '"Different truck" sends add_as_new')
  const cancel = PANEL.slice(PANEL.indexOf('const cancelAsk'), PANEL.indexOf('const dismissHeld'))
  line(cancel.length > 0 && !/fetch\(/.test(cancel), 'Cancel calls nothing — it only marks the row')
  line(/Replace<\/button>/.test(PANEL) && /Keep saved<\/button>/.test(PANEL), 'an old → new line offers Replace and Keep saved')

  delete globalThis.__harnessDb
  console.log('')
  if (fail) { console.log(`🔴 ${fail} FAILED of ${pass + fail}`); process.exit(1) }
  console.log(`✅ all ${pass} passed`)
})().catch(e => { console.error(e); process.exit(1) })
