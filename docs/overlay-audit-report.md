# Overlay audit — every dismissal arm in the app, and the six that are wrong

READ-ONLY. **No edit was made, no file was written except this report.** No commit, no build, no
deploy, no `next dev`, no `next build`, no database write, no Stripe call.

**No span of the prompt arrived garbled, and no instruction contradicted another.** Nothing in the
brief required an edit, so there was nothing to stop for.

Operator (dashboard), KDS, manage, Add Order and customer are reported **separately**. Every claim is
marked **READ** (quoted from the file) or **INFERRED** (reasoned from what was read).

> 🔴 **THE HEADLINE IS NOT A CONSISTENCY FINDING.** The back handler introduced exactly one new
> defect, on the dashboard's **Cancel order** modal, and it can decline a refund the operator never
> declined. It is F1 row 1. Everything about labels and button order sits below it, and should.

---

# PART A — THE INVENTORY

## A1. Method, and a correction to the previous count

**READ** — overlays were located by `fixed inset-0` (every modal, sheet, dialog, confirm and scrim in
this app is one), then each was read for its gate, its arms and its affirmative action. Dropdowns,
toasts-with-actions and native dialogs were swept separately (A4, A5).

🔴 **CORRECTION TO `docs/android-back-handler-report.md`: manage has 31 overlays, not 33.** **READ** —
`grep -c 'fixed inset-0'` returns 33, but two of those matches are prose inside comments and render
nothing:

```
2023:  // is a `fixed inset-0` overlay, so it sits OUTSIDE the app-shell's scrolling `<main>` entirely — the
4855:          overlay treatment as every other step (fixed inset-0 bg-black/60 z-50) and the same max-w-md
```

Counting only `className=`-bearing matches gives **31**. The earlier figure was a raw grep count, and
it over-stated the unwired surface by two.

🔴 **AND A LARGER CORRECTION IN THE OTHER DIRECTION. The per-surface counts in that report were
per-FILE, not per-SURFACE.** **READ** — the dashboard mounts nine components that each render their
own `fixed inset-0`:

```
24:import { PaymentActionsModal } from '@/components/dashboard/PaymentActionsModal'
37:import { DealsModal } from '@/components/dashboard/DealsModal'
42:import UserMenu from '@/components/dashboard/UserMenu'
44:import { DeviceSetupGate } from '@/components/native/OperatorDeviceConfig'
45:import { AppLockGate } from '@/components/native/AppLockGate'
66:import { DemoWelcome } from '@/components/dashboard/DemoWelcome'
70:import { DemoGetStarted } from '@/components/DemoGetStarted'
72:import { BuzzerGrid } from '@/components/dashboard/BuzzerGrid'
```

So the dashboard SURFACE carries **27** overlays, of which **17** are wired — not 13 of 13. The
revised totals are in A3.

## A2. The inventory — by surface

Legend for the risk column: **D** destructive · **I** irreversible · **R** reversible · **£** moves
money. Legend for arms: **X** = an ✕ or Close glyph · **C** = a named non-committing button ·
**B** = backdrop tap · **E** = Escape key · **←** = wired to Android back.

### Operator — DASHBOARD (`app/dashboard/[token]/page.tsx`), 13 in-page

| # | file:line | What it does | Risk | Arms | Affirmative label | Undo | ← |
|---|---|---|---|---|---|---|---|
| 1 | `page.tsx:4351` | Offline-pause reconnect notice | R | C ("OK") ←| OK | n/a | ✅ |
| 2 | `page.tsx:4364` | **End event** confirm | **D I** | C ("Cancel") ← | **"Yes"** | none | ✅ |
| 3 | `page.tsx:4383` | Pause ordering (+mins / indefinitely) | R | C ("Cancel") ← | "Pause 15m" etc. | resume in menu | ✅ |
| 4 | `page.tsx:4400` | Screen-off warning | R | C ("Keep screen on") ← | "Allow screen off" | n/a | ✅ |
| 5 | `page.tsx:4419` | KDS van picker | R | C ("Cancel") B ← | (picks a van) | n/a | ✅ |
| 6 | `page.tsx:4436` | Edit operator profile | R | C ("Cancel") B ← | "Save" | none | ✅ |
| 7 | `page.tsx:4488` | **Cancel order** (+ refund) | **D I £** | C ("Keep order") ← | **"Cancel order"** | none | ✅ 🔴 **see E2** |
| 8 | `page.tsx:4574` | **Reject order** | **D I** | C ("Keep order") ← | "Reject order" | none | ✅ 🔴 **see E2** |
| 9 | `page.tsx:4604` | Edit order (items, deals, slot) | R **£** | X B ← | "Save changes" | none | ✅ |
| 10 | `page.tsx:4817` | Edit-order item modifier picker | R | X ← | "Add" | n/a | ✅ |
| 11 | `page.tsx:4861` | Demo event lock | R | X C B ← | "Got it" | n/a | ✅ |
| 12 | `page.tsx:4883` | Event menu (contains Finish + **Cancel event**) | R (menu) | X B ← | n/a — a menu | n/a | ✅ |
| 13 | `page.tsx:4947` | QR fullscreen | R | B ("Tap anywhere to close") ← | n/a | n/a | ✅ |

### Operator — DASHBOARD, 14 more from mounted components

| # | file:line | What it does | Risk | Arms | Affirmative label | Undo | ← |
|---|---|---|---|---|---|---|---|
| 14 | `PaymentActionsModal.tsx:152` (branch 1) | **Remove a recorded payment** | **D £** | C ("Cancel") B | "Remove payment" | none | 🔴 **no** |
| 15 | `PaymentActionsModal.tsx:152` (branch 2) | **Refund to card** | **D I £** | B only + form | "Refund £x" | none | 🔴 **no** |
| 16 | `PaymentActionsModal.tsx:152` (branch 3) | "Paid by card" explainer | R | C ("Got it") B | n/a | n/a | no |
| 17 | `PaymentActionsModal.tsx:152` (branch 0) | Offline explainer | R | C ("Got it") B | n/a | n/a | no |
| 18 | `DealsModal.tsx:237` | Add a deal to an order | R | X B | (picks a bundle) | n/a | 🔴 **no** |
| 19 | `UserMenu.tsx:108` | Menu scrim (invisible) | R | B only | n/a | n/a | no |
| 20 | `UserMenu.tsx:297` | This-device settings sheet | R | X B | "Save" | n/a | 🔴 **no** |
| 21 | `BuzzerGrid.tsx:182` (normal) | Choose a buzzer | R | X B | (picks a number) | n/a | 🔴 **no** |
| 22 | `BuzzerGrid.tsx:182` (**blocking**) | Buzzer required for this order | R | **none** — "No buzzer" is the only exit | (picks / "No buzzer") | n/a | no — **correctly**, see E3 |
| 23 | `BuzzerGrid.tsx:151` | Take a buzzer off another order | R | C ("Cancel") | "Take buzzer N" | n/a | 🔴 **no** |
| 24 | `OperatorDeviceConfig.tsx:75` | Device setup gate | R | C ("Later") | "Continue" | n/a | no |
| 25 | `AppLockGate.tsx:66` | **App lock** | R | **none — by design** | "Unlock" | n/a | no — **correctly** |
| 26 | `DemoWelcome.tsx:88` | Demo welcome | R | C ("Start exploring") B | n/a | n/a | 🔴 **no** |
| 27 | `DemoGetStarted.tsx:703` | Demo sign-up flow | R | X B (guarded) | "Create account" | n/a | no |

