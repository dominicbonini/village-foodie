# billing-1 — the Stripe test-mode run

*11 November 2026. Run on main at `92d9ed1b`, which includes billing-2's commits, plus one fix to the test script (§2). Stripe **test mode only**: the script refuses any key that does not start with `sk_test_`, and it reported "the processor is test mode". Nothing was deployed. `billing_enabled` stays **false**. Pizzeria Gusto was not touched or queried. There are no customer-facing changes. No `.env*` file was opened, read or printed: the key was loaded by Next's own loader (`@next/env`), as hand step 1 says.*

## Summary

- `node scripts/billing-1-stripe-test.cjs`: **14 passed, 0 failed**. The first run stopped at the idempotency step because of a test-script bug, not billing code (§2).
- `node scripts/billing-1.cjs`: **131 passed, 0 failed**.
- The billing switch is still off (read-only check, §3).

## 0 · Flags

- **No span of this prompt arrived garbled. No instructions contradicted each other.**
- **The earlier billing-2 prompt in this conversation was cut off** ("…to the same tone (and"), and you interrupted it. This run did not act on it.
  - billing-2's work is already on main (`92d9ed1b billing-2: report` and the commits before it), made by another session.
  - This run tested that code as committed.

## 1 · What the Stripe test proved (test mode)

| # | Check | Result |
|---|---|---|
| 1 | The processor is test mode | ✓ |
| 2–6 | One invoice per currency, finalised and open at the right amount: GBP 2900, EUR 2900, BRL 5900, MXN 34900, JPY 1980 (zero-decimal) | ✓ |
| 7 | One Stripe Customer for the owner of all five trucks (found again, never duplicated) | ✓ |
| 8 | GB: the declining test card fails (1 attempt, "Your card was declined.") | ✓ |
| 9 | GB: paused at the pause instant (00:00 after 5 full days) | ✓ |
| 10 | GB: day 5 with a test £3 late fee (every real fee is 0) → the invoice is voided and re-issued at 3200 | ✓ |
| 11 | GB: a good card → paid → active again (online ordering resumes) | ✓ |
| 12 | FR: the engine's request was keyed on the charge (`chargeKeyOf`) | ✓ (new check) |
| 13 | FR: the same month again → Stripe replays the **same** invoice (idempotency key) | ✓ |
| 14 | BR: a Pix Automático SetupIntent is created (`seti_…`); confirming it needs the payer's bank app | ✓ |

The trucks are in-memory fixtures (`lib/billing/memory-store.ts`) under a fresh owner on each run. Only the processor talks to Stripe, so nothing was written to the database.

## 2 · The one failure, and the fix

**First run:** 11 checks passed, then it crashed:

> Keys for idempotent requests can only be used with the same parameters they were first used with … `billing:b1-…-fr:2026-11-01:monthly:invoice`

**Cause: the test script, not billing code.**
- The idempotency check replayed `createInvoice` with placeholder `description: 'x'` and a placeholder line, instead of the request the engine had sent.
- Stripe correctly refuses a reused key with different parameters.
- The engine's own retries send identical parameters, because it derives the description and lines from the charge alone (`lib/billing/engine.ts` `invoiceCharge`). So the billing code was not at fault.

**Fix (`scripts/billing-1-stripe-test.cjs` only):**
- The script now records the first `createInvoice` request the engine makes for each truck.
- The idempotency step replays that exact request (`{ ...first }`), the way a retried run does.
- It also asserts that the request was keyed on `chargeKeyOf(charge)`.
- No billing code changed.

**Re-run:** 14/14. Then `billing-1.cjs`: 131/131.

## 3 · SQL (read only)

```sql
select billing_enabled, billing_pause_after_days from platform_switches;
-- billing_enabled = false, billing_pause_after_days = 5
```

No other SQL was run or prepared. `scripts/billing-1-db-read.cjs` was **not** run, because it reads the gate for Pizzeria Gusto and you asked for Gusto not to be touched.

## 4 · Left in Stripe test mode

- The run created test objects under a fresh owner: one Customer with its attached test cards; 6 invoices (the 5 above + the GB re-issue): GB's first voided, its re-issue paid, FR, BR, MX and JP left open; and 1 Pix SetupIntent. The crashed first run left a similar set under its own owner.
- They are harmless test data and can stay, or be deleted in the Dashboard under test mode.

## 5 · Still to do (hand steps 2–4 of docs/billing-1-report.md)

- **Pix:** turn it on in test mode. The SetupIntent was created, which shows Pix Automático is accepted at this stage. A confirmed mandate needs a payer.
- **Billing settings:** Smart Retries, leave past due, and the invoice emails.
- **The billing webhook endpoint.**
