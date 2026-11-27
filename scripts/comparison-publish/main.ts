// scripts/comparison-publish/main.ts — the comparison pages' PUBLISH STEP on its own (compare-fix-1, 24 November 2026;
// docs/compare-fix-1-report.md): no checker run, no Claude API call. The same code the checker runs after every run
// (lib/comparison-publish-run.ts runPublish), for every switched-on country — the evaluation only (pending findings are left for the
// next checker run).
//
//   npx -y -p pg@8.13.1 node scripts/competitor-check/run.mjs scripts/comparison-publish/main.ts [--dry-run]
//
// compare-fix-2 (24 November 2026; docs/compare-fix-2-report.md): over ONE Postgres connection (scripts/comparison-db.ts — the
// connection string read as scripts/db-migrate.cjs reads it, never printed) and in ONE TRANSACTION: every country's verdict, mark,
// plan pointer and event is kept together, or — on any error — none of them.
// --dry-run   the same run inside a transaction that ALWAYS rolls back: prints each country's verdict and what would be written,
//             and checks the tables after the rollback equal the tables before. No refresh is asked of the site.
// After a real run (and only once it has committed) the site is asked to refresh when REVALIDATE_SECRET is set (a NAME; no value is
// printed) — without it the pages pick the change up when their cache expires.
import { runPublish } from '@/lib/comparison-publish-run'
import { noCheckStore, pgPricingReads, pgPublishStore } from '@/lib/comparison-publish-store-pg'
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'
import { NO_COMPARISON_PAGE } from '@/lib/comparison-types'
import { comparisonTag } from '@/lib/marketing-tags'
import { inTransaction } from '@/lib/pg-rows'
import { comparisonTally, connectComparisonDb, tallyDiff } from '../comparison-db'

/** compare-cache-1 (27 November 2026): the changed countries' comparison pages (comparison-<CC>), and marketing-countries only when a live
 *  status changed (the landing footers' comparison link, the hreflang). Never throws. */
async function revalidate(codes: string[], liveChanged: boolean, log: (l: string) => void): Promise<boolean> {
  try {
    const secret = process.env.REVALIDATE_SECRET
    const base = (process.env.REVALIDATE_BASE_URL || 'https://www.hatchgrab.com').replace(/\/+$/, '')
    if (!secret) { log('revalidate: REVALIDATE_SECRET is not set — the pages pick the change up when their cache expires.'); return false }
    const res = await fetch(`${base}/api/revalidate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: [...codes.map(comparisonTag), ...(liveChanged ? ['marketing-countries'] : [])] }), signal: AbortSignal.timeout(10_000) })
    log(`revalidate: ${base}/api/revalidate answered ${res.status} (${codes.length} comparison page${codes.length === 1 ? '' : 's'}${liveChanged ? ' and marketing-countries' : ''}).`)
    return res.status === 200
  } catch (e) { log(`revalidate: the site could not be reached — ${e instanceof Error ? e.message : e}`); return false }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const log = (line: string) => console.log(line)
  const db = await connectComparisonDb('comparison-publish', log)
  try {
    log(`comparison-publish · countries only${dryRun ? ' · DRY RUN (one transaction that ROLLBACKs — nothing is kept)' : ' · one transaction'}`)
    const before = await comparisonTally(db.client)
    const p = await inTransaction(db.client, async () => {
      const report = await runPublish({ pricing: pgPricingReads(db.client), checks: noCheckStore(), store: pgPublishStore(db.client), now: () => new Date(), log,
        hasPage: code => !!COUNTRY_PATH_SEGMENTS[code] && !NO_COMPARISON_PAGE.includes(code), skipFindings: true })
      // 🔴 the UAE never publishes (the database refuses it too: comparison_publish_never_ae)
      if (report.verdicts.some(v => v.code === 'AE' && v.live)) throw new Error('AE came out live — refused; nothing was kept')
      const inside = await comparisonTally(db.client)
      log(`inside the transaction${dryRun ? ' (before its ROLLBACK)' : ''}: ${tallyDiff(before, inside)}`)
      if (report.countryErrors?.length) throw new Error(`${report.countryErrors.length} countries failed: ${report.countryErrors.map(x => `${x.code} — ${x.error}`).join(' | ')} — nothing was kept`)
      return report
    }, { rollback: dryRun })
    const live = p.verdicts.filter(v => v.live)
    log(`publish${dryRun ? ' (would be)' : ''}: ${live.length} live — ${live.map(v => `${v.code} (${v.shown.map(s => s.name).join(', ')})`).join('; ') || 'none'}`)
    const short = p.verdicts.filter(v => !v.live && v.shown.length === 1)
    log(`one short: ${short.map(v => `${v.code} (${v.shown[0].name})`).join('; ') || 'none'}`)
    const after = await comparisonTally(db.client)
    log(`tables after${dryRun ? ' the rollback' : ''}: ${tallyDiff(before, after)}`)
    if (dryRun && tallyDiff(before, after) !== 'no change') { console.error('🔴 the dry run changed the tables — this must never happen'); process.exitCode = 1 }
    // compare-cache-1: only the pages that changed in this run — none when nothing changed.
    const refresh = p.refreshed ?? []
    log(`pages${dryRun ? ' that would be' : ''} refreshed: ${refresh.length ? refresh.join(' ') : 'none'}${p.liveChanged ? ' + marketing-countries (a live status changed)' : ''}`)
    if (!dryRun && refresh.length) await revalidate(refresh, p.liveChanged === true, log)
  } finally { await db.close() }
}

main().catch(e => { console.error(`comparison-publish failed: ${String(e instanceof Error ? e.message : e).replace(/postgres(ql)?:\/\/\S+/g, '[redacted]')}`); process.exit(1) })
