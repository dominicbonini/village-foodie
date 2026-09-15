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

// ── 🔴 THE CONTACT SEQUENCE — A NUMBERED LADDER, NOT A VOCABULARY OF SYNONYMS ───────────────────────
// Was `['first_contact', 'follow_up', 'chase', 'reply']`. Three problems, all of which showed up in the
// live rows within a week:
//   • "follow up" and "chase" name the SAME step, so which one got logged depended on mood. 🧪 2 of the
//     9 live rows are `follow_up` and 0 are `chase` — the split was already producing one dead value.
//   • `reply` is not a stage. 🧪 The one live `reply` row is OUTBOUND, and the INBOUND row next to it is
//     labelled `first_contact` — so the value was recording "my reply", while `direction` was already
//     carrying "they replied". Two columns answering one question, disagreeing.
//   • A stage that can be reached twice cannot drive an interval. The ladder is ordered and finite.
// 🔴 A REPLY ENDS THE SEQUENCE RATHER THAN ADVANCING IT, and `direction = 'inbound'` records it.
// 🔴 A CALL IS A CHANNEL, NOT A STAGE — `CONTACT_CHANNELS` already carries phone and in_person.
// 🔴 FOUR RUNGS, NOT THREE — AND THIS REVERSES THE THREE-TOUCH CAP, DELIBERATELY AND ON REQUEST.
// The cap was recorded as "a deliberate cap" and a terminal 'Final chase' was explicitly refused as a
// fourth stage twice. The operator has since asked for BOTH a Chase 2 after Chase 1 AND a Final chase,
// which is four touches; the reversal is recorded here rather than made silently.
// ⚠️ '4_final_chase' IS A NEW STORED VALUE. No live row carries it (🧪 10 rows, none), and `kind` is
// unconstrained text with no CHECK, so it needs no migration — see 20260903_outreach_tracking.sql:60.
export const CONTACT_KINDS = ['1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase'] as const
/** A rung of the OUTBOUND ladder. Not every kind is one — see REPLY_KIND. */
export type LadderKind = (typeof CONTACT_KINDS)[number]

// ── 🔴 `reply` SITS OUTSIDE THE LADDER, BECAUSE `kind` IS MEANINGLESS ON AN INBOUND ROW ─────────────
// 🧪 The live data is the argument. Azahar, all three rows dated 9 Sep 2026:
//     outbound / first_contact   my approach
//     inbound  / first_contact   THEM replying, wearing the label of my approach
//     outbound / reply           my response, wearing a label that was never a rung
// The ladder counts MY attempts. An inbound row is not an attempt, so no rung can describe it, and the
// three numbered stages are therefore OUTBOUND-ONLY. `reply` is the one kind an inbound row can carry.
// 🔴 THE STORED VALUE IS THE SAME STRING THE LEGACY ROW ALREADY USES — 'reply'. Adopting it rather than
// minting 'inbound_reply' means the one legacy row needs no rewrite to become valid, and no migration
// exists that could rewrite it wrongly.
export const REPLY_KIND = 'reply' as const
/** Every valid stored value: the ladder, then reply. This is what the API validates against. */
export const CONTACT_KINDS_ALL = [...CONTACT_KINDS, REPLY_KIND] as const
export type ContactKind = (typeof CONTACT_KINDS_ALL)[number]

/** 🔴 WHICH KINDS A DIRECTION MAY CARRY. The picker maps over this, so an inbound row cannot be given a
 *  rung of the outbound ladder by the UI at all.
 *  🔴 `reply` IS IN BOTH LISTS — IT IS NOT GATED TO INBOUND. It was, and that was wrong: if a truck
 *  emails me and I write back, that OUTBOUND row is a reply, not a chase. 🧪 The live Azahar row
 *  46c6c4eb is exactly that, and gating made it permanently unrecordable — the previous pass listed it
 *  as a row to correct by hand when in fact the code was what needed correcting.
 *  ⚠️ IT IS STILL NOT A RUNG. It carries no follow-up interval (FOLLOW_UP_DAYS is keyed on LadderKind
 *  only) and sorts at 90, outside the sequence — so it can never become a fourth touch. */
export const kindsForDirection = (direction: string): readonly string[] =>
  direction === 'inbound' ? [REPLY_KIND] : CONTACT_KINDS_ALL
/** What Kind becomes when the direction changes. Inbound has exactly one answer. */
export const defaultKindFor = (direction: string): string =>
  direction === 'inbound' ? REPLY_KIND : CONTACT_KINDS[0]

