'use client'
// components/admin/ComposeWindow.tsx
//
// The compose window behind "Compose from template". It exists because the log block was too small to
// read a full email in: the picker, subject, body, the outstanding-placeholder list and the opt-out
// footer all moved here, where there is room to see what is actually being sent.
//
// 🔴 NOTHING HERE WRITES ANYTHING UNTIL THE LOG BUTTON IS PRESSED. Choosing a template, editing the
// subject, editing the body and copying are all local. The browser cannot know whether an email was
// actually sent, so the log must record MY ACTION, not my intention — the manual is explicit that the
// contact log is a log, not a timestamp, and that it is the thing that stops a fourth email. A log entry
// written for an email that was never sent destroys exactly that property.
//
// 🔴 IT NEVER TOUCHES `truck_events`, and it has no route of its own: logging calls the SAME `log_contact`
// writer the modal's own Log button uses, passed in as a prop.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  renderTemplate, unresolvedIn, malformedTokensIn, isMustResolveToken, applyPlaceholderFills, defaultFillsOf, fillSourceOf,
  type MessageTemplate, type TemplateContext,
} from '@/lib/outreach-template-render'
import { kindLabel } from '@/lib/outreach'   // one vocabulary, one labeller
import { readOutreachGlobals } from '@/lib/outreach-globals'

const DEFAULT_STALE_DAYS = 60
const defaultIsStale = (iso: string | null | undefined) => {
  if (!iso) return false
  return (Date.now() - new Date(iso).getTime()) / 86_400_000 > DEFAULT_STALE_DAYS
}
const fmtDefaultDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

/** Look a template up in the loaded list by its slug. */
const TPL_BY_ID = (all: MessageTemplate[], id: string) => all.find(t => t.id === id) ?? null

/**
 * The window's opening state for a pre-selected template — the same three calls `applyTemplate` makes,
 * in the same order, so an opened-from-the-queue window and a hand-picked one cannot render differently.
 * 🔴 RETURNS THE EMPTY SHAPE FOR ANY REASON IT CANNOT PROCEED: no id, or an id that is not in
 * `offerable`. A slug that has been retired or renamed on the Templates tab therefore degrades to "no
 * template chosen" — visibly — rather than throwing or selecting something else.
 */
function seedFrom(id: string | null | undefined, offerable: MessageTemplate[], ctx: TemplateContext,
  globals: Record<string, string>) {
  const empty = { id: '', subject: '', body: '', fills: {} as Record<string, string>,
    fromDefault: {} as Record<string, string | null>,
    fillSource: {} as Record<string, 'template' | 'global' | null> }
  if (!id) return empty
  const tpl = TPL_BY_ID(offerable, id)
  if (!tpl) return empty
  const out = renderTemplate(tpl, ctx)
  // 🔴 THE SAME TWO LAYERS AS applyTemplate. A window opened from the due queue pre-selects its
  // template here rather than through applyTemplate, so missing the global layer here would make the
  // global work only when a template was picked BY HAND — the least likely path.
  const fills = defaultFillsOf(tpl, globals)
  return {
    id,
    subject: out.subject ?? '',
    body: out.body,
    fills,
    fromDefault: Object.fromEntries(
      Object.entries(tpl.defaults ?? {}).filter(([, v]) => !!v?.value).map(([k, v]) => [k, v.updatedAt]),
    ) as Record<string, string | null>,
    fillSource: Object.fromEntries(
      Object.keys(fills).map(k => [k, fillSourceOf(tpl, globals, k)]),
    ) as Record<string, 'template' | 'global' | null>,
  }
}

