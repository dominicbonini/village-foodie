// app/api/stripe/connect/route.ts
// The operator-facing Connect endpoint: create the account, mint an Account Session, reconcile readiness.
//
// ── 🔴 OWNER ONLY, AND RESOLVED THE SAME WAY MANAGE RESOLVES IT ────────────────────────────────────
// The Payments tab is owner-only in the UI, but a tab filter is a rendering decision and this route is
// reachable without it. So every action re-derives the role server-side using the SAME cascade
// app/api/manage/route.ts uses — session user → `operators.auth_user_id` → is this truck's
// `operator_id`? — and refuses anything else. A manager or staff member with the dashboard token gets a
// 403, not a connected account.
// ⚠️ The account is created against the OPERATOR, so the truck token is only ever an authentication
// device here. What gets written is `operators.stripe_account_id` for the truck's `operator_id`.
//
// ── 🔴 SANDBOX ONLY ────────────────────────────────────────────────────────────────────────────────
// Every path goes through lib/stripe/connect.ts, which refuses a key that is not `sk_test_`. There is no
// branch in this file that can bypass it.
//
// ── ⚠️ NOTHING HERE TOUCHES THE PAYMENT LEDGER ─────────────────────────────────────────────────────
// No `order_payments` write, no `recordCollectionPayment`, no resolver, no setting. Connect onboarding
// and the in-person ledger are separate systems that will meet later, at the PaymentIntent — which is
// explicitly not this pass.
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  createConnectedAccount, createAccountSession, readAccountReadiness,
  readAccountPosture, postureMismatches, readAccountRequirements,
} from '@/lib/stripe/connect'

type Ctx = { operatorId: string; email: string | null; country: string | null }

/** Resolve the calling user and prove they OWN this truck. Returns null for everyone else.
 *  ⚠️ NO PIN CHECK, DELIBERATELY. The dashboard PIN is a SHARED secret that gates the token; this route
 *  requires something strictly stronger — a logged-in session whose `operators` row IS this truck's
 *  `operator_id`. Adding a PIN test on top would not raise the bar, and it WOULD break every call from
 *  Manage, which authenticates by session and holds no PIN. */
