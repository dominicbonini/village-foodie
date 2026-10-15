#!/usr/bin/env node
// scripts/screenshot-truck-details.cjs — the truck-details half of the Screenshots tab.
// Fixtures only: NO network, NO database, NO Gemini call, NO email, NO live truck.
//   node scripts/screenshot-truck-details.cjs
//   HG_RENDER=1 node scripts/screenshot-truck-details.cjs   (also measures the list in two browsers)
//
// ── 🔴 WHAT THIS GUARDS, IN THE ORDER IT WOULD HURT ────────────────────────────────────────────────
//   1. A TRUCK-DETAILS SCREENSHOT REACHING /api/inbound-schedule. That route emails the operator of a
//      linked truck (route.ts:233-293, awaited), and a Facebook page is covered in post timestamps a
//      schedule prompt reads as events. The cost of this bug is a real email to a real stranger about
//      events that do not exist.
//   2. A NEW TRUCK APPEARING IN PUBLIC. `discovery_trucks` IS the anonymous Village Foodie trucks list
//      (api/discovery/events/route.ts:355-375) and `show_on_vf`/`show_on_hg` default to TRUE
//      (20260702_discovery_visibility_booleans.sql:44), so a plain insert publishes a truck nobody has
//      looked at — and, with a website on it, enrols it in the nightly scrape (run-scraper.js:939).
//   3. A SAVED VALUE OVERWRITTEN. This path fills EMPTY fields. Dominic's own corrections live in those
//      columns and a screenshot must never win against one.
//   4. A FUZZY NAME APPLIED AUTOMATICALLY. "The Wrap Van" is not "Wrap Van Co", and guessing merges two
//      businesses' contact details.
//   5. AN ALERT PER FILE instead of per outage — twelve emails for one broken API key.

const fs = require('fs'); const path = require('path')
const { execFileSync } = require('child_process')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = [
  'lib/admin/truck-details.ts', 'lib/admin/truck-details-write.ts', 'lib/admin/screenshot-log.ts',
  'lib/admin/screenshot-events.ts',
]
const c = compile(REPO, FILES, 'shotdetails')
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already */ }
const D = c.req('lib/admin/truck-details.js')
const W = c.req('lib/admin/truck-details-write.js')
const L = c.req('lib/admin/screenshot-log.js')

/* ══════════════════ 1. CLASSIFY, AND THE GATE ON THE SCHEDULE PATH ══════════════════ */
console.log('── 1. Classification and the schedule gate ──────────────────────────────────────────────')

t('a schedule screenshot runs the schedule path', D.shouldRunSchedule('schedule') === true)
t('"both" runs the schedule path', D.shouldRunSchedule('both') === true)
t('🔴 a truck-details screenshot NEVER runs the schedule path', D.shouldRunSchedule('truck_details') === false)
t('🔴 "neither" never runs the schedule path', D.shouldRunSchedule('neither') === false)
t('the details path runs for truck_details and both',
  D.shouldRunTruckDetails('truck_details') && D.shouldRunTruckDetails('both'))
t('the details path does not run for a pure schedule', D.shouldRunTruckDetails('schedule') === false)

t('an unreadable classification is "neither" — the class that does nothing',
  D.parseClassification('not json at all') === 'neither')
t('an unknown class is "neither", not passed through',
  D.parseClassification('{"kind":"invoice"}') === 'neither')
t('a fenced reply still parses', D.parseClassification('```json\n{"kind":"truck_details"}\n```') === 'truck_details')
t('🔴 the gate is an ALLOW-LIST in the source, not `!== truck_details`',
  /c === 'schedule' \|\| c === 'both'/.test(read('lib/admin/truck-details.ts')))
t('the classify prompt tells the model a post date is not a schedule',
  /POST DATE/.test(D.buildClassifyPrompt()) && /NOT an event/i.test(D.buildClassifyPrompt()))

/* ══════════════════ 2. NORMALISATION ══════════════════ */
console.log('── 2. Normalisation ────────────────────────────────────────────────────────────────────')

t('email is lower-cased', D.normaliseEmail(' 3BrosFood@Gmail.com ') === '3brosfood@gmail.com')
t('a mailto: prefix is stripped', D.normaliseEmail('mailto:a@b.co.uk') === 'a@b.co.uk')
t('a phone number is not an email', D.normaliseEmail('07400 049108') === null)
t('a sentence is not an email', D.normaliseEmail('email us at the page') === null)
t('a double dot is refused', D.normaliseEmail('a..b@c.com') === null)

t('+44 becomes 0 and groups as a mobile',
  D.normaliseUkPhone('+44 7400 049108', 'GB').mobile === '07400 049108')
t('0044 becomes 0', D.normaliseUkPhone('0044 7400 049108', 'GB').mobile === '07400 049108')
t('a mobile is never written to the landline field', D.normaliseUkPhone('07400049108', 'GB').landline === null)
t('a London landline groups 3/4/4', D.normaliseUkPhone('020 7946 0018', 'GB').landline === '020 7946 0018')
t('a Cambridge landline groups 5/6', D.normaliseUkPhone('01223123456', 'GB').landline === '01223 123456')
t('a non-geographic 03 groups 4/3/4', D.normaliseUkPhone('0300 123 1234', 'GB').landline === '0300 123 1234')
t('🔴 a number too short to classify is DISCARDED, not half-normalised',
  D.normaliseUkPhone('12345', 'GB').mobile === null && D.normaliseUkPhone('12345', 'GB').landline === null)
t('a US number is refused', D.normaliseUkPhone('+1 415 555 2671', 'GB').mobile === null)

t('a website becomes a bare domain', D.bareDomain('https://www.3brosburgers.co.uk/menu') === '3brosburgers.co.uk')
t('a scheme-less address works', D.bareDomain('3brosburgers.co.uk') === '3brosburgers.co.uk')
t('🔴 a facebook address is NEVER a website (it would be scraped)',
  D.bareDomain('facebook.com/3brosburgers') === null)
t('🔴 an instagram address is never a website', D.bareDomain('instagram.com/3bros') === null)
t('a bare word is not a domain', D.bareDomain('our website') === null)

/* ── the Facebook addendum, case by case ── */
t('a vanity address canonicalises',
  D.canonicalFacebookUrl('facebook.com/3brosburgers') === 'https://www.facebook.com/3brosburgers')
t('a numeric profile canonicalises',
  D.canonicalFacebookUrl('facebook.com/profile.php?id=100039496906958')
  === 'https://www.facebook.com/profile.php?id=100039496906958')
t('🔴 bare "facebook.com" records NO url', D.canonicalFacebookUrl('facebook.com') === null)
t('m.facebook.com normalises', D.canonicalFacebookUrl('https://m.facebook.com/3brosburgers/') === 'https://www.facebook.com/3brosburgers')
t('web.facebook.com normalises', D.canonicalFacebookUrl('https://web.facebook.com/3brosburgers') === 'https://www.facebook.com/3brosburgers')
t('tracking parameters are dropped',
  D.canonicalFacebookUrl('https://www.facebook.com/3brosburgers?mibextid=ZbWKwL&ref=page_internal')
  === 'https://www.facebook.com/3brosburgers')
