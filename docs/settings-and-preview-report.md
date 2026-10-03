# Settings as one list with sticky jump tabs · "Same as Van1" · Add event preview

**Branch:** `schedule-graphics` (`git branch --show-current` → `schedule-graphics`)
**Commit:** `d058162` — full hash `d0581624571b7d5af008454baabf3154ca81bb6c`, pushed
**Date:** 3 October 2026
**Database:** production, read through localhost. Village Spice only. Pizzeria Gusto untouched.
**SQL run:** none. No migration was written either — see §4, which explains why.

---

## 1 · Part A.1 — what the existing sticky pattern actually is, and what I reused

I was asked to review the Menu/manage sticky work and past sticky/scroll-margin fixes before
building. The findings, and what came across:

### The app shell is the whole story

`app/manage/[token]/page.tsx` has one scroll container and it is not the window:

- the root is `bg-slate-50 h-dvh flex flex-col overflow-hidden`;
- the header and the tab bar are `shrink-0` siblings;
- `<main className="… flex-1 min-h-0 overflow-y-auto px-4 pb-6">` is **the only** scroller.

So `window.scrollY` on this page is permanently `0`. A scroll-spy written against the window
would never fire once. Everything in `useSettingsJumpBar` reads the `<main>` element's
`scrollTop` / `clientHeight` / `scrollHeight`, and `<main>` gained an `id` for that purpose.

### The documented past fix, reused verbatim

`<main>` deliberately carries **no `padding-top`**. The comment on it records why: a
`position: sticky` child pins at the scroll container's content box, so a padding-top there
becomes a permanent gap above any sticky header — this was found with the Billing plan/price
row. The resting gap was moved into a `pt-6` **child** instead, as scrollable content.

I reused that unchanged. It is also what made the resting-gap bug in §6.3 possible, and the
fix for that bug is an extension of the same reasoning rather than a new mechanism.

### One measured number, two consumers

From `docs/customer-one-page-build-report.md`, implemented in `app/trucks/[slug]/order/page.tsx`:
the pinned height is measured once and used **both** as the CSS `scroll-margin-top` on every
section **and** as the scroll-spy's pin line. If the jump used one number and the spy another,
a re-measure would move one and not the other. `pinnedTop` here is that single number.

Carried across with it: the **spy lock** during our own smooth scroll (without it the tapped
tab flickers through its neighbours on the way), the **bottom clamp** so a short last section
still lights its tab, and a **measured minimum height** on the last section.

### Which classic sticky-breaking cause applied

Checked each, since the brief asked me to name the one that bit:

| Cause | Present here? |
|---|---|
| A `transform` / `filter` / `perspective` / `contain` ancestor | No — checked the whole chain |
| The sticky element wrapped in its own non-scrolling div | No — the bar is a direct child of its list |
| `overflow-y-auto` on an ancestor | **Yes, and intended.** `<main>` is the containing block by design, not a bug |
| A different scroll container than the one you think (the iOS case) | This is exactly why the shell exists |
| **Padding-top on the scroller putting a gap above the sticky child** | **This is the one.** Already fixed for the Billing row; reused, and then it reappeared one level up — §6.3 |

---

## 2 · Part A.2 — Settings restructured into eight sections

Eight `<section>` wrappers, each with an `id`, an `<h2>` matching its jump tab, and the
existing cards unchanged inside. Order (after the 3 October change requested mid-build):

1. Truck details
2. Contact
3. Order settings
4. Truck settings
5. Schedule
6. QR code
7. Auto-replies
8. Account deletion

"New to HatchGrab?" and "Get the app" sit above section 1 and no tab points at them, as
specified. The jump bar itself is the **first** thing in the list — above those two cards — on
request.

