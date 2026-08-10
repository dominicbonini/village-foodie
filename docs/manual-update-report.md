# Reference manual update — V11.6 → V11.7

**Date:** 10 August 2026
**File edited:** `docs/reference-manual.md` — **and nothing else.**
**Prompt integrity:** nothing arrived garbled; no span needed reconstruction.

---

## 🔴 INTEGRITY GATE — PASSED, ZERO DROPS

| | Before | After | Δ |
|---|---|---|---|
| Bytes | 1,166,855 | 1,183,295 | +16,440 |
| Characters | 1,153,910 | 1,170,058 | +16,148 |
| Lines | 6,588 | 6,714 | +126 |
| **Distinct non-ASCII characters** | **71** | **71** | **0** |
| **Total non-ASCII occurrences** | **6,728** | **6,867** | **+139** |

```
🔴 CHARACTERS WHOSE COUNT DROPPED:      0
🔴 CHARACTERS THAT VANISHED ENTIRELY:   0
   NEW CHARACTERS INTRODUCED:           0
   counts UNCHANGED:                    58 characters
   counts ROSE:                         13 characters
```

**No character's count fell**, so there is nothing to explain away and nothing to repair. All 71 distinct non-ASCII characters present before are present after at equal or higher counts, and **no glyph was introduced that the file did not already use.**

### The thirteen that rose, each attributable to added prose

| Char | Before → After | Why |
|---|---|---|
| `—` U+2014 | 3526 → 3587 (+61) | em dashes across the new changelog, §10 subsection, §43 block and four §35 invariants |
| `→` U+2192 | 1161 → 1168 (+7) | `Manage → Settings`, `Save` → `Connect`, the role/route tables |
| `§` U+00A7 | 526 → 529 (+3) | cross-references to §27, §35, §43 |
| `🔴` U+1F534 | 259 → 284 (+25) | the inversion, the safety rule, the legal placement, the new invariants |
| `⚠` U+26A0 | 239 → 250 (+11) | caveats and corrections |
| `️` U+FE0F | 238 → 249 (+11) | **exactly matches the ⚠ rise** — every warning sign added carries its variation selector |
| `£` U+00A3 | 96 → 104 (+8) | `Take payment £10.00`, `Confirm order £10` |
| `·` U+00B7 | 92 → 96 (+4) | `Confirm order · £10.00`, the backlog heading separator |
| `…` U+2026 | 62 → 63 (+1) | an ellipsis in the quoted old subsection text |
| `✓` U+2713 | 61 → 62 (+1) | the customer flow's `✓ Confirm`, quoted as the naming collision |
| `💳` U+1F4B3 | 7 → 9 (+2) | the Cash/Card rows in the §10 button table |
| `💷` U+1F4B7 | 7 → 9 (+2) | same |
| `←` U+2190 | 6 → 9 (+3) | the KDS `← Dashboard` link, named in §43 and the changelog |

**Emoji integrity confirmed separately.** `⚠` and its VS16 rose by the same 11; a direct scan reports **paired 243, bare 7** — and **bare was 7 before**, so every `⚠️` added is a complete pair and the seven unpaired ones are pre-existing and untouched.

**Mojibake scan: 0 before, 0 after.** No `U+FFFD`, no `Ã`/`â€`/`Â` signatures. **No already-garbled span was found, so none was flagged and none was silently fixed.**

### Version on disk — verified first

All three markers read **V11.6** (title line 1, `**Version 11.6**` line 9, footer line 6587). **V11.7 is therefore the correct next number and none was skipped** — stated in the changelog entry itself. All three updated.

### Only the manual was touched

`docs/reference-manual.md` mtime **15:30:18** (this task). Every source file carries an mtime from **earlier tasks**: `AddOrderPanel.tsx` 15:04, `UserMenu.tsx` 15:12, `app/manage/[token]/page.tsx` 15:13, `lib/legal.ts` 15:13 — all before this task began. **No source file was edited, and no cap sync, `next dev` or `next build` was run.**

---

## What changed, section by section

### 1. The Add Order inversion — §10 rewritten in place, plus the changelog

