# Kitchen ticket printing — diagnosis, one layout move, three label options

**Scope done exactly as written.** Part A diagnosed and **stopped** — `lib/plan-features.ts` untouched. Part B moved one control, layout only. Part C **proposes and stops** — no rename applied.
**One file edited: `components/printing/PrintingSettings.tsx`.** No `next dev`, no `next build`, no `cap sync`, no deploys, no commit.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

> ## 🔴 THE ANSWER TO PART A, UP FRONT: **NO. AN OPERATOR CANNOT PRINT A KITCHEN TICKET TODAY.**
> **`createStubTransport` has ZERO call sites. `usePrintWatcher` has ZERO call sites.** The only thing in the repository that ever calls `mapOrderToTicket` or `renderTicket` is **`app/dev/ticket-preview/page.tsx`, a dev page that `notFound()`s in production.** 🔴 **There is no code path from an order to a printer at all — not a broken one, an absent one.** **The `max: 'coming_soon'` change made on 14 August is correct.**
> ⚠️ **BUT THE GATE STILL GRANTS THE CARD ON MAX — the N6 divergence is CONFIRMED, not refuted. See A6.**

---

# PART A — DOES KITCHEN TICKET PRINTING ACTUALLY PRINT?

## A1. The full path, traced. 🔴 It breaks at the FIRST step.

**READ. Every component below exists and is substantial — and nothing joins them to an order.**

| Step | Where | State |
|---|---|---|
| **1. Trigger** | `lib/printing/printWatcher.ts:168` — `export function usePrintWatcher<T extends DueOrder>(args: {…})` | 🔴 **ZERO CALL SITES** |
| **2. Mapper** | `lib/printing/mapOrderToTicket.ts:67` — `export function mapOrderToTicket(input: MapTicketInput): TicketOrder` | ⚠️ **ONE caller: `app/dev/ticket-preview/page.tsx:185`** |
| **3. Renderer** | `lib/printing/ticket.ts:458` — `export function renderTicket(order, config, type = 'combined'): Uint8Array` | ⚠️ **ONE caller: `app/dev/ticket-preview/page.tsx:191`** |
| **4. Transport** | `lib/printing/transport.ts:41` — `createStubTransport` | 🔴 **ZERO CALL SITES** |
| **5. Driver** | — | 🔴 **DOES NOT EXIST** |

**The exhaustive grep across `app/`, `components/`, `lib/` for `createStubTransport|usePrintWatcher|PrinterTransport|sendBytes|renderTicket|mapOrderToTicket` returns, apart from the definitions and comments:**

```
app/dev/ticket-preview/page.tsx:16:import { renderTicket, type TicketOrder, … } from '@/lib/printing/ticket'
app/dev/ticket-preview/page.tsx:18:import { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'
app/dev/ticket-preview/page.tsx:185:    const ticket = mapOrderToTicket({
app/dev/ticket-preview/page.tsx:191:  const bytes = useMemo(() => renderTicket(built.ticket, config), [built, config])
```

🔴 **THAT IS THE COMPLETE LIST OF CONSUMERS. One dev preview page, and the manual records that `/dev` is gated by `app/dev/layout.tsx`, which `notFound()`s in production.** ✅ **So even the software-only path is unreachable to an operator.**

⚠️ **The dashboard renders the SETTINGS CARD and nothing else. READ, `app/dashboard/[token]/page.tsx:3989`:**

```tsx
{!isDemo&&truck&&<PrintingSettings plan={truck.plan} featureOverrides={truck.feature_overrides} trialExpiresAt={truck.trial_expires_at} mode={truck.print_trigger_mode==='on_confirmed'?'on_confirmed':'lead_time'} onChangeMode={savePrintTriggerMode}/>}
```

🔴 **`PrintingSettings` is the ONLY printing thing the dashboard mounts, and it imports no watcher and no transport** — its imports are `Preferences`, `isNativeApp`, `canAccess`, `Toggle`, and two TYPE-only imports (`PaperWidth`, `PrintTriggerMode`). **A settings card with nothing behind it.**

