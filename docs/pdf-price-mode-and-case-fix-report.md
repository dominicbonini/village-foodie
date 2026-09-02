# PDF price mode, and the 'Pay at hatch' case mismatch

**Both fixes applied and verified by regenerating the PDF and opening both pages. Not deployed, not
committed. No SQL, no migrations.**

**VERIFICATION.** Not a typecheck. **I regenerated the PDF from the route's own `buildHtml()` and looked
at both pages**, re-rendered the landing page in a browser, and ran **two measured audits** — one over
every string that reaches the price mask, one over every exact-string row-name key in the codebase.

**GARBLED SPANS: none.** No instruction contradicted another.

---

## 1. `PRICE_MODE = 'always-real'`

**Changed** at `app/landing/features-pdf/route.ts:60`:

```ts
const PRICE_MODE = 'always-real' as PriceMode      // was 'follow-flag'
```

**Confirmed in the regenerated PDF** — prices print in full, no "TBC" anywhere:

| | Trial | Starter | Pro | Max |
|---|---|---|---|---|
| Header price | Free | Free / free forever | **£29/mo** | **£49/mo** |
| Online orders included | Unlimited | — | **£1,500** | **£2,000** |
| Fee after that | Free | Pay at Hatch | **0.99%** | **0.99%** |

The *"Prices shown as 'TBC' are not yet published"* line is **correctly gone** — it renders only under
`'follow-flag'`, and there is now nothing for it to explain.

### Does anything else read that constant? — **No. Measured.**

**`PRICE_MODE` is module-private** — a bare `const`, **not exported** — so nothing outside the file can
read it. Every reference is in `route.ts` itself:

| Line | Use |
|---|---|
| `:60` | the declaration |
| `:62` | `px()` — bypass the mask when always-real |
| `:77`, `:78` | suppress the price header under `'omit'` |
| `:82` | suppress the fee table under `'omit'` |
| `:104` | suppress the allowance list under `'omit'` |
| `:111`, `:113` | the two explanatory notes |

**Seven references, one file, nothing exported.** `grep -rn "PRICE_MODE"` across `app/`, `lib/` and
`components/` returns those seven lines and nothing else. **The landing page, Billing and Admin are
unaffected** — they never read it and their own masking behaviour is unchanged.

⚠️ **What this now means, recorded in the file so nobody has to rediscover it:** the PDF carries the real
price list regardless of `NEXT_PUBLIC_PRICING_PUBLISHED`. **The gate in `GET()` controls who can
*generate* one; it controls nothing about where the file goes afterwards.** Treat the document as
published the moment it leaves an outbox. The other two modes still work and it is still a one-word
switch back.

---

## 2. The case mismatch — fixed at its source

### Where each string lived

| Spelling | Where | Role |
|---|---|---|
| **`'Pay at hatch'`** (lower-case h) | `lib/plan-features.ts:98` — `PLAN_ALLOWANCES.starter` | **the single outlier in the entire codebase** |
| | `lib/plan-features.ts:95` | a **comment claiming the mask matched it** |
| **`'Pay at Hatch'`** (capital H) | `lib/pricing.ts:15` | `NON_SECRET_PRICE`, matched by exact string |
| | `lib/plan-features.ts:170` | `TRANSACTION_ROWS` — "Fee after that", starter cell |
| | `lib/plan-features.ts:185`, `:401` | 🔴 **the protected row label** and its key-map entry |
| | `lib/features.ts:194` | `PLAN_META.trial.description` |
| | `app/admin/page.tsx:870` | Admin's fee cell |
| | `app/manage/[token]/page.tsx:857` | Billing's trial line |
| | `app/landing/page.tsx:312` | the landing's own prose — *"With Pay at Hatch, customers order ahead…"* |
| | `lib/landing-table.ts:42`, `app/admin/page.tsx:909`, `app/manage/[token]/page.tsx:11427` | the row-label join key (inside the protected string) |

### 🔴 Which is canonical: **capital H**, and it is not close

**Eleven code occurrences use capital H. One used lower-case.** The lower-case one was the outlier, and
it was also the only one that had to match something.

### 🔴 The comment was the actual defect

`lib/plan-features.ts:94-96` said, before this change:

> *"`starter` stays a literal because **'Pay at hatch' is a description of a MODEL**, not a formatted
> amount, **and lib/pricing.ts matches on that exact wording in NON_SECRET_PRICE.**"*

**That last clause was false.** `NON_SECRET_PRICE` is a `Set` matched by exact string; it contains
`'Pay at Hatch'`, not `'Pay at hatch'`. **The comment asserted the match instead of checking it, and was
wrong for as long as the line existed** — so every masked surface printed **"TBC"** for the allowance of
the one plan whose whole point is that it costs nothing.

### The fix

**One value and its comment, in `lib/plan-features.ts`:**

```diff
-  starter: 'Pay at hatch',
+  starter: 'Pay at Hatch',
```

**Not by adding a second spelling to the set**, as instructed — the set is already correct and a second
entry would have preserved two spellings of one term forever.

