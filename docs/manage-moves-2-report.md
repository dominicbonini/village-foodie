# Kitchen capacity without a picker, Schedule settings in a modal, and the pills back

**Branch:** `schedule-graphics` (confirmed with `git branch --show-current` before every commit).
`main` and `event-types` untouched. **Nothing deployed. No SQL was run — and none is needed.**
Village Spice / Pizza Kitchen only; Pizzeria Gusto was not touched, read or used. No keys printed.

**Nothing arrived garbled.** Two instructions conflicted with others. Neither stopped the build, and
both are recorded in §1 rather than quietly resolved.

---

## 1 · 🔴 THE TWO CONFLICTS, AND WHAT I DID

### 1.1 `SettingsList` still draws the sticky jump bar underlined

§3 says to change the sub-tab bars **"and Settings' sticky jump tabs"** from underlined tabs **"back
to the PILL design on boards SettingsKitchen and SettingsList"**, and describes that design in words:
rounded pills, a light grey inactive pill, a dark filled active one.

`SettingsKitchen` shows exactly that for Settings' section nav. **`SettingsList` shows the same bar —
explicitly labelled "sticky jump bar (shown stuck after scrolling)" — as UNDERLINED tabs**
(`.jump a { border-bottom: 2px solid … }`), which is the design §3 is removing.

**I followed the written instruction and treated the board as stale.** Three reasons: the instruction
names that bar explicitly, it describes the pill look in words rather than only by reference, and it
requires **one shared definition for all three bars** — and all three already render from
`SUBTAB_BAR`/`SUBTAB_ROW`/`subtabBtn`, so there is no way to make Menu and Schedule pills while
leaving Settings underlined without forking the definition the same sentence forbids. If the stuck bar
really should stay underlined, that is a fork and I have not made one.

### 1.2 "Pills stay ≥40px high" vs "too high, too much space above and below"

§3 said **"Pills stay ≥40px high"**. After seeing them you said they are **"too high, too much space
above and below the text within them"**. Those are the same measurement pulling opposite ways.

**The later instruction wins** — it was made while looking at the result — so `min-h-10` came off and
the pill is `px-3.5 py-1.5 text-sm`, which renders **32px** (measured, both engines, all three bars).

🔴 **What that costs, so you can weigh it:** 32px is below the 40px your brief asked for and well below
the 44px usually recommended for a finger. These are pressed outdoors on a phone. Putting it back is
one token — `min-h-10` on `subtabBtn` — and nothing else.

---

## 2 · MENU › KITCHEN CAPACITY — NO PICKER, ONE QUESTION

The van picker and the per-van "Same capacity as …" switch are **gone**. What replaces them:

| Truck | What the screen shows |
|---|---|
| **One active van** | the capacity box, and no question at all |
| **2+ vans, answer ON** | the question, then **one** box titled **"All vans · Kitchen capacity"** |
| **2+ vans, answer OFF** | the question, then **one box per active van**, first van first, each titled **"&lt;van name&gt; · Kitchen capacity"** |

### 🔴 The answer is read, never stored

There is no column for it, and there must not be: the answer **is** "does every non-first active van
follow the first van". A column would be a second source of truth able to disagree with the flags it
describes — and the flags are what the capacity engine actually reads.

- **all follow ⇒ ON**, **none follow ⇒ OFF**, and 🔴 **mixed ⇒ OFF**. Reading a mixed truck as ON would
  draw one box over a truck where a van is running different numbers behind it.
- A one-van truck is **vacuously ON**, which is what makes a truck's *second* van follow by default.
- A **retired** van that does not follow is ignored — it must not hold a truck on OFF for ever.

🔴 **Nothing is written because the page loaded.** A mixed truck shows one box per van while some vans
still follow; the **first save** unfollows those stragglers (keeping their copied values) *before* the
edit lands, so the box just typed into is genuinely independent. Afterwards would be too late — the
edit would already have fanned out.

### The control

You asked for the Yes/No button pair to be replaced: it **"matches nothing else in Manage"**. It is now
**Settings' own green `<Toggle>`**, on the right of a `bg-slate-50 border rounded-xl p-3` row — the card
shape Settings' setting rows use. ON = same for all vans; OFF = one box per van; it still defaults ON.

