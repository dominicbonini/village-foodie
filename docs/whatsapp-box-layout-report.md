# The WhatsApp box: header, auto-replies, billing, footer

**16 September 2026.** Five files changed. No SQL, no migration, no API behaviour change, no network
call. tsc clean; lint rule-for-rule identical to HEAD. Nothing staged or committed.

---

## 0. TREE STATE — I STOPPED AND ASKED

```
$ git status --porcelain=v1
 M app/manage/[token]/page.tsx
?? docs/auto-replies-channel-boxes-report.md
$ git rev-parse HEAD          a05ecc98b2cfe3294d56473b37cfbbbd72ca8698
$ git rev-parse origin/main   a05ecc98b2cfe3294d56473b37cfbbbd72ca8698
```

HEAD equals origin/main, but **the tree was not clean**: it carried the previous workstream's unstaged
output, including the very file this brief edits. The rule says stop, so I did, and Dominic confirmed
*"Proceed — build on it."*

🔴 **CONSEQUENCE, STATED SO THE DIFF IS NOT A SURPRISE: `app/manage/[token]/page.tsx` now contains BOTH
workstreams' changes** — the three-channel-boxes restructure and this layout work. `git diff` cannot
separate them; the channel-boxes report describes the first half.

---

## STEP 0 — THE APPROVED HARNESS FIX

`scripts/whatsapp-connection-view-harness.cjs`, one assertion.

**Before:**
```js
      t(`setup control offered: ${state} / ${tag}`, v.showSetupControl === true)
```
**After** (with the reason recorded at the site):
```js
      t(`setup control offered: ${state} / ${tag}`, v.showSetupControl === (state !== 'ready'))
```

**Result: ✅ all 87 passed.** 🟢 **No other failures** — the four `ready` cases were the whole of it.

---

## 1. WHAT I READ BEFORE EDITING

### 1a. 🔴 `payment_method_present` is never set to anything but null

**Two writers, both writing `null`**, both in `app/api/manage/whatsapp-signup/route.ts` — `:279` and
`:314`. The second carries its own reason:

> `payment_method_present: null,   // 🔴 NULL = UNREAD. Never write` `false` `for "we did not ask".`

**No Graph call and no Embedded Signup field populates it.** There is no code path that produces `true`
or `false`. *Positive control, same search:* `display_phone_number` **is** written from a Graph lookup at
`:444`, so the search finds writers where they exist.

🔴 **So `paymentStatus` is `'unknown'` for every connection today**, and will stay so until something
asks Meta. That is why the three-state model matters: collapsing null into "missing" would put a claim
about the operator's Meta account on screen that nobody has ever checked.

### 1b. Existing patterns

| Pattern | Exists? | What I used |
|---|---|---|
| **Expander** | 🟢 yes — `<details>/<summary>` at `:7435` and `:8022`, `list-none` with a `group-open:rotate-90` ▶ | reused the `:7435` shape |
| **Small grey section label** | 🟢 yes — `text-xs font-semibold text-slate-500 uppercase tracking-wide` (`:944`, `:955`) | reused verbatim |
| **Thin divider** | 🟢 yes — `border-t border-slate-100` (27 uses) | reused |
| **Pill** | 🟢 yes — `Badge` in `components/manage/primitives` | its shape reused (`text-[10px] font-bold px-2 py-0.5 rounded-full`) |
| **Pill + link beside it** | 🟡 no such combo | composed `Badge` shape + an `<a>` in a `flex flex-wrap` row |
| **Progress bar** | 🔴 **NONE** | built one: a `h-1.5 rounded-full bg-slate-100` track with a `bg-green-500` fill (amber at 100%), `role="progressbar"` + `aria-valuemin/max/now`. 🧪 The 7 `progress` hits in the file are all prose; `role="progressbar"` was **0**. |

### 1c. `payment_method_present` did not reach the page

`readWhatsAppConnection` selected it — `CONNECTION_FIELDS` already listed it — and used it for the state
derivation, then **dropped it**. Smallest read-only addition, and the one I made: carry
`paymentMethodPresent` onto `WhatsAppConnectionView` from the already-narrowed `input`. **No query
changed**, no new column, no extra round trip.

### 1d. Icons

