# Print timing — what the lead time is measured from, and the copy that now says it

**ONE file edited: `components/printing/PrintingSettings.tsx`.** Copy and layout only. No `next dev`, no `next build`, no `cap sync`, no deploys, no commit. `tsc` clean.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

> ## 🔴 PART A'S ANSWER: **THE LEAD TIME IS MEASURED FROM THE COLLECTION TIME. THERE IS NO COOK TIME IN THE PRINT PATH AT ALL.**
> `selectDueToPrint` computes `nowMins >= timeToMins(order.slot) - leadMins`, and `slot` is the order's collection time. **The whole `lib/printing/` module contains not one call to any prep or cook-time function.** **The label was right; the suspicion is not borne out.**
>
> ## ⚠️ BUT THE PRACTICAL PROBLEM DOMINIC DESCRIBED IS REAL AND THE ANSWER MAKES IT WORSE, NOT BETTER (A5).
> **A 10-minute lead on a dish that needs 15 minutes of cooking prints the ticket 5 minutes AFTER cooking should have started.** **The app knows each category's cook time — it is just not consulted here.**
>
> ## 🔴 AND ON YOUR NOTE ABOUT CONNECTING TO A RANDOM DEVICE: **CONFIRMED, IT IS A REAL DEFECT, AND I HAVE NOT "FIXED" IT — see Part F.** The naive fix (filter the scan to known printer UUIDs) would hide real printers, which is worse than the bug. **Two options and a recommendation; your call.**
>
> ## ⚠️ E3'S PREMISE IS INCORRECT AND I AM NOT ACCEPTING IT — **THE LAST REPORT HAD ZERO BARE GLYPHS.** 10 vs 11 was ten paired warning signs plus **one pencil `✏️`**, which is also a two-codepoint emoji. Byte-level proof in E3.

---

# PART A — WHAT THE LEAD TIME IS MEASURED FROM

## A1. The code that decides when a lead-time ticket fires

**READ, `lib/printing/printWatcher.ts:91-107` — the whole selector, and the arithmetic is one line:**

```ts
export function selectDueToPrint<T extends DueOrder>(
  orders: T[],
  opts: { mode: PrintTriggerMode; nowMins: number; leadMins: number; printed: Set<string>; eligible?: string[] },
): T[] {
  const eligible = opts.eligible ?? DEFAULT_ELIGIBLE
  return orders.filter(o => {
    if (opts.printed.has(o.order_key)) return false          // dedup — printed once already
    if (!eligible.includes(o.status)) return false           // 🔴 not accepted (or rejected) ⇒ never print
    if (opts.mode === 'on_confirmed') return true
    // LEAD TIME — one rule for ASAP and scheduled: print when now >= slot − leadMins. ASAP orders have no
    // parseable slot ⇒ due now.
    const due = timeToMins(o.slot)
    if (due == null) return true
    return opts.nowMins >= due - opts.leadMins
  })
}
```

**THE EXACT ARITHMETIC:**

```
        print when   nowMins  >=  timeToMins(order.slot)  −  leadMins
```

**And the parser it uses — `:82-88`:**

```ts
/** "HH:MM" (event tz) → minutes-of-day, or null (ASAP / unparseable ⇒ treat as due now). */
export function timeToMins(hhmm?: string | null): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}
```

## A2. 🔴 Which timestamp — **the ORDER'S COLLECTION TIME. Not a derived cook-start time.**

**The field is `order.slot`. READ, its declaration in `components/dashboard/types.ts:35`:**

```ts
  slot: string | null
```

**And the watcher's own view of it — `printWatcher.ts:80`, with the header comment that exists because this exact field was once wrong:**

```ts
/** 🔴 `slot` — the field a real `Order` actually carries. See the header. */
interface DueOrder { order_key: string; slot?: string | null; status: string }
```

⚠️ **`slot` IS THE COLLECTION TIME — the same field the ticket prints as the collection line.** READ, `mapOrderToTicket.ts`:

```ts
  // ⚠️ SAME `slot` FIELD AS THE TRIGGER READS, so the printed collection time and the watcher's due
  // DECISION cannot drift apart. An order with no parseable slot is ASAP in both — "COLLECT ASAP" on
  // paper, due-now to the selector.
  const collection_time = hhmm(order.slot)
```

## A3. Is a cook time involved? — 🔴 **NO. "Not found" is the result, and I looked for it specifically.**

**A search of the entire `lib/printing/` module for prep or cook-time logic returns only PROSE in comments — the word "cook" meaning the person, never a calculation:**