export default function ComposeWindow({
  truckName, toEmail, offerable, suggestedId, initialTemplateId, doNotContact, ctx,
  whatsappConfirmed, templatesLoaded, logFormKind, onClose, onLog,
}: {
  truckName: string
  /** The prospect's address — the mailto recipient. Null when the row has none. */
  toEmail: string | null
  /** Already gated: WhatsApp templates are present only when this prospect is confirmed. */
  offerable: MessageTemplate[]
  suggestedId: string | null
  /** 🔴 PRE-SELECT THIS TEMPLATE ON OPEN. Null/absent ⇒ the historical behaviour, byte for byte.
   *  See the seeding note below for why this is allowed where `suggestedId` is not. */
  initialTemplateId?: string | null
  /** 🔴 outreach_prospects.do_not_contact. True ⇒ every exit refuses. */
  doNotContact?: boolean | null
  ctx: TemplateContext
  whatsappConfirmed: boolean
  /** False when the templates table could not be read — distinct from "it has none". */
  templatesLoaded: boolean
  onClose: () => void
  /** Writes one outbound contact row. Resolves true on success. */
  /** Writes one outbound contact row. Resolves true on success.
   *  🔴 THE THIRD ARGUMENT IS THE TEMPLATE'S OWN RUNG (`serves_kind`), or null when it has no opinion.
   *  It exists because the logged `kind` used to come from the log form's dropdown alone: a chaser was
   *  sent to Pizza Mondo and recorded as a FIRST CONTACT, which then drove the derived step, the
   *  follow-up date and the queue. The template knows what it is; the dropdown only knows what was last
   *  left there. ⚠️ null means "no opinion" and the caller keeps using the dropdown — which is every
   *  template today, because the tagging columns ship empty. */
  onLog: (body: string, channel: string, servesKind: string | null) => Promise<boolean>
  /** What the prospect panel’s log form currently has selected. Display only — used to say when a
   *  tagged template is about to log a DIFFERENT rung. The compose window never sets it. */
  logFormKind: string
}) {
  // ── 🔴 PRE-SELECTION, AND WHY IT DOES NOT BREAK THE RULE IT LOOKS LIKE IT BREAKS ─────────────────
  // This line used to read `useState('')  // '' = none chosen; NEVER auto-selected`, and that rule was
  // right for what it governed. 🔎 docs/outreach-templates-report.md: the thing it refused to auto-select
  // was `suggestTemplateId` — a heuristic over `stage` + `hu_ordering` where 🧪 214 of 231 rows get the
  // same answer and `hu_ordering` is TRI-STATE, so "not on Hatches Up" really means "not recorded as on
  // it". Auto-selecting THAT would dress a low-confidence guess as a decision, and the operator would
  // not know which it was.
  //
  // 🔴 `initialTemplateId` IS A DIFFERENT KIND OF VALUE AND THE DEFAULT IS UNCHANGED:
  //   • It is passed ONLY when the composer is opened from a due-queue row whose step is KNOWN — an
  //     explicit act that already names the step on screen. Every other caller passes nothing and gets
  //     `''`, exactly as before.
  //   • It comes from the derived ladder (a rung actually reached), not from a 214-of-231 heuristic.
  //   • `nextStep` refuses to produce a rung at all when the history is unreadable (state 'unknown'),
  //     so a low-confidence case cannot reach this parameter.
  //   • It is still only a SELECTION: the picker is unchanged and re-selectable, and nothing is sent.
  // ⚠️ SEEDED IN A LAZY `useState`, NOT AN EFFECT. An effect that calls setState on mount is the
  // `react-hooks/set-state-in-effect` pattern this repo already carries 11 of; this adds none, and it
  // also means the first paint already has the template rather than flashing an empty pane.
  const [globalsSeed] = useState(() => readOutreachGlobals())
  const [seed] = useState(() => seedFrom(initialTemplateId, offerable, ctx, globalsSeed))
  const [templateId, setTemplateId] = useState(seed.id)
  // 🔴 TWO LAYERS, ONE VISIBLE PANE.
  //   sourceSubject / sourceBody — the template's RENDER, still carrying [[placeholders]]. Never shown.
  //   subject / body            — the editable message, which is the render with field values applied.
  // The pane you type in is the second one, so what is on screen is what will be sent. The first exists
  // only so a field can be changed or cleared and the message rebuilt from it — see `edited` below.
  const [sourceSubject, setSourceSubject] = useState(seed.subject)
  const [sourceBody, setSourceBody] = useState(seed.body)
  const [subject, setSubject] = useState(seed.subject)
  const [body, setBody] = useState(seed.body)
  // 🔴 THE PRECEDENCE FLAG. False: the fields drive the message. True: I have typed in the message and
  // the fields stop rewriting it. It is never set by anything except a keystroke in the subject or body.
  const [edited, setEdited] = useState(false)
  // 🔴 HAS THE OPERATOR TYPED ANYTHING THAT RE-OPENING WOULD NOT REPRODUCE?
  //   `edited`      — a keystroke landed in the subject or body.
  //   `fillsTouched`— a placeholder field was typed into. Tracked SEPARATELY from `fills` itself
  //                   because `fills` is pre-populated from the template's stored defaults, so a
  //                   non-empty `fills` is not evidence that anyone typed.
  // ⚠️ SELECTING A TEMPLATE ALONE IS NOT A DRAFT. The render is deterministic — re-opening the window
  // produces the identical text — so guarding on "body is non-empty" would make Escape useless the
  // moment a template was picked, which is every time the queue pre-selects one.
  const [fillsTouched, setFillsTouched] = useState(false)
  const dirty = edited || fillsTouched
  // 🔴 READ THROUGH A REF INSIDE THE ESCAPE HANDLER. That effect depends on `onClose` only — adding
  // `dirty` would tear down and re-register the window listener on every keystroke, which is exactly
  // the registration churn the C15 note warns about. The ref lets the handler see the current value
  // without the listener ever moving.
  // ⚠️ WRITTEN IN AN EFFECT, NOT DURING RENDER. `dirtyRef.current = dirty` in the render body is a
  // render-time side effect — the `react-hooks/refs` pattern this repo has already had to correct once
  // (a KDS ref write moved into an effect for the same reason). The write lands after commit, which is
  // strictly before any keystroke can reach the handler.
  const dirtyRef = useRef(dirty)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  // Set when the re-render control is pressed once, so it can warn before discarding.
  const [confirmRerender, setConfirmRerender] = useState(false)
  // 🔴 PLACEHOLDER VALUES LIVE HERE, NOT IN THE BODY TEXT. See the note on applyFills below.
  const [fills, setFills] = useState<Record<string, string>>(seed.fills)
  // 🔴 WHICH VALUES CAME FROM A STORED DEFAULT RATHER THAN BEING TYPED, and when each was last changed
  // on the Templates tab. A stale default goes out in an email that LOOKS correctly filled — every guard
  // (the NEEDED chip, the still-to-fill banner, both confirmations) stays silent on it — so the only
  // protection is showing its provenance and its age on the field itself.
  const [fromDefault, setFromDefault] = useState<Record<string, string | null>>(seed.fromDefault)
  /** 🔴 READ ONCE, LAZILY. Re-reading localStorage mid-compose could change a field under the operator;
   *  the Templates tab is where it is edited, and the next compose window picks the new value up. */
  const globals = globalsSeed
  /** Which layer supplied each pre-filled value. Display only — see the badge. */
  const [fillSource, setFillSource] = useState<Record<string, 'template' | 'global' | null>>(seed.fillSource)
  // Which action is waiting on the unfilled-placeholder confirmation: null | 'send' | 'log'.
  const [pending, setPending] = useState<null | 'send' | 'log'>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [logging, setLogging] = useState(false)
  // 🔴 A SUCCESSFUL LOG DOES NOT CLOSE THE WINDOW — see the header comment on what closes it — so the
  // button has to say it already fired, or a second press silently writes a second contact row. Editing
  // the text again clears this, because changed text is a different message.
  const [logged, setLogged] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { closeRef.current?.focus() }, [])

  // 🔴 ESCAPE CLOSES THIS WINDOW ONLY, NOT THE PROSPECT MODAL UNDERNEATH.
  // That modal listens with `window.addEventListener('keydown', onKey)` — the BUBBLE phase at window.
  // This listens on the same target with `{ capture: true }`. The capture phase at window runs BEFORE any
  // bubble-phase listener on window, whatever order they registered in, so this one always sees Escape
  // first and calls `stopPropagation()`, ending the event before the modal's handler is reached.
  // ⚠️ Registration order is NOT relied on — that would be a coin toss between two window listeners.
  //
  // 🔴 AND IT NOW DECLINES TO CLOSE WHEN THERE IS A DRAFT TO LOSE. A stray Escape over a half-written
  // message is the same fault as a stray click on the backdrop, so it gets the same answer.
  // 🔴 THE CRITICAL DETAIL IS THAT IT STILL CALLS `stopPropagation()` EVEN WHEN IT DECLINES. Returning
  // early — the shape used elsewhere in this tree, where a child is meant to handle the key instead —
  // would let the event reach the prospect modal's bubble listener, and one Escape would close the
  // PARENT while leaving the draft's own window open underneath it. Worse than the bug being fixed.
  // So: swallow the key always; act on it only when nothing is lost.
  // ⚠️ NO LISTENER IS ADDED OR REMOVED BY THIS CHANGE — the C15 trap (two CAPTURE listeners on one node,
  // where `stopPropagation` does not stop a sibling) is neither introduced nor worsened. Same one
  // listener, same phase, same target; only the body of the handler changed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation(); e.preventDefault()
      if (dirtyRef.current) return          // a draft exists — swallow the key, keep the window
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Background scroll lock, restoring the previous value rather than resetting to '' so a caller that had
  // already locked the body is not silently unlocked.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const selected = useMemo(() => offerable.find(t => t.id === templateId) ?? null, [offerable, templateId])

  const applyTemplate = useCallback((id: string) => {
    setTemplateId(id)
    setLogged(false)
    // A different template has different placeholders; carrying values across would silently paste one
    // template's rate into another's sentence.
    setPending(null); setSendError(null)
    // 🔴 PRE-FILL FROM THE TEMPLATE'S STORED DEFAULTS. Overriding one here NEVER writes back — this
    // component has no route to the templates table; changing a stored default is a deliberate action on
    // the Templates tab.
    const chosen = TPL_BY_ID(offerable, id)
    setFills(chosen ? defaultFillsOf(chosen, globals) : {})
    // 🔴 PROVENANCE RECORDED AT THE SAME MOMENT THE VALUES ARE, from the SAME two layers, so the badge
    // can never disagree with what was actually used.
    setFillSource(chosen
      ? Object.fromEntries(Object.keys(defaultFillsOf(chosen, globals))
          .map(k => [k, fillSourceOf(chosen, globals, k)]))
      : {})
    setFromDefault(chosen
      ? Object.fromEntries(Object.entries(chosen.defaults ?? {})
          .filter(([, v]) => !!v?.value)
          .map(([k, v]) => [k, v.updatedAt]))
      : {})
    if (!id) { setSubject(''); setBody(''); return }
    const tpl = offerable.find(t => t.id === id)
    if (!tpl) return
    const out = renderTemplate(tpl, ctx)
    setSourceSubject(out.subject ?? ''); setSourceBody(out.body)
    // Fields were just cleared, so the message starts as the raw render: resolved tokens substituted,
    // unfilled placeholders still visible as [[…]].
    setSubject(out.subject ?? ''); setBody(out.body)
    setEdited(false); setConfirmRerender(false)
  }, [ctx])

  // 🔴 THE PLACEHOLDER LIST IS DERIVED FROM THE TEXT ON SCREEN, NEVER HARDCODED. Today that yields
  // [[link]], [[your rate]] and [[X]] for the Hatches Up template, but nothing here names them: a
  // template written next week gets its own fields for free, which matters because templates are about
  // to become editable data. `unresolvedIn` is the module's OWN scanner — the same one `renderTemplate`
  // reports with — so the fields and the report cannot disagree.
  // 🔴 TWO DIFFERENT QUESTIONS, TWO DIFFERENT SETS — and conflating them is how a field vanishes the
  // moment you fill it.
  //   `tokens`      — the placeholders THE TEMPLATE HAS. Read from the SOURCE, so a field keeps its
  //                   box (and its value, editable) after it has been filled.
  //   `outstanding` — the placeholders STILL IN THE MESSAGE that is about to go out. Read from the
  //                   LIVE text, so typing over [[X]] by hand clears it from the banner, and so does
  //                   filling its field. This is what "Still to fill" counts.
  // 🔴 MUST-RESOLVE TOKENS GET NO FIELD, AND THAT IS THE POINT. `[[demo_link]]` is a STOP, not a blank
  // to be filled: offering a box for it would invite a hand-typed bare domain — one of the three
  // renderings `MUST_RESOLVE` exists to prevent — and typing anything into it would clear the stop at
  // the same moment. The only way past it is a real demo, or editing the visible text.
  const tokens = useMemo(
    () => unresolvedIn(`${sourceSubject}\n${sourceBody}`).filter(t => !isMustResolveToken(t)),
    [sourceSubject, sourceBody])

  // 🔴 HOW HAND EDITS AND FIELD VALUES BOTH SURVIVE — THE ONE DESIGN DECISION IN THIS FILE.
  // The `[[token]]` markers STAY in the editable body. Filling a field never rewrites the textarea; the
  // values are held separately and applied on the way OUT (preview, copy, send, log).
  // Why, when the ask was "substitutes into the body live": substituting INTO the textarea would consume
  // the marker, so a later correction to the field would have nothing left to replace, and any hand edit
  // made in between would be at risk from the next keystroke in a field. Keeping the marker means
  // 🔴 NEITHER CAN DESTROY THE OTHER — edits are never overwritten and a value can be changed or cleared
  // at any time. The substitution IS shown live, in the read-only preview below the body, which is
  // exactly the text that gets copied, sent and logged.
  // 🔴 THE SHARED IMPLEMENTATION, NOT A LOCAL COPY. `applyPlaceholderFills` lives in the mechanism
  // module and is what the Templates tab's preview calls too, so the preview and this window cannot
  // apply placeholder values differently.
  const applyFills = useCallback((text: string) => applyPlaceholderFills(text, fills), [fills])

  /** Placeholders still present in the LIVE message — what "Still to fill" counts and what the
   *  warnings name. Derived from the text on screen, so it stays true after hand edits. */
  const outstanding = useMemo(() => unresolvedIn(`${subject}\n${body}`), [subject, body])

  /** 🔴 `{{…}}` SPANS THE SUBSTITUTION CANNOT CONSUME — THE HARD STOP.
   *  Derived from `finalSubject`/`finalBody` below rather than the template source, for the same reason
   *  `outstanding` is derived from the text on screen: the operator can TYPE one into the textarea, and
   *  a placeholder VALUE can contain one. Whatever leaves this window is what gets checked.
   *
   *  🔴 THIS REFUSES, WHERE `outstanding` ONLY WARNS, AND THE DIFFERENCE IS DELIBERATE. A `[[placeholder]]`
   *  left in may be intentional — the operator is told and decides. A malformed `{{…}}` is never
   *  intentional: it is a typo that would arrive at a food business as literal braces. There is nothing
   *  to decide, so there is no "send anyway".
   *  See docs/outreach-token-guard-report.md — `chase-1` carried `{{truck name}}`, active and offerable. */
  const malformed = useMemo(
    () => malformedTokensIn(`${applyFills(subject)}\n${applyFills(body)}`), [applyFills, subject, body])
  const malformedNotice = malformed.length === 0 ? null
    : `This message contains ${malformed.length === 1 ? 'a token' : 'tokens'} the renderer cannot read: `
      + `${malformed.join(', ')}. It would arrive with the braces in it. Tokens are lower-case with `
      + `underscores — {{truck_name}}, not {{truck name}}. Fix the template on the Templates tab, or edit `
      + `the text above.`

  /** 🔴 MUST-RESOLVE TOKENS STILL MISSING — THE SECOND HARD STOP, AND IT REUSES THE FIRST ONE'S CHANNEL.
   *  Read from `outstanding`, i.e. the LIVE text, for the same reason `malformed` is: whatever leaves
   *  this window is what gets checked. Placeholder fills cannot shrink this list — `tokens` above
   *  refuses to offer a field for these names and `defaultFillsOf` refuses to carry one — so the only
   *  thing that clears it is a real value or a deliberate edit to the text on screen.
   *
   *  🔴 WHY THIS IS A SECOND SIGNAL RATHER THAN AN EXTRA CASE IN `malformedTokensIn`: that function
   *  answers "is this span shaped like a token?", keyed off the DELIMITERS precisely so it cannot
   *  inherit the resolver's blind spot. `{{demo_link}}` is perfectly well shaped — it is the DATA that
   *  is missing. Folding a data question into a syntax check would make both harder to reason about and
   *  would give the operator one message for two unrelated problems. The REFUSAL MECHANISM is shared:
   *  the same `sendError` channel, the same three guarded exits, the same always-visible red line. */
  const blocking = useMemo(() => outstanding.filter(isMustResolveToken), [outstanding])
  const blockingNotice = blocking.length === 0 ? null
    : blocking.includes('demo_link')
      ? `${truckName} has no live demo link, so this template cannot be sent to them. Close this window `
        + `and use “Create demo” on the prospect, then compose again — or pick a template that does not `
        + `use {{demo_link}}. There is no fallback for it on purpose: an empty space, a bare domain or an `
        + `expired /demo/ link all arrive as a broken promise.`
      : `This message needs ${blocking.map(b => `{{${b}}}`).join(', ')}, which cannot be resolved for `
        + `${truckName}. It cannot be sent.`
  /** 🔴 DO NOT CONTACT — THE THIRD HARD STOP, AND IT IS FIRST IN THE CHAIN.
   *  Until now this flag blocked NOTHING: it drew a 🚫 chip on the table and drove a filter, and the
   *  composer, the sender, the copier and the logger all ignored it completely. 🧪 Searched alone,
   *  `do_not_contact` appeared 0 times in this file, 0 in lib/outreach-template-render.ts and 0 in the
   *  route's log_contact branch, while those same files carried 25 / 17 / 2 refusal symbols — so the
   *  search finds gating where it exists, and there was none here.
   *
   *  🔴 IT REFUSES COMPOSING, NOT RECORDING, AND THAT LINE IS DELIBERATE. This window produces an
   *  OUTBOUND message, which is the thing the flag forbids. Logging elsewhere is how the operator
   *  records what already happened — including an inbound reply FROM a do-not-contact prospect — and
   *  blocking that would make the history lie. So the modal's own log form is untouched.
   *
   *  It is first because it is the most absolute: a malformed token is a typo to fix and a missing demo
   *  is a demo to create, but this one has no remedy inside the window. */
  const dncNotice = doNotContact === true
    ? `${truckName} is flagged DO NOT CONTACT, so this message cannot be sent, copied or logged from `
      + `here. Untick "Do not contact" on the prospect if that flag is wrong.`
    : null
  /** Every hard stop. All three refuse the same three exits through the same error line. */
  const refusal = dncNotice ?? malformedNotice ?? blockingNotice

  // 🔴 THE RE-SUBSTITUTION, AND THE ONE RULE THAT GOVERNS IT.
  // While `edited` is false the message IS the render with field values applied, so typing in a field
  // updates the pane immediately. The moment a keystroke lands in the subject or body, `edited` becomes
  // true and this stops — from then on the text on screen is the operator's and nothing rewrites it.
  // ⚠️ The dependency list deliberately does NOT include `subject`/`body`: this effect writes them, and
  // reading them here would make it re-run on its own output.
  useEffect(() => {
    if (edited) return
    setSubject(applyFills(sourceSubject))
    setBody(applyFills(sourceBody))
  }, [edited, sourceSubject, sourceBody, applyFills])

  /** Discard hand edits and rebuild the message from the template + the current field values. */
  const rerenderFromTemplate = useCallback(() => {
    setSubject(applyFills(sourceSubject))
    setBody(applyFills(sourceBody))
    setEdited(false); setConfirmRerender(false); setLogged(false)
  }, [applyFills, sourceSubject, sourceBody])

  const isEmail = selected?.channel === 'email'
  const finalSubject = applyFills(subject)
  const finalBody = applyFills(body)
  /** 🔴 WHAT ACTUALLY LEAVES THIS WINDOW: the EDITED body with field values applied, AND NOTHING ELSE.
   *  It used to be `composeEmail(finalBody)` for email — body + signature + the mandatory opt-out line.
   *  All three of those now come from the Outlook signature, so appending anything here would send them
   *  twice and would put the opt-out line ABOVE Outlook's signature instead of last. */
  const fullText = finalBody

  // ── mailto ─────────────────────────────────────────────────────────────────────────────────────
  // 🔴 NEWLINES ARE CRLF, NOT LF. RFC 6068 specifies the mailto body as text/plain with CRLF line
  // breaks; `%0A` alone is accepted by some clients and dropped by others, which is how a mailto quietly
  // arrives as one paragraph. 🧪 Costs 6 encoded chars per newline instead of 3 — 14 newlines here, so
  // +42 characters, measured.
  // 🔴 AND THERE IS A LENGTH CEILING. 🧪 Measured on a real rendered example (Azahar, placeholders
  // filled): raw 723 chars -> encoded URL 1163. The practical limit is the ~2083-character URL the
  // Windows shell hands a protocol handler, which Outlook inherits; 2048 is the safe ceiling. At the
  // measured x1.49 encode inflation that leaves room for ~1318 raw body characters. A LONGER hand-edited
  // body would be silently TRUNCATED by the handler — the email opens, missing its last paragraph — so
  // the length is checked before opening and Copy is offered instead. "It opened" is not evidence.
  const MAILTO_URL_CEILING = 2000
  const mailtoUrl = useMemo(() => {
    if (!toEmail) return null
    const crlf = fullText.replace(/\r?\n/g, '\r\n')
    return `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(crlf)}`
  }, [toEmail, finalSubject, fullText])

  // 🔴 COPY IS PLAIN TEXT AGAIN, AND THAT IS A DECISION, NOT AN OVERSIGHT.
  // It briefly wrote text/html alongside text/plain so a paste into Outlook kept a bold signature name
  // and a 10pt opt-out line. Neither is in the message any more — Outlook supplies both — so the HTML
  // flavour would carry nothing but a hard `font-family: Calibri; font-size: 12pt` on the body, and the
  // signature Outlook appends underneath is styled by OUTLOOK. A hard-styled body would therefore arrive
  // in a visibly different font from the signature below it. Plain text lets Outlook style the whole
  // message as one. Fewer moving parts, and no secure-context/ClipboardItem fallback to get wrong.
  // 🔴 COPY IS AN EXIT, AND IT WAS THE UNGUARDED ONE. It had no check of any kind — not even the
  // placeholder warning the other two carry — and for a WhatsApp template it is the ONLY way out, since
  // there is no mailto. So it is guarded first.
  const doCopy = () => {
    if (refusal) { setSendError(refusal); return }
    void navigator.clipboard?.writeText(fullText)
    setCopied(true); setTimeout(() => setCopied(false), 1400)
  }

  // 🔴 SEND OPENS OUTLOOK. IT DOES NOT LOG, AND IT NEVER WILL.
  // Handing a mailto: to the OS tells us one thing: a compose window was requested. It cannot tell us
  // the message was sent, edited, or abandoned. Logging on send would put a row in the contact history
  // for an email that may never have left — and the history is the thing that stops a fourth email.
  // ⚠️ STRUCTURAL, NOT A PROMISE: `onLog` is not referenced anywhere in this function. Grep it.
  const sendNow = () => {
    setPending(null); setSendError(null)
    // 🔴 BEFORE the address and length checks: a malformed token is wrong whether or not the mailto
    // would have opened, and the subject travels in the mailto rather than in `fullText`.
    if (refusal) { setSendError(refusal); return }
    if (!mailtoUrl) { setSendError('This prospect has no email address on the row.'); return }
    if (mailtoUrl.length > MAILTO_URL_CEILING) {
      // Refuse rather than truncate. A handler given an over-long URL still opens — with the end of the
      // body missing — which looks like success.
      setSendError(
        `This message is too long for a mailto link (${mailtoUrl.length} characters encoded, ceiling ${MAILTO_URL_CEILING}). ` +
        `Outlook would open with the end of the body cut off. Use “Copy + footer” and paste it instead.`)
      return
    }
    window.location.href = mailtoUrl
  }
  const doSend = () => {
    if (!body.trim()) return
    // 🔴 WARN, THEN ALLOW. Sending with a placeholder left in may be deliberate.
    if (outstanding.length > 0) { setPending('send'); return }
    sendNow()
  }

  const logNow = async () => {
    setPending(null)
    if (logging || !body.trim()) return
    // 🔴 THE LOG IS A RECORD OF WHAT WAS SENT. Writing a row containing `{{truck name}}` would put a
    // message into the history that was never sent in that form — the same reasoning the placeholder
    // warning already applies to logging, taken to a refusal because this one is never deliberate.
    if (refusal) { setSendError(refusal); return }
    setLogging(true)
    // 🔴 THE EDITED BODY IS WHAT IS LOGGED — `body`, the textarea's current value, never the template's
    // original render. The log records what I actually sent; if the two can diverge, the edited text is
    // the one that matters. The footer is included for email because it is part of what was sent.
    const ok = await onLog(fullText, selected?.channel ?? 'email', selected?.servesKind ?? null)
    setLogging(false)
    if (ok) setLogged(true)
  }
  const doLog = () => {
    if (logging || logged || !body.trim()) return
    // 🔴 SAME WARNING ON LOGGING. A logged body containing [[your rate]] is a record of something that
    // was never sent in that form.
    if (outstanding.length > 0) { setPending('log'); return }
    void logNow()
  }

  if (!mounted) return null
  return createPortal(
    // 🔴 THE z-index IS AN INLINE STYLE, NOT A `z-[85]` CLASS, AND THAT IS THE BUG FIX.
    // It shipped as `className="… z-[85] …"` and the window painted BEHIND the prospect modal. The cause
    // was NOT a stacking context — it was measured: `z-[85]` is an ARBITRARY Tailwind utility that no
    // other file in the repository uses, so the rule `.z-\[85\]` exists only once the JIT has scanned
    // this file. Until it did, the element resolved to `z-index: auto`, and a `position: fixed` element
    // with `auto` paints at the same level as `0` — underneath the modal's `z-50`. Everything else
    // (`fixed`, `inset-0`, `max-w-4xl`) is used by pre-existing files, so the window was still laid out
    // full-viewport and centred; only the paint order was wrong, which is exactly what was observed.
    // 🧪 Proven both ways in a real browser with this component: with the rule the compose panel paints
    // on top; with ONLY that rule deleted, `elementFromPoint` at the centre returns the modal's grid.
    // 🔴 RAISING THE NUMBER WOULD HAVE MADE IT WORSE — `z-[9999]` is another brand-new arbitrary value
    // with the same dependency on a scan having happened. An inline style is not a stylesheet rule, so
    // it cannot be absent from one. The VALUE is unchanged at 85; only its delivery changed.
    <div style={{ zIndex: 85 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      role="presentation">
      {/* 🔴 THE BACKDROP NO LONGER CLOSES THIS WINDOW, AND THE HANDLER IS REMOVED RATHER THAN GUARDED.
          It used to be `onClick={onClose}` with `stopPropagation` on the dialog, so any click that
          missed the panel — including a click that STARTED inside the textarea and ended outside it
          while selecting text — threw the draft away with no warning and no undo.
          ⚠️ A guarded version ("close only when clean") was rejected: a backdrop that sometimes closes
          and sometimes does not is a control nobody can predict, and the window has a Close button two
          inches away. Escape keeps the clean/dirty distinction because it has an accessibility role to
          play; a backdrop click has none.
          🔴 `stopPropagation` ON THE DIALOG IS GONE TOO — it existed only to stop clicks inside the
          panel reaching the backdrop handler that no longer exists. Leaving it would be a guard against
          nothing, and the next reader would have to work out what it was for. */}
      <div role="dialog" aria-modal="true" aria-labelledby="compose-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">

        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <h4 id="compose-title" className="text-base font-semibold text-slate-900 truncate">
            Compose — {truckName}
          </h4>
          <button ref={closeRef} onClick={onClose}
            className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 flex-shrink-0">
            Close
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          <label className="block">
            <span className={LABEL}>Template</span>
            <select className={FIELD} value={templateId} onChange={e => applyTemplate(e.target.value)}>
              <option value="">— none —</option>
              {offerable.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}{t.id === suggestedId ? '  (suggested)' : ''}
                </option>
              ))}
            </select>
          </label>
          {/* 🔴 "COULD NOT READ THE TABLE" AND "THE TABLE HAS NONE" ARE DIFFERENT PROBLEMS AND MUST NOT
              LOOK THE SAME. There is no fallback to built-in copy: if templates cannot be loaded the
              window says so rather than quietly serving something stale from the bundle. */}
          {!templatesLoaded ? (
            <p className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
              <span className="font-bold">Templates could not be loaded.</span> The table may not exist yet,
              or PostgREST may not have reloaded its schema. Nothing is being substituted from the bundle —
              there is no built-in copy any more. You can still write a message by hand below.
            </p>
          ) : offerable.length === 0 && (
            <p className="text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <span className="font-bold">No templates are available for this prospect.</span> Either none
              have been created yet, or the only ones that fit are WhatsApp templates and this prospect is
              not WhatsApp-confirmed. Add or activate one on the Templates tab.
            </p>
          )}
          {!whatsappConfirmed && (
            <p className="text-[11px] text-slate-400 -mt-1">
              WhatsApp templates are hidden: this prospect is not marked WhatsApp-confirmed.
            </p>
          )}

          {/* ── (1) ONE FIELD PER PLACEHOLDER THE SELECTED TEMPLATE CONTAINS ────────────────────────
              🔴 DERIVED, NEVER HARDCODED. `tokens` comes from scanning the current subject + body, so a
              template written later gets its own fields with no code change. Nothing in this file names
              [[link]], [[your rate]] or [[X]]. */}
          {/* ── (1)/(3) THE PLACEHOLDER FIELDS — THE PRIMARY INPUT, STYLED AS SUCH ─────────────────
              🔴 DERIVED FROM THE TEMPLATE, NEVER HARDCODED. Nothing here names [[link]], [[your rate]]
              or [[X]]; `tokens` comes from scanning the render, so a template written later gets its own
              fields with no code change.
              ⚠️ They previously sat on a slate-50 card with slate-500 micro-labels and read as disabled.
              They are now a white card with an orange rule, real labels, and an amber ring on anything
              still empty — needing attention rather than inert. */}
          {tokens.length > 0 && (
            <div className="rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2.5 border-l-4 border-l-orange-500">
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Fill in before sending</p>
                <span className={`text-[11px] font-semibold ${outstanding.length ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {tokens.length - outstanding.length} of {tokens.length} done
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {tokens.map(t => {
                  const filled = !!(fills[t] ?? '').trim()
                  return (
                    <label key={t} className="block">
                      <span className="flex items-center gap-1.5 mb-1">
                        <span className="text-[12px] font-semibold text-slate-800">{t}</span>
                        {!filled && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">needed</span>
                        )}
                        {/* 🔴 A DEFAULTED VALUE MUST NOT LOOK LIKE A TYPED ONE. This is the only thing
                            standing between a stale rate and an email that reads as correctly filled. */}
                        {/* 🔴 THE BADGE NAMES ITS SOURCE, BECAUSE THERE ARE NOW TWO. A value can arrive from this
                            template’s own stored default OR from the global default set once on the Templates tab.
                            Showing "from default" for both would let a stale global hide behind a field that looks
                            freshly filled — the exact risk of two sources for one value. The template layer keeps its
                            age badge; the global layer says GLOBAL and carries NO age, because localStorage stores no
                            timestamp and inventing one would be worse than admitting there is none. */}
                        {filled && fillSource[t] === 'global' && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-800"
                            title="Pre-filled from your GLOBAL default (Templates tab → Global defaults), not from this template. A value stored on the template itself overrides it. Editing here changes neither.">
                            from global
                          </span>
                        )}
                        {filled && fillSource[t] !== 'global' && fromDefault[t] !== undefined && (
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              defaultIsStale(fromDefault[t]) ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-800'}`}
                            title={defaultIsStale(fromDefault[t])
                              ? 'This default has not been changed in over 60 days. Check it is still correct before sending.'
                              : 'Pre-filled from this template’s stored default. Editing it here does not change the stored value.'}>
                            from default{fromDefault[t] ? ` · ${fmtDefaultDate(fromDefault[t])}` : ''}
                            {defaultIsStale(fromDefault[t]) ? ' · stale' : ''}
                          </span>
                        )}
                      </span>
                      {/* 🔴 `type="text"` IS LOAD-BEARING. The unlayered rule in globals.css selects
                          `input[type="text"]` — an ATTRIBUTE selector — so an input that omits it escapes
                          the rule, renders 14px against every other field's 16px, and zooms on focus on
                          iOS. That bug was introduced and caught on the subject field earlier in this
                          series; these fields do not repeat it. */}
                      <input
                        type="text"
                        placeholder={`[[${t}]]`}
                        value={fills[t] ?? ''}
                        onChange={e => { setFills(f => ({ ...f, [t]: e.target.value })); setFillsTouched(true); setFromDefault(d => ({ ...d, [t]: undefined as unknown as string | null })); setFillSource(f => ({ ...f, [t]: null })); setLogged(false); setPending(null); setSendError(null) }}
                        className={`w-full rounded-lg px-2.5 py-2 text-sm bg-white border-2 focus:outline-none focus:ring-2 ${
                          filled
                            ? 'border-slate-300 text-slate-900 focus:ring-slate-400'
                            : 'border-amber-400 bg-amber-50/40 focus:ring-amber-400'}`}
                      />
                    </label>
                  )
                })}
              </div>
              {edited && (
                <p className="mt-2 text-[11px] text-slate-500">
                  These no longer change the message below — see the notice under it.
                </p>
              )}
            </div>
          )}

          {isEmail && (
            <label className="block">
              <span className={LABEL}>Subject</span>
              {/* 🔴 `type="text"` IS LOAD-BEARING, NOT DECORATION. The unlayered rule in globals.css
                  selects `input[type="text"]` — an ATTRIBUTE selector, which does NOT match an input
                  that omits the attribute. 🧪 Measured: without it this box renders at 14px while every
                  other field in the app renders at 16px, and it would zoom on focus on iOS, which is the
                  very thing that rule exists to prevent. */}
              <input type="text" className={FIELD} value={subject}
                onChange={e => { setSubject(e.target.value); setEdited(true); setLogged(false) }} />
            </label>
          )}

          <label className="block">
            <span className={LABEL}>Message — exactly what will be sent (the footer is added below)</span>
            {/* 🔴 SIZED WITH `rows`, NOT WITH A FONT CLASS. The unlayered !important rule in globals.css
                forces `font-size: inherit` on every textarea on desktop, so `text-sm` here is INERT and
                the box renders at 16px whatever class it carries. `rows` sets the visible line count and
                is untouched by that rule, so it is the only reliable way to make this box tall enough to
                read a whole email without scrolling it. */}
            <textarea rows={18} className={`${FIELD} resize-y font-normal leading-relaxed`}
              placeholder="Choose a template above, or write here."
              value={body} onChange={e => { setBody(e.target.value); setEdited(true); setLogged(false) }} />
          </label>

          {/* Shrinks as fields are filled and disappears at zero — it counts `outstanding`, which is
              tokens MINUS those with a value, so it tracks the fields rather than the raw text. */}
          {outstanding.length > 0 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              <span className="font-bold">Still to fill ({outstanding.length}):</span>{' '}
              {outstanding.map(u => `[[${u}]]`).join(', ')}
            </p>
          )}

          {/* ── (2) THE PRECEDENCE STATE, MADE VISIBLE ────────────────────────────────────────────
              🔴 WITHOUT THIS NOTICE THE RULE IS INVISIBLE, and discovering it mid-edit is how work is
              lost. While it is absent, the fields drive the message. While it is showing, they do not.
              The way back is explicit and warns first — it never discards silently. */}
          {edited && (
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
              {!confirmRerender ? (
                <div className="flex items-center gap-3">
                  <p className="text-[12px] text-slate-700 flex-1">
                    <span className="font-bold">You have edited this message.</span>{' '}
                    The fields above no longer change it — your text wins.
                  </p>
                  <button onClick={() => setConfirmRerender(true)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 flex-shrink-0">
                    Rebuild from template
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-[12px] text-amber-900 flex-1">
                    <span className="font-bold">This will discard your edits</span> and rebuild the message
                    from the template with the current field values.
                  </p>
                  <button onClick={() => setConfirmRerender(false)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 flex-shrink-0">
                    Keep my edits
                  </button>
                  <button onClick={rerenderFromTemplate}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 flex-shrink-0">
                    Discard and rebuild
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0 space-y-2">
          {/* 🔴 SHOWN WHETHER OR NOT A BUTTON HAS BEEN PRESSED. The three exits refuse, but a refusal the
              operator only meets after clicking is a worse experience than a line that is simply there —
              and this one names the offending span so it can be found in the text above. */}
          {!dncNotice && malformed.length > 0 && (
            <p className="text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
              <span className="font-bold">Cannot send — unreadable token{malformed.length > 1 ? 's' : ''}:</span>{' '}
              <code className="font-mono">{malformed.join('  ')}</code>{' '}
              — this would arrive with the braces in it. Tokens are lower-case with underscores, e.g.{' '}
              <code className="font-mono">{'{{truck_name}}'}</code>.
            </p>
          )}
          {/* 🔴 SHOWN FIRST AND ALONE WHEN IT APPLIES. A do-not-contact prospect does not need to be
              told about its tokens as well; the only useful next action is to untick the flag. */}
          {dncNotice && (
            <p className="text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
              <span className="font-bold">Cannot send — do not contact:</span> {dncNotice}
            </p>
          )}
          {/* 🔴 THE SAME TREATMENT AS THE MALFORMED LINE, BECAUSE IT IS THE SAME KIND OF STOP — shown
              before any button is pressed, and it names the prospect so the message is actionable
              rather than abstract. */}
          {!dncNotice && blockingNotice && (
            <p className="text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
              <span className="font-bold">Cannot send — no demo link:</span> {blockingNotice}
            </p>
          )}
          {/* 🔴 A TEMPLATE THAT SETS THE LOGGED RUNG SAYS SO, BEFORE Log is pressed. Fixing the Pizza
              Mondo defect by making the template win is only half the job — a template silently
              overriding the operator’s dropdown is the same class of surprise pointing the other way.
              Shown only when the two actually differ, so a tagged template that agrees with the form
              adds no noise. */}
          {selected?.servesKind && selected.servesKind !== logFormKind && (
            <p className="text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              This template logs as <span className="font-semibold">{kindLabel(selected.servesKind)}</span>,
              not <span className="font-semibold">{kindLabel(logFormKind)}</span> — it is tagged for that rung.
            </p>
          )}
          {sendError && (
            <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">{sendError}</p>
          )}

          {/* 🔴 (3) THE UNFILLED-PLACEHOLDER WARNING — IT NAMES THEM, AND IT LETS ME THROUGH.
              Rendered INLINE rather than as a nested dialog on purpose: a second portalled overlay above
              this one would need its own Escape handling and its own place in the z-order, and this
              window already sits at 85. An inline strip has neither problem. */}
          {pending && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-[12px] text-amber-900">
                <span className="font-bold">
                  {outstanding.length} placeholder{outstanding.length === 1 ? '' : 's'} still unfilled:
                </span>{' '}
                {outstanding.map(u => `[[${u}]]`).join(', ')}.{' '}
                {pending === 'send'
                  ? 'They will appear in the email exactly as shown.'
                  : 'They will be stored in the contact log exactly as shown.'}
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setPending(null)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400">
                  Go back
                </button>
                <button onClick={() => { if (pending === 'send') sendNow(); else void logNow() }}
                  className="text-sm font-bold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {pending === 'send' ? 'Send anyway' : 'Log anyway'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              {/* 🔴 (4) SAID ON THE SCREEN, NOT ONLY IN THE REPORT. */}
              Send opens Outlook; it does not log. Logging stays a separate press.
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={doCopy} disabled={!body.trim()}
                title="Copies the message body. Your Outlook signature supplies the sign-off, your details and the opt-out line."

                className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400">
                {copied ? 'Copied' : 'Copy'}
              </button>
              {/* ⚠️ THE SENDING ACCOUNT IS NOT OURS TO CHOOSE, AND NO STRING HERE CAN CHANGE IT.
                  A mailto: is handed to the OS and then to the default mail client, and the CLIENT picks
                  the account: Outlook always composes from its DEFAULT account and ignores a `from=`
                  parameter (RFC 6068 sanctions only to/cc/bcc/subject/body). Nor is there a web-compose
                  deep link that could pin it — account pinning exists for Gmail (`authuser=`) and for
                  Microsoft 365 tenants, and this mailbox is Namecheap-hosted. The account is therefore
                  set once in Outlook, not here; the tooltip says so rather than leaving it a mystery. */}
              {isEmail && (
                <button onClick={doSend} disabled={!body.trim() || !toEmail}
                  title={toEmail
                    ? `Open a new message to ${toEmail} in your default mail client. It will send from Outlook's DEFAULT account — set that to dominic@hatchgrab.com in Outlook if it is not already.`
                    : 'This prospect has no email address'}
                  className="text-sm font-bold px-3 py-1.5 rounded-lg border border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  Email
                </button>
              )}
              <button onClick={doLog} disabled={logging || logged || !body.trim()}
                className="text-sm font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
                {logging ? 'Logging…' : logged ? 'Logged ✓' : 'Log as outbound contact'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Same classes the modal's own fields use, so this window matches the form it replaces.
const FIELD = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm'
const LABEL = 'block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5'
