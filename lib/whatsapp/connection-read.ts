// lib/whatsapp/connection-read.ts
// ── THE SERVER READ. ONE PLACE A whatsapp_connections ROW BECOMES SOMETHING A BROWSER MAY SEE. ──────
//
// 🔴 THIS MODULE EXISTS TO REDUCE, NOT TO FETCH. Its whole job is the narrowing that connection-state.ts
// asks for in its own comment: *"Whoever builds the server read is responsible for reducing 'we have a
// token' to this boolean before it travels."* The token is turned into `tokenPresent: boolean` HERE, on
// the server, and the ciphertext never leaves this function.
//
// 🔴 SERVER ONLY. Takes an already-constructed service-role client rather than creating one, so it holds
// no credential of its own and cannot be made to work from a client component by accident.
//
// ⚠️ IT NEVER DECRYPTS. Rendering a connection's STATE needs to know a token exists, not what it says —
// so this reads the presence of `access_token_ciphertext` and stops. Decryption belongs to the send path
// (S7), which is not built. Not importing token-crypto here is a structural guarantee, not a promise.
import {
  deriveWhatsAppConnectionState,
  isTokenExpiringSoon,
  shouldOfferSignup,
  shouldOfferReauthorise,
  type WhatsAppConnectionInput,
  type WhatsAppConnectionState,
} from '@/lib/whatsapp/connection-state'

/**
 * 🔴 THE CLIENT PAYLOAD. EVERY FIELD A BROWSER RECEIVES IS ON THIS TYPE — if a value is not named here
 * it does not travel. Deliberately minimal: a state, two booleans derived from it, and a expiry-window
 * flag. No token, no ciphertext, no key, no ids.
 * ⚠️ `wabaId` / `phoneNumberId` / `businessId` are NOT included. They are not secrets, but nothing on the
 * Settings card needs them today and the smallest payload is the one that cannot leak something later.
 */
export interface WhatsAppConnectionView {
  state: WhatsAppConnectionState
  /** Offer the Setup control (there is nothing connected yet). */
  offerSignup: boolean
  /** Offer Reconnect (partially onboarded, revoked, or expired). */
  offerReauthorise: boolean
  /** Still working, but inside the last REAUTHORISE_WINDOW_FRACTION of the token's life. NOT a state. */
  expiringSoon: boolean
  /** 🔴 META'S OWN ANSWER FOR THE CONNECTED NUMBER, OR NULL. Never the operator's typed `whatsapp_sender`
   *  — that is a different field with a different meaning and was the source of the number the row used
   *  to show. Null when the lookup failed or Meta had nothing; the row then shows nothing, not a guess. */
  displayPhoneNumber: string | null
  /** Meta's verified business name, or null (it is empty until Meta approves one). */
  verifiedName: string | null
  /** 🔴 READ-ONLY, AND ALREADY SELECTED. The column was fetched for the state derivation and then thrown
   *  away; the Settings box needs to SAY what it holds, so it is now carried through too. No query
   *  changed — `CONNECTION_FIELDS` already listed it.
   *  ⚠️ THREE-VALUED AND IT MATTERS: true = added, false = confirmed absent, null = never asked.
   *  🧪 Nothing writes true or false today (both signup writes store null), so null is the live case. */
  paymentMethodPresent: boolean | null
  /** 🔴 WHEN META ITSELF REFUSED A REAL SEND FOR BILLING (error 131042), or null. This is an OBSERVED
   *  refusal, not a setting and not a guess — which is exactly why it is trusted enough to raise a
   *  banner while `paymentMethodPresent` (null on every live row) is not.
   *  ⚠️ NULL ALSO MEANS "the column is not there yet". The migration is applied by hand; until it is,
   *  this reads null everywhere and no banner appears — the behaviour before this field existed. */
  paymentBlockedAt: string | null
}

/** The columns this read needs. Named, never `select('*')` — the habit that caused the class of bug the
 *  migration header records. `access_token_ciphertext` is selected ONLY to test presence, below. */
const CONNECTION_FIELDS =
  'truck_id, waba_id, phone_number_id, access_token_ciphertext, token_expires_at, token_revoked_at, token_issued_at, payment_method_present, display_phone_number, verified_name'

/** 🔴 SELECTED SEPARATELY, WITH A FALLBACK, BECAUSE THE MIGRATION THAT ADDS IT IS APPLIED BY HAND.
 *  Appending `payment_blocked_at` to CONNECTION_FIELDS unconditionally would make the ENTIRE select
 *  fail with 42703 until somebody runs the SQL — and this function turns any read failure into
 *  'not_connected', so a trading truck's WhatsApp box would go blank and offer to set up a connection
 *  it already has. One extra column is not worth that, so the read asks for it, and asks again without
 *  it if the first attempt fails. */
