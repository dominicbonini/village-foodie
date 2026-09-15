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
//        🧪 A first name is recorded on 3 of 231 prospects, so "fill silently" with the empty string
//        would render "Hi ," on 228 rows. The fallback keeps the sentence grammatical while staying
//        silent — which is what the tier asks for.
//        🔴 AND ONE TOKEN DOES NOT DEGRADE AT ALL: see `MUST_RESOLVE`. `{{demo_link}}` has no honest
//        fallback, so its absence stops the send instead of filling anything.
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

import { effectiveLeadType, LEAD_TYPE_LABELS, type LeadType, type LeadTypeInput } from '@/lib/outreach-step'

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
  /** 🔴 WHICH RUNG THIS TEMPLATE IS FOR — `outreach_templates.serves_kind`, or null/absent = ANY.
   *  When set, choosing this template in the compose window sets the logged contact kind too. That is
   *  the Pizza Mondo defect: a chaser was sent and logged as a first contact, because the kind came
   *  from a dropdown the template had no say over.
   *  ⚠️ EVERY ROW SHIPS NULL and the migration sets nothing, so the default path is "no opinion". */
  servesKind?: string | null
  /** Which lead type this template is written for, or null/absent = ANY. Used to PREFER a template
   *  when pre-selecting for a due prospect. Never used to vary the TEXT — see the `?lead_*` note. */
  servesLeadType?: string | null
}

