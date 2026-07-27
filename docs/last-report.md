# Last report — Setup wizard: fix the ✕ inconsistency on the Schedule step

**Date:** 2026-07-26 · **Branch:** `main` · **Files touched:** 1 (`app/manage/[token]/page.tsx`)

This report **overwrites** the previous one (the schedule-step simplification build of 2026-07-25).

Task: the header ✕ on the schedule step called `skipSchedule` directly — silently writing
`setup_step='done'`, flipping `inSetup` false, stripping the setup chrome, with no route back.
On the menu / allergens / kitchen steps the same control opens the "Finish setting up later?"
confirm and writes nothing. Make schedule match, without inventing a third behaviour.

Constraints honoured: no `next dev`, no `next build`. Verified by `npx tsc --noEmit` + `npx eslint`.

---

## 1. Prompt garble — flagged, not silently fixed

The final paragraph arrived as:

> "Report whether any ot␣in the setup-mode wizard writes setup_step or leaves the wizard without
> a confirm — I want to know if this is the only inconsistency or one of several."

A word is missing after "any" — evidently *"any other exit"* or *"any other control"*. I read it
as: audit **every exit control in the setup-mode wizard** against two questions — does it write
`setup_step`, and does it leave without a confirm. That audit is §4. Nothing else was garbled.

---

## 2. What the other steps' ✕ does on accept (quoted, not paraphrased)

The three earlier steps' ✕ — review `app/manage/[token]/page.tsx:4005`, allergens `:4241`,
kitchen `:4324` — are all identical:

```tsx
<button type="button" onClick={() => setShowDiscardConfirm(true)} aria-label="Close import"
  className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0">×</button>
```

They open the shared confirm at `:4628-4652`. In setup mode it renders (`:4631-4639`):

```tsx
{inSetup ? (
  <>
    <p className="font-black text-slate-900 mb-1">Finish setting up later?</p>
    <p className="text-sm text-slate-500 mb-4">Your account and truck are saved — nothing is lost. You can add your menu any time: sign in and tap <span className="font-semibold">Import menu</span> on your menu screen to pick up right here.</p>
    <div className="flex gap-2 justify-center">
      <Btn label="Keep going" colour="slate" onClick={() => setShowDiscardConfirm(false)} />
      <Btn label="Finish later" colour="orange" onClick={resetImportState} />
    </div>
  </>
) : ( … )}
```

**On accept ("Finish later") the action is exactly `resetImportState`** (`:1768-1801`) — a pure
client-state reset: `setImportStep('idle')` plus ~30 `setX(...)` calls. **No API call, no
`update_truck`, no `setup_step` write.** Its own header comment (`:1766-1767`) confirms the intent:
*"No van write here — the total-capacity write is deferred to commit, so a discard never touched
the van (clean)."* The confirm's comment (`:4624-4625`) says the same for setup mode: *"In SETUP
mode the SAME action (resetImportState — no DB write) leaves the account + truck + setup_step
intact."*

So the target behaviour is: **open `showDiscardConfirm`; on accept run `resetImportState`;
`setup_step` untouched; `inSetup` stays true; setup chrome survives; the operator returns via
Import menu.** That is what schedule now does — no third behaviour invented.

---

## 3. The change

### 3a. `app/manage/[token]/page.tsx:4440-4441` — the ✕ itself

Before:

```tsx
<button type="button" onClick={skipSchedule} aria-label="Skip for now" disabled={finishingSetup}
  className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0 disabled:opacity-40">×</button>
```

After:

```tsx
<button type="button" onClick={() => setShowDiscardConfirm(true)} aria-label="Close import" disabled={finishingSetup}
  className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0 disabled:opacity-40">×</button>
```

Three deltas: `onClick` → the shared confirm; `aria-label` `"Skip for now"` → `"Close import"`
(matching `:4005` / `:4241` / `:4324`, and now honest — it no longer skips anything); everything
else unchanged.

**`disabled={finishingSetup}` deliberately RETAINED** even though the other three steps don't
carry it. It is not cosmetic: the schedule step is the only one with an in-flight `setup_step`
write (from a Route Continue). Without the guard an operator could open the confirm mid-write and
hit "Finish later", running `resetImportState` (`importStep='idle'`) while the in-flight
`finishSetup`'s `finally { setImportStep('done') }` (`:2362-2364`) fires straight after — the done
screen would re-appear over a dismissed wizard. Rationale recorded in the block comment.

No change needed to the confirm modal: it is `z-[60]` (`:4629`) against the schedule modal's
`z-50` (`:4434`), so it already layers correctly, and `resetImportState` already resets the whole
schedule-step state block (`:1796-1800`).

### 3b. `:4425-4437` — the step's block comment

Rewritten to state that the ✕ is a **dismissal** routing to the shared confirm and writing
nothing; that it previously called `skipSchedule` and why that was wrong; that Route C's
"Continue →" writing `setup_step='done'` is **distinct by design** (a deliberate completion, not a
dismissal — the two must stay apart); and the `disabled={finishingSetup}` rationale above.

### 3c. `:2366-2369` — `skipSchedule`'s comment

Its caller list no longer claims the header ✕. Now records that all three remaining callers are
deliberate **completions**, with an explicit instruction not to re-point a dismiss control at it.
The function body is unchanged (`:2371`).

