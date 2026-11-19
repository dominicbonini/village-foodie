// scripts/_named-plans-everywhere-1.cjs — plans-everywhere-1's code edits (19 November 2026, docs/plans-everywhere-1-report.md), named
// so the byte-identity harnesses can take them back EXACTLY and compare the rest as before:
//   • the post-pay plan wording where our fee is billed monthly (lib/country-settings-types.ts monthlyFeeBilling) — PricingSection,
//     PlanTable's fee row, /features' note, the plans PDF, and the phone order of the note (landing.css);
//   • the card-only "Online payments" row left out where trucks can't take online card payments (lib/plan-offer.ts tableGroups).
// The pairs [now, before] are in scripts/fixtures/plans-everywhere-1-code-edits.json (generated from the diff against the commit
// before this one, each `now` unique in its file). undoCode(file, src): `src` with this round's edits put back; `src` unchanged for
// any other file; null when an edit is not there exactly once (so the caller fails rather than passing a file it cannot account for).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const EDITS = require('./fixtures/plans-everywhere-1-code-edits.json')

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
