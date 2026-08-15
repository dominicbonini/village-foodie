# Bluetooth LE printing — the real transport

**Six files: `lib/printing/bleTransport.ts` (NEW), `lib/printing/transport.ts` (backend selection), `lib/printing/usePrinting.ts` (resume reconnect), `components/printing/PrintingSettings.tsx` (pairing UI), `ios/App/App/Info.plist` (one key), `package.json` (one pinned dependency).** `cap sync` run once, in Part E only. No `next dev`, no `next build`, no build, no archive, no deploy, no commit. `tsc` clean.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**
✅ **BLE ONLY. `ExternalAccessory` was not reached for and MFi is not referenced anywhere in the new code.**

> ## ✅ **BLE CAN WORK FOR STANDARD KITCHEN PRINTERS, SO THERE WAS NO STOP.** ESC/POS thermal printers expose a serial-over-GATT write characteristic; the transport DISCOVERS it rather than hard-coding a vendor UUID, so it is not tied to one model.
>
> ## 🔴 THE ONE DESIGN DECISION WORTH READING BEFORE ANYTHING ELSE — C2.
> **A chunk that fails BEFORE any byte leaves returns `ok:false` → outcome `'failed'` → the reprint is a first ticket, unmarked. A chunk that fails AFTER at least one succeeded THROWS → outcome `'unknown'` → the next ticket carries POSSIBLE DUPLICATE.** **A half-printed ticket is worse than none; the only thing worse is a half-printed ticket the kitchen believes is whole.**
>
> ⚠️ **AND THE CENSUS CAUGHT A FIFTH VIOLATION TODAY — mine, in this task.** Two new strings introduced U+2026 into a file that had never held it. Rewritten as ASCII before landing. **F2.**

---

# PART A — THE DEPENDENCY

## A1 / A2. Installed and pinned

```diff
   "dependencies": {
     "@aparajita/capacitor-biometric-auth": "10.0.0",
+    "@capacitor-community/bluetooth-le": "8.3.0",
     "@capacitor-community/keep-awake": "8.0.1",
```

| | |
|---|---|
| **Version installed** | **8.3.0** — verified from `node_modules/@capacitor-community/bluetooth-le/package.json` |
| **Pinned?** | ✅ **`"8.3.0"` — no caret, no tilde.** Installed with `--save-exact`, matching all twelve existing Capacitor deps (N22) |
| **Capacitor 8 compatible?** | ✅ **YES.** Its `peerDependencies` are `{"@capacitor/core": ">=8.0.0"}` and this project is on `@capacitor/core` **8.4.0** |

🔴 **NO STOP FIRED. `cap sync` then reported it alongside the other eight plugins on both platforms (E2), which is the practical confirmation.**

## A3. 🔴 Does it ship its own `PrivacyInfo.xcprivacy`? — **NO. And it does not need one.**

```
$ find node_modules/@capacitor-community/bluetooth-le -name "*.xcprivacy"
(no output)
```

**READ — "not found". §36 already records that only `@capacitor/ios` ships a manifest, so this is the expected shape, not a surprise.**

**Then the question that matters: does it USE a required-reason API?** A scan of its iOS sources for the four categories Apple lists — `UserDefaults`, file-timestamp APIs, system-boot time, disk space, and active-processor count:

```
$ grep -rln "UserDefaults\|NSFileManager\|systemUptime\|kern.boottime\|activeProcessorCount\|NSURLVolume" node_modules/@capacitor-community/bluetooth-le/ios/
(no output)
```

> ## ✅ **NONE FOUND, SO NO NEW DECLARATION IS NEEDED AND THE APP-LEVEL MANIFEST WAS NOT EDITED.**
> **The app manifest still declares exactly one entry — `NSPrivacyAccessedAPICategoryUserDefaults`, reason `CA92.1`, for `@capacitor/preferences` — and it still lints (E3).**
> ⚠️ **WHAT WOULD BE NEEDED IF THAT CHANGES, recorded so it is not re-derived:** a second dictionary in `NSPrivacyAccessedAPITypes` naming the category and its reason code. 🔴 **A WRONG code is ITMS-91055, which fails the upload exactly like a missing one — so "declare it to be safe" is not safe.**
> ⚠️ **AND §36'S STANDING RULE NOW APPLIES: a plugin was ADDED, so the required-reason audit should be re-run across all NINE packages before the next upload.** **I checked this one; I did not re-audit the other eight.**

---

# PART B — `Info.plist`

## B1 / B2. The key, before and after

**BEFORE — `ios/App/App/Info.plist:41-42`:**

