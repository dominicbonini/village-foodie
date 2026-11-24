// scripts/comparison-publish/main.ts — the comparison pages' PUBLISH STEP on its own (compare-fix-1, 24 November 2026;
// docs/compare-fix-1-report.md): no checker run, no Claude API call. The same code the checker runs after every run
// (lib/comparison-publish-run.ts runPublish), for every switched-on country.
//
//   node scripts/competitor-check/run.mjs scripts/comparison-publish/main.ts [--skip-findings] [--dry-run]
//
// --skip-findings  evaluate the countries only (pending findings are left for the next checker run)
// --dry-run        read everything and print each country's verdict; WRITES NOTHING (no marks, no rows, no events, no refresh)
// Environment (NAMES only): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; REVALIDATE_SECRET to tell the site (optional —
// without it the pages pick the change up when their cache expires). No value is ever printed.
import { createClient } from '@supabase/supabase-js'
import { runPublish, type PublishStore } from '@/lib/comparison-publish-run'
import { supabasePublishStore } from '@/lib/comparison-publish-store'
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'
import { NO_COMPARISON_PAGE } from '@/lib/comparison-types'

const has = (name: string) => process.argv.includes(`--${name}`)

async function revalidate(log: (l: string) => void): Promise<boolean> {
  try {
    const secret = process.env.REVALIDATE_SECRET
    const base = (process.env.REVALIDATE_BASE_URL || 'https://www.hatchgrab.com').replace(/\/+$/, '')
    if (!secret) { log('revalidate: REVALIDATE_SECRET is not set — the pages pick the change up when their cache expires.'); return false }
    const res = await fetch(`${base}/api/revalidate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: ['marketing-countries'] }), signal: AbortSignal.timeout(10_000) })
    log(`revalidate: ${base}/api/revalidate answered ${res.status}.`)
    return res.status === 200
  } catch (e) { log(`revalidate: the site could not be reached — ${e instanceof Error ? e.message : e}`); return false }
}

/** A store that writes nothing (the dry run). */
function readOnly(s: PublishStore): PublishStore {
  const none = async () => {}
  return { ...s, savePublish: none, noteFinding: none, rejectFinding: none, markAccepted: none, setAutoVerified: none, setCompetitor: none, addEvents: none, setEntryPlan: none }
}

async function main() {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[name]) throw new Error(`${name} is not set.`)
  const dryRun = has('dry-run')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  process.env.SUPABASE_URL ||= process.env.NEXT_PUBLIC_SUPABASE_URL   // the Admin stores read lib/supabase.ts
  const [{ servicePricingStore }, { serviceCheckStore }] = await Promise.all([import('@/lib/admin/pricing-check-store'), import('@/lib/admin/competitor-check-store')])
  const store = supabasePublishStore(db)
  console.log(`comparison-publish${dryRun ? ' · DRY RUN (writes nothing)' : ''}${has('skip-findings') ? ' · countries only' : ''}`)
  const p = await runPublish({ pricing: servicePricingStore, checks: serviceCheckStore, store: dryRun ? readOnly(store) : store, now: () => new Date(), log: line => console.log(line),
    hasPage: code => !!COUNTRY_PATH_SEGMENTS[code] && !NO_COMPARISON_PAGE.includes(code), skipFindings: dryRun || has('skip-findings'),
    revalidate: dryRun ? undefined : () => revalidate(line => console.log(line)) })
  const live = p.verdicts.filter(v => v.live)
  console.log(`publish: ${live.length} live — ${live.map(v => `${v.code} (${v.shown.map(s => s.name).join(', ')})`).join('; ') || 'none'}`)
  const short = p.verdicts.filter(v => !v.live && v.shown.length === 1)
  console.log(`one short: ${short.map(v => `${v.code} (${v.shown[0].name})`).join('; ') || 'none'}`)
  if (p.countryErrors?.length) { console.error(`publish: ${p.countryErrors.length} countries failed: ${p.countryErrors.map(x => `${x.code} — ${x.error}`).join(' | ')}`); process.exitCode = 1 }
}

main().catch(e => { console.error(`comparison-publish failed: ${e instanceof Error ? e.message : e}`); process.exit(1) })
