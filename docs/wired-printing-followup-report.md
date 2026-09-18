# Wired printing — follow-up fixes

17 September 2026. Localhost and native builds only. **Nothing deployed, nothing submitted.** No live truck
was called, read through an app surface, or changed in any way. Follows `docs/wired-printing-build-report.md`,
whose §4, §5, §6 and §8 this work rewrote.

## 0. The prompt

No span arrived garbled, and no instruction contradicted another. Two instructions were conditional stops and
both conditions resolved in favour of proceeding — the finding for each is in §2 (FIX 1) and §3 (FIX 2).

## 1. `git status`

### Before

HEAD `fc0fddc outreach`. 32 modified, 45 untracked — the collection-times work, the rolling fix, the durable
harness work and the wired-printing build, all uncommitted.

```
 M android/app/capacitor.build.gradle      M android/capacitor.settings.gradle
 M app/api/dashboard/action/route.ts       M app/api/dashboard/route.ts        M app/api/events/route.ts
 M app/api/manage/route.ts                 M app/api/menu/[truckId]/route.ts   M app/api/orders/submit/route.ts
 M app/api/slots/[truckId]/route.ts        M app/dashboard/[token]/page.tsx    M app/landing/page.tsx
 M app/manage/[token]/page.tsx             M app/trucks/[slug]/order/page.tsx  M components/dashboard/AddOrderPanel.tsx
 M components/printing/PrintingSettings.tsx  M content/store-listing.md        M ios/App/App/Info.plist
 M ios/App/CapApp-SPM/Package.swift        M lib/capacity-breach.ts           M lib/orders/place-in-slot.ts
 M lib/payments/promote-draft.ts           M lib/plan-features.ts             M lib/printing/bleTransport.ts
 M lib/printing/transport.ts               M lib/printing/usePrinting.ts      M lib/slot-availability.ts
 M lib/slot-display.ts                     M lib/slot-generation.ts           M lib/supabase.ts
 M package-lock.json                       M package.json                     M scripts/whatsapp-golive-parity-harness.cjs
?? app/api/printing/   ?? docs/{batch-keep-together-investigation,batch-overlap-review,batch-rolling-durable-harness,
   batch-rolling-fix,dashboard-order-and-batch-overlap,slot-interval-build,slot-interval-event-override,
   slot-interval-hardening,slot-interval-van-level,wired-printing-build,wired-printing-investigation}-report.md
?? lib/printing/{dashboardPin,netAddress,netTransport,networkGuard,testTicket}.ts  ?? lib/slot-interval.ts  ?? plugins/
?? scripts/_batch-rolling-golden-generate.cjs  ?? scripts/_batch-rolling-snapshot.cjs  ?? scripts/_printing-mocks.cjs
?? scripts/_slot-interval-compile.cjs  ?? scripts/batch-rolling-check.cjs  ?? scripts/batch-rolling-identity.cjs
?? scripts/dev-virtual-printer.cjs  ?? scripts/fixtures/  ?? scripts/printing-{copy,dedupe,escpos-identity,
   failure-split,gating,network-guard,transport-contract}.cjs
?? scripts/slot-interval-{dots,engine-identity,event-override,generator,grid-routing,settings,
   van-list-tolerance,van-resolution}.cjs
?? supabase/migrations/2026091{6_collection,7_van_collection,8_event_collection}_intervals.sql
?? supabase/migrations/20260919_van_network_printer.sql
```

**No forbidden file was edited.** `app/dashboard/[token]/page.tsx`, `app/api/manage/route.ts`,
`app/api/dashboard/action/route.ts`, `app/api/dashboard/route.ts`, `lib/supabase.ts` and
`lib/slot-availability.ts` carry the same `M` they had before this work and none of their content was touched
(confirmed by diff below). No fix needed one, so there was nothing to stop for.

### After — the three groups

