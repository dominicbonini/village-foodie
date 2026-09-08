# The last three clipboard buttons — one component, and a failure path that can be run

**5 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED. ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

## 🔴 CONFIRMED: NOTHING HERE CHANGES WHAT `events.pizzeriagusto.co.uk` SERVES

🔎 This build touched **three** files plus two new ones: `app/admin/page.tsx`, `components/dashboard/DemoWelcome.tsx`, `components/dashboard/CustomDomainSetup.tsx` (two `className` attributes), and the new `components/dashboard/CopyButton.tsx` / `lib/clipboard.ts`. **None of them is imported by `app/domain/page.tsx` or `proxy.ts`**, neither of which was modified. The custom-domain page renders `Shell`, `TruckIdentity`, `PoweredBy` and `EmbedSchedule`, and reaches no dashboard component. **A customer on that address cannot reach a copy button at all.**

---

# 🔴 HARNESS FRESHNESS — RUN FIRST

```
lib/clipboard.ts   ✅ IDENTICAL b7b78f7328a715a2…   (sha256 vs source; copied verbatim, imports nothing)
marker: `export function attemptCopy` = 1   — this file did not exist before today
```

⚠️ **One marker I wrote was wrong, and I am reporting it rather than quietly correcting it.** I first asserted `const clipboard = typeof navigator` should be **0** in the copy ("old inline handler gone"). It came back **1**. **The code was right and my assertion was wrong** — that line now lives *inside* `attemptCopy`, which is where it belongs. The correct marker is *"`writeText` inside `onClick`"*, which is **0**:
```
const onClick = () => { attemptCopy(value).then(arm) }
```
Said plainly because a marker that goes red and gets waved through is the same failure as a proof that goes green and proves nothing.

---

# TASK 1 — THE INVENTORY, BEFORE EDITING

**Patterns searched** (all of them, so an empty result is evidence rather than an assumption): `clipboard.writeText` · `navigator.clipboard` · `execCommand` · `ClipboardItem` · `clipboard-write` / `permissions.query` · `CopyButton` · the literal `Copied`.

🧪 `execCommand` → **NONE**. `ClipboardItem` → **NONE**. `clipboard-write` → **NONE**. So there is no second, older clipboard mechanism hiding anywhere.

## Ten call sites, before this build

| # | Site | Copies | Signal before | Shared component? |
|---|---|---|---|---|
| 1 | `app/admin/page.tsx:576` (`copyToken`) | dashboard token | 🔴 **`Copied` set UNCONDITIONALLY** — promise discarded | ✗ bespoke |
| 2 | `app/admin/page.tsx:1630` | temporary password | 🔴 **NOTHING AT ALL** — no state, no label change, no toast | ✗ bespoke |
| 3 | `components/dashboard/DemoWelcome.tsx:78` | demo order link | 🔴 **`Copied` set UNCONDITIONALLY** | ✗ bespoke |
| 4 | `components/dashboard/CopyButton.tsx:76` | anything | ✅ label from the resolved promise, red failure state, aria-live | ✅ **is** the component |
| 5 | `app/dashboard/[token]/page.tsx:1686` | order link | `✓ Copied` 2s, inside `try` | ✗ bespoke |
| 6 | `app/manage/[token]/page.tsx:8945` | order link | `✓ Copied` 2s, inside `try` | ✗ bespoke |
| 7 | `app/manage/[token]/page.tsx:9381` (`copyKdsLink`) | KDS link | toast, **no `try`** — a rejection is an unhandled promise | ✗ bespoke |
| 8 | `app/venues/[slug]/VenueClient.tsx:66` | venue share text | `alert()`, inside `try` | ✗ share control |
| 9 | `app/trucks/[slug]/TruckClient.tsx:93` | profile share URL | `alert()`, inside `try` | ✗ share control |
| 10 | `components/EventListCard.tsx:81` | event share text | `alert()`, inside `try` | ✗ share control |

**Using the shared `CopyButton` before this build: 2 render sites**, both in `CustomDomainSetup` (the record tables).

