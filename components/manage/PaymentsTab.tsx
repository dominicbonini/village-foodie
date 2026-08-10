'use client'
// components/manage/PaymentsTab.tsx
// Manage → Payments. Creates the operator's Stripe connected account and hosts the three embedded
// components Stripe requires for our controller configuration.
//
// ── 🔴 ALL THREE COMPONENTS ARE MANDATORY, NOT A UI CHOICE ─────────────────────────────────────────
// Current Stripe docs, verified 10 August 2026: "When Stripe is responsible for negative balances on
// your connected accounts, you must integrate embedded components for onboarding, account management,
// and the notification banner." We chose `losses.payments: 'stripe'` deliberately (lib/stripe/connect.ts
// records why), so all three are required. The notification banner in particular is how Stripe tells a
// truck about outstanding requirements — dropping it would mean an account quietly losing the ability to
// take payments with nothing on screen saying so.
//
// ── 🔴 READINESS IS `charges_enabled`, NEVER "an account exists" ───────────────────────────────────
// `accountId` non-null means an account was created. It can sit un-verified for days. Every readiness
// statement on this page reads `chargesEnabled`, which the server re-reads FROM STRIPE on tab open —
// the cached column exists so the page need not block, not so the page can trust it.
//
// ── ⚠️ ONE CONNECT INSTANCE PER SESSION ───────────────────────────────────────────────────────────
// The docs call this out as a performance best practice: "Create a single Connect instance by calling
// loadConnectAndInitialize only once per session… A common mistake is to create one Connect instance per
// component." It is held in a ref and created once, after an account exists.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import type { StripeConnectInstance } from '@stripe/connect-js'
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  ConnectAccountManagement,
  ConnectNotificationBanner,
} from '@stripe/react-connect-js'
// 🔴 EVERY FIGURE ON THIS PAGE COMES FROM CARD_FEES, VIA THESE LABELS. No rate is written as a literal
// anywhere below — the landing page carries the same rule and the same reason: a rate typed twice is a
// rate that disagrees with itself the first time one of them moves.
import { CARD_FEE_ONLINE_LABEL, CARD_FEE_IN_PERSON_LABEL, TAP_TO_PAY_SURCHARGE_LABEL } from '@/lib/plan-features'
import { CONNECTING_STRIPE_NOT_A_CHARGE } from '@/lib/settings-copy'

type Status = { accountId: string | null; chargesEnabled: boolean; syncedAt: string | null }

