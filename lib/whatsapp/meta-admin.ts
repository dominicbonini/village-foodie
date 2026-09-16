// lib/whatsapp/meta-admin.ts
// The three Meta calls the background jobs and the admin tools make ABOUT a connection, rather than
// through it: refresh its token, inspect its token, and ask whether the account can pay.
//
// ── 🔴 EVERY FUNCTION HERE IS INJECTABLE AND NONE OF THEM THROWS ────────────────────────────────────
// They run inside a cron route and an admin handler, where a rejected promise is a 500 for work that
// was meant to be best-effort. Each returns a discriminated result and the caller decides. `fetchImpl`
// is a parameter so every failure path can be driven in a harness without a network.
//
// ── 🔴 TWO OF THESE PUT A TOKEN IN THE QUERY STRING, BECAUSE META'S API REQUIRES IT ─────────────────
// `fb_exchange_token` and `input_token` are query parameters; there is no header form. So THE URL IS
// SECRET MATERIAL and must never be logged, returned, put in an error message, or attached to a
// thrown Error. Nothing in this file logs at all — not one `console.*` call — precisely so there is no
// line to review later and no chance of a well-meaning "log the URL for debugging" edit slipping in.
// A caller that wants to record a failure gets a CODE, never a URL and never a token.
//
// ⚠️ `set_token_expires_in_60_days=true` IS SENT BUT NOT TRUSTED. `token_expires_at` is computed from
// the `expires_in` Meta actually returns; see the settings-row work for why a fabricated 60 days was
// removed once already.

import { GRAPH_VERSION } from '@/lib/whatsapp/graph-version'

export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

/** Meta's error envelope, reduced to the two numbers worth recording. Never carries a message. */
export interface MetaErrorCode { code: number | null; subcode: number | null }

/**
 * PURE. Pull `code`/`error_subcode` out of whatever Meta returned.
 * 🔴 NEVER THROWS AND NEVER RETURNS A MESSAGE. Meta's `message` field routinely echoes the request —
 * including, on these endpoints, the token that was in the query string. Codes only, by construction.
 */
export function parseMetaError(payload: unknown): MetaErrorCode {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return { code: null, subcode: null }
  const e = (payload as Record<string, unknown>).error
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return { code: null, subcode: null }
  const o = e as Record<string, unknown>
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return { code: num(o.code), subcode: num(o.error_subcode) }
}

// ── 2a. REFRESH ─────────────────────────────────────────────────────────────────────────────────────

export type RefreshResult =
  | { ok: true; accessToken: string; expiresIn: number | null }
  | { ok: false; code: number | null; subcode: number | null; reason: 'network' | 'http' | 'no_token' }

/** PURE. A successful exchange body → the new token and its lifetime. */
export function parseRefresh(payload: unknown): { accessToken: string | null; expiresIn: number | null } {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return { accessToken: null, expiresIn: null }
  const o = payload as Record<string, unknown>
  const tok = typeof o.access_token === 'string' && o.access_token.trim() ? o.access_token : null
  // ⚠️ Meta omits `expires_in` for a never-expiring token. Null means "it did not say", not "zero".
  const exp = typeof o.expires_in === 'number' && Number.isFinite(o.expires_in) ? o.expires_in : null
  return { accessToken: tok, expiresIn: exp }
}

export async function refreshBusinessToken(input: {
  appId: string
  appSecret: string
  currentToken: string
  fetchImpl?: typeof fetch
}): Promise<RefreshResult> {
  const f = input.fetchImpl ?? fetch
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', input.appId)
  url.searchParams.set('client_secret', input.appSecret)
  url.searchParams.set('set_token_expires_in_60_days', 'true')
  url.searchParams.set('fb_exchange_token', input.currentToken)

  let res: Response
  try {
    res = await f(url.toString(), { method: 'GET' })
  } catch {
    return { ok: false, code: null, subcode: null, reason: 'network' }
  }
  let body: unknown = null
  try { body = await res.json() } catch { body = null }
  if (!res.ok) {
    const e = parseMetaError(body)
    return { ok: false, code: e.code, subcode: e.subcode, reason: 'http' }
  }
  const parsed = parseRefresh(body)
  if (!parsed.accessToken) {
    // A 200 with no token is a failure, not a success with an empty string.
    return { ok: false, code: null, subcode: null, reason: 'no_token' }
  }
  return { ok: true, accessToken: parsed.accessToken, expiresIn: parsed.expiresIn }
}

// ── 2b. INSPECT ─────────────────────────────────────────────────────────────────────────────────────

