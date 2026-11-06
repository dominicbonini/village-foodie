// scripts/_lp-perf-1.cjs — perf-1's named change to shared source files (5 November 2026; docs/perf-1-report.md), for the harnesses that
// pin a page's bundled SOURCE bytes to an older commit (scripts/contact-1.cjs §6). A MODULE.
//   NEW_FILES        the modules perf-1 added (none existed before it): the render flag, the tags, the tagged cache, the FAQ's cached reads
//   beforePerf1(f)   a file as it stood just before perf-1 (7bc53b81) — so a harness judges every OTHER workstream's change to it exactly
//                    as before, and perf-1's own change to it is the one named here. scripts/perf-1.cjs proves that change: the words of
//                    every namespace in every locale unchanged, localizePlans' answers unchanged, the readers' non-marketing paths unchanged;
//                    the 146-page comparison (docs/perf-1-report.md §4) proves the pages.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')

const PERF1_BASE = '7bc53b81'
const NEW_FILES = ['lib/marketing-render.ts', 'lib/marketing-tags.ts', 'lib/marketing-cache.ts', 'lib/faq/public-cache.ts', 'lib/revalidate-secret.ts']
/** True on a tree with perf-1. */
const LANDED = fs.existsSync(path.join(REPO, 'lib/marketing-render.ts'))
let changed = null
/** The files perf-1 changed (tracked at PERF1_BASE and different now), read once. */
function changedFiles() {
  if (!changed) {
    changed = new Set(execFileSync('git', ['diff', '--name-only', PERF1_BASE, '--', 'lib', 'app', 'components'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean))
  }
  return changed
}
/** A file as it stood just before perf-1, or null for one of perf-1's new files. */
function beforePerf1(f) {
  if (NEW_FILES.includes(f)) return null
  return execFileSync('git', ['show', `${PERF1_BASE}:${require('./_moved-paths.cjs').pathAt(PERF1_BASE, f)}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })
}
module.exports = { LANDED, PERF1_BASE, NEW_FILES, changedFiles, beforePerf1 }