**§10's "Confirm order button" subsection is now "The confirm bar — TAKING PAYMENT IS THE DEFAULT (V11.7)".** The old text is **quoted inside the new one** rather than deleted, with a note that the disable rule and the endpoint are unchanged but the label and the behaviour are not.

Recorded there:

- **the four button states** (OFF, OFF + cash, ON, ON + cash) as a table;
- 🔴 **the three-site breakage**, with *"fixing (1) alone would have looked correct and still recorded nothing"*;
- **the live-data proof** — all 12 `manual_paid_at_order` rows on paid-step-TRUE trucks, nine OFF trucks with none;
- 🔴 **one press = one server action, one request, one outbox op**, with the skip-and-continue reason it must not be split, and the verified ledger identity (one row shape across all 90 live rows);
- ⚠️ **the accepted consequence** — no unpaid route with the setting OFF, the truck chooses, no third state;
- **the label reasoning** — why not `Confirm order` (primary-action reading *and* the customer flow's own word), why `Place order` is short, and 🔴 why the completion buttons keep `Mark`;
- ⚠️ **`takes_cash`'s removed gate**, framed as *"a defect this change would have introduced, not one it found"*;
- the **inline-vs-stacked amount** measurement, so the asymmetry is not read as an inconsistency.

### 2. Legal link placement — a new §43 block

**§43 gains "🔴 WHERE THE IN-APP LINKS LIVE — ONE LOCATION, SETTLED V11.7. DO NOT MOVE THEM."**, carrying the role map (staff **redirected out** of Manage, in no `roles` array), the two common surfaces, the per-role tap table (1 tap / 2 from the KDS), 🔴 **the styling as load-bearing** with the reason the clutter objection dissolves, the same-day move-and-move-back, and ⚠️ **the retraction** of `lib/legal.ts`'s KDS claim with why the overstatement mattered.

### 3. Other UI fixes — in the changelog

Danger zone (white card, red heading, outline triangle; **flow, typed-name requirement and gating untouched**), the tour card moved to the top of Settings (three sites, only one needed moving), and the WhatsApp button (`Save` → `Connect`, page's own class, ⚠️ **behaviour byte-identical and 🔴 not wired up — do not read the label as a working connection**).

### 4. §35 — four invariants added

- 🔴 **A defect can be broken in more places than the visible one** — the three sites, and the cheap diagnostic (follow one press down: handler, wire, route).
- 🔴 **Recover removed code from git; do not retype it** — restored verbatim from `32921c6`, tied to the existing four-column-migration precedent.
- 🔴 **A comment asserting reach must be re-grepped, not trusted** — the KDS claim, and that **it changed a decision**; same class as `setOverlaysWebView`'s "LOAD-BEARING" note on an early-returning call.
- **When a control becomes available in more states, its enable gates go stale** — `takes_cash`'s gate against exactly the trucks that gained the button.

### 5. §27 backlog — reaffirmed, deliberately not duplicated

⚠️ **The per-event override reset was already recorded in full under "Added V11.6 — the per-event override one-way door", and it is accurate.** Rather than add a second entry that would drift from it, the heading is now **"· STILL OPEN at V11.7"** with a note that it was re-confirmed today, that nothing changed, and that **it remains open at the operator's decision, not through oversight**. One backlog item, one place.

**All six keep-open items verified present and unchanged**, by grep: Stripe Connect, the collect idempotency key, the stock-badge `bound` defect, "Only 1 pizzas left!", `hide_pricing` masking footnote 2, Apple Developer enrolment.

**Nothing labelled open in the brief is recorded as verified.** The override reset says the handlers are verified and the UI route is missing — which is exactly the split the brief gave.

---

## Structural check

- Version markers: **3 of 3** updated.
- Top-level `#` headings: **44**, unchanged — no section added, deleted, renumbered or reordered.
- `# Changelog` → `## V11.7 — 10 August 2026` → `## V11.6 — 10 August 2026`: correct order, V11.6 intact beneath.
- Every change is an in-place correction or an extension of an existing section.

**Integrity gate: PASSED. Zero character-count drops, zero vanished characters, zero mojibake, no already-garbled span found.**