**PRINTING** (ship together)
```
 M android/app/capacitor.build.gradle          M ios/App/App/Info.plist
 M android/capacitor.settings.gradle           M ios/App/CapApp-SPM/Package.swift
 M components/printing/PrintingSettings.tsx    M lib/printing/bleTransport.ts
 M lib/printing/transport.ts                   M lib/printing/usePrinting.ts
 M package.json                                M package-lock.json
?? app/api/printing/route.ts                  ?? components/printing/PrinterTypeChoice.tsx   ← NEW (the gate)
?? lib/printing/netAddress.ts                 ?? lib/printing/netTransport.ts
?? lib/printing/networkGuard.ts               ?? lib/printing/testTicket.ts
?? plugins/hatchgrab-net-printer/             ?? scripts/_printing-mocks.cjs
?? scripts/dev-virtual-printer.cjs            ?? scripts/printing-{escpos-identity,transport-contract,
   failure-split,dedupe,gating,network-guard,copy}.cjs
?? docs/wired-printing-{investigation,build,followup}-report.md
   DELETED: lib/printing/dashboardPin.ts (was untracked, so it simply no longer appears)
```
**HOLD UNTIL THE APP UPDATES ARE LIVE**
```
 M app/landing/page.tsx    M lib/plan-features.ts    M content/store-listing.md
```
**MIGRATION** — `?? supabase/migrations/20260919_van_network_printer.sql`, **applied by Dominic today**.
Confirmed read-only (every column table-qualified):
```sql
select truck_vans.id, truck_vans.truck_id, truck_vans.name,
       truck_vans.network_printer_address, truck_vans.network_print_device_id
from public.truck_vans
order by truck_vans.truck_id, truck_vans.name;
```
→ **13 rows; both columns exist; 0 with an address set, 0 with a print device claimed.** Exactly the
post-migration state, and nothing has claimed anything.

