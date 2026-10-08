// lib/manage-links.ts — the ONE builder for a link into a Manage tab or section.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS FILE EXISTS: A SECTION LINK THAT LOST ITS TAB (5 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Two places in the app wrote a section link by hand, as a bare relative query:
//     <a href="?section=weekly">Add a picture for this place</a>       (the Places tab)
//     <a href="?section=places">Places</a>                             (the single-event post)
//
// A bare `?section=…` REPLACES the whole query string, so `?tab=` is dropped. The manage page's
// mount-time parser does imply the tab from the section — but the parser is not the only thing that
// sets the tab, and on a truck whose plan is 'trial' the trial-defaults-to-billing effect ran
// afterwards and won. Both links landed on **Billing**.
//
// 🔴 TWO FAULTS, TWO FIXES, AND THIS FILE IS THE SECOND ONE. The first is in
// app/manage/[token]/page.tsx: a default may no longer override a URL that asked for a tab — see the
// note on `urlAskedForTab`, and note that it also fixes `?tab=schedule`, the link the scraper EMAILS
// operators, which was broken for every trial truck. This file stops the class rather than the
// instance: a section link cannot be written without its tab, because the only way to write one is to
// call a function that puts both in.
//
// ⚠️ IT IS A PURE STRING BUILDER. No React, no `window`, no router — so the server (which emails one
// of these) and the client both call it, and `scripts/places-tab.cjs` can test it with no DOM.
// ⛔ IT DOES NOT TAKE A `tab` FOR A SECTION. The tab a section belongs to is a property of the
// section, not a choice at the call site — which is precisely what the two broken links got wrong.

/** The Manage tabs a link may name. Mirrors `Tab` in app/manage/[token]/page.tsx. */
export type ManageTab =
  | 'menu' | 'reports' | 'schedule' | 'social' | 'team' | 'settings' | 'payments' | 'billing'

/**
 * Schedule's sub-tabs — TWO of them again.
 *
 * ══ 🔴 SOCIAL POSTS LEFT SCHEDULE AND BECAME ITS OWN TOP TAB (7 October 2026) ═════════════════════
 * Schedule is Events · Event types once more. Everything social moved to `tab=social`, below.
 * ⛔ FOUR IDS ARE NOW LEGACY AND ALL FOUR STILL RESOLVE — `posts`, `designs`, `places`, `weekly`.
 * They are in operators' bookmarks and in links this product has already sent, and three of them were
 * live pills as recently as yesterday. ⚠️ THEY RESOLVE TO A DIFFERENT **TAB**, which is new: until now
 * a legacy id only ever moved within Schedule. `resolveManageLocation` is what carries that, and it is
 * the only thing that should.
 */
export type ScheduleSection = 'events' | 'event-types'

/** Social media's sub-tabs. It opens on `create`. */
export type SocialSection = 'create' | 'designs' | 'locations'

/**
 * The ids that are no longer Schedule pills but must still resolve. ⛔ Never remove one of these.
 *
 * ⚠️ `designs` IS IN BOTH LISTS AND THAT IS NOT A CLASH. As a SCHEDULE section it is legacy and moves
 * to the social tab; as a SOCIAL section it is live. The pair (tab, section) is what disambiguates,
 * which is why the resolver takes both and `canonicalScheduleSection` alone no longer answers.
 */
export type LegacyScheduleSection = 'posts' | 'designs' | 'places' | 'weekly'

/**
 * 🔴 ONE MAP, READ BY THE PAGE'S URL PARSER **AND** BY THE HARNESS. Every retired Schedule section,
 * and where it lands now.
 *   • `posts`   → Social media › Create a post  — where a post is made.
 *   • `weekly`  → Social media › Create a post  — the weekly post is made there too.
 *   • `designs` → Social media › Designs        — same screen, new tab.
 *   • `places`  → Social media › Locations      — the Places tab's job, twice renamed, same screen.
 * ⚠️ MAPPED, NEVER DROPPED. An unrecognised section falls through to the tab's own default, and
 * falling through is what made `?section=places` land on Billing the last time it was retired.
 */
const LEGACY_SCHEDULE_SECTION: Record<LegacyScheduleSection, SocialSection> = {
  posts: 'create',
  weekly: 'create',
  designs: 'designs',
  places: 'locations',
}

const LIVE_SCHEDULE_SECTIONS: readonly ScheduleSection[] = ['events', 'event-types']
const LIVE_SOCIAL_SECTIONS: readonly SocialSection[] = ['create', 'designs', 'locations']

/** Where a (tab, section) pair actually belongs. */
export interface ManageLocation { tab: ManageTab; section: string | null }

/**
 * ══ 🔴 THE ONE RESOLVER — EVERY INCOMING `?tab=&section=` GOES THROUGH IT ═════════════════════════
 *
 * It exists because a legacy id now changes the TAB as well as the section, and the page's URL parser
 * must not be the place that knows which. ⛔ THE RULE THE BRIEF SETS IS "never on Billing or Events",
 * and the way to guarantee that is to answer here rather than to fall through a chain of `if`s at the
 * call site — which is exactly how `?section=places` reached Billing in the first place.
 *
 * ⚠️ IT IS TOTAL. Any input returns a usable location; nothing throws and nothing returns null.
 */