t('an /about tail is dropped', D.canonicalFacebookUrl('facebook.com/3brosburgers/about') === 'https://www.facebook.com/3brosburgers')
t('a /photos tail is dropped', D.canonicalFacebookUrl('facebook.com/3brosburgers/photos') === 'https://www.facebook.com/3brosburgers')
t('every parameter except id is dropped from profile.php',
  D.canonicalFacebookUrl('facebook.com/profile.php?locale=en_GB&id=123456&ref=x')
  === 'https://www.facebook.com/profile.php?id=123456')
t('profile.php with no id is refused', D.canonicalFacebookUrl('facebook.com/profile.php?ref=x') === null)
t('🔴 a non-Facebook url is rejected', D.canonicalFacebookUrl('https://twitter.com/3bros') === null)
t('fb.com is accepted', D.canonicalFacebookUrl('fb.com/3brosburgers') === 'https://www.facebook.com/3brosburgers')
t("Facebook's own furniture is not a vanity", D.canonicalFacebookUrl('facebook.com/groups/12345') === null)

t('an instagram url canonicalises',
  D.canonicalInstagramUrl('https://instagram.com/3BrosBurgers/') === 'https://www.instagram.com/3brosburgers')
t('a bare @handle canonicalises', D.canonicalInstagramUrl('@3brosburgers') === 'https://www.instagram.com/3brosburgers')
t('a post url is not a profile', D.canonicalInstagramUrl('instagram.com/p/Cxyz123') === null)
t('a non-instagram url is rejected', D.canonicalInstagramUrl('facebook.com/3bros') === null)

/* ══════════════════ 3. THE 3BROS SCREENSHOT ══════════════════ */
console.log('── 3. The 3Bros example ────────────────────────────────────────────────────────────────')

const BROS_WITH_BAR = JSON.stringify({
  name: '3Bros', email: '3brosfood@gmail.com', phone: '+44 7400 049108',
  website: '3brosburgers.co.uk', facebook: 'facebook.com/profile.php?id=100039496906958',
  instagram: '', area: 'Brighton and Hove',
})
const BROS_NO_BAR = JSON.stringify({
  name: '3Bros', email: '3brosfood@gmail.com', phone: '+44 7400 049108',
  website: '3brosburgers.co.uk', facebook: '', instagram: '', area: 'Brighton and Hove',
})
const withBar = D.parseTruckDetails(BROS_WITH_BAR)
const noBar = D.parseTruckDetails(BROS_NO_BAR)

t('3Bros: the email normalises', withBar.contact_email === '3brosfood@gmail.com')
t('3Bros: the number is read as a MOBILE', withBar.mobile === '07400 049108' && withBar.phone === null)
t('3Bros: the website is a bare domain', withBar.website === '3brosburgers.co.uk')
t('3Bros: the address bar gives the Facebook link',
  withBar.facebook_url === 'https://www.facebook.com/profile.php?id=100039496906958')
t('3Bros: with no address bar there is NO Facebook link — never a guess', noBar.facebook_url === null)
t('3Bros: the area is carried for a note', withBar.area === 'Brighton and Hove')

// The prospect as it stands today: "3Bros Burgers", website only, no email and no mobile.
const BROS_PROSPECT = {
  prospect_id: 'p-3bros', truck_id: 't-3bros', name: '3Bros Burgers',
  contact_email: null, phone: null, mobile: null, website: 'https://3brosburgers.co.uk',
  facebook_url: null, instagram_url: null,
}
const OTHER = {
  prospect_id: 'p-other', truck_id: 't-other', name: 'Pizza Mondo',
  contact_email: 'hi@pizzamondo.example', phone: null, mobile: '07712 000000',
  website: 'pizzamondo.example', facebook_url: null, instagram_url: null,
}

const m = D.matchProspect(withBar, [BROS_PROSPECT, OTHER])
t('🔴 3Bros matches on WEBSITE, definitively', m.kind === 'definite' && m.on === 'website')
t('3Bros matches the right prospect', m.kind === 'definite' && m.row.prospect_id === 'p-3bros')

const brosPlan = D.planFill(withBar, BROS_PROSPECT)
t('🔴 3Bros fills email and mobile', brosPlan.fills.contact_email === '3brosfood@gmail.com' && brosPlan.fills.mobile === '07400 049108')
t('🔴 3Bros does NOT refill the website it matched on', !('website' in brosPlan.fills))
t('3Bros fills the Facebook link it read from the address bar',
  brosPlan.fills.facebook_url === 'https://www.facebook.com/profile.php?id=100039496906958')
t('3Bros writes NO logo — logo extraction is gone', !('logo_url' in brosPlan.fills))
t('🔴 the name is never filled', !('name' in brosPlan.fills))
t('3Bros notes the area once', brosPlan.areaNote === 'From screenshot: Brighton and Hove')
t('3Bros summary reads as the mockup does',
  D.updatedSummary(brosPlan, 'website').startsWith('Added email 3brosfood@gmail.com, mobile 07400 049108')
  && D.updatedSummary(brosPlan, 'website').endsWith('matched on website'))

/* ══════════════════ 4. MATCHING RULES ══════════════════ */
console.log('── 4. Matching ─────────────────────────────────────────────────────────────────────────')

const byFb = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ facebook: 'facebook.com/wrapvanco' })),
  [{ ...OTHER, facebook_url: 'https://www.facebook.com/WrapVanCo' }])
t('a Facebook match is case-insensitive on the vanity', byFb.kind === 'definite' && byFb.on === 'facebook')

const vanityVsId = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ facebook: 'facebook.com/3brosburgers' })),
  [{ ...BROS_PROSPECT, website: null, facebook_url: 'https://www.facebook.com/profile.php?id=100039496906958' }])
t('🔴 a vanity url and a numeric id are NOT a definite match on their own', vanityVsId.kind !== 'definite')

// ⚠️ RE-PINNED (15 Oct 2026, docs/outreach-screenshot-match-report.md): a phone number alone no longer decides.
// With the prospect's own name it is still definite across formats; without it, it asks. The full end-to-end
// proof, with broken variants, is scripts/screenshot-phone-match.cjs.
const byPhone = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ name: 'Pizza Mondo', phone: '+44 7712 000000' })), [BROS_PROSPECT, OTHER])
t('a phone match WITH the same name is definite across formats', byPhone.kind === 'definite' && byPhone.on === 'phone' && byPhone.row.prospect_id === 'p-other')
const phoneOnly = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ phone: '+44 7712 000000' })), [BROS_PROSPECT, OTHER])
t('🔴 a phone match with no name is "Needs a look" (phone_only), never definite',
  phoneOnly.kind === 'needs_a_look' && phoneOnly.ask === 'phone_only' && phoneOnly.candidates[0].prospect_id === 'p-other')

const byEmail = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ email: 'HI@pizzamondo.example' })), [BROS_PROSPECT, OTHER])
t('an email match is definite and case-insensitive', byEmail.kind === 'definite' && byEmail.on === 'email')

