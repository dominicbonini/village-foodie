# Wired printing — FULL INVESTIGATION

**16 September 2026. READ-ONLY.** No code changed, no package installed, no migration run, nothing written to any database. Every database read was a `GET` through the read-only PostgREST helper.

Figures are marked **LIVE** (read from the production database today), **CODE** (read from the working tree), **VENDOR** (from current vendor/platform documentation, URL cited) or **INFERRED**.

---

## 0. git status (STEP 0)

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
	modified:   app/api/dashboard/route.ts
	modified:   app/api/manage/route.ts
	modified:   app/api/menu/[truckId]/route.ts
	modified:   app/api/slots/[truckId]/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   app/manage/[token]/page.tsx
	modified:   app/trucks/[slug]/order/page.tsx
	modified:   components/dashboard/AddOrderPanel.tsx
	modified:   lib/capacity-breach.ts
	modified:   lib/slot-availability.ts
	modified:   lib/slot-display.ts
	modified:   lib/slot-generation.ts
	modified:   lib/supabase.ts

Untracked files:
	docs/slot-interval-build-report.md
	lib/slot-interval.ts
	scripts/_slot-interval-compile.cjs
	scripts/slot-interval-dots.cjs
	scripts/slot-interval-engine-identity.cjs
	scripts/slot-interval-generator.cjs
	scripts/slot-interval-grid-routing.cjs
	scripts/slot-interval-settings.cjs
	supabase/migrations/20260916_collection_intervals.sql
```

HEAD `fc0fddc outreach`. Every dirty file belongs to the slot-interval workstream. **Nothing in this investigation touched any of them**, and no printing file is dirty — the whole of `lib/printing/`, `components/printing/` and both native projects are at HEAD.

---

# PART A — WHAT EXISTS TODAY

## A1. Inventory

| File | Role | Callers |
|---|---|---|
| `lib/printing/ticket.ts` | The renderer. `buildTicketLines` (the shared layout model), `encodeEscPos`, `renderTicket`, `printableText`, `PaperWidth = 58 \| 80`, `TICKET_LEADING_FEED_LINES = 2`. PURE — emits a `Uint8Array` of ESC/POS. | `usePrinting` (`onPrint`), `app/dev/ticket-preview`, `TicketPreview` (via `buildTicketLines`) |
| `lib/printing/mapOrderToTicket.ts` | `mapOrderToTicket` — real `Order` → `TicketOrder`; `reprintFromContext` — attempt history → the POSSIBLE DUPLICATE marker. Payment arrives PRE-RESOLVED via `paid-step.ts` + `getOrderBalance`. | `usePrinting`, `app/dev/ticket-preview` |
| `lib/printing/printWatcher.ts` | WHEN a ticket prints. `selectDueToPrint` (pure, unit-testable), `usePrintWatcher` (the 20 s pump), `timeToMins`, `DEFAULT_ELIGIBLE`, `PrintOutcome`, `PrintAttemptContext`, `PRINTED_KEY_PREFIX = 'hg_printed_keys_'`. | `usePrinting` (both the hook and the selector), `app/dev/ticket-preview` (`selectDueToPrint`) |
| `lib/printing/transport.ts` | **The seam.** `PrinterTransport`, `PrinterClass`, `PrinterAvailability`, `PrinterStatus`, `DiscoveredPrinter`, `PrintResult`, `createStubTransport`, `getPrinterTransport` (module singleton). | `usePrinting`, `PrintingSettings` |
| `lib/printing/bleTransport.ts` | The one real backend. `createBleTransport`, `reconnectStoredPrinter`, the ranking heuristics, `CHUNK = 180`, `CHUNK_GAP_MS = 12`, the three connect checks. | `transport.ts` (lazy `require`), **`usePrinting` directly** (see A2) |
| `lib/printing/usePrinting.ts` | **The bridge — the only join.** Reads the four device settings, owns the three gates, polls status, reconnects on resume, defines `onPrint`, mounts the watcher, computes `waitingCount`. | `app/dashboard/[token]/page.tsx` **and nowhere else** |
| `components/printing/PrintingSettings.tsx` | The operator card: master toggle, scan/connect/disconnect, ranked device list, trigger mode, lead minutes, paper width. | `app/dashboard/[token]/page.tsx`, Settings tab |
| `components/printing/TicketPreview.tsx` | On-screen render of the same `TicketLine[]` the encoder consumes. Four fidelity gaps fixed 6 Aug 2026. | `app/dev/ticket-preview` |
| `app/dev/ticket-preview/page.tsx` | The Phase-A validation harness. Real `Order`-shaped fixtures through the real mapper. `notFound()`s in production via `app/dev/layout.tsx` (a layout, which does not gate Route Handlers). | — (dev only) |

🔴 **THERE IS NO `scripts/printing-*.cjs` HARNESS.** The `scripts/` directory holds 5 `whatsapp-*`, 7 `outreach-*` and 5 `slot-interval-*` harnesses and **no printing harness at all**. The only executable check on the printing pipeline is a dev page a human has to look at. That is a gap this build should close (C4).

## A2. The transport seam

Quoted verbatim from `lib/printing/transport.ts`:

```ts
export type PrinterClass = 'mfi' | 'ble'

export interface PrintResult { ok: boolean; error?: string }

export type PrinterAvailability =
  | 'available'
  | 'unsupported'
  | 'unauthorised'
  | 'off'

export interface PrinterStatus {
  connected: boolean
  printerName?: string
  paperOut?: boolean
  coverOpen?: boolean
  detail?: string
}

export interface DiscoveredPrinter {
  id: string
  name: string
  class: PrinterClass
  likely?: boolean
}

