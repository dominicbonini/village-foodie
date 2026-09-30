// components/admin/outreach-shared.tsx — the pieces the prospect PAGE and the outreach LIST both use.
//
// 🔴 WHY THIS FILE EXISTS (30 September 2026). The prospect view was a modal inside
// `components/admin/OutreachPanel.tsx`, so everything it rendered could be a private function in that
// file. It is a full page now — `app/admin/outreach/p/[prospectId]` — and a page cannot import a
// private function out of a component file. Two copies of the email viewer, the attachment list or
// the contact popout would be exactly the drift this codebase keeps a written record of, so the
// shared pieces moved HERE and both surfaces import them.
//
// ⚠️ NOTHING IN THIS FILE CHANGED IN THE MOVE. Every component below is byte-for-byte what it was
// inside the panel, including its comments — the reasoning behind a sandboxed iframe or a portalled
// popout did not become less true for being in a different file. Where a rule IS new, it says so.
//
// ⚠️ WHAT IS **NOT** HERE: the table's own cells (`Row`, `MediaCell`), the filter bar, and everything
// else only the list uses. This is the shared set, not a junk drawer.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nativeAuthHeader } from '@/lib/native/session'
import { tidyNoteText, noteFirstLine } from '@/lib/outreach-timeline'
import type { TimelineMessage, TimelineContact, TimelineEvent } from '@/lib/outreach-timeline'

/** What `/api/admin/outreach/timeline` returns. Typed here so no caller invents a field name —
 *  the lesson `lib/outreach-mail-import-result.ts` records at length. */
export interface TimelinePayload {
  ok: boolean
  migrationApplied: boolean
  messages: TimelineMessage[]
  contacts: TimelineContact[]
  events: TimelineEvent[]
}
import { formatImageUrl } from '@/lib/image-utils'
import { kindLabel, channelLabel, directionLabel, type OutreachStage } from '@/lib/outreach'
import { splitQuotedHtml } from '@/lib/outreach-quote-split'
import { EMAIL_FRAME_SANDBOX, FRAME_MIN_PX, FRAME_MAX_FRACTION, frameHeight } from '@/lib/outreach-workspace'
import { safeHref } from '@/lib/safe-href'
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'

/** 🔴 RESOLUTION GOES THROUGH THE SHARED HELPER, NOT A LOCAL COPY. `logo_url` / `photo_url` hold TWO
 *  shapes — an absolute `truck-media` URL and a leading-slash `/logos/…` static path — and
 *  `formatImageUrl` passes both through untouched. App manual §51.7 records what a fourth private
 *  copy of image resolution cost last time. */
export const mediaSrc = (u: string | null, folder: 'logos' | 'photos'): string | null =>
  formatImageUrl(u, folder) || null

export type Contact = {
  id: string; contacted_at: string; channel: string | null; direction: string | null
  kind: string | null; message: string | null
  /** 🔴 The `outreach_messages` row this contact was logged FROM, when there is one. Set by the list
   *  route from `outreach_messages.contact_id`; null for a call, a WhatsApp or a hand-logged contact. */
  email_message_id?: string | null
  /** Insert time. The ONLY thing that separates two contacts logged on the same day — see HistoryTable. */
  created_at: string
}

export type Prospect = {
  id: string; discovery_truck_id: string; name: string
  /** The NEWEST live demo built for this prospect (/api/admin/outreach), or null when there is none —
   *  and null too when the demo_sessions migration is not applied yet (the route degrades rather than
   *  500ing the page). `liveCount` > 1 means older live demos exist behind this one. */
  demo?: {
    publicRef: string | null; expiresAt: string | null; createdAt: string | null; liveCount: number
    /** The truck the demo runs as. Present ⇒ it can be REBUILT over itself with new kitchen settings;
     *  a demo cannot be un-created. Already returned by /api/admin/outreach — nothing was added there. */
    truckId?: string | null
  } | null
  logo_url: string | null; photo_url: string | null
  // 🔴 OPTION A — WHOSE LOGO THIS ACTUALLY IS. `logo_url` above is now the AUTHORITATIVE value the route
  // resolved (trucks.logo_storage_path for a linked prospect, discovery_trucks.logo_url otherwise), so the
  // cell renders one candidate and never has to choose. These three say what a WRITE would touch.
  logo_target?: 'truck' | 'demo' | 'prospect'
  logo_truck_name?: string | null
  /** True when a write would change a live truck's order page, confirmation email and QR poster. */
  logo_needs_confirm?: boolean
  /** 🔴 LEGACY AND UNREAD. Kept on the type because the route still returns it for one release — see
   *  the note in app/api/admin/outreach/route.ts. The two fields below are what the form and the
   *  template substitution use. */
  contact_name: string | null
  contact_first_name: string | null; contact_last_name: string | null
  do_not_contact: boolean | null; entity_type: string | null
  /** 🔴 Derived by the list route: this prospect has an outbound email the mail system bounced. */
  emailBounced?: boolean
  contact_email: string | null; phone: string | null; mobile: string | null
  website: string | null; schedule_url: string | null
  order_url: string | null; excluded: boolean
  /** discovery_trucks.show_on_vf — NOT NULL DEFAULT true. Part of the lead-type derivation. */
  show_on_vf: boolean
  /** discovery_trucks.hatchgrab_truck_id — non-null ⇒ converted; the queue stops chasing. */
  hatchgrab_truck_id: string | null
  /** 🔴 outreach_prospects.lead_type_at_first_contact — the FROZEN lead type, or null.
   *  Null (including while the migration is unapplied) ⇒ derive live. See effectiveLeadType. */
  lead_type_at_first_contact: string | null
  stage: OutreachStage; platform: string | null
  // 🔴 TRI-STATE: true = yes, false = checked-and-absent, null = nobody checked. NULL ≠ false.
  hu_map: boolean | null; hu_ordering: boolean | null
  whatsapp_number: string | null; whatsapp_confirmed: boolean | null
  next_action_at: string | null; notes: string | null
  futureEventCount: number; lastEventDate: string | null
  // 🔴 THE *NEXT* EVENT, not the last. Derived server-side in the same bulk read that builds
  // futureEventCount — no extra query, and none per row. Used by the conditional template lines.
  nextEventDate: string | null; nextEventVenue: string | null
  outboundCount: number; lastContactedAt: string | null
  whatsappHint: 'advertises' | 'mobile_not_advertised' | 'none'   // scraped, read-only — the live-button derivation
  contacts: Contact[]
}

