// components/admin/ProspectTimeline.tsx — one line per thing that happened, and the whole of it on click.
//
// 🔴 WHAT CHANGED FROM THE MODAL'S TIMELINE, AND WHY. That one gave every row a status word (Sent,
// Reply, imported, from Outlook), a preview of up to three lines, and an Open button. Eight emails
// filled the panel, and because every row carried a badge the badges stopped meaning anything — which
// is the opposite of what a badge is for. This is one line per item, badges ONLY where something needs
// doing or went wrong, and the whole row is the control.
//
// ⚠️ THE RULES ARE NOT IN HERE. What counts as waiting, which badges a row earns, what the filters
// mean and what the search matches all live in `lib/outreach-workspace.ts` and `lib/outreach-*`, where
// a harness can stand on them. This file renders their answers.
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  buildTimeline, pairHandLoggedEmails, meaningfulPreview, type TimelineMessage,
} from '@/lib/outreach-timeline'
import { SNOOZE_OPTIONS, SNOOZE_LABELS, needsAttention } from '@/lib/outreach-attention'
import {
  rowBadges, BADGE_LABEL, matchesTimelineQuery, TIMELINE_FILTERS, TIMELINE_FILTER_LABEL,
  isTimelineFilter, type TimelineFilter, type RowBadge,
} from '@/lib/outreach-workspace'
import { TIMELINE_PREF_KEY } from '@/lib/outreach-queue'
import { contactRowLabel } from '@/lib/outreach-timeline'
import { CONTACT_KINDS } from '@/lib/outreach'
import { STEP_LABELS } from '@/lib/outreach-sequence'
import EmailReadingPanel from '@/components/admin/EmailReadingPanel'
import {
  ContactPopout, INBOUND_BG, NoteRow, fmtDate, stageWord, SizedEmailFrame,
  type Contact, type Prospect, type TimelinePayload,
} from '@/components/admin/outreach-shared'
import { createPortal } from 'react-dom'

/** The tone each badge carries. 🔴 Amber is "you", red is "it broke", grey is "for information". */
const BADGE_TONE: Record<RowBadge, string> = {
  waiting: 'bg-amber-100 border-amber-300 text-amber-900',
  bounced: 'bg-red-50 border-red-300 text-red-800',
  failed: 'bg-red-50 border-red-300 text-red-800',
  uncertain: 'bg-amber-50 border-amber-300 text-amber-800',
  auto_reply: 'bg-slate-100 border-slate-300 text-slate-600',
  test: 'bg-slate-100 border-slate-300 text-slate-500',
}

/** The icon column. One glyph, so direction reads before anything else on the line. */
function rowIcon(item: { type: string; message?: TimelineMessage; contact?: { channel?: string | null; direction?: string | null }; event?: { kind: string } }): string {
  if (item.type === 'email') return item.message?.direction === 'inbound' ? '↙' : '↗'
  if (item.type === 'contact') {
    const ch = (item.contact?.channel ?? '').toLowerCase()
    if (ch.includes('whatsapp')) return 'WA'
    if (ch.includes('phone') || ch.includes('call')) return '☎'
    return item.contact?.direction === 'inbound' ? '↙' : '↗'
  }
  return item.event?.kind === 'note' ? '✎' : '·'
}

/** "14:07" — shown on hover, because the date is enough at a glance and the time rarely is. */
const timeOf = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? ''
    : new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' }).format(d)
}

export interface TimelineActions {
  /** Answer this inbound message. */
  onReply: (m: TimelineMessage) => void
  /** Mark done / Snooze / Mark as needing reply / Retry / Save to Sent / log it — all POSTs. */
  onMessageAction: (action: string, messageId: string, extra?: Record<string, unknown>) => Promise<void>
  onDeleteContact: (c: Contact) => Promise<void>
  /** 🔴 "Record as Chase 1" — an Outlook-sent email, given the step it was. One click, never automatic. */
  onRecordStep: (messageId: string, kind: string) => Promise<void>
  /** The page's own `nextStep` answer. Null ⇒ the ladder cannot say, so the panel offers a picker. */
  currentStepKind: string | null
  /** Re-read after a note was edited, deleted or put back. The page's one reload. */
  onNotesChanged: () => Promise<void>
  busyId: string | null
}