// ── 🔴 THE SORT ORDER LIVES HERE, IN THE STORED VALUES — NEVER IN THE LABELS ────────────────────────
// The labels lost their numeric prefix ('1 - First contact' → 'First contact'), so alphabetical order of
// the labels is now WRONG: it would give Chase 1, Chase 2, First contact, Reply. The ladder's order is
// the ARRAY POSITION in CONTACT_KINDS above, and this map is derived from it rather than retyped, so the
// two cannot drift. `reply` is deliberately 90 — outside the sequence, always last, never between rungs.
export const KIND_ORDER: Record<string, number> = {
  ...Object.fromEntries(CONTACT_KINDS.map((k, i) => [k, i + 1])),
  [REPLY_KIND]: 90,
  // 🔴 NO LEGACY ENTRIES. `first_contact`, `follow_up` and `chase` used to sort onto the rung they would
  // become; the vocabulary is now First contact / Chase 1 / Final chase / Reply and nothing else. They
  // fall through to 99 — last, and visibly not part of the sequence.
}
/** Position in the sequence; anything unknown sorts last, never silently first. */
export const kindOrder = (v: string | null | undefined): number => (v ? KIND_ORDER[v] ?? 99 : 99)

// 🔴 THE WHOLE VOCABULARY, AND NOTHING ELSE: First contact / Chase 1 / Chase 2 / Final chase / Reply.
// ⚠️ 'Chase 2' WAS BRIEFLY 'Final chase' AND IS BACK — asked for, then reversed at the operator's
// request. The concern behind the rename ("Chase 2 implies a Chase 3 exists") stands, but it is not the
// label's job to carry the cap: CONTACT_KINDS has three rungs and nothing can add a fourth without
// editing that array. 🔴 EITHER WAY THIS IS DISPLAY ONLY — the stored value is '3_chase_2' throughout,
// and renaming a stored value would mean a migration over live rows to change one word of English.
// 🔴 THE LEGACY KEYS ARE GONE — `first_contact`, `follow_up`, `chase`. They are still in the TABLE
// (🧪 8 of the 10 live rows), so what matters is what the FALLBACK does; see kindLabel below.
// 🔴 THE ORDER THESE SORT IN IS KIND_ORDER above, never this map and never the alphabet.
const KIND_LABELS: Record<string, string> = {
  '1_first_contact': 'First contact',
  '2_chase_1': 'Chase 1',
  '3_chase_2': 'Chase 2',
  '4_final_chase': 'Final chase',
  reply: 'Reply',
}
/** 🔴 THE FALLBACK IS THE POINT, NOT AN AFTERTHOUGHT. 8 of the 10 live rows store a value that is no
 *  longer in the vocabulary, and the previous fallback rendered the raw column value — `follow_up`,
 *  underscore and all. A row I cannot read is worse than a legacy label, so an unrecognised value is
 *  HUMANISED (underscores out, first letter up) and rendered as words: `follow_up` → "Follow up".
 *  ⚠️ HUMANISING ALONE WOULD BE DISHONEST — "Follow up" looks like a vocabulary item. The history table
 *  pairs this with a ⚠ marker driven by `isKind`, so an unrecognised row reads as words AND is visibly
 *  not one of the four. The two halves are deliberately separate: this function has no opinion about
 *  markers, and the table has no opinion about spelling. */
export const kindLabel = (v: string | null | undefined): string => {
  if (!v) return '—'
  const known = KIND_LABELS[v]
  if (known) return known
  const words = v.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '—'
}

// 🔴 THE SAME LOOKUP-WITH-A-FALLBACK SHAPE FOR THE OTHER TWO VOCABULARIES. History used to render
// the raw column values (`whatsapp`, `in_person`, and an arrow for direction). Those are storage values,
// not display values — the table capitalises them here so no caller has to hand-roll a formatter, and an
// unknown value still renders as itself rather than blank.
const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email', whatsapp: 'WhatsApp', phone: 'Phone', in_person: 'In person',
}
export const channelLabel = (v: string | null | undefined): string =>
  !v ? '—' : (CHANNEL_LABELS[v] ?? v.replace(/_/g, ' '))

const DIRECTION_LABELS: Record<string, string> = { outbound: 'Outbound', inbound: 'Inbound' }
export const directionLabel = (v: string | null | undefined): string =>
  !v ? '—' : (DIRECTION_LABELS[v] ?? v)