// item 2: DISPLAY labels for the stage. Stored values are unchanged; only not_interested reads
// differently ("no sale"). contacted and replied stay distinct (not collapsed).
export const STATUS_LABEL: Record<string, string> = {
  not_contacted: 'not contacted',
  contacted: 'contacted',
  replied: 'replied',
  signed: 'signed',
  not_interested: 'no sale',
}

export const fmtDate = (d: string | null) => {
  if (!d) return null
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00Z' : d)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// 🔴 RESOLUTION GOES THROUGH THE SHARED HELPER, NOT A LOCAL COPY. `logo_url` / `photo_url` hold TWO
// shapes: an absolute `truck-media` URL (what an upload here writes) and a leading-slash `/logos/…` path
// (a STATIC FILE in public/, shipped with the deploy — a running function cannot write one). Both are
// valid <img src> values and `formatImageUrl` passes both through untouched.
// ⚠️ THIS REPLACES A LOCAL `logoSrc` THAT DID THE SAME JOB SLIGHTLY DIFFERENTLY. App manual §51.7 records
// a "reuse" that was really a fourth independent implementation; a second private copy of image
// resolution in this file is the same mistake one size down, so the duplicate is gone.
// ── MEDIA UPLOAD ──────────────────────────────────────────────────────────────────────────────────
// 🔴 NO OPTIMISTIC UPDATE HERE, DELIBERATELY, and this is the opposite choice to patchProspect above.
// patchProspect writes a value the client already knows; an upload's result is a URL only the SERVER
// can produce, and the row must not show an image until the column actually holds one. Showing it
// early would make a failed DB write look like a success — the precise failure this flow guards.
// The row is patched ONLY from the URL the server returns, after it has written the column.
// ⚠️ Throws on failure so the cell can render the message; the cell owns that display, not a toast,
// because the failure belongs to one slot.
// 🔴 THE GUSTO CONFIRMATION. Returns the truck name to echo back, or null to proceed, or false to
// abandon. The SERVER demands the name too — this is the sentence a person reads, not the enforcement.
export function confirmLogoWrite(p: Prospect, verb: string): string | null | false {
  if (!p.logo_needs_confirm) return null
  const name = (p.logo_truck_name ?? p.name ?? 'this truck').trim()
  const ok = window.confirm(
    [
      `${verb} the logo for ${name}?`,
      '',
      `${name} is a LIVE HatchGrab truck. This changes what its customers see:`,
      'its order page, its order confirmation email and its QR poster.',
      '',
      'Press OK to continue.',
    ].join('\n'))
  return ok ? name : false
}

export function TriStateBox({ value, onSet, label }: {
  value: boolean | null
  onSet: (v: boolean | null) => void
  label: string
}) {
  const isTrue = value === true
  const isFalse = value === false
  const title = isTrue ? `${label}: yes` : isFalse ? `${label}: checked, absent (false)` : `${label}: not checked`
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer" title={title}>
      <input type="checkbox" checked={isTrue} className="w-4 h-4 accent-orange-600"
        // ticked → true; unticked → null (NEVER false)
        onChange={e => onSet(e.target.checked ? true : null)} />
      {isFalse && <span className="text-[11px] font-semibold text-rose-600" title={`${label}: checked, absent`}>✗</span>}
    </label>
  )
}

// ── WHATSAPP BOX (step E, item 1) — MY confirmation, TWO states only ──────────────────────────────────
// 🔴 WRITES outreach_prospects.whatsapp_confirmed ONLY — never a new field, never the scraped hint. The
// former amber "?" suggested state is REMOVED (item 1): rows the scraper marked 'advertises' were set
// true in a one-off backfill, so a scraped WhatsApp now shows as a plain tick. Two states:
//   • ticked (whatsapp_confirmed === true) · empty (NULL, not confirmed).
// Ticking → true. Unticking → null (the column is nullable). No false is ever written from here.
export function WhatsAppBox({ p, onPatch }: {
  p: Prospect
  onPatch: (id: string, patch: Record<string, unknown>) => void
}) {
  const confirmed = p.whatsapp_confirmed === true
  return (
    <label className="inline-flex items-center justify-center cursor-pointer"
      title={confirmed ? 'WhatsApp confirmed' : 'WhatsApp: not confirmed'}>
      <input type="checkbox" checked={confirmed} className="w-4 h-4 accent-orange-600"
        onChange={e => onPatch(p.id, { whatsapp_confirmed: e.target.checked ? true : null })} />
    </label>
  )
}

