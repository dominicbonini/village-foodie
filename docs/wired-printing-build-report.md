# Wired printing — build report

17 September 2026. Localhost and native builds only. **Nothing deployed, nothing submitted, no migration applied.**
Companion to `docs/wired-printing-investigation-report.md` (the investigation this build follows).

## 1. In one paragraph

A wired (network, port 9100) printer backend now sits behind the same `PrinterTransport` seam as Bluetooth,
selected by a device-local **Printer type** choice inside the Settings card's connect step. Nothing above the
seam changed: `renderTicket`, `mapOrderToTicket`, `selectDueToPrint` and `usePrintWatcher` are byte-identical
to HEAD, and a device that has never chosen a type — every device in the field today, including Pizzeria
Gusto's — runs exactly the code it ran yesterday. The socket is a **local Capacitor plugin with no third-party
dependency** (`plugins/hatchgrab-net-printer`, Swift `Network.framework` + Java `java.net.Socket`), compiled
into both apps (iOS `** BUILD SUCCEEDED **`, Android `app-debug.apk`). One printing device per van is enforced
for wired only, through a new authenticated route and two nullable columns whose migration is written but
**not applied**. Seven harnesses (each with a broken variant that fails first) plus a live run against a
virtual printer prove the failure split, dedupe, gating, guard and copy rules. `tsc` clean, `next build` clean,
eslint delta zero, all 22 pre-existing harness families green.

## 2. What was built, by brief item

### B1 — transport (`lib/printing/`)

| Symbol | File | What |
|---|---|---|
| `PrinterClass` | transport.ts | widened to `'mfi' \| 'ble' \| 'net'` |
| `PrinterKind`, `PRINTER_KIND_KEY` | transport.ts | `'ble' \| 'net'`, stored per device under `hg_printer_kind`. **Absent = `'ble'` = today.** |
| `getPrinterKind` / `loadPrinterKind` / `setPrinterKind` | transport.ts | read / load-once / write. A kind change **retires** the module singleton (sets it to `null`); it never disconnects, so the BLE pairing survives a switch and back. |
| `getPrinterTransport` | transport.ts | native + `'net'` → `createNetTransport()`; native + anything else → `createBleTransport()` (unchanged path); web → the honest stub whatever the kind. |
| `PrinterTransport.reconnect?()` | transport.ts | new **optional** method. BLE's implementation calls the same `reconnectStoredPrinter` as before; the wired backend no-ops (one socket per ticket, no session). `usePrinting` now calls `t.reconnect?.()` and no longer imports a BLE function — the seam leak is closed. |
| `createNetTransport` | netTransport.ts | `availability` (native-only; `'unauthorised'` after an iOS Local Network refusal), `scan` → `[]`, `connect` = parse → probe (ESC @) → **store only after success**, `sendBytes` = one socket per ticket, `status` connected only while an address is stored **and** the last probe/send succeeded, `disconnect` clears the address. |
| `parseNetAddress`, `DEFAULT_NET_PRINTER_PORT`, `NET_ADDRESS_HELP` | netAddress.ts | `"host"` or `"host:port"`, default 9100; shared by card, transport and route so one rule validates everywhere. |

**The failure split, as implemented in `createNetTransport.sendBytes`:** plugin result `ok:false` with
`bytesWritten === 0` → `{ ok:false }` (watcher outcome `'failed'`, certain, retried silently); `bytesWritten > 0`
→ **throw** `partial write after N of M bytes` (outcome `'unknown'`, POSSIBLE DUPLICATE banner, sticky); the
bridge itself throwing → rethrow (`'unknown'`).

### B2 — the plugin (`plugins/hatchgrab-net-printer/`, npm `@hatchgrab/net-printer`, linked with `file:`)

- **API** — `probe({host, port, connectTimeoutMs, writeTimeoutMs})` → `{ok, error?, errorCode?}`;
  `send({host, port, base64, connectTimeoutMs, writeTimeoutMs})` → `{ok, bytesWritten, error?, errorCode?}`.
  `errorCode ∈ refused | timeout | unreachable | reset | permission | unknown`. The web stub answers
  `ok:false, errorCode:'unsupported'`.
