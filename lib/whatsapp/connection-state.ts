// lib/whatsapp/connection-state.ts
// ONE definition of what state a truck's WhatsApp connection is in, and therefore what a settings
// surface shows them.
//
// ── 🔴 NOTHING IMPORTS THIS YET, AND THAT IS DELIBERATE ─────────────────────────────────────────────
// It was written during the per-truck architecture design pass (docs/whatsapp-per-truck-architecture.md)
// as the one piece that could be built without a Meta App ID, without a migration and without touching
// the send path. It is PURE: no I/O, no clock, no imports, no environment read. Adding it changes no
// behaviour anywhere, because nothing calls it.
// ⚠️ THE COLUMNS IT DESCRIBES DO NOT EXIST YET. Every field on the input is something the design says
// should be stored; none of it is in the database today. Do not read this file as documentation of the
// schema — read it as the shape the schema has to satisfy.
//
// ── ✅ WHY IT IS SHAPED LIKE lib/stripe/payments-state.ts ───────────────────────────────────────────
// That module is this codebase's existing answer to "a truck's connection to a third party has several
// states and exactly one next action". It is pure so a client component can import it, it derives ONE
// state rather than exposing a pile of booleans, and the derivation order IS the rule. All three
// properties are wanted here for the same reasons, so this mirrors it rather than inventing a second
// pattern. If that file's shape changes, change this one with it.

/** What a truck's WhatsApp connection is doing. Exhaustive — a surface switches on this and nothing else. */
export type WhatsAppConnectionState =
  /** No WABA has ever been linked. The truck has not been through Embedded Signup. */
  | 'not_connected'
  /** 🔴 A WABA exists but no phone number id does. PARTIAL COMPLETION — signup was abandoned or the
   *  number step did not finish. The operator can resume; nothing can send. */
  | 'onboarding_incomplete'
  /** 🔴 IDENTIFIERS ARE COMPLETE BUT WE HOLD NO USABLE TOKEN. Not the operator's fault and not
   *  something they can fix — the exchange failed, or a stored token was never written. */
  | 'token_missing'
  /** 🔴 WAS WORKING, NOW IS NOT. The business token has been revoked or has expired at Meta — most
   *  often because the operator removed the app's access, or ownership of the WABA changed. */
  | 'revoked'
  /** Everything on our side is in place; Meta reports the business has no payment method. The operator
   *  must add one in their own WhatsApp Business account. Clients pay Meta directly. */
  | 'awaiting_payment_method'
  /** Connected, credentialled, and able to send. */
  | 'ready'

export interface WhatsAppConnectionInput {
  /** Meta WhatsApp Business Account id, from Embedded Signup. Null = never onboarded. */
  wabaId: string | null
  /** The phone number id this truck sends from and receives on. Null = the number step never finished. */
  phoneNumberId: string | null
  /** 🔴 DO WE HOLD A USABLE BUSINESS TOKEN FOR THIS TRUCK? A BOOLEAN, NEVER THE TOKEN ITSELF.
   *  This module is importable by a client component; a token must never reach one. Whoever builds the
   *  server read is responsible for reducing "we have a token" to this boolean before it travels. */
  tokenPresent: boolean
  /** When the token was observed to be revoked or expired. Non-null outranks everything below it. */
  tokenRevokedAt: string | null
  /** 🔴 ADDED 4 September 2026 — THE ONE FIELD THIS TYPE WAS MISSING, AND WHY.
   *  This module modelled expiry only as `tokenRevokedAt`, a PAST-TENSE OBSERVATION — something already
   *  noticed after the fact. That was correct while token lifetime was unknown. It is not sufficient
   *  once tokens expire on a schedule: **reauthorisation is the NORMAL case, not an error path**, and a
   *  type that can only say "it already broke" cannot offer reauthorisation BEFORE a truck stops
   *  answering customers.
   *  ⚠️ ONE FIELD, ADDITIVE. No state was added and no existing state changed meaning — see the
   *  derivation and `isTokenExpiringSoon` below for why that was the smallest correct extension.
   *  🔴 WHERE THE VALUE COMES FROM (CORRECTED 4 September 2026): `expires_in` ON META'S EXCHANGE
   *  RESPONSE, AND NOWHERE ELSE. It was briefly computed from a hard-coded 60 days — a number taken
   *  from the v2-era configuration's "…With 60 Expiration Token" template and left in place after the
   *  launcher moved to the v4 configuration 1544768623597981, which was built from PRODUCTS and states
   *  no lifetime. That constant is gone; see app/api/manage/whatsapp-signup/route.ts.
   *  🔴 NULL HERE MEANS "NO TOKEN IS HELD", NOT "A TOKEN THAT NEVER EXPIRES". The exchange refuses to
   *  store a token it cannot date, so a row with a token always carries an expiry — the table's CHECK
   *  enforces the same thing. Do not read a null as "permanent". */
  tokenExpiresAt: string | null
  /** 🔴 WHEN META ISSUED THE TOKEN, so the reauthorisation window can be a fraction of the token's OWN
   *  life rather than a fixed day count. Sourced from `whatsapp_connections.token_issued_at`, written
   *  in the same statement that stores the ciphertext — so `tokenExpiresAt - tokenIssuedAt` is exactly
   *  the `expires_in` Meta returned, not an approximation of it.
   *  ⚠️ Null while no token is held, which the table's CHECK enforces. See `isTokenExpiringSoon` for
   *  what happens if it is null WITH a token — a shape the CHECK forbids but the code still handles. */
  tokenIssuedAt: string | null
  /** Meta's answer to "does this business have a payment method". 🔴 NULL MEANS UNREAD, NOT ABSENT —
   *  an unread value must never be rendered as "you have not paid". See the derivation. */
  paymentMethodPresent: boolean | null
}

