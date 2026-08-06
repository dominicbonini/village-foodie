'use client'
// ── ACCOUNT DELETION — THE DANGER ZONE ──────────────────────────────────────────────────────────────
// The in-app request control. Owner-only, bottom of Manage → Settings.
//
// WHY IT EXISTS: the published privacy policy states operators can request deletion FROM WITHIN THE APP,
// and App Store guideline 5.1.1(v) requires in-app account deletion for any app supporting account
// creation. Both were unmet — the backend existed and nothing called it.
//
// ── 🔴 SETTINGS, NOT BILLING ────────────────────────────────────────────────────────────────────────
// Billing is already owner-only, which would have made the role gate structural rather than a condition
// — but the Billing TAB IS HIDDEN when `truck.plan === 'tester'`, so those owners would have had no
// in-app deletion path at all. 5.1.1(v) has no plan exemption. Settings is visible to every owner.
//
// ── 🔴 NOTHING HERE CAN BE REACHED BY ACCIDENT ──────────────────────────────────────────────────────
// This sits on a page an operator uses daily, so the safety properties are load-bearing, not decorative:
//   • The section is collapsed to a single non-destructive button. No default-open state.
//   • That button OPENS A DIALOG. It does not request anything.
//   • The dialog requires the truck name TYPED EXACTLY before the destructive button enables.
//   • Cancel is the visually dominant option and is the autofocused control.
//   • The form does not submit on Enter — there is no default-submit path to the destructive action.
//   • Escape dismisses without acting.
//   • The destructive button NAMES the action ("Delete my account"), never "Confirm" or "Yes".
//
// ⚠️ NO `frontend-design` SKILL EXISTS in this environment (checked: no .claude/skills, no ~/.claude/skills),
// so styling follows the codebase's own established vocabulary instead — `border-2 border-red-300
// bg-red-50` for destructive panels and `text-red-600 border-red-200 hover:bg-red-50` for destructive
// buttons, both already used throughout the Manage page. A "Danger Zone" heading and a focus-trapping
// dialog are NEW here; nothing equivalent existed to copy.
import { useCallback, useEffect, useRef, useState } from 'react'
import { PRIVACY_PATH } from '@/lib/legal'
import { HATCHGRAB_SENDER } from '@/lib/email-config'
import type { ShowToast } from '@/lib/useToasts'

interface AccountSummary {
  ownerEmail: string | null
  trucks: { id: string; name: string }[]
  upcomingOrders: number
  pending: boolean
  requestedAt: string | null
  dueAt: string | null
}

/** 🔴 READ FROM THE EXISTING CONSTANT, never typed inline. Not changed here — the address and its
 *  fallback are a separate task waiting on a mailbox test. */
