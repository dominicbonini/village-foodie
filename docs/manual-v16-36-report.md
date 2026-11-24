# manual-v16-36 — reference manual delta V16.35 → V16.36

24 November 2026. Branch `france-vat-1`. **Only `docs/reference-manual.md` and this report are committed. Not pushed, not deployed.**

## Summary

- **The delta is applied** to `docs/reference-manual.md`, following its HOW TO APPLY:
  - the version is set in both places (line 1 and the front matter);
  - the Open items heading is V16.36; items 8, 19, 23, 40, 46, 47 and 48 are edited in place, and new items 52–54 are added;
  - the V16.36 changelog entry is at the top of `# Changelog`, with its OBSERVED block filled in;
  - every §C reference change is made, including the new privacy-policy subsection in §43 with its reply-deadlines table.
- **The read-only checks (§D) all match the delta:**
  - `place_order_atomic_v2` md5 is unchanged (`e4b273ab…`);
  - every count is 0;
  - all seven named commits are on france-vat-1.
- **The delta's facts were checked against the three reports and the code.** It differs from reality in **9 places**, listed in §3; the manual records reality.
- **Nothing was written to the database.** Only the delta's three SELECTs were run (§2).

## 0 · Prompt check

- **The delta file:** `~/Downloads/reference-manual-delta-v16-36.md` (21,774 bytes, modified 24 Nov 2026 21:31:32). There was only one copy; there is no "-2" copy.
  - On the first attempt (about 21:30) the file wasn't there yet. A disk-wide search found only the v16-33/34/35 deltas, so I stopped and asked.
  - On "try again" it was present.
- **Garbled spans:** none, in the prompt or the delta.
- **Contradictions:** none. One point of judgement, explained in §4: HOW TO APPLY 4 ("keep superseded text struck through with a ⛔ pointer") against HOW TO APPLY 7 ("change nothing else"). I read 4 as covering text that the delta's own changes supersede.
- **Reports read, not written to:**
  - `docs/france-receipts-1-report.md`
  - `docs/france-notes-1-report.md`
  - `docs/france-privacy-1-report.md`
- **Other sessions' files, left untouched and unstaged:**
  - `docs/plans-everywhere-5-report.md` (modified)
  - the untracked compare-* reports
  - `docs/deploy-prep-1-report.md`
  - `docs/manual-v16-35-report.md`

## 1 · What changed in `docs/reference-manual.md`

