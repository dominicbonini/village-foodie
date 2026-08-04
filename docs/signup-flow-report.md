# Slice C — flow convergence for the signup menu step

**Date:** 3 August 2026 · Builds on [docs/signup-fix-report.md](docs/signup-fix-report.md) and
[docs/signup-diagnosis-report.md](docs/signup-diagnosis-report.md).
**Zero migrations, no SQL.** No `next dev`, no `next build`.

**Typecheck — exact command and result:**
```
npx tsc --noEmit -p tsconfig.json   →   TSC EXIT=0   (no output)
```

**Lint — `app/manage/[token]/page.tsx` against its pre-change baseline:**
```
BASELINE: ✖ 372 problems (295 errors, 77 warnings)
AFTER:    ✖ 372 problems (295 errors, 77 warnings)
```

**No mojibake or garbled spans** were found in any file read or edited.

---

## C0 — answers before building. Nothing was unworkable.

### (a) `importStep` union and every use site — safe to extend

```ts
type ImportStep = 'idle' | 'upload' | 'processing' | 'offer' | 'review' | 'allergens' | 'prep' | 'saving' | 'schedule' | 'done'
```
— [:638-644](app/manage/[token]/page.tsx#L638-L644) (`'offer'` added by C1)

**There is no `switch` on this type anywhere in the codebase.** Every consumer is an `===` comparison
against a literal:

| Site | Comparison |
|---|---|
| [:4056](app/manage/[token]/page.tsx#L4056) | `=== 'upload'` |
| [:4080](app/manage/[token]/page.tsx#L4080) | `=== 'processing'` |
| [:4091](app/manage/[token]/page.tsx#L4091) | `=== 'review'` |
| [:4293](app/manage/[token]/page.tsx#L4293) | `=== 'allergens'` |
| [:4406](app/manage/[token]/page.tsx#L4406) | `=== 'prep' \|\| === 'saving'` |
| [:4503](app/manage/[token]/page.tsx#L4503) | `=== 'saving'` (Back disabled) |
| [:4510](app/manage/[token]/page.tsx#L4510) | `=== 'saving'` (Next loading) |
| [:4529](app/manage/[token]/page.tsx#L4529) | `=== 'schedule' && inSetup` |
| [:4672](app/manage/[token]/page.tsx#L4672) | `=== 'done'` |

**Consequence: an unhandled value renders nothing and falls through nowhere.** Adding `'offer'` cannot
silently change any existing branch — the new step is visible only because C1 adds a block that matches it.

### (b) `'schedule'` and `'done'` — ⚠️ also `z-50` full-viewport overlays

Investigation 3 enumerated `upload`, `review` and `prep`/`saving`. Checking the two it did not:

```tsx
{importStep === 'schedule' && inSetup && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">     // :4530
{importStep === 'done' && (() => { …
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">   // :4692
```

**Both are `fixed inset-0 bg-black/60 z-50`, identical to the other three.** So the tab bar (`z-40`,
[:435](app/manage/[token]/page.tsx#L435)) is unreachable in **every** non-`idle` step, not just the three
previously checked. Investigation 3's conclusion generalises: there is no wizard state in which the tabs
can be clicked. (There is also a `z-[60]` at [:4731](app/manage/[token]/page.tsx#L4731) — a nested modal
above the done screen, consistent.)

### (c) Where the bootstrap decides, and the smallest edit

One `useEffect` ([:2231-2320](app/manage/[token]/page.tsx#L2231-L2320)) with a single decision point: an
early-return block for the null cases, then a fall-through that loads the extraction.

**The smallest edit was two insertions, no restructuring:**
1. Inside the existing early-return block, before `return`: a `template_withheld` branch (C2).
2. At the fall-through, change the final `setImportStep('review')` to `setImportStep('offer')` (C1).

**Everything between is untouched** — the parse, `setReviewStep(1)`, `setGroupingChoice({})`, the
`get_vans` read, `setImportKitchenCapacity`, `setImportKitchenDirty(false)` and `setDemoImportMode(true)`
all run exactly as before. The effect's shape, deps and `demoImportTried` guard are unchanged.

---

## C1 — the offer step

[:4067-4112](app/manage/[token]/page.tsx#L4067-L4112). Same overlay treatment as every other step
(`fixed inset-0 bg-black/60 z-50`) and the same `max-w-md` card as `upload`.

- **Heading:** "Use the menu from your demo?"
- **Body:** "We saved the menu you uploaded — {n} items. Use it as your starting point, or upload a different one."
- **Primary** "Use this menu" → `setImportStep('review')` **and nothing else**.
- **Secondary** "Upload a different menu" → `setDemoImportMode(false)` + `setImportStep('upload')`.

**Punctuation follows the file:** em dash `—` (the file uses it throughout; the brief's example used a
hyphen) and `&apos;` for apostrophes in the C3 line, matching the 22 existing `&apos;` uses.

**The count** uses `importResult.items.filter(i => !i._skip && String(i.name || '').trim()).length` —
the *same expression* the review step's own header uses ([:4120](app/manage/[token]/page.tsx#L4120)), so
the number promised here cannot disagree with the number they then see. Nothing is skipped at offer time,
so both resolve to the named-item count.

### What `clearFirst` does on each branch

`clearFirst: demoImportMode` is the commit payload ([:2702](app/manage/[token]/page.tsx#L2702)).

| Branch | `demoImportMode` | `clearFirst` | Effect at commit |
|---|---|---|---|
| **Use this menu** | `true` (set by the bootstrap, unchanged) | `true` | Existing menu rows are deleted before insert. Correct: this is the demo re-commit, and clear-first is what makes a retry after a partial commit **repair** rather than duplicate ([:2700-2701](app/manage/[token]/page.tsx#L2700-L2701)). |
| **Upload a different menu** | `false` | `false` | Plain append — identical to any normal operator import. 🔴 Correct and necessary: firing clear-first for a menu that has nothing to do with the demo would wipe rows on an unrelated import. |

**Gusto / RTF:** unaffected. `'offer'` is reachable only from the `?import=demo` bootstrap, which they
never trigger. Their `demoImportMode` stays `false` and their `clearFirst` stays `false`, exactly as now.

---

## C2 — the template route

[:2290-2296](app/manage/[token]/page.tsx#L2290-L2296), inside the existing early-return block:

```ts
if (data?.reason === 'template_withheld') {
  setDemoImportMode(false)
  setShowSetupIntro(true)
  setImportStep('upload')
}
```

Opens the **existing** `upload` step — no second upload UI, no offer (there is nothing to offer), no
error toast (slice B removed it). `demoImportMode` stays `false`, so `clearFirst` is `false`.

**Gusto / RTF:** unaffected. Reaching this needs `reason === 'template_withheld'`, which requires a
claimed demo session; both answer `no_claim`.

---

## C3 — the confirmation beat, one definition

Defined **once** at [:1883-1887](app/manage/[token]/page.tsx#L1883-L1887), referenced twice —
[:4088](app/manage/[token]/page.tsx#L4088) (offer) and [:4118](app/manage/[token]/page.tsx#L4118) (upload):

```tsx
const setupIntroLine = showSetupIntro ? (
  <p className="text-sm font-bold text-green-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-4">
    Your account&apos;s ready — now let&apos;s add your menu.
  </p>
) : null
```

**Once per arrival.** `showSetupIntro` is set `true` by the bootstrap on **both** routes
([:2294](app/manage/[token]/page.tsx#L2294), [:2312](app/manage/[token]/page.tsx#L2312)) and cleared by
every control that advances or exits:

| Cleared at | Covers |
|---|---|
| [:4098](app/manage/[token]/page.tsx#L4098) offer → review | "Use this menu" |
| [:4105](app/manage/[token]/page.tsx#L4105) offer → upload | "Upload a different menu" |
| [:1786](app/manage/[token]/page.tsx#L1786) `handleProcessMenu` | the **template route**, whose first screen is `upload` — without this, a Back from review would show the beat a second time |
| [:1842](app/manage/[token]/page.tsx#L1842) `resetImportState` | Cancel, and post-commit |

**The DemoGetStarted beat is NOT removed**, as instructed.

### ⚠️ Can both be seen in one session, and does it read as duplication?

**Yes, both can be seen — and I do not think it reads as duplication, but you should judge it.**

The sequence for an operator who stays in the modal: the in-modal beat says *"Your account's ready"* with
*"Now let's finish setting up your truck — your menu, allergens and kitchen"*, they press Continue, and
Manage opens with *"Your account's ready — now let's add your menu."*

They are ~1 second apart and the first clause is near-identical. My read: it works as a **handover
refrain** — the same sentence on both sides of a navigation confirms the navigation did what it said,
which is precisely what was missing when the modal beat died on the redirect. It would read as
duplication if the second one repeated the *whole* message; it narrows from "truck" to "menu", which is
the actual next step.

**If you disagree, the cheap fix is to shorten the Manage line to "Now let's add your menu."** — one
string, one place, since C3 is a single definition. I have not done it: the brief specified the wording.

**Gusto / RTF:** unaffected. `showSetupIntro` initialises `false` and is set `true` only inside the
bootstrap, which requires `?import=demo`.

---

## C4 — strip on deliberate exit only

`stripImportParam()` at [:1804-1819](app/manage/[token]/page.tsx#L1804-L1819) — `replaceState`, removes
**only** the `import` key, leaves every other param intact.

| Called at | Why |
|---|---|
| [:4148](app/manage/[token]/page.tsx#L4148) — Cancel on `upload` | The one real exit to `idle`. A decision. |
| [:2761](app/manage/[token]/page.tsx#L2761) — after a successful commit | Finished, not interrupted. Placed **before** the `inSetup` branch so it covers both, since the setup route never reaches the auto-dismiss timeout. |

**NOT called on unmount, tab switch or any accidental dismissal** — there is no cleanup function and no
call in the effect. Those must still recover, and B3 established that the bootstrap re-fire is the *only*
recovery path.

**Net effect, as specified:** abandon → normal empty Menu tab; lose the wizard accidentally → get it back.

**Gusto / RTF:** unaffected in effect. They reach the commit-path call, but `stripImportParam` early-returns
on `if (!params.has('import')) return` — they never carry the param, so it is a no-op with no
`replaceState` and no history entry.

---

## C5 — Cancel: confirm, and clear properly

[:4131-4152](app/manage/[token]/page.tsx#L4131-L4152):

```tsx
<Btn label="Cancel" colour="slate" onClick={() => {
  if (importResult && !window.confirm('Cancel this import? Your review of this menu will be discarded.')) return
  resetImportState()
  stripImportParam()
}} />
```

`window.confirm` is the established idiom for this class of decision in this codebase
(`AddOrderPanel.tsx:960/971/981`). The confirm fires **only when there is review work to lose** — a
Cancel from a freshly opened upload step is unchanged and shows no dialog.

### Everything cleared — via `resetImportState()`, not a longer subset

Calling the existing full reset is what makes this correct rather than drift-prone; a hand-listed subset
would go stale the next time a field is added. It clears **31 states**:

`importStep`, `importResult`, `demoImportMode`, `showSetupIntro`, `importFile`, `importText`,
`importDoneSkipped`, `categoryPrep`, `groupingChoice`, `importCatOpen`, `reviewStep`,
`importKitchenCapacity`, `importVans`, `importKitchenDirty`, `cardImportParsed`, `cardImportMatch`,
`cardImportProcessing`, `cardImportDone`, `cardBlanketOptIn`, `cardEntriesResolved`, `allergenSubStep`,
`pendingDisplayMode`, `cardImportFile`, `cardImportText`, `importCardOnlyText`,
`importCardOnlyTranscribing`, `showCardUpload`, `showDiscardConfirm`, `scheduleRoute`, `finishingSetup`,
and the schedule-step group (`schedUrl`, `schedVerifying`, `schedVerifyError`, `schedVerifiedEvents`,
`schedFile`, `schedText`, `schedPhotoProcessing`, `schedExtracted`, `schedSaving`).

🔴 **The per-item `_skip` / `_free` / `_allergensChecked` flags live inside `importResult`, so
`setImportResult(null)` takes them with it.** That is the consequential one: the commit maps
`_allergensChecked` → `allergens_verified`, which gates whether a dish is visible to customers in
per-dish mode. A stale confirmation surviving into a *different* menu would mark a dish verified that
nobody verified — a food-safety claim made by leftover state.

**Deliberately NOT cleared:**

| State | Why |
|---|---|
| `categories`, `items`, `subcategories`, `modifierGroups`, `modifierOptions` | The truck's **real, committed** menu. Cancelling an import must not touch it. |
| `activeTab` | Cancelling returns to the Menu tab they were on, not somewhere else. |
| `truck` | Unrelated to the import. |
| The `?verify=` / `?tab=` params | `stripImportParam` removes only `import`. |
| `demoImportTried` (the bootstrap ref) | Deliberate — if it were reset, the bootstrap would immediately re-fire and reopen the wizard they just cancelled. The param strip is what stops the reopen. |

### 🔴 Gusto and RTF ARE affected here, and this is the one place they are

C5 is shared wizard code. **Both changes reach them, and both are fixes for them:**

- **They now see the confirm dialog** when cancelling an import that has review work in it. Previously a mis-tap on Cancel discarded a completed review silently.
- **They now get the full clear.** Previously Cancel left `importResult` (with every `_skip`, `_free` and `_allergensChecked`), `groupingChoice`, `categoryPrep` and `importKitchenCapacity` in place, so a Cancel followed by a fresh import could carry decisions across. Gusto has real committed dishes and per-dish allergen state, so the stale-`_allergensChecked` risk was live for them.
- **Nothing else in their path changes.** They do not reach `offer` (no `?import=demo`), do not see `setupIntroLine` (`showSetupIntro` stays false), and `stripImportParam` is a no-op for them. `demoImportMode` stays `false`, so `clearFirst` stays `false`.

---

## C6 — no drift: the two routes side by side

| # | Step | Uploaded menu (`upload` extraction) | Sample menu (`template`) | |
|---|---|---|---|---|
| 1 | Account creation | `/api/signup` → `admin.createUser`, `email_confirm:true` | identical | **SAME** |
| 2 | Verification email | sent, gates nothing | identical | **SAME** |
| 3 | Demo claim | `claimed_by_operator_id` set | identical | **SAME** |
| 4 | Sign-in | `signInWithPassword` | identical | **SAME** |
| 5 | Truck creation | `create_truck` → `setup_step 'menu'`, `preorders_enabled false` | identical | **SAME** |
| 6 | Best-effort settings + logo | same three calls | identical | **SAME** |
| 7 | In-modal beat | "Your account's ready" | identical | **SAME** |
| 8 | Redirect | `/manage/<token>?import=demo` | identical | **SAME** |
| 9 | Bootstrap fires | `demoImportTried` guard, GET `/api/setup` | identical | **SAME** |
| 10 | GET reason | `extraction` returned | `template_withheld` | 🔶 **DIFFERENT — the offer step and its cause** |
| 11 | Arrival beat | `setupIntroLine`, same markup | identical | **SAME** |
| 12 | First screen | **`offer`** | **`upload`** | 🔶 **DIFFERENT — outcome of the offer** |
| 13 | → if "Use this menu" | `review`, `demoImportMode true` | n/a | 🔶 **DIFFERENT — outcome of the offer** |
| 13b | → if "Upload a different menu" | `upload`, `demoImportMode false` | **converges here** | 🔶 **DIFFERENT — outcome of the offer** |
| 14 | Upload → process | `handleProcessMenu` | identical | **SAME** |
| 15 | Review (page 1) | same list, `_skip`, price gate, `_free` | identical | **SAME** |
| 16 | Extras (page 2) | same `groupingChoice` | identical | **SAME** |
| 17 | Allergens | same step, `_allergensChecked` | identical | **SAME** |
| 18 | Kitchen setup | same `categoryPrep`, capacity | identical | **SAME** |
| 19 | Commit | same endpoint; `clearFirst` = `demoImportMode` | identical mechanism | **SAME** |
| 20 | Param stripped | on commit | identical | **SAME** |
| 21 | Schedule step | `inSetup` → shown | identical | **SAME** |
| 22 | Done | `inSetup` → explicit exit | identical | **SAME** |

**Only rows 10, 12, 13 and 13b differ, and all four are the offer step and its two outcomes.** Row 13b is
the convergence point: an uploaded-menu operator who declines the offer follows the sample route
byte-for-byte from there. **No other drift found.**

⚠️ **Not collapsed, deliberately:** the two `DemoGetStarted` CTA variants — `'Save my menu →'` (upload)
vs `'Set up my truck →'` (sample). That divergence is correct and documented at
[DemoGetStarted.tsx:70-79](components/DemoGetStarted.tsx#L70-L79): an upload operator has an artifact to
save, a sample operator does not, and "Save my menu" would be simply false for them. **Untouched.**

---

## Files touched

| File | Reason |
|---|---|
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | C1 offer step + union member · C2 template route · C3 one-definition arrival beat · C4 `stripImportParam` on deliberate exit · C5 Cancel confirm + full clear |

**One file.** ⚠️ `git status` also shows earlier tasks' files as modified — not part of this change.

---

## Verify on screen

1. **Uploaded-menu signup** → Manage opens on the **offer** step with the green beat above it and the real item count. "Use this menu" → the review step exactly as before.
2. **Same, choosing "Upload a different menu"** → the upload step; commit and confirm the existing menu was **not** cleared first.
3. **Sample signup** → Manage opens directly on **upload**, beat above it, **no** error toast, no offer.
4. **Beat shows once** — advance, then reopen via "✨ Import menu": no beat.
5. **C5 on a setup import** — get to review, Back, Cancel → confirm dialog; accept → wizard closes, `?import=demo` gone from the URL, reopening "✨ Import menu" shows a clean upload with no carried-over decisions.
6. **C4 recovery still works** — mid-review, switch tabs and back: the wizard returns (param still present).
7. **🔴 Gusto** — start an import, reach review, Back, Cancel: they now get the confirm and the full clear. Everything else on their Menu tab must be unchanged.