export function DoNotContactToggle({ p, enabled, onPatch }: {
  p: Prospect
  enabled: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
}) {
  const on = p.do_not_contact === true
  return (
    <label className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer border
      ${on ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-600'}
      ${enabled ? '' : 'opacity-60 cursor-not-allowed'}`}
      title={enabled ? undefined : 'Apply the do_not_contact migration to enable'}>
      <input type="checkbox" checked={on} disabled={!enabled} className="w-4 h-4 accent-red-600"
        onChange={e => onPatch(p.id, { do_not_contact: e.target.checked ? true : null })} />
      🚫 Do not contact{on ? ' — set' : ''}
    </label>
  )
}

// ── ONE MEDIA SLOT (logo or photo) ───────────────────────────────────────────────────────────────────
// 🔴 THREE STATES, AND CONFLATING ANY TWO OF THEM IS THE BUG THIS COMPONENT EXISTS TO AVOID:
//
//   1. PRESENT  — a value that loads. A thumbnail. Not a drop target (replacing is out of scope).
//   2. EMPTY    — the column is NULL. A dashed drop target reading "+". This is the ONLY droppable state.
//   3. BROKEN   — a value is stored but does NOT load (a 404). 🔴 NOT a drop target, and visually
//                 distinct from EMPTY: an amber ⚠ on a solid border, never a dashed "+".
//
// ⚠️ WHY 3 MUST NOT LOOK LIKE 2. A resolved image and a 404 both render as an empty box in a browser, so
// a naive cell would show a broken value as an inviting empty slot — and dropping on it would look like
// filling a gap while actually being a REPLACE, which is out of scope and which the server refuses (409).
// The operator would see a rejection they could not explain. `Chai Stall`'s photo_url is a live instance:
// a `/photos/…` path with no file behind it. It is NOT fixed here — out of scope, flagged separately.
//
// 🔴 BROKENNESS IS DETECTED, NOT ASSUMED. There is no way to know from the string whether it resolves, so
// the <img> reports it via onError. State 3 is therefore reachable only after a real load failure.
/**
 * 🔴 THE THUMBNAIL ERROR LATCH, IN ONE PLACE FOR BOTH THUMBS (round 3, 16 September 2026).
 *
 * ── THE DEFECT IT FIXES ─────────────────────────────────────────────────────────────────────────────
 * Both thumbs latched `broken` on `<img onError>` and reset it with `useEffect(…, [value])` — i.e. ONLY
 * when the URL string CHANGED. `load()` re-reads the list route, which for an unchanged row returns the
 * IDENTICAL string, so refreshing the data could never clear the latch. One transient image failure
 * therefore hid a logo until the page was RELOADED, which remounts the component. 🧪 Reproduced in
 * scripts/outreach-logo-latch.cjs, whose control proved the latch is the mechanism.
 *
 * ── WHAT IS DELIBERATELY KEPT ───────────────────────────────────────────────────────────────────────
 * 🔴 THE LATCH ITSELF. After a real failure the ⚠ marker still shows — never an inviting empty slot,
 * which is the behaviour the surrounding comments were written to protect. A value that fails AGAIN
 * after a refresh latches again, and shows ⚠ again.
 * 🔴 AT MOST ONE FRESH ATTEMPT PER REFRESH, so this cannot become a retry loop: `refreshNonce` only
 * changes when `load()` SUCCEEDS, and nothing here schedules a retry of its own.
 *
 * ⚠️ NO CACHE-BUSTER. The `src` is untouched — no query parameter is appended. Clearing the flag lets
 * React render the <img> again; whether the browser re-requests it is the browser's business.
 *
 * @param refreshNonce bumped by `load()` on success. Its VALUE is meaningless; only that it changes.
 */
export function useThumbLatch(input: {
  value: string | null
  src: string | null
  refreshNonce: number
  kind: string
  name: string
}): { broken: boolean; onError: () => void } {
  const { value, src, refreshNonce, kind, name } = input
  const [broken, setBroken] = useState(false)
  // 🔴 `refreshNonce` IS THE SECOND DEPENDENCY AND IT IS THE ENTIRE FIX. `value` alone could not clear a
  // latch for a row whose URL had not changed — which is every row a refresh returns.
  useEffect(() => { setBroken(false) }, [value, refreshNonce])
  const onError = useCallback(() => {
    setBroken(true)
    // 🔴 ONE LINE, SO THE ORIGINAL TRANSIENT FAILURE CAN BE SEEN IN SAFARI'S CONSOLE. Until now the
    // failure left no trace at all: the symptom was reported as "the logo vanished", with nothing to say
    // whether the request 404'd, timed out or was blocked. Prefix, kind, name, the exact src, and an ISO
    // timestamp — and nothing else is logged anywhere in this path.
    console.warn(`[outreach-thumb] ${kind} failed to load for ${name} — src=${src ?? ''} at ${new Date().toISOString()}`)
  }, [kind, name, src])
  return { broken, onError }
}

/** The host-derived label. Falls back to `fallback` for anything that is not a known social host. */
export function linkLabel(raw: string | null | undefined, fallback: string): string {
  const href = safeHref(raw)
  if (!href) return fallback
  let host = ''
  try { host = new URL(href).hostname.replace(/^www\./, '').toLowerCase() } catch { return fallback }
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com') return 'Facebook'
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram'
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'X'
  return fallback
}

export const linkCls = 'text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-orange-600 font-semibold whitespace-nowrap'

// ── ONE HEADER THUMBNAIL — three states, clickable to full size ──────────────────────────────────────
// 🔴 MISSING AND BROKEN ARE DIFFERENT THINGS AND LOOK DIFFERENT. A null column is an empty labelled box
// ("no logo"); a value that 404s is an amber ⚠ that names the failure. `Chai Stall` proves the column can
// hold a path with no file behind it, and rendering that as "empty" would say the data is missing when it
// is actually wrong — a different problem with a different fix.
// ⚠️ Detected, not assumed: nothing in the string says whether it resolves, so <img onError> decides.
// ── THE DELETE CONFIRMATION ─────────────────────────────────────────────────────────────────────────
// 🔴 MOVED, NOT COPIED. This dialog now lives in components/admin/ConfirmDeleteDialog.tsx so the events
// table uses the SAME one rather than a second implementation. Behaviour here is unchanged: same focus,
// same capture-phase Escape, same backdrop-cancels, same in-place error, same rendered markup. The only
// difference is that the title/label/sentence now arrive as props instead of being derived from `kind`.
export function ModalThumb({ value, folder, label, onRequestDelete, refreshNonce, name }: {
  value: string | null
  folder: 'logos' | 'photos'
  label: string
  onRequestDelete: () => void
  /** Bumped by load() on success. Only that it CHANGES matters — see useThumbLatch. */
  refreshNonce: number
  /** The prospect's name, for the [outreach-thumb] warning only. */
  name: string
}) {
  const src = mediaSrc(value, folder)
  // 🔴 THE SAME SHARED LATCH THE ROW THUMB USES — one implementation, not two copies that must agree.
  const { broken, onError: onThumbError } = useThumbLatch({ value, src, refreshNonce, kind: label, name })
  const box = 'w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center text-[9px] text-center leading-tight'

  // ⚠️ The badge now only ASKS. The confirmation, the busy state and the error all moved to the dialog,
  // which is why this component no longer carries any of them.
  const removeBadge = (
    <button onClick={e => { e.preventDefault(); e.stopPropagation(); onRequestDelete() }}
      title={`Remove this ${label}`} aria-label={`Remove this ${label}`}
      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-400 text-[9px] leading-none flex items-center justify-center shadow-sm">✕</button>
  )

  if (src && !broken) {
    return (
      <span className="relative flex-shrink-0 inline-flex">
        <a href={src} target="_blank" rel="noreferrer" title={`Open full-size ${label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} onError={onThumbError}
            className={`${box} ${folder === 'logos' ? 'object-contain p-0.5' : 'object-cover'} border border-slate-200 bg-white hover:ring-2 hover:ring-orange-400`} />
        </a>
        {removeBadge}
      </span>
    )
  }
  if (src && broken) {
    return (
      <span className="relative flex-shrink-0 inline-flex">
        <span className={`${box} border border-amber-300 bg-amber-50 text-amber-700 cursor-help`}
          title={`${label}: stored value does not load — ${value}`}>⚠ broken</span>
        {removeBadge}
      </span>
    )
  }
  // Empty: nothing to remove, so no badge. Filling it is done by dropping on the table cell.
  return (
    <span className={`${box} border border-dashed border-slate-300 bg-slate-50 text-slate-400`}
      title={`No ${label} stored`}>no {label}</span>
  )
}

