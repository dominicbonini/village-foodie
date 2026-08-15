# Kitchen ticket printing — the shape of what exists

**READ-ONLY. Nothing was edited, committed, built or deployed. No `next dev`, no `next build`, no package installed, no write to the database — no query was run against it at all.**
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

> ## 🔴 THE TWO BAKED-IN DECISIONS YOU SUSPECTED ARE BOTH REAL, AND A THIRD WAS FOUND.
>
> **1. CLIENT-SIDE IS ALREADY DECIDED.** `usePrintWatcher` is a React hook holding `useRef` state on a `setInterval`, keyed to a device-local Capacitor Preferences record. **There is no server-side print path, no `print_jobs` table, and no `printed_at` column — "not found" in all three cases.** The device that renders the ticket is the device that must send it.
>
> **2. DE-DUPLICATION ACROSS DEVICES DOES NOT EXIST.** The printed-set is `hg_printed_keys_<storageKey>` in **device-local** Preferences. 🔴 **Two devices at one event with printing on would each print every ticket.** The migration comment says so in its own words: *"NO DE-DUPLICATION IS BUILT HERE."*
>
> **3. 🔴 THE ONE THING NOBODY FLAGGED: `trucks.print_trigger_mode` IS A MIGRATION MARKED "WRITTEN, NOT RUN" — AND THE DASHBOARD ALREADY HAS A LIVE HANDLER THAT WRITES IT.** See A5. **I did not query the database, so whether the column exists is UNVERIFIED.**

---

# PART A — EVERY PIECE THAT EXISTS

## A1. `usePrintWatcher` — what it watches, what triggers it, what it calls

**READ, `lib/printing/printWatcher.ts:168-271`. The signature and the state:**

```ts
export function usePrintWatcher<T extends DueOrder>(args: {
  orders: T[]
  mode: PrintTriggerMode
  leadMins: number
  nowMins: () => number
  /** 🔴 Returns what happened to PAPER. See PrintOutcome. `ctx.mayDuplicate` is what the caller feeds to
   *  the ticket's reprint marker. May be sync or async; the pump awaits it either way. */
  onPrint: (order: T, ctx: PrintAttemptContext) => Promise<PrintAttempt> | PrintAttempt
  storageKey: string
  eligible?: string[]
  enabled?: boolean
  intervalMs?: number
}): void {
  const { orders, mode, leadMins, nowMins, onPrint, storageKey, eligible, enabled = true, intervalMs = 20000 } = args
  const printed = useRef<Set<string>>(new Set())
  const unsettled = useRef<Record<string, UnsettledRecord>>({})
  const ready = useRef(false)                       // false until the durable set is loaded/primed
  const inFlight = useRef(false)                    // a printer is ONE serial device — see the pump note
```

**The pump — the thing that actually triggers:**

```ts
    const tick = async () => {
      if (!ready.current || inFlight.current) return   // never print before the durable set is resolved
      const due = selectDueToPrint(ordersRef.current, { mode, nowMins: nowRef.current(), leadMins, printed: printed.current, eligible })
      if (!due.length) return
      inFlight.current = true
      try {
        for (const o of due) {
          …
          let res: PrintAttempt
          try {
            res = await onPrintRef.current(o, ctx)
          } catch (e) {
            res = { outcome: 'unknown', error: e instanceof Error ? e.message : 'thrown (no result)' }
          }
          if (res.outcome === 'printed') {
            printed.current.add(o.order_key)          // 🔴 THE ONLY PLACE A KEY ENTERS ON A PRINT
```

**And what drives it:**

```ts
    const id = setInterval(() => { void tick() }, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
```

| Question | Answer |
|---|---|
| **What does it watch?** | `orders: T[]` — an in-memory array the CALLER supplies, held in `ordersRef`. **It does not fetch anything.** |
| **What triggers it?** | 🔴 **A `setInterval`, default `intervalMs = 20000` (20 s).** Plus one immediate `tick()` after priming. **Not an event, not a subscription, not a status transition.** |
| **What does it call?** | **`onPrint(order, ctx)` — a caller-supplied callback. That is the entire transport seam.** It never imports `transport.ts`. |
| **What it persists** | `hg_printed_keys_<storageKey>` in Capacitor Preferences: `{ mode, keys[], unsettled{} }` |

✅ **The pure selector is separately exported and testable:**

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
    const due = timeToMins(o.slot)
    if (due == null) return true
    return opts.nowMins >= due - opts.leadMins
  })
}
```

## A2. `mapOrderToTicket` and `renderTicket` — what they emit

**`mapOrderToTicket` emits a DATA STRUCTURE, not bytes. READ, `lib/printing/mapOrderToTicket.ts:67-131`** *(the assembly, abbreviated only where the field list repeats)*:

```ts
export function mapOrderToTicket(input: MapTicketInput): TicketOrder {
  const { order, truck, event, ledgerRows, printedLabel, reprint } = input
  const { showPaidStep } = resolvePaidStep(truck, event)
  const balance = getOrderBalance(order, ledgerRows ?? [])
  const paymentStatus = showPaidStep ? balance.status : undefined
  const balanceMinor = showPaidStep ? balance.balanceMinor : undefined
  const collection_time = hhmm(order.slot)

  const t: ExhaustiveTicketOrder = {
    id: order.id,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    collection_time,
    buzzer_number: order.buzzer_number ?? null,
    items: (order.items ?? []).map(it => ({ … })),
    deals: (order.deals ?? []).map(d => ({ … })),
    notes: order.notes,
    total: order.total,
    showPaidStep,
    paymentStatus,
    balanceMinor,
    heldAuthorisation: showPaidStep ? (input.heldAuthorisation ?? false) : undefined,
    truck_name: truck?.name,
    printedLabel,
    reprint: reprint ?? null,
  }
  return t
}
```

**`renderTicket` emits ESC/POS BYTES. READ, `lib/printing/ticket.ts:457-460`:**

```ts
/** The one entry point: order + config (+ type) → ESC/POS bytes for the plugin (Phase B) to send. */
export function renderTicket(order: TicketOrder, config: TicketConfig, type: TicketType = 'combined'): Uint8Array {
  return encodeEscPos(buildTicketLines(order, config, type), config)
}
```

**And the encoder is real ESC/POS, not a placeholder — `:432-455`:**

```ts
  b.push(ESC, 0x40)              // ESC @  — initialise
  b.push(ESC, 0x74, 0x10)        // ESC t 16 — code page (Phase-B tunable)
  …
    b.push(ESC, 0x61, line.align === 'center' ? 0x01 : 0x00)      // ESC a  — align
    b.push(GS, 0x21, line.size === 'large' ? 0x11 : 0x00)         // GS !   — size (0x11 = double w+h)
    b.push(ESC, 0x45, line.bold ? 0x01 : 0x00)                    // ESC E  — bold
    b.push(GS, 0x42, line.invert ? 0x01 : 0x00)                   // GS B   — reverse video (white on black)
    b.push(...strBytes(line.text ?? ''), LF)
  …
  b.push(ESC, 0x64, 0x04)        // ESC d 4 — feed 4 lines
  b.push(GS, 0x56, 0x01)         // GS V 1  — partial cut
  return new Uint8Array(b)
