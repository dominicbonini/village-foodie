# till-pack-5-6 — the archive (pack-5), the version and the attestation drafts (pack-6), and the privacy policy's records line

**Status (25 November 2026): BUILT AND APPLIED; the code is NOT deployed.** I applied migration `20261150_till_pack_5_6.sql` through
`db-migrate.cjs`: one transaction, no error, committed at 0b0d4996, sha256 `418d702842bf1460`. It also created the private bucket
`till-archives`, as you approved.

Both of your conditions were met before I applied it:
- **every rehearsal proof passed:** 28/28, rolled back, on the committed file (`--preflight-till-5`);
- **the migration writes nothing to existing rows** of `orders`, `order_payments`, `action_audit_log` or `trucks`. Proof U0 checks
  this from the xid, before and after the migration body; harness check H1 checks it in the file's text.

After the apply, every check passed and every transaction rolled back:
- `--till-5-check` 26/26;
- `--till-1-check` 44/44 (its S5 re-pinned, §8);
- `--till-2-check` 22/22 and `--till-4-check` 44/44.

The bucket refuses anonymous access (`--bucket-privacy`, §6).

The live state is unchanged:
- 0 archives, 0 objects in the bucket, 0 chain entries (the till code is not deployed);
- the software is **"HatchGrab, till module" 1.0.0**;
- the guard is still in **observe** mode;
- `place_order_atomic_v2` md5 is `e4b273abcf8e7609c6ca54033ed59332`.

**Nothing runs until you deploy.** That covers the archive, the cron's yearly step, the on-demand API, the account-deletion step and the
privacy page change. Nothing is deployed and nothing is pushed. The local tag `till-module-1.0.0` is on my final commit and not pushed.

Branch `france-vat-1`, starting commit 5f138e41. My commits:

| Commit | What |
|---|---|
| 5b9aac85 | Part 0: `docs/till-signing-public-key.md` |
| 0b0d4996 | the build, the migration, the proofs, the harnesses, the documents, Part C |
| 21e3e085 | applied; `--till-1-check`'s S5 re-pinned |
| ed05a575 | the sweep: one wording fix in the archive README (1.0.0's hashes re-recorded before its tag), the re-pins (§8) |
| the next commit (the last of mine) | this report and the proof logs; tagged `till-module-1.0.0` |

Other sessions' commits and files are untouched. §8 separates their effect from mine in the sweep.

---

## 0 · Prompt check

Nothing arrived garbled.

**One pair of instructions pulls two ways, and I did not stop for it.** "Show every SQL statement you ran inline in the chat reply as
fenced blocks" conflicts with "in chat, give me only a two-line summary".
- It only affects the last message, so stopping the build for it would have gained nothing.
- I followed till-pack-4's shape, which you wrote out then: the two lines, the SQL blocks, the confirmation, the filename last.
- If you meant SQL in the report only, say so and I'll keep to that from now on.

Choices I made, each reversible:

1. **`TERMS_VERSION` is not moved.** `lib/legal.ts` says to move it with the documents, but this prompt says "change nothing else".
   - Only `PRIVACY_UPDATED` (the mirror of the date) moves, to 25 November 2026.
   - New sign-ups therefore keep recording `2026-11-24`. Nothing reads it.
   - To move it too, it is one line, plus the harness layers that know the old date.
2. **The email is in every language base (59) plus English, not only the 54 that enabled countries use.**
   - Translating the unused five is harmless, and keeps every language file complete.
   - The privacy line follows france-privacy-1 exactly: the 54 used bases only.
3. **"A truck leaves till mode": no such action exists today.**
   - The only exit is a demo-plan truck, which is outside the till, and admin delete-truck already refuses a till truck.
   - The final archive is wired into account deletion. `finalArchivesFor()` is ready for whichever screen or route adds that exit.
4. **The final archive's email must go, or account deletion stops** (`till_final_archive`, nothing anonymised).
   - Afterwards the owner can no longer sign in to ask for a new link, so a stored but unsent archive would be lost to them.
   - Re-running the deletion makes a new final archive.
5. **The archive carries the whole chain**, from entry 1 to the head it covers, so it verifies offline from the first entry.
   - The order, payment and close tables hold only the period's records (by trading day).
   - **Each day's chain head** (Q14) is the last entry *recorded* on each day of the period.
6. **What "no personal data" leaves in** (Q9's exception is only the identity entries):
   - the identity entries (the business's legal details);
   - the offline devices' ids and fingerprints;
   - the role behind a correction (owner, staff, system: never a person);
   - a card payment's processor reference (`external_ref`).
   No customer name, email, phone, note or address appears anywhere (§3).
7. **An archive refuses to be made if the database's version is not the code's.** It never names a version it was not made by.
8. **Migration number.** Another session uses 20261140–20261142, so mine is `20261150`.

---

## 1 · What changed

| File | What |
|---|---|
| `supabase/migrations/20261150_till_pack_5_6.sql` | the bucket and its object guard, the archive tables and functions, the version, `till_verify` (§2) |
| `lib/till/archive.ts` (new) | makes an archive: snapshot, build, sign, store (never overwriting), chain, 7-day link, email; signs pending archives; the final archive; the year archives that are due |
| `lib/till/archive-files.ts` (new, pure) | the files, the README FR/EN, `SHA256SUMS.txt`, the manifest, the deterministic ZIP (`fflate`) |
| `lib/till/archive-email.ts`, `archive-mailer.ts` (new) | the email in the owner's language; its Brevo sender |
| `lib/till/version.ts`, `version-pins.json` (new) | "HatchGrab, till module" 1.0.0, the fiscal files, the pins |
| `lib/till/close-run.ts`, `app/api/cron/till-close/route.ts` | after a year close: that year's archive (retried until made); archives written unsigned are signed |
| `app/api/till/archive/route.ts` (new) | the on-demand API (§5) |
| `lib/account-deletion.ts`, `app/api/admin/execute-account-deletion/route.ts` | step 1b, the final archive, BEFORE anything is anonymised; a clear error if it fails |
| `scripts/till-verify.cjs` | `--archive <zip> [--pub <key>]`: an archive, offline (§3) |
| `scripts/till-version-pin.cjs`, `scripts/till-source-archive.cjs` (new) | the pin harness; the source archive (§7) |
| `scripts/db-rollback-proofs.cjs` | `--preflight-till-5` / `--till-5-check` / `--bucket-privacy`; S5 re-pinned |
| `scripts/till-pack-5-6.cjs` (new, 64/0) + `harnesses.json` | the harness; `till-version-pin.cjs` registered too |
| `messages/*.json` (60), `messages/ns/*/emailTillArchive.json`, `lib/i18n/catalog/emailTillArchive.ts` | the email's words (generated by `split-messages`) |
| `content/legal/privacy-policy.md` + 54 translations, `lib/legal.ts` | Part C |
| `scripts/_named-till-pack-5-6.cjs`, `scripts/fixtures/till-pack-5-6-legal-edits.json`, `scripts/_named-france-privacy-1.cjs` | the legal edit, named, so the byte-identity harnesses take it back (§8) |
| `scripts/_lp-till-pack-5-6.cjs` (new) + eight re-pinned harnesses | this pack's committed code edits, taken back exactly for the older byte-identity checks; the re-pins (§8) |
| `docs/till/` (new) | the attestation draft (FR, and an EN reading copy), the technical document (FR, EN), the model as published |
| `docs/till-signing-public-key.md` | Part 0 |
| `docs/till-pack-5-6/` | the privacy line's back-translations, the proof logs |
| `package.json`, `package-lock.json` | `fflate` 0.8.2, exact (published February 2024; pure JS, no native code) |

**No screen, component, page or `.tsx` file changed** (harness check H6). The only new message anyone receives is the archive email
(H7, H8).

---

## 2 · The migration (additive; every statement is in Appendix A1)

- **The bucket `till-archives`:**
  - `public = false` (also on conflict); zip only; 500 MB per file;
  - **no storage policy names it**, so anon and authenticated users can neither read, list nor write;
  - a `BEFORE UPDATE OR DELETE` trigger on `storage.objects` refuses (HGT01) any change to or deletion of an object in this bucket,
    whoever asks. That includes the storage API's own delete path (proof R5) and an upsert, which is an update.
  - The code never deletes and uploads with `upsert: false`, so a path that exists is refused.
- **`till_archives`** (append-only): one row per archive, holding:
  - the truck, the reason (`year` / `on_demand` / `final`), the period and the accounting year;
  - the storage path, the manifest's and the zip's sha256, the zip's size;
  - the chain head it covers, and its own chain entry (kind `archive`);
  - the software version, `signed` / `unsigned`, and who asked (`system` / `owner` / `admin`).

  It allows one year archive per truck and year.
- **`till_archive_signatures`** (append-only): the Ed25519 signature of an archive's manifest sha256.
- **`till_archive_commit`** (one transaction) refuses (HGT20) an archive when:
  - the truck is outside the till;
  - the path is not under the truck's own folder;
  - or its year is already archived.

  It also refuses (HGT21) a manifest that names a chain head which is not the truck's, and (HGT22) a signature by an unregistered key.
  Otherwise it chains the archive and writes the row, plus the signature when there is one.
- **`till_sign_archive`:** signs, later, an archive written unsigned.
- **The version (pack-6):**
  - `till_settings.software_name` ("HatchGrab, till module") and `software_version` move 0.1.0 → **1.0.0**;
  - every truck already in the till gets a chained `version` event. None today; the pre-flight proved it on the demo truck (V0).
- **`till_verify`:** every archive must be the chain entry it names, and name a real chain head.
- **Grants:** RLS on; nothing for anon / authenticated; the service role reads but cannot write; EXECUTE only for the service role.

Nothing raises a new guard refusal (HGT02–04 stay reserved).

---

## 3 · The archive

**When it is made:**
- **After a year close.** The hourly cron's close run asks, for every year close with no year archive, for that year's archive, and
  retries next hour if it fails.
- **On demand,** through the API (§5).
- **Before an account closes** (account deletion, step 1b).

Each call makes **one archive and one chain entry** (harness D1–D10; rollback A1, F1).

**How:**
1. A snapshot up to the chain head at the start.
2. The files.
3. The manifest, signed with `TILL_SIGNING_KEY` when it is set; otherwise unsigned, and the next run signs it.
4. The ZIP. The same inputs always give the same bytes.
5. Stored at `<truck>/<accounting year>/<reason>-<from>_<to>-<hash12>.zip`.
6. Chained.
7. A 7-day signed link, and the email to the owner.

**The files** (harness A3 checks exactly these 21):

| File | Contents |
|---|---|
| `chain.jsonl` | the whole chain, entry 1 to the head covered, every kind; exactly the `till_chain` columns |
| `orders.csv`, `order_lines.csv`, `order_vat.csv`, `order_versions.jsonl` | every sealed order version of the period: fields, lines (rate, total incl. and excl. VAT), VAT per rate, delta, `till_id`, the identity entry it names |
| `payments.csv`, `payments.jsonl` | every sealed payment: charges, refunds, reversals (with the payment each reverses) |
| `deletions.jsonl` | observed deletions |
| `closes.csv`, `closes.jsonl`, `close_signatures.csv` | the period's closes, all figures, their signatures |
| `archives.csv` | the truck's earlier archives and their signatures |
| `device_fingerprints.csv`, `entry_actors.csv`, `verify_events.jsonl` | offline devices, the role behind corrections, the verify results |
| `public_key.txt`, `SHA256SUMS.txt` | the signing key and its id; every file's sha256 (`sha256sum -c`) |
| `README-FR.txt`, `README-EN.txt` | the note (below) |
| `manifest.json` | every file's sha256 and size; truck, reason, period, **accounting year**, time zone, currency; **software and version**; the chain head covered; **each day's chain head**; the key |
| `manifest.sig.json` | when signed: the Ed25519 signature of `manifest.json`'s sha256 (not listed in the manifest it signs) |

**README outline (FR and EN):**
1. The software and version (and the major root).
2. The editor.
3. The truck, and its legal name, SIREN/SIRET, VAT number, regime and address, from its latest identity entry.
4. The period, the accounting year, the time zone and the currency.
5. Why it was made, and the counts.
6. Every file, explained.
7. That no customer data is in it.
8. **Five offline checks:** the hashes, the signature, the chain formula, the closes, the day heads (and that
   `scripts/till-verify.cjs --archive` runs all five).
9. Keep it 10 years; its hash is in the chain.

**Verifying offline:** `node scripts/till-verify.cjs --archive <zip> --pub <the published key>`. It reads the zip with Node's zlib alone
and checks:
- every file's sha256 and size, and that no file is unlisted;
- the manifest's signature;
- the chain (every existing check);
- each close (its entry, its chain head, its signature);
- each earlier archive (its entry, its chained manifest hash, its signature);
- the manifest's head, and each day's head.

A damaged file is reported, never a crash. This was found and fixed while building the harness's byte-flip test.

**Proofs:**
- **Harness A2–A9:** a real chain export plus a close, archived, verifies. Then **any single-byte change in any of the 21 files is
  caught**: data files by their hash, the manifest and its signature by the signature. An added file and a wrong key are caught too,
  and so is the command line.
- **Rollback A2:** the real code ran against the real database on the demo truck, and its zip verified offline, signed and with day
  heads.
- **No personal data:**
  - harness B1: none of the fixture's customer values is in any file;
  - harness B1b: by construction, making an archive never reads `orders`, `order_payments` or any customer table;
  - rollback A4: a name, email, phone and note written onto the demo orders appear in no file.

---

## 4 · The email, as built

To the truck's **owner** (`trucks.operator_id` → `operators.email`), in the owner's language (the truck's country's locale), from
hello@hatchgrab.com (Brevo, tag `till-archive`):

- **Subject:** Your sales archive for {period} is ready
- **Body:** Your HatchGrab sales archive for {period} is ready. Download it here: {link} (the link works for 7 days). Keep a copy: in
  some countries, such as France, you must keep sales records for 10 years. Archive fingerprint: {hash}. You don't need to do anything
  else.

How the placeholders are filled:
- `{period}` is "2026" for a calendar year, else two dates in the reader's language (e.g. "6 avr. 2026 – 5 avr. 2027");
- `{link}` is the 7-day signed URL, clickable in the HTML;
- `{hash}` is the manifest's sha256, which the chain records.

**The translations:**
- en-GB plus all 59 language bases. Each follows its language's formal or informal "you", as in `emailBilling`.
- Harness E1–E5 checks the English word for word and renders every language (60), each with its link once, its fingerprint and the
  brand.
- **Worth a native read:**
  - am-ET, hy-AM, km-KH, lo-LA, si-LK, sw-TZ: the words for "archive" and "fingerprint";
  - kk-KZ, az-AZ, uz-UZ, mn-MN: "fingerprint" for a hash;
  - hu-HU: the article before {period};
  - he-IL, ur-PK: the link in right-to-left text;
  - fil-PH: "France" vs "Pransiya".

---

## 5 · The on-demand API (no screen)

`POST /api/till/archive`, JSON:

| Action | What it does |
|---|---|
| `{ action: 'build', from?, to? }` | a new archive. Default: the start of the current accounting year to today; a period ending after today is refused. |
| `{ action: 'link', archiveId }` | a new 7-day link to an existing archive of the truck, emailed too; no new archive |

**Who may call it:**
- an admin, with `truckId`;
- the truck's **owner**: the dashboard `token` plus a session that `lib/truck-access.ts` resolves to `owner`.

**Everyone else is refused:**
- staff, a manager, a demo visitor or no session → 403;
- a wrong token, or no credentials → 401.

Proofs: harness D3–D7, through the real route with the in-memory database.

---

## 6 · The bucket, from outside

`--bucket-privacy` made anonymous requests with the project's public anon key. All four were refused or empty (P1–P4):

| Request | Answer |
|---|---|
| the public URL of an object | 400 "Bucket not found" (it is not public) |
| a download by path | 400 "Object not found" |
| a listing | 200 `[]` |
| a read of the bucket | 400 "Bucket not found" |

The bucket is empty today, so the listing and download results also mean "nothing there". The guarantee is W1: no storage policy names
the bucket, so anon would see nothing even with objects in it.

---

## 7 · The version, the pin and the tag

- **`lib/till/version.ts`:**
  - `TILL_SOFTWARE_NAME = 'HatchGrab, till module'`, `TILL_VERSION = '1.0.0'`, root `1`;
  - `FISCAL_FILES` (18) and `FISCAL_PARAMETERS`, the list in words.
- **The fiscal files:**
  - the four till migrations (pack-1, pack-2, pack-4, pack-5-6);
  - `lib/till/` (version, closes, close run, signing, archive, archive files, guard errors, actor role, device fingerprint);
  - `lib/accounts/daily-totals.ts` and `daily-inputs.ts`;
  - `lib/payments/reversals.ts`;
  - `scripts/till-verify.cjs` and `scripts/_till-sealed-mirror.cjs`.
- **Stamped.** The database stamps every chain entry, close and archive from `till_settings.software_version`. The manifest and the
  README name it (harness F1–F3; rollback V0–V2).
- **The rules (Q13):** MAJOR.MINOR.PATCH. **Any change to a fiscal file is a major bump**, and a major bump needs a new attestation for
  every truck (§ 380).
- **The pin:**
  - `lib/till/version-pins.json` records, per version, the fiscal files' source hash:
    `0348d16ed292a86d9dfde38f471d83e2715258b5a1bcbe79f006e14912f02e20`, over 18 files;
  - **re-recorded once, before the tag:** the sweep caught "minor units" in the archive README (§8), and `archive-files.ts` is a
    fiscal file, so the pin failed, as designed. 1.0.0 had not been tagged or distributed, so I corrected its entry rather than bump
    (first pin `b138f9db…`, first source archive `0a73365d…`). From the tag on, an entry is never changed;
  - `scripts/till-version-pin.cjs` (a sweep harness) **fails**:
    - on a fiscal change without a bump (F6);
    - on a fiscal change numbered as a minor version (F7);
    - and when the migration's version differs from `version.ts`.
  - A proper major bump passes (F8).
- **The tag and the source archive** (LPF L102 D / L96 J):
  - the local tag **`till-module-1.0.0`** is on my last commit, the one with this report (not pushed);
  - the source archive is `node scripts/till-source-archive.cjs till-module-1.0.0`: a **deterministic** tar of the 18 fiscal files and
    `docs/till/` (23 files, 407,040 bytes);
  - its sha256 is **`a471aecb6ae4dad7bdfb8989e485b309e2a0f6d3615b0093688b71066f48abad`**, recorded in `version-pins.json`. Checked from the tag
    after tagging, and harness F9b compares the tag's archive with the record.
  - Git's own archive carries the commit id and time, so its hash could never match a hash recorded inside that same commit; this tar
    depends only on the files.
  - Keep a copy outside git with `--out <file>` (I did not upload one: that needs the service key, which I don't read).

---

## 8 · The sweep (START 5f138e41 vs HEAD)

I ran both sides with `run-harnesses.cjs` over the same list, less two files:
- **START:** a worktree of 5f138e41, 239 harnesses.
- **HEAD:** this tree, 241 harnesses (`till-pack-5-6` and `till-version-pin` added).

**Why two files are left out.** Both sides use a scratch copy of `harnesses.json` without `compare-fix-2.cjs` and `checker-prep-1.cjs`.
Both are other sessions' harnesses, listed since before START. Each names the service-role key (`compare-fix-2` also `createClient`),
so the runner's screen refuses the **entire** run with either listed, on both sides. Set aside, not changed. (My first attempt was
refused by `checker-prep-1`, which is new since till-pack-4; nothing ran.)

**The raw result:** 22 failed at START, 28 at HEAD.

| | Harnesses | Why |
|---|---|---|
| Fail on both sides, same counts | 20: billing-1, contact-1, costs-accounts-1, country-settings-parity, cwv-2, event-types-render, faq-1, france-1, inbox-2, language-phase-1b, -1c, -1d, -1d2, -1e, -2, legal-languages-1, loyalty-1, screenshot-truck-details, site-chrome-1, tidy-1 | pre-existing, not this pack: the same 20 as till-pack-4's sweep. Every one fails the same checks with the same counts at START and HEAD (e.g. billing-1 130/1, costs-accounts-1 77/1, loyalty-1 80/1, cwv-2 42/2, legal-languages-1 407/1, language-phase-2 1770/404). One exception in form, not substance: **event-types-render** could not run at START (the worktree has no `.next` build), and at HEAD fails 4 CSS measurements of a dropdown at 1440px, from the stale build CSS. No `.tsx`, CSS or component changed in this pack. |
| Fail at START only | 2: pending-card-buttons, pending-card-render | the START worktree has no `.next` build ("no .next/static"); both pass at HEAD |
| Fail at HEAD only | 8: currency-registry, france-privacy-1, france-privacy-2, language-phase-1e-tidy, messages-parity, plans-data-model, till-pack-2, us-legal-draft | each pins something this pack had to change. **Re-pinned** or fixed below; all eight now pass. |

**The fix and the re-pins, by name, each with its reason:**
- **`currency-registry.cjs`**, "no app, component, lib or message file says 'minor units' outside a comment". **A real catch, fixed
  in the code, not re-pinned:** the archive's English README said "Amounts in minor units (cents)", and a person reads that file.
  - It now says "Amounts in the currency's smallest unit (cents)". The French says "Montants dans la plus petite unité de la devise
    (centimes)".
  - `lib/till/archive-files.ts` is a fiscal file, so the pin caught the change, as designed. 1.0.0 had not been tagged or distributed,
    so I **re-recorded 1.0.0's hashes** instead of bumping (§7). From the tag on, an entry is never changed.
  - 40/0.
- **`france-privacy-1.cjs`**, five checks:
  - the English, the 54 translations and `lib/legal.ts` are compared with START through `scripts/_named-till-pack-5-6.cjs`. That takes
    back exactly Part C's line and date, and throws if they are not there exactly;
  - `/privacy` shows 25 November 2026;
  - the deletion result's new `tillArchives` is set aside, like the other later fields.
  - 47/0.
- **`france-privacy-2.cjs`**, four checks:
  - `lib/account-deletion.ts` and the admin deletion route are compared with START through **`scripts/_lp-till-pack-5-6.cjs`** (new).
    It is the till-pack-4 layer's method: it takes back exactly this pack's committed edits (step 1b, `tillArchives`, the
    `till_final_archive_failed` mapping) and throws on any mismatch;
  - the structural checks still read HEAD's file;
  - the privacy policy goes through the named layer;
  - `tillArchives` is set aside.
  - 36/0.
- **`language-phase-1e-tidy.cjs`** and **`plans-data-model.cjs`**, the HatchGrab sitemap (GB, US): `/privacy`'s lastmod is now
  2026-11-25. A PRECISE named item (`till-pack-5-6-privacy-lastmod`, in `_named-till-pack-5-6.cjs`), after france-privacy-1's. It must
  change the view, or it throws. 61/0 and 154/0.
- **`us-legal-draft.cjs`**, "/privacy shows Last updated": 25 November 2026 for `/privacy` only; `/country-terms` keeps 24 November.
  36/0.
- **`messages-parity.cjs`** (`_messages-parity-1e.cjs`), "every word was in eb7ed44's source": `emailTillArchive.subject` and `.body`
  are NEW wording, your approved email, named like every earlier new message. 1,456,667/0.
- **`till-pack-2.cjs`**, "the 60 message files change by exactly one key": this pack's one new namespace, `emailTillArchive`, is set
  aside only where START lacked it. 68/0.

**Also passing at HEAD:** till-pack-5-6 64/0, till-version-pin 1/0, till-pack-4 56/0.

**Not committed, on purpose:**
- `docs/till-pack-1/*` and `docs/till-pack-2/*` (chain-check, rows-check, timings). They are re-exported by every `--till-1-check` /
  `--till-2-check` run and were already modified when I started.

**The worktree is removed.** The sweep logs stay in my scratch folder (not committed).

---

## 9 · The draft documents (for your review; not published, not in the app)

| File | What it is |
|---|---|
| `docs/till/attestation-draft-fr.md` | the attestation (below) |
| `docs/till/attestation-draft-en.md` | an English reading copy, marked as having no legal value |
| `docs/till/technical-document-fr.md` and `-en.md` | the technical document (below) |
| `docs/till/BOI-LETTRE-000242-model.md` | the model as published (BOFiP, etalab-2.0) |

**The attestation** follows **BOI-LETTRE-000242 word for word**: harness I1 checks every fixed part of all 19 paragraphs, in order,
against the published model.
- **Filled in:**
  - HatchGrab Ltd, "HatchGrab, till module", version 1.0.0;
  - "les fonctionnalités de caisse de ce logiciel", since HatchGrab is more than a till;
  - the licence number = the truck's HatchGrab id, which makes it nominative;
  - root `1` and minor versions `1.y.z`;
  - the perimeter, covered and not covered;
  - the distributor in volet 2 = HatchGrab Ltd;
  - signed by "[Full name], director, HatchGrab Ltd".
- **Left for you:** the name, the company number, the registered address, the market date, and the place and date.
- **Volet 1 and volet 2** are as the model has them. The draft's notes say what each truck adds later (screens).

**The technical document** covers, from the law report's points 1–8:
- identification and perimeter;
- inalterability (when sealed, what, plus and minus, never reopened);
- security (the chain formula, append-only, Ed25519 with the key outside the database, verify after every close);
- conservation (the closes, the grand totals, never purged);
- archiving (when, contents, private store, 10 years, chained and signed, sent to the owner);
- the version rules and the source archive;
- how an inspector verifies (five offline steps);
- what the truck must do, and the open points.

⚠️ **Both drafts say: sign only once the guard enforces (till-pack-3).** Read §10's first point: pack-3 is a fiscal change, so the
attestation will name its version, not 1.0.0.

---

## 10 · Part C, the privacy policy's records line

- **English** (`content/legal/privacy-policy.md` §7), exactly: "**Accounting records:** at least six years from the end of the relevant
  financial year, and ten years where the law requires it."
- **Last updated** is 25 November 2026; `lib/legal.ts` `PRIVACY_UPDATED` matches; `TERMS_VERSION` is unchanged (§0 point 1).
- Nothing else in the English changed: two lines (harness G3).
- **Translated into the 54 language bases that enabled countries use** (read live: 108 enabled locales map to them through
  `legalBaseOf`):
  - am-ET, ar-AE, az-AZ, bg-BG, bn-BD, bs-BA, ca-AD, cs-CZ, da-DK, de-DE, el-GR, es-ES, et-EE, fi-FI;
  - fr-FR, he-IL, hr-HR, hu-HU, hy-AM, id-ID, is-IS, it-IT, ja-JP, ka-GE, kk-KZ, km-KH, ko-KR, lo-LA;
  - lt-LT, lv-LV, mk-MK, mn-MN, ms-MY, nb-NO, ne-NP, nl-NL, pl-PL, pt-BR, pt-PT, ro-RO, ru-KZ, si-LK;
  - sk-SK, sl-SI, sq-AL, sr-RS, sv-SE, sw-TZ, th-TH, tr-TR, uk-UA, uz-UZ, zh-HK, zh-TW.
- **How each translation was made:**
  - each keeps its own bold label and register;
  - only the text after the label changed;
  - each file is re-stamped to the new English hash and passes the structure checker (G4);
  - the five unused bases (fil-PH, hi-IN, ur-PK, ta-LK, vi-VN) are untouched (G5).
- **Back-translations:** `docs/till-pack-5-6/privacy-line-back-translations.md` (to read) and `.json` (for the harness).
- **Worth a native read:**
  - si-LK: display;
  - ru-KZ, uk-UA, kk-KZ: the dash before "ten years";
  - hu-HU: "illetve";
  - lv-LV: "tiesību akti";
  - ja-JP, ko-KR: numbers in words, as before.

---

## 11 · Left undone

- **Nothing is deployed.** The archive, the cron step, the API, the account-deletion step and the privacy page wait for your deploy.
  `TILL_SIGNING_KEY` takes effect then.
- **No real upload has been made by me.** The archive's storage calls ran against an in-memory bucket in both proofs, because I don't
  read the service key. The first real archive is the first one made after deploy. **I suggest one on-demand archive of a demo-like
  test truck once deployed,** checked with `till-verify --archive`.
- **A copy of the source archive outside git:** it can be regenerated from the tag at any time (above).
- **Screens** (not in this prompt):
  - the version and licence shown in the app;
  - volet 2's e-signature per truck;
  - the Inspection page;
  - an archive download button (the API is ready).
- **No second store (Q10).** Supabase storage has no object lock; the trigger blocks changes through the database.
- The privacy page's `TERMS_VERSION` (§0 point 1).

## 12 · What till-pack-3 (enforce) must know

- **Pack-3 is a fiscal change, so it is a MAJOR bump.** Its migration and guard edits are fiscal files: **raise `TILL_VERSION` to 2.0.0,
  set it in the migration, and pin it.** The pin harness fails otherwise.
  - Since the attestation must wait for enforce anyway, **sign it naming 2.0.0** (root `2`), not 1.0.0. Tag `till-module-2.0.0` with its
    source archive.
- **Don't block the archive.** The guard must not refuse `till_archive_commit`, the storage trigger, or account deletion's
  anonymising. That step clears only customer fields, which are outside the sealed form, so it makes no versions; keep it that way.
- **Keep the order:** account deletion's final archive before any write.
- Keep `till_correction_check` and the guard's rule identical (pack-4 §10).

## 13 · What the screens must know

- **The version:** show `TILL_SOFTWARE` (`lib/till/version.ts`) and the licence (the truck id) on the Inspection page and the Z.
- **Volet 2:** store the signer, the date of signing, the download date (sign-up) and the start of use (`till_started_at`) per truck.
  Pre-fill volet 1 from `docs/till/attestation-draft-fr.md` once signed.
- **Archives:**
  - the download button calls `POST /api/till/archive` (`build` or `link`) with the dashboard token, owner only;
  - list `till_archives` for the truck (period, reason, fingerprint, signed);
  - the 7-day links come from the API, never stored.
- **Account deletion:** warn the owner that a final archive will be emailed first. If it fails, deletion stops with
  `till_final_archive_failed`.

---

## Undo (only if Dominic asks)

This removes till-pack-5-6's database objects and puts the version back. It deletes no archive object, because the trigger forbids
that. Drop the trigger first only if you really mean to delete archives.

```sql
begin;
drop trigger if exists till_archives_append_only on public.till_archives;
drop trigger if exists till_archives_no_truncate on public.till_archives;
drop trigger if exists till_archive_signatures_append_only on public.till_archive_signatures;
drop trigger if exists till_archive_signatures_no_truncate on public.till_archive_signatures;
drop function if exists public.till_archive_commit(text, text, date, date, date, date, text, text, text, bigint, bigint, text, text, text, text);
drop function if exists public.till_sign_archive(text, uuid, text, text);
drop table if exists public.till_archive_signatures;
drop table if exists public.till_archives;
update public.till_settings set software_version = '0.1.0' where id;
alter table public.till_settings drop column if exists software_name;
-- the bucket and its guard (only with no objects in it):
drop trigger if exists till_archive_objects_keep on storage.objects;
drop function if exists public.till_archive_object_guard();
delete from storage.buckets where id = 'till-archives';
commit;
-- then re-run the pack-4 definition of public.till_verify(text) from 20261140_till_pack_4.sql, and revert the code with git revert.
```

---

## Appendix A1 · The migration, exactly as applied (`supabase/migrations/20261150_till_pack_5_6.sql`)

```sql
-- 20261150_till_pack_5_6.sql
-- till-pack-5-6 (25 November 2026, docs/till-pack-5-6-report.md; the plan: docs/till-pack-0-report.md §6 and §8; the law check:
-- docs/till-law-1-report.md §2 points 5–8, §3 changes 12–13). THE ARCHIVE (pack-5) AND THE VERSION (pack-6). The guard stays in OBSERVE.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (origin/main):
--    • the PRIVATE storage bucket `till-archives` (public = false; NO policy on storage.objects for it, so anon / authenticated can neither
--      read, list nor write it — only the service role); its objects can never be changed or deleted (a trigger refuses UPDATE / DELETE of
--      any object in this bucket, whoever asks — the archives are kept at least 10 years, Q9);
--    • NEW tables (RLS on, nothing for anon / authenticated, no writes for the service role; both APPEND-ONLY):
--        till_archives            one row per archive — truck, reason (year / on_demand / final), period, accounting year, where it is
--                                 stored, the manifest's and the zip's sha256, the chain head it covers, its own chain entry (kind 'archive');
--        till_archive_signatures  the Ed25519 signature of an archive's manifest sha256 (law change 11 — the key lives OUTSIDE the database);
--    • NEW functions (service role only): till_archive_commit (ONE transaction: check the head it covers, chain the manifest hash as kind
--      'archive', write the row, and the signature when there is one), till_sign_archive (an archive written unsigned, signed later);
--    • REPLACED (create or replace; no signature or grant change): till_verify — every archive must be the chain entry it names;
--    • pack-6 (Q13): the till's software is "HatchGrab, till module" 1.0.0 — till_settings.software_name (new column, default) and
--      software_version '1.0.0' (the ONE row of till_settings, a till table), so every chain entry, close and archive from now on carries it;
--      a chained 'version' event is written for every truck already in the till (none today: the live chain is empty).
--    • NOTHING is written to any row of orders, order_payments, action_audit_log or trucks. place_order_atomic_v2 is NOT touched
--      (md5 e4b273abcf8e7609c6ca54033ed59332). Nothing raises a new guard refusal: HGT02–HGT04 stay reserved; the archive's own refusals
--      are HGT20 (outside the till / already archived), HGT21 (the head it covers is not the chain's) and HGT22 (not the registered key).
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file, then scripts/db-rollback-proofs.cjs --till-5-check and --till-1-check.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The private bucket, and its objects can never change or go
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('till-archives', 'till-archives', false, 524288000, array['application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No policy on storage.objects for this bucket: anon and authenticated users can neither read nor list nor write it.

create or replace function public.till_archive_object_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.bucket_id = 'till-archives' then
    raise exception 'till archive %: archives are kept at least 10 years and are never changed or deleted', old.name using errcode = 'HGT01';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.till_archive_object_guard() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'till_archive_objects_keep' and tgrelid = 'storage.objects'::regclass) then
    create trigger till_archive_objects_keep before update or delete on storage.objects for each row execute function public.till_archive_object_guard();
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The version (pack-6, Q13)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.till_settings add column if not exists software_name text not null default 'HatchGrab, till module';
comment on column public.till_settings.software_name is 'till-pack-6 (Q13): the fiscal software''s name, as the attestation names it. Its version is software_version (lib/till/version.ts is the source; the pin harness scripts/till-version-pin.cjs fails a fiscal change without a MAJOR bump).';

do $$
declare
  v_old text;
  h record;
begin
  select s.software_version into v_old from public.till_settings s where s.id;
  if v_old is distinct from '1.0.0' then
    update public.till_settings set software_version = '1.0.0', updated_at = now() where id;
    for h in select x.truck_id from public.till_chain_heads x where x.last_seq > 0 order by x.truck_id loop
      perform public.till_append(h.truck_id, 'event', 'version', null, 'version_change', public.till_today(h.truck_id),
        jsonb_build_object('type', 'version', 'software', 'HatchGrab, till module', 'from', v_old, 'to', '1.0.0'), null);
    end loop;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The archives (pack-5)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.till_archives (
  id                     uuid primary key default gen_random_uuid(),
  truck_id               text not null,
  reason                 text not null check (reason in ('year', 'on_demand', 'final')),
  period_start           date not null,
  period_end             date not null check (period_end >= period_start),
  accounting_year_start  date not null,
  accounting_year_end    date not null check (accounting_year_end >= accounting_year_start),
  storage_path           text not null unique check (storage_path ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+\.zip$'),
  manifest_sha256        text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  zip_sha256             text not null check (zip_sha256 ~ '^[0-9a-f]{64}$'),
  zip_bytes              bigint not null check (zip_bytes > 0),
  chain_head_seq         bigint not null,
  chain_head_hash        text not null check (chain_head_hash ~ '^[0-9a-f]{64}$'),
  seq                    bigint not null,
  hash                   text not null check (hash ~ '^[0-9a-f]{64}$'),
  software_version       text not null,
  signing_at_commit      text not null check (signing_at_commit in ('signed', 'unsigned')),
  requested_by           text not null check (requested_by in ('system', 'owner', 'admin')),
  created_at             timestamptz not null default now()
);
create unique index if not exists till_archives_one_year on public.till_archives (truck_id, period_start, period_end) where reason = 'year';
comment on table public.till_archives is 'till-pack-5: APPEND-ONLY. The till''s archives — a ZIP of CSV / JSONL files, a README in French and English and a manifest (every file''s sha256, the period, the accounting year, the software version, each day''s chain head), stored in the private bucket till-archives at storage_path, kept at least 10 years (Q9). The manifest''s sha256 is chained (kind ''archive'', seq / hash here). Written only by till_archive_commit.';

create table if not exists public.till_archive_signatures (
  archive_id  uuid primary key,
  truck_id    text not null,
  key_id      text not null,
  signature   text not null,
  signed_at   timestamptz not null default now()
);
comment on table public.till_archive_signatures is 'till-pack-5 (law change 11): APPEND-ONLY. The Ed25519 signature (base64) of an archive''s manifest sha256 (its 64 hex characters, as UTF-8 bytes) by the registered key (till_settings.signing_key_id). An archive with no row here is UNSIGNED; the next run with TILL_SIGNING_KEY signs it.';

alter table public.till_archives           enable row level security;
alter table public.till_archive_signatures enable row level security;
revoke all on public.till_archives, public.till_archive_signatures from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.till_archives from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_archive_signatures from service_role;

-- 🔴 CHAIN AN ARCHIVE, IN ONE TRANSACTION. The file is already stored (the caller uploaded it, never overwriting). Refusals: HGT20 — the truck
-- is outside the till, or its year is already archived; HGT21 — the chain head the manifest names is not this truck's entry at that seq;
-- HGT22 — a signature by a key that is not the registered one. Returns the archive's id and its chain entry.
create or replace function public.till_archive_commit(p_truck text, p_reason text, p_start date, p_end date, p_year_start date, p_year_end date,
                                                      p_path text, p_manifest_sha text, p_zip_sha text, p_bytes bigint, p_head_seq bigint,
                                                      p_head_hash text, p_key_id text, p_signature text, p_requested_by text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_seq  bigint;
  v_hash text;
  v_sv   text;
begin
  if not public.till_applies(p_truck) then raise exception 'till archive: % is outside the till', p_truck using errcode = 'HGT20'; end if;
  if p_reason not in ('year', 'on_demand', 'final') or p_end < p_start then raise exception 'till archive: bad request % % %', p_reason, p_start, p_end using errcode = 'HGT20'; end if;
  if p_path is null or left(p_path, length(p_truck) + 1) <> p_truck || '/' then raise exception 'till archive: the path must be under %/', p_truck using errcode = 'HGT20'; end if;
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (p_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  perform 1 from public.till_chain_heads h where h.truck_id = p_truck for update;
  if p_reason = 'year' and exists (select 1 from public.till_archives x where x.truck_id = p_truck and x.reason = 'year' and x.period_start = p_start and x.period_end = p_end) then
    raise exception 'till archive: the year % – % is already archived', p_start, p_end using errcode = 'HGT20';
  end if;
  if not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = p_head_seq and c.hash = p_head_hash) then
    raise exception 'till archive: the chain head % it names is not this truck''s', p_head_seq using errcode = 'HGT21';
  end if;
  if p_signature is not null and p_key_id is distinct from (select s.signing_key_id from public.till_settings s where s.id) then
    raise exception 'till archive: key % is not the registered key', p_key_id using errcode = 'HGT22';
  end if;
  if p_signature is not null and p_signature !~ '^[A-Za-z0-9+/=]{80,100}$' then raise exception 'till archive: malformed signature' using errcode = 'HGT22'; end if;
  select s.software_version into v_sv from public.till_settings s where s.id;
  v_seq := public.till_append(p_truck, 'archive', p_reason || ':' || p_start::text || ':' || p_end::text, null, p_reason, public.till_today(p_truck),
    jsonb_build_object('archive_id', v_id, 'manifest_sha256', p_manifest_sha, 'zip_sha256', p_zip_sha, 'zip_bytes', p_bytes, 'storage_path', p_path,
      'period_start', p_start, 'period_end', p_end, 'accounting_year_start', p_year_start, 'accounting_year_end', p_year_end,
      'chain_head', jsonb_build_object('seq', p_head_seq, 'hash', p_head_hash), 'requested_by', p_requested_by,
      'signing', case when p_signature is null then to_jsonb('unsigned'::text) else jsonb_build_object('key_id', p_key_id) end), null);
  select c.hash into v_hash from public.till_chain c where c.truck_id = p_truck and c.seq = v_seq;
  insert into public.till_archives (id, truck_id, reason, period_start, period_end, accounting_year_start, accounting_year_end, storage_path, manifest_sha256,
      zip_sha256, zip_bytes, chain_head_seq, chain_head_hash, seq, hash, software_version, signing_at_commit, requested_by)
    values (v_id, p_truck, p_reason, p_start, p_end, p_year_start, p_year_end, p_path, p_manifest_sha, p_zip_sha, p_bytes, p_head_seq, p_head_hash, v_seq, v_hash,
      coalesce(v_sv, '1.0.0'), case when p_signature is null then 'unsigned' else 'signed' end, p_requested_by);
  if p_signature is not null then
    insert into public.till_archive_signatures (archive_id, truck_id, key_id, signature) values (v_id, p_truck, p_key_id, p_signature);
  end if;
  return jsonb_build_object('archive_id', v_id, 'seq', v_seq, 'hash', v_hash, 'signed', p_signature is not null);
end;
$$;

-- An archive written unsigned, signed later by the registered key. Stored once.
create or replace function public.till_sign_archive(p_truck text, p_archive_id uuid, p_key_id text, p_signature text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.till_archives x where x.truck_id = p_truck and x.id = p_archive_id) then raise exception 'till signing: no archive %', p_archive_id using errcode = 'HGT22'; end if;
  if p_key_id is distinct from (select s.signing_key_id from public.till_settings s where s.id) then raise exception 'till signing: key % is not the registered key', p_key_id using errcode = 'HGT22'; end if;
  if p_signature !~ '^[A-Za-z0-9+/=]{80,100}$' then raise exception 'till signing: malformed signature' using errcode = 'HGT22'; end if;
  insert into public.till_archive_signatures (archive_id, truck_id, key_id, signature) values (p_archive_id, p_truck, p_key_id, p_signature) on conflict (archive_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.till_verify(p_truck text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r          record;
  s          record;
  ro         public.orders;
  v_prev     text := repeat('0', 64);
  v_next     bigint := 1;
  v_n        bigint := 0;
  v_gaps     integer := 0;
  v_links    integer := 0;
  v_phash    integer := 0;
  v_hash     integer := 0;
  v_struct   integer := 0;
  v_idref    integer := 0;
  v_vers     integer := 0;
  v_deltas   integer := 0;
  v_tillid   integer := 0;
  v_recon    integer := 0;
  v_recomp   integer := 0;
  v_hseq     bigint;
  v_hhash    text;
  v_hidseq   bigint;
  v_hidhash  text;
  v_head_ok  boolean;
  v_mis      jsonb := '[]'::jsonb;
  v_p        jsonb;
  v_pp       jsonb;
  v_id_seq   bigint;
  v_id_hash  text;
  v_id_ver   integer := 0;
  v_unsealed integer;
  v_unchained integer;
  v_lpay     text;
  v_lseq     bigint;
begin
  for r in select * from public.till_chain c where c.truck_id = p_truck order by c.seq loop
    v_n := v_n + 1;
    if r.seq <> v_next then v_gaps := v_gaps + 1; end if;
    if r.prev_hash <> v_prev then v_links := v_links + 1; end if;
    if encode(sha256(convert_to(r.payload, 'UTF8')), 'hex') <> r.payload_hash then v_phash := v_phash + 1; end if;
    if encode(sha256(convert_to(r.prev_hash || '|' || r.seq::text || '|' || r.kind || '|' || r.ref || '|' || r.payload_hash, 'UTF8')), 'hex') <> r.hash then v_hash := v_hash + 1; end if;
    v_p := r.payload::jsonb;
    if (r.seq = 1) <> (r.kind = 'event' and r.ref = 'till_start') then v_struct := v_struct + 1; end if;
    if r.kind = 'identity' then
      v_id_ver := v_id_ver + 1;
      if r.version is distinct from v_id_ver or r.ref <> p_truck then v_struct := v_struct + 1; end if;
      v_id_seq := r.seq; v_id_hash := r.hash;
    elsif r.kind = 'order' then
      if v_id_seq is null or v_p -> 'identity' is distinct from jsonb_build_object('seq', v_id_seq, 'hash', v_id_hash) then v_idref := v_idref + 1; end if;
      v_pp := null;
      select c.payload::jsonb into v_pp from public.till_chain c where c.truck_id = p_truck and c.kind = 'order' and c.ref = r.ref and c.seq < r.seq order by c.seq desc limit 1;
      if v_pp is null then
        if r.version is distinct from 1 or jsonb_typeof(v_p -> 'delta') <> 'null' then v_vers := v_vers + 1; end if;
      else
        if r.version is distinct from (v_pp ->> 'version')::integer + 1 then v_vers := v_vers + 1; end if;
        if (v_p -> 'delta')::text is distinct from public.till_order_delta(v_pp -> 'data', v_p -> 'data', (v_pp ->> 'version')::integer)::text then v_deltas := v_deltas + 1; end if;
      end if;
      if coalesce(v_p -> 'data' ->> 'till_id', '') = '' then v_tillid := v_tillid + 1; end if;
      if not public.till_vat_reconciles(v_p -> 'data') then
        v_recon := v_recon + 1;
        v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'order', 'seq', r.seq, 'problem', 'VAT does not reconcile');
      end if;
      if v_p -> 'data' ->> 'vat_basis' = 'recomputed' then v_recomp := v_recomp + 1; end if;
    end if;
    v_prev := r.hash;
    v_next := r.seq + 1;
  end loop;
  select h.last_seq, h.last_hash, h.identity_seq, h.identity_hash into v_hseq, v_hhash, v_hidseq, v_hidhash from public.till_chain_heads h where h.truck_id = p_truck;
  v_head_ok := (v_n = 0 and (v_hseq is null or v_hseq = 0)) or (v_hseq = v_next - 1 and v_hhash = v_prev and v_hidseq is not distinct from v_id_seq and v_hidhash is not distinct from v_id_hash);

  -- every seal: its entry is the order's latest version, and the row still equals it (or a deletion entry follows)
  for s in select * from public.till_order_seals x where x.truck_id = p_truck loop
    select c.* into r from public.till_chain c where c.truck_id = p_truck and c.seq = s.last_seq;
    if r.seq is null or r.kind <> 'order' or r.ref <> s.order_key::text or r.version is distinct from s.version or r.payload_hash <> s.last_payload_hash
       or exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.kind = 'order' and c.ref = s.order_key::text and c.seq > s.last_seq) then
      v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'seal state differs from the chain');
    elsif s.deleted_at is null then
      select o.* into ro from public.orders o where o.order_key = s.order_key;
      if ro.order_key is null then
        v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'row gone, no deletion entry');
      elsif ((r.payload::jsonb) -> 'data')::text is distinct from public.till_sealed_order(public.till_row_as_sealed(ro, (r.payload::jsonb) -> 'data'))::text then
        v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'row differs from its sealed form');
      end if;
    elsif not exists (select 1 from public.till_chain d where d.truck_id = p_truck and d.kind = 'deletion' and d.ref = s.order_key::text and d.seq > s.last_seq) then
      v_mis := v_mis || jsonb_build_object('ref', s.order_key, 'kind', 'order', 'problem', 'marked deleted, no deletion entry');
    end if;
  end loop;
  -- every order with entries has a seal state
  for r in select distinct c.ref from public.till_chain c where c.truck_id = p_truck and c.kind = 'order'
             and not exists (select 1 from public.till_order_seals x where x.order_key::text = c.ref) loop
    v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'order', 'problem', 'entries but no seal state');
  end loop;
  -- every chained payment: still equal to its latest entry, or gone with a 'deletion' entry
  for r in select distinct c.ref from public.till_chain c where c.truck_id = p_truck and c.kind = 'payment' loop
    select c.payload, c.seq into v_lpay, v_lseq from public.till_chain c where c.truck_id = p_truck and c.kind = 'payment' and c.ref = r.ref order by c.seq desc limit 1;
    if exists (select 1 from public.order_payments p where p.id::text = r.ref) then
      if ((v_lpay::jsonb) -> 'data')::text is distinct from (select public.till_sealed_payment(p)::text from public.order_payments p where p.id::text = r.ref) then
        v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'payment', 'problem', 'row differs from its sealed form');
      end if;
    elsif not exists (select 1 from public.till_chain d where d.truck_id = p_truck and d.kind = 'deletion' and d.ref = r.ref and d.seq > v_lseq) then
      v_mis := v_mis || jsonb_build_object('ref', r.ref, 'kind', 'payment', 'problem', 'row gone, no deletion entry');
    end if;
  end loop;
  select count(*) into v_unsealed from public.orders o where o.truck_id = p_truck and public.till_fiscal_state(o.status) <> 'pending'
     and not exists (select 1 from public.till_order_seals x where x.order_key = o.order_key);
  select count(*) into v_unchained from public.order_payments p where p.truck_id = p_truck
     and not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.kind = 'payment' and c.ref = p.id::text);

  -- till-pack-4: every close is the chain entry it names (its seq, its hash, kind 'close')
  for s in select x.period_type, x.period_start, x.seq, x.hash from public.till_closes x where x.truck_id = p_truck loop
    if not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = s.seq and c.kind = 'close' and c.hash = s.hash) then
      v_mis := v_mis || jsonb_build_object('ref', s.period_type || ':' || s.period_start, 'kind', 'close', 'problem', 'close row does not match its chain entry');
    end if;
  end loop;

  -- till-pack-5-6: every archive is the chain entry it names (its seq, its hash, kind 'archive'), and names a real chain head
  for s in select x.id, x.seq, x.hash, x.chain_head_seq, x.chain_head_hash from public.till_archives x where x.truck_id = p_truck loop
    if not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = s.seq and c.kind = 'archive' and c.hash = s.hash)
       or not exists (select 1 from public.till_chain c where c.truck_id = p_truck and c.seq = s.chain_head_seq and c.hash = s.chain_head_hash) then
      v_mis := v_mis || jsonb_build_object('ref', s.id::text, 'kind', 'archive', 'problem', 'archive row does not match the chain');
    end if;
  end loop;

  return jsonb_build_object(
    'truck_id', p_truck,
    'ok', v_gaps = 0 and v_links = 0 and v_phash = 0 and v_hash = 0 and coalesce(v_head_ok, false) and v_struct = 0 and v_idref = 0 and v_vers = 0
          and v_deltas = 0 and v_tillid = 0 and v_recon = 0 and jsonb_array_length(v_mis) = 0,
    'entries', v_n, 'gaps', v_gaps, 'bad_links', v_links, 'bad_payload_hashes', v_phash, 'bad_hashes', v_hash, 'head_ok', coalesce(v_head_ok, false),
    'structure', v_struct, 'bad_identity_refs', v_idref, 'bad_versions', v_vers, 'bad_deltas', v_deltas, 'no_till_id', v_tillid,
    'unreconciled', v_recon, 'vat_recomputed', v_recomp,
    'mismatches', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_mis) x limit 50) y),
    'mismatch_count', jsonb_array_length(v_mis),
    'unsealed_orders', v_unsealed, 'unchained_payments', v_unchained);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Who may call what
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
revoke all on function public.till_archive_commit(text, text, date, date, date, date, text, text, text, bigint, bigint, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_sign_archive(text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_verify(text) from public, anon, authenticated, service_role;
grant execute on function public.till_archive_commit(text, text, date, date, date, date, text, text, text, bigint, bigint, text, text, text, text) to service_role;
grant execute on function public.till_sign_archive(text, uuid, text, text) to service_role;
grant execute on function public.till_verify(text) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. The two record tables are append-only (the refusal function is till-pack-1's)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'till_archives_append_only' and tgrelid = 'public.till_archives'::regclass) then
    create trigger till_archives_append_only before update or delete on public.till_archives for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_archives_no_truncate' and tgrelid = 'public.till_archives'::regclass) then
    create trigger till_archives_no_truncate before truncate on public.till_archives for each statement execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_archive_signatures_append_only' and tgrelid = 'public.till_archive_signatures'::regclass) then
    create trigger till_archive_signatures_append_only before update or delete on public.till_archive_signatures for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_archive_signatures_no_truncate' and tgrelid = 'public.till_archive_signatures'::regclass) then
    create trigger till_archive_signatures_no_truncate before truncate on public.till_archive_signatures for each statement execute function public.till_refuse_change();
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The bucket is private and has no policy:  select id, public from storage.buckets where id = 'till-archives';
--    select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%till-archives%' or with_check ilike '%till-archives%');
-- 2. The version and the tables:  select software_name, software_version from public.till_settings;  select count(*) from public.till_archives;
-- 3. place_order_atomic_v2 untouched:  select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure));
```

## Appendix A2 · Every SQL statement I ran myself

**Through the MCP (read-only):**

```sql
select coalesce(locale,'(null)') as locale, count(*) as countries from public.country_settings where enabled group by 1 order by 1;
select current_user, pg_get_userbyid(c.relowner) as objects_owner, has_table_privilege(current_user, 'storage.objects', 'TRIGGER') as can_trigger, pg_has_role(current_user, pg_get_userbyid(c.relowner), 'MEMBER') as member_of_owner, (select count(*) from storage.buckets where id = 'till-archives') as bucket_exists, (select json_agg(json_build_object('t', tgname)) from pg_trigger where tgrelid = 'storage.objects'::regclass and not tgisinternal) as triggers from pg_class c where c.oid = 'storage.objects'::regclass;
select json_build_object(
 'bucket', (select json_build_object('id', id, 'public', public, 'mime', allowed_mime_types, 'size_limit', file_size_limit) from storage.buckets where id = 'till-archives'),
 'bucket_policies', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual,'') ilike '%till-archives%' or coalesce(with_check,'') ilike '%till-archives%')),
 'bucket_objects', (select count(*) from storage.objects where bucket_id = 'till-archives'),
 'objects_trigger', exists (select 1 from pg_trigger where tgname = 'till_archive_objects_keep' and tgrelid = 'storage.objects'::regclass),
 'software', (select software_name || ' ' || software_version from public.till_settings),
 'guard_mode', (select guard_mode from public.till_settings),
 'archives', (select count(*) from public.till_archives), 'archive_signatures', (select count(*) from public.till_archive_signatures),
 'chain', (select count(*) from public.till_chain), 'version_events', (select count(*) from public.till_chain where kind = 'event' and ref = 'version'),
 'v2_md5', md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure))) r;
-- → bucket till-archives public false, application/zip, 524288000; 0 policies; 0 objects; the trigger present;
--   "HatchGrab, till module 1.0.0"; observe; 0 archives; 0 signatures; 0 chain entries; 0 version events; v2 md5 e4b273abcf8e7609c6ca54033ed59332
```

**Through `db-migrate.cjs`:**
- `--probe`, which runs `select current_user, now()` read-only and returned `postgres`;
- the migration file above.

**Through `db-rollback-proofs.cjs`** (every transaction ROLLED BACK): every statement with its parameters is in the logs, with the
rolled-back hashes, signatures and keys masked.

| Log | What it holds |
|---|---|
| `docs/till-pack-5-6/preflight-till-5.log` | the pre-flight |
| `docs/till-pack-5-6/till-5-check.log` | the till-5 check |
| `docs/till-pack-5-6/till-1-check-after-pack-5-6.log` | the till-1 check |
| `docs/till-pack-5-6/till-2-check-after-pack-5-6.log` | the till-2 check |
| `docs/till-pack-5-6/till-4-check-after-pack-5-6.log` | the till-4 check |
| `docs/till-pack-5-6/bucket-privacy.log` | the four anonymous HTTP reads (no SQL) |
