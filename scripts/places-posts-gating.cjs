#!/usr/bin/env node
// scripts/places-posts-gating.cjs — Social media follows the PLAN. (Was: a preview, for one truck.)
//   node scripts/places-posts-gating.cjs     (≈1 s · NO NETWORK, NO DATABASE, NO BROWSER)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 REAIMED AT LAUNCH — 10 OCTOBER 2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ **THIS FILE USED TO PROVE THE OPPOSITE OF WHAT IT NOW PROVES**, and that is why the old claims are
// quoted rather than deleted. Until today Social media was gated on `places_posts_preview` — a
// `Feature` in NO plan set, which `canAccess` could only ever grant from `trucks.feature_overrides`,
// and which was granted to exactly one truck (test-kitchen, "Pizza Kitchen"). Eleven checks here
// asserted that arrangement: that the key was in no plan, that the route checked it FIRST, and that
// the refusal said "not switched on" rather than "upgrade", because no plan sold it.
//
// 🔴 **IT IS LAUNCHED. ONE KEY, AND IT FOLLOWS THE PLAN.** `schedule_graphics` moved from
// `MAX_FEATURES` to `PRO_FEATURES` — Pro, Max and trial — and `places_posts_preview` is gone from the
// union. So the checks below are the same questions with the answers inverted, plus two that could not
// be asked before:
//    THE PROMISE IS ENFORCED — the comparison table's 'Social media posts' row is mapped in
//      `ROW_FEATURE_MAP`, so `findPlanParityViolations()` compares `pro: true, max: true` against
//      `canAccess` on every module load. It was a hard `true` with no map entry for four days, which
//      the file itself called an unchecked promise on a public, indexed pricing page;
//    THE OLD OVERRIDE IS INERT — `{"places_posts_preview": true}` is left in the database on purpose,
//      and is PROVED to grant nothing, because `canAccess` only ever looks up a key it is given;
//
// ── 🔴 AND WHAT IT HAS ALWAYS GUARDED, IN THE ORDER IT WOULD HURT ─────────────────────────────────
//    A PRIVATE EVENT GETTING A SOCIAL POST — the venue, the town and the postcode of a wedding on a
//      picture, posted publicly. `/api/weekly-post` refuses one; the BUTTON was still on the row, so
//      the operator was offered it on Community Centre, Wed 14 Oct and got a refusal for something the
//      screen had promised;
//    A GATE THAT IS ONLY IN THE UI — the tab can be hidden and the route still answer, so an old
//      `?section=places` link or a hand-made POST would reach it anyway;
//    AND THE OPPOSITE MISTAKE, WHICH IS THE EASY ONE TO MAKE: gating something every truck ALREADY
//      HAS. Add event's place picker, Tidy up places, the usual-type pre-selection, event types,
//      private events and pricing are not part of this feature. Switching one off to tidy a gate is a
//      regression wearing a feature flag.
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
/** 🔴 THE ONE KEY FOR SOCIAL MEDIA. ⚠️ Its NAME is historical — see `lib/features.ts`. */
const KEY = 'schedule_graphics'
/** ⛔ THE RETIRED PREVIEW KEY. Asserted ABSENT from the code, and asserted inert as an override. */
const OLD_KEY = 'places_posts_preview'
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
head('1 · the key is a PLAN key — Pro, Max and trial — and the preview key is gone')
{
  const code = codeOf(FEATURES)
  t('🔴 it is a `Feature`, so it goes through the ONE function that answers "may this truck do this"',
    new RegExp(`\\|\\s*'${KEY}'`).test(code))
  /* ══ 🔴 THE INVERTED CLAIM. This check used to read "it appears exactly ONCE — the union member, no
   * plan set", and that single occurrence WAS the gate: a Feature in no set reaches `canAccess`'s last
   * line and returns false for every tier. ⛔ IT MUST NOW APPEAR **TWICE**: the union member and the
   * `PRO_FEATURES` entry. ⚠️ TWICE AND NOT MORE — a third occurrence would mean it had also been added
   * to `MAX_FEATURES` or a `PLAN_FEATURES` set, which is a duplicate in a Set rather than a second
   * grant, and is the kind of redundancy that makes the next reader wonder which one is load-bearing. */
  const uses = (code.match(new RegExp(`'${KEY}'`, 'g')) || []).length
  t(`🔴 …and it appears exactly TWICE in lib/features.ts — the union member and PRO_FEATURES (${uses})`,
    uses === 2)
  const planSets = code.slice(code.indexOf('const PRO_FEATURES'), code.indexOf('export function hasFeature'))
  const proArr = planSets.slice(0, planSets.indexOf('const MAX_FEATURES'))
  t('🔴 …and the one plan entry is in PRO_FEATURES, which MAX and TRIAL spread',
    proArr.includes(`'${KEY}'`)
    && /const MAX_FEATURES: Feature\[\] = \[\s*\n\s*\.\.\.PRO_FEATURES/.test(planSets)
    && /const TRIAL_FEATURES: Feature\[\] = \[\.\.\.MAX_FEATURES\]/.test(planSets))
  /* ══ ⛔ AND THE PREVIEW KEY IS GONE FROM THE **CODE** ════════════════════════════════════════════
   * ⚠️ FROM THE CODE, NOT FROM THE FILE: `codeOf` strips comments, and the tombstone that explains the
   * removal quotes the name several times. A check that matched the prose would fail on the tombstone
   * — which is a mistake this workstream made twice in one day and recorded both times. */
  t('⛔ `places_posts_preview` is gone from lib/features.ts — union, every plan set, everywhere',
    !code.includes(OLD_KEY))
  t('⛔ …and from every product file that used to check it', (() => {
    const files = ['app/manage/[token]/page.tsx', 'app/api/manage/route.ts',
      'app/api/weekly-post/route.ts', 'lib/plan-features.ts']
    return files.every(f => !codeOf(read(f)).includes(OLD_KEY))
  })())
  /* ⚠️ AND `canAccess` STILL READS THE OVERRIDES FIRST. Unchanged mechanism — asserted because the
   * next check depends on it, and because reversing that order would silently change every
   * per-truck grant in the product. */
  const ca = code.slice(code.indexOf('export function canAccess'))
  const overrideAt = ca.indexOf('feature in featureOverrides')
  const planAt = ca.indexOf('PLAN_FEATURES[plan]?.has(feature)')
  t('⚠️ `canAccess` still consults feature_overrides BEFORE any plan — the mechanism is unchanged',
    overrideAt > 0 && planAt > overrideAt)

  /* ══ 🔴 THE TIERS, BY CALLING `canAccess` — NOT BY READING A COMMENT ═════════════════════════════
   * ⛔ THE ONE CHECK IN THIS FILE'S HISTORY THAT CAUGHT A REAL SHIPPED BUG was this one: the refusal
   * said "Pro and Max" about a key in `MAX_FEATURES` alone, and it was found by calling `canAccess`
   * for every plan rather than believing the sentence. So the tiers are called, every time. */
  const { compile } = require('./_slot-interval-compile.cjs')
  const F = compile(REPO, ['lib/features.ts'], 'gating-features').req('lib/features.js')
  const can = (plan, key) => F.canAccess(plan, key, {}, null)
  t('🔴 Pro, Max, trial, tester and demo have it — and Starter does NOT', (() => {
    const yes = ['pro', 'max', 'trial', 'tester', 'demo'].every(p => can(p, KEY) === true)
    return yes && can('starter', KEY) === false
  })())
  /* ══ 🔴 "THE DATABASE ROW BECOMES HARMLESS" — PROVED, NOT ASSERTED ═══════════════════════════════
   * ⛔ THE LAUNCH DELIBERATELY LEAVES `{"places_posts_preview": true}` IN `trucks.feature_overrides`
   * rather than running an UPDATE, and the whole safety of that rests on one property of `canAccess`:
   * it only ever looks up the key it is GIVEN. A stale override naming a key that is no longer a
   * `Feature` can therefore neither grant nor deny anything.
   * 🔴 AND THIS IS ALSO WHY THE KEY WAS REMOVED RATHER THAN PROMOTED. Had `places_posts_preview` stayed
   * and joined `PRO_FEATURES`, Pizza Kitchen would still be granted by its OVERRIDE — overrides win
   * first — so the one truck used to check the launch would be the one truck not testing the new gate. */
  t('🔴 a stale `places_posts_preview` override grants NOTHING — the database row is inert',
    F.canAccess('starter', KEY, { [OLD_KEY]: true }, null) === false
    && F.canAccess('pro', KEY, { [OLD_KEY]: false }, null) === true)

  /* ══ 🔴 THE PROMISE IS ENFORCED NOW, WHICH IT WAS NOT ════════════════════════════════════════════
   * ⛔ 'Social media posts' WAS A HARD `true` ON A PUBLIC PRICING PAGE WITH NO `ROW_FEATURE_MAP` ENTRY,
   * so `findPlanParityViolations()` `continue`d past it and the table promised what no plan granted.
   * ⚠️ THE GUARD IS **RUN**, not read: it is the function the landing, /features, Billing and Admin all
   * depend on at module load, and a violation would take all four out in dev. */
  const PF = compile(REPO, ['lib/features.ts', 'lib/plan-features.ts', 'lib/whatsapp-live.ts'],
    'gating-plan-features').req('lib/plan-features.js')
  t('🔴 the comparison table row is MAPPED to this key, so the guard checks the promise', (() => {
    const pf = codeOf(read('lib/plan-features.ts'))
    return /'Social media posts': 'schedule_graphics',/.test(pf)
      && /\{ name: 'Social media posts',[^\n]*starter: false, pro: true, max: true \}/.test(pf)
  })())
  t('🔴 …and `findPlanParityViolations()` reports clean with it mapped',
    Array.isArray(PF.findPlanParityViolations()) && PF.findPlanParityViolations().length === 0)
  /* ⛔ AND THE CELLS NO LONGER SAY "coming soon" — in either tier. The cells are what carried that
   * label (Dominic's own correction on 6 October: cells, not a badge), so this is where launching it
   * is visible, and all four renderers follow from here. */
  t('⛔ …and neither cell says `coming_soon` any more', (() => {
    const row = (codeOf(read('lib/plan-features.ts')).match(/\{ name: 'Social media posts'[^\n]*/) || [''])[0]
    return row.length > 60 && !row.includes('coming_soon')
  })())
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
  /* ══ 🔴 THE GATE MOVED UP A LEVEL — 7 October 2026 ══════════════════════════════════════════════
   * ⛔ IT USED TO DECIDE WHETHER SCHEDULE SHOWED A THIRD PILL, and these six checks were about that
   * pill: the filtered row, the derived `shownSection` that sent a gated id to Events in the same
   * render, the canonicalisation ordering, the URL tidy-up, and the two panes.
   * 🔴 SOCIAL MEDIA IS ITS OWN **TOP TAB** NOW AND THE GATE IS ON THE TAB. Which is a simpler and
   * stronger arrangement, and the checks below say why rather than merely following it: a truck
   * without the key has no tab, so there is no section of Schedule to fall through from, nothing to
   * tidy out of the URL, and no frame in which a gated pane could render.
   * ⚠️ FILTERED, NOT DISABLED — unchanged, and still the point, though the REASON changed at launch.
   * It used to be "nothing on the screen can say when it will work, and no plan sells it". Now a plan
   * does sell it, and the answer is the same for a different reason: **every other plan-gated TAB on
   * this bar is filtered the same way**, and Billing is where a plan is changed. ⛔ A GREYED TAB WOULD
   * BE A NEW PATTERN on the one bar an operator uses every day. */
  t('🔴 the TOP TAB is filtered — there is no Social media tab without the key',
    /if \(t\.id === 'social'\) \{/.test(code)
    && new RegExp(`return t\\.roles\\.includes\\(userRole\\)\\s*\\n\\s*&& canAccess\\(truck\\?\\.plan \\?\\? 'starter', '${KEY}',`).test(code)
    /* ⛔ AND IT IS THE `tabs` LIST THE BAR RENDERS, not a second filtered copy. */
    && /const tabs = allTabs\.filter\(t => \{/.test(code)
    && /\{tabs\.map\(t => \(/.test(code))
  /* ⛔ AND THE PANE IS MOUNTED BEHIND THE SAME ANSWER. A tab an operator cannot see is not a
   * sufficient guard on its own: `activeTab` is state, and a legacy URL sets it. The mount tests
   * `activeTab === 'social'`, and `activeTab` can only become `'social'` through a tab the filter
   * produced or a `?tab=` the parser honours — so the second half is the ROUTE, asserted in §4. */
  t('🔴 the pane is mounted only while the social tab is active, and only one of them',
    /\{activeTab === 'social' && truck && \(/.test(code)
    && /<SocialPostsPane truck=\{truck\} token=\{token\}/.test(code)
    && (code.match(/<SocialPostsPane /g) || []).length === 1)
  /* 🔴 SCHEDULE'S PILLS ARE NOW THE SAME FOR EVERY TRUCK, which is what "nothing about the top bar
   * changes for them" means one level down. ⛔ SO `visibleSections` IS THE WHOLE LIST AND
   * `shownSection` IS THE SECTION — asserted, because an unused filter left behind would be a gate
   * the next person assumes is live. */
  t('⛔ Schedule has nothing left to filter — two pills, ungated, for every truck',
    /const visibleSections = SCHEDULE_SECTIONS$/m.test(code)
    && /const shownSection: ScheduleSection = section$/m.test(code)
    && !/SCHEDULE_SECTIONS\.filter\(/.test(code)
    && /const SCHEDULE_SECTIONS: \{ id: ScheduleSection; label: string \}\[\] = \[/.test(code))
  /* ⚠️ `canPlacesPosts` IS STILL READ, AND BY EXACTLY ONE THING: the "Make post" shortcut on an event
   * row, because the screen it opens is gated. ⛔ A COUNT, BECAUSE "still read" AND "read once" ARE
   * DIFFERENT CLAIMS and only the second one says the gate did not leak. */
  t('⚠️ `canPlacesPosts` survives for ONE reader — the "Make post" shortcut', (() => {
    const uses = (code.match(/\bcanPlacesPosts\b/g) || []).length
    return uses === 2  // the declaration, and the one guard
      && new RegExp(`const canPlacesPosts = canAccess\\(truck\\.plan, '${KEY}'`).test(code)
      && /\{!event\.is_private && canPlacesPosts && \(/.test(code)
  })())
  /* ══ ⛔ AND A STALE BOOKMARK STILL CANNOT REACH A GATED SCREEN ══════════════════════════════════
   * This is the claim the old `shownSection` derivation existed for, and it is now answered by the
   * resolver plus the tab filter rather than by a fall-through inside Schedule.
   * 🔴 `?section=places` RESOLVES TO THE **SOCIAL** TAB — so on a truck without the key the parser
   * selects a tab that is not in `tabs`, the bar lights nothing, and the pane's `activeTab === 'social'`
   * mount is the only thing that could draw it. ⚠️ WHICH IS WHY §4's ROUTE GATE IS THE ONE THAT
   * MATTERS: every action behind that pane refuses without the key, so the worst case is an empty
   * pane rather than a working one. Said here rather than left implied. */
  t('⛔ a legacy `?section=` lands on the SOCIAL tab, whose tab and routes are both gated',
    /places: 'locations',/.test(read('lib/manage-links.ts'))
    && /const moved = resolveManageLocation\(tabParam, sectionParam\)/.test(code)
    && code.indexOf('const moved = resolveManageLocation(tabParam, sectionParam)')
       < code.indexOf("if (moved.tab === 'social'"))
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
  /* ⚠️ IT HANDS THE EVENT TO THE SOCIAL TAB NOW (7 October 2026) rather than opening a modal here —
   * so the assertion names `onOpenSocial('create', event.id)`. The GATE is unchanged and is still
   * both halves: not private, and the truck holds the key. */
  t('🔴 the button is gated on BOTH: not private, AND the truck holds the key',
    /\{!event\.is_private && canPlacesPosts && \(/.test(code)
    && /onOpenSocial\('create', event\.id\)/.test(code)
    /* ⛔ AND THE GUARD IS THE ONE DIRECTLY ABOVE THAT BUTTON, not a coincidental pair elsewhere in a
     * 16,000-line file — asserted on the gap between them. */
    && code.indexOf("onOpenSocial('create', event.id)")
       - code.indexOf('{!event.is_private && canPlacesPosts && (') < 200)
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
  /* ══ 🔴 ONE CHECK, NOT TWO — AND THE ORDERING CLAIM IS GONE WITH THE SECOND KEY ══════════════════
   * ⛔ THIS USED TO BE THREE CHECKS: that the route tested the preview key, that it tested it BEFORE
   * `schedule_graphics`, and that the refusal said "not switched on" rather than naming a plan. All
   * three existed because there were TWO gates in front of this feature and the order decided which
   * sentence a Max truck was told. 🔴 THERE IS ONE GATE NOW, so the ordering has nothing to order and
   * the sentence has nothing to choose between. ⚠️ A COUNT IS WHAT SAYS SO: exactly one `canAccess`
   * call in `gated()`, and the retired key nowhere in the file's code. */
  const g = code.slice(code.indexOf('function gated(truck: TruckRow)'), code.indexOf('async function loadDesign'))
  t('🔴 /api/weekly-post has ONE gate, on the plan key',
    new RegExp(`'${KEY}' as never`).test(g)
    && (g.match(/canAccess\(/g) || []).length === 1
    && !g.includes(OLD_KEY))
  /* ⛔ AND IT GUARDS THE **GET** AS WELL AS THE POST. The font file §2 of round 7 added is a GET on
   * this route, and a plan gate that only covered POST would serve a truck's fonts to a plan that
   * cannot have the feature. ⚠️ ASSERTED ON BOTH HANDLERS, because there are two entry points now and
   * there was one when this file was written. */
  t('🔴 …and it is called at the top of BOTH handlers — the POST and the font GET',
    /export async function GET\(req: NextRequest\)[\s\S]{0,900}const blocked = gated\(truck\)\s*\n\s*if \(blocked\) return blocked/.test(code)
    && /export async function POST\(req: NextRequest\)[\s\S]{0,700}const blocked = gated\(truck\)\s*\n\s*if \(blocked\) return blocked/.test(code))
  t('⚠️ …and the refusal is the ONE shared sentence, never a literal in the route',
    /WEEKLY_POST_PLAN_REFUSAL/.test(g)
    && !/not switched on/.test(codeOf(POST_ROUTE)))

  /* ══ 🔴 THE PLAN SENTENCE SAYS "Pro and Max", BECAUSE THE KEY IS IN `PRO_FEATURES` ═══════════════
   * ⛔ THE ONE CHECK IN THIS FILE'S HISTORY THAT CAUGHT A SHIPPED BUG, AND IT IS KEPT POINTING THE
   * OTHER WAY. On 5 October the sentence said "Pro and Max" about a key in `MAX_FEATURES` alone — so a
   * Pro truck was told the weekly post came with their plan and then refused it. It was found by
   * calling `canAccess` for every plan rather than reading the comments, and the fix pinned the
   * wording to "Max". 🔴 THE KEY HAS NOW MOVED TO `PRO_FEATURES`, SO "Max" BECAME THE MIRROR IMAGE OF
   * THE SAME BUG: it would send a Starter truck to buy the wrong plan and tell a Pro truck the feature
   * is not on their plan when it is.
   * ⚠️ THE GATE AND THE SENTENCE ARE ASSERTED TOGETHER, which is the whole point: pinning the wording
   * alone would pass again the moment the key moved, and pinning the key alone would pass with the
   * wrong sentence. */
  {
    const { compile } = require('./_slot-interval-compile.cjs')
    const F = compile(REPO, ['lib/features.ts'], 'gating-features').req('lib/features.js')
    const can = (plan, key) => F.canAccess(plan, key, {}, null)
    t('🔴 `schedule_graphics` is Pro AND Max — canAccess says so for every plan, not a comment',
      can('starter', KEY) === false
      && can('pro', KEY) === true
      && can('max', KEY) === true
      && can('trial', KEY) === true)
    t('⛔ …so the refusal names Pro and Max, and does NOT say "on Max"',
      WEEKLY_POST_COPY === 'Social media posts are on Pro and Max'
      && !/is on Max/.test(WEEKLY_POST_COPY))
    /* ⚠️ AND IT IS THE SAME STRING ON ALL THREE SURFACES. Two copies is what made the 5 October error
     * possible; there are three readers now, so the argument is stronger rather than weaker. */
    t('⚠️ …and the screen and BOTH routes read that ONE constant, not three literals',
      /import \{ WEEKLY_POST_PLAN_REFUSAL \} from '@\/lib\/copy\/weeklyPost'/.test(read('components/manage/SocialPosts.tsx'))
      && /import \{ WEEKLY_POST_PLAN_REFUSAL \} from '@\/lib\/copy\/weeklyPost'/.test(POST_ROUTE)
      && /import \{ WEEKLY_POST_PLAN_REFUSAL \} from '@\/lib\/copy\/weeklyPost'/.test(MANAGE_ROUTE)
      && !/'Social media posts are on/.test(codeOf(read('components/manage/SocialPosts.tsx')))
      && !/'Social media posts are on/.test(codeOf(POST_ROUTE))
      && !/'Social media posts are on/.test(codeOf(MANAGE_ROUTE)))
    /* 🔴 AND THE OTHER TWO KEYS, FOR THE SAME REASON — the Gusto list in docs/release-prep-report.md
     * states each one's plan, and this is what makes that statement a check rather than a claim.
     * ⛔ `places_posts_preview` HAS LEFT THIS LIST because it has left the product; §1 proves it is
     * gone and that a stale override grants nothing. */
    t('🔴 `event_types` is Max-only · `private_events` is Pro AND Max',
      can('pro', 'event_types') === false && can('max', 'event_types') === true
      && can('pro', 'private_events') === true && can('max', 'private_events') === true
      && can('starter', 'private_events') === false)
  }
  t('🔴 …and the gate runs before any action is dispatched',
    /const blocked = gated\(truck\)\s*\n\s*if \(blocked\) return blocked\s*\n\s*\n?\s*const action = String\(body\.action \?\? ''\)/.test(code))

  const m = codeOf(MANAGE_ROUTE)
  /* ══ 🔴 THE SPLIT IS THE POINT, AND BOTH HALVES ARE ASSERTED ═══════════════════════════════════
   *   GATED — what exists only inside the Places TAB.
   *   UNGATED — `sg_places` and `sg_upsert_place`, which the Add event picker and Tidy up places both
   *     call. Every truck on this branch has those; gating either would switch off a shipped control. */
  /* ⛔ RE-AIMED (5 October 2026): FIVE OF THE SIX GATED ACTIONS NO LONGER EXIST. The pictures pane and
   * "Events here" were deleted, and `sg_place_pictures`, `sg_place_picture_url`,
   * `sg_place_picture_save`, `sg_place_picture_remove` and `sg_place_events` went with them.
   * 🔴 SO THE CLAIM IS NOW TWO CLAIMS, and the second is the one that keeps this honest: what remains
   * is gated, AND the five are gone from the ROUTE ENTIRELY — not merely absent from the list, which is
   * what an action that had been quietly un-gated would also look like. */
  const GATED = ['sg_place_usual_type']
  const list = m.slice(m.indexOf('const PLACES_TAB_ONLY = ['), m.indexOf('if (action === \'sg_places\')'))
  for (const a of GATED) t(`🔴 \`${a}\` is behind the key`, list.includes(`'${a}'`))
  for (const a of ['sg_place_pictures', 'sg_place_picture_url', 'sg_place_picture_save',
    'sg_place_picture_remove', 'sg_place_events']) {
    t(`⛔ \`${a}\` is GONE from the route — not un-gated, deleted`, !new RegExp(`action === '${a}'`).test(m))
  }
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