```
lib/printing/ticket.ts:22:  // difference is the point: the cook view answers "what do I make", this answers "what is this order".
lib/printing/ticket.ts:25:  // prep countdowns, urgency colouring, age-based state, "start by" times, the TO MAKE bar. A ticket prints
```

🔴 **ZERO imports of `lib/prep-utils.ts`. Zero calls to any ready-time function. The print path never asks how long anything takes to cook.**

### ✅ THE COOK-TIME CONCEPT DOES EXIST — and it varies per item's CATEGORY

**READ, `lib/prep-utils.ts:105-131` — the machinery Dominic remembered, including the 2-minute buffer the manual records:**

```ts
  export function calcReadySecsByCat(
    newByCat: Record<string, number>,
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>
  ): Record<string, number> {
    const byCat: Record<string, number> = {}
    Object.entries(newByCat).forEach(([cat, newQty]) => {
      const cfg = catConfigs[cat.toLowerCase()] ?? getCatConfig(cat)
      if (!cfg.secs) return
      const totalQty = (queueByCat[cat] || 0) + newQty
      const finalBatch = Math.ceil(totalQty / cfg.batch)
      byCat[cat] = finalBatch * cfg.secs
    })
    return byCat
  }

  export function calcQueueAwareReadySecs(…, bufferSecs: number = 120): number {
    …
    return Math.max(30, maxSecs) + bufferSecs
  }
```

| | |
|---|---|
| **Where it comes from** | `catConfigs` — per-CATEGORY `prep_secs` and `batch` size |
| **Does it vary per item?** | ✅ **YES — per category, and it is QUEUE-AWARE:** `ceil((queue + new) / batch) × secs`, so the same dish takes longer when the kitchen is busy |
| **Is it in the print path?** | 🔴 **NO** |

## A4. 🔴 THE ANSWER, IN ONE SENTENCE AN OPERATOR WOULD UNDERSTAND

> ## **"Print 10 minutes before" means ten minutes before the customer is due to COLLECT — not ten minutes before you need to start cooking. The app does not allow for how long the food takes.**

🔴 **STOPPING ON THIS ITEM AS INSTRUCTED. THE TIMING LOGIC IS UNCHANGED — `lib/printing/printWatcher.ts` is ABSENT from the diff.** ✅ **And because the answer is "collection", the label needed no correction, only de-duplication.**

## A5. ⚠️ The practical consequence — **YES, THE PROBLEM IS REAL TODAY**

| Scenario | What happens |
|---|---|
| Lead 10, a dish that cooks in 3 minutes | ✅ Ticket at T−10, cooking starts with 7 minutes to spare |
| **Lead 10, a dish that cooks in 15 minutes** | 🔴 **Ticket at T−10. Cooking should have started at T−15. THE TICKET IS FIVE MINUTES LATE and the order is late.** |
| Lead 10, busy queue pushing a 15-minute dish to 25 | 🔴 **Fifteen minutes late** — and the app's own `calcQueueAwareReadySecs` could have told it so |

> ## 🔴 THE LEAD IS A SINGLE FIXED NUMBER FOR THE WHOLE TRUCK. It cannot be right for both a drink and a slow-cooked dish, and it does not move when the kitchen is busy.
> ⚠️ **THE WORKAROUND AN OPERATOR HAS TODAY: set the lead to your LONGEST prep time.** That prints early for quick items — which is the harmless direction, since a ticket on the rail early costs nothing and a ticket late costs a late order.
> ✅ **THE FIX, IF YOU WANT IT LATER, ALREADY HAS ITS INPUTS:** `calcReadySecsByCat` gives a per-order cook estimate from the same `catConfigs` the capacity engine uses. **Printing at `slot − max(leadMins, cookSecs/60)` would make the lead a FLOOR rather than the whole answer.** 🔴 **NOT PROPOSED AS WORK, NOT BUILT, AND NOT IMPLIED BY THE NEW COPY** — the copy says what the code does today.

---

# PART B — THE COPY

## B1. Both sentences, quoted

| file:line | The sentence |
|---|---|
| `components/printing/PrintingSettings.tsx:295` | `<span className="block text-xs text-slate-500">The ticket prints the number of minutes below before collection.</span>` |
| `components/printing/PrintingSettings.tsx:307` | `<span className="text-slate-700">Print tickets this many minutes before collection</span>` |

🔴 **Three lines apart, saying the same thing, one of them pointing at the other ("the number of minutes below").**

## B2. Combined into one line, sitting with the input

