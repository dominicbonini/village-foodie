# Landing features table — move `Take payment on your phone`, footnote it, reword the order-domain
# row, and remove the app line from the footer

**Files changed — TWO, and only these two:**
`lib/plan-features.ts` (the table data) and `app/landing/page.tsx` (the footer).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `log` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

⚠️ **COPY AND DATA ONLY. No component, no renderer, no gate and no tier value changed.** The four
asks were a row move, a footnote, a wording change and a footer deletion.

---

# 1 — THE MOVE

## Where it was

```ts
      { name: 'Online payments', footnote: '2', detail: 'Take card payment upfront when customers order online, via Stripe.', … },
      { name: 'Take payment on your phone', detail: '…', starter: false, pro: 'coming_soon', max: 'coming_soon' },
```

It sat **immediately after `Online payments`, among the SHIPPED payment rows** — the only
`coming_soon` row in that run.

## Where it is now — line 161, inside the coming-soon block, immediately before `Advanced reporting`

```ts
      // Coming soon (kept at the bottom of the section)
      { name: 'Messenger & Instagram auto-replies', footnote: '4', … },
      { name: 'Take payment on your phone', footnote: '1', detail: '…', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'Advanced reporting', detail: '…', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'SMS order alerts', detail: '…', starter: false, pro: 'coming_soon', max: 'coming_soon' },
```

✅ **EXECUTED — that block is a real, commented block in the file** (`// Coming soon (kept at the
bottom of the section)`) **and every row in it is now `coming_soon`, which was not true before.**
✅ **The row moved WITH its comment block.** The five lines explaining why it is neither
`Walk-up order processing` nor `Online payments` travelled with it; nothing was orphaned above
`Online payments` pointing at a row that had left.

⚠️ **`Advanced reporting` was NOT enumerated in any earlier task, so it was located first, not
assumed** — `lib/plan-features.ts:162`, and its `ROW_FEATURE_MAP` entry at `:297`.

| Not changed by the move | State |
|---|---|
| `starter` | ✅ `false` — untouched |
| `pro` | ✅ `'coming_soon'` — untouched |
| `max` | ✅ `'coming_soon'` — untouched |
| `detail` | ✅ untouched |
| `name` | ✅ untouched — 🔴 **and `name` is the `ROW_FEATURE_MAP` key, so changing it would have been a functional change, not a copy one. It was not touched** |

🔴 **THE ROW HAS NO `id` FIELD.** The brief that created it named `tap_to_pay`; this file keys rows
by `name` and has no `id` anywhere. That was true when the row was written and is unchanged here.

# 2 — FOOTNOTE 1

```ts
      { name: 'Take payment on your phone', footnote: '1', …
```

**Footnote 1 is the card-fee footnote**, and the file says so in its own words at the footnote
definition:

```
    number: '1',
    // 🔴 THIS FOOTNOTE IS THE ONE PLACE THE WALK-UP DETAIL LIVES. … Every fact here — the in-person
    // rate, the UK/EEA limit, the tap surcharge and "coming soon" — appears EXACTLY ONCE across the
    // whole surface, and this is that once.
```

✅ **Pointing at it is therefore consistent with its own rule rather than in tension with it** — this
row takes a card **in person**, so it is governed by exactly those facts, and it **points** at them
instead of restating any of them. **No fact was copied out of footnote 1 into the row's detail.**

⚠️ **`Walk-up order processing` still carries footnote 1 as well.** Two rows sharing one footnote is
already the file's convention — `WhatsApp auto-replies` and `Messenger & Instagram auto-replies`
both carry `footnote: '4'`. **Nothing about footnote 1's text changed.**

# 3 — `Order page on your own website`

| | Detail |
|---|---|
| Before | `Your ordering page at your own web address, so customers stay with you.` |
| ⚠️ Interim | `…runs at your own web address instead of ours.` — **written, then replaced within this same turn** on your correction that you may well still keep it on ours |
| ✅ Now | `Your ordering page available at your own web address, under your own name.` |

**76 characters — inside the 48–96 the rest of that section runs.**

| Constraint | Held? |
|---|---|
| Drops `so customers stay with you` | ✅ **gone — 0 occurrences in the file** |
| 🔴 Promises no embed | ✅ **no "built into your site", no "embedded", no "inside your website"** |
| 🔴 Does not say it stops being on ours | ✅ **"instead of ours" was removed the moment you said so. The line now says only where it is ALSO available, and claims nothing about what happens to the current address** |
| Tier values | ✅ untouched — `starter: false, pro: false, max: 'coming_soon'` |

# 4 — THE FOOTER LINE

```diff
           <div className="foot-base">
             <span>© 2026 HatchGrab</span>
-            <span>iPhone and iPad apps coming soon</span>
             <span className="vf">From the people behind <b>Village Foodie</b></span>
```

