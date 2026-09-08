# WhatsApp go-live — tile heading rename

**4 September 2026. Same branch, same working tree. NOTHING committed, staged, pushed, deployed or cap-synced. Native binary untouched. `git add -A` / `git add .` never run. Live production commit is still `2ca66cd`.**

**Method:** 🔎 **SOURCE-READ** = read/edited and quoted. 🧪 **EXECUTED** = I ran it. Task 4's parity, row-count and render checks were **executed against copies of the real edited modules**, not read. **I rendered nothing in a browser.**

---

# TASK 1 — the rename

## The count, taken BEFORE any edit

🔎 **`'Social media auto-replies'` appeared EXACTLY ONCE, repo-wide.**

| Location | What it was |
|---|---|
| `app/landing/page.tsx:199` | The `<h3>` inside the `does-item` tile — the heading itself |

**Patterns I searched**, across `app/`, `components/` and `lib/` (stating them because an empty grep is not evidence of absence):
1. `Social media auto-replies` — exact, case-sensitive → **1 hit** (the heading).
2. `social media` — case-**insensitive**, to catch casing/spacing variants → 10 hits, **9 unrelated**: share/preview-card comments (`venues/[slug]/page.tsx:65`, `trucks/[slug]/page.tsx:37`), an events EmptyState (`manage:8038`), a Footer disclaimer, and the Settings card's own reasoning comments (`manage:9652`, `9684-9685`) plus its description string (`manage:9688`).
3. `Social` — bare, to catch `Socials` / `Social auto-replies` → same set, no new renameable string.

⚠️ **One adjacent surface I did NOT touch, reported rather than swept:** `app/manage/[token]/page.tsx:9688` — the Settings card description, *"Answer customer questions automatically **on your social media**, using your menu and schedule."* It is a different string on a different surface, its own comment already records it as *"FORWARD-LOOKING"*, and this task scoped the tile heading. **Flagged so it is a decision, not an oversight.**

## Does anything derive, merge or map on this heading? 🔎 **No.**

This is the check that `lib/landing-table.ts` failed last time — a label that was **merged** rather than matched. I checked every name-keyed structure in the codebase:

| Structure | File | Contains the heading? |
|---|---|---|
| `ROW_FEATURE_MAP` | `plan-features.ts:587` | ❌ no |
| `NAME_OVERRIDES` | `landing-table.ts` | ❌ no (and now empty) |
| `DETAIL_OVERRIDES` | `landing-table.ts` | ❌ no |
| `HIDDEN_ROWS` | `landing-table.ts` | ❌ no (and now empty) |
| `isRowComingSoon()` / `MESSENGER_INSTAGRAM_ROW` | `manage:8439` | ❌ no — keyed on `'Messenger & Instagram auto-replies'` |
| `trialFeatureValue()` | `landing-table.ts` | ❌ no — matches other row names |
| `FOOTNOTE_TEXT_OVERRIDES` | `landing/page.tsx:74` | ❌ n/a — keyed on footnote **number** |

🟢 **And structurally it cannot be a key:** the tile is a **JSX literal**, not a row in `FEATURE_SECTIONS`. `does-item` appears only as a `className` and in `landing.css` (`.does-item h3` styles it); **nothing reads the `<h3>` text as data**. 🟢 **The rename therefore disarms nothing.**

## 🔴 One thing the rename CREATES, and it is worth knowing

The heading is now **`'WhatsApp auto-replies'` — byte-identical to the matrix row label, which IS a `ROW_FEATURE_MAP` key.** Nothing breaks today (the tile is still a literal nobody looks up), but the string now lives in **two places with completely different jobs**: presentational copy on the landing, and a load-bearing key in the parity map.

⚠️ **A future find-and-replace across both would silently drop the row from `findPlanParityViolations()`** — the exact trap this codebase documents. Recorded in the comment at the site: *rename by hand, not by sweep.*

## The change

**Before:** `<h3>Social media auto-replies</h3>`
**After:** `<h3>WhatsApp auto-replies</h3>`

