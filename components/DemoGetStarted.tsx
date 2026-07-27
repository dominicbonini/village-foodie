'use client'

// components/DemoGetStarted.tsx
// THE persistent route forward out of the demo. Lives in the DEMO MODE banner, on all three surfaces.
//
// ── WHY THIS REPLACED THE SNOOZEABLE SAVE BAR ──────────────────────────────────────────────────────
// The save bar was the only forward action anywhere in the demo, and it could be snoozed. This is always
// visible and cannot be dismissed — but it is one line in a banner rather than a strip demanding an
// answer, so it's a lower-pressure ask than the thing it replaced, not a higher one. That matters: the
// spec's governing principle is "conversion comes from removing fear, not adding pressure".
//
// ── WHAT IT ACTUALLY DOES, AND WHY THAT'S HONEST ───────────────────────────────────────────────────
// TWO paths, chosen by `canSetup` (NEXT_PUBLIC_SIGNUP_PUBLIC + a token):
//
//   • Signup OFF (or the slug-only surface) — unchanged: "Save my menu" opens the SAME email capture as
//     /api/demo/save-email. It saves their demo for 14 days, emails a link back, and puts their address
//     where a human can follow up. The copy promises exactly that and no more.
//
//   • Signup ON — self-serve signup happens IN THIS MODAL, over the still-visible demo, as a TWO-STEP identity
//     wizard that reads as step 1 of the wizard the operator continues into at Manage. "Set up my truck" no
//     longer navigates to /signup (unfamiliar dark chrome that re-asks for an email we already have). Steps:
//       STEP 1 "About your truck":  name · truck name · cuisine(s) · logo (optional)
//       STEP 2 "Finish setting up": phone(+WhatsApp) · email · password · terms
//     Emoji is AUTO-derived from the first cuisine at submit (no emoji field; changeable later in Settings).
//     On step-2 submit it orchestrates the EXISTING endpoints/actions without changing any contract, in order:
//       (a) POST /api/signup                { email, password, demo:<token> }          — account+operator+claim
//       (·) signInWithPassword                                                         — cookie session
//       (c) POST /api/auth/update-profile   { name }                                   — operator name  (B-E)
//       (b) POST /api/setup                 { action:'create_truck', name }            — the real truck
//       (d) POST /api/manage update_settings { cuisine_type, truck_emoji, contact_phone, whatsapp,
//                                              phone_is_whatsapp }                      — truck fields  (B-E)
//       (e) get_upload_url → PUT → update_settings { logo_storage_path }               — logo          (B-E)
//     then redirect to /manage/<token>?import=demo (SKIP /setup — its identity step only re-asks the truck
//     name we already wrote). (a)+(b) are CRITICAL (failure keeps them in the wizard with the real error; the
//     retry re-runs only from sign-in, never re-creating via the accountCreated guard). (c)/(d)/(e) are
//     BEST-EFFORT (log, continue, redirect anyway — every field is editable in Settings). /signup STAYS as the
//     route for direct traffic — this is an additional, in-context entry, not a replacement.
//
// This component is still the single place to re-point the demo→signup handover.
//
// IDENTIFIER: token on the dashboard/KDS, slug on the customer order page (which never sees the token).
// The endpoint accepts either; both are `demo-` prefixed and 130-bit random.

