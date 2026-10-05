// lib/weekly-post/ready.ts — "is this design set up?", answered ONCE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ FOUR READERS WERE ASKING THE SAME QUESTION FOUR DIFFERENT WAYS (6 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   `load`              → `design ? {…} : null`              — a ROW exists
//   `event_load`        → `design ? {…} : null`              — a ROW exists
//   `event_post`        → `hasDesign: !!design`              — a ROW exists
//   `social_overview`   → `ready: !!design?.blank_path`      — a row WITH a picture
//
// …and the screens those feed then applied a FIFTH test of their own: the weekly setup screen shows
// its "nothing uploaded yet" card on `!layout || !size || !blankUrl`, while the event setup screen
// shows its equivalent on `!standard` alone — so an event row with no `blank_path` opened the EDITOR,
// which then read `standard.width` off nothing.
//
// 🔴 SO A HALF-WRITTEN ROW MADE THEM DISAGREE, AND THEY DISAGREED IN BOTH DIRECTIONS:
//   • a row with a picture but no layout  ⇒ Social posts said "✓ Set up"; the setup screen said no.
//   • a row with no picture at all        ⇒ Social posts said "Not set up"; the event editor opened.
//
// ⛔ THAT IS NOT A COSMETIC DISAGREEMENT. "Not set up" on a box whose button then opens a working
// editor is a screen calling itself a liar, and an operator cannot tell which half to believe.
//
// 🔴 ONE PREDICATE, AND EVERY READER CALLS IT. What "set up" means is a property of the DESIGN, not of
// whichever screen happens to be asking.
//
// ⚠️ IT IS IN `lib/`, NOT IN THE ROUTE, FOR ONE REASON: `scripts/social-posts.cjs` can require it and
// exercise the real function over real shapes, rather than asserting the shape of the source that
// produces it. A predicate nothing can call is a predicate nobody checks.

/** The columns `truck_post_designs` is read with. ⚠️ Deliberately loose — this is fed rows from four
 *  different selects, and a narrower type here would only mean four casts at the call sites. */
export interface DesignReadiness {
  blank_path?: string | null
  width?: number | null
  height?: number | null
  layout?: unknown
}

/**
 * Is this design usable — can a post actually be made from it?
 *
 * 🔴 ALL FOUR PARTS ARE REQUIRED, AND EACH ONE IS SOMETHING A RENDER WOULD OTHERWISE DIE ON:
 *   • `blank_path`      — there is no picture to draw on without it;
 *   • `width`/`height`  — every box coordinate is in the canvas's pixels, so a missing size makes
 *                         every stored position meaningless (and `eventPostContext` already refuses
 *                         with "No event design yet." on exactly these three);
 *   • `layout`          — the boxes. A design with no layout renders artwork with no date, no place
 *                         and no time on it, which is not a post, it is the blank.
 *
 * ⚠️ A ROW EXISTING IS NOT THE QUESTION. `truck_post_designs` gets a row as soon as anything about a
 * design is written, and the half-written states are REACHABLE: an upload that confirmed and then
 * failed to save a layout leaves exactly the first case below.
 */
export function designIsReady(design: DesignReadiness | null | undefined): boolean {
  if (!design) return false
  if (!design.blank_path) return false
  if (!design.width || !design.height) return false
  /* ⚠️ `== null`, NOT FALSY. A layout is an object; `{}` is not a sensible layout either, but it is a
   * SAVED one, and refusing it here would hide a real design from its owner. Null and undefined are
   * the states that mean "nobody has placed the boxes yet". */
  if (design.layout == null) return false
  return true
}
