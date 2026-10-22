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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { cardFeeOnlineLabel, cardFeeInPersonLabel, tapToPaySurchargeLabel, cardRegionInPerson } from '@/lib/card-fees'
// The truck's own country's card fees and wording, from the provider the manage page mounts (never read by
// the browser from the table — see components/CountrySettingsProvider.tsx).
import { useCountrySettings } from '@/components/CountrySettingsProvider'
// Language Phase 1d Part 2: every word on this tab is a `managePayments` message (messages/en-GB.json; US words in
// en-US.json), read in the truck's locale. The trial reassurance that was CONNECTING_STRIPE_NOT_A_COMMITMENT in
// lib/settings-copy.ts is `managePayments.trialNote` — its reasoning is still recorded there.
import { useT } from '@/lib/i18n/use-t'
import type { FeatureAccessView } from '@/lib/useFeatures'
import { PAY_AT_HATCH_FEATURE } from '@/lib/plans'
import { PlanPrompt } from '@/components/PlanPrompt'
import '@/lib/i18n/catalog/planPrompt'
import '@/lib/i18n/catalog/managePayments'
import {
  derivePaymentsState, shouldMountNotificationBanner, shouldShowOnboarding, shouldOfferAccountManagement,
  type PaymentsState,
} from '@/lib/stripe/payments-state'

type Status = {
  accountId: string | null
  chargesEnabled: boolean
  syncedAt: string | null
  detailsSubmitted: boolean
  cardPaymentsStatus: string | null
  /** ⚠️ WHO IS LOOKING, from the server — never asserted by the client. 'owner' is the operator whose
   *  account this is; 'platform_admin' is support, and may READ ONLY. Optional so an older response
   *  (or a cached one) is treated as 'owner', which is the pre-existing behaviour. */
  viewer?: 'owner' | 'platform_admin'
  /** ⚠️ THE SERVER'S SECRET-KEY MODE, from platformKeyLivemode(). `true` live, `false` test, `null` when
   *  the prefix is neither. This is the mode an account WOULD BE CREATED IN — the browser cannot derive
   *  it, because the browser only ever holds the publishable key. */
  livemode?: boolean | null
}

/** ── 🔴 A PERMISSIONS ANSWER IS NOT A CONFIGURATION PROBLEM. ────────────────────────────────────────
 *  Every non-200 used to become `configError` and render under the fixed headline "Card payments aren't
 *  configured yet". A 403 about WHO IS SIGNED IN therefore read as "the platform is broken" — the single
 *  most alarming way to say "you're on the wrong account". These are now told apart by the HTTP status
 *  the server already sent, and each gets copy that is true of it. */
type PostError = Error & { status?: number; code?: string }
/** ⚠️ WHAT THE STATUS READ HIT (Language Phase 1d Part 2). It is set in an effect, so OUR sentences are held as a code
 *  and worded at render: "Request failed (…)" when the route sent no words, "Could not reach Stripe" when nothing came
 *  back. A plain string is a sentence we did not write (the route's own `error`, or the browser's), shown as it came. */
type FetchFailure = string | { code: 'requestFailed'; status: number } | { code: 'unreachable' }

