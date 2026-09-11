// lib/outreach-template-render.ts
//
// 🔴 THE SUBSTITUTION MECHANISM — AND NOTHING ELSE. There is no message copy in this file and none
// anywhere else in the repository: templates live in `outreach_templates` and are edited on the
// Templates tab. This module was `lib/outreach-templates.ts`; the rendering half was moved here
// VERBATIM and the hardcoded `TEMPLATES` array was deleted with the old file.
//
// 🔴 THE GUARDS THAT LIVE HERE, IN CODE, PRECISELY SO A TEMPLATE CANNOT SWITCH THEM OFF: the WhatsApp
// gate is `templatesFor`; unresolved placeholders are produced by `substitute` itself. A row in a table
// cannot reach either of them.
//
// 🔴 ONE GUARD HAS LEFT THIS FILE, AND IT WAS THE COMPLIANCE ONE. `OPT_OUT_FOOTER` was a mandatory
// opt-out line appended by `composeEmail` to every email, unreachable from any template body — written
// that way on purpose, because text inside an editable box is text that eventually gets trimmed.
// It has been REMOVED at the operator's instruction: the sign-off, the contact details and the opt-out
// line now live in the Outlook signature, which Outlook appends to every new message. That keeps the
// opt-out LAST, which appending it here could not do once Outlook was also appending a signature.
// ⚠️ WHAT THIS COSTS, STATED PLAINLY AND NOT SOFTENED: nothing in this codebase now guarantees that an
// outgoing email carries an opt-out line. A template can be written, edited or rendered without one and
// no code path will notice. The contact row logged for a send no longer contains one either, so the
// stored history is no longer evidence that one was sent. The protection is entirely the operator's
// Outlook configuration, and it is a legal line under PECR, not a nicety. See
// docs/outreach-signature-removal-report.md.
//
// ── THE THREE TIERS, AND WHY THEY MUST BEHAVE DIFFERENTLY ────────────────────────────────────────────
//
//   1. RESOLVED   `{{token}}`      — comes from the loaded row. Filled silently.
//        ⚠️ A resolved token may declare a FALLBACK (`{{token|fallback}}`), and `contact_name_prefixed`
//        carries its own leading space so an absent name yields a bare "Hi,". 🧪
//        `contact_name` is populated on 3 of 231 prospects, so "fill silently" with the empty string
//        would render "Hi ," on 228 rows. The fallback keeps the sentence grammatical while staying
//        silent — which is what the tier asks for.
//
//   2. CONDITIONAL `?cond: line`   — a WHOLE LINE that is DROPPED when its condition is unmet.
//        🔴 THIS IS THE POINT OF THE TIER. "your pitch at " with nothing after it is worse than a
//        template that never had the line. The marker sits at the START OF THE LINE so the unit being
//        dropped is unambiguous — a token in the middle of a sentence could only ever blank itself.
//        🧪 173 of 231 prospects have no upcoming event, so this line is dropped more often than kept.
//
//   3. UNRESOLVED `[[my rate]]`    — NOT IN THE DATABASE. Rendered VERBATIM, double brackets and all,
//        so it survives into the body and is impossible to mistake for prose. Never guessed, never
//        silently dropped. `unresolvedIn()` lists what is still outstanding so the UI can say so.
//
// 🔴 NOTHING HERE SENDS, LOGS OR WRITES ANYTHING. This module is pure string work: it imports no client,
// no fetch and no route. That is a property of the file, provable by grep, not a promise in a comment.

export type TemplateChannel = 'email' | 'whatsapp'

export type MessageTemplate = {
  /** The stable slug the picker and `suggestTemplateId` key on — NOT the row uuid. */
  id: string
  label: string
  channel: TemplateChannel
  /** Email only. WhatsApp templates carry no subject. */
  subject?: string
  body: string
  /** Ordering in the picker and the manage list. */
  sortOrder?: number
  /** Retired templates stay readable so an old contact-log entry is still explicable. */
  active?: boolean
  /** Per-placeholder default values, and when each was last changed. See the Templates tab. */
  defaults?: Record<string, { value: string; updatedAt: string | null }>
}

