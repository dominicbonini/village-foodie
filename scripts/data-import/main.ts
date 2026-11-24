// scripts/data-import/main.ts — imports every registered data file not yet imported in its current version
// (competitor-check-2, 29 October 2026; lib/data-import/importer.ts). The first step of .github/workflows/competitor-check.yml.
//
//   npx -y -p pg@8.13.1 node scripts/competitor-check/run.mjs scripts/data-import/main.ts [--dry-run]
//
// compare-fix-2 (24 November 2026; docs/compare-fix-2-report.md): over ONE Postgres connection (scripts/comparison-db.ts — the
// connection string read as scripts/db-migrate.cjs reads it, never printed), and EACH FILE IN ONE TRANSACTION: a file is imported
// all-or-nothing; on any error its transaction is rolled back and only the data_imports 'error' row is written.
// --dry-run   the real import of every file not yet imported, inside a transaction that ALWAYS rolls back: prints what would be
//             written (the importer's counts and the tables' row counts inside the transaction) and checks the counts after the
//             rollback equal the counts before. Records nothing.
// No Claude API call. Exits non-zero when a file fails.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runImports } from '@/lib/data-import/importer'
import { pgImportStore } from '@/lib/data-import/store-pg'
import { inTransaction } from '@/lib/pg-rows'
import { comparisonTally, connectComparisonDb, tallyDiff } from '../comparison-db'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const log = (line: string) => console.log(line)
  const db = await connectComparisonDb('data-import', log)
  try {
    log(`data-import${dryRun ? ' · DRY RUN (every file in a transaction that ROLLBACKs — nothing is kept)' : ' · each file in one transaction'}`)
    const before = await comparisonTally(db.client)
    log(`tables before: ${JSON.stringify(before)}`)
    const outcomes = await runImports({
      store: pgImportStore(db.client),
      read: p => readFileSync(path.join(process.cwd(), p)),
      sha256: b => createHash('sha256').update(b).digest('hex'),
      now: () => new Date(),
      log,
      dryRun,
      transaction: (fn, o) => inTransaction(db.client, async () => {
        const out = await fn()
        if (o.rollback) {
          const inside = await comparisonTally(db.client)
          log(`  inside the transaction (before its ROLLBACK): ${tallyDiff(before, inside)}`)
          if (inside.pending_answers !== 0) throw new Error(`${inside.pending_answers} answer(s) left "pending" — the import did not finish its write order`)
          if (inside.pairs_without_current > before.pairs_without_current) throw new Error(`${inside.pairs_without_current - before.pairs_without_current} (competitor, feature, country) left without a current answer`)
        }
        return out
      }, o),
    })
    const after = await comparisonTally(db.client)
    log(`tables after: ${tallyDiff(before, after)}`)
    if (dryRun && tallyDiff(before, after) !== 'no change') { console.error('🔴 the dry run changed the tables — this must never happen'); process.exitCode = 1 }
    if (outcomes.some(o => o.status === 'error')) process.exitCode = 1
  } finally { await db.close() }
}

main().catch(e => { console.error(`data-import failed: ${String(e instanceof Error ? e.message : e).replace(/postgres(ql)?:\/\/\S+/g, '[redacted]')}`); process.exit(1) })
