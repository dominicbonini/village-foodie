# "HatchGrab, till module" — technical document (DRAFT)

> DRAFT for review — module version **1.0.0** — 25 November 2026. Not published. The English version of
> docs/till/technical-document-fr.md (the French is the one for the administration). It describes how the module meets the conditions
> of inalterability, security, conservation and archiving of data (CGI art. 286 I 3° bis; BOI-TVA-DECLA-30-10-30), its perimeter, its
> version rules and how an inspector can verify the records. "§" references are to BOI-TVA-DECLA-30-10-30 (version of 25/03/2026).
> ⚠️ While the guard is in "observe" mode (before till-pack-3), a change after a close is **recorded** but not **refused**: the
> attestation must not be signed before the switch to "enforce".

## 1. Identification

- **Software:** "HatchGrab, till module", the till module of the HatchGrab software. **Editor:** HatchGrab Ltd, which holds the source
  code and controls its parameters (§ 300).
- **Version:** 1.0.0 — major version root "1", minor versions "1.y.z" (§ 7). Source tag: `till-module-1.0.0`.
- **Where it runs:** one product (§ 280) — the website hatchgrab.com and the HatchGrab apps for iOS and Android, which load the same site;
  the apps' offline queue (`lib/native/`) is part of it. The data is in a PostgreSQL database (Supabase); the functions that seal,
  chain, close and archive are functions of that database (the migration files in § 7).
- **Licence:** one number per user business — its truck's HatchGrab id.

## 2. Perimeter

**Covered:** recording orders and their versions (at the hatch, online, offline), payments (charges, refunds, reversals of a charge)
and corrections; chaining and sealing; the day, month and year (or accounting-year) closes and their grand totals; conservation;
archives and their verification.

**Not covered:** menus and products, marketing (posts, reviews, loyalty), scheduling and events, messaging, the e-invoicing /
e-reporting file and business-to-business invoicing, third parties' payment software and terminals.

**Who it concerns:** a VAT-registered business that records private customers' payments (§ 1, § 30). Businesses under the franchise en
base, or selling only to businesses, are outside the rule (§ 10, § 25).

## 3. Inalterability (§ 80 – § 100)

- **When a record is sealed.** An order is sealed on **acceptance**: a hatch sale is accepted when it is created, an online order when
  the truck confirms it. It is sealed again at every change to a sealed field. A "pending" order is not yet a sale. Orders still
  unsealed are sealed at the day's close.
- **What is sealed** (§ 50):
  - the receipt number and the dates (with the truck's time zone);
  - the till (`till_id`: the van, `web` for an online order, the device for an offline sale);
  - the total incl. VAT, and every line (name, quantity, unit price, VAT rate, line total incl. and excl. VAT);
  - the VAT per rate, the state, and each payment's method;
  - the **identity** entry in force (legal name, address, SIREN/SIRET, VAT number, regime), so a receipt issued before those details
    changed can be rebuilt.
- **Corrections as plus and minus** (§ 90).
  - Every new version of an order records its **delta**: the lines and amounts removed (minus) and added (plus), with the time and the
    author's role (owner, staff, system). The original stays in the chain.
  - A payment is never deleted: its cancellation is a new "reversal" row pointing at it, and a refund is a new row.
- **After the close** a day is never reopened. A late record (an offline sale synced after the close, a later refund) counts in the
  close of the day it is recorded, listed with its own day.
- **The guard** (database triggers) records every change. In "enforce" mode (till-pack-3) it refuses any change to a closed sale,
  which can then only be corrected by a refund.
- **Data kept out of the seal:** customers' personal data (name, email, phone, notes). It carries no fiscal amount and is erased under
  the privacy policy; the seal holds none of it.

## 4. Security (§ 120 – § 140)

- **A chain per truck.** Every sealed record is an entry numbered with no gap (seq 1, 2, 3 …). For each entry:
  `payload_hash = sha256(payload)` and `hash = sha256(prev_hash|seq|kind|ref|payload_hash)`, where `prev_hash` is the previous entry's
  `hash` (64 zeros for the first). Changing or removing an entry breaks every later one.
- **Append-only tables.** The chain, the closes, the signatures, the archives and the audit log refuse every update, deletion and
  truncation (triggers). No API role may write to them directly.
- **Signature.**
  - Every close and every archive manifest is signed with **Ed25519**, by a private key held **outside the database** (a server
    variable).
  - The database holds only the public key: id `ff6ea8b232e9bc8e`, published in docs/till-signing-public-key.md.
  - What is signed is the sha256 (64 hex characters) of the close or the manifest.
- **Automatic verification.** After every close the whole chain is verified, and the result is itself chained (a "verify" event).
  Version changes, closes, archives and verifications are all chained events.

## 5. Conservation (§ 155, § 170)

- **Closes:**
  - **day:** after 06:00 the next day, truck time;
  - **month;**
  - **year:** the truck's **accounting year** (its own end date, else its country's tax year, else 31 December).

  A day with no activity has no close; month and year closes are always written, even at zero.
