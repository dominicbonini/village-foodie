// Event-conflict detection for the approval flow. READ-TIME only (no schema change): given a
// candidate event and the full events list, returns the conflicts against existing confirmed/open
// events. Two complementary checks:
//   A — DUPLICATE (postcode-anchored, NAME EXCLUDED): same postcode + date, time same (Tier 1
//       'duplicate') or different (Tier 2 'review').
//   B — OVERLAP (time-only, postcode-agnostic): time-windows overlap on the same date → a single
//       van can't be in two places ('overlap').
// COMPLEMENTARY to the inbound-schedule scrape dedup (name/signature, skips re-insert) — this flags
// a DISTINCT pending event that conflicts with an already-confirmed one. Pure function, reusable on
// client and server.

export type ConflictKind = 'duplicate' | 'review' | 'overlap'

/** Minimal event shape both the candidate and existing rows satisfy (TruckEvent is assignable). */
export interface ConflictEvent {
  id: string
  event_date: string
  venue_name: string | null
  postcode: string | null
  start_time: string | null
  end_time: string | null
  status: string
  van_id: string | null
}

export interface EventConflict {
  kind: ConflictKind
  /** The EXISTING conflicting event — surfaced for side-by-side comparison on the approval card. */
  event: ConflictEvent
  message: string
}

export const CONFLICT_MESSAGES: Record<ConflictKind, string> = {
  duplicate: 'This looks like the same event you already have.',
  review:
    'Same venue and date, different time — is this the same event with an edited time, or a separate slot? Review before approving.',
  overlap:
    "This event's time overlaps another event on the same day — a single van can't be in two places at once. Check before approving.",
}

// Times are TEXT and may be 'HH:MM' or 'HH:MM:SS' — parse to minutes off the FIRST 5 chars so
// '17:00' and '17:00:00' compare equal. Never string-compare. Used for BOTH time-equality (Check A)
// and overlap (Check B). Returns null when the value is missing/unparseable → that pair can't be
// time-compared (skip the time test).
function toMins(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

// Normalise a postcode for equality: uppercase + strip ALL whitespace. Null/empty → null (so a
// missing postcode never matches another missing postcode — Check A skips, Check B still applies).
function normPostcode(pc: string | null | undefined): string | null {
  if (!pc) return null
  const n = pc.toUpperCase().replace(/\s+/g, '')
  return n.length ? n : null
}

/**
 * Conflicts for `candidate` against every existing confirmed/open event on the SAME date.
 * One conflict per conflicting existing event, at the most specific/severe kind:
 *   pcMatch + same time   → 'duplicate' (Tier 1; overlap is implied)
 *   pcMatch + diff time   → 'review'    (Tier 2; same venue, edited time or separate slot)
 *   pc differs/null + time overlap → 'overlap' (Check B; two places at once)
 */
export function detectEventConflicts(
  candidate: ConflictEvent,
  allEvents: ConflictEvent[]
): EventConflict[] {
  const cStart = toMins(candidate.start_time)
  const cEnd = toMins(candidate.end_time)
  const cPc = normPostcode(candidate.postcode)
  const out: EventConflict[] = []

  for (const ex of allEvents) {
    // Comparison set: same truck's list, same date, live/confirmed, not the candidate itself.
    if (ex.id === candidate.id) continue
    if (ex.event_date !== candidate.event_date) continue
    if (ex.status !== 'confirmed' && ex.status !== 'open') continue
    // VAN NOTE — one-van assumption: flag ALL same-day overlaps. When multi-van lands, add here:
    //   if (candidate.van_id && ex.van_id && candidate.van_id !== ex.van_id) continue
    // (two DIFFERENT vans can legitimately be in two places at once → not a conflict). Do NOT add
    // this predicate now — single-van trucks must flag every same-day time overlap.

    const exStart = toMins(ex.start_time)
    const exEnd = toMins(ex.end_time)
    const exPc = normPostcode(ex.postcode)

    const haveBothTimes = cStart !== null && cEnd !== null && exStart !== null && exEnd !== null
    const pcMatch = cPc !== null && exPc !== null && cPc === exPc
    const timeEqual = haveBothTimes && cStart === exStart && cEnd === exEnd
    // Half-open overlap: candStart < existEnd AND existStart < candEnd.
    const overlap = haveBothTimes && (cStart as number) < (exEnd as number) && (exStart as number) < (cEnd as number)

    let kind: ConflictKind | null = null
    if (pcMatch && timeEqual) kind = 'duplicate'   // Tier 1
    else if (pcMatch) kind = 'review'              // Tier 2 — same postcode, different/unknown time
    else if (overlap) kind = 'overlap'             // Check B — different/unknown postcode, overlaps

    if (!kind) continue
    out.push({ kind, event: ex, message: CONFLICT_MESSAGES[kind] })
  }

  return out
}
