// components/admin/ProspectWorkspace.tsx — one prospect, one page: scan, act, edit, in that order.
//
// 🔴 WHY THIS REPLACED A MODAL (30 September 2026). The prospect view was a 1152px dialog holding the
// identity, every editable field, the demo tools, a multi-line email history and an always-open
// logging form, all at equal weight and all competing for the same 500px column. Dominic's words were
// "cramped and messy". The shape here is taken from tools that do this job all day — Close's lead page
// and Inbox, Pipedrive's Focus, HubSpot's record page, Attio's record navigation — and the principle
// is one sentence: SCAN FIRST, ACT SECOND, EDIT THIRD.
//   • The header answers "who is this and what is the ONE next thing" (Close's Focus line).
//   • The right column is where work happens: four buttons, nothing open until you press one, and
//     the history under them.
//   • The left column is reference — read-only until you press ✎.
//
// 🔴 EVERY RULE AND EVERY GUARD IS UNCHANGED, and that is the point of this being a layout change.
// The send path's refusals, the single contact writer, `nextStep` as the only derivation, the
// needs-attention predicate, the sandboxed iframe, attachments by storage path, the linked-truck
// refusal, do_not_contact never being set automatically — none of them is re-implemented here. This
// file arranges controls over functions that already exist.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { nativeAuthHeader } from '@/lib/native/session'
import { safeHref } from '@/lib/safe-href'
import ComposeWindow, { type ReplyTarget } from '@/components/admin/ComposeWindow'
import type { EditorApi } from '@/components/admin/RichEmailEditor'
import CreateDemoModal from '@/components/admin/CreateDemoModal'
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'
import ProspectTimeline from '@/components/admin/ProspectTimeline'
import {
  type Contact, type Prospect, type TimelinePayload,
  STATUS_LABEL, fmtDate, confirmLogoWrite, linkLabel, fetchTimeline,
  ModalThumb, WhatsAppBox, GrowingTextarea, NoteRow, FIELD_CLS, LABEL_CLS,
} from '@/components/admin/outreach-shared'
import { templatesFor, suggestTemplateId, contextFromProspect, type MessageTemplate } from '@/lib/outreach-template-render'
import {
  chooseForStep, indexSlots, STEP_LABELS, type SequenceSlot, type SlotTemplate,
} from '@/lib/outreach-sequence'
import type { Snippet } from '@/lib/outreach-snippets'
import {
  nextStep, channelFor, leadTypeOf, isLeadType, shouldFreezeLeadType,
  LEAD_TYPE_LABELS, LEAD_TYPES, type Step,
} from '@/lib/outreach-step'
import {
  OUTREACH_STAGES, CONTACT_CHANNELS, CONTACT_DIRECTIONS, kindsForDirection, defaultKindFor,
  kindOrder, kindLabel, channelLabel, directionLabel, followUpDateFor, contactDay, toYMD,
} from '@/lib/outreach'
import { phoneWhatsApp } from '@/lib/whatsapp-hint'
import { replyRecipientFor } from '@/lib/outreach-reply-rules'
import { PAGE_HEADER_ID } from '@/components/admin/EmailReadingPanel'
import { getLocalDateInTz } from '@/lib/time-utils'
import { parseAttachments } from '@/lib/outreach-mail-bodies'
import {
  nextAction, isTypingTarget, SHORTCUTS, type NextAction,
  composerDefault, oneClickKind, ONE_CLICK_LOGS, FOLLOW_UP_CHOICES, FOLLOW_UP_LABEL,
  followUpDateForChoice, defaultFollowUpChoice, storedFollowUpChoice, shortDate, dayAndDate,
  gridTemplateFor, NOTE_BOX_ROWS, NOTES_SHOWN,
  type FollowUpChoice,
} from '@/lib/outreach-workspace'
import { readQueue, queuePosition, neighbours, prospectPath, type QueueState } from '@/lib/outreach-queue'

const stageLabel = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, ' ')
const CARD = 'border border-slate-200 rounded-xl bg-white'
/**
 * 🔴 ORANGE IS RESERVED, AND THIS CONSTANT IS WHERE THAT STARTS. Exactly two things on this page
 * are orange or amber: the Send button and the Next banner. Everything else — Save, Add note, Log,
 * Edit — is neutral, so "the coloured thing" always means "the thing about to leave the building".
 * The focus ring is slate for the same reason.
 */
const BTN = 'text-sm font-bold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-slate-400'

/**
 * Which tab the centre column is showing.
 * 🔴 IT IS NEVER NULL ANY MORE. The previous page had four buttons and nothing open, so writing an
 * email cost a click before the first keystroke — on a screen whose entire purpose is writing one.
 * The composer is the default state; the other three are tabs beside it.
 */
/* 🔴 THE NOTE TAB IS GONE (v3). A note is not a channel, and putting it beside Email / Call /
 * WhatsApp made writing one cost a tab change and a lost composer draft. It is a box in the left
 * column now, always visible, next to the standing notes it belongs with. */
type Panel = 'email' | 'call' | 'whatsapp'