/**
 * 🔴 THE ONE PLACE THE STATE IS DECIDED. Pure, total, and order-sensitive — read the order as the rule.
 *
 * ⚠️ `tokenRevokedAt` IS TESTED SECOND, BEFORE THE STRUCTURAL CHECKS, AND THAT IS THE POINT.
 * A revoked connection is an INTERRUPTION TO A WORKING TRUCK. Every state below it describes a setup
 * that was never finished, and telling an operator whose replies stopped this morning to "finish
 * onboarding" sends them hunting for work that does not exist — the same mistake `payments-state`
 * records for `pending` vs `restricted`.
 *
 * ⚠️ `token_missing` IS RANKED ABOVE `awaiting_payment_method` because we cannot ask Meta about a
 * payment method without a token. With no token, `paymentMethodPresent` can only be null (unread), so
 * reporting a payment problem would be asserting something nobody checked.
 *
 * ⚠️ NULL `paymentMethodPresent` FALLS THROUGH TO `ready`, DELIBERATELY. Unread is not "absent". The
 * cost of the two errors is not symmetric: showing a working truck a false "add a payment method"
 * banner is a support call about nothing, while a truck that genuinely has not paid learns it from
 * Meta's own send failure, which the send path is required to surface (see the design's §2c).
 *
 * ⚠️ THE FEATURE GATE IS NOT AN INPUT. `whatsapp_replies` decides whether the operator may SEE this
 * feature at all; this decides what the connection is doing. Conflating them would make a plan
 * downgrade look like a disconnection.
 */
export function deriveWhatsAppConnectionState(
  input: WhatsAppConnectionInput,
  now: Date = new Date(),
): WhatsAppConnectionState {
  if (!input.wabaId) return 'not_connected'
  // 🔴 A TOKEN PAST ITS EXPIRY IS `revoked`, NOT A NEW STATE — and this line sits WITH the revoked check
  // deliberately, because it is the same fact arriving a different way. `revoked`'s own documentation
  // already says "has been revoked OR HAS EXPIRED at Meta", so an elapsed `tokenExpiresAt` is exactly
  // what that state was written to describe; it simply had no way to be told. Adding a seventh state
  // would have changed nothing an operator does — the affordance is identical (reauthorise) — while
  // forcing every consumer of the union to handle one more case.
  if (input.tokenExpiresAt && new Date(input.tokenExpiresAt).getTime() <= now.getTime()) return 'revoked'
  if (input.tokenRevokedAt) return 'revoked'
  if (!input.phoneNumberId) return 'onboarding_incomplete'
  if (!input.tokenPresent) return 'token_missing'
  if (input.paymentMethodPresent === false) return 'awaiting_payment_method'
  return 'ready'
}