export default function ProspectTimeline({ prospect, data, actions, expandedId, onExpand }: {
  prospect: Prospect
  data: TimelinePayload | null
  actions: TimelineActions
  /** 🔴 HELD BY THE PAGE, not here: Esc closes it, and the page owns Esc. */
  expandedId: string | null
  onExpand: (id: string | null) => void
}) {
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [query, setQuery] = useState('')
  const [showTests, setShowTests] = useState(false)
  const [expandAll, setExpandAll] = useState(false)
  const [viewingContact, setViewingContact] = useState<Contact | null>(null)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  /** 🔴 One email, filling the window. For the thread that is longer than the page is tall. */
  const [fullScreen, setFullScreen] = useState<{ html: string; subject: string | null } | null>(null)

  // ⚠️ REMEMBERED PER BROWSER, NOT PER PROSPECT. Which slice of the history somebody wants to read is
  // a habit, not a fact about one truck. localStorage, and a bad value reads as 'all'.
  useEffect(() => {
    // ⚠️ IN A MICROTASK, AFTER MOUNT. Reading it during render would differ between the server (no
    // localStorage) and the client, which is a hydration mismatch; reading it synchronously in the
    // effect body is the cascading-render pattern React tells you not to write. This is neither.
    void Promise.resolve().then(() => {
      try {
        const saved = window.localStorage.getItem(TIMELINE_PREF_KEY)
        if (isTimelineFilter(saved)) setFilter(saved)
      } catch { /* storage disabled: the default stands */ }
    })
  }, [])
  const chooseFilter = (f: TimelineFilter) => {
    setFilter(f)
    try { window.localStorage.setItem(TIMELINE_PREF_KEY, f) } catch { /* nothing to remember, no crash */ }
  }

  // 🔴 ONE ROW PER EVENT. An email sent from Outlook and then logged by hand is one thing that
  // happened and two honest records of it; `pairHandLoggedEmails` pairs them for display and
  // refuses whenever the pairing would be a guess. Nothing is deleted.
  const pairing = useMemo(() => pairHandLoggedEmails({
    messages: data?.messages ?? [], contacts: data?.contacts ?? [],
  }), [data])

  const items = useMemo(() => buildTimeline({
    messages: data?.messages ?? [],
    contacts: data?.contacts ?? [],
    events: data?.events ?? [],
    showTests,
    pairing,
  }), [data, showTests, pairing])

  const shown = useMemo(
    () => items.filter(i => matchesTimelineQuery(i, filter, query)),
    [items, filter, query])

  /* 🔴 THE EMAILS ON SCREEN, IN THE ORDER THEY ARE ON SCREEN — newest first. ‹ › and ↑/↓ step
     through THIS list, not through every email on the prospect, so a filter or a search narrows
     what the arrows walk as well as what the list shows. ⚠️ If the open email is filtered out from
     under the panel, `stepEmailId` returns null for both arrows rather than jumping somewhere. */
  const emailIds = useMemo(() => shown.filter(i => i.type === 'email').map(i => i.id), [shown])
  const openEmail = useMemo(() => {
    if (!expandedId) return null
    const hit = shown.find(i => i.type === 'email' && i.id === expandedId)
    return hit && hit.type === 'email' ? hit.message : null
  }, [shown, expandedId])

  const testCount = (data?.messages ?? []).filter(m => m.is_test === true).length
  const now = new Date()
  const linkedTruck = !!prospect.hatchgrab_truck_id

  return (
    <div className="flex flex-col">
      {/* ── CONTROLS ─────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex items-center gap-1">
          {TIMELINE_FILTERS.map(f => (
            <button key={f} type="button" onClick={() => chooseFilter(f)} aria-pressed={filter === f}
              className={`text-[11px] font-bold px-2 py-1 rounded-full border ${filter === f
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {TIMELINE_FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search this history…"
          title="Matches the subject and the stored text of what is already loaded. It is not a mailbox search."
          className="w-48 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white" />
        {/* ⚠️ IT SAYS WHAT IT NOW DOES. It used to expand every row including the emails; an email
            opens in the reading panel now, and "expand all" cannot mean fourteen panels. What it
            expands is the calls, WhatsApps and hand-logged contacts — the short rows — so that is
            what the button is called. */}
        <button type="button" onClick={() => { setExpandAll(v => !v); onExpand(null) }}
          title="Shows what was recorded with every call, WhatsApp and hand-logged contact. Emails open in the reading panel."
          className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
          {expandAll ? 'Collapse contacts' : 'Expand contacts'}
        </button>
        {testCount > 0 && (
          <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer"
            title="A test send is Dominic emailing himself. It is not correspondence with this truck.">
            <input type="checkbox" checked={showTests} onChange={e => setShowTests(e.target.checked)} />
            Show test sends ({testCount})
          </label>
        )}
      </div>

      <div className="border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 overflow-hidden">
        {data === null && <p className="px-3 py-3 text-[12px] text-slate-400">Loading…</p>}
        {data?.migrationApplied === false && (
          <p className="px-3 py-3 text-[12px] text-red-800">
            The timeline needs `supabase/migrations/20260929_outreach_crm_today_timeline.sql` applying.
          </p>
        )}
        {data !== null && data.migrationApplied !== false && shown.length === 0 && (
          <p className="px-3 py-3 text-[12px] text-slate-400">
            {items.length === 0 ? 'Nothing yet — no emails, contacts or notes.' : 'Nothing matches that.'}
          </p>
        )}

        {shown.map(item => {
          // ── A NOTE OR A STAGE CHANGE: ONE LINE, AND IT DOES NOT EXPAND ──────────────────────
          // 🔴 THERE IS NOTHING BEHIND THEM. A note IS its line; a stage change is two words and a
          // cause. Making them expandable would promise a detail that does not exist.
          if (item.type === 'event') {
            const e = item.event
            return (
              <div key={item.id} className="px-3 py-1.5 flex items-start gap-2 text-[12px]">
                <span className="w-5 text-center text-slate-400 shrink-0" aria-hidden="true">{rowIcon(item)}</span>
                <span className="w-20 shrink-0 text-slate-400 tabular-nums" title={timeOf(e.created_at)}>
                  {fmtDate(e.created_at)}
                </span>
                <span className="flex-1 min-w-0">
                  {/* 🔴 A STAGE CHANGE IS A RECORD OF SOMETHING THAT HAPPENED and carries no
                      controls at all; a NOTE is something somebody wrote and can be corrected or
                      removed. The same component as the Notes card uses — one set of rules, one
                      confirmation, one Undo — rather than a second copy of them here. */}
                  {e.kind === 'stage_change'
                    ? <span className="text-slate-600">
                        Stage {stageWord(e.from_stage)} → <span className="font-bold text-slate-800">{stageWord(e.to_stage)}</span>
                        {e.body && <span className="text-slate-400"> · {e.body}</span>}
                      </span>
                    : <ul className="list-none"><NoteRow note={e} prospectId={prospect.id}
                        onChanged={actions.onNotesChanged}
                        open={expandAll || expandedId === item.id}
                        onToggle={() => onExpand(expandedId === item.id ? null : item.id)} /></ul>}
                </span>
              </div>
            )
          }

          // ── A CALL, A WHATSAPP, A HAND-LOGGED CONTACT ───────────────────────────────────────
          if (item.type === 'contact') {
            const c = item.contact as unknown as Contact
            const open = expandAll || expandedId === item.id
            return (
              <div key={item.id} className="text-[12px]">
                <button type="button" onClick={() => onExpand(open ? null : item.id)}
                  className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-slate-50">
                  <span className={`w-5 text-center shrink-0 ${c.direction === 'inbound' ? 'text-emerald-700' : 'text-slate-400'}`} aria-hidden="true">
                    {rowIcon(item)}
                  </span>
                  <span className="w-20 shrink-0 text-slate-400 tabular-nums" title={timeOf(c.created_at)}>
                    {fmtDate(c.contacted_at)}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    {/* 🔴 WHAT HAPPENED, NOT WHICH RUNG WAS STORED. After a prospect replies every
                        one-click log is stored as `reply` — correctly, because `reply` is not a rung
                        — and the row printed that, so a phone call read "reply · Spoke to Libby".
                        `contactRowLabel` says "Call"; the stored kind is untouched. */}
                    <span className="font-semibold text-slate-700">{contactRowLabel(c)}</span>
                    {c.message && <span className="text-slate-500"> · {c.message.replace(/\s+/g, ' ')}</span>}
                  </span>
                </button>
                {open && (
                  <div className="px-3 pb-2 pl-10 flex flex-col gap-1">
                    {c.message
                      ? <p className="text-slate-700 whitespace-pre-wrap break-words">{c.message}</p>
                      : <p className="text-slate-400 italic">No message was recorded with this contact.</p>}
                    <div>
                      {/* ⚠️ DELETE IS WHERE IT ALWAYS WAS — in the popout, behind its own confirmation. */}
                      <button type="button" onClick={() => setViewingContact(c)}
                        className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
                        Open · delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          // ── AN EMAIL ────────────────────────────────────────────────────────────────────────
          // 🔴 AN EMAIL OPENS IN THE READING PANEL, NOT IN THE LIST. The history is the LAST block
          // of the centre column, so an email expanded in place started a few lines above the fold
          // and was read through a slot. The row still carries the same id and the same click; what
          // changed is where the email is drawn. Notes, calls and stage changes are short and still
          // open where they are — there is nothing about them that needs a panel.
          // ⚠️ `expandAll` NO LONGER TOUCHES EMAIL ROWS, because "expand all" cannot mean "open
          // fourteen panels". It still expands every contact row, which is what it is now for.
          const m = item.message
          const inbound = m.direction === 'inbound'
          const open = expandedId === item.id
          const badges = rowBadges(m, { now, linkedTruck, showTests })
          // 🔴 THE FIRST LINE THAT SAYS SOMETHING. "Hi Stephen," told the reader only that this is
          // an email, which the row already said.
          const firstLine = meaningfulPreview(m.preview, m.subject)
          return (
            <div key={item.id} className="text-[12px]" style={inbound ? { background: INBOUND_BG } : undefined}>
              {/* 🔴 THE WHOLE ROW IS THE CONTROL. The Open button is gone: a row you can read is a row
                  you can click, and a button beside it was a second target for one intention.
                  ⚠️ THE `tl-<id>` ID IS ON THE BUTTON, and it is load-bearing twice over: the Files
                  card scrolls to it, and the panel returns focus to it on close. It was named in
                  both places and existed in neither — `getElementById` was returning null. */}
              <button type="button" id={`tl-${item.id}`} onClick={() => onExpand(open ? null : item.id)}
                aria-expanded={open}
                className={`w-full text-left px-3 py-1.5 max-md:py-2.5 max-md:min-h-11 flex items-start gap-2 hover:bg-black/[0.03] ${
                  open ? 'ring-2 ring-inset ring-slate-400 bg-black/[0.04]' : ''}`}>
                <span className={`w-5 text-center shrink-0 ${inbound ? 'text-emerald-700' : 'text-slate-400'}`} aria-hidden="true">
                  {rowIcon(item)}
                </span>
                <span className="w-20 shrink-0 text-slate-400 tabular-nums max-md:hidden" title={timeOf(m.message_date ?? m.created_at)}>
                  {fmtDate(m.message_date ?? m.created_at ?? null)}
                </span>
                {/* ⚠️ TWO LINES ON A PHONE: who and when on the first, what they said on the second.
                    One truncated line at 375px shows about four words, which is not a row anybody
                    can scan. */}
                <span className="flex-1 min-w-0 truncate max-md:whitespace-normal">
                  <span className="font-semibold text-slate-800">{m.subject ?? '(no subject)'}</span>
                  <span className="hidden max-md:inline text-slate-400 text-[11px]">
                    {' · '}{fmtDate(m.message_date ?? m.created_at ?? null)}
                  </span>
                  {firstLine && <span className="text-slate-500 max-md:block max-md:truncate"> · {firstLine}</span>}
                </span>
                {/* 🔴 THE "also logged by hand" MARKER IS GONE (polish). It explained a de-duplication
                    nobody had asked about — the pairing is display-only and its whole point is that
                    one thing that happened is one row. Saying so on the row made the mechanism the
                    subject. The PAIRING is unchanged; only the label went, and the logged text is
                    still reachable in the reading panel when it says something the email does not. */}
                {badges.map(b => (
                  <span key={b} className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${BADGE_TONE[b]}`}>
                    {BADGE_LABEL[b]}
                  </span>
                ))}
              </button>

              {/* 🔴 NOTHING EXPANDS UNDER AN EMAIL ROW ANY MORE. The body, the provenance, the
                  hand-logged sentence and every button moved into the panel — together, because a
                  55vw panel covers most of the history and a control left behind it would be half
                  hidden. The row itself is the open/close control and carries the ring. */}
            </div>
          )
        })}
      </div>

      {/* ── THE READING PANEL ────────────────────────────────────────────────────────────────
          🔴 ONE ID, TWO BEHAVIOURS, AND THE ID IS THE PAGE'S. `expandedId` already meant "the open
          row"; when it names an EMAIL the panel opens, when it names a contact that row expands in
          place. So Escape (the page's), the Files card's "open this attachment's email" and the
          panel all drive the same value and cannot disagree about what is open. */}
      {openEmail && (
        <EmailReadingPanel
          message={openEmail}
          ids={emailIds}
          onOpen={onExpand}
          onClose={() => onExpand(null)}
          handLogged={pairing.pairs.get(openEmail.id) ?? null}
          prospectEmail={prospect.contact_email ?? null}
          onOpenFull={(html, subject) => setFullScreen({ html, subject })}
          footer={<EmailActions m={openEmail} actions={actions} now={now} linkedTruck={linkedTruck}
            snoozeFor={snoozeFor} setSnoozeFor={setSnoozeFor} onClose={() => onExpand(null)}
            stepKind={actions.currentStepKind} />}
        />
      )}

      {/* ── ONE EMAIL, THE WHOLE WINDOW ──────────────────────────────────────────────────────
          ⚠️ THE SAME FRAME AND THE SAME SANDBOX — only the cap changes. Escape and the backdrop
          both close it, because nothing is being edited and there is nothing to lose. */}
      {fullScreen && createPortal(
        <div style={{ zIndex: 95 }} className="fixed inset-0 bg-white flex flex-col"
          onKeyDown={e => { if (e.key === 'Escape') setFullScreen(null) }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200">
            <span className="font-bold text-slate-800 truncate">{fullScreen.subject ?? 'Email'}</span>
            <button onClick={() => setFullScreen(null)} autoFocus
              className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            <SizedEmailFrame html={fullScreen.html} title="Email, full screen" maxFraction={0.95} />
          </div>
        </div>,
        document.body,
      )}

      {viewingContact && (
        <ContactPopout contact={viewingContact} onClose={() => setViewingContact(null)}
          onDelete={async () => { await actions.onDeleteContact(viewingContact); setViewingContact(null) }} />
      )}
    </div>
  )
}

// ── WHAT CAN BE DONE WITH AN EMAIL ──────────────────────────────────────────────────────────────────
/**
 * 🔴 THE SAME BUTTONS, THE SAME HANDLERS, IN THE PANEL'S FOOTER. Every one of these was declared
 * inline under the open row and is unchanged here — same conditions, same POST actions, same
 * titles. They moved together and for one reason: the reading panel covers most of the history, so
 * a control left on the row would have been half behind it.
 * ⚠️ REPLY CLOSES THE PANEL FIRST, then calls the page's existing `onReply`. The composer is at the
 * top of the centre column, so leaving a panel over it would hide the thing the click just filled in.
 */
function EmailActions({ m, actions, now, linkedTruck, snoozeFor, setSnoozeFor, onClose, stepKind }: {
  m: TimelineMessage
  actions: TimelineActions
  now: Date
  linkedTruck: boolean
  snoozeFor: string | null
  setSnoozeFor: (id: string | null) => void
  onClose: () => void
  stepKind: string | null
}) {
  const inbound = m.direction === 'inbound'
  const waiting = needsAttention(m, { now, linkedTruck })
  /** 🔴 OUTBOUND, REAL, ACCEPTED, AND NO RUNG RECORDED FOR IT. `contact_id` is the link. */
  const unrecorded = !inbound && !m.is_test && m.status === 'sent' && !m.contact_id
  return (
    <>
      {/* 🔴 REPLY ON A SENT EMAIL TOO (v5). It existed only on received mail, so following up on my
          own email — with the prospect seeing it underneath, the way Outlook does it — meant leaving
          this page and using Outlook. The same handler, the same reply mode; what changes is which
          message it threads onto and, through the server, what the send is LOGGED as: answering
          somebody is a `reply`, following up on myself is the step the ladder is on.
          ⚠️ A TEST SEND IS STILL NOT REPLYABLE — it went to my own address. */}
      {!m.is_test && (m.status === 'received' || m.status === 'sent') && (
        <button type="button" onClick={() => { onClose(); actions.onReply(m) }}
          title={inbound
            ? 'Answer this message, with the conversation quoted underneath (R)'
            : 'Follow up on this email, with it quoted underneath — it threads onto the same conversation'}
          // ⚠️ NEUTRAL, NOT ORANGE. Reply opens the composer; it does not send anything. Orange on
          // this page means "this is about to leave the building".
          className="text-sm font-bold px-3 py-1.5 max-md:min-h-11 rounded-lg border border-slate-400 text-slate-800 bg-white hover:bg-slate-50">
          {inbound ? 'Reply' : 'Follow up on this'}
        </button>
      )}
      {waiting && (
        <>
          <button type="button" disabled={actions.busyId === m.id}
            onClick={() => void actions.onMessageAction('mark_handled', m.id)}
            title="Dealt with. It leaves Today; nothing is sent and nothing is logged."
            className="text-[12px] font-bold px-2 py-1 max-md:min-h-11 rounded-lg border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40">
            Mark done
          </button>
          <button type="button" onClick={() => setSnoozeFor(snoozeFor === m.id ? null : m.id)}
            className="text-[12px] font-bold px-2 py-1 max-md:min-h-11 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
            Snooze
          </button>
          {snoozeFor === m.id && SNOOZE_OPTIONS.map(o => (
            <button key={o} type="button" disabled={actions.busyId === m.id}
              onClick={() => { setSnoozeFor(null); void actions.onMessageAction('snooze', m.id, { option: o }) }}
              className="text-[12px] font-bold px-2 py-1 rounded-lg border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-40">
              {SNOOZE_LABELS[o]}
            </button>
          ))}
        </>
      )}
      {inbound && m.status === 'received' && !m.is_test && !waiting && (
        <button type="button" disabled={actions.busyId === m.id}
          onClick={() => void actions.onMessageAction('needs_reply', m.id)}
          title={m.snoozed_until ? `Snoozed until ${fmtDate(m.snoozed_until)}. This brings it back now.` : 'Put this reply back on the Today list.'}
          className="text-[12px] font-bold px-2 py-1 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40">
          Mark as needing reply
        </button>
      )}
      {/* ── 🔴 AN EMAIL SENT FROM OUTLOOK, GIVEN ITS STEP ────────────────────────────────────
          An email typed in Outlook reaches the mailbox and is imported, but it carries NO step: the
          poll logs it as a contact only when the prospect has already replied, and then only as
          `reply` (the sequence report's §0c). So the ladder does not move and the duplicate guard
          can only ask. This is the one click that says which step it was.
          ⚠️ IT REPLACES "log it", WHICH WAS THE SAME WRITE FOR A NARROWER CASE — a send the server
          accepted while the log write failed. Same route action, same single contact writer, same
          link to this message so it can never be counted twice; what is new is that it is offered
          for ANY unrecorded outbound email and that it names the step.
          🔴 NEVER AUTOMATIC, AND NEVER FOR A TEST SEND. */}
      {unrecorded && (
        stepKind ? (
          <button type="button" disabled={actions.busyId === m.id}
            onClick={() => void actions.onRecordStep(m.id, stepKind)}
            title="Records this email as that step, sets the follow-up it would have set, and links it to this message so it is never counted twice. It does NOT send anything."
            className="text-[12px] font-bold px-2 py-1 rounded-lg border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-40">
            Record as {STEP_LABELS[stepKind as keyof typeof STEP_LABELS] ?? stepKind}
          </button>
        ) : (
          // ⚠️ THE LADDER CANNOT SAY WHICH STEP THIS WAS — it is stopped, or the history is
          // unreadable — so it asks instead of guessing.
          <>
            <span className="text-[11px] text-slate-500">Record as</span>
            {CONTACT_KINDS.map(k => (
              <button key={k} type="button" disabled={actions.busyId === m.id}
                onClick={() => void actions.onRecordStep(m.id, k)}
                className="text-[11px] font-bold px-2 py-1 rounded-lg border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-40">
                {STEP_LABELS[k]}
              </button>
            ))}
          </>
        )
      )}
      {m.status === 'sent' && !m.is_test && m.sent_copy === 'absent' && (
        <button type="button" disabled={actions.busyId === m.id}
          onClick={() => void actions.onMessageAction('save_to_sent', m.id)}
          title="Files a copy of this email in your Sent folder. It does NOT send anything."
          className="text-[12px] font-bold px-2 py-1 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">
          Save to Sent
        </button>
      )}
      {(m.status === 'failed' || m.status === 'uncertain') && (
        <button type="button" disabled={actions.busyId === m.id}
          onClick={() => void actions.onMessageAction('retry', m.id, { confirm_uncertain: m.status === 'uncertain' })}
          title={m.status === 'uncertain'
            ? 'This may already have been delivered. Check your Sent folder first — a retry could be the second copy the prospect receives.'
            : 'The server refused this one, so nothing reached the prospect. Sends it again with the same Message-ID.'}
          className="text-[12px] font-bold px-2 py-1 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">
          {m.status === 'uncertain' ? 'Retry anyway' : 'Retry'}
        </button>
      )}
      {/* ⚠️ THE PROVENANCE, WHERE THE ROW USED TO CARRY IT. "imported", "from Outlook", "no copy in
          Sent" — facts you want while looking AT an email and noise on a line you are scanning past. */}
      <span className="ml-auto text-[11px] text-slate-400">
        {m.source === 'mailbox_import' && 'imported'}
        {m.source === 'poll' && m.direction === 'outbound' && 'from Outlook'}
        {m.sent_copy === 'absent' && m.status === 'sent' && !m.is_test && ' · no copy in Sent'}
      </span>
    </>
  )
}
