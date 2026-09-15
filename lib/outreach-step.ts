// lib/outreach-step.ts
// ── 🔴 THE DERIVED NEXT STEP. PURE: NO REACT, NO NETWORK, NO DATABASE, NO CLOCK IT DOES NOT OWN ──────
//
// The whole point of this module is that it is a FUNCTION OF ROWS THAT ALREADY EXIST. There is no new
// column, no enrollment row, no scheduler and no stored step (decision D2). If it is wrong, it is wrong
// about data you can see on the prospect, and re-running it after a correction fixes it.
//
// 🔴 IT NEVER GUESSES. The one rule that governs every branch below: when the contact history contains
// something this module does not understand, the answer is UNKNOWN and it says which rows caused it.
// Guessing "first contact" for a prospect with four unrecognised contacts is the exact failure this
// feature exists to prevent — it would tell the operator to introduce himself to someone he has already
// chased three times. 🧪 As at 14 September 2026 that is not hypothetical: 8 of 17 live contact rows
// carry a `kind` outside the ladder (`first_contact`, `follow_up`), because the vocabulary was renumbered
// on 10 September and the rows written before it were never rewritten.
//
// ⚠️ `today` IS AN ARGUMENT, NOT A CALL TO `new Date()` INSIDE THE RULE. A function that reads the clock
// cannot be tested at a date boundary, and "due today" is entirely a question about a date boundary.

import {
  CONTACT_KINDS, REPLY_KIND, isKind, followUpDateFor, toYMD,
  type LadderKind,
} from '@/lib/outreach'

// ── LEAD TYPE ───────────────────────────────────────────────────────────────────────────────────────
// 🔴 FOUR TYPES, DERIVED, NO NEW COLUMN. They are ORDERED and the first match wins, because a truck can
// satisfy more than one: a Hatches Up truck is usually also on the Village Foodie map. The order is the
// operator's — strongest buying signal first — and it is declared here rather than implied by the shape
// of an if/else chain.
export const LEAD_TYPES = ['hu_ordering', 'hu_map', 'on_vf', 'not_listed'] as const
export type LeadType = (typeof LEAD_TYPES)[number]

/** 🔴 THE ONLY VALIDATOR FOR THE STORED COLUMN. `lead_type_at_first_contact` is unconstrained text by
 *  the house no-CHECK rule, so THIS is the enforcement — the API route calls it before every write and
 *  `effectiveLeadType` calls it before every read. Derived from LEAD_TYPES, never a second list. */
export const isLeadType = (v: unknown): v is LeadType =>
  (LEAD_TYPES as readonly string[]).includes(v as string)

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  hu_ordering: 'Hatches Up — ordering',
  hu_map: 'Hatches Up — map only',
  on_vf: 'On the Village Foodie map',
  not_listed: 'Not listed',
}

/** The fields the lead-type derivation reads. Structural, so the panel's richer row satisfies it. */
export type LeadTypeInput = {
  /** 🔴 TRI-STATE: true = seen using HU ordering, NULL = nobody checked, false = checked and absent. */
  hu_ordering: boolean | null
  hu_map: boolean | null
  /** discovery_trucks.show_on_vf — NOT NULL DEFAULT true, so absent/undefined is treated as true. */
  show_on_vf?: boolean | null
  /** discovery_trucks.excluded — NOT NULL DEFAULT false. A master hide; it beats show_on_vf. */
  excluded?: boolean | null
  /** Future events we hold for this truck. Being flagged visible is not the same as APPEARING. */
  futureEventCount?: number | null
  /** 🔴 THE FROZEN TYPE — `outreach_prospects.lead_type_at_first_contact`, or null.
   *  Optional so a caller that predates the column (or a route running against an unapplied migration)
   *  still type-checks and simply derives live, which is the documented meaning of null. */
  lead_type_at_first_contact?: string | null
}