export default function ProspectWorkspace({ prospectId }: { prospectId: string }) {
  const router = useRouter()

  // ── THE DATA ────────────────────────────────────────────────────────────────────────────────────
  // ⚠️ THE LIST ROUTE, NOT A NEW ONE. Every derivation this page shows — the contact ladder, the demo,
  // the event counts, the migration probes — is already assembled there, for every prospect, by code
  // that has been in production since V12.1. A per-prospect endpoint would be a second assembly of
  // the same row and the two would drift; 231 rows is one query and a few hundred kilobytes.
  const [prospect, setProspect] = useState<Prospect | null>(null)
  /** ⚠️ Kept only to name the NEXT prospect in the queue. Nothing else on this page reads it. */
  const [allProspects, setAllProspects] = useState<Prospect[]>([])
  /** The list this page was opened from. Read from sessionStorage on mount — see that effect. */
  const [queue, setQueue] = useState<QueueState | null>(null)
  // ── 🔴 THE PANEL STATE IS DECLARED HERE, ABOVE EVERY EFFECT THAT TOUCHES IT. The mount effect
  // applies the URL's intent and `messageAction` arms the "Done" bar, and both run before the render
  // reaches the panel section — a `const` declared later would be in its temporal dead zone.
  const [panel, setPanel] = useState<Panel>('email')
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [dirty, setDirty] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [editing, setEditing] = useState(false)
  const [flags, setFlags] = useState({ names: false, leadFreeze: false, dnc: false })
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null)
  /** The sequence grid, indexed by box, and the templates it points at BY UUID. */
  const [slots, setSlots] = useState<ReadonlyMap<string, SequenceSlot>>(new Map())
  const [slotTemplates, setSlotTemplates] = useState<SlotTemplate[]>([])
  /** Dominic's own names for the four truck types, or null while they load. */
  const [leadLabels, setLeadLabels] = useState<Record<string, string> | null>(null)
  /** 🔴 FALSE UNTIL THE MIGRATION IS APPLIED. The composer then pre-selects NOTHING and says why —
   *  rather than falling back to the mechanism this replaced, which would keep two of them alive. */
  const [hasSequence, setHasSequence] = useState(true)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [timeline, setTimeline] = useState<TimelinePayload | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const h = await nativeAuthHeader()
    const res = await fetch('/api/admin/outreach', { headers: h, credentials: 'same-origin' }).catch(() => null)
    if (!res) { setLoading(false); return }
    if (res.status === 404 || res.status === 401) { setDenied(true); setLoading(false); return }
    const data = await res.json().catch(() => null) as { prospects?: Prospect[]; hasContactNames?: boolean; hasLeadTypeFreeze?: boolean; hasDoNotContact?: boolean } | null
    if (!data) { setLoading(false); return }
    setAllProspects(data.prospects ?? [])
    setProspect((data.prospects ?? []).find(p => p.id === prospectId) ?? null)
    setFlags({ names: !!data.hasContactNames, leadFreeze: !!data.hasLeadTypeFreeze, dnc: !!data.hasDoNotContact })
    setLoading(false)
  }, [prospectId])

  const reloadTimeline = useCallback(async () => {
    const t = await fetchTimeline(prospectId)
    if (t) setTimeline(t)
  }, [prospectId])

  /** Everything this page re-reads after a write. One function, so no action can refresh half of it. */
  const reloadAll = useCallback(async () => { await Promise.all([load(), reloadTimeline()]) }, [load, reloadTimeline])

  /**
   * 🔴 ONE MOUNT EFFECT, IN ORDER: the queue, the prospect, its timeline, and only then whatever the
   * URL asked for. Today's Compose and Reply buttons put an intent in the query string, and acting on
   * it needs the message it names — so it is applied HERE, from the values just fetched, rather than
   * in a second effect watching rendered state. That also makes it a one-shot by construction: there
   * is no later render for it to fire on again.
   * ⚠️ THE QUEUE IS READ AFTER MOUNT, not during render, because `sessionStorage` does not exist on
   * the server and a value that appeared only on the client would be a hydration mismatch.
   */
  useEffect(() => {
    let live = true
    void (async () => {
      setQueue(readQueue(typeof window === 'undefined' ? null : window.sessionStorage))
      await load()
      const t = await fetchTimeline(prospectId)
      if (!live) return
      if (t) setTimeline(t)
      const q = new URLSearchParams(window.location.search)
      const replyId = q.get('reply')
      const m = replyId ? (t?.messages ?? []).find(x => x.id === replyId) : undefined
      if (m) {
        setReplyTarget({ messageId: m.id, subject: m.subject ?? null, fromAddress: m.from_address ?? null, date: m.message_date ?? null })
        setPanel('email')
      } else if (q.get('compose') === '1') {
        setPanel('email')
      }
    })()
    return () => { live = false }
  }, [load, prospectId])

  useEffect(() => {
    let live = true
    void (async () => {
      const h = await nativeAuthHeader()
      const r = await fetch('/api/admin/outreach-templates', { headers: h, credentials: 'same-origin' }).catch(() => null)
      if (!live) return
      if (!r || !r.ok) { setTemplates(null) } else {
        const d = await r.json().catch(() => ({ templates: [] }))
        type Raw = { id: string; slug: string; label: string; channel: MessageTemplate['channel']; subject?: string | null; body: string; sort_order: number; active: boolean; serves_kind?: string | null; serves_lead_type?: string | null; placeholder_defaults?: Record<string, { value?: string; updated_at?: string | null }> }
        // 🔴 THE GRID COMES WITH THE TEMPLATES, IN ONE REQUEST. Two fetches would mean a window in
        // which the composer has templates and no sequence, and would pre-select nothing for a
        // moment on every load — which reads as "no template for this step".
        setSlots(indexSlots(((d.slots ?? []) as SequenceSlot[])))
        setSlotTemplates(((d.templates ?? []) as Raw[]).map(t => ({
          uuid: t.id, slug: t.slug, label: t.label, channel: t.channel, active: t.active,
        })))
        setLeadLabels((d.leadTypeLabels ?? null) as Record<string, string> | null)
        setHasSequence(d.hasSequence !== false)
        setTemplates(((d.templates ?? []) as Raw[]).map(t => ({
          id: t.slug, label: t.label, channel: t.channel,
          subject: t.subject ?? undefined, body: t.body,
          sortOrder: t.sort_order, active: t.active,
          servesKind: t.serves_kind ?? null, servesLeadType: t.serves_lead_type ?? null,
          defaults: Object.fromEntries(Object.entries(t.placeholder_defaults ?? {})
            .map(([k, v]) => [k, { value: v?.value ?? '', updatedAt: v?.updated_at ?? null }])),
        })))
      }
      // ⚠️ SEPARATE AND NON-FATAL, as it is on the list: the snippet library failing must never stop
      // templates loading — it is a convenience over a tier that has always worked by prompting.
      const r2 = await fetch('/api/admin/outreach-snippets', { headers: h, credentials: 'same-origin' }).catch(() => null)
      if (live && r2 && r2.ok) { const d2 = await r2.json().catch(() => ({ snippets: [] })); setSnippets(d2.snippets ?? []) }
    })()
    return () => { live = false }
  }, [])

  // ── THE WRITERS ─────────────────────────────────────────────────────────────────────────────────
  // 🔴 THE SAME ROUTES AND THE SAME ACTIONS THE LIST USES. Every rule they enforce is server-side, so
  // these are thin: post, then re-read. ⚠️ NO OPTIMISTIC MERGE HERE, and that is a deliberate
  // difference from the list — the list holds 231 rows and re-reading on every tick would be absurd;
  // this page holds one, so a re-read is one query and is always right.
  const post = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const h = await nativeAuthHeader()
    const r = await fetch('/api/admin/outreach', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
      credentials: 'same-origin', body: JSON.stringify(body),
    })
    return (await r.json().catch(() => ({}))) as Record<string, unknown>
  }, [])

  const patch = useCallback(async (p: Record<string, unknown>) => {
    // 🔴 OPTIMISTIC ON THIS PAGE ONLY FOR WHAT THE CLIENT ALREADY KNOWS — the value it just sent — so
    // a stage pill does not sit on its old value for a round trip. The re-read is still the truth.
    setProspect(cur => (cur ? { ...cur, ...p } as Prospect : cur))
    await post({ action: 'update_prospect', id: prospectId, ...p })
    await reloadAll()
  }, [post, prospectId, reloadAll])

  const [busyId, setBusyId] = useState<string | null>(null)
  /** Mark done / Snooze / Mark as needing reply / Retry / Save to Sent / log it / Add note. */
  const messageAction = useCallback(async (action: string, messageId: string, extra: Record<string, unknown> = {}) => {
    setBusyId(messageId); setNote(null)
    try {
      // ⚠️ TWO ROUTES, BY WHOSE ACTION IT IS. The attention columns belong to the timeline route
      // (Part 1); retry, save-to-sent and log-it belong to the send route and always have.
      const onSend = action === 'retry' || action === 'save_to_sent' || action === 'log_only'
      const url = onSend ? '/api/admin/outreach/mail-send' : '/api/admin/outreach/timeline'
      const body = onSend
        ? { action, message_row_id: messageId, ...extra }
        : { action, message_id: messageId, ...extra }
      const h = await nativeAuthHeader()
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin', body: JSON.stringify(body),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      setNote(j.ok === true ? String(j.message ?? 'Done.') : String(j.refusal ?? j.error ?? 'That did not work.'))
      await reloadAll()
      // 🔴 A RESOLVING ACTION ARMS THE "Done. Next" BAR — see `resolved` below for which ones do.
      if (j.ok === true && RESOLVING.has(action)) setResolved(true)
    } catch { setNote('The connection dropped before the server answered.') }
    finally { setBusyId(null) }
  }, [reloadAll])

  const deleteContact = useCallback(async (c: Contact) => {
    const j = await post({ action: 'delete_contact', id: c.id, prospect_id: prospectId })
    if (j.error) throw new Error(String(j.error))
    // 🔴 THE FOLLOW-UP DATE FOLLOWS THE DELETED CONTACT, and only when it was that contact's own
    // implied date. A date the operator typed is theirs; deleting a rung must not silently rewrite it.
    const pr = prospect
    if (pr && pr.next_action_at && pr.next_action_at === followUpDateFor(c.kind ?? '', contactDay(c.contacted_at))) {
      const remaining = pr.contacts.filter(x => x.id !== c.id && x.direction === 'outbound')
      const newest = remaining.reduce<Contact | null>((best, x) => (!best || x.contacted_at > best.contacted_at ? x : best), null)
      const revertTo = newest ? followUpDateFor(newest.kind ?? '', contactDay(newest.contacted_at)) : null
      if (revertTo !== pr.next_action_at) await post({ action: 'update_prospect', id: pr.id, next_action_at: revertTo })
    }
    await reloadAll()
  }, [post, prospectId, prospect, reloadAll])

  // ── THE QUEUE THIS PAGE WAS OPENED FROM ────────────────────────────────────────────────────────
  const pos = queue ? queuePosition(queue.ids, prospectId) : null
  // ⚠️ MEMOISED because the keyboard effect depends on it; a fresh object each render would
  // re-register the listener on every keystroke elsewhere on the page.
  const nav = useMemo(
    () => (queue ? neighbours(queue.ids, prospectId) : { prev: null, next: null }),
    [queue, prospectId])
  const goTo = useCallback((id: string | null) => { if (id) router.push(prospectPath(id)) }, [router])
  const back = useCallback(() => { router.push(queue?.returnTo ?? '/admin?tab=outreach') }, [router, queue])

  // ── THE DERIVED STEP AND THE FOCUS LINE ────────────────────────────────────────────────────────
  // 🔴 ONE `nextStep` CALL, and `channelFor` for contactability (§57.2: every stopped step carries
  // `channel: null`, so reading the step would call a reachable truck unreachable).
  const waPhone = prospect ? phoneWhatsApp(prospect.phone, null).waPhone : null
  const step: Step | null = useMemo(
    () => (prospect ? nextStep({ ...prospect, waPhone }, prospect.contacts) : null),
    [prospect, waPhone])
  const channel = useMemo(
    () => (prospect ? channelFor({ ...prospect, waPhone }) : null),
    [prospect, waPhone])

  const focus: NextAction | null = useMemo(() => {
    if (!prospect) return null
    return nextAction({
      messages: (timeline?.messages ?? []).map(m => ({ ...m, id: m.id })),
      step, channel,
      nextActionAt: prospect.next_action_at,
      linkedTruck: !!prospect.hatchgrab_truck_id,
      now: new Date(),
      today: getLocalDateInTz('Europe/London'),
      contactName: [prospect.contact_first_name, prospect.contact_last_name].filter(Boolean).join(' ') || null,
    })
  }, [prospect, timeline, step, channel])

  // ── THE COMPOSER'S OPENING STATE ───────────────────────────────────────────────────────────────
  // 🔴 FROM THE NEXT LINE, WHICH IS FROM `nextAction`, WHICH IS FROM THE EXISTING FUNCTIONS. The
  // banner and the box are two renderings of ONE answer; deciding again here is how a page ends up
  // telling you to reply while opening a chase template.
  const everEmailed = useMemo(
    () => (timeline?.messages ?? []).some(m => m.direction === 'outbound' && m.is_test !== true),
    [timeline])
  const composerMode = useMemo(() => composerDefault(focus, { everEmailed }), [focus, everEmailed])

  // 🔴 ONE FOLLOW-UP CONTROL FOR THE WHOLE PAGE. Send, the four one-click logs and the Call/WhatsApp
  // tabs all read this one value, and its default is whatever `followUpDateFor` would have written
  // for the action being taken — that function, not a second table of intervals here.
  const today = toYMD(new Date())
  const oneClick = useMemo(
    () => oneClickKind(step, (prospect?.contacts ?? []).some(c => c.direction === 'inbound')),
    [step, prospect])
  /* 🔴 THE STORED DATE FIRST, THE SUGGESTION SECOND. The chips were seeded ONLY from
   * `defaultFollowUpChoice` — the interval the next action would set — so a date already saved on
   * the prospect was never shown, and on a prospect who has replied (no rung, so no suggestion) it
   * read "None" over a real date in the database. */
  const followUpSeed = useMemo(
    () => storedFollowUpChoice(prospect?.next_action_at ?? null, today)
      ?? defaultFollowUpChoice(oneClick, today, followUpDateFor),
    [prospect?.next_action_at, oneClick, today])
  const [followUp, setFollowUp] = useState<{ choice: FollowUpChoice; date: string | null } | null>(null)
  const followUpNow = followUp ?? followUpSeed
  const followUpDate = followUpNow.choice === 'none' ? null : followUpNow.date
  /** The date this control held before the last change, for the Undo beside the confirmation. */
  const [followUpUndo, setFollowUpUndo] = useState<null | { was: string | null; label: string }>(null)

  // ── ONE-CLICK LOGGING, AND ITS UNDO ────────────────────────────────────────────────────────────
  const [oneClickBusy, setOneClickBusy] = useState<string | null>(null)
  /** The contact just written, for 8 seconds. 🔴 The Undo DELETES it, through the existing route. */
  const [undoable, setUndoable] = useState<{ id: string; label: string } | null>(null)

  /**
   * Write the follow-up date, through the ONE path that writes it.
   * ⚠️ `next_action_at` HAS ONE WRITER — `update_prospect` — and this is the page's one caller of it
   * for that column. The DATE itself comes from the single follow-up control, whose default came
   * from `followUpDateFor`; nothing here invents an interval.
   */
  /**
   * 🔴 THE ONE WRITER OF `next_action_at`, NOW WITH TWO CALLERS AND STILL ONE STATEMENT.
   *   • after a log or a send — `applyFollowUp(kind)`, which also freezes the lead type at rung 1;
   *   • from the chips — `applyFollowUp(null, date)`, which writes the date and nothing else.
   * ⚠️ `kind === null` MEANS "NOBODY WAS CONTACTED". The freeze belongs to a first contact actually
   * being logged; a date chosen on its own must never stamp the framing of a sequence.
   * ⚠️ `dateOverride === undefined` MEANS "USE THE CONTROL'S VALUE" — `null` is a real value there
   * and clears the date, so the two cannot be the same signal.
   */
  const applyFollowUp = useCallback(async (kind: string | null, dateOverride?: string | null) => {
    const date = dateOverride === undefined ? followUpDate : dateOverride
    const patchAfter: Record<string, unknown> = { next_action_at: date }
    if (kind && prospect && shouldFreezeLeadType(kind, prospect, flags.leadFreeze)) {
      patchAfter.lead_type_at_first_contact = leadTypeOf(prospect)
    }
    await post({ action: 'update_prospect', id: prospectId, ...patchAfter })
  }, [post, prospectId, followUpDate, prospect, flags.leadFreeze])

  /**
   * A chip, or a picked date, SAVED — which is what it always looked as though it did.
   * 🔴 IT WENT NOWHERE BEFORE. The control only pre-set the date the NEXT log or send would write,
   * so choosing one and then doing nothing else saved nothing at all, and a reload showed "None".
   * ⚠️ THE UNDO RESTORES THE VALUE THAT WAS THERE, not the previous chip — the stored date is the
   * thing being changed, so it is the thing that comes back.
   */
  // ⚠️ A PLAIN FUNCTION, NOT `useCallback`. The React Compiler declines to memoise this one, and a
  // `useCallback` it cannot preserve is a lie about stability — the same call this file has already
  // had to make twice. Nothing downstream is memoised on it.
  const chooseFollowUp = async (choice: FollowUpChoice, date: string | null) => {
    const was = prospect?.next_action_at ? String(prospect.next_action_at).slice(0, 10) : null
    setFollowUp({ choice, date })
    // ⚠️ "Pick" WITH NO DATE YET IS NOT A CHOICE — it opens the date field and waits for one.
    if (choice === 'pick' && !date) return
    const next = choice === 'none' ? null : date
    await applyFollowUp(null, next)
    setFollowUpUndo({
      was,
      label: next ? `Follow-up set for ${dayAndDate(next)}` : 'Follow-up cleared',
    })
    window.setTimeout(() => setFollowUpUndo(null), 8000)
    await reloadAll()
  }

  const undoFollowUp = async () => {
    const was = followUpUndo?.was ?? null
    setFollowUpUndo(null)
    setFollowUp(was ? (storedFollowUpChoice(was, today) ?? { choice: 'pick', date: was }) : { choice: 'none', date: null })
    await applyFollowUp(null, was)
    await reloadAll()
  }

  /**
   * One button, one contact.
   * 🔴 THE `kind` IS `oneClickKind`'s, NOT A DROPDOWN'S DEFAULT. That is the bug this replaces: the
   * log form defaulted to the first rung whenever nobody touched it, so a call to a prospect who
   * had already replied was recorded as a FIRST CONTACT — and §57 derives the next step from
   * exactly that column.
   */
  const afterOneClick = useCallback(async (id: string) => {
    const spec = ONE_CLICK_LOGS.find(l => l.id === id)
    if (!spec || oneClickBusy) return
    setOneClickBusy(id); setNote(null)
    try {
      const j = await post({
        action: 'log_contact', prospect_id: prospectId,
        channel: spec.channel, direction: 'outbound', kind: oneClick,
        message: spec.message, contacted_at: today,
      })
      if (j.error) { setNote(String(j.error)); return }
      await applyFollowUp(oneClick)
      const contactId = typeof j.id === 'string' ? j.id : null
      if (contactId) setUndoable({ id: contactId, label: spec.label })
      await reloadAll()
      setResolved(true)
    } finally { setOneClickBusy(null) }
  }, [oneClickBusy, post, prospectId, oneClick, today, applyFollowUp, reloadAll])

  /** ⚠️ EIGHT SECONDS, THEN THE OFFER GOES — not the contact. Undo deletes; time only hides. */
  useEffect(() => {
    if (!undoable) return
    const t = setTimeout(() => setUndoable(null), 8000)
    return () => clearTimeout(t)
  }, [undoable])

  const undoOneClick = useCallback(async () => {
    if (!undoable) return
    // 🔴 THE EXISTING DELETE, BY THE ID THE WRITE RETURNED — so it removes exactly the row that was
    // just added and never "the most recent one", which on a double-press would be the wrong one.
    await post({ action: 'delete_contact', id: undoable.id, prospect_id: prospectId })
    setUndoable(null)
    await reloadAll()
  }, [undoable, post, prospectId, reloadAll])

  /**
   * 🔴 THE NOTE BOX IS A PLACE ON THE PAGE, NOT A MODE. `N` and the phone's sticky "Note" button
   * both scroll to it and put the caret in it, which is what "add a note" means when the box is
   * always there. ⚠️ BY ID, not by a ref passed three levels down: the box is rendered by a card
   * in another column, and threading a ref through two components to focus a textarea is more
   * moving parts than the thing it does.
   */
  const focusNoteBox = useCallback(() => {
    const el = document.getElementById(ADD_NOTE_ID) as HTMLTextAreaElement | null
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.focus()
  }, [])

  /**
   * The demo link, INSERTED into the email being written.
   *
   * 🔴 IT NEVER INSERTED ANYTHING. This function switched to the Email tab and printed "Paste the
   * demo link with ⌘V — it is on your clipboard", which put the whole job on the operator and only
   * worked at all because the button called Copy first. On Nomadough it therefore "did nothing":
   * the note is easy to miss, and nothing had been inserted.
   * ⚠️ IT GOES THROUGH THE EDITOR'S OWN HANDLE, so the link lands at the caret and the document is
   * the editor's the whole time — there is no second copy of the message for this to write into.
   * ⚠️ IT IS A REAL LINK. The document schema grew a validated `link` mark for it (https only,
   * refused otherwise, server-side); a bare URL as text would have depended on the recipient's mail
   * client to make it clickable.
   */
  const composerApi = useRef<EditorApi | null>(null)
  const insertDemoLink = useCallback((url: string) => {
    setPanel('email')
    // ⚠️ AFTER THE TAB HAS RENDERED. Switching panels mounts the editor; asking it to insert in the
    // same tick would ask a component that does not exist yet.
    window.setTimeout(() => {
      const ok = composerApi.current?.insertLink(url) ?? false
      setNote(ok ? 'Demo link inserted.' : 'The email box is not open yet — open the Email tab and try again.')
    }, 0)
  }, [])

  // ── LAYOUT ──────────────────────────────────────────────────────────────────────────────────────
  // 🔴 ONE LAYOUT FOR A LAPTOP AND A MONITOR: fixed side columns, fluid centre. The only thing that
  // changes above 1920px is that the side columns get 40px and 30px more, because at that width
  // they can hold their content without wrapping and the email still gets every other pixel.
  // 🔴 THE WHOLE TEMPLATE COMES FROM `gridTemplateFor`, NOT JUST THE WIDTHS. It used to be three
  // tracks at every width, with `max-lg:grid-cols-1` meant to collapse them — a class that lost to
  // the inline style beside it and therefore never did anything. One function, one decision, and a
  // harness can ask it what a 390px phone gets without a browser.
  const [vw, setVw] = useState(1440)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const columns = gridTemplateFor(vw)

  /**
   * "Use current type" — 🔴 THE ONLY THING IN THE CODEBASE THAT REWRITES A FROZEN LEAD TYPE, and it
   * happens on a click and nowhere else. `shouldFreezeLeadType` is write-once precisely so a later
   * rung cannot re-stamp the framing an approach was written in; this is the operator saying "the
   * truck genuinely changed". It goes through the page's ONE prospect patch, and the route records
   * a stage-change-style note, so the history says when the framing moved and who moved it.
   */
  const useCurrentType = useCallback(async () => {
    if (!prospect) return
    const live = leadTypeOf(prospect)
    await patch({ lead_type_at_first_contact: live, __note: `Truck type set to ${LEAD_TYPE_LABELS[live]} by hand` })
  }, [prospect, patch])

  /** The next prospect's name, for "Up next". ⚠️ Only when the list that named it is still loaded. */
  const nextName = nav.next ? (allProspects.find(x => x.id === nav.next)?.name ?? 'the next one') : null

  /**
   * The template the composer opens on — THE SEQUENCE GRID'S ANSWER for this step and this truck
   * type, or none.
   * 🔴 `chooseForStep`, NOT `templateForStep`. The old function read the template rows' own
   * `serves_kind` / `serves_lead_type` tags and fell back to a hardcoded slug map; the grid is one
   * table with one row per box. The tags are still on the rows and are still shown on the Templates
   * tab, read-only — nothing reads them to CHOOSE any more.
   */
  const offerable = useMemo(() => templatesFor(templates ?? [], prospect ?? ({} as Prospect)), [templates, prospect])
  const chosen = useMemo(() => {
    // ⚠️ A REPLY AND A THREAD MESSAGE HAVE NO RUNG, so they have no box: the chips open on Blank,
    // which is correct for both.
    if (composerMode.mode === 'reply' || composerMode.mode === 'thread') return null
    if (!step) return null
    return chooseForStep({ slots, templates: slotTemplates, step })
  }, [composerMode, step, slots, slotTemplates])
  const composerTemplateId = chosen?.slug ?? null

  /**
   * The one line under the chips. It says which box the template came from, or why there is none —
   * in the operator's own words for the truck type, because those are the words on the grid.
   * ⚠️ IT NEVER SAYS "no template" WHEN THERE IS ONE FOR ANOTHER REASON: every miss has its own
   * sentence, so "nothing is set up" and "the box points at a retired template" cannot be confused.
   */
  const typeName = (t: string | null | undefined): string =>
    (t && leadLabels?.[t]) || (t && LEAD_TYPE_LABELS[t as keyof typeof LEAD_TYPE_LABELS]) || 'an unknown type'
  const sequenceNote = useMemo(() => {
    if (!chosen || !step) return null
    if (!hasSequence) {
      return 'The sequence grid is not set up yet — apply 20260930_outreach_sequence_slots.sql. Nothing is pre-selected until then.'
    }
    const stepName = step.kind ? STEP_LABELS[step.kind] : null
    switch (chosen.miss) {
      case null:
        return `Suggested · ${typeName(step.leadType)} · ${stepName}`
          + (chosen.inherited ? ' — from the default column' : '')
      case 'empty':
        return `No template for ${typeName(step.leadType)} · ${stepName} — pick one or write it.`
      case 'inactive':
        return `The template for ${typeName(step.leadType)} · ${stepName} (${chosen.label}) has been retired — pick one or write it.`
      case 'wrong_channel':
        return `The box for ${typeName(step.leadType)} · ${stepName} holds a template of the other channel — pick one or write it.`
      case 'unknown_type':
        return 'This truck’s type could not be read, so no template was suggested.'
      case 'no_channel':
        return 'There is no address or number to send to, so no template was suggested.'
      case 'no_step':
        return step.state === 'stopped'
          ? `No step to send: ${step.label.toLowerCase()}. Pick a template or write it.`
          : 'No step to send, so no template was suggested.'
      default:
        return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, step, leadLabels, hasSequence])

  // ── PANELS ──────────────────────────────────────────────────────────────────────────────────────
  /**
   * 🔴 ONE PANEL AT A TIME, AND A TYPED DRAFT IS NEVER THROWN AWAY SILENTLY. The modal's failure was
   * everything open at once; the opposite failure is a click that discards half an email. So the
   * switch asks — once, with the browser's own confirm, which is the same thing the compose window's
   * Escape already uses.
   */
  // ⚠️ PLAIN FUNCTIONS, NOT `useCallback`. They branch on a `window.confirm`, which the React
  // Compiler declines to memoise — and a `useCallback` it cannot preserve is a lie about stability.
  // Nothing downstream is memoised on them; the keyboard effect re-subscribes, which is two calls.
  const openPanel = (next: Panel, target: ReplyTarget | null = null) => {
    // ⚠️ SWITCHING AWAY FROM A TYPED EMAIL ASKS FIRST. Reply into the SAME tab does not: it is the
    // same surface being re-aimed, and the draft is replaced by the template that reply mode picks.
    if (panel !== next && dirty) {
      if (!window.confirm('Discard what you have typed?')) return
    }
    setDirty(false)
    setReplyTarget(target)
    setPanel(next)
  }

  /** Esc on a tab that is not Email returns to Email; on Email it clears the reply aim. */
  const closePanel = () => {
    if (dirty && !window.confirm('Discard what you have typed?')) return
    setDirty(false); setReplyTarget(null); setPanel('email')
  }

  /**
   * "Record as Chase 1" — an email sent from Outlook, given the step it was.
   *
   * 🔴 NEVER AUTOMATIC, AND IT IS ONE CLICK PER EMAIL. The poll cannot know which step a hand-sent
   * email was (the sequence report's §0c), and guessing would either skip a rung or invent one. This
   * is Dominic saying which it was.
   * 🔴 IT GOES THROUGH THE ONE CONTACT WRITER AND THE ONE FOLLOW-UP WRITER. `log_only` is the
   * existing route action that calls `logOutreachContact` and links the contact to THIS message —
   * which is what stops it being counted twice — and `applyFollowUp` is the page's single writer of
   * `next_action_at`, so a recorded Outlook send schedules exactly what a system send of that step
   * would have.
   */
  const recordAsStep = useCallback(async (messageId: string, kind: string) => {
    setBusyId(messageId); setNote(null)
    try {
      const h = await nativeAuthHeader()
      const r = await fetch('/api/admin/outreach/mail-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'log_only', message_row_id: messageId, kind }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (j.ok !== true) { setNote(String(j.refusal ?? j.error ?? 'That was not recorded.')); return }
      await applyFollowUp(kind)
      setNote(`Recorded as ${STEP_LABELS[kind as keyof typeof STEP_LABELS] ?? kind}.`)
      await reloadAll()
    } catch { setNote('The connection dropped before the server answered.') }
    finally { setBusyId(null) }
  }, [applyFollowUp, reloadAll])

  const replyToMessage = (m: {
    id: string; subject?: string | null; from_address?: string | null; to_address?: string | null
    direction?: string | null; message_date?: string | null
  }) => {
    // 🔴 WHO IT GOES BACK TO DEPENDS ON WHICH WAY IT WENT. Answering their email goes to whoever
    // wrote it; following up on MY OWN goes to whoever I sent it to. `from_address` on an outbound
    // row is our own mailbox, so using it either way would address the follow-up to ourselves — and
    // the server would refuse it, which is the right refusal for the wrong reason.
    const back = replyRecipientFor(m)
    openPanel('email', { messageId: m.id, subject: m.subject ?? null, fromAddress: back, date: m.message_date ?? null })
  }

  // ── KEYBOARD ────────────────────────────────────────────────────────────────────────────────────
  /**
   * 🔴 ONE LISTENER, REGISTERED ONCE, READING THE LATEST HANDLERS THROUGH A REF. Registering it with
   * the handlers as dependencies would tear down and re-add a window listener on every keystroke
   * elsewhere on the page; two of those handlers cannot be memoised at all (they branch on a
   * `window.confirm`). The ref is written in an effect, never during render.
   */
  const latest = useRef({ panel, expandedId, nav, resolved, focus, timeline, goTo, openPanel, closePanel, replyToMessage, focusNoteBox })
  useEffect(() => {
    latest.current = { panel, expandedId, nav, resolved, focus, timeline, goTo, openPanel, closePanel, replyToMessage, focusNoteBox }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 🔴 NEVER WHILE TYPING. The predicate is shared and tested; see `isTypingTarget`. It checks
      // `isContentEditable` as well as the tag, because the email body is a ProseMirror surface and
      // a tag test alone would let every letter key fire inside it.
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const L = latest.current
      const k = e.key
      if (k === 'Escape') { if (L.expandedId) setExpandedId(null); else L.closePanel(); return }
      if (k === '?') { setShowHelp(v => !v); return }
      if (k === 'j' || k === 'J') { L.goTo(L.nav.next); return }
      if (k === 'k' || k === 'K') { L.goTo(L.nav.prev); return }
      if (k === 'e' || k === 'E') { e.preventDefault(); L.openPanel('email'); return }
      // 🔴 N FOCUSES THE NOTE BOX RATHER THAN OPENING A TAB — the box is always there now.
      if (k === 'n' || k === 'N') { e.preventDefault(); L.focusNoteBox(); return }
      if (k === 'c' || k === 'C') { e.preventDefault(); L.openPanel('call'); return }
      if (k === 'r' || k === 'R') {
        // ⚠️ R DOES NOTHING WHEN NOTHING IS WAITING, deliberately: it answers the message the Next
        // line names, and inventing a target when there is none would reply to the wrong email.
        const f = L.focus
        if (f && f.kind === 'reply') {
          const m = (L.timeline?.messages ?? []).find(x => x.id === f.messageId)
          if (m) { e.preventDefault(); L.replyToMessage(m) }
        }
        return
      }
      // 🔴 ENTER FOLLOWS THE BAR AND ONLY THE BAR. With no "Done" showing it does nothing at all.
      if (k === 'Enter' && L.resolved && L.nav.next) { e.preventDefault(); L.goTo(L.nav.next) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── RENDER ──────────────────────────────────────────────────────────────────────────────────────
  if (denied) return <Shell><p className="text-sm text-slate-500">/api/admin/outreach refused this session.</p></Shell>
  if (loading) return <Shell><p className="text-sm text-slate-500">Loading…</p></Shell>
  if (!prospect) {
    return (
      <Shell>
        <p className="font-bold text-slate-900">That prospect is not in the list.</p>
        <button onClick={back} className={`${BTN} mt-3 border-slate-200 text-slate-700 hover:bg-slate-50`}>← Back</button>
      </Shell>
    )
  }

  const p = prospect
  const dnc = p.do_not_contact === true

  return (
    <div className="text-slate-900 px-4 py-3 max-md:px-2">
      {/* ── DO NOT CONTACT — ACROSS THE PAGE, NOT A TICKBOX IN A CORNER ──────────────────────────
          🔴 IT BLOCKS EVERY EXIT IN THE SEND PATH, so the page must not look ordinary while it is on.
          Undo is here because the flag is only ever set by hand and is only ever unset by hand —
          nothing in this app sets it automatically, then or now. */}
      {dnc && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-2">
          <span className="font-bold text-red-800">🚫 Do not contact — outreach is blocked for this truck</span>
          <button onClick={() => void patch({ do_not_contact: null })}
            className="ml-auto text-sm font-bold text-red-800 underline hover:text-red-900">Undo</button>
        </div>
      )}

      {/* ── HEADER ───────────────────────────────────────────────────────────────────────────────
          🔴 ONE STAGE CONTROL ON THE PAGE, AND IT IS THIS PILL. There were two — this and a select
          in the contact card's edit mode — which is two places to change one value and two chances
          to disagree about what it currently is. Same route, so a change still records a stage
          change in the timeline. */}
      {/* ⚠️ THE ID IS READ BY THE READING PANEL, which starts at this row's bottom edge so it never
          covers Back, the stage pill or the queue counter while they are on screen. */}
      <div id={PAGE_HEADER_ID} className="flex items-center gap-2 flex-wrap mb-2">
        <button onClick={back} className={`${BTN} border-slate-200 text-slate-700 hover:bg-slate-50 max-md:min-h-11`}>← Back</button>
        <h1 className="text-xl font-bold truncate min-w-0 max-md:text-lg">{p.name}</h1>
        <label className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 max-md:min-h-11">
          <span className="text-[11px] uppercase tracking-wide font-bold text-slate-400">Stage</span>
          <select value={p.stage} onChange={e => void patch({ stage: e.target.value })}
            title="Changing the stage records a stage change in the timeline."
            className="text-xs font-bold bg-transparent focus:outline-none">
            {OUTREACH_STAGES.map(st => <option key={st} value={st}>{stageLabel(st)}</option>)}
          </select>
        </label>
        {/* ⚠️ NEUTRAL LINKS, NOT BUTTONS. They leave the page; nothing here acts on the prospect. */}
        {safeHref(p.website) && (
          <a href={safeHref(p.website)!} target="_blank" rel="noreferrer"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline max-md:hidden"
            title={p.website ?? undefined}>{linkLabel(p.website, 'Website')} ↗</a>
        )}
        {safeHref(p.schedule_url) && (
          <a href={safeHref(p.schedule_url)!} target="_blank" rel="noreferrer"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline max-md:hidden"
            title={p.schedule_url ?? undefined}>{linkLabel(p.schedule_url, 'Schedule')} ↗</a>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* 🔴 THE QUEUE IS NAMED, not just counted: "Follow-ups due ‹ 1 of 5 ›" says which list you
              are walking, which is the difference between knowing where you are and knowing only
              how far along you are. */}
          {/* 🔴 THE QUEUE IS NAMED, AND WHEN THERE IS NO QUEUE THE CONTROL IS NOT THERE AT ALL.
              It read "the list 1 of 1", which is two wrong things at once: "the list" is not the
              name of anything Dominic can see, and a one-of-one counter with two dead arrows is
              furniture. A page opened by URL has no queue and now shows nothing here. */}
          {pos && (
            <>
              <span className="text-xs text-slate-500 mr-1 max-md:hidden">{queue?.label}</span>
              <button onClick={() => goTo(nav.prev)} disabled={!nav.prev} aria-label="Previous (K)" title="Previous in this queue (K)"
                className="text-sm font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 max-md:min-h-11 max-md:min-w-11">‹</button>
              <span className="text-xs text-slate-500 tabular-nums px-1">{pos.index} of {pos.total}</span>
              <button onClick={() => goTo(nav.next)} disabled={!nav.next} aria-label="Next (J)" title="Next in this queue (J)"
                className="text-sm font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 max-md:min-h-11 max-md:min-w-11">›</button>
            </>
          )}
          <MoreMenu p={p} dncEnabled={flags.dnc} onPatch={patch} onRefresh={reloadAll} onHelp={() => setShowHelp(true)} />
        </div>
      </div>

      {/* ── THE NEXT BANNER ──────────────────────────────────────────────────────────────────────
          🔴 FULL WIDTH, AMBER, AND NO BUTTON. It had a button; the button is gone because the
          composer directly below is ALREADY set up for exactly this action (`composerDefault` reads
          the same answer), so the button would have been a second way to arrive where you already
          are. ⚠️ Orange/amber appears in exactly two places on this page — here and the Send button
          — so "the coloured thing" is always what is about to happen. */}
      {/* ⚠️ ONE LINE ON A LAPTOP, TWO ON A PHONE. The headline and the supporting facts stacked
          cost 72px of an 800px viewport — more than two history rows — for text that fits across at
          1440px. Below `md` they wrap, because there the width is the scarce thing. */}
      {focus && (
        <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5
          flex flex-wrap items-baseline gap-x-2">
          <span className="text-[10px] uppercase tracking-wide font-bold text-amber-700">Next</span>
          <span className="text-sm font-bold text-amber-950">{bannerHeadline(focus)}</span>
          <span className="text-[12px] text-amber-800">{bannerDetail(focus, p, timeline)}</span>
        </div>
      )}

      {/* ── THE "DONE. NEXT" BAR ─────────────────────────────────────────────────────────────────
          🔴 IT NEVER NAVIGATES BY ITSELF. Close's Next-Lead pattern works because the result of what
          you just did stays on screen until you choose to move. Enter follows it; nothing else. */}
      {resolved && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2">
          <span className="text-sm font-bold text-emerald-900">Done.</span>
          {nav.next
            ? <button onClick={() => goTo(nav.next)} className={`${BTN} border-emerald-300 text-emerald-900 bg-white hover:bg-emerald-100`}>
                Next: {queue?.label ?? 'All prospects'} →<span className="ml-2 text-[10px] font-normal opacity-70">Enter</span>
              </button>
            : <span className="text-sm text-emerald-900">That&rsquo;s everything in {queue?.label ?? 'this list'}.</span>}
          <button onClick={() => setResolved(false)} className="ml-auto text-xs font-semibold text-emerald-900 underline">Dismiss</button>
        </div>
      )}

      {/* ── THREE COLUMNS ────────────────────────────────────────────────────────────────────────
          🔴 THE SIDE COLUMNS ARE FIXED AND THE CENTRE TAKES THE REST. They hold cards and buttons
          whose ideal width does not change with the window; the email does. So a 27" monitor is the
          same layout as a laptop with a wider email, rather than a different page to learn — which
          is what a fourth column or a re-flow at 1440px would have been.
          ⚠️ THE TRACK WIDTHS ARE AN INLINE STYLE, not an arbitrary Tailwind class. `grid-cols-[300px_1fr_300px]`
          is a value used by exactly one file, and an arbitrary utility that has not been scanned has
          NO generated rule at all — the compose window painting under its own modal is this
          codebase's recorded example. An inline style cannot be missing from a stylesheet.
          ⚠️ 768–1023px: two columns, and the right column's cards move to the TOP of the left one,
          because they are the actions and the left column is reference.
          🔴 EXACTLY THREE DIRECT CHILDREN — left, centre, right — AND `items-start`. There were
          four: the Demo and Files cards were their own grid item with `gridColumn: 1`, and an
          EXPLICITLY placed item moves the auto-placement cursor past it. The centre and right
          columns were therefore auto-placed on row TWO, level with the Demo card, with the whole
          top-right of the page empty. The phone order that item existed for is done below with
          `max-md:contents` instead, which promotes the left column's cards to grid items ONLY
          under 768px — where there is one track and ordering is the whole job. */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: columns }}>
        {/* ── LEFT: READ FIRST ──────────────────────────────────────────────────────────────── */}
        {/* ⚠️ NO `order` ABOVE 768px, AT ALL. The tablet flip (`max-lg:order-*`, which is active
            from 0 to 1023 and therefore on a tablet too) is gone: at 768–1023 the two tracks sit
            side by side in source order, so there is nothing left to reorder and no rule that can
            fight the one below it.
            🔴 `max-md:contents` IS THE PHONE ORDER. Under 768px this container stops generating a
            box, its four cards become grid items of the single track, and each takes its own
            `max-md:order-*` — contact, notes, [centre], demo/files. Above 768px it is an ordinary
            flex column and NONE of its cards is a grid item, which is the rule item 1 asks for. */}
        <div className="flex flex-col gap-3 min-w-0 max-md:contents">
          {/* ⚠️ ON A TABLET THE ACTION CARDS COME FIRST, at the top of this column. */}
          <div className="hidden max-lg:flex max-md:hidden flex-col gap-3">
            <ActionCards
              p={p} step={step} oneClick={oneClick} followUp={followUpNow} today={today}
              onSetFollowUp={chooseFollowUp} onUndoFollowUp={undoFollowUp} followUpUndo={followUpUndo} onLogged={afterOneClick}
              dncEnabled={flags.dnc} onPatch={patch} nextName={nextName} onNext={() => goTo(nav.next)}
              queueLabel={queue?.label ?? null} busy={oneClickBusy} undo={undoable} onUndo={undoOneClick} />
          </div>

          {/* ⚠️ THE WRAPPERS EXIST FOR THE PHONE. Above 768px they are three plain divs in a flex
              column and cost nothing; below it they are the grid items being ordered. */}
          <div className="max-md:order-1">
            <ContactCard p={p} step={step} flags={flags} editing={editing} setEditing={setEditing}
              onPatch={patch} waPhone={waPhone} onEmail={() => openPanel('email')}
              leadLabels={leadLabels} onUseCurrentType={useCurrentType} />
          </div>

          {/* 🔴 ONE NOTES AREA. It was two cards — "About this truck" over the `notes` column and
              "Add a note" over the timeline — and the split asked a question nobody wants at the
              moment of writing something down: which of these two boxes is this sentence for. One
              box writes a dated note; the old column is kept, read-only until you click Edit, as
              the last entry under the list. */}
          <div className="max-md:order-2">
            <NotesCard p={p} timeline={timeline} onPatch={patch} onSaved={reloadAll} />
          </div>

          {/* ⚠️ THE DEMO AND THE FILES ARE REFERENCE, AND ON A PHONE THEY GO LAST — under the
              history, not between the contact card and the composer. Above 768px they are simply
              the bottom of the left column, in the left column's own container. */}
          <div className="flex flex-col gap-3 min-w-0 max-md:order-4">
            <DemoCard p={p} onReload={reloadAll} onInsert={insertDemoLink} />
            <FilesCard timeline={timeline} prospectId={p.id} onOpen={id => { setExpandedId(id); document.getElementById(`tl-${id}`)?.scrollIntoView({ block: 'center' }) }} />
          </div>
        </div>

        {/* ── CENTRE: WRITE, THEN READ ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 min-w-0 max-md:order-3">
          {/* 🔴 TABS, NOT A ROW OF BUTTONS THAT OPEN THINGS. Email is the default and is already
              open; the other three are the same surface aimed elsewhere. */}
          <div className="flex items-center gap-1 border-b border-slate-200">
            {(['email', 'call', 'whatsapp'] as const).map(t => (
              <button key={t} type="button" onClick={() => openPanel(t)} aria-pressed={panel === t}
                title={t === 'email' ? 'Write an email (E)' : t === 'call' ? 'Log a call (C)' : 'Log a WhatsApp message'}
                className={`text-sm font-bold px-3 py-2 -mb-px border-b-2 max-md:min-h-11 ${panel === t
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t === 'email' ? 'Email' : t === 'call' ? 'Call' : 'WhatsApp'}
              </button>
            ))}
            {note && <span className="ml-auto text-[11px] text-slate-600">{note}</span>}
          </div>

          {panel === 'email' && (
            <ComposeWindow
              inline
              truckName={p.name}
              prospectId={p.id}
              toEmail={p.contact_email}
              contactName={[p.contact_first_name, p.contact_last_name].filter(Boolean).join(' ') || null}
              offerable={offerable}
              suggestedId={suggestTemplateId(p)}
              apiRef={composerApi}
              stepKind={step?.kind ?? null}
              // 🔴 THE PROSPECT HAS WRITTEN BACK. `nextStep` already stops the ladder on the first
              // inbound contact, so this is that same one answer — not a second count of the history.
              inConversation={step?.stopReason === 'replied'}
              sequenceNote={sequenceNote}
              // 🔴 THE TEMPLATE THE NEXT LINE IMPLIES. `composerDefault` said which mode this is;
              // `templateForStep` — the one pre-selection rule — turns a rung into a template.
              initialTemplateId={composerTemplateId}
              doNotContact={dnc}
              ctx={contextFromProspect(p)}
              whatsappConfirmed={p.whatsapp_confirmed === true}
              templatesLoaded={templates !== null}
              logFormKind={oneClick}
              snippets={snippets}
              replyTo={replyTarget}
              followUpDate={followUpDate}
              sendLabelSuffix={followUpDate ? ` · follow up ${shortDate(followUpDate)}` : null}
              hideCopyAndLog
              onDirtyChange={setDirty}
              onClose={closePanel}
              onSent={async () => { await reloadAll(); setResolved(true) }}
              onLog={async (editedBody, ch, servesKind) => {
                const kind = servesKind ?? composerMode.templateKind ?? oneClick
                const ok = await logContactThrough(post, p.id, {
                  channel: ch, direction: 'outbound', kind, message: editedBody, contacted_at: today,
                })
                if (ok) await applyFollowUp(kind)
                return ok
              }}
            />
          )}

          {(panel === 'call' || panel === 'whatsapp') && (
            <QuickLog p={p} channel={panel === 'call' ? 'phone' : 'whatsapp'} kind={oneClick}
              followUpDate={followUpDate}
              onDirty={setDirty}
              onCancel={closePanel}
              onLogged={async () => { setDirty(false); setPanel('email'); await reloadAll(); setResolved(true) }}
              post={post} applyFollowUp={applyFollowUp} />
          )}

          <ProspectTimeline
            prospect={p}
            data={timeline}
            expandedId={expandedId}
            onExpand={setExpandedId}
            actions={{
              onReply: replyToMessage,
              onMessageAction: messageAction,
              onRecordStep: recordAsStep,
              onNotesChanged: reloadAll,
              // ⚠️ THE PAGE'S ONE `nextStep` ANSWER, HANDED DOWN — the panel does not derive a second.
              currentStepKind: step?.kind ?? null,
              onDeleteContact: deleteContact,
              busyId,
            }}
          />
        </div>

        {/* ── RIGHT: ACT IN ONE CLICK ───────────────────────────────────────────────────────── */}
        {/* ⚠️ HIDDEN BELOW 1024px — its cards are rendered at the top of the left column instead. */}
        <div className="flex flex-col gap-3 min-w-0 max-lg:hidden">
          <ActionCards
            p={p} step={step} oneClick={oneClick} followUp={followUpNow} today={today}
            onSetFollowUp={chooseFollowUp} onUndoFollowUp={undoFollowUp} followUpUndo={followUpUndo} onLogged={afterOneClick}
            dncEnabled={flags.dnc} onPatch={patch} nextName={nextName} onNext={() => goTo(nav.next)}
            queueLabel={queue?.label ?? null} busy={oneClickBusy} undo={undoable} onUndo={undoOneClick} />
        </div>
      </div>

      {/* ── THE PHONE'S LOG BAR ──────────────────────────────────────────────────────────────────
          🔴 STICKY AT THE BOTTOM, WHERE A THUMB IS. The four one-click logs are the things done
          standing up between calls; on a phone they are the only controls that must never require a
          scroll. ⚠️ Every target is at least 44px, which is Apple's own minimum. */}
      <div className="hidden max-md:flex fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white px-2 py-2 gap-1">
        {ONE_CLICK_LOGS.slice(0, 3).map(l => (
          <button key={l.id} type="button" disabled={!!oneClickBusy}
            onClick={() => void afterOneClick(l.id)}
            className="flex-1 min-h-11 text-[11px] font-bold rounded-lg border border-slate-300 text-slate-700 bg-white disabled:opacity-40">
            {l.id === 'no_answer' ? 'No answer' : l.id === 'spoke' ? 'Spoke' : 'Voicemail'}
          </button>
        ))}
        {/* ⚠️ "Note" HERE IS NOT A FOURTH ONE-CLICK LOG. It scrolls to the Add-a-note box and focuses
            it — a note is words somebody writes, and a button that logged a blank one would be a
            button that records nothing. */}
        <button type="button" onClick={focusNoteBox}
          className="flex-1 min-h-11 text-[11px] font-bold rounded-lg border border-slate-300 text-slate-700 bg-white">
          Note
        </button>
      </div>
      <div className="hidden max-md:block h-16" aria-hidden="true" />

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// ── THE NEXT BANNER'S WORDS ─────────────────────────────────────────────────────────────────────────
/**
 * 🔴 THE ACTION AND HOW LATE IT IS, IN BOLD; THE FACTS UNDER IT, SMALL. The line is read at a
 * glance from three feet away, and "Follow up — 14 days overdue" is the part that decides whether
 * this prospect is dealt with now. Everything that explains WHY — the due date, what the last email
 * was — is supporting detail and is sized like it.
 * ⚠️ BOTH READ THE SAME `NextAction`. Nothing here recomputes a state; it words one.
 */
function bannerHeadline(n: NextAction): string {
  if (n.kind === 'reply') {
    const days = n.waitingDays ?? 0
    return days > 0
      ? `Reply — waiting ${days} day${days === 1 ? '' : 's'}`
      : 'Reply — waiting since today'
  }
  if (n.kind === 'chase') {
    return n.daysOverdue > 0
      ? `${n.label.split(' due')[0]} — ${n.daysOverdue} day${n.daysOverdue === 1 ? '' : 's'} overdue`
      : `${n.label.split(' due')[0]} due today`
  }
  if (n.kind === 'follow_up') {
    return n.daysOverdue > 0
      ? `Follow up — ${n.daysOverdue} day${n.daysOverdue === 1 ? '' : 's'} overdue`
      : 'Follow up — due today'
  }
  return 'No next step'
}

function bannerDetail(n: NextAction, p: Prospect, timeline: TimelinePayload | null): string {
  const lastOut = (timeline?.messages ?? [])
    .filter(m => m.direction === 'outbound' && m.is_test !== true)
    .sort((a, b) => String(b.message_date ?? '').localeCompare(String(a.message_date ?? '')))[0]
  const lastLine = lastOut
    ? `last email was yours, ${shortDate(lastOut.message_date ?? lastOut.created_at ?? null)}`
    : 'no email has been sent yet'
  if (n.kind === 'reply') return `${n.label} · ${lastLine}`
  if (n.kind === 'chase') return `${n.dueOn ? `was due ${shortDate(n.dueOn)}` : 'due now'} · ${lastLine}`
  if (n.kind === 'follow_up') return `was due ${shortDate(n.due)} · ${lastLine}`
  return n.reason ? `${n.reason} · ${lastLine}` : lastLine
}

// ── THE RIGHT COLUMN ────────────────────────────────────────────────────────────────────────────────
/**
 * Log in one click, set the follow-up once, and see who is next.
 *
 * 🔴 THE FOUR BUTTONS ARE THE WHOLE POINT OF THE COLUMN. Recording a call used to be: open a tab,
 * check the date, check the direction, check the kind, type nothing, press Log — six decisions for
 * an event with one fact in it. Each button here writes one contact immediately, with the kind
 * `oneClickKind` derives and the date the follow-up control holds, and offers an Undo for eight
 * seconds.
 * ⚠️ THE SAME CARDS RENDER IN THE LEFT COLUMN BELOW 1024px. One component, two positions.
 */
function ActionCards({
  p, step, oneClick, followUp, today, onSetFollowUp, onUndoFollowUp, followUpUndo: followUpUndoNote, onLogged, dncEnabled, onPatch,
  nextName, onNext, queueLabel, busy, undo, onUndo,
}: {
  p: Prospect
  step: Step | null
  oneClick: string
  followUp: { choice: FollowUpChoice; date: string | null }
  today: string
  /** 🔴 SAVES IT, through the page's one follow-up writer. It used to only set local state. */
  onSetFollowUp: (choice: FollowUpChoice, date: string | null) => Promise<void>
  /** The receipt after a save, and the way back. ⚠️ NOT `undo`: that name belongs to the one-click
   *  log's undo, which is a different thing this card also renders. */
  followUpUndo: { was: string | null; label: string } | null
  onUndoFollowUp: () => Promise<void>
  onLogged: (id: string) => Promise<void>
  dncEnabled: boolean
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  nextName: string | null
  onNext: () => void
  queueLabel: string | null
  busy: string | null
  undo: { id: string; label: string } | null
  onUndo: () => Promise<void>
}) {
  const [pickOpen, setPickOpen] = useState(false)
  return (
    <>
      <div className={`${CARD} p-3 flex flex-col gap-2`}>
        <span className={LABEL_CLS}>Log in one click</span>
        {ONE_CLICK_LOGS.map(l => (
          <button key={l.id} type="button" disabled={!!busy}
            onClick={() => void onLogged(l.id)}
            title={`Writes one ${l.channel} contact now, dated today, as “${kindLabel(oneClick)}”.`}
            className="w-full text-left text-sm font-semibold px-3 py-2 min-h-11 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">
            {busy === l.id ? 'Logging…' : l.label}
          </button>
        ))}
        {/* 🔴 THE UNDO IS THE SAFETY NET THAT MAKES ONE-CLICK ACCEPTABLE. Without it, a mis-click
            writes a rung §57 reads and the only remedy is finding it in the timeline. */}
        {undo && (
          <p className="text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
            Logged “{undo.label}” · <button onClick={() => void onUndo()} className="font-bold underline">Undo</button>
          </p>
        )}
        <p className="text-[11px] text-slate-400">
          Recorded as <span className="font-semibold">{kindLabel(oneClick)}</span>
          {step?.state === 'due' || step?.state === 'scheduled' ? ' — the rung this prospect is on' : ' — they have replied, so this is not a rung'}
        </p>
      </div>

      {/* ── THE ONE FOLLOW-UP CONTROL ───────────────────────────────────────────────────────────
          🔴 ONE, FOR THE WHOLE PAGE. There were three — a date field with quick-set buttons in the
          modal, the composer's own, and whatever a log form did — and three controls over one
          column is three chances for the screen to disagree with the database. Send, the one-click
          buttons and the Call/WhatsApp tabs all read THIS, and the value still reaches the server
          through the one writer of `next_action_at`. */}
      <div className={`${CARD} p-3 flex flex-col gap-2`}>
        <span className={LABEL_CLS}>Next follow-up</span>
        <div className="flex flex-wrap gap-1">
          {FOLLOW_UP_CHOICES.map(c => {
            const on = followUp.choice === c
            const date = followUpDateForChoice(c, today)
            return (
              <button key={c} type="button"
                onClick={() => {
                  if (c === 'pick') { setPickOpen(true); void onSetFollowUp('pick', followUp.date); return }
                  setPickOpen(false)
                  void onSetFollowUp(c, date)
                }}
                title={date ? `Saves the follow-up as ${date}` : c === 'none' ? 'Clears the follow-up date' : 'Choose a date'}
                className={`text-xs font-semibold px-2.5 py-1.5 min-h-11 sm:min-h-0 rounded-full border ${on
                  ? 'bg-slate-800 border-slate-800 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                {FOLLOW_UP_LABEL[c]}{on && followUp.date ? ` · ${shortDate(followUp.date)}` : ''}
              </button>
            )
          })}
        </div>
        {(pickOpen || followUp.choice === 'pick') && (
          <input type="date" className={FIELD_CLS} value={followUp.date ?? ''} min={today}
            onChange={e => void onSetFollowUp('pick', e.target.value || null)} />
        )}
        {/* 🔴 IT SAYS WHAT IT DID, NOT WHAT IT MIGHT DO. The line used to read "Applies to whatever
            you do next", which was true and was the bug: choosing a date and then doing nothing else
            saved nothing, and a reload showed None. The date is written the moment it is chosen, and
            this is the receipt — with an Undo, because an accidental chip should cost one click. */}
        {followUpUndoNote ? (
          <p className="text-[11px] text-emerald-800 flex items-center gap-2">
            {followUpUndoNote.label}
            <button type="button" onClick={() => void onUndoFollowUp()}
              className="font-bold underline hover:no-underline">Undo</button>
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">
            {followUp.date
              ? <>Saved. A send or a log will set it again from this date.</>
              : <>Nothing is scheduled.</>}
          </p>
        )}
      </div>

      {nextName && (
        <button type="button" onClick={onNext}
          className={`${CARD} p-3 text-left hover:bg-slate-50 min-h-11`}>
          <span className={LABEL_CLS}>Up next{queueLabel ? ` in ${queueLabel}` : ''}</span>
          <span className="text-sm font-semibold text-slate-800">{nextName} <span className="text-slate-400 text-xs">J →</span></span>
        </button>
      )}

      {/* ⚠️ THE SAME ACTION AS THE ⋯ MENU'S, and the banner still appears when it is on. It is here
          as well because this is the column of things you do to a prospect, and "stop contacting
          them" is one of them. */}
      <label className={`${CARD} p-3 flex items-center gap-2 text-sm font-semibold min-h-11 cursor-pointer
        ${p.do_not_contact === true ? 'text-red-700' : 'text-slate-600'} ${dncEnabled ? '' : 'opacity-60 cursor-not-allowed'}`}>
        <input type="checkbox" checked={p.do_not_contact === true} disabled={!dncEnabled}
          className="w-4 h-4 accent-red-600"
          onChange={e => void onPatch({ do_not_contact: e.target.checked ? true : null })} />
        Do not contact
      </label>
    </>
  )
}

/** The Add-a-note textarea's id. 🔴 One definition: the shortcut, the phone bar and the box agree. */
const ADD_NOTE_ID = 'hg-add-note'

/**
 * THE NOTES AREA — one box, and everything that has been written under it.
 *
 * 🔴 IT WAS TWO CARDS AND THAT WAS THE BUG. "About this truck" edited the `notes` COLUMN; "Add a
 * note" wrote a dated row to `outreach_events`. Both were headed by a grey label and a textarea,
 * and at the moment of writing "rang, he is at Boxpark on Fridays" the page asked which. The
 * answer it should never have asked for is: a note, dated, in the history — so that is what the
 * box does, and it is the only box.
 *
 * ⚠️ NOTHING IS MIGRATED, COPIED OR CLEARED. The `notes` column is read exactly as before and
 * written only by its own Edit/Save, through the same `update_prospect` patch — the outreach LIST
 * reads that column too, and a build that "tidied" it into the timeline would blank a column
 * another page shows. It appears as the LAST entry, labelled "Earlier notes", and when it is empty
 * it does not appear at all.
 *
 * ⚠️ THE NOTES LIST IS A VIEW OVER THE TIMELINE ALREADY LOADED, not a second fetch and not a second
 * store — the same relationship `FilesCard` has to it.
 */
function NotesCard({ p, timeline, onPatch, onSaved }: {
  p: Prospect
  timeline: TimelinePayload | null
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  onSaved: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const notes = useMemo(() => (timeline?.events ?? [])
    .filter(e => e.kind === 'note' && String(e.body ?? '').trim())
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))),
    [timeline])
  const shown = showAll ? notes : notes.slice(0, NOTES_SHOWN)

  const save = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      // ⚠️ THE SAME `add_note` PATH AS BEFORE — one note writer, one `outreach_events` row, and it
      // is the row the history renders. Nothing here knows how to write a note twice.
      const h = await nativeAuthHeader()
      await fetch('/api/admin/outreach/timeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'add_note', prospect_id: p.id, body }),
      })
      setBody(''); setDone(true); setTimeout(() => setDone(false), 2500)
      await onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className={`${CARD} p-3 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <span className={LABEL_CLS}>Notes</span>
        {done && <span className="ml-auto text-[11px] font-semibold text-emerald-700">added to the history</span>}
      </div>

      {/* 🔴 TEN ROWS, FULL WIDTH, AND IT GROWS — BUT NOT THROUGH `field-sizing`. That property was
          here to do the growing and the comment claimed `rows` was still "the floor everywhere".
          It is not: where `field-sizing: content` is supported (Safari 26, Chrome 123+) it REPLACES
          `rows`, so this ten-row box rendered as ONE LINE in Safari. `GrowingTextarea` does the
          growing in JS and leaves `rows` meaning what it means.
          ⚠️ THE ID IS UNCHANGED (`hg-add-note`): the N shortcut and the phone bar's Note button
          both scroll to and focus THIS element, and one id is why they cannot disagree. */}
      <GrowingTextarea id={ADD_NOTE_ID} rows={NOTE_BOX_ROWS} className={`${FIELD_CLS} w-full resize-y`}
        placeholder="Add a note…"
        value={body} onChange={e => setBody(e.target.value)} />
      <button type="button" onClick={() => void save()} disabled={busy || !body.trim()}
        className={`${BTN} border-slate-800 bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40 min-h-11 self-start`}>
        {busy ? 'Saving…' : 'Save note'}
      </button>

      {/* 🔴 EVERY NOTE IN FULL, NEWEST FIRST. A note is already the short version of something; a
          one-line truncation of it is the short version of the short version. */}
      {shown.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-slate-100 pt-2">
          {shown.map(n => (
            <NoteRow key={n.id} note={n} prospectId={p.id} onChanged={onSaved} />
          ))}
        </ul>
      )}
      {notes.length > NOTES_SHOWN && (
        <button type="button" onClick={() => setShowAll(v => !v)}
          className="self-start text-[11px] font-semibold text-slate-500 hover:underline">
          {showAll ? 'Show fewer' : `Show all ${notes.length}`}
        </button>
      )}

      <EarlierNotes p={p} onPatch={onPatch} />
    </div>
  )
}

/**
 * The `notes` COLUMN, kept.
 * 🔴 IT IS NOT A NOTE AND IT IS NOT DELETED. It is what "About this truck" edited — standing prose,
 * also shown by the outreach list — so it sits at the BOTTOM of the notes, labelled for what it is,
 * and is read-only until Edit is clicked. Empty ⇒ nothing renders, because an empty box labelled
 * "Earlier notes" is an invitation to write a note in the wrong place.
 * ⚠️ IT WRITES THE SAME COLUMN THE SAME WAY — `onPatch({ notes })`, the page's one prospect patch.
 */
function EarlierNotes({ p, onPatch }: { p: Prospect; onPatch: (patch: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(p.notes ?? '')
  const [saving, setSaving] = useState(false)
  // ⚠️ RE-SEEDED WHEN THE PROSPECT CHANGES. J/K moves to another truck without remounting this.
  useEffect(() => { void Promise.resolve().then(() => { setText(p.notes ?? ''); setEditing(false) }) }, [p.id, p.notes])

  const current = (p.notes ?? '').trim()
  if (!current && !editing) return null

  const save = async () => {
    setSaving(true)
    try { await onPatch({ notes: text || null }); setEditing(false) } finally { setSaving(false) }
  }

  return (
    <div className="border-t border-slate-100 pt-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Earlier notes</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)}
            className="ml-auto text-[11px] font-semibold text-slate-500 hover:underline">✎ Edit</button>
        )}
      </div>
      {editing ? (
        <>
          <GrowingTextarea rows={6} className={`${FIELD_CLS} w-full resize-y`}
            value={text} onChange={e => setText(e.target.value)} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={saving}
              className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 min-h-11`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setText(p.notes ?? ''); setEditing(false) }}
              className="text-[11px] font-semibold text-slate-500 hover:underline">Cancel</button>
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap break-words text-[13px] text-slate-700">{p.notes}</p>
      )}
    </div>
  )
}