**Body paragraph unchanged, verbatim, including the closing clause:**
> `“Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon.`

🟢 **Grid confirmed after the change: SIX tiles, and the tile is still THIRD.** Executed count `grep -c 'className="does-item"'` = **6**; order is Kill the queue · Never promise a time you can't hit · **WhatsApp auto-replies** · Works on any device · Never type your schedule twice · No signal? Keep serving.

🟢 **The reasoning matches the precedent you cited**, which is already in the codebase: the Settings card is named `"Auto-replies"` and its comment says *"🔴 NOT 'Socials': … a 'Socials' card containing one messaging channel would be naming a category the product does not have."* The tile now follows the same rule. WhatsApp is messaging, not social media.

# TASK 2 — the forward decision, recorded once, at the site

🔎 Added to the **existing** comment block immediately above the heading — **one location, not restated anywhere else.** Verbatim:

> `🔴 FORWARD DECISION, WITH ITS CONDITION: rename this to "WhatsApp, Messenger and Instagram auto-replies" WHEN Messenger and Instagram are actually built — not when they are scheduled, submitted or approved. They are verify-handshake stubs today. Renaming earlier re-makes the category promise this change removed.`

It sits alongside a one-line note that the heading is presentational and in no map (the collision warning above). **No comment was added anywhere else, and the decision is stated in exactly one place.**


# TASK 1b — footnote 6 added to the pricing section (mid-turn instruction)

🔎 The **matrix row** already carried `footnote: '6'`, but the **pricing-card bullet is a separate hand-written literal** and showed no marker. Added:

**Before:** `<li>WhatsApp auto-replies</li>`
**After:** `<li>WhatsApp auto-replies<sup className="f-note">6</sup></li>`

🔎 **Why `.f-note` and not a new style:** the pricing cards had **no numbered-footnote precedent** — I checked every bullet in all three cards, and the only superscript in that section is `<sup className="fee-star">*</sup>` on the allowance line, explained by its own paragraph directly beneath the cards (`:451`). `.f-note` is the class the **comparison table** already uses for row footnotes (`landing.css:457`), so the `⁶` renders in the established footnote style and resolves to the numbered list under that table, on the same page.

🔴 **Recorded at the site, because it is a real duplication:** these bullets are literals, **not** rendered from `FEATURE_SECTIONS`, and nothing checks the two against each other — the manual's *"a hand-written bullet on the pricing card is a literal twin of the matrix row, with nothing checking the two"*. **If footnote 6 is renumbered or retired, this marker must move with it; it will not error, it will point at the wrong note.**

⚠️ **I did NOT add a `⁴` to the Messenger & Instagram bullet.** Its matrix row carries `footnote: '4'`, so the card and the table now differ on that row. You asked for footnote 6 on WhatsApp only, so this is left as a decision for you rather than swept in.

# TASK 3 — footnote 6

🟢 **Untouched. It stands exactly as implemented, and I am not re-raising it.** Ruling noted: the distinction expires on 1 October and the wording is deliberately not differentiating.

Current text, unchanged and unmoved (`number: '6'`, nothing renumbered):
> `Auto-replies require a WhatsApp Business account. Meta bills you directly for these messages — check Meta's current pricing. Responses are AI-generated and can occasionally be wrong.`

# TASK 4 — re-verification 🧪

**Executed against copies of the real edited modules** (`plan-features.ts`, `features.ts`, `landing-table.ts`, aliases rewritten to relative paths, `node --experimental-strip-types`, `NODE_ENV=production` so the module-load guard logs rather than throws):

```
findPlanParityViolations(): 0 violations
ROW "WhatsApp auto-replies"              starter=—  pro=✓            max=✓            fn=6
ROW "Messenger & Instagram auto-replies" starter=—  pro=Coming soon  max=Coming soon  fn=4
auto-reply rows printed by the landing table: 2 (TWO — not merged ✅)
```