/* 🔴 `INBOUND_BG` WAS HERE AND IS GONE. A green row background said "this one came in" — a colour
 * doing the work of a word, which a greyscale print, a colour-blind reader and a phone in sunlight
 * all lose. Every surface says it with `RowLabelCell` now: an icon, and the word "Received" as a
 * pill in bold dark text. */

/** 🔴 THE FULL MESSAGE, IN A POPOUT — NOT EXPANDED IN PLACE.
 *  This replaces the click-to-expand accordion. The reason is the left column: it measures 491px at
 *  1440px and it SHRINKS, so an email body rendered inside a row turned the four-column table straight
 *  back into the wall of prose that the table was built to replace, and pushed every later row out of
 *  view. A popout gets the full window width and leaves the table's geometry untouched.
 *  Escape closes THIS and nothing else: capture phase + stopPropagation beats the prospect modal's
 *  bubble-phase window listener regardless of registration order. Same rule as ScheduleEventsPopup. */
/**
 * One email, inline — the same `view` action and the same sandboxed frame the Emails list uses.
 *
 * 🔴 SHARED WITH `EmailViewer`, NOT A SECOND IMPLEMENTATION OF IT. Both ask the route for the row and
 * both render the body in `sandbox=""`: the markup came out of a mailbox, so it is sender-controlled,
 * and injected into the admin page it would run behind an authenticated admin session.
 * ⚠️ FETCHED WHEN IT IS OPENED, not with the list. Most contact rows are never opened, and an IMAP
 * read per row of history would be absurd.
 */
/**
 * The attachment line under a viewed email.
 *
 * 🔴 TWO KINDS OF ATTACHMENT, AND THEY BEHAVE DIFFERENTLY ON PURPOSE:
 *   OURS (a `storagePath`) — a file we sent, sitting in our own private bucket. It opens through a
 *   signed URL that lives five minutes, requested per click so nothing long-lived is ever rendered
 *   into the page.
 *   THEIRS (no path) — a name read off an inbound message's structure. The file was never
 *   downloaded and never will be by this app; "listed only" is the whole truth about it.
 * ⚠️ NO PUBLIC URL IS EVER PRODUCED. The bucket is private and the link is signed and short-lived.
 */
