# Reference manual update — V11.5 → V11.6

**Date:** 10 August 2026
**File edited:** `docs/reference-manual.md` — **and nothing else.**
**Prompt integrity:** nothing arrived garbled; no span needed reconstruction.

---

## 🔴 INTEGRITY GATE — PASSED, ZERO DROPS

| | Before | After | Δ |
|---|---|---|---|
| Bytes | 1,140,730 | 1,166,855 | +26,125 |
| Characters | 1,128,167 | 1,153,910 | +25,743 |
| Lines | 6,431 | 6,588 | +157 |
| **Distinct non-ASCII characters** | **71** | **71** | **0** |
| **Total non-ASCII occurrences** | **6,538** | **6,728** | **+190** |

```
🔴 CHARACTERS WHOSE COUNT DROPPED:      0
🔴 CHARACTERS THAT VANISHED ENTIRELY:   0
   NEW CHARACTERS INTRODUCED:           0
   counts UNCHANGED:                    59 characters
   counts ROSE:                         12 characters
```

**No character's count fell, so there is nothing to explain away and nothing to repair.** All 71 distinct non-ASCII characters present before are present after, at counts equal or higher. No character was introduced that the file did not already use — every glyph I typed was drawn from the existing vocabulary.

### The twelve that rose, each attributable to added prose

| Char | Before → After | Why |
|---|---|---|
| `—` U+2014 | 3441 → 3526 (+85) | em dashes in the new changelog, §35 invariants, §37 and §45 subsections |
| `→` U+2192 | 1158 → 1161 (+3) | `Manage → Settings`, resolution arrows |
| `§` U+00A7 | 509 → 526 (+17) | cross-references to §9, §27, §30, §35, §37, §45 |
| `🔴` U+1F534 | 228 → 259 (+31) | the corrections and the five new invariants |
| `⚠` U+26A0 | 226 → 239 (+13) | caveats on the corrections |
| `️` U+FE0F | 225 → 238 (+13) | **exactly matches the ⚠ rise** — every warning sign I added carries its variation selector |
| `£` U+00A3 | 82 → 96 (+14) | £1,050.40, £25, £13.50, £X.XX |
| `–` U+2013 | 65 → 68 (+3) | the `7–10 August` en-dash ranges |
| `−` U+2212 | 40 → 42 (+2) | the `−186,640` minus signs |
| `✅` U+2705 | 21 → 28 (+7) | items marked DONE in §27 and §45 |
| `💳` U+1F4B3 | 6 → 7 (+1) | the Cash/Card row in the §37 button matrix |
| `💷` U+1F4B7 | 6 → 7 (+1) | same row |

**Emoji integrity confirmed separately.** `⚠` and its VS16 rose by the same 13, and a direct scan shows **paired 232, bare 7** — with **bare 7 in the pre-edit file too**. Every `⚠️` I wrote is a complete pair; the 7 unpaired ones are pre-existing and untouched.

**Mojibake scan: 0 before, 0 after.** No `U+FFFD`, no `Ã`/`â€`/`Â` signatures. **No already-garbled span was found, so none was flagged and none was silently fixed.**

### Version on disk — verified first, as instructed

The file read **V11.5** in all three markers (title line 1, `**Version 11.5**` line 9, footer line 6430). **V11.6 is therefore the correct next number and no number was skipped** — recorded in the changelog entry itself. All three markers updated.

### Only the manual was touched

`docs/reference-manual.md` mtime **14:21:05** (this task). Every source file in `git status` carries an mtime from **earlier tasks in this session** — `lib/payments/ledger.ts` 11:44, `app/api/dashboard/action/route.ts` 13:45, `components/dashboard/OrderCard.tsx` 14:02, `app/dashboard/[token]/page.tsx` 14:04, `lib/payments/paid-step.ts` 13:28 — all before this task began. **No source file was edited, and no cap sync, `next dev` or `next build` was run.**

