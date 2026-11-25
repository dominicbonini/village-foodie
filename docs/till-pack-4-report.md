# till-pack-4 — the till's closes (day, month, year), signed, and what enforce mode needs

**Status (25 November 2026): BUILT AND APPLIED; the code is NOT deployed.** I applied migration `20261140_till_pack_4.sql` through
`db-migrate.cjs`. It ran as one transaction with no error; it is committed at f0702480, sha256 `3ab86380d1b03474`.

Both of your conditions were met before I applied it:
- **every rehearsal proof passed:** 45/45, rolled back, on the committed file (`--preflight-till-4`);
- **the migration writes nothing to existing rows** of `orders`, `order_payments`, `action_audit_log` or `trucks`. Proof U0 checks
  this from the xid; harness check A1 checks it in the file's text.

After the apply, every check passed and every transaction rolled back:
- `--till-4-check` 44/44;
- `--till-1-check` 44/44 (with the two-connection test and the timings);
- `--till-2-check` (all).

The live state is unchanged:
- 0 closes, 0 signatures, 0 truck settings;
- the signing key is not registered yet;
- the guard is still in **observe** mode;
- `place_order_atomic_v2` md5 is still `e4b273abcf8e7609c6ca54033ed59332`;
- the till chain is still empty (the till code from packs 1–2 is not deployed either).

**Nothing runs until you deploy.** The cron, the routes and the CSV change take effect only on deploy. Nothing is deployed and nothing
is pushed. **One variable to add: `TILL_SIGNING_KEY`** (§4). Without it the closes are written unsigned, and the first run after you
add it signs them all.

Branch `france-vat-1`, starting commit 8f30c331. My commits:

| Commit | What |
|---|---|
| f0702480 | the build, the migration, the proofs, the harness |
| (next commit) | the sweep's re-pins (§8), this report, `docs/till-pack-4/*.log` |

Other sessions' commits landed alongside (compare-research-7, manual-v16-39). They are untouched; §8 separates their effect from mine.

---

## 0 · Prompt check

Nothing arrived garbled, and no two instructions contradicted each other. Below are the choices I made; each is reversible.

1. **The till's start.** The prompt says "from `till_started_at`". The till has no such column, so I take the time of the truck's first
   chain entry, the `till_start` event (seq 1). The days to close run from that day, in the truck's time.
2. **The late rule applies to the daily-totals file too, not only the Z.** An order recorded after its day's close counts on the day it
   was recorded, in both. That is the only way "the Z equals daily-totals for every day" can hold once a day is closed.
   - In practice it applies only to a late offline replay; for every other order the trading day is `event_date` (Q3).
3. **Undo: "guard-check first", not one DB function** (§5 B1). The prompt allowed either. The check needs no change to the money code
   and nothing in observe mode.
4. **A fiscal year that ends mid-month** (GB: 5 April) gets its year close after that month's close, i.e. after 06:00 on 1 May.
   "The year close after the last month of the fiscal year": the last month is April, so the year waits for April. If you want it at
   06:00 on 6 April instead, it is one line in `dueCloses`.
5. **Signing is a separate step after the commit**, because the key must stay outside the database. A close is therefore written as
   `pending` (signed seconds later in the same run) or `unsigned` (no key yet). §4.
6. **Migration number.** Another session had already used `20261134`, so mine is `20261140`.

---

## 1 · What changed

| File | What |
|---|---|
| `supabase/migrations/20261140_till_pack_4.sql` | the tables and functions (§2), the guard and `till_verify` replaced (§5) |
| `lib/till/close.ts` (new, pure) | the close's figures, the grand totals, the fiscal year, what is due |
| `lib/till/close-run.ts` (new) | the hourly run: days, then months, then years, then the signatures |
| `lib/till/signing.ts` (new) | Ed25519 sign and verify, the key from `TILL_SIGNING_KEY` |
| `lib/accounts/daily-inputs.ts` (new) | the ONE loader of a period's rows, used by both the daily-totals file and the Z |
| `lib/accounts/daily-totals.ts` | Q3: a sale is dated by its trading day (`event_date`), late records by the day they were recorded |
| `app/api/manage/route.ts` | `get_daily_totals` reads through the shared loader. Same response shape; each order also carries `event_date`. |
| `app/api/cron/till-close/route.ts` (new) + `vercel.json` | the cron, hourly at minute 15 |
| `app/api/dashboard/action/route.ts` | undo collected / undo mark paid ask `till_correction_check` first (§5) |
| `app/api/admin/delete-truck/route.ts` | refuses a truck with till records (§5) |
| `scripts/till-signing-keygen.cjs` (new, NOT run) | makes the key pair (§4) |
| `scripts/db-rollback-proofs.cjs` | `--preflight-till-4` / `--till-4-check` (§6) |
| `scripts/till-pack-4.cjs` + `scripts/harnesses.json` | the harness, 56/0 (§7) |

**No screen, component, message, email or ticket changed** (harness check I7). The one output that changes is the daily-totals CSV's
dating (Q3, decided). For a sale whose `event_date` is the day it was rung up, the CSV is byte-identical to the starting commit's
(harness checks H1–H3).

---

## 2 · The migration

Additive and backward-compatible with origin/main.

**New tables.** All have RLS on, no grant for anon or authenticated, and no write grant for the service role:
- `till_closes` (append-only): one row per close;
- `till_close_signatures` (append-only): one Ed25519 signature per close;
- `till_truck_settings`: per truck, the fiscal year end (NULL means: from the country) and how far the day closes have scanned.

`till_settings` gains `signing_public_key` and `signing_key_id`, both nullable.

**New functions.** EXECUTE is revoked from everyone, then granted to the service role only:
- `till_close_context`, the inputs to "what is due";
- `till_close_commit`, the close itself, in one transaction:
  1. refuse (HGT20) if outside the till, not due, or already closed;
  2. take the truck's head lock;
  3. refuse (HGT21) if an input row changed after the figures were computed;
  4. seal the day's leftover orders through `till_seal(…, 'day_close')`;
  5. record the chain head;
  6. append the close (kind `close`, ref `day:2026-11-02`);
  7. insert the `till_closes` row;
  8. run `till_verify` and append its result as an `event` (`verify`);
  9. mark the day scanned;
- `till_mark_scanned`, for a day with no activity;
- `till_register_signing_key`, which stores the public key on its first use and refuses (HGT22) a different one;
- `till_sign_close`, which stores a signature once;
- `till_correction_check` (Part B);
- `till_row_as_sealed` (internal).

