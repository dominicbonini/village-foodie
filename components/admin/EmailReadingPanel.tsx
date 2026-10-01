// components/admin/EmailReadingPanel.tsx
//
// THE READING PANEL — one email, read properly, without leaving the page.
//
// 🔴 WHY IT EXISTS. An email opened inside the history began a few lines above the bottom of the
// page and was read through a slot four or five lines tall, because the history is the last block
// of the centre column. The panel comes in from the right at full height with its own scroll, sits
// over the right column and part of the centre, and leaves the LEFT column visible — who this is,
// their number, and the notes — which is what you are usually reading the email against.
//
// 🔴 WHAT IT IS NOT. It is not a second email viewer: the body is the same `EmailBody`, which is
// the one place mailbox HTML is rendered and it renders it in `EMAIL_FRAME_SANDBOX` — that token,
// unchanged, and no scripts. It is not a second store: everything here comes from the timeline
// payload the page already holds.
//
// ⚠️ A HALF-WRITTEN EMAIL IS NEVER LOST. Opening, stepping and closing this panel touch nothing
// but which id is open; the composer keeps its own state and is not unmounted. Reply is the ONE
// control that changes the composer, it is the SAME `onReply` the row had, and it closes the panel
// first so the thing it just filled in is on screen.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { handTextIsRedundant, messageRowLabel, type TimelineMessage, type TimelineContact } from '@/lib/outreach-timeline'
import { RowLabelCell } from '@/components/admin/outreach-icons'
import { EmailBody } from '@/components/admin/outreach-shared'
import { readingPanelWidth, stepEmailId, TWO_COL_AT_PX } from '@/lib/outreach-workspace'

/** "11 Sep 2026, 13:07" — the same shape the compose window uses for a threaded date. */
function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d)
}