Also changed, outside all three groups (the batch work's own harness, untouched by this brief):
`M scripts/whatsapp-golive-parity-harness.cjs`, `?? scripts/_batch-rolling-*`, `?? scripts/fixtures/`,
`?? scripts/batch-rolling-*`, `?? scripts/slot-interval-*`, the collection-times files and their migrations.

## 2. FIX 1 — old app binaries see no change

### The `server.url` finding, quoted

`capacitor.config.ts` builds `server.url` from
`const CAP_SERVER_BASE = process.env.CAP_SERVER_URL || 'https://www.hatchgrab.com'` and sets
`url: \`${CAP_SERVER_BASE}/app\``. The baked artefacts agree — `ios/App/App/capacitor.config.json` and
`android/app/src/main/assets/capacitor.config.json` both contain `"url": "https://www.hatchgrab.com/app"`.

**The apps do NOT bundle the web app; they LOAD IT REMOTELY from the live site.** The reference manual says
so in as many words:

> "the shell is remote-URL and loads production, so a **VERCEL DEPLOY IS NOW AN INSTANT CHANGE TO A SHIPPED**
> [app]" (line 1120)

> "Remote-URL Capacitor shell: the native webview loads the LIVE site (`server.url` → `/dashboard`), Vercel
> stays the backend." (§36 architecture, line 4453)

> "The app is a remote-URL shell pointing at PRODUCTION, so whatever is deployed during review is
> [what is reviewed]" (line 2834)

**The consequence for a device running today's store build.** The moment this web code deploys, that device
executes it — with a binary that contains no `NetPrinterPlugin`. Without a gate the failure chain is:
the operator sees a **Printer type** choice and taps **Wired** → `hg_printer_kind` stores `'net'` →
`getPrinterTransport()` builds `createNetTransport()` → every `NetPrinter.probe/send` call rejects with
*"NetPrinter does not have an implementation"* → `netTransport.sendBytes` treats a bridge rejection as a
**throw**, which `usePrinting.onPrint` maps to outcome `'unknown'`, which puts a **POSSIBLE DUPLICATE**
banner on the next ticket — about a printer the device could never have addressed. And because `active`
would then also depend on `netGuard === 'ok'`, a guard that can never resolve, **Bluetooth printing would
stop on a working truck**. This is the single most damaging thing in the wired build, and it needs no
mistake by anyone: a deploy alone is enough.

### The check, and which name it uses

`Capacitor.isPluginAvailable('NetPrinter')` — the registered name both native classes declare
(`@CapacitorPlugin(name = "NetPrinter")` in the Java, the `NetPrinterPlugin` CAPPlugin in the Swift) and the
name the JS registers (`registerPlugin('NetPrinter', …)` in `plugins/hatchgrab-net-printer/index.js`).

Why it is the right test, from `@capacitor/core` 8.4.0's own source:
```js
platforms: new Set([...Object.keys(jsImplementations), ...(pluginHeader ? [platform] : [])])
const isPluginAvailable = (n) => registeredPlugins.get(n)?.platforms.has(getPlatform()) || !!getPluginHeader(n)
const getPluginHeader = (n) => cap.PluginHeaders?.find(h => h.name === n)
```
Our registration supplies **only** a `web` implementation, so on iOS/Android `platforms.has('ios')` is false
and the answer comes solely from `Capacitor.PluginHeaders` — the list the **native bridge injects for the
classes compiled into THIS binary**. Old binary ⇒ no header ⇒ `false`. New binary ⇒ header ⇒ `true`.

⚠️ `isNativePlatform()` is required alongside it: on web `platforms.has('web')` is true (the refusing stub),
and a browser must never be told the wired backend exists. Hence, by symbol, in `lib/printing/transport.ts`:

```ts
export const NET_PRINTER_PLUGIN = 'NetPrinter'
export function isNetPrinterAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(NET_PRINTER_PLUGIN) } catch { return false }
}
```

### What it gates, by symbol

| Symbol | File | Change |
|---|---|---|
| `isNetPrinterAvailable`, `NET_PRINTER_PLUGIN` | `lib/printing/transport.ts` | **new** — the one predicate every wired surface asks |
| `getPrinterKind` | `lib/printing/transport.ts` | `_kind === 'net' && isNetPrinterAvailable() ? 'net' : 'ble'` — **a stored `'net'` reads as `'ble'`** on a binary without the plugin |
| `setPrinterKind` | `lib/printing/transport.ts` | retires the singleton against the **effective** kind, not the stored one |
| `getPrinterTransport` | `lib/printing/transport.ts` | unchanged in shape; it reads `getPrinterKind()`, so it is gated by the line above |
| `createNetTransport().availability` | `lib/printing/netTransport.ts` | returns `'unsupported'` when `!isNetPrinterAvailable()` — the same answer a browser gets |
| `PrinterTypeChoice` | `components/printing/PrinterTypeChoice.tsx` | **new file** — `if (!isNetPrinterAvailable()) return null` as its first statement |
| `PrintingSettings` | `components/printing/PrintingSettings.tsx` | renders `<PrinterTypeChoice …/>` instead of inline markup |

`PrinterTypeChoice` is its **own file** deliberately: a gate that is one `&&` inside four hundred lines of
card JSX cannot be rendered in isolation, and an untestable gate protecting live trucks is not a gate. The
harness renders this component both ways and asserts on the markup.

**The guard effect and `/api/printing` need no separate change**: `usePrinting`'s effect already begins
`if (!(isNativeApp() && canPrint && enabled && ready && kind === 'net')) return`, and `kind` now cannot be
`'net'` without the plugin. Nothing else in the wired path is reachable.

### Byte-identity of the Bluetooth card, and a copy revert

The brief requires that with the plugin absent the card be **byte-identical in content to HEAD's Bluetooth
card**. It was not, by two words: the wired build had tightened *"Connect a Bluetooth **receipt** printer"* →
*"Connect a Bluetooth printer"* and *"most **receipt** printers only appear"* → *"most printers only
appear"*. Those are improvements, but they would have changed a shipped screen on every device the day this
deploys, which is exactly what FIX 1 forbids. **Both are reverted to HEAD's wording**, unconditionally (not
per-branch), and `scripts/printing-copy.cjs` now pins HEAD's strings with a comment saying why. Tidier copy
can ride with the next binary.