🔴 **It is the same component, not a copy.** `Toggle` was a local function inside `page.tsx`, so the
only way to use *the* shared switch was to make it one: it moved to
`components/manage/primitives.tsx` and both `page.tsx` and this screen import it. Its props and markup
are unchanged, so Settings' existing usages render byte-identically.

⛔ The helper line **"Only asked when you have more than one van."** was removed, as asked.

### Switching the answer

- **OFF → ON asks first**, with exactly the brief's sentence: *"All vans will use &lt;first van&gt;'s
  kitchen capacity. Each van's own numbers will be replaced."* On confirm, the first van's capacity is
  copied into every other van and every flag set true.
- **ON → OFF keeps every van's values** and sets every flag false. They were copied, never looked up,
  so each van already holds a complete set — "stop following" is all that is needed.

Both go through `set_van_capacity_same_as_first`, the action the old per-van switch used. Nothing new
writes capacity.

### 🔴 Default ON for a new van — in the server action

`add_van` now reads the answer **before the insert** (afterwards the new van is itself a non-first van
holding the column default, so the answer would read OFF for every truck and nothing would ever
follow), copies the first van's capacity into the new van, and sets the flag true **only when the
truck's answer is ON**.

⚠️ **The values are copied either way; only the flag differs.** Under OFF the new van still starts from
the first van's numbers — a van that arrived at the truck's defaults while its siblings were configured
would be quietly running a different kitchen. "OFF" means it then diverges, not that it starts blank.

⛔ **The column default is untouched**, as instructed. A `default true` would make every van on every
truck follow, including trucks that answered OFF. Asserted against the migration file.

### 🔴 One rule, two readers — and a bug it uncovered

`capacityAllSame()` / `capacityStragglers()` live in `lib/van-category-settings.ts` and are read by
**both** the screen and `add_van`. Two inline `.every(...)`s would be two rules, and the one that
drifted would be the server's — invisible until a truck's new van stopped matching.

🔴 **A latent bug found on the way.** `firstVanId()` is documented as "the oldest **ACTIVE** van" and
filters on exactly that — but all **five** of its callers in `app/api/manage/route.ts` built their input
as `({ id, created_at, active: true })`, hard-coding the flag they were meant to supply. For a truck
that had **retired its oldest van**, "the first van" was that retired van: the switch would copy a van
nobody uses, and its edits would fan out from a van that is not on the road. `readVanSameAsFirst` now
reads `active` (a long-standing column, so it cannot 42703 the way the two flag columns could) and all
five callers pass the truth. No truck has hit this — retiring the oldest van is rare — so it is a
latent bug fixed, not a reported one.

### Copy-never-a-lookup, and Settings' independence

Both are unchanged and re-asserted. `set_van_capacity_same_as_first` still copies fields and
**replaces** category rows (delete-then-insert, never a merge); Settings' "Same as Van 1" still covers
everything **except** capacity and still does not touch category rows. The copy itself was extracted
into one `copyCapacityFromFirst` helper so the switch and `add_van` cannot diverge — two copies of a
delete-then-insert is how one of them comes to merge.

---

## 3 · SCHEDULE SETTINGS — OPTION (a)

**Only cards 1 and 2 moved** into `components/manage/ScheduleSettingsModal.tsx`: "Your schedule" (the
manual/automatic choice, the address, Verify) and "Import exclusions". Same fields, same wording, same
saves — `update_truck`, `POST /api/manage/verify-schedule-url`, `remove_exclusion_term`.

⛔ **`CustomDomainSetup` stayed exactly where it was**, directly above the QR code. Its own comment in
`page.tsx` says why: the printed QR encodes a hatchgrab.com address and resolves its destination **at
scan time**, so once that setup finishes the *same printed code* starts sending customers to the
operator's own address. Separated, an operator concludes they need to reprint. That is the reason the
earlier report recommended option (a).

