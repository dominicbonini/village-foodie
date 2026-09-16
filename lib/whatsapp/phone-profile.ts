// lib/whatsapp/phone-profile.ts
// The display number and business name Meta holds for a connected WhatsApp phone number.
//
// 🔴 WHY THIS IS FETCHED AT ALL. Before it, the Settings row asked the OPERATOR to type their number
// into a free-text box (`trucks.whatsapp_sender`) — a number that had no connection to the one Meta had
// actually linked. Two sources for one fact, one of them a guess. Meta knows the answer; this asks it.
//
// 🔴 IT MAY NEVER FAIL ONBOARDING. By the time this runs the token is stored, the number is registered
// and the app is subscribed — the truck IS connected. A cosmetic lookup that rolled any of that back, or
// returned an error the operator saw, would turn a success into a support call. Every failure path here
// returns nulls and a status code, and the caller carries on.

/** What Meta returns for a phone number node, reduced to the two fields the Settings row shows. */
export interface PhoneProfile {
  displayPhoneNumber: string | null
  verifiedName: string | null
}

export const EMPTY_PHONE_PROFILE: PhoneProfile = { displayPhoneNumber: null, verifiedName: null }

/**
 * PURE. Reduce a Graph response body to the two fields.
 *
 * 🔴 IT NEVER THROWS, FOR ANY INPUT. This parses a third-party response that arrives as `unknown`: a
 * non-object, a null, an array, an error envelope, or JSON that failed to parse and came through as a
 * string. Throwing here would propagate into the onboarding route and undo the rule above, so every
 * shape that is not "an object with a usable string" resolves to null.
 * ⚠️ EMPTY STRINGS BECOME NULL. Meta returns `verified_name: ""` for a number whose name has not been
 * approved yet, and an empty string rendered into "Business name" is a blank row that looks like a bug.
 */
export function parsePhoneNumberProfile(payload: unknown): PhoneProfile {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return EMPTY_PHONE_PROFILE
  const o = payload as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    displayPhoneNumber: str(o.display_phone_number),
    verifiedName: str(o.verified_name),
  }
}

/** What the caller learns. `status` is the HTTP status when there was one, else null. */
export interface PhoneProfileResult {
  profile: PhoneProfile
  /** Null when the lookup succeeded. A short machine-readable reason otherwise. */
  failure: 'network' | 'http' | null
  status: number | null
}

/**
 * Fetch the profile. NEVER THROWS and never rejects.
 *
 * ⚠️ `fetchImpl` IS INJECTED so the failure paths can be driven in a harness without a network. That is
 * not decoration: "a failed lookup still leaves onboarding successful" is the property that matters most
 * here and it is unprovable against a real `fetch`.
 * 🔴 NOTHING SENSITIVE IS RETURNED OR LOGGED BY THIS FUNCTION. It hands back a status code and nothing
 * else; the token is used and discarded, and the number and name go to the database, never to a log.
 */
export async function fetchPhoneNumberProfile(input: {
  graphBase: string
  phoneNumberId: string
  accessToken: string
  fetchImpl?: typeof fetch
}): Promise<PhoneProfileResult> {
  const f = input.fetchImpl ?? fetch
  const url = `${input.graphBase}/${encodeURIComponent(input.phoneNumberId)}?fields=display_phone_number,verified_name`
  let res: Response
  try {
    res = await f(url, { method: 'GET', headers: { Authorization: `Bearer ${input.accessToken}` } })
  } catch {
    return { profile: EMPTY_PHONE_PROFILE, failure: 'network', status: null }
  }
  if (!res.ok) return { profile: EMPTY_PHONE_PROFILE, failure: 'http', status: res.status }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    // A 2xx whose body is not JSON is an `http` failure as far as we are concerned: we got a reply and
    // could not use it. The status is carried so the log says which.
    return { profile: EMPTY_PHONE_PROFILE, failure: 'http', status: res.status }
  }
  return { profile: parsePhoneNumberProfile(body), failure: null, status: res.status }
}