const SUPPORT_EMAIL = HATCHGRAB_SENDER.replyTo

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export function DeleteAccountSection({ truckName, showToast }: {
  truckName: string
  /** The page's own toast helper — the canonical type, so a future signature change breaks here. */
  showToast: ShowToast
}) {
  const [summary, setSummary] = useState<AccountSummary | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // ⚠️ setState lands in a PROMISE CALLBACK, not synchronously in the effect body — which is what
  // react-hooks/set-state-in-effect asks for ("calling setState in a callback function when external
  // state changes"). Written this way deliberately rather than accepting the warning.
  const load = useCallback(() => {
    fetch('/api/account/request-deletion')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: AccountSummary) => { setSummary(data); setLoadFailed(false) })
      .catch(() => setLoadFailed(true))
  }, [])

  useEffect(load, [load])

  // Escape dismisses without acting; focus moves to Cancel on open (never to anything destructive).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setTyped('') } }
    document.addEventListener('keydown', onKey)
    cancelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Focus trap — Tab cycles inside the dialog so a keyboard user cannot land on the page behind it and
  // act on something they cannot see.
  const onDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input, a[href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable.length) return
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // 🔴 Not signed in as the account holder (staff/manager, or a token-only session) ⇒ render NOTHING.
  // The parent gates on userRole too; this is the second, server-backed check.
  if (loadFailed || !summary) return null

  const request = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/account/request-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Could not submit the request', 'error'); return }
      setOpen(false); setTyped('')
      load()
      showToast('Account deletion requested. Check your email.')
    } catch {
      showToast('Could not submit the request', 'error')
    } finally { setSubmitting(false) }
  }

  // ── PENDING — the control is REPLACED, so it cannot be requested twice ─────────────────────────────
  if (summary.pending) {
    return (
      <section className="mt-10 rounded-2xl border-2 border-red-300 bg-red-50 p-5" aria-labelledby="danger-zone-heading">
        <h3 id="danger-zone-heading" className="text-sm font-black uppercase tracking-wide text-red-800">Danger zone</h3>
        <div className="mt-3 rounded-xl border border-red-200 bg-white p-4">
          <p className="text-sm font-bold text-red-800">This account is scheduled for deletion</p>
          <p className="mt-1 text-sm text-slate-700">
            Requested on <strong>{fmtDate(summary.requestedAt)}</strong>. It is due to be deleted on{' '}
            <strong>{fmtDate(summary.dueAt)}</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Online ordering has stopped. Your dashboard stays available to read until then.
          </p>
          {/* 🔴 The sentence most likely to surprise someone, repeated in the state that needs it most. */}
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong>You cannot cancel this yourself.</strong> To stop it, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-semibold">{SUPPORT_EMAIL}</a> as soon as possible.
          </p>
        </div>
      </section>
    )
  }

  const names = summary.trucks.map(t => t.name)
  const confirmTarget = names.length === 1 ? names[0] : truckName
  const canConfirm = typed.trim() === confirmTarget.trim() && !submitting

  return (
    <section className="mt-10 rounded-2xl border-2 border-red-300 bg-red-50 p-5" aria-labelledby="danger-zone-heading">
      <h3 id="danger-zone-heading" className="text-sm font-black uppercase tracking-wide text-red-800">Danger zone</h3>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">Delete your account</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Permanently close this HatchGrab account and stop taking online orders.
          </p>
        </div>
        {/* Opens the dialog. Requests NOTHING. Not styled as the primary destructive action. */}
        <button
          type="button"
          onClick={() => { setTyped(''); setOpen(true) }}
          className="shrink-0 self-start rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 sm:self-auto"
        >
          Delete account…
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) { setOpen(false); setTyped('') } }}
        >
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-desc"
            onKeyDown={onDialogKeyDown}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
          >
            <h2 id="delete-account-title" className="text-lg font-black text-slate-900">Delete your account?</h2>

            <div id="delete-account-desc" className="mt-3 flex flex-col gap-3 text-sm text-slate-700">
              {/* 🔴 FIRST, because it is the consequence an operator is most likely to misjudge. */}
              <p className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-800">
                Online ordering stops immediately — not in 30 days. Customers will not be able to order
                from you as soon as you confirm.
              </p>

              {summary.upcomingOrders > 0 && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  <strong>You have {summary.upcomingOrders} upcoming order{summary.upcomingOrders === 1 ? '' : 's'}.</strong>{' '}
                  These will still need fulfilling.
                </p>
              )}

              {names.length > 1 && (
                <p>
                  <strong>All {names.length} trucks on this account are included:</strong> {names.join(', ')}.
                </p>
              )}

              <p>
                Your account will be deleted after <strong>30 days</strong>. Your dashboard stays available
                to read during that time.
              </p>

              {/* 🔴 BEFORE the confirm action, never after. */}
              <p className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-800">
                You cannot cancel this yourself. To stop it, you must email{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
              </p>

              <div>
                <p className="font-bold text-slate-800">What is deleted, and what is kept</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>Your personal details and your team&apos;s are deleted, and your logins are removed.</li>
                  <li>Your customers&apos; names, emails and phone numbers are deleted from your orders.</li>
                  <li>
                    Anonymous accounting records are <strong>kept for six years</strong>, as UK law requires.
                    See our <a href={PRIVACY_PATH} target="_blank" rel="noopener noreferrer" className="underline font-semibold">privacy policy</a>.
                  </li>
                </ul>
              </div>

              {/* 🔴 NO EXPORT FEATURE EXISTS. Say so plainly rather than implying one. */}
              <p className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2">
                <strong>Want a copy of your data first?</strong> There is no download in the app. You have
                the right to a copy — email{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-semibold">{SUPPORT_EMAIL}</a>{' '}
                <strong>before</strong> you confirm, and we will send it to you.
              </p>

              <label className="mt-1 block">
                <span className="font-semibold text-slate-800">
                  Type <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px]">{confirmTarget}</span> to confirm
                </span>
                {/* ⚠️ Not autofocused — the dialog focuses Cancel. Enter does nothing: there is no form
                    element here, so there is no default-submit path to the destructive button. */}
                <input
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={`Type ${confirmTarget} to confirm account deletion`}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row-reverse sm:justify-start">
              {/* 🔴 CANCEL IS DOMINANT and is what receives focus on open. It is listed FIRST in the DOM
                  within a reversed row, so it sits on the right visually and is reached first by Tab. */}
              <button
                ref={cancelRef}
                type="button"
                onClick={() => { setOpen(false); setTyped('') }}
                className="w-full rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-900 sm:w-auto"
              >
                Cancel — keep my account
              </button>
              {/* 🔴 NAMES THE ACTION. Disabled until the name matches exactly. */}
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => void request()}
                className="w-full rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white sm:w-auto"
              >
                {submitting ? 'Requesting…' : 'Delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