import { useState, useEffect, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { CUISINES, CUISINE_OTHER, emojiForCuisine } from '@/lib/cuisines'

/** THE signup offer, stated once. Every demo surface that makes the offer imports this rather than
 *  retyping it — the DEMO MODE banner already drifted into three copies of itself once, and an offer
 *  that says different things in different places is the one piece of copy you cannot afford to have
 *  drift. The two lines belong together: the heading is the offer, the sub is the reason it's safe. */
export const SIGNUP_OFFER = {
  heading: 'Sign up for your free month now',
  sub: 'The clock doesn’t start until you decide to go live.',
} as const

export function DemoGetStarted({ token, slug, label = 'Save my menu →', className }: {
  token?: string
  slug?: string
  /** Trigger label. The banner uses the arrowed default; the loop-complete card passes a plain one.
   *
   *  ── WHY "SAVE MY MENU" ──────────────────────────────────────────────────────────────────────────
   *  "Save" is the natural verb for what the button actually does, and it pairs directly with the demo's
   *  own warning — "this demo resets when you leave". It reads as the ANSWER to that warning rather than
   *  a generic ask, which is a different thing psychologically: the visitor isn't being invited to become
   *  a customer, they're being offered a way not to lose something they already built.
   *
   *  Clicking opens an explainer modal, so the BUTTON doesn't have to carry the commitment — the modal
   *  states the offer and what happens next. That frees the label to be the smallest true thing.
   *
   *  ── WHY NOT THE ALTERNATIVES ────────────────────────────────────────────────────────────────────
   *  "Start free trial" would CONTRADICT the sub-line directly beneath it: the trial does not start at
   *  signup, it starts at go-live — the entire promise the funnel rests on. It would undo the reassurance
   *  in the same breath as offering it. "Sign up now" is accurate but asks for commitment the button
   *  doesn't need to ask for. "Get started" (the original) was vaguer than either and named nothing.
   *
   *  ⚠️ ACCURATE TODAY, and stays accurate: the button genuinely saves their menu. Until Steps 2+3 land
   *  it does ONLY that (email capture, 14-day keep, link back) — which is exactly what the label claims. */
  label?: string
  /** Trigger styling. Omitted → the small banner pill. The card passes a full-size button. */
  className?: string
}) {
  const key = token || slug || ''
  const storeKey = `hg_demo_saved_${key}`
  // The email is persisted alongside the date so that after a reload the post-save "Set up my truck →" CTA
  // can open the modal with the field ALREADY filled and the primary button ready — "rather than re-asking
  // to save". Same client-only limitation as the saved date (see the state report): it does not travel to
  // another device. The durable pre-fill is /signup reading demo_sessions server-side, which is unbuilt.
  const emailKey = `hg_demo_email_${key}`

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedUntil, setSavedUntil] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // TRUE only immediately after a save-only action, while the modal is still open — it gates the "You’re all
  // set" confirmation view. Reset on close, so RE-opening the modal from the post-save CTA lands on the
  // setup form (email pre-filled), not the confirmation, and never re-asks to save.
  const [justSaved, setJustSaved] = useState(false)

  // ── THE IN-MODAL SIGNUP WIZARD (replaces the navigation to /signup) ──────────────────────────────────
  // The handover must not leave the demo. The "Set up my truck" button opens a TWO-STEP identity wizard
  // THROUGH the modal, over the still-visible demo — the same wizard the operator continues into at Manage:
  //   'landing' → the existing email capture (email in hand from here on)
  //   'truck'   → STEP 1 "About your truck":   name · truck name · cuisine(s) · logo (optional)
  //   'details' → STEP 2 "Finish setting up":  phone(+WhatsApp) · email(text+change) · password · terms
  // BOTH steps sit under ONE stepper entry ("Your details"), like the import wizard's reviewStep 1+2 under
  // "Menu". Every field is held in CLIENT STATE only — NOTHING is written server-side until step 2 submits,
  // so a bail-out from step 1 costs nothing. We never navigate until the whole chain succeeds.
  type Step = 'landing' | 'truck' | 'details'
  const [step, setStep] = useState<Step>('landing')
  const [operatorName, setOperatorName] = useState('')
  const [truckName, setTruckName] = useState('')
  const [password, setPassword] = useState('')

  // ── STEP 1 "About your truck" state ────────────────────────────────────────────────────────────────────
  // Logo is optional; held as a File until submit, then uploaded via the existing get_upload_url path (b-e-s-t
  // effort). Preview URL is object-URL only (revoked on change/close).
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  // CUISINE — up to 3 slots, each a <select> value ('' | a cuisine name | 'Other'); an "Other" slot carries
  // free text. Resolved cuisines (dedup, non-empty) are comma-joined to trucks.cuisine_type — the format the
  // live discovery filter splits on (see lib/cuisines.ts). Slots start at one empty select.
  const [cuisineSlots, setCuisineSlots] = useState<{ value: string; other: string }[]>([{ value: '', other: '' }])
  // No emoji field in the wizard — the truck emoji is auto-derived from the first cuisine at submit
  // (emojiForCuisine) and changeable later in Settings.

  // ── STEP 2 "Finish setting up" (contact details) state ─────────────────────────────────────────────────
  const [contactPhone, setContactPhone] = useState('')
  const [phoneIsWhatsapp, setPhoneIsWhatsapp] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  // On the details step we DON'T render a second email input — the address is already captured. "change" reveals it.
  const [showEmailEdit, setShowEmailEdit] = useState(false)
  // Password show/hide. There is no confirm-password field, so single entry is only safe if they can SEE what
  // they typed — the eye toggle inside the field flips it. Default hidden.
  const [showPassword, setShowPassword] = useState(false)
  // Per-field validation, all checked AT ONCE per step (never one-at-a-time). Cleared as each field is edited.
  const [fieldErrors, setFieldErrors] = useState<{ truck?: string; cuisine?: string; name?: string; password?: string; email?: string; terms?: string }>({})
  // Refs so validation can FOCUS the first invalid field (the primary button stays enabled and validates on click).
  const truckRef = useRef<HTMLInputElement>(null)
  const cuisineRef = useRef<HTMLSelectElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Resolved cuisine list (dedup, non-empty). An 'Other' slot resolves to its free text.
  const resolvedCuisines = (() => {
    const out: string[] = []
    for (const s of cuisineSlots) {
      const v = s.value === CUISINE_OTHER ? s.other.trim() : s.value.trim()
      if (v && !out.includes(v)) out.push(v)
    }
    return out
  })()

  // waFromPhone — replicated VERBATIM from Settings (app/manage/[token]/page.tsx:6676; it is not exported).
  // Customer-facing `whatsapp` = the phone WHEN "this number is on WhatsApp" is ticked; else '' (NOT null —
  // trucks.whatsapp is NOT NULL with a '' default). Computing it at submit keeps it in sync with the final
  // phone + tick, reproducing Settings' re-sync-on-blur / clear-on-untick behaviour.
  const waFromPhone = (phone: string | null, isWa: boolean) => (isWa && (phone || '').trim() ? phone : '')

  // 🔴 PARTIAL-FAILURE GUARD. Once /api/signup has created the account, a retry (after the truck step fails)
  // must NOT re-run it — the account exists and a second create would 409 on a duplicate. This flag makes the
  // account step run at most once per modal lifetime; the retry re-runs sign-in → name → truck only.
  const [accountCreated, setAccountCreated] = useState(false)
  const [existing, setExisting] = useState(false)
  // CREATION PROGRESS. Once step 2 submits, the form is replaced by a 3-stage list that ticks off as each
  // WRITE returns — the confirmation trails the write, never leads it. A stage flips to 'done' only after its
  // server call returns ok; on failure it flips to 'error' (with the error shown at that row) and the chain
  // stops. 'account' ← /api/signup(+sign-in) · 'truck' ← create_truck · 'menu' ← the /manage import hand-off.
  type Stage = 'pending' | 'active' | 'done' | 'error'
  const [stages, setStages] = useState<{ account: Stage; truck: Stage; menu: Stage }>({ account: 'pending', truck: 'pending', menu: 'pending' })
  // Set ONLY after all three writes have genuinely returned ok — holds the dashboard token and switches the
  // view to the "Your account's ready" confirmation beat. The redirect fires on Continue, never automatically,
  // so the confirmation confirms done work rather than leading it. Null on any failure (the error state stays).
  const [readyToken, setReadyToken] = useState<string | null>(null)

  // Read POST-HYDRATION only — a lazy initialiser reading localStorage would make the first client render
  // disagree with the server HTML. Deferred a tick so the read isn't a synchronous setState in the effect
  // body (react-hooks/set-state-in-effect); the CTA simply renders for one frame before flipping to the
  // saved state, which is imperceptible and correct.
  useEffect(() => {
    if (typeof window === 'undefined' || !key) return
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(storeKey)
        if (raw !== null) setSavedUntil(raw)
        const savedEmail = localStorage.getItem(emailKey)
        if (savedEmail) setEmail(savedEmail)
      } catch { /* private mode — they just get the CTA again */ }
    }, 0)
    return () => clearTimeout(t)
  }, [storeKey, emailKey, key])

  // ── The primary "Set up my truck" path is GATED behind a PUBLIC env flag ─────────────────────────────
  // NEXT_PUBLIC_SIGNUP_PUBLIC is the client mirror of the server's SIGNUP_PUBLIC (which guards /api/signup).
  // While signup ships OFF, /api/signup returns 403 — so a visible "Set up my truck" button would walk the
  // highest-intent click straight into a refusal, the exact trap this component's own header warns against.
  // OFF → email-capture only (today's behaviour). ON → the primary button appears. One env var to flip, no
  // code change. It's a mirror, not the source of truth: the server flag still enforces; this only decides
  // whether we OFFER the door.
  //
  // ALSO requires a token: the in-modal signup POSTs { demo:<token> } to /api/signup, which claims the demo
  // by looking the truck up on dashboard_token — the customer order page surface only has a slug, which can't
  // drive that lookup, so setup is offered only where a token exists (dashboard + KDS). The slug surface
  // keeps the email-link path, which save-email accepts by slug.
  const canSetup = process.env.NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' && !!token

  // Shared capture for the "just email me a link" fallback (saveOnly). POSTs the address (same call, same
  // body, same ok:false handling as before) and returns the deletion date on success, or null on failure with
  // the error already surfaced. The self-serve signup path no longer routes through here — /api/signup itself
  // claims the demo, so no separate save-email round-trip is needed on the setup path.
  const doSave = async (): Promise<string | null> => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/demo/save-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(token ? { token } : { slug }), email: email.trim() }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Couldn’t save that — try again.'); return null }
      const until = data.deletionDate ?? ''
      try {
        localStorage.setItem(storeKey, until)
        localStorage.setItem(emailKey, email.trim())
      } catch { /* private mode */ }
      if (data.emailSent === false) {
        setError(data.warning ?? 'Saved — but we couldn’t email the link just now.')
      }
      return until
    } catch {
      setError('Couldn’t reach us just now — try again.')
      return null
    } finally {
      setBusy(false)
    }
  }

  // SECONDARY — "just email me a link": save, then show the confirmation state. Unchanged from today.
  const saveOnly = async () => {
    const until = await doSave()
    if (until !== null) { setSavedUntil(until); setJustSaved(true) }
  }

  // Closing always clears the just-saved flag AND rewinds the wizard to the landing view, so the NEXT open
  // (e.g. from the post-save "Set up my truck →" CTA) starts on the email/setup form, not the confirmation or
  // a half-finished step. The captured answers (email/name/truck) and the accountCreated guard PERSIST — so a
  // visitor who closed mid-signup after their account was created resumes without re-typing or re-creating.
  const closeModal = () => {
    setOpen(false); setJustSaved(false); setStep('landing'); setShowEmailEdit(false); setShowPassword(false); setFieldErrors({})
    setStages({ account: 'pending', truck: 'pending', menu: 'pending' })
    setReadyToken(null)
    if (logoPreview) { try { URL.revokeObjectURL(logoPreview) } catch { /* noop */ } }
  }

  // ── STEP-1 CUISINE + LOGO HELPERS ──────────────────────────────────────────────────────────────────────
  const clearFieldErr = (k: keyof typeof fieldErrors) =>
    setFieldErrors(p => (p[k] ? { ...p, [k]: undefined } : p))

  // The truck emoji is NOT chosen here — it's auto-derived from the first cuisine at submit (emojiForCuisine),
  // and changeable later in Settings. So the cuisine handlers just update the slots + clear the error.
  const setCuisineValue = (i: number, value: string) => {
    setCuisineSlots(prev => prev.map((s, j) => j === i ? { ...s, value } : s))
    clearFieldErr('cuisine')
  }
  const setCuisineOther = (i: number, other: string) => {
    setCuisineSlots(prev => prev.map((s, j) => j === i ? { ...s, other } : s))
    clearFieldErr('cuisine')
  }
  const addCuisineSlot = () => setCuisineSlots(prev => prev.length >= 3 ? prev : [...prev, { value: '', other: '' }])
  const removeCuisineSlot = (i: number) => setCuisineSlots(prev => prev.length <= 1 ? prev : prev.filter((_, j) => j !== i))

  const onLogoPick = (file: File | null) => {
    if (logoPreview) { try { URL.revokeObjectURL(logoPreview) } catch { /* noop */ } }
    setLogoFile(file)
    setLogoPreview(file ? URL.createObjectURL(file) : null)
  }

  // ── VALIDATION — per step, ALL fields at once, inline (never one-at-a-time) ───────────────────────────────
  // Step 1 (Your truck) validates on Continue; step 2 (Your details) on submit. The primary button stays
  // ENABLED and validates on click, so nobody fills the form only to learn a rule afterwards. On failure each
  // sets every inline error and FOCUSES the first invalid field.
  // STEP 1 "About your truck": name · truck · cuisine.
  const validateTruckStep = (): boolean => {
    const errs: typeof fieldErrors = {}
    if (operatorName.trim().length < 2) errs.name = 'Tell us your name.'
    if (truckName.trim().length < 2) errs.truck = 'Give your truck a name.'
    if (resolvedCuisines.length === 0) errs.cuisine = 'Tell us what you cook.'
    setFieldErrors(errs)
    if (errs.name) nameRef.current?.focus()
    else if (errs.truck) truckRef.current?.focus()
    else if (errs.cuisine) cuisineRef.current?.focus()
    return Object.keys(errs).length === 0
  }
  // STEP 2 "Finish setting up" (contact details): email · password · terms. Password rule MIRRORS the server
  // (app/api/signup/route.ts: `const MIN_PASSWORD = 8` → `if (password.length < MIN_PASSWORD)`), byte-for-byte.
  // Terms must be ACTIVELY ticked (blocks submit).
  const validateDetailsStep = (): boolean => {
    const errs: typeof fieldErrors = {}
    if (!email.includes('@')) errs.email = 'Enter a valid email address.'
    if (password.length < 8) errs.password = 'Password must be at least 8 characters.'
    if (!termsAccepted) errs.terms = 'Please accept the terms to continue.'
    setFieldErrors(errs)
    if (errs.email) setShowEmailEdit(true)   // reveal the hidden email so the error has somewhere to point
    if (errs.email) setTimeout(() => emailRef.current?.focus(), 0)   // input mounts once showEmailEdit flips
    else if (errs.password) passwordRef.current?.focus()
    return Object.keys(errs).length === 0
  }

  // ── SETUP ORCHESTRATION — the whole handover, in order, each call checked ────────────────────────────────
  // Order: (a) /api/signup → sign in → (c) update-profile(name) → (b) create_truck →
  //   (d) update_settings(cuisine_type/truck_emoji/contact_phone/whatsapp/phone_is_whatsapp) → (e) logo → redirect.
  // (a)+(b) are CRITICAL — a failure keeps them in the wizard with the real error; the retry re-runs (a is
  //   guarded by accountCreated, never re-created). (c)+(d)+(e) are BEST-EFFORT — log, continue, redirect
  //   anyway (every field there is editable in Settings; a blocked signup is far worse than a missing logo).
  // NOTHING navigates until (b) succeeds.
  const runSetup = async () => {
    if (!validateDetailsStep()) return   // validate step 2 (all at once) before any state flip or server write
    setBusy(true); setError(null); setExisting(false)
    // Seed the progress list. On a RETRY the account already exists (accountCreated) → its row starts 'done',
    // never re-shown as in-flight; the rest reset to run again.
    setStages({ account: accountCreated ? 'done' : 'active', truck: 'pending', menu: 'pending' })
    const supabase = createSupabaseBrowserClient()

    // (a) ACCOUNT — /api/signup { email, password, demo:<token> }. Guarded so a retry never re-creates it.
    // Terms acceptance is RECORDED server-side unconditionally here (operators.terms_accepted_at +
    // terms_version, app/api/signup/route.ts:119-120) — the modal's tick is the client gate; no contract change.
    if (!accountCreated) {
      try {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, demo: token }),
        })
        const data = await res.json().catch(() => ({}))
        if (!data.ok) {
          // 409 existing / 403 gate closed / validation — surface the real message and stay put. The account
          // was NOT created, so leaving the guard false is correct: the button becomes a normal retry.
          setStages(s => ({ ...s, account: 'error' }))
          setError(data.error || 'Could not create your account.')
          setExisting(!!data.existing)
          setBusy(false); return
        }
        // Account is REALLY made now — only now may its row show progress complete (it flips to 'done' after
        // sign-in below, so the confirmation trails the whole account step, not just the signup POST).
        setAccountCreated(true)
      } catch {
        setStages(s => ({ ...s, account: 'error' }))
        setError('Couldn’t reach us just now — try again.')
        setBusy(false); return
      }
    }

    // SIGN IN — establishes the cookie session /api/setup requires. Idempotent, so it is safe on every retry.
    // If it fails AFTER the account exists, we can't create the truck in-modal — send them to /login to carry
    // on (the account is real). We never re-create; accountCreated stays true.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInErr) {
      window.location.assign('/login?message=signed_up')
      return
    }
    // Account fully done (created + signed in); the truck step begins.
    setStages(s => ({ ...s, account: 'done', truck: 'active' }))

    // (c) NAME — best-effort via /api/auth/update-profile { name }. A missing name is cosmetic; it must NEVER
    // block the chain. We still CHECK the response (not fire-and-forget) — we just log a non-ok and move on.
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: operatorName.trim() }),
      })
      if (!res.ok) console.error('[demo-signup] name update non-ok (non-blocking):', res.status)
    } catch (e) {
      console.error('[demo-signup] name update failed (non-blocking):', e)
    }

    // (b) TRUCK — /api/setup action=create_truck { name:<truck name> }. CRITICAL. On ok:false we STAY in the
    // modal with the real error; the submit button then re-runs runSetup, re-attempting ONLY this (a guarded).
    // Both response shapes carry the token: fresh { truck: result.truck } and idempotent { truck: existing[0],
    // resumed: true } (existing[0] selects id, dashboard_token, setup_step) — read it from either.
    let dashboardToken: string | null = null
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_truck', name: truckName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) {
        setStages(s => ({ ...s, truck: 'error' }))
        setError(data.error || 'Your account’s ready, but we couldn’t create your truck. Try again.')
        setBusy(false); return
      }
      dashboardToken = data.truck?.dashboard_token ?? null
    } catch {
      setStages(s => ({ ...s, truck: 'error' }))
      setError('Your account’s ready, but we couldn’t reach us to create your truck. Try again.')
      setBusy(false); return
    }

    // 🔴 Never redirect blind. If create_truck succeeded but returned no token, we cannot build the /manage
    // hand-off — surface it and keep them in the modal rather than navigating to a broken URL.
    if (!dashboardToken) {
      setStages(s => ({ ...s, truck: 'error' }))
      setError('Your truck is set up, but we couldn’t open it just now. Try again.')
      setBusy(false); return
    }
    // Truck row exists — mark it done ONLY now (after create_truck returned a token) and start the menu step.
    // The best-effort settings + logo writes below run under this "Loading your menu" phase; they never block
    // or fail the flow, so the menu row stays 'active' right up to the redirect.
    setStages(s => ({ ...s, truck: 'done', menu: 'active' }))

    // (d) SETTINGS — /api/manage update_settings, the SAME action + top-level-field shape Settings uses
    // (allowlist covers all five: cuisine_type, truck_emoji, contact_phone, whatsapp, phone_is_whatsapp —
    // app/api/manage/route.ts:796-801). BEST-EFFORT: log and carry on. `truck_emoji` is AUTO-derived from the
    // first cuisine (no emoji field in the wizard — changeable later in Settings). `whatsapp` is derived via
    // waFromPhone (Settings' exact rule) so it clears to '' when the tick is off.
    try {
      const res = await fetch('/api/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: dashboardToken,
          action: 'update_settings',
          cuisine_type: resolvedCuisines.join(', '),
          truck_emoji: emojiForCuisine(resolvedCuisines[0]),
          contact_phone: contactPhone.trim(),
          whatsapp: waFromPhone(contactPhone.trim(), phoneIsWhatsapp),
          phone_is_whatsapp: phoneIsWhatsapp,
        }),
      })
      if (!res.ok) console.error('[demo-signup] update_settings non-ok (non-blocking):', res.status)
    } catch (e) {
      console.error('[demo-signup] update_settings failed (non-blocking):', e)
    }

    // (e) LOGO — best-effort via the existing get_upload_url path (PUT to signed URL → write logo_storage_path).
    if (logoFile) {
      try {
        const up = await fetch('/api/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: dashboardToken, action: 'get_upload_url', filename: logoFile.name, content_type: logoFile.type }),
        })
        const upData = await up.json().catch(() => ({}))
        if (up.ok && upData.upload_url && upData.path) {
          await fetch(upData.upload_url, { method: 'PUT', body: logoFile, headers: { 'Content-Type': logoFile.type } })
          await fetch('/api/manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: dashboardToken, action: 'update_settings', logo_storage_path: upData.path }),
          })
        } else {
          console.error('[demo-signup] logo upload url non-ok (non-blocking):', up.status)
        }
      } catch (e) {
        console.error('[demo-signup] logo upload failed (non-blocking):', e)
      }
    }

    // Everything critical landed and the best-effort writes have returned. Mark the last row done and show the
    // "Your account's ready" confirmation beat — the redirect fires on Continue (openTruck), NOT here — so the
    // confirmation trails genuinely-completed work rather than leading it. (Skip /setup entirely: its identity
    // step only re-asks the truck name we already wrote — Continue goes straight to the menu import wizard.)
    setStages(s => ({ ...s, menu: 'done' }))
    setReadyToken(dashboardToken)
    setBusy(false)
  }

  // Fired by the confirmation beat's "Continue →" — the ONLY place the hand-off to Manage happens now.
  const openTruck = () => {
    if (!readyToken) return
    window.location.assign(`/manage/${encodeURIComponent(readyToken)}?import=demo`)
  }

  // POST-SAVE, modal closed. The demo's most valuable slot must never go dead, so when setup is open we keep
  // a live CTA here instead of a status label — the SAME "Set up my truck →" label + modal as the primary
  // action, so it reads as one destination, not two. It opens the modal on the SETUP form (justSaved=false),
  // email pre-filled, button ready.
  //
  // Signup OFF (or the slug-only surface) → there is no honest CTA to offer (a "set up" button would lead to
  // a 403), so keep today's status label with the retention date. The date still reaches them via the modal
  // success state and the return email regardless — this label is a convenience, not the only carrier.
  if (savedUntil !== null && !open) {
    if (canSetup) {
      return (
        <button
          type="button"
          onClick={() => { setJustSaved(false); setOpen(true) }}
          className={className ?? 'shrink-0 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black px-4 py-1.5 rounded-lg whitespace-nowrap shadow-sm'}
        >
          Set up my truck →
        </button>
      )
    }
    return (
      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">
        ✓ Saved{savedUntil ? ` — kept until ${savedUntil}` : ''}
      </span>
    )
  }

  // The "You’re all set" confirmation shows ONLY right after a save-only action (justSaved), never on a
  // re-open from the post-save CTA — which lands on the setup form with the email pre-filled instead.
  const showConfirmation = savedUntil !== null && justSaved
  // The two identity steps share the import wizard's chrome (border header/footer, left h3, stepper); the
  // landing + confirmation views keep the lightweight centred capture chrome.
  const inWizard = step === 'truck' || step === 'details'
  // In-progress once creation has started (any stage past 'pending'): the details form is replaced by the
  // progress list, and the ‹ back control is suppressed so the flow can't be rewound mid-creation.
  const inProgress = stages.account !== 'pending'
  // All writes returned ok → show the confirmation beat (Continue → redirect) instead of the progress list.
  const ready = readyToken !== null

  return (
    <>
      {/* ORANGE. Slate was tried and it "belonged" too well — it read as chrome, and this is the ONLY
          forward action in the entire demo, so blending in is the one thing it cannot do.
          The earlier warm-on-warm objection no longer holds: that was against a SOLID amber-400 ground.
          Against the muted amber-100 the orange separates cleanly, and now that the "Not available in demo"
          chips are amber too, orange means exactly ONE thing on every demo surface — the thing to click.
          Deliberately heavier than the surrounding chrome (font-black, shadow) so it reads as the primary
          action on the screen rather than a control in a status bar. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'shrink-0 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black px-4 py-1.5 rounded-lg whitespace-nowrap shadow-sm'}
      >
        {label}
      </button>

      {/* PORTAL TO <body> — this modal is position:fixed, but DemoModeBanner's action slot
          (components/DemoModeBanner.tsx:42) uses `-translate-y-1/2`, and a transformed ancestor becomes the
          containing block for fixed descendants → inset-0 resolved to a button-sized box at the banner's
          right edge (silent, no error). Portalling out to <body> escapes that ancestor entirely, so inset-0
          means the viewport again. Same SSR guard + createPortal pattern as DemoUpload.tsx:258-259. */}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4"
          onClick={() => {
            // Backdrop-click dismissal fires ONLY on 'landing'. Both wizard steps ('truck' AND 'details') are
            // therefore blocked — typed answers are too expensive to lose to a stray click; the × and the ‹ back
            // control are the only ways out. This is the ONLY dismissal path from a backdrop click (the card
            // stops propagation just below; the only other closeModal callers are the two × buttons). There is
            // no Escape-to-close handler anywhere, so Escape already never dismisses any view. NB: guard on the
            // POSITIVE 'landing', not a negative against a step name the machine might rename — a stale
            // `step !== 'setup'` here was the earlier "step 1 closes" bug.
            if (!busy && step === 'landing') closeModal()
          }}>
          {/* Fixed-height flex shell (reference manual): header shrink-0 · body flex-1 min-h-0
              overflow-y-auto · footer shrink-0. Card matches the import wizard's max-w-md upload/done variant
              (rounded-2xl shadow-2xl) so the modal reads as step 1 of the SAME wizard. */}
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] text-left"
            onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            {inWizard ? (
              // WIZARD-STEP HEADER — matches the import wizard's review/kitchen header verbatim: p-5 border-b,
              // left-aligned font-black h3, × top-right, with the shared stepper below.
              <div className="p-5 border-b border-slate-100 shrink-0 relative">
                {/* BACK — details→truck→landing, one step at a time. Hidden while busy AND once creation has
                    started (can't rewind mid-write, and the account/truck may already exist). */}
                {!busy && !inProgress && (
                  <button type="button" aria-label="Back"
                    onClick={() => setStep(step === 'details' ? 'truck' : 'landing')}
                    className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 text-2xl leading-none">‹</button>
                )}
                <div className="flex items-start justify-between gap-3 pl-6">
                  <h3 className="font-black text-slate-900">{step === 'truck' ? 'About your truck' : 'Finish setting up'}</h3>
                  {!busy && (
                    <button type="button" onClick={closeModal} aria-label="Close"
                      className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0">×</button>
                  )}
                </div>
                {/* STEPPER — reproduces renderWizardStepper (app/manage/[token]/page.tsx:2263-2276). BOTH modal
                    steps sit under ONE entry, "Your details" (current); Menu · Allergens · Kitchen setup ·
                    Schedule follow as display-only (no navigation here). Short list, NOT the hasExtras variant —
                    the modal can't know whether extras exist, and a step appearing later beats one disappearing.
                    Scrolls horizontally in its own track (5 pills > max-w-md) so the modal body never does. */}
                <div className="flex items-center gap-1.5 mt-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {[
                    { key: 'details', label: 'Your details' },
                    { key: 'menu', label: 'Menu' },
                    { key: 'allergens', label: 'Allergens' },
                    { key: 'kitchen', label: 'Kitchen setup' },
                    { key: 'schedule', label: 'Schedule' },
                  ].map((s, i, arr) => (
                    <Fragment key={s.key}>
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${s.key === 'details' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${s.key === 'details' ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
                        {s.label}
                      </span>
                      {i < arr.length - 1 && <span className="text-slate-300 text-xs shrink-0">›</span>}
                    </Fragment>
                  ))}
                </div>
              </div>
            ) : (
              // LANDING / CONFIRMATION HEADER — the lightweight capture, unchanged.
              <div className="px-6 pt-6 pb-4 shrink-0 relative">
                <h3 className="font-black text-slate-900 text-center px-6">
                  {showConfirmation ? 'You’re all set' : canSetup ? 'Set up your truck' : 'Save your demo'}
                </h3>
                {!showConfirmation && (
                  <p className="text-sm text-slate-600 text-center mt-1">
                    {canSetup
                      ? 'Everything you’ve just built carries straight over.'
                      : 'We’ll keep it for 14 days and email you a link straight back.'}
                  </p>
                )}
                {!busy && (
                  <button type="button" onClick={closeModal} aria-label="Close"
                    className="absolute top-4 right-5 text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
                )}
              </div>
            )}

            <div className={`flex-1 min-h-0 overflow-y-auto ${inWizard ? 'p-5' : 'px-6'}`}>
              {showConfirmation ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    We&apos;ve emailed you a link straight back to this demo — no login needed.
                  </p>
                  {savedUntil && (
                    <p className="text-sm text-slate-600">
                      We&apos;ll keep it until <strong>{savedUntil}</strong>. Your menu comes with you when
                      you set up properly.
                    </p>
                  )}
                  {error && <p className="text-sm text-amber-700">{error}</p>}
                </div>
              ) : step === 'truck' ? (
                // STEP 1 "About your truck" — client state only; nothing is written until step 2 submits.
                <div className="space-y-4">
                  {/* Your name */}
                  <div>
                    <label htmlFor="demo-name" className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Your name</label>
                    <input
                      id="demo-name" ref={nameRef} type="text" autoComplete="name" value={operatorName} autoFocus
                      onChange={e => { setOperatorName(e.target.value); clearFieldErr('name') }}
                      placeholder="Your name"
                      className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${fieldErrors.name ? 'border-red-400' : 'border-slate-200'}`}
                    />
                    {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
                  </div>

                  {/* Truck name */}
                  <div>
                    <label htmlFor="demo-truck" className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Truck name</label>
                    <input
                      id="demo-truck" ref={truckRef} type="text" autoComplete="organization" value={truckName}
                      onChange={e => { setTruckName(e.target.value); clearFieldErr('truck') }}
                      placeholder="e.g. The Village Kitchen"
                      className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${fieldErrors.truck ? 'border-red-400' : 'border-slate-200'}`}
                    />
                    {fieldErrors.truck && <p className="text-xs text-red-600 mt-1">{fieldErrors.truck}</p>}
                  </div>

                  {/* Cuisine — up to 3 native selects (alphabetical), "+ Choose another" reveals the next, chips
                      appear at 2+, "Other…" reveals free text. Comma-joined to trucks.cuisine_type. The truck's
                      emoji is auto-derived from the FIRST cuisine at submit — no emoji field is shown here
                      (it's changeable later in Settings). */}
                  <div>
                    <label htmlFor="demo-cuisine-0" className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Cuisine</label>
                    <div className="flex flex-col gap-2">
                      {cuisineSlots.map((slot, i) => (
                        <div key={i} className="flex flex-col gap-1.5">
                          <select
                            id={`demo-cuisine-${i}`} ref={i === 0 ? cuisineRef : undefined} value={slot.value}
                            onChange={e => setCuisineValue(i, e.target.value)}
                            className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${fieldErrors.cuisine ? 'border-red-400' : 'border-slate-200'}`}>
                            <option value="">Choose a cuisine…</option>
                            {CUISINES.map(c => <option key={c} value={c}>{c === CUISINE_OTHER ? 'Other…' : c}</option>)}
                          </select>
                          {slot.value === CUISINE_OTHER && (
                            <input type="text" value={slot.other} onChange={e => setCuisineOther(i, e.target.value)}
                              placeholder="Tell us your cuisine"
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                          )}
                        </div>
                      ))}
                    </div>
                    {cuisineSlots.length < 3 && (
                      <button type="button" onClick={addCuisineSlot}
                        className="mt-2 text-xs font-bold text-orange-600 hover:text-orange-700">+ Choose another</button>
                    )}
                    {/* Chips — only once 2+ cuisines are chosen; each removable. */}
                    {resolvedCuisines.length >= 2 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {cuisineSlots.map((slot, i) => {
                          const label = slot.value === CUISINE_OTHER ? slot.other.trim() : slot.value.trim()
                          if (!label) return null
                          return (
                            <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                              {label}
                              <button type="button" aria-label={`Remove ${label}`} onClick={() => removeCuisineSlot(i)}
                                className="text-orange-400 hover:text-orange-700 leading-none">×</button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {fieldErrors.cuisine && <p className="text-xs text-red-600 mt-1">{fieldErrors.cuisine}</p>}
                  </div>

                  {/* Logo — optional. NO placeholder tile: only the upload control shows until a file is picked
                      (an empty plate icon reads as a broken image). Once picked → preview + Change/Remove. */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Logo <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                    {logoPreview ? (
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element -- transient object-URL blob preview; next/image can't optimise it */}
                          <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm font-semibold rounded-lg border border-slate-300 px-3 py-1.5 cursor-pointer hover:bg-slate-50">
                          Change logo
                          <input type="file" accept="image/*" className="sr-only"
                            onChange={e => { onLogoPick(e.target.files?.[0] || null); e.currentTarget.value = '' }} />
                        </label>
                        <button type="button" onClick={() => onLogoPick(null)}
                          className="text-xs text-slate-400 hover:text-slate-600 underline">Remove</button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 text-sm font-semibold rounded-lg border border-slate-300 px-3 py-1.5 cursor-pointer hover:bg-slate-50">
                        📷 Upload logo
                        <input type="file" accept="image/*" className="sr-only"
                          onChange={e => { onLogoPick(e.target.files?.[0] || null); e.currentTarget.value = '' }} />
                      </label>
                    )}
                  </div>
                </div>
              ) : step === 'details' ? (
                // STEP 2 "Finish setting up" (contact details) — the ONLY step that writes (on submit). Views:
                //   ready      → the "Your account's ready" confirmation beat (all writes returned).
                //   inProgress → the progress list (each row flips to ✓ only after its write returns; ✕ on fail).
                //   else       → the form.
                ready ? (
                  <div className="space-y-2 py-3 text-center">
                    <p className="text-4xl">✅</p>
                    <h4 className="font-black text-slate-900 text-lg">Your account&apos;s ready</h4>
                    <p className="text-sm text-slate-600">Now let&apos;s finish setting up your truck — your menu, allergens and kitchen.</p>
                  </div>
                ) : inProgress ? (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-slate-600 mb-1">Hang tight — setting everything up.</p>
                    {([
                      { key: 'account', label: 'Creating your account' },
                      { key: 'truck', label: 'Setting up your truck' },
                      { key: 'menu', label: 'Loading your menu' },
                    ] as const).map(row => {
                      const st = stages[row.key]
                      return (
                        <div key={row.key} className="flex items-start gap-3">
                          <span className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center">
                            {st === 'done' ? <span className="text-green-600 text-base font-bold" aria-label="done">✓</span>
                              : st === 'error' ? <span className="text-red-600 text-base font-bold" aria-label="failed">✕</span>
                              : st === 'active' ? <span className="w-4 h-4 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" aria-label="in progress" />
                              : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200" aria-label="pending" />}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-sm ${st === 'done' ? 'text-slate-500' : st === 'error' ? 'text-red-600 font-semibold' : st === 'active' ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>{row.label}</p>
                            {st === 'error' && error && (
                              <p className="text-xs text-red-600 mt-0.5">
                                {error}{existing && <> <a href="/login" className="underline font-semibold">Sign in</a></>}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                <div className="space-y-4">
                  {/* Phone (optional) + the WhatsApp tick. `whatsapp` is derived from these at submit via
                      waFromPhone (Settings' exact rule) → written to trucks.whatsapp + phone_is_whatsapp. */}
                  <div>
                    <label htmlFor="demo-phone" className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Phone <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                    <input
                      id="demo-phone" type="tel" autoComplete="tel" value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)} placeholder="07700 900123"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    <label className="flex items-center gap-2 mt-2 text-sm text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={phoneIsWhatsapp} onChange={e => setPhoneIsWhatsapp(e.target.checked)}
                        className="w-4 h-4 accent-orange-600 cursor-pointer" />
                      This number is on WhatsApp
                    </label>
                  </div>

                  {/* Email as TEXT, not a second input, with "change" revealing an editable field on demand.
                      The hidden autocomplete="username" carrier sits just below, next to the password. */}
                  {showEmailEdit ? (
                    <div>
                      <label htmlFor="demo-email" className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Email</label>
                      <input
                        id="demo-email" ref={emailRef} type="email" inputMode="email" autoComplete="email" value={email}
                        onChange={e => { setEmail(e.target.value); clearFieldErr('email') }}
                        placeholder="you@yourtruck.co.uk"
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${fieldErrors.email ? 'border-red-400' : 'border-slate-200'}`}
                      />
                      {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">
                      Setting up as <strong className="text-slate-900">{email}</strong>{' '}
                      <button type="button" onClick={() => setShowEmailEdit(true)}
                        className="underline text-orange-600 hover:text-orange-700 text-xs font-semibold">change</button>
                    </p>
                  )}

                  {/* 🔴 PASSWORD-MANAGER USERNAME CARRIER. The email renders as text above, not an input, so
                      Safari/1Password have no field to pair with the new-password below — they'd offer no save.
                      This hidden-but-PRESENT input carries the username right next to the password (DOM
                      proximity is what managers key off). Visually hidden via opacity+1px, NOT display:none
                      (display:none is ignored by some managers). Kept in sync with the email state both ways:
                      value={email} pushes edits in, onChange catches a manager autofill back out. */}
                  <input
                    type="email" autoComplete="username" tabIndex={-1} aria-hidden="true" value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="absolute left-2 h-px w-px opacity-0 -z-10 pointer-events-none"
                  />

                  {/* Password — with an in-field show/hide eye. */}
                  <div>
                    <label htmlFor="demo-password" className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Password</label>
                    <div className="relative">
                      <input
                        id="demo-password" ref={passwordRef} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password}
                        onChange={e => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: undefined })) }}
                        onKeyDown={e => { if (e.key === 'Enter') runSetup() }}
                        placeholder="At least 8 characters"
                        className={`w-full border rounded-xl px-3 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${fieldErrors.password ? 'border-red-400' : 'border-slate-200'}`}
                      />
                      {/* type="button" is REQUIRED: an untyped button inside a form submits it. aria-label
                          reflects the current action so a screen reader announces "Show/Hide password". */}
                      <button
                        type="button" onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? (
                          // eye-off
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.45 18.45 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
                            <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          // eye
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {fieldErrors.password && <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>}
                  </div>

                  {/* Terms — must be ACTIVELY ticked (unticked by default); blocks submit via validateDetailsStep.
                      The acceptance itself is RECORDED server-side by /api/signup (operators.terms_accepted_at +
                      terms_version) — this tick is the client gate, no endpoint contract change. */}
                  <div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={termsAccepted}
                        onChange={e => { setTermsAccepted(e.target.checked); clearFieldErr('terms') }}
                        className="mt-0.5 w-4 h-4 accent-orange-600 cursor-pointer" />
                      <span className="text-xs text-slate-600">
                        I agree to the{' '}
                        <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-800">Terms</a>{' '}
                        and{' '}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-800">Privacy Policy</a>.
                      </span>
                    </label>
                    {fieldErrors.terms && <p className="text-xs text-red-600 mt-1">{fieldErrors.terms}</p>}
                  </div>

                  {/* Account-level error (409 existing / 403 gate / truck-create failure). */}
                  {error && (
                    <p className="text-sm text-red-600">
                      {error}{' '}
                      {existing && <a href="/login" className="underline font-semibold">Sign in</a>}
                    </p>
                  )}

                  {/* The free-month line lives HERE — the view where the commitment actually happens (§4). */}
                  <p className="text-sm text-slate-600">
                    Setting up won&apos;t start your free month. That begins when you pick your first live
                    event — whenever you&apos;re ready.
                  </p>
                </div>
                )
              ) : (
                // LANDING — the email capture (unchanged for the signup-OFF / slug-only path §5).
                <div className="space-y-3">
                  {/* ONE email field, required for BOTH actions. */}
                  <input
                    type="email" inputMode="email" autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)} placeholder="you@yourtruck.co.uk"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  {/* Plain text, NO tinted box (§8 reassurance, but subordinate here — the free-month line
                      gets its emerald block on the welcome popup, not on the action modal). Answers the one
                      fear that setting up starts a clock. On the canSetup path this line moves to step 3
                      (the actual commitment); here it stays for the email-only path where THIS is the commit. */}
                  {!canSetup && (
                    <p className="text-sm text-slate-600">
                      Setting up won&apos;t start your free month. That begins when you pick your first live
                      event — whenever you&apos;re ready.
                    </p>
                  )}
                  {/* RETROFIT: this capture has collected addresses since Phase 3 with no privacy notice
                      near it — a live compliance gap, not a Phase 4 nicety. One line by design. */}
                  <p className="text-xs text-slate-400">
                    We&apos;ll only use this to {canSetup ? 'set up your truck and send your demo link' : 'send your demo link and get you set up'} — see our{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
                      privacy policy
                    </a>.
                  </p>
                </div>
              )}
            </div>

            <div className={inWizard ? 'p-5 border-t border-slate-100 shrink-0' : 'px-6 pt-4 pb-6 shrink-0'}>
              {showConfirmation ? (
                <button type="button" onClick={closeModal}
                  className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl text-sm hover:bg-slate-800">
                  Back to the demo
                </button>
              ) : step === 'truck' ? (
                // STEP 1 → advance to "Your details". Validates step 1 on click (all at once); NO server write.
                <button type="button" onClick={() => { if (validateTruckStep()) { setError(null); setStep('details') } }} disabled={busy}
                  className="w-full bg-orange-600 text-white font-black py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700">
                  Continue →
                </button>
              ) : step === 'details' ? (
                // ready → the confirmation beat's Continue, the ONLY place the redirect fires. While a creation
                // attempt is IN FLIGHT (busy) the progress list is the feedback — no button. Otherwise: the
                // submit, which is ALSO the retry after a failed stage. runSetup skips the already-created
                // account (accountCreated guard) and re-attempts sign-in → name → truck only, so /api/signup
                // is NEVER re-run. It STAYS ENABLED and validates on CLICK (§3).
                ready ? (
                  <button type="button" onClick={openTruck}
                    className="w-full bg-orange-600 text-white font-black py-3 rounded-xl text-sm hover:bg-orange-700">
                    Continue →
                  </button>
                ) : busy ? null : (
                  <button type="button" onClick={runSetup}
                    className="w-full bg-orange-600 text-white font-black py-3 rounded-xl text-sm hover:bg-orange-700">
                    {inProgress ? 'Try again'
                      : 'Create my account →'}
                  </button>
                )
              ) : canSetup ? (
                // LANDING (canSetup) — enter the wizard at STEP 1 ("Your truck"). The email captured here carries
                // into the wizard. "Just email me a link" stays HERE, on the landing view only (§1).
                <div className="space-y-2">
                  <button type="button" onClick={() => { setError(null); setStep('truck') }} disabled={!email.includes('@')}
                    className="w-full bg-orange-600 text-white font-black py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700">
                    Set up my truck →
                  </button>
                  {/* SECONDARY — a text link, deliberately NOT a second solid button, so it reads as the
                      lower-intent fallback ("I'm not ready, just let me come back"). */}
                  <button type="button" onClick={saveOnly} disabled={busy || !email.includes('@')}
                    className="w-full text-slate-500 hover:text-slate-700 underline text-xs font-medium py-1 disabled:opacity-40">
                    Just email me a link to come back to this demo
                  </button>
                </div>
              ) : (
                // Signup OFF (or slug-only surface) — email capture is the ONLY action, so it's the solid one.
                <button type="button" onClick={saveOnly} disabled={busy || !email.includes('@')}
                  className="w-full bg-orange-600 text-white font-black py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700">
                  {busy ? 'Saving…' : 'Send me the link'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