- **A close holds:**
  - per VAT rate: incl. VAT, excl. VAT, VAT;
  - per payment method;
  - refunds; payments received for later days; accepted orders with no payment;
  - late records; neutralised reversals; the range of receipt numbers;
  - the **grand totals**: perpetual incl. VAT, perpetual excl. VAT and perpetual absolute (every operation counted positive), never
    reset, plus the accounting year's total.
- **Never purged.** Sealed data and closes are never deleted:
  - not by deleting an account, which erases only personal data, and that is outside the seal;
  - not by deleting a truck, which is refused while it has till records.

## 6. Archiving (§ 220 – § 250)

- **When:**
  - every year, after the accounting year's close;
  - on request (an API for the truck's owner and administrators only);
  - and a final archive before an account closes. If it fails, the closing stops.
- **Contents:** one ZIP per archive, in open formats (CSV in UTF-8 with a BOM; JSON Lines):
  - the whole chain from entry 1;
  - every sealed order version of the period, with its lines, VAT, delta, till and identity entry;
  - every payment, with refunds and reversals;
  - the closes and their signatures, and the earlier archives;
  - the offline devices' fingerprints; the role behind each correction; the verification results;
  - the public key and `SHA256SUMS.txt`;
  - **a note in French** (README-FR.txt) and in English;
  - a **manifest** listing every file with its sha256, the period, the accounting year, the software version, the chain head covered
    and **each day's chain head**.
- **Integrity over time:** the manifest's sha256 is signed (Ed25519) and **recorded in the chain** (an "archive" entry). This gives it
  a certain date and makes any change detectable.
- **Where, and for how long:**
  - in a **private** store (`till-archives`: no public access, no access rule for users), for **at least 10 years**;
  - a database trigger refuses any change or deletion of a stored archive, whoever asks.
- **Handed to the user** (§ 250): every archive is emailed to the truck's owner, with a 7-day download link and the archive's
  fingerprint. A new link can be asked for at any time.

## 7. Version rules (§ 340, § 380)

- **Numbering:** **MAJOR.MINOR.PATCH**.
  - The **major** version changes on **any** change to a fiscal file (below).
  - A change that touches no fiscal file moves only the minor version or the patch.
  - A new major version needs a **new attestation** for every user business, so fiscal changes are grouped.
- **The fiscal files (the "parameters"):**
  - the migrations `20261129_till_pack_1.sql`, `20261133_till_pack_2.sql`, `20261140_till_pack_4.sql` and
    `20261150_till_pack_5_6.sql`;
  - `lib/till/`: version, closes, the close run, signing, the archive and its files, the guard's errors, the author's role, the device
    fingerprint;
  - `lib/accounts/daily-totals.ts` and `daily-inputs.ts` (a close's figures);
  - `lib/payments/reversals.ts`;
  - the verifier `scripts/till-verify.cjs` and `scripts/_till-sealed-mirror.cjs`.
- **Automatic check:**
  - those files' sha256 is recorded for every version (`lib/till/version-pins.json`);
  - `scripts/till-version-pin.cjs` runs at every code check and **fails** when a fiscal file changes without a new version, or when a
    fiscal change does not raise the major version.
- **Keeping the code** (LPF L102 D, L96 J):
  - for every version, a source tag and a source archive whose sha256 is recorded;
  - both are kept until the end of the third year after the version stops being distributed, and produced on request.
- The version is on every chain entry, every close and every archive.

## 8. Inspection: how to verify the records

- **On the spot** (LPF L80 O): the business shows the attestation (parts 1 and 2) and the version in use. An "Inspection" page in the
  app is planned: attestation, version, licence, start date, payment terminals.
- **Access to the data** (§ 60, § 230): the closes, the operations of a period and the archives can be exported, and the archives open
  in a spreadsheet.
- **Verifying an archive offline, without HatchGrab software:**
  1. run `sha256sum -c SHA256SUMS.txt`, and check that every file listed in `manifest.json` has the sha256 given;
  2. the signature in `manifest.sig.json` verifies `manifest.json`'s sha256 with the published public key;
  3. in `chain.jsonl`, every entry's `payload_hash`, `hash` and `prev_hash` follow § 4's formulas, numbered from 1 with no gap;
  4. each close is the chain entry with the same seq and hash, its signature verifies, and its chain head exists;
  5. each daily chain head in the manifest is an entry of the chain.

  `node scripts/till-verify.cjs --archive <archive.zip> --pub <public key>` runs all five checks (Node.js only).

## 9. What the user business must do

- Record every sale in HatchGrab, cash included, and record the payment method.
- Keep the archives it receives for at least 10 years.
- Not close its account during the retention period without downloading its final archive.

## 10. Open points

- The guard's switch to "enforce" (till-pack-3). **This must come before signing.**
- The "Inspection" page, and each truck's e-signature of part 2 (screens to come).
- Still to settle:
  - the data-return standard the administration is to set (CGI art. 286 as amended by loi n° 2026-534);
  - VAT moving into the CIBS on 1 January 2027;
  - the questions for a tax adviser (docs/till-law-1-report.md §4).