/**
 * 🔴 "ON THE VILLAGE FOODIE MAP" IS THREE CONDITIONS, NOT ONE, AND THIS IS READ FROM THE FEED ITSELF.
 * `app/api/discovery/events/route.ts` gates a truck on `!truck.excluded` AND `truck[show_on_vf] === true`,
 * and then only renders events dated today or later. A truck with both flags right and nothing booked
 * is not on the map — there is nothing of it to see — so the event count is part of the test.
 * ⚠️ `show_on_vf` is `NOT NULL DEFAULT true` on `discovery_trucks`, so it is true for every scraped
 * truck nobody has touched. That makes `excluded` and the event count the parts that actually
 * discriminate; see the report for what that does to the size of `not_listed`.
 */
export function isOnVillageFoodieMap(p: LeadTypeInput): boolean {
  if (p.excluded === true) return false
  if (p.show_on_vf === false) return false      // undefined/null → the column's own default, true
  return (p.futureEventCount ?? 0) > 0
}

/**
 * The lead type, first match wins.
 * 🔴 `=== true` THROUGHOUT, NEVER TRUTHINESS. `hu_ordering` and `hu_map` are tri-state and NULL means
 * "nobody checked", which is not "no". Treating NULL as false would silently file every unchecked truck
 * under a weaker type; treating it as true would be worse. It falls through, which is correct: we do not
 * know it is a Hatches Up truck, so it is typed on what we DO know.
 */
export function leadTypeOf(p: LeadTypeInput): LeadType {
  if (p.hu_ordering === true) return 'hu_ordering'
  if (p.hu_map === true) return 'hu_map'
  if (isOnVillageFoodieMap(p)) return 'on_vf'
  return 'not_listed'
}

/**
 * 🔴 THE ONE FUNCTION EVERY READER MUST USE. Frozen value if there is a valid one, else derive live.
 *
 * WHY THE FREEZE EXISTS: types 3 and 4 hang on "has upcoming discovery_events", which the scraper
 * rewrites nightly and the prune deletes from as dates pass. Without this, a prospect could be told
 * "your schedule is listed" on Monday and "I could not find you listed" on Thursday, with nothing
 * changed but a scrape. 🧪 109 of 231 prospects sit in those two types (the operator's figure), so the
 * drift is the common case, not an edge.
 *
 * 🔴 NULL FALLS BACK TO THE LIVE DERIVATION, AND THAT IS WHAT MAKES A BACKFILL UNNECESSARY. The 9
 * prospects already mid-sequence and the 222 not yet contacted all behave exactly as before.
 * ⚠️ AN UNRECOGNISED STORED VALUE ALSO FALLS BACK, rather than propagating. The column is free text, so
 * a hand-edited row could hold anything; deriving is the honest answer to "I cannot read this", and it
 * is the same posture `isKind` takes in the contact history. It is NOT silently repaired — nothing
 * rewrites the column.
 */
export function effectiveLeadType(p: LeadTypeInput): LeadType {
  const frozen = p.lead_type_at_first_contact
  if (isLeadType(frozen)) return frozen
  return leadTypeOf(p)
}

/**
 * 🔴 SHOULD THE RUNG JUST LOGGED FREEZE THE LEAD TYPE? Pure, so the rule is testable rather than
 * inspectable — it used to be three clauses inline in a React handler, which no harness could reach.
 *
 * THREE CONDITIONS, ALL NECESSARY:
 *   • `columnExists` — the migration is applied. Until then this is false and nothing is written, so
 *     the console behaves exactly as it did before.
 *   • `kind === CONTACT_KINDS[0]` — 🔴 THE RUNG-1 LOG, NOT ANY LOG. A chase must not re-stamp the
 *     framing the approach was written in; that is the entire point of freezing.
 *   • not already a valid value — 🔴 WRITE ONCE. Re-logging a first contact later, logging it on a
 *     second channel, or a hand-correction made in the modal must not be overwritten by a later log.
 *
 * ⚠️ WHAT HAPPENS IF THE FIRST LOGGED CONTACT IS NOT RUNG 1 — say the operator starts a prospect at
 * Chase 1: NOTHING FREEZES, then or ever, because no later rung satisfies clause two. That prospect
 * stays on the live derivation and can still drift. It is not silently wrong — the modal's control
 * reads "(live)" and can set the value by hand — but it is a real gap, and it is the operator's
 * decision to start at rung 1 that closes it.
 */
