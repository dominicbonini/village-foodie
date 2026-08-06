# Reference manual update — V11.3 → V11.4

**Date:** 6 August 2026. **Only `docs/reference-manual.md` was edited. No source file touched.** No `cap sync` / `next dev` / `next build`. No garbled spans in the brief.

---

# 🔴 THE HEADLINE — THREE OF THE FOUR ASSERTED MANUAL ERRORS DO NOT EXIST

The brief's highest-priority item was that **§16 records *"No FK cascade on `order_payments` — deliberate, surviving deletion of subject rows"*** and that this was false and load-bearing. **I checked before editing, and the premise does not hold.**

| Asserted error | Reality |
|---|---|
| **§16 records a "no FK cascade" claim** | 🔴 **§16 does not mention `order_payments` AT ALL.** `grep -c` over the whole section returns **0**. The attributed sentence is not there and never was |
| **The manual was wrong about the cascade** | ✅ **§27 recorded the TRUTH on 30 July 2026** — *"`order_payments` cascades on order AND truck delete … A payment record that vanishes when someone deletes the order is not a record."* **The manual was right, and even flagged it as a problem** |
| **The idempotency key was wrong in the manual** | ❌ **No.** V9.5 already records that `collectIdempotencyKey` returned a constant `collect:{order_key}`, that it swallowed every charge after the first, and that the fix is a **server-derived key plus a detector**. Correct as written |
| **The 20260701 migrations were wrong** | ❌ **No.** V8.7 already carries the correction: *"recorded-as-pending, actually applied (verified 27 July)"* |
| ✅ **The paired-op collapse** | ✅ **GENUINE — the one real error of four.** §27 stated *"The offline outbox collapses paired ops"*. **Refuted and corrected in place** |

## What IS defective, and it is a different thing

**One ambiguous CHANGELOG phrase** in the V9.5 entry:

> `order_payments` (integer minor units only, idempotency key, RLS-no-policy, **no FK cascade concerns pending — see §27**)

That parses either as *"no FK-cascade concerns; pending"* or *"no FK cascade; concerns pending"*. **Corrected in place**, and it now states the two cascades explicitly.

🔴 **So the lesson is NOT "the manual was wrong four times."** The manual held the correct fact in §27 and a loose restatement in the changelog, and **the loose restatement was believed without anyone reading the authoritative entry.** I recorded that as the §35 invariant rather than the sentence the brief asked for, because writing *"the manual was wrong four times"* into the manual — when three of the four are demonstrably not — would be doing the exact thing this version exists to correct.

⚠️ **I have not softened the consequence.** The `order_payments` cascade genuinely did mean a hard delete of a real truck silently destroyed six years of accounting records and reported success. That is recorded in §16, in the strongest terms, with the `lib/delete-truck.ts` mechanism named.

---

# 🔴 INTEGRITY GATE — BOTH CENSUSES

| | Before | After |
|---|---|---|
| Total characters | 1,057,893 | 1,090,133 |
| **Non-ASCII occurrences** | **6,033** | **6,292** |
| **Distinct non-ASCII** | **69** | **71** |

## ✅ ZERO CHARACTERS DROPPED

**Every one of the 69 pre-existing characters is present at the same count or higher.** No repair was needed and none was performed.

### The two new characters, both named and justified
| | | Where |
|---|---|---|
| **U+274C ❌ CROSS MARK** | +2 | The correction table in the V11.4 changelog, marking the two asserted errors that are not real |
| **U+26AA ⚪ MEDIUM WHITE CIRCLE** | +1 | The `.swift` vs `.entitlements` comparison table in §36, marking "optional" |

### Counts on the characters most at risk
```
U+00A7 §  SECTION SIGN     466 ->  489   (+23)
U+00A3 £  POUND SIGN        73 ->   77   (+4)
U+2014 —  EM DASH         3211 -> 3320   (+109)
U+00E9 é  E WITH ACUTE       3 ->    5   (+2)   ← "José" in §35 and §42
U+1F534 🔴 LARGE RED CIRCLE  152 ->  188   (+36)
U+26A0 ⚠  WARNING SIGN      179 ->  202   (+23)
```