export default function EmailReadingPanel({
  message, ids, onOpen, onClose, footer, handLogged, prospectEmail, onOpenFull,
}: {
  message: TimelineMessage
  /** Every email on screen, newest first — the order ‹ › and ↑/↓ step through. */
  ids: readonly string[]
  onOpen: (id: string) => void
  onClose: () => void
  /**
   * 🔴 THE BUTTONS ARE THE TIMELINE'S, RENDERED HERE. Reply, Mark done, Snooze, Retry and the rest
   * stay declared where they have always been declared — beside the actions they call — and this
   * component only decides where they sit. It is also why they all moved together: with the panel
   * open, a 55vw sheet covers most of the history, so a control left on the row underneath would be
   * half behind it.
   */
  footer?: React.ReactNode
  /** The hand-logged contact this email was paired with, if any. */
  handLogged: TimelineContact | null
  prospectEmail: string | null
  onOpenFull?: (html: string, subject: string | null) => void
}) {
  const [vw, setVw] = useState(1440)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const phone = vw < TWO_COL_AT_PX
  const width = readingPanelWidth(vw)

  /* ⚠️ "BELOW THE PAGE HEADER" IS A MEASUREMENT, NOT A CONSTANT. The workspace header scrolls with
   * the page, so the gap above the panel is the header's own bottom edge — clamped at 0 once it has
   * scrolled away. Read on scroll and on resize, through rAF, so it costs one layout read a frame
   * at most and none while nothing moves. */
  const [headerBottom, setHeaderBottom] = useState(0)
  // ⚠️ DERIVED, NOT STORED. A phone's sheet starts at 0 whatever the header is doing; writing that
  // into state from the effect would be a setState in an effect body for a value already known here.
  const top = phone ? 0 : headerBottom
  useEffect(() => {
    if (phone) return
    let frame = 0
    const measure = () => {
      frame = 0
      const el = document.getElementById(PAGE_HEADER_ID)
      setHeaderBottom(Math.max(0, Math.round(el?.getBoundingClientRect().bottom ?? 0)))
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    // ⚠️ THE FIRST MEASUREMENT IS A FRAME AWAY, not synchronous: reading layout and setting state in
    // the effect body is the cascading-render pattern this repo lints against, and one frame of the
    // panel at top 0 is invisible next to the slide-in.
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [phone])

  /**
   * The body as text, once it has loaded — what the hand-log comparison is made against.
   * ⚠️ KEYED BY THE MESSAGE ID RATHER THAN RESET IN AN EFFECT. Stepping to another email must not
   * compare it against the last one's words, and an effect that calls setState to clear them is the
   * cascading-render pattern this repo lints against. A value that belongs to another message is
   * simply not this message's value.
   */
  const [loaded, setLoaded] = useState<{ id: string; text: string | null } | null>(null)
  const emailText = loaded?.id === message.id ? loaded.text : null
  const [handOpenFor, setHandOpenFor] = useState<string | null>(null)
  const showHand = handOpenFor === message.id

  const prev = useMemo(() => stepEmailId(ids, message.id, -1), [ids, message.id])
  const next = useMemo(() => stepEmailId(ids, message.id, 1), [ids, message.id])

  /* 🔴 ↑/↓ STEP, AND ESC IS THE PAGE'S. The page already closes the open row on Escape — one
   * closer, not two that can disagree. ⚠️ The handler reads the LATEST prev/next through a ref, so
   * the window listener is registered once rather than re-registered on every step. */
  const latest = useRef({ prev, next, onOpen })
  useEffect(() => { latest.current = { prev, next, onOpen } })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      // ⚠️ NOT WHILE TYPING. The composer is still on the page behind this panel.
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return
      const L = latest.current
      if (e.key === 'ArrowUp' && L.prev) { e.preventDefault(); L.onOpen(L.prev) }
      else if (e.key === 'ArrowDown' && L.next) { e.preventDefault(); L.onOpen(L.next) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const inbound = message.direction === 'inbound'
  const close = useCallback(() => {
    onClose()
    // ⚠️ FOCUS GOES BACK TO THE ROW IT CAME FROM, which is where the eye already is and where the
    // next Tab should continue from. The row carries `tl-<id>`; the same id the Files card scrolls to.
    window.setTimeout(() => document.getElementById(`tl-${message.id}`)?.focus(), 0)
  }, [onClose, message.id])

  const body = (
    <aside
      role="dialog" aria-modal={phone ? true : undefined} aria-label={message.subject ?? 'Email'}
      className="fixed right-0 bg-white border-l border-slate-200 shadow-2xl flex flex-col"
      style={{ top, bottom: 0, width, zIndex: 80 }}>
      {/* ── HEADER: WHICH EMAIL THIS IS, AND HOW TO LEAVE IT ────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-200 px-4 py-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {/* 🔴 THE SAME ICON AND THE SAME WORD AS THE ROW IT WAS OPENED FROM, from the same
              function. It was a green "RECEIVED" here and a `↙` there — two vocabularies for one
              fact, on two screens you move between with one click. */}
          <RowLabelCell label={messageRowLabel(message.direction)} />
          <span className="text-[11px] text-slate-500">{fmtWhen(message.message_date ?? message.created_at)}</span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" disabled={!prev} onClick={() => prev && onOpen(prev)}
              title="The email above this one (↑)"
              className="text-sm font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 max-md:min-h-11 max-md:min-w-11">‹</button>
            <button type="button" disabled={!next} onClick={() => next && onOpen(next)}
              title="The email below this one (↓)"
              className="text-sm font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 max-md:min-h-11 max-md:min-w-11">›</button>
            <button type="button" onClick={close}
              title="Close (Esc)"
              className="text-sm font-bold px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 max-md:min-h-11 max-md:min-w-11">
              {phone ? '← Back' : '×'}
            </button>
          </div>
        </div>
        <p className="text-sm font-bold text-slate-900 break-words">{message.subject ?? '(no subject)'}</p>
        <p className="text-[11px] text-slate-500 break-words">
          <span className="font-semibold">From</span> {message.from_address ?? (inbound ? prospectEmail ?? '—' : 'your mailbox')}
          {' · '}
          <span className="font-semibold">To</span> {inbound ? 'your mailbox' : prospectEmail ?? '—'}
        </p>
      </div>

      {/* ── THE EMAIL ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-1.5">
        {/* ── 🔴 THE HAND LOG IS A MARKER, NOT A SECOND COPY OF THE EMAIL ──────────────────────
            It was a grey block above the body carrying, in the Between Buns case, the ENTIRE email
            as plain text — so the panel showed the same words twice, the worse copy first. A hand
            log is usually the email pasted in; the default is now to say that it happened and stop.
            ⚠️ WHEN IT ADDS SOMETHING, IT IS STILL REACHABLE — one click, collapsed, below the line
            rather than above the email. `handTextIsRedundant` decides, and it answers FALSE while
            the body is still loading, so the only failure it can make is one extra link. */}
        {/* ── 🔴 A SEND THAT WAVED A GUARD THROUGH, ON THE EMAIL IT IS ABOUT ─────────────────
            This used to be a `note` in the history reading "Sent anyway: [already_sent] …". It is a
            fact about ONE EMAIL, and as a note it sat in the timeline as though a person had typed
            it — editable and deletable like prose, and saying nothing about which email it meant.
            🔴 THE STORED SENTENCES, NOT RE-DERIVED ONES: a guard's wording can change, and what
            belongs in a record of a decision is the words the decision was made on.
            ⚠️ ONE GREY LINE, IN THE PANEL ONLY. Nothing in the history list — a warning waved
            through is context for the email, not an event in the conversation. */}
        {(message.guard_override?.length ?? 0) > 0 && (
          <p className="text-[11px] text-slate-500">
            Sent after a warning: {message.guard_override!.map(g => g.message).join(' ')}
          </p>
        )}
        {/* 🔴 "Also logged by hand · 18 Sep" IS GONE (polish). It announced a de-duplication nobody
            had asked about: the pairing is display-only and its whole point is that one thing that
            happened is one row, so naming the mechanism made the mechanism the subject. WHAT
            SURVIVES IS THE ONLY PART THAT CARRIES INFORMATION — a note logged ALONGSIDE the email
            that says something the email does not, behind one click, closed. When the note is just
            the email pasted in (`handTextIsRedundant`), nothing is shown at all. */}
        {handLogged && !handTextIsRedundant(handLogged.message, emailText) && (
          <div className="text-[11px] text-slate-500">
            <button type="button" onClick={() => setHandOpenFor(showHand ? null : message.id)}
              className="font-semibold text-slate-600 underline hover:no-underline">
              {showHand ? 'Note logged with this email ▾' : 'Note logged with this email ▸'}
            </button>
            {showHand && (
              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-slate-600">
                {handLogged.message?.trim() || 'no message was recorded'}
              </p>
            )}
          </div>
        )}
        {/* 🔴 THE SAME VIEWER, KEYED BY ID so stepping to another email refetches rather than
            showing the last one's body while the new one loads. `hideMeta` because the panel header
            above already says who it is from and what it is about. */}
        <EmailBody key={message.id} rowId={message.id} hideMeta onOpenFull={onOpenFull}
          onText={t => setLoaded({ id: message.id, text: t })} />
      </div>

      {/* ── WHAT CAN BE DONE WITH IT ────────────────────────────────────────────────────────── */}
      {footer && (
        <div className="shrink-0 border-t border-slate-200 px-4 py-2 flex flex-wrap items-center gap-1">
          {footer}
        </div>
      )}
    </aside>
  )

  // 🔴 A PORTAL, so no ancestor's `overflow` or stacking context can clip a `position: fixed` panel.
  return typeof document === 'undefined' ? null : createPortal(body, document.body)
}

/** The workspace header's id — the panel measures its bottom edge to know where "below" is. */
export const PAGE_HEADER_ID = 'hg-page-header'
