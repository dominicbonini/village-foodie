// lib/whatsapp/reply-cap.ts
// ── THE REPLY CAP — ONE PURE DECISION, NO DATABASE, NO IMPORTS ──────────────────────────────────────
// Shape precedent: lib/payments/paid-step.ts — zero imports, one resolver, the reasoning at the top.
// This module NEVER reads a row. It takes counts and returns a decision; the caller does the reading and
// the sending. That is what makes every branch below testable by execution rather than by inspection.
//
// ── 🔴 WHY A CAP EXISTS AT ALL ──────────────────────────────────────────────────────────────────────
// From 1 October 2026 Meta charges PER MESSAGE for service messages — free-form replies inside the
// 24-hour customer service window. **Every auto-reply this platform sends is exactly that.**
// ⚠️ THE EXPOSURE IS NOT ABUSE, IT IS ARITHMETIC. A single customer in a loop, or one truck's number
// posted somewhere busy, converts directly into per-message spend with nothing in the path to stop it.
//
// ── 🔴 THE CAP IS DECIDED BEFORE THE MODEL RUNS, NOT AFTER ──────────────────────────────────────────
// Classification is itself a model call. Cutting at the SEND would save Meta's fee and pay for the model
// anyway. The caller runs this after the truck lookup and plan gate and BEFORE the shared reply
// function. **Do not move it later for tidiness.**

// ── THE LIMITS ──────────────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 A DEFAULT, NOT A CONSTANT THE DECISION READS. `decideReplyCap` takes the per-customer limit as an
 * ARGUMENT and never reaches module scope for it — see the note on that parameter. This export exists so
 * the route has something to pass today.
 */
export const DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H = 3

// ── ⚠️ A RUNAWAY CEILING, NOT A BUDGET LEVER. THE DISTINCTION IS LOAD-BEARING. ──────────────────────
// This number exists to stop an unbounded loop converting into unbounded spend. It is NOT a spend
// control, and it must NOT be lowered into budget territory — a few hundred, say — until an operator
// notification exists.
// 🔴 THE REASON IS A FAILURE THIS CODEBASE HAS ALREADY DOCUMENTED ONCE: a truck that silently exhausts
// its month, with nobody told, looks exactly like a truck whose WhatsApp integration has broken. Nothing
// on any operator surface reads `whatsapp_logs`, so the first signal would be a customer complaining
// that nobody answered. **A cap nobody is told about is an outage with a good excuse.**
export const MAX_REPLIES_PER_TRUCK_MONTH = 2000

/**
 * 🔴 DERIVED, NEVER A SECOND LITERAL. A day ceiling written independently drifts the first time the
 * month one moves, and the two would then disagree about what "a tenth of the month" means.
 * One tenth, rounded up — a truck may legitimately have a very busy day inside a normal month.
 */
export const MAX_REPLIES_PER_TRUCK_DAY = Math.ceil(MAX_REPLIES_PER_TRUCK_MONTH / 10)

// ── THE FOUR CLASSIFICATION STRINGS — THEY LIVE HERE AND NOWHERE ELSE ───────────────────────────────
// They are written into `whatsapp_logs.classification` and then READ BACK to exclude cap rows from every
// count. A literal at a call site that drifts by one character silently stops excluding its own rows —
// the cap would then count its own notices and tighten itself every window. Named exports make that
// unrepresentable, and `isCapClassification` below means no caller ever lists them either.
export const CLASSIFICATION_CUSTOMER_CAP      = 'CAP_CUSTOMER_24H'
export const CLASSIFICATION_CUSTOMER_NOTIFIED = 'CAP_CUSTOMER_NOTIFIED'
export const CLASSIFICATION_TRUCK_DAY_CAP     = 'CAP_TRUCK_DAY'
export const CLASSIFICATION_TRUCK_MONTH_CAP   = 'CAP_TRUCK_MONTH'

/** Every cap classification, in one place, so no caller writes the list out. */
export const CAP_CLASSIFICATIONS: readonly string[] = [
  CLASSIFICATION_CUSTOMER_CAP,
  CLASSIFICATION_CUSTOMER_NOTIFIED,
  CLASSIFICATION_TRUCK_DAY_CAP,
  CLASSIFICATION_TRUCK_MONTH_CAP,
]

/** True for any row this module wrote. Such rows are excluded from every count, in every window. */
export function isCapClassification(classification: string | null | undefined): boolean {
  return !!classification && CAP_CLASSIFICATIONS.includes(classification)
}

// ── THE HANDOFF MESSAGE ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE HANDOFF IS ITSELF A BILLABLE MESSAGE. A per-customer limit of 3 therefore yields THREE replies
// PLUS ONE handoff — **four billable messages, not three.** Every limit in this file is a count of
// replies, not a count of what Meta invoices.
//
// 🔴 THE CONTACT NUMBER IS A WHOLE CLAUSE THAT IS PRESENT OR ABSENT. `trucks.whatsapp` is null or blank
// on 7 of 12 trucks — INCLUDING `test-truck`, the only truck with a working WhatsApp configuration and
// therefore the only one that can reach this cap today. `trucks.slug` is non-null on all twelve, so the
// order link is unconditional.
// ⚠️ NO FALLBACK STRING, NO PLACEHOLDER, NO EMPTY CLAUSE. An earlier version emitted
// "Please contact {name} directly." when the number was missing, which tells the customer to do the one
// thing the message has just failed to help them do.
// ⚠️ AND NO PRECONDITION REFUSING TO SEND. Silence at the cap boundary is the outcome the cap exists to
// avoid; a handoff without a phone number is still a handoff, because the order link always works.

