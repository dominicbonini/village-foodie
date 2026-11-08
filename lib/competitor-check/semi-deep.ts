// lib/competitor-check/semi-deep.ts — THE SEMI-DEEP CHECK, STARTED ONCE BY THE NEW CHECKER CODE (compare-autopublish-1, 7 November 2026;
// supabase/migrations/20261082_compare_autopublish_1_semi_deep.sql). competitor_check_settings.semi_deep holds the list (each country's
// shown four, priority order). On the first run that finds it 'waiting', this turns it into ordinary "Check now" requests — check_requested_at
// one second apart in the list's order, so the routine run takes them first and in that order (lib/competitor-check/core.ts selectRoutine);
// the daily cap spreads the rest over the next nights — and makes each competitor's core and commercial features WITHOUT a pages record
// due (their every-country check date moved back 91 days; the interval is 90). Then status 'started'. Never twice; never in a dry run.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function startSemiDeep(db: SupabaseClient, log: (l: string) => void, now = new Date()): Promise<number> {
  const { data: s, error } = await db.from('competitor_check_settings').select('semi_deep').eq('id', true).maybeSingle()
  if (error) { if (/semi_deep|does not exist/i.test(error.message)) return 0; throw new Error(`semi-deep: ${error.message}`) }
  const sd = (s?.semi_deep ?? null) as { status?: string; ids?: string[] } | null
  if (!sd || sd.status !== 'waiting' || !Array.isArray(sd.ids)) return 0
  const { data: feats, error: fe } = await db.from('comparison_features').select('key').in('tier', ['core', 'commercial'])
  if (fe) throw new Error(`semi-deep: ${fe.message}`)
  const keys = (feats ?? []).map(f => String((f as { key: string }).key))
  let requested = 0
  for (const [i, id] of sd.ids.entries()) {
    const at = new Date(now.getTime() - (sd.ids.length - i) * 1000).toISOString()
    const { data } = await db.from('competitors').update({ check_requested_at: at }).eq('id', id).is('check_requested_at', null).eq('lifecycle', 'active').select('id')
    requested += (data ?? []).length
    const { data: rows } = await db.from('competitor_feature_checks').select('feature_key, checked_on').eq('competitor_id', id).eq('country_code', '').is('pages_checked', null).in('feature_key', keys)
    for (const r of (rows ?? []) as { feature_key: string; checked_on: string }[]) {
      const d = new Date(`${r.checked_on}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 91)
      await db.from('competitor_feature_checks').update({ checked_on: d.toISOString().slice(0, 10) }).eq('competitor_id', id).eq('country_code', '').eq('feature_key', r.feature_key)
    }
  }
  await db.from('competitor_check_settings').update({ semi_deep: { ...sd, status: 'started', started_at: now.toISOString(), requested } }).eq('id', true)
  log(`semi-deep: ${requested} of ${sd.ids.length} competitors requested (the rest were already requested or are no longer active)`)
  return requested
}
