// lib/outreach-mail-import-result.ts — the shape of an import run's answer, declared ONCE.
//
// 🔴 THIS FILE EXISTS BECAUSE THE UI AND THE ROUTE DISAGREED IN PRODUCTION, AND NOTHING CAUGHT IT.
// The first run reported: "Read NaN messages, matched 37, recorded 37 new. NaN logged contacts have no
// email in the mailbox; NaN replies are not in the contact log."
// Two NaNs, two different mistakes, both the same root cause — the panel invented field names:
//   • the route returned `walked` as an ARRAY of `{ mailbox, count, skipped }`, one per folder; the
//     panel did `Number(j.walked ?? 0)`, and `Number([…])` on a multi-element array is NaN;
//   • the route returned `mismatches.loggedButUnmatched` and `.repliesNotLogged` as ARRAYS OF ROWS; the
//     panel read the same names as counts.
// TypeScript could not help, because the panel typed the response as `Record<string, unknown>` and cast
// at each use. So the contract is a TYPE both sides import, and the panel holds no field names of its
// own. ⚠️ A `Record<string, unknown>` response body is how this class of bug gets in; don't reintroduce
// one for this route.

/** One folder the importer walked. `skipped` means it was empty — a state, not a failure. */
export interface ImportWalked {
  mailbox: string
  count: number
  skipped: boolean
}

/** A prospect with messages in the mailbox. */
export interface ImportPerProspect {
  prospect_id: string
  name: string | null
  outbound: number
  inbound: number
}

/**
 * 🔴 BY TRUCK NAME, NOT BY ID AND NOT AS A COUNT. "12 logged contacts have no email in the mailbox" is
 * a number nobody can act on. A name is a row Dominic can open.
 */
export interface ImportMismatch {
  prospect_id: string
  name: string | null
  /** Why this row is listed — the specific reason, not a category. */
  reason: string
  /** Inbound replies found for this prospect, on the `repliesNotLogged` list only. */
  replies?: number
}

export interface MailImportResult {
  ok: true
  migrationApplied: true
  /** Every message read across every folder — the number the summary calls "read". */
  read: number
  walked: ImportWalked[]
  /** Of those read, how many belonged to a prospect. */
  matched: number
  /** New rows written. A re-run of an unchanged mailbox records 0, and that is success. */
  recorded: number
  /** Existing `mailbox_import` rows whose null thread headers were filled in. See the route. */
  updated: number
  perProspect: ImportPerProspect[]
  mismatches: {
    /** Logged as emailed, with no matching message in the mailbox. */
    loggedButUnmatched: ImportMismatch[]
    /** A reply is sitting in the mailbox and the contact log does not know about it. */
    repliesNotLogged: ImportMismatch[]
  }
  errors: { step: string; error: string }[]
}

/** What comes back when the import cannot run at all. */
export interface MailImportRefusal {
  ok: false
  migrationApplied?: boolean
  refusal: string
}

export type MailImportResponse = MailImportResult | MailImportRefusal