export function shouldFreezeLeadType(
  kind: string,
  p: LeadTypeInput,
  columnExists: boolean,
): boolean {
  if (!columnExists) return false
  if (kind !== CONTACT_KINDS[0]) return false
  return !isLeadType(p.lead_type_at_first_contact)
}

/** True when the type came from the stored column rather than from today's data. For the UI only. */
export const isLeadTypeFrozen = (p: LeadTypeInput): boolean =>
  isLeadType(p.lead_type_at_first_contact)

// ── THE STEP ────────────────────────────────────────────────────────────────────────────────────────

/** Why a prospect is not being chased. Each is a fact about a row, never an inference. */
export type StopReason =
  | 'do_not_contact'      // the operator flagged it
  | 'replied'             // an inbound contact exists
  | 'stage'               // stage is terminal
  | 'converted'           // the discovery truck now links to a real HatchGrab truck
  | 'sequence_complete'   // the final chase has been sent

export type StepState =
  | 'due'        // dueOn is today or earlier
  | 'scheduled'  // dueOn is in the future
  | 'stopped'    // a StopReason applies
  | 'unknown'    // 🔴 D1 — the history contains something this module cannot read
  | 'complete'   // the ladder ran out

export type Step = {
  state: StepState
  /** The rung to send next. Null for every state except 'due' and 'scheduled'. */
  kind: LadderKind | null
  /** 'YYYY-MM-DD', or null when nothing is scheduled (a never-contacted prospect is due immediately). */
  dueOn: string | null
  /** 🔴 A SUGGESTION FROM THE DATA, NOT A DECISION. See `channelFor`. */
  channel: 'email' | 'whatsapp' | null
  leadType: LeadType
  /** True when `leadType` came from the stored column rather than today's derivation. Display only. */
  leadTypeFrozen: boolean
  stopReason: StopReason | null
  /** The rung already reached, 0 when none. Useful for display; not the state. */
  rungsDone: number
  /** 🔴 D1 — contact rows whose `kind` is outside the vocabulary. NON-EMPTY ⇒ state is 'unknown'. */
  blindRows: number
  /** One sentence the UI can render verbatim. Never "probably". */
  label: string
}

export type StepProspect = LeadTypeInput & {
  do_not_contact?: boolean | null
  stage?: string | null
  /** discovery_trucks.hatchgrab_truck_id — non-null means this prospect became a customer. */
  hatchgrab_truck_id?: string | null
  whatsapp_confirmed?: boolean | null
  /** The wa.me-able number, already normalised by the caller via the SHARED `phoneWhatsApp`. */
  waPhone?: string | null
  contact_email?: string | null
}

export type StepContact = {
  contacted_at?: string | null
  direction?: string | null
  kind?: string | null
  channel?: string | null
}

/** Stages that end the sequence. 🔴 `replied` is here AND detected from contacts — either is enough. */
const TERMINAL_STAGES = new Set(['signed', 'not_interested', 'replied'])

/**
 * 🔴 THE CHANNEL IS A SUGGESTION AND THE RULE IS DELIBERATELY CONSERVATIVE.
 * WhatsApp is offered only when BOTH the operator's own flag is set AND a wa.me-able number exists —
 * the same pair `templatesFor` and the modal's WhatsApp link already require, so this cannot offer a
 * channel the composer would then refuse to give him a template for.
 * ⚠️ IT IS NOT EVIDENCE OF CONSENT. The reference manual records that all 30 `whatsapp_confirmed` rows
 * match the scraped `advertises` hint 1:1 — "not one row was personally verified" — and that the ICO
 * treats messaging apps as in scope. So this picks a DRAFT channel for a human to send; it does not
 * authorise anything. Decision D4: the system drafts, the operator sends.
 */
