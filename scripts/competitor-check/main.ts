// scripts/competitor-check/main.ts — the automatic competitor checker's entry point (competitor-check-1, 25 October 2026;
// docs/competitor-check-1-report.md). Run by .github/workflows/competitor-check.yml through scripts/competitor-check/run.mjs
// (which bundles this file with esbuild so the "@/" imports resolve).
//
//   node scripts/competitor-check/run.mjs --mode scheduled|routine|deep|single|pass [--competitor <id or name>] [--limit N] [--dry-run] [--job-minutes N]
// competitor-check-8: --job-minutes — the time this job may use (the workflow passes its own timeout less a margin): no check
// starts without 10 minutes left, and none runs past it, so Actions never kills a check mid-way and loses its findings.
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
import { runPublish } from '@/lib/comparison-publish-run'
import { startSemiDeep } from '@/lib/competitor-check/semi-deep'
import { supabasePublishStore } from '@/lib/comparison-publish-store'
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'
import { NO_COMPARISON_PAGE } from '@/lib/comparison-types'

/** compare-autopublish-1: asks the site to refresh its cached comparison switches (tag marketing-countries). Never throws. */
async function revalidateCountries(log: (l: string) => void): Promise<boolean> {
  const warn = (m: string) => { log(`WARNING (pages not told — they show the change within 5 minutes instead): ${m}`); return false }
  try {
    const secret = process.env.REVALIDATE_SECRET
    const base = (process.env.REVALIDATE_BASE_URL || 'https://www.hatchgrab.com').replace(/\/+$/, '')
    if (!secret) return warn('REVALIDATE_SECRET is not set.')
    const res = await fetch(`${base}/api/revalidate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: ['marketing-countries'] }), signal: AbortSignal.timeout(10_000) })
    if (res.status !== 200) return warn(`${base}/api/revalidate answered ${res.status}.`)
    log(`revalidate: ${base} refreshed marketing-countries.`)
    return true
  } catch (e) { return warn(`the site could not be reached: ${e instanceof Error ? e.message : e}`) }
}

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
  const jobArg = arg('job-minutes')
  const jobMinutes = jobArg ? Number(jobArg) : null
  if (jobMinutes !== null && !(Number.isInteger(jobMinutes) && jobMinutes >= 15 && jobMinutes <= 360)) throw new Error('--job-minutes must be a whole number from 15 to 360')
  const startedMs = Date.now()
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
    // competitor-check-5: STREAMED — max_tokens is now each model's maximum (128K), and the SDK refuses a non-streamed request
    // that could run past 10 minutes; finalMessage() gives the same message create() did.
    // competitor-check-8: with the check's abort signal — a call still running well past its check's deadline is cut off.
    api: (params, opts) => anthropic.beta.messages.stream(params as never, opts?.signal ? { signal: opts.signal } : undefined).finalMessage() as never,
    // competitor-check-3: the Message Batches API — the quick pass submits its share as one batch (50% off tokens).
    batch: {
      create: requests => anthropic.beta.messages.batches.create({ requests } as never) as never,
      retrieve: id => anthropic.beta.messages.batches.retrieve(id) as never,
      results: id => anthropic.beta.messages.batches.results(id) as never,
      // competitor-check-8: newest first, to re-read a failed batch collected before its errors were logged.
      list: () => anthropic.beta.messages.batches.list({ limit: 20 }) as never,
    },
    ...(jobMinutes ? { jobDeadlineMs: startedMs + jobMinutes * 60_000 } : {}),
    store: supabaseCheckerStore(db),
    now: () => new Date(),
    log: line => console.log(line),
    dryRun,
  }
  console.log(`competitor-check · mode ${mode}${competitor ? ` · ${competitor}` : ''}${limit ? ` · limit ${limit}` : ''}${jobMinutes ? ` · ${jobMinutes} min` : ''}${dryRun ? ' · DRY RUN (writes nothing)' : ''}`)
  // compare-autopublish-1: the semi-deep check waits for this code — its first run turns the stored list into requests (once).
  if (!dryRun) { try { await startSemiDeep(db, line => console.log(line)) } catch (e) { console.error(`semi-deep not started: ${e instanceof Error ? e.message : e}`) } }
  const reports = await runChecker(deps, { mode: mode === 'scheduled' ? 'scheduled' : mode, trigger, competitor, limit })
  for (const r of reports) console.log(`${r.mode}: ${r.checked} checked, ${r.failed.length} failed, ${r.findings.length} findings, $${r.spend.usd.toFixed(3)} — ${r.stoppedReason}${r.error ? ` (${r.error})` : ''}`)
  // compare-autopublish-1: after every run that wrote — the failure counts (two failed checks in a row take a competitor down until a
  // good check), then the automatic publishing step (lib/comparison-publish-run.ts). A failure here is logged; it never fails the run.
  if (!dryRun) {
    try {
      const { data: comps } = await db.from('competitors').select('id, name, check_failures')
      const byName = new Map(((comps ?? []) as { id: string; name: string; check_failures: number | null }[]).map(c => [c.name, c]))
      const failed = new Set(reports.flatMap(r => r.failed.filter(f => f.kind !== 'incomplete').map(f => byName.get(f.name)?.id).filter((x): x is string => !!x)))
      const good = new Set(reports.flatMap(r => r.checkedIds ?? []).filter(id => !failed.has(id)))
      for (const c of byName.values()) {
        const next = failed.has(c.id) ? (c.check_failures ?? 0) + 1 : good.has(c.id) ? 0 : null
        if (next !== null && next !== (c.check_failures ?? 0)) await db.from('competitors').update({ check_failures: next }).eq('id', c.id)
      }
      process.env.SUPABASE_URL ||= process.env.NEXT_PUBLIC_SUPABASE_URL   // the Admin stores read lib/supabase.ts
      const [{ servicePricingStore }, { serviceCheckStore }] = await Promise.all([import('@/lib/admin/pricing-check-store'), import('@/lib/admin/competitor-check-store')])
      const p = await runPublish({ pricing: servicePricingStore, checks: serviceCheckStore, store: supabasePublishStore(db), now: () => new Date(), log: line => console.log(line),
        // compare-languages-1: every country with an address has a comparison page in its own language, except AE.
        hasPage: code => !!COUNTRY_PATH_SEGMENTS[code] && !NO_COMPARISON_PAGE.includes(code), revalidate: () => revalidateCountries(line => console.log(line)) })
      console.log(`publish: ${p.events} event(s); ${p.verdicts.filter(v => v.live).map(v => v.code).join(', ') || 'no country'} live`)
    } catch (e) { console.error(`publish step failed (the check results are saved): ${e instanceof Error ? e.message : e}`) }
  }
  if (!dryRun) {
    const mail = summaryEmail(reports, 'https://www.hatchgrab.com/admin?tab=pricing')
    if (mail) await sendConfirmationEmail({ to: ADMIN_ALERT_TO, subject: mail.subject, html: mail.html, text: mail.text, senderName: 'HatchGrab' })
  }
  // competitor-check-2: a failed login, or a run in which every competitor failed, is a red cross in Actions.
  // competitor-check-8: …and only a stage that failed as a whole — never a timed-out or incomplete check (listed above).
  process.exitCode = exitCodeOf(reports)
  if (process.exitCode) console.error('competitor-check: a run stopped with an error (above) — exiting non-zero.')
}

main().catch(e => { console.error(`competitor-check failed: ${e instanceof Error ? e.message : e}`); process.exit(1) })