const byName = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ name: 'pizza mondo' })), [BROS_PROSPECT, OTHER])
t('an exact normalised name is definite', byName.kind === 'definite' && byName.on === 'name')

// 🧪 "Pizza Mando" vs the saved "Pizza Mondo" — ONE substitution apart after normalisation, so close
// enough for `venuesFuzzyMatch` and NOT equal. The mockup's own illustration ("The Wrap Van" close to
// "Wrap Van Co") cannot be used here and the next assertion records why: `normalizeVenue` strips BOTH
// `the` and `co`, so that pair collapses to the identical key `wrapvan` and is an EXACT name match.
const fuzzy = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ name: 'Pizza Mando' })),
  [{ ...OTHER, name: 'Pizza Mondo', contact_email: null, mobile: null, website: null }])
t('🔴 a SIMILAR name with nothing else is "Needs a look", never applied', fuzzy.kind === 'needs_a_look')
t('the needs-a-look reason names the close match', fuzzy.kind === 'needs_a_look' && /Pizza Mondo/.test(fuzzy.why))
const wrapVan = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ name: 'The Wrap Van' })),
  [{ ...OTHER, name: 'Wrap Van Co', contact_email: null, mobile: null, website: null }])
t('⚠️ "The Wrap Van" and "Wrap Van Co" normalise IDENTICALLY, so they are a definite name match',
  wrapVan.kind === 'definite' && wrapVan.on === 'name')

const twoWays = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ website: '3brosburgers.co.uk', phone: '07712 000000' })),
  [BROS_PROSPECT, OTHER])
t('🔴 two different prospects matching is "Needs a look", not strongest-key-wins', twoWays.kind === 'needs_a_look')
t('both candidates are offered', twoWays.kind === 'needs_a_look' && twoWays.candidates.length === 2)

const nothing = D.matchProspect(
  D.parseTruckDetails(JSON.stringify({ name: 'Smokin Joes', email: 'joe@smokinjoes.example' })),
  [BROS_PROSPECT, OTHER])
t('nothing matching is a new truck', nothing.kind === 'none')

/* ══════════════════ 5. FILL EMPTY ONLY ══════════════════ */
console.log('── 5. Fill empty only ──────────────────────────────────────────────────────────────────')

const SAVED = {
  contact_email: 'kept@example.com', mobile: '07999 999999', phone: null,
  website: 'kept.example', facebook_url: 'https://www.facebook.com/keptpage', instagram_url: null,
}
const incoming = D.parseTruckDetails(JSON.stringify({
  email: 'new@example.com', phone: '07400 049108', website: 'new.example',
  facebook: 'facebook.com/newpage', instagram: '@newhandle',
}))
const p = D.planFill(incoming, SAVED)
t('🔴 a saved email is NOT overwritten', !('contact_email' in p.fills))
t('🔴 a saved mobile is NOT overwritten', !('mobile' in p.fills))
t('🔴 a saved website is NOT overwritten', !('website' in p.fills))
t('🔴 a saved Facebook link is NOT overwritten', !('facebook_url' in p.fills))
t('an empty instagram IS filled', p.fills.instagram_url === 'https://www.instagram.com/newhandle')
t('every kept value is reported', p.kept.length === 4)
t('the Facebook conflict has the addendum’s wording',
  /Facebook link differs from saved — kept saved/.test(D.updatedSummary(p, 'name')))
t('a whitespace-only saved value counts as EMPTY',
  D.planFill(incoming, { contact_email: '   ' }).fills.contact_email === 'new@example.com')
t('an identical value is not reported as a conflict',
  D.planFill(incoming, { contact_email: 'NEW@example.com' }).kept.length === 0)
t('nothing to fill and nothing kept is an empty plan',
  D.planIsEmpty(D.planFill(D.parseTruckDetails('{}'), SAVED)))

/* ══════════════════ 6. THE HIDDEN NEW TRUCK ══════════════════ */
console.log('── 6. A new truck is created HIDDEN ────────────────────────────────────────────────────')

const newDetails = D.parseTruckDetails(JSON.stringify({
  name: "Smokin' Joe's", email: 'joe@smokinjoes.example', phone: '07400 111222',
  website: 'smokinjoes.example', facebook: 'facebook.com/smokinjoes', area: 'Brighton',
}))
const ins = D.hiddenTruckInsert(newDetails)
t('the name is written exactly as read', ins.name === "Smokin' Joe's")
t('🔴 show_on_vf is false', ins.show_on_vf === false)
t('🔴 show_on_hg is false too — the anonymous route picks its column by HOST', ins.show_on_hg === false)
t('🔴 NOT visible in the public payload on Village Foodie', D.appearsInPublicTrucksPayload(ins, 'villagefoodie') === false)
t('🔴 NOT visible in the public payload on HatchGrab', D.appearsInPublicTrucksPayload(ins, 'hatchgrab') === false)
t('🔴 NO website on the row — the scraper has no visibility filter', !('website' in ins))
t('🔴 no schedule_url either', !('schedule_url' in ins))
t('🔴 therefore NOT a scraper site', D.isScraperSite(ins) === false)
t('a scraped truck WITH a website would be a site (the mirror is real)', D.isScraperSite({ website: 'x.example' }) === true)
t('`excluded` is left alone — it means "graduated shadow" elsewhere', !('excluded' in ins))
t('the email and mobile still land on the row', ins.contact_email === 'joe@smokinjoes.example' && ins.mobile === '07400 111222')
t('the website goes to the prospect notes instead',
  D.newTruckNotes(newDetails).some(l => l === 'Website from screenshot: smokinjoes.example'))
t('the area is noted too', D.newTruckNotes(newDetails).some(l => l === 'From screenshot: Brighton'))
t('the summary says it is hidden and why the website is a note',
  /hidden from the public map/.test(D.newTruckSummary(newDetails))
  && /it would be scraped/.test(D.newTruckSummary(newDetails)))

/* ══════════════════ 7. THE TWO-TABLE WRITER ══════════════════ */
console.log('── 7. One writer, both tables, nothing left behind ─────────────────────────────────────')

function fakeDb(opts = {}) {
  const calls = []
  return {
    calls,
    insertTruck: async (row) => { calls.push(['insertTruck', row]); return opts.truckFails ? { id: null, error: 'truck boom' } : { id: 't-new', error: null } },
    deleteTruck: async (id) => { calls.push(['deleteTruck', id]); return { error: opts.deleteFails ? 'delete boom' : null } },
    insertProspect: async (row) => { calls.push(['insertProspect', row]); return opts.prospectFails ? { id: null, error: 'prospect boom' } : { id: 'p-new', error: null } },
    updateTruck: async (id, patch) => { calls.push(['updateTruck', id, patch]); return { error: opts.updateFails ? 'update boom' : null } },
    getProspectNotes: async (id) => { calls.push(['getProspectNotes', id]); return { notes: opts.notes ?? null, error: null } },
    setProspectNotes: async (id, notes) => { calls.push(['setProspectNotes', id, notes]); return { error: null } },
    recordHistory: async (id, body) => { calls.push(['recordHistory', id, body]); return { error: null } },
  }
}