/** The fields a template can read. Everything is nullable — nothing may assume a value is present. */
export type TemplateContext = {
  truckName: string | null
  /** 🔴 DERIVED FROM THE TWO NAME COLUMNS, NOT FROM `outreach_prospects.contact_name`. See
   *  `contextFromProspect` — the column still exists and is still returned by the route, but no code
   *  reads it any more. */
  contactName: string | null
  contactFirstName: string | null
  contactLastName: string | null
  website: string | null
  orderUrl: string | null
  nextEventDate: string | null     // YYYY-MM-DD
  nextEventVenue: string | null
  /** Absolute `https://<hatchgrab>/demo/<public_ref>` for this prospect's newest LIVE demo, or null.
   *  🔴 NULL IS THE NORMAL CASE — 230 of 231 prospects. See `MUST_RESOLVE`: a template that asks for it
   *  and cannot get it must not be sent, so this null REFUSES rather than falling back. */
  demoLink: string | null
  /** Absolute `/compare` URL. Always resolves — see `COMPARE_LINK`. */
  compareLink: string | null
  /** 🔴 WHICH OF THE FOUR LEAD TYPES THIS PROSPECT IS — the FROZEN value once a first contact has been
   *  logged, otherwise derived live. See `effectiveLeadType` in lib/outreach-step.ts.
   *  Drives the `?lead_*:` conditions, so ONE template can carry a per-type line instead of there being
   *  one template per type per rung. */
  leadType: LeadType | null
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
    // ── 🔴 LEAD TYPE AS FOUR CONDITIONS, NOT AS FOUR TIMES THE TEMPLATES ──────────────────────────
    // The operator's steer: unify the templates and adjust per type, rather than 4 rungs x 4 types = 16
    // rows to keep in step. This tier already drops a WHOLE LINE when its condition is unmet, which is
    // exactly the granularity a per-type sentence needs, and it needed NO parser change: COND_LINE_RE
    // matches any [a-z_]+ and conditionReference() reads these case labels out of this function's own
    // source, so adding them here is the whole change and the Templates tab lists them automatically.
    // 🔴 EXACTLY ONE OF THESE FOUR IS TRUE FOR ANY PROSPECT, because `leadTypeOf` returns exactly one
    // value and these compare against it. Four lines, one survives — the same shape as the existing
    // `?next_event:` / `?no_next_event:` pair, widened from two branches to four.
    // ⚠️ A NULL leadType makes all four false, so every lead line drops and the template still renders.
    // That is the safe direction: a missing type costs a sentence, never a wrong one.
    case 'lead_hu_ordering': return ctx.leadType === 'hu_ordering'
    case 'lead_hu_map': return ctx.leadType === 'hu_map'
    case 'lead_on_vf': return ctx.leadType === 'on_vf'
    case 'lead_not_listed': return ctx.leadType === 'not_listed'
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
    // 🧪 A first name is recorded on 3 of 231 rows, so the bare form is the common case, not the edge.
    case 'contact_name_prefixed': {
      // 🔴 IT IS THE **FIRST** NAME NOW, AND THAT IS A DELIBERATE CHANGE OF RENDERING. It used to be the
      // whole of `contact_name`, so the one prospect with a surname was greeted "Hi George Greaves,".
      // A greeting takes the first name; the surname belongs in `{{last_name}}` if a template wants it.
      // ⚠️ The TOKEN NAME is unchanged on purpose — 5 active templates carry it and renaming it would
      // silently blank every greeting. See the backlog note about the name.
      const n = (ctx.contactFirstName ?? '').trim()
      return n ? ` ${n}` : ''
    }
    // ── THE NAME SPLIT ────────────────────────────────────────────────────────────────────────────
    // 🧪 3 of 231 rows have a first name and 1 has a last name, so BOTH of these resolve to null on the
    // overwhelming majority. That is why neither carries a bare '' fallback here: a null makes
    // `substitute` emit a VISIBLE `[[first_name]]`, which `unresolvedIn` counts and the compose window
    // names. A template that wants a silent greeting uses `{{contact_name_prefixed}}`, which is the one
    // token designed to vanish cleanly; a template that wants a word uses `{{first_name|there}}`.
    case 'first_name': return (ctx.contactFirstName ?? '').trim() || null
    case 'last_name': return (ctx.contactLastName ?? '').trim() || null
    // 🔴 NO FALLBACK IS POSSIBLE FOR THIS ONE, AND `substitute` ENFORCES THAT — see `MUST_RESOLVE`.
    // An empty string, a bare domain or a dead /demo/ path all arrive at a real food business as a
    // broken promise, so the only safe behaviours are "the real link" or "do not send".
    case 'demo_link': return (ctx.demoLink ?? '').trim() || null
    // ⚠️ THE HOST IS NOT THE REQUEST ORIGIN, AND THAT IS LOAD-BEARING. `/compare` calls `notFound()`
    // unless it is being served on HatchGrab, so an origin-derived link would 404 for anyone reading
    // this console on the Village Foodie domain. It is also an EMAIL: there is no origin to resolve
    // against at the point it is clicked. See `COMPARE_LINK`.
    case 'compare_link': return (ctx.compareLink ?? '').trim() || null
    case 'website': return (ctx.website ?? '').trim() || null
    case 'order_url': return (ctx.orderUrl ?? '').trim() || null
    case 'next_event_day': return ctx.nextEventDate ? dayName(ctx.nextEventDate) : null
    case 'next_event_date': return ctx.nextEventDate ? longDate(ctx.nextEventDate) : null
    case 'next_event_venue': return (ctx.nextEventVenue ?? '').trim() || null
    default: return null
  }
}

// ── 🔴 TOKENS THAT MUST RESOLVE OR THE MESSAGE MUST NOT GO OUT ──────────────────────────────────────
// Every other token degrades: it falls back, or it leaves a `[[marker]]` the operator can decide about.
// `demo_link` cannot. There is no wording that stands in for a link to a demo that does not exist, and
// the three plausible degradations are all worse than not sending:
//   ''              → "Take a look here: " — a sentence pointing at nothing
//   the bare host   → a link that does not go where the sentence says
//   a dead /demo/…  → a 404 sent to a business that was told to click it
// So this set names the tokens whose absence is a HARD STOP, and two things enforce it:
//   • `substitute` ignores any declared `{{demo_link|…}}` fallback for them — a template author cannot
//     opt out of the stop by writing one.
//   • `renderTemplate` reports them in `blocking`, and the compose window refuses every exit.
// 🔴 IT IS A SET, NOT AN `if (token === 'demo_link')`, so the next such token is one line and inherits
// all of the enforcement rather than half of it.
const MUST_RESOLVE = new Set(['demo_link'])

/** Whether a token's absence blocks sending rather than falling back. Exported so the compose window
 *  can keep these out of the "still to fill" fields — a hand-typed value must not lift the stop. */