⚠️ **The modal owns its own state.** `SettingsTab` unmounts the moment the operator is on Schedule, so
the state those cards used is not in scope there. The alternative — keeping them in `SettingsTab` and
lifting a flag — means Settings' whole tab stays mounted behind the Schedule tab.

The five verify messages moved to `lib/copy/scheduleVerify.ts`: the card and its messages would
otherwise sit on opposite sides of a file boundary, and a route file is not a place to import copy
from. ⚠️ **The same blocked-domain sentence still exists once more in `page.tsx`** as the setup
wizard's `SCHED_BLOCKED_DOMAIN_MSG`. Unifying it is a separate change with its own blast radius and is
named here rather than done quietly.

**Settings keeps its section and jump-tab name**, with one line where the cards were: *"Where we find
your events has moved to **Schedule › Schedule settings**"*, whose link switches tab **and** opens the
modal in one press — which is why the modal's flag lives on the page rather than inside `ScheduleTab`.

### 🔴 The entry point is now a card, not a caption

You said the line **"is too easy to miss"**. It was 12px grey text sharing a row with the van filter,
with the only route into the schedule settings buried in it as a `·`-separated link.

It is now a **shared `<Card>`** between the heading row and the list: a bold **"Finding events
automatically"** with **"From your website"** beneath it in the helper style, and a **shared
`<Btn colour="ghost">`** — the app's existing secondary button — on the right. The manual state keeps
its existing sentence and has no source line, because there is no source. On a phone the button sits
**under** the text at full width (measured: 358px in a 390px card). The **van filter moved down** to sit
with the list it filters.

`Btn` gained an optional `className`, empty by default, so every existing call site renders
byte-identically; the alternative was a second button component with the same palette.

---

## 4 · THE PILL TABS

Changed **once**, in the three shared constants, so Menu's sections, Schedule's sections and Settings'
sticky jump tabs cannot drift apart. Taken from the boards' own CSS:

```
.pills   { display:flex; gap:6px }
.pills a { padding:8px 16px; border-radius:999px; font-size:15px; font-weight:600;
           color:#334155; background:#EEF2F6 }
.pills a.on { background:#0F172A; color:#fff }
```

→ `gap-1.5`, `rounded-full`, slate-700 on slate-100, slate-900/white when active. Height per §1.2.

⛔ **The look changed and nothing else did.** The bar keeps `sticky top-0 z-30 -mx-4 px-4`, its
slate-50 background, its bottom border and `overflow-x-auto`, so the one resting position, the
`:has()` padding rule, `<main>` as the only scroller, Settings' scroll-spy, `?section=` and the legacy
`?tab=` mappings are untouched. `py-2` on the bar is new and is layout — a filled pill needs air an
underlined tab did not — and it does not move where the bar *starts*, which is what the
resting-position checks measure.

**Assertions updated because they pinned the underline — and only those four:**

| Assertion | Was | Now |
|---|---|---|
| "the jump bar scrolls sideways inside its row" | pinned `SUBTAB_ROW = 'flex gap-4 w-max'` | `gap-1.5` — the behaviour it asserts is unchanged |
| "THE JUMP TABS ARE NOT GREYED OUT LIKE DISABLED CONTROLS" | `text-slate-600` not `text-slate-400` | a filled grey pill with a hover, not bare faded text — same rule, new expression |
| **W43** (its broken variant) | drained the underlined text's colour | drains the pill's fill |
| "the bar is `sticky top-0` and is NOT wrapped in a div of its own" | pinned the whole `SUBTAB_BAR` literal | the position-bearing tokens individually, so a **look** change cannot fail a **position** check |

**Every sticky-position assertion is unchanged and passing**, including the resting-flush one and the
W44 variant that proves it bites.

---

## 5 · THE FOUR PIECES OF COPY YOU HAD REMOVED

| Removed | Where |
|---|---|
| the box "Kitchen capacity has moved to **Menu › Kitchen capacity**" | Settings › Kitchen |
| "Kitchen capacity has its own switch in Menu › Kitchen capacity." | the "Same as Van 1" helper |
| "Changes to the first van are copied here." | the same helper's first line |
| "⚠ Slot capacity limits still apply — full slots are never auto-confirmed" | under Auto-accept |