🔴 **AN ELEVENTH SURFACE THE EARLIER AUDIT MISSED, FOUND BY THE `Copied` GREP:** `components/dashboard/UserMenu.tsx:164` renders `{copiedOrderLink ? '✓ Copied' : 'Order link'}` and **has no `writeText` of its own** — it is driven by the dashboard's handler (#5) through a prop. **A `writeText` grep alone would never have shown it.** It is a *surface*, not a call site, which is why the count is 10 sites across 11 surfaces.

---

# TASK 2 — THE UNCONDITIONAL "COPIED", FIXED FIRST ✅

## Site 1 — `app/admin/page.tsx` (the dashboard token)

**Before:**
```js
const copyToken = (token: string) => {
  navigator.clipboard.writeText(token)   // ← promise DISCARDED
  setTokenCopied(true)                   // ← unconditional
  setTimeout(() => setTokenCopied(false), 2000)
}
```
**After:** the handler is **deleted**, along with `tokenCopied` and its two unrelated `setTokenCopied(false)` resets. The markup is:
```jsx
<CopyButton value={newTruckResult.truck.dashboard_token} describedAs="dashboard token" className="shrink-0 px-3 py-2.5 text-sm" />
```

## Site 3 — `components/dashboard/DemoWelcome.tsx` (the demo order link)

**Before:**
```js
const copy = () => {
  if (!orderUrl) return
  navigator.clipboard.writeText(orderUrl)   // ← promise DISCARDED
  setCopied(true)                            // ← unconditional
  setTimeout(() => setCopied(false), 2000)
}
```
**After:** handler and `copied` state deleted; the null guard is preserved as a **render** condition rather than a silent no-op:
```jsx
{orderUrl && (
  <CopyButton value={orderUrl} label="Copy link" describedAs="order link" tone="primary" className="mt-2 w-full py-2 text-xs font-bold" />
)}
```

🔴 **The cost was specific at each.** The admin token is a credential someone is about to paste into a message; the demo link exists for *"the visitor who wants it on a **different device** — the one case neither tapping nor scanning covers"*, so a false "Copied" is discovered on the other device with nothing left on this one to copy from.

## 🧪 PROOF R — the failure path, EXECUTED

🔴 **What this proof would look like if it proved nothing, and how each was ruled out — stated before the result, because two earlier proofs reported green while proving nothing:**

| Failure mode | How it was ruled out |
|---|---|
| **(a)** it tests a **stale** module (the pre-edit-harness failure) | sha256 against source **plus** a marker for `attemptCopy`, **a symbol that did not exist before today** — a hash alone would have passed on a file I never edited |
| **(b)** only the **success** path runs and reports green (the Proof-Q failure — it `break`ed before the case it existed for) | the **failure cases run FIRST**, are **counted**, and the harness **`process.exit(1)`s if fewer than three ran** |
| **(c)** the fake clipboard is never wired, so every case takes the *"no API"* branch and returns `failed` **for the wrong reason** — green and meaningless | the success case must return `copied` **and** `writeText` must have been invoked **exactly once**; the harness exits non-zero otherwise |

```
=== PROOF R: attemptCopy — FAILURE CASES FIRST ===
  reject  (the API refuses)          → failed  (writeText called 1×)  ✅
  absent  (insecure origin)          → failed  (writeText called 0×)  ✅
  throws  (permissions policy)       → failed  (writeText called 0×)  ✅
  resolve (the ordinary case)        → copied  (writeText called 1×)  ✅

  guard (b) failure cases exercised : 3 (must be ≥3)
  guard (c) success reached the fake : ✅ writeText called exactly once
  mismatches                        : 0
```

🟢 **All three failure modes resolve to `failed`, which is what drives the red `Copy failed` label.** The old code returned "Copied" for every one of them.

⚠️ **To make that executable I extracted the write into `lib/clipboard.ts`** — a `.ts` file with no React import, so Node can run it. It was four lines inside a click handler, meaning **the only way to check the failure branch was to read it** — the same class of claim as the bug being fixed.

## The Safari rule — 🧪 executed, and it still holds after the edits