// ── 🔴 THE FOLLOW-UP INTERVAL, KEYED ON THE STAGE I SELECTED ────────────────────────────────────────
// 🔴 THIS REVERSES THE MANUAL'S "NO DATE IS EVER SUGGESTED OR WRITTEN AUTOMATICALLY" RULE, DELIBERATELY.
// The rule was written against a computation from the COUNT of outbound contacts, and its two recorded
// failures were both properties of counting: a double-click made a first approach look like a third, and
// a count cannot tell chasing silence from following up an engaged prospect (it also counted an email and
// a WhatsApp about the same thing as two attempts).
// 🔴 NEITHER OBJECTION SURVIVES A SELECTED STAGE. The interval now follows a value the operator picked
// from a three-item list, so a double-click logs the same stage twice and yields the SAME date rather
// than a compounding one, and "engaged" is expressed by an inbound row ending the ladder — not inferred.
// ⚠️ THE OTHER HALF OF THE RULE STANDS UNCHANGED: nothing is written on OPEN. The field is seeded from
// the stored column and stays empty when that is null.
export const FOLLOW_UP_DAYS: Record<LadderKind, number | null> = {
  '1_first_contact': 3,
  '2_chase_1': 7,
  // ⚠️ 14 IS MY CHOICE, NOT YOURS — SAY IF IT IS WRONG. `3_chase_2` used to be terminal (null) and had
  // no interval to inherit; now that 'Final chase' follows it, it needs one. 3 → 7 → 14 keeps the gaps
  // widening as a sequence goes cold, which is the shape the first two already had.
  '3_chase_2': 14,
  '4_final_chase': null,   // the sequence ends here; no date is proposed
}

/**
 * The follow-up date a logged contact implies, as 'YYYY-MM-DD', or null when the ladder ends.
 * 🔴 COUNTED FROM THE CONTACT'S OWN DATE, NOT FROM TODAY — logging Monday's email on Wednesday must
 * schedule from Monday, or back-dating a contact silently pushes the chase out.
 * ⚠️ Date-only arithmetic in UTC: `contactedAt` is a 'YYYY-MM-DD' string from the form, and building it
 * through local time would shift the day either side of midnight for anyone west of Greenwich.
 */