🔴 **The behaviour behind the amber notice is unchanged** — `lib/orders/auto-accept` still refuses a
full slot and the capacity ceiling still binds. What went was a standing warning about something
working correctly. The `onOpenKitchenCapacity` prop went with the pointer box, having lost its only
consumer. The **comment** recording where capacity went stays: three harnesses anchor their
Collection-times slice on it, and it answers "why is there no capacity card on this screen?".

---

## 6 · THE CHECKS

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npm run build` | **exit 0** |
| ESLint, **added lines only** | **2 findings, both pre-existing at HEAD** (`categories` and `onSwitchTab` unused in two tab components — confirmed by running ESLint on the stashed tree). A third, `onSwitchTab` newly unused in `ScheduleTab`, **was mine** — the caption's "Change in Settings" link was its only consumer — and the prop is removed. |
| `scripts/schedule-graphics-places.cjs` | ✅ **243** |
| `scripts/capacity-move-identity.cjs` | ✅ **53 checks, 11 broken variants, all 11 fail as required** |
| `scripts/van-category-settings.cjs` | ✅ **68**, 11 variants |
| `scripts/schedule-places-render.cjs` | ✅ measured in **Chromium and WebKit** |
| The page.tsx multiset diff | 11,947 → **11,816 lines**. **Zero unexplained**: every line that left is either present in the file it moved to (`KitchenCapacitySection`, `primitives`, `ScheduleSettingsModal`, `scheduleVerify`) or named in `movedEdits` with its replacement, which a companion check verifies still exists. |
| Every harness compiling a changed file | 12 run, all green. The full sweep was **not** run, as instructed. |

### 🔴 The new checks §1 asked for, each with a broken variant

ON/OFF reads correctly for all-follow, none-follow and **mixed**; OFF→ON copies; ON→OFF keeps values;
the mixed first-save unfollows the stragglers **before** the write; a van added under ON follows and
one added under OFF does not; **nothing is written on load**. Plus: the shared switch renders and no
Yes/No buttons survive (C10), and the switch is not re-styled locally (C11).

### 🔴 Four harness defects this build found

1. **A check matching the wrong handler.** `set_van_same_as_first COPIES … the category rows` ran three
   of its four regexes against the **whole file**, and the `van_category_settings` delete-then-insert
   it found lived in the *capacity* switch. Settings' switch deliberately stopped copying category
   rows in October — so the check had been asserting the opposite of the intent and passing because
   another handler contained the text. Now scoped, and it asserts the handler does **not** touch them.
2. **A duplicate object key in the render probe** silently shadowed `switchRight`, so an "is it on the
   right" check read `null` at every width and passed.
3. **A broken variant whose anchor had moved** (`V6`) reported "THE ANCHOR IS GONE" when the copy was
   extracted into a helper — which is what that guard is for.
4. **Comment-stripping residue counted as a lost line.** A JSX line that is only `{/* … */}` collapses
   to `{}`; there are 387 in the baseline, so one could surface as "lost" through multiset arithmetic
   alone. The diff now names that artefact instead of allowlisting an instance of it.

### Measured — Chromium and WebKit, 1440 / 820 / 390

- **The capacity screen in all three states**: one van (no question, one box, titled plainly); two vans
  ON (the question, one box, "All vans · Kitchen capacity"); two vans OFF (two boxes, each named). The
  switch is measured as the shared **44×24** track, **green by comparison with a `bg-green-500`
  reference element** rather than a hard-coded colour, on the right of the row — and **the question row
  does not move when the answer changes**.
- **The Schedule settings modal**: fits at every width, close button reachable, the **body** scrolls
  rather than the page, Done inside the dialog.
- **All three pill bars, at rest and when stuck**: one row, no page scroll, radius ≥16px, 6px gap, and
  **flush to the scroller at `scrollTop` 0** — the assertion the October fix exists for — and still
  flush after a 1200px scroll.
- **The finding-events card in both states**: button ≥36px, inside the card, beside the text above the
  breakpoint and **stacked full-width below it**; the source line shown only when a source exists.

**36 screenshots** in `docs/screenshots/manage-moves-2/`. ⚠️ They are renders of fixtures built from the
real class strings, **not** captures of a running page — that needs a database and a live truck, which
this harness must never touch. Every class and number in the fixtures is **lifted from the source**, so
each time this build changed shape the fixture stopped *building* rather than measuring a screen nobody
is served.

---

## 7 · SQL

**None.** This build adds no column, changes no column and runs nothing. `capacity_same_as_first_van`
already exists from `20261010_capacity_same_as_first_van.sql` (still unrun by me, unchanged here), and
its default stays `false` — the ON-by-default rule is applied by `add_van`, not by the schema.

---

## 8 · WHAT TO TEST ON LOCALHOST

⛔ **Village Spice or Pizza Kitchen only.** Not Pizzeria Gusto.

**Kitchen capacity — one van**

1. Menu › Kitchen capacity. **No question**, one box titled "Kitchen capacity". Set a total capacity, a
   window, a category's prep and batch; reload — all persisted.

**Kitchen capacity — two vans**

2. Add a second van in Settings › Truck settings. Return to Menu › Kitchen capacity: the question
   appears, the switch is **ON**, and there is **one** box titled "All vans · Kitchen capacity".
   🔴 The new van arrived already following — that is the add-van rule.
3. Edit the box. Check Van 2 in Settings › Kitchen: it has the same numbers (the fan-out).
4. Switch **OFF**. No confirm. Two boxes appear, "Main van · Kitchen capacity" and
   "&lt;second van&gt; · Kitchen capacity", **both holding the values they had** — nothing reverted.
5. Give Van 2 a different capacity. Reload — the two differ, and the switch is still OFF.
6. Switch **ON**. It asks: *"All vans will use &lt;first van&gt;'s kitchen capacity. Each van's own
   numbers will be replaced."* Cancel → nothing changes. Confirm → one box, and Van 2 now matches Van 1.
7. **Add a third van while the answer is OFF.** It gets its **own box**, holding a copy of the first
   van's values. Switch ON, add a fourth: it arrives **following**, with no box of its own.
8. ⛔ **Nothing is written by opening the screen.** With the answer OFF, leave and return — no values
   change, and Settings shows the same flags.

**Schedule settings**

9. Schedule › Events: a white **card** above the list reading **"Finding events automatically"** with
   **"From your website"** beneath it and a **Schedule settings** button on the right. The van filter is
   on the row below.
10. Press the button: the modal opens with "Your schedule" and "Import exclusions", unchanged. Change
    the preference and the address, press **Verify**. Close, reopen Settings › Schedule — the values
    match.
11. Settings › Schedule shows **one line**: "Where we find your events has moved to Schedule › Schedule
    settings". Press it: Schedule opens **with the modal already up**.
12. ⛔ **CustomDomainSetup is still in Settings**, directly above the QR code, untouched.
13. Set the truck to "I'll add events myself". The card reads "You're managing your schedule manually"
    with **no** source line, and the button still opens the modal.

**The pills**

14. Menu, Schedule and Settings: all three sub-tab bars are **pills** — grey inactive, dark filled
    active — and all three look identical.
15. Scroll Settings: the bar sticks **flush**, with no jump on the first scroll, and the active pill
    still lights as you pass each section.
16. **390px**: the pills scroll sideways inside their row without widening the page, on every bar.
17. `?section=` links and any old `?tab=` links still land on the right pill.

---

## 9 · FILES

| File | |
|---|---|
| `components/manage/ScheduleSettingsModal.tsx` | **new** — the two cards that left Settings › Schedule |
| `lib/copy/scheduleVerify.ts` | **new** — the five verify messages, shared by the modal and the page |
| `components/manage/KitchenCapacitySection.tsx` | the Yes/No screen: no picker, no per-van switch, one box or one per van |
| `components/manage/primitives.tsx` | `Toggle` moved here from `page.tsx`; `Btn` gained an optional `className` |
| `lib/van-category-settings.ts` | `capacityAllSame` / `capacityStragglers` / `capacityOthers`; `readVanSameAsFirst` now reads `active` |
| `app/api/manage/route.ts` | `copyCapacityFromFirst` extracted; `add_van` applies the ON-by-default rule; five `firstVanId` callers fixed |
| `app/manage/[token]/page.tsx` | the pills; the Schedule cards out and a one-line pointer in; the finding-events card; four pieces of copy removed |
| `scripts/capacity-move-identity.cjs` | +25 checks, +11 variants for the ON/OFF rules |
| `scripts/schedule-graphics-places.cjs` | the pill assertions, the card assertions, the moved-line accounting |
| `scripts/schedule-places-render.cjs` | the capacity states, the modal, the three bars, the finding-events card, 36 screenshots |
| `scripts/van-category-settings.cjs` | two checks corrected — §6 |

---

# ADDENDUM · 4 OCTOBER 2026 — THE PILLS WERE NOT LOCKED

> *"for the pils under menu, schedule and settings, they have been pushed down the scren a little so
> wehn you scroll down the screen they move up. we have this problem with the selectors before but they
> were locked. make sure the pils are locked as well"*

## A1 · WHAT WAS ACTUALLY WRONG

Not the CSS. The `:has()` rule from 3 October (§65.4 of the manual) was present, compiled and correct —
I measured it in isolation first, and all three bars rested flush at 0px and stayed there. The rule was
simply **not firing on the operator's screen**, because its condition was not met.

The condition is "a sub-tab bar is the FIRST child of the `pt-6 manage-tab-pad` wrapper". Seven things
could render above it:

| | |
|---|---|
| walkthrough "remind me later" strip | every tab |
| events-to-approve banner | every tab but Schedule |
| allergens-not-verified banner | every tab but Menu |
| custom-domain banner | every tab |
| Stripe-requirements banner | every tab but Payments |
| mandatory-fields banner | every tab |
| the staleness bar | every tab |

With any **one** of them showing, the bar was no longer first, the `:has()` stopped matching, the `pt-6`
stayed, and the bar rested 24px + that notice's height down the page — then snapped flush on the first
scroll. The same two resting positions as 3 October, reached by a different route. A test truck with
unverified allergens and a pending event hits two of them at once, on all three tabs.

**`position: sticky` has no upward reach**, so there is no CSS answer to content above the bar: no
offset, no negative margin (tried and rejected on 3 October — it pulled the bar through the banner), no
measured `top`. The ORDER had to change.

## A2 · THE FIX

The seven notices became **one `notices` node** in `app/manage/[token]/page.tsx`, rendered **below** each
sub-tab bar:

* **Menu** — `{activeTab === 'menu' && notices}`, immediately after the bar, both direct children of the
  wrapper.
* **Schedule** — a `notices` prop; `ScheduleTab` renders `{isActive && notices}` after its own bar inside
  the same fragment, so both stay direct children of the wrapper.
* **Settings** — a `notices` prop; `SettingsTab` renders `{notices}` after its bar inside its own
  `space-y-6` root, so the notices take that list's 24px gap and nothing renders when none is showing.
* **The four tabs with no bar** (Reports, Team, Payments, Billing) still render the stack at the top,
  where it belongs for them. `TABS_WITH_SUBTABS` is the one list that decides which case a tab is in, so
  a fifth tab gaining a bar cannot leave the stack above it.

Nothing about **when** a notice shows changed — every condition, including the `activeTab !== 'schedule'`
/ `!== 'menu'` / `!== 'payments'` suppressions, is the one it was. This is a move. The only new rule is
where they render; a notice now scrolls under the pinned bar like any other page content.

`app/globals.css` keeps both `:has()` selectors (Settings' bar is still one level deeper than the other
two) and records why nothing may go back above a bar.

## A3 · THE HARNESS WAS MEASURING A LAYOUT NOBODY IS SERVED

`barFixture` in `scripts/schedule-places-render.cjs` built its own shell — `<main class="flex-1
overflow-y-auto">` with a plain `max-w-5xl px-4` child. **No `pt-6`, no `.manage-tab-pad`.** Its "THE BAR
IS FLUSH AT REST" assertion therefore could not fail, and it passed green on the very build whose bars
were reported as sitting low and jumping. This is the same failure class as the Settings fixture that went
on measuring the old shell, and it is the one that let this ship.