### Operator — ADD ORDER panel (`components/dashboard/AddOrderPanel.tsx`), 4

| # | file:line | What it does | Risk | Arms | Affirmative label | Undo | ← |
|---|---|---|---|---|---|---|---|
| 28 | `AddOrderPanel.tsx:2165` | Confirm-order sheet (mobile) | R **£** | X B ← | "Place order" | none | ✅ |
| 29 | `AddOrderPanel.tsx:2254` | **Over-capacity / too-soon confirm** | R | C ("Pick another time") ← | **"Place it anyway"** | none | ✅ 🔴 **see E2** |
| 30 | `AddOrderPanel.tsx:2322` | Item modifier picker | R | X B ← | "Add" | n/a | ✅ |
| 31 | `AddOrderPanel.tsx:2431` | Event picker | R | X C ("Done") B ← | (picks an event) | n/a | ✅ |

### KDS (`app/dashboard/[token]/kds/page.tsx`), 5 in-page + 4 mounted

| # | file:line | What it does | Risk | Arms | Affirmative label | Undo | ← |
|---|---|---|---|---|---|---|---|
| 32 | `kds/page.tsx:1561` | Screen-off warning | R | C ("Keep screen on") ← | "Allow screen off" | n/a | ✅ |
| 33 | `kds/page.tsx:1583` | Event menu (Finish + **Cancel event**) | R (menu) | X B ← | n/a — a menu | n/a | ✅ |
| 34 | `kds/page.tsx:1607` | **End event** confirm | **D I** | C ("Cancel") ← | **"Yes"** | none | ✅ |
| 35 | `kds/page.tsx:1636` | Demo KDS intro | R | C B ← | "Got it" | n/a | ✅ |
| 36 | `kds/page.tsx:1662` | This-device settings sheet | R | X B ← | "Save" | n/a | ✅ |
| 37 | `BuzzerGrid.tsx:182` + `:151` | as rows 21–23 | R | as above | as above | n/a | 🔴 **no** |
| 38 | `AppLockGate.tsx:66` | App lock | R | none — by design | "Unlock" | n/a | no |
| 39 | `DemoGetStarted.tsx:703` | Demo sign-up | R | X B | "Create account" | n/a | no |

### MANAGE (`app/manage/[token]/page.tsx`), 31 in-page + 7 mounted — **none wired**

| # | line | What it does | Risk | Arms | Affirmative label |
|---|---|---|---|---|---|
| 40 | 739 | Trial reminder | R | X C ("Maybe later") | "See plans" |
| 41 | 799 | Edit profile | R | C ("Cancel") B | "Save" |
| 42 | 1758 | Allergen chooser / stepper shell | R | X C ("Close" / "Skip for now") | "Next →" / "Done" |
| 43 | 4159 | New category | R | C ("Cancel") — **backdrop is `onClick={() => {}}`** | "Save" |
| 44 | 4332 | Allergen extraction review | R | C ("Back") | "Save allergens" |
| 45 | 4404 | Paste allergen text | R | X C | "Process" |
| 46 | 4458 | **Delete menu item** | **D I** | C B | "Remove" |
| 47 | 4489 | Sub-category manager (**contains a one-tap 🗑**) | **D I** | C ("Done") B | n/a |
| 48 | 4546 | Edit menu item | R | X B (**only when `editingItem.id`**) | "Save" |
| 49 | 4835 | Setup intro | R | C | "Upload my menu" |
| 50 | 4870 | Import — offer | R | C ("Cancel" / "I'll do this later") | "Process menu" |
| 51 | 4905 | Import — upload | R | C | "Process menu" |
| 52 | 4966 | Import — processing | R | **none — by design** (a spinner) | n/a |
| 53 | 4977 | Import — review | R | X (→ discard confirm) | "Looks right →" |
| 54 | 5364 | Import — allergens | R | X (→ discard confirm) C ("Skip…") | "Next →" |
| 55 | 5445 | Import — extras / kitchen | R | X (→ discard confirm) | "Next →" |
| 56 | 5571 | Import — schedule | R | X (→ discard confirm) | "Continue →" |
| 57 | 5725 | Import — settings | R | X (→ discard confirm) | "Looks good →" |
| 58 | 5826 | Setup done / walkthrough choice | R | (three named choices) | "Show me now" |
| 59 | 5914 | **Discard import** confirm | **D** | C ("Keep going" / "Keep editing") | "Finish later" / "Discard" |
| 60 | 6326 | Deal editor | R | C ("Cancel") — **no-op backdrop** | "Save deal" |
| 61 | 7966 | Event editor | R **£** | X | "Save event" |
| 62 | 8200 | **Cancel event** | **D I £** | C ("Keep event") | "Cancel event" |
| 63 | 8260 | Import events from a file | R | C | "Import" |
| 64 | 9714 | Print-order picker | R | C ("Done") B | n/a |
| 65 | 10088 | **Remove a van** | **D I** | C | "Remove" |
| 66 | 10128 | Van billing notice | R | C | "Add van" |
| 67 | 10166 | Van upgrade notice | R | C | "Upgrade" |
| 68 | 10202 | Emoji picker | R | C | (picks) |
| 69 | 10718 | Upgrade modal | R **£** | C | "Choose plan" |
| 70 | 11983 | Invite team member | R | C B | "Send invite" |
| 71 | `ExtrasEditor.tsx:356` | Extras matrix | R | X B | n/a |
| 72 | `ExtrasEditor.tsx:469` | New extras group | R | C ("Cancel") | "Save" |
| 73 | `ExtrasEditor.tsx:489` | Edit option (**includes "Remove"**) | **D** | C — **no-op backdrop** | "Save" |
| 74 | `Walkthrough.tsx:98` | Dashboard walkthrough | R | X B **E** | "Next" / "Done" |
| 75 | `DeleteAccountSection.tsx:205` | 🔴 **Delete account** | **D I** | C ("Cancel — keep my account") **E** | "Delete" (typed-confirm gated) |
| 76–77 | `UserMenu.tsx:108`, `:297` | as rows 19–20 | R | as above | as above |

### CUSTOMER