/**
 * ── 🔴 HOW FAR AHEAD OF EXPIRY TO OFFER REAUTHORISATION. A FRACTION OF THE TOKEN'S OWN LIFE. ───────
 *
 * 🔴 THIS WAS `REAUTHORISE_BEFORE_EXPIRY_DAYS = 14`, AND A FIXED DAY COUNT WAS WRONG THE MOMENT THE
 * LIFETIME STOPPED BEING FIXED. Proven by execution: against a 24-hour token, `isTokenExpiringSoon`
 * returned true from the instant it was issued — the "needs renewing soon" prompt would have shown for
 * the token's ENTIRE LIFE. That is the exact nag an operator learns to ignore, and it would then be
 * ignored on the one day it mattered.
 *
 * ⚠️ A QUARTER. The reasoning, so it can be argued with rather than guessed at:
 *   • Reauthorisation is not something we can do — the OPERATOR must walk through Meta's wizard again,
 *     so the window has to be a meaningful share of the cycle, not a token gesture.
 *   • It is ABSENT for the first three quarters of every token's life, whatever that life is. A prompt
 *     that shows for half the cycle is furniture; one that appears in the last quarter is news.
 *   • It scales in both directions without anyone editing this file: a longer-lived token gets a
 *     proportionally longer warning, a shorter-lived one stops being permanently nagged.
 *   • 🟢 AGAINST TODAY'S 60-DAY CONFIGURATION IT IS 15 DAYS — one day earlier than the 14 it replaces.
 *     Today's behaviour is therefore effectively unchanged, which is the point: this fixes the short-
 *     token case without moving the case we already reasoned about.
 * ⚠️ IT IS STILL A JUDGEMENT, NOT A MEASUREMENT. Nothing observed says a quarter is right; it is one
 * named constant so it can be overruled in one place.
 *
 * ⚠️ EXPIRING SOON IS NOT A STATE AND MUST NOT BECOME ONE. The truck can still send: the token is valid
 * until it is not. `canSendWhatsApp` stays a single equality on 'ready', and a truck inside this window
 * keeps answering customers while being asked to reconnect.
 */
export const REAUTHORISE_WINDOW_FRACTION = 0.25

/**
 * True when a held token is inside the last `REAUTHORISE_WINDOW_FRACTION` of its own life.
 * Pure, and safe for a client component: it takes timestamps, never a token.
 *
 * 🔴 THE LIFETIME COMES FROM THE ROW, NOT FROM A CONSTANT: `tokenExpiresAt - tokenIssuedAt`.
 * 🟢 BOTH ARE REAL COLUMNS, WRITTEN TOGETHER (4 September 2026). This briefly used the row's
 * `updated_at` as a stand-in for the issue time, which was exact only while the signup route was the
 * table's sole writer and would have rotted — silently, and in the direction that SHRINKS the warning
 * window — the moment anything else touched a row. `token_issued_at` replaces it; the proxy and its
 * caveat are gone, not merely documented.
 *
 * 🔴 IF `tokenIssuedAt` IS NULL WHILE A TOKEN IS HELD, THIS RETURNS TRUE — IT PROMPTS. That pairing is
 * forbidden by `whatsapp_connections_token_issued_together`, so it cannot arrive through this
 * codebase; it can only come from a row hand-edited in the SQL editor. The failure is chosen, not
 * inherited: we know the token dies (the expiry CHECK guarantees `tokenExpiresAt`) but not how long it
 * had, so we cannot say whether it is close. Of the two ways to be wrong, an unnecessary "reconnect"
 * prompt costs one wasted wizard, while staying silent costs a truck going dead mid-service with no
 * warning at all. It prompts.
 * ⚠️ AND THIS IS NOT THE FABRICATED-EXPIRY PROBLEM RETURNING. Nothing is invented and nothing is
 * written: no date is computed, no row is touched, and `canSendWhatsApp` is untouched. The only effect
 * is whether a non-blocking amber prompt is shown. The fabrication was writing a number we did not
 * observe INTO THE DATABASE; this is declining to guess and asking a human instead.
 *
 * ⚠️ Returns false for an ALREADY-expired token — that is `revoked`, which the derivation handles and
 * which carries a different message ("reconnect to resume") from this one ("reconnect to avoid a stop").
 * ⚠️ Returns false when the lifetime cannot be computed (missing or nonsensical issue time). Failing
 * to `false` here means "do not nag", never "do not send" — the send gate is a separate equality on
 * 'ready' and is untouched by this function.
 */
