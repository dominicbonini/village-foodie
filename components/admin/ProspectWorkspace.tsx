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
import CreateDemoModal from '@/components/admin/CreateDemoModal'
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'
import ProspectTimeline from '@/components/admin/ProspectTimeline'
import {
  type Contact, type Prospect, type TimelinePayload,
  STATUS_LABEL, fmtDate, confirmLogoWrite, linkLabel, linkCls, fetchTimeline,
  ModalThumb, WhatsAppBox, DemoLinkChip, FIELD_CLS, LABEL_CLS,
} from '@/components/admin/outreach-shared'
import { templatesFor, suggestTemplateId, contextFromProspect, type MessageTemplate } from '@/lib/outreach-template-render'
import type { Snippet } from '@/lib/outreach-snippets'
import {
  nextStep, templateForStep, channelFor, leadTypeOf, isLeadType, shouldFreezeLeadType,
  LEAD_TYPE_LABELS, LEAD_TYPES, type Step,
} from '@/lib/outreach-step'
import {
  OUTREACH_STAGES, CONTACT_CHANNELS, CONTACT_DIRECTIONS, kindsForDirection, defaultKindFor,
  kindOrder, kindLabel, channelLabel, directionLabel, followUpDateFor, contactDay, toYMD,
} from '@/lib/outreach'
import { phoneWhatsApp } from '@/lib/whatsapp-hint'
import { getLocalDateInTz } from '@/lib/time-utils'
import { parseAttachments } from '@/lib/outreach-mail-bodies'
import {
  nextAction, isTypingTarget, SHORTCUTS, type NextAction,
} from '@/lib/outreach-workspace'
import { readQueue, queuePosition, neighbours, prospectPath, type QueueState } from '@/lib/outreach-queue'

const stageLabel = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, ' ')
const CARD = 'border border-slate-200 rounded-xl bg-white'
const BTN = 'text-sm font-bold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-400'

/** Which panel is open under the action bar. 🔴 One at a time — see `openPanel`. */
type Panel = 'email' | 'call' | 'whatsapp' | 'note' | null