| # | file:line | What it does | Risk | Arms | Affirmative label | Undo |
|---|---|---|---|---|---|---|
| 78 | `trucks/[slug]/order/page.tsx:3102` | Checkout form sheet | R **£** | X B (**blocked while paying**) | "Pay" | n/a |
| 79 | `trucks/[slug]/order/page.tsx:3622` | Item modifier picker | R | X B | "Add to order" | n/a |
| 80 | `trucks/[slug]/order/page.tsx:3752` | Allergen info | R | C ("Got it") | n/a | n/a |
| 81 | `order/[id]/manage/page.tsx:44` | 🔴 **Cancel my order** | **D I £** | **native `confirm()` only** | OS "OK" | none |
| 82 | `landing/DemoUpload.tsx:270` | Demo menu upload | R | X B **E** | "Upload" | n/a |

**Admin** (`app/admin/page.tsx`) is a fifth surface and was swept for completeness: 5 overlays,
including `deleteTarget` at `:1680` whose own copy says **"There is no backup and no undo."**
Out of the brief's scope; listed so the count is honest.

## A3. Counts per surface, and what could not be classified

| Surface | Overlays | Wired to back | Destructive | Moves money |
|---|---|---|---|---|
| **Dashboard** (in-page + mounted) | **27** | **17** | 5 | 5 |
| **Add Order** (part of the dashboard) | 4 | 4 | 0 | 2 |
| **KDS** | **9** | **5** | 1 | 0 |
| **Manage** | **38** | **0** | 8 | 4 |
| **Customer** | **5** | n/a — not reachable in the app (A4) | 1 | 2 |
| **Admin** | 5 | 0 | 1 | 0 |

⚠️ **ONE OVERLAY COULD NOT BE CLASSIFIED, AND IT IS NAMED RATHER THAN GUESSED AT.**
`manage:5826` (the setup-done screen) offers three choices — "Show me now", "Later", "Never" — and
**every one of them calls `resetImportState(); reload()`**. There is no non-committing arm, because
there is no non-committing outcome: the screen exists to record a preference, and closing it *is* a
choice. Whether that counts as "no dismissal arm" (B1) or "three affirmatives" is a judgement I have
not made for you.

## A4. Reachability — which of these an Android back press can even meet

**READ** (`docs/android-back-handler-report.md` A4, re-verified) — the shell's `server.url` is the
operator entry point. **The customer surfaces are browser-only, so rows 78–82 are outside the back
handler's reach entirely** — which does not make row 81 less wrong, only differently wrong.

## A5. Not overlays, but they dismiss things — swept for completeness

**READ** — **17 native `window.confirm()` calls** across the app. They are inventoried in B4 because
that is where they do damage. **Two `alert()` calls on operator paths** (`admin:308` and friends) and
seven on public pages. **No `window.prompt` anywhere** — "not found" is the result.

---

# PART B — THE ARMS

## B1. Overlays with NO explicit dismissal — backdrop only

**READ.** Four, and only one of them is a problem:

| Overlay | Backdrop-only? | Verdict |
|---|---|---|
| `UserMenu.tsx:108` | yes — `<div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />` | ✅ **fine.** It is a dropdown scrim; the menu itself is the visible thing. |
| `page.tsx:4947` QR fullscreen | yes | ✅ **fine, and it says so**: `<p className="text-xs text-slate-300 mt-4">Tap anywhere to close</p>`. The target is the entire screen. |
| `DemoWelcome.tsx:88` | no — has "Start exploring" | ✅ fine |
| 🔴 `PaymentActionsModal.tsx:152` **branch 2, the refund form** | **YES** | 🔴 **the one real B1 offender.** See below. |

🔴 **THE REFUND FORM HAS NO CANCEL BUTTON.** **READ** — every other branch of that modal ends in a
named button (`Done`, `Got it`, `Cancel`), but the refund branch (`:258`) renders only the form and
its submit. The sole way out without refunding is the backdrop:

```tsx
  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
```

**INFERRED** — on a counter, at a hatch, with a customer waiting, the operator who opened a refund
form by mistake has to know that tapping the dark area outside the card is the way out. ⚠️ **The
`!busy` guard is right** — it cannot be dismissed mid-refund. The gap is the missing named arm, not
the backdrop.

## B2. Backdrop tap on a DESTRUCTIVE confirm — and which arm it maps to

**READ.** Three, and **all three map the backdrop to the SAFE arm**:

| Overlay | Backdrop maps to | Outcome of a stray touch |
|---|---|---|
| `manage:4458` delete menu item | `setDeletingItem(null)` | ✅ **nothing is deleted** |
| `PaymentActionsModal` branch 1 (remove payment) | `onClose()` | ✅ **the payment stands** |
| `manage:4546` edit item | `setEditingItem(null)` **only if `editingItem.id`** | ✅ edits are dropped; a NEW item cannot be lost this way |

```tsx
4458: <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setDeletingItem(null)}>
4546: <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { if (editingItem.id) setEditingItem(null) }}>
```

✅ **THERE IS NO OVERLAY IN THIS APP WHERE A BACKDROP TAP COMMITS ANYTHING.** That was the hazard the
question was looking for, and it is **not found**. State it plainly: this one is already right.

✅ And the strongest cases go further — three form sheets **disable** the backdrop outright rather than
letting a stray touch discard typed work:

```tsx
4159: <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>   // new category
6326: <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>   // deal editor
ExtrasEditor:489                                                     onClick={() => {}}>   // edit option
```

## B3. Button order — where the destructive action sits

**READ.** The house pattern is **safe on the LEFT, destructive on the RIGHT**, and it holds in 11 of
12 styled confirms:

```tsx
4565: <button …>Keep order</button>                       4566: <button …bg-red-600…>Cancel order</button>
4595: <button …>Keep order</button>                       4596: <button …bg-red-600…>Reject order</button>
8241: <button …>Keep event</button>                       8247: <button …bg-red-600…>Cancel event</button>
4470: <button …>Cancel</button>                           4474: <button …>Remove</button>            (delete item)
10110:<button …>Cancel</button>                           10116:<button …>Remove</button>            (delete van)
5921: <Btn label="Keep going" …/>                         5922: <Btn label="Finish later" …/>        (discard import)
5930: <Btn label="Keep editing" …/>                       5931: <Btn label="Discard" colour="red" …/>
222:  <button …>Cancel</button>                           224:  <button …bg-red-600…>Remove payment</button>
162:  <button …>Cancel</button>                           169:  <button …bg-orange-600…>Take buzzer N</button>
4410: <button …>Keep screen on</button>                   4411: <button …>Allow screen off</button>
2300: <button …>Pick another time</button>                2305: <button …bg-orange-600…>Place it anyway</button>
```

🔴 **THE ONE INVERSION IS THE END-EVENT CONFIRM, AND IT IS DUPLICATED ON BOTH OPERATOR SURFACES.**
**READ** — `page.tsx:4373-4374` and `kds/page.tsx:1616-1617`, character for character the same:

```tsx
<button onClick={()=>doFinishEvent(finishConfirm.eventId)} className="flex-1 bg-red-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-red-700">Yes</button>
<button onClick={()=>setFinishConfirm(null)} className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">Cancel</button>
```

**The red, destructive "Yes" is FIRST — leftmost — where every other confirm in the app puts the safe
arm.** ⚠️ **INFERRED, and it matters here specifically:** this is the confirm most likely to be tapped
in a hurry at the end of service, on a tablet held one-handed, and it is the only one whose muscle
memory is inverted relative to the other eleven.

## B4. "Cancel" meaning two things at once — the collision

🔴 **THE APP SOLVED THIS PROPERLY IN ITS STYLED MODALS AND THEN RE-INTRODUCED IT IN ITS NATIVE ONES.**

✅ **READ — the styled modals avoid the collision by name.** Not one of them labels the escape hatch
"Cancel" when the subject is a cancellation:

- cancel an order → **"Keep order"** vs "Cancel order" (`:4565`/`:4566`)
- reject an order → **"Keep order"** vs "Reject order" (`:4595`/`:4596`)
- cancel an event → **"Keep event"** vs "Cancel event" (`manage:8241`/`:8247`)

🔴 **READ — and then the SAME operation, from the dashboard and the KDS, is gated by a native
`window.confirm` whose two buttons are OS-labelled "OK" and "Cancel":**

```ts
app/dashboard/[token]/page.tsx:2256   if(!window.confirm('Cancel this event? This cannot be undone.')) return
app/dashboard/[token]/kds/page.tsx:898  if (!window.confirm('Cancel this event? This cannot be undone.')) return
```

**On that dialog, "Cancel" means "do NOT cancel the event".** It is the exact ambiguity the styled
modals were written to avoid, on the highest-consequence operator action there is, reachable from the
event menu on both operator screens mid-service.

⚠️ **AND THE TWO PATHS ARE NOT EQUIVALENT IN WHAT THEY TELL THE OPERATOR.** **READ** — both POST the
identical request:

```ts
// dashboard:2258        body: JSON.stringify({token,action:'cancel',eventId,payload:{}})
// manage:7042-7047      body: JSON.stringify({ token, action: 'cancel', eventId,
//                         payload: { cancellationReason: eventCancelReason, cancellationNote: eventCancelNote } })
```

but manage's modal first says **how many customers this will hit** and lets the operator write to
them:

```tsx
8212: {affectedOrderCount > 0 && (
8214:   <p className="text-sm font-medium text-red-600 mt-2">
8215:     {affectedOrderCount} order{affectedOrderCount !== 1 ? 's' : ''} will be cancelled and customers notified.
```

The dashboard and KDS say **"This cannot be undone."** and nothing else. Same endpoint, same
irreversible outcome, one sentence of context instead of a count and a message box.

🔴 **AND THIS OPERATION STRANDS MONEY.** **READ** — `app/api/events/action/route.ts` has **no payment
import of any kind** (`grep "import.*payments\|stripe"` returns nothing); the cancel branch updates
orders to `'cancelled'` and sends emails:

```ts
215:    const { data: affectedOrders } = await supabase.from('orders').select('*')
217:      .eq('event_id', eventId).in('status', ['confirmed', 'pending'])
…
225:        .update({ status: 'cancelled', cancellation_reason: `Event cancelled${fullNote ? ': ' + fullNote : ''}` })
```

That is the live-money defect already recorded in `docs/event-cancel-holds-report.md`. **The finding
here is narrower and new: the gate on it, from the two screens an operator actually uses during
service, is an OS dialog whose safe button is labelled "Cancel".**

**Other native confirms on operator paths, all READ** — `manage:3700` (delete category + its items),
`manage:5987` (upsell rule), `manage:6121` (extras group), `manage:6258` (deal), `manage:11722` (team
member), `manage:4950` (discard import), `kds:941` (switch event), `admin:1014` (take a truck
offline), and four in `AddOrderPanel` (`:1196`, `:1207`, `:1226`, `:1241`). ⚠️ **The AddOrderPanel four
know about the collision and work around it in prose** — which is evidence the team has already felt
this:

```ts
1207: const proceed = window.confirm(`${detail}\n\nProceed anyway (oversell)?\n\nOK = proceed anyway   ·   Cancel = edit the order`)
```

Spelling out what OK and Cancel mean, inside the message, is a workaround for a dialog that cannot
label its own buttons.

---

# PART C — UNDO

## C1. Every Undo in the app

**READ** — there is exactly **one** Undo mechanism: a toast action, rendered by `ToastStack` and
produced by `lib/useToasts.ts` + `lib/useReadyEmailUndo.ts`. Five call sites:

| Undo | Where | Reverses | Window | If missed |
|---|---|---|---|---|
| `↩ Undo` after **Ready** | dashboard `:1945`-ish, KDS `:768` | `undo_ready` — status `ready` → `confirmed`, **and cancels the not-yet-sent customer email** | **4000 ms** | the email sends; status must be walked back by hand |
| `↩ Undo` after **Collected / Done** | dashboard `:1945` | `undo_collected` — status back one stage **+ the payment row** | **7000 ms** | re-do by hand via the PAID chip |
| `↩ Undo` after **Mark paid** | dashboard `:1939` | `undo_mark_paid` — deletes/compensates the ledger row | **7000 ms** | via the PAID chip → PaymentActionsModal |
| `↩ Undo` offline (dashboard) | `:1898` | drops the queued outbox op, or falls back to the online undo | **7000 ms** | the op syncs |
| `↩ Undo` offline (KDS) | `:732` | same | **7000 ms** | the op syncs |

**READ** — the 4-second window is a real timer, not a UI nicety:

```ts
useReadyEmailUndo.ts:33   const t = setTimeout(() => { pendingReadyEmails.current.delete(orderKey); sendReadyEmail(orderKey) }, 4000)
```

⚠️ **AND IT SURVIVES A TAB CLOSE IN THE WRONG DIRECTION — deliberately.** **READ** — on unmount or
`beforeunload`, every still-pending email is **sent immediately** via `sendBeacon` (`:48-58`). So
navigating away during the 4 seconds *commits* the email rather than cancelling it. **INFERRED:** on
Android, a back press that unmounts the dashboard mid-window would do the same. That is the documented
intent ("the server's `status==='ready'` guard is the backstop"), but it is worth knowing that the
undo window is **not** paused by leaving.

## C2. 🔴 Destructive actions with NO undo and NO confirm — one tap and gone

**READ.** Exactly **one**, and it is smaller than it first looks:

```tsx
manage:4517  <button type="button" onClick={() => deleteSubcategory(sc)} className="…" title="Delete sub-category">🗑</button>
```

```ts
1942:  const deleteSubcategory = async (sc: Subcategory) => {
1944:      const res = await api('delete_subcategory', { id: sc.id })
1945:      if (res?.ok === false && res.error === 'not_empty') {
1946:        showToast(`Move or remove its ${res.count} item${res.count === 1 ? '' : 's'} first`, 'error'); return
```