export function isTokenExpiringSoon(
  tokenExpiresAt: string | null,
  tokenIssuedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!tokenExpiresAt) return false          // no token held; nothing to renew
  const expiry = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(expiry)) return false

  const msLeft = expiry - now.getTime()
  if (msLeft <= 0) return false             // already expired — that is `revoked`, a different message

  // 🔴 UNKNOWN ISSUE TIME ⇒ PROMPT. See the note above: forbidden by the CHECK, and if it happens
  // anyway we would rather send an operator through one unnecessary wizard than let a truck go dead
  // with no warning. Missing, unparseable and nonsensical (issued at or after expiry) all land here.
  if (!tokenIssuedAt) return true
  const issued = new Date(tokenIssuedAt).getTime()
  if (Number.isNaN(issued)) return true
  const lifetimeMs = expiry - issued
  if (lifetimeMs <= 0) return true

  return msLeft <= lifetimeMs * REAUTHORISE_WINDOW_FRACTION
}

/**
 * 🔴 THE SEND GATE. The ONLY test a send path may make, and it is deliberately a single equality
 * rather than a list of "not these" — a state added later must fail closed, not inherit permission.
 *
 * ⚠️ IT IS NOT A PROMISE THAT A SEND WILL SUCCEED. Meta can still refuse: the 24-hour window may have
 * closed, the template may be unapproved, the number may be rate limited. It is the promise that we
 * have something to try with. The send path must still report Meta's own refusal.
 */
export function canSendWhatsApp(state: WhatsAppConnectionState): boolean {
  // 🔴 CHANGED 16 SEPTEMBER 2026 — `awaiting_payment_method` NO LONGER BLOCKS SENDING.
  // A missing payment method is not a missing credential. Meta allows sends inside its free monthly
  // allowance without one, so refusing here silenced trucks Meta would have happily delivered for — and
  // it did it on the strength of `payment_method_present`, a column we never populate (it is null on the
  // one live connection). The state is KEPT: `needsOperatorAction` still surfaces it, and the Settings
  // copy still tells an operator who raises their limit above the free allowance to add one.
  // ⚠️ THIS IS STILL A CLOSED LIST, NOT A "NOT THESE". A state added later is not sendable until someone
  // writes it here on purpose — which is the property the single equality was protecting.
  return state === 'ready' || state === 'awaiting_payment_method'
}

/** States the OPERATOR can act on themselves, and therefore the ones a settings surface gives a button.
 *  `token_missing` is excluded on purpose — see `needsSupportAttention`. */
export function needsOperatorAction(state: WhatsAppConnectionState): boolean {
  return (
    state === 'not_connected' ||
    state === 'onboarding_incomplete' ||
    state === 'revoked' ||
    state === 'awaiting_payment_method'
  )
}

/** 🔴 THE STATE THE OPERATOR CANNOT FIX. Our exchange produced no usable token, so a "reconnect" button
 *  would be an instruction that can never succeed — the exact failure the enum exists to prevent. The
 *  surface must say so and route to support rather than offering an action. */
export function needsSupportAttention(state: WhatsAppConnectionState): boolean {
  return state === 'token_missing'
}

/** Should a surface offer to START Embedded Signup? Only where there is nothing to resume. A revoked or
 *  half-finished connection needs RE-authorisation of an existing WABA, which is a different call with
 *  different consequences — do not collapse the two behind one button. */
export function shouldOfferSignup(state: WhatsAppConnectionState): boolean {
  return state === 'not_connected'
}

/** Should a surface offer to RESUME or RE-AUTHORISE? Both keep the existing WABA. */
export function shouldOfferReauthorise(state: WhatsAppConnectionState): boolean {
  return state === 'onboarding_incomplete' || state === 'revoked'
}