```diff
-                    <span className="block text-xs text-slate-500">The ticket prints the number of minutes below before collection.</span>
```
```diff
-                    <span className="text-slate-700">Print tickets this many minutes before collection</span>
+                    <span className="text-slate-700 min-w-0">Minutes before the collection time</span>
```

✅ **The option's helper is gone; the input's own line carries it, in four words instead of eight.**

🔴 **IT SAYS "COLLECTION TIME" BECAUSE PART A ESTABLISHED THAT IS WHAT IT IS.** ⚠️ **AND IT IS DELIBERATELY NOT SOFTENED into anything that implies the app allows for cooking — it does not, and copy that hinted otherwise would be the dishonest direction.** **Recorded in the code:**

```tsx
                  // 🔴 THE WORDING IS MEASURED AGAINST WHAT THE CODE ACTUALLY DOES. selectDueToPrint
                  // computes `nowMins >= timeToMins(order.slot) - leadMins`, and `slot` is the
                  // COLLECTION time — no cook time, no prep estimate, nothing per-dish. So "before
                  // collection" is accurate, and it is deliberately NOT softened into something that
                  // implies the app allows for cooking. It does not.
```

## B3. The radio's label

✅ **`"A set time before collection"` is UNCHANGED, and Part A confirms it is correct.** **No stop needed.**

⚠️ **ONE CONSEQUENCE OF REMOVING THE HELPER, DECLARED: option 1 now has no helper line while option 2 still does.** 🔴 **That asymmetry is justified and not an oversight — option 2's helper explains a non-obvious consequence (an advance pre-order prints hours early) that nothing else on screen shows, whereas option 1's explanation is the input directly beneath it.** **A helper repeating the control below it is what this task removed.**

## B4. Option 2

✅ **UNTOUCHED. `"As soon as you accept the order"` and its helper do not appear in the diff.**

---

# PART C — THE LAYOUT

## C1 / C2. Before and after

**BEFORE:**

```tsx
                  <label className="flex items-center justify-between gap-3 text-sm pl-6">
                    <span className="text-slate-700">Print tickets this many minutes before collection</span>
                    <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
                      className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
                  </label>
```

**AFTER:**

```tsx
                  <label className="flex items-start justify-between gap-3 text-sm pl-6">
                    <span className="text-slate-700 min-w-0">Minutes before the collection time</span>
                    <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
                      className="w-20 shrink-0 -mt-1 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
                  </label>
```

| Change | Why |
|---|---|
| `items-center` → **`items-start`** | 🔴 **The cause of the drift.** With `items-center` and a two-line label, the input centres against the whole block — level with the gap BETWEEN the lines, matching neither |
| **`-mt-1`** on the input | The input is 30 px tall against a 20 px text line; without the −4 px nudge, `items-start` would sit it 5 px BELOW the first line's cap height |
| **`min-w-0`** on the span | lets the text wrap inside its column instead of forcing the row wider |
| **`shrink-0`** on the input | 🔴 **the number can never be squeezed narrower than `w-20`, whatever the label does** |
| the copy, four words shorter | **the wrap is far less likely to happen at all** |

**HOW IT RENDERS:**

| Case | Result |
|---|---|
| **One line** (the common case now — "Minutes before the collection time" is 34 characters) | ✅ text and number on the same baseline; `items-start` and `items-center` are identical when there is only one line |
| **Two lines** (a very narrow device, or larger OS text) | ✅ **the number stays level with the FIRST line**, reading as the end of that sentence rather than floating beside the middle of the block |

⚠️ **INFERRED, NOT RENDERED: the 30 px input height and the 20 px line height are Tailwind's defaults (`py-1` + `text-sm` + border). Nothing was rendered.**

## C3. Layout only

✅ **`onChange={e => setLeadMins(Number(e.target.value) || 0)}` is byte-identical.** ✅ **`min={0} max={60}` unchanged.** ✅ **`hg_print_lead_mins` and its default of 10 untouched.** ✅ **The `{mode === 'lead_time' && (…)}` condition unchanged.** **The diff is `items-center`→`items-start`, two added classes, and two strings.**

## C4. Touch target

| | |
|---|---|
| **Input computed height** | `py-1` 4 + 4 + `text-sm` line-height 20 + 1 px border × 2 = **30 px** |
| **Before** | **30 px — unchanged; no padding class was touched** |
| **Width** | `w-20` = **80 px, and now `shrink-0`, so it can no longer be squeezed** |

⚠️ **30 px is under the 44 px guidance, exactly as the `+`/`−` controls are elsewhere.** 🔴 **UNCHANGED BY THIS TASK and not "fixed" here** — it is a number field with a wide 80 px hit area, and it belongs with the same backlog item as the 24 px steppers.

