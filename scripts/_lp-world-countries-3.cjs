// scripts/_lp-world-countries-3.cjs — ⚠️ RE-PINNED (world-countries-3, 1 November 2026): THE NAMED LEGAL CHANGES OF
// world-countries-3 (docs/world-countries-3-report.md), shared by every harness that pins the English legal documents' bytes.
// A MODULE.
//
// world-countries-3 changed, ON PURPOSE (Dominic's decisions on world-countries-2 G2 and legal-languages-1 D1 / D4), three
// sentences of the English documents — and no date: the change is dated 1 November 2026, the date the Terms, the Country-specific
// terms and TERMS_VERSION already carry (the legal-date rule; PRIVACY_UPDATED is not touched, the Privacy Policy is unchanged):
//   1. Country-specific terms, Mexico: the complaints authority is named — the Secretaría Anticorrupción y Buen Gobierno;
//   2. Terms of Service §3: "Section 9" → "Section 10" (the data protection section it means);
//   3. Country-specific terms, Canada: "not yet available in French" → "a Canadian French version is not yet available".
// The 28 translations carry the same three changes (content/legal/<base>/, re-stamped; scripts/legal-languages-1.cjs §1).
// `asBefore(file, text)` takes today's text back to its bytes before world-countries-3 and THROWS unless each named change is
// there exactly once; scripts/_lp-world-countries-2.cjs's asBefore applies it first, so every harness reading through that
// still pins every other byte.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'

/** [file, before, after] — each exactly once in its file. */
const EDITS = [
  ['content/legal/country-specific-terms.md',
    'you can complain to the Mexican authority responsible for personal data protection.',
    "you can complain to the Secretaría Anticorrupción y Buen Gobierno (Secretariat of Anti-Corruption and Good Governance), which enforces Mexico's Federal Law on the Protection of Personal Data Held by Private Parties (in force since 21 March 2025)."],
  ['content/legal/terms-and-conditions.md',
    'Section 9 sets out how we handle that data on your behalf.',
    'Section 10 sets out how we handle that data on your behalf.'],
  ['content/legal/country-specific-terms.md',
    'because it is not yet available in French,',
    'because a Canadian French version is not yet available,'],
]

const count = (s, x) => s.split(x).length - 1

/** Today's text of a file world-countries-3 changed, back to its bytes before it; throws when a named change is not there exactly
 *  once (or its old words are still there). Any other file is returned as it is. */
function asBefore(file, text) {
  let s = text
  for (const [f, before, after] of EDITS) {
    if (f !== file) continue
    if (count(s, after) !== 1 || count(s, before) !== 0) throw new Error(`[world-countries-3] ${file}: expected "${after.slice(0, 60)}…" exactly once and its old words nowhere`)
    s = s.replace(after, () => before)
  }
  return s
}

module.exports = { EDITS, asBefore }