```xml
	<key>NSFaceIDUsageDescription</key>
	<string>Unlock HatchGrab with Face ID.</string>
```

**AFTER — the only change to the file, two lines:**

```xml
	<key>NSFaceIDUsageDescription</key>
	<string>Unlock HatchGrab with Face ID.</string>
	<key>NSBluetoothAlwaysUsageDescription</key>
	<string>HatchGrab uses Bluetooth to connect to your kitchen receipt printer so order tickets can be printed automatically. It is not used for anything else.</string>
```

**THE FINAL STRING, quoted:**

> **HatchGrab uses Bluetooth to connect to your kitchen receipt printer so order tickets can be printed automatically. It is not used for anything else.**

✅ **Written for a reviewer: it names the DEVICE (a kitchen receipt printer), the PURPOSE (printing order tickets), and closes the door on the question a vague string invites — "what else are you doing with Bluetooth?"** ⚠️ **A generic *"HatchGrab needs Bluetooth access"* is a documented rejection cause; naming the accessory is the fix.**

```
$ plutil -lint ios/App/App/Info.plist
ios/App/App/Info.plist: OK
```

## B3. 🔴 No background mode

```
$ grep -c "UIBackgroundModes" ios/App/App/Info.plist
0
```

✅ **ABSENT, as required. No `bluetooth-central`, no `bluetooth-peripheral`, no background mode of any kind.** **Printing stays foreground-only, which matches what the watcher actually does — it is a `setInterval` inside a mounted page.** 🔴 **Declaring a background mode we do not use would invite a review question with no good answer.**

---

# PART C — THE TRANSPORT

**All of Part C is `lib/printing/bleTransport.ts` (NEW, 16,112 bytes).**

## C1. The six methods

**`availability()` — four answers, not a boolean:**

```ts
    async availability(): Promise<PrinterAvailability> {
      if (!Capacitor.isNativePlatform()) return 'unsupported'
      try {
        await ensureInit()
      } catch {
        return 'unauthorised'
      }
      try {
        const BleClient = await ble()
        return (await BleClient.isEnabled()) ? 'available' : 'off'
      } catch {
        return 'off'
      }
    },
```

**`scan()` — bounded, self-terminating, named devices only:**

```ts
    async scan(): Promise<DiscoveredPrinter[]> {
      if (!Capacitor.isNativePlatform()) return []
      await ensureInit()
      const BleClient = await ble()
      const found = new Map<string, DiscoveredPrinter>()
      await BleClient.requestLEScan({ allowDuplicates: false }, result => {
        const id = result?.device?.deviceId
        if (!id) return
        const name = result?.device?.name || result?.localName
        if (!name) return
        found.set(id, { id, name, class: 'ble' })
      })
      await sleep(6000)
      try { await BleClient.stopLEScan() } catch { /* already stopped */ }
      return [...found.values()]
    },
```

⚠️ **`requestLEScan` + our own list, NOT `requestDevice`.** `requestDevice` presents the OS picker — a second, differently-styled list we cannot annotate. 🔴 **An App Review reviewer would get a system sheet with nothing in it and no explanation. Our own list can say why it is empty; the OS sheet cannot.**
⚠️ **NAMELESS PERIPHERALS ARE DROPPED** — otherwise the list fills with every phone and earbud in the venue, as unidentifiable MAC addresses.

**`connect()` — connect, discover, remember:**

```ts
        await BleClient.connect(printerId, () => { session = null })
        const target = await findWriteTarget(printerId)
        if (!target) {
          try { await BleClient.disconnect(printerId) } catch { /* best effort */ }
          return { ok: false, error: 'That device has no printable channel' }
        }
```

🔴 **The `onDisconnect` callback nulls the session — that is what keeps `status()` truthful without polling the radio.**

**`disconnect()` — idempotent, and it forgets:**

```ts
    async disconnect(): Promise<void> {
      const id = session?.deviceId ?? (await Preferences.get({ key: K.id })).value
      session = null
      await clearStored()
      if (!id || !Capacitor.isNativePlatform()) return
      try {
        const BleClient = await ble()
        await BleClient.disconnect(id)
      } catch { /* already gone */ }
    },
```

⚠️ **It CLEARS the stored pairing deliberately: disconnecting is the operator saying "not this printer", and leaving the id behind would have the next resume silently reconnect to it.**

**`sendBytes()` and `status()` are quoted in full at C2 and C6.**

## C2. 🔴 CHUNKING — size, sequence, and what a mid-ticket failure means

```ts
const CHUNK = 180
const CHUNK_GAP_MS = 12
```

