# Reference manual — V11.8 → V11.9

**Date:** 11 August 2026
**Result: 🔴 INTEGRITY GATE PASSED. Zero characters dropped, zero vanished, zero new character classes.**
**Edited only `docs/reference-manual.md`.** No source file touched. No `next dev`, no `next build`, no commit, no deploy.

---

# 🔴 FLAG — THE UPLOADED DELTA ARRIVED GARBLED

**`manual-delta-v11.9.md` is UTF-8 read as Latin-1 throughout.** Every non-ASCII character is mojibake:

| In the upload | Actually |
|---|---|
| `â` | `—` U+2014 |
| `ð´` | `🔴` U+1F534 |
| `â ï¸` | `⚠️` U+26A0 U+FE0F |
| `â` | `✅` U+2705 |
| `Â£` | `£` U+00A3 |
| `Â·` | `·` U+00B7 |
| `Ã` | `×` U+00D7 |
| `â` | `→` U+2192 |
| `â` | `–` U+2013 |

⚠️ **The content was fully legible and I decoded it. I did NOT paste those bytes into the manual** — every character written is the correct one, which is why the census below shows zero new character classes. **The manual's own garble scan is clean.** ⚠️ **Worth knowing where the corruption happened**, since the delta was generated inside this session and arrived back garbled — the round trip through the upload is the suspect, not the source.

---

## 🔴 THE INTEGRITY GATE

### Version on disk — verified FIRST

```
line 1     : HatchGrab Engineering Reference Manual · V11.8
line 9     : **Version 11.8**
footer     : HatchGrab Engineering Reference Manual · V11.8
```

✅ **V11.8 on disk, as expected. V11.9 is the correct next number and none was skipped.** ⚠️ **Three markers, not two** — the footer repeats the title verbatim; all three now read V11.9.

### Census

```
BEFORE : DISTINCT = 71   TOTAL_NONASCII = 7093
AFTER  : DISTINCT = 71   TOTAL_NONASCII = 7395   (+302)
```

### 🔴 PER-CHARACTER DIFF — every change, with its cause

| Char | | Before | After | Δ | Accounted for by |
|---|---|---|---|---|---|
| `£` | U+00A3 | 106 | 122 | **+16** | £1.50 / £0.00 / £0.50 / £3.00 in the price-book and measurement entries |
| `§` | U+00A7 | 533 | 546 | **+13** | cross-references between §5, §16, §27, §35 and §37 |
| `·` | U+00B7 | 103 | 121 | **+18** | the schema column list and the draft-table contents list |
| `×` | U+00D7 | 75 | 76 | **+1** | *"every secret × every offered `v1`"* |
| `–` | U+2013 | 69 | 70 | **+1** | *"3–5 working days"* in the refund-copy entry |
| `—` | U+2014 | 3672 | 3781 | **+109** | em dashes throughout the new prose |
| `…` | U+2026 | 64 | 70 | **+6** | truncated ids and quoted subject lines |
| `→` | U+2192 | 1175 | 1189 | **+14** | the price-provenance chains and the three-tier arrows |
| `⚠` | U+26A0 | 275 | 306 | **+31** | warning markers |
| `️` | U+FE0F | 274 | 305 | **+31** | ⚠️'s variation selector — **exactly matches ⚠, as it must** |
| `✅` | U+2705 | 34 | 43 | **+9** | proven / discharged / decided markers |
| `🔴` | U+1F534 | 346 | 399 | **+53** | critical markers |

```
characters that DROPPED           : 0
characters that VANISHED entirely : 0
NEW character classes             : 0
```

🔴 **Every delta is an INCREASE, DISTINCT is unchanged at 71, and the ⚠/U+FE0F pairing is exact (+31 / +31)** — the one ratio worth checking by hand, and it holds.

