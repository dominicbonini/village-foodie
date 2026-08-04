'use client'

// app/setup/page.tsx
// The onboarding wizard SHELL, plus its first step (identity).
//
// ── WHY A WIZARD FRAME AND NOT TWO AD-HOC SCREENS ──────────────────────────────────────────────────
// Phase 5 ADDS steps (capacity, allergens, schedule, team, go-live) rather than replacing what ships here.
// A frame with a stepper means those arrive as entries in an array; two bespoke screens would mean
// rebuilding the flow and re-teaching the operator its shape.
//
// ── SHELL CONVENTIONS BORROWED FROM THE IMPORT WIZARD ──────────────────────────────────────────────
// Same stepper idiom, same card, and the FIXED-HEIGHT RULE the reference manual records as a repeat
// offender: header `shrink-0` · body `flex-1 min-h-0 overflow-y-auto` · footer `shrink-0`. Magic
// calc(100dvh - Npx) offsets desync the moment browser chrome or a safe-area inset changes — that bug has
// bitten this project more than once, most recently on Add-order Confirm.
//
// ── WHAT SHIPS HERE, AND WHAT DOESN'T ──────────────────────────────────────────────────────────────
// Steps 2+3 deliver signup + this frame + the identity step. The MENU step is Step 4 (it needs the
// re-commit-from-stored-extraction path) and the EVENT step is Step 6. Rather than ship stubs that
// pretend, the frame shows the real step list with the unbuilt ones visibly pending, and finishing
// identity lands them on their actual dashboard. Honest, and it is where they can do something.

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'

const STEPS = [
  { key: 'identity', label: 'Your truck' },
  { key: 'menu', label: 'Your menu' },
  { key: 'event', label: 'First event' },
] as const

function SetupWizard() {
  const router = useRouter()
  const params = useSearchParams()
  const verify = params.get('verify')

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── DO NOT ASK FOR A NAME WE ALREADY HAVE (A3) ──────────────────────────────────────────────────
  // 🔴 This page used to render the truck-name form UNCONDITIONALLY, with no lookup of any kind. An
  // operator who finished the in-modal wizard (account + truck in ~3 seconds) and then clicked their
  // confirmation email a minute later was landed here and asked to name a truck that already existed —
  // and create_truck's idempotence guard then returned the existing row and DISCARDED what they typed.
  // Asking a question whose answer is thrown away is worse than not asking.
  //
  // So: ask the server first, and render nothing until it answers.
  //   • truck exists → straight to the destination the resumed path produces TODAY. ⚠️ That destination
  //     is preserved EXACTLY, ?import=demo and all — removing the question is this change; what
  //     ?import=demo then does is a separate concern and is not touched here.
  //   • no truck    → render the form, exactly as before.
  // router.replace, not push: this page is not a step they should be able to go BACK to.
  //
  // ⚠️ `checking` starts TRUE so the form cannot flash before the answer arrives. A failed check falls
  // through to the form — the old behaviour — because a network blip must not strand someone who
  // genuinely has no truck yet.
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/setup?check=truck')
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (data?.ok && data.truck?.dashboard_token) {
          router.replace(`/manage/${encodeURIComponent(data.truck.dashboard_token)}?import=demo`)
          return   // stay in `checking` — the redirect is in flight, never show the form
        }
      } catch { /* fall through to the form */ }
      if (!cancelled) setChecking(false)
    })()
    return () => { cancelled = true }
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      // contact_email is OMITTED, not sent as null — the server defaults trucks.contact_email to
      // operator.email when the key is absent (app/api/setup/route.ts:48:
      // `String(body.contact_email ?? '').trim() || operator.email || null`). Sending an explicit null/''
      // would defeat that fallback, so we simply leave the key off.
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_truck', name: name.trim() }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Could not create your truck.'); return }
      // MENU STEP — reuse the real import wizard, pre-loaded from the demo's stored extraction (?import=demo).
      // It re-commits into this new truck: grouped-vs-separate re-asked, price gate applied, allergens
      // re-decided. If there's no claimed demo/extraction the wizard simply shows a normal upload.
      // The EVENT step (Step 6) isn't built yet; finishing the menu wizard lands them on their dashboard.
      router.push(`/manage/${data.truck.dashboard_token}?import=demo`)
    } catch {
      setError('Couldn’t reach us just now — please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Still asking whether they already have a truck (A3). The chrome renders so the page does not flash
  // white, but the QUESTION does not — that is the whole point of the check.
  if (checking) {
    return (
      <div className="h-dvh flex flex-col bg-slate-50">
        <header className="bg-slate-900 px-4 py-3 shrink-0">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <HatchGrabWordmark variant="dark" />
            <span className="text-xs text-slate-400">Setting up</span>
          </div>
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <span className="w-6 h-6 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" aria-label="Loading" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col bg-slate-50">
      {/* HEADER — shrink-0 */}
      <header className="bg-slate-900 px-4 py-3 shrink-0">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <HatchGrabWordmark variant="dark" />
          <span className="text-xs text-slate-400">Setting up</span>
        </div>
      </header>

      {/* BODY — flex-1 min-h-0 overflow-y-auto */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-8">
        <div className="max-w-lg mx-auto">
          {verify === 'ok' && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
              Email confirmed — thank you.
            </div>
          )}
          {/* ⚠️ NO RESEND IS PROMISED, because there is no resend path for SIGNUP verification.
              /api/auth/resend-verification reads `operator_email_changes` — the email-CHANGE table, a
              different one. Saying "we'll send you a fresh one" named a mechanism that does not exist. */}
          {verify === 'expired' && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              That confirmation link has expired. Get in touch and we&apos;ll sort it before you go live.
            </div>
          )}
          {/* 'invalid' previously rendered NOTHING, so a dead or malformed link looked exactly like a
              normal page load and the operator was told nothing at all. Same amber treatment as
              'expired' — both mean "that link did not work", neither blocks anything. (A2) */}
          {verify === 'invalid' && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              That confirmation link didn&apos;t work. Get in touch and we&apos;ll sort it before you go live.
            </div>
          )}

          {/* Stepper — the unbuilt steps are shown as pending rather than hidden, so the shape of what's
              coming is legible from the first screen. */}
          <ol className="flex items-center gap-2 mb-6 text-xs">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={i === 0 ? 'font-black text-slate-900' : 'text-slate-400'}>
                  {i + 1}. {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-slate-300">›</span>}
              </li>
            ))}
          </ol>

          <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-5">
            <div>
              <h1 className="text-lg font-black text-slate-900">What&apos;s your truck called?</h1>
              <p className="text-sm text-slate-500 mt-1">
                This is the name customers see. Nothing goes public until you choose to go live.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Truck name</label>
              <input value={name} onChange={e => setName(e.target.value)} required maxLength={60}
                placeholder="Bob&apos;s Burgers" autoFocus
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              {/* The public ordering URL is deliberately NOT previewed here — it's noise at signup. It's
                  surfaced in Settings alongside the rename path, where changing it is the actual task.
                  The contact email is likewise dropped from this step: the server defaults it to the
                  operator's account email at creation (see submit), and Settings stays the place to set a
                  different customer-facing address. */}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </div>
      </div>

      {/* FOOTER — shrink-0 */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
        <div className="max-w-lg mx-auto">
          <button type="button" onClick={submit} disabled={busy || name.trim().length < 2}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl disabled:opacity-40">
            {busy ? 'Creating your truck…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SetupPage() {
  return <Suspense><SetupWizard /></Suspense>
}