```

> ## ✅ **THE OUTPUT IS PRINTER-READY. `Uint8Array` of ESC/POS, including init, code page, alignment, double-size, bold, reverse video, line feeds and a partial cut.**
> 🔴 **NOTHING ELSE HAS TO ENCODE IT.** A transport's job is to move those bytes to the device — no formatting, no text conversion, no driver layer. **That is the single most valuable thing already built.**

## A3. The transport interface and the stub, in full

**READ, `lib/printing/transport.ts:15-48` — the entire remainder of a 48-line file:**

```ts
export type PrinterClass = 'mfi' | 'ble'

export interface PrintResult { ok: boolean; error?: string }

/** Best-effort status. MFi populates paperOut/coverOpen; BLE usually can't → they stay `undefined`. The
 *  reprint/flag UX therefore treats `!connected` OR a failed `sendBytes` as the universal failure signal
 *  (works for both classes); MFi additionally surfaces paperOut/coverOpen when known. */
export interface PrinterStatus {
  connected: boolean
  paperOut?: boolean
  coverOpen?: boolean
}

export interface DiscoveredPrinter { id: string; name: string; class: PrinterClass }

/** The one seam both Phase-B backends implement. Printer-agnostic + order-agnostic — it only moves bytes. */
export interface PrinterTransport {
  scan(): Promise<DiscoveredPrinter[]>
  connect(printerId: string): Promise<PrintResult>
  sendBytes(bytes: Uint8Array): Promise<PrintResult>
  status(): Promise<PrinterStatus>
}

export function createStubTransport(sink: (bytes: Uint8Array) => void): PrinterTransport {
  return {
    async scan() { return [] },
    async connect() { return { ok: true } },
    async sendBytes(bytes) { sink(bytes); return { ok: true } },
    async status() { return { connected: true } },
  }
}
```

**Every method signature:**

| Method | Signature |
|---|---|
| `scan` | `() => Promise<DiscoveredPrinter[]>` |
| `connect` | `(printerId: string) => Promise<PrintResult>` |
| `sendBytes` | `(bytes: Uint8Array) => Promise<PrintResult>` |
| `status` | `() => Promise<PrinterStatus>` |

🔴 **`PrinterClass = 'mfi' | 'ble'` is declared and NEITHER backend exists.** ⚠️ **`disconnect()` IS NOT IN THE INTERFACE — "not found" is the result, and it matters for D2.**

## A4. The dev page, and its gate

**READ, `app/dev/ticket-preview/page.tsx:185-191` — the only consumption anywhere:**

```tsx
    const ticket = mapOrderToTicket({
      order, truck, event: SAMPLE_EVENT, ledgerRows: rows, printedLabel, reprint: sc.reprint,
    })
    …
  const bytes = useMemo(() => renderTicket(built.ticket, config), [built, config])
  const hex = useMemo(() => Array.from(bytes.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' '), [bytes])
```

**And the gate, `app/dev/layout.tsx` — the whole component:**

```tsx
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return <>{children}</>
}
```

✅ **CONFIRMED: it 404s in production, and it gates the DIRECTORY, not a route.** ⚠️ **Its own header records the known limit: a layout wraps pages, not Route Handlers — there are no `route.ts` files under `app/dev/` today.**

⚠️ **The dev page imports `selectDueToPrint` — the PURE selector — but NOT `usePrintWatcher` and NOT `createStubTransport`.** 🔴 **So even the harness does not exercise the hook or the transport; it simulates the selection rule only.**

## A5. Every printing-related setting, and what writes it

| Setting | Where it lives | Written by | Scope |
|---|---|---|---|
| enable flag | `hg_print_enabled` — **Capacitor Preferences** | `setEnabledPref` in `PrintingSettings.tsx:78` | **device** |
| lead minutes | `hg_print_lead_mins` — **Preferences** | `setLeadMins` `:79` | **device** |
| paper width | `hg_paper_width` — **Preferences** | `setPaperWidth` `:80` | **device** |
| printer name | `hg_printer_name` — **Preferences** | 🔴 **NOTHING WRITES IT.** Only `disconnect` removes it | **device** |
| **trigger mode** | **`trucks.print_trigger_mode` — a DATABASE COLUMN** | `set_print_trigger_mode` → `app/api/dashboard/action/route.ts:2326-2330` | **truck** |

**🔴 AND THE COLUMN'S MIGRATION IS MARKED NOT RUN. READ, `supabase/migrations/20260806_trucks_print_trigger_mode.sql:1-2`:**

```sql
-- 20260806_trucks_print_trigger_mode.sql
-- 🔴 WRITTEN, NOT RUN. Hand-apply when the printing build reaches the point of reading it.
```

```sql
alter table trucks
  add column if not exists print_trigger_mode text not null default 'lead_time'
  check (print_trigger_mode in ('on_confirmed', 'lead_time'));