✅ **The server refuses to delete a non-empty sub-category**, so the worst case is the loss of an empty
container and its name — recoverable by retyping. **Report it as what it is: the only one-tap
irreversible control in the app, and the least costly one.** Everything else destructive has either a
styled confirm (B3's table) or a native one (B4's list).

## C3. Both a confirm AND an undo

**READ.** **None.** No action in this app carries both gates. The split is clean:

- **Undo, no confirm** — Ready, Collected/Done, Mark paid. ✅ **Correct for a service surface**: these
  are the high-frequency taps, and a confirm on each would be a tap tax at the hatch.
- **Confirm, no undo** — cancel, reject, delete, finish, discard. ✅ Correct: they are irreversible.

✅ **There is no "one gate too many" to report.** The design already made this call, and made it the
right way round.

## C4. ⚠️ Does any Undo touch money — and what does it actually reverse?

🔴 **YES — two of the five — AND THE ANSWER TO "WHAT DOES IT REVERSE" IS: A DATABASE ROW, NEVER
STRIPE.**

**READ** — `undo_collected` and `undo_mark_paid` both call `reverseCollectionPayment`, whose lookup
**excludes online payments outright**:

```ts
lib/payments/ledger.ts:733-736
    .eq('order_key', opts.orderKey)
    .eq('kind', 'charge')
    .neq('channel', 'online')
```

and whose two outcomes are both database writes:

```ts
754:  const noRealMoneyMoved = row.external_ref == null && row.state === 'succeeded' && row.channel !== 'online'
756:  if (noRealMoneyMoved) {
759:    if (opts.beforeDelete) await opts.beforeDelete(row)
760:    const { error: delErr } = await supabase.from('order_payments').delete().eq('id', row.id)
…
767:  // Real money moved — compensate, never delete.
768:  const { balance } = await recordPaymentEvent(supabase, { … kind: 'refund', … })
```

✅ **THIS IS NOT THE HAZARD THE QUESTION FEARED, AND THE REASON IS STRUCTURAL.** These undos only ever
reverse an **in-person** payment record — cash or card-machine — where the money was never moved by
this app in the first place. There is no Stripe call to leave stranded, because there was no Stripe
call. A card payment taken online cannot reach this path at all (`.neq('channel','online')`), and the
UI says so in words: *"was paid by card, so there is no payment record to remove here — the money is
already on the customer's card"* (`PaymentActionsModal:241-242`).

✅ **And it is audited before it is destroyed.** **READ** — `undo_collected` fails **closed**:

```ts
route.ts:592-594   // the audit row is written FIRST, via logActionOrThrow, and passed as `beforeDelete` — if that insert fails
                   // the delete never runs, the ledger row survives, and the undo is refused with a 500. Losing an
                   // undo is recoverable; losing the evidence of one is not.
```

⚠️ **The one thing to hold in mind:** an operator who has taken £8 in cash, tapped Mark paid, then
tapped Undo, has removed the *record* of £8 that is physically in the till. That is the intended
behaviour (it is how a mis-tap is corrected) and it is fully logged — but the money and the record
part company for as long as it takes to re-record it. ✅ Reconciliation exists for exactly this
(`readLedger` / the reconciliation query named in `ledger.ts`).

---

# PART D — CONSISTENCY

## D1. By kind

| Kind | n | Labels | Button order | Dismissal arms |
|---|---|---|---|---|
| **Destructive confirm** (styled) | 11 | ✅ consistent — safe arm always named for what it preserves | 🔴 **11 of 12 consistent; end-event inverted** | ⚠️ mixed: 5 offer a backdrop, 6 do not |
| **Destructive confirm** (native) | 17 | 🔴 **inconsistent by construction** — OS "OK"/"Cancel" | fixed by the OS | fixed by the OS |
| **Form sheet** | ~20 | ✅ consistent — "Cancel" / "Save" | ✅ consistent | ⚠️ mixed: X, backdrop, no-op backdrop, all three |
| **Informational** | ~12 | ⚠️ **"OK" · "Got it" · "Done" · "Later" · "Keep going"** for the same job | n/a — single button | ⚠️ mixed |
| **Picker** | ~9 | ✅ mostly "Done" or implicit-on-select | n/a | ✅ backdrop + X, consistently |
| **Wizard step** | 8 | ✅ consistent — "← Back" / "Next →" | ✅ consistent | ✅ all route to one discard confirm |

## D2. Inconsistencies within a group, both examples quoted

**1. 🔴 The same operation, two entirely different confirmations.** (Destructive confirm group.)

```tsx
// manage:8203-8247 — names the venue and date, counts the affected orders, takes a reason and a
// message to customers, and labels the safe arm for what it preserves.
<h3 className="text-lg font-semibold text-slate-900">Cancel this event?</h3>
  {affectedOrderCount} order{affectedOrderCount !== 1 ? 's' : ''} will be cancelled and customers notified.
<button …>Keep event</button>  <button …bg-red-600…>Cancel event</button>
```

```ts
// dashboard:2256 and kds:898 — the same endpoint, the same irreversible outcome.
if(!window.confirm('Cancel this event? This cannot be undone.')) return
```

**2. 🔴 Destructive-arm position, within the styled-confirm group.**

```tsx
// page.tsx:4565-4566 — safe LEFT
<button …>Keep order</button>            <button …bg-red-600…>Cancel order</button>
// page.tsx:4373-4374 — destructive LEFT
<button …bg-red-600…>Yes</button>        <button …bg-slate-100…>Cancel</button>
```

**3. ⚠️ The acknowledgement word, within the informational group.**

```tsx
page.tsx:4356                 <button onClick={ackOfflinePausedNotice} …>OK</button>
PaymentActionsModal.tsx:203   <button onClick={onClose} …>Got it</button>
PaymentActionsModal.tsx:172   <button onClick={onClose} …>Done</button>
OperatorDeviceConfig.tsx:86   <button … onClick={() => setDismissed(true)} …>Later</button>
```

Four words, one job. ⚠️ **This is cosmetic and I am not going to inflate it.**

**4. ⚠️ Escape exists in 3 overlays out of ~82.** **READ** — only `DemoUpload.tsx:160`,
`DeleteAccountSection.tsx:110` and `Walkthrough.tsx:83` bind it:

```ts
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
```

**INFERRED:** the operator surfaces are touch-first, so Escape earns little there. The three that have
it are the three written most recently and most carefully — which is the D3 finding in miniature.

**5. ✅ A consistency that is worth naming because it is easy to lose.** The KDS's five overlays are
byte-identical in structure to the dashboard's equivalents (screen-off warning, event menu, end-event
confirm). Two near-duplicate surfaces, and their shared overlays have **not** drifted.

## D3. 🔴 Is there a shared modal component?

