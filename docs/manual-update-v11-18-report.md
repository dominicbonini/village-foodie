# Reference manual — V11.17 → V11.18

**Applied:** the `manual-delta-v11-18.md` blocks, in full.
**Result: 🔴 INTEGRITY GATE PASSED. Zero character classes gained, zero lost, zero NUL bytes, zero control bytes.**
**Edited only `docs/reference-manual.md`.** No source file touched. No `next dev`, no `next build`, no `cap sync`, no deploy, no archive, no commit.

⚠️ **ONE DELTA INSTRUCTION WAS DELIBERATELY NOT CARRIED OUT, AND IT IS NOT AN OVERSIGHT** — see *What was NOT done* below. It is recorded in the manual's own backlog so it cannot be lost.

---

## 🔴 THE INTEGRITY GATE

### Version markers on disk — verified FIRST

```
line 1     : HatchGrab Engineering Reference Manual · V11.17   ->  V11.18
line 9     : **Version 11.17**                                 ->  **Version 11.18**
footer     : HatchGrab Engineering Reference Manual · V11.9     ->  V11.18
```

✅ **V11.17 on disk as expected; V11.18 is the correct next number and none was skipped.**

🔴 **THE FOOTER WAS EIGHT VERSIONS STALE.** The V11.9 report recorded *"three markers, not two — all three now read V11.9"*, and **every update from V11.10 to V11.17 then missed it**. ⚠️ **The marker that drifts is the one nobody scrolls to.** It is now correct, and it is worth checking as a triple, not as a pair, on every future bump.

### Census — before and after, side by side

```
BEFORE : 1,468,310 bytes | 9,942 lines  | 72 distinct non-ASCII
AFTER  : 1,496,028 bytes | 10,346 lines | 72 distinct non-ASCII
DELTA  :   +27,718 bytes |   +404 lines | +0 distinct
```

✅ **GAINED classes: none. LOST classes: none.**

### 🔴 PER-CHARACTER DIFF — every difference, with its cause

| Char | | Before | After | Δ | Accounted for by |
|---|---|---|---|---|---|
| `§` | U+00A7 | 625 | 646 | **+21** | cross-references between §11, §20, §27, §35, §36, §37, §38, §40, §44 |
| middle dot | U+00B7 | 209 | 215 | **+6** | list separators, and the two version markers that carry it |
| multiplication sign | U+00D7 | 80 | 83 | **+3** | `2732 × 2732` twice, `1366 × 1366` once — the splash asset dimensions |
| em dash | U+2014 | 4,387 | 4,466 | **+79** | em dashes throughout the new prose |
| ellipsis | U+2026 | 90 | 95 | **+5** | truncated quotations, e.g. *"this build charges no platform fee…"* |
| right arrow | U+2192 | 1,239 | 1,247 | **+8** | `41,273 → 57,598`, `V11.17 → V11.18`, colour-handoff and flash sequences |
| hooked arrow | U+21A9 | 4 | 5 | **+1** | one quoted UI label, `↩ Undo`, in the offline-messaging entry |
| warning sign | U+26A0 | 530 | 556 | **+26** | the warning glyph on new caveats |
| white heavy check | U+2705 | 117 | 138 | **+21** | the tick glyph on new verified statements |
| check mark | U+2713 | 63 | 64 | **+1** | **named as a codepoint** in the offline-messaging entry, where a component lost that class |
| variation selector | U+FE0F | 530 | 556 | **+26** | 🔴 **exactly tracks U+26A0 — the invisible half of the warning glyph** |
| red circle | U+1F534 | 718 | 772 | **+54** | the emphasis glyph on new 🔴 statements |

🔴 **U+FE0F MOVED IN LOCKSTEP WITH U+26A0 (+26 / +26).** That equality is the check, not a coincidence: **an unpaired variation selector is invisible and would show up here as the two counts diverging.** They did not.

⚠️ **U+2713 IS THE ONE ENTRY THAT REQUIRED CARE.** The delta's own P11 rule says **a codepoint list cannot be quoted, only described** — writing the offending characters into prose *in order to name them* adds those classes. It was safe here **only because the manual already held U+2713 (63 occurrences)**, so naming it gained nothing. **Every other codepoint discussed in P11 is described in words, never reproduced.**

### Byte scan — a separate pass, byte-level, never `grep`

```
docs/reference-manual.md   NUL bytes: 0
                           control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F: none
```

✅ **Clean.** The report you are reading was scanned as its own pass **after** it was written; result at the foot.

### Deletion audit — all 8 removed lines accounted for

`git diff --numstat`: **412 insertions, 8 deletions.** Every deletion, in full:

| Deleted | Why |
|---|---|
| `HatchGrab … · V11.17` | version marker, replaced |
| `**Version 11.17**` | version marker, replaced |
| `HatchGrab … · V11.9` | stale footer, replaced |
| authorize-then-capture *"NOT BUILT"* (changelog) | rewritten **with the original text struck, not removed** |
| refunds *"STILL UNBUILT"* | same |
| authorize-then-capture *"proven, not built"* (§27) | same |
| Stripe Connect *"ALL UNBUILT"* (§27) | same |
| *"UNBUILT: … refunds …"* (§37) | same |

🔴 **NO PROSE WAS DISCARDED.** The five superseded claims are still readable in the manual — inside `~~strikethrough~~`, each followed by a dated `STRUCK V11.18` note. **That is the delta's new rule and the reason this update deletes almost nothing.**

---

## 🔴 THE RULE THIS UPDATE INTRODUCED, AND WHY IT EXISTS

> **A CORRECTION SITTING NEXT TO THE CLAIM IT CORRECTS IS NOT A CORRECTION: IT IS TWO CLAIMS.**