**The complete diff to the shared source is 13 insertions and 3 deletions: the one value, and the comment
block rewritten to record what was wrong and why the capital is load-bearing.** Nothing else.

### 🔴 The protected row label is untouched — verified, not assumed

**The string I changed:** `PLAN_ALLOWANCES.starter`, `lib/plan-features.ts:98`.
**The string I did NOT change:** `'Online ordering — Pay at Hatch'`, `:185` and `:401`.

| Check | Result |
|---|---|
| Occurrences of the row label in `plan-features.ts` | **2 before → 2 after** |
| Its dash codepoint | **U+2014** (em dash) — read from the file after the edit |
| The label in the rendered landing table | `Online ordering — Pay at Hatch¹` |
| `trialFeatureValue()` on that row | returns **`true`** — the join key still fires |
| `git diff` lines touching `:185` or `:401` | **none** — the diff is the comment block and `starter:` only |

⚠️ **This is exactly the trap the brief warned about:** a naive replace of `Pay at Hatch → Pay at hatch`
would have rewritten the protected label, because the label *contains* the phrase. The edit was made by
matching the surrounding `PLAN_ALLOWANCES` block, never the phrase alone.

### Could any other exact-string match miss the same way? — **No. Measured twice.**

**Audit 1 — every string that actually reaches `maskPrice()`** (19 values from `PLAN_META.price`,
`PLAN_ALLOWANCES` and `TRANSACTION_ROWS`), run against the real modules:

- **Zero near-misses.** No value differs from a `NON_SECRET_PRICE` member only by case or whitespace.
- Every value carrying money (`£29/mo`, `£49/mo`, `£1,500`, `£2,000`, `0.99%`, the two allowance
  sentences) masks correctly under the flag.
- Every exempt value (`Free`, `Free trial`, `0%`, `Unlimited`, `—`, and now `Pay at Hatch`) is shown.
- ⚠️ My heuristic flagged the four `0%` cells as "names money but is not masked" — **that is correct
  behaviour, not a finding.** `0%` is a deliberate member of the set: zero carries no commercial
  information, and masking it to "TBC" would read as broken.

**Audit 2 — every exact-string row-name key in the codebase**, checked against the 30 real row names in
`FEATURE_SECTIONS`:

| Source of keys | Keys | Matching a real row |
|---|---|---|
| `DETAIL_OVERRIDES` | 2 | **2** |
| `NAME_OVERRIDES` | 1 | **1** |
| `HIDDEN_ROWS` | 1 | **1** |
| `trialFeatureValue` | 2 | **2** |
| `ROW_FEATURE_MAP` | 23 | **23** |

**29 of 29 match. Zero keys match nothing, zero near-misses.** This is the class of bug that fails
silently — a key that matches no row simply does nothing, with no error — so it was worth measuring
rather than assuming. `ROW_FEATURE_MAP` is module-private, so its keys were read from source text.

---

## 3. The regenerated PDF — opened and confirmed

**2 pages, A4 (595 × 842 pt), 165,236 bytes.** Both pages rasterised and inspected.

| Check | Result |
|---|---|
| **Real prices printed** | ✅ `£29/mo` and `£49/mo` in the header on **both** pages; `£1,500` / `£2,000` / `0.99%` in the fee rows |
| **Allowance list shows plan terms, not TBC** | ✅ **`Starter — Pay at Hatch`**, `Pro — First £1,500 of online orders included, then 0.99%`, `Max — First £2,000 …` |
| No "TBC" anywhere | ✅ none |
| Header repeats on page 2 | ✅ |
| Rows split across the page break | ✅ none |
| Anything cut off | ✅ nothing — page 2 ends with clear white space |
| All five footnotes present | ✅ plus the "summary, not a contract" line |
| Coming-soon rows | ✅ Android and the merged social row both print **"Coming soon"** in amber |
| Protected em dashes | ✅ `Online ordering — Pay at Hatch¹` shows `✓ ✓ — —` |

**The landing page was re-rendered too**, because the case change is user-visible there. Its pricing-card
fee lines now read:

```
Pay at Hatch
First £1,500 of online orders included, then 0.99%*
First £2,000 of online orders included, then 0.99%*
```

**"Pay at Hatch" now matches the term used in the landing's own prose two sections above** — a copy
consistency improvement that came free with the fix.

**A fresh copy is at `~/Downloads/hatchgrab-plans-and-features.pdf`.**

---

## Files changed

```
app/landing/features-pdf/route.ts   PRICE_MODE 'follow-flag' -> 'always-real', with the reasoning recorded
lib/plan-features.ts                PLAN_ALLOWANCES.starter 'Pay at hatch' -> 'Pay at Hatch' (+13 / -3,
                                    the value and the comment that had asserted a match that did not exist)
```

**Untouched and verified by `git diff`:** `lib/pricing.ts` (the mask set — no second spelling added),
`lib/features.ts`, `lib/landing-table.ts`, `app/landing/layout.tsx`, and the protected row label at
`lib/plan-features.ts:185` and `:401`.

**Nothing deployed. Nothing committed.**