### Net behaviour

| | Before | After |
|---|---|---|
| ✕ on schedule step | `skipSchedule` → `setup_step='done'` immediately | opens "Finish setting up later?" |
| on confirm accept | n/a (no confirm) | `resetImportState` — no DB write |
| `setup_step` after ✕ | `'done'` | unchanged |
| `inSetup` after ✕ | false — chrome gone, no way back | true — chrome survives, reopen via Import menu |
| Route C "Continue →" | `setup_step='done'` | **`setup_step='done'` — unchanged, as instructed** |

---

## 4. AUDIT — every exit control in the setup-mode wizard

Requested: does anything else write `setup_step`, or leave the wizard without a confirm.
`update_truck` with `setup_step` has exactly **one** client-side call site — `finishSetup`
(`:2354-2368`, the write at `:2357`) — so every writer below routes through it.

| # | Control | Location | Writes `setup_step`? | Confirm? | Verdict |
|---|---|---|---|---|---|
| 1 | ✕ — review/menu step | `:4005` | No | **Yes** | correct |
| 2 | ✕ — allergens step | `:4241` | No | **Yes** | correct |
| 3 | ✕ — kitchen step | `:4324` | No | **Yes** | correct |
| 4 | ✕ — schedule step | `:4440` | **No** (was: yes) | **Yes** (was: none) | **FIXED IN THIS DIFF** |
| 5 | Route A "Continue →" (post-verify) | `:4511` | Yes → `finishSetup` | No | correct — completion |
| 6 | Route B "Save N dates" | `:4530` → `schedSaveExtracted` `:2454-2476` | Yes, after N × `upsert_event` | No | correct — completion |
| 7 | Route B zero-events branch | `:2456` | Yes → `skipSchedule` | No | correct — they clicked Save; nothing to save |
| 8 | Route C "Continue →" | `:4570` | Yes → `skipSchedule` | No | correct — deliberate, left as built |
| 9 | "Go to my dashboard →" (done screen) | `:4617` | No | No | correct — `setup_step` already `'done'`; terminal screen |
| 10 | **"Cancel" — upload step** | `:3976` | No | **NO** | ⚠️ see below |

**Answer: this was the only `setup_step` inconsistency. One lesser inconsistency remains — #10.**

### ⚠️ #10 — the upload step's "Cancel" leaves without a confirm

```tsx
<Btn label="Cancel" colour="slate" onClick={() => { setImportStep('idle'); setImportFile(null); setImportText('') }} />
```

It bypasses `showDiscardConfirm` **and** bypasses `resetImportState`, clearing only three fields
inline. Two observations:

- **Severity is low and it is arguably correct.** On the upload step there is nothing to lose but
  an unsubmitted file/paste, and "Cancel" is an explicitly-worded abandon, not an ambiguous ✕ — a
  confirm there would be friction. It writes nothing, so no operator is stranded.
- **But it is a partial reset, not `resetImportState`.** Any state carried in from a prior session
  in the same mount (e.g. `importResult`, `categoryPrep`, `pendingDisplayMode`) survives. Today
  that is unreachable in practice because the upload step is the entry point, so those are already
  empty — it is a latent trap, not a live bug: if a future flow ever routes back to 'upload' with
  state loaded, Cancel would leave it dangling.

**Not changed** — outside this brief, and changing it is a judgement call on whether "Cancel"
should confirm. Flagging it as the one remaining exit that leaves the wizard without a confirm.

---

## 5. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx eslint app/manage/[token]/page.tsx` in changed ranges (2360-2380, 4425-4450) | **0 problems** (the file's ~356 pre-existing problems are all elsewhere) |
| `skipSchedule` call sites after the change | 3 — `:2456`, `:4511`, `:4570` — all completions; the ✕ is gone from the list |

No `next dev`, no `next build`, no `cap sync`, no gradle, no xcodebuild.

---

## 6. Anything I could not do / left deliberately

- **The confirm's copy is menu-specific and now shows on the schedule step.** It reads *"You can
  add your menu any time: sign in and tap Import menu…"* (`:4634`) — but by the schedule step the
  menu is already committed (commit-first), so the reassurance names the wrong artefact. I did
  **not** touch it: you said use the same confirm and don't invent a third behaviour, and
  conditionalising the copy per step would be exactly that. Worth a follow-up if the wording
  bothers you — a step-aware second sentence would fix it without changing any behaviour.
- **After ✕ → "Finish later" on the schedule step, reopening "Import menu" starts a fresh import
  rather than returning to the schedule step.** That is inherited from `resetImportState`
  (`setImportStep('idle')`), identical to the other three steps. The menu is already saved so
  nothing is lost, and the Schedule tab is the proper home for dates anyway — consistent with why
  Route C's manual form was removed. Called out because "pick up right here" in the confirm copy
  slightly over-promises on this step.
- **Item #10 above** — reported, not changed.
- **Runtime not exercised.** Per the standing dev-server rule I did not start `next dev`, so this
  is verified by type-check, lint and inspection only. Worth a manual pass on your running
  localhost:3000: schedule step → ✕ → "Keep going" returns; ✕ → "Finish later" closes the wizard
  with the setup chrome still present and `setup_step` unchanged; Route C → "Continue →" still
  finishes to `'done'`.