**Replaced:**
- `till_order_guard`: the event / van deletion rule, §5;
- `till_verify`: such orders compare with the event / van they were sealed with, and every close must be the chain entry it names.

**New refusals:** HGT20, HGT21 and HGT22, raised only by the close and signing functions. **HGT02–HGT04 stay reserved;** nothing raises
them (harness check A3).

**Every SQL statement** is in the appendix:
- §A1 is the migration, exactly as applied;
- §A2 is the read-only checks I ran through the MCP;
- §A3 points to the logs of every statement the rollback proofs sent (`docs/till-pack-4/*.log`, rolled-back hashes and keys masked).

---

## 3 · The close: contents and rules

**When.** The cron runs hourly. For each truck in the till (demo trucks are skipped, and `till_applies` keeps them outside anyway):
- **Day D** closes at the first run after 06:00 on D + 1, truck time (Q2). Days close **in order**: the first refusal stops that
  truck's run, and the next hour retries.
  - A day with no activity gets no close, only "scanned" (Q12).
- **Month** closes once its last day is scanned. It is always written, even at zero (Q12).
- **Year** closes once its last day is scanned and the month holding that day is closed. It is always written.
  - The fiscal year end is `till_truck_settings`, else the day before the country's `tax_year_start`, else 31 December.
  - So GB ends 5 April; AU 30 June; HK and NZ 31 March; FR, IE and US 31 December.

**A day close holds** (`till_closes.totals`, computed by `computeDayClose`):

| Field | What |
|---|---|
| `rates` | per VAT rate: sales incl. VAT, refunds (negative), net excl. VAT, VAT. **These ARE the daily-totals file's rows for D.** |
| `totals` | the same, summed |
| `payments` | charges whose trading day is D, by method: cash / card in person / card online / no method. A payment's trading day is its order's while that day is open, else the day it was recorded. |
| `refunds` | refunds recorded on D, by method |
| `received_for_later_days` | charges recorded on D for orders served later (deposits), by method, with a count |
| `accepted_no_payment` | Q4: accepted orders of D with no payment, count and value. They are already in the sales. |
| `late_records` | orders recorded on D for an earlier, closed day, and refunds on D of an earlier day's order: each with its own day, plus a total. They are in D's figures; a closed day is never reopened. |
| `reversals_netted` | (payment, reversal) pairs reversed on D: counted as nothing everywhere, but listed |
| `receipts` | first and last receipt number, and the count |
| `counts` | orders by state; charges; refunds |
| `by_van`, `by_channel` | accepted sales incl. VAT per van and per source |
| `gt` | the grand totals after D (below) |

The close row also records:
- `chain_head_seq` / `chain_head_hash`, the head it closed at;
- its own `seq` / `hash`;
- `software_version`, `till_started_at` and the time zone;
- `signing_at_commit`.

**Grand totals (Q11).** They are never reset; they start at the till's first close:
- `gt_incl`: previous + the day's sales + refunds (incl. VAT);
- `gt_excl`: previous + the day's net excl. VAT;
- `gt_abs` (perpetual absolute): previous + |sales| + |refunds| + the reversed amounts;
- `gt_period`: like `gt_incl`, but restarting at each fiscal year.

**Months and years** sum their day closes. They carry the grand totals of the last day in them; with no days, they carry the
previous ones.

### Worked example: two days, one late refund

These figures are from the real `computeDayClose`. The truck is French and VAT-inclusive.
- **Mon 2 Nov:** A, 12.00 at 20 %, cash; B, 6.00 at 10 %, card.
- **Tue 3 Nov:** C, 9.00 at 20 %, cash; and B is refunded 6.00 to the card. That refund is **late**: B's day closed at 06:00 on 3 Nov.

| | Mon 2 Nov | Tue 3 Nov |
|---|---|---|
| 10 % line | sales 600 · refunds 0 · net 545 · VAT 55 | sales 0 · refunds −600 · net −545 · VAT −55 |
| 20 % line | sales 1200 · net 1000 · VAT 200 | sales 900 · net 750 · VAT 150 |
| totals | sales 1800 · refunds 0 · net 1545 · VAT 255 | sales 900 · refunds −600 · net 205 · VAT 95 |
| payments | cash 1200 · card in person 600 | cash 900 |
| refunds | — | card in person 600 |
| late records | — | refund of B, own day 2 Nov, 600 (total −600) |
| receipts | 101–102 (2) | 103 (1) |
| GT incl. / excl. | 1800 / 1545 | 2100 / 1750 |
| absolute GT | 1800 | 3300 (1800 + 900 + 600) |
| gt_period | 1800 | 2100 |

Monday's close is never reopened. The daily-totals file for 2 Nov, read on any later day, shows exactly Monday's lines; the file for
3 Nov shows Tuesday's.

---

## 4 · Signing (law change 11)

