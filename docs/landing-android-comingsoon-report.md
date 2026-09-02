# Android → coming soon, plus the question swap

**Nothing committed. Nothing deployed. No SQL, no migration. The feature gate was NOT changed.**
**Restore notes updated by ADDITION only** — `docs/landing-copy-restore-notes.md` §7 and §8.

---

## VERIFICATION

- 🔴 **One real execution:** `findPlanParityViolations()` run directly via `tsx` → **0 violations**,
  after the row split. That is an execution, not a source read.
- **Sanity checks only:** `tsc --noEmit` exit 0; `eslint` **0 problems** on both changed files.
  **Not verification.**
- 🔴 **I have not rendered the landing page, the Billing tab or admin.** What a visitor *sees* is
  inferred from source.

**No span of the prompt arrived garbled.**

---

## 🔴 THE ONE DECISION I HAD TO MAKE, AND WHY

**"The compare table needs to show Android as coming soon" could not be done as a value flip.**

The table had a **single merged row** — `'iPhone, iPad and Android kitchen app'`, `true/true/true`.
Flipping that row to `coming_soon` would have marked **iPhone and iPad as coming soon too**, and
**iOS is approved and live**. That would be a false claim about a shipped app.

**So I un-merged the row back into the two rows it briefly was** — which the file's own comment records
as the pre-merge structure:

> *"This was 'iPad kitchen app' (true/true/true) with a separate 'Android kitchen app'
> (coming_soon/coming_soon/coming_soon) beneath it."*

🔴 **THIS REVERSES A DOCUMENTED DELIBERATE MERGE**, whose stated premise was *"Android now launches
alongside iPad"*. **That premise no longer holds** — iOS shipped, Android is in review — so the merge's
own justification has expired. **I rewrote the comment to say so rather than deleting it.**

⚠️ **If you would rather the merged row simply read "Coming soon" for all three platforms, say so and I
will change it — but it would withdraw a live iPhone/iPad app in the copy.**

---

## What changed — seven strings, two files

### `lib/plan-features.ts` — the shared source (landing + Billing + admin)

| # | Line | Change |
|---|---|---|
| 1 | `:198` | **Row renamed** → `'iPhone and iPad kitchen app'`, still `true/true/true` |
| 2 | `:203` | **NEW ROW** → `'Android kitchen app'`, `coming_soon` on all three plans |
| 3 | `:186-197` | Merge comment **rewritten** to explain the un-merge |
| 4 | `:406` | `ROW_FEATURE_MAP` key follows the rename → `'iPhone and iPad kitchen app': 'ipad_kds'` |
| 5 | `:367` | **Footnote 3** → *"native kitchen apps for iPhone and iPad, with Android coming soon"* |

**Mechanism:** `'coming_soon'` — the existing value `Cell()` already renders as
`<span className="soon">Coming soon</span>`. **Nothing invented.**

⚠️ **The new Android row carries NO `ROW_FEATURE_MAP` entry, deliberately.** There is no Android-specific
`Feature` to join to, and `findPlanParityViolations()` `continue`s on a row with no entry **and** skips
`coming_soon` cells anyway — so an entry would buy nothing. **Recorded in the code comment so the next
reader does not "fix" it.**

### `app/landing/page.tsx`

| # | Line | Change |
|---|---|---|
| 6 | `:88` | **Landing-only** `DETAIL_OVERRIDES` tooltip → *"The iPhone and iPad app keeps you taking orders offline (Android coming soon)"* |
| 7 | `:188` | **"No signal? Keep serving."** → *"…with the iPhone and iPad app. **Android coming soon.**"* |
| 8 | `:321-322` | **Free-tier bullet split into two**, matching the table |
| 9 | `:187` | **Question swap** — see below |

**`:321-322` now reads:**

```jsx
<li>iPhone and iPad kitchen app</li>
<li>Android kitchen app <span className="soon-inline">Coming soon</span></li>
```

🔴 **This bullet HAD to change with the table row, and the file says so.** Its own comment at `:318-320`:
*"HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS… it must be changed in the SAME commit or the same
page shows two different claims."* **Same commit. Done.**

---

## The question swap (your mid-task request)

**`app/landing/page.tsx:187`.**