**Garble scan of the manual:** 0 × U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` / `ð´` / `â ï¸`.

**Length:** 6978 → 7263 lines (**+285**).

---

## The dedupe pass — run BEFORE editing, as the delta instructed

The delta warned that the file had moved and that a duplicate entry is worse than a missing one. I grepped nineteen markers first:

| Marker | Hits before | Action |
|---|---|---|
| `validateOrderTotals`, `order-repricing`, `optionPrice`, `online_payments_paused_at`, `Invalid signature`, `parseSigningSecrets`, `canCancel`, `adjust_slot`, `Adjust time` | **0** | new — added |
| 🔴 `resolveAutoAcceptSlot` | **1** | **CORRECTED IN PLACE** |
| 🔴 `payment_status` CHECK "migration-sourced" caveat | **1** | **DISCHARGED IN PLACE** |
| `charge-at-order vs auth-at-order` OPEN item | **1** | **CLOSED IN PLACE** |
| *"the abandonment problem disappears"* | **1** | **NARROWED IN PLACE** |
| `stripe_webhook_events`, `deleteTruckCascade`, `online_ordering_pay_at_hatch`, `item_modifier_groups`, `Brevo`, `notes_require_review`, `place_order_atomic` | already present | extended, not duplicated |

✅ **Four things were corrected in place rather than appended. Nothing was recorded twice.**

---

## 🔴 CORRECTED IN PLACE — not appended

### 1. §5 — `resolveAutoAcceptSlot` does not exist

**The five existing bullets were KEPT, not deleted**, because they correctly describe the slot-capacity arm — which lives in `placeOrderInSlotLocked`. A correction block beneath them names the missing symbol, gives the **inline block at `submit/route.ts:838-880`**, and adds the **six-row outcome table** with the four further routes to `pending` that §5 never listed.

⚠️ **Deleting the old bullets would have been wrong**: someone who read them and went looking for the function needs to find them *and* be told what they actually describe.

### 2. §16 — the `payment_status` CHECK caveat is DISCHARGED

A ✅ line now sits **above** the original caveat recording the live `pg_get_constraintdef` read and all six values. **The caveat is kept** as the record of how the fact was open and what settled it.

### 3. §37 — the charge-at-order OPEN item is CLOSED

Prefixed with ✅ **DECIDED V11.9** pointing at the new decision block, **with the original wording retained** so the reasoning that produced the decision is still readable.

### 4. §37 — the abandonment property is NARROWED

A blockquote directly beneath the original ✅ claim records that it holds **only for the window before the order exists**, and that capture-at-approval creates *"an order created, authorized, and never approved"* — money self-heals at 7 days, the order does not.

---

## What was added, and where

| # | Location | Change |
|---|---|---|
| 1 | lines 1, 9, footer | **V11.8 → V11.9**, all three |
| 2 | Changelog | 🆕 **`## V11.9 — 11 August 2026 (afternoon)`** — five sub-blocks plus the deployment record |
| 3 | **§5 Order management** | 4 corrections/additions + 🆕 **a full pricing subsection** |
| 4 | **§16 Database schema** | 1 discharge + 🆕 4 blocks (`stripe_webhook_events` real columns, `trucks.online_payments_paused_at`, `total_minor`, orphaned demo rows) |
| 5 | **§27 Open backlog** | 🆕 **`## 🔴 V11.9 — added 11 August 2026 (afternoon)`**, thirteen items, placed FIRST |
| 6 | **§35 Invariants** | 🆕 **eight new invariants**, placed first |
| 7 | **§37 Payments** | 1 closure + 1 narrowing + 🆕 6 subsections |

### ⚠️ ONE JUDGEMENT CALL, NAMED

**The delta headed the pricing block *"§31 / pricing"*. §31 is the Slot & Capacity Engine — pricing has no business there.** I placed it in **§5 Order management** instead, since it concerns what a customer is charged and the code lives in `lib/order-*`, and said so in the block's own provenance note with a pointer from §37. **If you would rather it sat in §37, it is one contiguous subsection and moves as a block.**

---

## ⚠️ THE BUILT / PROVEN / UNBUILT LINE — held throughout

Every new claim carries its status where it could be misread:

| Claim | As written |
|---|---|
| The price-book re-key | **BUILT AND DEPLOYED** in `6fd4b97`, with the live figures underneath |
| `validateOrderTotals` inert | **PROVEN BY EXECUTION**, not inferred |
| The 10 August ledger row | 🔴 **NOT CORROBORATED** — two readings, **both INFERRED**, and *"Not established which"* stated outright |
| Capture-follows-confirmation | **DECIDED**, not built — and the four capture sites named |
| The draft table | **DESIGN**, with *"still unspecified: what fires step 2"* left open |
| `moveSlotBooking`'s discarded result | **INFERRED**, labelled inline |
| Deals / discount arms | 🔴 **ZERO historical coverage** — confidence must come from a constructed test |
| The menu-load failure | **NOT DIAGNOSED**, with candidates listed |

✅ **The V11.8 claim that a sandbox card payment works end to end is contradicted rather than quietly dropped** — the git evidence is quoted, and the consequence for the authorize-then-capture scope (*"an unfinished path being completed, not a working path being replaced"*) is stated where someone planning that work will meet it.

---

## Verification

```
$ sed -n '1p;9p' + tail -1        → V11.9 · Version 11.9 · V11.9
$ wc -l docs/reference-manual.md  → 6978 → 7263 (+285)
$ census before/after             → DISTINCT 71 → 71 · TOTAL 7093 → 7395
$ per-character diff              → 0 drops, 0 vanished, 0 new classes
$ garble scan                     → 0 hits
$ git status --porcelain docs/    → reference-manual.md and this report only
```

✅ **No source file was touched.** ✅ **No build, dev server or cap sync was run.**