/** The one seam both Phase-B backends implement. Printer-agnostic + order-agnostic — it only moves bytes. */
export interface PrinterTransport {
  availability(): Promise<PrinterAvailability>
  scan(): Promise<DiscoveredPrinter[]>
  connect(printerId: string): Promise<PrintResult>
  disconnect(): Promise<void>
  sendBytes(bytes: Uint8Array): Promise<PrintResult>
  status(): Promise<PrinterStatus>
}
```

**Is it genuinely transport-agnostic?** At the level of *moving bytes*, yes — and unusually well. `sendBytes(Uint8Array) → PrintResult` is exactly what a TCP socket, a USB bulk transfer or a vendor SDK needs, and every BLE-specific number (`CHUNK = 180`, `CHUNK_GAP_MS = 12`, the `ESC @` probe, the write-characteristic discovery, the `hg_printer_svc`/`hg_printer_chr` keys) lives **below** the seam inside `bleTransport.ts`, where it belongs. The failed/unknown split is expressed in the return contract (`ok: false` vs a throw) rather than in BLE terms, so a wired backend can honour it identically.

**Six things above or across the seam assume BLE.** These are what a wired build has to move, and none is deep:

1. 🔴 **`PrinterClass = 'mfi' | 'ble'` is a closed union with no wired member**, and `DiscoveredPrinter.class` is typed to it. Adding `'net' | 'usb'` is a one-line widening, but it is a type every backend and the settings list touch.
2. 🔴 **`getPrinterTransport()` hard-selects the backend with no input:**
   ```ts
   if (Capacitor.isNativePlatform()) { … _transport = createBleTransport() }
   else { _transport = createStubTransport(…) }
   ```
   There is no per-truck or per-device *kind* consulted — the manual's claim that the backend is "selected by `van_devices.printer_class`" describes a column that **does not exist** (A4, LIVE). A wired build needs a selector here, and the singleton means the choice must be resolvable before the first call.
3. 🔴 **`usePrinting` imports `reconnectStoredPrinter` from `bleTransport` directly** — a BLE-specific function called from the shared bridge, bypassing the interface. This is the one genuine leak above the seam. A wired transport has its own reconnect semantics (a TCP socket is opened per job; there is nothing to "reconnect"), so this either moves onto `PrinterTransport` or becomes a no-op for wired.
4. **`scan()` presumes discovery returns a list.** A LAN printer at a typed IP has no scan; a USB printer has an enumeration but not a radio scan. The method still type-checks (return `[]`), but the *card* treats an empty list as "no printers found — check it is switched on", which would be a lie for a manual-IP flow.
5. **The card's copy is Bluetooth-specific throughout** — "Connect a **Bluetooth** receipt printer", "**Bluetooth** is switched off on this device", "a web browser cannot reach a **Bluetooth** printer", "most receipt printers only appear for a minute or two after you turn them on". Display only, but every one of those sentences is wrong for a wired printer.
6. **`connect(printerId: string)`** is a string, so `"192.168.1.50:9100"` fits — but `DiscoveredPrinter.id` is currently a BLE device id and the stored keys (`hg_printer_id/svc/chr`) are GATT-shaped.

**Verdict:** the seam was designed for exactly this and it holds. The work is a new backend plus a *selector*, not a re-architecture — which is what `transport.ts`'s own header promised.

## A3. Gating — every condition, quoted

`lib/printing/usePrinting.ts`:
```ts
// 🔴 THE THREE GATES, ALL REQUIRED. Native app (a browser has no printer), the PLAN (printing is Max),
// and the device's own On/Off. Any false and the watcher does not run at all …
const active = isNativeApp() && canPrint && enabled && ready
```

`app/dashboard/[token]/page.tsx`:
```ts
const canPrintTickets = canAccess(truck?.plan ?? 'starter', 'ticket_printing', truck?.feature_overrides ?? {}, truck?.trial_expires_at ?? null)
```

`components/printing/PrintingSettings.tsx`:
```ts
if (!isNativeApp() || !ready) return null
…
const canPrint = canAccess(plan, 'ticket_printing', featureOverrides ?? {}, trialExpiresAt)
if (!canPrint) return null
```

`lib/native/device.ts`:
```ts
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}
```

### Why the web app cannot print today — two independent reasons

1. **`active` requires `isNativeApp()`.** On web it is false, so `usePrintWatcher` is mounted with `enabled: false` and its effect returns immediately. No timer, no durable write, no attempt.
2. **Even if the watcher ran, `getPrinterTransport()` returns `createStubTransport` on web**, whose `availability()` is `'unsupported'`, whose `connect()` refuses and whose `sendBytes()` returns `{ ok: false, error: 'No printer connected' }` after handing the bytes to a no-op sink.

Both are deliberate and both are honest. Neither is an accident to be removed — a browser genuinely cannot open a BLE, TCP or USB connection to a printer, with the two narrow exceptions in B5.

### 🔴 The "only the per-device toggle stands between a live truck and this code" claim — VERIFIED, with one correction

**Gusto, LIVE today:** `plan = 'trial'`, `feature_overrides = {}` (empty), `trial_expires_at = 2026-12-31T23:59:59+00:00`.

Tracing `canAccess`: `feature_overrides` is empty so the override branch is skipped; `plan === 'trial'` with a non-null expiry in the **future**, so it returns `PLAN_FEATURES.trial.has('ticket_printing')`. `TRIAL_FEATURES = [...MAX_FEATURES]` and `MAX_FEATURES` contains `'ticket_printing'`. **So `canPrint` is `true` for Pizzeria Gusto right now.** The manual is right, and "gated to a tier no live truck has" remains never a safety argument.

**The correction:** it is not *only* the toggle. `active = isNativeApp() && canPrint && enabled && ready` — so **two** things stand between a live truck and the printing code: the per-device toggle `hg_print_enabled` (default off) **and** being inside the native app. On the web dashboard, which is how Gusto is most likely used, nothing printing-related runs at all and the settings card does not render. That second gate is load-bearing for any wired build that would work on the web, because **adding web printing removes it**.

## A4. State and settings

### Where each setting lives

| Setting | Home | Default | Written by |
|---|---|---|---|
| `hg_print_enabled` | Capacitor Preferences (device) | `'false'` → off | `PrintingSettings` only |
| `hg_print_lead_mins` | Preferences (device) | `10` | `PrintingSettings` only |
| `hg_paper_width` | Preferences (device) | `80` | `PrintingSettings` only |
| `hg_printer_name` | Preferences (device) | absent | `PrintingSettings`, `bleTransport.connect` |
| `hg_printer_id`, `hg_printer_svc`, `hg_printer_chr` | Preferences (device) | absent | `bleTransport.connect` / cleared by `disconnect` |
| `trucks.print_trigger_mode` | **Database column** | `'lead_time'` | `/api/dashboard/action` `set_print_trigger_mode` |

`usePrinting` **reads** the four device settings and never writes them — "the card owns these keys; this hook must never write them, or two writers would race on one value". The mode is truck-level because it is a workflow policy; the migration's own comment explains that two devices holding different modes produces two tickets at two different times, which reads as a malfunction rather than a duplicate.

### The dedupe key

`PRINTED_KEY_PREFIX = 'hg_printed_keys_'` + `storageKey`, where `storageKey` is the **dashboard token** (`usePrinting` passes `token`). So the key is `hg_printed_keys_<dashboard token>`. The value is a JSON `PrintedRecord`:

```ts
interface PrintedRecord {
  mode: PrintTriggerMode          // the mode it was primed under — a change re-primes
  keys: string[]                  // SUCCESSFUL prints only
  unsettled?: Record<string, {    // attempted, not printed
    attempts: number
    lastOutcome: 'failed' | 'unknown'
    lastError?: string
    everUnknown: boolean          // 🔴 sticky — drives POSSIBLE DUPLICATE
  }>
}
```

### What Capacitor Preferences does on the web build

Read from the installed plugin (`node_modules/@capacitor/preferences/dist/esm/web.js`), not assumed:

```js
export class PreferencesWeb extends WebPlugin {
    constructor() { … this.group = 'CapacitorStorage' }
    async get(options)  { const value = this.impl.getItem(this.applyPrefix(options.key)); return { value } }
    async set(options)  { this.impl.setItem(this.applyPrefix(options.key), options.value) }
    get impl()   { return window.localStorage }
    get prefix() { return this.group === 'NativeStorage' ? '' : `${this.group}.` }
    applyPrefix(key) { return this.prefix + key }
}
```

**It is `window.localStorage` with a `CapacitorStorage.` prefix.** So on web the dedupe record would live at `localStorage['CapacitorStorage.hg_printed_keys_<token>']`.

🔴 **This matters for any web-printing option.** It works, but it is *per browser profile*: cleared by clearing site data, not shared between the operator's laptop and their phone, absent in a private window, and silent if storage is disabled. The durability the watcher's header depends on ("survives reload, tab switch and process death") is materially weaker on web than on native. Any web printing path that keeps device-local dedupe inherits that.

### Is there a server-side print record?

**No. Verified LIVE.** PostgREST exposes **70 tables** and `print_jobs` is not among them. `orders` has **no** column matching `/print|printer|ticket/`. `van_devices` has exactly ten columns — `id, truck_id, van_id, device_id, push_token, platform, default_screen, notify_enabled, last_seen, created_at` — and **none** of the six printing columns §36 says are "spec'd".

`trucks.print_trigger_mode` **does** exist: `text`, `NOT NULL`, default `'lead_time'`, and all 12 trucks read `'lead_time'`. 🔴 **So the migration WAS applied**, despite its own file header reading "🔴 **WRITTEN, NOT RUN**" — the same class of error the manual already records at V11.26 (a note about the next step mistaken for a note about the current state).

### SQL

No SQL RPC is exposed on this project, so the schema above was established from **PostgREST's OpenAPI document, which is its live schema cache** — the faithful substitute, and the same method the slot-interval investigation used. These are the queries to run in the Supabase SQL editor to confirm the same facts directly. All read-only.

```sql
select information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'trucks'
  and information_schema.columns.column_name like '%print%'
