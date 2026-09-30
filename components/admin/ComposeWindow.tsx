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
// 🔴 THE SIGNATURE COMES FROM THE MODULE THE SERVER APPENDS FROM. It is pure — no node, no network —
// so the compose window can render exactly what will be sent rather than a hand-kept copy of it.
// 🔴 THE EXPANSION USED BY COPY AND LOG IS THE SENDER'S OWN. A `{{signature}}` must never reach the
// clipboard or the contact log as four literal characters — the log is the record of what was sent.
import { parseSignature, parseOptOut } from '@/lib/outreach-signature'
// 🔴 THE DOCUMENT IS THE MESSAGE NOW. The box shows the email as it will arrive and the server turns
// this same document into the two MIME parts — see lib/outreach-doc.ts for why it is a document and
// not HTML on the wire.
import {
  docFromTemplateText, docToText, docPlainText, literalTokenRefusal, optOutWarning,
  EMPTY_DOC, type EmailDoc, type DocLine,
} from '@/lib/outreach-doc'
import RichEmailEditor from '@/components/admin/RichEmailEditor'
import {
  renderTemplate, unresolvedIn, malformedTokensIn, isMustResolveToken, applyPlaceholderFills, defaultFillsOf, fillSourceOf,
  type MessageTemplate, type TemplateContext,
} from '@/lib/outreach-template-render'
import { kindLabel } from '@/lib/outreach'   // one vocabulary, one labeller
import { snippetMapOf, type Snippet } from '@/lib/outreach-snippets'
import { SizedEmailFrame, GrowingTextarea } from '@/components/admin/outreach-shared'
// ── 🔴 THE ATTACHMENT AND REPLY RULES LIVE IN lib/, NOT HERE ───────────────────────────────────────
// "What may be attached", "how big is too big" and "who may a reply be addressed to" are decisions,
// and the server applies every one of them again. These imports are so the WINDOW refuses the same
// things the route refuses — a picker that accepts a 40 MB file and a route that rejects it is a
// worse experience than one that says so before the upload.
import {
  ALLOWED_ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES, attachmentSetRefusal, uploadRefusal, mb,
  type OutboundAttachment,
} from '@/lib/outreach-attachments'
import { replySubject } from '@/lib/outreach-mail-message'
import { sendButtonLabel } from '@/lib/outreach-sequence'
import {
  COMPOSE_BOX_HEIGHT_KEY, COMPOSE_DEFAULT_PX, clampComposeHeight, validComposeHeight,
} from '@/lib/outreach-workspace'

/** The message a reply answers. Everything the window needs to show before the server is asked. */
export interface ReplyTarget {
  /** The `outreach_messages` row id. The send route re-reads it and checks it belongs here. */
  messageId: string
  subject: string | null
  /** Who wrote it. Becomes the To, and the route checks it against what it holds. */
  fromAddress: string | null
  date: string | null
}

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
    fillSource: {} as Record<string, 'snippet' | 'template' | null> }
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
    ) as Record<string, 'snippet' | 'template' | null>,
  }
}

/**
 * A short stable hash of a string — FNV-1a, hex. Used only to key the idempotency token to the exact
 * message; it is not a security primitive and does not need to be one.
 */
function hashKey(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}

/** "11 Sep 2026, 13:07" — enough to recognise which email, in the timezone the mail is read in. */
function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d)
}

/**
 * The earlier email this one will reply to, as the SERVER sees it.
 *
 * 🔴 THE SERVER DECIDES WHETHER THIS IS A CHASE, not the browser. It is the same `threadParent` lookup
 * the send itself uses — most recent non-test outbound message the server accepted — so the line that
 * says "sends as a reply to …" cannot name a different email from the one actually quoted.
 * ⚠️ NO BODY HERE. The quoted HTML is fetched only if Show is pressed, because it may need an IMAP
 * read, and opening the compose window must not open a mailbox connection.
 */
interface Thread {
  subject: string
  replySubject: string
  date: string | null
}

