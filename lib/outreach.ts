// lib/outreach.ts
// ── THE SINGLE SOURCE OF TRUTH FOR THE OUTREACH VOCABULARY AND ITS DERIVED VALUES ────────────────────
// 🔴 THE ENUM VALUES LIVE HERE AND NOWHERE ELSE, DELIBERATELY. The migration (20260903_outreach_tracking.sql)
// writes NO CHECK constraint on stage / channel / direction / kind, because PostgREST exposes no CHECK
// metadata — the app cannot read a constraint back to build a dropdown from it, so a constraint there is a
// rule with no reader that drifts the moment someone edits one side. Validation is in application code and
// the list is imported by BOTH the page (app/admin/outreach/page.tsx) and the route
// (app/api/admin/outreach/route.ts), so the two cannot disagree about what a valid value is.
// This is the V12.1 store-the-platform-as-text / one-shared-constant rule made concrete.

export const OUTREACH_STAGES = [
  'not_contacted',
  'contacted',
  'replied',
  'signed',
  'not_interested',
] as const
export type OutreachStage = (typeof OUTREACH_STAGES)[number]
export const DEFAULT_STAGE: OutreachStage = 'not_contacted'

export const CONTACT_CHANNELS = ['email', 'whatsapp', 'phone', 'in_person'] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]

export const CONTACT_DIRECTIONS = ['outbound', 'inbound'] as const
export type ContactDirection = (typeof CONTACT_DIRECTIONS)[number]

export const CONTACT_KINDS = ['first_contact', 'follow_up', 'chase', 'reply'] as const
export type ContactKind = (typeof CONTACT_KINDS)[number]

// Runtime validators — the migration carries no CHECK, so THESE are the enforcement. Used by the route
// before every write and by the page before it offers a value.
export const isStage = (v: unknown): v is OutreachStage => OUTREACH_STAGES.includes(v as OutreachStage)
export const isChannel = (v: unknown): v is ContactChannel => CONTACT_CHANNELS.includes(v as ContactChannel)
export const isDirection = (v: unknown): v is ContactDirection => CONTACT_DIRECTIONS.includes(v as ContactDirection)
export const isKind = (v: unknown): v is ContactKind => CONTACT_KINDS.includes(v as ContactKind)

// ── PLATFORM TAG FROM order_url — the SAME derivation the backfill SQL performs, kept here so a
// re-derivation in the app can never diverge from the seed. 🔴 THE HOST IS THE SIGNAL (V12.1): read it,
// never type it. Returns null for a null/blank url so "unknown" stays distinct from "none".
// ── 🔴 THE PLATFORM VOCABULARY — ONE EXPORTED CONSTANT PER FIXED VALUE, MATCHED NOWHERE BY LITERAL ──
// The string 'Hatches Up' was matched by literal in three places (the platform derivation here, the
// priority-sort test and the badge style in the outreach page). A hand-typed 'Hatches up' or 'hatchesup'
// would silently drop a truck out of the priority sort with no error — a stale exact-match key that is
// skipped, never flagged (the recurring V12.1 "row label is a join key" class). So the canonical spelling
// lives HERE and every matcher imports it; the free-text picker canonicalises to it on save.
export const HATCHES_UP = 'Hatches Up'
// 🔴 'none' vs NULL ARE DIFFERENT STATES AND MUST STAY SO. NULL = nobody has looked; 'none' = looked, no
// online ordering. Stored as the literal 'none'; the UI shows the two apart at a glance.
export const PLATFORM_NONE = 'none'

/** Collapse a free-text platform value to its stored form: trimmed, internal whitespace collapsed to one
 *  space, and anything recognisably Hatches Up folded to the single canonical `HATCHES_UP` spelling. An
 *  empty/blank string becomes null (→ "nobody looked"). Everything else is kept verbatim (bar the trim),
 *  because an unrecognised platform is a real new value, not an error. */
export function canonicalisePlatform(value: string | null | undefined): string | null {
  if (value == null) return null
  const collapsed = value.trim().replace(/\s+/g, ' ')
  if (collapsed === '') return null
  // "recognisably Hatches Up" = the same letters ignoring case and ALL spacing: 'hatches up', 'hatchesup',
  // 'HATCHES  UP', 'HatchesUp' all fold to the canonical spelling.
  if (collapsed.replace(/\s+/g, '').toLowerCase() === 'hatchesup') return HATCHES_UP
  return collapsed
}

/** Case-insensitive backstop for the priority sort: true when a stored platform is Hatches Up even if a
 *  value escaped canonicalisation (e.g. seeded before this existed). Compares on the canonical form. */
export function isHatchesUp(platform: string | null | undefined): boolean {
  if (!platform) return false
  return platform.replace(/\s+/g, '').toLowerCase() === 'hatchesup'
}

export function platformFromOrderUrl(orderUrl: string | null | undefined): string | null {
  if (!orderUrl || !orderUrl.trim()) return null
  // host = everything after the scheme, up to the first '/', ':' or '?'. Lower-cased.
  const host = orderUrl
    .trim()
    .replace(/^https?:\/\//i, '')
    .split(/[/:?#]/)[0]
    .toLowerCase()
  if (!host) return null
  if (host === 'hatchesup.app' || host.endsWith('.hatchesup.app')) return HATCHES_UP
  return host
}

// ── NEXT-ACTION DATE ─────────────────────────────────────────────────────────────────────────────────
// 🔴 THE AUTOMATIC NEXT-ACTION SUGGESTION WAS REMOVED (per the operator's decision): no date is suggested,
// computed or written automatically — every next-action date is set by hand. The interval table
// (nextActionIntervalDays), the weekend roll-forward (rollOffWeekend), the outbound-count suggestion
// (suggestNextActionYMD) and parkUntilFebruaryYMD were deleted after a caller sweep confirmed nothing else
// used them. `toYMD` stays because `isOverdue` below still uses it; `isOverdue` reads a date, never writes
// one, so overdue flagging on a hand-set date remains.

/** 'YYYY-MM-DD' for a Date, from its UTC parts (matches a Postgres `date`, no timezone drift). */
export function toYMD(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** True when a next_action_at ('YYYY-MM-DD' or null) is strictly before today (UTC) — the overdue flag. */
export function isOverdue(nextActionAt: string | null | undefined, today: Date = new Date()): boolean {
  if (!nextActionAt) return false
  return nextActionAt < toYMD(today)
}