## A2. 🔴 THE TRANSPORT — quoted in full. It is a stub, and it is the ONLY one.

**READ, `lib/printing/transport.ts:38-48`, verbatim and complete:**

```ts
/** Phase-A stub transport: no hardware. Sends bytes to a sink (the preview/log) and reports connected/ok, so
 *  the shared pipeline (watcher → render → sendBytes → print_jobs) runs end-to-end in software. Replaced by
 *  the MFi/BLE backend in Phase B — nothing above the seam changes. */
export function createStubTransport(sink: (bytes: Uint8Array) => void): PrinterTransport {
  return {
    async scan() { return [] },
    async connect() { return { ok: true } },
    async sendBytes(bytes) { sink(bytes); return { ok: true } },
    async status() { return { connected: true } },
  }
}
```

**Answering the question in the terms it was asked:**

| Behaviour | This transport |
|---|---|
| Implemented? | 🔴 **NO** |
| Stubs? | 🔴 **YES — it is named `createStubTransport`** |
| No-ops? | 🔴 **`scan()` returns `[]` unconditionally. It can never discover a printer.** |
| Logs? | **`sendBytes` hands the bytes to a caller-supplied `sink`. It does not transmit them.** |
| Throws? | **No.** |
| Returns early? | **No — it returns SUCCESS. `{ ok: true }`, always.** |

> ## 🔴 THE WHOLE FILE IS 48 LINES AND THERE IS NO OTHER IMPLEMENTATION IN IT.
> `PrinterClass = 'mfi' | 'ble'` is declared at `:15` and **neither backend exists**. The file's own header says so: *"Phase A (now, no hardware): use createStubTransport() → routes the same bytes to a sink (preview/log)"*.
> ⚠️ **AND THE DANGEROUS PART IS THAT IT LIES UPWARD.** `sendBytes` **always** returns `ok: true` and `status()` **hard-codes** `connected: true`. **If this stub were ever wired in, every ticket would be recorded as PRINTED SUCCESSFULLY while no paper moved.** ✅ **It is not wired in — which is the only reason that is not a live defect.**

## A3. Bluetooth or network pairing UI — 🔴 **NOT FOUND**

**"Not found" is the result, and the code says so in its own words. READ, `components/printing/PrintingSettings.tsx:111-119`:**

```tsx
          {/* ⚠️ THE HONEST CONNECTION STATE. No "Connect a printer" button, because there is nothing behind
              it: transport.ts has no pairing, no scan and no failure path. Saying so is the whole change. */}
          {!printer && (
            <p className="text-xs text-slate-500 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
              <strong className="text-amber-800">No printer connected.</strong> Bluetooth printer pairing
              isn&apos;t available yet — you can set your preferences here now and they&apos;ll apply as soon
              as it arrives.
            </p>
          )}
```

✅ **THE UI ALREADY TELLS THE TRUTH TO THE OPERATOR'S FACE: *"Bluetooth printer pairing isn't available yet."*** 🔴 **There is no scan, no picker, no "Connect" button.** The header at `:19-25` records that a stub pairing **used to** exist and was **removed** because it wrote the literal string `'Demo printer (Phase A stub)'` and then displayed a green **"● Connected"** badge.

**What remains is a `disconnect` and a dead `Change` row. READ, `:85` and `:138-147`:**

```tsx
  const disconnect = async () => { await Preferences.remove({ key: K.printer }); setPrinter(null) }
```
```tsx
              {printer && <div className="flex items-center justify-between text-sm gap-3">
                <span className="text-slate-700 truncate">Printer: <strong>{printer}</strong></span>
```

⚠️ **`printer` is read from `K.printer` and NOTHING IN THE REPOSITORY WRITES THAT KEY** — the only writer was the removed stub pairing. **So the "Printer: …", "● Connected" and "Disconnect" branches are unreachable today**, and the card instead shows an amber **"Coming soon"** chip at `:99`. ✅ **Correct by construction, and Phase B lights them up by writing a real name.**

