// app/api/signup/route.ts
// Self-serve account creation (spec Phase 4, step 14). Creates the auth user + operators row and NOTHING
// ELSE — the truck is created at the END of the identity step, not here (see /api/setup).
//
// ── WHY NO TRUCK HERE ──────────────────────────────────────────────────────────────────────────────
// For an operator truck `id` IS the name-slug (provision-truck.ts: operatorIdentity → createSlug(name)),
// it is the public order URL, and it is referenced by ~26 tables. Creating a truck before a name exists
// means either a permanent random slug on their printed QR code, or a 26-table rename migration per
// signup. Deferring one screen costs nothing and avoids both.
//
// ── ADMIN-GATED UNTIL EXPLICITLY OPENED ────────────────────────────────────────────────────────────
// Public signup ships OFF. `SIGNUP_PUBLIC=true` opens it; until then only an admin session may create an
// account, so the whole path — real inbox, real verification email, real wizard — can be exercised before
// the first real prospect meets it. Enforced SERVER-SIDE: the page's UI state is a courtesy, this is the gate.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { signupRatelimit, signupEmailRatelimit } from '@/lib/ratelimit'
import { sendConfirmationEmail } from '@/lib/email'
import { isDemoIdentifier } from '@/lib/demo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Which document they agreed to. `holding-` marks the interim pages — these accounts need re-consent
 *  when real terms ship, and this value is what makes that queryable rather than guesswork. */