async function requireOwner(token: string): Promise<Ctx | null> {
  // ⚠️ `country` is read here ONLY because Accounts v2 requires it at creation — see the note on
  // createConnectedAccount. The account belongs to the OPERATOR, so the authenticating truck's country
  // is the only country signal available at this point; every truck row is 'GB' today.
  const { data: truck } = await supabase
    .from('trucks')
    .select('id, operator_id, country')
    .eq('dashboard_token', token)
    .single()
  if (!truck) return null
  if (!truck.operator_id) return null

  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null

  const { data: sessionOperator } = await supabase
    .from('operators')
    .select('id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  // 🔴 OWNERSHIP, not membership. `truck_users` role is deliberately NOT consulted: a 'manager' row
  // would satisfy a membership test and must not reach account creation.
  if (!sessionOperator || sessionOperator.id !== truck.operator_id) return null
  return {
    operatorId: sessionOperator.id,
    email: sessionOperator.email ?? null,
    country: truck.country ?? null,
  }
}

/** Write the readiness cache. ⚠️ Stripe is the truth; this only ever mirrors a value just read from it. */
async function cacheReadiness(operatorId: string, chargesEnabled: boolean) {
  await supabase
    .from('operators')
    .update({ stripe_charges_enabled: chargesEnabled, stripe_account_synced_at: new Date().toISOString() })
    .eq('id', operatorId)
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const token = typeof body.token === 'string' ? body.token : null
  const action = typeof body.action === 'string' ? body.action : null
  if (!token || !action) return NextResponse.json({ error: 'Missing token or action' }, { status: 400 })

  const ctx = await requireOwner(token)
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const { data: operator } = await supabase
    .from('operators')
    .select('id, stripe_account_id, stripe_charges_enabled, stripe_account_synced_at')
    .eq('id', ctx.operatorId)
    .single()

  try {
    // ── STATUS ── the tab's own read, and the reconcile-on-open.
    // 🔴 RECONCILE READS STRIPE, it does not trust the cache. The cached value exists so a render need
    // not block on an API call; the point of opening the tab is to find out whether it is still true.
    if (action === 'status') {
      if (!operator?.stripe_account_id) {
        return NextResponse.json({
          accountId: null, chargesEnabled: false, syncedAt: null,
          detailsSubmitted: false, cardPaymentsStatus: null,
        })
      }
      // ⚠️ `detailsSubmitted` and `cardPaymentsStatus` are read for the tab's STATE MACHINE, not for the
      // money gate. Only `chargesEnabled` is cached below; the other two are per-request and are never
      // written to the database, because a stale "Stripe is checking" is worse than no answer.
      const { chargesEnabled, detailsSubmitted, cardPaymentsStatus } =
        await readAccountReadiness(operator.stripe_account_id)
      if (chargesEnabled !== operator.stripe_charges_enabled) {
        // The cache was wrong. This is the expected case immediately after onboarding completes, and the
        // interesting case when it flips back to false — see the report's customer-facing decision.
        console.log(
          `[stripe/connect] readiness drift for operator=${ctx.operatorId} account=${operator.stripe_account_id}: ` +
          `cached=${operator.stripe_charges_enabled} stripe=${chargesEnabled} — writing Stripe's value`,
        )
      }
      await cacheReadiness(ctx.operatorId, chargesEnabled)
      return NextResponse.json({
        accountId: operator.stripe_account_id,
        chargesEnabled,
        syncedAt: new Date().toISOString(),
        detailsSubmitted,
        cardPaymentsStatus,
      })
    }

    // ── REQUIREMENTS ── the Payments tab badge's only source.
    // ⚠️ SEPARATE FROM `status`, DELIBERATELY. `status` makes TWO Stripe calls and WRITES the readiness
    // cache; it is the tab's own reconcile-on-open and is far too heavy to run on every Manage page
    // load. This one makes a single v1 retrieve and writes nothing.
    // 🔴 NO ACCOUNT ⇒ NO STRIPE CALL AND NO BADGE. "Not connected" is not an outstanding requirement —
    // it is a feature the truck has not adopted, and Pay-at-Hatch is a complete way to trade. Badging
    // every unconnected truck would nag eleven of twelve about something they may never want. This
    // short-circuit is also why the endpoint costs nothing for those eleven.
    if (action === 'requirements') {
      if (!operator?.stripe_account_id) {
        return NextResponse.json({ connected: false, actionRequired: false })
      }
      const req = await readAccountRequirements(operator.stripe_account_id)
      if (req.actionRequired) {
        console.log(
          `[stripe/connect] requirements outstanding operator=${ctx.operatorId} account=${operator.stripe_account_id} ` +
          `currently_due=${req.currentlyDue.length} past_due=${req.pastDue.length} disabled_reason=${req.disabledReason ?? 'null'}`,
        )
      }
      return NextResponse.json({ connected: true, ...req })
    }

    // ── CREATE ACCOUNT ──
    // ⚠️ IDEMPOTENT BY READ, not by an idempotency key: if a row already carries an account we return it
    // rather than creating a second one. A duplicate `acct_…` cannot be merged or deleted, so the cheap
    // guard is worth more here than anywhere else.
    if (action === 'create_account') {
      if (operator?.stripe_account_id) {
        return NextResponse.json({ accountId: operator.stripe_account_id, alreadyExisted: true })
      }
      const account = await createConnectedAccount({
        email: ctx.email,
        country: ctx.country,
        businessUrl: null,
      })

      // ── 🔴 PERSIST FIRST. NOTHING GOES BETWEEN THE CREATE AND THIS WRITE. ───────────────────────
      // The account already exists at Stripe by this line and CANNOT BE DELETED. If the id is not
      // recorded, the operator row points at nothing and the whole downstream chain is a silent no-op:
      // the v1 `account.updated` webhook matches on `operators.stripe_account_id` and would find zero
      // rows, so readiness would never update and the failure would look like nothing happening.
      // ⚠️ The posture verification below is deliberately AFTER this — it is a check, and a check must
      // never be the reason an account id is lost.
      const { error } = await supabase
        .from('operators')
        .update({ stripe_account_id: account.id, stripe_account_synced_at: new Date().toISOString() })
        .eq('id', ctx.operatorId)
      if (error) {
        // 🔴 THE ACCOUNT EXISTS AT STRIPE AND WE FAILED TO RECORD IT. Say so loudly with the id: it is
        // recoverable by hand and unrecoverable if this line is the only place the id ever appeared.
        console.error(
          `[stripe/connect] ACCOUNT CREATED BUT NOT PERSISTED — operator=${ctx.operatorId} account=${account.id} ` +
          `— record it by hand before retrying, or a second account will be created:`, error.message,
        )
        return NextResponse.json({ error: 'Account created but not saved — contact support' }, { status: 500 })
      }
      console.log(`[stripe/connect] account created operator=${ctx.operatorId} account=${account.id}`)

      // ── 🔴 READ THE POSTURE BACK. NEVER INFER IT FROM WHAT WAS SENT. ───────────────────────────
      // `requirements_collector` is COMPUTED by Stripe and is never sent, so it can only be checked this
      // way; and `fees_collector` is the property that has inverted between API versions twice, where a
      // wrong value means HatchGrab silently pays every truck's Stripe fees. A 200 from the create call
      // is not evidence that the commercial position landed.
      // ⚠️ BEST-EFFORT AND NON-FATAL, DELIBERATELY. The account exists and is already recorded; failing
      // the request now would strand the operator without changing anything at Stripe. A mismatch is a
      // HatchGrab problem to fix by hand, so it is shouted into the log rather than shown to the truck.
      try {
        const posture = await readAccountPosture(account.id)
        const mismatches = postureMismatches(posture)
        if (mismatches.length) {
          console.error(
            `[stripe/connect] 🔴 POSTURE MISMATCH on account=${account.id} operator=${ctx.operatorId} — ` +
            `THE ACCOUNT WAS CREATED WITH A DIFFERENT COMMERCIAL POSITION THAN INTENDED. ` +
            `${mismatches.join('; ')}. ` +
            `If feesCollector is not 'stripe', HATCHGRAB IS PAYING THIS TRUCK'S STRIPE FEES. ` +
            `The account cannot be deleted — resolve it in the Stripe Dashboard.`,
          )
        } else {
          console.log(
            `[stripe/connect] posture verified account=${account.id} dashboard=${posture.dashboard} ` +
            `fees=${posture.feesCollector} losses=${posture.lossesCollector} ` +
            `requirements=${posture.requirementsCollector}`,
          )
        }
      } catch (postureErr) {
        console.error(
          `[stripe/connect] could not READ BACK posture for account=${account.id} — the account exists ` +
          `and is recorded, but its commercial position is UNVERIFIED:`,
          postureErr instanceof Error ? postureErr.message : postureErr,
        )
      }
      // Readiness is NOT assumed here. A brand-new account is not `charges_enabled`, and the column's
      // default false already says so.
      return NextResponse.json({ accountId: account.id, alreadyExisted: false })
    }

    // ── ACCOUNT SESSION ── the client secret the embedded components mount against.
    // ⚠️ A FRESH SESSION EVERY CALL, per the docs: Connect.js re-invokes fetchClientSecret when the
    // session expires, so returning a cached secret would hand back a dead one on a long-lived tab.
    if (action === 'account_session') {
      if (!operator?.stripe_account_id) {
        return NextResponse.json({ error: 'No connected account yet' }, { status: 409 })
      }
      const session = await createAccountSession(operator.stripe_account_id)
      return NextResponse.json({ clientSecret: session.client_secret })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    // The sandbox guard throws through here too, which is intended: a misconfigured key must surface as
    // a refusal the operator can see, not a silent no-op.
    const message = err instanceof Error ? err.message : 'Stripe request failed'
    console.error(`[stripe/connect] action=${action} operator=${ctx.operatorId} FAILED:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