export function AttachmentList({ attachments, prospectId }: {
  attachments: { filename: string | null; contentType: string; size: number | null; storagePath?: string }[]
  prospectId: string | null
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const open = async (path: string) => {
    if (!prospectId) return
    setBusy(path); setError(null)
    try {
      const r = await fetch('/api/admin/outreach/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'signed_download', path, prospect_id: prospectId }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (j.ok === true && typeof j.url === 'string') window.open(j.url, '_blank', 'noopener,noreferrer')
      else setError(String(j.refusal ?? 'That file could not be opened.'))
    } catch { setError('That file could not be opened — check the connection.') }
    finally { setBusy(null) }
  }

  return (
    <>
      {attachments.map((a, i) => (
        <span key={`${a.filename ?? 'file'}-${i}`}>
          {i > 0 && ', '}
          <span>{a.filename ?? '(unnamed)'}</span>
          {a.size != null && <span className="text-slate-400"> ({Math.round(a.size / 1024)} KB)</span>}
          {a.storagePath && prospectId && (
            <button type="button" onClick={() => void open(a.storagePath!)} disabled={busy === a.storagePath}
              title="Opens the file we sent, through a link that expires in five minutes."
              className="ml-1 text-[11px] font-bold text-orange-700 underline hover:text-orange-800 disabled:opacity-40">
              {busy === a.storagePath ? '…' : 'Download'}
            </button>
          )}
        </span>
      ))}
      {!attachments.some(a => a.storagePath) && (
        <span className="text-slate-400"> — listed only, not downloaded</span>
      )}
      {error && <span className="text-red-700"> {error}</span>}
    </>
  )
}

/**
 * One email, at full length.
 *
 * 🔴 THE FRAME IS SIZED TO ITS CONTENT, NOT TO A BOX. It was `h-80` — 320px — so a three-line reply
 * wasted two thirds of it and a real email scrolled inside a letterbox while the page below sat
 * empty. The frame now reports its own document height and is set to it, capped at 80% of the
 * window (`frameHeight`), above which it scrolls internally rather than pushing the row it belongs
 * to off the screen.
 *
 * 🔴 `sandbox="allow-same-origin"` AND THAT TOKEN ALONE. Measuring means reading
 * `document.body.scrollHeight` inside the frame, which a frame with an opaque origin cannot expose.
 * `allow-same-origin` gives it our origin back and nothing else: there is NO `allow-scripts`, so
 * nothing in the document can run, and a document that cannot run code cannot use an origin. The
 * two are only dangerous together — that pair lets a frame remove its own sandbox — which is why
 * the value is a constant in `lib/outreach-workspace.ts` with a test standing on it.
 * ⚠️ AND NO `allow-forms` OR `allow-popups`: a quoted email can carry a form, and an email we are
 * only reading has no business submitting or opening anything.
 *
 * 🔴 THE NEW PART FIRST. `splitQuotedHtml` finds where the reply ends and the quoted thread begins,
 * best-effort; no split point found means the whole email is shown, because hiding something a
 * prospect wrote is the one failure worth avoiding here.
 */
export function EmailBody({ rowId, onOpenFull, hideMeta, onText }: {
  rowId: string
  onOpenFull?: (html: string, subject: string | null) => void
  /** ⚠️ THE BODY AS TEXT, ONCE IT HAS LOADED — so a caller can compare it against something else
   *  (the reading panel asks whether a hand-logged note is just a copy of this). Display only. */
  onText?: (text: string | null) => void
  /** ⚠️ The reading panel's header already carries From and Subject; two copies of one fact is
   *  two places for it to be wrong. The attachments and the quoted toggle stay either way. */
  hideMeta?: boolean
}) {
  const [data, setData] = useState<ViewedEmail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showQuoted, setShowQuoted] = useState(false)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const h = await nativeAuthHeader()
        const r = await fetch('/api/admin/outreach/mail-send', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'view', message_row_id: rowId }),
        })
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
        if (!live) return
        if (j.ok !== true) { setError(String(j.refusal ?? 'That email could not be opened.')); return }
        setData(j as unknown as ViewedEmail)
      } catch { if (live) setError('That email could not be opened — check the connection.') }
    })()
    return () => { live = false }
  }, [rowId])

  const split = useMemo(() => splitQuotedHtml(data?.html ?? ''), [data])
  /* ⚠️ THROUGH A "LATEST REF", AND DECLARED BEFORE BOTH EFFECTS. The callback is an inline arrow in
   * the caller, so a new identity on every render; depending on it directly would re-fire the
   * report on every render of the parent. The ref is written in its own effect — never during
   * render — which is the pattern this file already uses for the keyboard handler. */
  const onTextRef = useRef(onText)
  useEffect(() => { onTextRef.current = onText })
  // ⚠️ REPORTED ONCE PER BODY, in an effect on the data — never during render and never in the fetch.
  useEffect(() => { if (data) onTextRef.current?.(data.text ?? null) }, [data])

  if (error) return <p className="text-[12px] text-red-800">{error}</p>
  if (!data) return <p className="text-[12px] text-slate-500">Opening the email…</p>
  const shown = split.quoted && !showQuoted ? split.main : (data.html ?? '')
  return (
    <>
      {!hideMeta && (
        <>
          <p className="text-[12px] text-slate-700"><span className="font-bold">From:</span> {data.from ?? '—'}</p>
          <p className="text-[12px] text-slate-700"><span className="font-bold">Subject:</span> {data.subject ?? '—'}</p>
        </>
      )}
      {data.attachments.length > 0 && (
        <p className="text-[12px] text-slate-700 mt-0.5">
          <span className="font-bold">Attachments:</span>{' '}
          <AttachmentList attachments={data.attachments} prospectId={data.prospect_id ?? null} />
        </p>
      )}
      {data.truncated && (
        <p className="text-[12px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
          This email was too long to store in full — what follows is the first part of it.
        </p>
      )}
      {data.html
        ? <>
            <SizedEmailFrame html={shown} title="Email body" />
            <div className="flex items-center gap-2 mt-1">
              {split.quoted && (
                <button type="button" onClick={() => setShowQuoted(v => !v)}
                  className="text-[11px] font-bold text-slate-600 hover:underline">
                  {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
                </button>
              )}
              {onOpenFull && (
                <button type="button" onClick={() => onOpenFull(data.html ?? '', data.subject)}
                  className="text-[11px] font-bold text-slate-600 hover:underline">⤢ Open full screen</button>
              )}
            </div>
          </>
        : <pre className="mt-2 text-[12px] whitespace-pre-wrap">{data.text ?? '(this email has no body)'}</pre>}
    </>
  )
}

/**
 * A frame that measures itself.
 * ⚠️ MEASURED ON LOAD AND ON RESIZE, and nowhere else: the document inside cannot run scripts, so it
 * cannot change size on its own. A `ResizeObserver` on a document we know is static would be a
 * listener that never fires.
 */
export function SizedEmailFrame({ html, title, maxFraction }: {
  html: string
  title: string
  /** Defaults to 80% of the window. The full-screen view passes ~1 to fill it. */
  maxFraction?: number
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState(FRAME_MIN_PX)

  const measure = useCallback(() => {
    const el = ref.current
    const doc = el?.contentDocument
    if (!doc || !doc.body) return
    const content = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0)
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight
    setH(frameHeight(content + 16, maxFraction ? vh * (maxFraction / FRAME_MAX_FRACTION) : vh))
  }, [maxFraction])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  return (
    <iframe
      ref={ref}
      title={title}
      // 🔴 ONE TOKEN, FROM THE CONSTANT. See `EMAIL_FRAME_SANDBOX`: same-origin WITHOUT scripts is
      // what makes the document measurable and inert at the same time.
      sandbox={EMAIL_FRAME_SANDBOX}
      srcDoc={html}
      onLoad={measure}
      style={{ height: h }}
      className="mt-2 w-full border border-slate-200 rounded bg-white"
    />
  )
}

