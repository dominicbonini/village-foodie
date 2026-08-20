// lib/meta-whatsapp.ts
// The Meta Graph API wrapper. Sending was here first; template management was added beside it on
// 20 August 2026 for the Tech Provider app-review demonstration.
//
// ── 🔴 ONE MODULE, ONE BASE URL, ONE VERSION ────────────────────────────────────────────────────────
// The version used to be a literal inside the send URL. A second literal in a second function is how
// two calls end up on two Graph versions and only one of them breaks when Meta retires a release —
// which presents as "sending works, templates 400" and costs an afternoon. The two constants below are
// the ONLY place a version or a host appears.
// ⚠️ THE SEND URL IS BYTE-IDENTICAL TO WHAT IT WAS. `${GRAPH_BASE_URL}/${phoneNumberId}/messages`
// expands to `https://graph.facebook.com/v19.0/<id>/messages`, exactly the previous literal.
//
// ── ⚠️ v19.0 IS NOT VERIFIED AS CURRENT, AND NOTHING HERE CAN VERIFY IT ─────────────────────────────
// It is the version this codebase has always sent on. Whether Meta still supports it, and what the
// current release is, CANNOT BE DETERMINED FROM THIS REPOSITORY — it is a question for Meta's Graph API
// changelog. It was deliberately NOT bumped to a guessed number: a wrong version that looks deliberate
// is worse than an old one that is honestly labelled. If it must change, change it HERE and both the
// send path and the template calls move together.
export const GRAPH_API_VERSION = 'v19.0'
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// ⚠️ UNCHANGED. Same signature, same body, same throw-on-failure contract, same env read. The only edit
// is that the URL is composed from the constants above instead of carrying its own literal.
export async function sendMetaWhatsApp(
  to: string,
  message: string,
  phoneNumberId: string
): Promise<void> {
  const toDigits = to.replace(/^\+/, '')

  const res = await fetch(`${GRAPH_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body: message },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Meta WhatsApp error ${res.status}: ${err}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES — PLATFORM CREDENTIAL, PLATFORM WABA, ADMIN ONLY
// ════════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 THESE FUNCTIONS ARE NOT PART OF ANY TRUCK'S PATH AND MUST NOT BECOME SO. They read the PLATFORM
// token and the PLATFORM WABA id from the environment, with no truck parameter and no lookup. Per-truck
// token handling is an open design decision (docs/whatsapp-per-truck-architecture.md §2.b); when it is
// made, these gain an explicit credential argument the way the send path is designed to.
//
// 🔴 THEY NEVER THROW. Every failure — a missing env var, a rejected token, Meta's own complaint about a
// template name — is a RETURN VALUE carrying Meta's own words. The reason is specific: this tool exists
// to be operated on camera for an app review, and an exception surfacing as a blank screen or a generic
// "something went wrong" during a recording is the worst outcome available. The caller is expected to
// put the message on the page.
//
// ⚠️ NOTHING BELOW HAS EVER BEEN RUN AGAINST META. There is no fixture, no captured response, and no
// sandbox WABA in this project. The field names and payload shape are written from Meta's documented
// Cloud API and are UNPROVEN. A first real run may fail on a shape difference this cannot anticipate.

/** Meta's three template categories. A fourth would be Meta's to add, not ours to invent. */
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

/** One row of the list, reduced to the four fields the review demonstration needs. */
export interface MessageTemplateSummary {
  id: string | null
  name: string
  status: string | null
  category: string | null
  language: string | null
}

/**
 * Why a template call failed. A CLOSED union, because these strings are put on a screen and read aloud
 * during a recording — they must be stable and specific, never "an error occurred".
 *
 * ⚠️ `missing_env` NAMES WHICH VARIABLES, because "not configured" sends someone hunting through five.
 * ⚠️ `meta_error` CARRIES META'S OWN `message` VERBATIM plus the raw body, because Meta's template
 * complaints are precise ("template name is invalid", "a template with this name already exists") and
 * paraphrasing them would destroy the only useful diagnostic.
 */
export type TemplateFailure =
  | { kind: 'missing_env'; missing: string[]; message: string }
  | { kind: 'invalid_input'; field: string; message: string }
  | {
      kind: 'meta_error'
      httpStatus: number
      metaCode: number | null
      metaSubcode: number | null
      metaType: string | null
      message: string
      /** The response body verbatim, truncated. The thing to screenshot when a review run fails. */
      raw: string
    }
  | { kind: 'network'; message: string }

export type TemplateListResult =
  | { ok: true; templates: MessageTemplateSummary[]; raw: string }
  | { ok: false; error: TemplateFailure }

export type TemplateCreateResult =
  | { ok: true; id: string | null; status: string | null; category: string | null; raw: string }
  | { ok: false; error: TemplateFailure }

/** What the environment provides, as BOOLEANS. 🔴 NEVER THE VALUES — this crosses to an admin page. */
export interface MetaTemplateConfigStatus {
  wabaIdPresent: boolean
  accessTokenPresent: boolean
  graphApiVersion: string
  graphBaseUrl: string
  /** Empty when both are present. The exact variable names to set, in the order to set them. */
  missing: string[]
}

const ENV_WABA = 'META_WHATSAPP_BUSINESS_ACCOUNT_ID'
const ENV_TOKEN = 'META_WHATSAPP_ACCESS_TOKEN'

/**
 * 🔴 THE PREFLIGHT. Run it BEFORE a recording, not during one.
 *
 * ⚠️ IT REPORTS PRESENCE, NOT VALIDITY. A token that is present but revoked passes this and fails at
 * Meta — that is `meta_error`, and the distinction is deliberate: this answers "is the deployment
 * configured", which is the question that has a local answer.
 * ⚠️ A whitespace-only value counts as ABSENT. A variable declared with an empty value in a hosting
 * dashboard is the exact shape of "declared but not set", and treating it as present would produce a
 * `Bearer ` header and an opaque 401.
 */
export function metaTemplateConfigStatus(): MetaTemplateConfigStatus {
  const waba = (process.env[ENV_WABA] ?? '').trim()
  const token = (process.env[ENV_TOKEN] ?? '').trim()
  const missing: string[] = []
  if (!waba) missing.push(ENV_WABA)
  if (!token) missing.push(ENV_TOKEN)
  return {
    wabaIdPresent: !!waba,
    accessTokenPresent: !!token,
    graphApiVersion: GRAPH_API_VERSION,
    graphBaseUrl: GRAPH_BASE_URL,
    missing,
  }
}

/** Both credentials, or the failure naming what is absent. Shared by both calls so they cannot disagree. */
function requireConfig(): { ok: true; wabaId: string; token: string } | { ok: false; error: TemplateFailure } {
  const status = metaTemplateConfigStatus()
  if (status.missing.length) {
    return {
      ok: false,
      error: {
        kind: 'missing_env',
        missing: status.missing,
        message:
          `Not configured: ${status.missing.join(' and ')} ` +
          `${status.missing.length === 1 ? 'is' : 'are'} missing from this environment. ` +
          `Set ${status.missing.length === 1 ? 'it' : 'them'} and redeploy.`,
      },
    }
  }
  return { ok: true, wabaId: (process.env[ENV_WABA] as string).trim(), token: (process.env[ENV_TOKEN] as string).trim() }
}

/** Meta's error envelope, reduced to a failure. Tolerant: a non-JSON body still yields a useful message. */
function metaFailure(httpStatus: number, bodyText: string): TemplateFailure {
  const raw = bodyText.length > 4000 ? `${bodyText.slice(0, 4000)}…[truncated]` : bodyText
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: unknown; code?: unknown; error_subcode?: unknown; type?: unknown }
    }
    const e = parsed?.error
    if (e && typeof e.message === 'string') {
      return {
        kind: 'meta_error',
        httpStatus,
        metaCode: typeof e.code === 'number' ? e.code : null,
        metaSubcode: typeof e.error_subcode === 'number' ? e.error_subcode : null,
        metaType: typeof e.type === 'string' ? e.type : null,
        message: e.message,
        raw,
      }
    }
  } catch {
    // Not JSON. Fall through — the raw body is still the best thing to show.
  }
  return {
    kind: 'meta_error',
    httpStatus,
    metaCode: null,
    metaSubcode: null,
    metaType: null,
    message: `Meta returned HTTP ${httpStatus} with a body this code could not parse. See the raw response.`,
    raw,
  }
}

/**
 * LIST the platform WABA's message templates.
 *
 * ⚠️ `limit` is capped locally at 100. Meta paginates and this tool deliberately does NOT follow
 * `paging.next`: it exists to show that listing works, not to be a template manager.
 */
export async function listMessageTemplates(limit = 50): Promise<TemplateListResult> {
  const cfg = requireConfig()
  if (!cfg.ok) {
    console.error(`[meta-templates] LIST refused — ${cfg.error.kind}: ${describeFailure(cfg.error)}`)
    return { ok: false, error: cfg.error }
  }
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 50))
  const url = `${GRAPH_BASE_URL}/${cfg.wabaId}/message_templates?fields=id,name,status,category,language&limit=${safeLimit}`
  // 🔴 THE URL IS LOGGED, THE TOKEN IS NOT. The WABA id is an identifier, not a credential; the bearer
  // never reaches a log line here or anywhere below.
  console.log(`[meta-templates] LIST GET ${url}`)
  let res: Response
  let bodyText: string
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
    bodyText = await res.text()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[meta-templates] LIST network failure: ${message}`)
    return { ok: false, error: { kind: 'network', message: `Could not reach Meta: ${message}` } }
  }
  if (!res.ok) {
    const error = metaFailure(res.status, bodyText)
    console.error(`[meta-templates] LIST FAILED http=${res.status} — ${describeFailure(error)}`)
    return { ok: false, error }
  }
  let templates: MessageTemplateSummary[] = []
  try {
    const parsed = JSON.parse(bodyText) as { data?: unknown }
    const rows = Array.isArray(parsed?.data) ? parsed.data : []
    templates = rows.map((r): MessageTemplateSummary => {
      const row = r as Record<string, unknown>
      return {
        id: typeof row.id === 'string' ? row.id : null,
        name: typeof row.name === 'string' ? row.name : '(unnamed)',
        status: typeof row.status === 'string' ? row.status : null,
        category: typeof row.category === 'string' ? row.category : null,
        language: typeof row.language === 'string' ? row.language : null,
      }
    })
  } catch {
    // 🔴 A 200 WE CANNOT PARSE IS A FAILURE, NOT AN EMPTY LIST. Rendering "no templates" for a response
    // whose shape we did not understand is exactly the silent failure this tool must not have.
    console.error('[meta-templates] LIST returned 200 with an unparseable body')
    return {
      ok: false,
      error: metaFailure(res.status, bodyText),
    }
  }
  console.log(`[meta-templates] LIST ok count=${templates.length}`)
  return { ok: true, templates, raw: bodyText.length > 4000 ? `${bodyText.slice(0, 4000)}…[truncated]` : bodyText }
}

