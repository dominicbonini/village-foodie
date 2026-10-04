# Event types v3 — editable Standard, one column per van, and the app's own controls

**Branch:** `event-types` (confirmed with `git branch --show-current` before every commit).
`main` and `schedule-graphics` untouched. **Nothing deployed. No SQL was run — and this build needs
none.** Village Spice / Pizza Kitchen only; Pizzeria Gusto was not touched, read or used. No keys
printed.

**Nothing in any of the four briefs arrived garbled.** One instruction conflicted with another and I
stopped and asked — §1. Two others conflicted with facts in the codebase rather than with each other;
both are recorded below with what I did and why.

---

## 1 · 🔴 THE ONE THING I STOPPED AND ASKED ABOUT

The row list named the order-ready row **`"Mark ready" step`**, and the same section said every label
must come from **the source string Settings or the dashboard already uses**. For four of the five rows
those agree. For this one they did not: the existing string — rendered by Settings *and* by the setup
wizard's review screen from `SETTING_COPY.orderReady.label` — is **`Order-ready step`**. The brief's
wording appears nowhere in the product as a label; it exists only inside that setting's own help text.

I put the three options to you with their blast radius. **You chose: use `Order-ready step` from
`SETTING_COPY.orderReady.label` everywhere, rename nothing, add no second constant.** That is what is
built.

---

## 2 · THE FIVE ROWS, AND WHERE EACH ONE IS STORED

You asked for this list explicitly. **Exactly one row is truck-level.**

| Row | Label comes from | Stored | Standard writes |
|---|---|---|---|
| Collection times | Settings › Kitchen sub-card heading | **per van** — `truck_vans.collection_interval_mins` | `update_van_settings` |
| Order-ready step | `SETTING_COPY.orderReady.label` (Settings + wizard) | **per van** — `truck_vans.order_ready_enabled` | `update_van_settings` |
| Do you take cash? | Settings › Order settings | 🔴 **per TRUCK** — `trucks.takes_cash` | `update_truck` |
| Offline order protection | Settings › Kitchen card heading | **per van** — `auto_pause_on_offline` + `offline_protection_mode` | `update_van_settings` |
| Remind me to add a buzzer | the dashboard's buzzer card title | **per van** — `truck_vans.buzzer_count` (see §5) | `update_van_settings` |

Every label is now a constant in `lib/copy/serviceSettings.ts`, imported by `SERVICE_ROWS`, by the
modal, by the dashboard card **and by Settings itself** — so the three screens cannot word one setting
three ways, which is what they were doing. The harness reads the compiled array and fails on a literal.

**The split is not a list kept beside the code.** `SettingRow` asks `standardWriteFor(row).scope`,
which is the same function that picks the action — so "is this truck-level?" and "what does it write?"
cannot disagree.

---

## 3 · THE MODAL, AS IT NOW STANDS

**One column per active van, oldest first.** One van ⇒ a single "Standard" column. Two or more ⇒ one
column each, headed with the van's name and a small "Standard" tag. The route orders by `created_at`
ascending, so the columns cannot reorder between loads.

🔴 **The columns exist whether or not the vans agree.** That is the rule that stops the layout jumping:
equalise two vans and nothing moves. An earlier pass grew per-van controls only when values differed,
so changing one value re-flowed every row below it. The render harness asserts that two matching vans
and two differing vans measure **identically**, and that a second van adds **exactly one column width**.

**"Do you take cash?" has its own switch in every van column.** It had spanned them, which left one
switch under the first van's header and nothing under the second's — your report, and it was right. It
is still one setting: each switch shows the same value, writes the same `update_truck` call, and
carries the hover title **"Applies to all your vans"**, which is now the only thing explaining why
flipping one flips the other.

**No "Varies by van", no "Set per van", no "Same as Standard" — anywhere.** Three passes of this build
each drew one of those phrases in a cell instead of a value. Every cell is now a real control at a
real value. A type that has set nothing shows the **first van's** value, faded, with the hover title
**"Follows each van's usual setting"**. Touching it sets an explicit value for every van at events of
that type. The harness checks the three phrases are absent from the source *and* the render harness
checks them against the **rendered text**, which is the stronger of the two.