- **iOS** — `NWConnection` over TCP, `prohibitedInterfaceTypes = [.cellular]`, connect 5000 ms / write
  10000 ms, `bytesWritten` exact. `.waiting(.posix(ENETDOWN | EHOSTUNREACH))` against a private address is
  classified `'permission'` — the only observable form of a Local Network refusal (iOS has no query API).
  `Info.plist` gains `NSLocalNetworkUsageDescription` with the exact required text; **no `NSBonjourServices`**.
- **Android** — `java.net.Socket` on a background `Thread`, `connect(timeout)` + `soTimeout`, 4096-byte chunks,
  `bytesWritten` exact. The plugin manifest declares **no permission**; the merged manifest of the built APK
  shows `INTERNET` and `ACCESS_NETWORK_STATE` already present from before, nothing new.
- **Privacy-manifest audit (re-run)** — the Swift source imports only `Foundation`, `Capacitor`, `Network`;
  zero matches for any required-reason API family (file timestamps, disk space, system boot time, active
  keyboards, `UserDefaults`). `PrivacyInfo.xcprivacy` needs no change.
- **`npx cap sync`** — succeeded; `@hatchgrab/net-printer@0.1.0` is the 10th iOS plugin
  (`ios/App/CapApp-SPM/Package.swift`) and the Android project includes `:hatchgrab-net-printer`
  (`android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`).
- **Builds** —
  - iOS: `xcodebuild -project App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator'` →
    `** BUILD SUCCEEDED **`, 0 warnings, `NetPrinterPlugin.o` + `NetPrinterPlugin.swiftmodule` produced; the built
    `App.app/Info.plist` carries the Local Network string and has no `NSBonjourServices`.
  - Android: `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk` (8.9 MB);
    `NetPrinterPlugin.class` compiled and the plugin AAR built.
- **Version bumps needed for a release** (not done): iOS `CURRENT_PROJECT_VERSION` 2 → 3 and
  `MARKETING_VERSION` (bump the patch); Android `versionCode` 1 → 2, `versionName` "1.0" → "1.1";
  `package.json` version is 0.1.0 and is not what the stores read. The plugin's own version stays 0.1.0.

### B3 — one printing device per van (wired only)

- **Migration** `supabase/migrations/20260919_van_network_printer.sql` — **NOT applied.** Adds
  `truck_vans.network_printer_address text` and `truck_vans.network_print_device_id text`, both nullable, no
  defaults, `if not exists`, ends `notify pgrst, 'reload schema'`. Read-only check today:
  `truck_vans?select=network_printer_address&limit=1` → **42703** (absent), as expected.
- **Route** `app/api/printing/route.ts` (new, so none of the five forbidden files is touched) — `verifyToken`
  copied from the dashboard action route with its 503/401 split; `vanForDevice` reads `van_devices` for the
  device then `truck_vans.name`; `readNetColumns` is a **separate probed select** of exactly
  `network_printer_address, network_print_device_id`, logging PGRST204 (cache stale) and 42703 (absent)
  distinguishably and returning `columnsAvailable:false`. `GET` → `{columnsAvailable, vanId, vanName, truckName,
  address, printingDeviceId}`. `POST` actions: `claim`, `release` (only if this device holds it), `set_address`
  (validated by `parseNetAddress`). Every write is scoped `.eq('truck_id', auth.truck.id)`.