export interface CreateTemplateInput {
  /** Meta's rule: lowercase letters, digits and underscores only. Validated locally — see below. */
  name: string
  /** A Meta language code, e.g. `en_GB`, `en_US`. Not validated here; Meta is the authority on the list. */
  language: string
  category: TemplateCategory
  /** The BODY text. `{{1}}`, `{{2}}` … are positional variables. */
  bodyText: string
  /** One sample value per variable, in order. Required if and only if the body contains variables. */
  bodyExamples?: string[]
}

/** Meta's documented name rule. Checked locally because it is the most common first-attempt rejection,
 *  and a local answer arrives instantly instead of as a round trip during a recording. */
const TEMPLATE_NAME_RULE = /^[a-z0-9_]{1,512}$/

/** How many positional variables the body declares. `{{1}}` twice counts once — Meta numbers them. */
function countBodyVariables(bodyText: string): number {
  const found = new Set<string>()
  for (const m of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(m[1])
  return found.size
}

/**
 * CREATE a message template on the platform WABA.
 *
 * ⚠️ MINIMAL BY DESIGN: one BODY component. No header, no footer, no buttons. Meta's review asks to see
 * a template created by our app; it does not ask for a template builder, and every extra component is
 * another shape that can be wrong on camera.
 *
 * 🔴 LOCAL VALIDATION RUNS FIRST AND IS DELIBERATELY NARROW. Only two things are checked here — the name
 * rule and the variable/example count — because both are certain, both are the usual first failure, and
 * both have an instant answer. Everything else is Meta's to judge, and Meta's refusal is passed through
 * verbatim rather than pre-empted by a guess about its rules.
 */
export async function createMessageTemplate(input: CreateTemplateInput): Promise<TemplateCreateResult> {
  const name = input.name.trim()
  const language = input.language.trim()
  const bodyText = input.bodyText

  if (!TEMPLATE_NAME_RULE.test(name)) {
    const error: TemplateFailure = {
      kind: 'invalid_input',
      field: 'name',
      message:
        `Template name "${name}" is not valid. Meta allows lowercase letters, digits and underscores ` +
        `only — no spaces, no capitals, no hyphens. Try "${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'order_ready'}".`,
    }
    console.error(`[meta-templates] CREATE refused locally — ${error.message}`)
    return { ok: false, error }
  }
  if (!language) {
    const error: TemplateFailure = { kind: 'invalid_input', field: 'language', message: 'A language code is required, e.g. en_GB.' }
    console.error(`[meta-templates] CREATE refused locally — ${error.message}`)
    return { ok: false, error }
  }
  if (!bodyText.trim()) {
    const error: TemplateFailure = { kind: 'invalid_input', field: 'bodyText', message: 'The body text is empty.' }
    console.error(`[meta-templates] CREATE refused locally — ${error.message}`)
    return { ok: false, error }
  }

  const variableCount = countBodyVariables(bodyText)
  const examples = (input.bodyExamples ?? []).map(e => e.trim()).filter(Boolean)
  if (variableCount !== examples.length) {
    const error: TemplateFailure = {
      kind: 'invalid_input',
      field: 'bodyExamples',
      message:
        `The body declares ${variableCount} variable${variableCount === 1 ? '' : 's'} but ` +
        `${examples.length} example${examples.length === 1 ? ' was' : 's were'} given. Meta requires one ` +
        `sample value per variable, in order.`,
    }
    console.error(`[meta-templates] CREATE refused locally — ${error.message}`)
    return { ok: false, error }
  }

  const cfg = requireConfig()
  if (!cfg.ok) {
    console.error(`[meta-templates] CREATE refused — ${cfg.error.kind}: ${describeFailure(cfg.error)}`)
    return { ok: false, error: cfg.error }
  }

  // ⚠️ `example.body_text` IS A LIST OF LISTS. Meta's shape is one inner array per example set; one set
  // is enough. Omitted entirely when the body has no variables — sending an empty example object for a
  // variable-free template is a documented rejection.
  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: bodyText }
  if (variableCount > 0) bodyComponent.example = { body_text: [examples] }

  const payload = { name, language, category: input.category, components: [bodyComponent] }
  const url = `${GRAPH_BASE_URL}/${cfg.wabaId}/message_templates`
  // 🔴 THE WHOLE REQUEST BODY IS LOGGED. It contains no credential — a template body is copy — and after
  // a failed review attempt the only useful question is "what exactly did we send", which nothing else
  // can answer once the page has been closed.
  console.log(`[meta-templates] CREATE POST ${url} payload=${JSON.stringify(payload)}`)

  let res: Response
  let bodyTextOut: string
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    bodyTextOut = await res.text()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[meta-templates] CREATE network failure: ${message}`)
    return { ok: false, error: { kind: 'network', message: `Could not reach Meta: ${message}` } }
  }

  console.log(`[meta-templates] CREATE response http=${res.status} body=${bodyTextOut}`)

  if (!res.ok) {
    const error = metaFailure(res.status, bodyTextOut)
    console.error(`[meta-templates] CREATE FAILED name=${name} http=${res.status} — ${describeFailure(error)}`)
    return { ok: false, error }
  }

  let id: string | null = null
  let status: string | null = null
  let category: string | null = null
  try {
    const parsed = JSON.parse(bodyTextOut) as Record<string, unknown>
    id = typeof parsed.id === 'string' ? parsed.id : null
    status = typeof parsed.status === 'string' ? parsed.status : null
    category = typeof parsed.category === 'string' ? parsed.category : null
  } catch {
    // A 2xx whose body we cannot read still means Meta accepted it. Report success with nulls rather
    // than inventing a failure — the raw body travels back and the list call is the confirmation.
    console.error('[meta-templates] CREATE returned 2xx with an unparseable body — reporting success with no id')
  }
  console.log(`[meta-templates] CREATE ok name=${name} id=${id ?? 'unknown'} status=${status ?? 'unknown'}`)
  return {
    ok: true,
    id,
    status,
    category,
    raw: bodyTextOut.length > 4000 ? `${bodyTextOut.slice(0, 4000)}…[truncated]` : bodyTextOut,
  }
}

/** One human sentence for any failure — the string a page puts in front of an admin, and the string a
 *  log line carries. Exported so the route and the page cannot word the same failure two ways. */
export function describeFailure(error: TemplateFailure): string {
  switch (error.kind) {
    case 'missing_env':
      return error.message
    case 'invalid_input':
      return error.message
    case 'network':
      return error.message
    case 'meta_error': {
      const bits = [
        `Meta refused this (HTTP ${error.httpStatus})`,
        error.metaCode !== null ? `code ${error.metaCode}` : null,
        error.metaSubcode !== null ? `subcode ${error.metaSubcode}` : null,
        error.metaType,
      ].filter(Boolean)
      return `${bits.join(' · ')}: ${error.message}`
    }
  }
}
