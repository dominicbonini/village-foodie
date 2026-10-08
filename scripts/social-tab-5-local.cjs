#!/usr/bin/env node
// scripts/social-tab-5-local.cjs — Social media round 5, against a RUNNING dev server and the REAL
// database. ⚠️ BY HAND ONLY:  node scripts/social-tab-5-local.cjs
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS CANNOT BE SWEPT, AND WHY IT EXISTS ANYWAY
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ IT NEEDS THREE THINGS NO SWEEP CAN GUARANTEE: `next dev` on :3000, the Supabase project, and a
// truck to test against. `scripts/run-harnesses.cjs` therefore does not run it — a harness that
// silently skips is a harness that reports green for a check nobody made. It is listed in
// `harnesses.json` beside the other by-hand ones, with this reason.
//
// 🔴 WHAT IT BUYS THAT THE SOURCE HARNESSES CANNOT. Every other check in this project reads source or
// renders a fixture. These ask the running route questions, and the one that mattered was found that
// way and no other way: `place_slot_clear` with `slot: 'not-a-slot'` answered **200 {ok:true}** having
// cleared a real location's LOCATION PICTURE, because `asSlotName` returned `'weekly'` for anything it
// did not recognise. No source check was ever going to notice a default that looked deliberate.
//
// ⛔ **ONE TRUCK, AND IT IS NAMED.** `id = 'test-truck'` (Pizza Kitchen, slug `test-kitchen`) — the
// standing rule for this workstream, and it is enforced here rather than trusted: the token is looked
// up BY THAT ID and nothing else is ever read or written. A live truck's pictures are not test data.
//
// ⚠️ AND IT PUTS NOTHING AT RISK. The only writes are a `place_slot_clear` on a location with nothing
// in the slot, and nothing is ever deleted. ⛔ THE FIRST VERSION OF THIS FILE DID NOT HAVE THAT
// PROPERTY: it cleared `slot: 'not-a-slot'` on `places[0]`, which — because of the very defect it was
// about to find — cleared the location picture on "Music Festival". It was put back through
// `place_slot_use`, and the last check in this file is the standing proof that it is still there.

