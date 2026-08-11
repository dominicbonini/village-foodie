# Reference manual — V11.7 → V11.8

**Date:** 11 August 2026
**Result: 🔴 INTEGRITY GATE PASSED. Zero characters dropped, zero vanished, zero new characters introduced.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

**Edited only `docs/reference-manual.md`.** No source file touched. No cap sync, no `next dev`, no `next build`.

---

## 🔴 THE INTEGRITY GATE

### Version on disk — verified FIRST

```
line 1  : HatchGrab Engineering Reference Manual · V11.7
line 9  : **Version 11.7**
```

✅ **V11.7 on disk, as the prompt expected. V11.8 is the correct next number and none was skipped.**

⚠️ **Three version markers, not two.** Line 1 (title), line 9 (front matter) **and line 6713 (footer)** — the footer repeats the title verbatim. All three now read V11.8; a missed footer would have left the document disagreeing with itself.

### Census BEFORE

```
DISTINCT = 71      TOTAL_NONASCII = 6867
```

### Census AFTER

```
DISTINCT = 71      TOTAL_NONASCII = 7093      (+226)
```

### 🔴 PER-CHARACTER DIFF — every change, with its cause

| Char | | Before | After | Δ | Accounted for by |
|---|---|---|---|---|---|
| `£` | U+00A3 | 104 | 106 | **+2** | £1,500 / £2,000 in the platform-fee section |
| `§` | U+00A7 | 529 | 533 | **+4** | four cross-references to §37 |
| `·` | U+00B7 | 96 | 103 | **+7** | the six-state list and table separators |
| `×` | U+00D7 | 74 | 75 | **+1** | *"50 keys × 500 chars"* (Checkout metadata limit) |
| `–` | U+2013 | 68 | 69 | **+1** | *"3–5 working days"* in the cancellation-email backlog item |
| `—` | U+2014 | 3587 | 3672 | **+85** | em dashes throughout the new prose |
| `…` | U+2026 | 63 | 64 | **+1** | an ellipsis inside a quoted Stripe sentence |
| `→` | U+2192 | 1168 | 1175 | **+7** | *"false → true"*, *"V11.7 → V11.8"*, table arrows |
| `⚠` | U+26A0 | 250 | 275 | **+25** | warning markers in the new sections |
| `️` | U+FE0F | 249 | 274 | **+25** | ⚠️'s variation selector — **exactly matches ⚠, as it must** |
| `✅` | U+2705 | 28 | 34 | **+6** | proven-by-probe markers |
| `🔴` | U+1F534 | 284 | 346 | **+62** | critical markers in the new sections |

```
characters that DROPPED           : 0
characters that VANISHED entirely : 0
characters NEWLY introduced       : 0
```

🔴 **Every single delta is an INCREASE, every increase is a character I typed, and DISTINCT is unchanged at 71 — so no character class was lost and none was invented.**

✅ **The ⚠/U+FE0F pairing is exact (+25 / +25).** A mismatch there is the classic sign of an emoji being split or half-pasted; it is the one ratio worth checking by hand, and it holds.

### Garble scan

| Check | Result |
|---|---|
| U+FFFD replacement character | **0** |
| Classic UTF-8-as-Latin-1 mojibake (`Â£`, `â€`, `Ã©`, `â–`, `ðŸ`) | **none found** |

✅ **No pre-existing garbled span was found, so none needed flagging and nothing was silently repaired.**

---

## What changed, and where

| # | Location | Change |
|---|---|---|
| 1 | lines 1, 9, footer | **V11.7 → V11.8**, all three markers |
| 2 | Changelog | 🆕 **`## V11.8 — 11 August 2026`** — the v2 move, the inversion, the real payment, the corrections |
| 3 | Top summary, *STRIPE — the foundation is proven* | 🔴 **CORRECTED IN PLACE** |
| 4 | §37 | 🆕 **six new subsections** (below) |
| 5 | §35 Cross-cutting invariants | 🆕 **five new invariants, placed first** |
| 6 | §27 Open backlog | 🆕 **`V11.8 — added 11 August 2026 (Stripe payments)`**, eleven items |

### The six new §37 subsections

```
5998  ## 🔴 STRIPE CONNECT ON ACCOUNTS V2 — BUILT AND PROVEN (V11.8)
6060  ## 🔴 AUTHORIZE-THEN-CAPTURE — PROVEN, NOT BUILT (V11.8)
6120  ## WHAT IS BUILT ON THE PAYMENT PATH TODAY (V11.8)
6138  ## 🔴 THE PLATFORM FEE — BLOCKED, AND BY MORE THAN A COUNTER (V11.8)
6159  ## 🔴 RADAR — a per-transaction cost nobody chose (V11.8)
6173  ## THE PAYMENTS TAB (V11.8)
```