export function resolveManageLocation(tab: unknown, section: unknown): ManageLocation {
  const t = typeof tab === 'string' ? tab : ''
  const sec = typeof section === 'string' ? section : ''

  // ── the social tab's own sections ──────────────────────────────────────────────────────────────
  if (t === 'social') {
    return { tab: 'social', section: (LIVE_SOCIAL_SECTIONS as readonly string[]).includes(sec) ? sec : 'create' }
  }

  // ── a Schedule link: live section, or one of the four that moved to social ─────────────────────
  if (t === 'schedule') {
    if ((LIVE_SCHEDULE_SECTIONS as readonly string[]).includes(sec)) return { tab: 'schedule', section: sec }
    const moved = LEGACY_SCHEDULE_SECTION[sec as LegacyScheduleSection]
    if (moved) return { tab: 'social', section: moved }
    return { tab: 'schedule', section: 'events' }
  }

  // ⚠️ A SECTION WITH NO TAB IS STILL HONOURED. Some links in the wild carry `?section=` alone; the
  // section names its own tab through TAB_FOR_SECTION below, so guessing is not required.
  if (!t && sec) {
    const owner = TAB_FOR_SECTION[sec as keyof typeof TAB_FOR_SECTION]
    if (owner) return resolveManageLocation(owner, sec)
  }

  return { tab: (t as ManageTab) || 'schedule', section: sec || null }
}

/**
 * `'places'` ⇒ `'locations'`, `'posts'`/`'weekly'` ⇒ `'create'`, a live social id ⇒ itself, anything
 * else ⇒ `null`.
 * ⚠️ KEPT AS A NARROW HELPER for callers that already know they are on the social tab. The resolver
 * above is what a URL should go through.
 */
export function canonicalSocialSection(v: unknown): SocialSection | null {
  if (typeof v !== 'string') return null
  if ((LIVE_SOCIAL_SECTIONS as readonly string[]).includes(v)) return v as SocialSection
  return LEGACY_SCHEDULE_SECTION[v as LegacyScheduleSection] ?? null
}

/** `'events'`/`'event-types'` ⇒ itself, anything else ⇒ `null`. */
export function canonicalScheduleSection(v: unknown): ScheduleSection | null {
  if (typeof v !== 'string') return null
  return (LIVE_SCHEDULE_SECTIONS as readonly string[]).includes(v) ? (v as ScheduleSection) : null
}

/** Menu's sub-tabs. */
export type MenuSection = 'items' | 'capacity' | 'extras' | 'deals'

/**
 * 🔴 WHICH TAB EACH SECTION BELONGS TO, DECLARED ONCE. This map is the whole point of the module:
 * a caller names a section and cannot get the tab wrong, because it does not supply it.
 */
const TAB_FOR_SECTION: Record<ScheduleSection | SocialSection | MenuSection, ManageTab> = {
  events: 'schedule', 'event-types': 'schedule',
  /* 🔴 THE THREE SOCIAL SECTIONS NAME THEIR OWN TAB, which is what lets `manageSectionHref('locations')`
   * emit `?tab=social&section=locations` without the call site knowing the tab moved. */
  create: 'social', designs: 'social', locations: 'social',
  items: 'menu', capacity: 'menu', extras: 'menu', deals: 'menu',
}

/* ⛔ THE FOUR RETIRED SCHEDULE IDS ARE DELIBERATELY **NOT** IN THE MAP ABOVE. Nothing in the product
 * should write `?section=posts` any more — `resolveManageLocation` exists to READ them, not to emit
 * them, and a builder that could still produce one would quietly keep them alive. ⚠️ `designs` is in
 * the map as a SOCIAL section, which is the live meaning; the legacy Schedule meaning is in
 * `LEGACY_SCHEDULE_SECTION` and is read-only. */

/**
 * A link into a Manage SECTION, carrying its tab. Relative by default, which is what an in-page
 * anchor wants; pass a token to get a path that works from anywhere (an email, another page).
 *
 * ⚠️ IT ALWAYS EMITS BOTH PARAMS, EVEN FOR A SECTION THAT IS ITS TAB'S DEFAULT. `?tab=schedule` alone
 * would be enough for `events`, and emitting `&section=events` costs nothing and keeps every link in
 * the product the same shape — which is what makes a missing one visible.
 */
export function manageSectionHref(
  section: ScheduleSection | SocialSection | MenuSection,
  opts?: { token?: string },
): string {
  const tab = TAB_FOR_SECTION[section]
  const qs = `?tab=${tab}&section=${section}`
  return opts?.token ? `/manage/${opts.token}${qs}` : qs
}

/** A link into a Manage TAB. Relative by default; pass a token for an absolute path. */
export function manageTabHref(tab: ManageTab, opts?: { token?: string }): string {
  const qs = `?tab=${tab}`
  return opts?.token ? `/manage/${opts.token}${qs}` : qs
}
