// scripts/competitor-check/main.ts — the automatic competitor checker's entry point (competitor-check-1, 25 October 2026;
// docs/competitor-check-1-report.md). Run by .github/workflows/competitor-check.yml through scripts/competitor-check/run.mjs
// (which bundles this file with esbuild so the "@/" imports resolve).
//
//   node scripts/competitor-check/run.mjs --mode scheduled|routine|deep|single|pass [--competitor <id or name>] [--limit N] [--dry-run]
// competitor-check-3: mode pass runs the quick pass's share (collect the batch in flight, submit the next); the nightly
// 'scheduled' job runs it first, then the deep and routine shares.
//
// Environment (NAMES only here): the Claude API login is Workload Identity Federation (competitor-check-1c) — the SDK reads
// ANTHROPIC_FEDERATION_RULE_ID, ANTHROPIC_ORGANIZATION_ID, ANTHROPIC_SERVICE_ACCOUNT_ID, ANTHROPIC_WORKSPACE_ID and the
// GitHub OIDC token in ANTHROPIC_IDENTITY_TOKEN_FILE (the workflow keeps it fresh). NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (as the scraper's workflows), and for the summary email BREVO_API_KEY / EMAIL_FROM_ADDRESS
// (lib/email.ts skips the email, with a warning, when they are not set). No value is ever printed.
// 🔴 --dry-run calls the API and WRITES NOTHING: no run row, no finding, no schedule; it prints the findings.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { runChecker, summaryEmail, exitCodeOf, type CheckerDeps } from '@/lib/competitor-check/checker'
import { supabaseCheckerStore } from '@/lib/competitor-check/store-supabase'
import { sendConfirmationEmail } from '@/lib/email'
import { ADMIN_ALERT_TO } from '@/lib/custom-domain/alert'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null
}
const has = (name: string) => process.argv.includes(`--${name}`)

async function main() {
  const mode = (arg('mode') ?? 'scheduled') as 'scheduled' | 'routine' | 'deep' | 'single' | 'pass'
  if (!['scheduled', 'routine', 'deep', 'single', 'pass'].includes(mode)) throw new Error(`--mode must be scheduled, routine, deep, single or pass (got "${mode}")`)
  const competitor = arg('competitor')
  if (mode === 'single' && !competitor) throw new Error('--mode single needs --competitor <id or name>')
  const limitArg = arg('limit')
  const limit = limitArg ? Number(limitArg) : null
  if (limit !== null && !(Number.isInteger(limit) && limit > 0 && limit <= 500)) throw new Error('--limit must be a whole number from 1 to 500')
  const dryRun = has('dry-run')
  const trigger = has('manual') || mode !== 'scheduled' ? 'manual' : 'schedule'
  // Before any API call: the federation login needs all four variables, and an API key would outrank it in the SDK.
  for (const name of ['ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID', 'ANTHROPIC_WORKSPACE_ID'])
    if (!process.env[name]) throw new Error(`${name} is not set (a repository variable, for the Claude API's Workload Identity Federation login).`)
  if (process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is set. Remove it: this checker logs in with Workload Identity Federation, and an API key would be used instead.')
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[name]) throw new Error(`${name} is not set (a repository secret).`)

  // No credential argument: the SDK finds the federation variables and the token file itself.
  const anthropic = new Anthropic({ maxRetries: 5, timeout: 300_000 })   // retries 408/409/429/5xx (incl. overloaded) with backoff
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const deps: CheckerDeps = {
    api: params => anthropic.beta.messages.create(params as never) as never,
    // competitor-check-3: the Message Batches API — the quick pass submits its share as one batch (50% off tokens).
    batch: {
      create: requests => anthropic.beta.messages.batches.create({ requests } as never) as never,
      retrieve: id => anthropic.beta.messages.batches.retrieve(id) as never,
      results: id => anthropic.beta.messages.batches.results(id) as never,
    },
    store: supabaseCheckerStore(db),
    now: () => new Date(),
    log: line => console.log(line),
    dryRun,
  }
  console.log(`competitor-check · mode ${mode}${competitor ? ` · ${competitor}` : ''}${limit ? ` · limit ${limit}` : ''}${dryRun ? ' · DRY RUN (writes nothing)' : ''}`)
  const reports = await runChecker(deps, { mode: mode === 'scheduled' ? 'scheduled' : mode, trigger, competitor, limit })
  for (const r of reports) console.log(`${r.mode}: ${r.checked} checked, ${r.failed.length} failed, ${r.findings.length} findings, $${r.spend.usd.toFixed(3)} — ${r.stoppedReason}${r.error ? ` (${r.error})` : ''}`)
  if (!dryRun) {
    const mail = summaryEmail(reports, 'https://www.hatchgrab.com/admin?tab=pricing')
    if (mail) await sendConfirmationEmail({ to: ADMIN_ALERT_TO, subject: mail.subject, html: mail.html, text: mail.text, senderName: 'HatchGrab' })
  }
  // competitor-check-2: a failed login, or a run in which every competitor failed, is a red cross in Actions.
  process.exitCode = exitCodeOf(reports)
  if (process.exitCode) console.error('competitor-check: a run stopped with an error (above) — exiting non-zero.')
}

main().catch(e => { console.error(`competitor-check failed: ${e instanceof Error ? e.message : e}`); process.exit(1) })
