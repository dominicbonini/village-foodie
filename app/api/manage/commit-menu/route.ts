// app/api/manage/commit-menu/route.ts
// Thin HTTP wrapper. All commit logic lives in lib/menu-commit.ts so the server-side demo provisioner can
// call it directly instead of self-fetching this route. Behaviour over the wire is UNCHANGED — same auth,
// same request shape, same response shape (plus two ADDITIVE reconciliation fields the manage UI ignores).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { commitMenu, clearMenu } from '@/lib/menu-commit'
import type { Actor } from '@/lib/allergen-audit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { token, categories, items, categoryPrep, clearFirst } = await req.json()

  const { data: truck } = await supabase
    .from('trucks')
    .select('id')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // ── CLEAR-BEFORE-RETRY (opt-in; default OFF so the operator path is byte-identical) ──────────────
  // commitMenu is neither transactional nor idempotent, so committing twice APPENDS — which is correct
  // for the operator "import more items" flow, but wrong for the demo→real MIGRATION, where a retry after
  // a partial commit must repair, not duplicate. The migration passes clearFirst:true; the operator import
  // never sets it. Guarded to setup-mode trucks so it can never wipe a live menu: setup_step present and
  // not 'done' means the truck is still being built and has no real service to protect.
  if (clearFirst === true) {
    const { data: t } = await supabase.from('trucks').select('setup_step').eq('id', truck.id).single()
    const inSetup = t?.setup_step != null && t.setup_step !== 'done'
    if (!inSetup) {
      return NextResponse.json({ error: 'clearFirst is only permitted on a truck still in setup.' }, { status: 400 })
    }
    // clearMenu deletes exactly what commitMenu writes (items + groups→options/links + categories), in the
    // module that owns that graph — not reconstructed here from partial FK knowledge.
    try {
      await clearMenu(supabase, truck.id)
    } catch (e) {
      return NextResponse.json({ error: `Could not clear the previous attempt: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 500 })
    }
  }

  // (A) Audit identity for the import. Import is NOT owner/admin-gated (it only STAGES allergens as
  // verified=false — hidden from customers; the visibility-creating CONFIRM is gated in the manage
  // route), but it IS logged. Best-effort actor resolution mirrors the manage route.
  let importActor: Actor = { actor_user_id: null, actor_role: null, auth_method: 'token' }
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser()
    if (user) importActor = { actor_user_id: user.id, actor_role: 'owner', auth_method: 'authenticated' }
  } catch { /* token-only import */ }

  const result = await commitMenu(supabase, truck, { categories, items, categoryPrep }, importActor)
  return NextResponse.json(result)
}