**No "Settings" links.** Every Standard value is changeable in the modal.

**Dividers, no colour coding.** A `border-l border-slate-100` on every cell right of the labels —
header included — in the same colour as the row dividers. The Standard tint is gone, so the small
"Standard" tag is now load-bearing rather than decorative, and is asserted.
⚠️ The two full-width section headings (SERVICE, USED BY) and the truck-wide "Everything else" cell are
the only rows the vertical line does not cross, because they genuinely span every column.

**Match Standard** in each type's ⋯ menu (Rename · Move left · Move right · Match Standard · Delete)
sets every setting on that type back to NULL after a confirm. It sends `blankTypeValues()` — the same
starting state `create` uses — so a setting added in a later stage is reset by it without an edit here.

**Footer**, exactly as briefed, with "Changes save as you go." kept and "Grey = same as Standard" gone.

**Size.** Label column **212px**, every value column **168px**, the dialog is its content's width
capped at `min(1000px, 100%)`, and the columns scroll sideways inside it beyond that. 212 is a
**measured floor**, not a guess: at 206px "Remind me to add a buzzer" wraps to two lines, and the
render harness counts the label's rendered lines at every width in both engines.

---

## 4 · 🔴 WHY THE DROPDOWN TEXT REALLY WAS BIGGER — AND WHY THE FIX IS NOT WHERE YOU'D EXPECT

You said *"the size of text eg every 15 min is much larger than elsewhere"*. It was: **16px against the
labels' 14px**. I measured it rather than guessed, and the cause is not in this feature at all.

`app/globals.css` carries an **iOS Safari zoom guard**:

```css
/* Prevent iOS Safari auto-zoom on input focus */
input[type="text"], …, select, textarea { font-size: 16px !important; }
@media (min-width: 640px) {
  input[type="text"], …, select, textarea { font-size: inherit !important; }
}
```

`!important` beats the `text-sm` class on the `<select>`. So from 640px up every select takes
**`inherit`** — its *parent's* size — and with no size on the parent the chain ran to `<body>` and
landed on 16px. **Every `<select>` in Manage behaves this way**; the modal only made it obvious by
putting one next to a 14px label.

🔴 **So the size went on the wrapper, not the control.** From 640px up the select now inherits 14px and
matches its label. **Below 640px it is still forced to 16px and iOS still does not zoom on focus** —
which is correct on the one device this is used on at the hatch, and I have deliberately not "fixed"
it to match. The render harness asserts **equality at 1440 and 820** and asserts the **guard** at 390;
asserting equality at 390 would be asserting the guard away.

---

## 5 · 🔴 THE BUZZER ROW: NO STOP WAS NEEDED, BUT THERE IS A MISMATCH YOU SHOULD KNOW ABOUT

You said to bind Standard to whatever control Settings uses to turn buzzers on/off for a van, **and to
STOP if there were no such action**. There is one — Settings › Your trucks renders a toggle whose click
is `updateVanSetting(van.id, 'buzzer_count', van.buzzer_count == null ? BUZZER_DEFAULT_COUNT : null)`.
Standard's switch now makes **that exact call**, so no STOP was required and no new save path was added.

⚠️ **But the row's two columns are not the same setting, and you should decide whether that matters.**
The row is labelled with the dashboard's phrase, "Remind me to add a buzzer", which is the per-event
**prompt** (`truck_events.buzzer_prompt`) — and that is what a **type's** cell writes
(`event_types.buzzer_prompt`). **Standard's** cell writes `truck_vans.buzzer_count`: whether the van has
a rack at all.