**NO. Every overlay in this app is hand-rolled.** **READ** — `components/ui/` contains exactly one
file, `Tooltip.tsx`. The only two files named for a modal are `DealsModal.tsx` and
`PaymentActionsModal.tsx`, and both are specific dialogs, not primitives. There is no `Modal`, no
`Dialog`, no `Sheet`, no `ConfirmDialog`, no `useConfirm`.

The nearest thing to a shared primitive is `components/manage/primitives.tsx`'s `Btn`, which is used
for the *buttons inside* manage's overlays but knows nothing about the overlay itself; and
`PaymentActionsModal`'s local `shell()`, which is a shared skeleton **within one file, across four
branches**:

```tsx
  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
```

🔴 **THIS IS THE REAL FINDING OF PART D, AND IT EXPLAINS EVERY OTHER ROW IN IT.** Eighty-two overlays,
each with its own copy of the backdrop, the z-index, the card, the button row and the dismissal
logic. Nothing enforces that a destructive confirm puts the safe arm on the left, because nothing
knows what a destructive confirm *is*. The end-event inversion is not a mistake someone made against
a standard — **there is no standard to have made it against.** ⚠️ The same absence is why the back
handler had to be a hand-maintained list of 22 entries per surface rather than something a shared
modal could have registered for itself.

---

# PART E — THE BACK HANDLER'S CHOICES

## E1. Is every registered closer the non-committing arm?

✅ **YES — 22 of 22. Not one registered closer commits anything.** **READ**, checked against each
overlay's own buttons:

| Registration | Closer | The UI's non-committing arm | Commits? |
|---|---|---|---|
| `editItemModal` | `setEditItemModal(null)` | `closeEditItemModal` (the ×) | ✅ no |
| `finishConfirm` (both surfaces) | `setFinishConfirm(null)` | "Cancel" | ✅ no |
| `showDemoEventLock` | `setShowDemoEventLock(false)` | × / "Got it" | ✅ no |
| `editingOrder` | `setEditingOrder(null)` | × / backdrop | ✅ no |
| `showCancelModal` | `setShowCancelModal(false)` | "Keep order" | ✅ no — **but see E2** |
| `showRejectModal` | `setShowRejectModal(false)` | "Keep order" | ✅ no — **but see E2** |
| `showQRFullscreen` | `setShowQRFullscreen(false)` | backdrop | ✅ no |
| `showProfileModal` | `setShowProfileModal(false)` | "Cancel" | ✅ no |
| `showKDSPicker` | `setShowKDSPicker(false)` | "Cancel" | ✅ no |
| `showEventMenu` (both) | `setShowEventMenu(false)` | × / backdrop | ✅ no |
| `showPauseModal` | `setShowPauseModal(false)` | "Cancel" | ✅ no |
| `showScreenOffWarning` (both) | `setShowScreenOffWarning(false)` | "Keep screen on" | ✅ no |
| `showOfflinePausedNotice` | `setShowOfflinePausedNotice(false)` | "OK" | ✅ no — **but see E2** |
| `showKdsIntro` | `dismissKdsIntro()` | the same function | ✅ no — **identical** |
| `deviceOpen` | `setDeviceOpen(false)` | × / backdrop | ✅ no |
| `capacityConfirm` | `setCapacityConfirm(null)` | "Pick another time" | ✅ no — **but see E2** |
| `itemModal` | `setItemModal(null)` | ✕ / backdrop | ✅ no |
| `showEventPicker` | `setShowEventPicker(false)` | ✕ / "Done" | ✅ no |
| `showOrderSheet` | `setShowOrderSheet(false)` | ✕ / backdrop | ✅ no |

The rule held. **No back press in this app can cancel an order, refund a card, end an event, delete
anything or place an order.**

## E2. Where back does something no button does — `editItemModal` was NOT the only one

🔴 **FIVE, and they are not equally serious. One is a defect.**

### 🔴 E2-1. `showCancelModal` — THE ONE THAT MATTERS. Back leaves a loaded gun for the next order.

**READ** — the registered closer sets one boolean:

```tsx
page.tsx:2356    [showCancelModal && !!cancellingOrder, () => setShowCancelModal(false)],
```

**READ** — but **both** of the modal's real exits reset *five* pieces of state, and they are the only
two places in the file that do:

```tsx
// the "Keep order" arm, page.tsx:4565
onClick={()=>{setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('');setCancelRefund(true);setCancelError(null)}}
// the successful-cancel path, page.tsx:2219-2220
setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('')
setCancelRefund(true);setCancelError(null)
```

**READ** — and opening the modal initialises **nothing**:

```tsx
page.tsx:1865   if(action==='cancel'){const ord=orders.find(o=>o.order_key===orderKey)??null;setCancellingOrder(ord);setShowCancelModal(true);return}
```

**READ** — `cancelRefund` is declared once, and is the checkbox that decides whether the customer gets
their money back:

```tsx
543:  const[cancelRefund,setCancelRefund]=useState(true)
4512: <input type="checkbox" checked={cancelRefund} onChange={e=>{setCancelRefund(e.target.checked);setCancelError(null)}} className="mt-0.5"/>
2228: …refund_declined:refundableMinor>0&&!cancelRefund…
```

🔴 **THE FAILURE, STATED CONCRETELY.** The operator opens Cancel on order #12, unticks *"Refund £8.50
to their card"* (the documented no-show case), types a note — then presses back instead of "Keep
order". Nothing resets. They later open Cancel on order #19: the modal reopens **with #12's reason and
note pre-filled and the refund box still unticked.** The note is customer-facing
(`cancellation_reason` rides to the cancellation email); the unticked box sends
`refund_declined: true`.

⚠️ **Reported at its true strength: the operator can SEE all of it.** The reason, the note and the
checkbox are all rendered. This is a pre-filled destructive default, not a silent one. But it is a
default they did not choose, on a screen used in a hurry, and **before the back handler existed this
state was unreachable** — the modal has no ×, no backdrop dismiss and no Escape, so "Keep order" and
"Cancel order" were the only two ways out, and both reset. 🔴 **The back handler created this path.**

### 🔴 E2-2. `showRejectModal` — the same shape, one notch down.

**READ** — closer `() => setShowRejectModal(false)` (`:2357`); the only resets are the "Keep order" arm
(`:4595`) and the success path (`:2244`). `rejectReason` and `rejectNote` carry to the next order. No
money — but the reject reason is **required and shown to the customer**, so order #19's customer can
be told order #12's reason.

### ⚠️ E2-3. `capacityConfirm` — back leaves the refused slot selected.

**READ** — the safe arm clears the slot; the closer does not:

```tsx
AddOrderPanel.tsx:2300   onClick={() => { setManualSlot(''); setCapacityConfirm(null) }}   // "Pick another time"
AddOrderPanel.tsx:434    [!!capacityConfirm, () => setCapacityConfirm(null)],              // back
```