```
writeText invoked before attemptCopy returned? ✅ YES — the user gesture is still live
attemptCopy threw? ✅ NO — resolves to "failed", so no caller has an error path to forget
```

🔎 **Re-audited all remaining sites after the edits. No `await` precedes any write, anywhere.** The three share controls each show a second `await` nearby — that is `await navigator.share(...)` in the **sibling `if` branch**, mutually exclusive with the `else` that contains the write. `copyKdsLink`'s neighbour is the *previous function*'s `await`. **Not re-litigated; confirmed and moved on, as instructed.**

---

# TASK 3 — THE ADMIN BUTTON ✅

**The surrounding markup allowed it**, so it was moved onto the shared component rather than reimplemented:
```jsx
<CopyButton value={createdPassword ?? ''} describedAs="temporary password" className="shrink-0 px-3 py-2.5 text-sm" />
```
It gets, from the shared component: label → **`Copied ✓`** for 2000 ms then revert · **width reserved** (all three labels in one CSS grid cell, inactive ones `invisible`) · **never disabled** · `role="status"` + `aria-live="polite"` naming the field · **never colour alone** (the word and tick carry it) · a **red `Copy failed`** state.

🔴 **It mattered more here than anywhere else on that screen.** The label above it reads *"Temporary password — copy this now"*. The password is shown once and is not recoverable from the page afterwards; someone who believes they copied it and did not has to create the operator again.

## 🔴 ADMIN SURFACE — CODE-VERIFIED ONLY, AND I CANNOT EXERCISE IT

**No agent session as an admin has ever been obtainable in this project** — the manual's standing limit. So **both admin buttons are source-read and `tsc`-clean and nothing more.** I have not seen either render, clicked neither, and observed no label change. **You confirm them on screen.** The *behaviour* they inherit is proven by Proof R against the shared module; **the wiring on that page is not.**

---

# TASK 4 — ONE COMPONENT. WHAT REMAINS, AND WHY

**Now using the shared `CopyButton`: 5 render sites** — 2 in `CustomDomainSetup`, 2 in `app/admin/page.tsx`, 1 in `DemoWelcome`.

## Remaining bespoke handlers, and the reason each was kept

| Site | Why it was NOT migrated |
|---|---|
| `VenueClient.tsx:66`, `TruckClient.tsx:93`, `EventListCard.tsx:81` | 🔴 **They are not copy buttons.** Each tries the **Web Share API** first (`navigator.share` + `canShare`) and falls back to the clipboard only when sharing is unavailable. A `CopyButton` has no share path, so migrating them would **remove the native share sheet on mobile** — a behaviour change to three customer-facing surfaces, well outside "the three sites your audit left out". |
| `app/dashboard/[token]/page.tsx:1686` + `components/dashboard/UserMenu.tsx:164` | **One handler drives two buttons across two files**, one of them by prop. Migrating means changing that contract. Out of scope, and it is a correct implementation today (awaited inside a `try`). |
| `app/manage/[token]/page.tsx:8945` (order link) | Correct today (awaited inside a `try`). ⚠️ **And that file already carries two workstreams** — touching it again worsens the `git add -p` problem for no defect. |
| `app/manage/[token]/page.tsx:9381` (`copyKdsLink`) | ⚠️ **This one has a real, if small, defect: no `try`**, so a rejection is an unhandled promise and the operator sees nothing. **Same file, same two-workstream reason.** 🔴 **Reported, not fixed — it is the one remaining site with a genuine gap.** |

🟢 **So: three share controls that are a different control, three correct-but-bespoke order-link buttons, and one (`copyKdsLink`) with a real gap.** Every one is named with its reason, none was quietly left behind.

