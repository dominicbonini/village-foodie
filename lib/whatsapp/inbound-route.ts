// lib/whatsapp/inbound-route.ts
// 🔴 WHICH TRUCK AN INBOUND WHATSAPP MESSAGE BELONGS TO, AND WHAT CREDENTIAL MAY ANSWER IT.
// Two pure functions, no I/O, no Supabase, no env reads. The webhook fetches; these decide.
//
// ── WHY THE ORDER IS WHAT IT IS ─────────────────────────────────────────────────────────────────────
// 1. `connection`      — a READY whatsapp_connections row. This is a truck that completed Embedded
//                        Signup, holds its OWN Meta credential, and pays Meta itself. It must win,
//                        because answering it on the platform token would bill us for their messages.
// 2. `truck_column`    — `trucks.phone_number_id`, hand-set. This is the platform's own Meta test
//                        number. Unchanged behaviour, platform token.
// 3. `sender_fallback` — the pre-existing `whatsapp_sender` match, kept exactly as it was.
//
// 🔴 A CONFLICT IS NOT RESOLVED BY PRECEDENCE. If (1) and (2) name DIFFERENT trucks, the same number is
// claimed twice and we cannot know which business the customer meant. Guessing would put one truck's
// customer conversation in front of another truck. `conflict` sends nothing and is logged loudly.

export type WhatsAppRoutePath = 'connection' | 'truck_column' | 'sender_fallback'

/** A `whatsapp_connections` row, reduced to what the decision needs. */
export interface ConnectionRouteRow {
  truckId: string
  phoneNumberId: string | null
  /** From `deriveWhatsAppConnectionState` — this module does not re-derive it. */
  ready: boolean
}

export type WhatsAppRouteResult =
  | { kind: 'matched'; path: WhatsAppRoutePath; truckId: string }
  | { kind: 'conflict'; connectionTruckId: string; truckColumnTruckId: string; phoneNumberId: string }
  | { kind: 'none' }

/**
 * Decide the route. Every argument is already-fetched data.
 *
 * ⚠️ `connection` is the row matched on phone_number_id by the caller, or null. `ready` must come from
 * `canSendWhatsApp(deriveWhatsAppConnectionState(...))` — this function deliberately does not know the
 * state machine, so a new state cannot change routing behind its back.
 * ⚠️ A NON-READY connection row does NOT block the lower paths. It simply is not a match: a half-
 * onboarded truck that also has a hand-set column should still receive on the column it used before.
 */
export function resolveWhatsAppRoute(input: {
  phoneNumberId: string
  connection: ConnectionRouteRow | null
  truckColumnTruckId: string | null
  senderFallbackTruckId: string | null
}): WhatsAppRouteResult {
  const conn = input.connection
  const connMatches = !!conn && conn.ready && conn.phoneNumberId === input.phoneNumberId

  // 🔴 THE CONFLICT TEST RUNS BEFORE THE PRECEDENCE, or precedence would hide it for ever.
  if (connMatches && input.truckColumnTruckId && input.truckColumnTruckId !== conn!.truckId) {
    return {
      kind: 'conflict',
      connectionTruckId: conn!.truckId,
      truckColumnTruckId: input.truckColumnTruckId,
      phoneNumberId: input.phoneNumberId,
    }
  }

  if (connMatches) return { kind: 'matched', path: 'connection', truckId: conn!.truckId }
  if (input.truckColumnTruckId) return { kind: 'matched', path: 'truck_column', truckId: input.truckColumnTruckId }
  if (input.senderFallbackTruckId) return { kind: 'matched', path: 'sender_fallback', truckId: input.senderFallbackTruckId }
  return { kind: 'none' }
}

// ── THE SEND CREDENTIAL ─────────────────────────────────────────────────────────────────────────────

export type SendCredential =
  | { kind: 'connection'; accessToken: string }
  | { kind: 'platform'; accessToken: string }
  | { kind: 'refuse'; reason: string }

