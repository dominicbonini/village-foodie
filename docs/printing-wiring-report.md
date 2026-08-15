# Printing wired to the transport boundary

**Four files: `lib/printing/transport.ts` (widened + the stub made honest), `lib/printing/usePrinting.ts` (NEW — the bridge), `app/dashboard/[token]/page.tsx` (the one mount), `components/printing/PrintingSettings.tsx` (honest state, no new controls).** No `next dev`, no `next build`, no `cap sync`, no deploys, no commit, **no package installed**. `tsc` clean.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**
🔴 **NO BLUETOOTH: no package, no `Info.plist` key, no permission, no pairing UI, no scan button.**

> ## 🔴 E3 FIRST, BECAUSE THE BRIEF'S PREMISE IS TRUE BUT MISLEADING AND IT CHANGES WHO IS AFFECTED.
> **"Neither is on Max" — correct. But `TRIAL_FEATURES = [...MAX_FEATURES]` (`lib/features.ts:60`), and `docs/ios-compliance-report.md:100` records *"Pizzeria Gusto · Trial plan (trial)"* with the manual giving expiry 17 October.**
> ✅ **SO `canAccess('trial', 'ticket_printing', …)` RETURNS TRUE. GUSTO IS ENTITLED TO TICKET PRINTING TODAY.** They are not "unaffected because they are not on Max" — they are affected exactly as a Max truck would be.
> ✅ **WHAT ACTUALLY PROTECTS THEM IS THE DEVICE TOGGLE, NOT THE PLAN:** `hg_print_enabled` defaults to off (`setEnabled(en === 'true')`), and the card is native-app-only. **Unless someone switched printing on inside the app on that iPad, the watcher does not mount at all.** See E3 for the full statement.

---

# PART A — THE WATCHER IS MOUNTED

## A1. `usePrintWatcher`, quoted before anything changed

**READ, `lib/printing/printWatcher.ts:168-271`. The signature:**