**Wording and behaviour:** unchanged. This is asserted mechanically, not by eye: the harness
diffs every quoted string and JSX text node in `SettingsTab` against commit `197cb8c` and
fails on any addition other than the eight section labels, and on any removal outside an
explicit allowlist (the removed page title, the two de-duplicated card titles, the logo's old
card-title treatment, the cancellation group's stray divider and its duplicate label line).

**"Allow customers to cancel orders"** moved out of Contact Details, unchanged, and now sits
**below** the main Order settings box with its own heading taken from the same
`SETTING_COPY.allowCancellation.label` constant — so the words are the setting's own and
nothing new was written.

---

## 3 · Part A.3 — the jump bar

- Underlined text tabs, not pills. (Then applied to Menu and Schedule too — §6.4.)
- `sticky top-0` under the manage header, pinning flush with **no magic offset**.
- Phone: the row scrolls sideways (`overflow-x-auto` on a `min-w-0` row) and the **page does
  not**; the active tab scrolls itself into view horizontally.
- Clicking smooth-scrolls so the heading **and** its first setting are fully visible, using
  `scroll-margin-top` = the real measured sticky height. The browser applies the margin — there
  is no `rect.top + scrollTop - offset` arithmetic to go stale between a re-measure and a paint.
- Scroll-spy lights the current section, with the last section active at the bottom of the page.
- `#truck-details` … `#account-deletion` deep links work on load.

---

## 4 · Part A.4 — "Same as Van1" was NOT built. The stop condition was met.

The brief said: *first find where per-van settings live; if any van setting is not stored per
van, STOP and tell me before building.* It is not, so I stopped. Nothing was half-built and no
migration was written.

### What IS stored per van — `truck_vans`

`name`, `auto_pause_on_offline`, `offline_protection_mode`, `offline_auto_reject_mins`,
`show_cooking_step`, `order_ready_enabled`, `kitchen_capacity`, `capacity_window_mins`,
`buzzer_count`, `collection_interval_mins`, `operator_collection_interval_mins`,
`network_printer_address`, `network_print_device_id`. (`display_layout` and `split_screen` are
read-only on this screen.)

A "Same as Van1" switch over **these** would be straightforward.

### What is NOT — and it is rendered inside every van's card

Three controls sit inside each van's **Kitchen capacity** card and are **truck-level**:

| Control shown per van | Actually stored on | Written by |
|---|---|---|
| Prep | `menu_categories.prep_secs` | `updateCatField` → `api('upsert_category')` |
| Items | `menu_categories.batch_size` | `updateCatField` → `api('upsert_category')` |
| Counts to total capacity | `menu_categories.counts_toward_capacity` | `toggleCatCapacity` → `api('upsert_category')` |

`upsert_category` writes `from('menu_categories') … .eq('truck_id', truck.id)`. There is **no
`van_id` column on `menu_categories`** anywhere — not in any migration, not in any code path.

### Why that blocks the feature rather than complicating it

There is **one row per category for the whole truck**. So:

1. A "Same as Van1" switch would collapse and expand three controls that are not that van's
   settings at all — turning it off for Van 2 would offer to "differ from Van 1" on a value
   that physically cannot differ.
2. "Copy Van 1's settings to this van" is not possible for those three. There is nothing to
   copy from or to; both vans are already reading and writing the same row.
3. Worse, it would read as working. An operator would set Van 2's prep time believing it was
   Van 2's, and silently change Van 1 as well.

Making it real needs a `van_id` on `menu_categories` (or a per-van override table), a
migration, a rewrite of `upsert_category`, and a decision about what existing rows mean. That
is a different piece of work and it needs your call first.

**The first-van rule** ("Van 1" = the first van by creation order) is therefore not
implemented — there was nothing to apply it to.

The harness pins the stop: it asserts `same_as_first_van` appears **nowhere** in the codebase
and that `upsert_category` is **still** truck-scoped, so a later pass cannot half-build this
without a failing check.

---

## 5 · Part B — the Add event preview and the van default

### B.1 · It renders the public page's own card

`lib/schedule-graphics/event-preview.ts` is an **adapter**, not a second card. The preview
renders `components/TruckListCard` — the same component `app/trucks/[slug]/TruckClient.tsx`
uses for every event on a truck's public page. The adapter only builds the props.

Copying that card's markup would have given the operator a preview that drifts from the thing
it previews the first time either is restyled, which is the one failure a preview must not have.

- **Live.** It updates as the form is typed.
- **Placeholders, never junk.** `new Date('')` is an Invalid Date and renders as the literal
  string "Invalid Date". Every field is guarded: a date that is not `YYYY-MM-DD` becomes
  "Pick a date" rather than a parsed value, a blank time becomes `--:--` (which reads as "not
  set" rather than as midnight), a blank venue becomes "Where are you trading?".
- **No fake Order button.** `status: 'unconfirmed'` plus `hideOrderButton` — an unsaved event is
  neither live nor orderable, and a working Order button on an event that does not exist would
  be a lie the operator could click.
- **Desktop / iPad ≥768:** in the fixed footer, left of Cancel / Add event, replacing the
  "Filled from" line — which is kept as a muted line inside the preview.
- **Phone:** the pinned place card becomes the preview line — place · date · times · van. It
  drops empty parts rather than printing separators around them; a line reading
  "· Tue 13 Oct · ·" is worse than a short one, and it is what naive joining produces.
- **The footer does not crowd the form.** Measured, not assumed — see §7.

### B.2 · The van default

When a place is picked and the truck has more than one van, the van used at that place's most
recent **non-cancelled** event is pre-selected.

- **Never overrides the operator** — `van_id: p.van_id ?? vanDefault`.
- **Never an inactive van.** `activeVanIds` is the gate. A van removed from the truck still
  appears on its old events, and pre-selecting one would put a new event on a screen nobody is
  watching.
- **Returns null rather than guessing.** No history, no van recorded, or a van no longer active
  leaves the field exactly as it is today ("Select a van"). A wrong pre-selection is worse than
  none: the operator may not look, and the van decides which screen the order appears on.
- `cancelled` is excluded, `closed` is **not** — the same split as Last/Next in `places.ts`: a
  closed event is the clearest evidence of which van actually traded there.
- Dates are compared as `YYYY-MM-DD` **strings**, not via `new Date()`, which on a date-only
  value is UTC midnight and shifts the ordering for anyone west of London.

---

## 6 · Corrections you raised mid-build, each fixed at the cause

### 6.1 · Sections had no headers; tabs looked disabled; tabs needed two presses

**Headers.** I had read "do not show the same words twice" as "drop the heading" for the three
sections whose card title already said the same words — which left Auto-replies with no header
at all, the opposite of what a jump target needs. Corrected the other way round: all eight
headings stay, the duplicate **card titles** go.

**Greyed out.** `text-slate-400` against the slate-50 bar reads as *disabled* rather than as
*unselected*. Now `text-slate-600`.

**The double-click — root cause.** `btn.scrollIntoView({ block: 'nearest' })`, used to keep the
active tab in view, **walks every scrollable ancestor** — including `<main>`. So keeping the tab
in view scrolled the page back and undid the jump that had just started. The second press
appeared to work only because `activeId` was already correct, so the effect did not re-run.
Replaced with a direct horizontal `bar.scrollLeft` write: one axis, one element.

### 6.2 · "Settings" removed; the bar moved to the top

The page title duplicated the tab you just pressed to get there, so it went. The bar moved
above "New to HatchGrab?" and "Get the app" — the navigation should be the first thing met.

### 6.3 · The bar had two resting positions — the real cause, and why the first fix was wrong

**Reported:** the bar starts lower and rises when you select a tab; it should be locked at the
risen position.

**Cause:** `position: sticky` can only hold an element at or **below** where it sits in normal
flow. The bar is `top-0` inside the scroller, but its flow position is 24px lower, because
every tab's content sits in the shared `pt-6` wrapper. At `scrollTop: 0` the pin therefore had
nothing to do and the gap showed; any scroll let it pin flush. Two resting positions.

**My first fix was wrong and I replaced it.** `-mt-6` on the bar made it flush, and the
measurement went green — but **six** notification banners can render above the tab content in
that wrapper (walkthrough, approvals, allergens, domain, Stripe, missing fields), and a fixed
negative margin pulls the bar up *through* whichever one is showing.

**The fix that shipped** is a rule in `app/globals.css`: when a sub-tab bar **is** the first
thing in the wrapper, the wrapper gives up its top padding, so the bar's flow position and its
pinned position are the same pixel.

```css
.manage-tab-pad:has(> [data-subtab-bar]:first-child),
.manage-tab-pad:has(> *:first-child > [data-subtab-bar]:first-child) { padding-top: 0 }
```

Two selectors because the bars sit at two depths: Menu's row and Schedule's row are direct
children of the wrapper (Schedule's component returns a fragment, so its children are hoisted),
while Settings' bar is one level deeper inside `SettingsTab`'s own root. Both are measured.

It also cannot drift — there is no boolean to keep in sync with those six banner conditions.

**Note on the harness's share of this.** The render harness had been *printing*
`bar@124 scroller@100` at rest every run and only asserting flushness **after** scrolling
1200px. The number was visible and nothing failed on it. A log line is not a check; it is now
an assertion at `scrollTop: 0`, with a broken variant for each depth and one for the banner case.

### 6.4 · One sub-tab bar everywhere — but Menu and Schedule keep their separate pages

Menu and Schedule used pills, on the reasoning that the top tab bar is the app's one underlined
row. You asked for Settings' treatment on all three. The classes now live once —
`SUBTAB_BAR`, `SUBTAB_ROW`, `subtabBtn()` — so a restyle cannot leave three rows looking like
three different controls.

**The behaviour did not come across, deliberately.** Menu and Schedule each render a *different
component* per tab and still do: no scroll-spy, no `scroll-margin-top`, no `#hash`, no jumping.
Giving them Settings' behaviour would mean merging separate pages into one, which is not what
was asked. There is a check that asserts this, so a later "unification" cannot slip in.

### 6.5 · The logo folded into Truck details

The logo had a card of its own directly above, so Settings opened with two boxes that are both
"what my truck is". Now one box. It is a move, not a rewrite: the same `uploadLogo` /
`removeLogo`, the same `ImageDropSlot`, the same disabled rules, the same copy, with a divider
between the two halves.

**Then corrected:** "Logo" had kept `text-base font-bold text-slate-800` — the **card-title**
treatment — so as the first line of the combined box it read as the header for the whole thing,
truck name and description included. It is now a **field label**, using the exact classes
`Input` gives "Truck name" and "Description" in that same card, so the box's only header is the
section's `<h2>`.

### 6.6 · Auto-replies keeps its card title, repeat and all

Its title had gone with the other two. You asked for it back. That card is hidden in the native
app and sits among other cards, so without its own title nothing names the box — the
duplication is the lesser cost, and it is your call rather than a tidiness rule. There is now
an assertion saying so, so a later de-duplication pass cannot quietly take it again.

---

## 7 · The content loss I caused, found, and repaired

**This is the most important thing in this report.**

Reordering the eight sections was done by cutting each block from its banner comment to its own
`</section>` and re-joining them in the new order. Every byte **between** one `</section>` and
the next marker — content that belonged to no section — was silently discarded.

**189 lines went:**

- the remove-van confirmation modal ("Remove {van}?", "✓ Preserved: Past event records…");
- the van billing modal ("Add another truck");
- the van upgrade modal ("Upgrade to add more vans", including its iOS purchase-CTA suppression);
- the emoji picker ("Choose your icon");
- the "put your schedule on your own website" card;
- the DANGER ZONE comment above `DeleteAccountSection`.

**Why it was invisible:** it still type-checked and still rendered, because everything lost was
either a **modal** — hidden until its state is set — or one card below the fold. `npx tsc`
passed. Every other check in the harness passed. A reorder is not a safe refactor just because
the types still line up.

**How it was found:** the wording-diff check reported four strings missing from `SettingsTab`
that no allowlist covered. Chasing those four led to the chunk.

**Repair:** restored from commit `197cb8c` at its original relative position — the modals and
the embed card before the Account deletion section, the danger-zone comment back above
`DeleteAccountSection`. A full line-level audit against `197cb8c` now shows **zero** unexplained
missing lines; every remaining difference is a deliberate change listed in this report.

**The guard, which is the point:** the harness now diffs **every line** of the page against
`197cb8c` as a **multiset** — `</div>` appears hundreds of times, so a line deleted in one place
is not excused by an identical line elsewhere — and fails on any line that went missing outside
an explicit, itemised allowlist. That is the check that would have caught this in seconds.

---

## 8 · Harness results

### `scripts/schedule-graphics-places.cjs` — **227 checks, 59 broken variants, all pass**

Every rule has at least one broken variant that must fail. New in this build:

| Variant | The bug it reinstates |
|---|---|
| W25–W32 | section shell, measured offset, spy reads `<main>`, `#hash`, px floor |
| W33 | the cancellation group left behind in Contact |
| W34–W39 | the preview stops using the public card; an Order button on a non-existent event; a raw date handed to the card ("Invalid Date"); the van default overriding the operator; an inactive van offered |
| W40 | **the double-click returns** — `scrollIntoView` on the tab scrolls the page back |
| W41 | a section loses its own header — how Auto-replies ended up with none |
| W42 | the bar drops back below the two intro cards |
| W43 | the tabs go back to looking disabled |
| W44 | **the bar loses `data-subtab-bar`** — two resting positions again |
| W45 | the Auto-replies card title is "de-duplicated" away again |
| W46 | the stray divider returns above the cancellation wording |
| W47 | the cancellation box goes back on top of the main Order settings box |
| W48 | Menu and Schedule revert to pills |
| W49 | the Settings section order is scrambled, so a tab jumps to the wrong place |
| W50 | the logo gets its own card back |

Also asserted: nothing of stage 2/3 exists (no upload, no canvas, no checklist), and A.4 is
**not** half-built — `same_as_first_van` appears nowhere and `upsert_category` is still
truck-scoped.

### `scripts/schedule-places-render.cjs` — layout measured in **WebKit and Chromium**

Every class in every fixture is **lifted from the real source** (`lift()` throws if a class
list changes), so a fixture cannot drift from the page the way one did in the previous build.

| Measurement | 1440×900 | 820×1180 | 390×844 |
|---|---|---|---|
| Measured pin height | 44 | 44 | 44 |
| Bar top vs scroller top **at rest** | 100 vs 100 | 100 vs 100 | 100 vs 100 |
| …after scrolling 1200px | 100 vs 100 | 100 vs 100 | 100 vs 100 |
| Tabs on one row / no page h-scroll | ✓ | ✓ | ✓ |
| Headings landing below the bar | 8/8 | 8/8 | 8/8 |
| First setting visible after a jump | 8/8 | 8/8 | 8/8 |
| Last section reaches the pin line | 756px ✓ | 1036px ✓ | 700px ✓ |

Plus:

- **Direct-child depth** (as Menu and Schedule): 0px at rest, 0px scrolled — the second
  `:has()` selector works.
- **Banner case:** banner@124, scroller@100, banner/bar overlap **−16px** — no overlap, and the
  wrapper keeps its padding, so the banner is not jammed against the tab bar. This is the case
  the rejected `-mt-6` fix would have broken.
- **Broken variant (no `data-subtab-bar`):** 24px at rest, 0px after scrolling — the two
  resting positions, reproduced.
- **Broken variant (`<main>` gains `pt-6`):** bar sits 24px below the scroller's top.
- **Add-event modal:** preview 75px, footer 100px, form pane 619px at 1440 and 871px at
  820×1180 — the footer does not grow so tall the form is cramped on an iPad.
- **Control:** with the two-pane grid removed, 1440 stacks — so the side-by-side assertions can
  tell the difference.

### Repo-wide

- `npx tsc --noEmit` — clean.
- ESLint on added lines — **no error on any line this work wrote.** Ten flagged lines were
  checked individually against `197cb8c` and are all pre-existing code the reorder *moved*
  (`(form as any)` casts, a `Date.now()` purity warning, two unescaped entities).
- `node scripts/run-harnesses.cjs` — **82 run · 82 passed · 0 failed.**

---

## 9 · Test list for localhost

Start at `http://localhost:3000/login`. Use **Village Spice**. Do not open Pizzeria Gusto.

1. **Settings opens with the bar already at the top.** Go to Manage → Settings. The jump bar
   should be flush under the tab bar **on load** — not 24px down, and it must not move when you
   then scroll or tap. This is the bug from §6.3; watch the bar's top edge, not the content.
2. **One press per tab.** Tap each of the eight tabs once. Each should jump on the **first**
   press, with the heading *and* its first setting fully visible below the bar.
3. **The order is right.** Truck details, Contact, Order settings, Truck settings, Schedule,
   QR code, Auto-replies, Account deletion.
4. **Every section has a header**, and nothing reads twice except Auto-replies, which should
   show both its section heading and its card title (§6.6).
5. **Scroll-spy.** Scroll slowly with your finger/wheel and watch the underline follow. Scroll
   right to the bottom — "Account deletion" must be the lit tab.
6. **Phone width.** At 390px the eight tabs scroll sideways and **the page does not** move
   horizontally. Tap the last tab and confirm it scrolls itself into view.
7. **Deep link.** Open `…/manage/<token>#qr-code` directly. It should land on QR code.
8. **Logo in the Truck details box.** One box, with "Logo" as a small field label — *not* as a
   heading over the whole box — then the divider, then Truck name and Description.
9. **Cancellation.** In Order settings, "Allow customers to cancel orders" has its own heading,
   sits **below** the main Order settings box, and has **no line above the wording**. Toggle it
   and change the cutoff; both must save as before.
10. **Nothing lost (§7).** This is the important one. In Truck settings: press **Remove** on a
    van and confirm the "Remove {van}?" dialog appears with its "✓ Preserved:" note (then
    **Keep van**). Press **Add van** and confirm the billing/upgrade dialog appears. Open the
    **emoji picker** for a van icon. Then scroll to the bottom and confirm the "put your
    schedule on your own website" card is present above the danger zone.
11. **Menu and Schedule look the same as Settings.** Both show the underlined bar, not pills.
12. **…but still behave as pages.** Switching a Menu or Schedule sub-tab must **swap the page**,
    not scroll. Nothing should jump or smooth-scroll.
13. **Add a second van** (Truck settings → Add van), then go to Schedule → Add event and pick a
    place with history: the van used at its most recent non-cancelled event should be
    pre-selected. Change it by hand and re-pick the place — your choice must survive.
14. **The preview.** In Add event on desktop/iPad, the footer shows the live event card left of
    Cancel / Add event. With the form empty it must read "Where are you trading?" / "Pick a
    date" / `--:--` — **never** "undefined" or "Invalid date". Fill the fields and watch it
    update. There must be **no Order button**.
15. **The preview on a phone.** The pinned place card becomes one line: place · date · times ·
    van, with empty parts dropped rather than leaving stray `·` separators.
16. **The banner case (§6.3).** If you can get a notification banner to show at the top of
    Settings — e.g. clear a mandatory field such as contact phone to trigger "Complete your
    profile" — confirm the bar sits **below** the banner and does not overlap it. Restore the
    field afterwards.

---

## 10 · Noticed, not changed

1. **`menu_categories` has no `van_id`.** The blocker in §4. Three controls presented per van
   are truck-level, and an operator editing them on Van 2's card is editing Van 1 as well. This
   is a live correctness issue independent of "Same as Van1", and it needs your decision about
   whether those three should become per-van.
2. **Six notification banners stack above every tab's content** in one wrapper, each with its
   own dismissal rule. On a truck that trips several at once, the actual page starts a long way
   down. Worth a single collapsed notice area.
3. **`app/manage/[token]/page.tsx` is ~14,600 lines** and holds `SettingsTab`, `ScheduleTab`,
   `TeamTab`, `BillingTab` and more. It is the reason the §7 loss was possible: a 189-line
   deletion in the middle of it is not visible in review. `SettingsTab` alone is ~3,100 lines
   and would split cleanly along the eight sections this build just introduced.
4. **ESLint reports 386 pre-existing problems in that file** (304 errors), including
   `react-hooks/set-state-in-effect`, a `react-hooks/purity` error on `Date.now()` during
   render, and many `(form as any)` casts. None are mine; none were touched. The `as any` casts
   around `truck_order_email_enabled`, `show_paid_step` and `takes_cash` suggest the `form` type
   is missing fields that exist in the database.
5. **`display_layout` and `split_screen` are read-only on the van card** with no indication of
   where they *are* set.
6. **The tour step in `SETTINGS_SECTIONS`' old order** — any saved walkthrough that referenced
   Settings sections by index rather than id would now point at the wrong one. I found no such
   reference, but it is worth a thought if one is added later.

---

## 11 · Standing rules observed

- Worked only on `schedule-graphics`. `git branch --show-current` → `schedule-graphics` before
  committing. Nothing was pushed to, merged into, or rebased onto `main`.
- No SQL run. **No migration written** — A.4 was stopped, not built (§4).
- Village Spice only. Pizzeria Gusto untouched. No key printed.
- No local bundle build used to prove a deploy. Two builds were run, both solely so the render
  harness measured against real Tailwind output rather than stale CSS — the first run after the
  `:has()` rule was added failed for exactly that reason and caught it.
- No background polls or waits.
- `docs/manage-tabs-quick-report.md` and `docs/schedule-add-event-report.md` read first, along
  with `docs/schedule-graphics-unpublish-report.md` §7 and `docs/schedule-places-report.md` §3.