🧪 **No icon set.** `lucide|@tabler|react-icons|heroicons` returns **0** in the page and nothing in
`package.json`. **The icons in the brief are dropped rather than a library added**, as instructed.

**Nothing read contradicted the brief.**

---

## 2. THE VIEW MODEL

`whatsAppRowView` gains `paymentMethodPresent` as an input and returns seven new fields:

| Field | Rule |
|---|---|
| `subtitle` | `"{number} · {name}"`, or whichever exists, or **null**. Gated on `connected`, so stale values on a disconnected row say nothing. Whitespace-only counts as absent. |
| `showRequiresAccountHelper` | `!connected` — it is a prerequisite, not a description |
| `paymentStatus` | `true→'added'`, `false→'missing'`, `null/undefined→'unknown'`; **null when there is no connection** |
| `showAboveAllowanceWarning` | `connected && allowance > 0 && limit > allowance && paymentStatus !== 'added'` |
| `aboveAllowanceWarningVariant` | matches `paymentStatus` when the warning shows, else null |
| `showBillingPaymentRow` | `connected` |
| `showBillingSection` | always true in the live branch |

**One field removed: `showAboveAllowanceNote`**, superseded by `showAboveAllowanceWarning` (which adds the
payment condition). ⚠️ **`facts` and `showBareConnected` are KEPT** even though the new markup renders
`subtitle` instead — the brief names both explicitly under "keep all existing fields", and the
connection-view harness asserts on them.

---

## 3. THE LAYOUT

**A. Header** — title, then `subtitle` when present, then the Requires-account helper only when
`showRequiresAccountHelper`. Right: the Connected pill or the Set up / Reconnect control.
🔴 **Disconnect is no longer in the header** — it moved to the footer. The old "Connected number:" /
"Business name:" lines are gone; `subtitle` replaces them.

**B. Auto-replies** (only when `showMonthlyLimit`) — divider, grey label, then one wrapping row:
"Monthly limit", the select, and the usage block (bar + "{N} of {LIMIT} used · resets {1 Month}").
⚠️ The usage block is `basis-full sm:basis-auto sm:flex-1 min-w-0`, so on a phone it takes its own line
rather than forcing a horizontal scroll. Then the two short lines. The three old paragraphs are gone.

**C. Billing** (when `showBillingSection`) — divider, grey label, the payment row (three pill variants,
with a link on two of them), the summary line, the `<details>` expander holding the **byte-identical**
approved billing text, and the amber warning when `showAboveAllowanceWarning`. The old grey billing box
is gone; its text is the expander's content.

**D. Footer** (only when `showDisconnect`) — divider, right-aligned red "Disconnect WhatsApp". The
confirmation is unchanged in wording and still opens inside the box.

**E.** Notices, the expiring-soon banner and the disconnect confirmation stay inside the box.

**F. Not connected:** header (title, helper, Set up, instruction) then Billing with the summary and
expander only — no payment row, no auto-replies section, no warning, no footer. 🧪 Proved by evaluation
in the harness, not by reading.