## A4. Has printing ever been LIVE-VERIFIED? 🔴 **NO. The absence is documented, not merely unfound.**

**Both records say it explicitly, in the same words:**

- **`docs/reference-manual.md:10221`** (§42's OPEN list): 🔴 **`- 🔴 **NOTHING HAS BEEN SEEN ON PAPER.**`**
- **`docs/printing-report.md:187`**: **`- **Nothing has been seen on paper.**`**

⚠️ **AND ONE MANUAL LINE IS ITSELF STALE, WHICH IS WORTH FLAGGING BECAUSE IT DESCRIBES A UI THAT NO LONGER EXISTS. READ, `docs/reference-manual.md:3876`:**

> *"a 2nd device shows **"Connect"** (pair its own) … Two states: **NOT set up → "Connect" button**; **SET UP → printer name + Connected chip + ticket settings** …"*

🔴 **There is no "Connect" button. It was removed with the stub pairing.** ⚠️ **It also says the card lives in the "Menu & Stock" tab; `app/dashboard/[token]/page.tsx:3989` mounts it in the SETTINGS tab.** **Reported, not fixed — this task does not touch the manual.**

✅ **`grep` across `docs/*.md` for evidence of real hardware — "printed on paper", "real printer", "physical printer", a paired thermal printer — returns NOTHING but those two negative statements.**

## A5. What `PrintingSettings.tsx` persists — and 🔴 **nothing reads it at print time**

**READ, `:38`, the complete key list:**

```ts
const K = { printer: 'hg_printer_name', lead: 'hg_print_lead_mins', paper: 'hg_paper_width', enabled: 'hg_print_enabled' } as const
```

**READ, the four writers (`:78-85`):**

```ts
  const setEnabledPref = async (v: boolean) => { setEnabled(v); if (!v) setExpanded(false); await Preferences.set({ key: K.enabled, value: String(v) }) }
  const setLeadMins = async (n: number) => { setLead(n); await Preferences.set({ key: K.lead, value: String(n) }) }
  const setPaperWidth = async (w: PaperWidth) => { setPaper(w); await Preferences.set({ key: K.paper, value: String(w) }) }
  // 🔴 Straight to the truck column — no local copy, no Preferences write.
  const setTriggerMode = async (m: PrintTriggerMode) => { await onChangeMode(m) }
```

| Value | Where it goes | Is it a column? |
|---|---|---|
| `hg_print_enabled` | **Capacitor Preferences** (device-local) | ❌ no column |
| `hg_print_lead_mins` | **Preferences** | ❌ no column |
| `hg_paper_width` | **Preferences** | ❌ no column |
| `hg_printer_name` | **Preferences** — 🔴 **read only; nothing writes it** | ❌ no column |
| **trigger mode** | 🔴 **`trucks.print_trigger_mode`, a REAL COLUMN**, via `onChangeMode` → `/api/dashboard/action` `set_print_trigger_mode` (`app/api/dashboard/action/route.ts:2326-2330`) | ✅ **YES** |

> ## 🔴 DOES ANYTHING READ THEM AT PRINT TIME? **NO — BECAUSE THERE IS NO PRINT TIME.**
> **The exhaustive grep for all four keys returns exactly TWO files: `PrintingSettings.tsx` itself (writer + reader) and nothing else.** 🔴 **`usePrintWatcher` — the only thing that would consume `lead`, `paper` and `enabled` — is never mounted.** ✅ **`trucks.print_trigger_mode` IS read back, but only to re-render this same card** (`app/dashboard/[token]/page.tsx:3989`, `components/dashboard/types.ts:139`).
> **The settings are real, durable and completely inert.** ⚠️ **The card's own header says as much: *"you can set your preferences here now and they'll apply as soon as it arrives."***

## A6. 🔴 N6 CONFIRMED — the two sources DO disagree, right now

**SOURCE 1 — PRESENTATION. READ, `lib/plan-features.ts:161`:**

```ts
      { name: 'Kitchen ticket printing',  footnote: '5', detail: 'Print order tickets to a thermal printer in the kitchen.', starter: false, pro: false, max: 'coming_soon' },
```

**SOURCE 2 — ENFORCEMENT. READ, `lib/features.ts:53-58`:**

```ts
const MAX_FEATURES: Feature[] = [
  ...PRO_FEATURES,   // includes whatsapp_replies now
  'ticket_printing',
  'multi_device_kds',
  'cook_screen',
]
```

**and the gate itself, `lib/features.ts:98-129`, whose operative line is:**

```ts
  return PLAN_FEATURES[plan]?.has(feature) ?? false
```

> ## 🔴 CONFIRMED, NOT REFUTED. **THE MATRIX SAYS `coming_soon` WHILE THE GATE STILL SAYS YES.**
> **`canAccess('max', 'ticket_printing', …)` returns `TRUE`** — `ticket_printing` is in `MAX_FEATURES`, and `TRIAL_FEATURES = [...MAX_FEATURES]`, **so trial and tester trucks get it too.**
> **CONSEQUENCE, READ from `PrintingSettings.tsx:75-76`:**
> ```tsx
> const canPrint = canAccess(plan, 'ticket_printing', featureOverrides ?? {}, trialExpiresAt)
> if (!canPrint) return null
> ```
> 🔴 **A Max operator on an iPad still gets the full Kitchen-ticket-printing card**, with a working On/Off toggle, paper width, trigger mode and lead minutes — **while the Billing tab three tabs away now says "Coming soon".** ⚠️ **Those two are visible to the same person in the same session.**

✅ **AND THE 14 AUGUST CHANGE WAS DELIBERATE ABOUT THIS. READ, `lib/plan-features.ts:155-160`, the comment directly above the row:**

```
      // PRESENTATION (its own header at :229 says so) and nothing reads it to gate. The enforcement gate
      // is canAccess in lib/features.ts, which is UNTOUCHED — `ticket_printing` still resolves exactly as
      // it did, so no truck gains or loses access to anything.
      // ⚠️ It also cannot break findPlanParityViolations(): that guard only inspects cells that are hard
      // `true` (`row[tier] === true && !canAccess(...)`), so turning one into 'coming_soon' removes a
      // check rather than adding one. 'coming_soon' is explicitly a legitimate divergence (:231).
```

🔴 **AND THE LAST CLAUSE IS THE STING: the parity guard `findPlanParityViolations()` only inspects cells that are hard `true`.** ⚠️ **By moving the cell to `'coming_soon'`, the change REMOVED the automated check on this row. The divergence is now not only real but unwatched — the guard will never report it.** ✅ **The card is silent about plan (no MAX badge, no upgrade copy), so nothing is being SOLD twice — but the card's presence is itself the claim.**

## A7. 🔴 CAN AN OPERATOR PRINT A KITCHEN TICKET TODAY?

> # NO.
> **There is no transport, no pairing, no driver and no code path from an order to a printer — the watcher and the stub transport have zero call sites, and the only consumer of the renderer is a dev page that 404s in production.**

**STOPPING ON THIS ITEM AS INSTRUCTED. `lib/plan-features.ts` HAS NOT BEEN TOUCHED — `git diff --stat` at D1 proves it.** ⚠️ **The one thing I would put in front of your decision either way: whichever way the matrix goes, A6's gate divergence stays until `lib/features.ts` is addressed, and the parity guard no longer watches this row.**

---

# PART B — THE LEAD-TIME CONTROL NOW SITS UNDER ITS OWN OPTION

## B1. Both options and the minutes input, quoted BEFORE the change

**READ, `components/printing/PrintingSettings.tsx:148-181` as it stood:**

```tsx
              {/* ── WHEN TO PRINT ─────────────────────────────────────────────────────────────────────
                  🔴 THE ON-ACCEPT CONSEQUENCE IS STATED IN THE OPTION ITSELF, NOT IN A TOOLTIP. An operator
                  choosing this must see, at the moment of choosing, that an advance pre-order prints hours
                  before its collection time — that is the whole difference between the two modes and it is
                  not discoverable from the label alone. */}
              <div className="flex flex-col gap-2">
                <span className="text-sm text-slate-700">When to print</span>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="print-mode" checked={mode === 'lead_time'}
                    onChange={() => setTriggerMode('lead_time')} className="mt-1 accent-orange-500" />
                  <span className="text-sm">
                    <span className="text-slate-800 font-medium">Shortly before collection</span>
                    <span className="block text-xs text-slate-500">The ticket prints a few minutes before the order is due.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="print-mode" checked={mode === 'on_confirmed'}
                    onChange={() => setTriggerMode('on_confirmed')} className="mt-1 accent-orange-500" />
                  <span className="text-sm">
                    <span className="text-slate-800 font-medium">As soon as you accept the order</span>
                    <span className="block text-xs text-slate-500">
                      An advance pre-order prints when you accept it, which may be hours before the collection
                      time. Orders you have not accepted yet never print.
                    </span>
                  </span>
                </label>
              </div>
              {mode === 'lead_time' && (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700">Print tickets this many minutes before due</span>
                  <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
                    className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
                </label>
              )}
```

🔴 **THE PROBLEM, PRECISELY: the minutes input was OUTSIDE `<div className="flex flex-col gap-2">` — the radio group — so it rendered after BOTH radios, sitting directly beneath *"As soon as you accept the order"*, the one mode it has no effect on.**

## B2. The move

**The block is now INSIDE the radio group, immediately after option 1's `</label>` and before option 2's `<label>`:**

```tsx
                {/* ── THE MINUTES INPUT BELONGS TO THE OPTION ABOVE IT ──────────────────────────────
                    It used to sit BELOW the whole radio group, i.e. under the "as soon as you accept"
                    option, which is the one mode it has no effect on. Moved INSIDE the group, directly
                    under lead_time, and indented (`pl-6`) to the radio's text column so it reads as that
                    option's setting rather than a third setting. LAYOUT ONLY: the same `mode ===
                    'lead_time'` condition, the same K.lead Preferences write, the same 0-60 bounds and
                    the same default of 10. Nothing about WHAT it writes changed. */}
                {mode === 'lead_time' && (
                  <label className="flex items-center justify-between gap-3 text-sm pl-6">
                    <span className="text-slate-700">Print tickets this many minutes before due</span>
                    <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
                      className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
                  </label>
                )}
```

**`pl-6` = 1.5rem, which is the radio input's width plus the `gap-2`** — so the minutes row starts at the same left edge as *"Shortly before collection"* and its helper line, and reads as that option's setting rather than a third one.

## B3. Nothing about what it writes changed — line by line

| Property | Before | After |
|---|---|---|
| Condition | `{mode === 'lead_time' && (` | **identical** |
| Handler | `onChange={e => setLeadMins(Number(e.target.value) \|\| 0)}` | **identical** |
| What that writes | `Preferences.set({ key: K.lead, value: String(n) })` — `hg_print_lead_mins` | **untouched, not in the diff** |
| Bounds | `min={0} max={60}` | **identical** |
| Default | `parseInt(… ?? '10', 10)` at `:62` | **untouched, not in the diff** |
| Input classes | `w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right` | **identical** |
| Label text | `Print tickets this many minutes before due` | **identical** |
| Trigger logic | `setTriggerMode` / `onChangeMode` / `trucks.print_trigger_mode` | **untouched, not in the diff** |
| Wrapper classes | `flex items-center justify-between gap-3 text-sm` | **+ `pl-6`** — 🔴 **the ONLY substantive change, and it is a left indent** |

✅ **The diff is the block deleted from one place and inserted in another, plus my comment. `git diff` at D1 shows the removed and added JSX are character-identical apart from indentation and `pl-6`.**

## B4. Is it disabled or hidden when option 2 is selected?

> ## ✅ **HIDDEN — and it always was. THIS IS UNCHANGED BEHAVIOUR, NOT NEW BEHAVIOUR.**
> **The `{mode === 'lead_time' && (…)}` guard existed before this task and is carried across verbatim.** Selecting *"As soon as you accept the order"* unmounts the minutes row entirely; selecting the first option brings it back.
> ⚠️ **NOT disabled — HIDDEN.** The distinction matters: a disabled input would still occupy space under the wrong option. **No new behaviour was added, per the instruction.**

✅ **ONE SIDE EFFECT OF THE MOVE, STATED BECAUSE IT IS REAL AND IT IS AN IMPROVEMENT:** the row now appears and disappears **between the two radios** rather than below them, **so the option-2 helper text no longer shifts vertically when the mode changes.** ⚠️ **Option 2's block DOES still move down by the height of the minutes row when option 1 is selected — that is inherent to an inline reveal and was not addressed.**

---

# PART C — THREE ALTERNATIVES FOR OPTION 1. PROPOSED ONLY. NOTHING APPLIED.

## C1. Current labels and helper text, quoted

| Element | Text | Chars |
|---|---|---|
| Group heading | `When to print` | 13 |
| **Option 1 label** | **`Shortly before collection`** | **25** |
| Option 1 helper | `The ticket prints a few minutes before the order is due.` | 56 |
| **Option 2 label** (🔴 **NOT to be changed**) | **`As soon as you accept the order`** | **31** |
| Option 2 helper | `An advance pre-order prints when you accept it, which may be hours before the collection time. Orders you have not accepted yet never print.` | 138 |
| The minutes control below it | `Print tickets this many minutes before due` | 42 |
| Collapsed summary row (`:127`) | `Print **{lead} min** before due · {paper}mm paper` | 36 at lead=10 |

**House style, visible in the quotes above:** sentence case · **no terminal full stop on the bold label**, a full sentence in the helper below · the label answers **"when"** · the consequence lives in the helper, never in a tooltip (the comment at `:148-152` states this as a rule).

⚠️ **AND A VOCABULARY SPLIT WORTH SEEING BEFORE YOU CHOOSE: the option says "collection", while the control beneath it and the collapsed summary both say "due".** *"Shortly before **collection**"* → *"…minutes before **due**"* → *"Print 10 min before **due**"*. 🔴 **Whichever label you pick, picking "due" over "collection" would make all three agree.**

## C2. Three alternatives

**All three read directly above `Print tickets this many minutes before due`.**

| # | Label | Chars | Δ vs 25 | How it reads above the minutes control |
|---|---|---|---|---|
| **1** | **`A set time before collection`** | **28** | +3 | ✅ **Closest to the shape you named.** Promises a *set* time, and the number below is what sets it. ⚠️ Keeps "collection" while the control says "due", so the split above survives. **Shortest of the three, and 3 shorter than option 2 — so neither radio dominates.** |
| **2** | **`A set number of minutes before due`** | **34** | +9 | ✅ **Says "minutes" and "due" — the label and the control now use the same two words**, and the input reads as the completion of the sentence above it. ⚠️ Slightly mechanical, and **3 chars longer than option 2's label**, so option 1 becomes the longest line in the group. |
| **3** | **`At a time you choose before collection`** | **38** | +13 | ✅ **The most operator-voiced**, and it makes the control's existence obvious before you see it. ⚠️ **The longest — 38 chars against option 2's 31** — and on a narrow iPad column it is the likeliest of the three to wrap to two lines above its own helper. |

### ⚠️ THE HELPER TEXT WILL LOOK ODD UNDER 1 AND 3, AND THAT IS NOT PART OF THIS PROPOSAL

**The current helper is `The ticket prints a few minutes before the order is due.`** 🔴 **"A **set** time" or "a time you **choose**" directly above "a **few** minutes" reads as a contradiction — vague under precise.** **Matching helpers, if you want them (NOT applied, NOT counted as a proposal):**

| For | Helper that would fit |
|---|---|
| 1 or 3 | `The ticket prints the number of minutes below before the order is due.` |
| 2 | `The ticket prints that many minutes before the order is due.` |

## C3 / C4 / C5. Stopped, as instructed

✅ **Option 2's label is untouched — `As soon as you accept the order` does not appear in the diff.**
✅ **NO RENAME APPLIED. Option 1 still reads `Shortly before collection` in the code.** **You pick.**
✅ 🔴 **NO STORED VALUE TOUCHED.** The two radios still write `'lead_time'` and `'on_confirmed'` to `trucks.print_trigger_mode` through `setTriggerMode` → `onChangeMode`, unchanged. **These are labels; the keys are not in the diff.**

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 app/landing/page.tsx                       |  4 ++--
 components/native/NotificationSettings.tsx |  2 +-
 components/native/OperatorDeviceConfig.tsx |  4 ++--
 components/printing/PrintingSettings.tsx   | 21 ++++++++++++++-------
 4 files changed, 19 insertions(+), 12 deletions(-)
```

⚠️ **ONLY THE LAST LINE IS THIS TASK.** The three above it are the previous turn's device-naming copy sweep, still uncommitted — **not touched today.**

> ## ✅ NO GATE, NO COLUMN, NO MIGRATION, NO TYPE.
> 🔴 **`lib/plan-features.ts` — ABSENT.** Part A stopped, exactly as instructed.
> 🔴 **`lib/features.ts` — ABSENT.** `canAccess` and `MAX_FEATURES` are as they were; the A6 divergence is reported, not resolved.
> 🔴 **`lib/printing/transport.ts`, `printWatcher.ts`, `ticket.ts`, `mapOrderToTicket.ts` — ALL ABSENT.** The diagnosis changed nothing it diagnosed.
> 🔴 **`supabase/migrations/` — ABSENT.** No column, no migration; `trucks.print_trigger_mode` is untouched.
> 🔴 **`components/dashboard/types.ts` — ABSENT.** No type moved.
> **The single edited file is a presentation component, and the change within it is JSX position plus one Tailwind padding class.**

## D2. What each live operator sees differently

**Pizzeria Gusto (trades with real money):** 🔴 **Almost certainly NOTHING** — the card requires `isNativeApp()` **and** Max-tier `ticket_printing` **and** the master toggle on **and** the Settings panel expanded; if all four hold, the minutes box has moved up by one option and indented. **No price, gate, order or payment path is touched.**

**Tikka Tonic (handed over):** **The same — and the same four conditions.** ✅ **Neither operator can print today and neither could yesterday; nothing about that changed in either direction.**

## D3. Customer-facing surfaces

> ## ✅ NONE AFFECTED. `PrintingSettings` renders inside the operator dashboard's Settings tab and self-gates on `isNativeApp()` at `:71` and on `canAccess` at `:76`.
> **No customer route imports it — it is mounted at exactly one place, `app/dashboard/[token]/page.tsx:3989`.** **No email, no order page, no discovery surface, no menu.**

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census — `components/printing/PrintingSettings.tsx`

**13,754 → 14,541 bytes (+787), 197 → 204 lines (+7)**

| Codepoint | Name | Before | After | Δ | Explanation |
|---|---|---|---|---|---|
| U+2500 | BOX DRAWINGS LIGHT HORIZONTAL | 143 | **175** | **+32** | one new `── … ───` comment rule, matching the file's existing style |
| U+2014 | EM DASH | 18 | 18 | 0 | — |
| U+1F534 | LARGE RED CIRCLE | 9 | 9 | 0 | — |
| U+25CF | BLACK CIRCLE | 3 | 3 | 0 | the "● Connected" badge |
| **U+26A0** | **WARNING SIGN** | **2** | **2** | **0** | — |
| **U+FE0F** | **VARIATION SELECTOR-16** | **2** | **2** | **0** | — |
| U+25BE | BLACK DOWN-POINTING SMALL TRIANGLE | 2 | 2 | 0 | the ▾ chevron |
| U+25B2 | BLACK UP-POINTING TRIANGLE | 2 | 2 | 0 | the ▲ chevron |
| U+00B7 | MIDDLE DOT | 2 | 2 | 0 | the summary-row separator |
| U+1F5A8 | PRINTER | 1 | 1 | 0 | the card's 🖨 icon |

> ## 🔴 DISTINCT CLASSES 10 → 10. GAINED NONE, LOST NONE.
> **Exactly one count moved, and it is the box-drawing rule in my own comment.** ✅ **The MOVED JSX contributed ZERO non-ASCII characters — as it must, since it was relocated rather than retyped.**
> ## ⚠️ THE PAIR CHECK, EXPLICITLY: **U+26A0 = 2, U+FE0F = 2 — PAIRED**, before and after, unmoved.
> 🔴 **The hazard was live in this file: it carries FOUR different geometric glyphs (● ▾ ▲ ·) that a careless retype could have swapped for lookalikes.** ✅ **All four counts are unchanged, which is what proves the block was moved and not rewritten.**

## E3. Byte scan — byte-level, never `grep`

```
components/printing/PrintingSettings.tsx   14,541 bytes
  NUL (0x00)                                          : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F      : none
```

✅ **Clean.** **One file was edited, so one file is scanned.**

## E4. Byte scan of this report — separate pass, AFTER writing

```
docs/printing-ui-report.md   32,123 bytes
  NUL (0x00)                                     : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F : none
  distinct non-ASCII classes                     : 16
  U+26A0 = 24, U+FE0F = 24                         : PAIRED
```

✅ **Clean.** Byte-level, never `grep`, run as its own pass after the file was written.

## E5. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/landing/page.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
?? docs/device-naming-report.md
?? docs/printing-ui-report.md
```

```
$ git diff --stat
 app/landing/page.tsx                       |  4 ++--
 components/native/NotificationSettings.tsx |  2 +-
 components/native/OperatorDeviceConfig.tsx |  4 ++--
 components/printing/PrintingSettings.tsx   | 21 ++++++++++++++-------
 4 files changed, 19 insertions(+), 12 deletions(-)
```

🔴 **Nothing committed.**

## E6. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

✅ **Clean, no output.**

> ## 🔴 AND `tsc`-CLEAN IS NOT VERIFICATION OF A LAYOUT CHANGE.
> **It proves the JSX still parses and that moving the block did not orphan a brace or break a type. It says NOTHING about where the control appears on screen.** ⚠️ **A block indented into the wrong parent, a `pl-6` that over- or under-shoots the radio's text column, a row that now wraps on a narrow iPad — all four are `tsc`-clean.**
> 🔴 **NOTHING WAS RENDERED.** No `next dev`, no `next build`. **And this card renders ONLY inside the native app on a Max-plan truck with the toggle on and the panel expanded — so it cannot be checked in a browser at all. It needs the device.**

---

# PROVENANCE

**READ** — `lib/printing/transport.ts` in full · `components/printing/PrintingSettings.tsx` in full, before and after · `lib/printing/printWatcher.ts:168` · `lib/printing/mapOrderToTicket.ts:67` · `lib/printing/ticket.ts:458` · `app/dev/ticket-preview/page.tsx:16, 18, 185, 191` · `app/dashboard/[token]/page.tsx:1310-1312, 3989` · `app/api/dashboard/action/route.ts:2319-2330` · `lib/features.ts:26, 53-58, 98-129` · `lib/plan-features.ts:155-161` · `components/dashboard/types.ts:139` · `docs/reference-manual.md:3876, 10198-10228` · `docs/printing-report.md:88, 187` · the exhaustive call-site greps for the pipeline symbols and for all four Preferences keys · both censuses · the byte scan · `git status`, `git diff`, `git diff --stat` · `tsc`.

**INFERRED** — that `pl-6` (1.5rem) aligns with the radio's text column (computed from the input's width plus `gap-2`, **not measured on screen**) · that Gusto and Tikka Tonic see nothing, since that depends on their live plan and device state, which I did not query · that the dev preview page is unreachable in production (read from the manual's account of `app/dev/layout.tsx`, which I did not open this session).

**NOT VERIFIED** — 🔴 **nothing was rendered.** The Part B move is proved by the diff, **not by looking at it.** 🔴 **And the whole of Part A is a statement about code, not about hardware: I did not attempt to print, and there is nothing to attempt it with.**