export function isMustResolveToken(name: string): boolean {
  return MUST_RESOLVE.has(name)
}

/** Substitute resolved tokens. Unresolved `[[…]]` are deliberately untouched. */
function substitute(line: string, ctx: TemplateContext): string {
  return line.replace(RESOLVED_RE, (_m, token: string, fallback?: string) => {
    const v = resolvedValue(token, ctx)
    if (v !== null) return v
    // 🔴 A MUST-RESOLVE TOKEN IGNORES ITS DECLARED FALLBACK. `{{demo_link|hatchgrab.com}}` would
    // otherwise render a plausible-looking wrong link and clear the stop at the same time.
    if (MUST_RESOLVE.has(token)) return `[[${token}]]`
    // No value: use the declared fallback, or — with none — leave a VISIBLE marker rather than a blank,
    // so a missing field can never masquerade as intentionally empty prose.
    return fallback !== undefined ? fallback : `[[${token}]]`
  })
}

/** The must-resolve tokens still missing from `text` — non-empty means DO NOT SEND. */
function blockingIn(text: string): string[] {
  return unresolvedIn(text).filter(n => MUST_RESOLVE.has(n))
}

export type RenderedTemplate = {
  subject: string | null
  /** The editable body. Nothing is appended to it any more — the sign-off, the details and the
   *  opt-out line all come from the Outlook signature now. What is here is the whole message. */
  body: string
  /** Distinct `[[…]]` placeholders still outstanding, in first-appearance order. */
  unresolved: string[]
  /** 🔴 `{{…}}` spans the substitution could not consume — see `malformedTokensIn`. NON-EMPTY MEANS THE
   *  TEXT WOULD REACH A PROSPECT WITH LITERAL BRACES IN IT. Carried on the result rather than left for a
   *  caller to remember to ask for, so a new consumer is handed it without knowing to look. */
  malformed: string[]
  /** 🔴 MUST-RESOLVE tokens (see `MUST_RESOLVE`) that could not be resolved. NON-EMPTY MEANS THE
   *  MESSAGE MUST NOT BE SENT — unlike `unresolved`, which warns and lets the operator decide. */
  blocking: string[]
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
  // 🔴 SUBJECT **AND** BODY. The defect that prompted this guard was in a SUBJECT, and the subject is the
  // one part of an email that `fullText` does not carry — it travels in the mailto instead.
  const whole = subject ? subject + '\n' + body : body
  return {
    subject, body,
    unresolved: unresolvedIn(whole),
    malformed: malformedTokensIn(whole),
    blocking: blockingIn(whole),
    droppedConditions: dropped,
  }
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
  contact_name: 'First and last name joined, when a name is recorded (3 of 231 rows have one).',
  contact_name_prefixed: 'A leading space plus the FIRST name, or nothing — write `Hi{{contact_name_prefixed}},` to get "Hi Sam," or a bare "Hi,". The one token that vanishes cleanly when there is no name.',
  first_name: 'The contact\'s first name (3 of 231 rows). Renders [[first_name]] when absent — use {{contact_name_prefixed}} for a greeting, or {{first_name|there}} for a word.',
  last_name: 'The contact\'s last name (1 of 231 rows). Renders [[last_name]] when absent.',
  demo_link: '🔴 The full https://…/demo/… link to this prospect\'s live demo. If there is no live demo the message CANNOT BE SENT — there is no fallback and a declared one is ignored. Only 1 of 231 prospects has one today; use the Create demo button in the prospect modal first.',
  compare_link: 'The full https://…/compare link to the plan-comparison page, on the HatchGrab domain. Always resolves.',
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
  lead_hu_ordering: `Lead type 1 — ${LEAD_TYPE_LABELS.hu_ordering}. Exactly one of the four ?lead_ lines survives, so write all four and let the prospect's type choose.`,
  lead_hu_map: `Lead type 2 — ${LEAD_TYPE_LABELS.hu_map}.`,
  lead_on_vf: `Lead type 3 — ${LEAD_TYPE_LABELS.on_vf}.`,
  lead_not_listed: `Lead type 4 — ${LEAD_TYPE_LABELS.not_listed}. The fallback: not Hatches Up, and not showing on the map.`,
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
//
// ⚠️ THIS COMMENT USED TO STOP AFTER ITS FIRST EXAMPLE AND WAS WRONG ABOUT THE CLASS. It read: "An
// unknown `{{truk_name}}` is already safe: `substitute` cannot resolve it, so it emits `[[truk_name]]`."
// That sentence is TRUE OF THAT EXAMPLE AND FALSE OF THE CLASS, and the reassuring example is what
// stopped anyone looking. `chase-1`'s subject carried `{{truck name}}` — a SPACE — for weeks, offerable
// and active, and it would have gone out verbatim. See docs/outreach-token-guard-report.md.
//
// THE TWO CASES, AND ONLY ONE OF THEM WAS EVER SAFE:
//   • WELL-FORMED but unknown — `{{truk_name}}` matches RESOLVED_RE (`[a-z_]+`), resolves to nothing,
//     and emits `[[truk_name]]`, which `unresolvedIn` counts and the pre-send warning names. SAFE, and
//     unchanged here.
//   • MALFORMED — `{{truck name}}`, `{{Truck_Name}}`, `{{truck-name}}`, `{{truck2}}`, `{{}}` — does NOT
//     match RESOLVED_RE at all, so `substitute` never sees it, emits nothing, and the text survives
//     verbatim. 🔴 AND IT IS INVISIBLE TO EVERY OTHER GUARD TOO: `unresolvedIn` scans `[[…]]`,
//     `suspectedMistypedTokens` scans single `[…]`. THREE GUARDS, ONE BLIND SPOT — all three keyed off a
//     token PATTERN, so a span that fails to match the pattern was invisible to all of them at once.
//
// 🔴 WHICH IS WHY `malformedTokensIn` BELOW KEYS OFF THE DELIMITERS AND NOT THE PATTERN. It finds every
// `{{`…`}}` span whatever is inside it, then asks whether RESOLVED_RE would have consumed it. A guard
// built on the token pattern would have inherited the identical blind spot by construction.
//
// `suspectedMistypedTokens` remains what it always was: a lint for SINGLE-bracket `[Truck Name]`, which
// is ordinary text to the renderer and would print literally. It reads text; it changes no rendering.
// ── 🔴 THE MALFORMED-TOKEN GUARD — KEYED OFF THE DELIMITERS, DELIBERATELY ─────────────────────────
// `BRACE_SPAN_RE` matches a `{{`…`}}` pair and captures WHATEVER is between them — letters, spaces,
// capitals, digits, punctuation, nothing at all. It shares no character class with RESOLVED_RE, so a
// span RESOLVED_RE cannot see is exactly a span this one CAN. That is the whole design: the previous
// three guards were blind together because they were the same test written three times.
//
// ⚠️ NON-GREEDY (`*?`) so a nested `{{a{{b}}}}` reports the OUTER opening rather than silently matching
// to the last `}}` and reporting one plausible-looking token.
const BRACE_SPAN_RE = /\{\{([\s\S]*?)\}\}/g
// What RESOLVED_RE would accept between the braces, expressed as a whole-string test: an optional run of
// whitespace, a lower-case/underscore name, optional whitespace, and an optional `|fallback`.
// 🔴 IT MIRRORS RESOLVED_RE AND MUST BE CHANGED WITH IT. If the resolver ever widens its character
// class, this widens too or it starts reporting tokens that work.
const WELL_FORMED_INNER_RE = /^\s*[a-z_]+\s*(?:\|[^}]*)?$/
// An UNCLOSED `{{` never forms a span, so it cannot be found by scanning for pairs. Found by removing
// every complete span first and asking whether an opening delimiter survives.
const OPEN_DELIM = '{{'