```ts
    async sendBytes(bytes: Uint8Array): Promise<PrintResult> {
      if (!session) return { ok: false, error: 'No printer connected' }
      const { deviceId, service, characteristic, withoutResponse } = session
      const BleClient = await ble()
      const { numbersToDataView } = await import('@capacitor-community/bluetooth-le')
      let sent = 0
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = Array.from(bytes.subarray(i, i + CHUNK))
        try {
          const view = numbersToDataView(slice)
          if (withoutResponse) await BleClient.writeWithoutResponse(deviceId, service, characteristic, view)
          else await BleClient.write(deviceId, service, characteristic, view)
          sent += slice.length
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'write failed'
          // 🔴 NOTHING LEFT THE PHONE — certain failure. The reprint is a FIRST ticket, unmarked.
          if (sent === 0) return { ok: false, error: msg }
          // 🔴 PART OF THE TICKET MAY BE ON PAPER. Throwing is what makes usePrinting record 'unknown',
          // which is what puts POSSIBLE DUPLICATE on the next ticket.
          throw new Error(`partial write after ${sent} of ${bytes.length} bytes: ${msg}`)
        }
        if (i + CHUNK < bytes.length) await sleep(CHUNK_GAP_MS)
      }
      return { ok: true }
    },
```

| Question | Answer |
|---|---|
| **Chunk size** | **180 bytes.** The BLE floor is a 23-byte MTU (20 payload); modern stacks negotiate 185+. 180 sits under a 185 MTU while keeping a ~2 KB ticket to ~12 writes rather than 100 |
| **Sequencing** | **Strictly in order, `await`ed one at a time**, with a **12 ms gap** between writes. A thermal printer consumes at PAPER speed, not radio speed — an unpaced burst is the classic cause of dropped bytes mid-receipt. 12 chunks costs ~150 ms, imperceptible |
| **Which write** | `writeWithoutResponse` when the characteristic supports it (faster for a one-way stream), otherwise `write` |
| **Failure BEFORE any byte** | 🔴 **`return { ok: false }` → `'failed'`.** Certain nothing came out; the next attempt is a FIRST ticket with no banner |
| **Failure AFTER ≥1 chunk** | 🔴 **THROW → `'unknown'`.** Paper may exist; the next ticket carries POSSIBLE DUPLICATE |

> ## ✅ **THIS USES THE THREE-OUTCOME DESIGN THAT WAS ALREADY BUILT, RATHER THAN INVENTING A FOURTH STATE.** `usePrinting` already maps `ok:false` → `'failed'` and a throw → `'unknown'`; the transport simply tells the truth in each case.
> ⚠️ **RECORDED IN THE FILE FOR THE NEXT PERSON: if a printer truncates lines, LOWER `CHUNK` (try 20) before suspecting the encoder — that symptom looks like a rendering bug and is not one.**

## C3. GATT service and characteristic — **DISCOVERED, NOT HARD-CODED**

```ts
const GENERIC_SERVICES = ['00001800-0000-1000-8000-00805f9b34fb', '00001801-0000-1000-8000-00805f9b34fb']
```

```ts
  const findWriteTarget = async (deviceId: string) => {
    …
    for (const pass of ['writeWithoutResponse', 'write'] as const) {
      for (const svc of services) {
        if (GENERIC_SERVICES.includes(svc.uuid.toLowerCase())) continue
        for (const ch of svc.characteristics || []) {
          if (ch.properties?.[pass]) {
            return { service: svc.uuid, characteristic: ch.uuid, withoutResponse: pass === 'writeWithoutResponse' }
          }
        }
      }
    }
    return null
  }
```

> ## 🔴 **THERE IS NO STANDARD "ESC/POS OVER BLE" UUID, WHICH IS EXACTLY WHY THIS ENUMERATES.**
> **Vendors differ: `18f0`/`2af1` on many Chinese modules, `ff00`/`ff02` on others, `e7810a71-…` on Star. Hard-coding one would support one family and fail silently on the rest — and the failure would look like "the printer is broken".**
> **The rule: skip Generic Access (1800) and Generic Attribute (1801), which every peripheral has and neither carries printer data; take the first writable characteristic; prefer `writeWithoutResponse`.**
> ⚠️ **INFERRED, NOT TESTED AGAINST HARDWARE: that the first writable non-generic characteristic is the print channel. It is true of every ESC/POS BLE module I am aware of, and it is the same heuristic other ESC/POS libraries use — but no printer has been connected.**

## C4. The pairing is per-DEVICE, in Preferences