const TERMS_VERSION = 'holding-2026-07-23'
const VERIFY_TTL_DAYS = 7
const MIN_PASSWORD = 8

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 })

  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const marketingOptIn = body.marketing_opt_in === true
  const demoToken = typeof body.demo === 'string' ? body.demo : null

  if (!email.includes('@') || email.length > 254) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 })
  }

  // ── GATE ────────────────────────────────────────────────────────────────────────────────────────
  if (process.env.SIGNUP_PUBLIC !== 'true') {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    const { data: caller } = user
      ? await supabase.from('operators').select('is_admin').eq('auth_user_id', user.id).maybeSingle()
      : { data: null }
    if (!caller?.is_admin) {
      return NextResponse.json({ ok: false, error: 'Sign-up isn’t open yet.' }, { status: 403 })
    }
  }

  // ── RATE LIMITS: two dimensions, two different attacks ──────────────────────────────────────────
  // Per-IP protects our costs and Brevo's shared daily cap (whose first casualty when exhausted is order
  // confirmations for LIVE trucks). Per-EMAIL protects a third party from having their inbox filled with
  // verification mail by someone who simply rotates IP. Fail-OPEN if the limiter is unreachable — the
  // limiter being down must not stop legitimate signups.
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const [byIp, byEmail] = await Promise.all([
      signupRatelimit.limit(`ip:${ip}`),
      signupEmailRatelimit.limit(`email:${email}`),
    ])
    if (!byIp.success || !byEmail.success) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts just now — please try again shortly.' }, { status: 429 })
    }
  } catch { /* limiter unavailable → allow */ }

  // ── CREATE THE AUTH USER ────────────────────────────────────────────────────────────────────────
  // email_confirm:true mirrors the existing admin path — they can sign in immediately. Our OWN verification
  // (below) is separate and non-blocking; it gates GO-LIVE, not access (spec O11).
  // must_change_password:false — they chose this password. The admin path sets it true because it issues a
  // temporary one; copying that here would force a reset on a password they just typed.
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { must_change_password: false },
  })

  if (authError || !authData?.user) {
    const msg = authError?.message ?? 'Could not create the account.'
    // Existing account: we tell them plainly. This leaks that the address is registered — accepted
    // deliberately (near-universal in B2B signup), because the alternative punishes the far commoner case
    // of someone who forgot they already have an account.
    if (/already|registered|exists/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: 'There’s already an account with that email — sign in instead.', existing: true },
        { status: 409 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }

  const authUserId = authData.user.id

  // ── CREATE THE OPERATOR ROW, OR UNDO THE AUTH USER ──────────────────────────────────────────────
  // 🔴 COMPENSATING DELETE. An auth user with no operators row can sign in while the app cannot find them
  // — an unusable account that looks like ours breaking, from which they cannot recover. Deleting is safe
  // here and ONLY here: the user is seconds old and owns nothing, so this turns a broken state into
  // "nothing happened", which is a state they can simply retry from.
  // If the delete ITSELF fails, /api/auth/post-login repairs on next login.
  const { data: operator, error: opError } = await supabase
    .from('operators')
    .insert({
      auth_user_id: authUserId,
      email,
      name: email.split('@')[0],
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
      marketing_opt_in: marketingOptIn,
    })
    .select('id')
    .single()

  if (opError || !operator) {
    const { error: undoError } = await supabase.auth.admin.deleteUser(authUserId)
    if (undoError) {
      console.error(`[signup] ORPHAN AUTH USER ${authUserId} — operators insert failed (${opError?.message}) ` +
        `and the compensating delete also failed (${undoError.message}). post-login will repair it.`)
    }
    return NextResponse.json({ ok: false, error: 'Could not finish creating your account — please try again.' }, { status: 500 })
  }

  // ── VERIFICATION EMAIL — sent now, enforced at go-live ──────────────────────────────────────────
  // Non-blocking by design: an inbox round-trip at the moment of highest intent costs conversions to solve
  // a problem that is not yet urgent (nothing is public during setup). Sent NOW because this is when the
  // address is freshest and a typo is most likely to be spotted. lib/go-live-checks.ts is what makes it
  // matter, at the moment real customers start placing real orders.
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + VERIFY_TTL_DAYS * 86_400_000).toISOString()
  const { error: verifyErr } = await supabase.from('operator_email_verifications')
    .insert({ operator_id: operator.id, email, token, expires_at: expiresAt })

  if (verifyErr) {
    // Account is fine; only the verification record failed. Never fail the signup for it.
    console.error('[signup] verification row failed:', verifyErr.message)
  } else {
    const origin = req.nextUrl.origin
    const link = `${origin}/api/auth/verify-signup?token=${token}`
    // sendConfirmationEmail never throws — email failure must not fail signup.
    await sendConfirmationEmail({
      to: email,
      senderName: 'HatchGrab',
      subject: 'Confirm your email address',
      html: `<p>Welcome to HatchGrab.</p>
             <p>Please confirm this is your email address — we use it for order notifications and to get you
             back into your account if anything goes wrong.</p>
             <p><a href="${link}">Confirm my email address</a></p>
             <p style="color:#64748b;font-size:13px">This link works for ${VERIFY_TTL_DAYS} days. You can carry on
             setting up in the meantime — you'll only need this done before you go live.</p>`,
      text: `Welcome to HatchGrab.\n\nConfirm your email address: ${link}\n\n` +
            `This link works for ${VERIFY_TTL_DAYS} days. You can carry on setting up in the meantime — ` +
            `you'll only need this done before you go live.`,
    })
  }

  // ── CLAIM THE DEMO ──────────────────────────────────────────────────────────────────────────────
  // Marks which demo this account came from. Two jobs: it stops the cleanup job deleting a demo mid-
  // migration, and it is what the identity step reads to find the stored extraction to re-commit from.
  // Best-effort — a signup must never fail because a demo could not be linked.
  if (demoToken && isDemoIdentifier(demoToken)) {
    const { data: demoTruck } = await supabase
      .from('trucks').select('id').eq('dashboard_token', demoToken).maybeSingle()
    if (demoTruck) {
      await supabase.from('demo_sessions')
        .update({ claimed_by_operator_id: operator.id }).eq('truck_id', demoTruck.id)
    }
  }

  return NextResponse.json({ ok: true, operatorId: operator.id })
}
