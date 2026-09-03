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
// ── 🔴 THE SAME VALIDATOR THE SERVER USES, AND THE SAME ONE THE DEMO MODAL USES. ──────────────────
// app/api/setup/route.ts:13 imports this exact function and rejects on it at :74; components/
// DemoGetStarted.tsx:53 imports it for the identical field. Three callers, one rule — so this form
// cannot accept a number the server will refuse, and the two signup paths cannot drift apart.
import { isValidUKPhone } from '@/lib/contact-validation'

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

  // ── 🔴 CONTACT PHONE — ADDED 3 SEPTEMBER 2026. THIS FORM WAS UNCOMPLETABLE WITHOUT IT. ───────────
  // app/api/setup/route.ts:70-72 has REQUIRED `contact_phone` since 4 August 2026 (commit 888fc8a),
  // and this page had exactly one input and posted `{ action, name }`. Every submission therefore
  // returned 400 "A contact phone number is required." — AFTER the account was created, so the email
  // address was spent and every later login returned the operator to this same screen. The requirement
  // landed six hours after this file was last edited and the form was never brought along.
  // 🔴 THE SERVER IS UNCHANGED BY THIS FIX. It already required the field, already validated the
  // format, and already writes it. The only thing that was missing was somewhere to type it.
  // See docs/orphan-routes-report.md and docs/setup-phone-field-report.md.
  const [contactPhone, setContactPhone] = useState('')
  // ⚠️ SENT BECAUSE THE TRUCK IS WRONG WITHOUT IT, not for completeness. provisionTruck derives BOTH
  // `whatsapp` and `preferred_contact_method` from the phone plus this tick (app/api/setup/route.ts:
  // 92-96 → lib/provision-truck.ts). Omitted, a /setup truck is created with no stated way to be
  // contacted while a demo-path truck has one — the same account, a materially poorer row.
  const [phoneIsWhatsapp, setPhoneIsWhatsapp] = useState(false)
  // ⚠️ FIELD-LEVEL, NOT the page-level `error` above. `error` carries what the SERVER said; this
  // carries what we refused to send. The demo modal keeps the same separation (fieldErrors vs error)
  // and it matters here for the same reason: a server message replaced by a client one loses the
  // only account of what actually happened.
  const [phoneError, setPhoneError] = useState<string | null>(null)

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

  // ── 🔴 THE SAME TWO CHECKS, IN THE SAME ORDER, WITH THE SAME TWO MESSAGES AS THE DEMO MODAL. ─────
  // components/DemoGetStarted.tsx:432-433 (validateDetailsStep) reads:
  //     if (!contactPhone.trim()) errs.phone = 'Add a phone number — customers and we both use it to reach you.'
  //     else if (!isValidUKPhone(contactPhone)) errs.phone = 'Enter a valid UK phone number (e.g. 07700 900123).'
  // Copied verbatim so the two signup paths accept exactly the same set of inputs and say exactly the
  // same thing when they refuse one. ⚠️ If either copy changes, change both — nothing joins them.
  // 🟢 THE SECOND MESSAGE IS ALSO THE SERVER'S, WORD FOR WORD (app/api/setup/route.ts:75), so a
  // number that somehow reaches the server and is rejected there reads identically to one caught here.
  const validatePhone = (): boolean => {
    const v = contactPhone.trim()
    if (!v) { setPhoneError('Add a phone number — customers and we both use it to reach you.'); return false }
    if (!isValidUKPhone(contactPhone)) { setPhoneError('Enter a valid UK phone number (e.g. 07700 900123).'); return false }
    setPhoneError(null)
    return true
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // ⚠️ VALIDATE BEFORE ANY STATE FLIP OR SERVER WRITE, exactly as runSetup() does — otherwise the
    // button spins on a request we already know will be refused.
    if (!validatePhone()) return
    setBusy(true); setError(null)
    try {
      // contact_email is OMITTED, not sent as null — the server defaults trucks.contact_email to
      // operator.email when the key is absent (app/api/setup/route.ts:48:
      // `String(body.contact_email ?? '').trim() || operator.email || null`). Sending an explicit null/''
      // would defeat that fallback, so we simply leave the key off.
      // 🔴 contact_phone AND phone_is_whatsapp TRAVEL WITH create_truck, exactly as the demo modal
      // sends them (DemoGetStarted.tsx:528-540). They must ride on THIS call and not a later one:
      // provisionTruck derives `whatsapp` and `preferred_contact_method` during the INSERT, so a
      // phone patched on afterwards would leave both null on a truck that has a number.
      // ⚠️ Sent verbatim, untrimmed of internal spacing — isValidUKPhone does not normalise and the
      // server stores what it is given (route.ts:114).
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_truck',
          name: name.trim(),
          contact_phone: contactPhone.trim(),
          phone_is_whatsapp: phoneIsWhatsapp,
        }),
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

            {/* ── 🔴 CONTACT PHONE — REQUIRED. THE FIELD WHOSE ABSENCE MADE THIS PAGE UNCOMPLETABLE. ──
                Deliberately modelled on the demo modal's equivalent (DemoGetStarted.tsx) rather than
                invented: same `type="tel"`, same `autoComplete="tel"`, same "07700 900123" placeholder,
                same red-border-on-error treatment, same WhatsApp tick with the same words.
                ⚠️ NOT `required` ON THE INPUT, and that is deliberate. The native bubble would fire
                before validatePhone() and show the BROWSER's wording instead of ours — so the two
                signup paths would say different things about the same empty field. The button click
                validates instead, exactly as the demo's does.
                ⚠️ THE HELPER LINE IS NOT DECORATION. This is the one field on the page an operator has
                no obvious reason to expect, so it says who uses it before they wonder. */}
            <div>
              <label htmlFor="setup-phone" className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Phone
              </label>
              <input
                id="setup-phone" type="tel" autoComplete="tel" value={contactPhone}
                onChange={e => { setContactPhone(e.target.value); setPhoneError(null) }}
                placeholder="07700 900123"
                className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${phoneError ? 'border-red-400' : 'border-slate-200'}`} />
              {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
              <label className="flex items-center gap-2 mt-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={phoneIsWhatsapp} onChange={e => setPhoneIsWhatsapp(e.target.checked)}
                  className="w-4 h-4 accent-orange-600 cursor-pointer" />
                This number is on WhatsApp
              </label>
              {/* 🔴 THIS SENTENCE WAS WRITTEN WRONG FIRST AND CHECKED SECOND. The draft said the number
                  "isn't shown to customers unless you choose to share it in Settings". THAT IS FALSE.
                  provisionTruck writes the number to BOTH `contact_phone` and `whatsapp` and sets
                  `preferred_contact_method` to 'whatsapp' or 'phone' AT CREATION (provision-truck.ts:
                  430-436) — never null once a number exists. lib/email.ts:328-360 then renders a
                  "Questions about your order?" block on the CUSTOMER's order email reading
                  "Call us: <number>", or "WhatsApp us: <number>" linked to wa.me when the tick is on.
                  So it is customer-facing from the first order, and the copy has to say so. */}
              <p className="text-xs text-slate-500 mt-2">
                Customers see this on their order confirmation so they can ask about an order. The tick
                decides whether that reads &ldquo;Call us&rdquo; or &ldquo;WhatsApp us&rdquo;. You can
                change both in Settings.
              </p>
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