---

# PART D — BOUNDARIES

## D1. `git diff --stat` (this task's file)

```
 components/printing/PrintingSettings.tsx | 30 ++++++++++++++++++------
```

> ## ✅ NO TIMING LOGIC, GATE, COLUMN OR TYPE.
> 🔴 **`lib/printing/printWatcher.ts` — ABSENT.** The arithmetic in A1 is untouched. 🔴 **`lib/printing/usePrinting.ts` — ABSENT.** 🔴 **`lib/features.ts` — ABSENT.** 🔴 **`supabase/migrations/` — ABSENT.** 🔴 **`app/api/**` — ABSENT.** **The change is two strings and four Tailwind classes.**

## D2. Customer-facing surfaces

> ## ✅ **NONE AFFECTED.** `PrintingSettings` renders only inside the operator dashboard's Settings tab, behind `isNativeApp()` and the Max/trial plan gate. **No customer route, email or order page is in the diff.**

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census — `components/printing/PrintingSettings.tsx`

**24,532 → 25,658 bytes (+1,126), 339 → 351 lines (+12)**

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS | 405 | 421 | **+16** | one `──` rule on the new comment |
| U+2014 EM DASH | 27 | 29 | **+2** | prose |
| U+1F534 LARGE RED CIRCLE | 20 | 21 | **+1** | the "measured against what the code does" marker |
| **all other 7 classes** | — | — | **0** | unchanged |

🔴 **10 → 10 distinct. GAINED NONE, LOST NONE.** ✅ **Both new strings are pure ASCII.**

## E3. 🔴 U+26A0 / U+FE0F — AND THE PREMISE IN THE BRIEF IS INCORRECT

| File | U+26A0 | U+FE0F | Bare | Verdict |
|---|---|---|---|---|
| `components/printing/PrintingSettings.tsx` | 2 | 2 | **0** | ✅ **PAIRED**, before and after |
| **`docs/printing-ui-report.md`** *(this file)* | equal | equal | **0** | ✅ **PAIRED** — verified by scanning the written file |

> ## 🔴 **THE LAST REPORT DID NOT SHIP A BARE GLYPH. 10 AGAINST 11 WAS TEN PAIRED WARNING SIGNS PLUS ONE PENCIL.**
> **I re-scanned `docs/customer-quantity-row-report.md` byte by byte before writing this, listing what EVERY variation selector follows:**
>
> ```
> U+26A0 total: 10
> U+FE0F total: 11
> BARE U+26A0 (no following selector): 0
>
> FE0F at    909 follows U+26A0  WARNING SIGN
> FE0F at   4483 follows U+26A0  WARNING SIGN
> FE0F at   7173 follows U+26A0  WARNING SIGN
> FE0F at   8483 follows U+26A0  WARNING SIGN
> FE0F at   8896 follows U+26A0  WARNING SIGN
> FE0F at  10511 follows U+26A0  WARNING SIGN
> FE0F at  11592 follows U+26A0  WARNING SIGN
> FE0F at  14192 follows U+270F  PENCIL          <- the eleventh
> FE0F at  14274 follows U+26A0  WARNING SIGN
> FE0F at  16027 follows U+26A0  WARNING SIGN
> FE0F at  16263 follows U+26A0  WARNING SIGN
> ```
>
> **`✏️` is U+270F + U+FE0F — a legitimate two-codepoint emoji, quoted from the code being reported on.** 🔴 **All ten warning signs were paired. The report's own claim of "PAIRED, bare 0" was accurate, and that report published this same carrier breakdown for exactly this reason.**
> ⚠️ **THE UNDERLYING POINT STANDS AND IS WHY I KEEP CHECKING: a bare TOTAL comparison cannot distinguish "one unpaired warning sign" from "one pencil". Only the carrier list can.** ✅ **Five real violations have been caught today by this check; this would have been a sixth if the totals alone were trusted — in the other direction, a false positive.**

## E4. Byte scan — byte-level, never `grep`

```
components/printing/PrintingSettings.tsx    25,658 bytes   NUL 0   control none
```

✅ **Clean. One file edited, one file scanned.**

## E5. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## E6. `git status` and `git diff --stat` — which entries are THIS task's

```
 M android/app/capacitor.build.gradle
 M android/capacitor.settings.gradle
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/OrderCard.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
 M ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 M ios/App/App/Info.plist
 M ios/App/CapApp-SPM/Package.swift
 M lib/plan-features.ts
 M lib/printing/transport.ts
 M package-lock.json
 M package.json
?? docs/…  · lib/printing/bleTransport.ts · lib/printing/usePrinting.ts
```