Proof that nothing else changed: `git diff HEAD -- components/printing/PrintingSettings.tsx` removes exactly
**one** line, the `import` of `@/lib/printing/transport` (replaced by a wider one). Every other HEAD line is
present unaltered; all added rendered text lives inside the wired branch, which renders only when
`kind === 'net'`.

## 3. FIX 2 — the PIN guesswork removed

### How a PIN is detected without touching a forbidden file

`lib/printing/dashboardPin.ts` guessed at four storage keys (`hg_pin_<token>`, `dashboard_pin_<token>`,
`hg_dashboard_pin`, `dashboard_pin`). The dashboard page keeps the PIN **only in React state**
(`const[pin,setPin]=useState('')`, `app/dashboard/[token]/page.tsx:218`) and stores it nowhere, so the helper
**always returned `undefined`** — and a PIN truck would have got a bare 401 → `'unknown'` → *"Can't check
which device is printing right now."*, which is not what is wrong.

**The signal already exists and is mine.** `verifyToken` in `app/api/printing/route.ts` — my own route, not a
forbidden file — answers `401 { error: 'Unauthorised', requiresPin: true }` exactly when
`trucks.dashboard_pin` is set and the pin sent does not match, and the card deliberately sends none. That
response **is** the detection. No dashboard-page change, no guessing, no extra request: the GET the card
already makes carries the answer.

### By symbol

| Symbol | File | Change |
|---|---|---|
| `lib/printing/dashboardPin.ts` | — | **deleted**; nothing imports or calls it (asserted) |
| `NetGuardState` | `lib/printing/networkGuard.ts` | `+ 'pin'` |
| `NetPrintingRead` | `lib/printing/networkGuard.ts` | **new** — `NetPrintingInfo \| 'pin' \| null`, the three answers a GET can give |
| `fetchNetPrinting` | `lib/printing/networkGuard.ts` | no `pin` parameter; `401` + `requiresPin` → `'pin'`; a 401 **without** it stays `null` |
| `decideNetPrinting` | `lib/printing/networkGuard.ts` | `if (info === 'pin') return { state: 'pin', shouldClaim: false }` — **first**, and a cached claim cannot override it |
| `NET_GUARD_COPY.pin` | `lib/printing/networkGuard.ts` | `"Wired printing isn't available on dashboards with a PIN yet."` |
| `claimNetPrinting`, `releaseNetPrinting`, `setNetPrinterAddress`, `resolveNetGuard` | `lib/printing/networkGuard.ts` | `pin` parameter removed from every signature |
| `refreshNet`, the wired branch | `components/printing/PrintingSettings.tsx` | `netInfo === 'pin'` renders **only** that sentence — no address field, no Connect, no test ticket, no Move button |
| the guard effect | `lib/printing/usePrinting.ts` | `resolveNetGuard(token, getDeviceId())` |

Because `'pin'` is not `'ok'`, `guardOk` is false and the watcher never runs for a wired PIN truck — it
cannot print, and it says why rather than failing obscurely.

### The two-prop change to make later (NOT made)

After the collection-times work is committed, in `app/dashboard/[token]/page.tsx`:

1. **line ~3114**, the `usePrinting({…})` call — add `pin,` (the existing `pin` state from line 218).
2. **line ~5180**, `<PrintingSettings …/>` — add `pin={pin}`.

Then thread it back through: `usePrinting`'s guard effect → `resolveNetGuard(token, deviceId, pin)`;
`PrintingSettings` → `fetchNetPrinting/claimNetPrinting/setNetPrinterAddress(…, pin)`; and restore the
optional `pin` parameter on those four functions in `lib/printing/networkGuard.ts`. The `'pin'` state and its
sentence then become unreachable and can be deleted with it. **Read-only today: 0 of 12 trucks have a PIN**
(Gusto and test-truck included), so no truck is affected now.