Both classes are lifted from the source now, and three measurements were added per bar, per width, per
engine:

| | at rest | after a 1200px scroll |
|---|---|---|
| no notice | 0px | 0px |
| **notice BELOW** (the fix) | 0px | 0px |
| **notice ABOVE** (broken variant) | **90px** | 0px |

The broken variant is the operator's report, reproduced — so the passing runs mean something.
`settingsFixture`'s banner case was **reversed**: it used to place the banner above the bar and assert
that the wrapper *kept* its padding, i.e. it asserted that the degraded layout was correct. It now places
the notice below, asserts the bar is flush at rest and still flush scrolled, and a new `bannerAbove`
variant fails as required.

`scripts/schedule-graphics-places.cjs` gained the structural half, which no renderer can see — that the
**source** cannot put anything above a bar again:

* the notices are one node, and `TABS_WITH_SUBTABS` exists;
* **nothing** is rendered between the wrapper and the first `data-subtab-bar` but the gate line (verified
  to fail: putting `{staleBar}` back above it breaks this check and one other);
* the gate renders nothing on the three tabs that own a bar;
* all three bars are followed by the notices, in that order, and both tabs are handed them;
* the staleness bar went with them and is not left behind;
* the `:has()` rule and its ⛔ warning are still in `app/globals.css`.