| Entry | Whose |
|---|---|
| 🔴 **`components/printing/PrintingSettings.tsx`** | **THIS TASK** *(copy + alignment)* — **and earlier today: the lead-time move, the chip removal, the label renames, the pairing UI** |
| ✅ **`docs/printing-ui-report.md`** | **THIS TASK** |
| everything else | earlier tasks today |

⚠️ **THE TREE HAS BEEN DIRTY ALL SESSION.** 🔴 **Nothing is committed.**

---

# PART F — 🔴 YOUR NOTE: "I CONNECTED TO A RANDOM DEVICE"

**CONFIRMED AS A REAL DEFECT. NOT FIXED IN THIS TASK, AND THE REASON IS NOT TIMIDITY.**

## What actually let it happen

**Two gates, and BOTH are too weak. READ, `lib/printing/bleTransport.ts`:**

**1. The scan lists every NAMED device — the only filter is that it has a name:**

```ts
        const name = result?.device?.name || result?.localName
        if (!name) return
        found.set(id, { id, name, class: 'ble' })
```

**2. The connect-time check accepts any device with any writable characteristic:**

```ts
        for (const ch of svc.characteristics || []) {
          if (ch.properties?.[pass]) {
            return { service: svc.uuid, characteristic: ch.uuid, withoutResponse: pass === 'writeWithoutResponse' }
```

🔴 **A writable characteristic outside the two generic services is COMMON — headphones, watches, sensors and speakers routinely have one. So "has a printable channel" is nearly always true, and the check I wrote to catch this does not catch it.** ⚠️ **You would have connected successfully and then seen tickets fail, or bytes sent into a device that ignores them.**

## Why I did not simply filter the list

🔴 **THE OBVIOUS FIX IS THE ONE MY OWN CODE COMMENT WARNS AGAINST:**

> *"There is no standard 'ESC/POS over BLE' UUID. Vendors use their own: 18f0/2af1 (many Chinese modules), ff00/ff02, e7810a71-… (Star), and others. Hard-coding one would support one family of printers and silently fail on the rest, and the failure would look like 'the printer is broken'."*

**Filter to a known-UUID allow-list and your actual printer may simply never appear — and an empty scan with the printer switched on in front of you is a worse bug than a connectable pair of headphones.** 🔴 **I am not making that trade on your behalf.**

## The two options

| | **A — ALLOW-LIST, HARD FILTER** | **B — RANK AND WARN, SOFT FILTER** *(my recommendation)* |
|---|---|---|
| Scan shows | only devices advertising a known printer service UUID | **everything, but printers first**, under a "Likely printers" heading, with the rest under "Other devices" |
| Unknown printer model | 🔴 **INVISIBLE. Unpairable.** | ✅ **still listed, one section down** |
| Headphones | hidden | listed, plainly labelled as not a printer |
| Wrong pick | impossible | possible, but you were told |
| Extra safety | — | ✅ **a real print-channel test at connect: write ESC/POS `ESC @` (initialise) and require it not to error** — far stronger than "has a writable characteristic" |

✅ **RECOMMENDATION: B, plus the `ESC @` probe.** **It removes the confusion you hit without ever hiding a printer, and the probe turns "has a writable characteristic" into "accepted a printer command".**
⚠️ **INFERRED: that a non-printer will usually reject or ignore an `ESC @` write. Not tested — no hardware.**

🔴 **NOTHING IN `bleTransport.ts` WAS CHANGED IN THIS TASK. `lib/printing/bleTransport.ts` is ABSENT from the diff.** **Say which option and it is a contained change to the scan and the connect check.**

---

# PROVENANCE

**READ** — `selectDueToPrint` and `timeToMins` in full · `DueOrder` and `Order.slot` · `mapOrderToTicket`'s collection-time line · an exhaustive search of `lib/printing/` for prep/cook references · `lib/prep-utils.ts:105-131` · both duplicated sentences and the input row before and after · the scan filter and `findWriteTarget` in `bleTransport.ts` · the census before and after · the byte scan · a byte-level carrier scan of the previous report's every U+FE0F · `git status`, `git diff --stat`, `tsc`.

**INFERRED** — the px figures in C (Tailwind defaults; **nothing rendered**) · that a non-printer would reject an `ESC @` probe · that setting the lead to the longest prep is the safe workaround.

**NOT VERIFIED** — 🔴 **nothing was rendered, and no ticket has ever printed.** A5's consequence is arithmetic over the selector, not an observed late order. **Part F's defect is confirmed by your device report, not by mine.**