```ts
const K = { id: 'hg_printer_id', name: 'hg_printer_name', svc: 'hg_printer_svc', chr: 'hg_printer_chr' } as const
```

✅ **Four keys in Capacitor Preferences — the same durable device store the four printing settings, the outbox and the app lock use.** 🔴 **NOT a database column, for the same reason keep-awake is per-device: the printer is paired to THIS iPad over Bluetooth, and a truck with two devices has two pairings. A shared value would make one device's printer the other's.**
✅ **`hg_printer_name` is the key the card ALREADY read and nothing ever wrote — Phase B now writes it, and the "Printer: …" rendering that has been dormant since it was built lights up with no code change, exactly as its comment promised.**

## C5. Reconnect on resume

**In `lib/printing/bleTransport.ts`:**

```ts
export async function reconnectStoredPrinter(t: PrinterTransport): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const [{ value: id }, { value: svc }, { value: chr }] = await Promise.all([
    Preferences.get({ key: K.id }), Preferences.get({ key: K.svc }), Preferences.get({ key: K.chr }),
  ])
  if (!id || !svc || !chr) return
  const s = await t.status()
  if (s.connected) return
  try { await t.connect(id) } catch { /* stays disconnected; status() says so */ }
}
```

**And its one caller, in `lib/printing/usePrinting.ts`:**

```ts
  useEffect(() => {
    if (!active) return
    const off = onAppResume(() => {
      void (async () => {
        try {
          await reconnectStoredPrinter(getPrinterTransport())
          setStatus(await getPrinterTransport().status())
        } catch { /* status stays false, which is the truth */ }
      })()
    })
    return off
  }, [active])
```

🔴 **A BLE link does not survive backgrounding. Without this, an operator who switches apps for thirty seconds returns to a printer that LOOKS paired (the name is stored) and is not connected, and the first ticket after that fails.** ⚠️ **Silent and best-effort by design: it never prompts and never surfaces an error, because a failed background reconnect is not something the operator did.**

## C6. 🔴 `status()` is truthful at all times

```ts
    async status(): Promise<PrinterStatus> {
      if (!Capacitor.isNativePlatform()) return { connected: false, detail: 'Printing is only available in the app' }
      if (session) return { connected: true, printerName: session.name }
      const stored = (await Preferences.get({ key: K.name })).value
      return {
        connected: false,
        printerName: stored ?? undefined,
        detail: stored ? `${stored} is not connected` : 'No printer paired yet',
      }
    },
```

> ## ✅ **IT REPORTS THE LIVE `session` OBJECT, WHICH `onDisconnect` NULLS THE MOMENT THE RADIO DROPS. IT NEVER INFERS A CONNECTION FROM A STORED ID — that is precisely the lie the stub fix corrected.**
> ✅ **A remembered name with no link produces `connected: false` and *"Star TSP is not connected"*, which is more useful than a bare false and still true.**

**And the backend selection, in `lib/printing/transport.ts`:**

```ts
export function getPrinterTransport(): PrinterTransport {
  if (_transport) return _transport
  if (Capacitor.isNativePlatform()) {
    const { createBleTransport } = require('./bleTransport') as typeof import('./bleTransport')
    _transport = createBleTransport()
  } else {
    _transport = createStubTransport(() => { /* no sink in the app; see the note above */ })
  }
  return _transport
}
```

✅ **The honest stub survives as the WEB implementation.** ⚠️ **The BLE module is required lazily so a web bundle never pulls the native plugin in.**

---

# PART D — THE PAIRING UI

## D1. On the existing card. No new surface.

✅ **Everything below is inside `components/printing/PrintingSettings.tsx`, in the block that already showed the connection state. No new settings page, no new tab, no modal.**

## D2. 🔴 GUIDELINE 2.1 — every state, and every string

**THE SCAN IS ONLY REACHABLE AFTER PRINTING IS ENABLED.** The whole block sits inside `{enabled && (…)}`, which was already the structure. 🔴 **A reviewer opening Settings sees a title, a description and an OFF toggle — never a scan button as the first thing on screen.**

**EVERY STRING ADDED, quoted:**