export interface TokenInspection {
  isValid: boolean
  /** Unix seconds. 🔴 ZERO MEANS NEVER EXPIRES — it is not "expired in 1970". Null when absent. */
  expiresAt: number | null
  /** Permission NAMES only. Never the token, never the app or user ids the envelope also carries. */
  scopes: string[]
}

export type InspectResult =
  | { ok: true; inspection: TokenInspection }
  | { ok: false; code: number | null; subcode: number | null; reason: 'network' | 'http' | 'malformed' }

/** PURE. `{ data: { is_valid, expires_at, scopes } }` → the three fields, defensively. */
export function parseInspection(payload: unknown): TokenInspection | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const d = (payload as Record<string, unknown>).data
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return null
  const o = d as Record<string, unknown>
  const scopes = Array.isArray(o.scopes) ? o.scopes.filter((x): x is string => typeof x === 'string') : []
  return {
    isValid: o.is_valid === true,
    expiresAt: typeof o.expires_at === 'number' && Number.isFinite(o.expires_at) ? o.expires_at : null,
    scopes,
  }
}

/** True when Meta's `expires_at` says this token never expires. 🔴 Zero is the sentinel, not a date. */
export const inspectionNeverExpires = (i: TokenInspection): boolean => i.expiresAt === 0

export async function inspectBusinessToken(input: {
  appId: string
  appSecret: string
  token: string
  fetchImpl?: typeof fetch
}): Promise<InspectResult> {
  const f = input.fetchImpl ?? fetch
  const url = new URL(`${GRAPH_BASE}/debug_token`)
  url.searchParams.set('input_token', input.token)

  let res: Response
  try {
    // 🔴 THE APP ACCESS TOKEN, NOT THE BUSINESS TOKEN. A system-user token cannot inspect itself —
    // Meta answers with an error rather than the truth, which would read as "invalid" and could get a
    // healthy connection marked revoked by the daily job.
    res = await f(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.appId}|${input.appSecret}` },
    })
  } catch {
    return { ok: false, code: null, subcode: null, reason: 'network' }
  }
  let body: unknown = null
  try { body = await res.json() } catch { body = null }
  if (!res.ok) {
    const e = parseMetaError(body)
    return { ok: false, code: e.code, subcode: e.subcode, reason: 'http' }
  }
  const inspection = parseInspection(body)
  // 🔴 A 200 WE CANNOT READ IS NOT "INVALID". Returning `isValid: false` here would let a shape change
  // at Meta revoke every connection we have.
  if (!inspection) return { ok: false, code: null, subcode: null, reason: 'malformed' }
  return { ok: true, inspection }
}

// ── 2c. PAYMENT STATUS ──────────────────────────────────────────────────────────────────────────────

export type PaymentProbe =
  | { status: 'added' }
  | { status: 'missing' }
  | { status: 'error'; code: number | null; subcode: number | null; reason: 'network' | 'http' }

/**
 * PURE. 🔴 THE FUNDING ID IS NEVER RETURNED — only whether one is there. It is an identifier for the
 * operator's payment instrument and this codebase has no reason to hold it, so the boundary where it
 * could leak is this one line.
 */
export function parsePaymentStatus(payload: unknown): 'added' | 'missing' {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return 'missing'
  const v = (payload as Record<string, unknown>).primary_funding_id
  return typeof v === 'string' && v.trim() !== '' ? 'added' : 'missing'
}

export async function readPaymentStatus(input: {
  wabaId: string
  businessToken: string
  fetchImpl?: typeof fetch
}): Promise<PaymentProbe> {
  const f = input.fetchImpl ?? fetch
  // ⚠️ THE TOKEN GOES IN THE HEADER HERE, not the query string — this endpoint allows it, so it is used.
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.wabaId)}?fields=primary_funding_id`
  let res: Response
  try {
    res = await f(url, { method: 'GET', headers: { Authorization: `Bearer ${input.businessToken}` } })
  } catch {
    return { status: 'error', code: null, subcode: null, reason: 'network' }
  }
  let body: unknown = null
  try { body = await res.json() } catch { body = null }
  if (!res.ok) {
    const e = parseMetaError(body)
    // 🔴 AN ERROR IS NOT "missing". Writing `payment_method_present = false` because a call failed would
    // put a claim about the operator's account in the database on the strength of a network blip.
    return { status: 'error', code: e.code, subcode: e.subcode, reason: 'http' }
  }
  return { status: parsePaymentStatus(body) }
}