order by information_schema.columns.column_name;
```
Expected (matches OpenAPI, LIVE): one row — `print_trigger_mode`, `text`, `NO`, `'lead_time'::text`.

```sql
select information_schema.tables.table_name
from information_schema.tables
where information_schema.tables.table_schema = 'public'
  and information_schema.tables.table_name in ('print_jobs', 'printer_jobs', 'tickets')
order by information_schema.tables.table_name;
```
Expected: **zero rows** — there is no server-side print record of any kind.

```sql
select information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'van_devices'
order by information_schema.columns.ordinal_position;
```
Expected: ten rows, none of them `printer_id`, `printer_name`, `printer_class`, `paper_width`, `print_lead_mins` or `ticket_type`.

```sql
select information_schema.columns.column_name
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'orders'
  and (information_schema.columns.column_name like '%print%'
       or information_schema.columns.column_name like '%ticket%')
order by information_schema.columns.column_name;
```
Expected: **zero rows** — no `orders.printed_at`.

```sql
select trucks.name,
       trucks.plan,
       trucks.print_trigger_mode,
       trucks.trial_expires_at,
       trucks.feature_overrides
from public.trucks
order by trucks.name;
```
Observed LIVE: 12 rows; **every** truck `print_trigger_mode = 'lead_time'`; Pizzeria Gusto `plan = 'trial'`, `feature_overrides = {}`, `trial_expires_at = 2026-12-31T23:59:59+00:00`.

## A5. Settings UI — what an operator can and cannot do

The card lives in the dashboard **Settings** tab (🔴 §36 still says "Menu & Stock" — stale). It renders `null` unless native **and** entitled. Collapsed to title + description + toggle when off.

**Can do today:** switch printing on/off for this device · tap **Scan for printers** (a bounded 6-second BLE scan) · connect to any named device in the list · disconnect (which also clears the stored pairing) · choose the trigger mode (writes the truck column) · set lead minutes 0–60 · choose 58 mm or 80 mm · see how many tickets are waiting.

**The "Likely printers" ranking.** `looksLikePrinter(name, uuids)` returns true if an advertised service UUID contains one of `18f0, ff00, ffe0, 49535343, e7810a71`; else false if the name matches `/airpod|watch|iphone|ipad|macbook|…/i`; else true if the name matches `/print|pos\b|receipt|thermal|star\s|epson|bixolon|munbyn|rongta|sprt|zj-?\d|xp-?\d|mtp-?\d|gp-?\d|rp\d/i`. 🔴 **It ranks; it never filters** — every named device stays listed and connectable, because an unlisted printer would be invisible and the operator could not fix that. Nameless peripherals *are* dropped. When nothing ranks likely the heading becomes "No printers recognised yet. Everything nearby is listed below…" and the other list renders open.

**Cannot do today:** enter an IP address · pick a connection type · change to a different printer without disconnecting first (the "Change" control was never built) · see paper-out or cover-open (BLE does not report them; `PrinterStatus.paperOut/coverOpen` stay `undefined`) · print a test ticket · reprint a specific order from this card · print anything at all from a browser.

🔴 **Every copy string in the card says "Bluetooth".** A wired build must change them or the card will contradict the hardware.

## A6. Native configuration

### iOS — `ios/App/App/Info.plist`

| Key | Present? | Value |
|---|---|---|
| `NSBluetoothAlwaysUsageDescription` | ✅ | "HatchGrab uses Bluetooth to connect to your kitchen receipt printer so order tickets can be printed automatically. It is not used for anything else." |
| `NSCameraUsageDescription`, `NSFaceIDUsageDescription` | ✅ | (unrelated) |
| **`NSLocalNetworkUsageDescription`** | 🔴 **ABSENT** | — |
| **`NSBonjourServices`** | 🔴 **ABSENT** | — |
| **`UISupportedExternalAccessoryProtocols`** | 🔴 **ABSENT** | — |
| `UIBackgroundModes` | 🔴 **ABSENT — deliberately** | printing is foreground-only by design; §42 records that a background mode "invites review questions that cannot be answered honestly" |

**Privacy manifest** (`PrivacyInfo.xcprivacy`): declares `NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1` (traced to `@capacitor/preferences`), `NSPrivacyTracking false`, and collects `NSPrivacyCollectedDataTypeDeviceID` (App Functionality, linked, not tracking). Its own header says: **"If a plugin is added or upgraded, RE-RUN THE AUDIT"** — binding on any wired build that adds a plugin.

**Entitlements**: `App.entitlements` → `aps-environment: development`; `AppRelease.entitlements` → `production`. Nothing else. No App Group, one `PBXNativeTarget`.

### Android

`android/app/src/main/AndroidManifest.xml` declares `INTERNET`, `BLUETOOTH_SCAN` with `usesPermissionFlags="neverForLocation"`, and removes the library's `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` with `tools:node="remove"`.

The **merged release manifest** (the one Play reads) carries: `INTERNET`, `BLUETOOTH_SCAN` (with `neverForLocation`), `BLUETOOTH`, `BLUETOOTH_CONNECT`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS`, **`ACCESS_NETWORK_STATE`**, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `c2dm.permission.RECEIVE`. **Neither location permission survives the merge.** No `android.hardware.usb.host` feature.

✅ **Both permissions a LAN printer needs on Android — `INTERNET` and `ACCESS_NETWORK_STATE` — are already in the merged manifest.** A LAN transport on Android adds **no new permission and no new prompt**.

🔴 **The V11.21 `neverForLocation` note is STALE.** It records "the prompt is gone and the DECLARATION is not — the plugin's manifest carries no `usesPermissionFlags`". The app's own manifest now supplies that attribute and **the merged output carries it** (verified in `merged_manifest/release/…/AndroidManifest.xml`). That item is closed.

`minSdkVersion 24`, `compileSdkVersion 36`, `targetSdkVersion 36`.

### Installed Capacitor plugins and versions

Capacitor core/CLI/iOS **8.4.0**, Android **8.4.1**. Nine plugins:

`@capacitor/app` 8.1.0 · `@capacitor/local-notifications` 8.2.0 · `@capacitor/network` 8.0.1 · `@capacitor/preferences` 8.0.1 · `@capacitor/push-notifications` 8.1.1 · `@capacitor/status-bar` 8.0.2 · `@capacitor-community/bluetooth-le` **8.3.0** (pinned) · `@capacitor-community/keep-awake` 8.0.1 · `@aparajita/capacitor-biometric-auth` 10.0.0.