export function PaymentsTab({ token, plan, showToast }: {
  token: string
  /** The truck's plan. Only 'trial' renders the reassurance banner — see the copy constant's note. */
  plan: string | null | undefined
  /** ⚠️ No PIN. This route authenticates by SESSION + truck ownership, which is stronger than the
   *  shared dashboard PIN and is what Manage already has. See the route's requireOwner note. */
  showToast: (msg: string, type?: 'success' | 'error') => void
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const post = useCallback(async (action: string) => {
    const res = await fetch('/api/stripe/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data
  }, [token])

  // ── RECONCILE ON TAB OPEN ────────────────────────────────────────────────────────────────────────
  // 🔴 This is one of the two things that keep the readiness cache honest (the other is the
  // `account.updated` webhook branch). It re-reads Stripe and overwrites the column, so a truck whose
  // account was disabled while nobody was looking finds out the moment an owner opens this tab.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await post('status')
        if (!cancelled) setStatus(s)
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : 'Could not reach Stripe')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [post])

  // ── INITIALISE CONNECT.JS ONCE, AFTER AN ACCOUNT EXISTS ─────────────────────────────────────────
  // ⚠️ `fetchClientSecret` ALWAYS MINTS A FRESH SESSION — the docs require it: Connect.js re-invokes
  // this function when the session expires, and a cached secret would be dead by then.
  // ⚠️ useMemo, NOT a ref written from an effect. The docs' rule is "one instance per session, reused" —
  // memoising on the account id gives exactly that, and unlike a ref it can be READ DURING RENDER, which
  // is what the provider below needs. A ref would have meant reading a ref in render (a react-hooks/refs
  // error) plus a `setConnectReady` in an effect purely to trigger the re-render the ref could not.
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const connectInstance: StripeConnectInstance | null = useMemo(() => {
    if (!status?.accountId || !publishableKey) return null
    return loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        const { clientSecret } = await post('account_session')
        return clientSecret as string
      },
      // Only the brand primary is set. The docs note that font family and background are inherited from
      // the parent container, and everything else must be set explicitly — so the rest is left at
      // Stripe's defaults rather than half-matched to the page.
      appearance: { variables: { colorPrimary: '#ea580c' } },
    })
  }, [status?.accountId, publishableKey, post])

  // Derived, not stored: an account exists but the browser key is absent, so the components cannot mount.
  const keyMissing = !!status?.accountId && !publishableKey
  const configError = fetchError
    ?? (keyMissing ? 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — the embedded components cannot load.' : null)

  const createAccount = async () => {
    setCreating(true)
    try {
      const { accountId, alreadyExisted } = await post('create_account')
      setStatus(s => ({ accountId, chargesEnabled: s?.chargesEnabled ?? false, syncedAt: s?.syncedAt ?? null }))
      showToast(alreadyExisted ? 'Account already connected' : 'Stripe account created — continue below')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not create the account', 'error')
    } finally { setCreating(false) }
  }

  /** Re-read after the operator finishes or exits onboarding — that is when readiness usually changes. */
  const refresh = async () => {
    try { setStatus(await post('status')) } catch { /* the banner below already carries the state */ }
  }

  if (loading) {
    return <div className="space-y-6"><h2 className="font-black text-slate-900 text-lg">Payments</h2>
      <p className="text-sm text-slate-500">Checking your Stripe account…</p></div>
  }

  return (
    <div className="space-y-6">
      <h2 className="font-black text-slate-900 text-lg">Payments</h2>

      {configError && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-4">
          <p className="text-sm font-semibold text-amber-800">Card payments aren&apos;t configured yet</p>
          <p className="text-xs text-slate-500 mt-1">{configError}</p>
        </div>
      )}

      {/* ══ ONLINE PAYMENTS ═══════════════════════════════════════════════════════════════════════
          🔴 ONE CONNECTION, TWO USES. The Stripe account connected here is the SAME account Terminal and
          Tap to Pay will use at the hatch. The walk-up section below therefore describes a CHOICE ABOUT
          HOW MONEY IS TAKEN, not a second setup — and nothing in it may read as another connection. */}
      <section>
        <h3 className="text-base font-bold text-slate-800">Online payments</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Customers pay by card when they order. Money goes straight to your own Stripe account — we never hold it.
        </p>

        <div className="mt-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          {/* 🔴 READINESS IS `chargesEnabled`, NEVER "an account exists". The middle state — connected,
              not yet able to take payments — is the one an operator is most likely to be in and the one
              a naive "connected ✓" would get wrong. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {!status?.accountId ? 'Not connected'
                  : status.chargesEnabled ? 'Connected' : 'Connected — finishing verification'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {!status?.accountId
                  ? "Takes about 10 minutes. You'll need your bank details and ID."
                  : status.chargesEnabled
                    ? 'Your Stripe account is connected and able to take payments.'
                    : 'Your Stripe account is connected but cannot take payments yet — finish the steps below.'}
              </p>
            </div>
            <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
              status?.chargesEnabled
                ? 'bg-green-50 text-green-700 border-green-200'
                : status?.accountId
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}>
              {status?.chargesEnabled ? 'Ready' : status?.accountId ? 'In progress' : 'Not connected'}
            </span>
          </div>

          {/* ── 🔴 THE TRIAL REASSURANCE — BEFORE THE BUTTON, NOT AFTER ────────────────────────────
              Connecting Stripe LOOKS like a commercial commitment: bank details, ID, a named payment
              provider. It is not one, and a truck on trial must be told so BEFORE they decide, which is
              why this sits above the button rather than beneath it.
              ⚠️ THE SENTENCE IS A SHARED CONSTANT, not written here — see lib/settings-copy.ts for why
              no existing trial string could be reused verbatim and whose shape this borrows.
              ⚠️ Rendered only while NOT connected: after connecting, the question it answers has been
              answered, and a standing "this doesn't charge you" note would read as a disclaimer. */}
          {plan === 'trial' && !status?.accountId && (
            /* 🔴 THE PAGE'S AMBER NOTICE, REUSED VERBATIM — `rounded-xl bg-amber-50 border
               border-amber-200 p-3` with `text-xs text-amber-700`, exactly as the two allergen-card
               notices in app/manage/[token]/page.tsx use it. It rendered GREY
               (`bg-slate-50 … text-slate-600`) until 10 August 2026 and that was wrong for what it is:
               this is the sentence that stops a truck on trial believing they are starting a
               subscription, and a grey box beside a button reads as fine print. It must be SEEN.
               ⚠️ No heading line, because the pattern's heading slot needs heading copy and the wording
               here is fixed — one sentence, rendered in the notice's body treatment. */
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-700">{CONNECTING_STRIPE_NOT_A_CHARGE}</p>
            </div>
          )}

          {/* ── 🔴 THE LABEL STAYS "Connect Stripe". DECIDED 10 August 2026 — DO NOT GENERICISE IT. ──
              A generic "Connect payments" was considered and rejected. Pressing this hands the operator
              straight to STRIPE'S OWN embedded form asking for bank details and photo ID — and a button
              that did not name Stripe, opening a stranger's identity check, is MORE alarming than one
              that did. Naming the provider is what makes the next screen make sense.
              ⚠️ It also costs nothing in surprise: the section copy directly above already says money
              goes to "your own Stripe account", so the name is on screen either way. */}
          {!status?.accountId && (
            <button
              onClick={createAccount}
              disabled={creating || !!configError}
              className="mt-3 w-full sm:w-auto px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {creating ? 'Connecting…' : 'Connect Stripe'}
            </button>
          )}
          {/* ── 🔴 WHOSE FEE THIS IS, STATED — AND IT IS NOT OURS ────────────────────────────────
              STRIPE'S processing charge, named as Stripe's. 🔴 THE PLAN'S PLATFORM FEE ON ONLINE
              ORDERS IS A DIFFERENT THING AND DOES NOT BELONG HERE: it is a property of the plan, it
              already appears on the Billing tab, and restating it beside a payment-provider rate is how
              an operator ends up adding the two together or thinking one is the other.
              ⚠️ FROM CARD_FEES, never a literal — and it carries the qualifier CARD_FEES itself
              instructs: the rate is for standard UK cards, and cards issued outside the UK/EEA cost
              more, because "quoting the domestic rate alone would be a claim that is untrue for some
              customers".
              ⚠️ ONE LINE. Detail belongs in the plan pricing, not on this page. */}
          <p className="text-xs text-slate-500 mt-3">
            Stripe charges {CARD_FEE_ONLINE_LABEL} per payment on standard UK cards. Cards issued outside
            the UK and EEA cost more.
          </p>
          {/* ⚠️ SANDBOX. Said on screen, not only in code — an operator who completes real-looking
              onboarding must not believe they can take real money. */}
          <p className="text-[11px] text-slate-400 mt-3">Test mode. No real payments can be taken yet.</p>
        </div>
      </section>


      {connectInstance && (
        <ConnectComponentsProvider connectInstance={connectInstance}>
          {/* 🔴 THE NOTIFICATION BANNER IS REQUIRED, and it goes FIRST because it carries the thing that
              is time-sensitive: Stripe uses it to tell the account about outstanding requirements. */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <ConnectNotificationBanner />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <p className="text-base font-bold text-slate-800 mb-3">Set up your account</p>
            {/* `onExit` fires when the operator leaves the flow — the moment readiness most often
                changes, so it is the natural place to re-reconcile rather than waiting for the webhook. */}
            <ConnectAccountOnboarding onExit={refresh} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <p className="text-base font-bold text-slate-800 mb-3">Your Stripe details</p>
            <ConnectAccountManagement />
          </div>
        </ConnectComponentsProvider>
      )}

      {/* ══ WALK-UP PAYMENTS ══════════════════════════════════════════════════════════════════════
          🔴 NOT A SECOND CONNECTION. This section is a choice about HOW MONEY IS TAKEN AT THE HATCH.
          "Through HatchGrab" reuses the SAME Stripe account connected above — the copy says so
          explicitly, because an operator who reads this as a second setup will either look for a second
          button or conclude they are being asked to connect twice.
          ⚠️ THE NO-PLATFORM-FEE CLAIM IS STATED ONCE, HERE, and must not be repeated in the cards
          below or in the online section. It is true of both walk-up options, which is exactly why it
          belongs to the section header rather than to either card. */}
      <section>
        <h3 className="text-base font-bold text-slate-800">Walk-up payments</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          How you take money at the hatch. HatchGrab charges no platform fee on walk-ups, whichever you choose.
        </p>

        {/* ── 🔴 STACKED RADIO ROWS, AND NEITHER IS INTERACTIVE ─────────────────────────────────
            The radio SHAPE is copied from this file's neighbour pattern — Manage's "Past the deadline"
            and the completion-presses control both draw a `w-4 h-4 rounded-full border-2` circle with a
            filled dot, in `space-y-1.5`. Same vocabulary, stacked, so the two options read as one
            either/or rather than two unrelated cards.
            🔴 IT IS A STATE READOUT, NOT A CONTROL — `<div>`s, not `<button>`s or `<input>`s. No
            onClick, no href, no name, no checked, nothing focusable. Two reasons, and both survive the
            change of shape:
              • "Your own card terminal" STORES NOTHING. Choosing it changes no column, no fee, no
                integration, no code path — it is the ABSENCE of anything. That is why its badge reads
                "Current" and not "Selected": it DESCRIBES WHAT IS TRUE, it does not record a decision.
                A control that writes nothing is worse than a sentence, because it implies state that
                does not exist and sends the next reader looking for where it is kept.
              • "Through HatchGrab" is COMING SOON, and this is the most expensive place in the product
                to imply a working connection. It follows the existing `coming_soon` convention
                (lib/plan-features.ts FeatureValue): dimmed with a badge, never a disabled radio — a
                disabled control says "this exists and you cannot use it yet"; a dimmed row says "this
                is not here". Do not add an onClick, a waitlist or a "notify me".
            ⚠️ WHEN THE SECOND OPTION SHIPS, this becomes a real radio group and the first row starts
            meaning something — at which point it needs a column to write to, and that is the change to
            make deliberately rather than by adding a handler here. */}
        {/* ⚠️ THE BOX IS PRESENTATION ONLY, and it is the SAME WHITE CARD the online section uses —
            `bg-white rounded-2xl shadow-sm border border-slate-200 p-4`, class-for-class. It was briefly
            the grey `bg-slate-50 … rounded-xl p-3` sub-panel treatment; that is the right container for a
            group nested INSIDE a card (Manage → Settings uses it for "Taking payment", "Notifications",
            "Opening and closing"), but here the box IS the section's card, sitting beside the online
            section's card at the same level. Two sibling sections should not be two different materials.
            It groups the two options so they read as one either/or; it changes nothing about them, and
            NEITHER ROW IS INTERACTIVE. */}
        <div className="mt-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-orange-500 flex items-center justify-center shrink-0">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
            </span>
            <span className="text-sm min-w-0">
              <span className="font-medium text-slate-700">Your own card terminal</span>
              <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                Current
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                Zettle, Square, or whatever you already use. Nothing to set up — only your provider&apos;s own fees apply.
              </span>
            </span>
          </div>

          <div className="flex items-start gap-2 opacity-60">
            <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
            <span className="text-sm min-w-0">
              <span className="font-medium text-slate-700">Through HatchGrab</span>
              <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                Coming soon
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                Uses the same Stripe connection as your online payments — a card reader, or contactless
                straight from your phone or tablet.
              </span>
              {/* 🔴 EVERY FIGURE FROM CARD_FEES. No literal rate.
                  ⚠️ TWO THINGS CARD_FEES ITSELF INSTRUCTS US TO SAY, and both are said here:
                    • the in-person rate is for UK/EEA-issued cards, and cards issued elsewhere cost MORE
                      — quoting the domestic rate alone "would be a claim that is untrue for some
                      customers";
                    • the Tap to Pay surcharge is stated SEPARATELY, never folded into the headline rate,
                      because folding it "would understate the cost for exactly the trucks most likely to
                      use it".
                  ⚠️ CARD_FEES holds no reader price or hardware cost, so none is quoted. If one is ever
                  needed it goes in CARD_FEES first, not into this string. */}
              <span className="block text-xs text-slate-400 mt-1">
                {CARD_FEE_IN_PERSON_LABEL} per payment on UK and EEA cards, plus {TAP_TO_PAY_SURCHARGE_LABEL} for
                contactless taken on a phone or tablet. Cards issued outside the UK and EEA cost more.
              </span>
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