⚠️ **One provenance note on the baseline.** The census-before was taken from the **file on disk**, not from `git HEAD` — the manual already had uncommitted V11.5 content (HEAD shows 219 paired `⚠️` against the disk file's 225). The on-disk state is the correct comparison basis for "did I corrupt anything", and it is what both censuses used.

---

## What changed, section by section

### 1. 🔴 The 7 August incident — corrected in place, in four locations

The claim that Gusto lost an afternoon's takings is corrected **everywhere it appears**, not just once:

| Location | What it said | What it says now |
|---|---|---|
| **V11.5 changelog**, incident bullet | *"every collection from 14:24 recorded £0"* | The verification: **17 in-window collections all carry correct ledger rows**, **100% coverage since 31 July**, **117 uncovered orders predate the ledger table**, one residue row (#1, `refund_due`, **£1,050.40** against a **£25 cancelled** order) that `recalcOrderPayment` will converge |
| **§37**, the two-symptom table | table row + severity | Row corrected, plus a correction block beneath it |
| **§35**, the quiet-path invariant | *"an afternoon's takings recorded £0"* | *"a collection could record £0"*, with the correction stated inline |
| **§27** backlog, *"RECONSTRUCT GUSTO'S 7 AUGUST COLLECTIONS"* | a live recovery task | **✅ CLOSED — there is nothing to reconstruct** |

**Written accurately, not dramatically**, in the terms you gave: *"The bug was real and the mechanism was real. It could have lost money and did not, because the operator completed every order and took payment themselves."*

🔴 **The §35 money-path invariant is UNCHANGED**, and now carries an explicit note saying why: *"It was earned by the MECHANISM, not by the damage… Do not weaken this entry because the outcome was survivable; it was survivable because the operator took the payments by hand."*

### 2. 🔴 Gusto's configuration — corrected in five locations

`show_paid_step` is **TRUE**, three of twelve trucks are:

- **V11.5 incident bullet** — said `false`
- **V11.5 KDS bullet** — the "latent" reasoning rested on it
- **§9 KDS section** — *"It was LATENT, not harmless. Gusto has `show_paid_step` false"* → **now leads with "IT WAS LIVE, NOT LATENT"**
- **§37 table's second column** — said `false`, plus a note that the two rows are therefore **the same configuration**, and what actually separated the symptoms was **which action the operator reached for**
- **V9.4 changelog**, *"(default false — Gusto unaffected)"* — the column default is preserved as a fact; the "Gusto unaffected" clause is marked wrong

**Recorded as a §35 invariant:** *a truck's configuration is live-schema truth*, naming all four wrong premises across 7–10 August.

### 3. The `readLedger` fix — recorded in §35 and §27

Both filters, the replace-versus-add lesson, and the live-database numbers (1 row vs 83; `balanceMinor` 0 where the bug gave −186,640; £13.50 exact). **The inert first draft of the scope assertion is recorded as its own invariant** — §8 below.

### 4. `paymentWarning` — new §45 subsection

Three surfacing routes, the load-bearing `AND` (**145 of 221**, **117 of them Gusto's**), the 395-order zero-false-positive result, the outbox-drain path no toast can reach, the correction that it **is** on Gusto's path, and the residual gap when both writes fail.

### 5. The PAID chip — new §37 subsection

Order-keyed; the **specific hole recorded so the argument cannot be re-made** (default ON + event override OFF, six fully-paid `test-kitchen` orders); the remove-payment modal accepted with all three reasons; `hidePayments` retained as per-device.

### 6. Completion presses — new §37 subsection

Shape B on robustness grounds, both columns with their verified backfill (3/9 trucks, 93 of 95 events inherit, 0 change), the asymmetric deploy order with the 42703 → `orders: []` mechanism, the payment-state-first button rule with its full matrix, one-press-equals-one-op, and `takes_cash`'s two parents with the single-parent-notation reason for dropping the indent.

### 7. 🔴 The override one-way door — §27, recorded as OPEN

Handlers accept NULL and 400 otherwise (**verified**); 92–93 of 95 events hold NULL; **nothing sends it**; `test-truck`'s 2026-08-10 event is stuck now; two lines and no migration to restore. **Nothing here is recorded as verified that you labelled open** — the entry says what was verified (the handlers) and what is broken (the UI route).

### 8. §35 — five invariants added

- 🔴 **A guard that cannot see what it checks is worse than no guard** — the inert scope assertion, and *"nobody re-checks a guard that is already there"*
- 🔴 **A control must branch on the order, not on the truck setting** — three instances in one day
- 🔴 **Test the post-migration state, not only the pre-migration one**
- 🔴 **A truck's configuration is live-schema truth** — four wrong premises
- **When one surface is fixed, check its siblings** — three instances, including the stock-badge `bound` defect

### 9. §27 backlog — reconciled

**Removed as done:** the `readLedger` fix, `paymentWarning` surfacing, the KDS `ledgerRows` defect (in **both** places it appeared — §27's list and the §45 tail), and the *"truck-level defaults with a per-event override"* design item.
**Added:** the override reset.
**Kept open, verbatim:** Stripe Connect onboarding and everything after it, the collect idempotency key swallowing a legitimate second charge, the stock-badge `bound` defect, *"Only 1 pizzas left!"* pluralisation, `hide_pricing` masking footnote 2 only, Apple Developer enrolment.

---

## Structural check

- Version markers: **3 of 3** updated (title, `**Version 11.6**`, footer).
- Top-level `#` headings: **44**, unchanged.
- `# Changelog` → `## V11.6 — 10 August 2026` → `## V11.5 — 7 August 2026`: correct order, V11.5 intact beneath.
- No section was deleted, renumbered or reordered. Every change is an in-place correction or an extension of an existing section — no new top-level section was created.

**Integrity gate: PASSED. Zero character-count drops, zero vanished characters, zero mojibake, no already-garbled span found.**