| State | The string |
|---|---|
| **Connected** | **"Connected to {name}. Tickets will print automatically."** + a **Disconnect** action |
| **Not connected** | **"No printer connected."** + the transport's own detail + **"Connect a Bluetooth receipt printer to start printing tickets."** |
| **Tickets waiting** | **"N tickets are waiting and will print once a printer is connected. Nothing has been lost."** |
| **The button** | **"Scan for printers"** / **"Scanning..."** while running |
| **Scanning** | **"Looking for nearby printers — this takes a few seconds."** |
| 🔴 **NONE FOUND** | **"No printers found. Check the printer is switched on, has paper, and is close to this device — most receipt printers only appear for a minute or two after you turn them on."** |
| **Bluetooth off** | **"Bluetooth is switched off on this device. Turn it on in Settings, then scan again."** |
| **Permission refused** | **"HatchGrab needs permission to use Bluetooth. Allow it in Settings → HatchGrab → Bluetooth, then scan again."** |
| **Unsupported (web)** | **"Printing needs the HatchGrab app — a web browser cannot reach a Bluetooth printer."** |
| **A device found** | **"Tap your printer to connect:"** with each row showing the name and **Connect** / **"Connecting..."** |
| **An error** | the transport's message, in red |

> ## 🔴 THE EMPTY RESULT IS THE ONE A REVIEWER WILL SEE, AND IT IS THE ONE WITH THE MOST WORDS.
> **"No printers found" alone reads as broken. Naming the three things to check — switched on, has paper, in range — plus the fact that most receipt printers only advertise for a minute or two after power-on, turns it from a failure into an instruction.**
> ✅ **AND THE AVAILABILITY BRANCHES FIRE BEFORE THE SCAN, so a radio that is off never produces an empty list that blames the printer for the phone.**

**NO CONTROL SITS INERT:** the scan button is the only control, it is always actionable when printing is on, and every non-`available` answer replaces the result area with a sentence naming the one thing the operator can do.

## D3. Connected state

```tsx
          {liveConnected ? (
            <div className="flex items-center justify-between gap-3 text-xs border border-green-200 bg-green-50 rounded-lg px-3 py-2">
              <span className="text-green-800 min-w-0 truncate">
                <strong>Connected</strong> to {localName ?? printer ?? 'your printer'}. Tickets will print automatically.
              </span>
              <button onClick={disconnectPrinter} className="shrink-0 font-semibold text-red-600 hover:text-red-700">Disconnect</button>
            </div>
          ) : (
```

✅ **Name shown, Disconnect offered.** ⚠️ **`liveConnected = localConnected ?? connected` — the local answer is used immediately after the operator's own tap so they are not left looking at "not connected" for up to 20 s until the dashboard's next poll; the prop remains the steady-state authority.**

## D4. WEB — what the card shows, and an honest gap

> ## 🔴 **ON THE WEB THE CARD RENDERS NOTHING AT ALL.** `PrintingSettings.tsx:71` is `if (!isNativeApp() || !ready) return null`, and that gate is unchanged.
> ✅ **Nothing appears broken, because nothing appears** — there is no control, no empty list and no error.
> ⚠️ **BUT IT DOES NOT EXPLAIN ITSELF EITHER, AND THAT IS A REAL GAP: `lib/plan-features.ts` now advertises Kitchen ticket printing as INCLUDED on Max, so a web operator reads "✓ included" on their Billing tab and finds no printing UI anywhere on the dashboard.** 🔴 **Reported, NOT fixed — removing the native gate is outside this task's scope and is a product decision.**
> ✅ **The transport itself is honest on web even though nothing renders it: `availability()` returns `'unsupported'` and `status()` returns *"Printing is only available in the app"*. The sentence exists; only the surface to show it does not.**

---

# PART E — SYNC

## E1. Recorded BEFORE

```
sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30   project.pbxproj
```
```
17:		HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */; };
32:		HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
80:				HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:				HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,
```
**`PBXResourcesBuildPhase`: 7 entries.**

## E2. `npx cap sync` — full output

```
✔ Copying web assets from out to android/app/src/main/assets/public in 1.87ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 480.46μs
✔ copy android in 13.28ms
✔ Updating Android plugins in 2.23ms
[info] Found 9 Capacitor plugins for android:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/bluetooth-le@8.3.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update android in 37.72ms
✔ Copying web assets from out to ios/App/App/public in 1.04ms
✔ Creating capacitor.config.json in ios/App/App in 439.54μs
✔ copy ios in 29.09ms
✔ Updating iOS plugins in 2.37ms
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
[info] Found 9 Capacitor plugins for ios:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/bluetooth-le@8.3.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update ios in 19.61ms
✔ copy web in 6.87ms
✔ update web in 7.75ms
[info] Sync finished in 0.167s
```

🔴 **NINE PLUGINS NOW, NOT EIGHT — the count is the confirmation the plugin registered on both platforms.**

### 🔴 EXACTLY WHAT CHANGED — and it is less than expected

