#!/usr/bin/env node
// scripts/checker-prep-1.cjs — checker-prep-1 Part 3 (25 November 2026; docs/checker-prep-1-report.md). The Competitor check
// workflow's import step runs the importer with the pinned pg package and the SUPABASE_DB_URL secret; nothing else in the file
// changed; nothing prints the secret. Reads files and git only — NO network, NO database, no .env file.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const WF = '.github/workflows/competitor-check.yml'
const BASE = '43501574' // the last commit before this edit (the workflow as compare-fix-1 left it)

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${String(detail).slice(0, 600)}` : '')) } }
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const wfRaw = read(WF)
// This work's own comment (three lines above the import step) is set aside first, so every comparison below is of the rest.
const NOTE = /      # checker-prep-1 \(25 November 2026[^\n]*\n(      # [^\n]*\n){2}/
const wf = wfRaw.replace(NOTE, '')
let base = ''
try { base = execSync(`git show ${BASE}:${WF}`, { cwd: REPO }).toString() } catch { base = '' }
t('the base version of the workflow can be read from git', base.length > 0)
t('this work\'s comment is there, three lines, once', NOTE.test(wfRaw) && wf !== wfRaw && !NOTE.test(wf))

// The steps, split at each "      - " under steps:
const stepsOf = s => s.slice(s.indexOf('    steps:\n')).split(/\n(?=      - )/).slice(1)
const steps = stepsOf(wf), baseSteps = stepsOf(base)
const imp = steps.find(x => /name: Import new data files/.test(x)) || ''
const baseImp = baseSteps.find(x => /name: Import new data files/.test(x)) || ''

console.log('\n── 1 · the import step')
const run = (imp.match(/^\s+run: (.*)$/m) || [])[1]
t('the import step runs exactly `npx -y -p pg@8.13.1 node scripts/competitor-check/run.mjs scripts/data-import/main.ts`',
  run === 'npx -y -p pg@8.13.1 node scripts/competitor-check/run.mjs scripts/data-import/main.ts', run)
t('…with the SUPABASE_DB_URL secret in its env', /^\s+SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}$/m.test(imp))
t('…and still the two REST secrets it had (kept)', /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_URL \}\}/.test(imp) && /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/.test(imp))
t('…no `if:` added (a failed import is still a red cross and the check still runs)', !/^\s+if:/m.test(imp))
const strip = s => s.split('\n').filter(l => !/^\s*#/.test(l) && !/SUPABASE_DB_URL/.test(l)).map(l => l.replace(/^(\s+run: )npx -y -p pg@8\.13\.1 /, '$1')).join('\n')
t('…apart from that line, the command and the comments, the step is as before', strip(imp) === strip(baseImp))

console.log('\n── 2 · nothing else changed')
t('the same number of steps', steps.length === baseSteps.length && steps.length > 0, `${steps.length} vs ${baseSteps.length}`)
const others = steps.filter(x => x !== imp), baseOthers = baseSteps.filter(x => x !== baseImp)
t('every other step is byte-for-byte as before (the OIDC token, the checker with its REST store, the refresh log)',
  others.length === baseOthers.length && others.every((x, i) => x === baseOthers[i]))
const headOf = s => s.slice(0, s.indexOf('    steps:\n'))
t('everything above the steps is as before (triggers, inputs, concurrency, permissions, timeout, the federation variables)', headOf(wf) === headOf(base))
const wfNoImp = wf.replace(imp, ''), baseNoImp = base.replace(baseImp, '')
t('the whole file minus the import step equals the base minus its import step', wfNoImp === baseNoImp)
const chk = steps.find(x => /name: Check competitors/.test(x)) || ''
t('the checker step keeps its REST store (service-role key) and gets no SUPABASE_DB_URL', /SUPABASE_SERVICE_ROLE_KEY/.test(chk) && !/SUPABASE_DB_URL/.test(chk))
t('no other `npx -p pg` in the file', (wf.match(/npx -y -p pg@/g) || []).length === 1)

console.log('\n── 3 · nothing prints the secret')
const code = wf.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
t('SUPABASE_DB_URL appears only once in the workflow, in the import step\'s env', code.split('\n').filter(l => /SUPABASE_DB_URL/.test(l)).length === 1 && /SUPABASE_DB_URL/.test(imp))
t('no step echoes, prints or dumps the environment (echo $SUPABASE_…, printenv, env, set -x)',
  !/echo[^\n]*\$\{?SUPABASE|printenv|^\s+run: env\s*$|set -[a-z]*x/m.test(code))
const main = read('scripts/data-import/main.ts'), cdb = read('scripts/comparison-db.ts')
t('the importer reads SUPABASE_DB_URL first (scripts/comparison-db.ts), else db-migrate.cjs\'s dbUrl()', /process\.env\.SUPABASE_DB_URL \|\| m\.dbUrl\(\)/.test(cdb))
t('the importer\'s error path redacts any postgres:// string', /replace\(\/postgres\(ql\)\?:\\\/\\\/\\S\+\/g, '\[redacted\]'\)/.test(main))
t('neither the importer nor comparison-db.ts logs process.env or the connection string',
  ![main, cdb].some(s => /console\.\w+\([^)]*(process\.env|\burl\b)/.test(s.replace(/\/\/.*$/gm, ''))))

console.log(`\n${fail ? '🔴' : '✓'} checker-prep-1: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