⚠️ **They are placed BEFORE the V11.5 `## Stripe — what is actually built` block, with a pointer at the top** telling the reader those subsections record the v1 design and that **where they disagree, V11.8 is current.** The v1 material is **kept, not deleted** — the inversion between the two versions is itself the lesson.

---

## 🔴 CORRECTED IN PLACE — not appended

**The top summary carried this, and it is now the v1 spelling of our position rather than the current one:**

> *"We want the defaults: `losses.payments` **stripe**, `fees.payer` **account**, `requirement_collection` **stripe**, `stripe_dashboard.type` **full**."*

**A line was added immediately beneath it** recording that v2 writes the same position as **`fees_collector: 'stripe'`**, that **v2 has no `'account'` value**, and that the nearest-looking token means **HatchGrab pays**.

⚠️ **The original line was NOT deleted, deliberately.** Someone reading a v1 example on Stripe's site needs to find our v1 spelling and be told what it became — deleting it would leave them translating the inversion themselves, which is the exact mistake the entry exists to prevent.

**Two other in-place corrections in the same block:**

| Was | Now |
|---|---|
| *"`operators` (13 columns, **no `stripe_*` today**)"* | **APPLIED V11.8** — the three columns named |
| *"**UNBUILT:** onboarding, PaymentIntents, the customer payment path…"* | **BUILT SINCE (V11.8):** onboarding, the Payments tab, a real sandbox card payment. **STILL UNBUILT:** refunds, Terminal, Locations, subscription billing, the platform fee |

---

## ⚠️ THE BUILT / PROVEN / UNBUILT LINE — held throughout

**The prompt's constraint was that nothing labelled open, unproven or unbuilt may be recorded as verified. Every new subsection carries its own status in its heading**, and the two that are not built say so before their first sentence:

| Subsection | Status as written |
|---|---|
| Accounts v2 | **BUILT AND PROVEN** — probe results with their evidence |
| Authorize-then-capture | 🔴 **PROVEN, NOT BUILT** — with a blockquote: *"NOTHING IN THIS SUBSECTION IS BUILT. The Stripe behaviour is measured; the design is agreed; the code does not exist."* |
| The payment path today | **BUILT** — a real sandbox payment, zero migrations |
| The platform fee | 🔴 **BLOCKED** |
| Radar | ⚠️ **UNRESOLVED** on the platform cost; **CORRECTED** on who can change a tier |
| The Payments tab | **BUILT** |

✅ **The Radar per-connected-account cost is recorded as UNRESOLVED with the two Dashboard reads that would settle it** — not as a finding. **The per-transaction figure is recorded as still hidden**, not guessed.

---

## Standing alone — the test the prompt set

**This was written so a fresh planning chat can continue without the conversation.** Concretely, someone reading §37 cold now finds:

- the **exact version string** and that it will move;
- the **four posture properties**, which one is computed, and 🔴 **which one inverts and what the wrong value costs**;
- **what was proven by probe versus inferred**, with the evidence inline (`balance_transaction: null`, zero refund objects, 7.00 days);
- 🔴 **the traps**: `charge.status` reading `succeeded` uncaptured, the `@accounts` scope, the empty merchant configuration, the frozen country, the two-layer test-money exclusion;
- **why Checkout over Payment Element**, and what swapping later would cost;
- **the fee's three missing inputs** and why omitting it is safe;
- **the one thing blocking live mode entirely** — Site links — at the top of the backlog.

---

## Verification

```
$ node census.mjs docs/reference-manual.md   (before)  DISTINCT=71  TOTAL=6867
$ node census.mjs docs/reference-manual.md   (after)   DISTINCT=71  TOTAL=7093
$ per-character diff → 0 drops, 0 vanished, 0 new characters

$ sed -n '1p;9p' + tail -1   → V11.8 · Version 11.8 · V11.8
$ wc -l docs/reference-manual.md  → 6713 → 6978 lines (+265)
$ git status --porcelain docs/    → only reference-manual.md and the two report files
```

✅ **No source file was touched.** ✅ **No build, dev server or cap sync was run.**

---

## One judgement call worth naming

⚠️ **I put the five new invariants FIRST in §35 rather than appending them.** The section opens with a CSS-overlay lesson; the new entries are money-path and API-semantics invariants and are the ones most likely to be needed by whoever opens this next. **If you would rather §35 stayed chronological, they are five contiguous paragraphs at the top of the section and move as a block.**