```diff
- “Where are you tonight?” “Do you do gluten free?” Soon your WhatsApp will get answered…
+ “Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered…
```

✅ **Curly quotes preserved** on both questions, and the curly apostrophe in `you’re` is untouched.
**Only the words between the second pair of quotes changed.**
✅ **"gluten free" appears nowhere else on the landing page** — checked.

⚠️ **Recorded in restore notes §8 as its POST-§2 / PRE-§8 state**, because this block was already changed
earlier today. **The true original is in §2 and remains the source for a full revert.**

---

## The three protected strings — untouched

**Proven by diff: none appears in it.**

| String | Status |
|---|---|
| `Online ordering — Pay at Hatch` | ✅ **Untouched** |
| The bare `—` cell value, `app/landing/page.tsx:96` | ✅ **Untouched** |
| The customer testimonial | ✅ **Untouched** |

⚠️ **The Android row's `Cell()` renders `'coming_soon'`, not the `—` glyph** — so the not-included value
was not involved.

---

## Parity checker

**Ran it: 0 violations.** ⚠️ **And it would have caught a real mistake here, for once.**

Had I renamed the row (`:198`) without updating `ROW_FEATURE_MAP` (`:406`), the entry would point at a
row name that no longer exists — and the checker would have **silently skipped** it (`continue` on no
entry), not flagged it. 🔴 **So the 0 is honest for the rows that ARE mapped, and blind to a broken
mapping.** **I changed them together; the restore notes say to restore them together.**

**The Android row's three `coming_soon` cells are skipped outright** — the checker only inspects cells
that are literally `true`.

---

## Every surface that now describes the Android app

| # | Surface | Says |
|---|---|---|
| 1 | `lib/plan-features.ts:198` → **landing table, Billing, admin** | **iPhone and iPad kitchen app — ✓** on all three plans |
| 2 | `lib/plan-features.ts:203` → **landing table, Billing, admin** | **Android kitchen app — "Coming soon"** on all three plans |
| 3 | `lib/plan-features.ts:367` footnote 3 | *"native kitchen apps for iPhone and iPad, with Android coming soon"* |
| 4 | `app/landing/page.tsx:88` landing tooltip | *"The iPhone and iPad app keeps you taking orders offline (Android coming soon)"* |
| 5 | `app/landing/page.tsx:188` "No signal?" | *"…with the iPhone and iPad app. Android coming soon."* |
| 6 | `app/landing/page.tsx:321-322` Free-tier bullets | Two bullets — iPhone/iPad plain, **Android badged "Coming soon"** |

✅ **All six agree.** ⚠️ **Rows 1–3 also change the operator's Billing tab and admin** — the shared-source
spread, the same one you accepted for WhatsApp.

### Still says Android works — one place, left alone

| Surface | Says | Why untouched |
|---|---|---|
| `app/manage/[token]/page.tsx:11435` | A code comment: *"web and Android never evaluate it"* | **An implementation comment about a code path, not a marketing claim.** Not in scope |

---

## ⚠️ Two things I did NOT change, reported instead

1. 🔴 **`lib/plan-features.ts:202` — the shared `'Offline Order Protection'` detail** reads *"orders are
   held safely and sync when you're back"*. **It does not mention any platform**, so it needed no
   change — **but note the landing tooltip that DOES mention platforms (`:88`) is a landing-only
   override. Billing and admin show the platform-free wording.** **Not a defect; recorded so the
   asymmetry is not mistaken for one later.**
2. **Footnote 4 on the two WhatsApp rows** still describes auto-replies as operating (flagged in the
   previous report, still unaddressed).

---

## What I could not establish

1. **How any of this renders** — landing, Billing or admin. **Not opened in a browser.**
2. 🔴 **Whether the two-row split changes the table's layout** — the removed row was noted in the file
   as *"the longest cell in the matrix at 36 characters"*. The new longest is
   `'Messenger & Instagram auto-replies'` (34). **Column widths may shift; I did not look.**
3. **Whether "coming soon" is the wording you want for an app that is submitted and in review**, rather
   than e.g. "in review". **I used your word.**
4. **Whether the Android row should sit in the section's coming-soon block** rather than beside its
   iPhone/iPad twin. **I kept the twins adjacent so the pair reads as one fact.**