export function followUpDateFor(kind: string, contactedAt: string): string | null {
  const days = (FOLLOW_UP_DAYS as Record<string, number | null>)[kind]
  if (days == null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(contactedAt)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Runtime validators — the migration carries no CHECK, so THESE are the enforcement. Used by the route
// before every write and by the page before it offers a value.
export const isStage = (v: unknown): v is OutreachStage => OUTREACH_STAGES.includes(v as OutreachStage)
export const isChannel = (v: unknown): v is ContactChannel => CONTACT_CHANNELS.includes(v as ContactChannel)
export const isDirection = (v: unknown): v is ContactDirection => CONTACT_DIRECTIONS.includes(v as ContactDirection)
export const isKind = (v: unknown): v is ContactKind =>
  (CONTACT_KINDS_ALL as readonly string[]).includes(v as string)

// ── 🔴 THE DOUBLE-LOG GUARD — WHAT MAKES TWO TOUCHES THE SAME TOUCH ────────────────────────────────
// 🧪 Tikka Tonic has two rows 0.755s apart (22:17:47.610099 and 22:17:48.365027 on 2026-09-03), same
// prospect, direction, kind and channel. That is one double-click, and the manual already records the
// damage it does: it makes a first approach count towards the touch cap twice (three at the time this
// was written, four since 'Final chase' was added — the guard does not care which).
//
// 🔴 THE WINDOW IS THE CALENDAR DAY, AND THAT IS NOT A ROUND NUMBER PICKED FOR COMFORT.
// `contacted_at` is `timestamptz`, but the modal sends a DATE ('YYYY-MM-DD'), which Postgres stamps at
// midnight — 🧪 the live row 1aa26b89 was created at 13:53 and stored `2026-09-10T00:00:00+00:00`. So
// two same-day logs of the same stage on the same channel are identical in EVERY stored field except
// `id` and `created_at`. There is nothing in the data that distinguishes them, and a narrower window
// (30s, 5 minutes) would only decide by wall-clock luck which indistinguishable row survives.
// A legitimate second contact on the same day differs by KIND or by CHANNEL, and both still log.
export const contactDay = (contactedAt: string | null | undefined): string =>
  contactedAt ? String(contactedAt).slice(0, 10) : ''

/** The identity of a touch. Two contacts with the same signature are the same touch. */
export const contactSignature = (c: {
  contacted_at?: string | null; direction?: string | null; kind?: string | null; channel?: string | null
}): string => [contactDay(c.contacted_at), c.direction ?? '', c.kind ?? '', c.channel ?? ''].join('|')

/** The already-recorded contact a candidate would duplicate, or null. Pure — no React, no network. */
export function findDuplicateContact<T extends {
  contacted_at?: string | null; direction?: string | null; kind?: string | null; channel?: string | null
}>(existing: readonly T[], candidate: Parameters<typeof contactSignature>[0]): T | null {
  const sig = contactSignature(candidate)
  return existing.find(c => contactSignature(c) === sig) ?? null
}

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

/**
 * The host of a URL, lower-cased, or null. 🔴 EXTRACTED FROM `platformFromOrderUrl`, WHICH NOW CALLS IT
 * — the expression is byte-identical, not a second parser. A URL host is now wanted in two places (the
 * platform tag and the uncontactable lead ranking), and two copies of a five-step string chain is
 * exactly the drift this file exists to prevent.
 * ⚠️ Deliberately NOT `new URL()`: stored values include scheme-less hosts (🧪 `shikashack.co.uk` is
 * recorded in `website` with no scheme), which `new URL` throws on. This tolerates them.
 */
export function hostOf(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null
  // host = everything after the scheme, up to the first '/', ':' or '?'. Lower-cased.
  const host = url
    .trim()
    .replace(/^https?:\/\//i, '')
    .split(/[/:?#]/)[0]
    .toLowerCase()
  return host || null
}

export function platformFromOrderUrl(orderUrl: string | null | undefined): string | null {
  const host = hostOf(orderUrl)
  if (!host) return null
  if (host === 'hatchesup.app' || host.endsWith('.hatchesup.app')) return HATCHES_UP
  return host
}

// ── 🔴 THE UNCONTACTABLE LEAD RANKING — WHAT TO CHASE WHEN THERE IS NO EMAIL AND NO WHATSAPP ────────
// 🧪 155 of 231 prospects have no contact route at all (the operator's figure). They are not dead ends:
// ~46 carry a competitor storefront, ~30 a Facebook page, ~45 nothing. This ranks what to open first.
//
// 🔴 A hatchesup.app ORDER URL IS THE STRONGEST LEAD, and that is a judgement about the BUSINESS rather
// than about the data: the truck is already selling online through a competitor, so it has a menu, a
// payment setup, and a rate to compare. A Facebook page is the weakest thing that is still a lead — you
// can message it, but it carries no address.
//
// ⚠️ AN UNRECOGNISED HOST RANKS AS A REAL WEBSITE (2), NOT AS "nothing". A host this code has not seen
// before is far likelier to be a small trader's own site than to be worthless, and ranking it last
// would bury exactly the leads nobody has looked at yet.
// 🔴 `menu_url` IS DELIBERATELY NOT CONSULTED. 🧪 It is usually the order URL repeated, and on some rows
// it is a raw Facebook CDN image link that expires (Naked Fish). A lead that dies silently is worse
// than no lead, so this reads `order_url` and `website` ONLY.
export const LEAD_RANKS = ['hatchesup', 'other_order', 'website', 'facebook', 'none'] as const
export type LeadRank = (typeof LEAD_RANKS)[number]

const FACEBOOK_HOSTS = ['facebook.com', 'fb.com', 'fb.me']
const isFacebookHost = (h: string): boolean =>
  FACEBOOK_HOSTS.some(f => h === f || h.endsWith('.' + f))

export type Lead = {
  rank: LeadRank
  /** Sort key: 0 is the best lead. The array position in LEAD_RANKS, never retyped. */
  order: number
  /** The host to show — the signal, not the whole URL, which would truncate in any sane column. */
  host: string | null
}

/** Which lead a prospect with no contact route offers, and how good it is. Pure; no I/O. */
export function leadOf(orderUrl: string | null | undefined, website: string | null | undefined): Lead {
  const oh = hostOf(orderUrl)
  const wh = hostOf(website)
  const mk = (rank: LeadRank, host: string | null): Lead => ({ rank, order: LEAD_RANKS.indexOf(rank), host })
  if (oh && (oh === 'hatchesup.app' || oh.endsWith('.hatchesup.app'))) return mk('hatchesup', oh)
  if (oh && !isFacebookHost(oh)) return mk('other_order', oh)
  // 🔴 A FACEBOOK *ORDER* URL IS STILL ONLY A FACEBOOK LEAD. Tested before the website so a truck whose
  // "order url" is a Facebook page cannot outrank one that has a real site.
  if (wh && !isFacebookHost(wh)) return mk('website', wh)
  if (oh && isFacebookHost(oh)) return mk('facebook', oh)
  if (wh) return mk('facebook', wh)
  return mk('none', null)
}

export const LEAD_LABELS: Record<LeadRank, string> = {
  hatchesup: 'Hatches Up store',
  other_order: 'Ordering page',
  website: 'Website',
  facebook: 'Facebook',
  none: 'No lead',
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