It is defensible: Standard's *displayed* value was already derived from `buzzer_count !== null`
(lib/buzzer.ts's rule — no rack, nothing to prompt for), so binding the control to the same column
makes the cell's display and its control agree, where before the display came from one place and there
was no control. The alternative — a truck-level prompt column — is a migration and a new setting, which
is not this build. **If you want them to be the same setting, that is the next stage and it needs SQL.**

---

## 6 · "NO SECOND SAVE PATH", LITERALLY

The modal does not fetch `/api/manage` itself. The page passes it **its own `api` function** —
`manageApi={api}`, one attribute on the existing one-line mount. Same action names, same payload
shapes, same validation, same `nativeAuthHeader()` (a fetch written inside the component would 401 in
the native app).

⚠️ **"Same as Van 1" does not exist on this branch.** You asked for Standard to save through Settings'
fan-out rules *"'Same as Van 1' included"* — that mechanism is entirely a `schedule-graphics` feature
(`same_as_first_van` has **zero** matches in `app`, `lib`, `components`, `supabase` here). Because the
modal calls `update_van_settings` itself rather than writing a second path, **every rule that action
has — including the Van 1 fan-out once the branches meet — applies automatically, with nothing to
change in this file.** That is the whole benefit of the constraint you set.

The payload keys are checked **against Settings' own calls in `page.tsx`**, not retyped: that handler
drops a key it does not destructure **silently**, so `autoPauseOnOffline` vs `auto_pause_on_offline`
is a green save that wrote nothing, and reading the real caller is the only check that notices.

---

## 7 · THE CONTROLS ARE THE APP'S CONTROLS

There were **three** switch definitions in the product. Manage's lived in `page.tsx`; the dashboard's
is exported from `OrderCard.tsx`; and both the Event types modal **and** the dashboard's "This event"
card had written their own. Worse, the modal's copy was the *dashboard's* geometry and orange inside a
**Manage** screen, and the card's was `w-[42px]`/orange-600 where both dashboard surfaces behind it are
`w-11`/green-500 — so the card was the odd one out on its own screen.

| | Before | Now |
|---|---|---|
| Manage's switch | defined in `page.tsx` | **moved to `components/manage/primitives.tsx`**; page.tsx imports it (15 usages unchanged) |
| The modal's switch | its own, orange, 42px | **the shared `<Toggle>`** |
| The dashboard card's switch | its own, orange, 42px | **`OrderCard`'s `Toggle`**, which gained an optional `ariaLabel` |
| The modal's dropdowns | its own `rounded-lg px-2.5 h-9 text-[13px]` box | **a shared `<Select>`** |
| The box itself | the same class string inline **8× in Manage and 6× on the dashboard** | **`CONTROL_BOX` in `lib/ui-tokens.ts`**, which both surfaces already share |
| The card's select | `border-slate-300 rounded-xl px-2.5 h-10 font-semibold` | `CONTROL_BOX` + its own width rule |
| The card's primary button | raw `bg-orange-600`, no hover | **`ORANGE_SOLID`** (the shared token, which supplies the hover) |
| Section headings | a one-off `text-[11px] … tracking-[0.06em]` | **`SUBCARD_HEADING`** — Settings' own token |
| Name boxes | two local inputs | **the shared `<Input>`** (which gained `maxLength`, so the 40-character cap survived) |

The harness's form of this is **"no control look is defined in this file"** — comparing class strings
between two files passes a *correct copy*, and a correct copy still drifts.

### 🔴 The one thing with no existing equivalent — you asked to be told

You asked for *"the same select/dropdown component and styling as Settings (not native browser selects
with the system arrows)"*. **Settings has no such component: every `<select>` on the Manage page is
native, with the platform's own arrow.** The only non-native select in the repository is in
`AddOrderPanel.tsx`.

So the shared `<Select>` reconciles the two halves: the **border, radius, padding, text size and focus
ring are Settings' own** (the string eight of its selects already share), and `appearance-none` plus an
inline chevron **on the right** replaces the system arrow, following the AddOrderPanel precedent rather
than inventing a style. **Settings itself still renders native selects** — converting all of them is a
Manage-wide visual change nobody asked for. The two therefore differ in their **arrow and nothing else**.

**Two other gaps, named rather than silently closed:**
- The **Cancel** button in the card's type-switch confirm (`bg-slate-100 text-slate-700`) has no token;
  `BTN_COLOURS.slate` is a solid slate-500 button, which is a different thing.
- `EventTypeSelect` (the Add event picker) and `EventTypeDashboardControl` — the other two exports in
  `EventTypes.tsx` — still have their own `<select>`s. They are different surfaces and were not in
  scope; one already matches an existing page variant, the other (`page.tsx` line ~1321) is a one-off.

---

## 8 · THE CHECKS

### `scripts/event-types.cjs` — **122 checks, 42 broken variants, all 42 fail as required**