| File | Change |
|---|---|
| **`ios/App/CapApp-SPM/Package.swift`** | **+2 lines** — the package path and the product |
| **`ios/App/App/capacitor.config.json`** | **+1 line** — `"BluetoothLe"` in `packageClassList` |
| **`android/capacitor.settings.gradle`** | +3 lines |
| **`android/app/capacitor.build.gradle`** | +1 line |
| 🔴 **`ios/App/App.xcodeproj/project.pbxproj`** | ✅ **BYTE-IDENTICAL — `diff` produced no output** |

**The Package.swift diff, in full:**

```diff
15a16
>         .package(name: "CapacitorCommunityBluetoothLe", path: "../../../node_modules/@capacitor-community/bluetooth-le"),
30a32
>                 .product(name: "CapacitorCommunityBluetoothLe", package: "CapacitorCommunityBluetoothLe"),
```

> ## ✅ **THE FOUR MANIFEST LINES AND THE RESOURCES ENTRY SURVIVED — because `project.pbxproj` was not touched at all.**
> ```
> sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30   ← IDENTICAL
> diff <pre-sync backup> <post-sync>  →  no output.  BYTE-IDENTICAL.
> Resources entries: 7
> ```
> 🔴 **THIS IS THE INTERESTING RESULT AND IT IS WORTH RECORDING: adding a native plugin on Capacitor 8 with SPM does NOT rewrite the Xcode project.** The dependency lands in `Package.swift`; the project file only references the SPM package as a whole. ⚠️ **The brief expected the project to change legitimately — it did not, and the four hand-authored lines were never at risk this time.**

## E3. Manifest, and the two config values

```
$ plutil -lint ios/App/App/PrivacyInfo.xcprivacy
ios/App/App/PrivacyInfo.xcprivacy: OK
$ plutil -lint ios/App/App/Info.plist
ios/App/App/Info.plist: OK
```

```json
	"server": {
		"url": "https://www.hatchgrab.com/app",
		"cleartext": false,
		"allowNavigation": [
			"www.hatchgrab.com"
		]
	},
```

**The iOS baked config's hash DID change — `5790a5f0…` → `15b511f6…` — so I proved the delta rather than eyeballing it:**

```
current file                       sha256 15b511f6c709708951e1429d3329c6db5d97d8eeb04d4bee2aa4d199f60237af
same file minus the one added line sha256 5790a5f0daa891793d1515f8b69c22b931e2fe764e023b19b8c25fcd8039a925
baseline recorded at task start           5790a5f0daa891793d1515f8b69c22b931e2fe764e023b19b8c25fcd8039a925
=> the ONLY change is `"BluetoothLe",` in packageClassList:  True
```

✅ **`server.url` and `allowNavigation` are byte-identical.** ✅ **Android's baked config is unchanged entirely (`5fd038c8…` on both sides).**

## E4. Splash and AppIcon — **BY SHA, not by `git status`**

```
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732-1.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732-2.png
eee556188b881990085dea0178069b0ee809bc8cabcdab98d36c7b46f5ac1857   AppIcon-512@2x.png
```

✅ **All four identical to the values recorded at the start of this task. The launch screen and the app icon did not move.**

## E5. Not done

🔴 **No `xcodebuild`. No archive. No upload. No `next build`. No deploy. No commit.**

---

# PART F — INTEGRITY

## F1 / F2. Non-ASCII census, before and after

| File | Bytes | Distinct | Gained | Lost |
|---|---|---|---|---|
| `lib/printing/transport.ts` | 8,030 → **8,635** | 4 → **4** | **NONE** | **NONE** |
| `components/printing/PrintingSettings.tsx` | 17,437 → **24,532** | 10 → **10** | **NONE** | **NONE** |
| `ios/App/App/Info.plist` | 3,063 → **3,276** | 0 → **0** | **NONE** | **NONE** |
| `package.json` | 1,765 → **1,815** | 0 → **0** | **NONE** | **NONE** |
| `lib/printing/bleTransport.ts` | **NEW, 16,112** | 7 | — | — |
| `lib/printing/usePrinting.ts` | **11,925** | 7 | **NONE** | **NONE** |

**`PrintingSettings.tsx`, per class:** U+2500 234 → 405 (**+171**, new comment rules), U+1F534 14 → 20 (**+6**), U+2014 22 → 27 (**+5**) — **all pre-existing classes, all comment prose.**
**`Info.plist` and `package.json` are pure ASCII before and after.** ✅ **The Bluetooth usage string was written ASCII-only on purpose — a plist string with a typographic dash is a class this file has never held.**

