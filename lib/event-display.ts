// ── HOW AN EVENT IS NAMED AND DATED TO AN OPERATOR ─────────────────────────────────────────────────
// 🔴 ONE VENUE FORMATTER, NOT THREE. `fmtVenue` existed BYTE-IDENTICALLY in two files — the dashboard
// page and AddOrderPanel — and the KDS event bar was about to become a third copy. §3's rule and the
// manual's running tally of "two versions of one idea" (the cuisine field, the offline detectors, the
// native checks, the event resolvers) is exactly this shape, so it is collapsed here before the third
// copy exists rather than after.
//
// ⚠️ THESE ARE PRESENTATION ONLY. Neither reads or writes anything, neither knows about status, and
// neither is on a money path. They decide what an operator READS, and the two surfaces that show an
// event bar must read the same thing or the same event looks like two events.
import { getLocalDateInTz } from '@/lib/time-utils'

/** "The Bell — Castle Hedingham", or just the venue when the town is already inside its name.
 *  ⚠️ LIFTED VERBATIM from app/dashboard/[token]/page.tsx — the em dash, the `toLowerCase().includes`
 *  containment test and the empty-string fallback are all unchanged, because the dashboard's bar is
 *  the reference rendering and any difference here would show up as two surfaces disagreeing. */
export function fmtVenue(venueName?: string | null, town?: string | null): string {
  if (!venueName && !town) return ''
  if (!venueName) return town!
  if (!town) return venueName
  if (venueName.toLowerCase().includes(town.toLowerCase())) return venueName
  return `${venueName} — ${town}`
}

/** "Today 17th August" · "Tomorrow 18th August" · "Monday 19th August".
 *  ⚠️ LIFTED VERBATIM from the dashboard page, including the ordinal table and the UTC construction.
 *  🔴 EUROPE/LONDON IS THE REFERENCE CLOCK, NOT THE DEVICE'S. `getLocalDateInTz('Europe/London')`
 *  decides what "today" means, so a tablet left on the wrong timezone still agrees with the dashboard
 *  and with the event's own `event_date`. Do not swap it for `new Date()`.
 *  ⚠️ The event date itself is parsed as UTC (`Date.UTC`) and formatted with `timeZone:'UTC'`, so a
 *  date string is never shifted a day by the renderer's offset. */
/**
 * ── 🔴 TWO MODES, ONE HELPER, ONE TODAY/TOMORROW RULE (1 September 2026). ──────────────────────
 * `'long'` is the original and is the DEFAULT, so all three existing call sites — the KDS header, the
 * dashboard header and EventActionsModal's subtitle — are byte-identical without being touched. Each
 * renders ONE event's date in a header, where "Today 6th September" reads correctly.
 *
 * 🔴 `'compact'` EXISTS BECAUSE A LIST IS NOT A HEADER. The shared event picker renders up to 17
 * rows on a kitchen screen; the long form is roughly twice the width and pushes the time off a phone
 * row. It was added as a MODE rather than a second exported function so there is still exactly one
 * place that decides what "today" means — the boundary computation below is shared by both, and a
 * change to the timezone or the tomorrow rule cannot land in one and miss the other.
 * ⚠️ The picker previously hand-rolled its own date in TWO different ways (KDS: `Today` / `Sat 6`;
 * AddOrderPanel: `Today` / `Tomorrow` / `Sat 6 Sep`). Compact is AddOrderPanel's shape, because it is
 * the one that distinguishes tomorrow — the distinction an operator actually acts on.
 */
export function eventDateLabel(dateStr: string, style: 'long' | 'compact' = 'long'): string {
  const ordinal = (n: number) => { const v = n % 100; const s = ['th', 'st', 'nd', 'rd']; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }
  const todayStr = getLocalDateInTz('Europe/London')
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const tmw = new Date(Date.UTC(ty, tm - 1, td + 1))
  const tomorrowStr = `${tmw.getUTCFullYear()}-${String(tmw.getUTCMonth() + 1).padStart(2, '0')}-${String(tmw.getUTCDate()).padStart(2, '0')}`
  const [ey, em, ed] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(ey, em - 1, ed))
  if (style === 'compact') {
    if (dateStr === todayStr) return 'Today'
    if (dateStr === tomorrowStr) return 'Tomorrow'
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  }
  const dayLabel = `${ordinal(ed)} ${d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}`
  if (dateStr === todayStr) return `Today ${dayLabel}`
  if (dateStr === tomorrowStr) return `Tomorrow ${dayLabel}`
  return `${d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })} ${dayLabel}`
}