- **Guard** `lib/printing/networkGuard.ts` — `decideNetPrinting({deviceId, info, cachedHolder})` →
  `{state, shouldClaim}`: unheld → `ok` + auto-claim; held by this device → `ok`; held elsewhere → `other`
  ("Printing is on another device. Move printing to this device?" + button "Move printing to this device");
  no van binding → `unbound`; route unreachable or columns unreadable → the **cached claim** decides: cached
  "this device" → `ok` (keeps printing, claims nothing), otherwise `unknown` ("Can't check which device is
  printing right now."). Cache key `hg_net_claim_<vanId>` in Preferences.
- **Where it gates** — `usePrinting`: `guardOk = kind !== 'net' || netGuard === 'ok'` and
  `active = isNativeApp() && canPrint && enabled && ready && guardOk`. For `'ble'` (or absent) `guardOk` is
  `true` and the expression is HEAD's four terms exactly (proved against a HEAD worktree). The guard effect
  returns before any request unless `kind === 'net'`.

### B4 — Settings card (`components/printing/PrintingSettings.tsx`)

The connect step now opens with **Printer type: Bluetooth / Wired** (inside the enabled block, before any
scan/connect control), then branches. Bluetooth branch = today's controls, with two copy fixes ("Connect a
Bluetooth printer", "most printers only appear…"). Wired branch = address field (placeholder `192.168.1.50`),
the help line, **Connect** (probe + store + `set_address`), **Print test ticket**, **Disconnect**, a status
line, the iOS permission line, and the guard UI for `other` / `unknown`. The test ticket
(`lib/printing/testTicket.ts`, `renderTestTicket`) goes through `renderTicket` and straight to
`transport.sendBytes` — it never enters the watcher, dedupe or the printed set (proved).

**Is "connect, then ask wired or wireless" best practice and cleanest?** Yes, with one refinement, which is
what was built: the question is asked **inside** the connect step rather than as a separate screen. Printer
setup wizards on Square, Lightspeed and Epson's own apps all put the interface choice first because every
later control depends on it (scan vs. address field, Bluetooth-off vs. Local-Network messages). Asking it
once, remembering it per device, and showing only the matching controls is cleaner than a shared control set
with conditional sentences, and it keeps every Bluetooth-only sentence out of the wired path (proved by
`printing-copy.cjs`). A separate "wired or wireless?" modal before the card would add a step with no
information the card doesn't already show.

### B5 — landing / marketing copy (HOLD group)

`lib/plan-features.ts` (row detail + footnote 5 → "Bluetooth or wired printer", a comment de-thermal'd),
`app/landing/page.tsx` ("Kitchen ticket printing (Bluetooth or wired printer)"), `content/store-listing.md`
("Connect a Bluetooth or wired printer…"; the reviewer note now says Bluetooth **and wired** printing on
Android are unobserved on hardware, which is true). No customer-facing "thermal" remains.
`findPlanParityViolations()` → `[]`; plain-English checker 111/112 with the one pre-existing known violation.

### Dev tooling

`scripts/dev-virtual-printer.cjs` — a plain TCP listener (default 127.0.0.1:9100), one file per connection,
`--refuse` (port closed → ECONNREFUSED), `--drop-after N` (TCP RST after N bytes), `--delay MS`.

## 3. Proof

### The seven harnesses (broken variant first, then the real check)

| Harness | Broken variant (must FAIL) | Result |
|---|---|---|
| `printing-escpos-identity.cjs` | `TICKET_LEADING_FEED_LINES` 2→3 changes the bytes | FAILED as required; **renderTicket byte-identical to HEAD on 18 fixtures** (9 orders × 58/80 mm) |
| `printing-transport-contract.cjs` | a transport answering `ok:true` without calling the plugin | FAILED as required; 27 ✓ — stub/net/ble implement the six methods; availability ∈ four answers; net stores the address only after a successful probe; status drops to not-connected after a failed send; permission refusal → `'unauthorised'`; web → unsupported |
| `printing-failure-split.cjs` (**live**) | a transport mapping every plugin failure to `ok:false` | FAILED as required; 20 ✓ — see the run below |
| `printing-dedupe.cjs` | both devices active (guard bypassed) → 4 prints for 2 orders | FAILED as required; 9 ✓ — one device prints each order once across three ticks; with the guard, dev-1 prints 2, dev-2 prints 0; after "Move printing", dev-2 prints its own copy once and dev-1 stops; test ticket never touches the watcher |
| `printing-gating.cjs` | a selector reading absent as `'net'` | FAILED as required; 19 ✓ — absent/garbage kind → `'ble'`; the transport is BLE and never touches the NetPrinter plugin; `canAccess('trial','ticket_printing',{},"2026-12-31…")` → true for Gusto's live shape; HEAD's `active` terms unchanged; `usePrinting(` mounted only from the dashboard page; `app/kds` imports nothing; web + `'net'` → stub |
| `printing-network-guard.cjs` | a shared select naming the new columns | FAILED as required; 37 ✓ — every `decideNetPrinting` branch, the cached-claim rule, `parseNetAddress`, route validation, the one probed select, the five forbidden files never mention the columns, migration shape |
| `printing-copy.cjs` | "thermal" reinstated on the landing page | FAILED as required; 41 ✓ — no "thermal" in any rendered string; marketing says "Bluetooth or wired"; five Bluetooth-only sentences live only inside the `kind !== 'net'` branch; Info.plist exact; plugin manifest has no permission |

### The live dev run (`printing-failure-split.cjs` against `dev-virtual-printer.cjs`)

The real `netTransport.ts` is driven end to end; the only stand-in is the native plugin, replaced by a Node
socket implementing the same contract (connect → 4096-byte chunked write → close, `bytesWritten` exact).

```
1. --refuse   connect → ok:false "Can't reach the printer at 127.0.0.1:9109 — it isn't accepting connections."
              no address stored · sendBytes → outcome 'failed'
2. healthy    connect (probe) ok · sendBytes → 'printed' · status connected
              connection 1 received exactly ESC @ (2 bytes) · connection 2 received the ticket bytes exactly (379 bytes)
3. --drop-after 64 (RST)
              ~1 MB stream → 'unknown' — "partial write after 466944 of 758000 bytes" · status not connected
              ℹ a single 379-byte ticket → 'printed' (see the finding below)
4. black hole connect('10.255.255.1') → ok:false after 5003 ms "…didn't answer in time." · stored address untouched
5. the rule   bytesWritten 0 → 'failed' · 1 → 'unknown' · 500 → 'unknown' · bridge throws → 'unknown'
6. sticky     everUnknown = prior || outcome==='unknown' · mayDuplicate from everUnknown · key enters the set ONLY on 'printed'
```

**A finding about TCP, not a defect:** a printer that accepts a whole 379-byte ticket into its receive buffer
and then dies is invisible to the sender — every byte was already handed to the kernel, so the write
succeeded and the transport reports `'printed'`. The same is true of the hardware: raw port-9100 printers send
no acknowledgement. The failure split can only ever be as good as what the sender can observe, which is why a
real mid-stream failure (case 3) is a throw and why the hardware test below includes a pull-the-plug step.

### The sweep

- `npx tsc --noEmit` — clean.
- `npx next build` — `✓ Compiled successfully`, 96 pages, `ƒ /api/printing` present.
- eslint on the 12 changed/new files vs a clean HEAD worktree, per rule: `@typescript-eslint/no-unused-vars`
  2 → 2, `react-hooks/refs` 6 → 6, `react-hooks/set-state-in-effect` 1 → 1. **Delta zero**; the new files
  contribute no message.
- All pre-existing harnesses rerun and green: 8 `slot-interval-*`, 2 `batch-rolling-*`, 7 `outreach-*`,
  5 `whatsapp-*` (22 files).

### `git status` — three groups (the collection-times work in progress is omitted; it is untouched)

**PRINTING** (ship together)
```
 M android/app/capacitor.build.gradle      M ios/App/App/Info.plist
 M android/capacitor.settings.gradle       M ios/App/CapApp-SPM/Package.swift
 M components/printing/PrintingSettings.tsx M lib/printing/bleTransport.ts
 M lib/printing/transport.ts               M lib/printing/usePrinting.ts
 M package.json                            M package-lock.json
?? app/api/printing/route.ts               ?? lib/printing/dashboardPin.ts
?? lib/printing/netAddress.ts              ?? lib/printing/netTransport.ts
?? lib/printing/networkGuard.ts            ?? lib/printing/testTicket.ts
?? plugins/hatchgrab-net-printer/          ?? scripts/_printing-mocks.cjs
?? scripts/dev-virtual-printer.cjs         ?? scripts/printing-{escpos-identity,transport-contract,failure-split,dedupe,gating,network-guard,copy}.cjs
?? docs/wired-printing-investigation-report.md  ?? docs/wired-printing-build-report.md
```
**HOLD UNTIL THE APP UPDATES ARE LIVE** (the claims become true only when both stores carry the build)
```
 M app/landing/page.tsx    M lib/plan-features.ts    M content/store-listing.md
```
**MIGRATION** (apply before the wired card is used on a real van; harmless if applied earlier)
```
?? supabase/migrations/20260919_van_network_printer.sql
```
The five forbidden files (`app/dashboard/[token]/page.tsx`, `app/api/manage/route.ts`,
`app/api/dashboard/action/route.ts`, `app/api/dashboard/route.ts`, `lib/supabase.ts`) were **not edited** by
this build (proved by `printing-network-guard.cjs`; their `M` flags are the collection-times work).

## 4. Migration and verification SQL

**Applied by Dominic on 17 September 2026.** Confirmed read-only afterwards: both columns exist and every
row is null; the confirming query and its result are in docs/wired-printing-followup-report.md.

Apply (Supabase SQL editor, in this order):
```sql
alter table public.truck_vans add column if not exists network_printer_address text;
alter table public.truck_vans add column if not exists network_print_device_id text;
comment on column public.truck_vans.network_printer_address is 'Wired printer host[:port] for this van (port 9100 default). Set from the Settings card.';
comment on column public.truck_vans.network_print_device_id is 'The ONE device printing wired tickets for this van (device_id from van_devices). Null = unclaimed.';
notify pgrst, 'reload schema';
```
Verify (read-only; every column table-qualified):
```sql
select columns.column_name,
       columns.data_type,
       columns.is_nullable,
       columns.column_default
from information_schema.columns as columns
where columns.table_schema = 'public'
  and columns.table_name = 'truck_vans'
  and columns.column_name in ('network_printer_address', 'network_print_device_id');
-- expect two rows, text, YES, null

select truck_vans.id,
       truck_vans.truck_id,
       truck_vans.name,
       truck_vans.network_printer_address,
       truck_vans.network_print_device_id
from public.truck_vans
order by truck_vans.truck_id, truck_vans.name;
-- expect every row null/null immediately after applying
```
Then `GET /api/printing?token=<dashboard token>&device_id=<id>` **from a TEST TRUCK device** must answer
`columnsAvailable: true`. If it answers `false` with `[printing] … PGRST204` in the logs, the schema cache did
not reload — run the `notify` again. 🔴 Never call this route with a live truck's token or device id.

## 5. Testing wired printing

### 5a. On a real device with NO PRINTER — the Mac as the printer (start here)

`scripts/dev-virtual-printer.cjs` is a TCP listener that behaves like a port-9100 printer and writes what it
receives to a file. With `--host 0.0.0.0` it accepts from the LAN, so an iPad or Android tablet on the same
Wi-Fi can print to the Mac. This needs no hardware and no live truck.

1. **Run it on the Mac**, bound to the network rather than loopback:
   ```
   node scripts/dev-virtual-printer.cjs --host 0.0.0.0 --out ~/hg-printer
   ```
   It prints `virtual printer on 0.0.0.0:9100 out=…`. (The default is `127.0.0.1`, which a device cannot
   reach — `--host 0.0.0.0` is the whole point of this step.)
2. **Find the Mac's Wi-Fi address:** System Settings → Wi-Fi → **Details…** next to the connected network →
   **TCP/IP** → *IP address*. It looks like `192.168.1.24`. Both machines must be on the **same** Wi-Fi (not
   a guest network, and not one with client isolation).
3. **Allow the firewall prompt.** The first run pops *"Do you want the application node to accept incoming
   network connections?"* — click **Allow**. If you miss it: System Settings → Network → Firewall → Options,
   and allow `node`. With it blocked the device sees a connect timeout and the card says the printer didn't
   answer in time.
4. **Install the debug build on the device** — Xcode (iOS) or Android Studio (Android), run to the connected
   device. This is required: the App Store / Play build has no NetPrinter plugin, so it will not show a
   Printer type choice at all (§2 FIX 1).
5. **On TEST TRUCK only** — never a live truck's dashboard — open Settings → Printing, turn printing on,
   choose **Wired**, enter the Mac's IP from step 2 (no port needed; 9100 is the default), tap **Connect**,
   then **Print test ticket**.
6. **Read the Mac's output.** The terminal prints one line per connection, e.g.
   `#1 received: 2 bytes ESC@=yes cut=no` (the Connect probe) then
   `#2 received: 379 bytes ESC@=yes cut=yes` (the test ticket). The files land in `~/hg-printer/`; view one
   with `cat -v ~/hg-printer/ticket-*.bin` to see the text between the escape codes.

**The failure cases, same setup:**
- `--refuse` — the port is closed, so every connect is refused. Expect **"Can't reach the printer at
  <ip>:9100 — it isn't accepting connections."** and, for a real order, the ticket stays *waiting*: nothing
  is marked printed and no duplicate banner appears, because nothing could have printed.
- `--drop-after 64` — the listener accepts, then resets the connection after 64 bytes. A small ticket usually
  still reports success (the whole thing fits in the kernel buffer before the reset arrives — see §3); a
  large one fails mid-stream and the NEXT ticket carries **POSSIBLE DUPLICATE**, which is the behaviour to
  confirm.
- `--delay 3000` — the listener accepts but stalls before reading, exercising the 10 s write timeout.

**The iOS Local Network prompt:** the FIRST Connect on an iPhone/iPad shows *"HatchGrab would like to find
and connect to devices on your local network."* Allow it. If it is ever refused, the card says **"HatchGrab
needs permission to reach your printer. Turn on Local Network for HatchGrab in Settings."** — re-enable it at
Settings → HatchGrab → Local Network. There is no API to ask for this permission, so a refusal is only
visible as a failed connection; that is why the wording points at Settings rather than offering a button.

### 5b. With real hardware (one printer, two devices, ~20 minutes)

🔴 **TEST TRUCK ONLY, and the WAITING TRUCK's printer model.** Never Pizzeria Gusto's printer, dashboard,
token or account — Gusto is trading.

Precondition: migration applied (§4); both devices bound to the same van (a row in `van_devices` for each);
printer on the kitchen router with a fixed DHCP lease; its IP known.

1. Device A, Settings → Printing → **Wired** → type the IP → **Connect**. Expect "Connected to <ip>:9100" and
   a probe that moves no paper (ESC @ only).
2. **Print test ticket** on A. Expect one ticket headed "Test ticket". Confirm the dashboard shows no order
   marked printed and the watcher's dedupe list is unchanged (print a real order later and see it print).
3. Place a test order on the test truck; accept it. Expect one ticket on A.
4. Device B, same card, same IP, **Connect**. Expect "Printing is on another device. Move printing to this
   device?" with the button. Do **not** press it. Accept a second order. Expect exactly one ticket, from A.
5. Press **Move printing to this device** on B. Accept a third order. Expect exactly one ticket, from B; A's
   card now shows the "another device" line.
6. Unplug the printer's Ethernet. Accept a fourth order on B. Expect no ticket and the status line
   "Can't reach the printer…"; the order stays due. Re-plug. Expect the ticket on the next tick, once.
7. Pull the printer's **power** during a long ticket (an order with a very long note). Expect either a normal
   ticket (the printer had already buffered it) or a POSSIBLE DUPLICATE banner on reprint — never a silent
   loss.
8. Airplane mode on B for 30 s, then off. Expect printing to resume without touching the card (`reconnect`
   is a no-op for wired; the next ticket simply opens a new socket).
9. iOS only: Settings → HatchGrab → Local Network **off**. Press Connect. Expect "HatchGrab needs permission
   to reach your printer. Turn on Local Network for HatchGrab in Settings." Turn it on; Connect succeeds.
10. Switch B to **Bluetooth**, then back to **Wired**. Expect the address still filled and one Connect to
    restore the status line; the Bluetooth pairing (if any) untouched.

## 6. Release checklist

1. Apply the migration (§4) and verify with the read-only SQL there; `notify pgrst, 'reload schema'`.
2. Bump versions (§2 B2), `npx cap sync`, archive iOS, build the Android release bundle.
3. App Store review notes: mention the Local Network prompt and that no Bonjour is used; the wired path is
   testable with any port-9100 printer or `scripts/dev-virtual-printer.cjs --host 0.0.0.0` on the reviewer's
   LAN.
4. Deploy the web build **with** the PRINTING group. 🔴 The shells are remote-URL, so this reaches every
   device the moment it deploys — which is safe only because the Printer type choice is gated on the running
   binary carrying the NetPrinter plugin (§2 FIX 1). An older app renders the Bluetooth card exactly as
   before and never calls `/api/printing`.
5. When both stores carry the build, deploy the HOLD group.
6. 🔴 **Before telling any operator the feature exists, run §5b with the WAITING TRUCK'S printer model, on
   TEST TRUCK.** Never use Pizzeria Gusto's printer, dashboard or account for any part of this — Gusto is a
   live trading truck, and any look at its screens is Dominic's, read-only.

## 7. Pizzeria Gusto — look-only check

- Gusto's devices have **no `hg_printer_kind`** stored (the key is new), so `getPrinterKind()` → `'ble'`,
  `getPrinterTransport()` → the BLE backend, the wired-guard effect returns before any request, and `active` is
  HEAD's expression. `printing-gating.cjs` proves each of those against the live plan shape
  (`plan 'trial'`, `feature_overrides {}`, `trial_expires_at 2026-12-31`) → `canAccess` true, unchanged.
- The Settings card renders the Bluetooth branch by default; the only new element Gusto's operator can see is
  the Printer type pair, with Bluetooth pre-selected.
- Gusto has **1** device bound to a van (`van_devices`, count only). The new columns do not exist on
  production today (42703), and no code path outside the probed route reads them, so nothing on the dashboard,
  manage, KDS or order pages changes.
- **Not observed:** Gusto's own device running this build (no deploy). A missing setting means UNCHANGED, never new.

## 8. One limitation that needs two lines on a forbidden file (not made)

> ⚠️ **SUPERSEDED IN PART, 17 September 2026.** `lib/printing/dashboardPin.ts` — the storage-key guessing
> described below — has been **deleted**. A PIN truck is now DETECTED (from `/api/printing`'s own 401 +
> `requiresPin`) and the wired branch says so in one sentence instead of failing obscurely. See FIX 2 in
> docs/wired-printing-followup-report.md. The two-prop change recorded below is unchanged and still the fix.

`/api/printing` verifies the dashboard token exactly like the dashboard action route, which includes the PIN
for a truck that has one. The dashboard page keeps that PIN **only in React state**
(`const[pin,setPin]=useState('')` at `app/dashboard/[token]/page.tsx:218`, set at line 1888) — it is never
stored, so no helper can read it. Consequence on a **PIN-protected** truck: the wired card shows
"Wired printing isn't available on dashboards with a PIN yet." and never attempts a claim.

Read-only today: **0 of 12 trucks have a PIN** (Gusto and test-truck included), so no live truck is affected.
When a truck does get a PIN, the fix is two props on the forbidden page — `pin={pin}` on the
`<PrintingSettings …/>` at line 5180 and `pin` inside the `usePrinting({…})` call at line 3114 — threaded
through to `resolveNetGuard(token, deviceId, pin)`. Both hooks already accept it; only the page can supply it.

## 9. Stale manual sections (to rewrite when this ships; not touched)

`docs/reference-manual.md` — §42 "Kitchen ticket printing — Phase A" (line 22518), "Kitchen ticket printing
(design + Phase A built)" (7998–8009: "a standard Bluetooth printer is NOT a safe assumption on iOS" is still
true but is now one of two options), the V11.18 delta at 3327–3349 ("Bluetooth LE is the transport" — now one
of two), and the architecture line at 7777 ("Bluetooth printer (Max, post-trial)"). `docs/printing-report.md`,
`docs/printing-architecture-report.md` and `docs/printing-ticket-layout-report.md` describe the seam as
Bluetooth-only and predate `'net'`; they are historical reports, not the manual, and can carry a one-line
pointer to this document.

## 10. Could not establish

- Whether the plugin **runs** correctly on a device or simulator — both apps compile and link it, but no
  simulator was booted and no hardware was available. The JS layer above it is proved; the two native files
  (128 lines Swift, 85 lines Java) are unexecuted.
- The iOS Local Network heuristic (`ENETDOWN`/`EHOSTUNREACH` on a private address → `'permission'`) against a
  real refusal; it follows Apple's documented behaviour but is unobserved.
- Whether any real port-9100 printer needs more than ESC @ as a probe (some Star models answer nothing and
  accept anything; that still passes).
- How a PIN-protected truck behaves end to end (§8) — no such truck exists.