/** The fields a template can read. Everything is nullable — nothing may assume a value is present. */
export type TemplateContext = {
  truckName: string | null
  contactName: string | null
  website: string | null
  orderUrl: string | null
  nextEventDate: string | null     // YYYY-MM-DD
  nextEventVenue: string | null
}

// ── RENDERING ────────────────────────────────────────────────────────────────────────────────────────

const RESOLVED_RE = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g
const UNRESOLVED_RE = /\[\[([^\]]+)\]\]/g
const COND_LINE_RE = /^\?([a-z_]+):\s?/

/** Long weekday name, e.g. "Friday". Parsed as UTC — a bare YYYY-MM-DD parsed locally can slip a day. */
function dayName(ymd: string): string {
  return new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}
function longDate(ymd: string): string {
  return new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** Which conditions a context satisfies. A condition is met only if every token its line needs is usable. */
function conditionMet(cond: string, ctx: TemplateContext): boolean {
  switch (cond) {
    // 🔴 BOTH halves required. A line reading "your Friday pitch at" with a null venue is the exact
    // failure this tier exists to prevent, so a next event with no venue does NOT satisfy it.
    case 'next_event': return !!(ctx.nextEventDate && (ctx.nextEventVenue ?? '').trim())
    // 🔴 THE NEGATION, AND WHY IT EXISTS. The mechanism drops whole LINES, but the agreed Hatches Up copy
    // needs a CLAUSE dropped with the rest of its sentence left intact and grammatical. That is expressed
    // with TWO mutually exclusive lines — `?next_event:` and `?no_next_event:` — so exactly one renders.
    // ⚠️ THIS DOES NOT CHANGE THE MECHANISM. It adds a condition value to this switch, exactly as
    // `order_url` and `website` already do; the line-dropping rule itself is untouched.
    case 'no_next_event': return !(ctx.nextEventDate && (ctx.nextEventVenue ?? '').trim())
    case 'order_url': return !!(ctx.orderUrl ?? '').trim()
    case 'website': return !!(ctx.website ?? '').trim()
    case 'contact_name': return !!(ctx.contactName ?? '').trim()
    default: return false      // an unknown condition drops its line rather than leaking the marker
  }
}

function resolvedValue(token: string, ctx: TemplateContext): string | null {
  switch (token) {
    case 'truck_name': return (ctx.truckName ?? '').trim() || null
    case 'contact_name': return (ctx.contactName ?? '').trim() || null
    // 🔴 (4a) THE BARE "Hi," CASE. The fallback used to render "Hi there,"; the agreed opening is a bare
    // "Hi,". A plain fallback of '' would leave "Hi ," — a space before the comma — so this token carries
    // its OWN leading space when there is a name and expands to nothing when there is not:
    //   name present → "Hi Madhur,"      name absent → "Hi,"
    // 🧪 contact_name is populated on 3 of 231 rows, so the bare form is the common case, not the edge.
    case 'contact_name_prefixed': {
      const n = (ctx.contactName ?? '').trim()
      return n ? ` ${n}` : ''
    }
    case 'website': return (ctx.website ?? '').trim() || null
    case 'order_url': return (ctx.orderUrl ?? '').trim() || null
    case 'next_event_day': return ctx.nextEventDate ? dayName(ctx.nextEventDate) : null
    case 'next_event_date': return ctx.nextEventDate ? longDate(ctx.nextEventDate) : null
    case 'next_event_venue': return (ctx.nextEventVenue ?? '').trim() || null
    default: return null
  }
}

/** Substitute resolved tokens. Unresolved `[[…]]` are deliberately untouched. */
function substitute(line: string, ctx: TemplateContext): string {
  return line.replace(RESOLVED_RE, (_m, token: string, fallback?: string) => {
    const v = resolvedValue(token, ctx)
    if (v !== null) return v
    // No value: use the declared fallback, or — with none — leave a VISIBLE marker rather than a blank,
    // so a missing field can never masquerade as intentionally empty prose.
    return fallback !== undefined ? fallback : `[[${token}]]`
  })
}

export type RenderedTemplate = {
  subject: string | null
  /** The editable body. Nothing is appended to it any more — the sign-off, the details and the
   *  opt-out line all come from the Outlook signature now. What is here is the whole message. */
  body: string
  /** Distinct `[[…]]` placeholders still outstanding, in first-appearance order. */
  unresolved: string[]
  /** Conditions whose lines were dropped — reported so the UI can explain a shorter message. */
  droppedConditions: string[]
}

export function renderTemplate(tpl: MessageTemplate, ctx: TemplateContext): RenderedTemplate {
  const dropped: string[] = []
  const kept: string[] = []
  for (const line of tpl.body.split('\n')) {
    const m = line.match(COND_LINE_RE)
    if (m) {
      if (!conditionMet(m[1], ctx)) { if (!dropped.includes(m[1])) dropped.push(m[1]); continue }
      kept.push(substitute(line.replace(COND_LINE_RE, ''), ctx))
    } else {
      kept.push(substitute(line, ctx))
    }
  }
  // Collapse a run of blank lines left behind by a dropped paragraph, so removing a line never leaves a
  // visible gap that says "something used to be here".
  const body = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const subject = tpl.subject ? substitute(tpl.subject, ctx) : null
  return { subject, body, unresolved: unresolvedIn(subject ? subject + '\n' + body : body), droppedConditions: dropped }
}

/** The distinct `[[…]]` placeholders in a string, in order of first appearance. */
export function unresolvedIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(UNRESOLVED_RE)) if (!out.includes(m[1].trim())) out.push(m[1].trim())
  return out
}

