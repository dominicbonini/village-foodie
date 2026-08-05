# Wizard review screen, copy, and two read-only questions

**Date:** 4 August 2026.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
No garbled spans.

**One premise needed correcting (Q1) and one description needed adjusting after checking it (Q9);
both are set out under their items rather than built around.**

---

## Q1. 🔴 THE REVIEW SCREEN IS ALREADY THE FINAL STEP — nothing was moved

Checked before changing anything, and there is nothing to move.

**Where it sits now** — [app/manage/[token]/page.tsx:2651-2653](app/manage/[token]/page.tsx#L2651-L2653):

```ts
const wizardSteps = inSetup
  ? [...baseWizardSteps, { key: 'schedule', label: 'Schedule' }, { key: 'settings', label: 'Settings' }]
  : baseWizardSteps
```

`'settings'` is **last in the array**, after `'schedule'`. And it is reachable from nowhere else: the
only writer of that step is `goToSettingsReview()` ([:2904](app/manage/[token]/page.tsx#L2904)), called
from the schedule step's two terminal moves — `skipSchedule` and the save-events path. Its own
"Looks good →" is the only caller of `finishSetup()`, which ends the wizard.

**What is actually first is a different thing.** `renderWizardStepper` prepends a non-clickable green-✓
pill labelled **"Your details"** ([:2755](app/manage/[token]/page.tsx#L2755)) in setup mode — a record
of the account/truck step already completed in the signup modal, not a screen the wizard can open. Read
top-to-bottom, the review screen shows the heading *"A few settings to check"* with the stepper beneath
it beginning *"Your details ✓ ›"* — which is, I think, the "Your details – a few settings to check"
in the brief: two adjacent pieces of chrome, not one misplaced step.

**Rendered order, unchanged and confirmed:**
`Your details ✓ › ② Menu › [③ Extras] › ④ Allergens › ⑤ Kitchen setup › ⑥ Schedule › ⑦ Settings`

**Changed: nothing.** Say the word if the *pill label* "Settings" or the prefix "Your details" is the
confusing part and I will rename one — but moving a step that is already last would have been a no-op
dressed up as work.

---

## Q2. TOTAL CAPACITY REMOVED FROM THE REVIEW SCREEN

The `kitchen_capacity` row is gone from `setupReviewItems`. Verified: `grep "id: 'kitchen_capacity'"`
returns nothing.

**Untouched:** the Kitchen-setup step (which still asks for it in full, with the per-category grid that
gives the number meaning), `truck_vans.kitchen_capacity`, `BatchSizeSelect`, and Settings' own capacity
card. "Total capacity" still appears 7× in the file — all of them there.

The `control: 'capacity'` branch of the renderer is retained: it costs nothing, and removing it would
mean the next capacity-shaped setting has to re-add it.

---

## Q3 & Q4. DEFAULT-STATE PHRASING STRIPPED, BY SOURCING FROM SETTINGS

These two are one change: every phrase Q3 asks me to remove was in a hand-written string, and Q4's fix
replaces every hand-written string with the Settings original — which never contained one.

### 🔴 Every string, before and after

| Row | **Before** (hand-written on the review screen) | **After** (`SETTING_COPY`, shared with Settings) |
|---|---|---|
| Cancellation — label | "Let customers cancel their own orders" | **"Allow customers to cancel orders"** |
| Cancellation — help | "**On by default.** When it is on, a customer can cancel up to the window below without ringing you." | *(none — the sentence wraps the control: "Customers can cancel up to [30 minutes] before their pickup time")* |
| Auto-accept — label | "Accept online orders automatically" | **"Auto-accept orders"** |
| Auto-accept — help | "**On, so** orders confirm themselves and customers get an answer straight away. A full slot is never auto-confirmed, and an order with a customer note still waits for you. Turn it off if you would rather check every order yourself." | **"Incoming web orders are confirmed immediately"** |
| Order-ready — label | "Let customers know when their order is ready" | **"Order-ready step"** |
| Order-ready — help | "**Off unless you turn it on.** Adds a "Mark ready" button to your orders screen and tells the customer their food is waiting — worth it for pubs and festivals." | **"Show a "Mark ready" button on the orders screen and notify customers when their order is ready. Useful for collection at pubs and festivals. Applies to all events — you can still turn it on or off for a single event on its dashboard."** |
| Capacity — label/help | "Total capacity" / "…**Leave at ∞ if you would rather not cap it**…" | *removed entirely (Q2)* |
| Secondary suffix | hardcoded "before their pickup time" | from the row's data — so it does not appear under the buzzer count |

**All three default-state phrases are gone**, including the auto-accept sentence rewritten in the
provisioning slice. Verified: the remaining "by default" hits in the file are the allergen blanket
opt-in on a different screen, one code comment, and two "collapsed by default" layout comments.

### The constants, and both consumers

**Where they live:** [lib/settings-copy.ts](lib/settings-copy.ts) — `SETTING_COPY`, one entry per
setting, with `label` / `help` (+ `cancelPrefix`/`cancelSuffix` for the sentence that wraps a select,
and `countLabel` for the buzzer count).

**Consumer 1 — Manage → Settings**, now reading the constant instead of literal JSX text:
`SETTING_COPY.allowCancellation` (Contact Details), `SETTING_COPY.autoAccept` (Order settings),
`SETTING_COPY.orderReady` and `SETTING_COPY.buzzers` (Your trucks → Display settings).

**Consumer 2 — the wizard review screen**, `setupReviewItems`.

**Settings is the source, not the other way round** — every string was lifted from what Settings already
said, so the operator meets the same words in the wizard that they will find again later when they go
looking for the setting.

### ✅ Each shared string exists exactly once

Counted across `lib/settings-copy.ts` and `app/manage/[token]/page.tsx`:

| String | settings-copy.ts | page.tsx |
|---|---|---|
| "Allow customers to cancel orders" | 1 | 0 |
| "Auto-accept orders" | 1 | 0 |
| "Incoming web orders are confirmed immediately" | 1 | 0 |
| "Order-ready step" | 1 | **2 — both code comments**, verified at :9182 and :9208; no rendered copy |
| "Do you hand out buzzers for collection?" | 1 | 0 |
| "How many buzzers do you have?" | 1 | 0 |

---

## Q5. BUZZERS ADDED

New final row on the review screen: **"Do you hand out buzzers for collection?"** with
*"Record which buzzer you gave each customer, so you know who to look for when their food is ready."*
When on, a nested **"How many buzzers do you have?"** select (1–`BUZZER_MAX_COUNT`) appears.

**It does have a Settings equivalent**, so nothing was invented — the wording comes from
`SETTING_COPY.buzzers`, sourced from Settings → Your trucks → Display settings exactly like the other
rows. Off ⇒ `null` (the feature is hidden entirely); on ⇒ `BUZZER_DEFAULT_COUNT`, the same default
Settings offers.

**🔴 The pool only.** `truck_vans.buzzer_count`. The per-event prompt `truck_events.buzzer_prompt` has
**no truck-level column at all** — it is written only by the dashboard's `set_buzzer_prompt_override`,
per event, and expires by itself when the next event starts. There is nothing on a screen about
permanent defaults it could honestly set, so it is absent rather than approximated.

### 🔴 Allowlist check — passed

**Endpoint:** `update_van_settings` (a van column, so not `update_settings` and not `update_truck`).
**Allowlist:** the destructure at [app/api/manage/route.ts:978](app/api/manage/route.ts#L978):

```ts
const { vanId, autoPauseOnOffline, show_cooking_step, order_ready_enabled, kitchen_capacity, capacity_window_mins, buzzer_count } = body
```

**`buzzer_count` is present.** An unlisted key there is silently dropped — `{ok:true}`, nothing
written — so this was checked before building, not after. It writes.

---

## Q6. THE KITCHEN SETUP EXAMPLE

`KITCHEN_CAPACITY_EXAMPLE` in [lib/kitchen-capacity.ts](lib/kitchen-capacity.ts) replaced verbatim as
briefed. Copy only — the capacity control, `BatchSizeSelect`, `kitchenCapacityNeedsPrepWarning` and the
grid are untouched.

⚠️ It is a **shared constant**, so it changes on all three surfaces that render it: the import wizard's
Kitchen-setup box, Manage → Settings' capacity card, and the dashboard's Menu & Stock card. That is the
point of the file ("SINGLE SOURCE … so the two surfaces never drift"); forking it would create the
drift it exists to prevent. **This is the one Q1–Q9 change Gusto and RTF see.**

---

## Q7. WALKTHROUGH STOP ORDER

`Deals and Extras & Upsells` moved from 5th to **3rd**. Final order, which now runs left-to-right across
the tab bar:

| # | Stop | Anchors | Tab-bar position |
|---|---|---|---|
| 1 | Menu | `menu` | 1 |
| 2 | Schedule | `schedule` | 2 |
| 3 | **Deals and Extras & Upsells** | `deals` + `modifiers` | **3 + 4** |
| 4 | Settings | `settings` | 7 |
| 5 | Billing | `billing` | 8 |

Data-only change to `WALKTHROUGH_STOPS`. The component reads the array in order and resolves anchors by
`data-tab-id`, so nothing else needed touching — which is what that design was for.

---

## Q8. THE CLOSING SCREEN

**Final copy:**

> 🎉
> **You're all set!**
> 12 items across 4 categories.
>
> *Manage is where you set your truck up and see how it's doing. The Dashboard is where you take orders
> and run each event as it happens.*
>
> **[ Show me around ]**
> **[ Remind me later ]**
> *I'll explore myself*

The count survives as the evidence beneath the celebration, still from H5's shared `n`/`m` — the same
expression the review header uses, so the two cannot disagree.

**🔴 The three walkthrough buttons are untouched** — same markup, same handlers, same
`onWalkthroughChoice('now' | 'later' | 'never')`. Only the wording above them changed.

The non-setup branch (`✅ / Menu imported! / Your items have been added to the menu.`) is unchanged, so
this is setup-only.

---

## Q9. 🔴 MANAGE vs DASHBOARD — verified, and the wording needed one adjustment

**The brief's line:** *"Manage is where you set everything up; the Dashboard is where you take orders
and run individual events."*

**What the code actually shows:**

| Manage tabs | Setup? |
|---|---|
| Menu, Schedule, Deals, Extras & Upsells, Team, Settings, Billing | yes — 7 of 8 |
| **Reports** | **no — sales history** |

| Dashboard tabs | Matches "take orders and run events"? |
|---|---|
| Orders, + Add order, Menu & Stock (per-event stock, pauses, capacity) | **yes, exactly** |

So the Dashboard half is accurate as written. The Manage half is accurate for seven of its eight tabs
but ignores Reports, which is not setup. **I did not ship the description unchanged.**

**Shipped wording** (`WALKTHROUGH_INTRO`, [lib/walkthrough.ts](lib/walkthrough.ts)):

> **Manage is where you set your truck up and see how it's doing. The Dashboard is where you take
> orders and run each event as it happens.**

*"and see how it's doing"* is the smallest honest addition that covers Reports.

**Both placements read the one constant:** the walkthrough's first stop only (repeating it on every stop
would be noise once they know), and the closing screen.

---

# READ-ONLY

## Q10. 🔴 An edit function DOES exist — and it is comprehensive

**Plainly: this is not a missing capability.** Verifying a schedule URL from Settings calls
`onVerifySuccess(data.events)` → `pendingVerifyEvents` → an effect in `ScheduleTab`
([:6257-6281](app/manage/[token]/page.tsx#L6257-L6281)) which seeds `extractedEvents` / `editedEvents`,
flags `_missingDate` / `_missingVenue` / `_missingTime`, and opens a modal titled **"Events found on your
website"**.

That modal renders a **fully editable row per event**, each bound to `updateEvent(ev.id, {...})`:

| Field | Control |
|---|---|
| Date | `<input type="date">` |
| Venue name | text input |
| Area (town) | text input |
| Postcode | text input (upper-cased) |
| Start / end time | `<select>` from `SCHEDULE_TIME_OPTIONS` (end options filtered to after start) |
| Per-event | select/deselect, delete, "exclude this venue from future imports" |

`ScheduleTab` is rendered unconditionally (with an `isActive` prop, not a mount gate) and that effect
carries **no `isActive` guard**, so the modal is expected to open over the Settings tab.

**So the code says it should have been editable.** I cannot tell from the code what Dominic hit. The two
things I would check first, both observable: whether the modal appeared at all (if `data.events` came
back empty the effect no-ops on `!pendingVerifyEvents?.length` and *nothing* opens), and whether it was
dismissed — `onClearPendingVerify()` fires in the same effect, so once closed the events cannot be
recovered without re-verifying. A screenshot of what was on screen would settle it.

## Q11. Why "Set up / review allergens" lands on the chooser

**The entry point hardcodes it.** [app/manage/[token]/page.tsx:4045](app/manage/[token]/page.tsx#L4045):

```tsx
<Btn label="Set up / review allergens" … onClick={() => { setWizardInitialMode(0); onOpenAllergenWizard() }} />
```

`wizardInitialMode` is passed straight through as `initialMode`
([:3964](app/manage/[token]/page.tsx#L3964)), and mode **0 is the card-vs-per-dish chooser**; mode 1 is
the per-dish confirmation table. The button sets `0` unconditionally — it does not consult
`truck.allergen_display_mode`, even though the surrounding IIFE has already computed exactly that value
as `mode` for its own labelling ([:3918-3932](app/manage/[token]/page.tsx#L3918-L3932)).

**The smallest change** would be to derive it from the mode already in scope:

```tsx
onClick={() => { setWizardInitialMode(mode === 'per_dish' || mode === 'both' ? 1 : 0); onOpenAllergenWizard() }}
```

One expression, one line, no new state and no new prop — `initialMode={1}` is already the shape the
import wizard passes. `'card'` and `null` would keep landing on the chooser, correctly: a card-mode
truck has no per-dish table to review, and a null-mode truck has genuinely not chosen yet.

**Reported only — not built.**

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 371 problems (294 errors, 77 warnings)

$ npx eslint lib/settings-copy.ts lib/walkthrough.ts lib/kitchen-capacity.ts components/manage/Walkthrough.tsx
(no output — clean)
```

**Baseline 371 (294 errors, 77 warnings); now 371 (294 errors, 77 warnings) — exactly the baseline.**

### Files touched

| File | Reason |
|---|---|
| [lib/settings-copy.ts](lib/settings-copy.ts) | **NEW.** Q4 — the one label/help definition per setting, read by Settings and the review screen. |
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | Q2 capacity row removed; Q3/Q4 both surfaces read `SETTING_COPY`; Q5 buzzer row + van state/load; Q8 closing copy; Q9 the intro line. |
| [lib/walkthrough.ts](lib/walkthrough.ts) | Q7 stop reorder; Q9 `WALKTHROUGH_INTRO`. |
| [components/manage/Walkthrough.tsx](components/manage/Walkthrough.tsx) | Q9 renders the intro on the first stop. |
| [lib/kitchen-capacity.ts](lib/kitchen-capacity.ts) | Q6 the replacement example. |

No migration, no SQL, no new endpoint, no allowlist edit.

### Gusto and Real Thai Food

| Item | Effect |
|---|---|
| Q1 | **Unaffected** — nothing changed. |
| Q2 review row removed | **Unaffected** — the review screen is `importStep === 'settings' && inSetup`, unreachable for them. |
| Q3/Q4 shared copy | **Effectively unaffected.** Settings now reads the constants instead of literal JSX, and every string is byte-identical to what it rendered before — including the order-ready line, where `&ldquo;`/`&rdquo;` became the same characters they always produced. Same words on screen. |
| Q5 buzzers | **Unaffected** — review screen only. Their Settings buzzer control is unchanged. |
| **Q6 capacity example** | **🔴 CHANGED, deliberately.** It is a shared constant, so the new example replaces the old one on their Settings capacity card and their dashboard Menu & Stock card as well as in the wizard. Forking it per surface would create the drift `lib/kitchen-capacity.ts` exists to prevent. This is the only Q1–Q9 change they see. |
| Q7 stop order | **Unaffected unless they open it** — the walkthrough has no auto-open path; the Settings "Show me around" entry is the only way in for them. |
| Q8 closing screen | **Unaffected** — the `inSetup` branch only; their `✅ Menu imported!` screen is untouched. |
| Q9 intro line | Appears on the walkthrough's first stop **if they choose to open it**, and on the setup-only closing screen. |
| Q10 / Q11 | **Read-only. Nothing changed.** |
