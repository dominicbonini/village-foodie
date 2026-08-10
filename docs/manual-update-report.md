# Reference manual update — V11.4 → V11.5

**Date:** 7 August 2026
**File edited:** `docs/reference-manual.md` — **and no other file.** No source file was touched.
**Not run, per the constraints:** `npx cap sync`, `next dev`, `next build`.

---

## 🔴 INTEGRITY GATE — PASSED

### Version verification (before editing)

**On disk was V11.4**, as the brief expected — confirmed at three sites (`HatchGrab Engineering Reference Manual · V11.4` line 1, `**Version 11.4**` line 9, and the same title as the footer line 6187), with `## V11.4 — 6 August 2026` as the newest changelog entry. **V11.5 was therefore the correct next number and no entry was overwritten.**

### Non-ASCII character census

| | BEFORE | AFTER | Δ |
|---|---|---|---|
| Total non-ASCII characters | **6,292** | **6,589** | +297 |
| Distinct non-ASCII characters | **71** | **71** | 0 |
| Characters | 1,090,133 | 1,105,646 | +15,513 |
| Bytes (UTF-8) | 1,102,189 | 1,118,891 | +16,702 |
| Lines | 6,188 | 6,431 | +243 |
| Numbered sections (`# N.`) | **44** | **44** | **0** |

### 🔴 Characters that DROPPED

```
=== CHARACTERS THAT DROPPED (must be zero, or each named) ===
NONE — no non-ASCII character decreased in count.

=== unchanged: 60 distinct characters ===
=== increased: 11 distinct characters ===
```

**Zero drops. Nothing to report as corruption.** All 71 distinct non-ASCII characters that existed before still exist, at the same count or higher.

### The 11 characters that increased — all accounted for

| Char | Codepoint | Before → After | Δ | Accounted for by |
|---|---|---|---|---|
| `—` | U+2014 EM DASH | 3,320 → 3,441 | **+121** | prose throughout the new entries |
| `🔴` | U+1F534 | 188 → 228 | **+40** | incident, invariants, Connect trap, backlog |
| `⚠` | U+26A0 | 202 → 226 | **+24** | caveats throughout |
| `️` | U+FE0F VS-16 | 201 → 225 | **+24** | **exactly pairs the +24 `⚠`** — see below |
| `§` | U+00A7 | 489 → 509 | **+20** | cross-references (§9, §16, §27, §30, §35, §36, §37, §44) |
| `→` | U+2192 | 1,152 → 1,158 | +6 | `127 → 417`, `unpaid → Mark paid`, table arrows |
| `£` | U+00A3 | 77 → 82 | +5 | `£0`, `£25`, `£29/£49`, `£1,500/£2,000` |
| `–` | U+2013 EN DASH | 63 → 65 | +2 | `3–4 times`, `14:24 to ~19:00` ranges |
| `✓` | U+2713 | 59 → 61 | +2 | the Done-strip `✓ paid` literal, quoted twice |
| `…` | U+2026 | 61 → 62 | +1 | an elided quotation |
| `⇒` | U+21D2 | 14 → 15 | +1 | `no default ⇒ omission is a loud 23502` |

**Variation-selector integrity check:** VS-16 rose by exactly the same count as `⚠` (+24 each), and 219 of the 225 VS-16 occurrences directly follow U+26A0. The remaining 6 follow other emoji that take a selector (`✏ ⏸ ▶ ⚙ ❗ ↩`). **No orphaned or stripped selectors.**

**Mojibake scan:** `â€`, `Ã©`, `Ã¢`, `ï¿½` and U+FFFD REPLACEMENT CHARACTER — **zero occurrences**, before and after. (U+FFFD does not appear in either census.)

### Every deleted line, named

The diff is **+248 / −5**. All five deletions are deliberate, and each is a replacement rather than a removal:

| # | Deleted line | Why |
|---|---|---|
| 1 | `HatchGrab Engineering Reference Manual · V11.4` (line 1) | → V11.5, document header |
| 2 | `**Version 11.4**` (line 9) | → V11.5 |
| 3 | `HatchGrab Engineering Reference Manual · V11.4` (line 6187) | → V11.5, document footer |
| 4 | `Footnotes (held in lib/plan-features.ts as PLAN_FOOTNOTES): (1) …` | **fact corrected in place** — *"Apple iPad recommended"* removed from footnote 4, with a `[CORRECTED V11.5]` note stating why and preserving the original wording |
| 5 | `> **STATUS: NOTHING IS BUILT.** There is no Stripe account, no Stripe SDK dependency, no `STRIPE_*` env var, no webhook route…` | **superseded in place** — replaced with a `[SUPERSEDED V11.5]` block that **quotes the old claim**, says which half is now false, and keeps the half that is still true (`no Stripe SDK dependency`, `no stripe_* column on operators`) |

**No changelog entry was overwritten. No section was deleted. No section was created** — section count is 44 before and after.

### ⚠️ Already-garbled spans found: NONE

I looked for replacement characters, double-encoded UTF-8, orphaned variation selectors and truncated emoji sequences. **The file was clean before my edits and is clean after.** Nothing was silently repaired because there was nothing to repair.

---

## Placement — extended, never paralleled

Every item went into an **existing** section. The brief's material mapped as follows:

| Brief item | Placed in | Why there |
|---|---|---|
| **1. The payment incident** | **§37 Payments** — new subsections *"🔴 THE 7 AUGUST INCIDENT"* and *"Recovery"*, at the top of the section | §37 is the payments section; an incident post-mortem extends it. Also the lead entry in the V11.5 changelog. |
| **1. The invariant** | **§35 Cross-cutting invariants** | Where the brief directed it |
| **2. Stripe webhook + Connect model** | **§37** — new subsections *"Stripe — what is actually built"* and *"The Connect model — DECIDED"* | Same section; the old *"NOTHING IS BUILT"* line corrected in place directly above |
| **2. `livemode` / `stripe_webhook_events`** | **§16 Database schema essentials** — new *"Payments-mode columns (V11.5)"* | Schema facts belong in the schema section, not a changelog restatement — §35's own lesson |
| **3. KDS payment state** | **§9 KDS rules** — new *"Payment state on the KDS (V11.5) — fixed"* | §9 is the KDS section |
| **4. Stock display** | **§30 Per-event stock** — new *"Stock DISPLAY — the pooled-ceiling attribution problem"* | §30 already owns the sparse-override model this sits on |
| **5. Landing copy** | **§44 Commercial model** — new *"hide_pricing masks footnote 2 ONLY"* and *"Landing copy — the repetition pass and the editorial rules"*; **§4** footnote list corrected in place | §44 already holds `hide_pricing` and the fee/footnote material |
| **6. §35 invariants** | **§35** — five new entries | As directed |
| **7. §27 backlog** | **§27** — new *"🔴 Added V11.5"* block | As directed |

**Two facts were corrected IN PLACE rather than appended**, per the brief: §37's *"NOTHING IS BUILT"* status line, and §4's footnote 4 iPad recommendation. Both retain the superseded wording so a reader can see what changed and why.

---

## What was written

### §37 — the incident (written first, as instructed)

The commit, the timestamp, the exact diff of the deleted `.eq('order_key', orderKey)`, and the mechanism: whole-table sum → negative `balanceMinor` → the `<= 0` short-circuit → **no row, no error, and `chargedMinor: 0` returned as success**, so the fail-open `catch` never fired and no `paymentWarning` was set.

**The two symptoms are recorded in a table with the severity ranking explicit** — Test Kitchen LOUD (board stopped, reported in minutes) versus **Gusto SILENT (£0 recorded all afternoon, no error)** — and the brief's point that the visible one was the less serious is stated as the header of that comparison rather than buried.

**The rollback and the non-deployment are both recorded as decisions**, including *why* not deploying the one-line fix that evening was correct: *"promoting a known-good build and shipping a new one are different acts with different risk."*

**Recovery is recorded so Monday does not re-derive it:** rows were removed not altered ⇒ each shortfall is that order's own `total_minor` ⇒ **arithmetic, not forensic**; the seven queries in `docs/payments-damage-report.md`; `action_audit_log` as the durable evidence with its `charged_minor = 0` + `ledger_failed = false` signature; and both evidence-destroyers (`undo_collected` clearing `paid_at` **and** `collected_at`, the hourly demo-cleanup cron).

### §35 — five new invariants

1. 🔴🔴 **Exercise money code against real database rows** — the strongest, carrying Cursor's own quoted account and the specific reason `tsc`/lint could not catch it (the deleted filter left `orderKey` referenced in the error string, so it was never "unused").
2. 🔴 **A silent failure on a quiet path beats a loud one on a busy path, in danger.**
3. 🔴 **Following a vendor quickstart verbatim can invert your commercial position.**
4. **When one surface is right and another wrong, the fix is usually the discarded field.**
5. 🔴 **Run Cursor's migration file, never a retyped version** — with the four-vs-nine-column reconstruction and the hour of 500s.

### Verified vs open — held to the brief's own labels

Recorded as **proven**: the webhook endpoint (four events, four 200s, four rows, `livemode` false), the 15 HMAC vectors, `order_payments.livemode` applied with 50 rows all true, the KDS fix, the Stripe-Locations finding.

Recorded as **decided but unbuilt**: the Connect model and its controller properties.

Recorded as **open/unbuilt/awaiting**, never as done: the `readLedger` fix (**explicitly "not applied"**), Gusto's reconstruction, onboarding, PaymentIntents, refunds, Terminal, Locations, subscription billing, the stock-badge `bound` defect, the pluralisation bug, the operator threshold tier, `hide_pricing`'s magic string, the collect idempotency-key collision, and **Apple Developer enrolment ("requested, awaiting confirmation" — with the Xcode build block stated as a consequence, not as a completed step)**.

**Nothing the brief labelled open, unconfirmed or unbuilt is recorded as verified.**

---

## Constraints — all held

| Constraint | Status |
|---|---|
| Edit **only** `docs/reference-manual.md` | ✅ `git status` shows it as the only modified tracked source-of-record file; the other entries are this report and the two report files from earlier tasks today |
| Touch no source file | ✅ zero files under `app/`, `lib/`, `components/`, `supabase/` |
| Nothing open/unbuilt recorded as verified | ✅ see above |
| No `cap sync`, `next dev`, `next build` | ✅ none run |
| Extend existing sections, don't parallel them | ✅ section count 44 → 44 |
| Correct wrong facts in place | ✅ two, both with superseded wording preserved |
| Character census before and after | ✅ above — **zero drops** |
| Flag garbled spans, don't fix | ✅ **none found** |

## ⚠️ Nothing in the prompt arrived garbled

The brief was complete and internally consistent. One thing I resolved by judgement rather than instruction: *"§ wherever landing copy lives"* — landing copy has no dedicated section, so the material went to **§44** (which already owns `hide_pricing`, `CARD_FEES` and the footnote machinery) with the footnote-content correction made in **§4** where the footnote list itself is transcribed.