// 🔴 THERE IS NO `composeEmail` ANY MORE, AND ITS ABSENCE IS THE POINT.
// It existed for one reason — to append the opt-out footer outside the editable body — and it was later
// also appending the signature. Both now come from Outlook. A `composeEmail(body) => body` left in place
// would be a function whose name promises composition and whose body performs none: the next reader
// would assume a guard is running. The callers use the rendered body directly instead.
//
// 🔴 AND THERE IS NO HTML TWIN. `composeEmailHtml` existed to bold the signature name and set the
// opt-out line to 10pt for a paste into Outlook. With neither in the message there is nothing left to
// format, and forcing `font-family: Calibri; font-size: 12pt` onto the body would actively HURT: the
// Outlook signature appended underneath is styled by Outlook, so a hard-styled body would arrive in a
// different font from the signature below it. Plain text lets Outlook style the whole message
// consistently. Copy therefore writes text/plain only — see the report, item (4).

/**
 * Which template FITS this row — a SUGGESTION only. 🔴 The picker must never auto-select it.
 * ⚠️ `hu_ordering` is TRI-STATE: true = on Hatches Up ordering, null = nobody has checked. 🧪 231 rows are
 * 17 true / 214 null and NONE are false, so "not on Hatches Up" here means "not recorded as on it".
 */
export function suggestTemplateId(row: {
  stage: string | null
  hu_ordering: boolean | null
}): string | null {
  if (row.stage === 'contacted') return 'chaser_email'
  if (row.hu_ordering === true) return 'hu_rate_email'
  return 'general_email'
}

