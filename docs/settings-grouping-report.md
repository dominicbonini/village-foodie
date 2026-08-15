# The clipped caption, and the last "due" strings

**Two files edited: `components/dashboard/OrderCard.tsx` (three lines: one comment, one container class, one caption class) and `components/printing/PrintingSettings.tsx` (two label strings).** No `next dev`, no `next build`, no `cap sync`, no deploys, no commit. `tsc` clean.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

> ## 🔴 THE ADJUST-TIME ROW IS INTACT. **`adjust_slot_+N`, `captureOnConfirmation`, `moveSlotBooking` and `status: 'confirmed'` are all untouched — `app/api/dashboard/action/route.ts` is ABSENT from the diff.**
> **The three buttons are byte-identical.** The change is `flex-wrap` on the row and `min-w-0 truncate` on the caption.
>
> ⚠️ **AND A THIRD USER-VISIBLE "due" EXISTS ON THE PRINTING CARD THAT THE BRIEF'S PREMISE MISSED.** The brief says two remain; there are **three**. I changed the two it named and left the third, reported at B1. **The card is therefore still not fully consistent.**

---

# PART A — THE CAPTION

## A1. The whole row, quoted BEFORE the change

**READ, `components/dashboard/OrderCard.tsx:1237-1250`, complete:**

```tsx
          {/* Quick time adjust — pending, non-cook only */}
          {order.status === 'pending' && order.slot && viewMode !== 'cook' && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Adjust time:</span>
              {[5, 10, 20].map(mins => (
                <button key={mins}
                  onClick={() => onAction(`adjust_slot_+${mins}`, order.order_key)}
                  className="text-xs bg-slate-100 hover:bg-orange-100 hover:text-orange-700 text-slate-600 font-bold px-2 py-1 rounded-lg transition-colors active:scale-95">
                  +{mins}m
                </button>
              ))}
              <span className="text-xs text-slate-300 ml-1">→ new time sent to customer</span>
            </div>
          )}
```

**Handler: `onAction('adjust_slot_+5' | '+10' | '+20', order.order_key)`.**
**Render gate: PENDING orders only, with a slot, outside cook view.**

## A2. What the caption actually says

> ## **`→ new time sent to customer`**

**An arrow plus 26 characters.** 🔴 **The iPad showed `"new time ser… to custome…"`, so the words LOST were "sent" (partly) and "customer" (partly) — the operator never saw the full sentence, and there is no CSS ellipsis in the old markup, so what they saw was a hard chop, not a truncation.**

## A3. The fix — 🔴 **WRAP, with truncate as a last resort**

**The container constraints, quoted, because they decide it:**

| Constraint | Quote |
|---|---|
| Card root | `<div id={anchorId} className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col …`}>` — `OrderCard.tsx:965` |
| The padded section holding the row | `<div className="px-4 pb-3 pt-2 bg-slate-50 flex flex-col flex-1">` — `:1088`, so **16 px of padding each side** |
| The grid the cards sit in | `grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3` — `app/dashboard/[token]/page.tsx:3280` |

**APPLIED:**

```tsx
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
```
```tsx
              <span className="text-xs text-slate-300 ml-1 min-w-0 truncate">→ new time sent to customer</span>