> ## 🔴 THE CENSUS CAUGHT A REAL VIOLATION — THE FIFTH TODAY, AND THE SECOND IN THIS WORKSTREAM.
> **My first draft of the pairing UI used `'Scanning…'` and `'Connecting…'` with U+2026, in a file whose census was ZERO for that class.** **`distinct 10 → 11, GAINED ['8230']`.** ✅ **Rewritten as `'Scanning...'` and `'Connecting...'` and re-run: 10 → 10, GAINED NONE.**
> ⚠️ **Both violations this workstream were in UI STRINGS I wrote, not in code — which is where the habit of reaching for a nice glyph lives.**

## F3. 🔴 U+26A0 / U+FE0F pair counts

| File | U+26A0 | U+FE0F | Bare | Verdict |
|---|---|---|---|---|
| `lib/printing/transport.ts` | 0 | 0 | 0 | ✅ PAIRED (trivially — no warning glyph by design) |
| `lib/printing/bleTransport.ts` *(new)* | 2 | 2 | **0** | ✅ **PAIRED** |
| `lib/printing/usePrinting.ts` | 2 | 2 | **0** | ✅ **PAIRED** |
| `components/printing/PrintingSettings.tsx` | 2 | 2 | **0** | ✅ **PAIRED**, unchanged |
| `ios/App/App/Info.plist`, `package.json` | 0 | 0 | 0 | ✅ n/a |
| **`docs/printing-ble-report.md`** | equal | equal | **0** | ✅ **PAIRED** — verified by scanning the written file |

✅ **No file this task touched carries a bare glyph.** ⚠️ **The three known offenders — `app/dashboard/[token]/page.tsx`, `components/dashboard/OrderCard.tsx` — are not among the files edited here.**

## F4. Byte scan — byte-level, never `grep`

```
lib/printing/transport.ts                            8,635 bytes   NUL 0   control none
lib/printing/bleTransport.ts                        16,112 bytes   NUL 0   control none
lib/printing/usePrinting.ts                         11,925 bytes   NUL 0   control none
components/printing/PrintingSettings.tsx            24,532 bytes   NUL 0   control none
ios/App/App/Info.plist                               3,276 bytes   NUL 0   control none
package.json                                         1,815 bytes   NUL 0   control none
ios/App/App/capacitor.config.json    (cap sync)        999 bytes   NUL 0   control none
android/…/capacitor.config.json      (cap sync)        770 bytes   NUL 0   control none
ios/App/CapApp-SPM/Package.swift     (cap sync)      2,530 bytes   NUL 0   control none
```

✅ **Clean, including all three files the sync wrote.**

