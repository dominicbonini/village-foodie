// lib/native/staffFetch.ts — 🔴 EVERY STAFF WRITE CARRIES THE CALLER'S SIGN-IN, READ AT SEND TIME
// (dashboard-auth-2, 18 November 2026; docs/dashboard-auth-1-report.md is the review, docs/dashboard-auth-2-report.md
// the build).
//
// The dashboard's routes authorise on the dashboard token and — for the audit log, and later for the member rule —
// read WHO is calling from the session. On the WEB that session is the Supabase cookie, which a same-origin `fetch`
// sends by itself. In the APP (Capacitor WebView) the session lives in app storage, not in cookies, so it reaches the
// server only where code adds `nativeAuthHeader()` — and most writes did not, so every app write arrived token-only.
// This adds it, once, for every staff call that goes through here (and lib/native/orderGate.ts's `post`, so the
// offline queue's live sends and REPLAYS carry the session current at SEND time, not the one from when they queued).
//
// 🔴 NEVER A NEW WAY TO FAIL. No session → the call goes exactly as it did (token only). A slow or failing session
// read (auth-js refreshing an expired token on a bad network can retry for up to ~30 s) is capped at
// AUTH_HEADER_BUDGET_MS and then the call goes without the header — a write at the hatch must never wait on it.
//
// THE KITCHEN-SCREEN MARKER. A KDS opened from its own link (/kds/<kds_token>) marks its calls `X-HG-Client: kds-link`
// so the server's shadow log (lib/auth/require-member.ts) can count kitchen screens that run with nobody signed in.
// It is a label for the log, not a credential: the server never grants anything because of it.
import { nativeAuthHeader } from '@/lib/native/session'

/** How long a send may wait for the session before it goes without it. */
export const AUTH_HEADER_BUDGET_MS = 1500
export const CLIENT_MARKER_HEADER = 'X-HG-Client'

let clientMarker: 'kds-link' | null = null
/** The KDS page calls this with 'kds-link' when it was opened from /kds/<kds_token>, null otherwise. */
export function setStaffClientMarker(marker: 'kds-link' | null): void { clientMarker = marker }

/** The headers to add to a staff call right now: the app's Bearer (if signed in) and the kitchen-screen marker.
 *  Never throws; never waits longer than AUTH_HEADER_BUDGET_MS. On the web the auth part is empty (the cookie goes
 *  by itself). */
export async function staffAuthHeaders(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const auth = await Promise.race([
      nativeAuthHeader(),
      new Promise<Record<string, string>>(resolve => setTimeout(() => resolve({}), AUTH_HEADER_BUDGET_MS)),
    ])
    Object.assign(out, auth)
  } catch {
    // A storage or auth fault is not a reason to fail a write — send as today.
  }
  if (clientMarker) out[CLIENT_MARKER_HEADER] = clientMarker
  return out
}

/** `fetch` for staff calls: the same arguments and result, plus `staffAuthHeaders()` (never overriding a header the
 *  caller set). */
export async function staffFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const extra = await staffAuthHeaders()
  const headers = new Headers(init.headers)
  for (const [k, v] of Object.entries(extra)) if (!headers.has(k)) headers.set(k, v)
  return fetch(input, { ...init, headers })
}