🔴 **iOS is on Swift Package Manager, not CocoaPods.** `ios/App/CapApp-SPM/Package.swift` lists all nine plugins as local SPM packages against `capacitor-swift-pm` exact `8.4.0`. Capacitor 8 makes SPM the default and **CocoaPods is in maintenance mode, with its trunk due to stop accepting new podspecs on 2 December 2026** ([Capawesome](https://capawesome.io/blog/how-to-migrate-a-capacitor-app-to-spm/), [Capacitor docs](https://capacitorjs.com/docs/ios/spm)). **You cannot mix SPM and CocoaPods in one app**, so *every plugin a wired build adds must ship a `Package.swift`* — this rules out most of the older third-party plugins on sight and is the single most important packaging constraint in this report.

## A7. Evidence of real-world use

🔴 **No ticket has ever been printed on paper. Stated plainly, because it is the most important fact in Part A.**

- §42's own closing block: *"🔴 **NOTHING HAS BEEN SEEN ON PAPER.** — 🔴 **STILL TRUE AT V11.19. This is the one that matters.**"* and *"⚠️ **What has NOT changed: no printer has ever been connected.**"*
- There is **no server-side record that could contain such evidence** — no `print_jobs`, no `orders.printed_at` (verified LIVE).
- The only durable record of an attempt is device-local Preferences on an operator's iPad, which nothing here can read.
- The only `DEVICE-OBSERVED` printing fact in the whole repository is the 15 August scan list offering *"Dominic's Apple Watch"* and *"Dominic's AirPods Pro"* — i.e. the radio and the scan work; nothing beyond that is observed.
- §36 lists the whole BLE printing path under **"AWAITING HARDWARE"**.

Therefore: `CHUNK = 180`, `CHUNK_GAP_MS = 12`, the `ESC @` probe, `TICKET_LEADING_FEED_LINES = 2`, the partial-write `'unknown'` path and the resume-reconnect are **all arithmetic and reasoning, none of it observed** — and those are precisely the places printing fails in practice. A wired build inherits that: it will be the *first* time this pipeline is exercised end to end.

---

# PART B — WHAT "WIRED" COULD MEAN

## B1. Network (Ethernet/LAN) raw TCP, port 9100, from the native apps

**How it works.** Virtually every network-capable thermal printer listens as a raw TCP server on **port 9100**: open a socket, write ESC/POS bytes, close to signal end of job. There is no protocol on top and, on most firmware, **no authentication** ([Proxy Nodes](https://www.proxynodes.com/guides/network-printer-port-9100), [Industrial Monitor Direct](https://industrialmonitordirect.com/blogs/knowledgebase/proxying-escpos-thermal-printer-traffic-from-pos-systems)).

**Fit with the existing seam — the best of any option.** `sendBytes(bytes)` maps to *connect → write → close*, one socket per ticket. No chunking, no pacing, no MTU, no characteristic discovery. **And the failed/unknown split lands more cleanly than it does on BLE:** a refused connection or a failure before any `write` is `{ ok: false }` → `'failed'` (clean reprint, no banner); a failure *after* a partial write throws → `'unknown'` (POSSIBLE DUPLICATE). TCP even gives a *better* `'failed'` signal than BLE, because a connection refusal is unambiguous.

**Plugin situation.** No official Capacitor TCP plugin exists. The candidates:

| Plugin | Latest | Verdict |
|---|---|---|
| `@deedarb/capacitor-tcp-socket` | 7.2.1 (≈7 months old); repo shows a compatibility table claiming **Capacitor 8.x** support | The most credible. API is exactly right: `connect/send/read/disconnect`. **BUT** the repo has ~14 commits total, its iOS side is a `.podspec` (`DeedarbCapacitorTcpSocket.podspec`) and I **could not confirm a `Package.swift`** — without SPM support it cannot be installed in this app at all. iOS uses the `SwiftSocket` library; Android uses `java.net.Socket`. |
| `gee1k/capacitor-tcp-socket` | ~10 commits; `CapacitorTcpSocket.podspec`, **no `Package.swift` found**; an open issue literally titled *"capacitor 7 support"* | Not viable on this project |
| `capacitor-tcp-socket-plugin` | 0.0.4, last published ~5 years ago | Abandoned |
| `tcp-capacitor-plugin` | Jul 2024 | Unmaintained, unproven |

🔴 **Recommendation: assume a small custom plugin.** It is ~150 lines per platform (`java.net.Socket` / `Network.framework` or `SwiftSocket`), it ships with the app rather than as a 14-commit third-party dependency in the byte path of a kitchen, and it can be written to the `PrinterTransport` shape directly instead of being adapted. Given V13.0's untrusted-dependency lesson and the fact that this project *pins* `bluetooth-le` at an exact version, taking a supply-chain risk on a micro-package that carries the ticket bytes is the wrong trade. Evaluate `@deedarb` first — if it genuinely ships SPM and Capacitor 8, using it saves real work — but **verify `Package.swift` before planning around it**.

**iOS Local Network permission — the one real iOS cost.** Since iOS 14, an app that connects to devices on the user's local network — *including a direct connection to a private IP, not only Bonjour/mDNS discovery* — triggers the local-network permission and must carry an **`NSLocalNetworkUsageDescription`** purpose string ([Apple](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription), [Apple Local Network Privacy FAQ](https://developer.apple.com/forums/thread/663775)). Consequences:

- A new Info.plist key, and a new **system prompt** the operator sees the first time they connect a printer.
- If they refuse, connections fail — and the platform's failure mode here is quiet. 🔴 **The transport must map a refusal to `'unauthorised'`, exactly as `bleTransport.availability()` already does for Bluetooth**, so the card can say *"HatchGrab needs permission to reach your printer — allow Local Network in Settings"* rather than showing "printer not found". The four-valued `PrinterAvailability` already exists for precisely this and needs no change.
- `NSBonjourServices` is only needed **if** mDNS discovery is added (B-discovery below). Manual IP entry needs the usage description alone.

**Android:** nothing to add — `INTERNET` and `ACCESS_NETWORK_STATE` are already in the merged manifest (A6).

**Discovery.** Three levels: (a) **manual IP entry** — zero platform cost, needs a DHCP reservation or a static IP on the printer or the address changes; (b) **mDNS/Bonjour** — nice, but on iOS adds `NSBonjourServices` and many cheap printers do not advertise; (c) **subnet sweep** of `:9100` — works, but it is *literally* network scanning, which is the behaviour Apple's local-network prompt exists to police, and it is slow on a venue network.

**Offline behaviour — the decisive advantage.** A LAN printer needs **no internet**. Printer and tablet on the same router (even a £20 travel router with no WAN) is enough. That matters enormously for a food truck: the existing offline outbox exists because event connectivity is unreliable, and a LAN transport keeps working through exactly the outages that already happen.

**Risks.** DHCP reassigns the printer's address and printing silently stops (mitigated by a reservation, and by `status()` surfacing the address). The venue's guest Wi-Fi may use client isolation, which blocks device-to-device traffic entirely — a real and common failure at events. Port 9100 has no authentication, so anyone on the same network can print to it (this is a property of the printer, not of the change). A tablet that roams to 4G loses the printer.

## B2. USB printer on Android (USB host / OTG)

**Feasible, with a custom plugin.** The path is `UsbManager` → find the interface with class **0x07** (USB Printer Class, which generic ESC/POS printers expose) → `bulkTransfer` the bytes ([DantSu/ESCPOS-ThermalPrinter-Android](https://github.com/DantSu/ESCPOS-ThermalPrinter-Android)).

**What it needs:** `<uses-feature android:name="android.hardware.usb.host" />` in the manifest; a runtime **USB permission prompt** via a `PendingIntent` broadcast; and 🔴 **since Android 12 that `PendingIntent` must declare `FLAG_MUTABLE` or `FLAG_IMMUTABLE`, and since Android 14 an implicit intent inside a mutable one must name its package** — the classic crash in this area, and this app targets SDK 36. Optionally a `device_filter.xml` so the OS can offer to launch HatchGrab when the printer is plugged in.

**No maintained Capacitor plugin exists** for this — the ecosystem here is Android-native libraries and Flutter packages. A custom plugin is the only route.

**Practical notes.** The tablet must support USB OTG and must power the printer *or* the printer must be self-powered (most counter-top thermal printers are). Charging the tablet and running a USB printer at once needs a powered OTG hub — a real-world snag in a truck that runs all day. Works with **no internet**.

**Fit with the seam:** clean. `scan()` enumerates attached devices, `connect()` takes the device name, `sendBytes` is a bulk transfer, and the failed/unknown split works (a failed transfer before any byte vs after).

## B3. USB printer on iPad

🔴 **Effectively not available, and this is the firmest finding in Part B.**

iPadOS exposes **no public USB API to third-party apps**. There is no WebUSB, no libusb, no driver installation: *"iPadOS does not support installation of individual device drivers — other than via a manufacturer provided App"*, and printing by cable directly to an iPad is not supported ([Apple Support Communities](https://discussions.apple.com/thread/251413741)). The only sanctioned route to a wired accessory is the **External Accessory framework**, and that requires an **MFi-certified accessory**.

**What External Accessory actually requires** — and the manual's version of this is imprecise:

- `UISupportedExternalAccessoryProtocols` in Info.plist, listing the accessory's protocol strings ([Apple](https://developer.apple.com/documentation/bundleresources/information-property-list/uisupportedexternalaccessoryprotocols)).
- 🔴 **The *app* developer does NOT join the MFi Program.** Apple's own MFi FAQ: accessory *manufacturers* join MFi; *app* developers join the Apple Developer Program. **But** it is up to the accessory manufacturer to decide whether to authorise a specific third-party app to talk to their accessory through External Accessory ([MFi FAQ](https://mfi.apple.com/en/faqs.html)).
- At submission, the accessory's ten-digit **MFi PPID** must be supplied in the App Review Notes.

So the blocker is real but it is a **vendor-relationship and App-Review blocker, not an enrolment fee**: HatchGrab would need Star or Epson to authorise its bundle ID against their PPID, and would need a specific certified printer model. That is a procurement conversation with a lead time, for one truck. `bleTransport.ts`'s header ("needs enrolment in Apple's MFi Program with the manufacturer's protocol string registered against this app") is close enough in effect to be a safe operating assumption, but the precise mechanism is the manufacturer's authorisation.

**Conclusion: do not pursue USB on iPad.** If the truck's printer is USB-only and they run an iPad, the honest answers are (a) use Bluetooth if the printer has it, (b) buy a LAN-capable printer or a USB-to-Ethernet print server, or (c) run HatchGrab on an Android tablet for the kitchen device.

## B4. Vendor network SDKs (Star StarXpand/StarIO10, Epson ePOS SDK) as native plugins

**What they buy.** One SDK covering **LAN + USB + Bluetooth + BLE** behind a single API, plus the thing raw TCP cannot give: **real printer status** — paper out, cover open, offline, error state. `PrinterStatus.paperOut` and `.coverOpen` already exist in the seam and are permanently `undefined` on BLE; a vendor SDK is the only way to populate them. Star's current SDK is **StarXpand**, containing the **StarIO10** library, for iOS and Android ([Star](https://star-m.jp/products/s_print/sdk/starxpand/manual/en/about.html), [StarXpand-SDK-Android](https://github.com/star-micronics/StarXpand-SDK-Android)).

**What they cost.**
- 🔴 **No Capacitor plugin exists for either.** Star ships iOS and Android SDKs and maintains a **React Native** wrapper (`react-native-star-io10`); the Cordova plugins that exist are for the *legacy* StarIO library, not StarIO10. So this means writing a Capacitor plugin that wraps a native SDK — substantially more work than the ~150-line TCP plugin, and it must be SPM-packaged for iOS (A6).
- **It ties the product to one vendor's printers.** The whole `lib/printing` design is deliberately vendor-neutral — ESC/POS generated in JS, the write characteristic *discovered* not hard-coded, an allow-list explicitly rejected because "an invisible printer is unusable". A Star SDK inverts that: Star printers work beautifully, everything else does not work at all.
- The renderer becomes partly redundant — vendor SDKs prefer their own document API over raw ESC/POS, though both accept raw bytes, so `renderTicket` can stay the source of truth.
- Note Star's own constraint: **BLE is only supported on Android 12.0 and later** in StarIO10.

**Verdict:** the right *eventual* answer for a truck printing all day (and §36 already recommends steering operators to MFi Star/Epson), and the wrong *first* answer. Raw TCP proves the wired path end to end with a tenth of the work; a vendor SDK can replace the backend later behind the same seam, which is exactly what the seam is for.

## B5. Web app options

### (a) WebUSB / Web Serial

**Browser support, read from caniuse rather than memory:**

| API | Chrome desktop | Chrome Android | Edge | Firefox | **Safari macOS** | **Safari iOS** |
|---|---|---|---|---|---|---|
| **WebUSB** | ✅ 61+ | ✅ 152+ | ✅ 79+ | ❌ (position: *Harmful*) | ❌ **all versions** | ❌ **all versions** |
| **Web Serial** | ✅ 89+ | ✅ 152+ | ✅ 89+ | ✅ 151+ | ❌ **all versions** | ❌ **all versions** |

([caniuse WebUSB](https://caniuse.com/webusb), [caniuse Web Serial](https://caniuse.com/web-serial), [MDN Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API))

🔴 **Neither exists on iPad in any browser** — every iOS browser uses WebKit, and WebKit has opposed both. So this cannot serve an iPad, and it cannot serve the HatchGrab native app either (a WKWebView is Safari's engine; the Android WebView does not expose these APIs to embedded content). Both require a **secure context** (satisfied — `https://www.hatchgrab.com`) and a **user gesture** per device grant.

**Where it would actually work: desktop Chrome/Edge.** An operator on a laptop could connect a USB receipt printer and print ESC/POS from the browser. That is a genuine capability — but it serves a laptop in an office, not a kitchen hatch, and it needs a click per grant. Low value for this truck.

### (b) Browser posts directly to the printer's HTTP interface (Epson ePOS-Print JS, Star WebPRNT)

**This is the option that looks easy and is not.** Both vendors ship a JS library that POSTs an XML print job to the printer's own web server.

🔴 **The HTTPS problem is fatal in the normal case.** The dashboard is served from `https://www.hatchgrab.com`; the printer is `http://192.168.x.x`. Every modern browser blocks that as mixed content, and Star's own manual states it plainly: *"If the request is sent by http communication without encryption, it will fail due to the cross scheme (https ⇔ http) limitation of the browser, and printing will also fail."* ([Star webPRNT manual](https://www.star-m.jp/products/s_print/sdk/webprnt/manual/en/_sampleProgram.htm))

The workaround is to give the printer HTTPS — which means a certificate for a **private IP address**, which no public CA will issue. So it is a **self-signed certificate that must be exported from the printer and manually installed and trusted on every device that prints** ([Odoo's ePOS SSC guide](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/hardware_network/epos_ssc.html), [Star](https://www.star-m.jp/products/s_print/sdk/webprnt/manual/en/_sampleProgram.htm)). On an iPad that means installing a configuration profile and enabling full trust in Settings. For one truck, on every device, re-done whenever the certificate or the IP changes.

**Verdict: do not pursue.** It is the option most likely to be suggested and least likely to survive contact with a venue.

### (c) Printer polls the server (Star CloudPRNT, Epson Server Direct Print)

🔴 **The only web-printing option that genuinely works, and the only option that is device-independent.**

The direction is inverted: **the printer is the client**. It sends an HTTP(S) POST to a server URL on an interval with its status; the server replies whether a job is waiting; the printer `GET`s the job and `DELETE`s it on completion ([Star CloudPRNT Protocol Guide](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-guide.html)). Epson's equivalent is **Server Direct Print** on the TM-i series, default interval **5 seconds** ([Epson SDP manual](https://files.support.epson.com/pdf/pos/bulk/server_direct_print_um_en_revk.pdf), [Epson technology page](https://download4.epson.biz/sec_pubs/pos/reference_en/technology/server_direct_print.html)).

**Consequences, all of them significant:**
- ✅ Prints regardless of what the operator is using — web, iPad, Android, phone, or nothing at all. **The dashboard does not even need to be open**, which removes today's largest practical limit (the watcher is a 20 s interval inside a mounted page; background the app or open the KDS and it stops).
- ✅ **Dedupe moves server-side and becomes correct**, because the queue is the shared record this system has never had. The `print_jobs` table §36 specced but never built is exactly what this needs.
- 🔴 **It requires internet at the event.** The opposite of B1. If the connection drops, the printer cannot poll and nothing prints — and for this product, whose whole offline architecture exists because event connectivity is unreliable, that is a serious regression in the failure mode.
- 🔴 It is a **server build**: a queue table, three endpoints, a claim/lease model, and a new authentication surface (the printer authenticates with a token in a URL the operator types into a printer's web config).
- 🔴 It needs a **printer that supports the protocol** — Star CloudPRNT models or Epson TM-i series. Not a generic £35 unit.
- Latency is the poll interval: 5 seconds typical, and 5–10 s end to end in practice.

### (d) The OS print dialog (`window.print()` / AirPrint)

Works everywhere, including iPad Safari, with no plugin and no permission. But: **it is not automatic** — it opens a dialog that a human must confirm, once per ticket; it prints a *page*, not an ESC/POS receipt, so the 32/48-column layout, the double-width header, the invert blocks and the auto-cut are all lost; and it needs an AirPrint printer, which a thermal receipt printer usually is not.

**What it is genuinely good for:** a manual "Print this order" escape hatch — the operator on any device, printing one ticket to whatever printer exists, when the automatic path has failed. It is a fallback, never the feature.

## B6. Dedupe and duplication

**Today's model.** One `Set` of order keys, persisted per device at `hg_printed_keys_<token>`, a key entering it **only** on outcome `'printed'`. The watcher primes on first run or on a mode change rather than flushing the backlog. `usePrinting` mounts on the dashboard and nowhere else, and its own header says why: *"a second mounted watcher does not race the first, it DUPLICATES it"* — because the trigger mode is truck-level, so two devices agree on *when* a ticket is due and both fire.

**What breaks if the same truck prints from more than one place:**

| Scenario | Today (BLE) | With a LAN printer |
|---|---|---|
| Two app devices, printing on | Both print every ticket — but each needs its **own paired BLE printer**, so in practice one device has hardware and the other has nothing to print to. The bug is latent. | 🔴 **Both print to the SAME printer.** Every ticket comes out twice. |
| App + web | Impossible — web cannot print | Possible the moment web printing exists |
| Same device, reload/tab switch | Safe — the set is durable | Safe |
| Same device, cleared site data (web) | n/a | 🔴 Set lost → the day's backlog re-primes, or reprints |

🔴 **This is the single most important new risk wired printing introduces, and it is not obvious.** A Bluetooth printer is *physically* paired to one device, so device-local dedupe has been protected by the hardware rather than by the code. **A LAN printer is reachable by every device on the network**, which removes that accidental protection at exactly the moment the code starts working. `multi_device_kds` is a sold Max feature, so two devices is a supported configuration.

**Options, not a choice:**

1. **Keep device-local dedupe; enforce one printing device.** A truck-level "which device prints" value (a column, or the existing `van_devices.device_id`), checked by `usePrinting` before `active`. Cheapest; fully compatible with today's design; needs a UI to move printing to another device and a sane answer when that device is off.
2. **Server-side claim with a lease.** The long-specced `print_jobs` table: a device claims an order key with a short lease before printing and records the outcome. Correct for any number of devices, keeps the local set as an offline cache, and — 🔴 **this is what the existing BLE path gains too** — finally makes the priming-vs-flush question answerable, which §42 records as blocked *precisely* on there being no shared record. Cost: a migration, an endpoint, and a conflict model.
3. **Full server-side queue (B5c).** Dedupe stops being a client problem at all. Biggest change; only worthwhile if the printer polls.

**What a server-side queue would change for the existing BLE path:** it would give it a shared printed record, which would let a second device exist safely, let a reprint be requested from any surface, make "how many tickets are waiting" a *server* fact rather than an upper-bound estimate, and resolve the priming/flush-on-connect decision §42 left open. It would **not** change a single byte of the renderer, the mapper or the failure split.

## Feasibility matrix

| Option | iPad app | Android app | iOS Safari (web) | Desktop Chrome (web) | Needs internet? |
|---|---|---|---|---|---|
| **B1** LAN raw TCP 9100 | ✅ plugin + `NSLocalNetworkUsageDescription` + OS prompt | ✅ plugin; **no new permission** | ❌ browsers cannot open TCP | ❌ same | **No** |
| **B2** USB host | ❌ no public API | ✅ custom plugin; `usb.host` + USB prompt | ❌ | ❌ | **No** |
| **B3** USB via External Accessory | ⚠️ MFi accessory + vendor authorisation + PPID at review | n/a | ❌ | ❌ | **No** |
| **B4** Vendor SDK (Star/Epson) | ✅ custom plugin wrapping the SDK (SPM) | ✅ same | ❌ | ❌ | No (LAN/USB/BT) |
| **B5a** WebUSB / Web Serial | ❌ WebKit | ❌ WebView | ❌ | ✅ Chrome 61+/89+ | No |
| **B5b** Browser → printer HTTP | ⚠️ mixed content; needs a trusted cert per device | ⚠️ same | ⚠️ same | ⚠️ same | No |
| **B5c** Printer polls server | ✅ (device uninvolved) | ✅ | ✅ | ✅ | 🔴 **Yes** |
| **B5d** `window.print()` / AirPrint | ⚠️ manual, not ESC/POS | ⚠️ same | ⚠️ same | ⚠️ same | No |

---

# PART C — RECOMMENDATION AND PLAN

## C1. Recommended approach per platform

### (i) A LAN / Ethernet printer

| Platform | Recommendation |
|---|---|
| **iPad app** | **Raw TCP to port 9100 (B1)** via a small custom Capacitor plugin. Add `NSLocalNetworkUsageDescription`; map a refused permission to the existing `'unauthorised'` availability so the card gives the right instruction. |
| **Android app** | **The same plugin, the same backend.** No manifest change, no new prompt. |
| **Web (either)** | **Nothing at first.** Raw TCP is impossible from a browser, and the two options that would work are a per-device certificate install (B5b — don't) or a server queue (B5c — a much bigger build). Revisit after the app path is proven on paper. |

**Why raw TCP over a vendor SDK:** one backend serves both platforms, it is the only option with no vendor lock-in (matching the renderer's existing vendor-neutral design), it works with no internet, it maps onto `sendBytes` with *less* machinery than BLE needs, and the failed/unknown split lands more cleanly than it does today. The vendor SDK can replace it behind the same seam if paper-out status turns out to matter.

### (ii) A USB printer

| Platform | Recommendation |
|---|---|
| **Android app** | **USB host (B2)** via a custom plugin — genuinely feasible, and the Android-12/14 `PendingIntent` flag rule is the known trap to get right first time. |
| **iPad app** | 🔴 **Do not build it.** No public API exists. The honest options to put to the truck: use Bluetooth if the printer has it; add a **USB-to-Ethernet print server** (~£40) and use the LAN path; buy a LAN-capable printer; or run the kitchen device on an Android tablet. |

🔴 **If the truck's printer is USB-only and they use an iPad, no amount of code solves it** — that is a hardware answer, and it should be given as one rather than worked around.

## C2. The smallest build that gets the waiting truck printing

**Assuming a LAN printer (confirm with C6 first):**

1. Widen `PrinterClass` to include `'net'` and add a **device-local printer kind** setting (`hg_printer_kind`, default `'ble'` — so nothing changes for anyone who does not opt in).
2. `lib/printing/netTransport.ts` — a new `PrinterTransport`: `availability()` (native + permission), `scan()` returns `[]` (manual entry), `connect('ip:port')` opens a socket and writes `ESC @` as the probe, `sendBytes` = connect → write → close, `status()` reports the configured address and the last result. **Below the seam, like BLE.**
3. A minimal Capacitor TCP plugin (Android `java.net.Socket`, iOS `Network.framework`), **SPM-packaged**.
4. `getPrinterTransport()` gains a kind-based selector; move `reconnectStoredPrinter` behind the interface or make it a no-op for `'net'`.
5. `PrintingSettings`: a connection-type choice, an IP/port field with a **Print test ticket** button, and copy that stops saying "Bluetooth" when the kind is not BLE.
6. `NSLocalNetworkUsageDescription` in Info.plist; re-run the privacy-manifest audit for the new plugin.
7. 🔴 **A one-printing-device guard** (B6 option 1) — because a LAN printer removes the physical protection device-local dedupe has been relying on.

**Deliberately NOT in the first build:** mDNS/Bonjour discovery · vendor SDKs and paper-out status · USB on Android · any web printing · the server-side `print_jobs` queue · lead-time-from-cook-time (the §42 design gap — unchanged, still open) · moving settings into `van_devices`.

**Nothing above the seam changes.** `renderTicket`, `mapOrderToTicket`, `selectDueToPrint`, `usePrintWatcher` and the three outcomes must be **byte-identical** — that is the claim C4's first harness exists to prove.

## C3. Gusto safety

Gusto is `plan='trial'`, `feature_overrides={}`, trial live until 31 Dec 2026 → **`canAccess('ticket_printing')` is TRUE today** (A3, LIVE). So "gated to a tier no live truck has" is not available as an argument, exactly as the standing rule says.

**Surfaces the recommended build could touch, and how each stays off:**

| Surface | Exposure | How it stays off |
|---|---|---|
| `PrintingSettings` card (Settings tab) | Renders for Gusto **in the native app** whenever they open Settings — new controls would be visible | New controls render only inside the existing `{enabled && …}` block, which is behind `hg_print_enabled` (**default off**). If Gusto has never enabled printing, the card still collapses to title + toggle. |
| `usePrinting` on the dashboard | Mounts for Gusto in the app | `active` is unchanged: `isNativeApp() && canPrint && enabled && ready`. Not widened. |
| `getPrinterTransport()` | 🔴 **The real risk.** Changing the selector changes which backend an already-configured device gets. | The kind setting defaults to `'ble'`, and the selector must return **exactly today's transport** when no kind is stored. A missing key means *unchanged*, never *new*. |
| `/api/dashboard` truck payload | New column would flow through `publicTruckFields` (a redact list) | Prefer **device-local Preferences** for the first build — no column, no payload change, no migration. |
| Manage page | Untouched | No printing setting is proposed there. |
| The web dashboard Gusto most likely uses | **Zero change** — web printing is explicitly out of the first build | `isNativeApp()` still gates everything. |

🔴 **The one Gusto-visible change worth naming:** if Gusto *has* printing enabled on an iPad with a paired BLE printer, a connection-type control appears in their Settings card. It must default to Bluetooth and must not disturb the stored pairing. **Verify before shipping**, and say so in the build brief.

## C4. Proof plan

### Harnesses — `scripts/printing-*.cjs`, following the `whatsapp-*` pattern

Each self-compiles the real TypeScript with the repo's `tsc` and runs its **broken variant first, which must FAIL**.

| Harness | What it proves | Broken variant (must fail) |
|---|---|---|
| `printing-escpos-identity.cjs` | 🔴 **The renderer is byte-identical before and after.** `renderTicket` compiled from a `git worktree` of HEAD and from the working tree, over frozen `Order` fixtures at 58 and 80 mm, every content branch (deal slot notes, item notes, reprint banner, paid/part-paid/unpaid, `£`, non-ASCII). JSON byte-compare, as the slot-interval engine harness does. | A one-byte change to `TICKET_LEADING_FEED_LINES` → outputs must differ |
| `printing-transport-contract.cjs` | Every backend (stub, BLE, net) satisfies `PrinterTransport` **and its failure semantics**: `availability()` returns one of the four; `connect` on an unreachable target returns `ok:false`; `status()` never reports connected without a live session. | 🔴 **A transport that returns `ok:true` from `sendBytes` without sending** — the stub's original lie. Must FAIL, because this is the defect §42 calls the dangerous one. |
| `printing-failure-split.cjs` | The load-bearing split: failure **before** any byte → `{ok:false}` → `'failed'` → next ticket carries **no** banner; failure **after** a partial write → **throws** → `'unknown'` → `mayDuplicate` true and sticky across a reload. | 🔴 **A partial write reported as `{ok:false}`** — hides a half-printed sheet. Must FAIL. |
| `printing-dedupe.cjs` | A key enters the printed set **only** on `'printed'`; priming absorbs without printing; a mode change re-primes; `everUnknown` survives a round-trip through the record; **two watchers over one printer produce two prints** (the duplication this build must guard). | A key entering the set on *attempt* rather than success — must FAIL |
| `printing-gating.cjs` | The three gates; `canAccess` for Gusto's exact LIVE shape (`trial`, `{}`, future expiry) is **true**, so the toggle is what stands; and 🔴 **a device with no stored printer kind selects exactly today's transport**. | A selector that picks the net backend when no kind is stored — must FAIL |

### What must be verified on real hardware, and with which printer

🔴 **No harness can prove any of this, because nothing in this pipeline has ever touched paper (A7).**

**With the truck's actual printer** (model unknown — C6):

1. A ticket comes out, and is **legible end to end** — the first time this has ever happened.
2. **Measure the leading feed with a ruler.** `TICKET_LEADING_FEED_LINES = 2` is arithmetic for ~8 mm against rail clips that grip 15–25 mm. One observation replaces the whole estimate.
3. Column width at the truck's paper size — 32 or 48 characters, wrapping, the double-width header, invert blocks, the `£`, a name with an accent rendering as `?` by design.
4. The cut fires and separates.
5. 🔴 **Pull the network cable mid-ticket.** This is the only way to exercise the partial-write path, which has never run. Confirm the next ticket carries POSSIBLE DUPLICATE and that the order stayed due.
6. Printer powered off → the attempt returns `'failed'` cleanly, the order stays due, the card says so, the count is right; power it back on and the next tick prints with **no** banner.
7. iOS: the Local Network prompt appears once, and **refusing** it produces `'unauthorised'` and the right instruction — not "no printers found".
8. Leave it running a full service: does the socket survive an idle hour, a tablet sleep/wake, a Wi-Fi roam, a DHCP lease renewal?
9. Two devices on the dashboard at once → confirm the one-device guard prevents the double print.

**If no printer is to hand for development:** a virtual ESC/POS printer on TCP 9100 (§36 already names `FilipChalupa/virtual-thermal-printer`) exercises the whole socket path for £0 and should be used *before* the hardware, never instead of it.

## C5. Decisions needed from Dominic

**1. Which connection type and printer model first?**
- **(a) LAN / Ethernet, raw TCP 9100 — RECOMMENDED.** One backend serves iPad and Android, no vendor lock-in, works with no internet, no new Android permission, cleanest fit to the existing seam.
- (b) USB on Android only — fine if the truck is Android *and* the printer is USB-only, but it serves one platform and cannot ever serve the iPad.
- (c) Vendor SDK (Star StarXpand / Epson ePOS) — the best long-term answer and the only route to paper-out status, but several times the work and it ties the product to one vendor.
- *Recommendation: (a), and choose the model only after C6 answers what the truck already owns.*

**2. Is web printing worth a server-side queue?**
- **(a) Not yet — RECOMMENDED.** It is a server build (queue, endpoints, claim model, printer auth) and it makes printing **depend on internet at the event**, which is the opposite of this product's offline posture. Get one truck printing on paper first.
- (b) Build it now — justified only if printing from the *web* dashboard is a firm requirement, or if multi-device printing is wanted immediately. It would also fix dedupe properly and close the priming-vs-flush question §42 left open.
- *Recommendation: (a). Revisit once a ticket has actually printed.*

**3. Manual IP entry or discovery?**
- **(a) Manual IP first — RECOMMENDED**, with a DHCP-reservation instruction in the copy. Zero platform cost, works on every printer, and the operator can see and re-enter the address when something changes.
- (b) mDNS/Bonjour — adds `NSBonjourServices`, and many cheap printers do not advertise.
- (c) Subnet sweep — is literally the network-scanning behaviour Apple's prompt exists to police; slow and noisy on a venue network.
- *Recommendation: (a) now, (b) later as an "or find it for me" button beside the field.*

**4. Does wired printing sit behind the same `ticket_printing` gate and the same per-device toggle?**
- **(a) Yes to both — RECOMMENDED.** One gate, one toggle, one card. Anything else means two answers to "can this truck print".
- 🔴 **But there is a sub-decision you cannot dodge: where does the printer's IP address live?** A Bluetooth pairing is device-bound, which is why all four printing settings are device-local. **A LAN address is not** — it is a property of the *truck's network*, identical for every device, and putting it in device-local Preferences means re-typing it on each device and no way to fix it centrally. Options: keep it device-local (cheapest, consistent with today, no migration) · make it truck-level (a column; matches reality; needs a migration and a Manage or Settings control). *Recommendation: device-local for the first build — one truck, one device — and revisit with the one-printing-device guard, which is the natural place for a truck-level printing configuration to live.*

## C6. Questions only the truck can answer

🔴 **Question 1 decides most of Part C, and nothing in this repository or database answers any of these.**

1. **What is the printer — exact make and model?** And does it have an **Ethernet port**, a **USB port**, Bluetooth, or some combination? (A photo of the back of the printer answers this faster than a conversation.)
2. **How is it connected today, and what drives it?** Is it plugged into a router, or into a till or a laptop by USB? Something is printing to it now — what?
3. **Which device do they run HatchGrab on in the kitchen** — an iPad (which model, which iPadOS) or an Android tablet? 🔴 **If the printer is USB-only and the device is an iPad, there is no software answer** (B3) and they need to know that early.
4. **Is there Wi-Fi at their events, and whose is it?** Their own router, the venue's guest network, or a phone hotspot? (Venue guest networks frequently use client isolation, which blocks tablet→printer traffic entirely.)
5. **Do they need it to work with no internet at all?** If yes, that rules out the server-queue option permanently and settles decision 2.
6. **58 mm or 80 mm paper?** (The setting exists and defaults to 80.)
7. **One kitchen device or two?** This decides how urgent the duplication guard is (B6).

---

## Risk table

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 🔴 **Duplicate tickets** — a LAN printer is reachable by every device, removing the physical protection device-local dedupe has silently relied on | **High** once web or a second device exists | Every ticket printed twice, mid-service | One-printing-device guard in the first build (C2.7); server-side claim later (B6.2) |
| R2 | 🔴 **Nothing has ever printed** — every constant is arithmetic, and the partial-write path has never run | **Certain** that something will be wrong first time | The first real service is the first real test | Hardware checklist C4; virtual printer before hardware; measure the feed with a ruler |
| R3 | iOS Local Network permission refused, or the prompt not understood | Medium | Printing silently fails and looks broken | Map to the existing `'unauthorised'`; a specific instruction in the card, as BLE already does |
| R4 | Printer's DHCP address changes | **High** over weeks | Printing stops with no obvious cause | DHCP reservation in the setup copy; show the address in `status()`; a clear "can't reach 192.168.1.50" message |
| R5 | Venue Wi-Fi uses client isolation | Medium at public venues | Tablet cannot reach the printer at all | Recommend the truck's own router; state the requirement in the copy |
| R6 | 🔴 Third-party TCP plugin lacks SPM support → **cannot be installed at all** on this Capacitor 8 SPM project | **High** for the surveyed plugins | Late discovery derails the build | Verify `Package.swift` before planning; default to a small custom plugin |
| R7 | Supply-chain risk from a ~14-commit npm package carrying kitchen ticket bytes | Medium | Same class as the V13.0 untrusted-URL lesson | Custom plugin, or pin exactly as `bluetooth-le` is pinned and read the source |
| R8 | The transport selector changes behaviour for a device that already has BLE configured (Gusto) | Low if built as specified | A trading truck's printing changes without being asked | Absent kind key ⇒ exactly today's transport; harness `printing-gating.cjs` |
| R9 | Android 12+/14 `PendingIntent` mutability rule (USB path only) | High if B2 is built carelessly | Crash on the permission request | Known and documented; covered by the first hardware test |
| R10 | Privacy manifest goes stale when a plugin is added | Medium | ITMS-91053 at upload — rejected before review | Re-run the audit, as `PrivacyInfo.xcprivacy`'s own header instructs |
| R11 | `renderTicket` output drifts during the build | Low | Every past ticket review invalidated | `printing-escpos-identity.cjs` byte-compares against HEAD |

---

## Manual sections that are stale

**`docs/reference-manual.md` is NOT edited by this investigation.** Recorded for a later pass:

1. 🔴 **§36 and §42 list `print_jobs` as BUILT in Phase A** — *"Phase A — BUILT … + dedup + `print_jobs`"* and a table spec `(order_key, van_id, status, attempts, printed_at, error)`. **The table does not exist** (LIVE: 70 tables, not among them). §42's later text and `usePrinting.ts` both say correctly that there is no `print_jobs` table — so the manual contradicts itself, and the newer statement is the true one.
2. 🔴 **§36's "Spec'd `van_devices` columns: `printer_id, printer_name, printer_class, paper_width, print_lead_mins, ticket_type`"** — **none exists** (LIVE: `van_devices` has exactly ten columns, none of them printing).
3. 🔴 **`lib/printing/transport.ts`'s own header** — *"TWO backends implement this SAME interface, selected by `van_devices.printer_class`"*. That column does not exist; selection is hard-coded in `getPrinterTransport()` on `Capacitor.isNativePlatform()` alone. **A code comment, not the manual — but it is the comment a wired build will read first.**
4. 🔴 **`supabase/migrations/20260806_trucks_print_trigger_mode.sql` header says "🔴 WRITTEN, NOT RUN"** — the column **is live** (`text`, `NOT NULL`, default `'lead_time'`, all 12 trucks). Same class as the V11.26 correction the manual already records.
5. 🔴 **V11.21's `neverForLocation` note** — *"the prompt is gone and the DECLARATION is not"*. The app manifest now declares `usesPermissionFlags="neverForLocation"` and **the merged release manifest carries it**, with both location permissions removed. Closed.
6. ⚠️ **§36 places the config UI in the "Menu & Stock" tab.** It is in the **Settings** tab (`app/dashboard/[token]/page.tsx`, and `PrintingSettings.tsx`'s own header).
7. ⚠️ **The MFi claim** (§42, §36 and `bleTransport.ts`) — *"requires enrolment in Apple's MFi Program"*. Per Apple's MFi FAQ, **app developers do not join MFi**; the accessory manufacturer authorises specific apps, and the accessory's PPID goes in the App Review notes. The blocker is real; the mechanism described is not.
8. ⚠️ **§42's OPEN list** — *"`transport.ts` cannot fail … `failed`/`unknown` are unexercised"* is marked CLOSED V11.19, which is true of the *code*. They remain **unexercised against hardware**, and R2 says why that distinction matters.
9. ⚠️ **§42's "Ordering is acceptance order, not collection-time order — STILL OPEN"** — confirmed still open; `selectDueToPrint` does not sort.

---

## What I could not establish

1. **The truck's printer make, model or connection.** Nothing in the repository or the database records it. **Question 1 of C6 decides most of Part C**, and until it is answered every recommendation here is conditional.
2. **Whether `@deedarb/capacitor-tcp-socket` genuinely ships SPM support and works on Capacitor 8.** The GitHub page shows a compatibility table claiming 8.x and a `Package.resolved`, but the iOS integration visible is a `.podspec` and **I could not read a `Package.swift`**. npm returned HTTP 403 to the fetch. 🔴 **Must be confirmed before any plan depends on it** (R6).
3. **Whether Gusto's iPad has `hg_print_enabled` on.** It is device-local Capacitor Preferences; there is no server record and nothing here can read it. The default is off and nothing has ever printed, so *probably* off — but that is an inference, not an observation, and C3 flags it as a pre-ship check.
4. **The exact iOS behaviour of a raw TCP connect to a literal private IP across every iOS version.** Apple's documentation and the Local Network Privacy FAQ both say direct local connections require the permission; the authoritative Apple page returned only partially to the fetch, so the *precise* trigger conditions (and any iOS 18/26 changes) should be confirmed on a device before the copy is written.
5. **Whether Star or Epson would authorise HatchGrab's bundle ID against a PPID** (B3). That is a vendor process with a lead time, not a code question — and it is only relevant if the iPad-USB route is pursued, which C1 recommends against.
6. **Real throughput and reliability of any option.** No printer has ever been connected (A7), so nothing about timing, buffering, socket lifetime or failure behaviour in this report is observed.

---

**Nothing was changed.** No code, no package, no migration, no database write. `git status` is byte-identical to §0 apart from this file.
