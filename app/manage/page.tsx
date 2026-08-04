// app/manage/page.tsx
// The TOKENLESS entry point to Manage. `/manage` with no token resolves the signed-in operator's truck
// server-side and forwards to `/manage/<dashboard_token>`.
//
// ── WHY IT EXISTS (E2) ───────────────────────────────────────────────────────────────────────────────
// 🔴 THE WELCOME EMAIL USED TO CARRY A DASHBOARD TOKEN IN ITS BODY, AND THAT TOKEN IS A CREDENTIAL.
// app/api/manage/route.ts authenticates on `dashboard_token` ALONE — no session — and its own comment
// at :840 spells out the consequence: "EVERY key on this allowlist is writable by any holder of the
// token". The token is long-lived and never rotates, so mailing it put a permanent bearer credential in
// an inbox. This route is the replacement: the email links here, and the session does the work.
//
// ── HOW THE LOGGED-OUT CASE IS HANDLED: IT ALREADY WAS ───────────────────────────────────────────────
// proxy.ts treats `pathname.startsWith('/manage')` as protected and, for an unauthenticated web
// request, redirects to `/login?next=<pathname>` — and app/login/page.tsx reads that `next` and pushes
// to it after a successful sign-in. So a logged-out operator following the emailed link is asked for
// their email and password and is then FORWARDED BACK HERE, which resolves and forwards again. That
// return path is pre-existing behaviour; nothing here builds it. The `!user` branch below is a
// belt-and-braces fallback for the native shell, which proxy deliberately defers rather than gating.
//
// ⚠️ CHANGES NOTHING ABOUT EXISTING LINKS. /manage/<token> still works exactly as it did — this is a
// sibling route, not a replacement, and neither /api/manage's auth nor the token itself is touched.
// Mirrors app/dashboard/page.tsx, which has done the same job for /dashboard since long before this.

import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveOperatorTruck } from '@/lib/resolve-operator-truck'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export default async function ManageIndexPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // No session — proxy normally catches this first and carries the return URL. Repeat it here so the
  // route is correct on its own terms rather than depending on middleware ordering.
  if (!user) redirect('/login?next=/manage')

  const { data: operator } = await supabaseAdmin
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // Signed in but no operator row: nothing to resolve. /setup is where an account without a truck
  // belongs, and it re-checks for a truck on mount, so it degrades sensibly rather than looping.
  if (!operator) redirect('/setup')

  // The SHARED resolver — same rule, same deterministic ordering, as the confirmation link and
  // /api/setup?check=truck. See lib/resolve-operator-truck.ts.
  const truck = await resolveOperatorTruck(supabaseAdmin, operator.id)

  if (!truck?.dashboard_token) redirect('/setup')
  redirect(`/manage/${encodeURIComponent(truck.dashboard_token)}`)
}