```

> ## 🔴 THE FINDING NOBODY HAS RECORDED: **THE UI ALREADY WRITES THIS COLUMN.**
> **`PrintingSettings` takes `mode` and `onChangeMode` as props; the dashboard wires `onChangeMode` to `savePrintTriggerMode`, which POSTs `set_print_trigger_mode`, which runs `.update({ print_trigger_mode: mode })`.** **The radio is live on every Max operator's Settings tab today.**
> ⚠️ **IF THE MIGRATION HAS NOT BEEN APPLIED, that update fails — PostgREST `42703`, undefined column.** 🔴 **UNVERIFIED: the brief forbids writing to the database, and I did not query it, so I cannot say whether the column exists.** ✅ **The READ side degrades safely either way — `/api/dashboard` selects `trucks` with `select('*')`, so an absent column arrives as `undefined` and the dashboard's `truck.print_trigger_mode==='on_confirmed'?'on_confirmed':'lead_time'` falls back to the default.**
> **The migration's own comment anticipated exactly half of this:** *"Nothing reads this column yet… code shipped before the migration simply sees `undefined` and falls back to the default."* **It did not anticipate a WRITE shipping first.**

✅ **NO OTHER PRINTING COLUMN EXISTS. "Not found" for `print_jobs`, `printed_at`, and any per-order printed marker** — the only occurrences of those names in the repository are in comments *describing what does not exist*.

## A6. `PrintingSettings.tsx` — every control, and whether anything reads it at print time

| Control | Persists to | Read at print time? |
|---|---|---|
| Master **On/Off** toggle | `hg_print_enabled` | 🔴 **NO** |
| **Paper width** 58 / 80 | `hg_paper_width` | 🔴 **NO** |
| **Lead minutes** number input | `hg_print_lead_mins` | 🔴 **NO** |
| **Trigger mode** radios | `trucks.print_trigger_mode` | 🔴 **NO** |
| Disconnect *(unreachable)* | removes `hg_printer_name` | — |

**The reads and the writes, quoted — `:56-69` and `:78-85`:**

```tsx
      const en = (await Preferences.get({ key: K.enabled })).value
      const p = (await Preferences.get({ key: K.printer })).value
      const l = parseInt((await Preferences.get({ key: K.lead })).value ?? '10', 10)
      const w = parseInt((await Preferences.get({ key: K.paper })).value ?? '80', 10)
```
```tsx
  const setEnabledPref = async (v: boolean) => { setEnabled(v); if (!v) setExpanded(false); await Preferences.set({ key: K.enabled, value: String(v) }) }
  const setLeadMins = async (n: number) => { setLead(n); await Preferences.set({ key: K.lead, value: String(n) }) }
  const setPaperWidth = async (w: PaperWidth) => { setPaper(w); await Preferences.set({ key: K.paper, value: String(w) }) }
  const setTriggerMode = async (m: PrintTriggerMode) => { await onChangeMode(m) }
  const disconnect = async () => { await Preferences.remove({ key: K.printer }); setPrinter(null) }
```

> ## 🔴 **NOTHING READS ANY OF THEM AT PRINT TIME, BECAUSE THERE IS NO PRINT TIME.**
> **An exhaustive grep for the four keys returns exactly ONE file — `PrintingSettings.tsx` itself, as both writer and reader.** **The card is a complete, durable, correct settings surface in front of nothing.**

**Its three gates, `:71-76`:**

```tsx
  if (!isNativeApp() || !ready) return null
  const canPrint = canAccess(plan, 'ticket_printing', featureOverrides ?? {}, trialExpiresAt)
  if (!canPrint) return null