**INFERRED** — the operator is returned to the form with the *too-soon or over-capacity* slot still
chosen and no modal explaining it. Non-committing (nothing is placed), but a third outcome the UI
offers no button for.

### ⚠️ E2-4. `showOfflinePausedNotice` — back dismisses without acknowledging.

**READ** — the button does more than hide:

```tsx
511:  // OK → record the acknowledged marker for THIS event so a poll tick / reload won't re-pop it; a
513:  const ackOfflinePausedNotice=()=>{
514:    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
515:      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
516:    setShowOfflinePausedNotice(false)
```

Back skips the `localStorage` write, so **the notice re-pops on the next poll tick or reload.**
✅ Harmless — it is informational — and arguably the safer failure, since the notice keeps insisting
until it is genuinely acknowledged.

### ✅ E2-5. `editItemModal` — the one that was flagged, and it turns out to be benign.

**READ** — the × does more:

```tsx
2035:  const closeEditItemModal=()=>{setEditItemModal(null);setEditModalMods([]);setEditModalNotes('')}
2352:    [!!editItemModal, () => setEditItemModal(null)],
```

✅ **But the leftover state cannot be observed, because opening re-initialises both:**

```tsx
2032:    if(modGroups.length>0||allowNotes){setEditItemModal({item,modGroups,allowNotes});setEditModalMods([]);setEditModalNotes('')}
```

**The flag was right to raise and the answer is: no consequence.** Note the contrast — this is exactly
what `showCancelModal` fails to do, and the difference between E2-5 and E2-1 is that one line.

## E3. The 38 unwired manage overlays — which are destructive, and how hard is wiring them?

**READ** — manage carries **8 destructive overlays**: delete menu item (`4458`), the one-tap
sub-category 🗑 (`4517`), discard import (`5914`), **cancel event** (`8200`), remove van (`10088`),
the "Remove" option in the extras editor (`ExtrasEditor:489`), plus the native confirms for delete
category, extras group, deal, upsell rule and team member.

**Wiring difficulty, honestly split:**

✅ **Straightforward — 30 of 38.** Every form sheet, picker and informational modal has a single
unambiguous non-committing arm, and manage already keeps its overlay state in plain booleans/objects
exactly like the dashboard's. The pattern transfers with no new thinking.

⚠️ **Needs a decision — 8.**

1. 🔴 **`showEventCancelModal` inherits E2-1 exactly.** **READ** — its safe arm resets three things
   (`8241`: `setShowEventCancelModal(false); setEventCancelReason(''); setEventCancelNote('')`), and
   `confirmCancelEvent` at `7037` sets only the boolean before firing. **Wiring back to
   `setShowEventCancelModal(false)` alone would reproduce the dashboard's defect on the
   money-stranding operation.** The closer must be the full reset, or the reset must move into the
   opener.
2. **The eight import-wizard steps** (`4870`–`5826`) are a *flow*, not a stack. Their × does not close
   them — it opens `showDiscardConfirm`. **INFERRED:** back should almost certainly do the same
   (`setShowDiscardConfirm(true)`), which means back *opens* an overlay rather than closing one. That
   is compatible with "dismiss, never commit", but it is a design call, not a mechanical one.
3. **`importStep === 'processing'`** (`4966`) has no arms at all because it is a spinner. Back over it
   must do nothing — which the registry already gives for free by not listing it.

**And two on the operator side that are NOT manage but are equally unwired and worth naming:**

- 🔴 **`PaymentActionsModal`** renders onto the dashboard from inside `OrderCard`, so the dashboard's
  13-entry list never saw it. Its branch-1 ("Remove payment") and branch-2 (the refund form) are the
  two most consequential overlays on the surface, and **back over either does nothing today.** ✅ Inert,
  per the handler's design — but this is the gap most worth closing, and its state lives in
  `OrderCard`'s `confirmRemovePayment`, not the page's.
- ✅ **`BuzzerGrid` in `blocking` mode must stay unwired, and that is a decision, not an oversight.**
  **READ:**

```tsx
BuzzerGrid.tsx:184   onClick={blocking ? undefined : (e) => { if (e.target === e.currentTarget) onClose() }}
BuzzerGrid.tsx:198   {/* No ✕ in blocking mode — "No buzzer" below is the only exit, and it is an active choice. */}
```

  There is no non-committing arm to register. Wiring back to `onClose()` would make the press *make
  the choice* — the precise thing the rule forbids. ✅ **The correct action here is to leave it alone.**

---

# PART F — THE PICTURE

## F1. Every issue found, ranked by consequence

| # | Overlay | Problem | Risk if unaddressed | One-line fix, or a decision? |
|---|---|---|---|---|
| **1** | 🔴 dashboard **Cancel order** (`page.tsx:4488`) | Back-dismiss resets nothing; reason, note and the **refund checkbox** carry to the next order (E2-1) | **A refund declined that nobody declined**, and one customer sent another's cancellation reason | **One line** — the closer must be the "Keep order" arm |
| **2** | 🔴 **Cancel event** from dashboard + KDS (`:2256`, `kds:898`) | Gated by `window.confirm` whose safe button is labelled **"Cancel"**; no order count, no customer message | Wrong-way tap ends an event, cancels every live order and **strands the card holds** (`event-cancel-holds-report.md`) | **Decision** — reuse manage's modal, or accept the OS dialog |
| **3** | 🔴 manage **Cancel event** (`8200`) if wired as-is | Would inherit F1-1 on the money-stranding operation (E3-1) | Same as row 1, on a bigger blast radius | **One line, but only if taken deliberately** |
| **4** | 🔴 dashboard **Reject order** (`:4574`) | Same carry-over as row 1, minus the money (E2-2) | Customer told the previous order's rejection reason | **One line** |
| **5** | 🔴 **PaymentActionsModal** branch 2 (refund form) | **No named dismissal arm** — backdrop only (B1) | Operator opens a refund by mistake and cannot see the way out | **One line** — add a Cancel |
| **6** | 🔴 **End event** confirm, dashboard **and** KDS (`4373`, `1616`) | Destructive **"Yes"** rendered FIRST; the other 11 confirms put the safe arm first (B3) | Mis-tap ends service early; no undo | **One line each** — swap the two buttons |
| **7** | ⚠️ **PaymentActionsModal**, **DealsModal**, **BuzzerGrid**, **UserMenu** sheet | Render onto the dashboard from child components; the back list never saw them (E3) | Back over them is **inert**, not destructive | **Decision** — where the registration lives |
| **8** | ⚠️ `capacityConfirm` (`AddOrderPanel:2254`) | Back leaves the refused slot selected (E2-3) | Operator re-submits into the same refusal | **One line** |
| **9** | ⚠️ manage sub-category 🗑 (`4517`) | One tap, no confirm, no undo (C2) | An empty sub-category and its name are lost | **One line** — and arguably not worth it |
| **10** | ⚠️ `showOfflinePausedNotice` (`4351`) | Back skips the ack write (E2-4) | The notice re-pops | **One line** — or leave it; the failure is safe |
| **11** | ⚠️ 17 native `window.confirm` on operator paths | Unstyled, unlabelled, four of them explain their own buttons in prose (B4) | Cumulative ambiguity | **Decision** — a real project |
| **12** | ⚠️ "OK" / "Got it" / "Done" / "Later" | Four words for one job (D2-3) | None | **Decision** — cosmetic |
| **13** | 🔴 **No shared modal primitive** (D3) | 82 hand-rolled overlays; nothing can enforce any of the above | Every row here recurs on the next overlay written | **Decision** — the largest one available |