### 🔴 The two specific watch items
- **Curly quotes: ZERO before, ZERO after.** `U+2018 / U+2019 / U+201C / U+201D` appear in neither census. None introduced.
- **Stray emoji: none.** The only new pictographs are the two above, both deliberate and both in tables.

### Already-garbled spans
**None found.** A sweep for mojibake signatures (`â€`, `Ã©`, `Ã¢`, `ï»¿`) returned nothing. Nothing was silently fixed.

---

# ⚠️ VERSION ON DISK — CHECKED FIRST, AND IT MATCHED

The file was at **V11.3** (title line, `**Version 11.3**`, and the `## V11.3 — 5 August 2026` changelog heading). **V11.4 was free**, so no entry was overwritten and no renumbering note was needed. The V11.3 entry's own warning — that it had to skip V11.2 because that number was already taken — is left standing.

---

# WHAT WAS WRITTEN

## Corrections made IN PLACE (both versions not left standing)
1. **V9.5 changelog line** — the ambiguous `order_payments` FK phrase, now stating both cascades explicitly and pointing at §16 and §27.
2. **§27's paired-op claim** — struck through and marked **REFUTED**, with the actual behaviour (`enqueue` coalesces `kind === 'stock'` only) and the consequence (a `mark_paid` / `undo_mark_paid` pair both queue and both replay, and FIFO makes that correct).

## Sections extended, not duplicated
- **§16 Database schema essentials** — the two `ON DELETE CASCADE` foreign keys with the SQL quoted; why it defeats the six-year commitment; `action_audit_log`'s zero FKs confirmed; the four applied columns; ⚠️ **`deletion_requested_by` and `deletion_last_notified_at` are on `operators`, not `trucks`** — with the note that this exact mistake was made and reported as a missing-column defect; and ⚠️ **`trucks.paused_until` recorded as DEAD**.
- **§27 Open backlog** — eleven items added under "Added V11.4".
- **§35 Cross-cutting invariants** — eleven invariants, including the unvalidated-instrument one and the read-the-section-not-the-summary one.
- **§36** — the iOS push entitlement audit, the Debug/Release split, the `BadDeviceToken` token-wipe consequence, and the 🔴 **`.swift` vs `.entitlements` inversion** table.

## New sections
**§41** Account deletion · **§42** Kitchen ticket printing (Phase A) · **§43** Legal, email and domain · **§44** Commercial model · **§45** Offline payments and the conflict signal.

---

# CONSTRAINT COMPLIANCE

✅ **Only `docs/reference-manual.md` edited.** No source file touched.
✅ **Nothing recorded as verified that the brief labelled open, unconfirmed or unbuilt.** Priming vs flush-on-connect, the amount-pinning gap, the KDS `ledgerRows` defect, ICO registration, Stripe in the provider table, the pending-deletion banner, the terms/export mismatch, and "nothing has been seen on paper" are all recorded **as open**, in the sections where a reader will meet them.
✅ **Live-verified facts are labelled as such** and dated 6 August 2026 — the four columns, the two cascades, the 63 `action_audit_log` rows, `hide_pricing` on Gusto.

⚠️ **One deliberate deviation, stated rather than hidden:** the brief's §35 invariant *"THE MANUAL WAS WRONG FOUR TIMES IN ONE SESSION"* was **not** written as given. Three of the four do not hold, and the invariant as drafted would itself have been a false provenance claim recorded in the manual. **The rule it points at is preserved and sharpened** — state provenance as read-from-the-manual, name the section you read, and verify anything load-bearing against the live schema — with the added corollary that **a changelog restatement of a schema fact is a liability, because it will be read instead of the schema section.**