## 4. FIX 3 — testing on a real device with no printer

`scripts/dev-virtual-printer.cjs` gained `--host`, **default `127.0.0.1`** (unchanged for every harness).
Verified both ways: default → `TCP 127.0.0.1:9131 (LISTEN)`; `--host 0.0.0.0` → `TCP *:9132 (LISTEN)`.

The steps are written out in full in `docs/wired-printing-build-report.md` §5a — run
`node scripts/dev-virtual-printer.cjs --host 0.0.0.0 --out ~/hg-printer`; read the Mac's Wi-Fi IP from
System Settings → Wi-Fi → Details… → TCP/IP; **Allow** the macOS firewall prompt for `node`; install the
debug build from Xcode / Android Studio (the store build shows no Printer type choice at all, by §2);
**on TEST TRUCK only** choose Wired, enter the Mac's IP, Connect, Print test ticket; and read the terminal,
which prints one line per connection (`#1 received: 2 bytes ESC@=yes` for the probe, `#2 received: 379 bytes
ESC@=yes cut=yes` for the ticket) with the bytes saved under `~/hg-printer/`.

§5a also covers `--refuse` (expect *"it isn't accepting connections"* and a ticket that stays waiting with no
duplicate banner), `--drop-after 64` (a small ticket usually still succeeds — TCP, not a defect; a large one
fails mid-stream and the next ticket carries POSSIBLE DUPLICATE), `--delay 3000` (the write timeout), and the
iOS Local Network prompt including what to do if it is refused.

⚠️ `--host 0.0.0.0` accepts from anyone on that Wi-Fi; the script's own header says so and says to stop it
when finished.

## 5. Each harness: failure mode → broken variant → real result

### `scripts/printing-gating.cjs` (extended)
- **Failure mode (new section):** a device running the store binary being offered "Wired", or acting on a
  stored `'net'` — the deploy-is-an-update failure of §2.
- **Broken variant, run first:** `PrinterTypeChoice.tsx` copied with the line
  `if (!isNetPrinterAvailable()) return null` **deleted**, compiled with JSX and rendered with the plugin
  mocked absent → **FAILED as required**: *"an OLD binary renders the Printer type choice — 'Wired' offered
  where it cannot work"*.
- **Real result: `✅` 19 + 12 checks, 0 🔴.** Plugin absent → `PrinterTypeChoice` renders `""` (the markup is
  asserted, not the source); plugin present → the control renders with Bluetooth / Wired; the check is
  re-evaluated on every render. With `hg_printer_kind='net'` stored **and the plugin absent**:
  `loadPrinterKind()` → `'ble'`, `getPrinterKind()` → `'ble'`, `isNetPrinterAvailable()` → `false`, the
  transport is BLE and never calls the plugin (`calls: ["ble.initialize"]`),
  `netTransport.availability()` → `'unsupported'`, and **`/api/printing` is called 0 times** — with a control
  proving the same path *does* call it when the plugin is present.

### `scripts/printing-network-guard.cjs` (extended)
- **Failure mode (new section):** a claim attempted on a PIN-protected truck — a POST that can only 401,
  reported to the operator as "can't check which device is printing".
- **Broken variant, run first:** the pre-fix behaviour — a 401 swallowed as "unreachable", so an unheld van
  looks claimable → **FAILED as required**: *"1 claim POST(s) sent, each of which can only 401"*.
- **Real result: `✅` 37 + 12 checks, 0 🔴.** `fetchNetPrinting` on 401 + `requiresPin` → `'pin'`;
  `decideNetPrinting` → `state 'pin', shouldClaim false`; a cached claim does **not** override it;
  `resolveNetGuard` → `'pin'` with **0 POSTs**; the sentence is exact; a 401 **without** `requiresPin` stays
  `null`; `dashboardPin.ts` is gone with no importers or callers; none of the three printing files reads
  browser storage; and the card's wired branch opens `netInfo === 'pin' ? <the sentence> : (everything else)`.