export function ContactPopout({ contact, onClose, onDelete }: {
  contact: Contact
  onClose: () => void
  /** Rejects on failure — the confirm dialog shows the reason and stays open. */
  onDelete: () => Promise<void>
}) {
  const [mounted, setMounted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 🔴 WHILE THE CONFIRMATION IS OPEN, ESCAPE IS NOT THIS WINDOW'S TO HANDLE. Both listeners are
      // registered on `window` in the CAPTURE phase, and two capture listeners on the same target BOTH
      // fire — `stopPropagation` does not stop a sibling on the same node, only `stopImmediatePropagation`
      // would. Without this guard one Escape would close the dialog AND this popout underneath it.
      // Guarding here rather than changing ConfirmDeleteDialog keeps a dialog shared with the media and
      // event deletes untouched.
      if (confirming) return
      e.stopPropagation(); e.preventDefault(); onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, confirming])
  if (!mounted) return null
  return createPortal(
    // 🔴 90, ABOVE THE COMPOSE WINDOW'S 85 — and inline, for the reason recorded on that file: an
    // arbitrary z-index used by exactly one file may have no generated rule at all.
    <div style={{ zIndex: 90 }} className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[calc(100vh-6rem)] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtDate(contact.contacted_at)}</span>
          {/* 🔴 THE SAME PILL THE HISTORY USES, AND NO GREEN. This chip was the last place a
              direction was said in colour; it is bold dark text on grey now, like every other row. */}
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-900">
            {directionLabel(contact.direction)}
          </span>
          <span className="text-xs text-slate-500" title={contact.kind ?? undefined}>{kindLabel(contact.kind)}</span>
          <span className="text-xs text-slate-400">{channelLabel(contact.channel)}</span>
          <button onClick={onClose} autoFocus
            className="ml-auto text-sm font-semibold px-3 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
            Close
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          {contact.message
            ? <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{contact.message}</p>
            : <p className="text-sm text-slate-400 italic">No message was recorded with this contact.</p>}

          {/* 🔴 THE LOGGED TEXT IS A SUMMARY OF AN EMAIL; THE EMAIL IS THE RECORD. When this contact
              was logged from one, the whole thing is here — headers, attachments and body — read
              live and read-only, in the same sandboxed viewer the Emails list uses. That is the
              difference between "No message was recorded" and being able to see what was actually
              said, which is precisely what went wrong with the first logged reply. */}
          {contact.email_message_id && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <span className="block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1">
                The email this was logged from
              </span>
              <EmailBody rowId={contact.email_message_id} />
            </div>
          )}
        </div>

        {/* 🔴 THE DELETE LIVES HERE, NOT ON THE TABLE ROW. The history table's five columns and their
            measured widths are settled; the last one is 46px and holds View, with no room for a second
            affordance. This window already displays the four facts the confirmation has to name, so
            opening the row IS the disambiguation step. */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] text-slate-500">Logged by mistake?</span>
          <button onClick={() => setConfirming(true)}
            className="ml-auto text-sm font-semibold px-3 py-1 rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400">
            Delete this contact
          </button>
        </div>

        {/* 🔴 REUSED, NOT REBUILT — the SAME dialog the media and event deletes use. It already gives
            Cancel-focused-on-open, Escape, backdrop-cancel, a busy lock and the server's own message
            shown in place. A second confirmation would be the fourth-independent-copy mistake the
            file's own header warns about.
            🔴 RENDERED INSIDE THE POPOUT'S PANEL, not beside it: the panel stops click propagation, so
            a click on the dialog's backdrop cancels the DIALOG without also reaching this window's
            backdrop and closing it. Its `z-[70]` resolves inside this window's zIndex:90 stacking
            context, so it paints above this content and above the modal underneath. */}
        {confirming && (
          <ConfirmDeleteDialog
            title="Delete this contact?"
            confirmLabel="Delete contact"
            onCancel={() => setConfirming(false)}
            onConfirm={onDelete}>
            <div className="mt-2 text-sm text-slate-700 space-y-2">
              <p>This row will be removed from the contact history:</p>
              <ul className="text-[13px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-0.5">
                <li><span className="text-slate-400">Date </span>{fmtDate(contact.contacted_at)}</li>
                <li><span className="text-slate-400">Direction </span>{directionLabel(contact.direction)}</li>
                <li><span className="text-slate-400">Stage </span>{kindLabel(contact.kind)}</li>
                <li><span className="text-slate-400">Channel </span>{channelLabel(contact.channel)}</li>
              </ul>
              <p className="font-semibold text-red-800">This cannot be undone. There is no recovery.</p>
              <p className="text-[13px] text-slate-500">
                “Last contacted” is recalculated from the rows that remain. The follow-up date is cleared
                or moved back to the one the previous contact implies — unless you set it by hand, in
                which case it is left alone. The stage on the prospect is not changed.
              </p>
            </div>
          </ConfirmDeleteDialog>
        )}
      </div>
    </div>, document.body)
}

export const MAIL_STATUS_LABEL: Record<string, string> = {
  sending: 'Sending…', sent: 'Sent', failed: 'Failed', uncertain: 'May have been sent', received: 'Reply',
  // ⚠️ THREE OF THESE ARE STATES A PERSON DID NOT CAUSE. `auto_reply` and `bounce` are inbound rows
  // the poll recorded and deliberately did NOT log as contacts; `bounced` is an OUTBOUND row the mail
  // system reported undeliverable, which is the one that needs the address looking at.
  auto_reply: 'Auto-reply', bounce: 'Bounce', bounced: 'Bounced',
}

/** How each status reads: red is a problem, amber needs a decision, sky is them, green is us. */
export const mailStatusTone = (row: { status: string; direction: string }) =>
  row.status === 'failed' || row.status === 'bounced' || row.status === 'bounce' ? 'text-red-700'
    : row.status === 'uncertain' ? 'text-amber-800'
    : row.status === 'auto_reply' ? 'text-slate-500'
    : row.direction === 'inbound' ? 'text-sky-700' : 'text-emerald-700'

/** The modal's field and label classes, shared with the timeline. `max-sm:text-base` is 16px, which
 *  is what stops iOS zooming the page when a field takes focus — do not "tidy" it away. */
export const FIELD_CLS = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm max-sm:text-base max-sm:py-2'

export const LABEL_CLS = 'block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5'