/** Null, empty and whitespace-only are all ABSENT. */
function hasContact(contactNumber: string | null | undefined): boolean {
  return typeof contactNumber === 'string' && contactNumber.trim().length > 0
}

/** The variant sent when the truck has no usable contact number — order link only. */
export function handoffMessageWithoutContact(orderLink: string): string {
  return `Thanks for all your messages! I can only reply a few times a day here.\n\n`
    + `To order: ${orderLink}`
}

/** The variant sent when the truck has one — the contact clause is appended whole. */
export function handoffMessageWithContact(orderLink: string, contactNumber: string): string {
  return handoffMessageWithoutContact(orderLink)
    + `\nTo reach us directly: ${contactNumber.trim()}`
}

/** The one call site's entry point. Picks the variant; never emits a clause with an empty value. */
export function handoffMessage(orderLink: string, contactNumber: string | null | undefined): string {
  return hasContact(contactNumber)
    ? handoffMessageWithContact(orderLink, contactNumber as string)
    : handoffMessageWithoutContact(orderLink)
}

// ── THE DECISION ────────────────────────────────────────────────────────────────────────────────────

/**
 * Five members, five actions:
 *   REPLY                            → carry on into the classifier and the shared reply function.
 *   NOTIFY_CUSTOMER_CAP              → send ONE handoff, log it with response_sent set.
 *   SILENT_CUSTOMER_ALREADY_NOTIFIED → send nothing; this customer has already had their handoff.
 *   SILENT_TRUCK_DAY_CAP             → send nothing; this truck is done for its local day.
 *   SILENT_TRUCK_MONTH_CAP           → send nothing; this truck is done for its local month.
 */
export type ReplyCapDecision =
  | 'REPLY'
  | 'NOTIFY_CUSTOMER_CAP'
  | 'SILENT_CUSTOMER_ALREADY_NOTIFIED'
  | 'SILENT_TRUCK_DAY_CAP'
  | 'SILENT_TRUCK_MONTH_CAP'

export interface ReplyCapInput {
  /** Replied rows for this (truck, customer) in the rolling 24h window, EXCLUDING cap rows. */
  customerReplies24h: number
  /** Replied rows for this truck, all customers, in its local calendar day, EXCLUDING cap rows. */
  truckRepliesToday: number
  /** Replied rows for this truck, all customers, in its local calendar month, EXCLUDING cap rows. */
  truckRepliesThisMonth: number
  /** True when a customer-cap row already exists in this customer's window. */
  customerCapNoticeSent: boolean
  /**
   * 🔴 PASSED IN, NEVER READ FROM MODULE SCOPE. The per-customer limit is the one an operator will
   * eventually set per truck — intended ceiling 5 — and when that lands it is a ONE-LINE CHANGE AT THE
   * CALL SITE: pass `truck.max_replies_per_customer ?? DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H` instead of
   * the bare default. Nothing in this module changes, and no other call site can disagree with it.
   * ⚠️ If this function reached for the constant itself, that future column would have to be threaded
   * through here anyway — and until it was, a per-truck value would be silently ignored.
   */
  maxRepliesPerCustomer24h: number
}

/**
 * 🔴 PRECEDENCE IS MONTH, THEN DAY, THEN CUSTOMER, AND IT IS NOT ARBITRARY.
 * A truck over its ceiling sends **nothing at all — not even the handoff**, because the handoff is
 * itself a billable message. Deciding the customer case first would let a truck that is already over
 * budget keep paying for handoffs, one per customer, which is the exact spend the ceiling exists to
 * stop. The wider window wins because it is the one with money attached.
 *
 * ⚠️ ALL THREE LIMITS ARE INCLUSIVE — `>=`. At the limit caps; it does not wait for one over.
 */
export function decideReplyCap(input: ReplyCapInput): ReplyCapDecision {
  if (input.truckRepliesThisMonth >= MAX_REPLIES_PER_TRUCK_MONTH) return 'SILENT_TRUCK_MONTH_CAP'
  if (input.truckRepliesToday >= MAX_REPLIES_PER_TRUCK_DAY) return 'SILENT_TRUCK_DAY_CAP'

  if (input.customerReplies24h >= input.maxRepliesPerCustomer24h) {
    // ── 🔴 THIS MEMBER FIXES A REAL DEFECT, IT IS NOT TIDYING. ───────────────────────────────────────
    // The previous version returned the TRUCK-day member here, so an already-notified customer on a
    // truck at ZERO replies wrote a log row claiming the truck had hit its daily ceiling.
    // ⚠️ `whatsapp_logs` IS THE TABLE WE WILL READ TO JUDGE WHETHER THESE LIMITS ARE SET RIGHT, and it
    // was reporting caps that never happened — in the direction that would have made the day limit look
    // too tight and invited someone to raise it.
    return input.customerCapNoticeSent ? 'SILENT_CUSTOMER_ALREADY_NOTIFIED' : 'NOTIFY_CUSTOMER_CAP'
  }

  return 'REPLY'
}
