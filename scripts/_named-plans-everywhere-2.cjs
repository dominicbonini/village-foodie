// scripts/_named-plans-everywhere-2.cjs — plans-everywhere-2's code edits (19 November 2026, docs/plans-everywhere-2-report.md), named
// so the byte-identity harnesses can take them back EXACTLY: the "How you pay us here" note as a box (PricingSection, landing.css,
// /features, the plans PDF), "Take payment on your phone" card-only (lib/plan-offer.ts CARD_ONLY_ROWS), and the FAQ's two payment
// show_in values (lib/faq/live-values.ts, lib/faq/check.ts). Pairs [now, before] in scripts/fixtures/plans-everywhere-2-code-edits.json
// (generated from the diff against the commit before this one; each `now` unique in its file). undoCode(file, src): `src` with this
// round's edits put back; unchanged for any other file; null when an edit is not there exactly once.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const EDITS = require('./fixtures/plans-everywhere-2-code-edits.json')

function undoCode(file, src) {
  const pairs = EDITS[file]
  if (!pairs) return src
  let out = src
  for (const [now, before] of pairs) {
    if (out.split(now).length !== 2) return null
    out = out.replace(now, () => before)
  }
  return out
}

module.exports = { EDITED_FILES: Object.keys(EDITS), undoCode }