One `movedEdits` claim was stale — `SettingsTab`'s signature now ends `, onOpenScheduleSettings, notices
}: {` — and the companion check reported ⛔ EDIT CLAIMED BUT NOT PRESENT, which is what it is for.

## A4 · WHAT I DID NOT CHANGE

The bar's `py-2`, which puts the pills 8px below its top edge. That is 8px of air **inside** a bar that no
longer moves, and it is there because a filled pill needs air an underlined tab did not. The 8px is the
same at rest and when pinned, so it is not the "pushed down … they move up" that was reported. Say the
word and it goes.

## A5 · RESULTS

| | |
|---|---|
| `scripts/schedule-graphics-places.cjs` | **249 passed**, 11 variants failed as required |
| `scripts/schedule-places-render.cjs` | **934 passed** in Chromium and WebKit, 0 failed |
| `scripts/capacity-move-identity.cjs` | 53 checks, 11 variants failed as required |
| `scripts/van-category-settings.cjs` | 68 passed, 11 variants failed as required |
| `npx tsc --noEmit` | clean |
| `npm run build` | compiled successfully |
| `npm run lint` | `page.tsx`: the same 5 pre-existing errors as the committed tree, no new ones |

## A6 · MANUAL

`docs/reference-manual.md` §65.4 ended "when a notification banner is first, the padding stays, so the bar
never overlaps a banner" — a sentence describing the degrade that turned out to be the bug. It is amended
in place, dated, with the old wording quoted so the history is readable, and lesson 5 in the lessons list
is marked **REOPENED AND CLOSED AGAIN**. No other section was touched and no hash was changed.

---

# ADDENDUM 2 · 4 OCTOBER 2026 — THE `:has()` RULE WAS NEVER THE MECHANISM

> *"the gap is still there nothing has changed. the sticky headers are in exactly same place. when you
> scroll down the page they move up slightly. you had solved this before they were pils"*
> *"check against the settings tab as that is the page you can scroll against."*

## B1 · WHY ADDENDUM 1 DID NOTHING

It fixed a real failure mode — a notice above the bar costs it its flush resting position, and that was
measurably true — but it was not **this** failure. The gap was there with no notice showing.

## B2 · THE THING THAT WAS TRUE AND THE THING THAT WAS FALSE

Everything I could check said the rule worked:

* it is in the compiled CSS, correct, both selectors;
* it is **unlayered**, while `.pt-6` is inside `@layer utilities` — so it wins the cascade outright,
  before specificity is even consulted (verified by computing the layer ranges of the built chunk);
* a fixture reproducing the real shell, the real `<main>`, the real wrapper and the real bar at both
  depths measures the bar flush at rest and flush scrolled, in Chromium **and** WebKit.

And the operator, looking at the actual screen, said the gap was still there. Both can only be true at
once in **a browser without `:has()`**. It landed in Safari 15.4 (March 2022) and Chrome 105. This app is
used in an iPad WKWebView — the same device the app shell's own comment was written for ("keeps the
header+tabs locked in the iPad WKWebView where stacked `position: sticky`-against-body-scroll was
unreliable"). **An unsupported selector is discarded in silence.** No error, no warning, nothing to see
in the source, and no way for either of my harnesses — which run the browsers I have, not the browser the
operator has — to notice.

That also explains "you had solved this before they were pills": the 3 October fix was verified by
measurement, not on the operator's device, and it had never worked there.

## B3 · THE FIX — THE PAGE ANSWERS ITS OWN QUESTION

```jsx
<div className={`manage-tab-pad${TABS_WITH_SUBTABS.includes(activeTab) ? '' : ' pt-6'}`}>
```

The padding is a gap for tab content; a tab whose first element is a sticky bar must not have it. The page
already knows which tabs those are — `TABS_WITH_SUBTABS` is the same single list Addendum 1 added for the
notices. No browser feature, no `:first-child`, no DOM-order dependency, nothing that can degrade quietly.

The `:has()` rule stays in `app/globals.css` as a **second belt** — it costs nothing and still catches a
bar added to a tab nobody listed — with a ⛔ note saying nothing may be written that relies on it.

## B4 · THE MEASUREMENT THAT NOW MEANS SOMETHING

`scripts/schedule-places-render.cjs` asserts the bar is flush **with the `:has()` rule unable to match**
(the fixture drops `data-subtab-bar`, so neither selector can apply). Four states, per bar, per width,
per engine:

| | at rest | after a 1200px scroll |
|---|---|---|
| normal | 0px | 0px |
| notice below the bar | 0px | 0px |
| **`:has()` unable to match** | **0px** | 0px |
| both belts removed (`pt-6` back **and** no `data-subtab-bar`) | **24px** | 0px |

The third row is the new one and it is the point: before this change it would have read 24px. The fourth
is the reported defect, reproduced, so the passing rows mean something. A fifth measurement confirms the
rule is still a working belt where the browser supports it (`pt-6` put back, `data-subtab-bar` present →
0px).

`scripts/schedule-graphics-places.cjs` now asserts the wrapper is the ternary and **not** the old
hard-coded `pt-6 manage-tab-pad`, so the page cannot drift back to depending on the selector.

## B5 · IF IT IS STILL THERE

Then the cause is not what I think, and this will say so in one line. On the Settings tab, in the
browser's console:

```js
(()=>{const s=document.getElementById('manage-scroller'),b=document.querySelector('[data-subtab-bar]'),
p=b.querySelector('button'),r=()=>({bar:Math.round(b.getBoundingClientRect().top-s.getBoundingClientRect().top),
pill:Math.round(p.getBoundingClientRect().top-s.getBoundingClientRect().top)}),a=r(),w=s.scrollTop;
s.scrollTop=600;const c=r();s.scrollTop=w;console.log(JSON.stringify({rest:a,scrolled:c,
pad:getComputedStyle(b.closest('.manage-tab-pad')).paddingTop,
first:b.closest('.manage-tab-pad').firstElementChild.className.slice(0,50),
hasSupport:CSS.supports('selector(:has(*))')}))})()
```

`rest.bar` and `scrolled.bar` should both be `0`. `pad` should be `0px`. `hasSupport:false` would confirm
the diagnosis above; `hasSupport:true` with a non-zero `rest.bar` would mean something is rendering above
the bar that I have not found, and `first` names it.

## B6 · RESULTS

| | |
|---|---|
| `scripts/schedule-places-render.cjs` | **976 passed** in Chromium and WebKit, 0 failed |
| `scripts/schedule-graphics-places.cjs` | **249 passed**, 11 variants failed as required |
| `npx tsc --noEmit` | clean |
| `npm run build` | compiled successfully |