;(async () => {
  const happy = fakeDb()
  const created = await W.createHiddenTruckWithProspect(happy, newDetails, 'history line')
  t('a create makes the truck then the prospect, in that order',
    created.ok && happy.calls[0][0] === 'insertTruck' && happy.calls[1][0] === 'insertProspect')
  t('the prospect points at the new truck', happy.calls[1][1].discovery_truck_id === 't-new')
  t('🔴 stage is not_contacted, written explicitly', happy.calls[1][1].stage === 'not_contacted')
  t('🔴 nothing sets do_not_contact', !('do_not_contact' in happy.calls[1][1]))
  t('nothing sets a lead type', !('lead_type_at_first_contact' in happy.calls[1][1]))
  t('the history line is recorded on the prospect', happy.calls.some(k => k[0] === 'recordHistory' && k[1] === 'p-new'))

  const rollback = fakeDb({ prospectFails: true })
  const failed = await W.createHiddenTruckWithProspect(rollback, newDetails, 'h')
  t('🔴 a failed prospect insert DELETES the truck row just made',
    !failed.ok && rollback.calls.some(k => k[0] === 'deleteTruck' && k[1] === 't-new'))
  t('and says nothing was left behind', /nothing was left behind/.test(failed.error))
  t('no prospect id is reported when none was made', failed.prospectId === null)

  const stuck = fakeDb({ prospectFails: true, deleteFails: true })
  const orphan = await W.createHiddenTruckWithProspect(stuck, newDetails, 'h')
  t('🔴 a failed rollback names the row a human must delete',
    !orphan.ok && /discovery_trucks id t-new/.test(orphan.error))

  const truckDead = fakeDb({ truckFails: true })
  const never = await W.createHiddenTruckWithProspect(truckDead, newDetails, 'h')
  t('a failed truck insert never attempts a prospect',
    !never.ok && !truckDead.calls.some(k => k[0] === 'insertProspect'))

  // ── filling a match ──
  const fill = fakeDb()
  const applied = await W.applyFill(fill, BROS_PROSPECT, brosPlan, 'history line')
  t('a fill patches the TRUCK row', applied.ok && fill.calls.some(k => k[0] === 'updateTruck' && k[1] === 't-3bros'))
  t('the patch is exactly the plan',
    JSON.stringify(fill.calls.find(k => k[0] === 'updateTruck')[2]) === JSON.stringify(brosPlan.fills))
  t('the area note goes on the PROSPECT, not the truck',
    fill.calls.some(k => k[0] === 'setProspectNotes' && k[1] === 'p-3bros'))
  t('the history line is written', fill.calls.some(k => k[0] === 'recordHistory'))

  const noWrite = fakeDb({ updateFails: true })
  const refused = await W.applyFill(noWrite, BROS_PROSPECT, brosPlan, 'h')
  t('🔴 a failed truck update FAILS the file — it is not reported as updated', refused.ok === false)

  const emptyPlan = D.planFill(D.parseTruckDetails('{}'), SAVED)
  const quiet = fakeDb()
  await W.applyFill(quiet, BROS_PROSPECT, emptyPlan, 'h')
  t('an empty plan writes nothing at all', quiet.calls.length === 0)

  /* ══════════════════ 8. THE NOTES COLUMN ══════════════════ */
  console.log('── 8. Notes are appended once ──────────────────────────────────────────────────────────')
  t('a note is appended to existing words', W.appendNotes('Dominic wrote this', ['From screenshot: Brighton'])
    === 'Dominic wrote this\nFrom screenshot: Brighton')
  t('🔴 the same note twice adds nothing', W.appendNotes('From screenshot: Brighton', ['From screenshot: Brighton']) === null)
  t('existing words are never rewritten', W.appendNotes('keep me', ['new']).startsWith('keep me'))
  t('nothing to add returns null so no write happens', W.appendNotes('x', []) === null)

  /* ══════════════════ 9. THE LOG ══════════════════ */
  console.log('── 9. The log list ─────────────────────────────────────────────────────────────────────')
  const now = new Date('2026-10-01T22:51:00Z')
  const rows = [
    { id: '1', created_at: '2026-10-01T22:31:00Z', outcome: 'updated', file_name: 'a.png', alerted_at: null },
    { id: '2', created_at: '2026-10-01T09:00:00Z', outcome: 'schedule', file_name: 'b.png', alerted_at: null },
    { id: '3', created_at: '2026-09-29T09:00:00Z', outcome: 'failed', file_name: 'c.png', alerted_at: null },
    { id: '4', created_at: '2026-08-01T09:00:00Z', outcome: 'updated', file_name: 'old.png', alerted_at: null },
  ]
  const g = L.groupLogRows(rows, now)
  t("today holds today's two rows", g.today.length === 2)
  t('today is newest first', g.today[0].id === '1')
  t('Earlier holds the last 7 days', g.earlier.length === 1 && g.earlier[0].id === '3')
  t('a row older than the window is not listed', !g.today.concat(g.earlier).some(r => r.id === '4'))
  const counts = L.chipCounts(rows)
  t('the chips count every row', counts.all === 4 && counts.updated === 2 && counts.schedule === 1 && counts.failed === 1)

  /* ══════════════════ 10. SIMPLE VERSUS COMPLETE FAILURE ══════════════════ */
  console.log('── 10. Which failures are an outage ────────────────────────────────────────────────────')
  t('an unreadable image is SIMPLE', L.classifyFailure('Gemini returned no candidates — safety filter', 1).severity === 'simple')
  t('one 503 after retries is SIMPLE', L.classifyFailure('Gemini HTTP 503: unavailable (after 3 attempts)', 1).severity === 'simple')
  t('🔴 a 429 quota failure is COMPLETE', L.classifyFailure('Gemini HTTP 429: RESOURCE_EXHAUSTED', 1).severity === 'complete')
  t('🔴 a bad API key is COMPLETE', L.classifyFailure('Gemini HTTP 403: API key not valid', 1).severity === 'complete')
  t('🔴 a database failure is COMPLETE', L.classifyFailure('The prospect could not be updated: insert failed', 1).severity === 'complete')
  t('🔴 a missing migration is COMPLETE', L.classifyFailure('run the facebook/instagram migration first', 1).severity === 'complete')
  t('🔴 three non-content failures in a row is COMPLETE',
    L.classifyFailure('Gemini HTTP 503: unavailable (after 3 attempts)', 3).severity === 'complete')
  t('three CONTENT failures in a row is still simple',
    L.classifyFailure('Gemini returned no candidates', 3).severity === 'simple')

  /* ══════════════════ 11. ONE EMAIL PER OUTAGE ══════════════════ */
  console.log('── 11. One email per outage ────────────────────────────────────────────────────────────')
  t('the first outage alerts', L.alertIsDue({ lastSuccessAt: '2026-10-01T10:00:00Z', lastAlertAt: null }) === true)
  t('🔴 the same outage does NOT alert again',
    L.alertIsDue({ lastSuccessAt: '2026-10-01T10:00:00Z', lastAlertAt: '2026-10-01T10:05:00Z' }) === false)
  t('🔴 a NEW outage after a success alerts again',
    L.alertIsDue({ lastSuccessAt: '2026-10-01T11:00:00Z', lastAlertAt: '2026-10-01T10:05:00Z' }) === true)
  t('⚠️ never-succeeded and already-alerted does not alert forever',
    L.alertIsDue({ lastSuccessAt: null, lastAlertAt: '2026-10-01T10:05:00Z' }) === false)
  const st = L.alertStateFrom([
    { id: '1', created_at: '2026-10-01T10:00:00Z', outcome: 'updated', alerted_at: null },
    { id: '2', created_at: '2026-10-01T10:05:00Z', outcome: 'failed', alerted_at: '2026-10-01T10:05:00Z' },
  ])
  t('the state is derived from the log, with no flag to go stale',
    st.lastSuccessAt === '2026-10-01T10:00:00Z' && st.lastAlertAt === '2026-10-01T10:05:00Z')
  const mail = L.screenshotAlertEmail({ reason: 'The Gemini key was refused.', at: now, waiting: 9 })
  t('the subject is the one the brief names', mail.subject === 'HatchGrab screenshots: processing stopped')
  t('the body carries the reason, the time and the queue', /refused/.test(mail.text) && /Files still waiting: 9/.test(mail.text))
  t('🔴 it goes to Dominic and nobody else', L.SCREENSHOT_ALERT_TO === 'dominic@hatchgrab.com')

  /* ══════════════════ 12. THE RUNNING LINE ══════════════════ */
  console.log('── 12. "Is it running" ─────────────────────────────────────────────────────────────────')
  t('the progress line reads as the brief asks',
    L.progressLine({ finished: 2, running: true, total: 12 }) === 'Processing 3 of 12 · 9 waiting')
  t('the last file shows no "waiting"', L.progressLine({ finished: 11, running: true, total: 12 }) === 'Processing 12 of 12')
  t('nothing running shows no line', L.progressLine({ finished: 12, running: false, total: 12 }) === null)
  t('the last-processed line is a time', /^Last processed \d\d:\d\d$/.test(L.lastProcessedLine(now)))

  /* ══════════════════ 13. WHAT MUST NOT HAVE CHANGED ══════════════════ */
  console.log('── 13. Unchanged elsewhere ─────────────────────────────────────────────────────────────')
  const gitClean = (f) => {
    try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', f], { cwd: REPO, stdio: 'pipe' }); return true }
    catch { return false }
  }
  /* ══ PHASE 2D-2 PART A (schedules by country) — THE FIFTH NAMED BUILD ══════════════════════════════════
   * It legitimately changed three files this section guards: the screenshot prompt takes the chosen country,
   * the bridge matches and links within a country, and the operator importer takes truck context. Its lines
   * are listed in scripts/fixtures/screenshot-truck-details-2d2-lines.json — each ADDED line must still be a
   * whole line of the file and each REMOVED line must no longer be one — and its GB behaviour is proven
   * byte-identical by scripts/schedules-country-parity.cjs. Every OTHER difference still fails. A line both
   * removed and added is a re-indent (a block moved inside an `else`), not a change. */
  const T2D2 = JSON.parse(read('scripts/fixtures/screenshot-truck-details-2d2-lines.json'))
  const expired2d2 = f => {
    const have = new Set(read(f).split('\n').map(l => l.trim())), e = T2D2[f] || { added: [], removed: [] }
    const missing = e.added.filter(l => !have.has(l)), back = e.removed.filter(l => have.has(l))
    if (missing.length || back.length) console.log('      ⛔ PHASE 2D-2 LINE ' + (missing.length ? 'MISSING: ' + missing[0] : 'RESURRECTED: ' + back[0]).slice(0, 160))
    return !missing.length && !back.length
  }
  const lines2d2 = f => new Set(read(f).split('\n').map(l => l.trim()))
  const named2d2 = (f, l) => { const e = T2D2[f] || { added: [], removed: [] }; return e.added.includes(l) || e.removed.includes(l) }
  const diffSides = f => {
    const diff = execFileSync('git', ['diff', '-U0', 'HEAD', '--', f], { cwd: REPO, encoding: 'utf8' }).split('\n')
    // Only the `+++ ` / `--- ` file headers are skipped — a removed line whose own text starts with "-" is kept.
    const side = c => diff.filter(l => l[0] === c && !/^(\+\+\+|---) /.test(l)).map(l => l.slice(1).trim())
      .filter(l => l && !/^(\/\*|\*|\/\/)/.test(l) && /[A-Za-z0-9'"`]/.test(l))
    return { plus: side('+'), minus: side('-') }
  }
  t('🔴 the schedule extraction module is unchanged apart from Phase 2D-2\'s named lines', (() => {
    const f = 'lib/admin/screenshot-events.ts'
    if (gitClean(f)) return true
    const { plus, minus } = diffSides(f)
    const bad = [...plus, ...minus].filter(l => !named2d2(f, l) && !(plus.includes(l) && minus.includes(l)))
    if (bad.length) { console.log('      LINES CHANGED AND NOT ALLOWED: ' + bad.length); for (const l of bad.slice(0, 10)) console.log('        • ' + l.slice(0, 140)); return false }
    return expired2d2(f)
  })())
  /* ⚠️ NARROWED, NOT DROPPED (October 2026, event types stage 1-2). This read `gitClean(...)` — a
   * byte-identity guard against a FLOATING HEAD — and its meaning is "the screenshot/truck-details
   * work did not touch the scraped-event bridge". A later, unrelated build legitimately added ONE key
   * to that route's insert (`order_ready_source: 'seed'`, which records that a creation path wrote
   * order_ready_override rather than the truck choosing it), and a floating-HEAD assertion cannot tell
   * that apart from a change to the bridging logic.
   * 🔴 SO THE GUARD NOW ALLOWS EXACTLY THAT ONE LINE AND NOTHING ELSE. Every other difference still
   * fails it, which is the property worth keeping. A harness that pins HEAD must say what it tolerates;
   * see the note in scripts/_slot-interval-compile.cjs about pinning a commit rather than HEAD. */
  /* ══ 🔴 THE ALLOWLIST GREW BY ONE BUILD, AND IT IS A LIST NOW RATHER THAN A SINGLE STRING ════════
   * Private events (20261014) added the second tolerated change: the scraped-privacy spread, and the
   * import that supplies it. "Private Hire" in a scraped venue name marks the event private, and the
   * signal is already in the data this bridge receives — so the decision belongs here.
   * ⛔ SPREAD, NOT A COLUMN. `is_private` has ONE writer in this repository and
   * scripts/private-events.cjs proves it by searching for the column name; a literal `is_private:`
   * here would break that proof, which is why the tolerated line is a spread.
   * 🔴 EVERY OTHER DIFFERENCE STILL FAILS THIS, which is the property worth keeping: the guard means
   * "the screenshot/truck-details work did not touch the scraped-event bridge", and a floating-HEAD
   * byte-identity check cannot tell a legitimate later build apart from a change to the bridging
   * logic. Each entry is a claim with a test attached — the loop below fails if a tolerated line is
   * no longer in the file, so a revert or a rename turns the excuse back into a failure. */
  t('🔴 /api/inbound-schedule is unchanged apart from four named later builds', (() => {
    const f = 'app/api/inbound-schedule/route.ts'
    const TOLERATED = [
      // event types stage 1-2: a creation path records that IT wrote order_ready_override.
      "order_ready_source: 'seed',",
      // private events 20261014: "private" in the found text, through the one privacy writer.
      "...scrapedPrivacyFields(row.venue_name, row.event_notes),",
      "import { scrapedPrivacyFields } from '@/lib/private-events/write'",
      /* ══ 🔴 THE THIRD BUILD: THE LINK IN THIS EMAIL IS BUILT BY THE ONE LINK BUILDER (5 Oct 2026) ══
       * This route EMAILS an operator `/manage/<token>?tab=schedule` to review found events — and on a
       * truck whose plan is 'trial' that link opened BILLING, every time, because the mount parser read
       * `?tab=` and a later default-to-Billing effect overrode it. The fix is in
       * app/manage/[token]/page.tsx (`urlAskedForTab`); what changed HERE is only that the URL is no
       * longer assembled from a literal in a template string.
       * ⛔ THE BRIDGE ITSELF IS UNTOUCHED — no column, no filter, no admission rule, which is what this
       * guard exists to protect. The changed line is the one that builds a link in an email body. */
      "import { manageTabHref } from '@/lib/manage-links'",
      "const manageUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}${manageTabHref('schedule', { token: truck.dashboard_token })}`",
      /* ══ THE FOURTH BUILD: PHASE 2B, THE TRUCK'S CLOCK (10 October 2026) ═══════════════════════════════
       * The email's "found events" list is filtered from the TRUCK's today (was the UTC date — yesterday
       * from 00:00 to 01:00 BST) and its dates and times are written in the truck's style. ⛔ The bridge
       * is untouched: no column written, no admission rule, no filter other than that "today". */
      "import { truckTimeSettings } from '@/lib/truck-time'",
      // Language Phase 2 (15 October 2026): the dates' short month by the product's rule ("Sep", never Intl's
      // en-GB "Sept") — formatYmd became formatYmdShortMonth on these two lines; the old forms are below.
      "import { getLocalDateInTz, formatYmdShortMonth, formatTime } from '@/lib/time-utils'",
      ".select('contact_email, name, dashboard_token, timezone, country')",
      "const ts = await truckTimeSettings(truck)",
      ".gte('event_date', getLocalDateInTz(ts.timeZone))",
      "const fmtDate = (iso: string) => formatYmdShortMonth(iso, ts, { weekday: 'short', day: 'numeric', month: 'short' })",
      "const a = st ? formatTime(String(st), ts) : ''",
      "const b = et ? formatTime(String(et), ts) : ''",
    ]
    /* ══ ⛔ AND A LINE THAT WAS **REPLACED** NEEDS ITS OLD FORM TOLERATING TOO ════════════════════
     * `git diff` reports a replacement as a `-` AND a `+`, and this check reads both — so the first
     * attempt at the entry above failed on the line it was written for: the OLD `manageUrl` was still
     * an unexplained change.
     * 🔴 THE TWO LISTS CANNOT BE ONE, because the expiry check below means opposite things for them: a
     * line that ARRIVED must still be in the file, and a line that WENT must not. Merging them would
     * make the expiry check contradict itself — it would demand the presence of the exact line this
     * build deleted. The two previous entries are pure ADDITIONS, which is why one list sufficed until
     * now. */
    const TOLERATED_REMOVED = [
      "const manageUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/manage/${truck.dashboard_token}?tab=schedule`",
      // Phase 2B — the old forms of the lines above.
      ".select('contact_email, name, dashboard_token')",
      ".gte('event_date', new Date().toISOString().slice(0, 10))",
      "const fmtDate = (iso: string) => {",
      "const d = new Date(iso + 'T00:00:00')",
      "return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })",
      "const a = st ? String(st).slice(0, 5) : ''",
      "const b = et ? String(et).slice(0, 5) : ''",
      // Language Phase 2 — the Phase 2B forms of the two lines it changed.
      "import { getLocalDateInTz, formatYmd, formatTime } from '@/lib/time-utils'",
      "const fmtDate = (iso: string) => formatYmd(iso, ts, { weekday: 'short', day: 'numeric', month: 'short' })",
    ]
    if (gitClean(f)) return true
    let diff = ''
    try { diff = execFileSync('git', ['diff', '-U0', 'HEAD', '--', f], { cwd: REPO, encoding: 'utf8' }) }
    catch { return false }
    const changed = diff.split('\n')
      .filter(l => /^[+-]/.test(l) && !/^[+-][+-]/.test(l))
      .map(l => l.slice(1).trim())
      .filter(Boolean)
      /* comment lines are not behaviour */
      .filter(l => !/^(\/\*|\*|\/\/)/.test(l))
    /* ⚠️ A LINE OF BARE PUNCTUATION IS NOT A LINE THIS GUARD PROTECTS (Phase 2B): a three-line helper became a
     * one-liner, so its closing `}` went — and a `}` cannot be named as "removed" (the file is full of them)
     * nor proves anything about the bridge. Anything with a letter, digit or quote is still checked. */
    const sides = diffSides(f)
    const unexplained = changed.filter(l => /[A-Za-z0-9'"`]/.test(l)).filter(l => !TOLERATED.includes(l) && !TOLERATED_REMOVED.includes(l))
      .filter(l => !named2d2(f, l) && !(sides.plus.includes(l) && sides.minus.includes(l)))
    if (unexplained.length) {
      console.log('      LINES CHANGED AND NOT ALLOWED: ' + unexplained.length)
      for (const l of unexplained.slice(0, 10)) console.log('        • ' + l.slice(0, 140))
      return false
    }
    /* ⛔ AND THE EXCUSE EXPIRES IF THE LINE GOES. A tolerated change that is no longer in the file is
     * not a tolerated change; it is a revert nobody noticed. */
    const now = read(f)
    const missing = TOLERATED.filter(l => !now.includes(l))
    if (missing.length) {
      console.log('      ⛔ TOLERATED LINE CLAIMED BUT NOT PRESENT: ' + missing.join(' | ').slice(0, 160))
      return false
    }
    /* ⛔ AND THE OTHER DIRECTION. A line claimed as REMOVED that is still in the file is not a removal;
     * it is an entry that excuses a change nobody made, and it would go on excusing the real one. */
    const resurrected = TOLERATED_REMOVED.filter(l => now.includes(l))
    if (resurrected.length) {
      console.log('      ⛔ LINE CLAIMED AS REMOVED BUT STILL PRESENT: ' + resurrected.join(' | ').slice(0, 160))
      return false
    }
    return expired2d2(f)
  })())
  /* ⚠️ NARROWED, NOT DROPPED (Phase 2B, 10 October 2026), the same way as the bridge above: the operator
   * path's prompt now states the TRUCK's today (was the server's UTC date — Friday from 00:00 to 01:00 BST
   * on a Saturday) in its words, and the function is handed the truck's settings. Every other difference
   * still fails; each named line must be present (added) or gone (removed). The DD/MM/YYYY contract the
   * model answers in is unchanged — it is one of the named lines. */
  t('🔴 lib/schedule-extract.ts (the operator path) is unchanged apart from Phase 2B\'s named lines', (() => {
    const f = 'lib/schedule-extract.ts'
    if (gitClean(f)) return true
    const ADDED = [
      "import { getLocalDateInTz, addDaysYmd, formatYmd, type TimeSettings } from '@/lib/time-utils'",
      'export function buildScheduleExtractionPrompt(inputText: string, ts: TimeSettings): string {',
      'const todayYmd = getLocalDateInTz(ts.timeZone)',
      "const todayStr = formatYmd(todayYmd, ts, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })",
      'const currentYear = Number(todayYmd.slice(0, 4))',
      'const ddmmyyyy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`',
      'const ymd = addDaysYmd(todayYmd, i)',
      "const dayName = formatYmd(ymd, ts, { weekday: 'long' })",
      'return `${dayName} = ${ddmmyyyy(ymd)}`',
      'time: TimeSettings,',
      '? [{ text: buildScheduleExtractionPrompt(content, time) }]',
      "{ text: buildScheduleExtractionPrompt('', time) },",
    ]
    const REMOVED = [
      'export function buildScheduleExtractionPrompt(inputText: string): string {',
      'const today = new Date()',
      "const todayStr = today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })",
      'const currentYear = today.getFullYear()',
      'const d = new Date()', 'd.setDate(d.getDate() + i)',
      "const dayName = d.toLocaleDateString('en-GB', { weekday: 'long' })",
      "const dateStr = d.toLocaleDateString('en-GB')",
      'return `${dayName} = ${dateStr}`',
      '? [{ text: buildScheduleExtractionPrompt(content) }]',
      "{ text: buildScheduleExtractionPrompt('') },",
    ]
    const diff = execFileSync('git', ['diff', '-U0', 'HEAD', '--', f], { cwd: REPO, encoding: 'utf8' })
    const plus = [], minus = []
    for (const l of diff.split('\n')) {
      if (!/^[+-]/.test(l) || /^[+-][+-]/.test(l)) continue
      const t = l.slice(1).trim()
      if (!t || /^(\/\*|\*|\/\/)/.test(t)) continue
      ;(l[0] === '+' ? plus : minus).push(t)
    }
    const now = read(f)
    const bad = [...plus.filter(x => !ADDED.includes(x)), ...minus.filter(x => !REMOVED.includes(x))]
      .filter(x => /[A-Za-z0-9'"`]/.test(x) && !named2d2(f, x) && !(plus.includes(x) && minus.includes(x)))
    if (bad.length) { console.log('      LINES CHANGED AND NOT ALLOWED: ' + bad.length); for (const l of bad.slice(0, 10)) console.log('        • ' + l.slice(0, 140)); return false }
    // A Phase 2B line that Phase 2D-2 has since changed is SUPERSEDED (named in the 2D-2 fixture) — it must be gone.
    const superseded = T2D2[f]?.superseded ?? []
    const missing = ADDED.filter(l => !now.includes(l) && !superseded.includes(l)), back = REMOVED.filter(l => now.includes(l) && !ADDED.includes(l))
    if (superseded.some(l => lines2d2(f).has(l))) { console.log('      ⛔ A SUPERSEDED PHASE 2B LINE IS STILL PRESENT'); return false }
    if (missing.length || back.length) { console.log('      ⛔ NAMED LINE ' + (missing.length ? 'MISSING: ' + missing[0] : 'RESURRECTED: ' + back[0])); return false }
    return expired2d2(f)
  })())
  t('the one contact writer is untouched', gitClean('lib/outreach-contact-log.ts'))
  t('the outreach_events writer is untouched', gitClean('lib/outreach-events.ts'))

  const ROUTE = read('app/api/admin/screenshot-events/route.ts')
  // Phase 2D-2: the POST moved into sendToBridge(), which adds the chosen country; the body is otherwise the same.
  t('the schedule POST body is still secret + toInboundEvents(kept, <file name>) (+ the country, Phase 2D-2)',
    /secret: process\.env\.INBOUND_SCHEDULE_SECRET,\s*\n\s*events: toInboundEvents\(kept, fileName\),\s*\n\s*country,/.test(ROUTE)
    && /sendToBridge\(req, kept, file\.name, country\.code\)/.test(ROUTE))
  t('🔴 the schedule call is inside the shouldRunSchedule gate',
    /if \(shouldRunSchedule\(kind\)\) \{[\s\S]*sendToBridge\(req, kept, file\.name/.test(ROUTE)
    && ROUTE.indexOf('if (shouldRunSchedule(kind)) {') < ROUTE.indexOf('sendToBridge(req, kept, file.name'))
  t('the details path refuses to write without the social columns',
    /if \(!hasSocial\) \{[\s\S]*Nothing was written/.test(ROUTE))
  t('🔴 nothing in the route writes outreach_templates', !/outreach_templates/.test(ROUTE))
  t('🔴 nothing in the route sets do_not_contact', !/do_not_contact/.test(ROUTE))
  t('the route never writes show_on_vf true', !/show_on_vf:\s*true/.test(ROUTE))
  const PANEL = read('components/admin/ScreenshotsPanel.tsx')
  t('the page says the queue stops if the tab closes', /the queue stops/.test(PANEL))
  t('a beforeunload guard exists while files wait', /beforeunload/.test(PANEL))
  t('the banner offers Retry', /Retry/.test(PANEL))
  /* ⚠️ RE-PINNED 15 October 2026 (docs/outreach-instant-send-report.md): this asked the WHOLE file to be unchanged against HEAD, and a
   * later build added a row badge to it. What it guards is the sandbox, so it now asks about the sandbox:
   * the constant's value, and that it is the only line in the file naming it. */
  t('EMAIL_FRAME_SANDBOX is untouched and still allow-same-origin only',
    /export const EMAIL_FRAME_SANDBOX\s*=\s*'allow-same-origin'/.test(read('lib/outreach-workspace.ts'))
    && (read('lib/outreach-workspace.ts').match(/EMAIL_FRAME_SANDBOX\s*=/g) || []).length === 1)

  /* ══════════════════ 13b. WHO MAY READ discovery_trucks FOR AN ANONYMOUS VISITOR ══════════════════ */
  console.log('── 13b. The anonymous readers of discovery_trucks ──────────────────────────────────────')

  // 🔴 WHY THIS GUARD EXISTS. A truck created by this path is hidden by `show_on_vf` and `show_on_hg`
  // being false, and that only works if EVERY anonymous reader honours those two columns. Today exactly
  // one does the reading — api/discovery/events — and every public page reaches it through
  // hooks/useVillageData.ts. A NEW public reader added later (a search endpoint, a sitemap entry, an
  // autocomplete) would silently publish hidden trucks. So the set of non-admin files that query the
  // table is pinned, and a newcomer fails here until someone has checked its filter.
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel, out) }
      else if (/\.tsx?$/.test(e.name)) out.push(rel)
    }
    return out
  }
  const queriers = []
  for (const f of [...walk('app'), ...walk('lib'), ...walk('hooks'), ...walk('components')]) {
    if (f.includes('/admin')) continue
    const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    // A real query, not a mention in a comment.
    if (/from\('discovery_trucks'\)|discovery_trucks!/.test(src)) queriers.push(f)
  }
  // 🔎 FOUR FILES, MEASURED not assumed: `lib/delete-truck.ts` and `lib/provision-demo.ts` name the table
  // only in comments, so they are not on this list — the test is about QUERIES.
  const EXPECTED = [
    'app/api/discovery/events/route.ts',   // the ONE anonymous reader — gated four times over, below
    'app/api/inbound-schedule/route.ts',   // secret-gated producer, not a visitor surface
    'lib/discovery-gate.ts',               // the one writer into discovery_events; resolves truck ids
    'lib/self-serve-discovery-link.ts',    // the setup link + the shadow exclude
  ].sort()
  const found = queriers.sort()
  t('🔴 no NEW non-admin file queries discovery_trucks',
    JSON.stringify(found) === JSON.stringify(EXPECTED) || (() => {
      console.log(`      expected ${JSON.stringify(EXPECTED)}`)
      console.log(`      found    ${JSON.stringify(found)}`)
      return false
    })())

  // The four read sites inside the one anonymous route, each gated. Pinned as source text.
  const DISC = read('app/api/discovery/events/route.ts')
  t('the host picks the column — show_on_hg on HatchGrab, show_on_vf otherwise',
    /const showCol = isHG \? 'show_on_hg' : 'show_on_vf'/.test(DISC))
  t('🔴 the trucks list requires !excluded AND the host column === true',
    /!t\.excluded &&\s*\n\s*t\[showCol\] === true/.test(DISC))
  t('🔴 the events query filters on the host column', /\.eq\(showCol, true\)/.test(DISC))
  t('🔴 a hidden truck drops its own events', /if \(!truck\[showCol\]\) return null/.test(DISC))
  t('🔴 an excluded truck drops its own events', /if \(truck\.excluded\) return null/.test(DISC))
  t('🔴 the operator read-through honours both too',
    /if \(truck\.excluded\) return false/.test(DISC) && /if \(!truck\[showCol\]\) return false/.test(DISC))
  t('every public page reads that route and no table of its own',
    /fetch\(`\/api\/discovery\/events\?t=/.test(read('hooks/useVillageData.ts')))
  t('the sitemap enumerates no truck pages', !/discovery_trucks/.test(read('app/sitemap.ts')))

  /* ══════════════════ 14. BROKEN VARIANTS ══════════════════ */
  console.log('── 14. BROKEN VARIANTS: each MUST be caught ────────────────────────────────────────────')

  // V1 — a details screenshot routed to the schedule path.
  const v1 = (c2) => c2 !== 'neither'            // the deny-list mistake
  t('V1 a deny-list gate would send truck_details to the schedule route (caught)',
    v1('truck_details') === true && D.shouldRunSchedule('truck_details') === false)

  // V2 — overwrite instead of fill-empty.
  const v2 = (d, truck) => {
    const fills = {}
    for (const f of D.FILLABLE) if (d[f]) fills[f] = d[f]     // ignores what is saved
    return { fills, kept: [], areaNote: null }
  }
  const v2p = v2(incoming, SAVED)
  t('V2 an overwriting planner would replace a saved email (caught)',
    v2p.fills.contact_email === 'new@example.com' && !('contact_email' in p.fills))

  // V3 — a fuzzy name applied automatically.
  // 🔴 A REAL FUZZY AUTO-APPLY, built from the repo's OWN matcher — the plausible mistake, not a straw
  // man. It finds the same near-miss `matchProspect` finds and then asserts identity instead of asking.
  const VS = c.req('lib/venue-signature.js')
  const v3 = (d, rows) => {
    const key = VS.normalizeVenue(d.name || '')
    const near = rows.find(r => {
      const rk = VS.normalizeVenue(r.name || '')
      return rk && key && VS.venuesFuzzyMatch(key, rk)
    })
    return near ? { kind: 'definite', row: near, on: 'name' } : { kind: 'none' }
  }
  const v3r = v3(D.parseTruckDetails(JSON.stringify({ name: 'Pizza Mando' })),
    [{ ...OTHER, name: 'Pizza Mondo' }])
  t('V3 a fuzzy auto-apply would call "Pizza Mando" definite (caught)',
    v3r.kind === 'definite' && fuzzy.kind === 'needs_a_look')

  // V4 — a hidden-created truck that appears in the public payload.
  const v4 = (d) => ({ name: d.name, show_on_vf: false })       // forgets show_on_hg
  t('V4 forgetting show_on_hg publishes the truck on HatchGrab (caught)',
    D.appearsInPublicTrucksPayload(v4(newDetails), 'hatchgrab') === false
    && D.appearsInPublicTrucksPayload({ ...v4(newDetails), show_on_hg: true }, 'hatchgrab') === true
    && D.appearsInPublicTrucksPayload(ins, 'hatchgrab') === false)
  const v4b = (d) => ({ ...D.hiddenTruckInsert(d), website: d.website })
  t('V4b putting the website on the new row makes it a scraper site (caught)',
    D.isScraperSite(v4b(newDetails)) === true && D.isScraperSite(ins) === false)

  // V5 — an alert per file.
  const v5 = () => true                                         // no latch at all
  t('V5 a latch-free alert fires on the second file of one outage (caught)',
    v5() === true && L.alertIsDue({ lastSuccessAt: '2026-10-01T10:00:00Z', lastAlertAt: '2026-10-01T10:05:00Z' }) === false)

  // V6 — an unnormalised Facebook URL stored as read (the addendum's required variant).
  const v6 = (raw) => raw
  t('V6 storing the url as read keeps tracking parameters (caught)',
    v6('https://m.facebook.com/3brosburgers?mibextid=x') !== 'https://www.facebook.com/3brosburgers'
    && D.canonicalFacebookUrl('https://m.facebook.com/3brosburgers?mibextid=x') === 'https://www.facebook.com/3brosburgers')

  /* ══════════════════ RESULT ══════════════════ */
  console.log('')
  for (const n of ok) console.log(`  ✓ ${n}`)
  for (const n of bad) { console.log(`  🔴 ${n}`); fails++ }
  console.log('')
  if (fails) { console.log(`🔴 ${bad.length} FAILED of ${ok.length + bad.length}`); process.exit(1) }
  console.log(`✅ all ${ok.length} passed`)

  if (process.env.HG_RENDER === '1') {
    console.log('')
    console.log('── HG_RENDER=1: measuring the results list in two browsers ──────────────────────────────')
    require('./screenshot-truck-details-render.cjs')
  } else {
    console.log('   (HG_RENDER=1 also measures the list at 1728 and 2560 in Chromium and WebKit)')
  }
})()
