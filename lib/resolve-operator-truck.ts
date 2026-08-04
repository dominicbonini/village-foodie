// lib/resolve-operator-truck.ts
// ONE definition of "which of this operator's trucks do we send them to?".
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
// The rule was written out twice, independently, and the second copy's own comment admitted it:
//   • app/api/auth/verify-signup/route.ts — where the confirmation link lands
//   • app/api/setup/route.ts (?check=truck) — "Same truck-selection rule as verify-signup"
// E2 needed it a third time, for the tokenless /manage entry point the welcome email now links to. A
// third hand-written copy of a rule that is already duplicated is how the two copies start disagreeing,
// so all three now call this.
//
// 🔴 THE ORDERING IS LOAD-BEARING, NOT TIDINESS. `.order('created_at', { ascending: true })` is what
// makes the answer DETERMINISTIC for an operator with more than one truck. Without it PostgREST returns
// rows in whatever order the planner produces, so "the first one" could be a different truck on two
// consecutive requests — an operator would follow the same emailed link twice and land on two different
// trucks. Do not remove it, and do not rely on the caller adding it.
//
// ⚠️ THIS IS A ROUTING CONVENIENCE, NOT AN AUTHORISATION CHECK. It answers "where should this operator
// be sent", having ALREADY established who they are. It filters on operator_id alone and grants
// nothing; every caller resolves the operator from a session or a single-purpose token first.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResolvedOperatorTruck {
  dashboard_token: string
  setup_step: string | null
  name: string | null
}

/**
 * The operator's truck for redirect purposes, or null if they have none.
 *
 * Selection rule, unchanged from the two call sites this replaces: prefer a truck still IN SETUP —
 * that is where an unfinished operator needs to be — and otherwise fall back to their OLDEST. Someone
 * who has finished setting up should land on their console, not back in a naming form.
 */
export async function resolveOperatorTruck(
  supabase: SupabaseClient,
  operatorId: string,
): Promise<ResolvedOperatorTruck | null> {
  const { data: trucks } = await supabase
    .from('trucks')
    .select('dashboard_token, setup_step, name')
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: true })

  const rows = (trucks ?? []) as ResolvedOperatorTruck[]
  return rows.find(t => t.setup_step && t.setup_step !== 'done') ?? rows[0] ?? null
}
