// scripts/_lp-demo-claim-2.cjs — demo-claim-2's NAMED CHANGE (9 November 2026; docs/demo-claim-2-report.md), for the older
// harnesses that compare a view with a capture taken before it. A MODULE (shared_modules in scripts/harnesses.json):
// scripts/demo-claim-2.cjs proves the work itself; this file lets the Language Phase 2 comparison name exactly what changed.
//
//   demo-claim-2-create-truck-carry   /api/setup create_truck's success answers (a new truck, a resumed one) gain one field, LAST:
//                                     "menuCarry" — the demo carry-over's outcome. The 1c fixture has no claimed demo, so it is
//                                     "skipped" there. Every other byte of the body is unchanged.
// PRECISE: the transform appends exactly that field to exactly those two views' bodies, and returns anything else untouched.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')

/** True on a tree with demo-claim-2 (app/api/setup/route.ts answers menuCarry). */
const LANDED = (() => { try { return /menuCarry: menuCarry\.status/.test(fs.readFileSync(path.join(__dirname, '..', 'app/api/setup/route.ts'), 'utf8')) } catch { return false } })()

const VIEWS = /^1c\/api\/(GB|US)\|setup\|(resumed|created)$/
/** `{ …, body: '{"ok":true,…}' }` → the same body with `,"menuCarry":"skipped"` before its closing brace. */
function withCarry(b) {
  if (!b || typeof b !== 'object' || typeof b.body !== 'string' || !/^\{"ok":true,/.test(b.body)) return b
  return { ...b, body: b.body.replace(/\}$/, ',"menuCarry":"skipped"}') }
}

/** Entries in scripts/_lp2-named.cjs's shape. */
const LP2_ENTRIES = !LANDED ? [] : [
  { id: 'demo-claim-2-create-truck-carry', part: 'demo-claim-2 (9 Nov 2026)', country: 'both',
    what: '⚠️ RE-PINNED (demo-claim-2, 9 November 2026): /api/setup create_truck\'s success answers (new and resumed truck) gain "menuCarry", LAST — the server-side demo menu carry-over\'s outcome ("skipped" in the 1c fixture, which has no claimed demo). Nothing else in the body changes — PRECISE (scripts/_lp-demo-claim-2.cjs)',
    views: id => VIEWS.test(id), expect: b => withCarry(b) },
]

module.exports = { LANDED, LP2_ENTRIES, withCarry }