/** The connection row's token material, already read from the database. */
export interface ConnectionTokenInput {
  ciphertext: string | null
  tokenExpiresAt: string | null
  tokenRevokedAt: string | null
}

/**
 * Choose what may authorise a send, from the route already decided.
 *
 * 🔴 THE `connection` PATH NEVER FALLS BACK TO THE PLATFORM TOKEN. That fallback is the whole defect
 * this function exists to close: a truck that onboarded to pay Meta itself must not have its messages
 * quietly billed to us because its own token was unusable. Unusable means SILENT, and the operator is
 * told through the Settings "Reconnect" affordance, not by us paying for them.
 *
 * ⚠️ IT IS STRICTER THAN `canSendWhatsApp`. A null `token_expires_at` derives as `ready`, and the table's
 * CHECK forbids a stored ciphertext with no expiry — but "forbidden by a constraint" is not "cannot
 * arrive", and a token of unknown lifetime is one we cannot say is live. Refused here, deliberately.
 *
 * ⚠️ `decrypt` is injected rather than imported so this stays pure and testable without a key in the
 * environment. It must THROW on failure — that is how `decryptToken` signals (lib/whatsapp/token-crypto.ts).
 */
export function chooseSendCredential(input: {
  path: WhatsAppRoutePath
  connectionToken: ConnectionTokenInput | null
  platformToken: string | null | undefined
  /** The inbound metadata phone_number_id — only the sender_fallback path inspects it. */
  inboundPhoneNumberId: string
  /** process.env.META_WHATSAPP_PHONE_NUMBER_ID, read by the caller. */
  platformPhoneNumberId: string | null | undefined
  decrypt: (ciphertext: string) => string
  now?: Date
}): SendCredential {
  const now = input.now ?? new Date()

  if (input.path === 'connection') {
    const t = input.connectionToken
    if (!t || !t.ciphertext) return { kind: 'refuse', reason: 'connection has no stored token' }
    if (t.tokenRevokedAt) return { kind: 'refuse', reason: 'connection token revoked' }
    if (!t.tokenExpiresAt) return { kind: 'refuse', reason: 'connection token has no expiry' }
    const expiry = new Date(t.tokenExpiresAt).getTime()
    if (Number.isNaN(expiry)) return { kind: 'refuse', reason: 'connection token expiry unreadable' }
    if (expiry <= now.getTime()) return { kind: 'refuse', reason: 'connection token expired' }
    let plaintext: string
    try {
      plaintext = input.decrypt(t.ciphertext)
    } catch {
      // 🔴 THE ERROR IS NOT CARRIED OUT OF HERE. A decrypt failure message can name key material and
      // ciphertext shape; the caller logs `reason` verbatim.
      return { kind: 'refuse', reason: 'connection token could not be decrypted' }
    }
    if (!plaintext) return { kind: 'refuse', reason: 'connection token decrypted to empty' }
    return { kind: 'connection', accessToken: plaintext }
  }

  if (input.path === 'truck_column') {
    if (!input.platformToken) return { kind: 'refuse', reason: 'platform token not configured' }
    return { kind: 'platform', accessToken: input.platformToken }
  }

  // sender_fallback — the loosest match, so it gets the tightest credential test.
  // 🔴 THE PLATFORM TOKEN MAY ONLY ANSWER THE PLATFORM'S OWN NUMBER. Without this, a truck matched only
  // by a typed-in `whatsapp_sender` string would be answered on OUR Meta account for a number we do not
  // own — a send we would be billed for and cannot account for.
  if (!input.platformPhoneNumberId || input.inboundPhoneNumberId !== input.platformPhoneNumberId) {
    return { kind: 'refuse', reason: 'sender fallback: inbound number is not the platform number' }
  }
  if (!input.platformToken) return { kind: 'refuse', reason: 'platform token not configured' }
  return { kind: 'platform', accessToken: input.platformToken }
}
