# iOS purchase-CTA suppression — BUILD (two copy gates)

**Date:** 5 August 2026. Supersedes the previous build report of the same name.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
No garbled spans in the brief. Nothing was ambiguous and nothing required repair.

**One file touched: `app/manage/[token]/page.tsx`.** Two gates added, both on the existing `purchaseCtaAllowed()` predicate. No new module, no new import, no change to the predicate.

---

## RE-CHECK BEFORE EDITING

Both references had drifted from the numbers in the previous report, as expected:

| Brief said | Actually at | Now at |
|---|---|---|
| `~:9919` trial info line | `:9920` | `:9930` |
| `~:9942-9944` reassurance block | `:9950-9953` | `:9972` (gate) |

---

## 1. THE TRIAL INFO LINE — SPLIT, NOT GATED WHOLE

**[app/manage/[token]/page.tsx:9928-9934](app/manage/[token]/page.tsx#L9928)**

```tsx
{truck.trial_expires_at
  ? (purchaseCtaAllowed()
      ? "You're on Max features. Choose a plan before your trial ends to keep access."
      : "You're on Max features.")
  : TRIAL_NOT_STARTED_BILLING}
```

| Platform | Renders |
|---|---|
| Web / Android / SSR | *"You're on Max features. Choose a plan before your trial ends to keep access."* |
| **iOS** | *"You're on Max features."* |

### 🔴 The web string is ONE untouched literal, not two halves concatenated

This is the decision worth naming. The obvious implementation is to split the sentence into two constants and join them for web — and that would have been wrong. **A concatenation puts a space boundary in the middle of a sentence that nothing tests**, and this is the exact sentence the manual records as *"byte-identical to what Gusto and RTF read today"*. The full sentence therefore stays a single string literal on the branch web takes; the shorter iOS string is a **second, independent literal** that web and Android never evaluate.

`grep -c` for the full sentence returns **1** — it survives intact, character for character.

**The NOT-STARTED branch is untouched on both platforms.** `TRIAL_NOT_STARTED_BILLING` contains no instruction to buy (*"You have every Max feature while you set up. You choose which event starts your free trial - until then, nothing is counting down."*), so it needs no gate and got none.

---

## 2. THE BILLING REASSURANCE BLOCK — WHOLE CONTAINER GATED

**[app/manage/[token]/page.tsx:9972](app/manage/[token]/page.tsx#L9972)**

```tsx
{truck.trial_expires_at && purchaseCtaAllowed() && (
  <>
    <p className="text-xs text-center text-slate-500 mt-3">
      🔒 You won&apos;t be charged anything until your trial ends on{' '}
      {formatTrialEndDate(truck.trial_expires_at)}.
      Automated billing activates at the end of your trial — cancel anytime before then at no cost.
    </p>
    <p className="text-xs text-center text-slate-400 mt-1">
      *Standard card processing fees apply on online orders
    </p>
  </>
)}
```

The predicate is added to the **existing container condition**, so the whole fragment — both paragraphs and their `mt-3` / `mt-1` spacing — resolves to nothing on iOS.

### ⚠️ THIS DELIBERATELY TAKES A SECOND PARAGRAPH THE BRIEF DID NOT NAME

The brief pointed at `~:9942-9944`, which is the charging sentence alone. **The fragment also contains `*Standard card processing fees apply on online orders`**, and I gated it too. Stating that explicitly rather than letting it pass as incidental:

- **That line is an asterisk with no antecedent** once the sentence above it is gone. Left behind, it would be a lone centred grey footnote marking nothing — precisely the orphan the brief's NO EMPTY SHELLS rule names, and the reason that rule says *"gate the container rather than the contents."*
- Gating the container also takes the `mt-3` with it, so **no dangling vertical gap** is left between the trial card and `billingCard`.

The two instructions point the same way here: "suppress the whole block" and "gate the container rather than the contents" both land on the fragment. If you intended the fee footnote to survive on iOS, that is a one-line change — but it would need its own antecedent, which is why I did not do it.

---

## 3. WHAT AN iOS TRIAL OPERATOR SEES AFTER THIS CHANGE

Walking the trial branch top to bottom on an iOS device, dated trial:

```
Current plan
Trial
Free trial
All features included — Max tier + Pay at Hatch ordering
Trial ends 17 October 2026                    ← amber, preserved

┌─ orange box ──────────────────────────────────┐
│ Your trial ends 17 October 2026               │  ← preserved
│ You're on Max features.                       │  ← SPLIT, item 1
└───────────────────────────────────────────────┘

┌─ Billing & payments ──────────────────────────┐
│ ⚙️ Payment setup coming soon                   │  ← billingCard, preserved
│ We're setting up our payment system…          │
│ Pizzeria Gusto · Trial plan (trial)           │
└───────────────────────────────────────────────┘

[ full feature matrix — all four plan columns ]   ← preserved
[ footnotes ]                                     ← preserved
```

**No empty shells.** Confirmed element by element:

| Risk | Outcome |
|---|---|
| Empty bordered box | ✅ The orange box still holds two lines of text |
| Lone icon | ✅ The `🔒` goes with its own paragraph; the `⚙️` in `billingCard` is untouched and still has its copy |
| Orphaned heading | ✅ Nothing here is a heading; the `*` footnote is gated with its antecedent |
| Dangling vertical spacing | ✅ `mt-3` / `mt-1` are inside the gated fragment; the parent uses `flex flex-col gap-6`, which collapses cleanly with one fewer child |

### ✅ Item 3 — the trial end date survives, twice

`:9898` *"Trial ends {date}"* in the current-plan block, and `:9925` *"Your trial ends {date}"* in the orange box. **Neither was touched by either gate.** An iOS operator is never left without knowing when access lapses.

### 🔴 NO REPLACEMENT COPY WAS ADDED

`grep` for `manage your plan`, `visit our website` and `hatchgrab.com` across the file returns **no new text** — the only `hatchgrab.com` hits are a pre-existing KDS-link clipboard write at `:8278` and my own comment at `:9970` explaining why no such copy exists. **Not one character of user-facing text was added anywhere.**

---

## VERIFICATION

### Both gates return "allowed" off iOS

Both use the same predicate as the previous nine, unchanged:

| Runtime | `purchaseCtaAllowed()` | Item 1 | Item 2 |
|---|---|---|---|
| **SSR / no Capacitor** | `true` | full sentence | block renders |
| **Browser (web shim)** | `true` | full sentence | block renders |
| **Native Android** | `true` | full sentence | block renders |
| **Native iOS** | `false` | *"You're on Max features."* | block absent |

⚠️ **The hydration finding from the previous task still holds and still matters.** `loading` starts `true` at `:193` and the component early-returns a spinner at `:465`, so this markup is never server-rendered — the first client render is already post-mount, and direct inline evaluation cannot flash. Both new gates inherit that property because they sit in the same subtree. **If Manage ever becomes server-rendered with data, these two become SSR/client mismatches along with the other nine.**

### Gate count

**Eleven `purchaseCtaAllowed()` call sites now** — ten in `app/manage/[token]/page.tsx` (`:392`, `:405`, `:662`, `:9638`, `:9930`, `:9939`, `:9972`, `:9989`, `:10019`, `:10083`) and one in `components/FeatureGate.tsx:52`. **Two are new; the previous nine were not revisited or altered**, per the out-of-scope list.

### Build

```
$ npx tsc --noEmit
TSC EXIT: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 370 problems (293 errors, 77 warnings)
```

**Baseline is 370 (293 errors, 77 warnings); now 370 (293, 77) — exactly the baseline.**

`next dev` / `next build` not run. No migration, no SQL.

---

## 🔴 GUSTO — NO-OP CONFIRMED

Gusto is `plan = 'trial'`, expiry 17 October, dated branch, on the web. `purchaseCtaAllowed()` returns **`true`** in every browser.

| Element | Before | After |
|---|---|---|
| Trial info line | *"You're on Max features. Choose a plan before your trial ends to keep access."* | **identical** — same single literal, on the branch the `true` predicate selects |
| Reassurance block | both paragraphs render | **identical** — `truck.trial_expires_at && true` is the original condition |
| Trial end date ×2 | renders | **untouched** |
| Everything else | — | **untouched** |

**Neither edit changes one byte of Gusto's rendered output.** Item 1's web branch is the original literal, and item 2's added conjunct is a constant `true` in a browser — the container condition is functionally what it was.

⚠️ **Nothing in this task is web-visible at all.** Unlike the previous task, which deliberately fixed three `/pricing` 404s, **this change has no intended effect on any web or Android operator.**

---

## Out of scope — confirmed untouched

The nine gates from the previous task (not revisited or "improved") · `SUPPORT_EMAIL` and its fallback · the `[truck?.id]` dependency array · `lib/features.ts` · `lib/plan-features.ts` · `lib/commerce-policy.ts` · `components/FeatureGate.tsx` · all other copy, styling, spacing and layout.

`git status --porcelain` shows `app/manage/[token]/page.tsx` as the only source file modified by this task.
