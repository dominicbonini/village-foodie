// ── THE VAN FILTER — ONE COMPONENT, EVERY SURFACE (V9.6) ────────────────────────────────────────────
// A truck can run more than one van ("truck" in operator-facing copy — see the 'Please select a truck'
// validation in Manage). Once it does, Schedule and Reports both need to narrow to one of them. This is
// the ONLY place that dropdown is defined: two copies on two surfaces is the makeCartKey triplication
// class, and the last time a shared string lived in four places it took a grep to change a colour.
//
// ── 🔴 THE >1 GATE LIVES INSIDE THIS COMPONENT, DELIBERATELY ────────────────────────────────────────
// `vans.length <= 1` returns null. Putting the gate HERE rather than at each call site means a single-van
// truck cannot see this control on any surface, present or future, by construction — a new consumer
// cannot forget the gate, because there is nothing to forget. Pizzeria Gusto has one van and must see
// nothing new anywhere.
// This follows the ESTABLISHED convention in Manage, which already gates nine van affordances on
// `vans.length > 1` (the schedule row's van suffix, the bulk-import Van column, the event-edit Van
// picker). It is the vans equivalent of the `operatorTrucks.length > 1` multi-truck rule.
//
// ── UNASSIGNED IS AN OPTION, NOT AN EXEMPTION ───────────────────────────────────────────────────────
// truck_events.van_id is NULLABLE, so "no van" is a real third state, not an edge case. Two designs were
// possible and the choice matters:
//   ✗ unassigned events always show regardless of filter — REJECTED. It makes "Van 1" mean "Van 1 AND
//     everything unassigned", so the list is not what its label says. That is the same dishonesty as a
//     filtered total presented as a whole-truck total.
//   ✓ an explicit "Unassigned" option — CHOSEN. Nothing is hidden (the default is All), the events stay
//     reachable, and the option doubles as a WORKLIST of events still needing a van.
// The option only appears when there is at least one unassigned event (`showUnassigned`), so the filter
// never offers a choice guaranteed to return an empty list.
'use client'

export type VanOption = { id: string; name: string }

/** Sentinels. Deliberately not valid UUIDs, so they can never collide with a real van id. */
export const VAN_FILTER_ALL = 'all'
export const VAN_FILTER_UNASSIGNED = 'unassigned'

/** `all` | `unassigned` | a van id. */
export type VanFilterValue = string

/**
 * Does an event/order with this `van_id` pass the filter?
 * ONE predicate, shared by every consumer, so no surface can disagree about what "Van 1" includes.
 * ⚠️ `!vanId` covers null AND undefined — a payload that omits the column must not silently pass as a
 * match for a specific van.
 */
export function matchesVanFilter(vanId: string | null | undefined, filter: VanFilterValue): boolean {
  if (filter === VAN_FILTER_ALL) return true
  if (filter === VAN_FILTER_UNASSIGNED) return !vanId
  return vanId === filter
}

/** The human label for the current filter — used to state the active filter in output (e.g. Reports). */
export function vanFilterLabel(vans: VanOption[], filter: VanFilterValue): string {
  if (filter === VAN_FILTER_ALL) return 'All trucks'
  if (filter === VAN_FILTER_UNASSIGNED) return 'Unassigned'
  return vans.find(v => v.id === filter)?.name ?? 'Unknown truck'
}

/**
 * A FILENAME-SAFE suffix for the active van scope, e.g. `-van-2`, `-unassigned`, or `''`.
 *
 * 🔴 An exported CSV outlives the session and gets emailed on, so a filtered export must not be
 * mistakable for a whole-truck one — a stronger risk than a screenshot, which at least carries the
 * on-screen scope chip beside it.
 *
 * Returns '' — i.e. TODAY'S FILENAME, UNCHANGED — in two cases:
 *   • `vans.length <= 1`  — a single-van truck's exports must be byte-identical to before.
 *   • filter === ALL      — an unfiltered export is a whole-truck export; there is nothing to qualify,
 *                           and a suffix would only add noise to the common case.
 *
 * SLUGIFY RULE (deliberately conservative — this becomes a filename on someone's desktop):
 *   NFKD-normalise → strip combining marks (Café → Cafe) → lowercase → every run of anything outside
 *   [a-z0-9] becomes a single '-' → trim leading/trailing '-' → cap at 24 chars → trim again.
 * That leaves only [a-z0-9-], which is safe on Windows, macOS and Linux alike: no spaces, no
 * path separators, no reserved characters (\ / : * ? " < > |), no non-ASCII, no leading dot.
 * ⚠️ A name that slugifies to nothing (e.g. "🚚" or "———") falls back to 'van' rather than producing
 * a stray double dash or an empty segment.
 */
export function vanFilterFilenameSuffix(vans: VanOption[], filter: VanFilterValue): string {
  if (vans.length <= 1) return ''
  if (filter === VAN_FILTER_ALL) return ''
  if (filter === VAN_FILTER_UNASSIGNED) return '-unassigned'
  const name = vans.find(v => v.id === filter)?.name
  if (!name) return ''
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '')
  return slug ? `-${slug}` : '-van'
}

export function VanFilter({
  vans, value, onChange, showUnassigned = false, className = '',
}: {
  vans: VanOption[]
  value: VanFilterValue
  onChange: (v: VanFilterValue) => void
  /** Offer the "Unassigned" option — pass true only when at least one row actually has no van. */
  showUnassigned?: boolean
  className?: string
}) {
  // 🔴 THE SINGLE-VAN GATE. Do not lift this to the call sites.
  if (vans.length <= 1) return null
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Filter by truck"
      // Class string matched to the existing filter dropdowns in Manage (the Reports event picker and
      // the event-edit Van picker), NOT invented — one select treatment per surface.
      className={`border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 ${className}`}
    >
      <option value={VAN_FILTER_ALL}>All trucks</option>
      {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      {showUnassigned && <option value={VAN_FILTER_UNASSIGNED}>Unassigned</option>}
    </select>
  )
}
