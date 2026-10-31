// lib/demo-events.ts — demo-2 (30 October 2026, docs/demo-2-report.md): the demo funnel's counts.
//
// One row in public.demo_events per step a demo takes — which demo (its truck id, `demo-…`), which step, when, and
// whether it is a landing or an outreach demo. 🔴 NO EMAIL AND NO TOKEN: a truck id is neither (lib/demo.ts generates
// the id, the slug and the dashboard token independently). The table has no foreign key to demo_sessions, so the
// cleanup sweep never takes a count with it — Admin › Demos can count a month of demos that no longer exist.
//
// SERVER-SIDE WRITES ONLY. Every step that has a server request writes its own row there (the build, the order, the
// kitchen buttons, the signup). The one step with no request of its own — the visitor pressing "Start free" — is
// written by /api/demo/walkthrough when the page tells it, the same as everything else: nothing reaches PostHog.
//
// BEST-EFFORT, ALWAYS. A count must never break a demo: a missing table (before 20261052 is run), a refused insert or
// a network error is swallowed and logged once. Callers AWAIT it (it never throws): a serverless function may be frozen
// the moment it answers, so a write left running after the response could be lost.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'

export const DEMO_EVENTS = [
  'build_started', 'build_ok', 'build_failed', 'sample_used', 'menu_viewed',
  'order_placed', 'cooking_started', 'ready_pressed', 'signup_started', 'signup_done',
] as const
export type DemoEvent = (typeof DEMO_EVENTS)[number]
export type DemoSource = 'landing' | 'outreach'

export const isDemoEvent = (v: unknown): v is DemoEvent => typeof v === 'string' && (DEMO_EVENTS as readonly string[]).includes(v)

/** landing or outreach, read from the demo's session (an outreach demo carries `discovery_truck_id`). null when the
 *  session cannot be read — the count is still written, it is only unfiled. */
export async function demoSourceOf(supabase: SupabaseClient, demoId: string): Promise<DemoSource | null> {
  try {
    const { data, error } = await supabase.from('demo_sessions').select('discovery_truck_id').eq('truck_id', demoId).maybeSingle()
    if (error || !data) return null
    return (data as { discovery_truck_id?: string | null }).discovery_truck_id ? 'outreach' : 'landing'
  } catch { return null }
}

let warned = false
/**
 * Records one step. `demoId` must be a demo truck id or null (a build that failed before a truck existed); anything
 * else is refused here, so an operator truck's id can never land in the table. Never throws.
 */
export async function recordDemoEvent(
  supabase: SupabaseClient,
  row: { demoId: string | null; event: DemoEvent; source?: DemoSource | null; at?: Date },
): Promise<void> {
  if (row.demoId !== null && !isDemoIdentifier(row.demoId)) return
  if (!isDemoEvent(row.event)) return
  try {
    const source = row.source !== undefined ? row.source : row.demoId ? await demoSourceOf(supabase, row.demoId) : null
    const { error } = await supabase.from('demo_events').insert({
      demo_id: row.demoId, event: row.event, source, ...(row.at ? { at: row.at.toISOString() } : {}),
    })
    if (error && !warned) { warned = true; console.warn(`[demo-events] not recorded (${error.message}) — is 20261052 run?`) }
  } catch (err) {
    if (!warned) { warned = true; console.warn('[demo-events] not recorded:', err) }
  }
}

/** The funnel for Admin › Demos: per step, how many DEMOS reached it (distinct demo ids), plus the raw count of rows
 *  for the two build steps that can have no demo id. Pure — the route passes the rows for the chosen dates. */
export function demoFunnel(rows: { demo_id: string | null; event: string; source: string | null }[], source: DemoSource | 'all' = 'all'):
  Record<DemoEvent, number> {
  const out = Object.fromEntries(DEMO_EVENTS.map(e => [e, 0])) as Record<DemoEvent, number>
  const seen = Object.fromEntries(DEMO_EVENTS.map(e => [e, new Set<string>()])) as Record<DemoEvent, Set<string>>
  for (const r of rows) {
    if (!isDemoEvent(r.event)) continue
    if (source !== 'all' && r.source !== source) continue
    if (r.demo_id === null) { out[r.event]++; continue }   // a build that died before its truck existed
    if (seen[r.event].has(r.demo_id)) continue
    seen[r.event].add(r.demo_id); out[r.event]++
  }
  return out
}
