// lib/till/version.ts — 🔴 till-pack-6 (25 November 2026, docs/till-pack-5-6-report.md; Q13): THE TILL MODULE'S NAME AND VERSION.
//
// PURE AND CLIENT-SAFE. The fiscal software HatchGrab attests (BOI-LETTRE-000242, volet 1) is "HatchGrab, till module", numbered
// MAJOR.MINOR.PATCH (BOI-TVA-DECLA-30-10-30 § 340):
//   • MAJOR — ANY change to a fiscal file below (what is sealed, chained, guarded, closed, archived or verified). The attestation names
//     the major version's root ("1"); a new major needs a NEW attestation for every truck that uses the till (§ 380), so fiscal changes
//     are grouped and majors kept rare;
//   • MINOR / PATCH — a change inside the module that touches NO fiscal file (wording, logging, a screen). The pin cannot see those, by
//     design: the pin is over the fiscal files only.
// The database carries the same number (till_settings.software_version, set by migration 20261150), stamped on every chain entry, close and
// archive. scripts/till-version-pin.cjs (a sweep harness) recomputes the fiscal files' source hash and FAILS when it differs from the hash
// recorded for TILL_VERSION in lib/till/version-pins.json — a fiscal change without a version bump can never pass the sweep — and fails a
// new version whose major was not raised over the previous pin's.

export const TILL_SOFTWARE_NAME = 'HatchGrab, till module'
export const TILL_VERSION = '1.0.0'
/** The root the attestation names: the major number. Minor versions are its subdivisions, "1.y.z". */
export const TILL_VERSION_ROOT = TILL_VERSION.split('.')[0]

/** 🔴 THE FISCAL FILES — the "parameters" of § 340 (sealing, chaining, the guard, the closes, the archive, verification). The source
 *  hash covers exactly these, in this order (lib/till/version-pins.json is NOT in it: it records the hash). Adding or removing a file
 *  here is itself a fiscal change. */
export const FISCAL_FILES: readonly string[] = [
  // the database: the chain, the seal, the guard, verify, the closes, the archive, the version
  'supabase/migrations/20261129_till_pack_1.sql',
  'supabase/migrations/20261133_till_pack_2.sql',
  'supabase/migrations/20261140_till_pack_4.sql',
  'supabase/migrations/20261150_till_pack_5_6.sql',
  // the module
  'lib/till/version.ts',
  'lib/till/close.ts',
  'lib/till/close-run.ts',
  'lib/till/signing.ts',
  'lib/till/archive.ts',
  'lib/till/archive-files.ts',
  'lib/till/guard-errors.ts',
  'lib/till/actor-role.ts',
  'lib/till/device-fingerprint.ts',
  // the figures a close is made of (the Z = the daily-totals file's lines), and the netting every money reader uses
  'lib/accounts/daily-totals.ts',
  'lib/accounts/daily-inputs.ts',
  'lib/payments/reversals.ts',
  // the offline verifier an inspector runs
  'scripts/till-verify.cjs',
  'scripts/_till-sealed-mirror.cjs',
]

/** The fiscal parameters, in words (the technical document lists the same). */
export const FISCAL_PARAMETERS: readonly string[] = [
  'what an order version, a payment, a deletion, an identity entry, an event, a close and an archive seal (their fields and canonical form)',
  'the chain: per truck, gap-free seq, sha256(payload), sha256(prev_hash|seq|kind|ref|payload_hash)',
  'when an order is sealed (acceptance, and leftovers at the day close) and what the guard records or would refuse',
  'the trading day (event_date; a record made after its day\'s close counts on the day it was recorded) and the close time (06:00, truck time)',
  'the day / month / year closes: their figures, the grand totals (incl. / excl. VAT, absolute, per accounting year) and their refusals',
  'the accounting year (the truck\'s own end, else its country\'s tax year, else 31 December)',
  'the archive: its files, its manifest, each day\'s chain head, its storage and retention, and that its manifest hash is chained',
  'the Ed25519 signature of closes and archive manifests, and the key id rule',
  'the offline verification (scripts/till-verify.cjs)',
]

export const TILL_SOFTWARE = { name: TILL_SOFTWARE_NAME, version: TILL_VERSION, root: TILL_VERSION_ROOT } as const
