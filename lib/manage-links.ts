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
  | 'menu' | 'reports' | 'schedule' | 'team' | 'settings' | 'payments' | 'billing'

/**
 * Schedule's sub-tabs.
 *
 * ══ 🔴 THREE PILLS, FOUR SECTIONS, AND TWO LEGACY IDS (6 October 2026) ════════════════════════════
 * The PILLS are Events · Event types · Social posts. Social posts has two areas — **Make a post**
 * (`posts`) and **Designs** (`designs`) — and both are in the URL, because an operator who sends
 * somebody "the designs screen" means the designs screen.
 *
 * ⛔ `places` AND `weekly` ARE LEGACY IDS AND ARE STILL ACCEPTED. They are in operators' bookmarks and
 * in links this product has already sent. They are NOT in `SCHEDULE_SECTIONS`, so no pill offers them,
 * and `canonicalScheduleSection` maps each to the live section that now does its job:
 *   • `places` → `designs`  — the Places tab is gone; what an operator went there to do that is still
 *     a thing (give a place its own picture) is on Designs.
 *   • `weekly` → `posts`    — Social posts opens on Make a post, which is where the weekly post is made.
 * ⚠️ MAPPED, NEVER DROPPED. An unrecognised section falls through to Events, and falling through is
 * what made `?section=places` land on the wrong screen the last time it was retired.
 */
export type ScheduleSection = 'events' | 'event-types' | 'posts' | 'designs'

/** The ids that are no longer pills but must still resolve. ⛔ Never remove one of these. */
export type LegacyScheduleSection = 'places' | 'weekly'

/**
 * 🔴 ONE MAP, READ BY THE PAGE'S URL PARSER **AND** BY THE HARNESS. A legacy id resolves to the live
 * section that replaced it; a live id resolves to itself; anything else is `null`, which the caller
 * reads as "not a schedule section" rather than as a default.
 */
const LEGACY_SCHEDULE_SECTION: Record<LegacyScheduleSection, ScheduleSection> = {
  places: 'designs',
  weekly: 'posts',
}

const LIVE_SCHEDULE_SECTIONS: readonly ScheduleSection[] = ['events', 'event-types', 'posts', 'designs']

/** `'places'` ⇒ `'designs'`, `'weekly'` ⇒ `'posts'`, a live id ⇒ itself, anything else ⇒ `null`. */
export function canonicalScheduleSection(v: unknown): ScheduleSection | null {
  if (typeof v !== 'string') return null
  if ((LIVE_SCHEDULE_SECTIONS as readonly string[]).includes(v)) return v as ScheduleSection
  return LEGACY_SCHEDULE_SECTION[v as LegacyScheduleSection] ?? null
}

/** Menu's sub-tabs. */
export type MenuSection = 'items' | 'capacity' | 'extras' | 'deals'

/**
 * 🔴 WHICH TAB EACH SECTION BELONGS TO, DECLARED ONCE. This map is the whole point of the module:
 * a caller names a section and cannot get the tab wrong, because it does not supply it.
 */
const TAB_FOR_SECTION: Record<ScheduleSection | LegacyScheduleSection | MenuSection, ManageTab> = {
  events: 'schedule', 'event-types': 'schedule', posts: 'schedule', designs: 'schedule',
  /* ⚠️ THE TWO LEGACY IDS ARE IN THIS MAP TOO, so a link that still names one carries `?tab=schedule`
   * and the page's parser can then map it to the live section. Leaving them out would mean the one
   * thing this module exists to prevent: a section link with no tab. */
  places: 'schedule', weekly: 'schedule',
  items: 'menu', capacity: 'menu', extras: 'menu', deals: 'menu',
}

/**
 * A link into a Manage SECTION, carrying its tab. Relative by default, which is what an in-page
 * anchor wants; pass a token to get a path that works from anywhere (an email, another page).
 *
 * ⚠️ IT ALWAYS EMITS BOTH PARAMS, EVEN FOR A SECTION THAT IS ITS TAB'S DEFAULT. `?tab=schedule` alone
 * would be enough for `events`, and emitting `&section=events` costs nothing and keeps every link in
 * the product the same shape — which is what makes a missing one visible.
 */
export function manageSectionHref(
  section: ScheduleSection | LegacyScheduleSection | MenuSection,
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
