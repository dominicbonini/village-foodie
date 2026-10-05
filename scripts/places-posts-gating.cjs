#!/usr/bin/env node
// scripts/places-posts-gating.cjs — Places and Social posts are a PREVIEW, for one truck.
//   node scripts/places-posts-gating.cjs     (≈1 s · NO NETWORK, NO DATABASE, NO BROWSER)
//
// ── 🔴 WHAT THIS GUARDS, IN THE ORDER IT WOULD HURT ────────────────────────────────────────────────
//    A PRIVATE EVENT GETTING A SOCIAL POST — the venue, the town and the postcode of a wedding on a
//      picture, posted publicly. `/api/weekly-post` already refuses one; the BUTTON was still on the
//      row, so the operator was offered it on Community Centre, Wed 14 Oct and got a refusal for
//      something the screen had promised;
//    AN UNFINISHED SCREEN REACHING A TRUCK THAT DID NOT ASK FOR IT — Places and Social posts are
//      being built, and `places_posts_preview` is how they stay with test-kitchen until they are done;
//    A GATE THAT IS ONLY IN THE UI — the pill can be hidden and the route still answer, so an old
//      `?section=places` link or a hand-made POST would reach it anyway;
//    AND THE OPPOSITE MISTAKE, WHICH IS THE EASY ONE TO MAKE: gating something every truck ALREADY
//      HAS on this branch. Add event's place picker, Tidy up places, the usual-type pre-selection,
//      event types, private events and pricing all shipped. Hiding a shipped control to hide a
//      preview tab is a regression wearing a feature flag.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
/** 🔴 CODE, NOT PROSE. Every count in this repo taken over a whole file has eventually been satisfied
 *  by a comment quoting the string it was looking for. */
const codeOf = src => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')