export default function ComposeWindow({
  truckName, prospectId, toEmail, offerable, suggestedId, initialTemplateId, doNotContact, ctx,
  whatsappConfirmed, templatesLoaded, logFormKind, snippets, onClose, onLog, onSent, replyTo,
  inline, onDirtyChange, followUpDate, sendLabelSuffix, hideCopyAndLog, contactName, stepKind, sequenceNote,
  inConversation,
}: {
  truckName: string
  /** 🔴 THE PROSPECT THE SERVER SENDS TO. The browser never names a recipient: it sends this id and the
   *  route reads the address off the truck row itself, so a stale address on screen cannot become the
   *  envelope, and every refusal — do-not-contact, a linked HatchGrab truck — is applied server-side
   *  where it cannot be skipped by a client that does not know about it. */
  prospectId: string
  /** The prospect's address, for display only. Null when the row has none. */
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
  /** 🔴 THE SNIPPET LIBRARY, loaded once by the panel. A name with a non-blank value pre-fills its
   *  field; a blank one, or a name with no snippet, prompts exactly as before. */
  snippets?: Snippet[]
  /** Fired after the server reports a real send, so the panel re-reads the list and the modal. */
  onSent?: () => void | Promise<void>
  /**
   * 🔴 REPLY MODE. Present ⇒ this window answers ONE specific message rather than composing the next
   * rung: the subject, the recipient and the thread all come from it, the rung is `reply`, and the
   * conversation is shown expanded below the editor instead of behind a Show toggle.
   * ⚠️ THE SERVER RE-CHECKS EVERY ONE OF THOSE. This object decides what the window displays; the
   * route reads the message row itself and refuses an id that is not this prospect's, a test send,
   * or a recipient that is neither the truck's address nor one that has written to us.
   */
  replyTo?: ReplyTarget | null
  /**
   * 🔴 RENDER IN PLACE INSTEAD OF OVER THE PAGE. The prospect workspace puts this above the timeline
   * it is answering; a floating panel would cover the conversation it exists to reply to. NOTHING
   * ELSE CHANGES — the same fields, the same guards, the same refusals, the same send.
   * ⚠️ Omitted ⇒ the portalled window, byte for byte as before, for any caller that still wants one.
   */
  inline?: boolean
  /** Tells the host whether there is unsaved text, so switching panels can ask before discarding. */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * 🔴 THE ONE FOLLOW-UP DATE, OWNED BY THE PAGE. The window does not choose it and does not hold a
   * second picker; it puts the chosen date on the Send button so the consequence of pressing it is
   * visible before it is pressed. The value still reaches the server the one way it always has —
   * through `onLog`'s caller, which writes `next_action_at` in one place.
   */
  followUpDate?: string | null
  /** "· follow up 3 Oct" — composed by the page from the same date. */
  sendLabelSuffix?: string | null
  /** The page's action bar owns Copy and Log-as-contact; the inline composer does not repeat them. */
  hideCopyAndLog?: boolean
  /** "To Stephen" rather than "To stephen@…" on the header line. Display only. */
  contactName?: string | null
  /**
   * 🔴 THE STEP THIS SEND IS FOR, FROM THE PAGE'S ONE `nextStep`. It decides the logged rung and the
   * Send button's words. It used to be the selected TEMPLATE's `serves_kind` tag, so opening a
   * template tagged "chase 1" for a first contact logged a chase-1 rung and skipped a step.
   * ⚠️ The SERVER re-derives it and its answer wins; this is what the button says it will do.
   */
  stepKind?: string | null
  /** One line under the chips: which box the pre-selection came from, or why there was none. */
  sequenceNote?: string | null
  /**
   * 🔴 HAS THE PROSPECT WRITTEN BACK? Replying to MY OWN email is not a conversation — it is the
   * step the ladder is on, and it is logged and guarded as that step. Only an inbound message makes
   * a send a `reply`. ⚠️ The SERVER decides this again from the rows; this is what the button says.
   */
  inConversation?: boolean
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
  // 🔴 THE SNIPPET LIBRARY IS FETCHED BY THE PANEL AND PASSED IN, not read from storage here. The
  // layer it replaces lived in localStorage and was therefore per-browser; a library has to be the
  // same for every window that opens, so it comes from the table through the parent.
  const globalsSeed = useMemo(() => snippetMapOf(snippets ?? []), [snippets])
  const [seed] = useState(() => seedFrom(initialTemplateId, offerable, ctx, globalsSeed))
  const [templateId, setTemplateId] = useState(seed.id)
  const [moreOpen, setMoreOpen] = useState(false)
  /** 🔴 The focused writing view. Esc returns — see the key handler below. */
  const [expanded, setExpanded] = useState(false)
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
  const [fillSource, setFillSource] = useState<Record<string, 'snippet' | 'template' | null>>(seed.fillSource)
  // Which action is waiting on the unfilled-placeholder confirmation: null | 'send' | 'log'.
  const [pending, setPending] = useState<null | 'send' | 'test' | 'log'>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [logging, setLogging] = useState(false)
  // 🔴 A SUCCESSFUL LOG DOES NOT CLOSE THE WINDOW — see the header comment on what closes it — so the
  // button has to say it already fired, or a second press silently writes a second contact row. Editing
  // the text again clears this, because changed text is a different message.
  const [logged, setLogged] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  /**
   * 🔴 THE DOUBLE-SUBMIT GUARD. A ref, NOT state, because only a ref is written and read in the same
   * synchronous turn — see `logNow`. Never reset on re-render, released in `logNow`'s `finally`.
   */
  const logInFlight = useRef(false)
  /** 🔴 THE SAME GUARD FOR SENDING, and here it stops an EMAIL rather than a row. */
  const sendInFlight = useRef(false)

  // ── THE SERVER SEND ─────────────────────────────────────────────────────────────────────────────
  const [thread, setThread] = useState<Thread | null>(null)
  /** The earlier conversation. 🔴 EXPANDED BY DEFAULT — see the note where it is rendered. */
  const [quoted, setQuoted] = useState<string | null>(null)
  /* 🔴 COLLAPSED BY DEFAULT (v5). It opened expanded, which pushed the Send row and the history off
   * the screen on every chase — and what it shows is an email already sent, which is reference, not
   * the thing being written. ⚠️ IT IS STILL EXACTLY WHAT IS SENT: the block below is rendered from
   * the SAME stored body the server quotes. */
  const [quotedOpen, setQuotedOpen] = useState(false)
  /** "Include previous email" — on by default, and it never affects the threading headers. */
  const [includeQuote, setIncludeQuote] = useState(true)
  const [quotedLoading, setQuotedLoading] = useState(false)
  /** The files this email will carry. Metadata only — the bytes are already in the bucket. */
  const [files, setFiles] = useState<OutboundAttachment[]>([])
  const [fileBusy, setFileBusy] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── THE EMAIL BOX'S REMEMBERED HEIGHT ──────────────────────────────────────────────────────
     🔴 READ ONCE, IN AN EFFECT, AND CLAMPED TO THIS WINDOW. Reading localStorage during render is
     a hydration mismatch — the server has no storage — so the box paints at the default and takes
     the remembered height on mount. ⚠️ A height saved on a 27" monitor is clamped to 80% of
     whatever window is open now rather than being thrown away: it is still a real choice.
     ⚠️ ONLY A DRAG WRITES. The value goes back to storage when the grip is released and the height
     actually changed — never on a click, a keystroke or a window resize. Persisting on every
     ResizeObserver callback would freeze whatever the default happened to be on the first visit and
     make the default impossible to change afterwards without clearing everybody's storage. */
  const [boxHeight, setBoxHeight] = useState(COMPOSE_DEFAULT_PX)
  useEffect(() => {
    // ⚠️ IN A MICROTASK, AFTER MOUNT — the same shape the timeline's stored filter uses. Reading
    // storage during render is a hydration mismatch; setting state synchronously in an effect body
    // is the cascading-render pattern this repo lints against.
    void Promise.resolve().then(() => {
      let px: number | null = null
      try { px = validComposeHeight(window.localStorage.getItem(COMPOSE_BOX_HEIGHT_KEY), window.innerHeight) } catch { /* private mode */ }
      if (px) setBoxHeight(px)
    })
  }, [])
  const rememberHeight = useCallback((px: number) => {
    const clamped = clampComposeHeight(px, typeof window === 'undefined' ? 800 : window.innerHeight)
    setBoxHeight(clamped)
    try { window.localStorage.setItem(COMPOSE_BOX_HEIGHT_KEY, String(clamped)) } catch { /* nothing to remember, no crash */ }
  }, [])
  const [sendingOff, setSendingOff] = useState<string | null>(null)
  /**
   * 🔴 THE SIGNATURE ROWS, FOR COPY AND LOG ONLY. The SEND does not use these — the server reads the
   * table itself at send time, so a stale browser copy can never become the email. They are here
   * because Copy and Log-only have no server round trip and must still not emit a raw token.
   */
  const [settings, setSettings] = useState<{ signatureLines: DocLine[]; optOut: string | null }>(
    { signatureLines: [], optOut: null })
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  /**
   * 🔴 THE EMAIL, AS A DOCUMENT. For an email this — not `body` — is what is sent. `body` remains the
   * plain-text pipeline the template, the fields and WhatsApp all run on, and the document is rebuilt
   * from it until the operator types in the editor, at which point `edited` is true and the existing
   * precedence rule ("your text wins") takes over, exactly as it always has for the textarea.
   */
  const [editedDoc, setEditedDoc] = useState<EmailDoc | null>(null)
  const [confirmSend, setConfirmSend] = useState<null | 'real' | 'test'>(null)
  /** The server's guards, as returned, and which send they answered. Null ⇒ none are outstanding. */
  const [guards, setGuards] = useState<null | { list: { id: string; kind: string; message: string }[]; test: boolean }>(null)
  const [sending, setSending] = useState(false)
  const [sentNote, setSentNote] = useState<string | null>(null)
  /**
   * 🔴 ONE KEY PER EXACT MESSAGE. The server refuses a second send carrying a key it has already seen
   * and hands back the first one's verdict, so a double press — or a press after a reply that never
   * arrived — cannot produce a second email. It is regenerated only when the text changes, because
   * changed text is a different message and deserves to go.
   */
  const idemRef = useRef<{ forKey: string; value: string } | null>(null)

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

  /* ── 🔴 THE SCROLL LOCK BELONGS TO A WINDOW, AND THIS HAS NOT BEEN ONE SINCE v2 ────────────────
   * THIS WAS THE BUG THAT STOPPED THE PROSPECT PAGE SCROLLING AT ALL. The effect ran on mount and
   * released only on unmount; the prospect page mounts this composer INLINE and never unmounts it,
   * so `document.body { overflow: hidden }` was set the moment the page rendered and stayed set for
   * ever. Nothing about the reading panel was involved — it was never opened. A modal's lock,
   * inherited by something that is no longer a modal.
   * ⚠️ IT IS STILL RIGHT FOR THE TWO THINGS THAT ARE OVER THE PAGE: the portalled window and the ⤢
   * full-window writing view. Both cover the viewport, and a page scrolling underneath a cover is
   * the thing this prevents.
   * ⚠️ THE PREVIOUS VALUE IS RESTORED, not reset to '', so a caller that had already locked the body
   * is not silently unlocked. */
  useEffect(() => {
    if (inline && !expanded) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [inline, expanded])

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
    setEditedDoc(null)          // a different template replaces the message, box and all
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
  /**
   * 🔴 THE GUARDS READ WHAT IS ON SCREEN, WHICH FOR AN EMAIL IS NOW THE DOCUMENT. `unresolvedIn`,
   * `malformedTokensIn` and `isMustResolveToken` are the SAME functions as before — §58.2 records what
   * happened the one time a guard was re-implemented next to the thing it guards — they are simply
   * handed the document's text instead of the textarea's.
   */
  // ⚠️ Declared here rather than reusing `isEmail`, which is defined further down with the rest of the
  // send-side derivations; moving that up would reorder a block the re-substitution effect depends on.
  /* 🔴 THE CHANNEL IS THE WINDOW'S, NOT THE SELECTED TEMPLATE'S — AND THAT ONE `?.` WAS THE WHOLE
   * OF THE "the Email tab looks like the old composer" BUG. It read `selected?.channel === 'email'`,
   * so with **Blank** chosen — no template selected — it was FALSE, and every block behind `isEmail`
   * vanished: the To line, the subject, the attachments, the Send row, and the rich editor itself,
   * which fell back to the plain WhatsApp textarea with its old placeholder and its `rows={18}`.
   * Nothing was stale and nothing was unset: the composer was rendering its NON-EMAIL branch on the
   * Email tab, and it had done since the day reply-mode landed.
   * ⚠️ THE ONLY CALLER IS THE PROSPECT PAGE'S EMAIL TAB, so the fallback is `email`. A selected
   * WhatsApp template still takes the textarea — that branch is unchanged and is what it is for. */
  const isEmailChannel = (selected?.channel ?? 'email') === 'email'
  // 🔴 THE FIELD VALUES ARE APPLIED HERE, ABOVE EVERYTHING THAT READS THE MESSAGE. These two used to
  // be declared a hundred lines further down, next to the send; the document has to be derived before
  // the guards run, and the document is derived from these, so they moved up rather than being
  // computed twice under two names.
  const finalSubject = applyFills(subject)
  const finalBody = applyFills(body)
  // ⚠️ THE DOCUMENT IS DERIVED HERE, ABOVE THE GUARDS, because the guards read it — they check what is
  // on screen, and for an email what is on screen is the document.
  /**
   * 🔴 THE DOCUMENT IS DERIVED, NOT SYNCHRONISED. The first version of this was a `useEffect` that
   * called `setDoc` whenever the template text changed — which is the `set-state-in-effect` pattern
   * this repository already carries eleven of, and it would have made twelve. A `useMemo` is the same
   * rule expressed as a derivation: while the operator has not touched the editor, the document IS the
   * template render; the first keystroke in the box stores a document and that one wins from then on.
   * ⚠️ IT WAITS FOR THE SETTINGS. Building before they arrive would put an empty signature in the box.
   */
  const templateDoc = useMemo(
    () => (isEmailChannel && settingsLoaded ? docFromTemplateText(finalBody, settings) : EMPTY_DOC),
    [isEmailChannel, settingsLoaded, finalBody, settings])
  const doc = editedDoc ?? templateDoc

  const guardText = useMemo(
    () => (isEmailChannel ? `${subject}\n${docPlainText(doc)}` : `${subject}\n${body}`),
    [isEmailChannel, subject, doc, body])
  const outstanding = useMemo(() => unresolvedIn(guardText), [guardText])

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
  /**
   * 🔴 A LITERAL `{{signature}}` TYPED INTO THE BOX IS A REFUSAL. Nothing expands tokens at send time
   * any more, so those thirteen characters would be emailed verbatim. The sentence names the button.
   */
  const literalNotice = useMemo(
    () => (isEmailChannel ? literalTokenRefusal(doc) : null), [isEmailChannel, doc])
  const refusal = dncNotice ?? malformedNotice ?? blockingNotice ?? literalNotice

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
    setEditedDoc(null)          // "discard my edits" includes the ones made in the editor
    setEdited(false); setConfirmRerender(false); setLogged(false)
  }, [applyFills, sourceSubject, sourceBody])

  const isEmail = isEmailChannel
  /** 🔴 WHAT ACTUALLY LEAVES THIS WINDOW: the EDITED body with field values applied, AND NOTHING ELSE.
   *  It used to be `composeEmail(finalBody)` for email — body + signature + the mandatory opt-out line.
   *  All three of those now come from the Outlook signature, so appending anything here would send them
   *  twice and would put the opt-out line ABOVE Outlook's signature instead of last. */
  const fullText = finalBody


  /** The message as plain text: from the DOCUMENT for an email, from the textarea for WhatsApp. */
  const plainForHumans = useMemo(
    () => (isEmail ? docToText(doc) : fullText), [isEmail, doc, fullText])
  /**
   * 🔴 WHY SEND IS OFF, IN ONE PLACE AND IN PRIORITY ORDER — and each is a SENTENCE, because it is
   * shown on hover to somebody wondering what is missing. Neither button is ever hidden: an absent
   * control says nothing at all, and the whole of item 0 was blocks that vanished.
   * ⚠️ `hasText` READS THE DOCUMENT FOR AN EMAIL, not the template body. `body` holds the template
   * render, so a hand-typed blank email leaves it empty for ever; guarding on `body` would have
   * disabled Send permanently the moment this row started rendering for blank emails.
   */
  const hasText = plainForHumans.trim().length > 0
  const testBlock: string | null =
    sendingOff ? sendingOff
    : !isEmail ? 'This is a WhatsApp message — log it from the WhatsApp tab'
    : !hasText ? 'Write something, or pick a template, first'
    : null
  const sendBlock: string | null =
    testBlock ?? (!toEmail ? 'This prospect has no email address' : null)

  /**
   * ⚠️ ONE WARNING NOW, AND IT IS A WARNING. The "no {{signature}}" warning is gone — he can SEE the
   * signature in the box, so telling him it is missing would be telling him what he is looking at.
   * The opt-out warning stays, because its absence is the thing that is easy not to notice.
   */
  const warnings = useMemo(() => {
    if (!isEmail) return []
    const w = optOutWarning(doc, selected?.servesKind ?? logFormKind, settings.optOut)
    return w ? [w] : []
  }, [isEmail, doc, selected?.servesKind, logFormKind, settings.optOut])

  // ── THE SERVER SEND ─────────────────────────────────────────────────────────────────────────────
  // 🔴 THE mailto: PATH IS GONE, AND WITH IT EVERY REASON IT EXISTED. A mailto could report one thing
  // only — that a compose window was requested — so it could not be logged, could not be threaded onto
  // the last email, could not carry more than ~1300 characters, and depended on whichever account
  // Outlook happened to default to. The route sends from the mailbox itself over SMTP, files a copy in
  // Sent, and knows whether the server accepted it.
  // ⚠️ WHAT HAS NOT CHANGED: Copy is the same plain-text copy, and Log is the same single writer. This
  // window still sends NOTHING on its own — a send is a press of Send, and Send asks first.

  // 🔴 THE PREVIEW PANE AND ITS "BUILD PREVIEW" STEP ARE GONE (29 September 2026), AT DOMINIC'S
  // INSTRUCTION. The pane rendered the server's own HTML under the box and Send stayed disabled until
  // it matched the text — one press became two, and what it showed was the message he had just typed.
  // ⚠️ WHAT IT WAS PROTECTING IS STILL PROTECTED, and by something stronger than a preview: the SERVER
  // builds the final message from the text in the box, at send time, with every refusal already run.
  // The browser never assembles a message, so there is no second implementation to diverge — which was
  // the actual argument for the preview, and it survives the preview's removal.
  // What is shown instead is what Dominic cannot see in his own textarea: the signature that gets
  // appended, and the fact that a chase attaches to an earlier email.

  /**
   * The rung the server should log. A tagged template states its own; otherwise the log form's.
   * 🔴 A REPLY OVERRIDES BOTH, AND THE SERVER DECIDES THE SAME THING INDEPENDENTLY. `reply` is not
   * one of `CONTACT_KINDS`, so §57 counts no rung for it: answering somebody neither advances the
   * chase sequence nor restarts it. It also means `optOutWarning` is silent here, because that
   * warning is for ladder rungs — a reply to a person who just wrote to you does not carry an
   * opt-out sentence.
   */
  // 🔴 THE STEP, NOT THE TEMPLATE'S TAG (3h). `selected?.servesKind ?? logFormKind` meant the WORDS
  // chosen decided which rung was recorded: picking the chase-1 template for a first contact logged
  // a chase-1 rung, and the ladder skipped a step for ever after. The step comes from the page's one
  // `nextStep`, and the server re-derives it and overrules this if they differ.
  // 🔴 A REPLY TO SOMEBODY WHO WROTE IS `reply`; FOLLOWING UP ON MY OWN EMAIL IS THE STEP. The
  // server re-derives both and overrules this; what it changes here is what the button says it will
  // do, which must not say "Send reply" about something that logs as Chase 1.
  const kindForSend = (replyTo && inConversation) ? 'reply' : (stepKind ?? logFormKind)

  /** Who a reply goes back to: the message's own From, which may be a different mailbox at the same
   *  business from the one stored on the truck. ⚠️ Display only — the route re-derives and re-checks it. */
  const toEmailForReply = replyTo?.fromAddress ?? null

  /**
   * Which templates get a chip, and which go behind More.
   * 🔴 THE STEP'S OWN TEMPLATE FIRST, THEN THE SUGGESTION, THEN THE REST — all three orderings come
   * from values computed upstream (`templateForStep` for the first, `suggestTemplateId` for the
   * second). This sorts; it does not decide.
   */
  const { primaryTemplates, moreTemplates } = useMemo(() => {
    const rank = (t: MessageTemplate) =>
      t.id === initialTemplateId ? 0 : t.id === suggestedId ? 1 : 2
    const sorted = [...offerable].sort((a, b) => rank(a) - rank(b))
    return { primaryTemplates: sorted.slice(0, 3), moreTemplates: sorted.slice(3) }
  }, [offerable, initialTemplateId, suggestedId])

  // ⚠️ ONE SIGNAL, DERIVED FROM WHAT IS ALREADY TRACKED. `edited` is set by every keystroke in the
  // editor and cleared on a template change; the host only needs to know whether discarding would
  // lose something a person typed.
  useEffect(() => { onDirtyChange?.(edited && !logged) }, [edited, logged, onDirtyChange])


  const post = useCallback(async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/outreach/mail-send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect_id: prospectId, ...payload }),
    })
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> }
  }, [prospectId])

  // On open: is this a chase, and is sending available at all? One GET, no mailbox connection.
  // ⚠️ REPLY MODE SKIPS IT ENTIRELY. The parent is not "the latest message in the thread" — it is the
  // specific message the Reply button was pressed on, and asking the server which email a CHASE
  // would attach to could name a different one (another reply may have arrived since).
  useEffect(() => {
    if (!isEmail || replyTo) return
    let live = true
    void (async () => {
      // 🔴 THE RUNG TRAVELS WITH THE QUESTION. A first contact NEVER threads, and the window has to
      // apply the same rule the send applies or it will promise a reply the send will not make — or,
      // as happened, show nothing while the send quietly produced "Re: Test email to me again".
      const q = new URLSearchParams({ prospect_id: prospectId })
      if (kindForSend) q.set('kind', kindForSend)
      const r = await fetch(`/api/admin/outreach/mail-send?${q.toString()}`).catch(() => null)
      if (!r || !live) return
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (!live) return
      if (j.ok !== true) { setSendingOff(String(j.refusal ?? 'Sending is unavailable.')); return }
      const t = j.thread as Thread | null | undefined
      setThread(t ?? null)
      setQuoted(null); setQuotedOpen(false)      // a different parent means a different quote
    })()
    return () => { live = false }
  }, [isEmail, prospectId, kindForSend, replyTo])

  // ── REPLY MODE: THE CONVERSATION, FROM THE DATABASE, BEFORE A WORD IS TYPED ─────────────────────
  // 🔴 EXPANDED BY DEFAULT AND FETCHED ON OPEN, which is the whole point of Part 2: Dominic could not
  // see what he was answering while he answered it. It costs one query — the bodies were stored when
  // the message was recorded — so there is nothing left to defer behind a toggle.
  useEffect(() => {
    if (!isEmail || !replyTo) return
    let live = true
    void (async () => {
      // ⚠️ EVERY setState IS INSIDE THIS CALLBACK, including the two that could have sat in the
      // effect body. The callback runs synchronously to its first `await`, so the "Loading…" state
      // appears exactly as soon either way — and the effect body itself stays free of state writes.
      setThread({ subject: replyTo.subject ?? '', replySubject: replySubject(replyTo.subject ?? ''), date: replyTo.date })
      setQuotedLoading(true)
      const { json } = await post({ action: 'view', message_row_id: replyTo.messageId }).catch(() => ({ json: {} as Record<string, unknown> }))
      if (!live) return
      if (json.ok === true && (typeof json.html === 'string' || typeof json.text === 'string')) {
        // ⚠️ A TEXT-ONLY MESSAGE IS STILL SHOWN. Wrapping it in <pre> keeps its line breaks and keeps
        // it inert; the iframe is sandboxed either way.
        setQuoted(typeof json.html === 'string' && json.html
          ? json.html
          : `<pre style="white-space:pre-wrap;font-family:Aptos,Arial,sans-serif;font-size:12pt">${String(json.text ?? '')
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`)
      } else {
        setQuoted(null)
      }
      setQuotedLoading(false)
    })()
    return () => { live = false }
  }, [isEmail, replyTo, post])

  // ── THE CHASE'S QUOTE, ALSO EXPANDED BY DEFAULT ────────────────────────────────────────────────
  // 🔴 THE SAME CHANGE, FOR THE SAME REASON. It used to be fetched only when Show was pressed,
  // because it could need a read-only IMAP fetch and most opens never looked. Bodies are stored now,
  // so the common case is a query and the toggle was costing a click on every chase.
  // ⚠️ THE FETCH IS STILL LAZY IN THE ONE CASE THAT IS SLOW: a parent whose body was never stored
  // still goes to the mailbox, and that is the same one round trip it always was.
  useEffect(() => {
    if (!isEmail || replyTo || !thread || quoted || quotedLoading) return
    let live = true
    void (async () => {
      setQuotedLoading(true)
      const { json } = await post({ action: 'quoted' }).catch(() => ({ json: {} as Record<string, unknown> }))
      if (!live) return
      if (json.ok === true && typeof json.html === 'string') setQuoted(json.html)
      setQuotedLoading(false)
    })()
    return () => { live = false }
  }, [isEmail, replyTo, thread, quoted, quotedLoading, post])

  // The signature rows — for the Insert buttons and for expanding a template's tokens into the box.
  // ⚠️ NEVER FOR THE SEND. The server sends the DOCUMENT; it reads no settings at send time at all.
  useEffect(() => {
    let live = true
    void (async () => {
      const r = await fetch('/api/admin/outreach/settings').catch(() => null)
      if (!r || !live) return
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (!live || j.ok !== true) return
      const sig = parseSignature(j.signature)
      const oo = parseOptOut(j.optOut)
      setSettings({
        signatureLines: (sig?.lines ?? []).map(l => ({ text: l.text, bold: l.bold })),
        optOut: oo?.text ?? null,
      })
      setSettingsLoaded(true)
    })()
    return () => { live = false }
  }, [])

  /* 🔴 `showQuoted` WAS HERE AND IS GONE (30 September 2026). It fetched the quoted parent only when
   * Show was pressed, because the fetch could need a read-only IMAP round trip and most opens never
   * looked. Bodies are stored now (see docs/outreach-mail-import-view-report.md), so the quote is
   * fetched on open and the toggle only shows and hides what is already there — which is what makes
   * "the conversation is visible while you write" true rather than one click away. */

  // ── ATTACHMENTS ────────────────────────────────────────────────────────────────────────────────
  // 🔴 THE FILE GOES STRAIGHT TO THE PRIVATE BUCKET, NOT THROUGH THIS APP'S API. The route issues a
  // signed upload URL and the browser PUTs to it; what comes back here is a PATH. Nothing in this
  // window ever holds the bytes for longer than the upload, and the send request carries paths.
  const attachRefusal = useMemo(() => attachmentSetRefusal(files), [files])

  const attachFiles = useCallback(async (picked: FileList | null) => {
    if (!picked || !picked.length) return
    setFileError(null)
    for (const file of Array.from(picked)) {
      // ⚠️ THE SAME PREDICATE THE ROUTE USES, so the refusal is immediate rather than arriving after
      // a 9 MB upload. The route applies it again; this one is a courtesy, not the guard.
      const stop = uploadRefusal({ filename: file.name, contentType: file.type, size: file.size })
      if (stop) { setFileError(stop.refusal); continue }
      const total = files.reduce((n, f) => n + f.size, 0) + file.size
      if (total > MAX_ATTACHMENT_BYTES) {
        setFileError(`${file.name} would take this email over ${mb(MAX_ATTACHMENT_BYTES)}.`)
        continue
      }
      setFileBusy(file.name)
      try {
        const r = await fetch('/api/admin/outreach/attachments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'signed_upload', prospect_id: prospectId,
            filename: file.name, content_type: file.type, size: file.size,
          }),
        })
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
        if (j.ok !== true || typeof j.signedUrl !== 'string') {
          setFileError(String(j.refusal ?? 'That file could not be prepared for upload.')); continue
        }
        // 🔴 PUT TO SUPABASE STORAGE, NOT TO US. A failure here is the upload failing, and it leaves
        // nothing behind: the signed URL expires and the path is never recorded on a message.
        const up = await fetch(j.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!up.ok) { setFileError(`${file.name} did not upload — try again.`); continue }
        setFiles(list => [...list, j.attachment as OutboundAttachment])
      } catch {
        setFileError(`${file.name} did not upload — check the connection.`)
      } finally { setFileBusy(null) }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [files, prospectId])

  /**
   * The plans-and-features PDF, generated fresh and stored like any other attachment.
   * 🔴 THE APP ALREADY MAKES THIS DOCUMENT — `lib/plans-pdf.ts`, the same generator behind Admin's own
   * download button — so nothing is uploaded by hand and the copy attached is always current with the
   * feature matrix. ⚠️ IT IS GENERATED NOW, NOT AT SEND TIME: a Chromium cold start inside the send's
   * 60 seconds would be racing an SMTP conversation and an IMAP append, and a copy regenerated at
   * RETRY time would be different bytes from the one the prospect already has.
   */
  const attachPlansPdf = useCallback(async () => {
    setFileError(null); setFileBusy('plans')
    try {
      const r = await fetch('/api/admin/outreach/attachments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plans_pdf', prospect_id: prospectId }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (j.ok !== true) { setFileError(String(j.refusal ?? 'The plans PDF could not be attached.')); return }
      setFiles(list => [...list, j.attachment as OutboundAttachment])
    } catch {
      setFileError('The plans PDF could not be attached — check the connection.')
    } finally { setFileBusy(null) }
  }, [prospectId])

  /** ⚠️ REMOVING A FILE FORGETS THE PATH; the object stays in the bucket, unreferenced and private. */
  const removeFile = useCallback((path: string) => {
    setFiles(list => list.filter(f => f.storagePath !== path))
  }, [])

  /**
   * The send itself.
   * 🔴 THE REF IS CLAIMED BEFORE ANY `await`. `sending` is state and does not take effect until the next
   * render, so two presses in one tick both read `false` and both proceed — the defect that logged two
   * contacts 0.755s apart. Here the same defect would send two emails.
   */
  const sendNow = useCallback(async (test: boolean, override: string[] = []) => {
    if (sendInFlight.current) return
    if (refusal) { setSendError(refusal); return }
    sendInFlight.current = true
    setSending(true); setSendError(null); setConfirmSend(null)
    try {
      // 🔴 ONE KEY PER EXACT MESSAGE. It is now a hash of the DOCUMENT plus the subject, the rung and
      // whether it is a test — the document is the message, so two sends of the same document are the
      // same send and the second returns the first's verdict. Changing a single character of
      // formatting changes the document and therefore the key, which is right: it is a different email.
      // 🔴 THE ATTACHMENT PATHS ARE PART OF THE KEY. Adding the plans PDF to a message already
      // submitted makes it a DIFFERENT email, and without the paths the second send would be
      // recognised as a duplicate of the first and silently return its verdict — the prospect would
      // never get the document.
      const key = hashKey(JSON.stringify([
        finalSubject, isEmail ? doc : fullText, kindForSend, test,
        files.map(f => f.storagePath), replyTo?.messageId ?? null,
      ]))
      if (!idemRef.current || idemRef.current.forKey !== key) {
        idemRef.current = { forKey: key, value: crypto.randomUUID() }
      }
      const { json } = await post({
        action: 'send', subject: finalSubject, kind: kindForSend,
        // The document for an email; the plain body for WhatsApp, which this route does not send.
        ...(isEmail ? { document: doc } : { body: fullText }),
        // ⚠️ PATHS AND METADATA ONLY. There is no field here through which bytes could travel, and
        // the route drops any entry without a `storagePath` it recognises.
        ...(files.length ? { attachments: files } : {}),
        // 🔴 THE MESSAGE BEING ANSWERED, and the address it came from. The route checks both.
        ...(replyTo ? { reply_to_message_id: replyTo.messageId, to: replyTo.fromAddress ?? '' } : {}),
        is_test: test, idempotency_key: idemRef.current.value,
        // ⚠️ THE TICKBOX TRAVELS WITH THE SEND. Absent ⇒ true, which is what the server assumes.
        include_quote: includeQuote,
        // ⚠️ THE OVERRIDES TRAVEL WITH THE SEND, and they are the ids of guards the operator has
        // just been shown and has answered. An empty array is the ordinary case.
        ...(override.length ? { override } : {}),
      })
      // ── 🔴 THE SERVER'S GUARDS. A refusal that can be answered, not a dead end ─────────────────
      // The route returns `needsConfirm` with the sentences and the ids; nothing has been sent and
      // nothing written. Pressing "Send anyway" re-submits the SAME message with `override: [ids]`,
      // which the server records as a note in the history before it sends.
      if (json.needsConfirm === true) {
        const gs = (Array.isArray(json.guards) ? json.guards : []) as { id: string; kind: string; message: string }[]
        setGuards({ list: gs, test })
        return
      }
      if (json.duplicate === true) {
        setSendError(`This exact message was already submitted — it is recorded as “${String(json.status ?? 'unknown')}”. Use the message list on the prospect to retry it.`)
        return
      }
      if (json.ok !== true) {
        // 🔴 `uncertain` IS NOT A FAILURE AND MUST NOT READ LIKE ONE. Telling the operator it failed is
        // what produces the second copy: they press Send again.
        // ⚠️ AND THE REFUSAL IS SHOWN WHOLE. It now carries the database's own code where one applies,
        // which is the difference between "could not be recorded" and a diagnosable screen.
        setSendError(String(json.refusal ?? json.message ?? 'That was not sent.'))
        return
      }
      const copy = String(json.sent_copy ?? '')
      setSentNote([
        test ? 'Test sent to your own address.' : `Sent to ${toEmail ?? 'the prospect'}.`,
        copy === 'absent' ? 'It is NOT in your Sent folder — check the mailbox.' : 'A copy is in your Sent folder.',
        typeof json.logWarning === 'string' ? json.logWarning : '',
      ].filter(Boolean).join(' '))
      if (!test) {
        setLogged(true)
        await onSent?.()
      }
    } catch {
      // 🔴 A DEAD BROWSER CONNECTION SAYS NOTHING ABOUT THE EMAIL. The route may well have sent it and
      // logged it; the row is the truth, so the operator is sent to look rather than told it failed.
      setSendError('The connection dropped before the server answered. It may have been sent — check the messages on this prospect before sending again.')
    } finally {
      sendInFlight.current = false
      setSending(false)
    }
  }, [refusal, post, finalSubject, fullText, doc, isEmail, kindForSend, toEmail, onSent, files, replyTo, includeQuote])

  // ── THE mailto: PATH, AND WHY IT IS NOT HERE ANY MORE ───────────────────────────────────────────
  // It lived here from the first version of this window and carried two measured limits and a defect it
  // could not fix: RFC 6068 CRLF bodies, a ~2000-character URL ceiling above which the Windows shell
  // silently TRUNCATES the message Outlook opens, and — the reason it had to go — no way to know whether
  // anything was ever sent. Everything it did is now done by the route: the account is the mailbox
  // rather than whatever Outlook defaults to, length has no ceiling, the chase is threaded onto its
  // parent, a copy lands in Sent, and the contact log is written from the server's own verdict.
  // 🔎 docs/outreach-mail-send-report.md records the replacement.

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
    void navigator.clipboard?.writeText(plainForHumans)
    setCopied(true); setTimeout(() => setCopied(false), 1400)
  }

  /**
   * 🔴 SEND NOW LOGS, AND THAT IS THE OPPOSITE OF WHAT THIS FUNCTION USED TO SAY.
   * The old note here read "SEND OPENS OUTLOOK. IT DOES NOT LOG, AND IT NEVER WILL", and it was right
   * for a mailto: handing a URL to the OS proves only that a window was requested, so logging it would
   * have put an approach in the history that may never have left. The route does not have that problem
   * — it knows what the SMTP server answered — so the log is written by the SERVER, from the send's own
   * verdict, and only when the status is `sent`.
   * ⚠️ IT IS STILL THE SAME SINGLE WRITER: `lib/outreach-contact-log.ts#logOutreachContact`, which is
   * what this window's Log button reaches through `onLog` too. There is no second write path.
   * ⚠️ AND A TEST LOGS NOTHING — it goes to Dominic's own address, and a rung for it would corrupt the
   * ladder that decides whether a prospect gets a fourth email.
   */
  // ⚠️ ESC LEAVES THE WRITING VIEW BEFORE IT REACHES ANYTHING ELSE. Registered in the capture phase
  // so the page's own Esc (which closes a composer) does not fire underneath it.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation(); e.preventDefault(); setExpanded(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [expanded])

  const askSend = (test: boolean) => {
    if (!body.trim()) return
    if (refusal) { setSendError(refusal); return }
    // 🔴 WARN, THEN ALLOW. Sending with a placeholder left in may be deliberate.
    if (outstanding.length > 0) { setPending(test ? 'test' : 'send'); return }
    setConfirmSend(test ? 'test' : 'real')
  }

  const logNow = async () => {
    setPending(null)
    // 🔴 THE SYNCHRONOUS GATE, AND IT IS FIRST. `logging` is React STATE: two clicks in the same tick
    // both read the pre-update value and both proceed, because `setLogging(true)` does not take effect
    // until the next render. 🧪 The manual records two contacts logged 0.755s apart from THIS function.
    // A ref is written and read in the same synchronous turn, so the second press cannot get past here.
    // ⚠️ THE STATE FLAG STAYS — it is what disables the button and renders "Logging…". The ref is the
    // correctness guard; the state is the UI. Removing either re-opens a different half of the defect.
    if (logInFlight.current) return
    if (logging || !body.trim()) return
    // 🔴 THE LOG IS A RECORD OF WHAT WAS SENT. Writing a row containing `{{truck name}}` would put a
    // message into the history that was never sent in that form — the same reasoning the placeholder
    // warning already applies to logging, taken to a refusal because this one is never deliberate.
    // ⚠️ EVERY PRE-EXISTING GUARD STILL RUNS BEFORE THE WRITE, and `refusal` still runs AFTER the
    // in-flight gate but BEFORE the ref is claimed, so a refused attempt does not lock the button.
    if (refusal) { setSendError(refusal); return }
    logInFlight.current = true
    setLogging(true)
    setSendError(null)
    // 🔴 THE EDITED BODY IS WHAT IS LOGGED — `body`, the textarea's current value, never the template's
    // original render. The log records what I actually sent; if the two can diverge, the edited text is
    // the one that matters.
    let ok = false
    try {
      ok = await onLog(plainForHumans, selected?.channel ?? 'email', selected?.servesKind ?? null)
    } finally {
      // 🔴 RELEASED IN `finally`. If `onLog` ever throws, a ref left true would disable logging for the
      // life of the window with no way back except closing it.
      logInFlight.current = false
      setLogging(false)
    }
    if (ok) {
      setLogged(true)
      // 🔴 CLOSE ON SUCCESS (16 September 2026). The window used to stay open showing "Logged ✓", which
      // left the operator looking at a composed message that had already been recorded — the state in
      // which the double-log happened. The prospect modal UNDERNEATH stays open: `onClose` only clears
      // `composeOpen` in the panel, and `modalId` is untouched.
      // ⚠️ THE LIST AND MODAL REFRESH THEMSELVES. `logContact` awaits `load()` before returning true, so
      // by the time we get here the panel has already re-read the list route. Nothing is merged by hand
      // here, which is why the server-derived values (logo_url among them) cannot be clobbered.
      onClose()
    }
    // 🔴 ON FAILURE THE WINDOW STAYS OPEN, deliberately. `onLog` returns false for a refusal or a failed
    // write and raises its own toast; closing here would discard the composed body the operator would
    // have to retype. `logged` is not set, so the button returns to "Log" and can be pressed again.
  }
  const doLog = () => {
    if (logging || logged || !body.trim()) return
    // 🔴 SAME WARNING ON LOGGING. A logged body containing [[your rate]] is a record of something that
    // was never sent in that form.
    if (outstanding.length > 0) { setPending('log'); return }
    void logNow()
  }

  if (!mounted) return null
  // 🔴 THE PANEL ITSELF, IDENTICAL IN BOTH MODES. Only the wrapper differs: a card in the page, or
  // the same card centred over a backdrop.
  const panel = (
      <div role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true}
        aria-labelledby={inline ? undefined : 'compose-title'}
        aria-label={inline ? `Email ${truckName}` : undefined}
        className={inline
          // 🔴 NO BOX AND NO CHROME WHEN INLINE. It shipped as a bordered card with a
          // "Compose — <name>" heading and a Close button, INSIDE a page that already names the
          // prospect in its own header and has tabs to leave with. Three nested frames and two
          // redundant labels — and between them they pushed History off a 1440x800 screen.
          ? 'w-full flex flex-col'
          : 'bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden'}>

        {!inline && (
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0">
            <h4 id="compose-title" className="text-base font-semibold text-slate-900 truncate">
              Compose — {truckName}
            </h4>
            <button ref={closeRef} onClick={onClose}
              className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 flex-shrink-0">
              Close
            </button>
          </div>
        )}

        {/* ⚠️ TIGHTER GAPS INLINE. `space-y-3` between eight blocks is 84px of nothing, and 84px is
            three history rows. */}
        <div className={inline ? 'space-y-2' : 'flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3'}>
          {/* ── TEMPLATE CHIPS ─────────────────────────────────────────────────────────────────
              🔴 A DROPDOWN HID THE CHOICE BEHIND A CLICK, and the choice is one of the two things
              this box is for. The ones that FIT this prospect's step come first — `initialTemplateId`
              is `templateForStep`'s answer and `suggestedId` is the heuristic's — and the rest are
              behind More, so a long library does not become a wall of chips.
              ⚠️ THE ORDER IS DERIVED FROM VALUES THAT ALREADY EXIST. Nothing here re-decides which
              template suits a step; it sorts by the answers `templateForStep` and `suggestTemplateId`
              already gave. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${LABEL} mb-0 mr-1`}>Template</span>
            <button type="button" onClick={() => applyTemplate('')}
              aria-pressed={templateId === ''}
              className={chipCls(templateId === '')}>Blank</button>
            {primaryTemplates.map(t => (
              <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
                aria-pressed={templateId === t.id} title={t.label}
                className={chipCls(templateId === t.id)}>
                {t.label}{t.id === suggestedId ? ' ·' : ''}
              </button>
            ))}
            {moreTemplates.length > 0 && (
              <div className="relative">
                <button type="button" onClick={() => setMoreOpen(o => !o)}
                  className={chipCls(moreTemplates.some(t => t.id === templateId))}>
                  More ▾
                </button>
                {moreOpen && (
                  <div className="absolute left-0 mt-1 z-20 w-64 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg p-1">
                    {moreTemplates.map(t => (
                      <button key={t.id} type="button"
                        onClick={() => { applyTemplate(t.id); setMoreOpen(false) }}
                        className="block w-full text-left text-[13px] px-2 py-1.5 rounded hover:bg-slate-50">
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
                        {filled && fillSource[t] === 'snippet' && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-800"
                            title="Pre-filled from the SNIPPET library (Templates tab → Snippets), which is where it is edited. One value, every template that uses this name. Editing it here changes only this message.">
                            from snippet
                          </span>
                        )}
                        {filled && fillSource[t] !== 'snippet' && fromDefault[t] !== undefined && (
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

          {/* ── 🔴 WHICH BOX THE PRE-SELECTION CAME FROM, OR WHY THERE WAS NONE ──────────────────
              One line, under the chips, because "why is this template open" and "why is nothing open"
              are the same question and the answer is one sentence either way. Every other template
              stays one click away on the chips above — this is an explanation, not a restriction. */}
          {sequenceNote && (
            <p className="text-[11px] text-slate-500">{sequenceNote}</p>
          )}

          {/* ── ONE LINE THAT SAYS WHERE THIS IS GOING ─────────────────────────────────────────
              🔴 To, SUBJECT AND THE THREAD NOTE ON ONE ROW. They were three stacked labelled fields
              taking a third of the box's height to carry, between them, one editable value. The
              address is not editable here by design (the server reads it off the truck row, or off
              the message being answered), so on a chase or a reply this whole row is a statement. */}
          {/* 🔴 ALWAYS, EVEN WITH NO TEMPLATE AND NO THREAD. This row was behind `isEmail`, which
              was false for a blank email (see the note on `isEmailChannel`), so the one line that
              says where the email is going disappeared exactly when nothing else on screen said
              either. Where there is no address it says so, in place, rather than by being absent. */}
          {(
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
              <span className="text-slate-500">To</span>
              <span className="font-semibold text-slate-800">
                {contactName?.trim() || toEmailForReply || toEmail || 'no address'}
              </span>
              {(contactName?.trim() && (toEmailForReply || toEmail)) && (
                <span className="text-slate-400">{toEmailForReply || toEmail}</span>
              )}
              {thread && (
                <>
                  {/* 🔴 THE TICKBOX TAKES THE QUOTE AWAY, NOT THE THREADING. Unticked, the prospect
                      reads only what I wrote; the email still carries In-Reply-To and References, so
                      it lands in the same conversation in their mailbox rather than as a new one. */}
                  <label className="inline-flex items-center gap-1 text-[12px] text-slate-600">
                    <input type="checkbox" checked={includeQuote}
                      onChange={e => setIncludeQuote(e.target.checked)} />
                    Include previous email
                  </label>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-700 truncate max-w-[22rem]" title={thread.replySubject}>
                    {thread.replySubject}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    replies to {thread.date ? fmtWhen(thread.date) : 'the last email'}
                  </span>
                  <button type="button" onClick={() => setQuotedOpen(o => !o)}
                    className="text-[12px] font-bold text-slate-600 underline hover:text-slate-800">
                    {quotedOpen ? 'Previous email ▾' : 'Previous email ▸'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ⚠️ A FIRST CONTACT STILL TYPES ITS OWN SUBJECT — there is no thread to take one from. */}
          {isEmail && !thread && (
            <label className="block">
              <span className={LABEL}>Subject</span>
              {/* 🔴 `type="text"` IS LOAD-BEARING, NOT DECORATION. The unlayered rule in globals.css
                  selects `input[type="text"]` — an ATTRIBUTE selector, which does NOT match an input
                  that omits the attribute. 🧪 Measured: without it this box renders at 14px while every
                  other field in the app renders at 16px, and it would zoom on focus on iOS, which is the
                  very thing that rule exists to prevent. */}
              {/* 🔴 A CHASE'S SUBJECT IS NOT AN EDITABLE FIELD, BECAUSE IT IS NOT A CHOICE. The
                  server sets it to `Re: ` + the parent's subject and ignores whatever is typed here —
                  it has to, or the reply's subject would disagree with its `In-Reply-To`, and a client
                  that threads on the subject would show the chase as a new conversation. Leaving the
                  box editable would let Dominic type something that is silently thrown away, so for a
                  chase it shows what will ACTUALLY be sent, read-only. */}
              {/* 🔴 A CHASE'S SUBJECT IS NOT A FIELD AT ALL NOW, because it never was a choice: the
                  server sets it to `Re: ` + the parent's and ignores what is typed, or the reply's
                  subject would disagree with its `In-Reply-To`. It is stated on the line above
                  instead of shown as a disabled box pretending to be editable. */}
              <input type="text" className={FIELD} value={subject}
                onChange={e => { setSubject(e.target.value); setEdited(true); setLogged(false) }} />
            </label>
          )}

          <label className="block">
            {/* 🔴 CORRECTED 16 September 2026 — THE OLD LABEL WAS FALSE AND IT WAS FALSE ABOUT A LEGAL LINE.
                It read "(the footer is added below)". `OPT_OUT_FOOTER` was deleted from the codebase when
                the sign-off moved into the Outlook signature (lib/outreach-template-render.ts records the
                removal). A repo-wide search finds the symbol in docs only — NOTHING appends an opt-out
                line on any exit: not the mailto path, not Copy, not the logged message text.
                ⚠️ So the operator was being told, on the screen where they decide whether a message is
                compliant, that a PECR line would be added that no code adds. */}
            {/* 🔴 THE OLD LABEL SAID THE OPT-OUT "MUST BE IN YOUR OUTLOOK SIGNATURE". That stopped
                being true when this window started sending: the email is built here, not in Outlook,
                so Outlook's signature never touches it. Put `{{opt_out}}` in the template instead. */}
            {/* 🔴 THE LABEL HAS BEEN WRONG TWICE AND IS NOW SIMPLY TRUE. It once said the opt-out
                "must be in your Outlook signature" (Outlook never touches these emails); then that the
                tokens "are filled in when it sends" (they are filled in when the template is chosen,
                and the server expands nothing). What is in the box is what is sent. */}
            <span className={LABEL}>
              {isEmailChannel
                ? 'Message — this is the email. Exactly what is here is sent, signature and all.'
                : 'Message — exactly what will be sent.'}
            </span>
            {/* 🔴 SIZED WITH `rows`, NOT WITH A FONT CLASS. The unlayered !important rule in globals.css
                forces `font-size: inherit` on every textarea on desktop, so `text-sm` here is INERT and
                the box renders at 16px whatever class it carries. `rows` sets the visible line count and
                is untouched by that rule, so it is the only reliable way to make this box tall enough to
                read a whole email without scrolling it. */}
            {/* 🔴 THE EMAIL BOX IS THE EMAIL. WhatsApp keeps the textarea — there is no formatting in
                a WhatsApp message and a rich editor would invite some. */}
            {isEmailChannel ? (
              <RichEmailEditor
                value={doc}
                /* 🔴 AN EDIT IS A DIFFERENCE, NOT AN EVENT. This was `setEdited(true)` on every
                   `onChange`, and the editor emits one while it normalises the document it was
                   handed — so "You have edited this message" appeared on a page nobody had typed
                   into, with Blank selected. Comparing the plain text against the template's own
                   render answers the question the flag is actually asking: is what is on screen
                   still what the template produced? */
                onChange={d => {
                  setEditedDoc(d)
                  if (docPlainText(d).trim() !== docPlainText(templateDoc).trim()) {
                    setEdited(true); setLogged(false)
                  }
                }}
                signatureLines={settings.signatureLines}
                optOut={settings.optOut}
                // 🔴 A FIXED HEIGHT WITH ITS OWN SCROLLBAR, INLINE — dragged by the grip at its
                // bottom right and remembered per browser. See the note on the state above.
                height={inline && !expanded ? boxHeight : undefined}
                onHeightChange={inline && !expanded ? rememberHeight : undefined}
                // 🔴 NO CEILING AT ALL INLINE, AND NO INNER SCROLLBAR. The box grows line by line
                // and the PAGE scrolls — which is what makes a long email readable while it is
                // being written. A 75vh cap was still a box you could lose the bottom of, and its
                // scrollbar fought the page's.
                // ⚠️ THE FLOATING WINDOW KEEPS THE CAP: it is `position: fixed` and cannot grow
                // past the viewport, so something has to scroll and it has to be the panel.
                maxHeight={inline || expanded ? undefined : '75vh'}
                expanded={expanded}
                onExpand={expanded ? undefined : () => setExpanded(true)}
                toolbarExtra={isEmail ? (
                  <>
                    <input ref={fileInputRef} type="file" multiple className="hidden"
                      accept={ALLOWED_ATTACHMENT_EXTENSIONS.join(',')}
                      onChange={e => void attachFiles(e.target.files)} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!!fileBusy}
                      title="PDF, PNG, JPG, DOCX or XLSX. 10 MB in total for one email. The file uploads to private storage; the email is built from it on the server."
                      className="text-xs font-bold px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">
                      {fileBusy && fileBusy !== 'plans' ? `Uploading ${fileBusy}…` : 'Attach file'}
                    </button>
                    {/* 🔴 THE APP GENERATES THIS DOCUMENT — the same one Admin downloads — so the copy
                        attached is always current with the feature matrix, and its name carries the
                        date it was generated. */}
                    <button type="button" onClick={() => void attachPlansPdf()} disabled={!!fileBusy}
                      title="Generates today's plans-and-features PDF from the live feature matrix and attaches it. The same document as Admin's download button."
                      className="text-xs font-bold px-2 py-1 rounded border border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100 disabled:opacity-40">
                      {fileBusy === 'plans' ? 'Generating…' : 'Plans PDF'}
                    </button>
                  </>
                ) : undefined}
                underToolbar={isEmail && files.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <ul className="flex flex-wrap gap-1">
                      {files.map(f => (
                        <li key={f.storagePath}
                          className="flex items-center gap-1 text-[11px] border border-slate-200 rounded-lg px-2 py-0.5 bg-slate-50">
                          <span className="font-semibold text-slate-700">{f.filename}</span>
                          <span className="text-slate-400">{mb(f.size)}</span>
                          <button type="button" onClick={() => removeFile(f.storagePath)}
                            aria-label={`Remove ${f.filename}`}
                            className="text-slate-400 hover:text-red-700 font-bold">×</button>
                        </li>
                      ))}
                    </ul>
                    <span className="text-[11px] text-slate-500">
                      {files.length} file{files.length === 1 ? '' : 's'} · {mb(files.reduce((n, f) => n + f.size, 0))} of {mb(MAX_ATTACHMENT_BYTES)}
                    </span>
                  </div>
                ) : undefined}
              />
            ) : (
              /* ⚠️ THE WHATSAPP BOX, AND ONLY THAT. It is reached when a WhatsApp template is
                 selected; an email — including Blank — takes the editor above. Eight rows inline
                 rather than eighteen, because a WhatsApp message is short and eighteen rows of
                 white is the history pushed off the page. */
              <GrowingTextarea rows={inline ? 8 : 18} className={`${FIELD} resize-y font-normal leading-relaxed`}
                placeholder="Choose a template above, or write here."
                value={body} onChange={e => { setBody(e.target.value); setEdited(true); setLogged(false) }} />
            )}
          </label>

          {/* ── 🔴 THE ATTACH CONTROLS MOVED ONTO THE TOOLBAR (v4 fixes) ───────────────────────
              They were rendered here, below the editor, with `-mt-8` pulling them back up INSIDE the
              box — over the last lines of the email and over the resize grip. The negative margin
              was there to save 36px of page height; it bought that by putting two buttons on top of
              the text. They are `toolbarExtra` and `underToolbar` on the editor now: the buttons on
              the toolbar row after a divider and before ⤢, the chips directly under it, inside the
              same border. Nothing overlaps anything, and the 36px is still saved.
              ⚠️ WHAT IS LEFT HERE IS THE ERROR LINE, which belongs under the box it is about. */}
          {isEmail && (fileError || attachRefusal) && (
            <p className="text-[11px] text-red-700">{fileError ?? attachRefusal?.refusal}</p>
          )}

          {/* ── THE CONVERSATION THIS ANSWERS ───────────────────────────────────────────────────
              🔴 DIRECTLY BELOW THE EDITOR AND EXPANDED, which is the change Part 2 exists for.
              Answering an email with the email invisible meant opening the timeline in another
              window, or replying from memory. The bodies are stored, so showing it costs a query.
              ⚠️ IT IS STILL COLLAPSIBLE — a long thread would otherwise push Send off the screen.
              🔴 A SANDBOXED IFRAME, NOT `dangerouslySetInnerHTML`. The quoted email came out of the
              MAILBOX, so its markup is sender-controlled; injected into the admin page it would
              run behind an authenticated admin session. `sandbox=""` grants nothing — no scripts,
              no forms, no same-origin, no top-level navigation.
              ⚠️ AND WHAT IS SENT IS SANITISED SEPARATELY, server-side: this iframe protects THIS
              page, and `lib/outreach-quote-sanitise.ts` protects the recipient of the copy we
              embed in the outgoing message. They are different problems. */}
          {/* ⚠️ AND IT IS NOT IN THE BOX I TYPE IN — see the note in the report. The editor holds the
              DOCUMENT and nothing else; the quoted parent is appended by the server, from the stored
              body, at the moment the message is built. It cannot be edited into, deleted by a stray
              ⌘A, or half-quoted. */}
          {isEmail && thread && quotedOpen && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1">
                {includeQuote
                  ? 'Included under your signature when this sends.'
                  : 'Not included — “Include previous email” is unticked. The email still threads onto it.'}
                {quotedLoading && ' Loading…'}
              </p>
              {/* ⚠️ THE SAME SIZED FRAME THE HISTORY USES, for the same reason: a fixed 288px box on a
                  four-email thread is a letterbox onto the thing you are answering. */}
              {quoted && <SizedEmailFrame html={quoted} title="The earlier conversation" />}
              {!quoted && !quotedLoading && (
                <p className="mt-1 text-[11px] text-amber-800">
                  The earlier email has no stored copy yet. Open it once in the timeline and it will be saved.
                </p>
              )}
            </div>
          )}

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
          {/* ⚠️ AND IT NEEDS A TEMPLATE TO BE ABOUT. The notice explains that the placeholder FIELDS
              no longer rewrite the message — with Blank there are no fields and no render, so there
              is nothing for it to explain and it was pure noise. */}
          {edited && !!templateId && (
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
                {pending === 'log'
                  ? 'They will be stored in the contact log exactly as shown.'
                  : 'They will appear in the email exactly as shown.'}
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setPending(null)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400">
                  Go back
                </button>
                <button onClick={() => {
                  const was = pending; setPending(null)
                  if (was === 'log') void logNow(); else setConfirmSend(was === 'test' ? 'test' : 'real')
                }}
                  className="text-sm font-bold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {pending === 'log' ? 'Log anyway' : 'Send anyway'}
                </button>
              </div>
            </div>
          )}

          {/* 🔴 THE "ADDED BELOW YOUR MESSAGE" PANEL WAS HERE AND IS GONE (29 September 2026).
              It showed a rendered signature under the box. It was removed for the same reason the
              preview pane before it was: nothing is APPENDED any more, so there was nothing to
              preview — the signature is placed by a `{{signature}}` token that is visible in the box
              itself, and the Signature tab is where its lines are read and edited. What survives is
              the one thing the box genuinely cannot show: that this message will be sent as a reply.
              It now sits directly under the text box, where the reply it describes is being written. */}

          {/* Sending is unavailable on this environment — the reason comes from the server, with the
              database's own code where there is one, so it is diagnosable rather than just "off". */}
          {sendingOff && (
            <p className="text-[12px] text-slate-700 bg-slate-100 border border-slate-300 rounded-lg px-3 py-2">
              {sendingOff} Copy and Log still work.
            </p>
          )}

          {sentNote && (
            <p className="text-[12px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {sentNote}
            </p>
          )}

          {/* ── THE CONFIRM, WHICH NAMES THE RECIPIENT ───────────────────────────────────────────
              🔴 THE ADDRESS IS IN THE CONFIRM SENTENCE. "Are you sure?" prevents nothing; the mistake
              this catches is sending the right email to the wrong prospect, and only the address on
              screen at the moment of pressing can catch that. */}
          {/* ── 🔴 THE SERVER'S GUARDS ───────────────────────────────────────────────────────────
              Nothing has been sent and nothing has been written: the route answered with the reasons
              and stopped. "Send anyway" re-submits the identical message with those ids overridden,
              and the server writes a line in this prospect's history saying so before it sends.
              ⚠️ A REFUSAL AND A QUESTION LOOK DIFFERENT. `refuse` is the step having already gone —
              red, and the button says "Send it twice anyway". `confirm` is early, shared or past the
              final chase — amber, and the button says "Send anyway". */}
          {guards && (
            <div className={`rounded-lg border px-3 py-2 ${guards.list.some(g => g.kind === 'refuse')
              ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
              {guards.list.map(g => (
                <p key={g.id + g.message} className="text-[13px] text-slate-900">{g.message}</p>
              ))}
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setGuards(null)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-white">
                  Don&rsquo;t send
                </button>
                <button
                  onClick={() => { const g = guards; setGuards(null); void sendNow(g.test, g.list.map(x => x.id)) }}
                  disabled={sending}
                  className="text-sm font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">
                  {guards.list.some(g => g.kind === 'refuse') ? 'Send it twice anyway' : 'Send anyway'}
                </button>
              </div>
            </div>
          )}

          {confirmSend && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2">
              <p className="text-[13px] text-slate-800">
                {confirmSend === 'test'
                  ? 'Send a test copy of this message to your own address? Nothing is logged and it does not count towards today’s cap.'
                  : <>Send this email to <span className="font-bold">{toEmail}</span>
                      {' '}({truckName})? It goes from your mailbox now, and the contact is logged.</>}
              </p>
              {/* ⚠️ THE WARNING IS REPEATED HERE. The footnote is easy to read past; the confirm is the
                  last moment at which "this has no opt-out line" can still change the answer. */}
              {warnings.length > 0 && (
                <p className="mt-1 text-[12px] font-bold text-amber-900">{warnings.join(' ')}</p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setConfirmSend(null)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400">
                  Go back
                </button>
                <button onClick={() => void sendNow(confirmSend === 'test')} disabled={sending}
                  className="text-sm font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  {sending ? 'Sending…' : confirmSend === 'test' ? 'Send test' : 'Send it'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {/* 🔴 THE WARNINGS LIVE IN THE FOOTNOTE, NOT IN A PANEL OF THEIR OWN. A panel would be a
                fourth block competing with the message for attention, and these are not refusals —
                they are two sentences that belong next to the button they are about. */}
            <span className={`text-[11px] ${warnings.length ? 'text-amber-800 font-semibold' : 'text-slate-400'}`}>
              {warnings.length
                ? warnings.join(' ')
                : 'Send test to me goes only to you and changes nothing. Send goes to the prospect, logs it and updates the stage.'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {!hideCopyAndLog && (
              <button onClick={doCopy} disabled={!body.trim()}
                title="Copies the message body. Your Outlook signature supplies the sign-off, your details and the opt-out line."

                className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400">
                {copied ? 'Copied' : 'Copy'}
              </button>
              )}
              {/* ⚠️ THE SENDING ACCOUNT IS NO LONGER A MYSTERY, AND NO LONGER OUTLOOK'S TO PICK. The old
                  note here explained that a mailto: is handed to the OS and the CLIENT chooses the
                  account — Outlook always composes from its default and ignores `from=`. The route
                  authenticates as the mailbox itself, so the From address is fixed in
                  `lib/outreach-mail-config.ts#OUTREACH_FROM_ADDRESS` and cannot be anything else. */}
              {/* 🔴 THE SEND ROW IS ALWAYS HERE, AND SAYS WHY IT CANNOT SEND. It used to be behind
                  `isEmail && !sendingOff` — so on a blank email there were no send buttons at all,
                  only the sentence under the box explaining what they would do. A disabled button
                  with its reason on hover tells you what is missing; an absent one tells you
                  nothing. `sendBlock` is the one reason, in priority order, shared by both. */}
              {(
                <>
                  <button onClick={() => askSend(true)} disabled={!!testBlock || sending}
                    title={testBlock ?? 'Sends this message to your own address. Nothing is logged and no contact is recorded.'}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400">
                    Send test to me
                  </button>
                  {/* 🔴 THE ONLY ORANGE CONTROL ON THE PAGE, AND IT SAYS WHAT WILL HAPPEN. The
                      follow-up date comes from the page's single control, so "Send · follow up
                      3 Oct" is the whole consequence of the press, visible before it. */}
                  <button onClick={() => askSend(false)} disabled={!!sendBlock || sending}
                    title={sendBlock
                      ?? `Sends from your mailbox to ${toEmail} and logs the contact.${followUpDate ? ` Follow-up set for ${followUpDate}.` : ''}`}
                    className="text-sm font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-orange-400">
                    {sending ? 'Sending…' : `${sendButtonLabel({ isReply: !!replyTo, step: stepKind ?? null })}${sendLabelSuffix ?? ''}`}
                  </button>
                </>
              )}
              {/* ⚠️ NEUTRAL, NOT ORANGE, AND HIDDEN ON THE PROSPECT PAGE. It records an email sent
                  from somewhere else; the page has a Log tab and four one-click buttons for that,
                  and two ways to do one thing side by side is what this redesign is removing. */}
              {!hideCopyAndLog && (
              <button onClick={doLog} disabled={logging || logged || !body.trim()}
                className="text-sm font-bold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400">
                {logging ? 'Logging…' : logged ? 'Logged ✓' : 'Log as outbound contact'}
              </button>
              )}
            </div>
          </div>
        </div>
      </div>
  )

  // 🔴 INLINE IS THE CARD ON ITS OWN. No backdrop, no portal, no z-index — there is nothing to sit
  // over, and a `position: fixed` panel inside a page would scroll independently of the timeline it
  // is answering. ⚠️ The height cap goes with it: the PAGE scrolls, so a panel that scrolled inside
  // a cap would put two scrollbars beside each other.
  // 🔴 THE FOCUSED WRITING VIEW. The same panel, given the whole window — for the email that is
  // long enough that a column is the wrong shape to write it in. It is the SAME component and the
  // same state: pressing ⤢ does not copy a draft anywhere, it changes where the box is drawn.
  // ⚠️ THE CONVERSATION SITS BESIDE IT HERE, not under it, because that is the width's whole point.
  if (expanded) {
    return createPortal(
      <div style={{ zIndex: 90 }} className="fixed inset-0 bg-white flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200">
          <span className="font-bold text-slate-800">Writing to {truckName}</span>
          <span className="text-[11px] text-slate-400">Esc returns</span>
          <button onClick={() => setExpanded(false)}
            className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
            Done
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{panel}</div>
      </div>,
      document.body,
    )
  }

  if (inline) return panel

  // 🔴 THE z-index IS AN INLINE STYLE, NOT A `z-[85]` CLASS, AND THAT IS A BUG FIX WORTH KEEPING.
  // It shipped as `className="… z-[85] …"` and the window painted BEHIND the prospect modal. The
  // cause was NOT a stacking context — it was measured: `z-[85]` is an ARBITRARY Tailwind utility
  // that no other file in the repository uses, so the rule exists only once the JIT has scanned this
  // file. Until it did, the element resolved to `z-index: auto`, and a `position: fixed` element
  // with `auto` paints at the same level as `0` — underneath the modal's `z-50`. An inline style is
  // not a stylesheet rule, so it cannot be absent from one.
  // ⚠️ THE MODAL THIS SAT OVER IS GONE (the prospect view is a page), so this branch has no caller
  // in the app today. It is kept because the component's contract is "a compose window", and a
  // future caller that wants one over something should get the fixed version that was proven.
  return createPortal(
    <div style={{ zIndex: 85 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      role="presentation">
      {panel}
    </div>,
    document.body,
  )
}

// Same classes the modal's own fields use, so this window matches the form it replaces.
const FIELD = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm'
/**
 * A template chip. 🔴 THE SELECTED ONE IS FILLED DARK, NOT ORANGE. Orange is reserved on this page
 * for exactly two things — the Send button and the Next banner — so that "the orange one" is always
 * the thing about to happen. A chip is a choice, not an action.
 */
const chipCls = (on: boolean) =>
  `text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-slate-400 ${
    on ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`
const LABEL = 'block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5'