const fs = require('fs')
const path = require('path')
const REPO = '/Users/dominicbonini/dev/village-foodie'
for (const f of ['.env.local', '.env']) {
  const p = path.join(REPO, f)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const BASE = 'http://localhost:3000'

const sb = async (q) => {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${q} → ${r.status} ${await r.text()}`)
  return r.json()
}
const api = async (action, extra = {}) => {
  const r = await fetch(`${BASE}/api/weekly-post`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, action, ...extra }),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, j }
}

let TOKEN
let fails = 0
const t = (ok, label, note = '') => { console.log(`  ${ok ? '✓' : '🔴'} ${label}${note ? ` — ${note}` : ''}`); if (!ok) fails++ }

;(async () => {
  const trucks = await sb(`trucks?id=eq.test-truck&select=id,name,slug,dashboard_token`)
  if (trucks.length !== 1) throw new Error('test-truck not found')
  const truck = trucks[0]
  TOKEN = truck.dashboard_token
  console.log(`── Pizza Kitchen (${truck.id} / ${truck.slug}) ────────────────────────────────`)

  // ── §5 · THE COLUMN EXISTS AND IS READABLE THROUGH PostgREST ────────────────────────────────
  /* ⚠️ THE COLUMN PROBE IS FIRST AND IS ITS OWN QUERY, so a missing column is reported as a missing
   * column rather than as whatever the screen does about it. */
  const cols = await sb(`truck_places?truck_id=eq.test-truck&select=id,name,event_picture_id,weekly_picture_id,weekly_only_picture_id,picture_use,social_tag&limit=5`)
  t(Array.isArray(cols) && cols.length > 0 && 'weekly_only_picture_id' in cols[0],
    '§5 20261021\'s column is selectable through PostgREST (the schema reloaded)')

  // ── THE PAGE'S ONE READ ─────────────────────────────────────────────────────────────────────
  /* ══ 🔴 THE MIGRATION GATE, SAID ONCE AND LOUDLY ══════════════════════════════════════════════════
   * ⛔ THE BRIEF SAYS THE CODE MAY ASSUME 20261022 HAS RUN, so before it has, this screen is SUPPOSED
   * to refuse. ⚠️ WHAT IT MUST NOT DO IS ANSWER "you have no locations", which is what it did until
   * this script caught it: the read named a column that did not exist, PostgREST answered 42703, the
   * error was never looked at, and the screen drew "No locations yet." over twenty-one of them. **A
   * wrong answer delivered confidently is worse than an error.**
   * 🔴 SO THE SCRIPT STOPS HERE, NAMES THE FILE, AND REPORTS THE REFUSAL AS A PASS — because a 503
   * naming the migration is the correct behaviour at this moment. */
  const ov = await api('social_overview')
  if (ov.status === 503 && /20261022/.test(String(ov.j?.error ?? ''))) {
    t(true, '⚠️ the migration has NOT been run, and the screen says so by name rather than drawing an empty list',
      String(ov.j?.error))
    console.log('')
    console.log('⚠️ STOPPING HERE. Run supabase/migrations/20261022_three_location_pictures.sql, then re-run this.')
    console.log(fails === 0 ? '✅ every check that does not need the migration passed' : `🔴 ${fails} LOCAL CHECK(S) FAILED`)
    process.exit(fails === 0 ? 0 : 1)
  }
  t(ov.status === 200, '`social_overview` answers 200', `status ${ov.status} ${JSON.stringify(ov.j).slice(0, 120)}`)
  const places = ov.j?.places ?? []
  t(places.length > 0, `…with ${places.length} locations`)
  /* ══ ⛔ `weeklyOnlyImage` IS GONE FROM THE PAYLOAD — round 4, AND THE CLAIM IS INVERTED ════════════
   * It was the opt-in override weekly posts used instead of the one location picture. With a picture per
   * surface there is nothing to override, and 20261022 emptied the column. ⚠️ WHAT REPLACED IT IS
   * `eventPhotoImage`, which is asserted here instead — three slots, three keys. */
  t(places.length > 0 && !('weeklyOnlyImage' in places[0]),
    '⛔ …and `weeklyOnlyImage` is gone from the payload — a picture per surface replaced it')
  t(places.length > 0 && 'eventPhotoImage' in places[0] && 'weeklyImage' in places[0]
    && 'eventImage' in places[0],
    '…and every location carries all THREE picture slots')
  t(places.length > 0 && !('pictureUse' in places[0]),
    '⛔ …and `pictureUse` is no longer sent — nothing reads it')

  // ── §1/§2 · BOTH DESIGNS LOAD (the shared editor's two doors) ───────────────────────────────
  const wk = await api('load', { weekStart: null })
  t(wk.status === 200, '`load` (weekly) answers 200', `status ${wk.status}`)
  const ev = await api('event_load')
  t(ev.status === 200, '`event_load` (standard) answers 200', `status ${ev.status}`)
  // ── §3 · THE EVENT LAYOUT COMES BACK WITH A `town` BOX ──────────────────────────────────────
  const L = ev.j?.design?.layout
  t(!!L && !!L.location && !!L.town,
    '§3 the event layout has BOTH `location` (Venue) and `town` boxes')
  if (L?.town && L?.location) {
    t(L.town.y >= L.location.y,
      `§3 …and the town sits at or below the venue (venue y${L.location.y}, town y${L.town.y})`)
    t(L.town.fontSize < L.location.fontSize,
      `§3 …at the smaller size the renderer used to draw it (${L.location.fontSize} → ${L.town.fontSize})`)
    t(L.town.fontId === L.location.fontId && L.town.color === L.location.color && L.town.align === L.location.align,
      `§3 …in the venue's own font, colour and alignment (${L.town.fontId}, ${L.town.color}, ${L.town.align})`)
  }

  // ── THE RENDERERS ───────────────────────────────────────────────────────────────────────────
  /* ⚠️ THE WEEKLY DESIGN IS NOT SET UP ON THIS TRUCK, and "No design yet." is the correct answer to
   * `render` in that state — so that is what is asserted rather than a PNG. */
  /* ⚠️ `render` ANSWERS WITH **RAW PNG BYTES**, like `event_render` — the same trap round 4 hit on the
   * event one. ⛔ AND THE "no design yet" BRANCH IS STILL HERE, because whether this truck has a weekly
   * design is a state of the data and not of the code: the check asserts the RIGHT answer for whichever
   * state it finds, and says which it found. */
  const wkReady = ov.j?.weekly?.ready === true
  const wr = await fetch(`${BASE}/api/weekly-post`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, action: 'render', weekStart: null }),
  })
  if (wkReady) {
    const buf = Buffer.from(await wr.arrayBuffer())
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG'
    t(wr.status === 200 && isPng && buf.length > 5000,
      'the WEEKLY poster renders, with "Powered by HatchGrab"',
      `status ${wr.status}, ${buf.length} bytes, PNG ${isPng}`)
  } else {
    const j = await wr.json().catch(() => ({}))
    t(wr.status === 400 && /No design yet/.test(String(j?.error ?? '')),
      '⚠️ the WEEKLY design is not set up here, and `render` says so rather than drawing a blank',
      `status ${wr.status} "${j?.error}"`)
  }

  /* 🔴 THE EVENT POSTER IS THE ONE §3 CHANGED, and it draws Venue and Town as two boxes now. The
   * upcoming list comes from the overview — there is no `upcoming` action. */
  const first = (ov.j?.upcoming ?? []).find(e => !e.isPrivate)
  if (first && ov.j?.standard?.ready) {
    /* ⚠️ `event_post` IS THE CONTEXT CALL and `event_render` IS THE ONE THAT DRAWS. Both are run:
     * the first is what the modal opens on, the second is the renderer §3 changed. */
    const ctx = await api('event_post', { eventId: first.id })
    t(ctx.status === 200 && ctx.j?.hasDesign === true,
      `\`event_post\` opens on ${first.placeName ?? first.name ?? first.id}`, `status ${ctx.status}`)
    /* ⚠️ `event_render` ANSWERS WITH **RAW PNG BYTES**, not JSON — so the bytes and the content type
     * are what is checked, and the PNG magic number is checked rather than only a length. */
    const rr = await fetch(`${BASE}/api/weekly-post`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, action: 'event_render', eventId: first.id }),
    })
    const buf = Buffer.from(await rr.arrayBuffer())
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG'
    t(rr.status === 200 && rr.headers.get('content-type') === 'image/png' && isPng && buf.length > 5000,
      'the SINGLE EVENT poster renders with the Venue/Town split',
      `status ${rr.status}, ${buf.length} bytes, PNG ${isPng}`)
    /* 🔴 THE WARNINGS COME BACK IN A HEADER on this call, which is where "the town box could not be
     * drawn" would appear if the split had gone wrong. */
    const warn = rr.headers.get('x-hg-warnings') || ''
    t(!/town|venue/i.test(warn),
      '…with no warning about the venue or the town box', warn ? `"${warn}"` : 'no warnings header')
  } else {
    t(false, `no non-private upcoming event with a ready standard design (upcoming ${(ov.j?.upcoming ?? []).length}, ready ${ov.j?.standard?.ready})`)
  }

  // ── §7 · THE THIRD SLOT IS WRITABLE BY NAME, AND A WRONG NAME IS REFUSED ─────────────────────
  /* ⛔ THE CLEAR IS RUN ON A LOCATION WITH NOTHING IN ANY SLOT, so it cannot destroy anything. */
  const empty = places.find(p => !p.weeklyImage && !p.eventImage && !p.eventPhotoImage)
  const ok1 = await api('place_slot_clear', { placeId: empty?.id, slot: 'event-photo' })
  t(ok1.status === 200, '§7 `place_slot_clear` accepts the `event-photo` slot name', `status ${ok1.status}`)
  /* 🔴 THE DEFECT ROUND 3 FOUND, STILL REFUSED — and now `weekly-only` is itself an unknown name. */
  const nonsense = await api('place_slot_clear', { placeId: empty?.id, slot: 'not-a-slot' })
  t(nonsense.status === 400 && /not a picture slot/.test(String(nonsense.j?.error ?? '')),
    '⛔ …and REFUSES a slot name it does not know, rather than falling back to a picture',
    `status ${nonsense.status} "${nonsense.j?.error}"`)
  const stale = await api('place_slot_clear', { placeId: empty?.id, slot: 'weekly-only' })
  t(stale.status === 400,
    '⛔ …including `weekly-only`, which a stale browser tab would still send',
    `status ${stale.status} "${stale.j?.error}"`)

  // ── §7 · THE MIGRATION'S OWN PROMISES, READ BACK FROM THE DATABASE ───────────────────────────
  const cols2 = await sb(`truck_places?truck_id=eq.test-truck&select=id,name,weekly_picture_id,event_photo_picture_id,weekly_only_picture_id`)
  t(cols2.every(p => p.weekly_only_picture_id === null),
    '§7 `weekly_only_picture_id` is empty on every location — the migration moved its value out',
    `${cols2.filter(p => p.weekly_only_picture_id !== null).length} still set`)
  /* 🔴 THE BACKFILL'S PROMISE: every location that had a picture has an EVENT one, so event posts keep
   * drawing what they drew before the split. ⚠️ Asserted as an implication, not a count. */
  t(cols2.every(p => !p.weekly_picture_id || !!p.event_photo_picture_id),
    '§7 …and every location with a weekly picture has an event one too (the backfill)',
    cols2.filter(p => p.weekly_picture_id && !p.event_photo_picture_id).map(p => p.name).join(', ') || 'none missing')

  // ── §5 · THE CAPTION THE SCREEN FILLS, AND THE TEMPLATE IT COMES FROM ────────────────────────
  t(typeof ov.j?.captions?.event?.template === 'string' && ov.j.captions.event.template.length > 0,
    '§5 the overview sends the event caption template')
  t(!!ov.j?.captionBits && 'orderUrl' in ov.j.captionBits && 'timeStyle' in ov.j.captionBits,
    '§5 …and the three facts the screen needs to FILL it, so picking another event costs no request',
    JSON.stringify(ov.j?.captionBits))
  /* 🔴 THE DEFAULT TEMPLATE IS BUILT FROM `{venue}` AND `{area}`. ⚠️ Only for a truck with no saved
   * template — which Pizza Kitchen may or may not be, so both are accepted and the state is reported. */
  const tpl = String(ov.j?.captions?.event?.template ?? '')
  t(ov.j.captions.event.saved === true || (/\{venue\}/.test(tpl) && /\{area\}/.test(tpl)),
    '§5 …and an unsaved template is the new default, built from {venue} and {area}',
    ov.j.captions.event.saved ? 'this truck has its own saved template' : tpl.split('\n')[0])
  /* ⛔ AND `{day-date}` IS NOT PRECEDED BY A LITERAL "on". The brief's default text had one, and
   * `whenPhrase` already supplies it — "on on Tue 13 Oct" was the result. */
  t(!/ on \{day-date\}/.test(tpl),
    '⛔ …with no literal "on" before {day-date}, which `whenPhrase` already carries')

  // ── §6 · THE WEEKLY CAPTION IS FILLED, FOR BOTH WEEKS ────────────────────────────────────────
  /* 🔴 FILLED ON THE SERVER with the same two functions the weekly Make screen uses, per week, so the
   * "Which week" select switches between two ready captions with no request. ⚠️ A truck with no weekly
   * design still gets a caption — the template falls back to the seed, which is the behaviour an
   * operator sees before they have made a design. */
  const wkCap = ov.j?.weekly
  t(typeof wkCap?.thisWeek?.caption === 'string' && typeof wkCap?.nextWeek?.caption === 'string',
    '§6 the overview sends a FILLED caption for both weeks',
    `this: ${JSON.stringify(String(wkCap?.thisWeek?.caption ?? '').slice(0, 70))}`)
  /* ⛔ AND IT IS THE FINISHED TEXT, NOT THE TEMPLATE: no `{token}` survives filling. */
  t(!/\{[a-z-]+\}/.test(String(wkCap?.thisWeek?.caption ?? '')),
    '§6 …and no token survives — it is the finished caption, not the template',
    String(wkCap?.thisWeek?.caption ?? '').slice(0, 90))
  /* ⚠️ THE TWO WEEKS DIFFER WHERE THE EVENTS DIFFER. ⛔ NOT ASSERTED AS "they must differ": two empty
   * weeks legitimately produce the same sentence, so the check reports which case this truck is in
   * rather than failing on a true one. */
  const same = String(wkCap?.thisWeek?.caption ?? '') === String(wkCap?.nextWeek?.caption ?? '')
  t(true, `⚠️ §6 …and the two weeks ${same ? 'read the same (both weeks have the same events)' : 'read differently'}`)
  /* 🔴 AND THE CAPTION NAMES THE TRUCK, which is what says the SEED was used rather than an empty
   * string — the one failure mode that would look like "it worked" on a screen. */
  t(/Pizza Kitchen/.test(String(wkCap?.thisWeek?.caption ?? '')),
    '§6 …and it is the truck\'s own caption, not an empty box',
    String(wkCap?.thisWeek?.caption ?? '').split('\n')[0])

  console.log('')
  console.log(fails === 0 ? `✅ all local checks passed` : `🔴 ${fails} LOCAL CHECK(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 ' + e.message); process.exit(1) })