⚠️ **Unchanged, as required:** the else branch (Gusto's content), the Instagram and Messenger boxes, the
`!isNativeApp()` wrapper.

---

## 4. PROOFS

### 4a. All three harnesses

| Harness | Result |
|---|---|
| `whatsapp-settings-row-harness.cjs` | ✅ **all 127 passed** |
| `whatsapp-connection-view-harness.cjs` | ✅ **all 87 passed** (after Step 0 only) |
| `whatsapp-setup-machine-harness.cjs` | ✅ **all 30 passed** |

### 4b/4c. New cases, and the six variants that must fail first

```
── STEP 4c VARIANTS: each MUST report FAILURE ──
  ✓ FAILED as required  V1 the warning shows when paymentStatus is "added"
  ✓ FAILED as required  V2 the warning is hidden when unknown at 2000
  ✓ FAILED as required  V3 null payment_method_present maps to "missing"
  ✓ FAILED as required  V4 the warning shows at exactly the allowance
  ✓ FAILED as required  V5 the subtitle invents a value when both are null
  ✓ FAILED as required  V6 the Requires-account helper shows on a ready connection
```

Added cases: `paymentStatus` for true / false / null / undefined / no-connection; the warning across
**five limits × three payment states** (15 cases) plus its variant each time; no warning at exactly the
allowance for all three payment states; no warning at 5000 when disconnected; `subtitle` with both / one
/ neither / whitespace / disconnected-with-stored-values; the helper across all six states; and both
billing flags connected and not.

⚠️ **Two harness edits beyond new cases, both consequences of the field removal, both stated:** five old
assertions named `showAboveAllowanceNote`, which no longer exists — **renamed** to
`showAboveAllowanceWarning`. That is a rename, not a loosened expectation: those cases pass no payment
value, so `paymentStatus` is `'unknown'` and every expected answer is unchanged.

### 4d. What each proof would look like if it proved nothing

| Proof | If it proved nothing | How that was ruled out |
|---|---|---|
| **`paymentStatus` three-valued** | Testing only true and false — the two values nothing ever writes. | `null` and `undefined` are both tested, and V3 collapses them into `'missing'` and is caught. |
| **The warning** | Testing one limit, or one payment state. | The full 5 × 3 grid; V1 (added→shows), V2 (unknown at 2000→hidden) and V4 (at exactly 1000→shows) each break one cell and are caught. |
| **Nothing invented** | Testing only the both-present subtitle, where there is nothing to invent. | The neither case asserts `=== null`; V5 substitutes "Not available" and is caught. |
| **The helper** | Asserting it shows when disconnected — true of a field that is always true. | It is asserted **false** for all five connected states; V6 forces it true and is caught. |
| **Billing visibility** | Asserting `showBillingSection` is true once. | Asserted across all six states, and `showBillingPaymentRow` asserted **false** when disconnected. |
| **No decision in the markup** | Listing the conditions I wrote. | Taken from the **file** by extracting every `{view.…` and ternary in the rebuilt range — 4f. |

### 4e. Copy

**Removed — all 0 occurrences:** the old "Auto-replies answer up to 3 messages…" paragraph, "Auto-replies
pause when you reach your limit…", the "Staying at 1,000 or below…" clause, and the old amber "Above
1,000, Meta charges…" note. *Positive control:* `How Meta charges` returns **1** in the same run.

**Each new string exactly once:** "Up to {3} replies per customer in 24 hours…", "Replies pause at your
limit. We'll email you at 80% and 100%.", "Meta bills your WhatsApp account for replies, not HatchGrab…",
"How Meta charges", "Payment method added", "No payment method added", "Add in WhatsApp Manager",
"Check in WhatsApp Manager", "Monthly limit".

⚠️ Two counts explained rather than waved through: **"Not checked" = 2** — the pill at `:10253` and a
**comment** at `:10232`. **"Disconnect WhatsApp" = 2** — the footer link at `:10310` and the unchanged
confirmation title at `:10342`. (My first search for it printed 0; the pattern was wrong, not the text
absent — recorded because a 0 that is really a broken search is the failure mode this project keeps
hitting.)

🟢 **The expander's billing text is byte-identical** to the approved wording — it was moved, not retyped:
"Meta charges for WhatsApp replies, not HatchGrab." appears once, with the same following paragraph and
the same "See Meta's pricing" link.

### 4f. Every visibility condition and its field

| Condition | Field |
|---|---|
| `view.subtitle` (×2 — render + guard) | `subtitle` |
| `view.showRequiresAccountHelper` | same |
| `view.showConnectedLabel` | same |
| `view.showSetupControl` → `showButton` | same |
| `view.showPopupInstruction` → `showInstruction` | same |
| `view.showMonthlyLimit` | same |
| `view.showBillingSection` | same |
| `view.showBillingPaymentRow` | same |
| `view.paymentStatus === 'added' \| 'missing' \| 'unknown'` | `paymentStatus` |
| `view.showAboveAllowanceWarning` | same |
| `view.aboveAllowanceWarningVariant === 'missing'` | same |
| `view.showDisconnect` | same |
| `whatsappUsage &&` (×3) | data presence from the API, not a decision |
| `usedPct` / `usedPct >= 100` | arithmetic on two numbers the API returned — a width and a colour, not a visibility decision |

🟢 **Every `{…&&}` in the rebuilt range reads a `view` field.** The only non-`view` expressions are the
usage null-check and the percentage.

### 4g. TypeScript and lint

- **tsc clean.**
- **Lint**, the three changed source files, same eslint and config, HEAD in a detached worktree:
  **283 errors / 75 warnings on both sides, every rule count identical.**

### 4h. What I cannot prove, and your checklist

**Cannot prove:** appearance. That the bar reads as a bar, that the sections look like peers, that the
pill and link sit well together, that nothing overflows, that the expander marker rotates. Classes are
not a rendering. Also: that Meta's free allowance is still 1,000, and that any of this matches WhatsApp
Manager's own wording.

| # | Do | Expect |
|---|---|---|
| 1 | **Test truck, limit 1,000 — desktop** | Header: "WhatsApp", subtitle "{number} · {name}", green **Connected**. No Requires-account line. Auto-replies: Monthly limit + select + bar + "N of 1,000 used · resets 1 October", then the two short lines. Billing: **Payment method — grey "Not checked" + "Check in WhatsApp Manager"**, the summary line, a collapsed **How Meta charges**. Footer: red **Disconnect WhatsApp**. **No amber warning.** |
| 2 | **Same, limit 2,000** | Everything as above **plus** the amber line: *"…If you haven't added a payment method, Meta will stop all replies once those are used."* — the **unknown** wording, because nothing writes that column. |
| 3 | **Open "How Meta charges"** | It expands to the original billing text with **See Meta's pricing**; the ▶ rotates. Close it again. |
| 4 | **Both links** | "Check in WhatsApp Manager" and "See Meta's pricing" open in a **new tab**. |
| 5 | **Narrow (~375px), connected** | The Set up/Connected group wraps **below** the title; the select and the usage block **stack**; no horizontal scrollbar anywhere in the box. |
| 6 | **After Disconnect** | Header: title, **Requires a WhatsApp Business account.**, **Set up** + the pop-up instruction. **No** auto-replies section, **no** payment row, **no** warning, **no** footer. Billing keeps the summary + expander. |
| 7 | **After Disconnect — narrow** | Set up wraps below the title; the instruction reads as a full-width paragraph. |
| 8 | **Gusto** | Unchanged: title, helper, disabled number box. Instagram and Messenger boxes below, unchanged. |
| 9 | **Gusto — narrow** | The disabled input is full width and truncates. |

---

## 5. FINISH

```
$ git status --porcelain=v1
 M app/manage/[token]/page.tsx
 M lib/whatsapp/connection-read.ts
 M lib/whatsapp/connection-view.ts
 M scripts/whatsapp-connection-view-harness.cjs
 M scripts/whatsapp-settings-row-harness.cjs
?? docs/auto-replies-channel-boxes-report.md

$ git diff --stat
 app/manage/[token]/page.tsx                  | 455 ++++++++++++++-------------
 lib/whatsapp/connection-read.ts              |   8 +
 lib/whatsapp/connection-view.ts              |  51 ++-
 scripts/whatsapp-connection-view-harness.cjs |   7 +-
 scripts/whatsapp-settings-row-harness.cjs    | 105 ++++++-
 5 files changed, 406 insertions(+), 220 deletions(-)
```

| File | Reason |
|---|---|
| `lib/whatsapp/connection-view.ts` | seven new display fields; `showAboveAllowanceNote` removed |
| `lib/whatsapp/connection-read.ts` | carries `paymentMethodPresent` to the page — read-only, no query change |
| `app/manage/[token]/page.tsx` | the WhatsApp box rebuilt as header / auto-replies / billing / footer, with the progress bar and the expander |
| `scripts/whatsapp-connection-view-harness.cjs` | Step 0's approved assertion correction |
| `scripts/whatsapp-settings-row-harness.cjs` | new-field cases, six Step-4c variants, and the field rename |

⚠️ `app/manage/[token]/page.tsx` also carries the **previous** workstream's channel-boxes change — see §0.
`docs/auto-replies-channel-boxes-report.md` remains untracked from that workstream.

**Not changed:** the webhook, the manage API's write/disconnect behaviour, `reply-cap.ts`, `usage.ts`,
`disconnect-plan.ts`, `inbound-route.ts`, `setup-preview.ts`, `setup-machine.ts`, `lib/whatsapp-live.ts`,
the `!isNativeApp()` wrapper, the Instagram and Messenger boxes, and the else-branch content.

**No SQL appears in this report.**