/**
 * Every `{{…}}` in `text` that the substitution CANNOT consume — the ones that reach a prospect as
 * literal characters with no warning anywhere else.
 *
 * Returns the offending span VERBATIM (braces included), because the operator has to find it in the
 * text, and `truck name` alone is harder to spot than `{{truck name}}`.
 *
 * ⚠️ A well-formed but UNKNOWN token (`{{nope}}`) is NOT reported here — it is already handled, and
 * visibly: it renders as `[[nope]]` and `unresolvedIn` lists it. Reporting it twice would train the
 * operator to dismiss this list.
 *
 * 🔴 READS TEXT, CHANGES NO RENDERING. `substitute` is untouched by this change, which is why every
 * valid token still renders byte-identically.
 */
export function malformedTokensIn(text: string): string[] {
  const out: string[] = []
  const src = String(text ?? '')
  let stripped = ''
  let last = 0
  for (const m of src.matchAll(BRACE_SPAN_RE)) {
    stripped += src.slice(last, m.index)
    last = (m.index ?? 0) + m[0].length
    if (WELL_FORMED_INNER_RE.test(m[1])) continue
    if (!out.includes(m[0])) out.push(m[0])
  }
  stripped += src.slice(last)
  // Whatever is left cannot contain a complete span, so a surviving `{{` is an unclosed one.
  if (stripped.includes(OPEN_DELIM) && !out.includes(OPEN_DELIM)) out.push(OPEN_DELIM)
  return out
}

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
  /** 🔴 NOT READ ANY MORE — kept in the type on purpose. The column still exists and the route still
   *  returns it for one release; removing the field would make a remaining reader vanish from the type
   *  system instead of erroring. Dropping the column is a LATER, SEPARATE change. */
  contact_name?: string | null
  contact_first_name: string | null
  contact_last_name: string | null
  website: string | null
  order_url: string | null
  nextEventDate: string | null
  nextEventVenue: string | null
  /** The prospect's newest LIVE demo, as /api/admin/outreach reports it. Optional so a caller that
   *  predates the demo join still type-checks; absent means "no demo", which is the refusing case. */
  demo?: { publicRef: string | null; expiresAt: string | null } | null
}
  /** 🔴 THE LEAD-TYPE INPUTS ARE REQUIRED, NOT OPTIONAL, AND THAT IS THE POINT.
   *  Made optional they would default every caller that forgot them to `not_listed` — a silently wrong
   *  type on every rendered message, which is the exact class of failure this file keeps flagging.
   *  Required, the compiler names each call site instead. `LeadTypeInput` is imported rather than
   *  restated so the two cannot drift. */
  & LeadTypeInput