// ── THE EVENT STATUS LABEL — ONE MAPPING, TWO HEADERS ──────────────────────────────────────────────
// 🔴 IT LIVED AS INLINE JSX IN THE DASHBOARD AND WAS COPIED INTO THE KDS. Same five outcomes, same five
// words, written twice — so a status added to the union, or a word changed, would have had to be found
// in two places by whoever noticed. Lifted here beside fmtVenue for the same reason those were.
//
// 🔴 THE LABEL IS SHARED; THE COLOUR IS NOT, AND THAT SPLIT IS DELIBERATE. The dashboard's bar sits on a
// DARK header and the KDS's on a WHITE one, so `text-slate-400` is correct on one and unreadable on the
// other. Returning a fixed className would have forced one surface to render wrongly, so the function
// returns a TONE and each surface maps the tone through its own table. The words and the branch order —
// the parts that must never differ — are shared; only the palette is per-surface.
//
// ⚠️ PAUSED OUTRANKS EVERY STATUS, exactly as the dashboard's chain has always had it: a paused open
// event reads "Paused", not "Live". Keep it first.

/** The five outcomes. NOT the status union — 'unconfirmed' and 'confirmed' both read "Not started". */
export type EventStatusTone = 'paused' | 'live' | 'finished' | 'cancelled' | 'notStarted'

export interface EventStatusDisplay {
  /** The exact words, glyph included. Rendered as-is. */
  label: string
  tone: EventStatusTone
}

/** Which words an event shows, given its status and whether ordering is paused.
 *  ⚠️ `status` is typed loosely on purpose: both callers hold it as a string union that has grown once
 *  already, and an unrecognised value must fall through to "Not started" rather than render nothing. */
export function eventStatusDisplay(status: string | null | undefined, paused: boolean): EventStatusDisplay {
  if (paused) return { label: '⏸ Paused', tone: 'paused' }
  if (status === 'open') return { label: '● Live', tone: 'live' }
  if (status === 'closed') return { label: '● Finished', tone: 'finished' }
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'cancelled' }
  // 'confirmed' / 'unconfirmed' (or any not-yet-started status) — NOT finished; pairs with Start Event.
  return { label: 'Not started', tone: 'notStarted' }
}

/** Text colour on a DARK header — the dashboard's bar. ⚠️ These are the values that file rendered before
 *  the extraction, unchanged, so its output is character-identical. */
export const EVENT_STATUS_TEXT_ON_DARK: Record<EventStatusTone, string> = {
  paused: 'text-amber-400',
  live: 'text-green-400',
  finished: 'text-slate-400',
  cancelled: 'text-red-400',
  notStarted: 'text-slate-400',
}

/** Text colour on a WHITE header — the KDS's bar. Same hue per tone, darkened for contrast. */
export const EVENT_STATUS_TEXT_ON_LIGHT: Record<EventStatusTone, string> = {
  paused: 'text-amber-600',
  live: 'text-green-600',
  finished: 'text-slate-500',
  cancelled: 'text-red-600',
  notStarted: 'text-slate-500',
}

/** Dot fill, used by the KDS's bar. ⚠️ The dashboard has no separate dot — its glyph is inside the
 *  label — so this table has one consumer today and exists to keep the dot from drifting from the word
 *  beside it. */
export const EVENT_STATUS_DOT: Record<EventStatusTone, string> = {
  paused: 'bg-amber-500',
  live: 'bg-green-500',
  finished: 'bg-slate-300',
  cancelled: 'bg-red-500',
  notStarted: 'bg-slate-300',
}
