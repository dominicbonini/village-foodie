# Slice H — the setup wizard's chrome and arrival

**Date:** 4 August 2026
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
**Files touched:** one — [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx). No other file was
opened for edit.

No garbled spans in the brief. One premise needed correcting before H2 could be built — see H2.

---

## H0. THE THREE READS

### (a) The step array, verbatim, and what the three stepless screens render instead

Defined inside `MenuTab` at
[app/manage/[token]/page.tsx:2391-2399](app/manage/[token]/page.tsx#L2391-L2399) (line numbers after
this slice's edits):

```ts
type WizKey = 'menu' | 'extras' | 'allergens' | 'kitchen' | 'schedule'
const baseWizardSteps: { key: WizKey; label: string }[] = hasExtras
  ? [{ key: 'menu', label: 'Menu' }, { key: 'extras', label: 'Extras' }, { key: 'allergens', label: 'Allergens' }, { key: 'kitchen', label: 'Kitchen setup' }]
  : [{ key: 'menu', label: 'Menu' }, { key: 'allergens', label: 'Allergens' }, { key: 'kitchen', label: 'Kitchen setup' }]
// Setup mode APPENDS "Schedule" after "Kitchen setup" (item 5). Existing operators (not inSetup) never see it,
// so their stepper is byte-for-byte today's.
const wizardSteps: { key: WizKey; label: string }[] = inSetup
  ? [...baseWizardSteps, { key: 'schedule', label: 'Schedule' }]
  : baseWizardSteps
```

Rendered by `renderWizardStepper(currentKey)`
([:2445](app/manage/[token]/page.tsx#L2445)), which prepends a non-clickable green-✓ "Your details"
pill when `inSetup`, and maps clicks back through `goToStep`.

What the three screens rendered instead, before this slice:

| Screen | Rendered in the stepper's place |
|---|---|
| **offer** | The slice-C `setupIntroLine` — a green bar reading *"Your account's ready — now let's add your menu."* — then the `<h3>` "Use the menu from your demo?". No progress indication. |
| **upload** | The same `setupIntroLine`, then `<h3>` "Import your menu" and the shared `MenuUploadFields` dropzone. No progress indication. |
| **done** | `<p class="text-5xl">✅</p>`, then "Menu imported!", then "Your items have been added to the menu." A tick, not a step indicator. |

### (b) The existing allergen warning — string, location, and firing condition

**It was inline.** As required, it is now extracted to exactly one constant,
`allergensNotSetNotice` ([:2485-2490](app/manage/[token]/page.tsx#L2485-L2490)), and the one existing
render site reads that constant. **Not reworded, not re-typed, not near-copied.** Its previous location
was `app/manage/[token]/page.tsx:4786-4789` (the done screen, inline).

The two lines, verbatim:

> **⚠ Allergens & dietary aren't set yet**
> Review them {`inSetup ? 'before going live' : 'in Settings before going live'`}. Items are flagged
> "allergens not set" until you do.

**The firing condition is unchanged** and still lives at the call site
([:4894](app/manage/[token]/page.tsx#L4894)): `{!allergensComplete && allergensNotSetNotice}`, where

```
mode = pendingDisplayMode
allergensComplete = mode === 'card'     ? true
                  : mode === 'per_dish' ? every committed dish has _allergensChecked === true
                  :                       false      // unknown/skipped → fail loud, show it
```

So: card mode never warns; per-dish warns unless every committed dish was confirmed; a skipped or null
mode always warns. That is exactly today's behaviour, for setup operators and existing operators alike.

**Exactly one copy in the repo** — verified mechanically:

```
$ grep -rn "aren&apos;t set yet|allergens not set&rdquo;|Items are flagged" --include=*.tsx --include=*.ts .
app/manage/[token]/page.tsx:2487   ⚠ Allergens &amp; dietary aren&apos;t set yet
app/manage/[token]/page.tsx:2488   Review them … Items are flagged &ldquo;allergens not set&rdquo; until you do.
```

Both hits are the two `<p>` lines of the single constant. There is no second copy anywhere.

### (c) Default allergen display mode after a fresh import — and is an unverified dish hidden?

**Default: `null`, meaning "the operator skipped the choice".** `pendingDisplayMode` initialises to
`null` ([:1696](app/manage/[token]/page.tsx#L1696)), and the commit writes
`allergen_display_mode` **only if it is truthy** — `if (chosenDisplayMode) { … update_settings … }`. A
freshly provisioned operator truck starts at `allergenDisplayMode: null`
([lib/provision-truck.ts](lib/provision-truck.ts) — *"operator chooses in the wizard"*), so an import
that skips the chooser leaves the column `null`.

**🔴 And in that state an unverified dish IS hidden from customers.** The customer-menu gate is
[app/api/menu/[truckId]/route.ts:488-490](app/api/menu/[truckId]/route.ts#L488-L490):

```ts
const perDish = ((truck.allergen_display_mode ?? null) as string) !== 'card'
if (isDashboard || !perDish) return true                 // operator OR card mode → show everything
return (i as any).allergens_verified !== false           // customer + per-dish → hide explicit-unconfirmed
```

`null !== 'card'` is **true**, so **null is treated as per-dish**. Every item an import commits carries
`allergens_verified = false`, so on a truck that skipped the chooser, **the entire imported menu is
invisible to customers** until allergens are confirmed. The operator's own dashboard still shows them
(`isDashboard`), which is precisely what makes it easy to miss. That is existing behaviour; nothing in
this slice changes it, and it is why the warning in (b) matters.

---

## H1. THE WELCOME SCREEN

Built at [:4122-4157](app/manage/[token]/page.tsx#L4122-L4157). One piece of markup, both routes.

> **Welcome to HatchGrab**
> {truck_name} is set up. Next we'll add your menu, then your first event.
> You can stop and come back whenever.
> **[ Let's go ]**

**How it fits without changing slice C's decision.** It renders as an **overlay above** whichever first
screen the `?import=demo` bootstrap already chose, not as a step of its own:

```jsx
{showSetupIntro && inSetup && (importStep === 'offer' || importStep === 'upload') && ( … )}
```

"Let's go" does one thing: `setShowSetupIntro(false)`. It does not route. The offer-vs-upload decision
stays exactly where C1/C2 put it, untouched, and the screen underneath is already correct. This also
means **no new `ImportStep` value and no second flag** — `showSetupIntro` is the same flag that gated
the line it replaces, set once by the bootstrap and cleared by every control that advances or exits.

Overlay treatment matches the other steps: `fixed inset-0 bg-black/60 flex items-center justify-center
p-4` with a `bg-white rounded-2xl p-6 max-w-md shadow-2xl` card — the same card as the offer and upload
steps. `z-[55]` puts it above the wizard modals (`z-50`) and below the discard confirm (`z-[60]`), so
nothing that already existed changes stacking order.

**The slice-C green line is gone.** `setupIntroLine` and both `{setupIntroLine}` call sites are deleted;
`grep -rn "setupIntroLine"` across the repo returns nothing. There is no longer both.

**`{truck_name}` fallback: `"Your truck"`.** `/api/setup create_truck` rejects a name under 2
characters and `provisionTruck`'s operator profile sets `nameRequired: true`, so an empty name is not
reachable through the normal path; the fallback exists so the sentence stays grammatical rather than
rendering " is set up." if it ever were.

**The "your account's ready" tick — left alone, deliberately.** There are two distinct elements and the
brief's conditional resolves to "leave it":

* The one I removed is the **slice-C green line on Manage** (`setupIntroLine`), which read *"Your
  account's ready — now let's add your menu."*
* The **tick** is `<p class="text-4xl">✅</p>` + `<h4>Your account's ready</h4>` at
  [components/DemoGetStarted.tsx:861-862](components/DemoGetStarted.tsx#L861-L862). That **is** the
  DemoGetStarted confirmation beat — the file's own comment names it *"the 'Your account's ready'
  confirmation beat — the redirect fires on Continue (openTruck), NOT here"*. Per H1 it stays, and
  `components/DemoGetStarted.tsx` was not edited.

**Gusto / RTF: unaffected.** `showSetupIntro` is set only by the `?import=demo` bootstrap, and the render
is additionally gated on `inSetup`. Neither is ever true for them, so this overlay cannot mount. The
green line they never saw is simply gone.

---

## H2. SCROLL TO TOP BETWEEN STEPS

### 🔴 The brief's premise about the scroll container is wrong — flagged, not repaired

> "the manage `<main>` is the scroll container, not the window, and the reference manual records that
> `<main>` has no top padding because it holds sticky-top children."

Both statements are true **of the manage page**, and neither applies **to the wizard**. Every wizard
step is a `fixed inset-0` overlay, so it is outside `<main>`'s scroll flow entirely — scrolling `<main>`
would have done nothing. **The container actually being scrolled is each step's own modal body**, an
`overflow-y-auto flex-1 min-h-0` div inside the fixed overlay:

| Step | Scroller |
|---|---|
| review (Menu / Extras) | [:4286](app/manage/[token]/page.tsx#L4286) `overflow-y-auto flex-1 px-6 min-h-0` |
| allergens (chooser / card) | [:4518](app/manage/[token]/page.tsx#L4518) `p-5 overflow-y-auto flex-1 flex flex-col gap-4 min-h-0` |
| prep (Kitchen setup) | [:4612](app/manage/[token]/page.tsx#L4612) `overflow-y-auto flex-1 p-5 min-h-0` |
| schedule | [:4726](app/manage/[token]/page.tsx#L4726) `overflow-y-auto flex-1 p-5 min-h-0` |

**`<main>` is not touched.** No padding, no ref, no scroll call — the reference-manual contract at
Section 3 (*"the manage `<main>` therefore has NO top padding (`px-4 pb-6`)"*) is exactly as it was.

### The fix

One ref, `wizardScrollRef` ([:1709](app/manage/[token]/page.tsx#L1709)), attached to all four scrollers.
That is safe because the steps are mutually exclusive on `importStep` — only one is ever mounted, so
`.current` always points at the live one. Then:

```ts
useEffect(() => {
  wizardScrollRef.current?.scrollTo({ top: 0 })
}, [importStep, reviewStep, allergenSubStep])
```

**Why the dependency list has three entries, not one.** Menu → Extras is the reported case and the
hardest: those two are the *same mounted div*, differing only by `reviewStep`, so React never remounts
it and the menu list's scroll offset survives into a much shorter Extras page. A remount-only fix would
have missed exactly the bug that was reported. `allergenSubStep` covers chooser → card the same way.
`importStep` covers every genuine step change.

**Coverage is complete.** The one sub-screen without the ref is the per-dish review, which renders the
separate `AllergenWizardModal`; that branch is an early `return`
([:4484](app/manage/[token]/page.tsx#L4484)), so the component **mounts fresh** on entry and already
starts at the top. I did not add a prop to it — it is shared with the standalone allergen wizard Gusto
uses, and no change was needed.

### 🔴 Gating decision: deliberately UNGATED — stated, as H2 permits

H2 offered the choice, and I took the ungated option: **scrolling to top is correct for a non-setup
operator too.** Landing mid-page on Extras is a defect for Gusto and RTF exactly as much as for a new
signup, and gating the fix would mean knowingly leaving them the broken behaviour.

**This is the one change in the slice that is not gated on `inSetup`,** and it is the only place the
RED LINE's "gate everything" and H2's explicit carve-out point different ways. What Gusto and RTF
actually get: on each wizard step change, the modal body scrolls to its top. No copy changes, no layout
changes, no data touched, nothing written. If you would rather they kept the current behaviour, this is
a one-line change — wrap the effect body in `if (!inSetup) return`.

---

## H3. "I'LL DO THIS LATER"

[:4232-4241](app/manage/[token]/page.tsx#L4232-L4241). **Label only:**

```jsx
<Btn label={inSetup ? "I'll do this later" : 'Cancel'} colour="slate" onClick={/* unchanged */} />
```

The handler is untouched — it is still the slice-C confirmed-cancel path, verbatim:

```js
if (importResult && !window.confirm('Cancel this import? Your review of this menu will be discarded.')) return
resetImportState()
stripImportParam()
```

* **No confirm dialog on this route.** The confirm is already conditional on `importResult`, which is
  `null` on the sample-menu route (nothing has been processed yet), so it does not fire — as specified.
* **It exits, it does not skip forward.** `resetImportState()` sets `importStep` back to `'idle'`,
  closing the overlay and returning them to Manage. It advances to no wizard step and writes nothing —
  the account, the truck and `setup_step` all survive, which is what makes re-entry work. I did not add
  a redirect or a `reload()`; either would have been a behaviour change beyond a label swap.

### 🔴 Re-entry after H1 — confirmed, a returning operator does NOT see the welcome screen

The R4 finding still holds, and H1 does not weaken it:

1. `inSetup` still derives live from `truck.setup_step`
   ([:2385](app/manage/[token]/page.tsx#L2385)), which "I'll do this later" does not write. So the Menu
   tab's "✨ Import menu" still re-enters with Schedule appended, the "Your details" ✓ pill, and
   commit → schedule.
2. The welcome overlay is gated on `showSetupIntro`, and **the only writer of `true` is the
   `?import=demo` bootstrap** ([:2320](app/manage/[token]/page.tsx#L2320), [:2338](app/manage/[token]/page.tsx#L2338)).
   `resetImportState()` sets it `false` ([:1842](app/manage/[token]/page.tsx#L1842) — *"the arrival beat
   never survives a reset"*), and `stripImportParam()` removes the param so the bootstrap cannot re-fire
   even on a reload. The bootstrap is additionally one-shot per mount via `demoImportTried`.
3. Re-entry therefore lands on `'upload'` with `showSetupIntro === false` → **no welcome screen**, first
   arrival only, exactly as required.

**Gusto / RTF: unaffected.** They are not `inSetup`, so the label is the string `'Cancel'`, byte-for-byte.

---

## H4. THE STEPPER ON THE THREE MISSING SCREENS

Three new call sites of the **existing** `renderWizardStepper` over the **existing** `wizardSteps`
array. No second indicator, no duplicated step list.

| Screen | Call | What the operator sees |
|---|---|---|
| **offer** ([:4169](app/manage/[token]/page.tsx#L4169)) | `renderWizardStepper('menu')` | `Your details ✓ › ② Menu (active) › ③ Allergens › ④ Kitchen setup › ⑤ Schedule` (Extras is absent — `hasExtras` is false until an extraction is reviewed) |
| **upload** ([:4205](app/manage/[token]/page.tsx#L4205)) | `renderWizardStepper('menu')` | Same as offer |
| **done** ([:4879](app/manage/[token]/page.tsx#L4879)) | `renderWizardStepper('schedule')` | The full list with the **last** pill active — `Schedule` is where `finishSetup()` is reached from, so it reads as the step just completed, not as one still to come |

**Does the offer step need a position in the array? No — it sits before it.** The offer step is a
decision about *what feeds step 1*, not a step of its own: adding it would renumber every pill, and
`goToStep` could never return to it (it exists only while the bootstrap's extraction is unconsumed).
Showing it as `'menu'` is honest — the menu step is where they are heading either way.

The welcome screen (H1) renders **no** stepper. It precedes the flow.

### 🔴 Shared chrome: how a non-setup operator's upload screen is affected

**Not at all — the stepper is gated.** The upload screen is the one genuinely shared surface here: Gusto
and RTF open it from the Menu tab's "✨ Import menu" on every re-import, and they have never had a step
indicator on it. Ungated, this would have put new chrome on a live operator's screen. All three call
sites are therefore `{inSetup && …}`, and the pill wrapper (`<div className="mb-3">`) is inside that
guard — so for a non-setup operator **nothing renders and no spacing changes**; the `<h3>` keeps its
original classes and its original position. Their upload and done screens are byte-identical.

(The offer screen is unreachable for them regardless — it only exists on the `?import=demo` bootstrap —
but it is gated the same way so the rule is structural rather than incidental.)

---

## H5. THE POST-IMPORT SCREEN

[:4885-4899](app/manage/[token]/page.tsx#L4885-L4899).

> **Menu's in — {n} items across {m} categories.**

Singular handled on both: `item{n === 1 ? '' : 's'}` and `categor{m === 1 ? 'y' : 'ies'}` → "1 item
across 1 category."

**`{n}` uses the review header's counting expression — because it is now literally the same
expression.** The predicate `!_skip && String(name || '').trim()` was written out verbatim in three
places (review header, offer step, done screen's allergen check). It is now one derived value,
`committedImportItems` ([:2364](app/manage/[token]/page.tsx#L2364)), read by all three plus the new
count. This is a pure extraction — the predicate is byte-for-byte what each site already used, so every
existing rendered number is unchanged.

**`{m}` is derived from that same set**, not from `importResult.categories`
([:2370](app/manage/[token]/page.tsx#L2370)): distinct non-empty `category` values among the counted
items. A category whose every item was unticked is not a category the menu gained, and counting it would
contradict the item figure printed beside it.

**The allergen warning is unchanged in every respect** — same string (the one constant from H0b, reused
by reference), same position, same condition `{!allergensComplete && allergensNotSetNotice}`. Not
reworded, and no near-copy written beside it.

**🔴 Gated on `inSetup`, per the RED LINE.** This screen is shared with every existing operator's import,
so Gusto and RTF keep the old copy verbatim — `✅` / "Menu imported!" / "Your items have been added to
the menu." — rendered from the `else` branch. Only a setup arrival sees the new line. H5 did not say
"setup only", but the RED LINE says every change must be gated unless it cannot be, and this one can be.

The `importDoneSkipped` duplicate line and the `inSetup` "Go to my dashboard →" button are untouched on
both branches.

### Report-only: should the warning also appear on the Menu tab post-commit?

**It already does, in a different form — and the existing surface is better placed than a copy of this
notice would be.** `MenuTab` computes
`allergensUnverified = !cardModeSetUp && items.some(i => i.allergens_verified === false)`
([:190](app/manage/[token]/page.tsx#L190)) from **committed rows**, and drives a persistent banner plus
per-item `(!)` markers ([:447](app/manage/[token]/page.tsx#L447)) that open the allergen wizard. An
operator who abandons the wizard with allergens unset therefore does get a standing signal — it is not
silent.

Two things are genuinely missing, and I have built neither:

1. **The two conditions disagree at the edges.** The done screen judges *staged* `_allergensChecked` and
   fails loud on a null display mode; the Menu tab judges *committed* `allergens_verified` and
   suppresses on `cardModeSetUp`. A truck that skipped the chooser (mode `null`) hits the H0c trap —
   its whole menu hidden from customers — and the Menu tab's banner does not say that.
2. **Nothing states the consequence.** Neither surface says "customers cannot see these dishes", which
   is the fact that actually matters. Adding it is a copy change to a live operator's Menu tab and
   belongs in its own slice with its own gating decision.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 371 problems (294 errors, 77 warnings)
```

**Baseline was 372 problems (295 errors, 77 warnings); it is now 371 (294 errors, 77 warnings) — one
error fewer, none added.** The delta is real and accounted for: the done screen's inline filter carried
a `(it: any)` annotation, and folding it into the shared `committedImportItems` (whose element type is
inferred) removed that `no-explicit-any` error. Warnings are unchanged at 77 — the new `useEffect` needs
no dependency exemption, since refs and setters are stable and all three state values are listed.

### Files touched

| File | Reason |
|---|---|
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | All of H1–H5: the welcome overlay, removal of the slice-C green line, the wizard scroll-to-top ref + effect, the "I'll do this later" label, the stepper on offer/upload/done, the new post-import line, and the two extractions (`committedImportItems`, `allergensNotSetNotice`). |

Nothing else. `components/DemoGetStarted.tsx` was read but **not** edited (its confirmation beat stays).
`components/manage/primitives.tsx` and `AllergenWizardModal` were read but not edited.

### Gusto and Real Thai Food, per change

| Change | Effect on Gusto / RTF |
|---|---|
| H1 welcome screen | **Unaffected** — gated `showSetupIntro && inSetup`, neither reachable for them. |
| H1 removal of the green line | **Unaffected** — the line only ever rendered while `showSetupIntro` was true. |
| H2 scroll to top | **Affected, deliberately and ungated** — their wizard steps now also open at the top. Cosmetic only; no copy, layout or data change. This is the single ungated change, per H2's explicit permission. Reverting it for them is one line. |
| H3 "I'll do this later" | **Unaffected** — `inSetup ? … : 'Cancel'` keeps their string byte-for-byte; the handler was not modified. |
| H4 stepper on 3 screens | **Unaffected** — all three call sites gated on `inSetup`, wrapper div inside the guard, so no element and no spacing change on their upload or done screens. |
| H5 post-import line | **Unaffected** — gated on `inSetup`; the `else` branch renders the old ✅ / "Menu imported!" / "Your items have been added to the menu." verbatim. |
| `committedImportItems` extraction | **Unaffected** — identical predicate, identical rendered numbers on the review header and offer step. |
| `allergensNotSetNotice` extraction | **Unaffected** — identical markup, identical copy, identical firing condition. |

**No change required an ungateable edit**, so there was nothing to stop for — except H2, where I took
the choice H2 itself offered and have stated it plainly above rather than quietly.