// ⚠️ THE HOST IS FIXED TO HATCHGRAB, NOT DERIVED FROM THE ORIGIN, for the two reasons in the
// `compare_link` case above. This is the established pattern — the identical expression builds
// HATCHGRAB_LOGO_URL in lib/email-config.ts — and the literal default is the deployed production host,
// so a missing env var yields a WORKING link rather than `undefined/compare`.
const HATCHGRAB_BASE = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com'
const COMPARE_LINK = `${HATCHGRAB_BASE}/compare`

/**
 * The absolute demo URL for a prospect, or null.
 *
 * 🔴 LIVENESS IS `public_ref IS NOT NULL AND expires_at > now()`, AND NOTHING ELSE. In particular it is
 * NOT `retired_at IS NULL`: `demo_sessions.retired_at` has no writer anywhere in this repository, so
 * testing it would imply a retirement mechanism that does not exist.
 * ⚠️ A live session can carry a NULL `public_ref` — the modal already renders "demo · no link" for
 * that — so "has a live demo" and "has a link" are two different questions and this asks the second.
 * ⚠️ The expiry is re-checked HERE as well as in the route, because the admin page can sit open for
 * hours after the list was loaded and a demo expiring in that window must stop being offered.
 */
export function demoLinkFor(demo: ProspectLike['demo']): string | null {
  const ref = demo?.publicRef
  if (!ref) return null
  const exp = demo?.expiresAt
  if (!exp) return null
  if (new Date(exp).getTime() <= Date.now()) return null
  return `${HATCHGRAB_BASE}/demo/${ref}`
}

