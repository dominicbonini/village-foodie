// scripts/_lp-billing-1.cjs — billing-1's NAMED CHANGES, for the harnesses that compare the order, payment, menu and submit paths
// with a tree from before it (10 November 2026; docs/billing-1-report.md). A MODULE: scripts/billing-1.cjs proves the work itself
// (switch off = every answer today's); this file lets every older "byte-identical since …" comparison take exactly billing-1's
// committed edits back out of a file and still compare EVERY OTHER BYTE.
//
// HOW: billing-1's commits are the ones whose message starts "billing-1:". For a file they touched, their combined diff is
// reverse-applied (patch -R, no fuzz) to the file as it stands. If any OTHER commit touched the file between billing-1's first and
// last commit, or the reverse patch does not apply exactly, asBefore THROWS — a stale anchor fails the comparison, never hides it.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const git = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()

/** True on a tree with billing-1 (its rules module exists). */
const LANDED = fs.existsSync(path.join(REPO, 'lib/billing/rules.ts'))

const COMMITS = LANDED ? git(['log', '--format=%H', '--grep=^billing-1:', '--reverse']).trim().split('\n').filter(Boolean) : []
/** Every file billing-1's commits touched. */
const FILES = [...new Set(COMMITS.flatMap(c => git(['show', '--name-only', '--format=', c]).trim().split('\n').filter(Boolean)))]

/** The file's text with exactly billing-1's committed edits taken back out (null: billing-1 created it). */
function asBefore(f, cur) {
  const mine = COMMITS.filter(c => git(['show', '--name-only', '--format=', c]).split('\n').includes(f))
  if (!mine.length) return cur
  const first = mine[0], last = mine[mine.length - 1]
  const between = git(['log', '--format=%H', `${first}~1..${last}`, '--', f]).trim().split('\n').filter(Boolean)
  const strangers = between.filter(c => !COMMITS.includes(c))
  if (strangers.length) throw new Error(`[_lp-billing-1] ${f}: touched by other commits between billing-1's (${strangers.join(', ')}) — re-pin by hand`)
  const diff = git(['diff', `${first}~1`, last, '--', f])
  // A file billing-1 CREATED did not exist before it: taken back, it is absent (null), and compares equal only to an absent file.
  if (/^--- \/dev\/null$/m.test(diff)) {
    const created = git(['show', `${last}:${f}`])
    if (created !== cur) throw new Error(`[_lp-billing-1] ${f}: created by billing-1 and changed since — re-pin by hand`)
    return null
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-billing-1-'))
  try {
    const file = path.join(dir, 'file'), patch = path.join(dir, 'patch')
    fs.writeFileSync(file, cur); fs.writeFileSync(patch, diff)
    const r = spawnSync('patch', ['-R', '-s', '--fuzz=0', '--no-backup-if-mismatch', '-r', '-', file, patch], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`[_lp-billing-1] ${f}: billing-1's edits are not there exactly (patch -R: ${(r.stdout + r.stderr).trim().slice(0, 300)})`)
    return fs.readFileSync(file, 'utf8')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

module.exports = { LANDED, COMMITS, FILES, asBefore }