```ts
export function usePrintWatcher<T extends DueOrder>(args: {
  orders: T[]
  mode: PrintTriggerMode
  leadMins: number
  nowMins: () => number
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

**The pump, and the single timer that drives it:**

```ts
    const tick = async () => {
      if (!ready.current || inFlight.current) return   // never print before the durable set is resolved
      const due = selectDueToPrint(ordersRef.current, { mode, nowMins: nowRef.current(), leadMins, printed: printed.current, eligible })
      if (!due.length) return
      inFlight.current = true
      try {
        for (const o of due) {
          …
          if (res.outcome === 'printed') {
            printed.current.add(o.order_key)          // 🔴 THE ONLY PLACE A KEY ENTERS ON A PRINT
```
```ts
    const id = setInterval(() => { void tick() }, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
```

🔴 **`printWatcher.ts` IS UNCHANGED BY THIS TASK — it is absent from the diff.** It was already complete; it just had no caller.

## A2. 🔴 ONE SURFACE: **THE OPERATOR DASHBOARD. NOT THE KDS.**

**Mounted at `app/dashboard/[token]/page.tsx`, immediately after `activeEvent` resolves:**

```tsx
  const printing = usePrinting({
    token,
    orders,
    truck,
    event: activeEvent,
    payments,
    heldAuthorisations,
    canPrint: canPrintTickets,
    mode: truck?.print_trigger_mode==='on_confirmed' ? 'on_confirmed' : 'lead_time',
  })
```

**With the reason recorded where the next person will read it:**

```tsx
  // ── 🔴 KITCHEN TICKET PRINTING — THE ONE MOUNT OF THE PRINT WATCHER ────────────────────────────────
  // MOUNTED HERE AND NOWHERE ELSE. The dedupe record is device-local Capacitor Preferences; there is no
  // print_jobs table and no orders.printed_at, so a SECOND mounted watcher does not race this one, it
  // duplicates it — two devices at one event would each print every ticket, at the same moment, because
  // the trigger mode is truck-level and both agree on when a ticket is due. DO NOT MOUNT ON THE KDS.
```

> ## ✅ **STATED PLAINLY: THE OPERATOR DASHBOARD IS THE PRINTING SURFACE. THE KDS PRINTS NOTHING.**
> **REPORTED SEPARATELY, as required:**
> - **DASHBOARD** — mounts `usePrinting`, renders the settings card, owns the transport. **The only surface that can produce a ticket.**
> - **KDS** — 🔴 **untouched. `app/dashboard/[token]/kds/page.tsx` is ABSENT from the diff and contains no printing reference at all.** Its own 15 s and 60 s intervals are unrelated and unchanged.

## A3. The gates, quoted — **three, all required**

**In the bridge, `lib/printing/usePrinting.ts`:**

```ts
  // 🔴 THE THREE GATES, ALL REQUIRED. Native app (a browser has no printer), the PLAN (printing is Max),
  // and the device's own On/Off. Any false and the watcher does not run at all — not "runs and does
  // nothing", which would still burn a timer and still write the durable set.
  const active = isNativeApp() && canPrint && enabled && ready
```

**The plan gate, resolved once on the dashboard and passed down:**

```tsx
  // 🔴 THE PLAN GATE IS THE SAME PREDICATE THE SETTINGS CARD USES, resolved once here and passed down, so
  // the card and the watcher can never disagree about whether this truck may print.
  const canPrintTickets = canAccess(truck?.plan ?? 'starter', 'ticket_printing', truck?.feature_overrides ?? {}, truck?.trial_expires_at ?? null)
```

**The device setting, read from the same key the card writes:**

```ts
const K = { printer: 'hg_printer_name', lead: 'hg_print_lead_mins', paper: 'hg_paper_width', enabled: 'hg_print_enabled' } as const
```
```ts
      const en = (await Preferences.get({ key: K.enabled })).value
      …
      setEnabled(en === 'true')
```

**And the card's own gate, unchanged, for comparison — `PrintingSettings.tsx:71-76`:**

```tsx
  if (!isNativeApp() || !ready) return null
  const canPrint = canAccess(plan, 'ticket_printing', featureOverrides ?? {}, trialExpiresAt)
  if (!canPrint) return null
```

✅ **Same predicate, same arguments, on both sides.** ⚠️ **The bridge READS the four Preferences keys and never writes them — the card owns them, and two writers on one value would race.** **Cost: a change in the card takes effect on the next dashboard load, the same contract the card's own state already has.**

## A4. Backgrounded, or the screen asleep — **A KNOWN LIMIT, STATED, NOT SOLVED**

**Recorded in the code at the mount site:**

```tsx
  // ⚠️ CLIENT-SIDE, AND THAT IS A KNOWN LIMIT, NOT AN OVERSIGHT: the watcher is a 20s interval inside this
  // page. Backgrounding the app suspends it (Info.plist declares NO UIBackgroundModes), and navigating to
  // the KDS unmounts this page and stops it. Keep-awake holds the SCREEN on, not the app foregrounded.
  // Nothing is lost by that — an order that did not print is still DUE and prints on the next tick once
  // this screen is live again — but tickets do not appear while the dashboard is not on screen.
```

| Situation | What happens |
|---|---|
| **App backgrounded** | 🔴 **The timer stops.** iOS suspends the WebView's JS; `Info.plist` has **no `UIBackgroundModes`** |
| **Screen sleeps** | ⚠️ **Depends on keep-awake, which holds the SCREEN on, not the app foregrounded** |
| **Operator opens the KDS** | 🔴 **This page unmounts, `clearInterval` fires, printing stops until they come back** |
| **WebView process killed / reload** | ✅ **Survivable** — the printed-set is durable in Preferences |

✅ **NOTHING IS LOST IN ANY OF THEM: an order that did not print is still DUE, and the selector recomputes that from the orders themselves.** 🔴 **NOT SOLVED HERE, per the instruction. A background-capable design is a different task and needs a native mode this app does not declare.**

---

# PART B — BOTH TRIGGERS

## B1. `on_confirmed` — the status transition it hangs off

**READ, `printWatcher.ts` — the eligibility list IS the transition:**

```ts
/** Statuses that mean "this order has been ACCEPTED and should be made". Excludes pending/cancelled/rejected. */
const DEFAULT_ELIGIBLE = ['confirmed', 'cooking', 'ready']
```
```ts
    if (opts.mode === 'on_confirmed') return true
```

🔴 **THE TRANSITION IS `pending → confirmed`, AND IT IS OBSERVED BY POLLING, NOT BY AN EVENT.** The order array the dashboard already holds changes status when the operator accepts (or auto-accept does), and the next tick sees `status === 'confirmed'` and selects it. ⚠️ **So "as soon as you accept" means within 20 seconds.** ✅ **A walk-up is created `'confirmed'`, so it fires at creation.** ✅ **A rejected or cancelled order is never eligible, so it never prints — the guard that stops food being started for an order about to be refused.**

## B2. Lead time — the truck column, the device minutes, and **the existing interval reused**

**Mode comes from the column, LIVE-VERIFIED by you as existing:**

```tsx
    mode: truck?.print_trigger_mode==='on_confirmed' ? 'on_confirmed' : 'lead_time',
```

**Lead minutes come from the device key, defaulting to 10:**

```ts
      const l = parseInt((await Preferences.get({ key: K.lead })).value ?? '10', 10)
      …
      setLead(Number.isFinite(l) ? l : 10)
```

**🔴 NO SECOND TIMER WAS ADDED. The watcher's own interval is the only clock for printing:**

```ts
    const id = setInterval(() => { void tick() }, intervalMs)
```

**with `intervalMs = 20000` by default and the bridge NOT overriding it:**

```ts
  usePrintWatcher<Order>({
    orders,
    mode,
    leadMins: lead,
    nowMins: nowMinsLocal,
    onPrint,
    storageKey: token,
    enabled: active,
  })
```

⚠️ **ONE OTHER INTERVAL WAS ADDED AND IT DOES NOT PRINT: a 20 s poll of `transport.status()` so the card can say WHY nothing is connected.** **It performs no I/O beyond an in-memory read from the stub and triggers no ticket.** 🔴 **Declared rather than hidden — the instruction was not to add a second timer for the TRIGGER, and this is not one.**

## B3. 🔴 The late walk-up — due in 5 minutes with a 10-minute lead

**The rule, unchanged, from `selectDueToPrint`:**

```ts
    const due = timeToMins(o.slot)
    if (due == null) return true
    return opts.nowMins >= due - opts.leadMins
```

> ## ✅ **IT PRINTS IMMEDIATELY, ON THE VERY NEXT TICK. HANDLED BY NOT BREAKING IT.**
> **`nowMins` (12:00 = 720) `>= due − lead` (12:05 − 10 = 715). 720 ≥ 715 → TRUE.** 🔴 **The condition is "the lead window has OPENED", not "we are inside it", so a window that opened in the past is due NOW. There is no upper bound and no expiry.**
> ✅ **AND AN ASAP ORDER — no parseable slot — is `due == null` → `return true`, i.e. due now, by the same one rule.**
> 🔴 **I CHANGED NOTHING IN THE SELECTOR. The correct behaviour was already there; the task was to mount the thing that calls it.** ⚠️ **What makes this SAFE at mount is priming (C4): without it, every already-open window in the day would fire at once the first time printing is switched on.**

## B4. Dedupe — once per device per order, and what a restart does

**READ, the durable record, unchanged:**

```ts
const PRINTED_KEY_PREFIX = 'hg_printed_keys_'
```
```ts
interface PrintedRecord {
  mode: PrintTriggerMode
  /** SUCCESSFUL prints only. */
  keys: string[]
  /** Attempted-but-not-printed, keyed by order_key. Optional so an older record still loads. */
  unsettled?: Record<string, UnsettledRecord>
}
```

**and the one place a key enters:**

```ts
          if (res.outcome === 'printed') {
            printed.current.add(o.order_key)          // 🔴 THE ONLY PLACE A KEY ENTERS ON A PRINT
```

**`storageKey` is the dashboard token, so the record is per truck per device:**

```ts
    storageKey: token,
```

| | |
|---|---|
| **Once per device per order?** | ✅ **YES.** A key enters only on `'printed'`, and `selectDueToPrint` skips anything in the set |
| **On app restart / reload / process kill** | ✅ **The set is reloaded from Preferences and printing resumes where it left off — already-printed orders are NOT reprinted.** The watcher's header records that this was once an in-memory `useRef` and reprinted everything on reload |
| **On a MODE CHANGE** | ⚠️ **The stored record carries the mode it was primed under; a different mode RE-PRIMES rather than replaying history** |
| **Across two devices** | 🔴 **NO DEDUPE. Which is exactly why A2 mounts one surface only** |

---

# PART C — THE TRANSPORT BOUNDARY

## C1. The interface as it was — shaped for a stub

**READ, `lib/printing/transport.ts` before this task:**

```ts
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

🔴 **No `disconnect()`. No permission or availability step. `status()` could only describe a connection, never the absence of one — and `sendBytes` could not fail.**

## C2. The widened interface, in full

```ts
/** Can this device print at all, before any pairing question. Four ANSWERS, not a boolean, because the UI
 *  must be able to tell an operator WHICH wall they hit — "turn Bluetooth on" and "this iPad cannot print"
 *  are different instructions and a false would collapse them. */
export type PrinterAvailability =
  | 'available'
  | 'unsupported'
  | 'unauthorised'
  | 'off'

export interface PrinterStatus {
  connected: boolean
  /** The paired device's name when there is one, for the settings card to display. */
  printerName?: string
  paperOut?: boolean
  coverOpen?: boolean
  /** Operator-facing reason, shown when `connected` is false. Never a stack trace. */
  detail?: string
}

export interface PrinterTransport {
  /** Ask before scanning. Cheap, and safe to call on every render of the settings card. */
  availability(): Promise<PrinterAvailability>
  scan(): Promise<DiscoveredPrinter[]>
  connect(printerId: string): Promise<PrintResult>
  /** Release the pairing. Idempotent — calling it when nothing is connected is not an error. */
  disconnect(): Promise<void>
  sendBytes(bytes: Uint8Array): Promise<PrintResult>
  status(): Promise<PrinterStatus>
}
```

✅ **`sendBytes` IS DELIBERATELY UNCHANGED** — it is the one method the renderer feeds, it already takes the exact `Uint8Array` `renderTicket` emits, and the whole pipeline depends on that shape.
🔴 **`PrinterAvailability` IS FOUR ANSWERS, NOT A BOOLEAN**, because "radio off", "permission refused" and "this build cannot print" are three different instructions to an operator and a boolean collapses them.

**And a module singleton, because a printer is one device:**

```ts
let _transport: PrinterTransport | null = null

/** The app's single transport. Phase B swaps the constructor here and nothing else changes. */
export function getPrinterTransport(): PrinterTransport {
  if (!_transport) _transport = createStubTransport(() => { /* no sink in the app; see the note above */ })
  return _transport
}
```

## C3. The stub — still the ONLY implementation, now honest

```ts
export function createStubTransport(sink: (bytes: Uint8Array) => void): PrinterTransport {
  return {
    async availability() { return 'unsupported' },
    async scan() { return [] },
    // Nothing can be discovered, so any id passed here was not obtained from scan().
    async connect() { return { ok: false, error: 'No printer support in this build' } },
    async disconnect() { /* nothing to release */ },
    async sendBytes(bytes) {
      sink(bytes)
      return { ok: false, error: 'No printer connected' }
    },
    async status() { return { connected: false, detail: 'No printer support in this build' } },
  }
}
```

| Method | Was | **Now** |
|---|---|---|
| `availability()` | — | **`'unsupported'`** |
| `scan()` | `[]` | `[]` (unchanged — honest already) |
| `connect()` | **`{ ok: true }`** | 🔴 **`{ ok: false, error: 'No printer support in this build' }`** |
| `disconnect()` | — | no-op |
| `sendBytes()` | **`{ ok: true }`** | 🔴 **`{ ok: false, error: 'No printer connected' }`** — the sink still receives the bytes |
| `status()` | **`{ connected: true }`** | 🔴 **`{ connected: false, detail: 'No printer support in this build' }`** |

> ## 🔴 THIS IS A BEHAVIOUR CHANGE, NOT A TIDY, AND IT IS THE MOST IMPORTANT LINE IN THE TASK.
> **Wired to a live watcher, the old `ok: true` / `connected: true` would have been the WORST possible failure: every ticket recorded as PRINTED SUCCESSFULLY while no paper moved — and the durable printed-set would make it PERMANENT. Each order marked done, never retried, invisibly missing from the kitchen.** ✅ **The stub now models a device that must be found and then connected. Nothing can be found, so nothing can be connected, so `sendBytes` refuses.**

## C4. 🔴 A ticket with no transport — **NOT LOST, AND NOT SILENT**

**What happens, exactly:** `onPrint` maps and renders the ticket, calls `sendBytes`, gets `{ ok: false }`, and returns:

```ts
      if (res.ok) return { outcome: 'printed' }
      // 🔴 A REFUSAL IS 'failed' — the transport is certain nothing came out. The stub always lands here.
      return { outcome: 'failed', error: res.error }
```

**The watcher then leaves the key OUT of the printed set, and the next tick re-selects the order.**

> ## ✅ **THE RETRY IS THE QUEUE. There is no second queue, no outbox kind, no extra timer — a ticket that failed is still DUE, and "still due" is recomputed from the orders themselves every 20 seconds.**
> ✅ **AND IT IS NOT SILENT: the printing card now shows the count of waiting tickets (D1). The operator can see the consequence, not just the state.**

### Priming versus flush-on-connect — **I CHOSE PRIMING. It was already implemented; I did not change it.**

**READ, the watcher's own note on the open question:**

```ts
        // 🔴 PRIME: first run, or the mode changed. Absorb everything currently due WITHOUT printing.
        // ⚠️ THIS IS THE ONE DELIBERATE EXCEPTION to "a key enters only on a successful print", and it
        // is UNRESOLVED, not settled. Priming and flush-on-connect are the same event — a set of already
        // due orders at the moment printing becomes possible — with opposite intended outcomes, and
        // nothing in the order data distinguishes them.
```

**WHY PRIMING:** 🔴 **Because the alternative prints a stack of paper for food that has already been served.** Switching printing on mid-service, or opening the dashboard after an hour of trading, makes every accepted order in the day simultaneously "due" — in `on_confirmed` mode, literally all of them. **Flush-on-connect would print the lot.** ✅ **A missing ticket for an order already handed over costs nothing; a pile of tickets for served food costs the operator's trust in the feature on day one.**

**WHAT FLUSH-ON-CONNECT WOULD HAVE MEANT:** the moment a printer connects, every currently-due unprinted order prints. ✅ **It is the RIGHT answer for one case — a printer that dropped mid-service and came back, where those tickets are genuinely outstanding.** 🔴 **And nothing in the order data distinguishes that case from "the operator just turned printing on", which is why the watcher calls it unresolved rather than solved.**

⚠️ **THE COST OF MY CHOICE, STATED: orders already due when the watcher mounts will NEVER print on that device.** **Only orders that become due afterwards print.** 🔴 **Resolving it properly needs a real connection state — a transition from not-connected to connected — which does not exist until a real transport does. The widened interface (C2) is what makes that resolvable later; today `availability()` and a truthful `status()` are the two facts a flush would key off.**

## C5. The renderer and the mapper

> ## ✅ **BOTH UNCHANGED. `lib/printing/ticket.ts`, `lib/printing/mapOrderToTicket.ts` and `lib/printing/printWatcher.ts` are ALL ABSENT from the diff** — verified with `git diff --name-only`.
> **They already worked. The bridge calls them; it does not touch them.**

---

# PART D — OPERATOR VISIBILITY

## D1. What an operator with printing on and no printer sees

**Added to the EXISTING printing card — no new settings surface:**

```tsx
          {!connected && (
            <p className="text-xs text-slate-500 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
              <strong className="text-amber-800">No printer connected.</strong>{' '}
              {statusDetail ? `${statusDetail}. ` : ''}Bluetooth printer pairing isn&apos;t available yet —
              you can set your preferences here now and they&apos;ll apply as soon as it arrives.
              {waitingCount > 0 && (
                <span className="block mt-1 font-semibold text-amber-800">
                  {waitingCount === 1 ? '1 ticket is waiting' : `${waitingCount} tickets are waiting`} and will
                  print once a printer is connected. Nothing has been lost.
                </span>
              )}
            </p>
          )}
```

🔴 **THE NOTICE NOW KEYS OFF THE REAL TRANSPORT (`!connected`), NOT OFF A PREFERENCES KEY (`!printer`).** ⚠️ **And it carries the transport's own `detail` — so "no printer support in this build" reaches the operator instead of a bare amber box.**

**Fed from the dashboard's single source:**

```tsx
connected={printing.status.connected} statusDetail={printing.status.detail} waitingCount={printing.waitingCount}
```

**Why the card asks nothing itself:**

```tsx
  // ── 🔴 THE LIVE TRANSPORT STATE, PASSED IN — THE CARD ASKS NOTHING ITSELF (15 August 2026) ──────
  // These come from usePrinting on the dashboard, which owns the app's ONE transport. The card
  // reading its own status would create a second answer to "is a printer connected", and the two
  // could disagree on screen at the same moment.
```

## D2. 🔴 NO DEAD CONTROLS — **BECAUSE NO CONTROL WAS ADDED**

| Control added | — |
|---|---|
| A "Scan for printers" button | 🔴 **NOT ADDED** |
| A "Connect" button | 🔴 **NOT ADDED** |
| A "Retry printing" button | 🔴 **NOT ADDED** |
| **Anything clickable at all** | 🔴 **NOTHING. The complete list is empty.** |

**Recorded in the code:**

```tsx
              🔴 NO CONTROL WAS ADDED HERE, DELIBERATELY (manual N5). A "Scan for printers" button with no
              radio behind it is precisely the dead control that rule forbids: something an operator can
              press that cannot act. This is STATE, not a control — it reports and asks for nothing.
```

> ## ✅ **N5 SATISFIED BY CONSTRUCTION: a control that cannot act does not exist here, so there is nothing that has to explain itself.**
> ⚠️ **The card's PRE-EXISTING controls are all still live and still act: the master toggle, paper width, lead minutes and the trigger radios all write real values that the watcher now actually reads.** 🔴 **That is new — before this task those four settings were durable and completely inert.**

---

# PART E — BOUNDARIES

## E1. `git diff --stat`

```
 app/dashboard/[token]/page.tsx                     | 219 +++++++++++++--------
 app/landing/page.tsx                               |   4 +-
 components/dashboard/OrderCard.tsx                 |  21 +-
 components/native/NotificationSettings.tsx         |   2 +-
 components/native/OperatorDeviceConfig.tsx         |   4 +-
 components/printing/PrintingSettings.tsx           |  74 +++++--
 .../AppIcon.appiconset/AppIcon-512@2x.png          | Bin 14883 -> 16103 bytes
 lib/plan-features.ts                               |   2 +-
 lib/printing/transport.ts                          |  88 ++++++++-
 9 files changed, 292 insertions(+), 122 deletions(-)
```
*(plus the untracked new file `lib/printing/usePrinting.ts`)*

> ## ✅ NO PAYMENT PATH, GATE, MIGRATION OR TYPE.
> 🔴 **`lib/payments/*` — ABSENT.** No capture, no ledger, no refund. 🔴 **`lib/features.ts` — ABSENT.** The gate is CONSUMED, never edited. 🔴 **`supabase/migrations/` — ABSENT.** No column, no migration; `print_trigger_mode` is read, not altered. 🔴 **`components/dashboard/types.ts` — ABSENT.** 🔴 **`app/api/**` — ABSENT.** No route changed. 🔴 **`lib/printing/{ticket,mapOrderToTicket,printWatcher}.ts` — ABSENT.**

## E2. No package installed

```
$ git diff --stat package.json package-lock.json
(no output — both are ABSENT from the diff)
```

✅ **NOTHING WAS INSTALLED. `@capacitor-community/bluetooth-le` is not present and was not added.** ✅ **No `Info.plist` key, no privacy-manifest entry, no permission string — `ios/` contains only the earlier app-icon change.**

## E3. 🔴 Pizzeria Gusto and Tikka Tonic — **the premise checked, and it needed checking**

**READ:**
- **`lib/features.ts:60` — `const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]`, and `:78` — `trial: new Set(TRIAL_FEATURES)`.**
- **`docs/ios-compliance-report.md:100` — `│ Pizzeria Gusto · Trial plan (trial) │`, and `:163` — *"Gusto is `plan = 'trial'`, expiry 17 October"*.**
- **`docs/reference-manual.md:535`** gives the same expiry.

> ## 🔴 **"NEITHER IS ON MAX" IS TRUE AND DOES NOT MEAN WHAT IT SOUNDS LIKE. A TRIAL TRUCK HAS THE ENTIRE MAX FEATURE SET, SO `canAccess('trial', 'ticket_printing', …)` IS TRUE FOR GUSTO UNTIL 17 OCTOBER.**

**Pizzeria Gusto (trades with real money):** **On the WEB — nothing whatsoever; the card and the watcher are both `isNativeApp()`-gated.** **In the NATIVE APP their plan does entitle them, so the deciding factor is the device toggle: `hg_print_enabled` defaults to off, and if it was never switched on the watcher does not mount and they see no change at all; if it WAS switched on, they now get an amber "N tickets are waiting" line on the printing card and a 20-second timer that renders tickets and is refused — 🔴 no paper, no order mutation, no payment path, nothing lost.**

**Tikka Tonic (handed over):** ⚠️ **THEIR PLAN IS NOT RECORDED ANYWHERE I CAN READ — "not found" in the repo and the docs, and I did not query the database.** **So: if they are on trial/tester/Max and someone switched printing on in the app, they see exactly what Gusto would; on any other plan, or on the web, or with the toggle off, they see nothing.** 🔴 **UNVERIFIED, and stated as such rather than assumed.**

## E4. Customer-facing surfaces

> ## ✅ **NONE AFFECTED.** The bridge mounts inside the operator dashboard and self-gates on `isNativeApp()`; the card is native-and-Max-only; the transport touches no network.
> **No customer route, email, order page, menu or discovery surface is in the diff.** ⚠️ **The watcher READS orders and payments; it writes nothing to the server and mutates no order. `onPrint` performs no fetch.**

---

# PART F — INTEGRITY

## F1 / F2. Non-ASCII census, before and after

### `lib/printing/transport.ts` — 2,809 → 8,030 bytes (+5,221), 48 → 118 lines

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS | 61 | 165 | **+104** | four new `──` section rules in the file's existing style |
| U+2014 EM DASH | 5 | 17 | **+12** | prose in the new doc comments |
| U+2022 BULLET | 2 | 5 | **+3** | the `•` list style the file already used, extended to the three additions |
| U+2192 RIGHTWARDS ARROW | 6 | **2** | **−4** | 🔴 **a REDUCTION — the rewritten header carries fewer `->` arrows. The CLASS survives; only the count fell** |

🔴 **4 → 4 distinct. GAINED NONE, LOST NONE.**

> ## ⚠️ AND THIS FILE ALMOST FAILED THE CENSUS — CAUGHT BY RUNNING IT, NOT BY REVIEW.
> **My first draft of the rewritten header used this repo's usual 🔴 and ⚠️ markers and GAINED THREE CLASSES — U+1F534, U+26A0 and U+FE0F — in a file that had never held one.** 🔴 **The census caught it; the markers were rewritten as ASCII (`NOTE:`, capitals) to match the file's own voice, and the re-run shows 4 → 4.** ✅ **That is the fourth time this check has caught a real violation, and the first time in a file I had rewritten wholesale rather than edited.**

### `components/printing/PrintingSettings.tsx` — 15,313 → 17,437 bytes (+2,124), 212 → 237 lines

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 | 205 | 234 | **+29** | one new `──` rule in the props comment |
| U+2014 EM DASH | 18 | 22 | **+4** | prose in the two new comments |
| U+1F534 LARGE RED CIRCLE | 10 | 14 | **+4** | four emphasis markers, in a file that already had ten |

🔴 **10 → 10 distinct. GAINED NONE, LOST NONE.**

### `app/dashboard/[token]/page.tsx` — 375,186 → 377,156 bytes (+1,970), 4,862 → 4,888 lines

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 | 1,891 | 1,925 | **+34** | one `──` rule on the mount comment |
| U+2014 EM DASH | 480 | 485 | **+5** | prose |
| **U+26A0** | **59** | **60** | **+1** | the client-side-limit caveat |
| **U+FE0F** | **57** | **58** | **+1** | 🔴 **its pair — the two moved together, which is the check** |
| U+1F534 | 74 | 76 | **+2** | two emphasis markers |

🔴 **53 → 53 distinct. GAINED NONE, LOST NONE.**

### `lib/printing/usePrinting.ts` — **NEW FILE, 10,726 bytes, 193 lines, 7 classes**

**No before-state exists, so no comparison is possible — stated rather than faked.** Classes: U+2500 (202), U+2014 (14), U+1F534 (7), U+26A0 (2), U+FE0F (2), U+2192 (1), U+2026 (1). ✅ **Every class it uses already exists throughout `lib/`; it introduces no glyph the codebase did not have.**

## F3. 🔴 U+26A0 / U+FE0F pair counts — every edited file **and** this report

| File | U+26A0 | U+FE0F | Bare | Verdict |
|---|---|---|---|---|
| `lib/printing/transport.ts` | **0** | **0** | 0 | ✅ **PAIRED** (trivially — no warning glyph, by design) |
| `lib/printing/usePrinting.ts` *(new)* | 2 | 2 | **0** | ✅ **PAIRED** |
| `components/printing/PrintingSettings.tsx` | 2 | 2 | **0** | ✅ **PAIRED**, before and after |
| `app/dashboard/[token]/page.tsx` | **60** | **58** | **3** | 🔴 **UNPAIRED — PRE-EXISTING, and my +1/+1 moved together** |
| **`docs/printing-wiring-report.md`** | equal | equal | **0** | ✅ **PAIRED** — verified by scanning the written file |

⚠️ **The dashboard file was 59/57 with three bare glyphs before this task and is 60/58 with three after — I added one PAIRED sequence and did not touch the three bare ones.** 🔴 **The pre-existing defect is unchanged and still outside scope; `OrderCard.tsx` has the same shape.**

## F4. Byte scan — byte-level, never `grep`

```
lib/printing/transport.ts                    8,030 bytes   NUL 0   control none
lib/printing/usePrinting.ts                 10,726 bytes   NUL 0   control none
components/printing/PrintingSettings.tsx    17,437 bytes   NUL 0   control none
app/dashboard/[token]/page.tsx             377,156 bytes   NUL 0   control none
```

✅ **Clean. Four files touched, four files scanned.**

## F5. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## F6. `git status` — which entries are THIS task's

```
$ git status --porcelain
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M components/dashboard/OrderCard.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
 M ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 M lib/plan-features.ts
 M lib/printing/transport.ts
?? docs/app-icon-report.md
?? docs/device-naming-report.md
?? docs/printing-architecture-report.md
?? docs/printing-ui-report.md
?? docs/push-registration-report.md
?? docs/settings-grouping-report.md
?? lib/printing/usePrinting.ts
```

| Entry | Whose |
|---|---|
| 🔴 **`lib/printing/transport.ts`** | **THIS TASK ONLY** — first appearance in the tree |
| 🔴 **`lib/printing/usePrinting.ts`** | **THIS TASK ONLY** — new file |
| 🔴 **`app/dashboard/[token]/page.tsx`** | **THIS TASK** *(the mount)* — **and earlier: the settings grouping, both passes** |
| 🔴 **`components/printing/PrintingSettings.tsx`** | **THIS TASK** *(props + notice)* — **and earlier: the lead-time move, the chip removal, the label renames** |
| ✅ **`docs/printing-wiring-report.md`** | **THIS TASK** |
| `app/landing/page.tsx`, `components/native/*` | earlier — the device-naming copy sweep |
| `components/dashboard/OrderCard.tsx` | earlier — the caption wrap fix |
| `lib/plan-features.ts` | earlier — the plan cell revert |
| `ios/…/AppIcon-512@2x.png` | earlier — white ground, then scale 830 |
| the six other `docs/*.md` | earlier — their reports |

⚠️ **THE TREE HAS BEEN DIRTY ALL SESSION.** ✅ **`lib/printing/transport.ts` and `lib/printing/usePrinting.ts` are the two clean signals — entirely this task.** 🔴 **Nothing is committed.**

## F6b. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

⚠️ **AND IT IS WORTH MORE HERE THAN ON A LAYOUT CHANGE, BUT STILL NOT VERIFICATION.** ✅ **It does prove something real this time: the bridge satisfies `usePrintWatcher`'s generic constraint with the dashboard's actual `Order` type, and `mapOrderToTicket`'s exhaustive input is fully supplied — the class of bug the mapper's own header says the compiler exists to catch.** 🔴 **It proves nothing about WHEN a ticket fires, and nothing was rendered or run.**

---

# PART G — WHAT TO TEST

> ⚠️ **PREREQUISITES: a rebuild and reinstall (the bridge is web code, but the card is native-only, so it must be exercised in the app), a truck on Max/trial/tester, and the printing master toggle switched ON in dashboard → Settings.** **Nothing below is observable on the web.**

**1. The card tells the truth with no printer**
Open dashboard → Settings → Kitchen ticket printing, toggle ON.
**PASS:** the amber box reads *"No printer connected. No printer support in this build. Bluetooth printer pairing isn't available yet…"*
**FAILURE:** a green "● Connected" chip, or the old copy with no reason.

**2. `on_confirmed` — a ticket becomes due on acceptance**
Set trigger to *"As soon as you accept the order"*. Place a customer order, leave it pending, then Accept it.
**PASS:** within ~20 s the card's waiting count increases by one.
**FAILURE:** the count never moves, or it moved while the order was still PENDING — 🔴 **a pending order must never print.**

**3. `lead_time` — a ticket becomes due before collection**
Set trigger to *"A set time before collection"*, lead 10 minutes. Accept an order due 15 minutes out.
**PASS:** the count does NOT rise immediately; it rises once you are within 10 minutes of the slot.
**FAILURE:** it rises at once (the lead is being ignored), or never (the clock is not being read).

**4. 🔴 THE LATE WALK-UP — the case B3 exists for**
With lead 10, add a walk-up due in 5 minutes.
**PASS:** it counts as waiting **immediately** — the window opened in the past, so it is due now.
**FAILURE:** it never counts. **That would mean the rule became "inside the window" instead of "the window has opened", and a late order would never print.**

**5. Restart dedupe**
With several waiting, force-quit the app and reopen to the dashboard.
**PASS:** the count returns to roughly what it was; the app does not behave as though the day just started.
**FAILURE:** the count jumps to every accepted order in the day — **the durable set is not loading.**

**6. Priming — turning printing ON mid-service must not queue the backlog**
With a day's worth of accepted orders, switch the master toggle OFF, reload the dashboard, then switch it ON and reload again.
**PASS:** the waiting count is **0 or near it** — everything already due was absorbed, not queued.
**FAILURE:** every accepted order in the day is counted as waiting. ⚠️ **That is the exact burst priming exists to prevent.**

**7. The KDS prints nothing**
Open the KDS and leave it up.
**PASS:** no printing UI, no change in behaviour — the KDS has no watcher.
**FAILURE:** any printing state on the KDS — **that would be the double-print path A2 forbids.**

**8. Backgrounding — a stated limit, not a bug**
With orders due, background the app for two minutes and return.
**PASS:** the count updates when you come back. **Nothing is lost.**
**FAILURE:** the count is wrong on return, or orders that became due while backgrounded are permanently skipped.

**9. Web is untouched**
Open the dashboard in a browser on the same truck.
**PASS:** no printing card, no waiting count, no change of any kind.
**FAILURE:** anything printing-related renders — **the `isNativeApp()` gate has failed.**

🔴 **NONE OF THIS TESTS PAPER. There is no transport. What it tests is that the right orders become due at the right moment, exactly once, and that an operator can see it.**

---

# PROVENANCE

**READ** — `usePrintWatcher` in full · `selectDueToPrint`, `DEFAULT_ELIGIBLE`, `PrintedRecord` and the priming branch · `transport.ts` before and after · `mapOrderToTicket`'s `MapTicketInput` and `reprintFromContext` · `renderTicket`'s signature · `PrintingSettings.tsx`'s gates, keys and notice · the dashboard's `orders`, `payments`, `heldAuthorisations`, `activeEvent` and `savePrintTriggerMode` · `lib/features.ts:53-84` for `MAX_FEATURES` / `TRIAL_FEATURES` · `docs/ios-compliance-report.md:100,163` for Gusto's plan · both censuses · the byte scan · `git diff --name-only` for the payment, gate, migration, type and package paths · `git status`, `git diff --stat`, `tsc`.

**INFERRED** — that backgrounding suspends the interval (mechanism read, **not observed**) · that Gusto's device toggle is off (**the default is off; I did not read their device's Preferences**) · that the 20 s status poll is negligible (the stub answers from memory) · that `waitingCount` is an upper bound once a device has printed some, which is stated in the code.

**NOT VERIFIED** — 🔴 **nothing was rendered or run.** No ticket has been produced by this wiring, no timer has been observed to fire, and the transport has never refused a real attempt. 🔴 **Tikka Tonic's plan is unknown — "not found" in the repo, and the database was not queried.** ⚠️ **Part G is the only thing that can show the triggers fire when they should.**