✅ **EXECUTED — `grep -c "iPhone and iPad" app/landing/page.tsx` returns 0.** The footer no longer
mentions the apps in any form.

⚠️ **THE COMMENT ABOVE IT WOULD HAVE BEEN LEFT DESCRIBING A LINE THAT NO LONGER EXISTS**, so it was
rewritten rather than deleted: **the badge rule it carried (text only, no App Store or Google Play
badge, no logo, no link, and "coming soon" never "available") still binds anything that brings the
line back**, and it now says that instead of describing a present line.

**Layout — checked, not assumed:**

```css
.hg-landing .foot-base { … display: flex; flex-wrap: wrap; gap: .6rem; justify-content: space-between; … }
```

✅ **No `nth-child`, no grid template, no count-dependent rule anywhere** (`app/landing/landing.css:329`,
and `:347` only switches to `flex-direction: column` on narrow). **Two spans simply sit at the two
ends instead of three across.** ⚠️ **Nothing else in the footer moved** — the links row above is not
in the diff.

🔴 **THE MAX/PRO BULLET LISTS WERE NOT TOUCHED.** `app/landing/page.tsx` still carries
`<li>Take payment on your phone <span className="soon-inline">Coming soon</span></li>` and the order-page
bullet beside it. They are hand-written and **not derived from the table**, so the row move does not
move them — and you asked about the features table and the footer, not the bullets.

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.**

| Claim | Method |
|---|---|
| **Plan parity still holds** | ✅ **EXECUTED** — `findPlanParityViolations()` run against the edited file: **`PARITY: 0`, empty array.** ⚠️ It only fires on `row[tier] === true`, so a `coming_soon` row is *structurally* incapable of violating it — the run proves nothing was broken elsewhere, not that this row was checked |
| The row's position | ✅ **EXECUTED** — re-read at `:161`, between `Messenger & Instagram auto-replies` and `Advanced reporting` |
| `footnote: '1'` present | ✅ **EXECUTED** — re-read from the file |
| Old wording gone | ✅ **EXECUTED** — 0 occurrences of `so customers stay with you` and 0 of `instead of ours` |
| Footer line gone | ✅ **EXECUTED** — `grep -c` = 0 |
| `.foot-base` has no count-dependent CSS | ✅ **EXECUTED** — the whole rule read, both rules that mention it |
| Types | ✅ **EXECUTED** — `npx tsc --noEmit` exits 0 |
| Lint | ✅ **EXECUTED** — `npx eslint app/landing/page.tsx lib/plan-features.ts` prints **nothing, 0 findings**, before and after |
| **Rendered** | 🔴 **NO. Nothing was rendered or measured** — no `next dev`, no `next build`, no browser. **Every claim above is source-read or EXECUTED tooling, not a screenshot.** The table's visual order follows array order in the renderer, which was read, not seen |
| 🔴 **The dashboard** | ✅ **NOT TOUCHED. Neither edited file is on Pizzeria Gusto's trading path** — `lib/plan-features.ts` is the marketing table plus the parity checker, `app/landing/page.tsx` is the public landing page. **No dashboard or KDS file is in this diff** |

## ⚠️ ONE THING SEEN AND DELIBERATELY NOT CHANGED

The moved row's detail contains the **literal JS escape** `don’t`, not a literal `’`, while its
neighbours use a literal `’` (`what’s`). ✅ **It is pre-existing — it is on a `+` line relative to
HEAD from the task that created the row, and this turn did not author it.** It compiles to the same
character. **You did not ask about it, so it was left alone and is reported instead.**

---

# INTEGRITY

## `lib/plan-features.ts`

```
BEFORE   bytes 25,910
AFTER    bytes 26,498   chars 25,989   lines 340
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 12 distinct classes before, 12 after. NO NEW CLASS, NONE REMOVED.**
**Carrier-aware: `U+26A0` n=19, 19 paired, ✅ 0 bare. Total `U+FE0F` = 19 — no other
emoji-presentation base occurs.**

## `app/landing/page.tsx`

```
BEFORE   bytes 36,189
AFTER    bytes 36,181   chars 35,687   lines 522     (−8 bytes — the deletion, less the longer comment)
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 19 distinct classes before, 19 after. NO NEW CLASS, NONE REMOVED.**
**Carrier-aware: `U+26A0` n=13, 13 paired, ✅ 0 bare. Total `U+FE0F` = 13.**

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
?? docs/landing-features-move-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/screen-sound-fix-report.md
?? docs/splice-verification-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M lib/plan-features.ts` | ⚠️ **pre-existing `M` — it was already modified by the two row-adding tasks; THIS TASK wrote to it again** |
| 🔴 `M app/landing/page.tsx` | ⚠️ **pre-existing `M` — same; THIS TASK wrote the footer deletion into it** |
| 🔴 `?? docs/landing-features-move-report.md` | 🔴 **THIS TASK** — this file |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
