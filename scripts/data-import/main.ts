// scripts/data-import/main.ts — imports every registered data file not yet imported in its current version
// (competitor-check-2, 29 October 2026; lib/data-import/importer.ts). The first step of .github/workflows/competitor-check.yml:
//
//   node scripts/competitor-check/run.mjs scripts/data-import/main.ts
//
// No Claude API call and no API login: it needs only NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (names only;
// no value is ever printed). Exits non-zero when a file fails, so the run shows a red cross; the checker steps still run.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { runImports } from '@/lib/data-import/importer'
import { supabaseImportStore } from '@/lib/data-import/store-supabase'

async function main() {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[name]) throw new Error(`${name} is not set (a repository secret).`)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const outcomes = await runImports({
    store: supabaseImportStore(db),
    read: p => readFileSync(path.join(process.cwd(), p)),
    sha256: b => createHash('sha256').update(b).digest('hex'),
    now: () => new Date(),
    log: line => console.log(line),
  })
  if (outcomes.some(o => o.status === 'error')) process.exitCode = 1
}

main().catch(e => { console.error(`data-import failed: ${e instanceof Error ? e.message : e}`); process.exit(1) })
