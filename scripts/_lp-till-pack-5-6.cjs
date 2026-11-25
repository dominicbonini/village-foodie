// scripts/_lp-till-pack-5-6.cjs — till-pack-5-6's NAMED CHANGES, for the harnesses that compare the order, payment and dashboard paths with a
// tree from before it (25 November 2026; docs/till-pack-5-6-report.md §9). The method of scripts/_lp-till-pack-4.cjs, copied: scripts/till-pack-5-6.cjs
// proves the work itself; this file lets every older "byte-identical since …" comparison take exactly till-pack-5-6's committed edits back
// out of a file and still compare EVERY OTHER BYTE.
//
// HOW: till-pack-5-6's commits are the ones whose message starts "till-pack-5-6:". For a file they touched, their combined diff is reverse-applied
// (patch -R, no fuzz) to the file as it stands. If any OTHER commit touched the file between till-pack-5-6's first and last commit, or the
// reverse patch does not apply exactly, asBefore THROWS — a stale anchor fails the comparison, never hides it.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const git = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()

/** True on a tree with till-pack-5-6 (its archive module exists). */
const LANDED = fs.existsSync(path.join(REPO, 'lib/till/archive.ts'))

const COMMITS = LANDED ? git(['log', '--format=%H', '--grep=^till-pack-5-6:', '--reverse']).trim().split('\n').filter(Boolean) : []
/** Every file till-pack-5-6's commits touched. */
const FILES = [...new Set(COMMITS.flatMap(c => git(['show', '--name-only', '--format=', c]).trim().split('\n').filter(Boolean)))]

/** The file's text with exactly till-pack-5-6's committed edits taken back out (null: till-pack-5-6 created it). */
function asBefore(f, cur) {
  const mine = COMMITS.filter(c => git(['show', '--name-only', '--format=', c]).split('\n').includes(f))
  if (!mine.length) return cur
  const first = mine[0], last = mine[mine.length - 1]
  const between = git(['log', '--format=%H', `${first}~1..${last}`, '--', f]).trim().split('\n').filter(Boolean)
  const strangers = between.filter(c => !COMMITS.includes(c))
  if (strangers.length) throw new Error(`[_lp-till-pack-5-6] ${f}: touched by other commits between till-pack-5-6's (${strangers.join(', ')}) — re-pin by hand`)
  const diff = git(['diff', `${first}~1`, last, '--', f])
  // A file till-pack-5-6 CREATED did not exist before it: taken back, it is absent (null), and compares equal only to an absent file.
  if (/^--- \/dev\/null$/m.test(diff)) {
    const created = git(['show', `${last}:${f}`])
    if (created !== cur) throw new Error(`[_lp-till-pack-5-6] ${f}: created by till-pack-5-6 and changed since — re-pin by hand`)
    return null
  }
  // Exactly as till-pack-5-6's last commit left it (the usual case): before = the file at the commit before its first — exact, and immune to
  // patch(1)'s trouble with a last line that has trailing spaces and no newline (the dashboard action route ends that way).
  if (cur === git(['show', `${last}:${f}`])) return git(['show', `${first}~1:${f}`])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-till-pack-5-6-'))
  try {
    const file = path.join(dir, 'file'), patch = path.join(dir, 'patch')
    fs.writeFileSync(file, cur); fs.writeFileSync(patch, diff)
    const r = spawnSync('patch', ['-R', '-s', '--fuzz=0', '--no-backup-if-mismatch', '-r', '-', file, patch], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`[_lp-till-pack-5-6] ${f}: till-pack-5-6's edits are not there exactly (patch -R: ${(r.stdout + r.stderr).trim().slice(0, 300)})`)
    return fs.readFileSync(file, 'utf8')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

module.exports = { LANDED, COMMITS, FILES, asBefore }