Every rule you set has a check and a variant. The variants that matter most:

| | What it breaks |
|---|---|
| **V23** | Standard gets its own `fetch` to `/api/manage` — a second save path, with no validation |
| **V24** | a van payload key goes snake_case, which `update_van_settings` **drops silently** |
| **V25** | Standard writes only the first van |
| **V26** | the van columns appear only when the vans differ, so the layout jumps on a save |
| **V26b** | a van column writes **every** van |
| **V26d** | the truck-level row spans the columns again, leaving the second van with no switch |
| **V30** | the column dividers vanish |
| **V31** | "Varies by van" comes back in place of a real value |
| **V33** | the dropdown's size leaves the wrapper, so `globals.css` forces it back to 16px |
| **V34** | the chevron renders inline, before the text |

🔴 **A baseline bug this build found and fixed.** The before/after comparison pinned `headWorktree('et',
'HEAD')` — "whatever was last committed" — so the baseline moved every time the branch gained a commit.
By this stage HEAD *was* the tree being compared against, and two premise checks went red to say so.
The ref is now pinned to **`9d3ecb8`** (stage 1 — the last tree with the resolver but without offline
protection), and those two checks assert that premise rather than trusting the line.

### `scripts/event-types-render.cjs` — measured, Chromium **and** WebKit

**1440 / 820 / 390 × {1, 3, 6} types × {one van, two matching, two differing}** — 54 renders per engine.
Measured, not grepped:

- the dialog is its content's width below the cap, and caps at `min(1000px, 100%)` above it;
- **two matching and two differing vans render identically** (no layout jump);
- a second van adds **exactly one column width** — measured on the grid, which is uncapped, because at
  820 and 390 the dialog is capped by the viewport and comparing dialogs says nothing;
- every cell is one column wide; the truck-level row is **one cell per van**, not a span;
- **a dropdown's computed font size equals a row label's** at 1440/820, and the **16px iOS guard holds
  at 390**;
- the chevron's left edge is past the middle of its box (an inline chevron lands at the far left);
- a divider on every column boundary, header included;
- the longest label renders on **one line** (counted from the text node's client rects — an earlier
  version divided the *padded cell* height by the line height and reported a wrap that was not there);
- the three retired phrases appear in **no rendered text**.

**16 screenshots** in `docs/screenshots/event-types/`: `modal-{1440,390}-{one,match,differ}-{chromium,webkit}.png`
plus the four single-surface ones. ⚠️ They are renders of fixtures built from the real class strings,
**not** captures of a running dashboard — that needs a database and a live truck, which this harness
must never touch. Every class and every number in the fixture is **lifted from the component**, so each
time this build changed shape the fixture stopped *building* rather than going on measuring a screen
nobody is served.