/* 🔴 `AboutCard` AND `AddNoteCard` WERE HERE AND ARE GONE (v3 fixes, 30 September 2026). Between
 * them they were two labels, two textareas and two Save buttons over the same act of writing
 * something down. `NotesCard` above is the one box — ten rows, "Add a note…", the same `add_note`
 * path — and `EarlierNotes` is the `notes` column those two split the page over, kept in full and
 * labelled. Neither name should come back; if a second notes box is ever wanted, the question to
 * answer first is which of the two a sentence goes in. */

/** Actions that RESOLVE the current queue item, and therefore arm the "Done. Next" bar. */
const RESOLVING = new Set(['mark_handled', 'snooze'])

/** The page's own chrome, for the states that have no prospect to render. */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1500px] mx-auto px-4 py-10">{children}</div>
}

/**
 * The single contact writer, from this page.
 * 🔴 THE SAME `log_contact` ACTION THE LIST AND THE COMPOSE WINDOW USE — which is the route that calls
 * `logOutreachContact`, the one writer of a rung. There is no second write path and this is not one:
 * it is a `fetch` to the same action with the same fields.
 */
async function logContactThrough(
  post: (b: Record<string, unknown>) => Promise<Record<string, unknown>>,
  prospectId: string,
  f: { channel: string; direction: string; kind: string; message: string; contacted_at: string },
): Promise<boolean> {
  const j = await post({ action: 'log_contact', prospect_id: prospectId, ...f })
  return !j.error
}