## F2. Ranking note

Rows 1–4 involve **money or a customer-facing message on an irreversible action**. Rows 5–6 are
**mis-tap geometry on irreversible actions**. Rows 7–10 are **behavioural gaps with no committing
outcome**. Rows 11–13 are **consistency**. That ordering is by consequence, not by how many instances
each has — row 12 has the most instances and sits second-to-last.

## F3. ⚠️ Genuinely wrong versus merely inconsistent

**GENUINELY WRONG — 6.** Rows 1, 2, 3, 4, 5, 6. Each has a concrete failure with a named victim: a
customer who is not refunded, a customer told the wrong reason, an event ended by a mis-tap, an
operator who cannot find the exit. **Rows 1 and 4 are regressions introduced by the back handler and
did not exist a week ago.**

**NOT WRONG, JUST INCOMPLETE — rows 7–10.** Every one of these is *inert*: back does nothing, or does
slightly less than a button. Per `lib/native/backHandler.ts`'s own design note, inert is a poor
experience and not a defect — *"a modal this registry does not know about is not made worse by a
partial rollout"*.

**MERELY INCONSISTENT — rows 11–13.**

⚠️ **AND THE WARNING IN THE BRIEF IS THE RIGHT ONE.** A consistency sweep across manage's 38 overlays
and the dashboard's 27 would touch two live operator surfaces — one of which serves a truck taking
real money and one of which is handed over — to fix things that, today, cost nobody anything. **Rows
1–6 are six small, local, individually-verifiable edits. Row 13 is a rewrite.** The gap between those
two is the whole argument, and it argues for itself.

⚠️ **One thing this audit found that deserves saying the other way round.** Three of the questions the
brief asked expecting to find rot came back **clean**, and they are the ones that would have mattered
most: **no backdrop tap anywhere commits anything** (B2); **no Undo reverses a UI without reversing
its money** (C4); **no registered back closer commits anything** (E1, 22 of 22). The failures found
are at the edges of good work, not on top of bad work.

## F4

No fixes are proposed and no order is recommended. F1's last column states only whether each item is
mechanical or a judgement, which the brief asked for.

---

# PART G — INTEGRITY

## G1. Byte scan — every file opened

**28 files, byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F,
0x7F). Never grep.**

```
app/manage/[token]/page.tsx                785054 bytes  offending=0  CR=0
app/dashboard/[token]/page.tsx             383613 bytes  offending=0  CR=0
app/trucks/[slug]/order/page.tsx           278515 bytes  offending=0  CR=0
app/api/dashboard/action/route.ts          174041 bytes  offending=0  CR=0
components/dashboard/AddOrderPanel.tsx     170492 bytes  offending=0  CR=0
app/admin/page.tsx                         116750 bytes  offending=0  CR=0
app/dashboard/[token]/kds/page.tsx         102971 bytes  offending=0  CR=0
components/dashboard/OrderCard.tsx          87613 bytes  offending=0  CR=0
components/DemoGetStarted.tsx               83071 bytes  offending=0  CR=0
lib/payments/ledger.ts                      53211 bytes  offending=0  CR=0
components/manage/ExtrasEditor.tsx          37704 bytes  offending=0  CR=0
docs/android-back-handler-report.md         28265 bytes  offending=0  CR=0
components/landing/DemoUpload.tsx           27829 bytes  offending=0  CR=0
components/dashboard/DealsModal.tsx         25872 bytes  offending=0  CR=0
components/dashboard/BuzzerGrid.tsx         21174 bytes  offending=0  CR=0
components/native/OperatorDeviceConfig.tsx  18313 bytes  offending=0  CR=0
components/dashboard/PaymentActionsModal.tsx 18104 bytes offending=0  CR=0
components/manage/DeleteAccountSection.tsx  17934 bytes  offending=0  CR=0
components/dashboard/UserMenu.tsx           16239 bytes  offending=0  CR=0
app/api/events/action/route.ts              13114 bytes  offending=0  CR=0
components/dashboard/DemoWelcome.tsx        12561 bytes  offending=0  CR=0
app/order/[id]/manage/page.tsx              10127 bytes  offending=0  CR=0
components/manage/Walkthrough.tsx            7824 bytes  offending=0  CR=0
lib/native/backHandler.ts                    6560 bytes  offending=0  CR=0
components/native/AppLockGate.tsx            5745 bytes  offending=0  CR=0
lib/useReadyEmailUndo.ts                     3933 bytes  offending=0  CR=0
lib/useToasts.ts                             2400 bytes  offending=0  CR=0
components/ToastStack.tsx                    1271 bytes  offending=0  CR=0
TOTAL OFFENDING BYTES ACROSS ALL 28 FILES: 0
```

✅ **Zero offending bytes, zero CR, in every file opened.** ⚠️ **All 28 were opened READ-ONLY — this
scan is a check on the repository as found, not on anything this task produced.**

## G2. Byte scan of this report

Separate pass, run after writing: **53,914 bytes, offending = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## G3. 🔴 Carrier-aware variation-selector check on this report

Per emoji-presentation base, counting how many occurrences are FOLLOWED by U+FE0F:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 76 | 0 | 76 |
| U+1F534 LARGE RED CIRCLE | 46 | 0 | 46 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | 32 | 32 | **0** |

**Sum of per-base paired = 32 = total U+FE0F count = 32** — every selector has a named
carrier, no orphan, no double-count, **zero bare warning signs**.

⚠️ **The U+2500 row is a MEASURED ZERO, not an omission.** The previous report used box-drawing rules
in its section headings and this one uses `---`, so the base is absent here — but it is checked and
reported rather than dropped from the table, because a base that silently stops being counted is
indistinguishable from one that silently stops being paired.

## G4. `git status` — proof nothing changed

```
M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M docs/reference-manual.md
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/event-cancel-holds-report.md
?? docs/overlay-audit-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

✅ **The only new path is `docs/overlay-audit-report.md`.** Everything else — the seven modified
files and the other untracked paths — is prior turns' work, uncommitted as instructed. ⚠️ **Three of
those modified files are overlay files** (`kds/page.tsx`, `page.tsx`, `AddOrderPanel.tsx`) — they
carry the BACK-HANDLER task's edits from the previous turn, not this audit's. This listing is
character-for-character the one recorded at the end of that turn, plus one line for this report.