- 🟢 **`findPlanParityViolations()` → 0 violations.**
- 🟢 **The landing table prints TWO separate auto-reply rows, not a merged one** — verified by calling `visibleRows()` and `rowName()`, the same helpers the landing and the PDF call, rather than by reading the file.
- 🟢 **Matrix row label byte-identical to its `ROW_FEATURE_MAP` key:** `md5` of `name: 'WhatsApp auto-replies'` from `HEAD` and from the working file both **`18eac6d7a89a8d130e4044e78fddcdae`**; `'WhatsApp auto-replies': 'whatsapp_replies'` present at `plan-features.ts:587`.
- 🟢 **`tsc --noEmit`: clean.**

## The tree

🟢 **`HEAD` is still `2ca66cd`.** Nothing committed, nothing pushed, nothing deployed, no cap sync, native binary untouched.
🟢 **Nothing staged** — `git diff --cached --name-only` is empty. No `git add` of any form was run in this session.

**Cumulative — the five workstream files (including the Task 1b pricing marker):**
```
 app/landing/page.tsx          | 59 ++++++---
 app/manage/[token]/page.tsx   | 71 ++++++++----
 lib/landing-table.ts          | 48 +++++---
 lib/meta/webhook-signature.ts |  7 ++-
 lib/plan-features.ts          | 68 ++++++++---
 5 files changed, 194 insertions(+), 65 deletions(-)
```

🟢 **Pre-existing work byte-for-byte unchanged** — diffstat re-checked and **identical to every previous check**:
```
 app/o/[slug]/page.tsx                 | 64 ++++-----      ← order scan-route rename
 components/EventListCard.tsx          | 14 ++---          ← derivation extraction
 ios/App/App.xcodeproj/project.pbxproj |  2 ++             ← native project file
 lib/custom-domain/copy.ts             |  9 ++--           ← order rename
 proxy.ts                              | 10 ++-            ← order rename
 vercel.json                           |  9 +++            ← order rename
 6 files changed, 52 insertions(+), 56 deletions(-)
```
🟢 **Untracked still untracked and unstaged:** `app/order/[id]/page.tsx`, `app/admin/outreach/`, `app/api/admin/outreach/`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, the five migrations, the docs and CSVs.

**Whole tree:** `12 files changed, 805 insertions(+), 125 deletions(-)` — the five above, the six pre-existing, and `docs/reference-manual.md` (the V12.2 delta, 569 insertions).

⚠️ **Staging discipline still decides the blast radius.** A selective commit of the five workstream files ships only WhatsApp. A broad commit ships the customer-facing order rename and the derivation extraction in the same deploy — and because both Capacitor shells load production remotely, that reaches the shipped iOS app and the mid-review Android listing with no rebuild.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **I rendered nothing in a browser.** The tile's position, heading and the compare table are confirmed by executing the modules and counting the JSX — **not by seeing the page.** The visual check is yours.
- 🔴 **No admin session was obtained and none was attempted.** **Admin → Features** renders `FEATURE_SECTIONS` and `FOOTNOTES`, so it is affected by this workstream, but I am **not** claiming it renders correctly — that is a statement I can only make about code. Confirming it needs your session.
- 🔴 **Meta's dashboard and Meta's per-country rates** — unreachable/unread, unchanged from the previous report. Nothing in this task depended on either.
- 🔴 **Vercel's deployed commit / auto-deploy setting** — unread. Nothing here is deployed either way.
- ⚠️ **The Settings card description at `manage:9688`** still says *"on your social media"*. I did not change it — out of scope for this task — so whether it follows the heading is an open decision, not a completed one.

# FLAGS

- ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**
- 🔴 **New string collision created by the rename** (reported above, and recorded in the comment): the tile heading now equals the `ROW_FEATURE_MAP` key `'WhatsApp auto-replies'`. Harmless today; a sweep-rename across both would silently disarm the parity check for that row.
- ⚠️ **`manage:9688` "on your social media"** — same category-naming issue as the heading just fixed, on the Settings card description. Left untouched and flagged.
- 🟢 **Footnote 6 not re-raised**, per instruction.

*Nothing committed. Nothing staged. Nothing deployed. HEAD = 2ca66cd.*