⚠️ **The component gained a `tone` prop** (`outline` | `primary`) to absorb DemoWelcome's full-width solid button. Without it, migrating would have meant passing conflicting Tailwind colour classes through `className` and relying on stylesheet order — *"works until it doesn't"*, which is the shape the duplication was already causing. **Failure is red in both tones; that is not a per-caller decision.** `shrink-0` moved out of the base classes (a caller cannot un-set a class) and the two record-row sites now pass it explicitly.

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| **Harness freshness (sha256 + marker for a symbol new today)** | 🧪 **Executed FIRST** | ✅ (one of my own markers was mis-specified — reported above) |
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| **Failure path: reject / absent / throws → `failed`** | 🧪 **Executed (R)**, failure cases first, counted, non-zero exit if under three | ✅ |
| **Guard (c): the fake was really wired** | 🧪 **Executed (R)** | ✅ `writeText` called exactly once on success |
| **`writeText` called synchronously (Safari)** | 🧪 **Executed** | ✅ |
| **`attemptCopy` never rejects** | 🧪 **Executed** | ✅ |
| **No `await` before any write, post-edit, all sites** | 🔎 Source-read, each handler printed | ✅ still holds |
| Full inventory, 8 patterns | 🧪 Executed greps | 10 sites / 11 surfaces |
| Bespoke handlers removed at the three sites | 🧪 Executed grep | ✅ `tokenCopied`, `copyToken`, `copy` all gone |
| `app/domain/page.tsx` / `proxy.ts` untouched | 🧪 Executed | ✅ |
| **Anything rendered in a browser** | ❌ **NOT DONE** | see below |
| **The two admin buttons exercised** | ❌ **IMPOSSIBLE** | no admin session obtainable |

⚠️ **The rendered markup — the reserved width, the aria-live region, the grid cell — is SOURCE-READ, not executed.** `jsdom` is not installed and Node cannot parse `.tsx`, so I could not render the component even with `react-dom/server`. **I attempted it and it failed on the file extension; I am reporting that rather than presenting the source as verified.** Step 3 of the click-through is what proves it.

## Safari-on-macOS click-through — localhost:3000

⚠️ **I rendered none of this.**

**Demo welcome — 🟢 you can run this one**
1. Open a **demo** dashboard so the welcome modal appears with the QR panel. **See:** a full-width **orange** "Copy link" button. **Wrong if** it is a small outlined button — the `tone="primary"` did not take.
2. **Press it.** **See:** it turns **green** and reads **`Copied ✓`** for ~2s, then reverts to orange "Copy link". 🔴 **Wrong if the button changes width or the panel jogs.**
3. **Press it again immediately.** **See:** it works again. **Wrong if** disabled.
4. **Paste.** **See:** the order URL.
5. 🔴 **THE FORCED FAILURE — the case that matters.** In the console run
   `Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true})`
   then press Copy. **See:** the button turns **red** and reads **`Copy failed`**, reverting after 2s. 🔴 **Wrong if it says `Copied ✓`** — that is exactly the bug this build removes, and it is the only step that can catch a regression of it.
6. **VoiceOver (⌘F5)**, press Copy. **See:** *"order link copied"* announced without focus moving; on the forced failure, *"Could not copy the order link. Select the writing and copy it yourself."*

**Custom-domain record rows — 🟢 you can run these** *(regression check on the previous build)*
7. Manage → Settings → the domain card → the record step. Press **Copy** on the value row. **See:** `Copied ✓`, no resize, works twice, correct dot behaviour per provider.

**🔴 ADMIN — I CANNOT RUN THESE. YOU MUST.**
8. **Admin → create a truck.** **See:** beside the dashboard token, a **Copy** button. Press it. **See:** `Copied ✓` green for ~2s, no resize, works twice. **Wrong if** the old plain `Copied` text appears with no colour change.
9. 🔴 **Admin → create an operator → the "Temporary password — copy this now" box.** **See:** a **Copy** button that **now signals** — `Copied ✓`. 🔴 **Before this build it signalled nothing at all**, so if it still looks inert, the change did not land.
10. **Forced failure on either admin button**, same console line as step 5. **See:** red `Copy failed`.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

## Files this build touched

```
lib/clipboard.ts                            NEW (untracked)  the executable write seam
components/dashboard/CopyButton.tsx         NEW (untracked)  + `tone`, uses lib/clipboard
app/admin/page.tsx                          +56 / -…         BOTH admin buttons migrated
components/dashboard/DemoWelcome.tsx        +32 / -…         migrated
components/dashboard/CustomDomainSetup.tsx  (2 attrs)        `className="shrink-0"` passed explicitly
```