export default function ProspectWorkspace({ prospectId }: { prospectId: string }) {
  const router = useRouter()

  // ── THE DATA ────────────────────────────────────────────────────────────────────────────────────
  // ⚠️ THE LIST ROUTE, NOT A NEW ONE. Every derivation this page shows — the contact ladder, the demo,
  // the event counts, the migration probes — is already assembled there, for every prospect, by code
  // that has been in production since V12.1. A per-prospect endpoint would be a second assembly of
  // the same row and the two would drift; 231 rows is one query and a few hundred kilobytes.
  const [prospect, setProspect] = useState<Prospect | null>(null)
  /** The list this page was opened from. Read from sessionStorage on mount — see that effect. */
  const [queue, setQueue] = useState<QueueState | null>(null)
  // ── 🔴 THE PANEL STATE IS DECLARED HERE, ABOVE EVERY EFFECT THAT TOUCHES IT. The mount effect
  // applies the URL's intent and `messageAction` arms the "Done" bar, and both run before the render
  // reaches the panel section — a `const` declared later would be in its temporal dead zone.
  const [panel, setPanel] = useState<Panel>(null)
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
        type Raw = { slug: string; label: string; channel: MessageTemplate['channel']; subject?: string | null; body: string; sort_order: number; active: boolean; serves_kind?: string | null; serves_lead_type?: string | null; placeholder_defaults?: Record<string, { value?: string; updated_at?: string | null }> }
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
    if (panel && panel !== next && dirty) {
      if (!window.confirm('Discard what you have typed?')) return
    }
    setDirty(false)
    setReplyTarget(target)
    setPanel(next)
  }

  const closePanel = () => {
    if (dirty && !window.confirm('Discard what you have typed?')) return
    setDirty(false); setReplyTarget(null); setPanel(null)
  }

  const replyToMessage = (m: { id: string; subject?: string | null; from_address?: string | null; message_date?: string | null }) => {
    openPanel('email', { messageId: m.id, subject: m.subject ?? null, fromAddress: m.from_address ?? null, date: m.message_date ?? null })
  }

  // ── KEYBOARD ────────────────────────────────────────────────────────────────────────────────────
  /**
   * 🔴 ONE LISTENER, REGISTERED ONCE, READING THE LATEST HANDLERS THROUGH A REF. Registering it with
   * the handlers as dependencies would tear down and re-add a window listener on every keystroke
   * elsewhere on the page; two of those handlers cannot be memoised at all (they branch on a
   * `window.confirm`). The ref is written in an effect, never during render.
   */
  const latest = useRef({ panel, expandedId, nav, resolved, focus, timeline, goTo, openPanel, closePanel, replyToMessage })
  useEffect(() => {
    latest.current = { panel, expandedId, nav, resolved, focus, timeline, goTo, openPanel, closePanel, replyToMessage }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 🔴 NEVER WHILE TYPING. The predicate is shared and tested; see `isTypingTarget`. It checks
      // `isContentEditable` as well as the tag, because the email body is a ProseMirror surface and
      // a tag test alone would let every letter key fire inside it.
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const L = latest.current
      const k = e.key
      if (k === 'Escape') { if (L.expandedId) setExpandedId(null); else if (L.panel) L.closePanel(); return }
      if (k === '?') { setShowHelp(v => !v); return }
      if (k === 'j' || k === 'J') { L.goTo(L.nav.next); return }
      if (k === 'k' || k === 'K') { L.goTo(L.nav.prev); return }
      if (k === 'e' || k === 'E') { e.preventDefault(); L.openPanel('email'); return }
      if (k === 'n' || k === 'N') { e.preventDefault(); L.openPanel('note'); return }
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
  const offerable = templatesFor(templates ?? [], p)

  return (
    <div className="text-slate-900 max-w-[1500px] mx-auto px-4 py-3">
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

      {/* ── HEADER, LINE 1 ───────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <button onClick={back} className={`${BTN} border-slate-200 text-slate-700 hover:bg-slate-50`}>← Back</button>
        <h1 className="text-xl font-bold truncate min-w-0">{p.name}</h1>
        {/* 🔴 THE SAME STAGE ROUTE AS EVER, so a change here still writes an `outreach_events` row
            through `update_prospect` — the stage history did not become optional by moving. */}
        <select value={p.stage} onChange={e => void patch({ stage: e.target.value })}
          title="Changing the stage records a stage change in the timeline."
          className="text-xs font-bold border border-slate-300 rounded-full px-2 py-1 bg-white">
          {OUTREACH_STAGES.map(st => <option key={st} value={st}>{stageLabel(st)}</option>)}
        </select>
        {safeHref(p.website) && (
          <a href={safeHref(p.website)!} target="_blank" rel="noreferrer" className={linkCls} title={p.website ?? undefined}>
            {linkLabel(p.website, 'Website')} ↗
          </a>
        )}
        {safeHref(p.schedule_url) && (
          <a href={safeHref(p.schedule_url)!} target="_blank" rel="noreferrer" className={linkCls} title={p.schedule_url ?? undefined}>
            {linkLabel(p.schedule_url, 'Schedule')} ↗
          </a>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* ‹ › walk the queue the page was opened from — a Today section, or the filtered list. */}
          <button onClick={() => goTo(nav.prev)} disabled={!nav.prev} aria-label="Previous (K)" title="Previous in this queue (K)"
            className="text-sm font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30">‹</button>
          <span className="text-xs text-slate-500 tabular-nums px-1">
            {pos ? `${pos.index} of ${pos.total}` : '—'}
          </span>
          <button onClick={() => goTo(nav.next)} disabled={!nav.next} aria-label="Next (J)" title="Next in this queue (J)"
            className="text-sm font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30">›</button>
          <MoreMenu p={p} dncEnabled={flags.dnc} onPatch={patch} onRefresh={reloadAll} onHelp={() => setShowHelp(true)} />
        </div>
      </div>

      {/* ── HEADER, LINE 2 · THE FOCUS LINE ──────────────────────────────────────────────────────
          🔴 ONE NEXT THING, DERIVED, NEVER STORED. `nextAction` orders existing answers — the
          needs-attention predicate, `nextStep`, `next_action_at` — and returns the first that
          applies. Nothing here computes a step of its own. */}
      {focus && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
          <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Next</span>
          <span className="text-sm font-semibold text-slate-800">
            {focus.label}
            {focus.kind === 'none' && focus.reason && <span className="font-normal text-slate-500"> · {focus.reason}</span>}
          </span>
          {focus.kind === 'reply' && (
            <button onClick={() => {
              const m = (timeline?.messages ?? []).find(x => x.id === focus.messageId)
              if (m) replyToMessage(m)
            }} title="Answer the waiting message (R)"
              className={`${BTN} ml-auto border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100`}>
              {focus.cta}
            </button>
          )}
          {(focus.kind === 'chase' || focus.kind === 'follow_up') && (
            <button onClick={() => openPanel('email')} title="Open the composer (E)"
              className={`${BTN} ml-auto border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100`}>
              {focus.cta}
            </button>
          )}
        </div>
      )}

      {/* ── THE "DONE. NEXT" BAR ─────────────────────────────────────────────────────────────────
          🔴 IT NEVER NAVIGATES BY ITSELF. Close's Next-Lead pattern works because the result of what
          you just did stays on screen until you choose to move: a page that jumped would hide the
          confirmation, and a mis-click would be unrecoverable. Enter follows it; nothing else does. */}
      {resolved && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2">
          <span className="text-sm font-bold text-emerald-900">Done.</span>
          {nav.next
            ? <button onClick={() => goTo(nav.next)} className={`${BTN} border-emerald-300 text-emerald-900 bg-white hover:bg-emerald-100`}>
                Next: {queue?.label ?? 'the list'} →<span className="ml-2 text-[10px] font-normal opacity-70">Enter</span>
              </button>
            : <span className="text-sm text-emerald-900">That&rsquo;s everything in {queue?.label ?? 'this list'}.</span>}
          <button onClick={() => setResolved(false)} className="ml-auto text-xs font-semibold text-emerald-900 underline">Dismiss</button>
        </div>
      )}

      {/* ── TWO COLUMNS. 🔴 `fr`, INLINE, for the reason the modal recorded: an arbitrary Tailwind
          value used by one file may have no generated rule, and the fallback would be 50/50 — the
          split being corrected. Below `lg` they stack, action column first. */}
      <div className="grid gap-4 max-lg:flex max-lg:flex-col" style={{ gridTemplateColumns: '30fr 70fr' }}>
        {/* ── LEFT: READ FIRST ──────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 max-lg:order-2">
          <ContactCard p={p} step={step} flags={flags} editing={editing} setEditing={setEditing}
            onPatch={patch} waPhone={waPhone} />

          <label className={`${CARD} p-3 block`}>
            <span className={LABEL_CLS}>Pinned notes</span>
            <PinnedNotes p={p} onPatch={patch} />
          </label>

          <FilesCard timeline={timeline} prospectId={p.id} onOpen={id => { setExpandedId(id); document.getElementById(`tl-${id}`)?.scrollIntoView({ block: 'center' }) }} />

          {/* ⚠️ VISUALLY SECONDARY AND AT THE BOTTOM, unchanged in behaviour. A demo is built once and
              read occasionally; it spent the modal's life competing with the contact details. */}
          <DemoCard p={p} onReload={reloadAll} />
        </div>

        {/* ── RIGHT: ACT AND SCAN ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 min-w-0 max-lg:order-1">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => openPanel('email')} title="Compose an email (E)"
              className={`${BTN} border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100`}>Email</button>
            <button onClick={() => openPanel('call')} title="Log a call you have already made (C)"
              className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50`}>Log call</button>
            <button onClick={() => openPanel('whatsapp')} title="Log a WhatsApp message you have already sent"
              className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50`}>Log WhatsApp</button>
            <button onClick={() => openPanel('note')} title="Add a note to the timeline (N)"
              className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50`}>Note</button>
            {note && <span className="text-[11px] text-slate-600">{note}</span>}
          </div>

          {/* 🔴 THE COMPOSE WINDOW, INLINE. Same component, same props, same guards — `inline` changes
              where it paints and nothing else. It was a pop-up because it sat over a modal; over a
              page there is nothing to sit on, and a floating panel would hide the conversation it
              exists to answer. */}
          {panel === 'email' && (
            <ComposeWindow
              inline
              truckName={p.name}
              prospectId={p.id}
              toEmail={p.contact_email}
              offerable={offerable}
              suggestedId={suggestTemplateId(p)}
              initialTemplateId={step ? templateForStep(step, offerable).slug : null}
              doNotContact={dnc}
              ctx={contextFromProspect(p)}
              whatsappConfirmed={p.whatsapp_confirmed === true}
              templatesLoaded={templates !== null}
              logFormKind={step?.kind ?? defaultKindFor('outbound')}
              snippets={snippets}
              replyTo={replyTarget}
              onDirtyChange={setDirty}
              onClose={closePanel}
              onSent={async () => { await reloadAll(); setResolved(true) }}
              onLog={async (editedBody, ch, servesKind) => {
                const kind = servesKind ?? step?.kind ?? defaultKindFor('outbound')
                const ok = await logContactThrough(post, p.id, {
                  channel: ch, direction: 'outbound', kind, message: editedBody, contacted_at: toYMD(new Date()),
                })
                if (ok) {
                  // 🔴 THE FOLLOW-UP DATE AND THE LEAD-TYPE FREEZE, on the same conditions as before.
                  const patchAfter: Record<string, unknown> = { next_action_at: followUpDateFor(kind, toYMD(new Date())) }
                  if (shouldFreezeLeadType(kind, p, flags.leadFreeze)) patchAfter.lead_type_at_first_contact = leadTypeOf(p)
                  await post({ action: 'update_prospect', id: p.id, ...patchAfter })
                  await reloadAll()
                }
                return ok
              }}
            />
          )}

          {(panel === 'call' || panel === 'whatsapp') && (
            <QuickLog p={p} channel={panel === 'call' ? 'phone' : 'whatsapp'} step={step}
              onDirty={setDirty}
              onCancel={closePanel}
              onLogged={async () => { setDirty(false); setPanel(null); await reloadAll(); setResolved(true) }}
              post={post} leadFreeze={flags.leadFreeze} />
          )}

          {panel === 'note' && (
            <NoteBox prospectId={p.id} onDirty={setDirty} onCancel={closePanel}
              onSaved={async () => { setDirty(false); setPanel(null); await reloadAll() }} />
          )}

          <ProspectTimeline
            prospect={p}
            data={timeline}
            expandedId={expandedId}
            onExpand={setExpandedId}
            actions={{
              onReply: replyToMessage,
              onMessageAction: messageAction,
              onDeleteContact: deleteContact,
              busyId,
            }}
          />
        </div>
      </div>

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

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
function ContactCard({ p, step, flags, editing, setEditing, onPatch, waPhone }: {
  p: Prospect
  step: Step | null
  flags: { names: boolean; leadFreeze: boolean; dnc: boolean }
  editing: boolean
  setEditing: (v: boolean) => void
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  waPhone: string | null
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
          <button onClick={start} className="ml-auto text-xs font-bold text-orange-700 hover:underline">✎ Edit</button>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-col gap-1 text-[13px]">
          <p className="font-semibold text-slate-800">{name || <span className="text-slate-400">no contact name</span>}</p>
          <p className="break-words">
            {p.contact_email
              ? <span className="text-slate-700">{p.contact_email}</span>
              : <span className="text-slate-400">no email address</span>}
          </p>
          <p className="flex items-center gap-2 flex-wrap">
            {p.phone
              ? <>
                  {/* ⚠️ THE STANDALONE "Call" AND "Email" BUTTONS ARE GONE, as asked. The number IS the
                      tel: link and the address is simply text — the way to send an email is the Email
                      button on the right, which logs what it sends. */}
                  <a href={`tel:${p.phone}`} className="text-slate-700 hover:underline">☎ {p.phone}</a>
                  {p.whatsapp_confirmed === true && waPhone && (
                    <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                      className="text-xs font-bold text-emerald-700 hover:underline">WhatsApp ↗</a>
                  )}
                </>
              : <span className="text-slate-400">no phone number</span>}
          </p>
          <p className="text-slate-500">
            <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Lead</span>
            {LEAD_TYPE_LABELS[lead] ?? lead}
            {step?.leadTypeFrozen && <span className="text-slate-400"> (frozen)</span>}
          </p>
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
              className={`${BTN} border-orange-600 bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50`}>
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

/** The prospect's standing notes. ⚠️ SAVES ON BLUR, exactly as the modal's field did. */
function PinnedNotes({ p, onPatch }: { p: Prospect; onPatch: (patch: Record<string, unknown>) => Promise<void> }) {
  const [notes, setNotes] = useState(p.notes ?? '')
  return (
    <textarea rows={3} className={`${FIELD_CLS} resize-y`} value={notes}
      placeholder="Always true of this truck — “only answers after 3pm”."
      onChange={e => setNotes(e.target.value)}
      onBlur={() => { if (notes !== (p.notes ?? '')) void onPatch({ notes: notes || null }) }} />
  )
}

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
                  className="text-[11px] font-bold text-orange-700 hover:underline disabled:opacity-40 shrink-0">
                  {busy === f.storagePath ? '…' : 'Download'}
                </button>
              : <span className="text-[10px] text-slate-400 shrink-0" title="An attachment on an email they sent. This app never downloads those.">listed only</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The demo tools. ⚠️ Behaviour unchanged; only its weight on the page is. */
function DemoCard({ p, onReload }: { p: Prospect; onReload: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  return (
    <div className={`${CARD} p-3 flex flex-col gap-2`}>
      <span className={LABEL_CLS}>Demo</span>
      {p.demo
        ? <div className="flex flex-wrap items-center gap-2">
            <DemoLinkChip demo={p.demo} />
            {p.demo.truckId && (
              <button onClick={() => setCreating(true)}
                title="Build this demo again with different collection times, cook time or batch size"
                className="text-xs font-semibold px-2 py-1 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50">
                Rebuild
              </button>
            )}
          </div>
        : <button onClick={() => setCreating(true)}
            className="text-xs font-semibold px-3 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600 self-start">
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
function QuickLog({ p, channel, step, post, leadFreeze, onDirty, onCancel, onLogged }: {
  p: Prospect
  channel: 'phone' | 'whatsapp'
  step: Step | null
  post: (b: Record<string, unknown>) => Promise<Record<string, unknown>>
  leadFreeze: boolean
  onDirty: (v: boolean) => void
  onCancel: () => void
  onLogged: () => Promise<void>
}) {
  const today = toYMD(new Date())
  const [full, setFull] = useState(false)
  const [when, setWhen] = useState(today)
  const [direction, setDirection] = useState('outbound')
  const [kind, setKind] = useState(step?.kind ?? defaultKindFor('outbound'))
  const [ch, setCh] = useState<string>(channel)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const j = await post({
        action: 'log_contact', prospect_id: p.id,
        channel: ch, direction, kind, message, contacted_at: when,
      })
      if (j.error) { setErr(String(j.error)); return }
      // The follow-up date and the rung-1 freeze, on the same conditions as every other log path.
      const patch: Record<string, unknown> = { next_action_at: followUpDateFor(kind, when) }
      if (shouldFreezeLeadType(kind, p, leadFreeze)) patch.lead_type_at_first_contact = leadTypeOf(p)
      await post({ action: 'update_prospect', id: p.id, ...patch })
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
      <div className={`grid gap-2 ${full ? 'grid-cols-4' : 'grid-cols-2'}`}>
        <label className="block min-w-0">
          <span className={LABEL_CLS}>When</span>
          {/* 🔴 CAPPED AT TODAY. A contact cannot have happened in the future, and a mistyped future
              date would sort to the top of the history and take "last contacted" with it. */}
          <input type="date" className={FIELD_CLS} value={when} max={today} onChange={e => { setWhen(e.target.value); onDirty(true) }} />
        </label>
        {full && (
          <label className="block min-w-0"><span className={LABEL_CLS}>Channel</span>
            <select className={FIELD_CLS} value={ch} onChange={e => setCh(e.target.value)}>
              {CONTACT_CHANNELS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
        )}
        <label className="block min-w-0"><span className={LABEL_CLS}>Direction</span>
          {/* 🔴 CHANGING DIRECTION CHANGES KIND: an inbound row can only be a reply, and a reply is not
              a rung of the outbound ladder. The same pairing the modal enforced. */}
          <select className={FIELD_CLS} value={direction}
            onChange={e => {
              const d = e.target.value
              setDirection(d)
              if (!kindsForDirection(d).includes(kind)) setKind(defaultKindFor(d))
            }}>
            {CONTACT_DIRECTIONS.map(d => <option key={d} value={d}>{directionLabel(d)}</option>)}
          </select>
        </label>
        <label className="block min-w-0"><span className={LABEL_CLS}>Kind</span>
          <select className={FIELD_CLS} value={kind} onChange={e => setKind(e.target.value)}>
            {[...kindsForDirection(direction)].sort((a, b) => kindOrder(a) - kindOrder(b))
              .map(k => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
        </label>
      </div>
      <textarea rows={2} className={`${FIELD_CLS} resize-y`} placeholder="What was said (optional)"
        value={message} onChange={e => { setMessage(e.target.value); onDirty(true) }} />
      <div className="flex items-center gap-2">
        <button onClick={() => void submit()} disabled={busy}
          className={`${BTN} border-orange-600 bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50`}>
          {busy ? 'Logging…' : 'Log'}
        </button>
        <button onClick={onCancel} className={`${BTN} border-slate-200 text-slate-700 hover:bg-slate-50`}>Cancel</button>
        <span className="text-[11px] text-slate-400">{channelLabel(ch)} · {kindLabel(kind)}</span>
        {err && <span className="text-[11px] text-red-700">{err}</span>}
      </div>
    </div>
  )
}

/** A note. 🔴 The existing `outreach_events` note — inert, and never a rung on the ladder. */
function NoteBox({ prospectId, onDirty, onCancel, onSaved }: {
  prospectId: string
  onDirty: (v: boolean) => void
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      const h = await nativeAuthHeader()
      await fetch('/api/admin/outreach/timeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'add_note', prospect_id: prospectId, body }),
      })
      await onSaved()
    } finally { setBusy(false) }
  }
  return (
    <div className={`${CARD} p-3 flex flex-col gap-2`}>
      <span className={LABEL_CLS}>Note</span>
      <textarea rows={3} autoFocus className={`${FIELD_CLS} resize-y`}
        placeholder="What happened, or what to do next…"
        value={body} onChange={e => { setBody(e.target.value); onDirty(true) }} />
      <div className="flex items-center gap-2">
        <button onClick={() => void save()} disabled={busy || !body.trim()}
          className={`${BTN} border-orange-600 bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50`}>
          {busy ? 'Saving…' : 'Add note'}
        </button>
        <button onClick={onCancel} className={`${BTN} border-slate-200 text-slate-700 hover:bg-slate-50`}>Cancel</button>
      </div>
    </div>
  )
}

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