/**
 * One prospect's whole timeline, in one query.
 * 🔴 MOVED HERE WITH THE PROSPECT VIEW (30 September 2026) and unchanged: the page reads it on open
 * and after every write, and the list's Today tab does not read it at all.
 */
export async function fetchTimeline(prospectId: string): Promise<TimelinePayload | null> {
  const h = await nativeAuthHeader()
  const r = await fetch(`/api/admin/outreach/timeline?prospect_id=${encodeURIComponent(prospectId)}`,
    { headers: h, credentials: 'same-origin' }).catch(() => null)
  if (!r) return null
  const j = (await r.json().catch(() => null)) as TimelinePayload | null
  return j && j.ok ? j : null
}


/** A stage as a sentence reads it. Null is "no stage", which happens on the very first change. */
export const stageWord = (v: string | null | undefined): string =>
  !v ? 'no stage' : String(v).replace(/_/g, ' ')




export interface ViewedEmail {
  from: string | null; to: string | null; subject: string | null; date: string | null
  direction: string; source: string
  /** 🔴 `storagePath` is present on an OUTBOUND row only — those files are ours, in our own private
   *  bucket, and can be opened. An inbound message's attachments are NAMES read off its structure;
   *  the files were never downloaded, so there is nothing to link to and no link is offered. */
  attachments: { filename: string | null; contentType: string; size: number | null; storagePath?: string }[]
  /** Needed to ask for a signed download link; the route checks the path against it. */
  prospect_id?: string
  html: string | null; text: string | null
  from_mailbox: boolean; mailbox?: string
  /** 🔴 The stored HTML was longer than the cap and was cut. SAID, never silent — a viewer that
   *  quietly shows half an email reads as "nothing more was said". */
  truncated?: boolean
}