**The design:**
- The private key is an Ed25519 key held **only** in the server-only environment variable `TILL_SIGNING_KEY` (PKCS#8 DER, base64).
- The database holds only the public key and its id.
- **What is signed:** the close's chain hash, its 64 hex characters as UTF-8. That hash covers the close's figures and, through
  `prev_hash`, every entry before it.
- The key id is the first 16 hex characters of sha256 of the public key's SPKI DER.
- The signature is stored in `till_close_signatures`. Anyone can check it with the public key alone (Node one-liner in the public-key
  doc).

**How the run behaves:**
- **On first use** the run registers the public key in `till_settings`. A different key afterwards is refused (HGT22) and signs
  nothing, so a key is changed only by a person, on purpose.
- **With no key set**, the closes are written `unsigned`.
- **Once the key is set**, the next run signs every close that has no signature yet. The proofs show both cases: S2, G1 and G2.
- **A value that is set but is not an Ed25519 private key** is logged and treated as no key. Nothing is ever silently half-signed.
- **The run returns only counts:** no hash, no key, no signature (G7). Nothing is emailed or sent anywhere.

**What to do (you):**
1. In your own terminal, run `node scripts/till-signing-keygen.cjs`. I have NOT run it, so that the private key never enters this
   transcript.
2. It prints one line: `TILL_SIGNING_KEY=…`. Add exactly that to **Vercel → Project → Settings → Environment Variables, Production,
   marked Sensitive.** The name is **`TILL_SIGNING_KEY`**. It must NOT be `NEXT_PUBLIC_…`. Then clear the terminal.
3. It also writes `docs/till-signing-public-key.md`: the public key and its id, safe to commit. Commit it, or tell me to. That is the
   "public key in the repo docs". The server stores the same key in `till_settings` on its first signed close.
4. It takes effect at your next deploy. Closes written before that are signed by the first run after it.

To replace the key later, clear `till_settings.signing_public_key` / `signing_key_id` on purpose. That is a decision for you, not
something the run does.

---

## 5 · Part B: prepared for enforce (the guard stays in observe)

**B1. Undo collected / undo mark paid: wholly done or wholly refused.**
- Each undo now calls `till_correction_check(order_key)` **first**, before the order read, the audit row, the reversal or the status
  revert.
- It returns `HGT02` only when the guard is in **enforce** mode and the order is sealed with a closed day. The route then answers the
  existing 409 `sale_closed`.
- In observe mode it is always NULL, so the routes behave exactly as today (B1).
- With enforce set inside a rolled-back transaction, it answered HGT02 for a closed-day order and NULL for today's (B2).
- If the check itself errors, the undo goes ahead as before.

**B2. Event and van deletion.**
- A deleted event or van sets `orders.event_id` / `van_id` to NULL through the foreign key. The guard now ignores that change, with no
  version and no would-be refusal, when it is the only change **and** the event / van it named no longer exists.
- `till_verify` compares such an order with the id it was sealed with.
- Proven on the demo truck in enforce mode, rolled back:
  - deleting an event (two sealed orders) and a van (one) succeeded;
  - no new versions and no guard events were recorded;
  - `till_verify` stayed true (B3–B5, B7).
- The exception is narrow: clearing `van_id` directly still makes a new sealed version (B6).
- *Found on the way:* the foreign key's update fires the trigger at depth 1, so `pg_trigger_depth()` cannot tell it apart; the "row is
  gone" test can.

**B3. Admin delete-truck.**
- A truck with any chain entry or sealed order is refused with 409 `till_records_present` and the message "This truck has sealed till
  records (N chain entries, M sealed orders) that must be kept. Nothing was deleted."
- The check runs before the payment check and before anything is deleted, and a failed check refuses (harness I4).
- It has no override; the way out is an archive (till-pack-5).
- The demo-cleanup cron is unaffected: demo trucks have no till records.

**Nothing new is raised:** HGT02–HGT04 stay reserved.

---

## 6 · The rollback proofs (`scripts/db-rollback-proofs.cjs`)

**The setup:**
- The **real** close run (`close-run.ts` with `daily-inputs` / `daily-totals` / `close` / `signing`, bundled) runs inside one
  rolled-back transaction on the French demo truck.
- It goes through a small adapter that speaks the PostgREST subset as SQL, each call in a savepoint.
- The fiscal year is set to end 31 October inside the transaction.
- Every statement is printed (`docs/till-pack-4/*.log`).
- The demo trucks' counts are identical before and after.

**The fixture:**
- **30 Oct:**
  - mixed 10 / 20 / 5.5 % on an event;
  - an online pre-order paid for the next day;
  - an accepted order with no payment, on a van;
  - a reversal pair;
  - a Q5 cancelled counter sale;
  - a 0 % franchise order;
  - an order served after midnight.
- **31 Oct:** a late offline replay for 30 Oct, a late refund, a card sale.

**The results** (pre-flight 45/45 on the committed file; after the apply, `--till-4-check` 44/44, the same less U0):
- **V1–V5:** RLS and grants; append-only; the new columns; guard still observe; v2 md5.
- **C1–C8, the 30 Oct close:**
  - unsigned;
  - payments by method;
  - Q5;
  - 1100 received for later days;
  - Q4 500;
  - the reversal netted;
  - four rates;
  - GT start.
- **C9–C15, the 31 Oct close:**
  - the late replay and the late refund, with their own day;
  - 30 Oct not reopened;
  - GT, absolute GT and gt_period carried;
  - the October and fiscal-year closes.
- **C16–C17:** the Z equals the daily-totals file for each day, alone and inside the two-day file. The file is read later, after the
  late records.
- **C18:** two days with no activity: scanned, no close.
- **S1–S6:**
  - the key registers itself;
  - all 4 closes signed (30 Oct later);
  - every signature verifies with the public key;
  - a different key is refused (HGT22).
- **R1–R6:**
  - a rerun closes nothing;
  - a second close is refused (HGT20);
  - today is not due (HGT20);
  - stale inputs are refused (HGT21);
  - a demo truck is outside the till;
  - a close row cannot change (HGT01).
- **V6:** after every close, a verify entry, each ok; `till_verify` true.
- **C2 / C10:** the runs wrote no order or payment row.
- **B1–B7:** Part B (§5).

---

## 7 · The harness `scripts/till-pack-4.cjs` (56/0)

It runs the same real code against an in-memory database whose till functions mirror the migration's. The truck is GB
(Europe/London, fiscal year 6 April – 5 April), run hour by hour from 20 Feb to 1 May 2027.

**The fixture:**
- walk-ups on two vans and online;
- mixed rates and a 0 % franchise order;
- a pre-order placed and paid four days before;
- an order after midnight, and an event past midnight;
- a reversal pair;
- Q5;
- a counter cash refund;
- Q4;
- a late replay and a late refund;
- days with no activity;
- March with no activity at all;
- the fiscal year's last and first days.

**The sections:**
- **A:** the migration's text.
- **B:** each close's contents, including "3 April is not closed at 05:59".
- **C:** **the Z equals the daily-totals file for every day** (6 day closes), alone and inside the whole period.
- **D:** GT / GT excl. / absolute GT carry; gt_period restarts on 6 April.
- **E:** the months (March at zero); the year after April.
- **F:** a second close is refused; verified after every close.
- **G:**
  - unsigned, then signed later;
  - another key refused;
  - the keygen writes the private key to no file.
- **H:** Q3 against the starting commit's own `daily-totals.ts`.
- **I:** the Part B wiring, the cron, no screen changed.

**Re-run after my changes and the re-pins (§8), all passing:** `till-pack-1` 64/0, `till-pack-2` 68/0, `till-pack-4` 56/0.

---

## 8 · The sweep (START 8f30c331 vs HEAD)

I ran both sides with `run-harnesses.cjs`, over the same list less one file:
- **START:** a worktree of 8f30c331, 238 harnesses.
- **HEAD:** this tree, 239 harnesses (`till-pack-4` added).

**Why one file is left out.** Both sides use a scratch copy of `harnesses.json` without `compare-fix-2.cjs`. That is another session's
harness, listed since before START. It names `createClient` and the service-role key, so the runner's screen refuses the **entire**
run with it listed, on both sides. It was set aside, not changed.

**The raw result:** 22 failed at START, 25 at HEAD.

| | Harnesses | Why |
|---|---|---|
| Fail on both sides, same counts | 20: billing-1, contact-1, costs-accounts-1, country-settings-parity, cwv-2, event-types-render, faq-1, france-1, inbox-2, language-phase-1b, -1c, -1d, -1d2, -1e, -2, legal-languages-1, loyalty-1, screenshot-truck-details, site-chrome-1, tidy-1 | pre-existing, not this pack. I re-ran the four that touch the payment paths (billing-1, costs-accounts-1, loyalty-1, cwv-2): each fails the same checks with the same counts as START (130/1, 77/1, 80/1, 42/2). |
| Fail at START only | 2: pending-card-buttons, pending-card-render | the START worktree has no `.next` build ("no .next/static"); both pass at HEAD |
| Fail at HEAD only | 5: till-pack-1, till-pack-2, france-records-1, enquiries-backend-1, inbox-1 | each pins a file this pack had to change. **Re-pinned** below; all five now pass. |
| Crashed at HEAD, failed at START | loyalty-1, cwv-2 | the till-pack-2 layer's reverse patch no longer applied over this pack's route edits. **New layer** below; both are back to START's exact result. |

**The re-pins, by name, each with its reason.** Each re-pin is the smallest change that keeps the check's rule:
- **`till-pack-1.cjs`**, "no route names the till's tables". `app/api/admin/delete-truck/route.ts` now *counts* `till_chain` /
  `till_order_seals` rows to refuse deleting a till truck (Part B). It is set aside only while those two head-only counts are all it
  names. 64/0.
- **`till-pack-2.cjs`**, two checks:
  - "daily-totals byte-identical to START": `daily-totals.ts` now dates by trading day (Q3, decided). It leaves that list; till-pack-4
    H1–H3 prove the change against START.
  - "every reader nets": the daily read's netting and the reversed-refund filter moved into `lib/accounts/daily-inputs.ts`. They are
    checked there, and the route must call it.
  - Now 68/0.
- **`france-records-1.cjs`**, "get_daily_totals reads the placed orders, refunds, cancellations". The same four reads, now checked in
  the shared loader; the staff refusal is still checked in the route. 60/0.
- **`enquiries-backend-1.cjs`** and **`inbox-1.cjs`**, "no new Vercel cron". `vercel.json` gains exactly one entry,
  `/api/cron/till-close`. With that entry aside, the file must still equal their base. 105/0 and 164/0.
- **`scripts/_lp-till-pack-4.cjs`** (new) plus **`_moved-paths.cjs`**. This pack's committed edits are taken back exactly, as the
  newest layer, first. Till-pack-2's reverse patch then meets the text it was made against, and every other byte is still compared.
  Same method as `_lp-till-pack-2.cjs`: it throws on any mismatch. `loyalty-1` and `cwv-2` are back to their START results.

**Also passing at HEAD:** till-pack-4 56/0, order-charges 288/0.

**The worktree is removed.** The sweep logs stay in my scratch folder (not committed).

---

## 9 · Left undone, and open points

- **Not deployed.** The cron, the routes and the CSV dating change wait for your deploy. The till chain stays empty until the till code
  (packs 1–4) is deployed, so the first close comes the morning after the first sealed sale.
- **`TILL_SIGNING_KEY` is not set**, and the keygen has not been run (§4).
- **After-close edits in observe mode.** A sale *edited* after its day closed (price, items, status) changes what the daily-totals file
  shows for that day, but not the Z.
  - A closed day is never reopened, by design.
  - Refunds are unaffected (they are dated by their own day).
  - Parity holds at every close and stays permanent once till-pack-3 enforces (the guard then refuses such edits).
- **The year close of a fiscal year that ends mid-month** waits for that month's close (§0 point 4).
- **`till_correction_check` must stay the same rule as till-pack-3's enforce refusals** (§10).

---

## 10 · What till-pack-3 must know

- **Keep `till_correction_check` and the guard's enforce rule identical.** The simplest way is for the guard to call
  `till_correction_check`. The undo routes ask it first, so in enforce mode an undo is refused before any write.
  - The remaining window is a day closing between the check and the writes: the reversal could go in and the status revert be refused.
  - Make the payment guard refuse a closed-day reversal by the same rule, so the first write is the one that fails and nothing is
    half-done.
- **Event and van deletion are already safe in enforce:** the FK SET NULL is ignored when the event / van is gone (§5 B2). Do not
  re-add a refusal there.
- **A close must only see a day in its final form.** Close refusals are HGT20–22, separate from the guard's HGT01–04. Edits after the
  close need the refund / correction path (the late-records section of the next close is where it lands).
- `till_closes`, `till_close_signatures` and the close / verify chain entries are append-only (HGT01).

## 11 · What till-pack-5 must know

**What an archive must carry:**
- `till_closes` (with `totals`), `till_close_signatures`, `till_settings.signing_public_key` / `signing_key_id`, and the public-key doc;
- the `verify` events after each close.

**To check an archive offline:**
1. recompute each close's chain hash;
2. verify its signature with the public key;
3. check `chain_head_seq` / `chain_head_hash`.

**Deleting a truck:** admin delete-truck refuses any truck with till records. Archiving is the only path, and it must leave the chain
and the closes in place (or export them first, per law).

**The closes' period keys:** `(truck_id, period_type, period_start)`. Year closes start on the fiscal year's first day, which can be
before the till started.

---

## Undo (only if Dominic asks)

This removes till-pack-4's database objects. Run it only if you ask; it deletes every close and signature.

```sql
begin;
drop trigger if exists till_closes_append_only on public.till_closes;
drop trigger if exists till_closes_no_truncate on public.till_closes;
drop trigger if exists till_close_signatures_append_only on public.till_close_signatures;
drop trigger if exists till_close_signatures_no_truncate on public.till_close_signatures;
drop function if exists public.till_close_context(text);
drop function if exists public.till_mark_scanned(text, date);
drop function if exists public.till_close_commit(text, text, date, date, text, timestamptz, uuid[], uuid[], jsonb, text);
drop function if exists public.till_register_signing_key(text, text);
drop function if exists public.till_sign_close(text, bigint, text, text);
drop function if exists public.till_correction_check(uuid);
drop table if exists public.till_close_signatures;
drop table if exists public.till_closes;
drop table if exists public.till_truck_settings;
alter table public.till_settings drop column if exists signing_public_key;
alter table public.till_settings drop column if exists signing_key_id;
commit;
-- then re-run the pack-1 definitions of public.till_order_guard() and public.till_verify(text) from 20261129_till_pack_1.sql
-- (and drop public.till_row_as_sealed(public.orders, jsonb) after them), and revert the code with `git revert f0702480`.
```

---

## Appendix A1 · The migration, exactly as applied (`supabase/migrations/20261140_till_pack_4.sql`)

```sql
-- 20261140_till_pack_4.sql
-- till-pack-4 (25 November 2026, docs/till-pack-4-report.md; the plan: docs/till-pack-0-report.md §5 E and §8 till-pack-4; the law check:
-- docs/till-law-1-report.md §2 point 2, §3 changes 9–11). THE CLOSES (day, month, year), SIGNED, AND WHAT THE GUARD NEEDS BEFORE IT ENFORCES.
-- The guard stays in OBSERVE mode.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (origin/main):
--    • NEW tables (RLS on, nothing for anon / authenticated, no writes for the service role; the two record tables APPEND-ONLY):
--        till_closes            one row per close — truck, day / month / year, the period, its figures (totals jsonb), the grand totals,
--                               the chain head it closed at, its own chain entry (seq, hash), the software version;
--        till_close_signatures  the Ed25519 signature of a close's chain hash (law change 11) — the key lives OUTSIDE the database;
--        till_truck_settings    per truck: the fiscal year end (law change 9 — NULL = the country's tax year) and how far the day closes
--                               have scanned (a day with no activity gets no close, Q12).
--    • till_settings gains signing_public_key / signing_key_id (NULL until the signing key is first used).
--    • NEW functions, called by lib/till/close-run.ts (the cron /api/cron/till-close) with the service role:
--        till_close_context, till_close_commit (ONE transaction: seal the day's leftovers, write the close, chain it, run till_verify
--        and chain its result as an 'event'), till_mark_scanned, till_register_signing_key, till_sign_close;
--      and till_correction_check (Part B: what the guard WOULD refuse — nothing in observe mode).
--    • REPLACED (create or replace; no signature or grant change): till_order_guard — an event / van deletion's FK SET NULL is allowed
--      (the id went NULL and its event / van is gone: no version, no would-be refusal); till_verify — such an order compares with the event / van it was sealed with, and every close
--      must be the chain entry it names.
--    • NOTHING is written to any existing row of any table. place_order_atomic_v2 is NOT touched (md5 e4b273abcf8e7609c6ca54033ed59332).
--      Nothing raises a new refusal: HGT02–HGT04 stay reserved for till-pack-3; the closes' own refusals are HGT20–HGT22 (below).
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file, then scripts/db-rollback-proofs.cjs --till-4-check and --till-1-check.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.till_settings add column if not exists signing_public_key text;
alter table public.till_settings add column if not exists signing_key_id text;
comment on column public.till_settings.signing_public_key is 'till-pack-4: the Ed25519 public key (SPKI DER, base64) whose private half — the server-only TILL_SIGNING_KEY — signs every close. Registered on its first use; never changed silently (till_register_signing_key refuses a different one).';

create table if not exists public.till_truck_settings (
  truck_id              text primary key,
  fiscal_year_end_month smallint check (fiscal_year_end_month between 1 and 12),
  fiscal_year_end_day   smallint check (fiscal_year_end_day between 1 and 31),
  days_scanned_through  date,
  updated_at            timestamptz not null default now(),
  check ((fiscal_year_end_month is null) = (fiscal_year_end_day is null))
);
comment on table public.till_truck_settings is 'till-pack-4: per truck — the fiscal year END (law change 9; NULL = the day before its country''s tax year start, else 31 December) and the last trading day the day closes have scanned (a day with no activity gets no close, Q12). Written only by the till functions.';

create table if not exists public.till_closes (
  id                 bigserial primary key,
  truck_id           text not null,
  period_type        text not null check (period_type in ('day', 'month', 'year')),
  period_start       date not null,
  period_end         date not null check (period_end >= period_start),
  time_zone          text not null,
  currency           text,
  totals             jsonb not null,
  gt_incl_minor      bigint not null,
  gt_excl_minor      bigint not null,
  gt_abs_minor       bigint not null,
  gt_period_minor    bigint not null,
  till_started_at    timestamptz,
  chain_head_seq     bigint not null,
  chain_head_hash    text not null,
  seq                bigint not null,
  hash               text not null check (hash ~ '^[0-9a-f]{64}$'),
  software_version   text not null,
  signing_at_commit  text not null check (signing_at_commit in ('unsigned', 'pending')),
  created_at         timestamptz not null default now(),
  unique (truck_id, period_type, period_start)
);
comment on table public.till_closes is 'till-pack-4: APPEND-ONLY. The till''s closes — day (after 06:00 on D + 1, truck time, only when D had activity), month and year (always, even at zero). totals = lib/till/close.ts computeDayClose / computePeriodClose (the day''s per-rate lines ARE the daily-totals file''s). Each close is also a chain entry (kind ''close'', seq / hash here). Written only by till_close_commit.';

create table if not exists public.till_close_signatures (
  truck_id   text not null,
  seq        bigint not null,
  key_id     text not null,
  signature  text not null,
  signed_at  timestamptz not null default now(),
  primary key (truck_id, seq)
);
comment on table public.till_close_signatures is 'till-pack-4 (law change 11): APPEND-ONLY. The Ed25519 signature (base64) of a close''s chain hash (the 64 hex characters, as UTF-8 bytes), by the key named key_id (till_settings). A close with no row here is UNSIGNED; the next run signs it once TILL_SIGNING_KEY is set.';

alter table public.till_truck_settings   enable row level security;
alter table public.till_closes           enable row level security;
alter table public.till_close_signatures enable row level security;
revoke all on public.till_truck_settings, public.till_closes, public.till_close_signatures from anon, authenticated;
revoke all on sequence public.till_closes_id_seq from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.till_truck_settings from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_closes from service_role;
revoke insert, update, delete, truncate, references, trigger on public.till_close_signatures from service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The close
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- What the runner needs to decide what is due: is the truck in the till; when its till started (the till_start event); its clock; its
-- fiscal year end (its own, or its country's tax year start); how far the day closes have scanned; its closes so far.
create or replace function public.till_close_context(p_truck text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'now', now(),
    'applies', public.till_applies(p_truck),
    'till_started_at', (select c.created_at from public.till_chain c where c.truck_id = p_truck and c.seq = 1 and c.kind = 'event' and c.ref = 'till_start'),
    'time_zone', public.till_truck_tz(p_truck),
    'currency', (select t.currency from public.trucks t where t.id = p_truck),
    'fiscal_year_end', (select jsonb_build_object('month', s.fiscal_year_end_month, 'day', s.fiscal_year_end_day) from public.till_truck_settings s where s.truck_id = p_truck),
    'country_tax_year_start', (select jsonb_build_object('month', cs.tax_year_start_month, 'day', cs.tax_year_start_day) from public.trucks t join public.country_settings cs on cs.country_code = t.country where t.id = p_truck),
    'days_scanned_through', (select s.days_scanned_through from public.till_truck_settings s where s.truck_id = p_truck),
    'signing_key_id', (select s.signing_key_id from public.till_settings s where s.id),
    'closes', coalesce((select jsonb_agg(jsonb_build_object('type', x.period_type, 'period_start', x.period_start, 'period_end', x.period_end, 'seq', x.seq, 'hash', x.hash,
                 'totals', x.totals, 'signed', exists (select 1 from public.till_close_signatures g where g.truck_id = x.truck_id and g.seq = x.seq)) order by x.period_end, x.period_type)
               from public.till_closes x where x.truck_id = p_truck), '[]'::jsonb))
$$;

-- The day closes have looked at every trading day up to p_day (a day with no activity gets no close).
create or replace function public.till_mark_scanned(p_truck text, p_day date)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.till_truck_settings (truck_id, days_scanned_through) values (p_truck, p_day)
  on conflict (truck_id) do update set days_scanned_through = greatest(coalesce(public.till_truck_settings.days_scanned_through, excluded.days_scanned_through), excluded.days_scanned_through), updated_at = now()
$$;

-- 🔴 THE CLOSE, IN ONE TRANSACTION. Refusals (the run retries the next hour): HGT20 — outside the till, not yet due, or ALREADY CLOSED;
-- HGT21 — a row it was computed from changed since (p_computed_at), so the figures could be stale. Then: seal the day's leftover orders
-- (p_seal_keys, through till_seal — reason 'day_close'), write the close and its chain entry (kind 'close'), run till_verify and chain its
-- result as an 'event' (type 'verify'). Returns the close's seq and hash (what the runner signs), the head it closed at, and the verify result.
create or replace function public.till_close_commit(p_truck text, p_type text, p_start date, p_end date, p_currency text, p_computed_at timestamptz,
                                                    p_input_keys uuid[], p_seal_keys uuid[], p_totals jsonb, p_key_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz      text := public.till_truck_tz(p_truck);
  v_sv      text;
  v_head    bigint;
  v_hhash   text;
  v_seq     bigint;
  v_hash    text;
  v_sealed  integer := 0;
  v_started timestamptz;
  v_ver     jsonb;
  v_vseq    bigint;
  k         uuid;
  v_gt      jsonb := p_totals -> 'gt';
begin
  if not public.till_applies(p_truck) then raise exception 'till close: % is outside the till', p_truck using errcode = 'HGT20'; end if;
  if p_type not in ('day', 'month', 'year') or p_end < p_start then raise exception 'till close: bad period % % %', p_type, p_start, p_end using errcode = 'HGT20'; end if;
  if now() < ((p_end + 1) + time '06:00') at time zone v_tz then raise exception 'till close: % % is not due yet', p_type, p_start using errcode = 'HGT20'; end if;
  insert into public.till_chain_heads (truck_id, last_seq, last_hash) values (p_truck, 0, repeat('0', 64)) on conflict (truck_id) do nothing;
  perform 1 from public.till_chain_heads h where h.truck_id = p_truck for update;
  if exists (select 1 from public.till_closes x where x.truck_id = p_truck and x.period_type = p_type and x.period_start = p_start) then
    raise exception 'till close: % % is already closed', p_type, p_start using errcode = 'HGT20';
  end if;
  if exists (select 1 from public.orders o where o.order_key = any (coalesce(p_input_keys, '{}')) and o.updated_at > p_computed_at)
     or exists (select 1 from public.order_payments p where p.order_key = any (coalesce(p_input_keys, '{}')) and p.created_at > p_computed_at) then
    raise exception 'till close: % % — its rows changed after it was computed', p_type, p_start using errcode = 'HGT21';
  end if;
  if p_type = 'day' then
    foreach k in array coalesce(p_seal_keys, '{}') loop
      -- only an order past 'pending' is sealed (pack-1b: an order seals at acceptance; a pending one is not a sale yet)
      if not exists (select 1 from public.till_order_seals s where s.order_key = k)
         and exists (select 1 from public.orders o where o.order_key = k and o.truck_id = p_truck and public.till_fiscal_state(o.status) <> 'pending') then
        if public.till_seal(k, 'day_close') = 1 then v_sealed := v_sealed + 1; end if;
      end if;
    end loop;
  end if;
  select h.last_seq, h.last_hash into v_head, v_hhash from public.till_chain_heads h where h.truck_id = p_truck;
  select s.software_version into v_sv from public.till_settings s where s.id;
  v_started := (select c.created_at from public.till_chain c where c.truck_id = p_truck and c.seq = 1);
  v_seq := public.till_append(p_truck, 'close', p_type || ':' || p_start::text, null, 'close', p_end,
    p_totals || jsonb_build_object('period_type', p_type, 'period_start', p_start, 'period_end', p_end, 'time_zone', v_tz, 'currency', p_currency,
      'till_started_at', public.till_ts(v_started), 'chain_head', jsonb_build_object('seq', v_head, 'hash', v_hhash), 'sealed_at_close', v_sealed,
      'signing', case when p_key_id is null then to_jsonb('unsigned'::text) else jsonb_build_object('key_id', p_key_id) end), null);
  select c.hash into v_hash from public.till_chain c where c.truck_id = p_truck and c.seq = v_seq;
  insert into public.till_closes (truck_id, period_type, period_start, period_end, time_zone, currency, totals, gt_incl_minor, gt_excl_minor, gt_abs_minor,
      gt_period_minor, till_started_at, chain_head_seq, chain_head_hash, seq, hash, software_version, signing_at_commit)
    values (p_truck, p_type, p_start, p_end, v_tz, p_currency, p_totals, coalesce((v_gt ->> 'gtIncl')::bigint, 0), coalesce((v_gt ->> 'gtExcl')::bigint, 0),
      coalesce((v_gt ->> 'gtAbs')::bigint, 0), coalesce((v_gt ->> 'gtPeriod')::bigint, 0), v_started, v_head, v_hhash, v_seq, v_hash, coalesce(v_sv, '0.1.0'),
      case when p_key_id is null then 'unsigned' else 'pending' end);
  v_ver := public.till_verify(p_truck);
  v_vseq := public.till_append(p_truck, 'event', 'verify', null, 'after_close', public.till_today(p_truck),
    jsonb_build_object('type', 'verify', 'after', p_type || ':' || p_start::text, 'ok', v_ver -> 'ok', 'entries', v_ver -> 'entries', 'mismatch_count', v_ver -> 'mismatch_count',
      'unsealed_orders', v_ver -> 'unsealed_orders', 'unchained_payments', v_ver -> 'unchained_payments'), null);
  if p_type = 'day' then perform public.till_mark_scanned(p_truck, p_end); end if;
  return jsonb_build_object('seq', v_seq, 'hash', v_hash, 'head_seq', v_head, 'head_hash', v_hhash, 'sealed', v_sealed, 'verify_ok', v_ver -> 'ok', 'verify_seq', v_vseq);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Signing (law change 11) — the private key is NEVER in the database
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- The public half of TILL_SIGNING_KEY, registered on its first use. A DIFFERENT key is refused (HGT22): a key is changed by a person, on purpose.
create or replace function public.till_register_signing_key(p_public_key text, p_key_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pub text;
  v_id  text;
begin
  if p_public_key !~ '^[A-Za-z0-9+/=]{40,200}$' or p_key_id !~ '^[0-9a-f]{16}$' then raise exception 'till signing: malformed key' using errcode = 'HGT22'; end if;
  select s.signing_public_key, s.signing_key_id into v_pub, v_id from public.till_settings s where s.id for update;
  if v_id is null then
    update public.till_settings set signing_public_key = p_public_key, signing_key_id = p_key_id, updated_at = now() where id;
    return true;
  end if;
  if v_id = p_key_id and v_pub = p_public_key then return false; end if;
  raise exception 'till signing: TILL_SIGNING_KEY is not the registered key (%) — not signing', v_id using errcode = 'HGT22';
end;
$$;

-- A close's signature, by the registered key. Stored once (a second signature of the same close is ignored).
create or replace function public.till_sign_close(p_truck text, p_seq bigint, p_key_id text, p_signature text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.till_closes x where x.truck_id = p_truck and x.seq = p_seq) then raise exception 'till signing: no close at seq %', p_seq using errcode = 'HGT22'; end if;
  if p_key_id is distinct from (select s.signing_key_id from public.till_settings s where s.id) then raise exception 'till signing: key % is not the registered key', p_key_id using errcode = 'HGT22'; end if;
  if p_signature !~ '^[A-Za-z0-9+/=]{80,100}$' then raise exception 'till signing: malformed signature' using errcode = 'HGT22'; end if;
  insert into public.till_close_signatures (truck_id, seq, key_id, signature) values (p_truck, p_seq, p_key_id, p_signature) on conflict (truck_id, seq) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Part B — what enforce mode will need (the guard stays OBSERVE; nothing here refuses)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- Would the guard refuse a CORRECTION (an undo, an edit) of this order? 'HGT02' only in ENFORCE mode for a sealed order whose trading day is
-- closed; NULL otherwise — always NULL in observe mode. The undo routes ask this FIRST, so in enforce mode an undo is refused before any write.
create or replace function public.till_correction_check(p_order_key uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when coalesce((select s.guard_mode from public.till_settings s where s.id), 'observe') = 'enforce'
                   and public.till_applies(o.truck_id)
                   and exists (select 1 from public.till_order_seals x where x.order_key = o.order_key)
                   and public.till_day_closed(o.truck_id, o.event_date) then 'HGT02' end
  from public.orders o where o.order_key = p_order_key
$$;

-- An order row as it was sealed when its event or van has since been DELETED (the FK set them NULL): till_verify compares that, not NULL.
create or replace function public.till_row_as_sealed(ro public.orders, d jsonb)
returns public.orders
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders := ro;
begin
  if o.event_id is null and d ->> 'event_id' is not null and not exists (select 1 from public.truck_events e where e.id::text = d ->> 'event_id') then o.event_id := d ->> 'event_id'; end if;
  if o.van_id is null and d ->> 'van_id' is not null and not exists (select 1 from public.truck_vans v where v.id::text = d ->> 'van_id') then o.van_id := d ->> 'van_id'; end if;
  return o;
end;
$$;

create or replace function public.till_order_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old    text;
  v_fs     text := public.till_fiscal_state(new.status);
  v_sealed boolean;
  v_fk     public.orders;
begin
  if not public.till_applies(new.truck_id) then return null; end if;
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    -- 🔴 till-pack-4: an event or a van being DELETED sets orders.event_id / van_id to NULL through the foreign key (ON DELETE SET NULL).
    -- When that is the ONLY change — the id went to NULL AND the event / van it named no longer exists — it is allowed and ignored: no
    -- version, no seal, no would-be refusal, so the deletion can never be refused once the guard enforces. till_verify compares such an
    -- order with the event / van it was sealed with (till_row_as_sealed). (Not pg_trigger_depth(): the foreign key's UPDATE queues this
    -- trigger to the outer statement, so it runs at depth 1.) Clearing an id whose event / van still exists is an edit, as before.
    if (old.event_id is not null and new.event_id is null and not exists (select 1 from public.truck_events e where e.id = old.event_id))
       or (old.van_id is not null and new.van_id is null and not exists (select 1 from public.truck_vans v where v.id = old.van_id)) then
      v_fk := new;
      if v_fk.event_id is null and old.event_id is not null and not exists (select 1 from public.truck_events e where e.id = old.event_id) then v_fk.event_id := old.event_id; end if;
      if v_fk.van_id is null and old.van_id is not null and not exists (select 1 from public.truck_vans v where v.id = old.van_id) then v_fk.van_id := old.van_id; end if;
      if public.till_order_source(v_fk) is not distinct from public.till_order_source(old) then
        perform set_config('lock_timeout', v_old, true);
        return null;
      end if;
    end if;
    v_sealed := exists (select 1 from public.till_order_seals s where s.order_key = new.order_key);
    if not v_sealed then
      if v_fs <> 'pending' then
        perform public.till_seal(new.order_key, case when v_fs = 'accepted' then 'accepted' else 'final_state' end);
      end if;
    elsif public.till_order_source(old) is distinct from public.till_order_source(new) then
      perform public.till_seal(new.order_key, null);
    end if;
    perform set_config('lock_timeout', v_old, true);
  exception when others then
    perform public.till_log_failure(new.truck_id, 'order_update', new.order_key::text, sqlstate, sqlerrm);
  end;
  return null;
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
-- 5. Who may call what
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- One statement per function (scripts/migration-function-grants.cjs reads one signature per revoke).
revoke all on function public.till_close_context(text) from public, anon, authenticated, service_role;
revoke all on function public.till_mark_scanned(text, date) from public, anon, authenticated, service_role;
revoke all on function public.till_close_commit(text, text, date, date, text, timestamptz, uuid[], uuid[], jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.till_register_signing_key(text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_sign_close(text, bigint, text, text) from public, anon, authenticated, service_role;
revoke all on function public.till_correction_check(uuid) from public, anon, authenticated, service_role;
revoke all on function public.till_row_as_sealed(public.orders, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.till_order_guard() from public, anon, authenticated, service_role;
revoke all on function public.till_verify(text) from public, anon, authenticated, service_role;
grant execute on function public.till_close_context(text) to service_role;
grant execute on function public.till_mark_scanned(text, date) to service_role;
grant execute on function public.till_close_commit(text, text, date, date, text, timestamptz, uuid[], uuid[], jsonb, text) to service_role;
grant execute on function public.till_register_signing_key(text, text) to service_role;
grant execute on function public.till_sign_close(text, bigint, text, text) to service_role;
grant execute on function public.till_correction_check(uuid) to service_role;
grant execute on function public.till_verify(text) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. The two record tables are append-only (the refusal function is till-pack-1's)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'till_closes_append_only' and tgrelid = 'public.till_closes'::regclass) then
    create trigger till_closes_append_only before update or delete on public.till_closes for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_closes_no_truncate' and tgrelid = 'public.till_closes'::regclass) then
    create trigger till_closes_no_truncate before truncate on public.till_closes for each statement execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_close_signatures_append_only' and tgrelid = 'public.till_close_signatures'::regclass) then
    create trigger till_close_signatures_append_only before update or delete on public.till_close_signatures for each row execute function public.till_refuse_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'till_close_signatures_no_truncate' and tgrelid = 'public.till_close_signatures'::regclass) then
    create trigger till_close_signatures_no_truncate before truncate on public.till_close_signatures for each statement execute function public.till_refuse_change();
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The tables, RLS on:  select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_closes', 'till_close_signatures', 'till_truck_settings');
-- 2. Nothing closed or signed yet, the key not registered, place_order_atomic_v2 untouched:
--   select (select count(*) from public.till_closes), (select count(*) from public.till_close_signatures), (select signing_key_id from public.till_settings), md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure));
```

## Appendix A2 · Read-only SQL I ran through the MCP (no writes)

```sql
-- before building: required columns of the event and van tables
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name in ('truck_vans','truck_events') and is_nullable='NO' order by table_name, ordinal_position;
-- the demo trucks' orders near the proof dates, the order column defaults, the order triggers
select json_build_object(
 'near', (select json_agg(x) from (select truck_id, count(*) filter (where event_date between '2026-10-25' and '2026-11-04' or created_at between '2026-10-25' and '2026-11-05') as near, count(*) as all_orders from orders where truck_id in ('demo-mk65q66spjck0g9mxt50btfxtr','test-truck-2') group by truck_id) x),
 'cols', (select json_agg(x) from (select column_name, column_default from information_schema.columns where table_schema='public' and table_name='orders' and column_name in ('updated_at','created_at','placed_at','currency','receipt_no')) x),
 'trg', (select json_agg(x) from (select tgname, pg_get_triggerdef(t.oid) d from pg_trigger t where tgrelid='public.orders'::regclass and not tgisinternal) x)) r;
-- (an earlier form of the same three reads, sent as four statements; only the last result came back)
select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.order_payments'::regclass and contype='c';
select pg_get_functiondef('public.set_orders_updated_at()'::regprocedure) d;
-- after applying
select json_build_object(
 'rls', (select json_agg(json_build_object(relname, relrowsecurity)) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_closes', 'till_close_signatures', 'till_truck_settings')),
 'closes', (select count(*) from public.till_closes), 'signatures', (select count(*) from public.till_close_signatures), 'truck_settings', (select count(*) from public.till_truck_settings),
 'key_id', (select signing_key_id from public.till_settings), 'guard_mode', (select guard_mode from public.till_settings),
 'v2_md5', md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)),
 'chain', (select count(*) from public.till_chain), 'reversals', (select count(*) from public.order_payments where kind = 'reversal')) r;
-- → rls all true; closes 0; signatures 0; truck_settings 0; key_id null; guard_mode observe; v2_md5 e4b273abcf8e7609c6ca54033ed59332; chain 0; reversals 0
```

## Appendix A3 · Every statement the rollback proofs sent

Each log is the script's full output: every statement with its parameters, then the results. The rolled-back demo hashes, signatures
and public keys are masked; no private key is ever sent to the database. Every transaction ended in ROLLBACK.

| Log | What it holds |
|---|---|
| `docs/till-pack-4/preflight-till-4.log` | the migration, then the proofs: 392 statements |
| `docs/till-pack-4/till-4-check.log` | after the apply: 392 statements |
| `docs/till-pack-4/till-1-check-after-pack-4.log` | the pack-1 check |
| `docs/till-pack-4/till-2-check-after-pack-4.log` | the pack-2 check |

The applying statement was `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261140_till_pack_4.sql`, which ran
the file in A1 as one transaction.