// ── THE ⋯ MENU ──────────────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 WHAT GOES IN HERE IS DECIDED BY FREQUENCY, NOT BY IMPORTANCE. Do-not-contact is one of the most
 * consequential things on the page and one of the least often pressed; on the modal it sat in the
 * status strip at full weight, next to facts read every visit. The media thumbnails are the same:
 * they are how a logo gets removed, roughly never.
 * ⚠️ NOTHING HERE IS HIDDEN. When do-not-contact is ON, the page carries a red banner across the top —
 * the state is loud even though the switch is quiet.
 */
function MoreMenu({ p, dncEnabled, onPatch, onRefresh, onHelp }: {
  p: Prospect
  dncEnabled: boolean
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  /** Re-read after something this menu changed that is not a field patch. */
  onRefresh: () => Promise<void>
  onHelp: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'logo' | 'photo' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const removeMedia = async (kind: 'logo' | 'photo', confirmTruck?: string) => {
    setBusy(true)
    try {
      const h = await nativeAuthHeader()
      const r = await fetch('/api/admin/outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'delete_media', id: p.id, column: kind, confirm_truck: confirmTruck ?? null }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      // 🔴 THE SERVER'S OWN NOTE, SHOWN WHERE THE BUTTON IS. The delete route reports whether it
      // removed the FILE as well as the column — it deliberately leaves a static `/logos` asset or a
      // file inside an operator truck's folder alone — and that sentence is the only way to know
      // which happened. It was a toast on the list; here it belongs beside the control.
      setMsg(r.ok ? String(j.fileNote ?? j.note ?? `${kind} removed.`) : String(j.error ?? 'That could not be removed.'))
      // ⚠️ RE-READ RATHER THAN CLEAR OPTIMISTICALLY. The modal cleared the slot itself because the
      // list holds 231 rows and a re-read was expensive; this page holds one, so the slot shows what
      // the column ACTUALLY says rather than what the click assumed it would say.
      if (r.ok) await onRefresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label="More actions" title="Rarely used actions"
        className="text-sm font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">⋯</button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 z-20 rounded-xl border border-slate-200 bg-white shadow-lg p-3 flex flex-col gap-2">
          <label className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold cursor-pointer border
            ${p.do_not_contact === true ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-600'}
            ${dncEnabled ? '' : 'opacity-60 cursor-not-allowed'}`}
            title={dncEnabled ? undefined : 'Apply the do_not_contact migration to enable'}>
            {/* 🔴 SET BY HAND, ONLY EVER. Nothing in this app sets `do_not_contact` automatically — not
                a reply saying "no thanks", not a bounce. That was Dominic's decision and it stands. */}
            <input type="checkbox" checked={p.do_not_contact === true} disabled={!dncEnabled}
              className="w-4 h-4 accent-red-600"
              onChange={e => void onPatch({ do_not_contact: e.target.checked ? true : null })} />
            🚫 Do not contact
          </label>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
            <ModalThumb value={p.logo_url} folder="logos" label="logo" name={p.name}
              refreshNonce={0} onRequestDelete={() => setConfirmKind('logo')} />
            <ModalThumb value={p.photo_url} folder="photos" label="photo" name={p.name}
              refreshNonce={0} onRequestDelete={() => setConfirmKind('photo')} />
            <span className="text-[11px] text-slate-500">Logo and photo — click to view, ✕ to remove.</span>
          </div>

          <button onClick={onHelp} className="text-left text-sm font-semibold text-slate-700 hover:underline border-t border-slate-100 pt-2">
            Keyboard shortcuts (?)
          </button>
          {msg && <p className="text-[11px] text-slate-600">{msg}</p>}
          {busy && <p className="text-[11px] text-slate-400">Working…</p>}
        </div>
      )}

      {confirmKind && (
        <ConfirmDeleteDialog
          title={`Delete the ${confirmKind} for ${p.name}?`}
          confirmLabel={`Delete ${confirmKind}`}
          onCancel={() => setConfirmKind(null)}
          onConfirm={async () => {
            // 🔴 A SECOND, NAMED CONFIRMATION FOR A LIVE TRUCK — unchanged from the modal. The generic
            // dialog says "remove this logo"; it cannot say WHOSE, and that is the only thing that
            // matters when the prospect is backed by a real truck.
            let confirmTruck: string | undefined
            if (confirmKind === 'logo') {
              const c = confirmLogoWrite(p, 'Remove')
              if (c === false) { setConfirmKind(null); return }
              confirmTruck = c ?? undefined
            }
            await removeMedia(confirmKind, confirmTruck)
            setConfirmKind(null)
          }}
        >
          <p className="text-sm text-slate-500 mt-2">This cannot be undone.</p>
        </ConfirmDeleteDialog>
      )}
    </div>
  )
}

// ── THE CONTACT CARD ────────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 READ-ONLY UNTIL ✎ IS PRESSED, AND THAT IS THE WHOLE IDEA OF THE LEFT COLUMN. The modal showed
 * six input boxes whether or not anything was being changed, which is six controls competing with the
 * facts they contain. Reading an address is the common case by an order of magnitude; editing one is
 * rare and deliberate.
 * ⚠️ THE FIELDS, THE ROUTES AND THE VALIDATION ARE THE MODAL'S, unchanged — the same
 * `update_prospect` action, the same `contact_email`/`phone`-live-on-the-truck split, the same
 * lead-type write-once rule, the same WhatsApp tri-state.
 */
function ContactCard({ p, step, flags, editing, setEditing, onPatch, waPhone, onEmail, leadLabels, onUseCurrentType }: {
  p: Prospect
  step: Step | null
  flags: { names: boolean; leadFreeze: boolean; dnc: boolean }
  editing: boolean
  setEditing: (v: boolean) => void
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  waPhone: string | null
  /** The phone layout's third big button; on a laptop the composer is already open beside this. */
  onEmail: () => void
  /** Dominic's own names for the four truck types. Null while they load ⇒ the code's own names. */
  leadLabels: Record<string, string> | null
  /** The one click that rewrites a frozen type. */
  onUseCurrentType: () => Promise<void>
}) {
  const [firstName, setFirstName] = useState(p.contact_first_name ?? '')
  const [lastName, setLastName] = useState(p.contact_last_name ?? '')
  const [email, setEmail] = useState(p.contact_email ?? '')
  const [phone, setPhone] = useState(p.phone ?? '')
  const [saving, setSaving] = useState(false)

  const start = () => {
    setFirstName(p.contact_first_name ?? ''); setLastName(p.contact_last_name ?? '')
    setEmail(p.contact_email ?? ''); setPhone(p.phone ?? '')
    setEditing(true)
  }
  const save = async () => {
    setSaving(true)
    try {
      // ⚠️ ONLY WHAT CHANGED. Sending every field would rewrite values nobody touched, and the name
      // columns must not be written at all until their migration is applied.
      const patch: Record<string, unknown> = {}
      if (flags.names && firstName !== (p.contact_first_name ?? '')) patch.contact_first_name = firstName
      if (flags.names && lastName !== (p.contact_last_name ?? '')) patch.contact_last_name = lastName
      if (email !== (p.contact_email ?? '')) patch.contact_email = email
      if (phone !== (p.phone ?? '')) patch.phone = phone
      if (Object.keys(patch).length) await onPatch(patch)
      setEditing(false)
    } finally { setSaving(false) }
  }

  const name = [p.contact_first_name, p.contact_last_name].filter(Boolean).join(' ')
  // 🔴 THE STEP'S OWN LEAD TYPE, NOT A SECOND DERIVATION. `nextStep` already resolved frozen-vs-live
  // through `effectiveLeadType`; reading it here is how the card and the composer's `?lead_*` lines
  // cannot disagree. ⚠️ `leadTypeOf` is used ONLY in the editor's "derive live" option, which is
  // deliberately the live value and says so.
  const lead = step?.leadType ?? leadTypeOf(p)

  return (
    <div className={`${CARD} p-3 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <span className={LABEL_CLS}>Contact</span>
        {!editing && (
          <button onClick={start} className="ml-auto text-xs font-bold text-slate-600 hover:underline">✎ Edit</button>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-col gap-1 text-[13px]">
          {/* 🔴 THE NAME IS THE HEADLINE OF THIS CARD. It was 13px and semibold — the same weight as
              the address under it — so the one thing you need before ringing somebody read as one
              more field. 18px/800 and a little air under it, on every screen: a thumb in a doorway
              wants it more than a laptop does, not less. */}
          <p className="text-[18px] font-extrabold leading-tight text-slate-900 mb-1">
            {name || <span className="text-[13px] font-semibold text-slate-400">no contact name</span>}
          </p>
          <p className="break-words">
            {p.contact_email
              ? <span className="text-slate-700">{p.contact_email}</span>
              : <span className="text-slate-400">no email address</span>}
          </p>
          {/* 🔴 THE NUMBER IS TEXT AND THE CALL IS A BUTTON BESIDE IT. It was a `tel:` link wrapped
              round the number, which meant the number could not be selected without dialling and
              the only way to call was to hit a line of 13px text. */}
          <p className="flex items-center gap-2">
            {p.phone
              ? <>
                  <span className="text-slate-700 select-all">☎ {p.phone}</span>
                  <CallButton phone={p.phone} e164={waPhone} compact />
                </>
              : <span className="text-slate-400">no phone number</span>}
          </p>

          {/* ── 🔴 THE THREE BIG BUTTONS ARE A PHONE CONTROL, AND ONLY A PHONE CONTROL ────────
              They were on every screen, and on a laptop that made the card say everything twice:
              the number already carries a Call button beside it, and this row put a second, larger
              Call directly underneath it — two controls, one action, 4px apart. Above 768px the row
              is gone and the compact button beside the number is the only way to ring; the 52px it
              took back is why "About this truck" and "Add a note" now start above the fold.
              ⚠️ WHATSAPP IS NOT REPLACED BY ANOTHER BUTTON. It has two homes already — the
              composer's WhatsApp tab, and the "WhatsApp sent" one-click log — and a third would be
              a third place to check. Nothing was deleted: on a phone this row is exactly what it
              was, because a thumb in a doorway wants 44px targets and not a 13px line of text.
              ⚠️ WHATSAPP IS DISABLED, NOT HIDDEN, WHEN THE NUMBER IS NOT CONFIRMED — and the
              tooltip says why. Hiding it would read as "this truck has no WhatsApp"; the truth is
              "nobody has confirmed that this number is on WhatsApp", which is §52.3(a)'s
              distinction and is a thing Dominic can act on. */}
          <div className="hidden max-md:flex items-center gap-2 mt-1">
            <CallButton phone={p.phone} e164={waPhone} />
            <a href={p.whatsapp_confirmed === true && waPhone ? `https://wa.me/${waPhone}` : undefined}
              target="_blank" rel="noreferrer"
              aria-disabled={!(p.whatsapp_confirmed === true && waPhone)}
              title={p.whatsapp_confirmed === true
                ? (waPhone ? 'Opens WhatsApp for this number' : 'No usable number on the truck row')
                : 'This number has not been confirmed as being on WhatsApp — tick WA in Edit first'}
              className={`flex-1 text-center text-sm font-bold px-3 py-2 min-h-11 rounded-lg border ${p.whatsapp_confirmed === true && waPhone
                ? 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
                : 'border-slate-200 text-slate-300 pointer-events-none'}`}>
              WhatsApp
            </a>
            {/* ⚠️ THE ROW ITSELF IS NOW THE PHONE GATE, so this button no longer carries its own.
                It kept `hidden max-md:block` from when the row was on every screen; two gates for
                one rule is a thing that later gets half-changed. The reason is unchanged: on a
                laptop the composer is already open in the centre column, so a button to reveal it
                would point at something already on screen. */}
            <button type="button" onClick={onEmail} disabled={!p.contact_email}
              className="flex-1 text-sm font-bold px-3 py-2 min-h-11 rounded-lg border border-slate-300 text-slate-700 bg-white disabled:opacity-40">
              Email
            </button>
          </div>
          <p className="text-slate-500">
            <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Lead</span>
            {/* ⚠️ DOMINIC'S OWN NAME FOR THE TYPE, from the Templates tab, falling back to the code's.
                The four TYPES are code (`LEAD_TYPES`); only the words are data. */}
            {leadLabels?.[lead] ?? LEAD_TYPE_LABELS[lead] ?? lead}
            {step?.leadTypeFrozen && <span className="text-slate-400"> (frozen)</span>}
          </p>
          {/* ── 🔴 THE TYPE CHANGED SINCE THE FIRST EMAIL ────────────────────────────────────────
              The sequence keeps the framing it started with — that is what the freeze is for and it
              stays the default. This says so out loud when today's data disagrees, because "I told
              them I could not find them listed" and "they are listed now" is a thing to know before
              the next chase. ⚠️ ONLY A CLICK WRITES: `lead_type_at_first_contact` is write-once by
              design, and nothing here rewrites it on its own. */}
          {step?.leadTypeFrozen && leadTypeOf(p) !== lead && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              Recorded as <span className="font-semibold">{leadLabels?.[lead] ?? LEAD_TYPE_LABELS[lead]}</span> at
              first contact, now <span className="font-semibold">{leadLabels?.[leadTypeOf(p)] ?? LEAD_TYPE_LABELS[leadTypeOf(p)]}</span>.
              {' '}The sequence follows the first one.
              <button type="button" onClick={() => void onUseCurrentType()}
                className="ml-1 font-bold underline hover:no-underline">Use current type</button>
            </p>
          )}
          <p className="text-slate-500">
            <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Last contacted</span>
            {fmtDate(p.lastContactedAt) ?? <span className="text-slate-400">never</span>}
          </p>
          <p className="text-slate-500">
            <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Schedule</span>
            {p.futureEventCount} upcoming
            {p.lastEventDate && <span className="text-slate-400"> · last {fmtDate(p.lastEventDate)}</span>}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className={LABEL_CLS}>First name</span>
              <input className={FIELD_CLS} value={firstName} disabled={!flags.names}
                placeholder={flags.names ? 'First name' : 'needs the name-split migration'}
                onChange={e => setFirstName(e.target.value)} />
            </label>
            <label className="block min-w-0">
              <span className={LABEL_CLS}>Last name</span>
              <input className={FIELD_CLS} value={lastName} disabled={!flags.names}
                onChange={e => setLastName(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className={LABEL_CLS}>Email</span>
            <input className={FIELD_CLS} value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Phone</span>
            <div className="flex items-center gap-2">
              <input className={FIELD_CLS} value={phone} onChange={e => setPhone(e.target.value)} />
              <span className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
                {/* ⚠️ `WhatsAppBox` TAKES (id, patch) BECAUSE THE LIST'S PATCHER DOES; this page's takes
                  the patch alone, so the id is dropped here rather than the component being forked. */}
              <WhatsAppBox p={p} onPatch={(_id: string, patch: Record<string, unknown>) => void onPatch(patch)} /> WA
              </span>
            </div>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Lead type {step?.leadTypeFrozen ? '(frozen)' : '(live)'}</span>
            <select className={FIELD_CLS} disabled={!flags.leadFreeze}
              value={isLeadType(p.lead_type_at_first_contact) ? p.lead_type_at_first_contact : ''}
              onChange={e => void onPatch({ lead_type_at_first_contact: e.target.value })}>
              {/* 🔴 THE EMPTY OPTION IS "DERIVE LIVE", and choosing it CLEARS the column back to null —
                  which is how a wrong freeze is undone rather than merely re-pointed. */}
              <option value="">— derive live ({LEAD_TYPE_LABELS[leadTypeOf(p)]}) —</option>
              {LEAD_TYPES.map(lt => <option key={lt} value={lt}>{LEAD_TYPE_LABELS[lt]}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => void save()} disabled={saving}
              className={`${BTN} border-slate-800 bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 min-h-11`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className={`${BTN} border-slate-200 text-slate-700 hover:bg-slate-50`}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Call — a button that PLACES THE CALL, on every device.
 *
 * 🔴 IT COPIED THE NUMBER ON A DESKTOP AND THAT WAS WRONG. The reasoning was that `tel:` on a Mac
 * hands off to a protocol handler and takes focus off the page; the answer to that is not to
 * refuse to call. A Mac hands `tel:` to FaceTime, which rings through the iPhone on the same Apple
 * ID — which is exactly the thing Dominic wants the button to do.
 * 🔴 A PROGRAMMATIC ANCHOR CLICK, NOT `location.href` AND NOT `window.open`.
 *   • `window.open` leaves a blank tab behind on every call.
 *   • `location.href = 'tel:…'` is a NAVIGATION: the browser begins unloading this page before the
 *     handler takes it, and a half-written email is exactly what must not be at risk.
 *   • A detached `<a href="tel:…">` with no `target`, clicked and removed, hands the URL to the OS
 *     and leaves the document alone. It is the same thing a user clicking a link does, minus the
 *     link.
 * ⚠️ NOTHING BRANCHES ON POINTER TYPE any more. One behaviour, every device.
 * ⚠️ E.164 WHERE WE HAVE IT. `phoneWhatsApp` already normalises a UK number for wa.me; the same
 * digits are what a dialler wants, and `tel:` with spaces in it is refused by some handlers.
 */
function CallButton({ phone, e164, compact }: { phone: string | null; e164?: string | null; compact?: boolean }) {
  if (!phone) {
    return (
      <button type="button" disabled
        className={compact
          ? 'text-xs font-bold px-2 py-1 rounded-lg border border-slate-200 text-slate-300'
          : 'flex-1 text-sm font-bold px-3 py-2 min-h-11 rounded-lg border border-slate-200 text-slate-300'}>
        Call
      </button>
    )
  }
  const dial = () => {
    // ⚠️ `phoneWhatsApp` RETURNS BARE INTERNATIONAL DIGITS (wa.me wants no `+`), and a dialler
    // wants the `+` — without it "447700900123" is dialled as a UK national number and fails.
    // Falling back to the stored text keeps whatever Dominic typed, minus formatting.
    const number = e164 ? `+${e164.replace(/\D/g, '')}` : phone.replace(/[^\d+]/g, '')
    const a = document.createElement('a')
    a.href = `tel:${number}`
    // ⚠️ NO `target`. A target of `_blank` is what produces the blank tab; without one the browser
    // hands a non-http scheme to the OS and does not navigate.
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  return (
    <button type="button" onClick={dial} title={`Call ${phone}`}
      className={compact
        ? 'text-xs font-bold px-2 py-1 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 whitespace-nowrap'
        : 'flex-1 text-sm font-bold px-3 py-2 min-h-11 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50'}>
      Call
    </button>
  )
}

/* 🔴 `PinnedNotes` WAS HERE AND IS GONE (v3), and `AboutCard`, which replaced it, is gone too
 * (v3 fixes). The `notes` column those two edited is now `EarlierNotes`, at the bottom of the one
 * Notes card — read-only until Edit, and absent when the column is empty. */

// ── FILES ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * Every attachment on this prospect's emails, newest first.
 * 🔴 IT IS NOT A SECOND STORE — it is a view over the timeline already loaded. Ours carry a
 * `storagePath` and open through the existing five-minute signed URL; theirs are names read off an
 * inbound message's structure and were never downloaded, which is what the line says.
 */
function FilesCard({ timeline, prospectId, onOpen }: {
  timeline: TimelinePayload | null
  prospectId: string
  onOpen: (messageId: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const files = useMemo(() => {
    const out: { key: string; filename: string; size: number | null; storagePath?: string; messageId: string; when: string | null; mine: boolean }[] = []
    for (const m of timeline?.messages ?? []) {
      for (const a of parseAttachments((m as { attachments?: unknown }).attachments)) {
        out.push({
          key: `${m.id}-${a.filename ?? ''}-${out.length}`,
          filename: a.filename ?? '(unnamed)', size: a.size, storagePath: a.storagePath,
          messageId: m.id, when: m.message_date ?? m.created_at ?? null,
          mine: !!a.storagePath,
        })
      }
    }
    return out.sort((a, b) => String(b.when ?? '').localeCompare(String(a.when ?? '')))
  }, [timeline])

  if (!files.length) return null

  const download = async (path: string) => {
    setBusy(path)
    try {
      const h = await nativeAuthHeader()
      const r = await fetch('/api/admin/outreach/attachments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'signed_download', path, prospect_id: prospectId }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (j.ok === true && typeof j.url === 'string') window.open(j.url, '_blank', 'noopener,noreferrer')
    } finally { setBusy(null) }
  }

  return (
    <div className={`${CARD} p-3`}>
      <span className={LABEL_CLS}>Files ({files.length})</span>
      <ul className="flex flex-col gap-1 mt-1">
        {files.map(f => (
          <li key={f.key} className="text-[12px] flex items-center gap-2">
            <button onClick={() => onOpen(f.messageId)} title="Show the email this came with"
              className="flex-1 min-w-0 truncate text-left text-slate-700 hover:underline">{f.filename}</button>
            {f.size != null && <span className="text-slate-400 shrink-0">{Math.round(f.size / 1024)} KB</span>}
            {f.mine
              ? <button onClick={() => void download(f.storagePath!)} disabled={busy === f.storagePath}
                  className="text-[11px] font-bold text-slate-600 hover:underline disabled:opacity-40 shrink-0">
                  {busy === f.storagePath ? '…' : 'Download'}
                </button>
              : <span className="text-[10px] text-slate-400 shrink-0" title="An attachment on an email they sent. This app never downloads those.">listed only</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The demo, compactly.
 * 🔴 BEHAVIOUR UNCHANGED, WEIGHT REDUCED. It is read occasionally and built once; on the modal it
 * had the same prominence as the contact details. The path, then three text buttons.
 * ⚠️ THE EXPIRY IS SHOWN ONLY WHEN IT MATTERS — inside seven days. A date that is three weeks away
 * is a number nobody acts on, and a card of numbers nobody acts on is how a card stops being read.
 */
function DemoCard({ p, onReload, onInsert }: { p: Prospect; onReload: () => Promise<void>; onInsert: (url: string) => void }) {
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = p.demo?.publicRef ?? null
  const path = ref ? `/demo/${ref}` : null
  // ⚠️ THE CLOCK IS READ AFTER MOUNT, IN A MICROTASK. `Date.now()` in a render body makes the
  // output depend on when React happened to call it (`react-hooks/purity`), and a synchronous
  // setState in an effect body is the cascading-render pattern React warns about. This is neither,
  // and the value only has to be right to the day.
  const [expiresSoon, setExpiresSoon] = useState<number | null>(null)
  const expiresAt = p.demo?.expiresAt ?? null
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!expiresAt) { setExpiresSoon(null); return }
      const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
      setExpiresSoon(days <= 7 ? days : null)
    })
  }, [expiresAt])
  /** 🔴 THE FULL URL, IN ONE PLACE. Copy, Insert and the harness all read this one value. */
  const fullUrl = path ? `${typeof window === 'undefined' ? 'https://www.hatchgrab.com' : window.location.origin}${path}` : null
  const copy = async () => {
    if (!fullUrl) return
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* a clipboard a browser refuses is not an error worth a dialog */ }
  }
  return (
    <div className={`${CARD} p-3 flex flex-col gap-1`}>
      <span className={LABEL_CLS}>Demo</span>
      {path
        ? <>
            <a href={path} target="_blank" rel="noreferrer"
              className="text-[13px] font-mono text-slate-700 hover:underline truncate">{path}</a>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
              <button onClick={() => void copy()} className="hover:underline">{copied ? 'Copied' : 'Copy'}</button>
              {/* ⚠️ IT NO LONGER COPIES FIRST. Copying was how the old "insert" worked at all — it put
                  the URL on the clipboard and asked for a paste. The insert is real now, and a silent
                  clipboard write on an unrelated click loses whatever was copied a moment ago. */}
              <button onClick={() => fullUrl && onInsert(fullUrl)} className="hover:underline">Insert in email</button>
              {p.demo?.truckId && <button onClick={() => setCreating(true)} className="hover:underline">Rebuild</button>}
            </div>
            {expiresSoon != null && (
              <p className="text-[11px] font-semibold text-amber-800">
                Expires in {expiresSoon} day{expiresSoon === 1 ? '' : 's'}
              </p>
            )}
            {(p.demo?.liveCount ?? 0) > 1 && (
              <p className="text-[11px] text-slate-400">newest of {p.demo?.liveCount}</p>
            )}
          </>
        : <button onClick={() => setCreating(true)}
            className="text-xs font-semibold px-3 py-2 min-h-11 sm:min-h-0 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 self-start">
            Create demo
          </button>}
      {creating && (
        <CreateDemoModal
          prospect={{ id: p.id, discovery_truck_id: p.discovery_truck_id, name: p.name, logo_url: p.logo_url,
            demoTruckId: p.demo?.truckId ?? null }}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); void onReload() }}
        />
      )}
    </div>
  )
}

// ── QUICK LOG ───────────────────────────────────────────────────────────────────────────────────────
/**
 * A call or a WhatsApp, in five controls.
 * 🔴 THE FULL FORM IS STILL ONE CLICK AWAY. "Log other…" opens every channel and direction — which is
 * how an email sent from Outlook gets recorded — but the common case is a call made just now, and it
 * should not cost four dropdowns.
 * ⚠️ THE KIND DEFAULTS FROM `nextStep`, which is the rung this prospect is actually on, rather than
 * from whatever the dropdown was last left at. That mislabelling is recorded in §57.3 as a real
 * defect: a chaser logged as a first contact drove the queue wrong for weeks.
 */
function QuickLog({ p, channel, kind, followUpDate, post, applyFollowUp, onDirty, onCancel, onLogged }: {
  p: Prospect
  channel: 'phone' | 'whatsapp'
  /**
   * 🔴 THE DERIVED KIND, PASSED IN, NOT A DROPDOWN DEFAULT. `oneClickKind` decides it once for the
   * whole page — the rung this prospect is on, or `reply` once they have written back — and the
   * tab and the one-click buttons therefore cannot record the same call as two different things.
   * ⚠️ IT IS STILL CHANGEABLE HERE, because a person correcting a record knows something the
   * derivation does not. What it is no longer is "whatever the box was last left at".
   */
  kind: string
  /** From the page's single control. The tab does not have a follow-up picker of its own. */
  followUpDate: string | null
  post: (b: Record<string, unknown>) => Promise<Record<string, unknown>>
  applyFollowUp: (kind: string) => Promise<void>
  onDirty: (v: boolean) => void
  onCancel: () => void
  onLogged: () => Promise<void>
}) {
  const today = toYMD(new Date())
  const [full, setFull] = useState(false)
  const [when, setWhen] = useState(today)
  const [direction, setDirection] = useState('outbound')
  const [chosenKind, setKind] = useState(kind)
  const [ch, setCh] = useState<string>(channel)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const j = await post({
        action: 'log_contact', prospect_id: p.id,
        channel: ch, direction, kind: chosenKind, message, contacted_at: when,
      })
      if (j.error) { setErr(String(j.error)); return }
      // 🔴 THE SAME FOLLOW-UP THE REST OF THE PAGE USES, applied by the same function, which is the
      // page's one caller of the one writer of `next_action_at`.
      await applyFollowUp(chosenKind)
      await onLogged()
    } finally { setBusy(false) }
  }

  return (
    <div className={`${CARD} p-3 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <span className={LABEL_CLS}>{channel === 'phone' ? 'Log a call' : 'Log a WhatsApp'}</span>
        <button onClick={() => setFull(v => !v)} className="ml-auto text-[11px] font-semibold text-slate-500 hover:underline">
          {full ? 'Simple' : 'Log other…'}
        </button>
      </div>
      <div className={`grid gap-2 ${full ? 'grid-cols-4 max-md:grid-cols-2' : 'grid-cols-2'}`}>
        <label className="block min-w-0">
          <span className={LABEL_CLS}>When</span>
          {/* 🔴 CAPPED AT TODAY. A contact cannot have happened in the future, and a mistyped future
              date would sort to the top of the history and take "last contacted" with it. */}
          <input type="date" className={FIELD_CLS} value={when} max={today}
            onChange={e => { setWhen(e.target.value); onDirty(true) }} />
        </label>
        {full && (
          <label className="block min-w-0"><span className={LABEL_CLS}>Channel</span>
            <select className={FIELD_CLS} value={ch} onChange={e => setCh(e.target.value)}>
              {CONTACT_CHANNELS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
        )}
        <label className="block min-w-0"><span className={LABEL_CLS}>Direction</span>
          {/* 🔴 CHANGING DIRECTION CHANGES KIND: an inbound row can only be a reply, and a reply is
              not a rung of the outbound ladder. The same pairing the modal enforced. */}
          <select className={FIELD_CLS} value={direction}
            onChange={e => {
              const d = e.target.value
              setDirection(d)
              if (!kindsForDirection(d).includes(chosenKind)) setKind(defaultKindFor(d))
            }}>
            {CONTACT_DIRECTIONS.map(d => <option key={d} value={d}>{directionLabel(d)}</option>)}
          </select>
        </label>
        {full && (
          <label className="block min-w-0"><span className={LABEL_CLS}>Kind</span>
            <select className={FIELD_CLS} value={chosenKind} onChange={e => setKind(e.target.value)}>
              {[...kindsForDirection(direction)].sort((a, b) => kindOrder(a) - kindOrder(b))
                .map(k => <option key={k} value={k}>{kindLabel(k)}</option>)}
            </select>
          </label>
        )}
      </div>
      {/* ⚠️ THE SAME COMPONENT, for the same reason: two rows that grow, and two rows that are
          really two rows in every browser. */}
      <GrowingTextarea rows={2} className={`${FIELD_CLS} resize-y`} placeholder="What was said (optional)"
        value={message} onChange={e => { setMessage(e.target.value); onDirty(true) }} />
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void submit()} disabled={busy}
          className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 min-h-11`}>
          {busy ? 'Logging…' : 'Log'}
        </button>
        <button onClick={onCancel} className={`${BTN} border-slate-200 text-slate-700 hover:bg-slate-50 min-h-11`}>Cancel</button>
        <span className="text-[11px] text-slate-400">
          {channelLabel(ch)} · {kindLabel(chosenKind)}
          {followUpDate ? ` · follow up ${followUpDate}` : ' · no follow-up'}
        </span>
        {err && <span className="text-[11px] text-red-700">{err}</span>}
      </div>
    </div>
  )
}

/* 🔴 `NoteBox` WAS HERE AND IS GONE (v3), with the Note tab it belonged to, and so is
 * `AddNoteCard`, which replaced it (v3 fixes). The same `add_note` call is `NotesCard`'s one box
 * in the left column, always visible — writing a note has never since cost a tab change or a
 * "discard what you have typed?" on a half-written email. */

/** `?` — the list, from the one place the shortcuts are declared. */
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 95 }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-bold text-slate-900">Keyboard shortcuts</h4>
          <button onClick={onClose} className="ml-auto text-sm font-semibold px-2 py-1 rounded-lg border border-slate-200">Close</button>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(s => (
              <tr key={s.keys}>
                <td className="py-1 pr-3 font-mono font-bold text-slate-700 whitespace-nowrap">{s.keys}</td>
                <td className="py-1 text-slate-600">{s.does}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-400 mt-2">Ignored while you are typing in a field.</p>
      </div>
    </div>
  )
}
