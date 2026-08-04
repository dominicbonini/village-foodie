# Slice K — end-of-wizard review, and the dashboard walkthrough

**Date:** 4 August 2026. Framework build.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.

No garbled spans. Three things needed correcting or checking before shipping, all flagged below: the
K3 closing clause (verified FALSE, withdrawn), the "update_settings allowlist" premise (three endpoints,
not one), and the scope check on the four K1 items (all four confirmed on Settings, none dropped).

Your three mid-build messages are all incorporated: the live-verified defaults, the order-ready opt-in
framing, and the revised closing-stop copy.

---

## 🔴 THE THREE REQUIRED CHECKS, UP FRONT

### 1. The allowlist check for all four K1 settings — all pass, but not on one endpoint

The brief says *"If a setting is not on update_settings' allowlist, it will silently no-op."* True, and
the trap is real — but **only one of the four goes through `update_settings` at all.** The four columns
have three different owners, and each has its own allowlist with the same silent-drop behaviour:

| # | Setting | Column | Action | Allowlist | Result |
|---|---|---|---|---|---|
| 1 | Total capacity | `truck_vans.kitchen_capacity` | `update_van_settings` | destructured params, [app/api/manage/route.ts:978](app/api/manage/route.ts#L978) | ✅ **present** |
| 2a | Allow cancellation | `trucks.allow_customer_cancellation` | `update_truck` | `allowed[]`, [:854](app/api/manage/route.ts#L854) | ✅ **present** |
| 2b | Cutoff window | `trucks.cancellation_cutoff_mins` | `update_truck` | same | ✅ **present** |
| 3 | Auto-accept | `trucks.auto_accept` | `update_settings` | `ALLOWED[]`, [:796](app/api/manage/route.ts#L796) | ✅ **present** |
| 4 | Order-ready step | `truck_vans.order_ready_enabled` | `update_van_settings` | as row 1 | ✅ **present** |

**Nothing is missing, so there was nothing to stop for, and I have added nothing to any allowlist.**
All three actions already existed; no new endpoint was created.

⚠️ Worth knowing about row 4: `update_van_settings` does **more** than write the van column. Flipping
`order_ready_enabled` also bulk-writes `order_ready_override` onto **every event for this truck**
([:997](app/api/manage/route.ts#L997)) — by design, per its own comment. A brand-new truck usually has
zero or one event, so the blast radius here is nil, but the review screen is firing a bulk write and
you should know that.

### 2. 🔴 The closing-stop clause was FALSE — verified, withdrawn, and your revision shipped verbatim

The original draft ended *"…have a play around, nothing you do here goes live until you want it to."*
Checked against the code, as instructed, and it does not hold:

* **Deals go live on save.** `DealsTab`'s `emptyBundle` sets `apply_to_new_events: true`
  ([app/manage/[token]/page.tsx:5441](app/manage/[token]/page.tsx#L5441)). The customer menu route,
  finding no `event_deals` rows for the effective event, falls back to
  `filteredBundles.filter(b => b.apply_to_new_events)`
  ([app/api/menu/[truckId]/route.ts:205](app/api/menu/[truckId]/route.ts#L205)) — so a newly saved deal
  appears on the next open or confirmed event immediately, subject only to a stock check.
* **Upsells go live on save.** `.from('upsell_rules').select('*').eq('truck_id', truck.id)`
  ([:93](app/api/menu/[truckId]/route.ts#L93)) has **no visibility filter of any kind**, and the result
  is emitted at [:613](app/api/menu/[truckId]/route.ts#L613) and consumed by the customer order page
  ([app/trucks/[slug]/order/page.tsx:730](app/trucks/[slug]/order/page.tsx#L730)).

Your mid-build revision — **"Deals, upsells and customisations live in these tabs — have a play
around."** — drops the false clause entirely, so it ships verbatim. The verified finding is recorded in
a 🔴 comment beside the line so nobody reintroduces a "this is only a draft" reassurance.

⚠️ One thing left for your judgement, not changed: *"have a play around"* still sits beside two tabs
that publish to customers on save. Your call whether that matters for a truck with no confirmed event
yet (which is the state a just-finished operator is in — so in practice nothing is visible to anyone).

### 3. 🔴 Scope check — all four items are on Manage → Settings, none dropped

Checked against the inventory rather than assumed:

| Item | Lives on Settings at | Inventory § |
|---|---|---|
| Total capacity | **Your trucks → Kitchen capacity → "Total capacity"** | W1 §10 |
| Allow cancellation + cutoff | **Contact Details → "Allow customers to cancel orders"** | W1 §3 |
| Auto-accept | **Order settings → Accepting orders → "Auto-accept orders"** | W1 §8 |
| Order-ready step | **Your trucks → Display settings → "Order-ready step"** | W1 §10 |

All four are Settings-tab settings. Nothing came from another tab, and nothing was dropped. Those exact
strings are the `settingsAnchor` values rendered under each row.

---

## K1. THE SETTINGS REVIEW SCREEN

A new `ImportStep`, `'settings'`, between `'schedule'` and `'done'`
([app/manage/[token]/page.tsx:5274](app/manage/[token]/page.tsx#L5274)). Same modal shell, same
scroller (so H2's scroll-to-top applies), same stepper — which now carries a sixth pill, **Settings**,
appended after Schedule and inSetup-only like it.

**Framing, as briefed:** *"We've set you up with some common settings. Worth a quick look — you can
change any of these later in Settings."*

### 🔴 How the step avoids gating itself out

`finishSetup()` writes `setup_step: 'done'`, which flips `inSetup` false — and this step is
`inSetup`-gated. Calling it before the review would have unmounted the review. So:

* the schedule step's two terminal moves (`skipSchedule` and the save-events path) now call
  `goToSettingsReview()`, which **only** sets `importStep` and writes nothing;
* `finishSetup()` is unchanged and is now called from **exactly one place** — this screen's
  "Looks good →" ([:5343](app/manage/[token]/page.tsx#L5343)).

### Data-driven, as required

One array, `setupReviewItems`, of
`{ id, label, helpText, currentValue, control, settingsAnchor, disabled?, onChange, secondary? }`.
The renderer reads only `control` (`'toggle' | 'capacity'`) and the optional `secondary`, and knows
nothing about any particular row. **A fifth setting is one more object in the array.**

### 🔴 Every value is read live — nothing is hardcoded

* van columns come from a fresh `get_vans` call fired when the step opens (the existing action, no new
  endpoint), into `reviewVan`;
* truck columns are seeded from the live `truck` row at the same moment;
* while the van read is in flight, `reviewVan` is null, both van rows render **disabled** and the screen
  says "Loading your current settings…" — it does not render a placeholder value.

Your live-verified defaults are recorded in the code comments, but **nothing renders them** — they
document what a fresh truck will typically show, they are not a fallback:

| Column | Verified default | How it renders here |
|---|---|---|
| `trucks.allow_customer_cancellation` | nullable, DEFAULT **true** | live value; `?? true` only if the row itself is null |
| `trucks.cancellation_cutoff_mins` | nullable, DEFAULT **30** | live value; `?? 30` only if null |
| `truck_vans.order_ready_enabled` | NOT NULL, DEFAULT **false** | live value, always present |
| `truck_vans.kitchen_capacity` | **left blank at provision, deliberately** | **stays blank** — see below |

**Total capacity keeps its blank.** It uses `BatchSizeSelect`, the same control the kitchen-setup step
uses, which renders `<option value="">∞</option>` for null and maps `''` ⇄ `null` both ways. An unset
capacity shows **∞**, and nothing pre-fills it.

### Item 4 is framed as an opt-in, per your message

Because `order_ready_enabled` is `NOT NULL DEFAULT false`, it is not a default somebody chose and got
wrong — it is a feature that has never been switched on, and asking "is this right?" about it would
mislead. So:

> **Let customers know when their order is ready**
> Off unless you turn it on. Adds a "Mark ready" button to your orders screen and tells the customer
> their food is waiting — worth it for pubs and festivals.

The other three read as checks; this one reads as a question. The reasoning is in a 🔴 comment on the
item so it survives a copy edit.

**No item is mandatory.** "Looks good →" is always enabled, and a failed save shows a toast and leaves
the operator on the step rather than trapping them.

### Gusto and RTF

**Unaffected.** The step is `importStep === 'settings' && inSetup`, and `importStep` never takes that
value on any path they can reach — it is set only by `goToSettingsReview()`, which is only called from
the schedule step, which is itself `inSetup`-gated. The Settings pill is likewise inSetup-only, so
their stepper is byte-for-byte what slice H left. No Settings-tab markup was touched.

---

## K2. THE WALKTHROUGH OFFER

Replaces the done screen's single "Go to my dashboard →" with three controls
([:5416](app/manage/[token]/page.tsx#L5416)), still `inSetup`-gated:

`[ Show me around ]` · `[ Remind me later ]` · `I'll explore myself`

All three exit identically (`resetImportState()` + `reload()`); they differ only in what is recorded.
**The choice is reported UP** to the page via `onWalkthroughChoice`, so the page is the single owner of
the stored state and this component cannot write a value the reminder strip's condition disagrees with.

* **Show me around** → sets `walkthroughOpen` true *before* the wizard unmounts, so the tour opens over
  a live Manage page. Stores nothing yet — closing the tour is what stores `'seen'`, so someone who
  opens it and immediately hits Escape is still recorded as done rather than being asked forever.
* **Remind me later** → stores `'remind'`, leaving the strip.
* **I'll explore myself** → stores `'seen'`, showing nothing further.

**The strip** ([:512](app/manage/[token]/page.tsx#L512)) sits at the top of Manage's `<main>`, above the
existing banners: a slate bar reading *"Want a quick tour of your dashboard?"* with a **Show me around**
button and a **×**. Persistent until taken or dismissed — **one boolean, no timer and no timestamp**,
in the same per-truck key. Dismissing stores `'seen'`, which is what taking it stores too: both mean
"stop offering".

**Gusto and RTF: unaffected.** The offer is on the wizard's done screen, which they never see, and the
strip requires `walkthroughState === 'remind'` — a value only these three buttons can write.

---

## K3. THE WALKTHROUGH

[components/manage/Walkthrough.tsx](components/manage/Walkthrough.tsx) +
[lib/walkthrough.ts](lib/walkthrough.ts).

**One screen, no navigation.** Every stop points at the tab bar from wherever the operator already is.
The component never calls `setActiveTab` — so there is no state to preserve, nothing to restore if it is
closed halfway, and no way to strand someone on a tab they did not pick.

### The five stops, against the real W6 tab list

| # | Anchors (`data-tab-id`) | Line |
|---|---|---|
| 1 | `menu` | "Your dishes, prices and allergens. Change anything here and it's live straight away." |
| 2 | `schedule` | "Where and when you're trading. Add an event here and customers can order for it." |
| 3 | `settings` | "Your truck's details, how customers pay, and your kitchen's capacity." |
| 4 | `billing` | "Where your plan, billing and feature information lives." |
| 5 | `deals` **+** `modifiers` | "Deals, upsells and customisations live in these tabs — have a play around." |

### Anchoring — stable identifier, not position

Each tab button now carries `data-tab-id={t.id}` ([:482](app/manage/[token]/page.tsx#L482)), and the
component resolves `[data-tab-id="…"]` from the live DOM at open time. Nothing knows that Menu is first
or Billing is last, so the bar can be reordered, role-filtered or extended without touching either new
file. Stop 5 takes the **union rect** of its two anchors, so one highlight spans both tabs.

### 🔴 A stop with no rendered target is SKIPPED

The live stop list is filtered once, at open, to those with at least one resolvable anchor. So a
**manager**, who has no Billing tab (W6: `billing` requires `userRole === 'owner'` and a non-tester
plan), gets **four stops numbered 1–4**, not five with one pointing at nothing. Filtering once rather
than per-render is deliberate: the bar re-renders when the Schedule pending count changes, and a list
that changed length mid-tour would move the operator's position under them.

### Closing

**Skip on every stop** (including the last, beside Done), **Escape**, and **click-outside** all call the
same `onClose`. All three count as completing it — the page's `closeWalkthrough` stores `'seen'`
whichever route was taken.

### Narrow screens

The Manage tab row is `overflow-x-auto`, so on a phone Team, Settings and Billing are off-screen until
scrolled. Three things handle that:

1. each stop calls `scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })` on its
   anchor **before** measuring — `auto`, not `smooth`, so the measurement is not racing an animation;
2. the popover is **clamped to the viewport**
   (`max(8, min(anchorCentre − 160, vw − 328))`) rather than aligned to the anchor's left edge, which
   would push it off-screen for the last tab;
3. its width is `min(320px, calc(100vw − 16px))`, so it fits a ~320px phone with an 8px gutter.

A `resize` listener and a **capturing** `scroll` listener re-measure — capturing because the scroller is
the tab row, not the window, and a bubbling listener would never fire.

### Gusto and RTF

**Unaffected unless they ask.** The component is rendered only while `walkthroughOpen` is true, and
that is set exclusively by three click handlers. See K4.

---

## K4. PERSISTENCE AND RE-ENTRY

**Per-device localStorage, keyed per truck:** `hg_walkthrough_${token}`, values `'seen' | 'remind'`,
absent otherwise. This follows the settled pattern the codebase already chose — `keep_screen_on` and
`sound_config` were both *moved out* of the database to per-device storage. **No column, no migration.**

### 🔴 How "never seen ⇒ never auto-opens" is guaranteed

Three facts, each independently sufficient, and all mechanically checkable:

1. **There is no auto-open code path at all.** `walkthroughOpen` starts `false` and is set `true` in
   exactly three places, all click handlers: the done screen's "Show me around", the reminder strip's
   button, and Settings → "Show me around". `grep` for `setWalkthroughOpen(true)` returns those three
   and nothing else. No effect reads the stored state and opens anything.
2. **The stored state is only ever *read* to decide the strip**, and that test is
   `walkthroughState === 'remind'` — **explicit equality, never `!== 'seen'`**. The inverted test would
   have rendered the strip for everyone who has never interacted, i.e. every live operator. This is the
   one line where the bug would have lived, and it is commented as such.
3. **`readWalkthroughState` returns `null`** for a missing key, a corrupt value, or a thrown
   `localStorage` (private mode) — all three collapse to "never interacted", never to "show it".

Gusto and RTF have no key for their truck and never will until they click something. They see **nothing
new anywhere** except the one Settings card described below.

**Gated to post-setup:** the strip additionally requires `setup_step` to be null or `'done'`, so it
cannot appear behind the wizard.

### Where the re-open entry point went

**The last card at the bottom of the Settings tab**, immediately after "Your trucks"
([:9197](app/manage/[token]/page.tsx#L9197)) — its own small section:

> **New to HatchGrab?**
> A quick tour of what lives on each tab. Takes about a minute.  `[ Show me around ]`

Placed there because W5 found there is nowhere natural: no footer, no help surface, and `UserMenu` is
shared with the dashboard and the KDS so anything added there appears on all three. **It is a holding
place, not a home** — a walkthrough is not a setting, and this is the bottom of the longest page in the
product. The code comment says so explicitly and names the help centre as its intended destination.

**This card is the one thing Gusto and RTF do see** — a static card at the bottom of Settings, below
"Your trucks". It opens the tour only if clicked, and stores nothing until then.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 371 problems (294 errors, 77 warnings)

$ npx eslint lib/walkthrough.ts components/manage/Walkthrough.tsx
(no output — clean)
```

| File | Baseline | Now |
|---|---|---|
| `app/manage/[token]/page.tsx` | **371** (294 errors, 77 warnings) | **371 (294 errors, 77 warnings)** — exactly the baseline |
| `lib/walkthrough.ts` | new | **0** |
| `components/manage/Walkthrough.tsx` | new | **0** |

Getting back to 371 took four real fixes rather than suppressions: the van-review effect was initially
placed **above** the state it writes (a genuine TDZ hazard, not a lint quibble, caught by
`react-hooks/immutability`); three `catch (e: any)` blocks were replaced by one typed
`reviewSaveFailed(e: unknown)` helper. Two `set-state-in-effect` disables remain and are justified
inline — reading `localStorage` post-mount (a lazy initialiser would hydrate-mismatch) and measuring the
DOM in a layout effect (a coach mark's position cannot be known during render).

### Files touched

| File | Reason |
|---|---|
| [lib/walkthrough.ts](lib/walkthrough.ts) | **NEW.** Stop definitions + the per-device seen-state helpers. |
| [components/manage/Walkthrough.tsx](components/manage/Walkthrough.tsx) | **NEW.** The coach-mark overlay: anchor resolution, skip-if-absent, clamping, Escape/click-outside. |
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | K1 review step + its data array and live reads; K2 three-way offer and the reminder strip; K3 `data-tab-id` anchors and the page-level mount; K4 the Settings re-open card. |

Nothing else. No migration, no SQL, no new endpoint, no allowlist edit.

### Gusto and RTF at a glance

| Part | Effect |
|---|---|
| K1 review step | **Unaffected** — `inSetup`-gated, and `importStep` cannot take `'settings'` on any path they reach. Their stepper is unchanged. |
| K2 offer + strip | **Unaffected** — the offer is on the wizard's done screen; the strip requires a stored `'remind'` only those buttons can write. |
| K3 walkthrough | **Unaffected unless they click.** No auto-open path exists. The only page change they touch is a `data-tab-id` attribute on each tab button, which renders nothing. |
| K4 Settings entry | **Visible** — one static card at the bottom of Settings, deliberately, so an existing operator can find the tour. It stores nothing until used. |
