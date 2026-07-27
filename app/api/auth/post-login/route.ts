// app/api/auth/post-login/route.ts
// Asks, for the operator who just signed in: is there somewhere they should go INSTEAD of /dashboard?
//
// ── 🔴 THIS IS THE HIGHEST-RISK SURFACE IN PHASE 4 ─────────────────────────────────────────────────
// It sits on the login path of every existing operator. A bug here locks Gusto out of their own dashboard
// on a trading day. The entire design is therefore built around ONE property:
//
//     EVERY failure, ambiguity, or unexpected shape returns `{ redirect: null }`,
//     which the caller treats as "carry on exactly as before".
//
// It cannot 500 the login, it cannot redirect an established operator anywhere new, and if this file were
// deleted tomorrow login would behave precisely as it did before Phase 4. Anything that would be an error
// elsewhere is a null here — the fallback IS the correct answer, not a degraded one.
//
// It also NEVER returns an arbitrary URL. The only non-null answer it can give is `/setup`, constructed
// here from an id we looked up ourselves. Nothing from the request influences the destination, so this
// cannot become an open-redirect.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** The one shape this route can return. `redirect: null` ⇒ caller keeps its existing behaviour. */
const stay = () => NextResponse.json({ redirect: null })

export async function GET(req: NextRequest) {
  try {
    // Session resolution mirrors the established pattern: cookie first (web), Bearer second (native).
    const supabaseAuth = await createSupabaseServerClient()
    let { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      const authz = req.headers.get('authorization')
      const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
      if (jwt) {
        const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
        if (bearerUser) user = bearerUser
      }
    }
    if (!user) return stay()

    // ── REPAIR-ON-LOGIN ────────────────────────────────────────────────────────────────────────────
    // Signup creates the auth user and the operator row in one request, and deletes the auth user if the
    // operator insert fails (see /api/signup). That compensating delete can ITSELF fail — leaving an auth
    // user who can sign in while the app cannot find them, which is an unrecoverable dead end for someone
    // who has done nothing wrong. This is the backstop.
    //
    // ⚠️ ASSUMPTION, STATED WHERE THE CODE STANDS: **every auth user in this system is an operator.**
    // That is true today — auth users are created only by /api/signup and by the two admin paths
    // (admin/create-operator, manage's add-user), and all three create an operators row. If that ever
    // stops being true — a customer login, a venue login, any second class of auth user — THIS BECOMES A
    // PRIVILEGE BUG: it would silently mint an operator record for a non-operator. Whoever adds a second
    // kind of auth user must gate this on something narrower than "has no operator row".
    let { data: operator } = await supabase
      .from('operators')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!operator) {
      const { data: repaired } = await supabase
        .from('operators')
        .insert({
          auth_user_id: user.id,
          email: user.email ?? '',
          name: (user.email ?? '').split('@')[0] || 'Operator',
        })
        .select('id')
        .single()
      if (!repaired) return stay()          // repair failed — better to land on /dashboard than to block
      console.warn(`[post-login] repaired missing operators row for auth user ${user.id}`)
      operator = repaired
    }

    // ── WHERE SHOULD THEY GO? ──────────────────────────────────────────────────────────────────────
    // `setup_step` is NULL for every truck that predates the wizard and every admin-created truck, and
    // NULL means "not in setup" — never "at step 1". Reading it the other way round would sweep existing
    // live operators into an onboarding flow, which is the exact catastrophe this file must not cause.
    const { data: trucks } = await supabase
      .from('trucks')
      .select('id, setup_step')
      .eq('operator_id', operator.id)

    // No trucks at all ⇒ they abandoned between signup and the identity step, which is a normal thing to
    // do. Send them into the wizard rather than to a dashboard that has nothing to show.
    if (!trucks || trucks.length === 0) return NextResponse.json({ redirect: '/setup' })

    // Any truck that is NOT mid-setup means they have somewhere real to be — established operators always
    // land here, because their trucks are all NULL.
    const settled = trucks.filter(t => t.setup_step == null || t.setup_step === 'done')
    if (settled.length > 0) return stay()

    // Every truck they own is mid-setup ⇒ resume the oldest incomplete one.
    return NextResponse.json({ redirect: `/setup?truck=${encodeURIComponent(trucks[0].id)}` })
  } catch (e) {
    // Deliberately swallowed. A thrown error here would surface as a failed login for someone whose
    // account is completely fine.
    console.error('[post-login] failed (falling through to default routing):', e instanceof Error ? e.message : e)
    return stay()
  }
}