### The rest

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npm run build` | **exit 0** |
| ESLint, **added lines only** | **0 findings** |
| Line-level multiset diff, `app/manage/[token]/page.tsx` | 11,372 → 11,363. **15 lines left, 7 of them present in a file they moved to, 8 accounted for one-for-one by the 6 new lines** (the import gained `Toggle`; the `Toggle` definition moved to primitives; the mount gained `manageApi`; three labels became constants). **Nothing lost.** |
| Line-level multiset diff, `app/dashboard/[token]/page.tsx` | **5,327 → 5,327. Zero lines changed** — the dashboard page was not touched; only `ThisEventCard` and `OrderCard` were. |
| Every harness that compiles a changed file | 10 run, all green: `event-types`, `event-types-render`, `collection-times-hint`, `slot-interval-event-override`, `slot-interval-van-list-tolerance`, `slot-interval-settings`, `batch-reservation-edit-lock`, `add-order-render`, `printing-network-guard`, `printing-gating`. The full sweep was **not** run, as instructed. |

**One harness assertion was updated and it is worth naming.** `slot-interval-settings.cjs` pinned the
literal `>Collection times</p>` in Settings. That heading is a shared constant now, so the check asserts
**both** that Settings renders it from `SERVICE_SETTING_LABELS` **and** that the constant still reads
"Collection times" — stronger than what it replaced, which could only ever have told you about one screen.

---

## 9 · SQL

**None.** This build adds no column, changes no column and runs nothing. The only SQL in the feature is
the stage-2b migration `supabase/migrations/20261010_event_types_offline.sql`, which is unchanged,
still unrun, and reproduced in `docs/event-types-stage2b-report.md` §8.

---

## 10 · WHAT TO TEST ON LOCALHOST

⛔ **Village Spice or Pizza Kitchen only.** Not Pizzeria Gusto.

**One van**

1. Schedule › Event types. One **"Standard"** column, then one per type. Every column the same colour;
   a thin divider between each pair, running through the header.
2. Change **Collection times** in the Standard column. Open Settings › Kitchen — the van's value changed.
   Change it back in Settings, reopen the modal — it followed.
3. Same for **Order-ready step**, **Offline order protection**, **Remind me to add a buzzer** (this one
   is the buzzer *rack* toggle in Settings › Your trucks — see §5) and **Do you take cash?** (Settings ›
   Order settings).
4. Every dropdown: chevron on the **right**, nothing before the text, and its text the **same size** as
   the row label beside it.

**Two vans — set them to the SAME values first**

5. Two columns appear, headed with each van's name and a small "Standard" tag. Nothing is tinted.
6. **Do you take cash?** has a switch in **both** columns. Flip one — the other follows. Hover either:
   *"Applies to all your vans"*.
7. Change **Collection times** in van 2's column only. Settings › Kitchen shows van 2 changed and van 1
   untouched.
8. 🔴 **Nothing moved when you did that.** The columns were already there; equalising or diverging the
   vans must not re-flow the table.

**Two vans with DIFFERENT values**

9. A type column that has set nothing shows the **first van's** value, faded. Hover it: *"Follows each
   van's usual setting"*. There is no "Varies by van", no "Set per van", no "Same as Standard" anywhere.
10. Change it. It comes to full strength and applies to **every** van at events of that type.
11. ⋯ › **Match Standard** on that type → confirm → every row goes back to faded. Anything you changed on
    a single event's dashboard is untouched.

**Both widths**

12. **390px**: the picker is labelled **Column** and lists the van columns and then the types. Pick van 2
    — its card shows its own values. "Do you take cash?" is marked as applying to the whole truck.
13. **390px, Safari**: focus a dropdown. **The page must not zoom** — that is the 16px guard in §4, and
    it is why the phone's dropdown text is deliberately larger than the desktop's.
14. **820px (iPad)**: six types and two vans — the columns scroll **sideways inside the dialog**; the
    dialog itself never exceeds the screen and the close button stays reachable.

**The dashboard**

15. An event's **"This event"** card: the five rows in the same order and under the same names as the
    modal, with the dashboard's own green switches — not the orange ones it had.

---

## 11 · FILES

| File | |
|---|---|
| `lib/copy/serviceSettings.ts` | **new** — the five labels (one re-exported from `settings-copy.ts`), the two hover titles, the footer and the Match Standard copy |
| `lib/ui-tokens.ts` | **`CONTROL_BOX`** — the control box both surfaces already used 14 times inline |
| `components/manage/primitives.tsx` | **`Toggle`** (moved from `page.tsx`) and **`Select`** (new shared); `Input` gained `maxLength`, `inputRef`, `autoFocus` |
| `components/manage/EventTypes.tsx` | the modal: van columns, editable Standard, no links, no retired phrases, shared controls, dividers |
| `components/dashboard/ThisEventCard.tsx` | row order and labels from `SERVICE_ROWS`; the dashboard's own switch, box and orange token |
| `components/dashboard/OrderCard.tsx` | `Toggle` gained an optional `ariaLabel` and the switch role |
| `lib/event-types/types.ts` | `SERVICE_ROWS` reordered and relabelled from the constants |
| `app/api/event-types/route.ts` | `load` returns the active vans (id, name, their five values), oldest first |
| `app/manage/[token]/page.tsx` | `manageApi={api}` on the mount; three labels from the constant; its `Toggle` removed |
| `scripts/event-types.cjs` | 122 checks, 42 variants; baseline pinned to `9d3ecb8` |
| `scripts/event-types-render.cjs` | the 54-render matrix, the computed-style measurements, 16 screenshots |
| `scripts/slot-interval-settings.cjs` | one assertion updated — §8 |