/** 🔴 ONE MAPPING. If the preview built its context differently it would render a different email. */
export function contextFromProspect(p: ProspectLike): TemplateContext {
  const first = (p.contact_first_name ?? '').trim()
  const last = (p.contact_last_name ?? '').trim()
  return {
    truckName: p.name,
    // 🔴 JOINED FROM THE TWO COLUMNS, NOT READ FROM `contact_name`. `{{contact_name}}` and
    // `?contact_name:` keep their existing meaning — "the whole name" — while the stored column they
    // used to read is no longer consulted by anything.
    contactName: [first, last].filter(Boolean).join(' ') || null,
    contactFirstName: first || null,
    contactLastName: last || null,
    website: p.website,
    orderUrl: p.order_url,
    nextEventDate: p.nextEventDate,
    nextEventVenue: p.nextEventVenue,
    demoLink: demoLinkFor(p.demo),
    compareLink: COMPARE_LINK,
    // 🔴 DERIVED HERE, IN THE ONE MAPPING, so the compose window and the Templates preview cannot
    // disagree about a prospect's type — the same reason every other field is built here.
    // 🔴 `effectiveLeadType`, NOT `leadTypeOf`: a sequence keeps the framing it started with. Once the
    // first contact is logged the type is frozen on the row, and every later rung reads that value, so
    // a chase cannot contradict the approach it is chasing. Null falls back to the live derivation.
    leadType: effectiveLeadType(p),
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
  /** 🔴 See RenderedTemplate.malformed. Non-empty ⇒ do not send. */
  malformed: string[]
  /** 🔴 See RenderedTemplate.blocking. Non-empty ⇒ do not send. */
  blocking: string[]
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
  // Re-derived AFTER the fills, not carried over from `r`: a placeholder VALUE can itself contain a
  // malformed token, and that value is typed by hand.
  const whole = `${subject ?? ''}\n${body}`
  return {
    subject,
    body,
    unresolved: unresolvedIn(whole),
    malformed: malformedTokensIn(whole),
    // 🔴 RE-DERIVED AFTER THE FILLS, like `malformed` and for the harder version of the same reason: a
    // placeholder value is typed by hand, and `defaultFillsOf` below refuses to carry a must-resolve
    // key, so the only way this list shrinks is the operator editing the visible text themselves.
    blocking: blockingIn(whole),
    droppedConditions: r.droppedConditions,
  }
}

/** The placeholder defaults for a template, flattened to the shape the fill functions take.
 *  🔴 A MUST-RESOLVE KEY IS DROPPED. `placeholder_defaults` is editable data; a stored `demo_link`
 *  default would otherwise fill `[[demo_link]]` on load and lift the send block before anyone saw it. */
export function defaultFillsOf(
  tpl: MessageTemplate,
  globals?: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  // 🔴 THE GLOBAL LAYER GOES IN FIRST SO THE PER-TEMPLATE VALUE OVERWRITES IT. Order is the whole
  // precedence rule: nothing compares, nothing branches, and a template default always wins because it
  // is written second. A rate stated once therefore reaches every template that has no opinion, and a
  // template that DOES have one is unaffected.
  for (const [k, v] of Object.entries(globals ?? {})) {
    if (!v || !v.trim()) continue
    if (MUST_RESOLVE.has(k.trim())) continue
    out[k] = v
  }
  for (const [k, v] of Object.entries(tpl.defaults ?? {})) {
    if (!v?.value) continue
    if (MUST_RESOLVE.has(k.trim())) continue
    out[k] = v.value
  }
  return out
}

/**
 * WHICH LAYER SUPPLIED EACH VALUE — so the field can say so rather than showing a value with no origin.
 * 🔴 THE RISK THIS EXISTS FOR: two sources for one value means a stale global can hide behind a field
 * that looks freshly filled. The compose window already shows an age badge for a stored default; with a
 * second source that badge has to name WHICH source, or it is worse than no badge at all.
 * ⚠️ Returns 'template' when both layers hold a value, because that is the one that won.
 */
export function fillSourceOf(
  tpl: MessageTemplate,
  globals: Record<string, string> | null | undefined,
  name: string,
): 'template' | 'global' | null {
  const t = tpl.defaults?.[name]?.value
  if (t && t.trim()) return 'template'
  const g = globals?.[name]
  if (g && g.trim()) return 'global'
  return null
}