## 🟢 `app/admin/page.tsx` does NOT join the two-workstream set

🧪 **Verified by reading its whole diff:** every added and removed line is clipboard-related — the deleted `copyToken` / `tokenCopied`, the two `<CopyButton>` blocks, the import, and their comments. **It was untouched before this build**, so it carries this workstream and nothing else.

## 🔴 THE FULL SET NEEDING `git add -p` — STILL THREE, UNCHANGED

| File | Carries |
|---|---|
| `lib/custom-domain/copy.ts` | custom-domain **+** the pre-existing uncommitted work |
| `app/manage/[token]/page.tsx` | custom-domain **+** the entire WhatsApp S1–S5 |
| `app/api/manage/route.ts` | custom-domain **+** WhatsApp S1–S5 |

🟢 **This build added none.** `app/admin/page.tsx`, `DemoWelcome.tsx`, `CopyButton.tsx`, `lib/clipboard.ts` and `CustomDomainSetup.tsx` each carry one workstream.

## Unchanged, verified this run

| Group | Diff | Status |
|---|---|---|
| **Pre-existing five** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/…/project.pbxproj`, `proxy.ts`, `vercel.json` | **5 files, 46+/53−** | 🟢 **byte-for-byte unchanged** |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 unchanged |
| **WhatsApp libs** — `lib/whatsapp/*` | 1 file, 113+ | 🟢 unchanged |
| `app/manage/[token]/page.tsx` | 247+/54− | 🟢 **unchanged by this build** |
| `app/api/manage/route.ts` | 127+/3− | 🟢 **unchanged by this build** |
| `app/domain/page.tsx` | — | 🟢 not modified |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged — I did not edit the manual |

⚠️ Note `components/EventListCard.tsx` sits in the pre-existing five **and** holds clipboard call site #10 — **deliberately not touched**, which is why that group is still byte-for-byte identical.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The two admin buttons have never been exercised, and cannot be by me.** No agent session as an admin has ever been obtainable in this project. **Code-verified only — you confirm them on screen.** Steps 8–10.
- 🔴 **Nothing was rendered in a browser at all.** The reserved width, the tick, the colours, the aria-live region and the `tone="primary"` styling are **source-read**. I tried to render with `react-dom/server` and **Node could not load the `.tsx`**; `jsdom` is not installed. Reported rather than glossed.
- ⚠️ **Proof R exercises `lib/clipboard.ts`, not the React component.** The component's own state machine — `arm()`, the 2-second revert, the timer cleanup on unmount — is **source-read**. What is executed is the decision the label depends on.
- ⚠️ **The `tone="primary"` classes have not been seen against DemoWelcome's orange panel.** They match the classes the old button carried, but colour on colour is a thing to look at, not reason about.
- ⚠️ **`copyKdsLink` still has no `try`** — a real, small, unfixed gap, left because its file already carries two workstreams.
- ⚠️ **The three share controls were not re-verified against a real `navigator.share`** — unchanged by this build, and their fallback path was re-read.

# FLAGS

- 🟢 **CONFIRMED: nothing changes what `events.pizzeriagusto.co.uk` serves.** No file this build touched is reachable from that page.
- 🔴 **Both unconditional "Copied" sites now derive their label from the resolved write**, proven across three distinct failure modes.
- 🔴 **The admin temporary-password button signalled nothing and now signals** — but is **unverifiable by me**.
- ⚠️ **One of my own freshness markers was mis-specified and went red.** The code was right; the assertion was wrong. Reported.
- ⚠️ **The rendered markup is source-read only** — no DOM available. Step 5 (forced failure) is the click-through step that matters most.
- ⚠️ **`app/manage/[token]/page.tsx:9381` `copyKdsLink` remains without a `try`.** Named, not fixed.
- 🟢 **The `git add -p` set is still three files.** This build added none.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. The live page is untouched.*