// ── 🔴 ONE HEADLINE PER STATE, AND NOT ONE OF THEM CONTAINS AN INSTRUCTION ─────────────────────────
// We own "can you take money" and the commercial framing. STRIPE OWNS THE TASK LIST, and under
// `requirements_collector: 'stripe'` we are structurally incapable of writing it: "Most identity
// information about your connected accounts … is inaccessible unless your platform is responsible for
// collecting that information." So a sentence here telling an operator to "finish the steps below" is
// us doing the notification banner's job in prose, WITHOUT its buttons and without knowing what the
// steps are. That sentence is gone; the panel underneath carries the action.
// ⚠️ `pending` IS THE POINT OF THE WHOLE CHANGE. It used to read "finish the steps below" — telling a
// truck to go and do work that does not exist, while Stripe was simply verifying.
// ⚠️ LANGUAGE PHASE 1d PART 2: each state's title, body and chip are `managePayments.state.<state>.*`, word for word
// what this table held; the notes below stay with the state they explain. Only the chip's colour is code.
const HEADER: Record<PaymentsState, { chipClass: string }> = {
  // ⚠️ "Not set up", NOT "Not connected", SINCE 13 AUGUST 2026. The button below no longer says
  // "Connect Stripe" — it says "Set up online payments" — and a card headed "Not connected" beside a
  // button offering to "set up" describes a different act from the one on offer. Title and chip move
  // together because they are the same claim at two sizes.
  // ⚠️ THE FOUR STATES BELOW ARE DELIBERATELY UNCHANGED. They describe the STRIPE ACCOUNT's condition
  // rather than naming this action, and their wording was settled on 10 August after a specific
  // correction (see the note under this block). Rewriting them to match a button label would undo that
  // for consistency's sake — the pills already read as a progression: Not set up, Action needed,
  // Checking, Ready.
  not_connected: {
    chipClass: 'bg-slate-50 text-slate-500 border-slate-200',
  },
  // ── 🔴 THIS STATE USED TO SAY "Connected — finishing verification" / "In progress". BOTH WERE FALSE
  //    OF THE OPERATOR, 10 August 2026. ────────────────────────────────────────────────────────────
  // They had pressed one button and been asked nothing. An `Account` object existing is not "connected"
  // in any sense a truck would recognise, and "In progress" claims motion in a state they can sit in
  // forever having done nothing. The account lifecycle was being described accurately and the person's
  // experience inaccurately — and the person is who reads it.
  // ⚠️ THE WORDING MUST ALSO BE TRUE OF SOMEONE WHO GOT HALFWAY AND LEFT. See the note on
  //    derivePaymentsState: this one state covers "never opened the form" and "abandoned it midway",
  //    so it may not claim either. "Stripe needs your details" is true of both, and so is the body.
  // ⚠️ "Action needed" IS THE CHIP BECAUSE IT IS THE ONE THING THAT IS TRUE: something IS required, and
  //    it is required of THEM. It is also what separates this state from `pending`, where the honest
  //    chip is "Checking" precisely because nothing is being asked of them.
  requirements: {
    chipClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  pending: {
    chipClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  ready: {
    chipClass: 'bg-green-50 text-green-700 border-green-200',
  },
  restricted: {
    chipClass: 'bg-red-50 text-red-700 border-red-200',
  },
  unsupported: {
    chipClass: 'bg-red-50 text-red-700 border-red-200',
  },
}

export function PaymentsTab({ token, onTrial, features, showToast, afterOnline }: {
  token: string
  /** 🔴 Phase 3 screens: what Manage places AFTER the online payments section and BEFORE "Walk-up
   *  payments" — the "Tax, tips and fees" card and "Taking payment" (moved here from Settings). */
  afterOnline?: React.ReactNode
  /** Whether the truck's EFFECTIVE plan is a trial (lib/plans.ts `effectivePlan(...).plan.isTrial` — plans-data-model,
   *  Stage A; it was the string 'trial'). Only then does the reassurance banner render — see its note in
   *  lib/settings-copy.ts (the sentence itself is `managePayments.trialNote`). */
  onTrial: boolean
  /** The truck's feature access (lib/useFeatures.ts) — read for Pay at Hatch, which the truck's plan may not include. */
  features: FeatureAccessView
  /** ⚠️ No PIN. This route authenticates by SESSION + truck ownership, which is stronger than the
   *  shared dashboard PIN and is what Manage already has. See the route's requireOwner note. */
  showToast: (msg: string, type?: 'success' | 'error') => void
}) {
  const cs = useCountrySettings()
  const t = useT('managePayments')
  const tPrompt = useT('planPrompt')
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  // ⚠️ TWO STATES, NOT ONE. `permissionError` is a 403 about who is signed in; `fetchError` is anything
  // else that stopped us reading Stripe. They render as different cards with different copy — see the
  // note on PostError above.
  const [fetchError, setFetchError] = useState<FetchFailure | null>(null)
  const [permissionError, setPermissionError] = useState<'not_permitted' | null>(null)
  // ⚠️ MOUNT-ON-DEMAND, AND IT NEVER GOES BACK TO FALSE. Account management is an iframe with a Stripe
  // sign-in popup; mounting it on page load for every owner who never opens it wastes a load cycle, and
  // Stripe asks us not to: "Avoid mounting and unmounting component unnecessarily. Each time a component
  // mounts, its loading cycle starts again." One-way means opening it can never cost a second mount.
  const [showManagement, setShowManagement] = useState(false)
  // ── 🔴 PRESSING CONNECT MUST TAKE THEM SOMEWHERE, NOT JUST CHANGE A CHIP ─────────────────────────
  // The button is at the bottom of the first card; the onboarding panel appears below it, off-screen on
  // a phone. Without this the operator presses Connect, the wording changes, and nothing visibly
  // happens — which is most of why the old copy had to carry the instruction.
  // ⚠️ ONE-WAY, AND THE EFFECT NEVER WRITES STATE. The flag is set in the click handler and never reset,
  // so the effect fires exactly once on the false→true edge. Nothing here is a `setState` inside an
  // effect, and the ref is only read inside the effect — never during render.
  const [connectPressed, setConnectPressed] = useState(false)
  const onboardingRef = useRef<HTMLDivElement | null>(null)

  const post = useCallback(async (action: string) => {
    const res = await fetch('/api/stripe/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // ⚠️ THE STATUS AND THE CODE RIDE ON THE ERROR. The message alone cannot distinguish "you are not
      // this truck's owner" from "Stripe is down", and the caller has to.
      // ⚠️ An empty message means the route sent no words: the screen says "Request failed (status)" itself.
      const err: PostError = new Error(data.error || '')
      err.status = res.status
      if (typeof data.code === 'string') err.code = data.code
      throw err
    }
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
        if (cancelled) return
        // 🔴 403 IS SORTED OUT HERE, ONCE. Everything else keeps the old behaviour exactly.
        if ((e as PostError)?.status === 403) setPermissionError('not_permitted')
        else setFetchError(!(e instanceof Error) ? { code: 'unreachable' }
          : (e as PostError).status !== undefined && !e.message ? { code: 'requestFailed', status: (e as PostError).status as number }
          : e.message)
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
  // ⚠️ WHO IS LOOKING. Absent means owner — an older or cached status response behaves exactly as before.
  const isAdminViewer = status?.viewer === 'platform_admin'

  // ── 🔴 THE TWO KEYS, COMPARED. THIS IS THE ONLY PLACE IN THE APP THAT DOES IT. ──────────────────
  // `publishableKey` above is INLINED AT BUILD TIME into this bundle; `status.livemode` is the server's
  // SECRET key mode, read PER REQUEST. That difference is the whole point: setting a variable in Vercel
  // updates the server on the next request but does not touch a bundle that was built before it, and
  // scoping a variable to Preview leaves Production on the old one. So the two can disagree, silently,
  // and no other check anywhere compares them — connectConfigured() tests presence and has no callers,
  // and describeAccountModeMismatch compares the key against a connected ACCOUNT, not against the
  // publishable key.
  // ⚠️ ONE VALUE FROM EACH SIDE, DELIBERATELY. Comparing the server's own NEXT_PUBLIC_… against its own
  // STRIPE_SECRET_KEY would test whether two variables agree and would MISS a stale bundle entirely,
  // which is the likelier fault. The browser's copy is the one a customer's card form actually uses.
  // ⚠️ NULL IS NOT A MISMATCH. An unrecognised prefix, a missing key, or a status response from before
  // this field existed all leave one side unknown, and "we cannot tell" must never be reported as
  // "they disagree" — that would block a working install on no evidence.
  const publishableLivemode: boolean | null =
    typeof publishableKey !== 'string' ? null
      : publishableKey.startsWith('pk_live_') ? true
      : publishableKey.startsWith('pk_test_') ? false
      : null
  const serverLivemode = status?.livemode ?? null
  const keyModeMismatch =
    typeof serverLivemode === 'boolean'
    && typeof publishableLivemode === 'boolean'
    && serverLivemode !== publishableLivemode
  const connectInstance: StripeConnectInstance | null = useMemo(() => {
    // 🔴 NEVER FOR AN ADMIN, AND THIS IS NOT COSMETIC. `fetchClientSecret` below calls `account_session`,
    // which the server refuses for a platform admin — Connect.js would mount, fire that call, take a 403
    // and surface a Stripe-branded error inside the iframe. Not mounting is the honest outcome: these
    // embedded components are Stripe's onboarding and account-management forms, and they belong to the
    // operator. Support looks at the state around them, not through them.
    if (isAdminViewer) return null
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
  }, [status?.accountId, publishableKey, post, isAdminViewer])

  // Derived, not stored: an account exists but the browser key is absent, so the components cannot mount.
  const keyMissing = !!status?.accountId && !publishableKey
  const fetchErrorText = fetchError === null || typeof fetchError === 'string' ? fetchError
    : fetchError.code === 'requestFailed' ? t('errors.requestFailed', { status: fetchError.status })
    : t('errors.unreachable')
  const configError = fetchErrorText
    ?? (keyMissing ? t('config.keyMissing', { name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY' }) : null)

  const createAccount = async () => {
    setCreating(true)
    try {
      const { accountId, alreadyExisted } = await post('create_account')
      // A brand-new account has submitted nothing and has no capability status worth trusting yet, so
      // both are set to their "nothing known" values — which lands the tab in `requirements`, correctly.
      setStatus(s => ({
        accountId,
        chargesEnabled: s?.chargesEnabled ?? false,
        syncedAt: s?.syncedAt ?? null,
        detailsSubmitted: false,
        cardPaymentsStatus: null,
      }))
      setConnectPressed(true)
      // ⚠️ THE TOAST NO LONGER SAYS "connected" EITHER — same reason as the headline. It names the one
      // thing that is true and about to happen on screen.
      showToast(alreadyExisted ? t('toast.alreadySetUp') : t('toast.addDetails'))
    } catch (e) {
      const status = (e as PostError)?.status
      showToast(!(e instanceof Error) ? t('toast.createFailed')
        : status !== undefined && !e.message ? t('errors.requestFailed', { status }) : e.message, 'error')
    } finally { setCreating(false) }
  }

  /**
   * Scroll the operator to Stripe's onboarding screen the moment it appears, so pressing Connect lands
   * them at the next thing to do rather than leaving them to find it. Fires once, on the edge.
   *
   * ⚠️ `block: 'start'` — THE TOP OF THE VIEWPORT, not merely "somewhere on screen". Manage is an
   * app-shell: `h-dvh flex flex-col overflow-hidden`, where the header and tab bar are non-scrolling
   * SIBLINGS and only `<main>` scrolls. So the nearest scrollable ancestor is `<main>`, there is no
   * sticky element inside it on this tab, and 'start' puts the panel flush under the tabs with nothing
   * overlapping it.
   * ⚠️ REDUCED MOTION RESPECTED. A smooth scroll is motion the operator did not ask for; anyone who has
   * asked the OS to stop that gets an instant jump to the same place.
   * ⚠️ SAFE WHEN THE PANEL IS ABSENT. Pressing Connect on an account that is already `ready` renders no
   * onboarding panel; the ref is null and the optional call is a no-op rather than a crash.
   */
  useEffect(() => {
    if (!connectPressed) return
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    onboardingRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }, [connectPressed])

  /** Re-read after the operator finishes or exits onboarding — that is when readiness usually changes. */
  const refresh = async () => {
    try { setStatus(await post('status')) } catch { /* the banner below already carries the state */ }
  }

  if (loading) {
    return <div className="space-y-6"><h2 className="font-black text-slate-900 text-lg">{t('heading')}</h2>
      <p className="text-sm text-slate-500">{t('loading')}</p></div>
  }

  // ── 🔴 THE STATE IS DERIVED ONCE, FROM SERVER DATA ONLY ─────────────────────────────────────────
  // Every field here came from `/api/stripe/connect` reading Stripe server-side. NOTHING in this
  // derivation comes from inside a Connect iframe, so no headline on this page can be delayed, doubled
  // or lost by a component callback. That is deliberate and is the reason no callback is used at all —
  // see the notification banner below.
  const state = derivePaymentsState({
    accountId: status?.accountId ?? null,
    chargesEnabled: status?.chargesEnabled ?? false,
    detailsSubmitted: status?.detailsSubmitted ?? false,
    cardPaymentsStatus: status?.cardPaymentsStatus ?? null,
  })
  const header = { ...HEADER[state], title: t(`state.${state}.title`), body: t(`state.${state}.body`), chip: t(`state.${state}.chip`) }

  return (
    <div className="space-y-6">
      <h2 className="font-black text-slate-900 text-lg">{t('heading')}</h2>

      {/* ── 🔴 THE KEY MISMATCH. RED, FIRST, AND IT STOPS THE FLOW. ───────────────────────────────
          The two Stripe keys are in DIFFERENT MODES. Left alone this does not fail here — it fails at
          the moment a customer taps Pay, because a `pk_test_` browser cannot confirm a `sk_live_`
          PaymentIntent (and the reverse is equally broken). That is the worst possible place to
          discover it, so it is surfaced here instead, in red, above everything.
          ⚠️ THIS IS THE ONE CARD THAT USES RED. The three below are slate and amber: a permissions
          answer and a configuration gap are both ordinary states. This one is a deployment that will
          take a customer's card and fail, and it should not read as ordinary.
          ⚠️ IT NAMES THE FIX, NOT THE KEYS. No key value or fragment is rendered — only which side is
          in which mode, which is what tells you whether to rebuild or to change the variable. */}
      {keyModeMismatch && (
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-4">
          <p className="text-sm font-semibold text-red-800">{t('keyMismatch.title')}</p>
          <p className="text-xs text-slate-600 mt-1">
            {t.rich('keyMismatch.body', {
              server: serverLivemode ? 'live' : 'test', browser: publishableLivemode ? 'live' : 'test',
              b: chunks => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="text-xs text-slate-500 mt-1">{t('keyMismatch.fix')}</p>
        </div>
      )}

      {/* ── 🔴 A PERMISSIONS ANSWER, SAID AS ONE. ─────────────────────────────────────────────────
          This case used to render as "Card payments aren't configured yet — Unauthorised": a fixed
          setup headline over a 403 about WHO IS SIGNED IN. An operator reading it would reasonably
          conclude the platform was broken, and go looking for a setting that does not exist.
          ⚠️ IT NAMES NEITHER THE OWNER NOR THE ACCOUNT. Who owns a truck is not this screen's to
          disclose to whoever is holding the link, so the copy says what to do without saying who. */}
      {permissionError && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">{t('permission.title')}</p>
          <p className="text-xs text-slate-500 mt-1">{t('permission.body')}</p>
        </div>
      )}

      {/* ⚠️ NOW GENUINELY ABOUT CONFIGURATION, AND ONLY THAT: a missing publishable key, or a failure to
          reach Stripe at all. The 403 no longer arrives here. */}
      {configError && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-4">
          <p className="text-sm font-semibold text-amber-800">
            {keyMissing ? t('config.keyMissingTitle') : t('config.fetchTitle')}
          </p>
          <p className="text-xs text-slate-500 mt-1">{configError}</p>
        </div>
      )}

      {/* ══ ONLINE PAYMENTS ═══════════════════════════════════════════════════════════════════════
          🔴 ONE CONNECTION, TWO USES. The Stripe account connected here is the SAME account Terminal and
          Tap to Pay will use at the hatch. The walk-up section below therefore describes a CHOICE ABOUT
          HOW MONEY IS TAKEN, not a second setup — and nothing in it may read as another connection.

          ── ⚠️ A SPLIT WAS TRIED ON 11 August 2026 AND REVERTED. THE REASONING IS KEPT ON PURPOSE. ──
          This section was briefly broken into "Your Stripe account" (the connection, the chip, the
          Connect button) + "Online payments" (the fee line), on the argument that the fee line describes
          a CHANNEL and the rest describes a CONNECTION shared with the hatch. The operator preferred the
          original and it was restored in full.
          🔴 THE ARGUMENT STILL STANDS AND IS WORTH REVISITING WHEN TAP TO PAY SHIPS: `CARD_FEE_ONLINE_
          LABEL` below is the ONLINE rate, and in-person cards are a DIFFERENT rate (CARD_FEE_IN_PERSON_
          LABEL, already quoted in the walk-up section). The day a truck can take a card at the hatch on
          this same connection, a card headed "Online payments" carrying the account's own status will be
          describing two things at once. Revisit then — not before, and not as a tidy-up. */}
      <section>
        <h3 className="text-base font-bold text-slate-800">{t('online.heading')}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{t('online.body')}</p>
        {/* 🔴 PAY AT HATCH IS THE PLAN'S TO ALLOW (Stage A2, plans.pay_at_hatch_allowed — enforced). There is no Pay at Hatch
            switch to show: customers are offered it whenever the plan allows it. When the PLAN does not, the one upgrade
            prompt says which plan does; when an OVERRIDE switched it off, the plain "switched off for your truck". Every
            plan allows it as seeded, so neither line shows today. */}
        {features.block(PAY_AT_HATCH_FEATURE) === 'plan' && (
          <div className="mt-3"><PlanPrompt feature={PAY_AT_HATCH_FEATURE} upgradeTo={features.upgradeTo(PAY_AT_HATCH_FEATURE)} /></div>
        )}
        {features.block(PAY_AT_HATCH_FEATURE) === 'override' && (
          <p className="mt-2 text-xs text-slate-500">{tPrompt('switchedOff', { feature: tPrompt(`features.${PAY_AT_HATCH_FEATURE}.name` as never), many: tPrompt(`features.${PAY_AT_HATCH_FEATURE}.many` as never) })}</p>
        )}

        <div className="mt-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          {/* 🔴 READINESS IS `chargesEnabled`, NEVER "an account exists" — and the five connected states
              are now told apart rather than collapsed into one. Every string comes from HEADER above,
              which is where the reasoning lives; nothing is composed inline any more. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{header.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{header.body}</p>
            </div>
            <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${header.chipClass}`}>
              {header.chip}
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
          {onTrial && state === 'not_connected' && (
            /* 🔴 THE PAGE'S AMBER NOTICE, REUSED VERBATIM — `rounded-xl bg-amber-50 border
               border-amber-200 p-3` with `text-xs text-amber-700`, exactly as the two allergen-card
               notices in app/manage/[token]/page.tsx use it. It rendered GREY
               (`bg-slate-50 … text-slate-600`) until 10 August 2026 and that was wrong for what it is:
               this is the sentence that stops a truck on trial believing they are starting a
               subscription, and a grey box beside a button reads as fine print. It must be SEEN.
               ⚠️ No heading line, because the pattern's heading slot needs heading copy and the wording
               here is fixed — one sentence, rendered in the notice's body treatment. */
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-700">{t('trialNote')}</p>
            </div>
          )}

          {/* ── 🔴 THE LABEL IS NOW "Set up online payments". THIS REVERSES A DECISION — READ BOTH. ──
              ⚠️ WHAT THE 10 AUGUST 2026 NOTE SAID, KEPT VERBATIM SO THE ARGUMENT IS NOT LOST:
                  "THE LABEL STAYS 'Connect Stripe'. DO NOT GENERICISE IT. A generic 'Connect payments'
                   was considered and rejected. Pressing this hands the operator straight to STRIPE'S OWN
                   embedded form asking for bank details and photo ID — and a button that did not name
                   Stripe, opening a stranger's identity check, is MORE alarming than one that did.
                   Naming the provider is what makes the next screen make sense."
              🔴 REVERSED DELIBERATELY, 13 AUGUST 2026, ON THE OPERATOR'S INSTRUCTION: the button should
              say what it DOES rather than who it does it with, and should match the section heading
              "Online payments" directly above it. The counter-argument above is not wrong,
              and the risk it names is real — an operator who does not expect Stripe meeting Stripe's ID
              form. What blunts it is that the provider is still on screen twice within a few lines: the
              section body says money "goes straight to your own Stripe account", and the header card's
              body names the bank details and ID it will ask for. So the next screen is still explained;
              it is simply no longer the button doing the explaining.
              ⚠️ IF THIS IS EVER REVERSED AGAIN, the thing to preserve is that SOMETHING within a glance
              of this button names Stripe. That, not the label itself, is what the original note was
              protecting. */}
          {/* ── 🔴 SUPPORT SEES THE STATE; IT DOES NOT GET THE BUTTON. ────────────────────────────
              A platform admin reaches this tab to see what the operator sees. Connecting Stripe is
              irreversible and binds THIS OPERATOR's business and bank details to a real account, so it
              is not an act support can perform on their behalf however helpful it would feel. The
              server refuses `create_account` for an admin regardless (ADMIN_READ_ONLY); this is the
              screen agreeing with it out loud rather than showing a button that would fail.
              ⚠️ IT IS A SENTENCE, NOT A DISABLED BUTTON. A greyed control says "this is yours and you
              cannot use it yet"; a line of text says "this is not yours" — which is the true statement,
              and the same distinction the walk-up section already draws for its coming-soon row. */}
          {state === 'not_connected' && isAdminViewer && (
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-xs font-semibold text-slate-700">{t('admin.title')}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t('admin.body')}</p>
            </div>
          )}
          {state === 'not_connected' && !isAdminViewer && (
            <button
              onClick={createAccount}
              /* 🔴 `keyModeMismatch` JOINS THE DISABLERS. Fail loudly rather than proceed: an account
                 created while the keys disagree is a real, undeletable account whose customers cannot
                 pay. The red card above says why; this stops the press. */
              disabled={creating || !!configError || keyModeMismatch}
              className="mt-3 w-full sm:w-auto px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {creating ? t('setUp.busy') : t('setUp.button')}
            </button>
          )}
          {/* ── 🔴 WHOSE FEE THIS IS, STATED — AND IT IS NOT OURS ────────────────────────────────
              TWO FEES, TWO OWNERS, NEITHER QUANTIFIED TWICE.
              🔴 STRIPE'S rate is named as Stripe's and comes from cardFees(). 🔴 HATCHGRAB'S platform fee
              on online orders is NAMED but NOT QUANTIFIED — it depends on the plan, so the line points
              at Billing instead of carrying a figure.
              ⚠️ NAMING IT WAS THE CORRECTION (10 August 2026). Quoting only Stripe's rate implied
              Stripe's was the whole cost of taking a card payment, which is untrue on a paid plan.
              🔴 DO NOT ADD THE PERCENTAGE OR THE ALLOWANCE HERE, however tempting. They are properties
              of the plan, they already live on Billing, and the manual records what restating the same
              fee facts across surfaces has cost before. A figure here also invites an operator to add
              the two rates together, which is not how either works.
              ⚠️ FROM cardFees(), never a literal — and it carries the qualifier cardFees() itself
              instructs: the rate is for standard UK cards, and cards issued outside the UK/EEA cost
              more, because "quoting the domestic rate alone would be a claim that is untrue for some
              customers".
              ⚠️ ONE LINE. Detail belongs in the plan pricing, not on this page. */}
          {/* ⚠️ "standard" is in the message now (it was cardRegionOnline's prefix), so the sentence is whole. */}
          <p className="text-xs text-slate-500 mt-3">
            {t('online.feeLine', { fee: cardFeeOnlineLabel(cs), region: cardRegionInPerson(cs) })}
          </p>
          {/* ── 🔴 TEST MODE SAYS SO; LIVE MODE SAYS NOTHING. THE ASYMMETRY IS THE POINT. ──────────
              This line was once an unconditional literal reading "Test mode…" whatever keys were set —
              it went on saying it through two rebuilds after the live keys landed. It then became a
              two-way derived line, test and live. The LIVE variant has now been removed (13 August
              2026): it read "Live mode. Connecting here creates a real Stripe account in your name, and
              customer payments will reach your own bank", and every clause of it was already on screen —
              the section copy says money "goes straight to your own Stripe account", the header card
              says what connecting involves, and the button names the act. A sentence that only restates
              its surroundings adds length, not information.
              🔴 THE TEST VARIANT STAYS, AND IT IS NOT THE SAME KIND OF SENTENCE. Live is the state an
              operator is entitled to assume — the product exists to take real payments, so saying so
              tells them nothing they had not already concluded. TEST is the surprising state: the
              onboarding is real, the form asks for real bank details and real ID, and at the end of it
              no customer money can move. Nothing else on this page would say so. That is information,
              not restatement, which is why removing one and keeping the other is not inconsistent.
              ⚠️ ABSENCE NOW MEANS "NOT TEST", NOT "UNKNOWN", and that is safe in this direction. A null
              mode (unrecognised prefix, or a status response from before the field existed) renders
              nothing, exactly as live does — so the only claim this line ever makes is the cautious one.
              A missing warning about test mode is the failure worth having; a false one is not. */}
          {serverLivemode === false && (
            <p className="text-[11px] text-slate-400 mt-3">{t('online.testMode')}</p>
          )}
        </div>
      </section>


      {connectInstance && (
        <ConnectComponentsProvider connectInstance={connectInstance}>
          {/* ── 🔴 THE EMPTY BOX IS GONE, AND THE WRAPPER IS WHAT WENT ────────────────────────────
              This used to be `<div class="bg-white rounded-2xl shadow-sm border p-4">` around the
              banner, rendered unconditionally. The banner renders NOTHING in two entirely normal
              states — before `details_submitted`, and whenever a healthy account has no open tasks —
              so the card was empty for a truck finishing verification AND, permanently, for a verified
              truck that was trading perfectly well.
              🔴 THE FIX IS TO DROP THE WRAPPER, NOT TO DRIVE IT FROM `onNotificationsChange`.
              Stripe offers that callback and it would work, but it reports from inside an iframe on
              Stripe's schedule — it can arrive late, twice, or never. Anything hung off it needs a flag
              that is correct in all three cases, and the failure mode of getting it wrong is HIDING the
              one panel that tells a restricted truck why their money has stopped. Dropping the wrapper
              removes the callback from the design entirely: there is no flag, so there is nothing for a
              late or missing event to be wrong about. Stripe's own components "behave like regular block
              HTML elements … and grow in height according to the content rendered inside", so an empty
              banner is zero pixels with no wrapper to give it a border.
              ⚠️ MOUNTED ONLY ONCE `details_submitted` IS TRUE, from OUR server-side read — the same
              field Stripe gates the banner on internally ("The banner won't render any UI if the account
              is missing details_submitted"), so the two cannot disagree. Before then it would render
              nothing anyway, and not mounting it also removes the parent's row gap.

              ── 🔴 MOVED 11 August 2026: THE BANNER NOW LIVES INSIDE "Your Stripe details", BELOW. ──
              It used to render here, as a bare sibling between two cards — so when it DID have something
              to say it appeared as an unpadded strip touching the card above and below it, and when it
              had nothing it contributed only the parent's row gap. Inside a card that ALWAYS has content
              (a heading, a sentence and a button) it can never be an empty box and can never be an
              orphaned strip: it either adds a block to a real card or adds nothing at all.
              🔴 IT MOVED WHOLE, AND IT HAD TO. The banner is ONE opaque iframe carrying risk
              interventions and paused payouts as well as hygiene prompts, and `onNotificationsChange`
              returns `{total, actionRequired}` — two numbers with NO message text. We cannot read what it
              says, so we cannot route part of it. Merging means all of it. */}

          {/* ── ONBOARDING: THE ONLY PLACE REQUIREMENTS ARE COLLECTED ────────────────────────────
              Shown for the first run AND for a later interruption, because Stripe says to reuse it:
              "Let your accounts remediate their verification requirements by directing them to the
              Account onboarding component." Hidden in `pending` (nothing to collect), in `ready`
              (nothing outstanding), and in `unsupported` (nothing it could ever fix). */}
          {/* ── 🔴 NO HEADING OF OURS ABOVE STRIPE'S OWN START SCREEN ─────────────────────────────
              This card used to carry "Set up your account" above the component. Underneath it, STRIPE
              renders its own start screen with an "Add information" button — so the operator met a
              heading, then a button, before a single question. A door in front of a door.
              🔴 THE STRIPE SCREEN CANNOT BE SKIPPED, AND THAT WAS CHECKED BEFORE ASSUMING IT. The string
              "Add information" appears NOWHERE in this repo; it is inside Stripe's iframe. It is there
              because onboarding must authenticate the account holder first — "Connect embedded
              components require the connected account to sign in with their Stripe account before
              accessing the component … (for example, writing information to the account legal entity in
              the case of the account onboarding component)" — and "Authentication is required for
              connected accounts where Stripe is responsible for collecting updated information", which
              is our posture. That auth is a popup, and popups need a click, so Stripe MUST render a
              button. Their docs are explicit that it cannot be designed away: "Some behavior in embedded
              components, such as user authentication, must be presented in a popup. You can't customize
              the embedded component to eliminate such popups."
              ⚠️ `disable_stripe_user_authentication` is not a way out either: it "can only be true for
              accounts where controller.requirement_collection is application". Ours is `stripe`.
              ✅ SO THE STEP WE COULD REMOVE WAS OURS, AND IT IS GONE. What remains is one card holding
              exactly one thing: Stripe's screen. The card stays because this component always has
              content, so it can never be the empty box the notification banner was. */}
          {shouldShowOnboarding(state) && (
            <div ref={onboardingRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              {/* ── 🔴 ONE SENTENCE, AND IT IS NOT THE HEADING THAT WAS DELETED ───────────────────
                  What was removed was `text-base font-bold` — A TITLE, competing with Stripe's own and
                  reading as a step of ours. This is `text-xs text-slate-500` — a caption EXPLAINING the
                  screen underneath, which is otherwise unexplained: Stripe's own button says "Add
                  information to start accepting money", which names an outcome and not an action, and
                  gives no warning that a Stripe SIGN-IN comes first.
                  🔴 IT EXISTS BECAUSE STRIPE'S COPY IS UNREACHABLE. Every `appearance` option is a style
                  variable — colours, sizes, radii, `buttonLabelTextTransform` changes CASE, not words —
                  and the docs say those options "are the only way to change styles in Connect embedded
                  components". No prop on ConnectAccountOnboarding carries copy either; the installed
                  types allow only onExit, onStepChange, three URL overrides, skipTermsOfServiceCollection
                  and collectionOptions. So the button cannot be relabelled, and the only place the
                  action can be named is immediately above it.
                  ⚠️ TWO WORDINGS BECAUSE THE PANEL SERVES TWO STATES. First run collects everything;
                  remediation updates one thing. Saying "give your business and bank details" to a truck
                  fixing a single flagged document would be wrong. */}
              <p className="text-xs text-slate-500 mb-3">
                {state === 'restricted' ? t('onboarding.restricted') : t('onboarding.firstRun')}
              </p>
              {/* `onExit` fires when the operator leaves the flow — the moment readiness most often
                  changes, so it is the natural place to re-reconcile rather than waiting for the webhook. */}
              <ConnectAccountOnboarding onExit={refresh} />
            </div>
          )}

          {/* ── 🔴 ACCOUNT MANAGEMENT: AFTER ONBOARDING ONLY, AND DISCOVERABLE OVER TIDY ───────────
              Stripe is explicit that it is the wrong tool before verification: "Account management
              isn't optimized for collecting missing account information. For that use case, consider
              using account onboarding or the notification banner." Beside an onboarding panel it was a
              second, worse door to the same job.
              🔴 THE JUDGEMENT CALL, MADE: THE ROW IS ALWAYS VISIBLE AND ITS PURPOSE IS SPELLED OUT.
              This is the ONLY route to change payout bank details once verified, and a truck whose bank
              account changes must be able to find it under pressure. So it is NOT a bare collapsed row
              labelled "Your Stripe details" — the heading and the sentence beneath it are always on
              screen and name the bank account explicitly. Only the iframe is behind the button.
              ⚠️ THE BUTTON EXISTS FOR MOUNT COST, NOT FOR TIDINESS. It defers one iframe (and its Stripe
              sign-in popup) until asked, and `showManagement` is one-way, so opening it can never cause
              a second mount. */}
          {/* ⚠️ `shouldOfferAccountManagement` NOW INCLUDES `unsupported`, changed as a consequence of the
              merge rather than as a preference — see the note on that function. In short: the banner
              mounts in every post-onboarding state, so the card that now HOSTS it must too, or moving
              the banner in here would have deleted it in the one state where Stripe is most likely to be
              explaining why an account will never take cards. */}
          {shouldOfferAccountManagement(state) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <p className="text-base font-bold text-slate-800">{t('details.title')}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t('details.body')}</p>

              {/* 🔴 STRIPE'S NOTIFICATION BANNER, INSIDE THE CARD. See the note above for why it moved
                  whole rather than selectively.
                  ⚠️ `mt-3` ONLY WHEN IT IS MOUNTED — and when mounted-but-empty it still contributes
                  nothing visible, because Stripe's components "grow in height according to the content
                  rendered inside" and this wrapper has no background, border or padding of its own. So
                  the card reads identically whether or not Stripe has something to say; the only
                  residue in the empty case is 12px of margin inside a card that was already there. */}
              {shouldMountNotificationBanner(state, status?.detailsSubmitted ?? false) && (
                <div className="mt-3"><ConnectNotificationBanner /></div>
              )}

              {showManagement ? (
                <div className="mt-3"><ConnectAccountManagement /></div>
              ) : (
                <button
                  onClick={() => setShowManagement(true)}
                  className="mt-3 w-full sm:w-auto px-4 py-2 bg-white text-slate-700 text-sm font-semibold rounded-xl border border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  {t('details.button')}
                </button>
              )}
            </div>
          )}
        </ConnectComponentsProvider>
      )}

      {afterOnline}

      {/* ══ WALK-UP PAYMENTS ══════════════════════════════════════════════════════════════════════
          🔴 NOT A SECOND CONNECTION. This section is a choice about HOW MONEY IS TAKEN AT THE HATCH.
          "Through HatchGrab" reuses the SAME Stripe account connected above — the copy says so
          explicitly, because an operator who reads this as a second setup will either look for a second
          button or conclude they are being asked to connect twice.
          ⚠️ THE NO-PLATFORM-FEE CLAIM IS STATED ONCE, HERE, and must not be repeated in the cards
          below or in the online section. It is true of both walk-up options, which is exactly why it
          belongs to the section header rather than to either card. */}
      <section>
        <h3 className="text-base font-bold text-slate-800">{t('walkUp.heading')}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{t('walkUp.body')}</p>

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
              <span className="font-medium text-slate-700">{t('walkUp.ownTerminal')}</span>
              <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                {t('walkUp.current')}
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                {t('walkUp.ownTerminalHelp')}
              </span>
            </span>
          </div>

          <div className="flex items-start gap-2 opacity-60">
            <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
            <span className="text-sm min-w-0">
              <span className="font-medium text-slate-700">{t('walkUp.hatchgrab')}</span>
              <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                {t('walkUp.comingSoon')}
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                {t('walkUp.hatchgrabHelp')}
              </span>
              {/* 🔴 EVERY FIGURE FROM CARD_FEES. No literal rate.
                  ⚠️ TWO THINGS cardFees() ITSELF INSTRUCTS US TO SAY, and both are said here:
                    • the in-person rate is for UK/EEA-issued cards, and cards issued elsewhere cost MORE
                      — quoting the domestic rate alone "would be a claim that is untrue for some
                      customers";
                    • the Tap to Pay surcharge is stated SEPARATELY, never folded into the headline rate,
                      because folding it "would understate the cost for exactly the trucks most likely to
                      use it".
                  ⚠️ cardFees() holds no reader price or hardware cost, so none is quoted. If one is ever
                  needed it goes in cardFees() first, not into this string. */}
              <span className="block text-xs text-slate-400 mt-1">
                {t('walkUp.hatchgrabFees', { fee: cardFeeInPersonLabel(cs), region: cardRegionInPerson(cs), surcharge: tapToPaySurchargeLabel(cs) })}
              </span>
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