/**
 * Templates offerable for a row. 🔴 WhatsApp is gated on explicit `whatsapp_confirmed === true`.
 * ⚠️ THE GATE IS HERE, IN CODE, AND TAKES THE LOADED LIST AS AN ARGUMENT. It used to filter a hardcoded
 * array; it now filters whatever came out of the table. A template row cannot opt out of it — the only
 * thing a row controls is its own `channel`, and a `channel = 'whatsapp'` row is exactly what this
 * refuses to offer unless the prospect is confirmed.
 * Inactive templates are dropped here too, so a retired one never appears in the compose picker while
 * staying readable everywhere else.
 */
export function templatesFor(
  all: MessageTemplate[],
  row: { whatsapp_confirmed: boolean | null },
): MessageTemplate[] {
  return all
    .filter(t => t.active !== false)
    .filter(t => t.channel === 'email' || row.whatsapp_confirmed === true)
}


// ── THE TOKEN REFERENCE — 🔴 DERIVED FROM THE CODE, NOT A HAND-WRITTEN LIST ─────────────────────────
// The editor has to tell the operator which tokens exist. A hand-maintained list goes stale the first
// time a `case` is added to `resolvedValue`, and the staleness is invisible: the reference simply omits
// a token that works.
//
// 🔴 SO THE NAMES ARE READ OUT OF THE FUNCTIONS THEMSELVES. `Function.prototype.toString()` returns the
// source, and the `case 'x':` labels are STRING LITERALS, which minifiers preserve (they rename
// identifiers, not string contents). Adding a token to `resolvedValue` therefore adds it to this
// reference automatically, and it is impossible for the reference to omit a token that works.
// ⚠️ The DESCRIPTIONS are prose and cannot be derived — the code does not contain them. A token with no
// description still appears, marked as undocumented, so the failure is visible rather than silent.
const CASE_RE = /case\s*['"]([a-z_]+)['"]\s*:/g

function caseLabelsOf(fn: Function): string[] {
  const out: string[] = []
  for (const m of fn.toString().matchAll(CASE_RE)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

const TOKEN_DESCRIPTIONS: Record<string, string> = {
  truck_name: "The truck's name, as stored on its discovery row.",
  contact_name: 'The named contact, when one is recorded (3 of 231 rows have one).',
  contact_name_prefixed: 'A leading space plus the contact name, or nothing — write `Hi{{contact_name_prefixed}},` to get "Hi Sam," or a bare "Hi,".',
  website: "The truck's own website URL.",
  order_url: "The truck's existing online-ordering page.",
  next_event_day: 'Weekday of the next event AFTER today, e.g. "Friday".',
  next_event_date: 'Date of the next event after today, e.g. "18 September".',
  next_event_venue: 'Venue of the next event after today.',
}
const CONDITION_DESCRIPTIONS: Record<string, string> = {
  next_event: 'Keeps the line only when the truck has an event AFTER today, with a venue.',
  no_next_event: 'The inverse — keeps the line only when it has no such event. Pair the two to drop a clause and keep the sentence.',
  order_url: 'Keeps the line only when the truck has an ordering URL.',
  website: 'Keeps the line only when the truck has a website.',
  contact_name: 'Keeps the line only when a contact name is recorded.',
}

export type TokenRefEntry = { syntax: string; name: string; description: string; documented: boolean }

/** Every `{{token}}` the substitution understands, read from `resolvedValue`. */
export function resolvedTokenReference(): TokenRefEntry[] {
  return caseLabelsOf(resolvedValue).map(name => ({
    syntax: `{{${name}}}`, name,
    description: TOKEN_DESCRIPTIONS[name] ?? '(no description written yet — it still works)',
    documented: name in TOKEN_DESCRIPTIONS,
  }))
}

/** Every `?condition:` the substitution understands, read from `conditionMet`. */
export function conditionReference(): TokenRefEntry[] {
  return caseLabelsOf(conditionMet).map(name => ({
    syntax: `?${name}: `, name,
    description: CONDITION_DESCRIPTIONS[name] ?? '(no description written yet — it still works)',
    documented: name in CONDITION_DESCRIPTIONS,
  }))
}

// 🔴 A MISTYPED TOKEN MUST NOT REACH AN EMAIL AS PROSE.
// An unknown `{{truk_name}}` is already safe: `substitute` cannot resolve it, so it emits `[[truk_name]]`
// — which the "still to fill" list counts and the pre-send warning names. That is the mechanism's own
// behaviour and is NOT changed here.
// What it cannot catch is a SINGLE-bracket `[Truck Name]`, which is ordinary text to the renderer and
// would print literally. This lint finds those so the editor and the preview can flag them BEFORE the
// template is ever used. It reads text; it changes no rendering.
const SUSPECT_RE = /(?<!\[)\[([^\[\]]{2,40})\](?!\])/g

/** Single-bracket sequences that look like an attempted token — likely typos for `[[x]]` or `{{x}}`. */
export function suspectedMistypedTokens(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(SUSPECT_RE)) {
    const raw = m[1].trim()
    if (!raw || /^\d+$/.test(raw)) continue
    if (!out.includes(raw)) out.push(raw)
  }
  return out
}


// ── 🔴 THE ONE COMPOSITION PATH — SHARED BY THE COMPOSE WINDOW AND THE TEMPLATES PREVIEW ────────────
// A preview that reimplements substitution agrees with the compose window right up until the day it
// does not, and the day it does not is the day an email goes out wrong. So neither surface builds a
// message itself: both call the three functions below, and there is no second implementation to drift.
//   contextFromProspect() — turns a loaded prospect row into a TemplateContext
//   applyPlaceholderFills() — applies [[placeholder]] values (typed, or from a template default)
//   renderWithFills()      — renderTemplate + applyPlaceholderFills, in that order
// Nothing is appended after them. The rendered body IS the message — see the top of this file for the
// guard that used to run here and no longer does.

/** The prospect fields the substitution reads. Anything with these keys will do. */
export type ProspectLike = {
  name: string | null
  contact_name: string | null
  website: string | null
  order_url: string | null
  nextEventDate: string | null
  nextEventVenue: string | null
}

/** 🔴 ONE MAPPING. If the preview built its context differently it would render a different email. */
export function contextFromProspect(p: ProspectLike): TemplateContext {
  return {
    truckName: p.name,
    contactName: p.contact_name,
    website: p.website,
    orderUrl: p.order_url,
    nextEventDate: p.nextEventDate,
    nextEventVenue: p.nextEventVenue,
  }
}

/**
 * Apply placeholder values to `[[name]]` markers.
 * 🔴 A MARKER WITH NO VALUE SURVIVES, VISIBLY. That is the third tier: never blanked, never guessed.
 */
export function applyPlaceholderFills(text: string, fills: Record<string, string>): string {
  return text.replace(UNRESOLVED_RE, (m, raw: string) => {
    const v = fills[String(raw).trim()]
    return v && v.trim() ? v : m
  })
}

export type ComposedMessage = {
  subject: string | null
  /** The message WITHOUT the footer — what the operator edits. */
  body: string
  unresolved: string[]
  droppedConditions: string[]
}

/** Render a template for a prospect and apply placeholder values. The compose window's initial state
 *  and the Templates tab's preview are both exactly this. */
export function renderWithFills(
  tpl: MessageTemplate,
  ctx: TemplateContext,
  fills: Record<string, string>,
): ComposedMessage {
  const r = renderTemplate(tpl, ctx)
  const subject = r.subject === null ? null : applyPlaceholderFills(r.subject, fills)
  const body = applyPlaceholderFills(r.body, fills)
  return {
    subject,
    body,
    unresolved: unresolvedIn(`${subject ?? ''}\n${body}`),
    droppedConditions: r.droppedConditions,
  }
}

/** The placeholder defaults for a template, flattened to the shape the fill functions take. */
export function defaultFillsOf(tpl: MessageTemplate): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tpl.defaults ?? {})) if (v?.value) out[k] = v.value
  return out
}