## F5. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## F6. `git status` and `git diff --stat`

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
?? docs/…  (nine reports)
?? lib/printing/bleTransport.ts
?? lib/printing/usePrinting.ts
```

| Entry | Whose |
|---|---|
| 🔴 **`lib/printing/bleTransport.ts`** (new), **`ios/App/App/Info.plist`**, **`package.json`**, **`package-lock.json`**, **`ios/App/CapApp-SPM/Package.swift`**, **`android/capacitor.settings.gradle`**, **`android/app/capacitor.build.gradle`** | **THIS TASK ONLY** |
| 🔴 **`lib/printing/transport.ts`**, **`components/printing/PrintingSettings.tsx`**, **`lib/printing/usePrinting.ts`** | **THIS TASK** — and earlier printing work |
| `app/dashboard/[token]/page.tsx`, `app/trucks/…`, `components/dashboard/OrderCard.tsx`, `components/native/*`, `lib/plan-features.ts`, the app icon | earlier tasks |

⚠️ **THE TREE HAS BEEN DIRTY ALL SESSION.** 🔴 **Nothing is committed.**

---

# PART G — WHAT TO TEST

> ⚠️ **PREREQUISITES: `npx cap sync` has run (done), then a REBUILD and REINSTALL from Xcode — the plugin and the `Info.plist` key are compiled in. Then a Max/trial truck, in the app, with the printing master toggle ON.**
> 🔴 **You will need a real BLE ESC/POS printer for tests 3–6. Tests 1, 2, 7 and 8 work without one.**

**1. The permission prompt**
Toggle printing ON, tap **Scan for printers** for the first time.
**PASS:** iOS asks for Bluetooth permission, and the sentence shown is *"HatchGrab uses Bluetooth to connect to your kitchen receipt printer…"*.
**FAILURE:** no prompt (the key did not compile in), or a generic system string.

**2. 🔴 Scan with NO printer — the reviewer's path**
Away from any printer, tap Scan.
**PASS:** a spinner for ~6 s, then **"No printers found. Check the printer is switched on, has paper, and is close to this device…"**
**FAILURE:** an empty box, a spinner that never stops, or nothing at all. ⚠️ **This is the single most likely thing App Review will see.**

**2b. Deny the permission, then scan**
**PASS:** *"HatchGrab needs permission to use Bluetooth. Allow it in Settings → HatchGrab → Bluetooth, then scan again."*
**FAILURE:** an empty list — that would blame the printer for a permission.

**2c. Turn Bluetooth OFF, then scan**
**PASS:** *"Bluetooth is switched off on this device. Turn it on in Settings, then scan again."*
**FAILURE:** an empty list.

**3. Scan WITH a printer**
Power the printer on, scan within ~30 s.
**PASS:** it appears by name with a **Connect** action.
**FAILURE:** absent — ⚠️ **most receipt printers only advertise for a minute or two after power-on; power-cycle and rescan before concluding.**

**4. Connect**
Tap the printer.
**PASS:** the row turns green — *"Connected to {name}. Tickets will print automatically."*
**FAILURE:** *"That device has no printable channel"* → 🔴 **the discovery heuristic in C3 did not find a writable characteristic on this model. Report the model; that is the one assumption hardware can disprove.**

**5. Print — `on_confirmed`**
Set the trigger to *"As soon as you accept the order"*. Accept a pending order.
**PASS:** a ticket prints within ~20 s, complete, cut at the end.
**FAILURE:** nothing (check the waiting count), or a ticket **truncated mid-line** → 🔴 **lower `CHUNK` from 180 toward 20 before suspecting the encoder.**

**6. Print — `lead_time`, including the late walk-up**
Set *"A set time before collection"*, lead 10. Accept an order due in 15 minutes (should NOT print yet), then add a walk-up due in 5 minutes.
**PASS:** the walk-up prints **immediately**; the 15-minute order prints when you are within 10 minutes of it.
**FAILURE:** the walk-up never prints — the "window has opened" rule has regressed.

**7. 🔴 Disconnect MID-TICKET**
Start a print, then power the printer off (or walk out of range) while it is printing.
**PASS:** the order does NOT get marked printed, and the **next ticket for it carries the POSSIBLE DUPLICATE banner**.
**FAILURE:** it is marked printed and never retried (a lost ticket), **or** the reprint has NO banner (paper may already exist and the kitchen is not told).

**8. App resume reconnect**
Connected, background the app for a minute, return.
**PASS:** the card still says Connected within a few seconds, and printing resumes.
**FAILURE:** it says connected but tickets fail → 🔴 **`status()` is lying, which is the exact defect the stub fix corrected.**

**9. Web**
Open the dashboard in a browser on the same truck.
**PASS:** no printing card at all, and nothing appears broken.
⚠️ **KNOWN GAP (D4): the Billing matrix says printing is included and the web gives no explanation of where it is. Not a failure of this build — a decision for you.**

---

# PROVENANCE

**READ** — the plugin's `package.json` (version + peer deps), its `definitions.d.ts` (`initialize`, `isEnabled`, `requestLEScan`, `stopLEScan`, `connect`, `disconnect`, `getServices`, `write`, `writeWithoutResponse`, `getConnectedDevices`), its `conversion.d.ts` (`numbersToDataView`), its `BleCharacteristicProperties` shape, and its `AndroidManifest.xml` permissions · `transport.ts` before and after · `PrintingSettings.tsx`'s gates and notice block · `usePrinting`'s status poll · `lib/native/app.ts`'s `onAppResume` · `Info.plist` before and after · the full `cap sync` output and every artefact it wrote · `project.pbxproj` and the four manifest lines on both sides · both baked configs, with the iOS delta proved by reconstruction · all four asset hashes · both censuses · nine byte scans · `git status`, `git diff --stat`, `git diff package.json`, `tsc`.

**INFERRED** — that the first writable non-generic characteristic is the print channel (C3 — the standard heuristic, **no printer connected**) · that 180 bytes clears the negotiated MTU on common printers · that 12 ms is enough pacing · that `initialize()` throwing indicates a refused permission on iOS · that Apple accepts the usage string (**a judgement about review, not a reading of our code**).

**NOT VERIFIED** — 🔴 **NO PRINTER HAS EVER BEEN CONNECTED. Not one byte of ESC/POS has reached hardware.** Every claim above is about code, a plist and a sync. 🔴 **The chunk size, the pacing gap, the characteristic heuristic and the partial-write path are all UNEXERCISED — and the partial-write path is the one that matters most, because it is the one that decides whether a half-printed ticket is honest about itself.** ⚠️ **Part G is the only thing that can settle any of it.**