### `scripts/printing-copy.cjs` (updated, not extended in scope)
- **Failure mode:** an operator with a wired printer reading Bluetooth copy, or a customer reading "thermal".
- **Broken variant, run first:** "thermal" reinstated on the landing page → **FAILED as required**.
- **Real result: `✅` 43 ✓, 0 🔴.** Updated for this work: the Bluetooth-branch assertions now pin **HEAD's**
  wording (with a comment explaining that the shells load the live site, so a shipped screen must not drift);
  the Printer type assertions moved to `components/printing/PrinterTypeChoice.tsx` and additionally require
  that the card renders no Printer type markup itself and that the component is gated on
  `isNetPrinterAvailable()`; and `NET_GUARD_COPY.pin` is pinned as wired-only copy absent from the Bluetooth
  branch.

## 6. Build results

| Step | Result |
|---|---|
| `npx tsc --noEmit` | rc 0, clean |
| `npx next build` | rc 0 — `✓ Compiled successfully`, `ƒ /api/printing` present |
| `npx cap sync` | rc 0 — 10 plugins on both platforms, `@hatchgrab/net-printer@0.1.0` among them |
| iOS `xcodebuild … -destination 'generic/platform=iOS Simulator'` | rc 0 — `** BUILD SUCCEEDED **`, `App.app/App` 72,976 bytes |
| Android `./gradlew assembleDebug` | rc 0 — `app-debug.apk` 8,887,337 bytes |
| eslint vs a clean HEAD worktree, per rule | `@typescript-eslint/no-unused-vars` 2 → 2 · `react-hooks/refs` 6 → 6 · `react-hooks/set-state-in-effect` 1 → 1 — **delta zero**; the new `PrinterTypeChoice.tsx` contributes no message |
| All harnesses (`printing-*`, `batch-*`, `slot-interval-*`, `outreach-*`, `whatsapp-*`) | **29 files, all rc 0** |

## 7. Manual sections made stale (NOT edited)

`docs/reference-manual.md` — in addition to the four already listed in the build report's §9:

- **§36 / V11.3 remote-URL sections (lines ~1120, ~2834, ~4453, ~7963).** They state the deploy-is-an-instant-
  update property correctly, but none of them records the consequence this work had to handle: a web feature
  that depends on a **native plugin** must gate on `Capacitor.isPluginAvailable`, because the web half
  reaches devices whose native half is older. That is now a rule with a harness behind it and belongs beside
  those paragraphs.
- **The `capacitor.config` plugin list (§36).** `packageClassList` in the baked iOS config now carries
  `NetPrinterPlugin` as a tenth entry; the manual's plugin inventory predates it.
- **Any section describing the printing card's Bluetooth copy** — the two sentences are back to HEAD's
  wording, so the manual is accurate again, but the reason (shipped screens must not drift on a deploy) is
  not recorded anywhere in it.

## 8. Could not establish

- **That the plugin *runs* on a device.** Both apps compile and link it and `cap sync` registers it, but no
  simulator was booted and no hardware was used. The gate itself is proven by rendered markup and by the
  transport's behaviour under a mocked `isPluginAvailable`; what is unproven is the real bridge on a real
  device — which is precisely what §5a of the build report is for.
- **That an old binary behaves as predicted at runtime.** The prediction rests on `@capacitor/core` 8.4.0's
  source, quoted in §2, and on the mock that mirrors it. Confirming it for real needs a device running the
  current store build against the deployed code, which cannot be done before deploying.
- **The iOS Local Network heuristic** (`ENETDOWN`/`EHOSTUNREACH` on a private address → `'permission'`)
  against a real refusal — unchanged from the build report, still unobserved.
- **Whether a PIN truck's wired flow works once the two props are threaded** — no truck has a PIN, so the
  end-to-end path cannot be exercised at all today.
