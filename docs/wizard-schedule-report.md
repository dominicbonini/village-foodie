# Wizard schedule step → the shared event modal, plus four fixes

**Date:** 4 August 2026.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
No garbled spans. Nothing forced a second copy of anything, so there was nothing to stop for.

---

## T1. ROUTE A NOW IMPORTS *AND* ENROLS

Built exactly as S3(b) set out: **the trigger was shared, not the UI.**

### (a)–(b) The wiring

| # | Change | Where |
|---|---|---|
| 1 | `MenuTab` gains `onVerifySuccess: (events: unknown[], onSaved?: () => void) => void` | prop type + signature |
| 2 | The page passes it the same handler `SettingsTab` gets | [:625](app/manage/[token]/page.tsx#L625) |
| 3 | `schedVerify`'s `found` branch calls it | [:3018](app/manage/[token]/page.tsx#L3018) |

```ts
onVerifySuccess(data.events || [], () => goToSettingsReview())
```

One line replaces what used to be a dead-end read-only list. `pendingVerifyEvents` is set, and
ScheduleTab's existing effect opens the existing modal — which its own comment already noted is
*"rendered outside the isActive gate so it can open from any tab."*

### 🔴 Why both callers go through one page handler

`SettingsTab` used to receive `setPendingVerifyEvents` directly. Both now receive
`handleVerifiedEvents` ([:175](app/manage/[token]/page.tsx#L175)):

```ts
const [afterEventsSaved, setAfterEventsSaved] = useState<(() => void) | null>(null)
const handleVerifiedEvents = (events: unknown[], onSaved?: () => void) => {
  setAfterEventsSaved(() => onSaved ?? null)   // updater form — a bare setState(fn) would be an updater
  setPendingVerifyEvents(events)
}
```

**Because the callback has to be *cleared*, not just set.** Had Settings kept writing
`pendingVerifyEvents` directly, a callback left over from a wizard run would still be in state — and a
Settings import months later would call `goToSettingsReview()` and reopen the wizard's review step over
a live truck. Setting it on *every* trigger makes that unreachable rather than unlikely.

### (c) ✅ Exactly one editable event list — verified mechanically

| Check | Result |
|---|---|
| `showImportModal && (` render sites | **1** ([:7871](app/manage/[token]/page.tsx#L7871)) |
| `const updateEvent = ` definitions | **1** ([:6998](app/manage/[token]/page.tsx#L6998)) |
| Per-field inputs bound to it | 4 — all inside that one closure, the list's mobile-card and desktop-row layouts |

**Nothing was lifted, copied or re-implemented.** The wizard gained a function call; the modal, its
state, its inputs and its save are untouched and still live only in `ScheduleTab`.

### (d) Both promises kept

The enrolment writes are unchanged — `schedule_url` and `scraper_preference: 'auto'` still fire before
the modal opens. What changed is that the dates found *today* are no longer discarded. Live evidence for
why this mattered: `village-spice` completed this route on 4 Aug with `schedule_url` set,
`scraper_preference` `'auto'`, `scraper_rule` `'scroll_next'` — and **zero `truck_events` rows**.

### (e) 🔴 Step progression — and how Settings' save is *provably* unchanged

`ScheduleTab` gains one optional prop and `saveExtractedEvents` gains **one line**, after the toast:

```ts
onEventsSaved?.()
```

**The proof that Settings is byte-identical, in three linked facts:**

1. **Settings calls `onVerifySuccess` with one argument.** Verified by grep — the only two call sites are
   [:3018](app/manage/[token]/page.tsx#L3018) (wizard, two arguments) and
   [:8095](app/manage/[token]/page.tsx#L8095) (**Settings, `onVerifySuccess(data.events)` — unchanged,
   one argument**).
2. **So `onSaved` is `undefined`**, and `handleVerifiedEvents` stores `onSaved ?? null` → **`null`**.
3. **So `ScheduleTab` receives `onEventsSaved={null}`**, and `null?.()` short-circuits to `undefined`.

For Gusto and RTF the added line evaluates and does nothing. Every other line of `saveExtractedEvents` —
the `upsert_event` loop, geocoding, `loadEvents()`, `closeAddModal()`, `setShowImportModal(false)`, the
toast, the catch, the finally — is untouched. The prop is optional, so no other caller needed changing.

### (f) The green panel, reduced

**Before:** "✓ We can read your schedule" · "Found N upcoming dates. We'll check your page regularly and
send new dates for your approval — nothing goes live until you confirm it." · a five-date bullet preview
· "…and N more".

**After:**

> **✓ We can read your schedule**
> We'll keep checking this page and send any new dates for your approval.
> **[ Continue → ]**

The count and preview now duplicate the modal, which shows the same dates *editably*. And "we'll send
new dates for your approval" was written for a route that imported nothing — beside an import happening
in front of them it reads as a contradiction. What is left is the one thing the modal does not say: the
page is watched from here on.

### (g) Dismissing the modal without saving — not a trap

Already handled by the existing markup, and unchanged:

* **The URL stays enrolled.** `schedule_url` and `scraper_preference` are written *before* the modal
  opens, in the same branch. Dismissing does not undo them.
* **The wizard still moves.** The green panel carries `<Btn label="Continue →" onClick={skipSchedule} />`,
  and `skipSchedule()` → `goToSettingsReview()`. That is independent of the modal.
* **The dates are not lost for good.** They were never written, but the page is now enrolled, so the
  scraper finds them again and submits them for approval — which is exactly what the reduced panel says.

⚠️ One rough edge, reported rather than changed: after a successful verify the URL input and Verify
button are disabled (`disabled={… || !!schedVerifiedEvents}`), so an operator who dismisses the modal
cannot immediately re-verify to get it back. They can Continue and approve the dates later. Widening
that was outside T1's scope.

---

## T2. THE TRIAL REASSURANCE

**String:** `TRIAL_NOT_STARTED_BY_EVENTS` in [lib/settings-copy.ts](lib/settings-copy.ts) — this
session's shared-copy home, so the eventual nomination screen can render the same words.

> Adding events doesn't start your free trial — you choose which event starts it, later.

**Rendered** on the wizard's schedule step, beneath its sub-heading — the moment the worry arises, since
an operator adding dates reasonably assumes that is what starts a clock.

🔴 **The comment beside it is explicit that this is ahead of the build**: there is no nomination UI, no
route, and nothing writes `trial_expires_at` except provisioning setting it to null; a self-serve
operator is on plan `'demo'`, which never expires. The comment states the reasoning — the failure mode
is one-directional, an operator not being charged when they expected to be — and says plainly: do not
read this as documentation of working behaviour, and do not write code against it.

---

## T3. ALLERGEN REVIEW LANDS ON THE TABLE

Applied at [:4073](app/manage/[token]/page.tsx#L4073), using `mode` from
[:4037](app/manage/[token]/page.tsx#L4037):

```tsx
setWizardInitialMode(mode === 'per_dish' || mode === 'both' ? 1 : 0)
onOpenAllergenWizard()
```

Mode 1 is the per-dish confirmation table; mode 0 the card-vs-per-dish chooser. `'card'` and `null`
still land on the chooser — a card-mode truck has no per-dish table to review, and a null-mode truck
genuinely has not chosen. No new state, no new prop, `AllergenWizardModal` untouched.

---

## T4. THE WELCOME SCREEN AND THE WIZARD

### Why both mounted

**Slice H built it that way, deliberately, and the reasoning was wrong.** The welcome was rendered as an
overlay *above* whichever first screen slice C had already chosen — `z-[55]` over the step's `z-50` — so
that "Let's go" only had to stop covering it, and slice C's offer-vs-upload decision needed no change.
That is a **stacking** answer to a **sequencing** question: both overlays were alive at once, and the
wizard was plainly visible behind a translucent backdrop.

### What changed — the mount, not the z-index

Two gates, at [:4675](app/manage/[token]/page.tsx#L4675) and [:4710](app/manage/[token]/page.tsx#L4710):

```tsx
{importStep === 'offer'  && importResult && !showSetupIntro && ( … )}
{importStep === 'upload' &&                 !showSetupIntro && ( … )}
```

**No z-index was touched.** While the welcome is up, the step does not render at all; "Let's go" clears
`showSetupIntro` and it appears. Strictly sequential.

The step **state** is still set by the `?import=demo` bootstrap, so slice C's offer-vs-upload decision is
untouched — it is simply not painted until the welcome is done with.

---

## T5. BRANDED QR BY DEFAULT WHEN A LOGO EXISTS

[app/manage/[token]/page.tsx:7761](app/manage/[token]/page.tsx#L7761) — a lazy `useState` initialiser in
`SettingsTab`:

```ts
const stored = truck.qr_code_style ?? 'standard'
const stillInSetup = truck.setup_step != null && truck.setup_step !== 'done'
const canBrand = canAccess(truck.plan, 'branded_qr_code', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
if (stored === 'standard' && stillInSetup && canBrand && truck.logo_storage_path) return 'branded'
return stored
```

**Per-render, not per-truck — and it cannot be otherwise.** `trucks.qr_code_style` is
`NOT NULL DEFAULT 'standard'`, so it is never null: there is no "unset" value distinguishing an operator
who *chose* Standard from one who has never touched the control. Both read `'standard'`.

🔴 **Which is why it is scoped to setup.** Applied to every truck, this would silently re-select Branded
for an operator who had deliberately picked Standard, every time they opened Settings — overriding a
real choice because the schema cannot record that it was one. `setup_step` present and not `'done'`
means the truck is still being built and has made no such choice yet.

Also gated on the feature: branded is Pro/Max (`branded_qr_code`), and defaulting a Starter truck to an
option its own UI renders disabled would look broken. A setup operator is on plan `'demo'`, whose
feature set includes it, so the intended case passes.

**No logo ⇒ standard, unchanged.** Nothing is written to the database — this only changes which radio is
pre-selected; `saveSetting('qr_code_style', …)` still fires on click alone.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 370 problems (293 errors, 77 warnings)

$ npx eslint lib/settings-copy.ts
(no output — clean)
```

**Baseline 371 (294 errors, 77 warnings); now 370 (293 errors, 77 warnings) — one error FEWER, none
added.** Accounted for: T1(f) deleted the five-date preview, which carried a `(ev: any, i: number)`
annotation (−1). My two new signatures were initially `any[]` (+2, giving an interim 372); both are now
`unknown[]`, which the surrounding `any[]` state accepts without a cast.

### Files touched

| File | Reason |
|---|---|
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | T1 the shared trigger, the optional `onEventsSaved` callback and the reduced panel; T2 renders the reassurance; T3 the allergen landing mode; T4 the two mount gates; T5 the QR default. |
| [lib/settings-copy.ts](lib/settings-copy.ts) | T2 — `TRIAL_NOT_STARTED_BY_EVENTS` with its ahead-of-the-build warning. |

No migration, no SQL, no new component, no new endpoint.

### Gusto and Real Thai Food

| Item | Effect |
|---|---|
| **T1** | **Unaffected — provably.** `onVerifySuccess(data.events)` in Settings is unchanged and passes one argument, so `onEventsSaved` arrives `null` and the one added line is a no-op. Every other line of `saveExtractedEvents` is untouched. The modal, its state and its inputs are unchanged. |
| T2 | **Unaffected** — rendered on the wizard's schedule step, `inSetup`-gated, which they never reach. |
| T3 | **Affected, and it is an improvement for them too.** The Menu tab's "Set up / review allergens" is a shared control: a truck that has already chosen per-dish now lands on the confirmation table instead of being re-asked. Card-mode and unset trucks are unchanged. |
| T4 | **Unaffected** — `showSetupIntro` is only ever true during a setup arrival, so both new gates read `!false` and their upload step renders exactly as before. |
| T5 | **Unaffected** — gated on `setup_step` being present and not `'done'`. Theirs is NULL, so the branch is unreachable and their stored `qr_code_style` always wins. |