const CONNECTION_FIELDS_WITH_BLOCK = CONNECTION_FIELDS + ', payment_blocked_at'

/** Minimal shape of the supabase client this needs, so the module imports no client library and cannot
 *  drag a server dependency anywhere.
 *  ⚠️ `from` RETURNS `any` DELIBERATELY. Modelling PostgREST's builder chain structurally makes tsc
 *  report "Type instantiation is excessively deep" against the real client's generics — the precise
 *  shape is Supabase's business, not this module's. The narrowing that matters happens below, where the
 *  row's fields are read one at a time into a typed `WhatsAppConnectionInput`. */
interface MinimalClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

/**
 * Read one truck's connection and reduce it to the client-safe view.
 *
 * 🔴 FAILS TOWARD 'not_connected', ALWAYS. A missing row, a missing TABLE (this migration is applied by
 * hand and may not have been run yet), or a read error all resolve to the state that promises nothing and
 * offers setup. The alternative — throwing — would take out the whole Settings tab for a trading truck
 * over a feature they are not yet using. ⚠️ This mirrors the capability-probe pattern the outreach route
 * uses for a hand-applied column: attempt the read, treat an error as absent, degrade the UI.
 * ⚠️ AND IT NEVER FABRICATES A CONNECTED STATE. Every failure path lands on 'not_connected'; nothing here
 * can invent 'ready'.
 */
export async function readWhatsAppConnection(
  supabase: MinimalClient,
  truckId: string,
  now: Date = new Date(),
): Promise<WhatsAppConnectionView> {
  let row: Record<string, unknown> | null = null
  try {
    let { data, error } = await supabase
      .from('whatsapp_connections')
      .select(CONNECTION_FIELDS_WITH_BLOCK)
      .eq('truck_id', truckId)
      .maybeSingle()
    if (error) {
      // ⚠️ RETRY WITHOUT THE HAND-APPLIED COLUMN BEFORE GIVING UP. If this second attempt succeeds, the
      // only thing that was wrong was the missing column: the connection is read in full and
      // `paymentBlockedAt` simply stays null. If it fails too, the original handling below takes over
      // unchanged and the box lands on 'not_connected' exactly as it did before.
      const retry = await supabase
        .from('whatsapp_connections')
        .select(CONNECTION_FIELDS)
        .eq('truck_id', truckId)
        .maybeSingle()
      if (!retry.error) { data = retry.data; error = null }
    }
    if (error) {
      // Table absent (not yet applied by hand) or any read failure. Logged, never thrown.
      console.warn('[whatsapp/connection-read] read failed, treating as not_connected:', error.message)
      row = null
    } else {
      row = data
    }
  } catch (e) {
    console.warn('[whatsapp/connection-read] read threw, treating as not_connected:', (e as Error).message)
    row = null
  }

  // 🔴 THE REDUCTION. The ciphertext is consumed on this line and never referenced again.
  const tokenExpiresAt = (row?.token_expires_at as string | null) ?? null
  // 🟢 THE REAL COLUMN, NOT A PROXY. This read `updated_at` until 4 September 2026; see the migration
  // 20260904_whatsapp_connections_token_issued_at.sql for why that stand-in had to go.
  const tokenIssuedAt = (row?.token_issued_at as string | null) ?? null
  const input: WhatsAppConnectionInput = {
    wabaId: (row?.waba_id as string | null) ?? null,
    phoneNumberId: (row?.phone_number_id as string | null) ?? null,
    tokenPresent: !!row?.access_token_ciphertext,
    tokenRevokedAt: (row?.token_revoked_at as string | null) ?? null,
    tokenExpiresAt,
    tokenIssuedAt,
    paymentMethodPresent: (row?.payment_method_present as boolean | null) ?? null,
  }

  const state = deriveWhatsAppConnectionState(input, now)
  return {
    state,
    offerSignup: shouldOfferSignup(state),
    offerReauthorise: shouldOfferReauthorise(state),
    expiringSoon: state === 'ready' && isTokenExpiringSoon(tokenExpiresAt, tokenIssuedAt, now),
    // ⚠️ `?? null` ON BOTH, so a row written before these columns existed reads as "nothing to show"
    // rather than `undefined` reaching the view model.
    displayPhoneNumber: (row?.display_phone_number as string | null) ?? null,
    verifiedName: (row?.verified_name as string | null) ?? null,
    // Reuses `input.paymentMethodPresent`, already narrowed above — not a second read of the row.
    paymentMethodPresent: input.paymentMethodPresent,
    paymentBlockedAt: (row?.payment_blocked_at as string | null) ?? null,
  }
}