**It has already cost real work.** The line *"Authorize-then-capture is PROVEN and NOT BUILT"* survived beside its own correction; **a planning brief read the stale half and an entire refund investigation was commissioned on it** — for a feature that was built end to end, with eight specification documents already on disk. Hence **P10: A BRIEF BUILT ON A MANUAL CLAIM INHERITS THAT CLAIM'S STALENESS**, added to §1.

**Applied here as:** superseded text is **struck through in place**, never left standing and never silently deleted. The reader sees what was believed, that it is wrong, and when it stopped being true.

---

## WHAT WAS APPLIED, BLOCK BY BLOCK

| Block | Where it landed | Substance |
|---|---|---|
| **Changelog** | before the V11.17 entry | the root cause, the empty-data class, the never-queued decision, the two struck claims |
| **§1** | the discipline section | the striking rule + **P10** (a brief inherits a claim's staleness) |
| **C7** | changelog `:315`, §27 | authorize-then-capture *"NOT BUILT"* — **struck; it is built (V11.10), wired from five call sites** |
| **C8** | changelog `:455`, §27, §37 | refunds *"UNBUILT"* — **struck; built end to end** |
| **§11 · N40, N41** | before §12 | 🔴 **the navigation root cause: `server.url` carries `/app`, and `decidePolicyFor` prefix-matches the PATH** |
| **§11 · N42** | " | `isNativeApp()` may be intermittently false in the shell — unresolved |
| **§11 · N43** | " | manage has **no offline detector at all** |
| **§11 · N50** | " | the missing order number — two routes into the queue, one numberless |
| **§11 · N51** | " | offline messaging, implemented |
| **§37 · N44** | before §38 | 🔴 **the modal asserted a falsehood** — and the class: *empty server data read as fact* |
| **§37 · N45** | " | **Branch 0**, and the decision that payment modification is **never queued** |
| **§37 · N46** | " | ⚠️ `undo_mark_paid` would still queue — **backlog: refuse it at the gate** |
| **§37 · N47** | " | the ledger schema was designed around refunds from the start (`amount_minor > 0` CHECK) |
| **§37 · C9** | " | 🔴 no application fee — **and the future-tense landmine, recorded** |
| **§36 · N48** | before §37 | the launch screen, with the colour reasoning and the `pbxproj` byte-identity |
| **§20 · N49** | before §21 | WhatsApp auto-replies hidden natively, **23 insertions / 0 deletions** |
| **§35 · P11** | before §36 | the census caught a real violation a **third** time — including an invisible codepoint |
| **§35 · P12** | " | **four correct stops, two declared over-rides** |
| **§27 · Part 8** | before §28 | state at close, the one blocker, the carried backlog |
| **C10** | §38 (**no edit needed**) | see below |

### C10 — the honest answer is *no correction was required*

**READ:** §38 already states it correctly — `#EF8B2C` is the brand mark (*"read off the wordmark SVG's own `fill`, not a screenshot"*), `#EA580C` is Tailwind orange-600, the action colour, and **"DECIDED: the two oranges stay different"** with both rejected directions written out. A search for any line calling `#EA580C` the brand colour returned **nothing**.

✅ **"Not found" is a result.** The re-confirmation is recorded in §27 Part 8 rather than manufactured as a correction to a section that was already right. The splash work took `#0F172A` from the existing icon asset, so **no new colour was minted**.

---

## 🔴 WHAT WAS *NOT* DONE, AND WHY

**C9 instructs: *"Defuse it with a comment at the refund call site now, not with a memory later."* THE COMMENT IS NOT IN THE CODE.**

⚠️ **This turn is a manual update.** Adding it means editing `lib/payments/refund.ts` — **live payment code on the surface Pizzeria Gusto trades real money through**. That is a different kind of change from editing a document, and it is not mine to fold silently into a documentation turn.

**What was done instead:** the landmine is recorded **twice** — in §37 with the mechanism spelled out (Stripe's default on a direct-charge refund **leaves the fee with the platform**, so the day a fee is introduced the truck refunds full while HatchGrab keeps its cut, **silently, in the truck's disfavour**), and in §27 Part 8 as an explicit carried item stating **the comment is still the right defusal**.

🔴 **The delta's own objection — *"not with a memory later"* — is fair, and this IS the "later" it warns about.** The mitigation is that it is now written in the one document that is read before payment work, tagged to the call site, on a path that **cannot misfire until a platform fee exists** — and no fee exists today (`application_fee_amount` is never sent; §44 records 0% on every tier). **Say the word and it goes in on its own.**

---

## FLAGS

- ⚠️ **DATING.** The work itself was done on **14 August 2026** and is dated so throughout, matching every report from this session. **The manual edit landed just after midnight, on the 15th.** The entries are dated by when the facts were established, not by when they were typed.
- ✅ **No span of the delta arrived garbled.** Unlike V11.9, the characters were intact; nothing had to be decoded.
- ✅ **No instruction contradicted another.** The single tension — C9's *"now"* against a manual-update turn — is declared above rather than resolved silently in either direction.

---

## PROVENANCE

**READ** — every version marker, every deletion in `git diff`, both census runs, both byte scans, the `#EF8B2C` / `#EA580C` search, `git diff --numstat`.

**INFERRED** — the per-character attributions in the census table (each Δ is matched to added text by inspection of the diff, which is evidence, not proof that no other line also contributed).

---

## BYTE SCAN OF THIS REPORT — separate pass, run AFTER writing

```
docs/manual-update-v11-18-report.md   NUL bytes: 0
                                      control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F: none
```