| Where | Change |
|---|---|
| Line 1, front matter | `· V16.36`, `**Version 16.36**` (grep: both present). |
| Open items heading | `# Open items (V16.36, 24 November 2026) — THE ONLY CURRENT LIST`. |
| Item 8 | ⛔ The lawyer's check now covers the terms parts and the single privacy policy. |
| Item 19 | ⛔ Partly done (Business details). What's left: signup, the VIES online check, billing. |
| Item 23 | « N° » prints as "No" on the receipt block. |
| Item 40 | OBSERVED line refreshed. The old line is struck: origin/main `f2e2b4ab`, main `59ae6161` (10 ahead), france-vat-1 `bafd1495` (36 ahead of main). |
| Item 46 | The old "left: …" is struck and replaced with the delta's text. |
| Item 47 | The old "Have / Missing" is struck and replaced with the delta's text (`undo_mark_paid`, not `undo_paid`: §3 #6). The "Until decided …" sentence and its franchise-en-base exemption are kept. |
| Item 48 | The in-progress clause is struck and replaced with the delta's text. |
| New 52–54 | France reply wording after the deploy; the two account-deletion decisions; a native read of the privacy wording. |
| `# Changelog` | The V16.36 entry, above V16.35, with the OBSERVED block (§2). |
| §83.9 France | "V16.36 — what is built" and "V16.36 — the law, as researched 23–24 Nov", added at the end of the V16.35 block. |
| §37 "Per-dish VAT rates …" | The in-progress marker on the regime stamp is struck. New bullet: the franchise-en-base rule (0 % at order time on every path, saved rates untouched, edits follow `orders.vat_regime`, the 293 B condition, the CSV's 0 % columns). |
| §18 | New subsection: "The receipt facts on the confirmation email". |
| §42 printing | New subsection: "The receipt block and the franchise line on the ticket" (`franchiseNote`, `receipt`, wrapped and never truncated, « N° » → "No"). |
| §16 | New subsection: "New columns and triggers at V16.36" (`line_notes` ×2 with shape and key, `vat_regime` ×2, the two stamp triggers). |
| §19 | A ⛔ on the Orders CSV bullet: per-rate columns whenever the file holds two or more rates **or any 0 % rate**. |
| §43 retention bullet | A ⛔ on `specialInstructions` / `slotNotes`: this only applies to orders without `line_notes`. `notesPatch` is shared with §41. |
| §41 | The `orders` row gets a ⛔ for step 2b, and a new `order_drafts` row is added. New subsection: "Step 2b — customers' notes are cleared", with the short where-notes-live table. |
| §43 legal | New subsection: "One privacy policy for every country (V16.36 …)", with the reply-deadlines table and the "earlier of the two" line. Two ⛔ pointers on superseded text (§4). |
| §50 Business details | The "receipts are V16.36" line is struck. The franchise note's new wording and condition are recorded (§3 #8). |

## 2 · Verify (§D) — OBSERVED 24 Nov 2026, 21:32 UTC

**Git** (each name resolved on its own):

- **Checked out:** `france-vat-1`
- **`origin/main`:** `f2e2b4ab`
- **`main`:** `59ae6161`
- **`france-vat-1`:** `bafd1495`
- **`git rev-list --count main..france-vat-1`:** **36**
- **`git rev-list --count origin/main..main`:** **10**
- **`6ed618a9 55b87152 cf970e32 ae3fc8f1 395c75fe cb99918d bafd1495`:** all exist and are on france-vat-1 (`git merge-base --is-ancestor`). None is on main.

**SQL** (read-only, through the Supabase MCP). These are the only statements run in this workstream:

```sql
select table_name, column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name in ('orders', 'order_drafts') and column_name in ('line_notes', 'vat_regime', 'receipt_no', 'tax_breakdown')
 order by 1, 2;
```

Result:
- **order_drafts:** line_notes jsonb, tax_breakdown jsonb, vat_regime text.
- **orders:** line_notes jsonb, receipt_no bigint, tax_breakdown jsonb, vat_regime text.
- `order_drafts` has no `receipt_no` (expected: receipt numbers are on orders only).

```sql
select c.relname as tbl, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'public'::regnamespace and c.relname in ('orders', 'order_drafts') and not t.tgisinternal order by 1, 2;
```

Result:
- **order_drafts:** `order_drafts_stamp_vat_regime`.
- **orders:** `orders_fill_currency_country`, `orders_receipt_no`, `orders_receipt_no_keep`, `orders_set_updated_at`, `orders_stamp_vat_regime`.

```sql
select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5,
  (select count(*) from public.orders where receipt_no is not null) as numbered,
  (select count(*) from public.receipt_no_failures) as receipt_failures,
  (select count(*) from public.orders where line_notes is not null) as orders_with_line_notes,
  (select count(*) from public.orders where vat_regime is not null) as orders_with_regime,
  (select count(*) from public.trucks where vat_regime is not null) as trucks_with_regime;
```

Result:
- `v2_md5` = `e4b273abcf8e7609c6ca54033ed59332` (as expected);
- numbered 0, receipt_failures 0, orders_with_line_notes 0, orders_with_regime 0, trucks_with_regime 0.

## 3 · Where the delta and reality differ (the manual records reality)

1. **The mockup.** The delta says france-receipts-1 was "approved by Dominic from a mockup on 24 Nov". The receipts report (Things you should know, point 4) says the approved mockup was not in the repo, so the style was built from the brief: the business block in 11–12 px muted grey, centred at the bottom, and the date of sale 12 px under the order number.
   - The manual records both: Dominic approved a mockup, and the build followed the brief's description.
2. **« Commande #23 ».** The delta says Dominic decided to keep it. The report shows the builder kept it and offered « n° » as a one-word change.
   - These don't conflict; the manual records the delta's decision. Mentioned only so you can confirm it was your decision.
3. **How the email gets the receipt facts.** The delta's §18 says they are "read by order key". In the code (`app/api/dashboard/action/route.ts`, `app/api/orders/submit/route.ts`, `lib/payments/promote-draft.ts`):
   - `receiptForRow` is used where the order row is already at hand: the operator confirm, the edit "updated" email and the status page;
   - `receiptForOrderKey` is used where only the key is at hand: the customer submit, the card promotion, the walk-up and the slot change.
   - The manual's §18 says this.
4. **The 293 B condition.** The delta says "only when the order is stamped franchise AND carries no tax". The code (`lib/receipt.ts` `franchiseNoteFor`) also requires a **French** order (`hasVatRegime`).
   - "No tax" means a tax amount of 0, an order rate of 0, and no breakdown row with tax or a non-zero rate.
   - The manual states the full condition.
5. **The re-pin count.** The delta says "seven harnesses re-pinned by name". The privacy report's §8 re-pins **ten** harnesses, plus the undo chain (`_named-terms-postpay-1.cjs` now calls `_named-france-privacy-1.cjs` first):
   - legal-languages-1;
   - the seven the first sweep found: world-countries-2, world-countries-3, us-legal-draft, paperwork-1, france-notes-1, plans-data-model, language-phase-1e-tidy;
   - tidy-1 and contact-1.
   - "Seven" is the count of *extra* failures the first sweep found.
6. **Item 47's action name.** The delta names `undo_paid`. The action is **`undo_mark_paid`**, next to `undo_collected` (`app/api/dashboard/action/route.ts`).
   - Both delete the payment row behind a write-first audit row. For a card row, `undo_collected` can refund instead.
7. **The `line_notes` key.** The delta says "key = the line's cartKey, else `#position`". The stored key is `"k:<cartKey>"` (with the prefix) or `"#<position>"`, and a cartKey seen twice falls back to the position.
   - In practice it is the position, because stored lines carry no cartKey today (notes report §2).
8. **§50's franchise note.** The delta says to "replace the franchise note's wording and condition". The manual's §50 never described the note, so there was nothing to strike.
   - The new wording and condition are added, with the old ones named in a ⛔ clause.
   - Old: "You've chosen franchise en base, so you may want to set your VAT to 0 %.", shown only while a rate above 0 applied.
   - New: shown whenever franchise en base is chosen.
   - The condition change is also recorded in the changelog's "Operator note" bullet, which the delta gave as a wording change only.
9. **The reply-deadlines table.** It matches the privacy report's §6 row for row, except that the delta adds **UK** to the "one month" row. The removed country parts didn't cover the UK, but START's own Privacy Policy did ("We will respond within one month", `ec16f022` line 173).
   - The UK is kept, and the manual names the source.
   - NZ: the report quotes the removed text, "as soon as we reasonably can, and within 20 working days"; the delta's paraphrase is kept.

**Small precisions added, not contradictions:**
- the ticket's divider is not doubled when the notes block's rule is already there;
- step 2b pages 500 rows at a time, writes only rows that still hold notes, and throws `clear_notes:<table>:<id>`;
- the sitemap lastmods moved with the legal dates;
- `order_drafts` has no `receipt_no`.

**Checked and matching:**
- the commits and their roles;
- the harness counts (53/0, 44/0, 47/0);
- the sweep's 19 failures, the same as at `ec16f022`;
- the English privacy wording (A–H, quoted in the manual from `content/legal/privacy-policy.md` and `country-specific-terms.md`);
- the CSV rule `rates.length > 1 || rates.includes(0)` (`lib/accounts/csv.ts:63`);
- the triggers and columns;
- the 54 bases and the 5 left untouched;
- the live counts in item 53 (from the privacy report §9);
- `TERMS_VERSION` written only at signup.

**Not checked, recorded as the delta gives them:**
- **Dominic's decisions** (the decisions block), including "the default is 'No VAT' where prices include tax with no built-in default". I didn't trace this through the code.
- **The French law facts** (§83.9). They come from the France research chat; the reports and code can't confirm them.
- **Item 52's description of the 23 Nov reply drafts.** Checking it would need a `reply_knowledge` query outside §D.

## 4 · Judgement calls

- **Superseded text struck, under HOW TO APPLY 4.** These are where the delta's own new text makes older reference text wrong:
  - §43 "Structure (DECIDED 19 Oct)": "it forms part of both documents and wins where it differs" and "both documents and the legal footer link to it" are struck, with ⛔ pointers (Terms only; the Privacy Policy no longer links it).
  - §43, legal-languages-1: a ⛔ note on the UAE-section line.
  - §37: "in progress" is struck on the regime stamp.
  - §50: the "receipts are V16.36" line is struck.
  - Nothing else outside the delta was touched.
- **The V16.35 changelog entry is left as history.** This includes its "france-receipts-1 — IN PROGRESS … The full entry is V16.36's" line.

## 5 · Commit

`docs/reference-manual.md` and `docs/manual-v16-36-report.md`, committed together and nothing else.