// ── THE DEMO LINK CHIP ────────────────────────────────────────────────────────────────────────────
// Shown in the prospect modal's header when this prospect already has a live demo. Read-only: the URL
// that was (or can be) sent, its expiry, and a Copy button matching CreateDemoModal's affordance.
//
// 🔴 NO PORTAL, NO OVERLAY, NO KEY LISTENER. It renders inside the prospect modal that is already open,
// so there is no second layer to stack and nothing new for Escape to hit — which is the only way to be
// certain Escape still closes exactly one thing (C15: two capture listeners on one node, where
// stopPropagation stops nothing).
//
// The origin is read at CLICK time, not at render: the copied link must be absolute (it is pasted into
// an email) and `window` is not available during SSR.
export function DemoLinkChip({ demo }: { demo: NonNullable<Prospect['demo']> }) {
  const [copied, setCopied] = useState(false)
  if (!demo.publicRef) {
    // A live demo with no readable segment — provisioned before public_ref, or its mint failed. Say so
    // rather than rendering a broken link.
    return <span className="text-xs text-slate-400" title="This prospect has a live demo but no readable URL">demo · no link</span>
  }
  const path = `/demo/${demo.publicRef}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the path is on screen to copy by hand */ }
  }
  return (
    <span className="flex items-center gap-2 max-sm:flex-wrap max-sm:gap-y-1">
      <a href={path} target="_blank" rel="noreferrer"
        className="text-xs font-mono text-orange-700 hover:underline max-w-[18rem] truncate" title={path}>{path}</a>
      <button type="button" onClick={copy}
        className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
        {copied ? 'Copied' : 'Copy'}
      </button>
      {/* The expiry is the point of showing it: an outreach demo lives 30 days and a link sent three
          weeks ago has a week left. fmtDate is the same formatter every other date on this page uses. */}
      <span className="text-xs text-slate-400 whitespace-nowrap">
        {demo.expiresAt ? `expires ${fmtDate(demo.expiresAt)}` : 'no expiry recorded'}
        {demo.liveCount > 1 ? ` · newest of ${demo.liveCount}` : ''}
      </span>
    </span>
  )
}

// ── A TEXTAREA THAT IS REALLY THE HEIGHT IT SAYS ────────────────────────────────────────────────────
/**
 * 🔴 `field-sizing: content` COLLAPSED EVERY BOX ON THIS PAGE TO ONE LINE, and the comment beside it
 * said the opposite: "`rows` is the floor everywhere, so nothing depends on that support." It is not
 * a floor. Where `field-sizing: content` IS supported — Safari 26, and Chrome since 123 — it REPLACES
 * `rows` and sizes the box to its contents, so an EMPTY ten-row note box renders as a single line.
 * The property was added to make a box grow; it also made it shrink, and the shrink is what shipped.
 *
 * 🔴 SO THE GROWING IS DONE HERE, IN FIVE LINES OF JS, AND `rows` IS LEFT TO MEAN WHAT IT MEANS.
 * The floor is measured from the element's own computed line-height and padding rather than guessed,
 * so it holds at 16px on a phone and at 14px on a laptop — the `!important` font-size rule in
 * globals.css changes that number under us.
 * ⚠️ IT GROWS AND IT SHRINKS BACK, but never below `rows`. A dragged height (`resize-y`) is the
 * operator's and is left alone: once the element carries an inline height from a drag, this stops
 * touching it.
 */
export function GrowingTextarea(
  { rows = 3, onChange, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number },
) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const dragged = useRef(false)
  const value = rest.value

  const grow = useCallback(() => {
    const el = ref.current
    if (!el || dragged.current) return
    const cs = window.getComputedStyle(el)
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20
    const extra = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    const floor = Math.round(line * rows + extra)
    // ⚠️ `auto` FIRST, OR `scrollHeight` ONLY EVER GROWS: it is measured against the height already
    // set, so without the reset the box ratchets upward and never comes back.
    el.style.height = 'auto'
    el.style.height = `${Math.max(floor, el.scrollHeight)}px`
  }, [rows])

  // Re-measure when the value changes from outside (a template, a reset, another prospect).
  useEffect(() => { grow() }, [grow, value])

  /* ⚠️ A DRAG ON THE GRIP WINS FROM THEN ON. Without this the next keystroke would call `grow()`
     and overwrite the height the operator just chose. Pointer capture during a grip drag means the
     release lands on this element even if the pointer has left it. */
  const dragFrom = useRef<number | null>(null)

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      onPointerDown={e => { dragFrom.current = e.currentTarget.offsetHeight; rest.onPointerDown?.(e) }}
      onPointerUp={e => {
        const from = dragFrom.current
        dragFrom.current = null
        if (from != null && e.currentTarget.offsetHeight !== from) dragged.current = true
        rest.onPointerUp?.(e)
      }}
      onChange={e => { onChange?.(e); grow() }}
    />
  )
}

/**
 * One saved note — and the only two things in the timeline that can be changed.
 *
 * 🔴 THE RULES ARE THE ONES THIS CODEBASE ALREADY HAD, PLUS THE TWO IT DID NOT. A contact row can be
 * deleted (the ⋯ popout's Delete, behind `ConfirmDeleteDialog`, by explicit id, with the route
 * reporting how many rows it actually removed); nothing in the outreach panel could ever be EDITED.
 * So: delete keeps that shape and asks first, and edit-in-place and the 8-second Undo are new,
 * exactly as the brief specifies them.
 * ⚠️ ONLY A NOTE. A stage change is a record of something that happened and the timeline is a
 * history; the route enforces that in the statement, not here.
 */
export function NoteRow({ note, prospectId, onChanged, open, onToggle }: {
  note: TimelineEvent
  prospectId: string
  onChanged: () => Promise<void>
  /**
   * 🔴 ONE ROW IN THE HISTORY, LIKE EVERY OTHER ENTRY. A multi-line note rendered as a tall block
   * with its blank lines still in it, and the history stopped being a list. Absent (the Notes card)
   * ⇒ the note is always shown in full, because that list IS the notes.
   */
  open?: boolean
  onToggle?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.body ?? '')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  /** The just-deleted note, for as long as Undo is on offer. */
  const [undo, setUndo] = useState<null | { body: string; created_at: string }>(null)

  const post = async (payload: Record<string, unknown>) => {
    const h = await nativeAuthHeader()
    const r = await fetch('/api/admin/outreach/timeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
      credentials: 'same-origin', body: JSON.stringify(payload),
    })
    return (await r.json().catch(() => ({}))) as Record<string, unknown>
  }

  const save = async () => {
    setBusy(true)
    try {
      const j = await post({ action: 'edit_note', event_id: note.id, body: text })
      if (j.ok === true) { setEditing(false); await onChanged() }
    } finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const j = await post({ action: 'delete_note', event_id: note.id })
      setConfirming(false)
      if (j.ok !== true) return
      const removed = j.removed as { body?: string | null; created_at?: string } | null
      // 🔴 EIGHT SECONDS, AND THE WORDS AND THE DAY BOTH COME BACK. The row the server removed
      // travels back with the answer, so Undo restores what was written and WHEN — a note put back
      // with today's date would move in the history and stop explaining the day it was about.
      setUndo({ body: removed?.body ?? note.body ?? '', created_at: removed?.created_at ?? note.created_at })
      window.setTimeout(() => setUndo(null), 8000)
      await onChanged()
    } finally { setBusy(false) }
  }

  const putBack = async () => {
    if (!undo) return
    setBusy(true)
    try {
      await post({ action: 'restore_note', prospect_id: prospectId, body: undo.body, created_at: undo.created_at })
      setUndo(null)
      await onChanged()
    } finally { setBusy(false) }
  }

  if (undo) {
    return (
      <li className="text-[13px] flex items-baseline gap-2">
        <span className="text-slate-400 italic">Note deleted.</span>
        <button type="button" onClick={() => void putBack()} disabled={busy}
          className="text-[11px] font-bold text-slate-600 underline hover:no-underline disabled:opacity-40">Undo</button>
      </li>
    )
  }

  const edited = !!note.updated_at && note.updated_at !== note.created_at
  /** 🔴 THE HISTORY COLLAPSES A NOTE; THE NOTES CARD NEVER DOES. `onToggle` is what says which. */
  const collapsible = !!onToggle

  return (
    <li className="text-[13px] group">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {fmtDate(note.created_at) ?? ''}
        </span>
        {collapsible && <span className="text-[11px] font-semibold text-slate-500">Note</span>}
        {edited && (
          <span className="text-[11px] text-slate-400" title={new Date(note.updated_at!).toLocaleString('en-GB')}>
            edited {fmtDate(note.updated_at ?? null)}
          </span>
        )}
        {!editing && (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => { setText(note.body ?? ''); setEditing(true) }}
              className="text-[11px] font-semibold text-slate-500 hover:underline">Edit</button>
            <button type="button" onClick={() => setConfirming(true)}
              className="text-[11px] font-semibold text-slate-500 hover:underline">Delete</button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1">
          <GrowingTextarea rows={3} className={`${FIELD_CLS} w-full resize-y`}
            value={text} onChange={e => setText(e.target.value)} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={busy || !text.trim()}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-800 text-white disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setText(note.body ?? ''); setEditing(false) }}
              className="text-[11px] font-semibold text-slate-500 hover:underline">Cancel</button>
          </div>
        </div>
      ) : collapsible && !open ? (
        // ⚠️ ONE LINE, TRUNCATED BY CSS — `noteFirstLine` decides which line, the browser decides
        // where it ends. Clicking the row opens it in place.
        <button type="button" onClick={onToggle}
          className="block w-full text-left truncate text-slate-700 hover:text-slate-900">
          {noteFirstLine(note.body)}
        </button>
      ) : (
        <p onClick={collapsible ? onToggle : undefined}
          className={`whitespace-pre-wrap break-words text-slate-700${collapsible ? ' cursor-pointer' : ''}`}>
          {tidyNoteText(note.body)}
        </p>
      )}
      {confirming && (
        <ConfirmDeleteDialog
          title="Delete this note?"
          confirmLabel="Delete note"
          onCancel={() => setConfirming(false)}
          onConfirm={remove}>
          <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{note.body}</p>
        </ConfirmDeleteDialog>
      )}
    </li>
  )
}

