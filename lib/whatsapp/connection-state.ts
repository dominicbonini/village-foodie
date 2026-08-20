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
): WhatsAppConnectionState {
  if (!input.wabaId) return 'not_connected'
  if (input.tokenRevokedAt) return 'revoked'
  if (!input.phoneNumberId) return 'onboarding_incomplete'
  if (!input.tokenPresent) return 'token_missing'
  if (input.paymentMethodPresent === false) return 'awaiting_payment_method'
  return 'ready'
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
  return state === 'ready'
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