const FEATURES = read('lib/features.ts')
const MANAGE_PAGE = read('app/manage/[token]/page.tsx')
const MANAGE_ROUTE = read('app/api/manage/route.ts')
const POST_ROUTE = read('app/api/weekly-post/route.ts')
const KEY = 'places_posts_preview'
/** The plan sentence, read from the one module that holds it. */
const WEEKLY_POST_COPY = (read('lib/copy/weeklyPost.ts').match(/WEEKLY_POST_PLAN_REFUSAL = '([^']+)'/) || [])[1]

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)
const head = s => { console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 86 - s.length))}`) }
const show = r => {
  for (const n of r.ok) console.log('  ✓ ' + n)
  for (const n of r.bad) console.log('  🔴 ' + n)
  fails += r.bad.length
  const out = { ok: [...r.ok], bad: [...r.bad] }
  ok.length = 0; bad.length = 0
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE KEY IS IN NO PLAN, SO ONLY AN OVERRIDE CAN GRANT IT
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · the key is in NO plan — only trucks.feature_overrides can grant it')
{
  const code = codeOf(FEATURES)
  t('🔴 it is a `Feature`, so it goes through the ONE function that answers "may this truck do this"',
    new RegExp(`\\|\\s*'${KEY}'`).test(code))
  /* ══ 🔴 THE WHOLE GATE IS THAT IT IS IN NO PLAN SET ═══════════════════════════════════════════
   * `canAccess` consults `feature_overrides` FIRST and only then the plan, so a Feature absent from
   * every set reaches the final line and returns false for every tier — pro, max, trial, tester and
   * demo alike. ⛔ ADDING IT TO `PRO_FEATURES` OR `MAX_FEATURES` WOULD SWITCH IT ON FOR EVERY TRUCK
   * ON THOSE PLANS IN ONE LINE, and `TRIAL_FEATURES` spreads `MAX_FEATURES` which spreads
   * `PRO_FEATURES`, so one entry grants all five. This is the assertion that stops that.
   * ⚠️ IT IS COUNTED, NOT MERELY TESTED FOR ABSENCE: the name must appear EXACTLY ONCE in the code —
   * the union member — and nowhere else in this file. */
  const uses = (code.match(new RegExp(`'${KEY}'`, 'g')) || []).length
  t(`⛔ …and it appears exactly ONCE in lib/features.ts — the union member, no plan set (${uses})`,
    uses === 1)
  const planSets = code.slice(code.indexOf('const PRO_FEATURES'), code.indexOf('export function hasFeature'))
  t('⛔ …so neither PRO_FEATURES, MAX_FEATURES, TRIAL_FEATURES nor any PLAN_FEATURES set names it',
    planSets.length > 500 && !planSets.includes(KEY))
  /* ⚠️ AND `canAccess` STILL READS THE OVERRIDES FIRST, which is the only reason the key is reachable
   * at all. If that order were ever reversed the grant would stop working silently. */
  const ca = code.slice(code.indexOf('export function canAccess'))
  const overrideAt = ca.indexOf('feature in featureOverrides')
  const planAt = ca.indexOf('PLAN_FEATURES[plan]?.has(feature)')
  t('🔴 `canAccess` consults feature_overrides BEFORE any plan, which is what makes the grant work',
    overrideAt > 0 && planAt > overrideAt)
}
const s1 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE SCREEN: THE TWO PILLS, THE TWO PANES, AND A STALE BOOKMARK
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · the pills and panes are gated, and an old ?section= link lands on Events')
{
  const code = codeOf(MANAGE_PAGE)
  t('🔴 the Schedule tab resolves the key once, from the truck row it already has',
    new RegExp(`const canPlacesPosts = canAccess\\(truck\\.plan, '${KEY}'`).test(code))
  /* 🔴 FILTERED, NOT DISABLED. A pill that opens a refusal is worse than no pill: nothing on the
   * screen can say when it will work, and no plan sells it. */
  t('🔴 the pill row is FILTERED — Places and Social posts are absent without the key',
    /const visibleSections = canPlacesPosts\s*\n\s*\? SCHEDULE_SECTIONS\s*\n\s*: SCHEDULE_SECTIONS\.filter\(sec => sec\.id !== 'places' && sec\.id !== 'weekly'\)/.test(code)
    && /\{visibleSections\.map\(sec => \(/.test(code))
  /* ══ 🔴 A STALE BOOKMARK LANDS ON EVENTS **IN THE SAME RENDER** ════════════════════════════════
   * The page reads `?section=` at mount, before the truck row arrives, so it cannot know the answer
   * there. ⛔ ASSERTED AS A DERIVATION, NOT AS A CORRECTION: a `useEffect` that set the section
   * afterwards would render the gated pane for one frame — and on a slow truck row, for longer. */
  t('🔴 `shownSection` is DERIVED, so a gated section renders Events in the same render',
    /const shownSection: ScheduleSection =\s*\n\s*\(!canPlacesPosts && \(section === 'places' \|\| section === 'weekly'\)\) \? 'events' : section/.test(code))
  t('⚠️ …and the URL is tidied afterwards, through the parent\'s setter, so a refresh agrees',
    /if \(shownSection !== section\) onSectionChange\(shownSection\)/.test(code))
  /* ⛔ AND EVERY PANE SWITCHES ON THE DERIVED VALUE. One left on `section` would render a gated pane
   * for good — which is the failure this whole section exists to prevent. */
  const rawSection = (code.match(/\bsection === '/g) || []).length
  t(`⛔ nothing past the derivation still switches on the RAW section (${rawSection} use(s), the derivation itself)`,
    rawSection === 2)
  for (const id of ['events', 'places', 'event-types']) {
    t(`🔴 the \`${id}\` pane switches on \`shownSection\``,
      new RegExp(`isActive && shownSection === '${id}'`).test(code))
  }
  t('🔴 the `weekly` pane switches on `shownSection`',
    /isActive && shownSection === 'weekly' && <WeeklyPostPane/.test(code))
}
const s2 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · "Make post" — ABSENT ON A PRIVATE EVENT, AND WITHOUT THE KEY
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · "Make post" is absent on a private event, and absent without the key')
{
  const code = codeOf(MANAGE_PAGE)
  /* ⛔ ABSENT, NOT DISABLED. A private event has no post — `/api/weekly-post` refuses one — so a
   * disabled button would be promising something that will never exist. The Private chip on the row
   * already says why. */
  t('🔴 the button is gated on BOTH: not private, AND the truck holds the key',
    /\{!event\.is_private && canPlacesPosts && \(\s*\n\s*<button onClick=\{\(\) => setPostEventId\(event\.id\)\}/.test(code))
  /* 🔴 AND THE ROUTE REFUSES IT TOO. The screen decides what is DRAWN; the route decides what is
   * DONE, and a hand-made POST never passes through the screen. */
  t('⛔ …and `event_post` / `event_render` are behind the same route gate',
    /if \(action === 'event_post'\)/.test(POST_ROUTE)
    && /if \(action === 'event_render'\)/.test(POST_ROUTE))
}
const s3 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE ROUTES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · the routes refuse without the key — and refuse with the right sentence')
{
  const code = codeOf(POST_ROUTE)
  /* 🔴 ONE `gated(truck)` AT THE TOP OF POST GUARDS EVERY ACTION IN THE FILE, which is why the
   * weekly post's render and save AND the single-event post's two actions are all behind it. */
  t('🔴 /api/weekly-post checks the preview key, and checks it FIRST',
    new RegExp(`function gated\\(truck: TruckRow\\)[\\s\\S]{0,400}'${KEY}' as never`).test(code))
  const g = code.slice(code.indexOf('function gated(truck: TruckRow)'), code.indexOf('async function loadDesign'))
  const previewAt = g.indexOf(KEY)
  const planAt = g.indexOf('schedule_graphics')
  /* ⛔ THE ORDER MATTERS AND IT IS NOT COSMETIC. The plan sentence, told to a MAX truck that simply
   * does not hold the preview key, is a lie, and it sends them to billing. */
  t('⛔ …before `schedule_graphics`, so a Max truck is not told to upgrade',
    previewAt > 0 && planAt > previewAt)
  t('⚠️ …and the refusal says "not switched on", never "upgrade" — no plan sells this yet',
    /Social posts are not switched on for this truck\./.test(g)
    && /WEEKLY_POST_PLAN_REFUSAL/.test(g))

  /* ══ 🔴 THE PLAN SENTENCE SAYS "Max", BECAUSE THE KEY IS MAX-ONLY (5 October 2026) ═══════════════
   * ⛔ IT SAID "Pro and Max", in TWO places, about a key that lives in `MAX_FEATURES` alone — so
   * `canAccess('pro', 'schedule_graphics', {}, null)` is FALSE and a Pro truck was told the weekly
   * post came with their plan and then refused it. Found at release prep by calling `canAccess` for
   * all four plans rather than reading the comments.
   * 🔴 THE GATE AND THE SENTENCE ARE ASSERTED TOGETHER, which is the point: pinning the wording alone
   * would pass again the moment the key moved to `PRO_FEATURES`, and pinning the key alone would pass
   * with the wrong sentence. ⚠️ `canAccess` IS CALLED, not read — a comment about a plan is not a
   * plan. */
  {
    const { compile } = require('./_slot-interval-compile.cjs')
    const F = compile(REPO, ['lib/features.ts'], 'gating-features').req('lib/features.js')
    const can = (plan, key) => F.canAccess(plan, key, {}, null)
    t('🔴 `schedule_graphics` is MAX-only — canAccess says so for all four plans, not a comment',
      can('starter', 'schedule_graphics') === false
      && can('pro', 'schedule_graphics') === false
      && can('max', 'schedule_graphics') === true
      && can('trial', 'schedule_graphics') === true)
    t('⛔ …so the refusal names Max, and does NOT say "Pro and Max"',
      WEEKLY_POST_COPY === 'The weekly post is on Max'
      && !/Pro and Max/.test(WEEKLY_POST_COPY))
    /* ⚠️ AND IT IS THE SAME STRING ON BOTH SURFACES. Two copies is what made the error possible. */
    t('⚠️ …and the screen and the route read that ONE constant, not two literals',
      /import \{ WEEKLY_POST_PLAN_REFUSAL \} from '@\/lib\/copy\/weeklyPost'/.test(read('components/manage/SchedulePlaces.tsx'))
      && /import \{ WEEKLY_POST_PLAN_REFUSAL \} from '@\/lib\/copy\/weeklyPost'/.test(POST_ROUTE)
      && !/'The weekly post is on/.test(codeOf(read('components/manage/SchedulePlaces.tsx')))
      && !/'The weekly post is on/.test(codeOf(POST_ROUTE)))
    /* 🔴 AND THE OTHER THREE KEYS, FOR THE SAME REASON — the Gusto list in
     * docs/release-prep-report.md states each one's plan, and this is what makes that statement a
     * check rather than a claim. */
    t('🔴 `event_types` is Max-only · `private_events` is Pro AND Max · `places_posts_preview` is in NO plan',
      can('pro', 'event_types') === false && can('max', 'event_types') === true
      && can('pro', 'private_events') === true && can('max', 'private_events') === true
      && can('starter', 'private_events') === false
      && can('pro', 'places_posts_preview') === false
      && can('max', 'places_posts_preview') === false
      && can('trial', 'places_posts_preview') === false
      && F.canAccess('pro', 'places_posts_preview', { places_posts_preview: true }, null) === true)
  }
  t('🔴 …and the gate runs before any action is dispatched',
    /const blocked = gated\(truck\)\s*\n\s*if \(blocked\) return blocked\s*\n\s*\n?\s*const action = String\(body\.action \?\? ''\)/.test(code))

  const m = codeOf(MANAGE_ROUTE)
  /* ══ 🔴 THE SPLIT IS THE POINT, AND BOTH HALVES ARE ASSERTED ═══════════════════════════════════
   *   GATED — what exists only inside the Places TAB.
   *   UNGATED — `sg_places` and `sg_upsert_place`, which the Add event picker and Tidy up places both
   *     call. Every truck on this branch has those; gating either would switch off a shipped control. */
  const GATED = ['sg_place_pictures', 'sg_place_picture_url', 'sg_place_picture_save',
    'sg_place_picture_remove', 'sg_place_events', 'sg_place_usual_type']
  const list = m.slice(m.indexOf('const PLACES_TAB_ONLY = ['), m.indexOf('if (action === \'sg_places\')'))
  for (const a of GATED) t(`🔴 \`${a}\` is behind the key`, list.includes(`'${a}'`))
  t('🔴 …and the gate is one check, before the actions, with the key named',
    new RegExp(`PLACES_TAB_ONLY\\.includes\\(action\\)[\\s\\S]{0,160}'${KEY}'`).test(m))
  /* ⛔ THE UNGATED HALF. Asserted as "NOT in the list", by name, so adding one later is a visible
   * change to this file rather than a quiet regression in a screen nobody is testing. */
  for (const a of ['sg_places', 'sg_upsert_place', 'sg_merge_place']) {
    t(`⛔ \`${a}\` is NOT gated — the Add event picker and Tidy up places call it`,
      !new RegExp(`'${a}'`).test(list))
  }
  /* ⚠️ AND THE PRE-SELECTION READ IS NOT GATED EITHER. It arrives with the `sg_places` rows, and it
   * is what fills the type pill when a place is picked — which every truck keeps. */
  const et = codeOf(read('app/api/event-types/route.ts'))
  t('⛔ `usual_for_venue` — the Add event pre-selection — has NO preview gate',
    /action === 'usual_for_venue'/.test(et) && !et.includes(KEY))
  t('⛔ …and neither do event types, private events or pricing',
    !codeOf(read('lib/private-events/write.ts')).includes(KEY))
}
const s4 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE PRIVATE PREVIEW CARD (A.3)
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · the Add/Edit preview shows a private event as a private event')
{
  const code = codeOf(MANAGE_PAGE)
  /* 🔴 IT READS THE PILL, NOT THE DATABASE. `is_private` is not written until Save, so the preview
   * must reflect the TYPE CURRENTLY SELECTED — the same expression the save sends as `is_private`. */
  t('🔴 the preview reads the SELECTED type, falling back to the saved flag while types load',
    /const previewIsPrivate = privateTypeId\s*\n\s*\? eventTypeId === privateTypeId\s*\n\s*: \(editingEvent\?\.is_private === true\)/.test(code))
  t('🔴 …which is the same expression the SAVE sends as `is_private`',
    /const chosenPrivate = !!privateTypeId && eventTypeId === privateTypeId/.test(code))
  /* ⛔ THE VENUE, TOWN AND POSTCODE ARE NOT RENDERED AT ALL in the private branch — not greyed, not
   * struck through, not in a title attribute. A private address that is on the screen "but hidden" is
   * an address that leaks the first time someone copies the DOM. */
  const branch = (() => {
    const a = code.indexOf('{previewIsPrivate ? (')
    const b = code.indexOf(') : (', a)
    return a > 0 && b > a ? code.slice(a, b) : ''
  })()
  t('🔴 the private card is a LOCK and "Private event" in purple, as the title',
    branch.length > 200
    && /text-purple-700/.test(branch)
    && /🔒/.test(branch)
    && /\{PRIVATE_PUBLIC_LABEL\}/.test(branch))
  t('⛔ …and it renders NO venue, town, postcode or address — not even greyed out',
    branch.length > 200
    && !/venue_name/.test(branch) && !/\btown\b/.test(branch)
    && !/postcode/.test(branch) && !/\baddress\b/.test(branch))
  t('🔴 …but it DOES show the date, the times and the van chip',
    /placeShortDayLocal\(editingEvent\.event_date \|\| null\)/.test(branch)
    && /timeRangeLabel\(editingEvent\.start_time, editingEvent\.end_time\)/.test(branch)
    && /previewVanName/.test(branch))
  /* ⚠️ THE WORDS ARE THE PUBLIC SURFACES' OWN CONSTANT, so the operator's preview and a customer's
   * card cannot be two different pairs of words. */
  t('⚠️ "Private event" is the shared constant, not two more words',
    /import \{ PRIVATE_PUBLIC_LABEL \} from '@\/lib\/private-events\/resolve'/.test(code))
  /* 🔴 AND THE LINE UNDER IT. "Filled from …" answers "will editing this change the place?"; on a
   * private event the question is "where did my venue go?", and that is what this answers. */
  const COPY = read('lib/private-events/copy.ts')
  t('🔴 the line under the card names the three fields that are not published',
    /export const PRIVATE_PREVIEW_NOTE =\s*\n\s*'How it shows on your schedule — no venue, town or postcode\.'/.test(COPY))
  t('⛔ …and it REPLACES "Filled from", rather than sitting beside it',
    /\{previewIsPrivate \? \(\s*\n\s*<p className="text-\[11px\] text-slate-400 -mt-1">\{PRIVATE_PREVIEW_NOTE\}<\/p>\s*\n\s*\) : !editingEvent\.id && editingEvent\.truck_place_id \? \(/.test(code))
  /* ⚠️ NOT CONDITIONAL ON A PICKED PLACE. It is true of every private event, typed address or not —
   * which "Filled from" is not, and that difference is why the two lines are not one. */
  t('⚠️ …and the private line is NOT conditional on `truck_place_id`',
    !/previewIsPrivate && editingEvent\.truck_place_id/.test(code))
}
const s5 = show({ ok, bad })

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
const total = [s1, s2, s3, s4, s5].reduce((n, r) => n + r.ok.length, 0)
console.log(`\n${fails === 0 ? `✅ all ${total} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
process.exit(fails === 0 ? 0 : 1)