export function channelFor(p: StepProspect): 'email' | 'whatsapp' | null {
  const wa = p.whatsapp_confirmed === true && !!(p.waPhone ?? '').trim()
  if (wa) return 'whatsapp'
  if ((p.contact_email ?? '').trim()) return 'email'
  return null
}

/**
 * The next step for a prospect, derived from its own row and its contact rows.
 *
 * 🔴 THE ORDER OF THE CHECKS IS THE DESIGN. Stops are tested BEFORE the ladder is read, so a
 * do-not-contact prospect with unreadable history reports "do not contact" rather than "unknown" — the
 * stop is the actionable answer and it is certain, where the rung is neither.
 * 🔴 THEN UNKNOWN IS TESTED BEFORE THE RUNG IS COMPUTED (D1), so an unreadable history can never fall
 * through to rung 0.
 */
export function nextStep(
  p: StepProspect,
  contacts: readonly StepContact[],
  today: Date = new Date(),
): Step {
  // 🔴 FROZEN WINS. `effectiveLeadType`, never `leadTypeOf` — see its note. This is one of exactly two
  // call sites in the codebase; the other is `contextFromProspect`, which feeds the ?lead_* conditions.
  const leadType = effectiveLeadType(p)
  const base = { kind: null, dueOn: null, channel: null, leadType, leadTypeFrozen: isLeadTypeFrozen(p),
    rungsDone: 0, blindRows: 0, stopReason: null } as const
  const stop = (stopReason: StopReason, label: string): Step =>
    ({ ...base, state: 'stopped', stopReason, label })

  // ── 1. STOPS, in order of certainty ──────────────────────────────────────────────────────────────
  if (p.do_not_contact === true) return stop('do_not_contact', 'Do not contact')
  if ((p.hatchgrab_truck_id ?? '') !== '') return stop('converted', 'Converted — now a HatchGrab truck')
  const inbound = contacts.filter(c => c.direction === 'inbound').length
  if (inbound > 0) return stop('replied', `Replied — ${inbound} inbound ${inbound === 1 ? 'message' : 'messages'}`)
  if (p.stage && TERMINAL_STAGES.has(p.stage)) return stop('stage', `Stage is ${p.stage.replace(/_/g, ' ')}`)

  // ── 2. READ THE LADDER ───────────────────────────────────────────────────────────────────────────
  // 🔴 OUTBOUND ONLY, AND `reply` IS NOT A RUNG IN EITHER DIRECTION. `kindsForDirection` allows an
  // OUTBOUND `reply` on purpose (writing back to a truck that emailed first), and counting it as a rung
  // would turn a courtesy reply into a chase.
  const outbound = contacts.filter(c => c.direction !== 'inbound')
  const rungs: LadderKind[] = []
  let blindRows = 0
  for (const c of outbound) {
    const k = c.kind
    if (isKind(k) && k !== REPLY_KIND) { rungs.push(k as LadderKind); continue }
    if (k === REPLY_KIND) continue          // a recognised non-rung: not blind, just not counted
    blindRows++                              // null, legacy ('first_contact', 'follow_up'), or anything else
  }

  // ── 3. 🔴 D1 — UNKNOWN BEATS A GUESS ─────────────────────────────────────────────────────────────
  // A single unreadable row is enough. It is tempting to say "3 readable rungs and 1 blind row, so
  // probably chase 3" — but the blind row is exactly as likely to BE one of those rungs under its old
  // name, which would make the answer off by one in the direction that sends an extra chase.
  if (blindRows > 0) {
    return {
      ...base, state: 'unknown', blindRows, rungsDone: rungs.length,
      label: `Can't tell — ${blindRows} contact${blindRows === 1 ? '' : 's'} not recognised; check the history`,
    }
  }

  // ── 4. THE RUNG ──────────────────────────────────────────────────────────────────────────────────
  // 🔴 HIGHEST REACHED, NOT A COUNT. The manual records both failures of counting: a double-click made a
  // first approach look like a third, and a count cannot tell chasing silence from following up. Taking
  // the highest rung is immune to both — logging the same rung twice yields the same answer.
  const highestIdx = rungs.reduce((acc, k) => Math.max(acc, CONTACT_KINDS.indexOf(k)), -1)
  const rungsDone = highestIdx + 1
  const channel = channelFor(p)

  if (highestIdx < 0) {
    // Never contacted (readably). Due now — there is nothing to count from.
    return {
      ...base, state: 'due', kind: CONTACT_KINDS[0], dueOn: null, channel, rungsDone: 0,
      label: 'First contact',
    }
  }
  if (highestIdx >= CONTACT_KINDS.length - 1) {
    return { ...base, state: 'complete', stopReason: 'sequence_complete', rungsDone,
      label: 'Sequence complete — final chase sent' }
  }

  const done = CONTACT_KINDS[highestIdx]
  const next = CONTACT_KINDS[highestIdx + 1]
  // 🔴 THE DUE DATE IS COUNTED FROM THE CONTACT THAT REACHED THE HIGHEST RUNG, using the SAME
  // `followUpDateFor` the log path already writes into `next_action_at`. Two derivations of one date
  // would drift the first time an interval changed.
  // ⚠️ LATEST date among rows at that rung, so re-logging a rung later moves the chase out rather than
  // leaving a stale earlier date driving the queue.
  const at = outbound
    .filter(c => c.kind === done)
    .map(c => String(c.contacted_at ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop() ?? null
  const dueOn = at ? followUpDateFor(done, at) : null
  const ymd = toYMD(today)
  const state: StepState = !dueOn ? 'due' : dueOn <= ymd ? 'due' : 'scheduled'

  return { ...base, state, kind: next, dueOn, channel, rungsDone, label: labelFor(next) }
}

const STEP_LABELS: Record<LadderKind, string> = {
  '1_first_contact': 'First contact',
  '2_chase_1': 'Chase 1',
  '3_chase_2': 'Chase 2',
  '4_final_chase': 'Final chase',
}
/** ⚠️ Deliberately a SEPARATE map from `kindLabel` in lib/outreach.ts. That one labels a HISTORY row
 *  ("what I did"); this labels an INSTRUCTION ("what to do next"). They read the same today and may not
 *  always — and a shared map would make one of the two wrong silently. */
export const labelFor = (k: LadderKind): string => STEP_LABELS[k]

// ── 🔴 STEP → TEMPLATE. BY RUNG AND CHANNEL ONLY — LEAD TYPE IS NOT IN THIS MAP ─────────────────────
// The operator's steer, and the reason this table is 4x2 and not 4x4x2: lead type is a CONDITION INSIDE
// a template (`?lead_hu_ordering:` and its three siblings), not a template multiplier. Sixteen rows kept
// in step by hand is the thing being avoided.
//
// ⚠️ THESE ARE SLUGS INTO USER-EDITABLE DATA, WHICH IS A JOIN KEY ON A ROW LABEL — the failure class the
// reference manual already names. `templateForStep` therefore resolves against the LOADED list and
// returns null when a slug is absent, so a retired or renamed template degrades to "nothing
// pre-selected", visibly, instead of selecting the wrong row or throwing.
//
// 🔴 TWO GAPS, STATED RATHER THAN PAPERED OVER. Both are the operator's to close, and neither is a bug
// in this map:
//   1. THE THREE CHASES SHARE ONE ROW. The seeded set is {first contact, chaser} x {email, whatsapp};
//      there has never been a template that distinguishes chase 1 from chase 2 from the final chase.
//      Until one exists, all three rungs point at the same words — which is what happens today anyway.
//   2. FIRST CONTACT POINTS AT `general_email`, NOT `hu_rate_email`. Under the old model those were two
//      segment-specific rows; under this one, ONE first-contact template carrying the four `?lead_`
//      lines replaces both. That template is the operator's to write — this map does not edit, create
//      or retire any row.
export const STEP_TEMPLATE: Record<LadderKind, { email: string; whatsapp: string }> = {
  '1_first_contact': { email: 'general_email', whatsapp: 'wa_intro' },
  '2_chase_1': { email: 'chaser_email', whatsapp: 'wa_chaser' },
  '3_chase_2': { email: 'chaser_email', whatsapp: 'wa_chaser' },
  '4_final_chase': { email: 'chaser_email', whatsapp: 'wa_chaser' },
}

/** Why no template could be pre-selected. Null when one was. */
export type TemplateMiss = 'no_step' | 'no_channel' | 'slug_absent' | null

/**
 * The template slug to open for a step, resolved against the templates actually loaded.
 * 🔴 RETURNS A REASON, NOT JUST A NULL. "Nothing was pre-selected" and "the template this step wants has
 * been retired" look identical to a caller that only gets null, and the second is worth saying out loud.
 */
export function templateForStep(
  step: Step,
  offerable: readonly {
    id: string
    channel?: string
    sortOrder?: number
    servesKind?: string | null
    servesLeadType?: string | null
  }[],
): { slug: string | null; miss: TemplateMiss } {
  if (!step.kind || (step.state !== 'due' && step.state !== 'scheduled')) return { slug: null, miss: 'no_step' }
  if (!step.channel) return { slug: null, miss: 'no_channel' }

  // ── 🔴 A TAGGED TEMPLATE WINS OVER THE HARDCODED MAP ───────────────────────────────────────────────
  // `STEP_TEMPLATE` is a slug map written in code — the thing the operator objected to. It is NOT
  // deleted: it is now the FALLBACK, which is what keeps every untagged install working exactly as it
  // does today. Tagging one template changes the answer for that rung only; tagging none changes
  // nothing at all. 🔴 EVERY ROW SHIPS UNTAGGED, so the fallback is the live path until he says
  // otherwise — this mechanism has no opinion of its own.
  //
  // MATCHING, most specific first. A template must serve the rung and the channel; `serves_lead_type`
  // narrows further, and null means "any", so an untyped template is a legitimate general match rather
  // than a non-match.
  // ⚠️ TWO TEMPLATES TAGGED IDENTICALLY IS NOT AN ERROR AND IS NOT A COIN TOSS. `sort_order` breaks the
  // tie — the column the picker already orders by, so what wins here is what sits higher in the list he
  // is looking at. Nothing new to learn, and no hidden precedence.
  const candidates = offerable.filter(t =>
    t.servesKind === step.kind
    && (t.channel === undefined || t.channel === step.channel)
    && (t.servesLeadType == null || t.servesLeadType === step.leadType))
  if (candidates.length > 0) {
    const best = [...candidates].sort((a, b) => {
      // A lead-type-specific tag beats a general one; then sort_order; then slug, so the answer is
      // stable rather than dependent on the order the rows arrived in.
      const sa = a.servesLeadType == null ? 1 : 0, sb = b.servesLeadType == null ? 1 : 0
      if (sa !== sb) return sa - sb
      const oa = a.sortOrder ?? 0, ob = b.sortOrder ?? 0
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })[0]
    return { slug: best.id, miss: null }
  }

  const slug = STEP_TEMPLATE[step.kind][step.channel]
  if (!offerable.some(t => t.id === slug)) return { slug: null, miss: 'slug_absent' }
  return { slug, miss: null }
}

/** Is this step actionable today? The queue's predicate, in one place so the filter and the row agree. */
export const isDueNow = (s: Step): boolean => s.state === 'due'
/** Everything the queue shows: due now, or unreadable and therefore needing a human. */
export const needsAttention = (s: Step): boolean => s.state === 'due' || s.state === 'unknown'
