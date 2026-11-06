#!/usr/bin/env node
// scripts/partners-add.cjs — 🔴 ADDS ROWS TO public.partner_orgs IN THE LIVE DATABASE (partners-1, 5 November 2026).
// It WRITES TO PRODUCTION when given --apply, so it is in harnesses.json's `operational_refused` group: no sweep runs it.
//
//   node scripts/partners-add.cjs <file.json>            DRY RUN — reads the table, prints what WOULD be added / skipped
//   node scripts/partners-add.cjs <file.json> --apply    inserts the new rows, then prints what it added
//
// THE FILE: a JSON array of objects (or { "partners": [...] }) with any of these keys —
//   name (required), type, country_code, region, website, contact_name, contact_role, email, phone, linkedin_url,
//   source, priority, next_follow_up_on, offered, outcome, notes.
//   type ∈ association | organiser | consultant | supplier | directory | press | other (default other);
//   priority ∈ high | medium | low (default medium). A `status` key is IGNORED: every new row starts at to_contact.
//
// DEDUPE (lib/partners.ts `planBulkAdd`, the same function scripts/partners-1.cjs proves): a row is SKIPPED when its
// email (case-insensitive) or its name + country is already in the table — or earlier in the same file. An invalid
// row (no name, a bad email, an unknown type…) is listed and not inserted. Nothing existing is ever updated.
//
// CREDENTIALS: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment, loaded from .env.local by dotenv inside
// this script (as scripts/migrate-from-sheets.cjs does). Neither value is ever printed.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS operational script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const file = args.find(a => !a.startsWith('--'))
  if (!file) { console.error('usage: node scripts/partners-add.cjs <file.json> [--apply]'); process.exit(2) }
  let incoming
  try {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
    incoming = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.partners) ? parsed.partners : null
  } catch (e) { console.error(`partners-add: ${file} is not readable JSON (${e.message})`); process.exit(2) }
  if (!incoming) { console.error('partners-add: the file must be a JSON array, or { "partners": [ … ] }'); process.exit(2) }

  // The ONE dedupe implementation, compiled from lib/partners.ts.
  const { req } = compile(REPO, ['lib/partners.ts'], 'partners-add')
  const { planBulkAdd } = req('lib/partners.js')

  require('dotenv').config({ path: path.join(REPO, '.env.local'), quiet: true })
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('partners-add: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.'); process.exit(2) }
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: existing, error } = await supabase.from('partner_orgs').select('name, country_code, email')
  if (error) { console.error(`partners-add: partner_orgs could not be read (${error.code ?? ''} ${error.message})`); process.exit(1) }
  const plan = planBulkAdd(existing ?? [], incoming)

  console.log(`partners-add: ${incoming.length} row(s) in ${file}; ${existing.length} partner(s) already in the table.`)
  for (const s of plan.skipped) console.log(`  skip     ${s.name} — ${s.reason}`)
  for (const i of plan.invalid) console.log(`  INVALID  row ${i.row} — ${i.error}`)
  if (!apply) {
    for (const a of plan.add) console.log(`  would add ${a.name}${a.country_code ? ` (${a.country_code})` : ''}${a.email ? ` <${a.email}>` : ''}`)
    console.log(`DRY RUN: ${plan.add.length} would be added, ${plan.skipped.length} skipped, ${plan.invalid.length} invalid. Re-run with --apply to insert.`)
    return
  }
  let added = 0
  for (const row of plan.add) {
    // One at a time, so a clash on one row (someone added it a moment ago) skips that row and not the rest.
    const { data, error: insErr } = await supabase.from('partner_orgs').insert(row).select('id, name, country_code, email').single()
    if (insErr) { console.log(`  skip     ${row.name} — ${insErr.code === '23505' ? 'email already present' : insErr.message}`); continue }
    added++
    console.log(`  added    ${data.name}${data.country_code ? ` (${data.country_code})` : ''}${data.email ? ` <${data.email}>` : ''} · ${data.id}`)
  }
  console.log(`APPLIED: ${added} added, ${plan.skipped.length + (plan.add.length - added)} skipped, ${plan.invalid.length} invalid.`)
}

main().catch(e => { console.error(`partners-add: ${e && e.message ? e.message : e}`); process.exit(1) })