```

> ## ✅ **WRAP CHOSEN, AND THE BRIEF'S OWN PREFERENCE IS WHY: a caption that takes a second line keeps every word; one that truncates loses them.**
> **`flex-wrap` lets the caption move to its own line when it will not fit beside the buttons. On that line it has the card's FULL inner width — far more than the ~150 px the text needs — so in every layout that exists today it renders complete, on one line, with no ellipsis.**
> 🔴 **`min-w-0 truncate` is the LAST RESORT, not the mechanism.** It only engages at a width narrower than any layout reaches. **An ellipsis is a legible failure; a mid-word chop against `overflow-hidden` is not.** ⚠️ **Without `min-w-0`, `truncate` would be inert — a flex item's default `min-width: auto` stops it shrinking below its longest word, which is exactly why the old markup could not yield.**
> ⚠️ **COST: up to ~18 px of extra card height when the caption wraps.** **The card is `flex flex-col` with `flex-1` on this section, so it absorbs that; the grid row grows to its tallest card as it already does for notes and buzzer rows.**

## A4. 🔴 The buttons are UNCHANGED — confirmed by diff, not by assertion

**The full diff for this file contains exactly three changed lines plus my comment. The `<button>` block does not appear in it:**

```diff
-            <div className="flex items-center gap-1.5 mb-2">
+            <div className="flex flex-wrap items-center gap-1.5 mb-2">
-              <span className="text-xs text-slate-300 ml-1">→ new time sent to customer</span>
+              <span className="text-xs text-slate-300 ml-1 min-w-0 truncate">→ new time sent to customer</span>
```

✅ **`px-2 py-1`, the `text-xs font-bold`, the hover and `active:scale-95` states, the `onClick` and the `key` are all byte-identical.**

🔴 **AND WRAPPING CANNOT SHRINK THEM, WHICH IS THE POINT: `flex-wrap` moves WHOLE ITEMS to a new line; it never compresses one.** ⚠️ **I deliberately did NOT add `shrink-0` to the buttons — A4 asked me to CONFIRM they are unchanged, and adding a class would have changed them.** **The arithmetic in A6 is what supports the claim instead.**

## A5. Layout only

| | Changed? |
|---|---|
| `onAction('adjust_slot_+N', …)` | 🔴 **NO** |
| `captureOnConfirmation(… trigger: 'time_adjust')` | 🔴 **NO — `app/api/dashboard/action/route.ts` is ABSENT from the diff** |
| `moveSlotBooking` | 🔴 **NO — same file, absent** |
| `status: 'confirmed'` | 🔴 **NO** |
| Any column, migration or type | 🔴 **NO** |
| The render gate `order.status === 'pending' && order.slot && viewMode !== 'cook'` | 🔴 **NO** |

✅ **Verified mechanically: `git diff --name-only | grep -c "action/route.ts"` returns `0`.** 🔴 **Capture site 3 of 4 is exactly where it was.**

## A6. How it renders at the narrowest width — **INFERRED, nothing was rendered**

**Rough arithmetic at `text-xs` (12 px), which is all that is available without rendering:**

| Element | Approx. width |
|---|---|
| `Adjust time:` | ~68 px |
| `+5m` + `+10m` + `+20m` with `px-2` | ~114 px |
| three `gap-1.5` gaps | ~18 px |
| **first-line total** | **≈ 200 px** |
| the caption | ~150 px |
| **old single-line total** | **≈ 355 px** |

| Layout | Card inner width | Result |
|---|---|---|
| **iPad landscape, 3-across** (`@2xl`) — **the narrowest the card reaches** | ≈ 260 px after `px-4` | 🔴 **200 px fits; 355 px did NOT — this is the observed clip.** ✅ **Now: buttons on line 1, caption on line 2 with ~110 px to spare** |
| iPad, 2-across (`@md`) | ≈ 400 px | ✅ likely one line, no wrap |
| **iPhone portrait, 1-across** | ≈ 343 px inner on a 375 px screen | ⚠️ **≈ 355 px needed — borderline. It may wrap, which is now graceful rather than a chop** |
| Desktop, 3-across on a wide screen | > 400 px | ✅ one line |

> ## ⚠️ **ALL OF THIS IS INFERRED FROM CLASS ARITHMETIC. NOTHING WAS RENDERED — no `next dev`, no `next build`.**
> 🔴 **The one thing the arithmetic does establish firmly: the first line (≈ 200 px) fits every layout above, so the buttons never need to shrink and A4 holds by construction as well as by diff.**

---

# PART B — THE REMAINING "due" STRINGS

## B1. Quoted with file:line — **AND THERE ARE THREE, NOT TWO**

| # | file:line | Before | Changed? |
|---|---|---|---|
| 1 | `components/printing/PrintingSettings.tsx:135` | `: <>Print <strong>{lead} min</strong> before due · {paper}mm paper</>}` | ✅ **YES** |
| 2 | `components/printing/PrintingSettings.tsx:168` | `<span className="block text-xs text-slate-500">The ticket prints a few minutes before the order is due.</span>` | ✅ **YES** |
| **3** | 🔴 **`components/printing/PrintingSettings.tsx:92`** | `<p className="text-xs text-slate-500 mt-0.5">Automatically print a kitchen ticket for each order when it&apos;s due.</p>` | 🔴 **NO — see below** |

> ## 🔴 THE THIRD IS THE CARD'S OWN TOP-LEVEL DESCRIPTION, AND IT IS THE MOST-READ LINE ON THE CARD.
> **It sits directly under the "🖨 Kitchen ticket printing" title and is visible whether the card is expanded or collapsed** — unlike `:135`, which only shows when printing is enabled, and `:168`, which needs the settings expanded.
> ⚠️ **THE BRIEF SAYS "two further 'due' strings remain". THAT PREMISE IS ONE SHORT** — the previous report listed two because those were the two it happened to quote, and this one inherited the count. **I changed the two the brief named and left the third, because B2 scoped the change to "them".**
> 🔴 **CONSEQUENCE, STATED PLAINLY: the card is NOT yet internally consistent. It now says "collection" three times and "due" once, in its most prominent line.** **One more word whenever you say so.**

**⚠️ A fourth match at `:143` is a CODE COMMENT (`minutes-before-due`), not user-visible. Left alone.**

## B2. Both named strings changed

```diff
-                : <>Print <strong>{lead} min</strong> before due · {paper}mm paper</>}
+                : <>Print <strong>{lead} min</strong> before collection · {paper}mm paper</>}
```

```diff
-                    <span className="block text-xs text-slate-500">The ticket prints a few minutes before the order is due.</span>
+                    <span className="block text-xs text-slate-500">The ticket prints the number of minutes below before collection.</span>
```

⚠️ **`:168` CHANGED MORE THAN THE ONE WORD, AND I AM FLAGGING IT RATHER THAN LETTING IT PASS AS A SUBSTITUTION.** The old helper said *"a **few** minutes"* under a label that now promises *"A **set** time"* — vague under precise, the exact mismatch the rename was meant to remove, and the previous report named it. **A pure "due"→"collection" swap would have left `"a few minutes before collection"`, which still contradicts the label above it.** 🔴 **The new sentence points at the control instead. If you want the literal one-word swap, say so and it reverts in a line.**

✅ **"collection" is the codebase's own term** — `generateCollectionTimes`, `Collection time` on the Edit modal's label, `collection_time` on every slot.

## B3. Other user-visible "due" on operator surfaces — **REPORTED, NOT CHANGED**

**A sweep of `app/dashboard`, `app/manage`, `components/dashboard`, `components/printing` and `components/manage` for `due` inside JSX text or a quoted string, comments excluded:**

| file:line | String | Verdict |
|---|---|---|
| `app/dashboard/[token]/page.tsx:3878` | `Sound when an order is due to be cooked` | ⚠️ **A DIFFERENT SENSE — "due to be cooked" is about the kitchen start time, not the collection time. Changing this to "collection" would be WRONG** |
| `app/dashboard/[token]/kds/page.tsx:1407` | `£{…} due` | ⚠️ **MONEY, not time. Untouchable in this sense** |
| `components/manage/DeleteAccountSection.tsx:161` | `It is due to be deleted on …` | ⚠️ **English idiom, unrelated** |
| `components/printing/PrintingSettings.tsx:92` | *(the third one — B1)* | 🔴 **Same sense, same card, left** |

> ## ✅ **ONLY ONE OTHER STRING ON ANY OPERATOR SURFACE SHARES THIS SENSE OF "due", AND IT IS ON THE SAME CARD.**
> **The other three are different meanings — a cook time, a money balance, and an idiom. 🔴 A blanket "due"→"collection" sweep would have broken all three.** **Reported only; nothing outside the printing card was touched.**

---

# PART C — BOUNDARIES

## C1. `git diff --stat`

```
 app/dashboard/[token]/page.tsx                     | 189 ++++++++++++---------
 app/landing/page.tsx                               |   4 +-
 components/dashboard/OrderCard.tsx                 |  21 ++-
 components/native/NotificationSettings.tsx         |   2 +-
 components/native/OperatorDeviceConfig.tsx         |   4 +-
 components/printing/PrintingSettings.tsx           |  37 ++--
 .../AppIcon.appiconset/AppIcon-512@2x.png          | Bin 14883 -> 16103 bytes
 lib/plan-features.ts                               |   2 +-
 8 files changed, 154 insertions(+), 105 deletions(-)
