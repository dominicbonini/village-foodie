// Canonical admin check — the SINGLE source used by both the admin API (app/api/admin/route.ts) and the
// server-side /landing gate (app/landing/layout.tsx). Do not fork this: web resolves the operator from the
// Supabase session cookie; the native app (no cookie on fetches) passes its session as a Bearer, which is
// only consulted when a NextRequest is supplied and there's no cookie user. Authority = operators.is_admin.
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const serviceClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function verifyAdmin(req?: NextRequest): Promise<boolean> {
  return (await adminUser(req)) !== null
}

/**
 * The signed-in ADMIN — same check as verifyAdmin, which is now this plus `!== null` — or null. Exists
 * so a route that records WHO made a change (the Countries page stamps updated_by) asks the one question
 * once rather than verifying and then looking the user up a second way.
 */
export async function adminUser(req?: NextRequest): Promise<{ id: string; email: string | null } | null> {
  const supabaseAuth = await createSupabaseServerClient()
  let { data: { user } } = await supabaseAuth.auth.getUser()   // WEB (cookie) — resolves first
  // ADDITIVE (native app): no cookie, but sends its Supabase session as a Bearer. Only reached when there's
  // no cookie user AND an Authorization header is present → a browser (cookie auth) never enters this branch.
  if (!user && req) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await serviceClient.auth.getUser(jwt)
      if (bearerUser) user = bearerUser
    }
  }
  if (!user) return null
  const { data: operator } = await serviceClient
    .from('operators')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .single()
  return operator?.is_admin ? { id: user.id, email: user.email ?? null } : null
}