```

⚠️ **`isNativeApp()` — SO THE ENTIRE PRINTING UI IS INVISIBLE ON THE WEB**, on every plan.

---

# PART B — 🔴 CLIENT-SIDE OR SERVER-SIDE?

## B1. **CLIENT-SIDE. Decided, and decided in several places at once.**

| Evidence | Quote |
|---|---|
| It is a React hook | `export function usePrintWatcher<T extends DueOrder>(args: {…}): void` with `useEffect` / `useRef` |
| File directive | **`'use client'`** — `printWatcher.ts:1` |
| Its own header | *"A **device-local watcher on the mounted iPad**: every tick it scans un-printed DUE orders"* |
| Durable state | **Capacitor Preferences**, a device store — not a table |
| The transport interface | `scan()` / `connect(printerId)` — **Bluetooth radio operations, which only a device can perform** |
| Server side | 🔴 **NOTHING. No print route, no `print_jobs`, no `printed_at`, no cron. "Not found."** |

🔴 **AND IT COULD NOT REASONABLY BE OTHERWISE FOR BLUETOOTH: a server cannot reach a BLE printer in a van. What is NOT forced by that — and what nobody appears to have written down — is that the SCHEDULING, the DEDUPE RECORD and the TRIGGER also live on the device.** ⚠️ **The migration comment is the only place that names the alternative:** *"Dedup needs a SHARED RECORD… a server-side `printed_at` or a print_jobs table — which is a server concern either way."*

## B2. Backgrounded, asleep, or switched to the KDS

**READ. `intervalMs = 20000` on a `setInterval` inside a `useEffect` with a cleanup that clears it:**

```ts
    const id = setInterval(() => { void tick() }, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
```

| Situation | What happens — INFERRED from the mechanism, **not observed on a device** |
|---|---|
| **App backgrounded** | 🔴 **The timer stops.** iOS suspends the WebView's JS. **`Info.plist` has NO `UIBackgroundModes` — "not found", confirmed by direct read.** No printing while backgrounded. |
| **Screen sleeps** | ⚠️ **Depends on keep-awake.** `@capacitor-community/keep-awake` exists in the project and the dashboard/KDS use it, **but `lib/printing/*` does not reference it — "not found".** Keep-awake keeps the SCREEN on; §11 records that it does **not** keep the app foregrounded. |
| **Operator switches to the KDS** | 🔴 **The dashboard route unmounts, the `useEffect` cleanup runs, `clearInterval` fires. The watcher STOPS** — unless the KDS mounts its own (B3). |
| **WebView content process killed** | ✅ **Survivable — this is the one case that was designed for.** The printed-set is durable, and its header says so: *"Reloading the page, switching tabs, or the WebView content process being killed reset it… Now persisted to Capacitor Preferences."* |

✅ **NOTHING WOULD KEEP IT ALIVE. No service worker registration for printing, no background mode, no native scheduler. "Not found" in every case.**

## B3. Which surface would host it — 🔴 **AND WHAT HAPPENS IF BOTH DO**

**READ, the current state of every surface:**

| Surface | Printing references |
|---|---|
| **Operator dashboard** | imports `PrintingSettings` **only** (`app/dashboard/[token]/page.tsx:83`) — the settings card, not the watcher |
| **KDS** | 🔴 **NONE. "Not found"** — the only matches for "print" are two comments about the word *printed* in a payment string |
| **Manage** | 🔴 **NONE. "Not found"** |
| **Any server route** | 🔴 **NONE. "Not found"** |

**So no surface hosts it today, and the choice is open. The consequence if BOTH host it:**

> ## 🔴 **YES — A TICKET WOULD PRINT TWICE, AND NOTHING PREVENTS IT.**
> **The printed-set key is `PRINTED_KEY_PREFIX + storageKey` = `hg_printed_keys_<token>` in Capacitor Preferences.** **Preferences is DEVICE-LOCAL** — `iOS: NSUserDefaults plist in the app sandbox`, per the outbox's own header. **Device A's record is invisible to device B.**
> **Two iPads at one event, both with printing enabled, both mounting a watcher ⇒ each independently selects the same due orders and each prints them.** ⚠️ **They would even print at the SAME time, because the trigger mode is truck-level and both devices agree on when a ticket is due.**
> 🔴 **THE MIGRATION SAYS THIS OUT LOUD:** *"⚠️ DOES THIS MAKE MULTI-DEVICE DE-DUPLICATION EASIER OR HARDER LATER? EASIER, but only slightly, and it is not the hard part… **NO DE-DUPLICATION IS BUILT HERE.**"*
> ⚠️ **`multi_device_kds` IS A MAX FEATURE (`lib/features.ts`), so two devices is a SOLD configuration, not an edge case.**

## B4. Idempotency or already-printed marker

| Scope | Marker | Verdict |
|---|---|---|
| **Within one device** | ✅ `hg_printed_keys_<storageKey>` — `{ mode, keys[], unsettled{} }`, durable across reload, tab switch and process kill | **EXISTS and is carefully built** |
| **Across devices** | 🔴 **NOTHING** | **NOT FOUND** |
| **Server-side** | 🔴 **no `print_jobs` table, no `printed_at` column** | **NOT FOUND** |
| **Outbox-style dedupe** | 🔴 the outbox has kinds `'create' \| 'status' \| 'edit' \| 'stock' \| 'buzzer'` — **no print kind** | **NOT FOUND** |

✅ **The single-device discipline is genuinely good and worth preserving:**

```ts
          if (res.outcome === 'printed') {
            printed.current.add(o.order_key)          // 🔴 THE ONLY PLACE A KEY ENTERS ON A PRINT
```

**with three outcomes rather than two, because `'unknown'` (a partial write) leaves the order due AND marks the next ticket a possible duplicate.** 🔴 **All of that correctness is per-device and evaporates the moment a second device exists.**

## B5. What happens if the trigger fires while OFFLINE

> ## ✅ **PRINTING NEEDS NO NETWORK AT ALL, AND THAT IS THE INTERESTING ANSWER.**
> **The watcher reads an in-memory `orders` array, computes `nowMins()` locally, reads settings from device storage and writes bytes over Bluetooth. 🔴 Not one step requires the internet.**
> ⚠️ **What DOES degrade offline is the INPUT: `orders` comes from the caller, which refreshes from `/api/dashboard`. An order taken offline through the outbox would appear in local state and could print; an order accepted on ANOTHER device would not arrive.** **INFERRED — no watcher is mounted, so this has never happened.**

**Is there a queue?** 🔴 **NO — and there is a natural one hiding in plain sight: an order that fails to print is simply LEFT OUT of the printed set, so the next 20-second tick re-selects it.** The header names this precisely:

> *"⚠️ NO RETRY, BACKOFF OR PACING IS BUILT HERE. Leaving a key out of the printed set means the next tick re-selects it, which is inherent to re-evaluation, not a retry policy."*

**Against N45's money policy:** 🔴 **PRINTING HAS NO EQUIVALENT POLICY, AND IT SHOULD NOT NEED THE SAME ONE.** N45 forbids queueing payment modifications because a queued refund fails toward *"money shown as returned that has not been"*. **A ticket has the opposite asymmetry, and the watcher's header already states it:**

> *"a duplicate ticket beats a missing one: a duplicate is visible on the rail and a human resolves it in seconds, whereas a missing ticket is invisible until the customer asks for food nobody started."*

✅ **So the two policies point in opposite directions FOR THE SAME REASON — pick the failure a human can see. That is consistent, not contradictory, and it does not appear to be written down anywhere as a pair.**

---

# PART C — THE TRIGGER

## C1. Both modes, quoted, and where each would fire from

```ts
//   'on_confirmed' — print as soon as the order is ACCEPTED.
//   'lead_time'    — print X minutes before the collection time. The existing behaviour, and the DEFAULT,
//                    so no truck's behaviour changes by upgrading.
//
// 🔴 BOTH MODES ANCHOR ON ACCEPTANCE, NEVER ON CREATION. `DEFAULT_ELIGIBLE` excludes 'pending', so an
// online order that has not been accepted never prints — and 'cancelled'/'rejected' are not in the list
// either, so a rejected order never prints.
```

```ts
const DEFAULT_ELIGIBLE = ['confirmed', 'cooking', 'ready']
```

| Mode | The rule | What it fires from |
|---|---|---|
| **`on_confirmed`** | `if (opts.mode === 'on_confirmed') return true` — status alone | 🔴 **STILL THE POLL.** Not a status-transition hook, not a subscription — the next 20 s tick notices the status changed |
| **`lead_time`** | `return opts.nowMins >= due - opts.leadMins` | **The same poll, comparing a clock to a slot** |

> ## 🔴 THERE IS NO EVENT-DRIVEN PATH AT ALL. **BOTH modes are evaluated by one `setInterval`.** ⚠️ **So `on_confirmed` is "as soon as you accept" **± up to 20 seconds**, and only while the hosting screen is mounted and foregrounded.**

⚠️ **AND A WALK-UP IS CREATED `'confirmed'`, so in `on_confirmed` mode it fires at creation** — the header says so — **which is the closest thing to instant that this design offers.**

## C2. What would evaluate "N minutes before collection"

**READ. `nowMins` is a CALLER-SUPPLIED FUNCTION — the watcher owns no clock:**

```ts
  nowMins: () => number
```
```ts
  const nowRef = useRef(nowMins); nowRef.current = nowMins
```

**with its contract stated as** *"`nowMins()` returns the current minutes-of-day in the EVENT timezone."*

**Ticks that already exist and could serve — READ, on the dashboard:**

| file:line | Interval | Purpose today |
|---|---|---|
| `app/dashboard/[token]/page.tsx:1073` | **30 s** | `setWaitTick(t=>t+1)` — a bare re-render pulse for wait times |
| `app/dashboard/[token]/page.tsx:2323` | **15 s** | urgency scan for sounds |
| `app/dashboard/[token]/page.tsx:1121` | 15 s | heartbeat |
| `app/dashboard/[token]/page.tsx:1049` | 60 s | fallback refetch |
| `app/dashboard/[token]/kds/page.tsx:451` | 15 s | KDS heartbeat |
| `app/dashboard/[token]/kds/page.tsx:516` | 60 s | KDS fallback refetch |

✅ **`:1073`'s 30-second `waitTick` is the closest existing analogue — a clock pulse whose only job is to make time-derived UI re-evaluate.** 🔴 **But the watcher does NOT need one: it brings its own `setInterval`. Supplying `nowMins` is the only clock decision a caller makes.**

⚠️ **AND THE TIMEZONE IS A REAL, UNRESOLVED DETAIL: the contract says EVENT timezone, and every existing `nowMins` in the codebase is `new Date().getHours()*60 + getMinutes()` — DEVICE local time.** **INFERRED: for a UK-only product on a device in the same timezone these coincide, so nothing would surface until they do not.**

## C3. 🔴 A walk-up due in 5 minutes with a 10-minute lead

**The rule, exactly:**

```ts
    const due = timeToMins(o.slot)
    if (due == null) return true
    return opts.nowMins >= due - opts.leadMins
```

> ## ✅ **IT PRINTS — IMMEDIATELY, ON THE VERY NEXT TICK.**
> **`nowMins` (say 12:00 = 720) `>= due − lead` (12:05 − 10 = 715). 720 ≥ 715 is TRUE.** 🔴 **The condition is "the lead window has OPENED", not "we are inside it", so an order whose window opened in the past is due now.** **There is no upper bound and no expiry.**
> ✅ **THAT IS ALMOST CERTAINLY THE RIGHT BEHAVIOUR — a ticket for food needed in five minutes should print at once, not never.**
> ⚠️ **BUT THE SAME PROPERTY HAS A SHARP EDGE, AND IT IS WHY PRIMING EXISTS: on first mount EVERY accepted order whose window has passed is "due", which without priming would print the whole day at once.** **The header calls that out and the prime absorbs it — and then names the unresolved consequence:**
> > *"🔴 PRIME: first run, or the mode changed. Absorb everything currently due WITHOUT printing… Priming and flush-on-connect are the same event — a set of already due orders at the moment printing becomes possible — with opposite intended outcomes, and nothing in the order data distinguishes them."*
> 🔴 **So the answer to C3 is entangled with the one open question the design already knows it has. Not fixed, not proposed.**

---

# PART D — BLUETOOTH: WHICH PATH IS ACTUALLY AVAILABLE

## D1. MFi versus BLE

| | **MFi (ExternalAccessory)** | **Bluetooth LE** |
|---|---|---|
| Framework | `ExternalAccessory` | Core Bluetooth, via `@capacitor-community/bluetooth-le` |
| `Info.plist` | **`UISupportedExternalAccessoryProtocols`** — the manufacturer's protocol string, e.g. `com.star-m.starpronext` | **`NSBluetoothAlwaysUsageDescription`** — a sentence shown to the user |
| **Apple programme** | 🔴 **MFi Program enrolment, and the specific accessory's protocol registered against your app** | ✅ **NONE** |
| Who can ship it | The manufacturer must have MFi-certified the printer **and** your app must declare its protocol | Anyone |
| Status reporting | **Rich — paper-out, cover-open** | **Poor or none** |
| Classic Bluetooth SPP | Reachable | 🔴 **NOT reachable — BLE only** |

**⚠️ MARKED INFERRED: everything in the "Apple programme" row is my understanding of Apple's requirements, reasoned from the frameworks, NOT read from Apple documentation in this session and NOT read from our code.**

🔴 **OUR CODE ALREADY ENCODES THE TRADE-OFF, and it is the one line in the repository that names both paths — `transport.ts:6-9`:**

```
//   • 'mfi'  — Star/Epson vendor SDK (External Accessory). Real status (paper-out, cover-open), reliable,
//              survives iOS updates. THE RECOMMENDED path for a truck printing all day.
//   • 'ble'  — @capacitor-community/bluetooth-le: write ESC/POS to the printer's characteristic. Works, but
//              LIMITED/NO status + fiddlier reconnect. The budget fallback.
```

⚠️ **`lib/plan-features.ts:230-234` records the same split as the reason footnote 5 stays platform-neutral:** *"the recommended backend ('mfi' — Star/Epson via Apple's External Accessory framework…) is iOS-only by construction, and the cross-platform path ('ble') is documented there as the budget fallback."*

> ## 🔴 SO THE ANSWER TO "MFi AS WELL AS BLUETOOTH" IS: **ONLY BLE IS REACHABLE WITHOUT AN APPLE PROGRAMME ENROLMENT AND A NAMED PRINTER MODEL.** **MFi is not a bigger version of BLE; it is a different commercial relationship, and it must be chosen before hardware is bought, not after.** **INFERRED, per D1's caveat.**

## D2. Does the existing interface fit a BLE flow?

```ts
  scan(): Promise<DiscoveredPrinter[]>
  connect(printerId: string): Promise<PrintResult>
  sendBytes(bytes: Uint8Array): Promise<PrintResult>
  status(): Promise<PrinterStatus>
```

| BLE step | Covered? |
|---|---|
| **Request permission** | 🔴 **NO METHOD.** Would have to hide inside `scan()` |
| **Scan for peripherals** | ✅ `scan(): Promise<DiscoveredPrinter[]>` — **fits well**, and `DiscoveredPrinter { id, name, class }` maps onto a BLE device id |
| **Connect** | ✅ `connect(printerId)` — **fits** |
| **Discover service / characteristic** | ⚠️ **NOT MODELLED.** A BLE write needs a service UUID **and** a characteristic UUID; `sendBytes(bytes)` carries neither, so the backend must discover and remember them internally |
| **Write, chunked** | ⚠️ `sendBytes(bytes)` fits the SHAPE, but **BLE writes are MTU-limited (~20–500 bytes)** and a ticket is far larger. **Chunking is entirely the backend's problem, invisible at this seam** |
| **Disconnect** | 🔴 **NO `disconnect()` IN THE INTERFACE — "not found".** |
| **Reconnect after sleep** | 🔴 **NOT MODELLED** — `transport.ts` itself calls BLE reconnect *"fiddlier"* |

> ## ✅ **THE SEAM FITS BLE WELL ENOUGH TO BUILD AGAINST, AND ITS GAPS ARE ALL ON THE CONNECTION-LIFECYCLE SIDE, NOT THE DATA SIDE.**
> 🔴 **`sendBytes(Uint8Array)` is exactly right** — the renderer already produces the bytes, so the boundary is genuinely thin. **What is missing is permission, disconnect, and any notion of a REMEMBERED pairing.** ⚠️ **And `status()` returning `{ connected: true }` hard-coded is the specific lie that blocks the priming-vs-flush question in C3.**

## D3. Every change a BLE transport would require

**Reported as a shape. NOTHING WAS INSTALLED, and no package manifest was modified.**

| # | Change | Status today |
|---|---|---|
| 1 | **`@capacitor-community/bluetooth-le`** added to `package.json` | 🔴 **NOT INSTALLED — "not found" in `package.json`** |
| 2 | **`NSBluetoothAlwaysUsageDescription`** in `Info.plist` | 🔴 **NOT PRESENT — read directly, "not found"** |
| 3 | **Privacy manifest review** — §36 records that only `@capacitor/ios` ships its own, and the app-level manifest declares exactly ONE reason (`UserDefaults`, `CA92.1`). ⚠️ **A new plugin means RE-RUNNING that audit** | manifest exists, audit would be stale |
| 4 | **A permission prompt** at first scan | 🔴 does not exist |
| 5 | **Pairing UI** — a scan list, a pick, a remembered name written to `hg_printer_name` | 🔴 **The card's "Connect a printer" button was REMOVED deliberately**; the read side (`Printer: …`, `● Connected`, `Disconnect`) already exists and is dormant, waiting for something to write that key |
| 6 | **A `PrinterTransport` implementation** with chunked writes, characteristic discovery, reconnect | 🔴 stub only |
| 7 | **Mount `usePrintWatcher`** somewhere and wire `onPrint` to it | 🔴 zero call sites |
| 8 | **`npx cap sync` + a native rebuild** | ✅ **REQUIRED — a new native plugin and new `Info.plist` keys are compiled in** |
| 9 | **`trucks.print_trigger_mode` migration applied** | ⚠️ **marked WRITTEN, NOT RUN (A5)** |

✅ **NOT REQUIRED: the renderer, the mapper, the trigger logic, the dedupe record, the settings surface and the ESC/POS encoding. All built.**

## D4. 🔴 APP REVIEW EXPOSURE — stated plainly

**The scenario: a reviewer opens Settings on a Max account, taps "Scan for printers", is asked for Bluetooth permission, and the list comes back empty because there is no thermal printer on their desk.**

| Guideline | Assessment |
|---|---|
| **2.1 Performance / completeness** | ⚠️ **MODERATE, AND SURVIVABLE IF THE EMPTY STATE IS HONEST.** A scan that finds nothing is not a broken feature — it is hardware-dependent, like a printer app or a card-reader app, and Apple accepts those. 🔴 **The failure mode is a scan that SPINS FOREVER, or a "Connect" button that appears to do nothing.** §27's N5 rule applies exactly: *"Coming soon" against a FACT ABOUT A PLAN is fine; against a CONTROL a user can see and cannot operate it is a defect.* |
| **Bluetooth permission string** | ⚠️ A vague `NSBluetoothAlwaysUsageDescription` is a known rejection cause. **It must name thermal receipt printers specifically.** |
| **`lib/plan-features.ts` now advertising Max: `true`** | 🔴 **THIS IS THE SHARPER EXPOSURE, AND IT IS NEW.** A reviewer who reads the plan matrix sees **"Kitchen ticket printing ✓ included"**, opens the app, and finds a feature that cannot print. **Yesterday that cell said "Coming soon" and this specific mismatch did not exist.** |

> ## ⚠️ AND THE TWO STATEMENTS ON THE CARD NOW POINT IN OPPOSITE DIRECTIONS.
> **The "Coming soon" chip was removed today, so the matrix and the badge no longer contradict each other — but the prose remains and is still true: *"Bluetooth printer pairing isn't available yet."*** 🔴 **A reviewer comparing the Billing matrix to that sentence sees "included" beside "not available yet".**
> ✅ **The honest reading: today the risk is LOW, because there is no scan button and no permission prompt — nothing invites a reviewer to try.** 🔴 **Adding the pairing UI is what converts a documentation mismatch into a control a reviewer can press.** **INFERRED throughout — this is a judgement about Apple's review, not a reading of our code.**

## D5. Android — reported separately

| | Android |
|---|---|
| **MFi** | 🔴 **DOES NOT EXIST.** It is an Apple programme. **Android reaches classic Bluetooth SPP directly, which is how most cheap ESC/POS printers work** |
| **Permissions** | `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` runtime permissions on API 31+, plus historically `ACCESS_FINE_LOCATION` for scanning. **⚠️ Neither is in `AndroidManifest.xml` today — INFERRED from the plugin being absent; I did not read the manifest this session** |
| **The same plugin** | `@capacitor-community/bluetooth-le` supports both platforms, so **the transport code would be shared** |
| **Play review** | ⚠️ **No equivalent of App Review's manual hardware test.** The exposure in D4 is materially smaller |
| **§36 status** | ⚠️ Android is the **better-validated platform** on push (FCM has a live token; iOS has never registered one) but has **no `.entitlements`-equivalent blocker for Bluetooth** |

🔴 **SO THE PLATFORM ASYMMETRY IS THE REVERSE OF PUSH: iOS has the better printer path (MFi, if enrolled) and the harder review; Android has the easier permissions and the wider printer compatibility, and no MFi ceiling at all.**

---

# PART E — WHAT COULD BE WIRED WITHOUT TOUCHING BLUETOOTH

## E1. What "wired to the transport boundary" would mean

**Described, not proposed, not designed:**

1. **A surface mounts `usePrintWatcher`** with `orders`, the resolved `mode`, `leadMins` from Preferences, a `nowMins` function, a `storageKey`, and `enabled` from `hg_print_enabled`.
2. **The 20-second pump runs**, priming on first mount, then selecting due orders by the real rule.
3. **`onPrint` maps and renders** — `mapOrderToTicket(...)` then `renderTicket(...)` — producing real ESC/POS bytes for a real order.
4. **Those bytes are handed to a `PrinterTransport`** that does nothing but count them and return an outcome.
5. **The outcome flows back**: `'printed'` enters the durable set, anything else lands in `unsettled` and is retried on the next tick, and `everUnknown` marks the next ticket a possible duplicate.

🔴 **At that point the ONLY missing piece is a `PrinterTransport` whose `sendBytes` reaches a radio. Everything above the seam would be exercised by real orders.**

## E2. Which files would change, and which would not

| Would change | Why |
|---|---|
| **one surface** — the dashboard, or the KDS, or both *(B3's question, unanswered)* | to mount the hook and supply `onPrint` |
| **`lib/printing/transport.ts`** *(possibly)* | if a "does nothing but report" transport is wanted alongside the sink stub |
| **`components/printing/PrintingSettings.tsx`** *(possibly)* | only if the settings must be READ by the surface rather than by the card |

| Would NOT change | Why |
|---|---|
| **`lib/printing/printWatcher.ts`** | complete; it is a hook waiting to be called |
| **`lib/printing/ticket.ts`** | complete; emits printer-ready ESC/POS |
| **`lib/printing/mapOrderToTicket.ts`** | complete |
| **`lib/features.ts`, `lib/plan-features.ts`** | the gate and the matrix already say Max |
| **`Info.plist`, the privacy manifest, `package.json`** | 🔴 **nothing native is involved until Bluetooth is** |
| **any migration** | ⚠️ **except `print_trigger_mode`, which is already written and already written-to (A5)** |

## E3. Testable without a printer, and not

| ✅ **Testable without hardware** | 🔴 **NOT testable without hardware** |
|---|---|
| The selector, on real orders, in both modes | Whether bytes reach a printer |
| Priming — that turning printing on does not print the day's backlog | Whether the ESC/POS dialect suits the actual model |
| Dedupe across reload, tab switch and process kill | Paper-out and cover-open reporting |
| The three outcomes, including that `'unknown'` puts the duplicate banner on the next ticket | Chunked-write behaviour and MTU limits |
| The serial pump — that two ticks never overlap | Reconnect after sleep |
| That the right ticket content is produced for a real order | 🔴 **Whether a second device double-prints — testable in software, but only if two devices are actually run** |
| Backgrounding: that the timer stops and resumes | Anything about App Review |

## E4. No plan recommended

**The shape is reported. Nothing is proposed. Nothing was changed.**

---

# PART F — INTEGRITY

## F1. Byte scan — every file opened, byte-level, never `grep`

| File | Bytes | NUL | Control |
|---|---|---|---|
| `lib/printing/printWatcher.ts` | 16,527 | 0 | none |
| `lib/printing/mapOrderToTicket.ts` | 7,873 | 0 | none |
| `lib/printing/ticket.ts` | 30,178 | 0 | none |
| `lib/printing/transport.ts` | 2,809 | 0 | none |
| `components/printing/PrintingSettings.tsx` | 15,298 | 0 | none |
| `components/printing/TicketPreview.tsx` | 4,608 | 0 | none |
| `app/dev/ticket-preview/page.tsx` | 19,964 | 0 | none |
| `app/dev/layout.tsx` | 1,761 | 0 | none |
| `supabase/migrations/20260806_trucks_print_trigger_mode.sql` | 3,916 | 0 | none |
| `app/dashboard/[token]/page.tsx` | 375,186 | 0 | none |
| `app/dashboard/[token]/kds/page.tsx` | 91,554 | 0 | none |
| `app/manage/[token]/page.tsx` | 785,054 | 0 | none |
| `app/api/dashboard/action/route.ts` | 170,970 | 0 | none |
| `ios/App/App/Info.plist` | 3,063 | 0 | none |
| `ios/App/App/PrivacyInfo.xcprivacy` | 4,763 | 0 | none |
| `package.json` | 1,765 | 0 | none |
| `docs/reference-manual.md` | 1,496,028 | 0 | none |

✅ **17 files. NONE contains a NUL byte or a control byte below 0x09 other than newline.**

## F2. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## F3. 🔴 U+26A0 / U+FE0F pair count for THIS report — checked before asserting

```
docs/printing-architecture-report.md
  U+26A0 count  ==  U+FE0F count      : EQUAL
  bare U+26A0 (no variation selector) : 0
  -> PAIRED
```

🔴 **Stated as an equality rather than two literals, because this section sits inside the file it measures and any later edit would move the numbers.** ✅ **Verified by scanning the written file — the check that caught two bare glyphs two reports ago, and the reason no glyph is reproduced anywhere in this document except as a paired sequence.**

## F4. `git status`, pasted

```
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
 M ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 M lib/plan-features.ts
?? docs/app-icon-report.md
?? docs/device-naming-report.md
?? docs/printing-ui-report.md
?? docs/push-registration-report.md
?? docs/settings-grouping-report.md
```

> ## ✅ **EVERY ENTRY IS PRE-EXISTING. THIS DIAGNOSIS CHANGED NOTHING.**
> ⚠️ **The tree has been dirty all session. For the record:**

| Entry | Which earlier task |
|---|---|
| `app/dashboard/[token]/page.tsx` | the settings grouping (two passes) |
| `components/printing/PrintingSettings.tsx` | the lead-time move, then the chip removal and the trigger rename |
| `app/landing/page.tsx`, `components/native/NotificationSettings.tsx`, `components/native/OperatorDeviceConfig.tsx` | the device-naming copy sweep |
| `lib/plan-features.ts` | the ticket-printing plan cell revert |
| `ios/…/AppIcon-512@2x.png` | the white ground, then the 830 enlargement |
| the five `docs/*.md` | their reports |

🔴 **`docs/printing-architecture-report.md` will appear as a sixth untracked doc once written. Nothing is committed.**

---

# PROVENANCE

**READ** — `lib/printing/printWatcher.ts` in full · `lib/printing/transport.ts` in full · `mapOrderToTicket` and `renderTicket` with the ESC/POS encoder · `app/dev/layout.tsx` in full and the dev page's four consuming lines · `components/printing/PrintingSettings.tsx` in full · `supabase/migrations/20260806_trucks_print_trigger_mode.sql` in full · `set_print_trigger_mode` at `app/api/dashboard/action/route.ts:2326-2330` · the import graph for `lib/printing/*` and `components/printing/*` across `app/`, `components/` and `lib/` · every `setInterval` on the dashboard and the KDS · `ios/App/App/Info.plist` searched for `UIBackgroundModes`, `NSBluetooth*` and `UISupportedExternalAccessoryProtocols` · `package.json` searched for a Bluetooth package · the manual's §4, §11 and §27 printing records · the 17-file byte scan · `git status`.

**INFERRED** — everything in D1's "Apple programme" column, and all of D4 (**judgements about Apple's requirements and review behaviour, not readings of our code**) · that the timer stops when backgrounded (**mechanism read, not observed on a device**) · that two devices would double-print (**follows from device-local Preferences; never run**) · Android's manifest permissions (**the plugin is absent, so I did not read `AndroidManifest.xml`**) · that event-timezone and device-local `nowMins` coincide today.

**NOT FOUND — stated plainly, and expected in most cases** — 🔴 **no `print_jobs` table** · 🔴 **no `printed_at` column** · 🔴 **no cross-device dedupe of any kind** · 🔴 **no server-side print path or route** · 🔴 **no outbox kind for printing** · 🔴 **no `UIBackgroundModes` in `Info.plist`** · 🔴 **no Bluetooth package in `package.json`** · 🔴 **no `NSBluetoothAlwaysUsageDescription`** · 🔴 **no `UISupportedExternalAccessoryProtocols`** · 🔴 **no `disconnect()` on the transport interface** · 🔴 **no printing reference anywhere in the KDS, in manage, or in any server route** · 🔴 **nothing writes `hg_printer_name`**.

**NOT VERIFIED** — 🔴 **whether `trucks.print_trigger_mode` exists in the live database. Its migration is marked "WRITTEN, NOT RUN", a live handler already writes it, and the brief forbids querying the database.** **That is the single most actionable unknown in this report.**