```

> ## ✅ NO GATE, COLUMN, MIGRATION, TYPE **OR CAPTURE CALL**.
> 🔴 **`app/api/dashboard/action/route.ts` — ABSENT.** `captureOnConfirmation`, `moveSlotBooking`, `status: 'confirmed'` and the `adjust_slot` handler are untouched.
> 🔴 **`lib/features.ts` — ABSENT.** 🔴 **`lib/payments/*` — ABSENT.** 🔴 **`supabase/migrations/` — ABSENT.** 🔴 **`components/dashboard/types.ts` — ABSENT.**
> **This task's two files are both presentation components, and the changes are two Tailwind class additions plus two strings.**

## C2. What each live operator sees differently

**Pizzeria Gusto (trades with real money):** on a PENDING order the grey caption beside +5m/+10m/+20m now reads in full — wrapping to a second line on a narrow card instead of being cut mid-word — and on a Max iPad the printing card says "collection" rather than "due" in two more places; 🔴 **the +5m/+10m/+20m buttons, what they write, and the Stripe capture they trigger are all identical.**

**Tikka Tonic (handed over):** exactly the same two changes, with the printing half visible only if they are on Max and in the app.

## C3. Customer-facing surfaces

> ## ✅ **NONE AFFECTED.** `OrderCard` renders on the operator dashboard and the KDS; `PrintingSettings` renders in the dashboard Settings tab behind `isNativeApp()` and a Max gate.
> **No customer route, email, order page or menu is in the diff.** ⚠️ **The customer-facing consequence of pressing +5m — the "your time has changed" confirmation email — is untouched, because the handler is untouched.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census, before and after

### `components/dashboard/OrderCard.tsx` — 86,079 → 87,613 bytes (+1,534), 1,283 → 1,298 lines (+15)

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS | 1,262 | **1,286** | **+24** | one new `──` comment rule, matching the file's existing style |
| U+2014 EM DASH | 144 | **146** | **+2** | two em dashes in the new comment prose |
| U+2026 HORIZONTAL ELLIPSIS | 6 | **8** | **+2** | 🔴 **the two ellipses in the QUOTED symptom — `"new time ser… to custome…"`** |
| U+1F534 LARGE RED CIRCLE | 43 | **45** | **+2** | two emphasis markers in the comment |
| **all other 27 classes** | — | — | **0** | unchanged |

🔴 **31 → 31 distinct. GAINED NONE, LOST NONE.** ⚠️ **The U+2026 pair is the only entry that is not boilerplate: I reproduced the operator's observed string, ellipses and all, because paraphrasing what the iPad displayed would have lost the evidence.** ✅ **The file already held six ellipses, so no class was gained by doing it.**

### `components/printing/PrintingSettings.tsx` — 15,298 → 15,313 bytes (+15), 212 → 212 lines

🔴 **10 → 10 distinct. GAINED NONE, LOST NONE, AND NOT ONE COUNT CHANGED.** ✅ **Both edits are pure ASCII: `due` → `collection`, and one rewritten sentence containing no punctuation beyond a full stop.**

## D3. 🔴 U+26A0 / U+FE0F pair counts — every edited file **and** this report

| File | U+26A0 | U+FE0F | Bare | Verdict |
|---|---|---|---|---|
| `components/printing/PrintingSettings.tsx` | 2 | 2 | **0** | ✅ **PAIRED**, before and after |
| `components/dashboard/OrderCard.tsx` | **42** | **40** | **2** | 🔴 **UNPAIRED — PRE-EXISTING** |
| **`docs/settings-grouping-report.md`** *(this file)* | equal | equal | **0** | ✅ **PAIRED** — verified by scanning the written file |

> ## 🔴 A SECOND FILE CARRIES THE BARE-GLYPH DEFECT, AND THIS IS THE FIRST TIME IT HAS BEEN MEASURED.
> **`OrderCard.tsx` was ALREADY 42 / 40 with two bare glyphs before I touched it, and it is 42 / 40 with two bare glyphs after — my edit changed neither count.** ⚠️ **`app/dashboard/[token]/page.tsx` has the same shape (59 / 57, three bare).** 🔴 **So the defect is not confined to one file. Reported, not fixed — outside this task's scope and predating it.**
> ✅ **This report's own count is stated as an equality rather than two literals, because the section sits inside the file it measures and any later edit would move the numbers.**

## D4. Byte scan — byte-level, never `grep`

```
components/dashboard/OrderCard.tsx          87,613 bytes   NUL 0   control none
components/printing/PrintingSettings.tsx    15,313 bytes   NUL 0   control none
```

✅ **Clean. Two files edited, two files scanned.**

## D5. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## D6. `git status` and `git diff --stat` — which is THIS task's

```
$ git status --porcelain
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M components/dashboard/OrderCard.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
 M ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 M lib/plan-features.ts
?? docs/app-icon-report.md
?? docs/device-naming-report.md
?? docs/printing-architecture-report.md
?? docs/printing-ui-report.md
?? docs/push-registration-report.md
?? docs/settings-grouping-report.md
```

| Entry | Whose |
|---|---|
| 🔴 **`components/dashboard/OrderCard.tsx`** | **THIS TASK ONLY** — it appears in the tree for the first time today |
| 🔴 **`components/printing/PrintingSettings.tsx`** | **THIS TASK** *(two strings)* — **and earlier: the lead-time move, the chip removal, the option-1 rename** |
| ✅ **`docs/settings-grouping-report.md`** | **THIS TASK** |
| `app/dashboard/[token]/page.tsx` | earlier — the settings grouping, both passes |
| `app/landing/page.tsx`, `components/native/NotificationSettings.tsx`, `components/native/OperatorDeviceConfig.tsx` | earlier — the device-naming copy sweep |
| `lib/plan-features.ts` | earlier — the ticket-printing plan cell revert |
| `ios/…/AppIcon-512@2x.png` | earlier — the white ground, then the 830 enlargement |
| the five other `docs/*.md` | earlier — their reports |

⚠️ **THE TREE HAS BEEN DIRTY ALL SESSION.** ✅ **`OrderCard.tsx` is the one clean signal: its `21 ++-` is entirely this task.** 🔴 **Nothing is committed.**

## D6b. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

⚠️ **AND `tsc`-CLEAN PROVES NOTHING ABOUT A LAYOUT FIX — a Tailwind class is a string to the compiler.** **`flex-wrap`, `min-w-0` and `truncate` would all compile if misspelled, and a misspelled utility silently does nothing.** 🔴 **Nothing was rendered: the fix is verified by reading the cascade, not by seeing it.** **The one-tap check is order #16 on the iPad it was observed on.**

---

# PROVENANCE

**READ** — the whole Adjust-time row before and after · the card root's `overflow-hidden` at `OrderCard.tsx:965` · the `px-4` section at `:1088` · the orders grid's column classes · both changed printing strings and the third left in place · the four-surface sweep for user-visible "due" · both censuses · the byte scan · `git diff` restricted to the two files · `git diff --name-only` for `action/route.ts` · `git status`, `git diff --stat`, `tsc`.

**INFERRED** — every width figure in A6 (**class arithmetic at `text-xs`, nothing rendered**) · that the caption fits comfortably on its own wrapped line · that iPhone portrait is borderline for a single line · that wrapping costs ~18 px of card height.

**NOT VERIFIED** — 🔴 **nothing was rendered.** The clip is not confirmed fixed; it is confirmed *addressed*, by removing the only two reasons the row could not yield. **Order #16 on the iPad is the check.**
